import { dateToString, lastDayOf, weekdayOf } from "./date-utils";
import { DateExpression, MONTHS, WEEKDAYS, matchesExpression, parseDateExpression, parseYear } from "./date-query";
import { FILTER_SPECS } from "./filter-spec";
import { knows } from "./filter-vocabulary";
import { Comic } from "./types";

/**
 * The `@name:value` syntax: reading it out of a query, and deciding what survives it.
 *
 * Most of the vocabulary is about when a strip ran, so most of this file is downstream of
 * `date-query.ts` and reads its values with that parser in `"filter"` mode — see `DateSource` for
 * why a filter value is read differently from a query a reader typed. `@in:` is the exception, and
 * the reason this is a vocabulary rather than a date syntax: where a strip was *printed* is not a
 * date at all. The shared machinery below — the one scanner, the one notion of a usable value, the
 * one predicate — is the whole vocabulary, of which the date filters are most but no longer all.
 *
 * Nothing here rewrites the query. `search` hands the same string to the text pipeline it always
 * did, minus the spans the filters occupied, so nothing here can change what a filterless query
 * returns.
 */

/**
 * Every set is a field, and an empty one means "unconstrained", so `passesFilters` checks each
 * independently, and fields intersect.
 *
 * Within a field, what repeating it means depends on how many values a strip can have. A strip ran
 * in one year, on one day, so the values of `years`, `months`, `monthDays`, `weekdays` and
 * `windows` union — intersecting them could only ever be empty. A strip can be printed in many
 * books and carry many tags, so the values of `collections` and `tags` intersect.
 * `@day:saturday @day:sunday` is the weekend; `@day:1 @day:monday` is the Mondays that fell on the
 * first, because a day of the month and a day of the week are two fields under one name; and
 * `@in:book1 @in:book3` is the strips printed in both.
 */
export interface QueryFilters {
	years: Set<number>;
	months: Set<number>;
	monthDays: Set<number>;
	weekdays: Set<number>;
	/**
	 * The books a strip was printed in, every one of them. Not a fact about the day — see `printedIn`
	 * for why that costs `passesFilters` its date-only subject.
	 */
	collections: Set<string>;
	/** Every `@is:` tag the strip must carry. See `hasTag`. */
	tags: Set<string>;
	windows: DateExpression[];
	/** Strictly after this date, and strictly before the other — see `parseQueryFilters`. */
	after: string | null;
	before: string | null;
	/** A recognised filter whose value could not be read. Nothing satisfies it. */
	impossible: boolean;
}

/**
 * Which showing of a rerun strip a row is: the day it first ran, or a day it ran again. Neither for
 * a strip that only ran once, and neither where the caller cannot say — the reruns are the
 * search's to know, not this module's.
 */
export type Run = "reused" | "rerun";

// Derived from `FILTER_SPECS` rather than written out again, so the parser and the autocomplete
// menu cannot disagree about which names exist.
const FILTERS = new Set(FILTER_SPECS.map((spec) => spec.name));
const FILTER_PATTERN = /@([a-zA-Z]+)(?::(\S+))?/g;

