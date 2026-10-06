/**
 * The values of a filter whose vocabulary arrives with the archive.
 *
 * `@year:` and `@month:` know their values from a constant; `@in:` cannot. `@is:` could, but its
 * tags are a list of words to offer and check like the books are, so it lives here too. The books are loaded
 * data, and three separate places need to agree about them: the parser in `filter-query.ts`, which
 * decides whether `@in:snowman` is a mistake; the completion menu, which offers the ids and their
 * titles; and the filter bar, which fills a dropdown with them. None of the three may fetch
 * anything, so the list is injected here once at boot and read from this one place — the same
 * reasoning `filter-spec.ts` gives for being the single table of filter names.
 *
 * Free of the parser, and for the same reason that file is: `filter-query.ts` imports it, so
 * anything here that reached back into the parser would be a cycle. It reads `config.yaml`, for
 * which tags the site has, and nothing else.
 *
 * One rule runs through it:
 *
 * > **An empty vocabulary knows everything.**
 *
 * The books ship inside the script now (see `bundled-data.ts`), so in the app the list is there
 * from the first keystroke. But a list that is not there — nothing registered, as in the tests — is
 * not evidence that a value is wrong: a parser that judged ids against it would paint a reader's
 * own `@in:book3` red while the filter went on working, since membership is read off
 * `comics.json`. So emptiness means "unconstrained", which is what lets the parser be tested with
 * nothing registered at all.
 */

import { PAGE_CONFIG } from "./site-config";

/** One value a data-driven filter takes: what a reader types, and what it names. */
export interface Term {
	/** The spelling the filter takes. Space-free and lowercase, because `scanFilters` requires it. */
	value: string;
	/** What the value is, for the row that offers it — a book id is not a book title. */
	hint: string;
}

/**
 * A thunk rather than an array, so a vocabulary can be registered before its data has arrived and
 * answer with the real values once it has. Nothing has to notice the moment it lands.
 */
export type Vocabulary = () => readonly Term[];

/**
 * `@is:`'s tags, which belong to the language rather than to the archive, so they are known from the
 * start and never empty. Each is independent of the others — a strip can be a Sunday and altered —
 * which is why repeating `@is:` asks for all of them rather than any.
 *
 * The ones about reruns and arcs are left out of a site that has none, and `sunday` and `daily` out
 * of one whose Sundays were not a format of their own, which `config.yaml` says.
 */
export const TAGS: readonly Term[] = [
	...(PAGE_CONFIG.colourSundays
		? [
				{ value: "sunday", hint: "A colour Sunday strip" },
				{ value: "daily", hint: "A black-and-white daily" },
			]
		: []),
	...(PAGE_CONFIG.reruns
		? [
				{ value: "reused", hint: "A strip on the day it first ran, later rerun" },
				{ value: "rerun", hint: "A strip on the date it ran again" },
			]
		: []),
	{ value: "altered", hint: "A strip a book printed with changes" },
	{ value: "empty", hint: "A strip with an empty transcript" },
	...(PAGE_CONFIG.arcs ? [{ value: "standalone", hint: "A strip that belongs to no story arc" }] : []),
];

const REGISTRY = new Map<string, Vocabulary>([["is", () => TAGS]]);

/** Teach a filter its values, for a vocabulary that arrives with the archive. */
export function registerVocabulary(name: string, vocabulary: Vocabulary): void {
	REGISTRY.set(name, vocabulary);
}

/** The values, in the order the menu should offer them. Empty until they arrive. */
export function terms(name: string): readonly Term[] {
	return REGISTRY.get(name)?.() ?? [];
}

/**
 * Whether the value is one this filter takes — and true for every value while the list is empty.
 * See the note above: that permissiveness is the point, not an oversight.
 */
export function knows(name: string, value: string): boolean {
	const known = terms(name);
	return known.length === 0 || known.some((term) => term.value === value);
}
