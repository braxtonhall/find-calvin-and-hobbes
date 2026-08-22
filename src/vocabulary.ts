import { RANGE_END, RANGE_START } from "./constants";
import { MONTHS, WEEKDAYS } from "./date-query";

/**
 * The values a filter can take, enumerated: the years the archive holds, and the long spelling of
 * every month and weekday.
 *
 * Both the filter bar and the completion menu need these lists — the bar to put a row in a
 * dropdown, the menu to offer a value to accept — and neither should be the one that owns them.
 * Not in `filter-spec.ts`, which is dependency-free on purpose because `filter-query.ts` imports it;
 * this module is downstream of the parsers instead, and derives rather than restates.
 */

const FIRST_YEAR = Number(RANGE_START.slice(0, 4));
const LAST_YEAR = Number(RANGE_END.slice(0, 4));

/** Every year the strip ran in, ascending. */
export const YEARS: readonly number[] = Array.from(
	{ length: LAST_YEAR - FIRST_YEAR + 1 },
	(_, offset) => FIRST_YEAR + offset,
);

/**
 * The longest spelling of each name, taken off the parser's own tables rather than written out a
 * second time: every abbreviation in `MONTHS` and `WEEKDAYS` is a prefix of the name it shortens,
 * so the longest key for a number is that name.
 */
function longest(names: Map<string, number>, count: number): readonly string[] {
	const longest: string[] = Array.from({ length: count }, () => "");
	for (const [name, number] of names) {
		if (name.length > longest[number].length) longest[number] = name;
	}
	return longest;
}

/** January first, so the month is the index plus one. */
export const MONTH_NAMES = longest(MONTHS, 13).slice(1);

/** Sunday first, so the weekday is the index — the same numbering `WEEKDAYS` uses. */
export const WEEKDAY_NAMES = longest(WEEKDAYS, 7);
