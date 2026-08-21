/**
 * What the search box knows about `@filters`: what could still be typed, and how far along what
 * is already there is.
 *
 * Pure, and deliberately so: the search box is the only untested part of this codebase, so the
 * decisions worth getting right — which rows appear, whether a half-typed value is still on its
 * way somewhere — live here where `node:test` can reach them, and `views/query-input.ts` is left
 * with nothing but DOM.
 *
 * This module is the one place allowed to know about both the vocabulary table and the parser,
 * which is why the "could this value still become that shape" predicates are here rather than
 * beside the templates themselves — see the note in `filter-spec.ts`.
 */

import { FilterMatch, MONTHS, WEEKDAYS, parseDateExpression, scanFilters } from "./date-query";
import { FILTER_SPECS, FilterSpec, ValueTemplate, filterSpec } from "./filter-spec";

/** One row of the menu. */
export interface Row {
	/** The filter the row is about, without the `@`. */
	name: string;
	/** The value shape, shown in the template font. Absent on a flag. */
	template?: string;
	hint: string;
	/**
	 * What to splice over the token when the row is accepted. Absent means the row is there to be
	 * read rather than chosen: there is nothing useful to insert for `YYYY`, and pretending
	 * otherwise would put the literal word in the query.
	 */
	insert?: string;
}

export interface Completion {
	/** The `@…` run under the caret, which an accepted row replaces. */
	start: number;
	end: number;
	rows: Row[];
}

/** `@` plus a name, then optionally a colon and however much of the value exists yet. */
const TOKEN_PATTERN = /^@([a-zA-Z]*)(?::(\S*))?$/;

/** A numeric slot: how wide it can get, and the largest number it will hold. */
interface Field {
	width: number;
	high: number;
}

const YEAR_LONG: Field = { width: 4, high: 9999 };
const YEAR_SHORT: Field = { width: 2, high: 99 };
const MONTH: Field = { width: 2, high: 12 };
const MONTH_DAY: Field = { width: 2, high: 31 };
/** `YYYY/MM/DD`, in order, so a shape is just the first however many of them. */
const DATE_FIELDS = [YEAR_LONG, MONTH, MONTH_DAY];
const SEPARATOR = /[/\-.]/;

/**
 * Could another digit go on the end of this slot and still leave something usable?
 *
 * `199` can: it becomes 1990. A month of `9` cannot, because 90 is not a month either, and that
 * is the difference between a value that is unfinished and a value that is wrong.
 */
function open(digits: string, field: Field): boolean {
	if (digits.length >= field.width) return false;
	if (digits.length === 0) return true;
	// The smallest continuation is a zero on the end. If even that overshoots, nothing fits.
	return /^\d+$/.test(digits) && Number(digits + "0") <= field.high;
}

/** Whether a name slot could still be typed out into one of the names it takes. */
function beginsAName(names: Map<string, number>, value: string): boolean {
	for (const name of names.keys()) {
		if (name.length > value.length && name.startsWith(value)) return true;
	}
	return false;
}

/**
 * Whether the value so far is a strict prefix of a date this shape would accept.
 *
 * Counting fields off by their separators is the easy half. The hard half is that the parser also
 * takes the compact `19880903`, which has no separators to count, so that spelling is judged
 * instead on how many digits the shape has room left for.
 */
function beginsADate(value: string, fields: number): boolean {
	const groups = value.split(SEPARATOR);

	if (groups.length === 1) {
		const width = DATE_FIELDS.slice(0, fields).reduce((total, field) => total + field.width, 0);
		return /^\d*$/.test(value) && value.length < width;
	}

	if (groups.length > fields) return false;
	for (const [index, group] of groups.entries()) {
		if (!/^\d*$/.test(group)) return false;
		if (group.length > DATE_FIELDS[index].width) return false;
		// An empty group anywhere but the end is `1988//09`, which no amount of typing rescues.
		if (group.length === 0 && index < groups.length - 1) return false;
	}

	const last = groups.length - 1;
	// Either the field being typed has room for another digit, or there is a whole field still to
	// come and the separator that starts it.
	return open(groups[last], DATE_FIELDS[last]) || groups.length < fields;
}

/**
 * Whether typing more could turn this value into this shape.
 *
 * Note that this is a strict prefix: a value that already *is* the shape does not begin it. That
 * is what empties the menu when a filter is finished — `@year:1994` has nowhere left to go, while
 * `@year:19` is both a legitimate two-digit year and the start of a four-digit one.
 */
