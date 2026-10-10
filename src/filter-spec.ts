/**
 * The `@name:value` vocabulary, as data.
 *
 * Three things need to agree about what a filter is: the parser in `filter-query.ts`, the
 * autocomplete menu, and the validation note under the search box. This table is what they agree
 * on, so adding a filter is an edit here plus a branch in `applyFilter` — never a third copy of
 * the name list.
 *
 * Deliberately free of the parser — it imports only the tags, from `filter-vocabulary.ts`, which is
 * as free, and `config.yaml`'s features. `filter-query.ts` imports it to derive its own name sets, so anything here that reached
 * back into the parser would be a cycle. The predicates that decide
 * whether a half-typed value fits a template therefore live in `completion.ts`, which is allowed
 * to know about both.
 */

import { COLLECTION_MINE, COLLECTION_TAGS, MINE, TAGS } from "./filter-vocabulary";
import { PAGE_CONFIG } from "./site-config";

/**
 * The two languages a query can be written in. A strip query finds strips: the main search box, and
 * the inside of `@has (…)`. A collection query finds books, arcs, creators or characters: the
 * Collections page's box, and the inside of `@in (…)`, `@by (…)`, `@featuring (…)` and `@during (…)`.
 * Every kind of collection shares the one collection language, so a filter means the same on every
 * tab; what differs is only whether its data can be true of that kind.
 */
export type Language = "strip" | "collection";

/** The kinds of collection a strip can belong to. */
export type CollectionType = "book" | "arc" | "creator" | "character";

/** `a, b or c`. */
function orList(words: readonly string[]): string {
	return words.length > 1 ? `${words.slice(0, -1).join(", ")} or ${words[words.length - 1]}` : words.join("");
}
/** One shape a filter's value can take, and one row in the menu once the colon is typed. */
export interface ValueTemplate {
	/**
	 * The shape, as a slot to fill: `YYYY/MM`, `august`. A concrete word rather than a placeholder
	 * (`NAME`) wherever the slot takes a name, because the example is the more useful of the two —
	 * and `completion.ts` now takes that advice as far as it goes, offering real values past the
	 * colon and leaving the label to the row that names the filter itself.
	 */
	label: string;
	hint: string;
}

/**
 * Every filter takes a value, and a property a strip either has or lacks is an `@is:` tag — or, where
 * it is the reader's relationship to the strip, an `@i:` tag — rather than a filter of its own. That leaves a bare `@word` free to mean an operator.
 */
export interface FilterSpec {
	name: string;
	hint: string;
	/** Order is the order the menu shows them in. */
	templates: readonly ValueTemplate[];
	/**
	 * The values are a vocabulary that arrives with the archive rather than a shape spelled out
	 * here, so the menu asks `filter-vocabulary.ts` what they are and the "could this still become
	 * that" predicates defer to it. Still no dependency: this is a flag, not a list.
	 */
	vocabulary?: true;
	/** Which language the filter belongs to. A filter written in the other one is a mistake. */
	language: Language | "both";
}

/**
 * The shapes of a count compared, as GitHub writes them: `>5`, `>=5`, `<5`, `<=5`, `5`, or `5..10`
 * for a range with both ends in.
 */
const COMPARISON: readonly ValueTemplate[] = [
	{ label: ">N", hint: "more than N" },
	{ label: "<N", hint: "fewer than N" },
	{ label: "N..M", hint: "from N to M" },
	{ label: "N", hint: "exactly N" },
];

const YEAR_FIRST: readonly ValueTemplate[] = [
	{ label: "YYYY", hint: "the whole year" },
	{ label: "YYYY/MM", hint: "the whole month" },
	{ label: "YYYY/MM/DD", hint: "one day" },
];

/**
 * Ordered as a reader would reach for them — the ones that are not about time, then the three
 * calendar fields, then the date forms, then the bounds. Not alphabetically: `@after` is not the
 * thing to meet first. The collection language's own filters come after the strip language's, since
 * the menu only ever shows one language's at a time.
 *
 * Repeating a filter ORs where a strip can have only one value for it — one year, one month — and
 * for the books, the arcs and the creators, which mostly share no strips; and ANDs for the tags, both
 * `@is:` and `@i:`, and the characters, which a strip carries several of. See `WIDENING` in
 * `boolean-query.ts`.
 *
 * `@featuring:` only where `config.yaml` has characters for it, `@by:` only where it has creators,
 * and `@during:` only where it has arcs.
 */
