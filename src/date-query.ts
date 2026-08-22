import { RANGE_END, RANGE_START } from "./constants";
import { dateToString, lastDayOf } from "./date-utils";
import { FILTER_SPECS } from "./filter-spec";
import { knows } from "./filter-vocabulary";
import { Comic } from "./types";

/**
 * Reading the query for everything that is not a word to look up.
 *
 * Almost all of it is about when a strip ran rather than what it says, and the file is named for
 * that. `@in:` is the exception — where a strip was *printed* is not a date at all — so the shared
 * machinery below (the one scanner, the one notion of a usable value, the one predicate) is the
 * whole `@name:value` vocabulary, of which the date filters are most but no longer all.
 *
 * Two mechanisms live here, and they are deliberately different things. `parseDateExpression`
 * answers "is this whole query a date", which is what a reader who types `august 3 1988` means;
 * `parseDateFilters` reads the `@year:1988` syntax, which restricts an ordinary text search.
 * Neither ever rewrites the query — `search` hands the same string to the text pipeline it
 * always did, so nothing here can change what an existing query returns.
 *
 * Rules worth knowing before reading the code:
 *
 * - **Whole query or nothing.** A single token that is not part of a date makes the expression
 *   null. That one rule is what keeps `the 1812 overture has cannons in the percussion` a text
 *   query, and it is cheaper and more honest than trying to find a date inside a sentence.
 * - **Nothing is left over.** `1988 3` is not "year 1988, ignore the 3". Every token must be
 *   placed, or there is no date.
 * - **A date is written from the year down.** `1988`, `august 1988` and `august 3 1988` are dates;
 *   `august 3` and `9/3` are not. A reader may say more than the year but never less, because a
 *   day with no year is a thing to filter by rather than a date — `@month:august @day:3` is how
 *   they ask for the third of August in every year, and it says so where a bare `august 3` would
 *   have to be guessed at.
 * - **A year a reader typed must be one the archive could have.** The range comes from
 *   `RANGE_START` and `RANGE_END`, so `2001-09-11` and `1812` stay text queries rather than
 *   becoming dates with nothing behind them. A filter value is exempt — see `DateSource`.
 * - **An ambiguous numeric date means both readings.** `9/3/1988` is September 3rd *and*
 *   March 9th; no locale convention is imposed. A reader who wants one writes `1988/9/3`.
 *   Filter values are the exception — see `parseDateFilters`.
 * - **A weekday narrows rather than decorates.** `wednesday 9/3/1988` keeps only the March 9th
 *   reading, because that is the one that was a Wednesday, and a weekday that agrees with
 *   nothing makes the whole expression null.
 * - **No spelling correction, anywhere.** A date is not a recollection of dialogue; `agust` is
 *   not August. Month and weekday names match exactly.
 *
 * One known cost: the splitter treats `-`, `/`, `.` and whitespace alike, so separator identity
 * is gone by the time the tokens are assembled. `1988-1990` and `1988 1990` are the same token
 * stream, and both are null because a second year cannot be placed. That is the right answer
 * today, but a range feature would have to keep the separators.
 */

const MIN_YEAR = Number(RANGE_START.slice(0, 4));
const MAX_YEAR = Number(RANGE_END.slice(0, 4));

export const MONTHS = new Map<string, number>([
	["january", 1],
	["jan", 1],
	["february", 2],
	["feb", 2],
	["march", 3],
	["mar", 3],
	["april", 4],
	["apr", 4],
	["may", 5],
	["june", 6],
	["jun", 6],
	["july", 7],
	["jul", 7],
	["august", 8],
	["aug", 8],
	["september", 9],
	["sept", 9],
	["sep", 9],
	["october", 10],
	["oct", 10],
	["november", 11],
	["nov", 11],
	["december", 12],
	["dec", 12],
]);

export const WEEKDAYS = new Map<string, number>([
	["sunday", 0],
	["sun", 0],
	["monday", 1],
	["mon", 1],
	["tuesday", 2],
	["tues", 2],
	["tue", 2],
	["wednesday", 3],
	["wed", 3],
	["thursday", 4],
	["thurs", 4],
	["thur", 4],
	["thu", 4],
	["friday", 5],
	["fri", 5],
	["saturday", 6],
	["sat", 6],
]);