function begins(spec: FilterSpec, template: ValueTemplate, value: string): boolean {
	if (spec.name === "year") return open(value, template.label === "YYYY" ? YEAR_LONG : YEAR_SHORT);
	if (spec.name === "month") return template.label === "MM" ? open(value, MONTH) : beginsAName(MONTHS, value);
	if (spec.name === "day") return template.label === "DD" ? open(value, MONTH_DAY) : beginsAName(WEEKDAYS, value);
	return beginsADate(value, template.label.split("/").length);
}

function inRange(value: string, low: number, high: number): boolean {
	if (!/^\d{1,2}$/.test(value)) return false;
	const number = Number(value);
	return number >= low && number <= high;
}

/**
 * Whether the value is a complete example of this shape.
 *
 * This is the row to highlight and the one Tab finishes the filter off from, so it is the other
 * half of `begins`: `@year:94` has filled `YY` and begun `YYYY`, and both rows have something to
 * say about it.
 *
 * The three year-first shapes ask the real parser rather than a regex of their own, so
 * `@date:88/9/3` and `@date:1988-09-03` are judged by whatever `parseDateExpression` makes of
 * them — including the compact `19880903`, which no template spells out but which fills the same
 * three slots all the same.
 */
function fills(spec: FilterSpec, template: ValueTemplate, value: string): boolean {
	if (value === "") return false;
	// A trailing separator has begun a field that has not been filled. The parser reads `1988/` as
	// the year 1988 and the pill says so, but there is nothing finished here to offer to accept.
	if (SEPARATOR.test(value.slice(-1))) return false;

	if (spec.name === "year") {
		return template.label === "YYYY" ? /^\d{4}$/.test(value) : /^\d{2}$/.test(value);
	}
	if (spec.name === "month") {
		return template.label === "MM" ? inRange(value, 1, 12) : MONTHS.has(value);
	}
	if (spec.name === "day") {
		return template.label === "DD" ? inRange(value, 1, 31) : WEEKDAYS.has(value);
	}

	const expression = parseDateExpression(value, "filter");
	if (expression === null || expression.candidates.length !== 1) return false;
	const { year, month, day, weekday } = expression.candidates[0];
	if (year === undefined || weekday !== undefined) return false;
	if (template.label === "YYYY") return month === undefined;
	if (template.label === "YYYY/MM") return month !== undefined && day === undefined;
	return month !== undefined && day !== undefined;
}

/**
 * The `@…` run the caret sits in, or null.
 *
 * Found by walking left to the nearest `@` without crossing whitespace, which matches what the
 * parser will do with the same text: `FILTER_PATTERN` has no word-boundary requirement, so
 * `bill@year:1990` really is a filter and the menu should say so rather than quietly disagree.
 */
function tokenAt(text: string, caret: number): { start: number; end: number; body: string } | null {
	let start = -1;
	for (let index = caret; index > 0; index--) {
		const character = text[index - 1];
		if (/\s/.test(character)) break;
		if (character === "@") {
			start = index - 1;
			break;
		}
	}
	if (start === -1) return null;

	let end = caret;
	while (end < text.length && !/\s/.test(text[end])) end++;

	return { start, end, body: text.slice(start, end) };
}

function nameRow(spec: FilterSpec): Row {
	return spec.kind === "flag"
		? // A flag is complete the moment it is named, so it brings its own trailing space and the
			// reader carries straight on typing.
			{ name: spec.name, hint: spec.hint, insert: `@${spec.name} ` }
		: { name: spec.name, template: spec.templates[0]?.label, hint: spec.hint, insert: `@${spec.name}:` };
}

/**
 * The menu for a caret position, or null when there should be no menu.
 *
 * Past the colon a shape earns its row by being either filled or still reachable, and drops out
 * when it is neither: `@date:` offers all three, `@date:1988/` has ruled the bare year out and
 * offers two, and `@year:abc` offers nothing at all, which is the same news the red pill carries.
 *
 * The filled shape is highlighted, and it is the one row here that can be accepted — Tab on it
 * finishes the filter off rather than typing anything new. So `@year:94` shows `YY` filled with
 * `YYYY` still open underneath it, which is exactly the choice the reader has at that keystroke.
 */