export const FILTER_SPECS: readonly FilterSpec[] = [
	{
		name: "in",
		hint: "Strips printed in a book",
		vocabulary: true,
		language: "strip",
		templates: [{ label: "book", hint: "a book of the archive" }],
	},
	{
		name: "is",
		hint: "Strips with a tag",
		vocabulary: true,
		language: "strip",
		templates: [{ label: "tag", hint: orList(TAGS.map((tag) => tag.value)) }],
	},
	{
		name: "i",
		hint: "Strips I own, bookmarked or noted",
		vocabulary: true,
		language: "strip",
		templates: [{ label: "own", hint: orList(MINE.map((tag) => tag.value)) }],
	},
	...(PAGE_CONFIG.arcs
		? [
				{
					name: "during",
					hint: "Strips in a story arc",
					vocabulary: true,
					language: "strip",
					templates: [{ label: "arc", hint: "a story arc of the archive" }],
				} satisfies FilterSpec,
			]
		: []),
	...(PAGE_CONFIG.characters
		? [
				{
					name: "featuring",
					hint: "Strips featuring a character",
					vocabulary: true,
					language: "strip",
					templates: [{ label: "character", hint: "a character of the archive" }],
				} satisfies FilterSpec,
			]
		: []),
	...(PAGE_CONFIG.creators
		? [
				{
					name: "by",
					hint: "Strips by a creator",
					vocabulary: true,
					language: "strip",
					templates: [{ label: "creator", hint: "a creator of the archive" }],
				} satisfies FilterSpec,
			]
		: []),
	{
		name: "year",
		hint: "Strips from one year",
		language: "strip",
		templates: [
			{ label: "YYYY", hint: "a four-digit year" },
			{ label: "YY", hint: "any year ending in those two digits" },
		],
	},
	{
		name: "month",
		hint: "Strips from one month, in every year",
		language: "strip",
		templates: [
			{ label: "MM", hint: "1 to 12" },
			{ label: "august", hint: "a month name or abbreviation" },
		],
	},
	{
		name: "day",
		hint: "A day of the month, or a day of the week",
		language: "strip",
		templates: [
			{ label: "DD", hint: "1 to 31, a day of the month" },
			{ label: "saturday", hint: "a weekday name or abbreviation" },
		],
	},
	{
		name: "date",
		hint: "Strips on a date",
		language: "strip",
		templates: YEAR_FIRST,
	},
	{
		name: "before",
		hint: "Strips before a date, excluding it",
		language: "strip",
		templates: YEAR_FIRST,
	},
	{
		name: "after",
		hint: "Strips after a date, excluding it",
		language: "strip",
		templates: YEAR_FIRST,
	},
	{
		name: "is",
		hint: "Collections with a tag",
		vocabulary: true,
		language: "collection",
		templates: [{ label: "tag", hint: orList(COLLECTION_TAGS.map((tag) => tag.value)) }],
	},
	{
		name: "i",
		hint: "Books I own or noted",
		vocabulary: true,
		language: "collection",
		templates: [{ label: "own", hint: orList(COLLECTION_MINE.map((tag) => tag.value)) }],
	},
	{
		name: "id",
		hint: "One collection, by its id",
		vocabulary: true,
		language: "collection",
		templates: [{ label: "id", hint: "a book, arc, creator or character" }],
	},
	{
		name: "strips",
		hint: "Collections by how many strips they hold",
		language: "collection",
		templates: COMPARISON,
	},
	{
		name: "published",
		hint: "Books by the year they came out, arcs by the years they ran",
		language: "collection",
		templates: [
			{ label: "YYYY", hint: "a four-digit year" },
			{ label: "YY", hint: "any year ending in those two digits" },
		],
	},
	{
		name: "here",
		hint: "How this strip appears in this collection",
		vocabulary: true,
		language: "both",
		templates: [{ label: "tag", hint: "altered" }],
	},
];

/** Whether the filter can be written in this language. */
export function speaks(spec: FilterSpec, language: Language): boolean {
	return spec.language === "both" || spec.language === language;
}

/** Every name a filter can have in either language, which is what the scanner looks for. */
export const FILTER_NAMES: ReadonlySet<string> = new Set(FILTER_SPECS.map((spec) => spec.name));

/**
 * The operators that cross between a strip and its collections, each with the language it is written
 * in and the one inside it. `@has` goes down from a collection to its strips; the rest go up from a
 * strip to one kind of collection each. Bare, with no colon: `@in:x` is the filter, and short for
 * `@in (@id:x)`. `@by` only where there are creators, `@featuring` only where there are characters,
 * and `@during` only where there are arcs, as their filters are.
 */
export interface CrossingSpec {
	name: CrossingOperator;
	/** The language it is written in. */
	from: Language;
	/** The language inside it, and for a collection, which kind. */
	to: Language;
	type?: CollectionType;
	hint: string;
}

export type CrossingOperator = "has" | "in" | "by" | "featuring" | "during";

export const CROSSING_SPECS: readonly CrossingSpec[] = [
	{ name: "has", from: "collection", to: "strip", hint: "Has a strip that matches what follows" },
	{ name: "in", from: "strip", to: "collection", type: "book", hint: "In a book that matches what follows" },
	...(PAGE_CONFIG.arcs
		? [
				{
					name: "during",
					from: "strip",
					to: "collection",
					type: "arc",
					hint: "In a story arc that matches what follows",
				} satisfies CrossingSpec,
			]
		: []),
	...(PAGE_CONFIG.characters
		? [
				{
					name: "featuring",
					from: "strip",
					to: "collection",
					type: "character",
					hint: "Featuring a character who matches what follows",
				} satisfies CrossingSpec,
			]
		: []),
	...(PAGE_CONFIG.creators
		? [
				{
					name: "by",
					from: "strip",
					to: "collection",
					type: "creator",
					hint: "By a creator who matches what follows",
				} satisfies CrossingSpec,
			]
		: []),
];

export function crossingSpec(name: string): CrossingSpec | undefined {
	return CROSSING_SPECS.find((spec) => spec.name === name);
}

/**
 * The filter of that name in that language. `@is:` is two filters under one name, a strip's tags and
 * a collection's, and so is `@i:`; every other name is one filter, so a language that does not speak it still finds
 * it here when `strict` is off, for the sake of saying why it is the wrong one.
 */
export function filterSpec(name: string, language: Language = "strip", strict = true): FilterSpec | undefined {
	return (
		FILTER_SPECS.find((spec) => spec.name === name && speaks(spec, language)) ??
		(strict ? undefined : FILTER_SPECS.find((spec) => spec.name === name))
	);
}