export type DatePrecision = "exact" | "narrow" | "broad";

/** One reading of what the reader wrote, as the components they actually gave. */
export interface DateCandidate {
	year?: number;
	month?: number;
	day?: number;
	weekday?: number;
}

/**
 * Held as a disjunction rather than as a date range, because an ambiguous numeric date is
 * genuinely two readings: `9/3/1988` is two days with half a year between them, which no range
 * can express without also naming everything in between.
 */
export interface DateExpression {
	candidates: DateCandidate[];
	precision: DatePrecision;
}

/**
 * Who wrote the date, which settles two things at once.
 *
 * A `query` is what a reader typed on its own, so numeric tokens may be read in more than one
 * order, and every year must be one the archive could have — that is what keeps `1812` and
 * `2024-01-01` ordinary text queries rather than dates with nothing behind them.
 *
 * A `filter` value is deliberate syntax. It is read year first, because requiring an unambiguous
 * order costs the reader nothing and spares them a guess; and its years are not held to the
 * archive's span, because a filter is a statement about where to look rather than a claim that
 * something is there. `@after:1984` is a perfectly sensible thing to write, and `@year:2001`
 * honestly matches nothing instead of being rejected as malformed.
 */
export type DateSource = "query" | "filter";

interface Numeric {
	value: number;
	digits: number;
	// An ordinal can only ever be a day: `august 3rd` is the third, never 2003.
	ordinal: boolean;
}

type Token =
	| { kind: "month"; value: number }
	| { kind: "weekday"; value: number }
	| { kind: "number"; numeric: Numeric }
	| { kind: "compact"; candidate: DateCandidate };

type Role = "year" | "month" | "day";

const SEPARATORS = /[\s,./\-]+/;
const ORDINAL_PATTERN = /^(\d{1,2})(?:st|nd|rd|th)$/;
// A leading apostrophe is how a year gets abbreviated in prose: `aug 3 '88`.
const DIGITS_PATTERN = /^'?(\d+)$/;

function weekdayOf(date: string): number {
	return new Date(`${date}T00:00:00Z`).getUTCDay();
}

/**
 * A two-digit year is read as the century that lands inside the archive, and every value in that
 * band exceeds 31 — so `aug 90` is 1990, and nothing in the band could have been meant as a day.
 * A filter may name a year outside the archive, and there the century falls back to the archive's
 * own, since the whole strip ran in the 1900s.
 */
function resolveYear(numeric: Numeric, source: DateSource): number | null {
	if (numeric.ordinal) return null;
	if (numeric.digits === 4) {
		if (source === "filter") return numeric.value;
		return numeric.value >= MIN_YEAR && numeric.value <= MAX_YEAR ? numeric.value : null;
	}
	// Exactly two, not "at most two": a single digit is never a year, and letting one through
	// would read `aug 3` as August 1903 the moment the range stopped saying otherwise.
	if (numeric.digits !== 2) return null;
	for (const century of [1900, 2000]) {
		const year = century + numeric.value;
		if (year >= MIN_YEAR && year <= MAX_YEAR) return year;
	}
	return source === "filter" ? 1900 + numeric.value : null;
}

/** Every date that gets this far names its year, so February 29th is decided rather than guessed. */
function isRealDate(year: number, month: number, day: number): boolean {
	const probe = new Date(Date.UTC(year, month - 1, day));
	return probe.getUTCMonth() === month - 1 && probe.getUTCDate() === day;
}

function compactCandidate(digits: string, source: DateSource): DateCandidate | null {
	const year = resolveYear({ value: Number(digits.slice(0, 4)), digits: 4, ordinal: false }, source);
	if (year === null) return null;
	const month = Number(digits.slice(4, 6));
	if (month < 1 || month > 12) return null;
	if (digits.length === 6) return { year, month };
	const day = Number(digits.slice(6, 8));
	if (!isRealDate(year, month, day)) return null;
	return { year, month, day };
}