export function completionsAt(text: string, caret: number): Completion | null {
	const token = tokenAt(text, caret);
	if (token === null) return null;

	const parts = TOKEN_PATTERN.exec(token.body);
	if (parts === null) return null;

	const name = parts[1].toLowerCase();
	const value = parts[2]?.toLowerCase();

	if (value === undefined) {
		const rows = FILTER_SPECS.filter((spec) => spec.name.startsWith(name)).map(nameRow);
		return rows.length === 0 ? null : { start: token.start, end: token.end, rows };
	}

	const spec = filterSpec(name);
	// A colon after a flag, or after a name that is not a filter at all, has no completion to
	// offer. The invalid tint and its tooltip are what explain those.
	if (spec === undefined || spec.kind === "flag") return null;

	// Whether the filter works is the parser's business rather than a fourth opinion here, so no
	// shape may claim to be filled inside a filter that would not run.
	const parses = scanFilters(token.body)[0]?.valid === true;

	const rows: Row[] = [];
	for (const template of spec.templates) {
		const filled = parses && fills(spec, template, value);
		if (!filled && !begins(spec, template, value)) continue;
		rows.push({
			name: spec.name,
			template: template.label,
			hint: template.hint,
			// Accepting a filled shape means finishing the filter off — the caret past the end of
			// it and a space ready for whatever comes next — not putting the shape's own letters
			// into the query.
			insert: filled ? `${token.body} ` : undefined,
		});
	}

	return rows.length === 0 ? null : { start: token.start, end: token.end, rows };
}

/**
 * How much of a filter is settled.
 *
 * `match` parses; `name` is a filter name that is settled while the rest of it is not; `pending`
 * is the part still being typed; `invalid` will match nothing however the reader waits.
 */
export type SpanKind = "match" | "name" | "pending" | "invalid";

export interface FilterSpan {
	start: number;
	end: number;
	kind: SpanKind;
	/** Why nothing will satisfy it. Only ever set on `invalid`. */
	reason?: string;
}

/**
 * Where the filters are in the query, and how far along each one is.
 *
 * The extent is the message. A filter that parses is covered end to end; one still being written
 * keeps the tint on the name it has settled and marks the rest apart from it; one nothing will
 * rescue is covered end to end as an error. So `@year:199` shows `@year` settled and `:199`
 * pending, and the fourth digit closes the two up into a single pill — which is the whole signal
 * that the filter now parses.
 *
 * Two things have to be true before a filter is called a mistake, and `caret` is one of them.
 * `@year:` has given no value yet, which is not the same as having given a bad one, and calling it
 * an error under the caret that just typed the colon is calling it too early. Move the caret away
 * — a space, a return, a click elsewhere — and it becomes the mistake it looks like. A value that
 * could never work, though, is wrong the moment it is typed: nothing about waiting rescues
 * `@month:13`, so it goes red where it stands.
 */
export function filterSpans(text: string, caret: number | null): FilterSpan[] {
	const spans: FilterSpan[] = [];

	for (const match of scanFilters(text)) {
		const spec = filterSpec(match.name);
		if (spec === undefined) continue;

		// `FILTER_PATTERN` needs a non-empty value before it will take the colon, so a trailing one
		// is left out of the match. It belongs to a filter that was going to be given a value all
		// the same. It does not belong to a flag: `@sunday:` searches for exactly what `@sunday`
		// does, and a pill over that colon would claim it was doing something.
		const dangling = spec.kind === "valued" && match.value === undefined && text[match.end] === ":";
		const end = dangling ? match.end + 1 : match.end;
		const nameEnd = match.start + 1 + match.name.length;

		if (match.valid) {
			spans.push({ start: match.start, end, kind: "match" });
			continue;
		}

		const typing = caret !== null && caret >= match.start && caret <= end;
		const onItsWay =
			spec.kind === "valued" && spec.templates.some((template) => begins(spec, template, match.value ?? ""));
		if (typing && onItsWay) {
			spans.push({ start: match.start, end: nameEnd, kind: "name" });
			// Nothing after the name yet, on a filter that is still only a name.
			if (end > nameEnd) spans.push({ start: nameEnd, end, kind: "pending" });
			continue;
		}

		spans.push({ start: match.start, end, kind: "invalid", reason: describeInvalid(match) });
	}

	return spans;
}

/** Why a filter the parser rejected was rejected, in one line, for the tooltip on it. */
export function describeInvalid(match: FilterMatch): string {
	const spec = filterSpec(match.name);
	if (spec === undefined) return `@${match.name} is not a filter`;
	if (spec.kind === "flag") return `@${spec.name} takes no value`;

	const shapes = spec.templates.map((template) => template.label).join(" or ");
	if (match.value === undefined) return `@${spec.name} needs a value — ${shapes}`;
	return `@${spec.name}:${match.value} — expected ${shapes}`;
}
