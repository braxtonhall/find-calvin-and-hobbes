/**
 * The `@name:value` vocabulary, as data.
 *
 * Three things need to agree about what a filter is: the parser in `filter-query.ts`, the
 * autocomplete menu, and the validation note under the search box. This table is what they agree
 * on, so adding a filter is an edit here plus a branch in `applyFilter` — never a third copy of
 * the name list.
 *
 * Deliberately free of the parser — it imports only the tags, from `filter-vocabulary.ts`, which is
 * as free. `filter-query.ts` imports it to derive its own name sets, so anything here that reached
 * back into the parser would be a cycle. The predicates that decide
 * whether a half-typed value fits a template therefore live in `completion.ts`, which is allowed
 * to know about both.
 */

import { TAGS } from "./filter-vocabulary";

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
 * Every filter takes a value, and a property a strip either has or lacks is an `@is:` tag rather
 * than a filter of its own. That leaves a bare `@word` free to mean an operator.
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
}

const YEAR_FIRST: readonly ValueTemplate[] = [
	{ label: "YYYY", hint: "the whole year" },
	{ label: "YYYY/MM", hint: "the whole month" },
	{ label: "YYYY/MM/DD", hint: "one day" },
];

/**
 * Ordered as a reader would reach for them — the two that are not about time, then the three
 * calendar fields, then the date forms, then the bounds. Not alphabetically: `@after` is not the
 * thing to meet first.
 *
 * Repeating a filter ORs where a strip can have only one value for it — one year, one month — and
 * for the books, which mostly share no strips; and ANDs for the tags, which a strip carries several
 * of. See `WIDENING` in `boolean-query.ts`.
 */
export const FILTER_SPECS: readonly FilterSpec[] = [
	{
		name: "in",
		hint: "Strips printed in a book",
		vocabulary: true,
		templates: [{ label: "book", hint: "a book of the archive" }],
	},
	{
		name: "is",
		hint: "Strips with a tag",
		vocabulary: true,
		templates: [{ label: "tag", hint: orList(TAGS.map((tag) => tag.value)) }],
	},
	{
		name: "year",
		hint: "Strips from one year",
		templates: [
			{ label: "YYYY", hint: "a four-digit year" },
			{ label: "YY", hint: "any year ending in those two digits" },
		],
	},
	{
		name: "month",
		hint: "Strips from one month, in every year",
		templates: [
			{ label: "MM", hint: "1 to 12" },
			{ label: "august", hint: "a month name or abbreviation" },
		],
	},
	{
		name: "day",
		hint: "A day of the month, or a day of the week",
		templates: [
			{ label: "DD", hint: "1 to 31, a day of the month" },
			{ label: "saturday", hint: "a weekday name or abbreviation" },
		],
	},
	{
		name: "date",
		hint: "Strips on a date",
		templates: YEAR_FIRST,
	},
	{
		name: "before",
		hint: "Strips before a date, excluding it",
		templates: YEAR_FIRST,
	},
	{
		name: "after",
		hint: "Strips after a date, excluding it",
		templates: YEAR_FIRST,
	},
];

const BY_NAME = new Map(FILTER_SPECS.map((spec) => [spec.name, spec]));

export function filterSpec(name: string): FilterSpec | undefined {
	return BY_NAME.get(name);
}
