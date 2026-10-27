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
 * anything here that reached back into the parser would be a cycle. It reads `config.yaml`, and the
 * books bundled into the script, for which tags the site has, and nothing else.
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

import { CHARACTER_ROLES, COLLECTION_INDEX } from "./bundled-data";
import type { CollectionType, Language } from "./filter-spec";
import { PAGE_CONFIG } from "./site-config";
import { spellText } from "./spelling";

/**
 * Whether any book printed a strip with changes: whether there are `@is:altered` and `@as:`. Read
 * off the books in the script, not `comics.json`, so it is known from the first keystroke.
 */
export const ALTERATIONS = COLLECTION_INDEX.collections.some(
	(collection) => Object.keys(collection.alterations ?? {}).length > 0,
);

/** Whether any book is a set of numbered books, each with its own pages: whether there is `@book:`. Read as above. */
export const VOLUMES = COLLECTION_INDEX.collections.some((collection) => collection.volumes !== undefined);

/**
 * What the archive's data turns on that `config.yaml` does not: whether any strip says how it has a
 * character — only seen, only heard, or only mentioned — which is whether `@as:` has `seen`, `heard`
 * and `mentioned`. Read off the script, as above, so a site whose strips only list who is in them
 * has none. An object, so that a test can turn it on before `FILTER_SPECS` reads it, as it does the
 * flags of `PAGE_CONFIG`.
 */
export const ARCHIVE_FEATURES = { characterRoles: CHARACTER_ROLES };

/** One value a data-driven filter takes: what a reader types, and what it names. */
export interface Term {
	/** The spelling the filter takes. Space-free and lowercase, because `scanFilters` requires it. */
	value: string;
	/** What the value is, for the row that offers it — a book id is not a book title. */
	hint: string;
	/** The hint with its `<i>` and `<b>`, where it has any, as a book's `styledName`. See `inline-markup.ts`. */
	styledHint?: string;
	/**
	 * The American spelling, where the term is spelt two ways: `color` beside `colour`. Either is
	 * the term, and the menu offers whichever the reader is likelier to write. See `spelling.ts`.
	 */
	american?: string;
}

/**
 * A term whose hint the site wrote, read in the reader's spelling each time it is shown, so a choice
 * made on the Settings page holds without a reload. Only for hints written here: one drawn from the
 * archive's data is left as the data spells it.
 */
function spelt(term: Term): Term {
	const { hint } = term;
	return {
		...term,
		get hint() {
			return spellText(hint);
		},
	};
}

/**
 * A thunk rather than an array, so a vocabulary can be registered before its data has arrived and
 * answer with the real values once it has. Nothing has to notice the moment it lands.
 */
export type Vocabulary = () => readonly Term[];

/**
 * The tag everything has, in either language: true of every strip and every collection. Its use is
 * inside a crossing, where it leaves only the crossing to ask — whether there is anything on the
 * other side at all — so `@in @is:any` is in a book, `@not @in @is:any` in none, and `@has @is:any` a
 * collection with a strip in it. Last, being the least likely to be meant.
 */
const ANY: Term = { value: "any", hint: "Anything at all" };

/**
 * `@is:`'s tags, which belong to the language rather than to the archive, so they are known from the
 * start and never empty. Each is independent of the others — a strip can be a Sunday and altered —
 * which is why repeating `@is:` asks for all of them rather than any.
 *
 * The ones about reruns, arcs and alterations are left out of a site that has none, and `sunday` and `daily` out
 * of one whose Sundays were not a format of their own, which `config.yaml` says. What the reader
 * owns, bookmarked or noted is not a fact about the strip, so it is not here but in `MINE`.
 */
export const TAGS: readonly Term[] = [
	...(PAGE_CONFIG.colourSundays
		? [spelt({ value: "sunday", hint: "A colour Sunday strip" }), { value: "daily", hint: "A black-and-white daily" }]
		: []),
	...(PAGE_CONFIG.reruns
		? [
				{ value: "reused", hint: "A strip on the day it first ran, later rerun" },
				{ value: "rerun", hint: "A strip on the date it ran again" },
			]
		: []),
	...(ALTERATIONS ? [{ value: "altered", hint: "A strip a book printed with changes" }] : []),
	{ value: "empty", hint: "A strip with an empty transcript" },
	...(PAGE_CONFIG.arcs ? [{ value: "standalone", hint: "A strip that belongs to no story arc" }] : []),
	ANY,
];

/**
 * A collection's tags, kind by kind: each kind has its own, and a tag of another kind is a mistake
 * where it is written, as `@is:colour` is on the Arcs tab. Not which kind it is: every query has its
 * kind already, from its tab or from the operator it stands inside, so a tag saying so could only
 * ever be all or nothing. `any` is the one that is all, and the one every kind has.
 */