function classify(piece: string, source: DateSource): Token | null {
	const month = MONTHS.get(piece);
	if (month !== undefined) return { kind: "month", value: month };

	const weekday = WEEKDAYS.get(piece);
	if (weekday !== undefined) return { kind: "weekday", value: weekday };

	const ordinal = ORDINAL_PATTERN.exec(piece);
	if (ordinal)
		return { kind: "number", numeric: { value: Number(ordinal[1]), digits: ordinal[1].length, ordinal: true } };

	const digits = DIGITS_PATTERN.exec(piece)?.[1];
	if (digits === undefined) return null;
	if (digits.length === 6 || digits.length === 8) {
		const candidate = compactCandidate(digits, source);
		return candidate === null ? null : { kind: "compact", candidate };
	}
	if (digits.length > 4) return null;
	return { kind: "number", numeric: { value: Number(digits), digits: digits.length, ordinal: false } };
}

/** Places each number in the role at the same index, or fails if any of them cannot hold it. */
function assign(numbers: Numeric[], roles: Role[], source: DateSource): DateCandidate | null {
	const candidate: DateCandidate = {};
	for (const [index, numeric] of numbers.entries()) {
		const role = roles[index];
		if (numeric.ordinal && role !== "day") return null;
		if (role === "year") {
			const year = resolveYear(numeric, source);
			if (year === null) return null;
			candidate.year = year;
		} else if (role === "month") {
			if (numeric.digits > 2 || numeric.value < 1 || numeric.value > 12) return null;
			candidate.month = numeric.value;
		} else {
			if (numeric.digits > 2 || numeric.value < 1 || numeric.value > 31) return null;
			candidate.day = numeric.value;
		}
	}
	return candidate;
}

function sameCandidate(one: DateCandidate, other: DateCandidate): boolean {
	return one.year === other.year && one.month === other.month && one.day === other.day;
}

function collect(numbers: Numeric[], orderings: Role[][], source: DateSource): DateCandidate[] {
	const candidates: DateCandidate[] = [];
	for (const roles of orderings) {
		const candidate = assign(numbers, roles, source);
		if (candidate === null) continue;
		if (candidates.some((existing) => sameCandidate(existing, candidate))) continue;
		candidates.push(candidate);
	}
	return candidates;
}

function fromNumbers(numbers: Numeric[], source: DateSource): DateCandidate[] {
	if (source === "filter") {
		const roles: Role[] = ["year", "month", "day"];
		return numbers.length > 3 ? [] : collect(numbers, [roles.slice(0, numbers.length)], source);
	}

	// A bare two-digit number is not a year. Every form the reader might mean it in — `8/3/88`,
	// `aug 3 '88` — has something else beside it, and `88` alone collides with prose.
	if (numbers.length === 1) return numbers[0].digits === 4 ? collect(numbers, [["year"]], source) : [];

	// One of the pair has to be the year, and a year cannot be mistaken for a month, so `1988-08`
	// and `8/1988` are both August 1988 and neither is ambiguous. A pair of small numbers — `9/3` —
	// is a month and a day with no year, which is not a date.
	if (numbers.length === 2) {
		return collect(
			numbers,
			[
				["year", "month"],
				["month", "year"],
			],
			source,
		);
	}

	if (numbers.length === 3) {
		// A leading four-digit year is the form a reader reaches for to disambiguate, so it wins
		// outright rather than being offered alongside the other readings.
		const yearFirst = collect(numbers, [["year", "month", "day"]], source);
		if (yearFirst.length > 0) return yearFirst;
		return collect(
			numbers,
			[
				["month", "day", "year"],
				["day", "month", "year"],
			],
			source,
		);
	}

	return [];
}

function fromMonthName(month: number, numbers: Numeric[], source: DateSource): DateCandidate[] {
	// The one number beside a month name is its year. `august 3` names a day in every year, which
	// `@month:august @day:3` asks for and a date cannot.
	if (numbers.length === 1) {
		const year = resolveYear(numbers[0], source);
		return year === null ? [] : [{ month, year }];
	}

	if (numbers.length === 2) {
		const candidates: DateCandidate[] = [];
		for (const roles of [
			["year", "day"],
			["day", "year"],
		] as Role[][]) {
			const candidate = assign(numbers, roles, source);
			if (candidate === null) continue;
			const complete = { ...candidate, month };
			if (candidates.some((existing) => sameCandidate(existing, complete))) continue;
			candidates.push(complete);
		}
		return candidates;
	}

	return [];
}

