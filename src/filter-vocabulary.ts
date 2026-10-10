/**
 * The values of a filter whose vocabulary arrives with the archive.
 *
 * `@year:` and `@month:` know their values from a constant; `@in:` cannot. `@is:` and `@i:` could,
 * but their tags are a list of words to offer and check like the books are, so they live here too. The books are loaded
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

import type { Language } from "./filter-spec";
import { PAGE_CONFIG } from "./site-config";

/** One value a data-driven filter takes: what a reader types, and what it names. */
export interface Term {
	/** The spelling the filter takes. Space-free and lowercase, because `scanFilters` requires it. */
	value: string;
	/** What the value is, for the row that offers it — a book id is not a book title. */
	hint: string;
	/**
	 * The American spelling, where the term is spelt two ways: `color` beside `colour`. Either is
	 * the term, and the menu offers whichever the reader is likelier to write. See `spelling.ts`.
	 */
	american?: string;
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
 * of one whose Sundays were not a format of their own, which `config.yaml` says. What the reader
 * owns, bookmarked or noted is not a fact about the strip, so it is not here but in `MINE`.
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

/**
 * A collection's tags: which kind it is, and what can be true of one kind or another. Every kind has
 * every tag, so a query means the same on every tab, and a tag that cannot be true of a kind — an arc
 * is never a writer — is simply false of it. See `query-eval.ts`.
 */
export const COLLECTION_TAGS: readonly Term[] = [
	{ value: "book", hint: "A book" },
	...(PAGE_CONFIG.arcs ? [{ value: "arc", hint: "A story arc" }] : []),
	...(PAGE_CONFIG.creators ? [{ value: "creator", hint: "A creator" }] : []),
	...(PAGE_CONFIG.characters ? [{ value: "character", hint: "A character" }] : []),
	...(PAGE_CONFIG.colourSundays
		? [{ value: "colour", hint: "A book that printed its Sundays in colour", american: "color" }]
		: []),
	...(PAGE_CONFIG.creators
		? [
				{ value: "writer", hint: "A creator who wrote strips" },
				{ value: "artist", hint: "A creator who drew strips" },
			]
		: []),
];

/**
 * `@i:`'s tags: the reader's own relationship to a strip, where `@is:` is a fact about it. Read from
 * what this browser has saved, so a query that holds one finds different things in different
 * browsers, and waits for them to be read. Written as the reader would say it — `@i:own`,
 * `@i:bookmarked` — so the hints are in the first person too. Like `@is:`, repeating it asks for all.
 */
export const MINE: readonly Term[] = [
	{ value: "own", hint: "A printing I own" },
	{ value: "bookmarked", hint: "A strip I bookmarked" },
	{ value: "noted", hint: "A strip I wrote a note on" },
];

/** A collection's `@i:` tags. Only a book can be owned or noted, so they are false of any other kind. */
export const COLLECTION_MINE: readonly Term[] = [
	{ value: "own", hint: "A book I own" },
	{ value: "noted", hint: "A book I wrote a note on" },
];

/**
 * What `@here:` can say about a strip in a collection: how that one collection holds that one strip.
 * Only a book's alterations so far.
 */
export const HERE_TAGS: readonly Term[] = [{ value: "altered", hint: "Printed with changes in this book" }];

const REGISTRY = new Map<string, Vocabulary>([
	["is", () => TAGS],
	["collection:is", () => COLLECTION_TAGS],
	["i", () => MINE],
	["collection:i", () => COLLECTION_MINE],
	["here", () => HERE_TAGS],
]);

/** Where a filter's values are kept: by its name, but for the collection language's own `@is:` and `@i:`. */
function key(name: string, language: Language): string {
	return language === "collection" && (name === "is" || name === "i") ? `collection:${name}` : name;
}

/** Teach a filter its values, for a vocabulary that arrives with the archive. */
export function registerVocabulary(name: string, vocabulary: Vocabulary): void {
	REGISTRY.set(name, vocabulary);
}

/** The values, in the order the menu should offer them. Empty until they arrive. */
export function terms(name: string, language: Language = "strip"): readonly Term[] {
	return REGISTRY.get(key(name, language))?.() ?? [];
}

/** The term a value names, under either of its spellings, or none. */
export function termFor(name: string, value: string, language: Language = "strip"): Term | undefined {
	return terms(name, language).find((term) => term.value === value || term.american === value);
}

/**
 * Whether the value is one this filter takes — and true for every value while the list is empty.
 * See the note above: that permissiveness is the point, not an oversight.
 */
export function knows(name: string, value: string, language: Language = "strip"): boolean {
	return terms(name, language).length === 0 || termFor(name, value, language) !== undefined;
}

/** The value as the filter keeps it: `colour` for `color`, and anything else as it is. */
export function canonical(name: string, value: string, language: Language = "strip"): string {
	return termFor(name, value, language)?.value ?? value;
}