export const COLLECTION_TAGS: Readonly<Record<CollectionType, readonly Term[]>> = {
	book: [
		...(PAGE_CONFIG.colourSundays
			? [spelt({ value: "colour", hint: "A book that is printed in colour", american: "color" })]
			: []),
		ANY,
	],
	arc: [ANY],
	creator: [
		...(PAGE_CONFIG.creators
			? [
					{ value: "writer", hint: "A creator who wrote strips" },
					{ value: "artist", hint: "A creator who drew strips" },
				]
			: []),
		ANY,
	],
	character: [ANY],
	subject: [ANY],
};

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

/** A book's `@i:` tags. Only a book can be owned or noted, so no other kind has `@i:` at all. */
export const COLLECTION_MINE: readonly Term[] = [
	{ value: "own", hint: "A book I own" },
	{ value: "noted", hint: "A book I wrote a note on" },
];

/**
 * What `@as:` can say about a strip in a collection: how that one collection holds that one strip.
 * Whether a book altered it, where any book did, and how it printed it, where the Sundays were a
 * format of their own. Only a book prints a strip, so `@as:` is only asked of a book's. A book printing a strip twice, once in colour and once in ink, prints it as both.
 */
export const AS_TAGS: readonly Term[] = [
	...(ALTERATIONS ? [{ value: "altered", hint: "Printed with changes in this book" }] : []),
	...(PAGE_CONFIG.colourSundays
		? [
				spelt({ value: "colour", hint: "Printed in colour in this book", american: "color" }),
				spelt({ value: "greyscale", hint: "Printed in greyscale in this book", american: "grayscale" }),
				{ value: "ink", hint: "Printed as bare ink in this book" },
			]
		: []),
];

/**
 * What `@as:` can say about a character in a strip: how the strip has them. A strip that lists a
 * character has them seen and heard unless it says otherwise, and one that only mentions them —
 * talks about them, or to them — does not have them at all, so `@featuring (…)` leaves its mentions
 * out unless asked for them with `@as:mentioned`. None until `ARCHIVE_FEATURES` says the strips say so.
 */
export function characterAsTags(): readonly Term[] {
	if (!ARCHIVE_FEATURES.characterRoles) return [];
	return [
		{ value: "seen", hint: "Seen in the strip" },
		{ value: "heard", hint: "Heard in the strip" },
		{ value: "mentioned", hint: "Talked about or to, but neither seen nor heard" },
	];
}

/** Every kind's tags together, each once, for a collection query that has no kind. */
function allKinds(lists: readonly (readonly Term[])[]): readonly Term[] {
	const seen = new Set<string>();
	return lists.flat().filter((term) => !seen.has(term.value) && seen.add(term.value));
}

const REGISTRY = new Map<string, Vocabulary>([
	["is", () => TAGS],
	...Object.entries(COLLECTION_TAGS).map(([type, tags]): [string, Vocabulary] => [`is:${type}`, () => tags]),
	["collection:is", () => allKinds(Object.values(COLLECTION_TAGS))],
	["i", () => MINE],
	["i:book", () => COLLECTION_MINE],
	["collection:i", () => COLLECTION_MINE],
	["as:book", () => AS_TAGS],
	["as:character", characterAsTags],
	["as", () => allKinds([AS_TAGS, characterAsTags()])],
]);

/**
 * Where a filter is written, as far as its values care: the language, and in the collection one,
 * which kind where something says which — and for `@as:`, the kind at the other end of its link.
 */
export interface Where {
	language: Language;
	type?: CollectionType;
	linked?: CollectionType;
}

const STRIP: Where = { language: "strip" };

/**
 * Where a filter's values are kept: by its name, but for the collection language's own `@is:` and
 * `@i:`, by its kind too, and every kind's together where nothing says which. `@as:`'s by the kind
 * its link goes to, in either language.
 */
function key(name: string, where: Where): string {
	if (name === "as") return where.linked === undefined ? name : `${name}:${where.linked}`;
	if (where.language !== "collection" || (name !== "is" && name !== "i")) return name;
	return where.type === undefined ? `collection:${name}` : `${name}:${where.type}`;
}

/** Teach a filter its values, for a vocabulary that arrives with the archive. */
export function registerVocabulary(name: string, vocabulary: Vocabulary): void {
	REGISTRY.set(name, vocabulary);
}

/** The values, in the order the menu should offer them. Empty until they arrive. */
export function terms(name: string, where: Where = STRIP): readonly Term[] {
	return REGISTRY.get(key(name, where))?.() ?? [];
}

/** The term a value names, under either of its spellings, or none. */
export function termFor(name: string, value: string, where: Where = STRIP): Term | undefined {
	return terms(name, where).find((term) => term.value === value || term.american === value);
}

/**
 * Whether the value is one this filter takes — and true for every value while the list is empty.
 * See the note above: that permissiveness is the point, not an oversight.
 */
export function knows(name: string, value: string, where: Where = STRIP): boolean {
	return terms(name, where).length === 0 || termFor(name, value, where) !== undefined;
}

/** The value as the filter keeps it: `colour` for `color`, and anything else as it is. */
export function canonical(name: string, value: string, where: Where = STRIP): string {
	return termFor(name, value, where)?.value ?? value;
}
