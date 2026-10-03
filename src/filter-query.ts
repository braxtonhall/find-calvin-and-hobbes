import { dateToString, lastDayOf, weekdayOf } from "./date-utils";
import { DateExpression, MONTHS, WEEKDAYS, matchesExpression, parseDateExpression, parseYear } from "./date-query";
import { FILTER_SPECS } from "./filter-spec";
import { knows } from "./filter-vocabulary";
import { Comic } from "./types";

/**
 * The `@name:value` syntax: reading one filter out of a query, and deciding whether a row survives it.
 *
 * Most of the vocabulary is about when a strip ran, so most of this file is downstream of
 * `date-query.ts` and reads its values with that parser in `"filter"` mode — see `DateSource` for
 * why a filter value is read differently from a query a reader typed. `@in:` is the exception, and
 * the reason this is a vocabulary rather than a date syntax: where a strip was *printed* is not a
 * date at all. The shared machinery below — the one scanner, the one notion of a usable value, the
 * one predicate — is the whole vocabulary, of which the date filters are most but no longer all.
 *
 * A filter here is one atom and nothing more. How filters combine — side by side, under `@or`,
 * under `@not` — is `boolean-query.ts`: different fields intersect, and repeating a field widens
 * where a strip has only one value for it (`@year:1988 @year:1989` is either year), and for the
 * books (`@in:book1 @in:book3` is either book), and narrows for the tags (`@is:sunday @is:rerun` is
 * the Sundays that ran again).
 */

/**
 * One filter, read. A filter whose value could not be read is not one of these — see `readFilter`.
 *
 * `@day:` is two kinds under one name, a day of the month and a day of the week, so it reads to
 * whichever its value is. `@after:` and `@before:` are held as the bound itself, exclusive: the
 * last day of the span they name, or the first.
 */
export type Filter =
	| { kind: "year"; year: number }
	| { kind: "month"; month: number }
	| { kind: "monthDay"; day: number }
	| { kind: "weekday"; weekday: number }
	| { kind: "in"; collection: string }
	| { kind: "is"; tag: string }
	| { kind: "date"; expression: DateExpression }
	| { kind: "after"; bound: string }
	| { kind: "before"; bound: string };

/**
 * Which showing of a rerun strip a row is: the day it first ran, or a day it ran again. Neither for
 * a strip that only ran once, and neither where the caller cannot say — the reruns are the
 * search's to know, not this module's.
 */
export type Run = "reused" | "rerun";