/** Every candidate carries a year, so precision is a question of what was said beyond it. */
function precisionOf(candidates: DateCandidate[]): DatePrecision {
	if (candidates.every((candidate) => candidate.day !== undefined && candidate.month !== undefined)) return "exact";
	// A year on its own is the whole of that year. A year with a weekday is one day in seven of
	// it, which is a different kind of answer and does not belong at the same strength.
	const bare = candidates.every(
		(candidate) => candidate.month === undefined && candidate.day === undefined && candidate.weekday === undefined,
	);
	return bare ? "broad" : "narrow";
}

export function parseDateExpression(text: string, source: DateSource = "query"): DateExpression | null {
	const pieces = text.toLowerCase().split(SEPARATORS).filter(Boolean);
	if (pieces.length === 0) return null;

	let weekday: number | undefined;
	let month: number | undefined;
	let compact: DateCandidate | undefined;
	const numbers: Numeric[] = [];
	for (const piece of pieces) {
		const token = classify(piece, source);
		if (token === null) return null;
		// A second weekday, month or compact date is a contradiction rather than a refinement.
		if (token.kind === "weekday") {
			if (weekday !== undefined) return null;
			weekday = token.value;
		} else if (token.kind === "month") {
			if (month !== undefined) return null;
			month = token.value;
		} else if (token.kind === "compact") {
			if (compact !== undefined) return null;
			compact = token.candidate;
		} else {
			numbers.push(token.numeric);
		}
	}

	let candidates: DateCandidate[];
	if (compact !== undefined) {
		// A compact date says everything; anything else beside it would have nowhere to go.
		if (month !== undefined || numbers.length > 0) return null;
		candidates = [compact];
	} else if (month !== undefined) {
		candidates = fromMonthName(month, numbers, source);
	} else {
		candidates = fromNumbers(numbers, source);
	}

	const valid: DateCandidate[] = [];
	for (const candidate of candidates) {
		// Nothing is a date without its year: a month, a day and a weekday are ordinary words on
		// their own, and a month with a day is a filter's business rather than a date.
		if (candidate.year === undefined) continue;
		if (
			candidate.day !== undefined &&
			candidate.month !== undefined &&
			!isRealDate(candidate.year, candidate.month, candidate.day)
		)
			continue;
		if (weekday === undefined) {
			valid.push(candidate);
			continue;
		}
		// Where the whole date is known the weekday is decidable now, and disagreement kills that
		// reading. Where it is not, the weekday rides along and narrows the strips that match.
		if (candidate.month !== undefined && candidate.day !== undefined) {
			if (weekdayOf(dateToString(candidate.year, candidate.month, candidate.day)) !== weekday) continue;
			valid.push({ ...candidate, weekday });
			continue;
		}
		valid.push({ ...candidate, weekday });
	}

	if (valid.length === 0) return null;
	return { candidates: valid, precision: precisionOf(valid) };
}

function matchesCandidate(candidate: DateCandidate, date: string): boolean {
	if (candidate.year !== undefined && candidate.year !== Number(date.slice(0, 4))) return false;
	if (candidate.month !== undefined && candidate.month !== Number(date.slice(5, 7))) return false;
	if (candidate.day !== undefined && candidate.day !== Number(date.slice(8, 10))) return false;
	return !(candidate.weekday !== undefined && candidate.weekday !== weekdayOf(date));
}

export function matchesExpression(expression: DateExpression, date: string): boolean {
	return expression.candidates.some((candidate) => matchesCandidate(candidate, date));
}

/**
 * The `@name:value` syntax. Every set is a field, and an empty one means "unconstrained", so
 * `passesFilters` checks each independently: values of one field union, and fields intersect.
 * `@day:saturday @day:sunday` is the weekend; `@day:1 @day:monday` is the Mondays that fell on
 * the first, because a day of the month and a day of the week are two fields under one name.
 */
