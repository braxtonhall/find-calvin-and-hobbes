import { dateToString, lastDayOf, weekdayOf } from "./date-utils";
import { DateExpression, MONTHS, WEEKDAYS, matchesExpression, parseDateExpression } from "./date-query";
import { CROSSING_SPECS, CollectionType, FILTER_NAMES, Language, filterSpec } from "./filter-spec";
import { canonical, knows, termFor } from "./filter-vocabulary";
import { ownershipId } from "./library-file";
import { state } from "./state";
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
 * the Sundays that ran again, and `@i:own @i:noted` the printings owned and noted) and the characters (`@featuring:susie @featuring:rosalyn` is the
 * strips with both). The creators widen, as the books do (`@by:a @by:b` is either one's strips).
 */

/**
 * One filter, read. A filter whose value could not be read is not one of these — see `readFilter`.
 *
 * `@day:` is two kinds under one name, a day of the month and a day of the week, so it reads to
 * whichever its value is. `@after:` and `@before:` are held as the bound itself, exclusive: the
 * last day of the span they name, or the first.
 */
export type Filter =
	| { kind: "year"; expression: DateExpression }
	| { kind: "month"; month: number }
	| { kind: "monthDay"; day: number }
	| { kind: "weekday"; weekday: number }
	| { kind: "in"; collection: string }
	| { kind: "is"; tag: string }
	| { kind: "i"; tag: string }
	| { kind: "featuring"; character: string }
	| { kind: "by"; creator: string }
	| { kind: "date"; expression: DateExpression }
	| { kind: "after"; bound: string }
	| { kind: "before"; bound: string }
	| { kind: "during"; arc: string }
	| { kind: "here"; tag: string }
	| { kind: "id"; id: string }
	| { kind: "tag"; tag: string }
	| { kind: "strips"; comparison: Comparison }
	| { kind: "published"; expression: DateExpression };

/** A number compared, as both ends of a range, each one in: `>5` is 6 to infinity. */
export interface Comparison {
	low: number;
	high: number;
}

/**
 * Where in a query a filter stands, which decides what it can mean: which language, which kind of
 * collection where the language is the collection one and something says which, and whether a
 * crossing operator stands between it and the top — a link between a strip and a collection, which
 * `@here:` describes.
 */
export interface QueryContext {
	language: Language;
	type?: CollectionType;
	link: boolean;
}

/** The main search box. */
export const STRIP_QUERY: QueryContext = { language: "strip", link: false };

/** A tab of the Collections page. */
export function collectionQuery(type?: CollectionType): QueryContext {
	return type === undefined ? { language: "collection", link: false } : { language: "collection", type, link: false };
}

/**
 * Which showing of a rerun strip a row is: the day it first ran, or a day it ran again. Neither for
 * a strip that only ran once, and neither where the caller cannot say — the reruns are the
 * search's to know, not this module's.
 */
export type Run = "reused" | "rerun";

/**
 * The bare words that are operators rather than filters: the logical ones, `@only`, and the crossing
 * operators this site has. `@in` is both — bare, it is the operator, and with a colon the filter —
 * and so are `@by`, `@featuring` and `@during`.
 */
export const OPERATOR_WORDS: ReadonlySet<string> = new Set([
	"and",
	"or",
	"not",
	"only",
	...CROSSING_SPECS.map((spec) => spec.name),
]);
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
 * The span a filter value names, as inclusive ISO bounds. Needs a whole year — `@before:august-3`
 * and `@before:88` have no computable edge — and cannot take a weekday, which picks days out of a span rather than
 * bounding one.
 */
function windowBounds(expression: DateExpression): { from: string; to: string } | null {
	if (expression.candidates.length !== 1) return null;
	const { year, ending, month, day, weekday } = expression.candidates[0];
	// Every year ending in 88 has no edge either: a bound is one day, so it needs the whole year.
	if (year === undefined || ending !== undefined || weekday !== undefined) return null;
	if (month === undefined) return { from: dateToString(year, 1, 1), to: dateToString(year, 12, 31) };
	if (day === undefined) {
		return { from: dateToString(year, month, 1), to: dateToString(year, month, lastDayOf(year, month)) };
	}
	const exact = dateToString(year, month, day);
	return { from: exact, to: exact };
}

/** `>5`, `>=5`, `<5`, `<=5`, `5`, `=5` or `5..10`, as the inclusive range it names. */
export function parseComparison(value: string): Comparison | null {
	const range = /^(\d+)\.\.(\d+)$/.exec(value);
	if (range) {
		const [low, high] = [Number(range[1]), Number(range[2])];
		return low <= high ? { low, high } : null;
	}
	const bound = /^(>=|<=|>|<|=)?(\d+)$/.exec(value);
	if (!bound) return null;
	const number = Number(bound[2]);
	switch (bound[1]) {
		case ">":
			return { low: number + 1, high: Infinity };
		case ">=":
			return { low: number, high: Infinity };
		case "<":
			return { low: -Infinity, high: number - 1 };
		case "<=":
			return { low: -Infinity, high: number };
		default:
			return { low: number, high: number };
	}
}

export function compares(comparison: Comparison, value: number): boolean {
	return value >= comparison.low && value <= comparison.high;
}

/**
 * The filter a name and value make, or null where the value is unusable.
 *
 * Null is a statement about the reader rather than the archive: `@month:13` is a mistake, and
 * `boolean-query.ts` lets nothing through a clause that holds one, negated or not.
 *
 * Read in the language of the place it was written: a strip's filters in the main search and inside
 * `@has (…)`, a collection's on the Collections page and inside `@in (…)` and its kin. A filter of
 * the other language is a mistake there, and so is `@here:` with no link to describe — see
 * `judgeFilter` for what the reader is told about each.
 */
export function readFilter(
	name: string,
	value: string | undefined,
	context: QueryContext = STRIP_QUERY,
): Filter | null {
	return judgeFilter(name, value, context).filter;
}

/**
 * The filter, read as `readFilter` reads it, and where it cannot be, why — in the words the tooltip
 * on its pill says it in. Without a reason, the menu's own account of the filter's shapes is given.
 */
export function judgeFilter(
	name: string,
	value: string | undefined,
	context: QueryContext,
): { filter: Filter | null; reason?: string } {
	const { language } = context;
	const written = `@${name}${value === undefined ? "" : `:${value}`}`;
	if (value === undefined) return { filter: null };

	// `@here:` is written in either language, but only inside an operator that crosses between them.
	if (name === "here") {
		if (!context.link) {
			return {
				filter: null,
				reason: `${written} describes a strip in a collection: use it inside @in (…) or @has (…)`,
			};
		}
		return knows("here", value, language) ? { filter: { kind: "here", tag: value } } : { filter: null };
	}

	if (filterSpec(name, language) === undefined) {
		// The other language's filter: said so, with what the reader most likely meant.
		if (language === "collection") return { filter: null, reason: `Did you mean @has ${written}?` };
		return { filter: null, reason: `${written} describes a collection, not a strip. Did you mean @in (${written})?` };
	}

	if (name === "is" || name === "i") {
		if (knows(name, value, language)) return { filter: tagFilter(name, value, language) };
		const mine = name === "is" ? FORMERLY_IS[value] : undefined;
		if (mine !== undefined && knows("i", mine, language)) return { filter: null, reason: `Did you mean @i:${mine}?` };
		const other: Language = language === "strip" ? "collection" : "strip";
		if (termFor(name, value, other) === undefined) return { filter: null };
		return language === "collection"
			? { filter: null, reason: `Did you mean @has ${written}?` }
			: { filter: null, reason: `${written} describes a collection, not a strip. Did you mean @in ${written}?` };
	}

	return { filter: readValue(name, value) };
}

/** The reader's own tags, as `@is:` once took them, and the `@i:` tag each is now. */
const FORMERLY_IS: Partial<Record<string, string>> = { owned: "own", bookmarked: "bookmarked", noted: "noted" };

function tagFilter(name: "is" | "i", value: string, language: Language): Filter {
	if (name === "i") return { kind: "i", tag: value };
	return language === "collection"
		? { kind: "tag", tag: canonical("is", value, language) }
		: { kind: "is", tag: value };
}

/** A filter that its name already says the language of, read from its value alone. */
function readValue(name: string, value: string): Filter | null {
	if (name === "year" || name === "published") {
		// A year is read by the date parser, as `@date:` reads one, so the two agree about what a
		// year is: four digits, or two that are every year ending in them — `@year:88` is 1988 here
		// and would be 1888 as well in an archive that reached it. Only a year, though: `@year:` is
		// not a second spelling of `@date:1988/8`. `@published:` is the same year, asked of a collection.
		const expression = parseDateExpression(value, "filter");
		if (expression === null || expression.candidates.length !== 1) return null;
		const { month, day, weekday } = expression.candidates[0];
		if (month !== undefined || day !== undefined || weekday !== undefined) return null;
		return name === "year" ? { kind: "year", expression } : { kind: "published", expression };
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

	// A closed vocabulary of proper nouns, like the books.
	if (name === "featuring") return knows("featuring", value) ? { kind: "featuring", character: value } : null;
	if (name === "by") return knows("by", value) ? { kind: "by", creator: value } : null;
	if (name === "during") return knows("during", value) ? { kind: "during", arc: value } : null;
	// Any kind's: which kind is the subject's business, and an id of another kind is only false.
	if (name === "id") return knows("id", value, "collection") ? { kind: "id", id: value } : null;

	if (name === "strips") {
		const comparison = parseComparison(value);
		return comparison === null ? null : { kind: "strips", comparison };
	}

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
	/** Why it could not be used, where there is more to say than its shapes. */
	reason?: string;
	/** Where it was written, which is what it was read as. */
	context: QueryContext;
	/** About the reader rather than the archive: an `@i:` tag — see `MINE`. */
	personal?: true;
}

/** A filter as the scanner finds it, before anything has said which language it is in. */
export interface RawFilter {
	name: string;
	value?: string;
	start: number;
	end: number;
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
export function scanFilters(text: string, context: QueryContext = STRIP_QUERY): FilterMatch[] {
	return lexFilters(text).map((raw) => readMatch(raw, context));
}

/** The raw filter, read where it stands. */
export function readMatch(raw: RawFilter, context: QueryContext): FilterMatch {
	const { filter, reason } = judgeFilter(raw.name, raw.value, context);
	const personal = filter?.kind === "i";
	return {
		...raw,
		filter,
		valid: filter !== null,
		context,
		...(reason === undefined ? {} : { reason }),
		...(personal ? { personal: true as const } : {}),
	};
}

/**
 * Every recognised filter in the text, in order, unread. A bare name that is also an operator —
 * `@in`, with no colon after it — is the operator, and left to `boolean-query.ts`; with a colon, even
 * one with nothing after it yet, it is the filter being written.
 */
export function lexFilters(text: string): RawFilter[] {
	const found: RawFilter[] = [];
	const quotes = quotedSpans(text);

	FILTER_PATTERN.lastIndex = 0;
	for (let match = FILTER_PATTERN.exec(text); match !== null; match = FILTER_PATTERN.exec(text)) {
		if (quoted(quotes, match.index)) continue;
		const name = match[1].toLowerCase();
		if (!FILTER_NAMES.has(name)) continue;
		const value = match[2]?.toLowerCase();
		const end = match.index + match[0].length;
		if (value === undefined && text[end] !== ":" && OPERATOR_WORDS.has(name)) continue;
		found.push({ name, ...(value === undefined ? {} : { value }), start: match.index, end });
	}

	return found;
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
 * Whether the strip features the character, which only a strip can answer, as `printedIn` says of
 * a book. A strip that lists no characters features none.
 */
function features(subject: string | Comic, character: string): boolean {
	if (typeof subject === "string") return false;
	return (subject.characters ?? []).includes(character);
}

/** Whether the creator is credited on the strip, which only a strip can answer, as above. */
function madeBy(subject: string | Comic, creator: string): boolean {
	if (typeof subject === "string") return false;
	return (subject.creators ?? []).some((credit) => credit.id === creator);
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
 * Whether the reader has the relationship to the row, from what this browser has saved: a bookmark
 * is a day's, and so is known of a bare date; owning and noting are a printing's, which is the strip
 * and the day it ran.
 */
function isMine(subject: string | Comic, date: string, tag: string): boolean {
	if (tag === "bookmarked") return state.bookmarkedDates.has(date);
	if (typeof subject === "string") return false;
	if (tag === "own") return state.ownedStrips.has(ownershipId(subject, date));
	if (tag === "noted") return state.notedStrips.has(ownershipId(subject, date));
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
		case "i":
			return isMine(subject, date, filter.tag);
		case "featuring":
			return features(subject, filter.character);
		case "by":
			return madeBy(subject, filter.creator);
		case "after":
			return date > filter.bound;
		case "before":
			return date < filter.bound;
		case "during":
			return typeof subject !== "string" && (subject.arcs ?? []).includes(filter.arc);
		// A collection's filters, and `@here:`, which needs a link: neither is a strip's to answer,
		// and `query-eval.ts` answers both where they can be.
		case "here":
		case "id":
		case "tag":
		case "strips":
		case "published":
			return false;
	}
}