// Derived from `FILTER_SPECS` rather than written out again, so the parser and the autocomplete
// menu cannot disagree about which names exist.
const FILTERS = new Set(FILTER_SPECS.map((spec) => spec.name));
// A value stops at a parenthesis, so `(@in:book1 @or @in:book3)` closes its group rather than
// asking for a book called `book3)`, and at a quotation mark, so `@year:1988"snow"` leaves the
// phrase where it was written. No value of any filter can contain either.
const FILTER_PATTERN = /@([a-zA-Z]+)(?::([^\s()"“”]+))?/g;

/**
 * A straight quotation mark or either curly one. A phone's keyboard curls them as it sees fit, and
 * not reliably in the right direction — after a parenthesis it can open with `”` — so all three are
 * one mark, and which way one faces says nothing about whether it opens or closes.
 */
const QUOTE_PATTERN = /["“”]/g;

/** One quoted stretch of a query, from its opening mark to just past its closing one. */
export interface QuotedSpan {
	start: number;
	end: number;
	/** The text between the marks. */
	inner: string;
	/** False for a quotation left open, which runs to the end of the text. */
	closed: boolean;
}

/**
 * Every quoted stretch of the text, in order.
 *
 * Marks pair off left to right, and a mark left over at the end closes at the end of the text the
 * way an unclosed parenthesis does, so `"baby sitter` is `"baby sitter"`. Everything inside is
 * text: a filter, an operator or a parenthesis between the marks is none of those things, and each
 * scanner that would otherwise find one there asks `quoted` first.
 */
export function quotedSpans(text: string): QuotedSpan[] {
	const marks = [...text.matchAll(QUOTE_PATTERN)].map((match) => match.index);
	const spans: QuotedSpan[] = [];
	for (let index = 0; index < marks.length; index += 2) {
		const start = marks[index];
		const close = marks[index + 1];
		const end = close === undefined ? text.length : close + 1;
		spans.push({ start, end, inner: text.slice(start + 1, close ?? text.length), closed: close !== undefined });
	}
	return spans;
}

/** Whether the character at `index` stands inside one of the spans, marks included. */
export function quoted(spans: QuotedSpan[], index: number): boolean {
	return spans.some((span) => index >= span.start && index < span.end);
}

/**
 * The span a filter value names, as inclusive ISO bounds. Needs a year — `@before:august-3` has
 * no computable edge — and cannot take a weekday, which picks days out of a span rather than
 * bounding one.
 */
function windowBounds(expression: DateExpression): { from: string; to: string } | null {
	if (expression.candidates.length !== 1) return null;
	const { year, month, day, weekday } = expression.candidates[0];
	if (year === undefined || weekday !== undefined) return null;
	if (month === undefined) return { from: dateToString(year, 1, 1), to: dateToString(year, 12, 31) };
	if (day === undefined) {
		return { from: dateToString(year, month, 1), to: dateToString(year, month, lastDayOf(year, month)) };
	}
	const exact = dateToString(year, month, day);
	return { from: exact, to: exact };
}

/**
 * The filter a name and value make, or null where the value is unusable.
 *
 * Null is a statement about the reader rather than the archive: `@month:13` is a mistake, and
 * `boolean-query.ts` lets nothing through a clause that holds one, negated or not.
 */
export function readFilter(name: string, value: string | undefined): Filter | null {
	if (value === undefined) return null;

	if (name === "year") {
		const year = parseYear(value, "filter");
		return year === null ? null : { kind: "year", year };
	}

	if (name === "month") {
		const named = MONTHS.get(value);
		const numeric = /^\d{1,2}$/.test(value) ? Number(value) : NaN;
		const month = named ?? (numeric >= 1 && numeric <= 12 ? numeric : null);
		return month === null ? null : { kind: "month", month };
	}

	if (name === "day") {
		const weekday = WEEKDAYS.get(value);
		if (weekday !== undefined) return { kind: "weekday", weekday };
		const monthDay = /^\d{1,2}$/.test(value) ? Number(value) : NaN;
		return monthDay >= 1 && monthDay <= 31 ? { kind: "monthDay", day: monthDay } : null;
	}

	if (name === "in") {
		// A book the archive does not have is a typo rather than a place to look — unlike
		// `@year:2001`, which is a real coordinate that honestly holds nothing. The difference is
		// that a year is an open domain and the books are a closed vocabulary of proper nouns, so
		// being off the list is evidence of a mistake. Until the list arrives every id is taken on
		// trust; see `knows`, where that is the whole point rather than a concession.
		return knows("in", value) ? { kind: "in", collection: value } : null;
	}

	if (name === "is") return knows("is", value) ? { kind: "is", tag: value } : null;

	// `@date`, `@before` and `@after` all read a date the same way: year first, and with no
	// requirement that the year be one the archive holds. See `DateSource` for both reasons.
	// `@date:1988/9/3` is September 3rd, never March 9th, and `@after:1984` is a real bound.
	const expression = parseDateExpression(value, "filter");
	if (expression === null) return null;
	if (name === "date") return { kind: "date", expression };

	const bounds = windowBounds(expression);
	if (bounds === null) return null;
	// Exclusive of the whole named span, so `@after:1987 @before:1990` is exactly 1989.
	return name === "after" ? { kind: "after", bound: bounds.to } : { kind: "before", bound: bounds.from };
}

/** One recognised filter, and where it sits in the text it was found in. */
export interface FilterMatch {
	name: string;
	value?: string;
	/** Offsets covering the whole `@name:value` run, so a caller can paint over it or replace it. */
	start: number;
	end: number;
	/** What `readFilter` made of it, so no caller has to read the value a second time. */
	filter: Filter | null;
	/** A recognised name whose value `readFilter` could actually use. */
	valid: boolean;
}

/**
 * Every recognised filter in the text, in order, with its span.
 *
 * This is the scan `boolean-query.ts` performs anyway, exposed because the search box needs the
 * same answer for a different purpose: to tint a filter where it stands, and to say which one is
 * malformed. A second scanner would be a second opinion about what counts as a filter and the two
 * would eventually disagree, so there is only this one and both callers read it.
 *
 * An unrecognised name is not a match. `@` and `:` are not word characters, so `@foo:bar` reaches
 * the tokenizer as `foo bar` and searches for those words — which is what it did before any of
 * this existed. A *recognised* name with an unusable value is a different case: it is consumed
 * and reported as invalid, because `@month:13` is a statement of intent that should return
 * nothing rather than quietly become a search for the word "month".
 *
 * Nothing between quotation marks is a filter — see `quotedSpans`.
 */
export function scanFilters(text: string): FilterMatch[] {
	const matches: FilterMatch[] = [];
	const quotes = quotedSpans(text);

	FILTER_PATTERN.lastIndex = 0;
	for (let match = FILTER_PATTERN.exec(text); match !== null; match = FILTER_PATTERN.exec(text)) {
		if (quoted(quotes, match.index)) continue;
		const name = match[1].toLowerCase();
		if (!FILTERS.has(name)) continue;
		const value = match[2]?.toLowerCase();
		const filter = readFilter(name, value);
		matches.push({
			name,
			value,
			start: match.index,
			end: match.index + match[0].length,
			filter,
			valid: filter !== null,
		});
	}

	return matches;
}

/**
 * Where a strip was printed, which only a strip can answer.
 *
 * A date cannot stand in for one, and returning false rather than true is the honest reading of
 * that: two strips ran on 1985-11-28 and only one of them is in any book, so a day is not enough to
 * decide the question even in principle. A caller with a date in hand and an `@in:` filter to
 * satisfy is asking something it has not brought the evidence for.
 */
function printedIn(subject: string | Comic, collection: string): boolean {
	if (typeof subject === "string") return false;
	return (subject.appearances ?? []).some((appearance) => appearance.collection === collection);
}

/**
 * Whether the row carries the tag.
 *
 * `sunday` and `daily` are about the day, so a bare date answers them. The rest need more, and a
 * subject that cannot answer fails them, for the reason `printedIn` gives:
 *
 * - `altered` is whether any book printed the strip altered, so `@in:book1 @is:altered` is a strip
 *   printed in Book 1 that some book — not necessarily Book 1 — altered.
 * - `empty` is about the transcript field itself: a strip may carry an `alternate` beside an empty
 *   transcript, and it is still empty.
 * - `standalone` is a strip in no arc. A rerun row is a copy of the strip it shows, arcs and all, so
 *   it answers as that strip does; a special is never in an arc, so it always is one.
 * - `reused` and `rerun` are about the row rather than the strip — the same strip is one on the
 *   day it first ran and the other on the day it ran again — so only the caller's `run` answers them.
 */
function hasTag(subject: string | Comic, date: string, tag: string, run: Run | undefined): boolean {
	if (tag === "sunday") return weekdayOf(date) === 0;
	if (tag === "daily") return weekdayOf(date) !== 0;
	if (tag === "reused" || tag === "rerun") return run === tag;
	if (typeof subject === "string") return false;
	if (tag === "altered") return (subject.appearances ?? []).some((appearance) => appearance.altered === true);
	if (tag === "empty") return subject.transcript === "";
	if (tag === "standalone") return (subject.arcs ?? []).length === 0;
	return false;
}

/**
 * Whether one row satisfies one filter.
 *
 * The subject is a strip or, where the filter is about the calendar, just the day it ran on —
 * which the tests and the completion menu still pass. `run` is which showing of a rerun strip the
 * row is, where it is one; see `Run`.
 */
export function passesFilter(subject: string | Comic, filter: Filter, run?: Run): boolean {
	const date = typeof subject === "string" ? subject : subject.date;
	switch (filter.kind) {
		case "year":
			return Number(date.slice(0, 4)) === filter.year;
		case "date":
			return matchesExpression(filter.expression, date);
		case "month":
			return Number(date.slice(5, 7)) === filter.month;
		case "monthDay":
			return Number(date.slice(8, 10)) === filter.day;
		case "weekday":
			return weekdayOf(date) === filter.weekday;
		case "in":
			return printedIn(subject, filter.collection);
		case "is":
			return hasTag(subject, date, filter.tag, run);
		case "after":
			return date > filter.bound;
		case "before":
			return date < filter.bound;
	}
}