function emptyFilters(): QueryFilters {
	return {
		years: new Set(),
		months: new Set(),
		monthDays: new Set(),
		weekdays: new Set(),
		collections: new Set(),
		tags: new Set(),
		windows: [],
		after: null,
		before: null,
		impossible: false,
	};
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

function applyFilter(filters: QueryFilters, name: string, value: string | undefined): void {
	if (value === undefined) {
		filters.impossible = true;
		return;
	}

	if (name === "year") {
		const year = parseYear(value, "filter");
		if (year === null) filters.impossible = true;
		else filters.years.add(year);
		return;
	}

	if (name === "month") {
		const named = MONTHS.get(value);
		const numeric = /^\d{1,2}$/.test(value) ? Number(value) : NaN;
		const month = named ?? (numeric >= 1 && numeric <= 12 ? numeric : null);
		if (month === null || month === undefined) filters.impossible = true;
		else filters.months.add(month);
		return;
	}

	if (name === "day") {
		const weekday = WEEKDAYS.get(value);
		if (weekday !== undefined) {
			filters.weekdays.add(weekday);
			return;
		}
		const monthDay = /^\d{1,2}$/.test(value) ? Number(value) : NaN;
		if (monthDay >= 1 && monthDay <= 31) filters.monthDays.add(monthDay);
		else filters.impossible = true;
		return;
	}

	if (name === "in") {
		// A book the archive does not have is a typo rather than a place to look — unlike
		// `@year:2001`, which is a real coordinate that honestly holds nothing. The difference is
		// that a year is an open domain and the books are a closed vocabulary of proper nouns, so
		// being off the list is evidence of a mistake. Until the list arrives every id is taken on
		// trust; see `knows`, where that is the whole point rather than a concession.
		if (knows("in", value)) filters.collections.add(value);
		else filters.impossible = true;
		return;
	}

	if (name === "is") {
		if (knows("is", value)) filters.tags.add(value);
		else filters.impossible = true;
		return;
	}

	// `@date`, `@before` and `@after` all read a date the same way: year first, and with no
	// requirement that the year be one the archive holds. See `DateSource` for both reasons.
	// `@date:1988/9/3` is September 3rd, never March 9th, and `@after:1984` is a real bound.
	const expression = parseDateExpression(value, "filter");
	if (expression === null) {
		filters.impossible = true;
		return;
	}

	if (name === "date") {
		filters.windows.push(expression);
		return;
	}

	const bounds = windowBounds(expression);
	if (bounds === null) {
		filters.impossible = true;
		return;
	}
	// Exclusive of the whole named span, so `@after:1987 @before:1990` is exactly 1989 — two
	// different fields, and fields intersect.
	//
	// Repeated bounds are one field, so they union, like every other repeated value:
	// `@before:1990 @before:1993` is "before 1990 or before 1993", which is before 1993. That
	// keeps the widest bound rather than the tightest, and it keeps the meaning independent of the
	// order they were typed in — the alternative, letting the last one win, would quietly discard
	// something the reader wrote and make the same two filters mean two different things.
	if (name === "after") filters.after = filters.after === null ? bounds.to : minOf(filters.after, bounds.to);
	else filters.before = filters.before === null ? bounds.from : maxOf(filters.before, bounds.from);
}

function maxOf(one: string, other: string): string {
	return one >= other ? one : other;
}

function minOf(one: string, other: string): string {
	return one <= other ? one : other;
}

/** One recognised filter, and where it sits in the text it was found in. */
export interface FilterMatch {
	name: string;
	value?: string;
	/** Offsets covering the whole `@name:value` run, so a caller can paint over it or replace it. */
	start: number;
	end: number;
	/** A recognised name whose value `applyFilter` could actually use. */
	valid: boolean;
}

/**
 * Every recognised filter in the text, in order, with its span.
 *
 * This is the scan `parseQueryFilters` performs anyway, exposed because the search box needs the
 * same answer for a different purpose: to tint a filter where it stands, and to say which one is
 * malformed. A second scanner would be a second opinion about what counts as a filter and the two
 * would eventually disagree, so there is only this one and both callers read it.
 *
 * An unrecognised name is not a match. `@` and `:` are not word characters, so `@foo:bar` reaches
 * the tokenizer as `foo bar` and searches for those words — which is what it did before any of
 * this existed. A *recognised* name with an unusable value is a different case: it is consumed
 * and reported as invalid, because `@month:13` is a statement of intent that should return
 * nothing rather than quietly become a search for the word "month".
 */
export function scanFilters(text: string): FilterMatch[] {
	const matches: FilterMatch[] = [];

	FILTER_PATTERN.lastIndex = 0;
	for (let match = FILTER_PATTERN.exec(text); match !== null; match = FILTER_PATTERN.exec(text)) {
		const name = match[1].toLowerCase();
		if (!FILTERS.has(name)) continue;
		const value = match[2]?.toLowerCase();
		// Validity is whatever `applyFilter` makes of the value, read back off a throwaway set
		// rather than judged a second time here. There is one definition of a usable value.
		const probe = emptyFilters();
		applyFilter(probe, name, value);
		matches.push({
			name,
			value,
			start: match.index,
			end: match.index + match[0].length,
			valid: !probe.impossible,
		});
	}

	return matches;
}

/**
 * Pulls every recognised filter out of the query.
 *
 * `segments` is the text between the filters, and it matters beyond bookkeeping: a filter lifted
 * out of the middle of a query must not join the words either side of it, or `clean @year:1988
 * your room` would earn the contiguous-phrase bonus for a phrase nobody typed. `search` turns
 * those boundaries into breaks in the run bonus.
 */
export function parseQueryFilters(text: string): {
	filters: QueryFilters | null;
	residual: string;
	segments: string[];
} {
	const matches = scanFilters(text);
	if (matches.length === 0) return { filters: null, residual: text, segments: [text] };

	const filters = emptyFilters();
	const pieces: string[] = [];
	let cursor = 0;

	for (const match of matches) {
		applyFilter(filters, match.name, match.value);
		pieces.push(text.slice(cursor, match.start));
		cursor = match.end;
	}

	pieces.push(text.slice(cursor));
	const segments = pieces.map((piece) => piece.trim()).filter(Boolean);
	return { filters, residual: segments.join(" "), segments };
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
	return false;
}

/**
 * Whether one row survives the filters.
 *
 * The subject is a strip or, where every filter in play is about the calendar, just the day it ran
 * on — which the tests and the completion menu still pass. `run` is which showing of a rerun strip
 * the row is, where it is one; see `Run`.
 */
export function passesFilters(subject: string | Comic, filters: QueryFilters, run?: Run): boolean {
	if (filters.impossible) return false;
	const date = typeof subject === "string" ? subject : subject.date;
	if (filters.years.size > 0 && !filters.years.has(Number(date.slice(0, 4)))) return false;
	if (filters.months.size > 0 && !filters.months.has(Number(date.slice(5, 7)))) return false;
	if (filters.monthDays.size > 0 && !filters.monthDays.has(Number(date.slice(8, 10)))) return false;
	if (filters.weekdays.size > 0 && !filters.weekdays.has(weekdayOf(date))) return false;
	if (filters.windows.length > 0 && !filters.windows.some((window) => matchesExpression(window, date))) return false;
	if (filters.after !== null && date <= filters.after) return false;
	if (filters.before !== null && date >= filters.before) return false;
	for (const collection of filters.collections) if (!printedIn(subject, collection)) return false;
	for (const tag of filters.tags) if (!hasTag(subject, date, tag, run)) return false;
	return true;
}
