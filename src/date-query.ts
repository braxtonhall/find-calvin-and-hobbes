import { RANGE_END, RANGE_START } from "./constants";
import { dateToString, weekdayOf } from "./date-utils";

/**
 * Reading a whole query as a date.
 *
 * `parseDateExpression` answers "is this whole query a date", which is what a reader who types
 * `august 3 1988` means. It never rewrites the query — `search` hands the same string to the text
 * pipeline it always did, so nothing here can change what an existing query returns.
 *
 * The `@name:value` filter syntax is a different mechanism and lives in `filter-query.ts`, which is
 * downstream of this file: a filter reads its value with the same parser, in the `"filter"` mode
 * described under `DateSource`. Nothing here knows that `@` means anything.
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
 *   Filter values are the exception — again, see `DateSource`.
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

/**
 * A year standing on its own, as `@year:` gets it: two digits or four, and nothing else.
 *
 * Exported so `filter-query.ts` can read a year without knowing what a token is. The shape of a
 * year — how many digits it may have, which century two of them mean — is settled in one place,
 * and `resolveYear` is that place for both callers.
 */
export function parseYear(text: string, source: DateSource): number | null {
	const digits = /^\d{2}(?:\d{2})?$/.exec(text)?.[0];
	if (digits === undefined) return null;
	return resolveYear({ value: Number(digits), digits: digits.length, ordinal: false }, source);
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
