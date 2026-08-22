/**
 * The `@name:value` vocabulary, as data.
 *
 * Three things need to agree about what a filter is: the parser in `date-query.ts`, the
 * autocomplete menu, and the validation note under the search box. This table is what they agree
 * on, so adding a filter is an edit here plus a branch in `applyFilter` — never a third copy of
 * the name list.
 *
 * Deliberately dependency-free. `date-query.ts` imports it to derive its own name sets, so
 * anything here that reached back into the parser would be a cycle. The predicates that decide
 * whether a half-typed value fits a template therefore live in `completion.ts`, which is allowed
 * to know about both.
 */

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

export interface FilterSpec {
	name: string;
	/** A flag carries no value at all; `@sunday:yes` is a misreading, not a narrower query. */
	kind: "valued" | "flag";
	hint: string;
	/** Empty for a flag. Order is the order the menu shows them in. */
	templates: readonly ValueTemplate[];
}

const YEAR_FIRST: readonly ValueTemplate[] = [
	{ label: "YYYY", hint: "the whole year" },
	{ label: "YYYY/MM", hint: "the whole month" },
	{ label: "YYYY/MM/DD", hint: "one day" },
];

/**
 * Ordered as a reader would reach for them — the three calendar fields, then the date forms, then
 * the bounds, then the two flags. Not alphabetically: `@after` is not the thing to meet first.
 */
export const FILTER_SPECS: readonly FilterSpec[] = [
	{
		name: "year",
		kind: "valued",
		hint: "Strips from one year",
		templates: [
			{ label: "YYYY", hint: "a four-digit year" },
			{ label: "YY", hint: "two digits, so 88 is 1988" },
		],
	},
	{
		name: "month",
		kind: "valued",
		hint: "Strips from one month, in every year",
		templates: [
			{ label: "MM", hint: "1 to 12" },
			{ label: "august", hint: "a month name or abbreviation" },
		],
	},
	{
		name: "day",
		kind: "valued",
		hint: "A day of the month, or a day of the week",
		templates: [
			{ label: "DD", hint: "1 to 31, a day of the month" },
			{ label: "saturday", hint: "a weekday name or abbreviation" },
		],
	},
	{
		name: "date",
		kind: "valued",
		hint: "Strips on a date",
		templates: YEAR_FIRST,
	},
	{
		name: "before",
		kind: "valued",
		hint: "Strips before a date, excluding it",
		templates: YEAR_FIRST,
	},
	{
		name: "after",
		kind: "valued",
		hint: "Strips after a date, excluding it",
		templates: YEAR_FIRST,
	},
	{ name: "sunday", kind: "flag", hint: "Sunday strips only", templates: [] },
	{ name: "daily", kind: "flag", hint: "Weekday strips only", templates: [] },
];

const BY_NAME = new Map(FILTER_SPECS.map((spec) => [spec.name, spec]));

export function filterSpec(name: string): FilterSpec | undefined {
	return BY_NAME.get(name);
}