export interface DateFilters {
	years: Set<number>;
	months: Set<number>;
	monthDays: Set<number>;
	weekdays: Set<number>;
	/**
	 * The books a strip was printed in — a field like any other, and the one field here that is not
	 * a fact about the day. See `printedIn` for why that costs `passesFilters` its date-only subject.
	 */
	collections: Set<string>;
	windows: DateExpression[];
	/** Strictly after this date, and strictly before the other — see `parseDateFilters`. */
	after: string | null;
	before: string | null;
	/** A recognised filter whose value could not be read. Nothing satisfies it. */
	impossible: boolean;
}

// Derived from `FILTER_SPECS` rather than written out again, so the parser and the autocomplete
// menu cannot disagree about which names exist. `@sunday` is the colour Sunday strips and
// `@daily` the black-and-white dailies — the archive's own vocabulary, and `@daily` has no
// `@day:` spelling because "not Sunday" is not a weekday.
const VALUED_FILTERS = new Set(FILTER_SPECS.filter((spec) => spec.kind === "valued").map((spec) => spec.name));
const FLAG_FILTERS = new Set(FILTER_SPECS.filter((spec) => spec.kind === "flag").map((spec) => spec.name));
const FILTER_PATTERN = /@([a-zA-Z]+)(?::(\S+))?/g;

function emptyFilters(): DateFilters {
	return {
		years: new Set(),
		months: new Set(),
		monthDays: new Set(),
		weekdays: new Set(),
		collections: new Set(),
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

function applyFilter(filters: DateFilters, name: string, value: string | undefined): void {
	if (FLAG_FILTERS.has(name)) {
		// A flag carrying a value is a misunderstanding of the syntax, not a broader query.
		if (value !== undefined) filters.impossible = true;
		else if (name === "sunday") filters.weekdays.add(0);
		else for (const weekday of [1, 2, 3, 4, 5, 6]) filters.weekdays.add(weekday);
		return;
	}

	if (value === undefined) {
		filters.impossible = true;
		return;
	}

	if (name === "year") {
		const digits = /^\d{2}(?:\d{2})?$/.exec(value)?.[0];
		const year =
			digits === undefined
				? null
				: resolveYear({ value: Number(digits), digits: digits.length, ordinal: false }, "filter");
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
 * This is the scan `parseDateFilters` performs anyway, exposed because the search box needs the
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
		if (!VALUED_FILTERS.has(name) && !FLAG_FILTERS.has(name)) continue;
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
export function parseDateFilters(text: string): { filters: DateFilters | null; residual: string; segments: string[] } {
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
function printedIn(subject: string | Comic, wanted: Set<string>): boolean {
	if (typeof subject === "string") return false;
	return (subject.appearances ?? []).some((appearance) => wanted.has(appearance.collection));
}

/**
 * Whether one strip survives the filters.
 *
 * The subject is a strip or, where every filter in play is about the calendar, just the day it ran
 * on — which every caller here in the search pipeline could give, and which the tests and the
 * completion menu still do. `@in:` is the one field that wants more than the date; see `printedIn`.
 */
export function passesFilters(subject: string | Comic, filters: DateFilters): boolean {
	if (filters.impossible) return false;
	const date = typeof subject === "string" ? subject : subject.date;
	if (filters.years.size > 0 && !filters.years.has(Number(date.slice(0, 4)))) return false;
	if (filters.months.size > 0 && !filters.months.has(Number(date.slice(5, 7)))) return false;
	if (filters.monthDays.size > 0 && !filters.monthDays.has(Number(date.slice(8, 10)))) return false;
	if (filters.weekdays.size > 0 && !filters.weekdays.has(weekdayOf(date))) return false;
	if (filters.windows.length > 0 && !filters.windows.some((window) => matchesExpression(window, date))) return false;
	if (filters.after !== null && date <= filters.after) return false;
	if (filters.before !== null && date >= filters.before) return false;
	return !(filters.collections.size > 0 && !printedIn(subject, filters.collections));
}
