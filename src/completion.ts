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
 *
 * It knows the archive's bounds as well, because a menu that offers a value has to offer one that
 * is there: `RANGE_START`, `RANGE_END` and `SABBATICALS` are static constants, so nothing about
 * reading them costs this module its purity. The comic index — which individual days are missing —
 * is data, and stays out.
 *
 * The books are data too, and they do not stay out — but they arrive through `filter-vocabulary.ts`
 * rather than being imported, so the purity survives: with nothing registered every list is empty,
 * which is a state this file handles anyway and every test here runs in.
 */

import { RANGE_END, RANGE_START } from "./constants";
import { MONTHS, WEEKDAYS, parseDateExpression } from "./date-query";
import { FilterMatch, scanFilters } from "./filter-query";
import { dateToString, isSabbatical, lastDayOf } from "./date-utils";
import { FILTER_SPECS, FilterSpec, ValueTemplate, filterSpec } from "./filter-spec";
import { terms } from "./filter-vocabulary";
import { MONTH_NAMES, WEEKDAY_NAMES, YEARS } from "./vocabulary";

/** One row of the menu. */
export interface Row {
	/** The filter the row is about, without the `@`. */
	name: string;
	/** The value shape the row is about. Absent on a flag. */
	template?: string;
	/**
	 * The shape filled out into a real value — `1985/11`, `august` — which is what the row shows in
	 * place of the shape, and what accepting it writes. Absent only before the colon, where the
	 * shape is still there to be read: `@date:YYYY` says what the filter will want.
	 */
	value?: string;
	hint: string;
	/** What to splice over the token when the row is accepted. Every row can be accepted. */
	insert: string;
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

/**
 * Whether typing more could turn this into one of a vocabulary's values.
 *
 * An empty value always could: a filter that has been named and not yet valued is not a mistake
 * yet, whatever list it draws from. That is what keeps the pending pill on `@in:` before the
 * archive's index has arrived, and it is the same benefit of the doubt `open("")` gives `@year:`.
 */
function beginsATerm(spec: FilterSpec, value: string): boolean {
	if (value === "") return true;
	return terms(spec.name).some((term) => term.value.length > value.length && term.value.startsWith(value));
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
	if (spec.vocabulary === true) return beginsATerm(spec, value);
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
	// A listed value is filled by being on the list. There is no shape to measure it against,
	// because the list is the whole of what the vocabulary is — and an empty value is on no list.
	if (spec.vocabulary === true) return terms(spec.name).some((term) => term.value === value);
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
 * How many values one list holds.
 *
 * A backstop rather than a window: the menu scrolls, and every list the calendar can produce — the
 * eleven years, the days of a month, both vocabularies of `@day:` at once — arrives whole and well
 * under this. It is here for a vocabulary that arrives with the data and turns out to be longer
 * than anything here anticipated.
 */
const VALUE_LIMIT = 40;

/**
 * How many numbers come before the names start, on the two filters that take either.
 *
 * `@day:` and `@month:` are the only place a reader learns that both kinds work, and they learn it
 * by seeing `monday` sitting under `3` — so the names begin partway down the numbers rather than
 * after all of them. It only matters at the bare colon: digits and letters are disjoint, so the
 * first character typed settles which vocabulary is in play and the prefix filter does the rest.
 */
const MIXED_LEAD = 3;

function counting(from: number, to: number): string[] {
	return Array.from({ length: to - from + 1 }, (_, offset) => String(from + offset));
}

function mixed(numbers: string[], names: readonly string[]): string[] {
	return [...numbers.slice(0, MIXED_LEAD), ...names, ...numbers.slice(MIXED_LEAD)];
}

const YEAR_VALUES = YEARS.map(String);
const MONTH_VALUES = mixed(counting(1, 12), MONTH_NAMES);
const DAY_VALUES = mixed(counting(1, 31), WEEKDAY_NAMES);

/**
 * Which filters have a list of values to offer, as against the ones built a field at a time.
 *
 * Every list here is derived from a constant, so it can be an array. The other kind — a vocabulary
 * of proper nouns that arrives with the archive, which this module cannot import without giving up
 * being pure — lives behind `filter-vocabulary.ts` and is reached through `spec.vocabulary`
 * instead. That is the filter this file was once anticipating; it has arrived, and it is `@in`.
 */
const CANDIDATES = new Map<string, readonly string[]>([
	["year", YEAR_VALUES],
	["month", MONTH_VALUES],
	["day", DAY_VALUES],
]);

/**
 * Every spelling a value answers to.
 *
 * A year answers to its last two digits as well as to all four, because `@year:9` is a perfectly
 * good start on 1995 and a menu that showed nothing there would be wrong. Both spellings insert
 * the long one.
 */
function spellings(value: string): string[] {
	return /^\d{4}$/.test(value) ? [value, value.slice(2)] : [value];
}

/** Whether the value typed so far is the start of this one, under any of its spellings. */
function begun(candidate: string, typed: string): boolean {
	return spellings(candidate).some((spelling) => spelling.startsWith(typed));
}

function padded(number: number): string {
	return String(number).padStart(2, "0");
}

/** Whether a month or a day could be written starting with these digits — `9` and `09` alike. */
function begunNumber(typed: string, number: number): boolean {
	return String(number).startsWith(typed) || padded(number).startsWith(typed);
}

/** The shape a value is an example of, which is where a row's hint comes from. */
function shapeOf(spec: FilterSpec, value: string): ValueTemplate | undefined {
	return spec.templates.find((template) => fills(spec, template, value)) ?? spec.templates[0];
}

/** The shape that spells out this many fields, for the hint beside a value of that depth. */
function shapeAt(spec: FilterSpec, depth: number): ValueTemplate | undefined {
	return spec.templates.find((template) => template.label.split("/").length === depth);
}

/** The year-first shapes, which are the only values written a field at a time. */
const DATE_SHAPE = /^YYYY(?:\/MM(?:\/DD)?)?$/;

function dateShaped(spec: FilterSpec): boolean {
	return spec.templates.every((template) => DATE_SHAPE.test(template.label));
}

/** A value split into the fields it has given so far, and how it is spelling them. */
interface Typed {
	fields: string[];
	/** `19880903`, which the parser takes and no template spells out: no separators to write. */
	compact: boolean;
	/** Whichever separator the reader chose, so completing their value does not restyle it. */
	separator: string;
}

function typedFields(value: string): Typed {
	const separator = SEPARATOR.exec(value)?.[0];
	if (separator !== undefined) return { fields: value.split(SEPARATOR), compact: false, separator };
	// Four digits or fewer is a year being typed; more than that, with nothing between them, can
	// only be the compact spelling, whose fields are counted off by width instead.
	if (value.length <= 4) return { fields: [value], compact: false, separator: "/" };
	const fields = [value.slice(0, 4), value.slice(4, 6), value.slice(6, 8)];
	return { fields: fields.filter((field) => field !== ""), compact: true, separator: "" };
}

/** One day the archive holds — or, read to a shallower depth, the year or month it fell in. */
interface Day {
	year: number;
	month: number;
	day: number;
}

/**
 * Every value the archive can offer for one field, given the digits typed so far: the years the
 * strip ran in, the months of one of them, or the days of one of those.
 *
 * A year or a month earns its place by holding at least one strip, which is what keeps 1985 out of
 * the list until November and keeps the sabbaticals out of it altogether. Without that the menu
 * would offer a date from before Calvin existed and then commit it, and the empty page of results
 * would make the menu look like it had lied.
 *
 * Individual missing days are not accounted for: the full comic index is data this module cannot
 * see, while the bounds and the two sabbaticals are static constants it can.
 */
function archiveValues(depth: number, fields: string[]): Day[] {
	const [yearDigits = "", monthDigits = "", dayDigits = ""] = fields;
	const found: Day[] = [];

	for (const year of YEARS) {
		if (!begun(String(year), yearDigits)) continue;
		let answered = false;
		for (let month = 1; month <= 12 && !answered; month++) {
			if (!begunNumber(monthDigits, month)) continue;
			for (let day = 1; day <= lastDayOf(year, month); day++) {
				if (!begunNumber(dayDigits, day)) continue;
				const date = dateToString(year, month, day);
				if (date < RANGE_START || date > RANGE_END || isSabbatical(date)) continue;
				found.push({ year, month, day });
				// One strip is enough to put a year or a month on the list; only the day field
				// wants every one of them.
				if (depth === DATE_FIELDS.length) continue;
				answered = depth === 1;
				break;
			}
		}
	}

	return found;
}

/**
 * Whether the value the reader has written names at least one strip.
 *
 * Read exactly, by the parser, rather than as a prefix — which is the difference between the two
 * questions this module asks about `@date:19`. To the parser that is the year 1919 and names
 * nothing; to the menu it is the start of eleven archive years. This is the first of those, and it
 * is what keeps a row for the value as typed off the menu wherever the archive has real values to
 * offer instead.
 */
function namesArchiveDay(value: string): boolean {
	const expression = parseDateExpression(value, "filter");
	if (expression === null || expression.candidates.length !== 1) return false;
	const { year, month, day } = expression.candidates[0];
	if (year === undefined) return false;
	const exact = [String(year), month === undefined ? "" : padded(month), day === undefined ? "" : padded(day)];
	return archiveValues(1, exact).length > 0;
}

/**
 * The digits to write for one field: the reader's own wherever they already spell the number, so
 * accepting a row never rewrites a character that was right — `@date:1988/09/03` is finished off
 * rather than restyled into `1988/9/3`.
 */
function fieldText(typed: string, value: number, width: number, compact: boolean): string {
	const plain = String(value);
	const wide = plain.padStart(width, "0");
	if (typed === plain || typed === wide) return typed;
	// A two-digit year is a spelling of its own, and one the parser reads: `@date:88` stays 88.
	if (width === 4 && typed === wide.slice(2)) return typed;
	return compact ? wide : plain;
}

/** One of the archive's days written out to the depth of one shape, in the reader's own spelling. */
function writeDate(typed: Typed, day: Day, depth: number): string {
	const values = [day.year, day.month, day.day];
	const written = DATE_FIELDS.slice(0, depth).map((field, index) =>
		fieldText(typed.fields[index] ?? "", values[index], field.width, typed.compact),
	);
	return written.join(typed.compact ? "" : typed.separator);
}

/** One value the menu is offering, and what accepting it should do. */
interface Offer {
	value: string;
	/** The shape it is an example of, whose hint the row carries. */
	shape?: ValueTemplate;
	/** A hint the value brought with it, which outranks the shape's — see `rowsFor`. */
	hint?: string;
	/**
	 * Whether accepting it finishes the filter off.
	 *
	 * Tab types the rest of the value in, and the committing space comes with it only where there
	 * is nothing further Tab could add — either because the value is as deep as the filter goes, or
	 * because it was already there. So `@date:198` fills in `1985` and reopens on the months of it,
	 * while `@month:augus` finishes `august` and gets out of the way.
	 */
	commits: boolean;
}

/**
 * The offers as rows, with the hint dropped wherever it would only repeat the row above it.
 *
 * Twenty rows all reading "1 to 31, a day of the month" is noise; the row worth stating it on is
 * the one where the kind of value changes — the `monday` that arrives under `3`.
 */
function rowsFor(spec: FilterSpec, offers: Offer[]): Row[] {
	const rows: Row[] = [];
	let said = "";
	for (const offer of offers.slice(0, VALUE_LIMIT)) {
		const shared = offer.shape?.hint ?? spec.hint;
		// A hint the value brought with it is never repetition — it is the value's own name, and the
		// dedupe would have two books with similar titles blank each other out, leaving the second
		// reading as though it belonged to the row above. Only a shape's hint is said once per run.
		const hint = offer.hint ?? (shared === said ? "" : shared);
		rows.push({
			name: spec.name,
			template: offer.shape?.label,
			value: offer.value,
			hint,
			insert: `@${spec.name}:${offer.value}${offer.commits ? " " : ""}`,
		});
		said = offer.hint ?? shared;
	}
	return rows;
}

/**
 * A list of values, narrowed to what has been typed.
 *
 * Every value here is a leaf: one field, with nothing deeper reachable past it, so accepting one
 * always finishes the filter off.
 */
function listedOffers(spec: FilterSpec, candidates: readonly string[], value: string): Offer[] {
	return candidates
		.filter((candidate) => begun(candidate, value))
		.map((candidate) => ({ value: candidate, shape: shapeOf(spec, candidate), commits: true }));
}

/**
 * The date filters, which have no list to enumerate: their values are built out of the archive a
 * field at a time.
 *
 * The rows are the archive's own values for the field the reader is in — every year, or every month
 * of the year they have settled, or every day of that month — and a field their digits pin to one
 * value is a field that is settled, so the rows drop to the next one down. That is what makes Tab
 * walk a reader from `19` to a year, to a month, to a day, and what makes the arrows a choice of how
 * narrow to be rather than a choice between three guesses.
 *
 * Above them sits the value as it stands, where that is already a whole one, because accepting what
 * you have typed is the other thing the menu is for; and under the first of them sit the narrower
 * shapes of that same value, so that the syntax for a month and a day is on screen before a reader
 * has to guess that either is allowed.
 */
function builtOffers(spec: FilterSpec, value: string, parses: boolean): Offer[] {
	const typed = typedFields(value);
	const given = typed.fields.length;
	if (given > DATE_FIELDS.length) return [];
	// `1985//11` is November to the parser, which collapses the empty group, but positionally its
	// fields say something else. There is nothing to build on until it is fixed.
	if (typed.fields.some((field, index) => field === "" && index < given - 1)) return [];

	const here = archiveValues(given, typed.fields);
	const depth = here.length === 1 && given < DATE_FIELDS.length ? given + 1 : given;
	const days = depth === given ? here : archiveValues(depth, typed.fields);

	function offerFor(day: Day, at: number): Offer {
		const written = writeDate(typed, day, at);
		return { value: written, shape: shapeAt(spec, at), commits: written === value || at === DATE_FIELDS.length };
	}

	const offers = days.map((day) => offerFor(day, depth));
	// The narrower shapes ride along under the first row, carried down from the very same day so
	// that they agree with it. `@date:` is a list of years, and a reader who has only ever seen one
	// would not know a month or a day could go in there — so the first screenful shows `1985`,
	// `1985/11` and `1985/11/18`, and the rest of the years follow underneath. It is the same reason
	// `@day:` starts its weekday names three rows down rather than after the thirty-first.
	if (days.length > 0) {
		const deeper = DATE_FIELDS.slice(depth).map((_, index) => offerFor(days[0], depth + index + 1));
		offers.splice(1, 0, ...deeper);
	}

	const shape = shapeAt(spec, given);
	const whole = parses && shape !== undefined && fills(spec, shape, value);
	// The reader's own value goes on top where it is whole and real — or where the archive has
	// nothing at all to offer, since `@date:2001` is a legitimate thing to ask and an honestly empty
	// answer rather than a mistake. See `DateSource`.
	if (whole && !offers.some((offer) => offer.value === value) && (offers.length === 0 || namesArchiveDay(value))) {
		offers.unshift({ value, shape, commits: true });
	}

	return offers;
}

/**
 * The rows past the colon.
 *
 * Two derivations, one row kind: a filter with a list of values offers them, and the date filters
 * build theirs out of the archive. Nothing else is offered — a row the reader cannot accept is not
 * a row, so where neither derivation has anything the menu closes rather than showing the shapes
 * back to someone who can do nothing with them.
 */
function valueRows(spec: FilterSpec, value: string, parses: boolean): Row[] {
	if (spec.vocabulary === true) {
		// Every value is a leaf and every one is real, so there is no shape to carry and nothing to
		// fall back on: a value on no list gets no row at all, and the menu closes. That is the right
		// answer for `@in:snowman` and the same news the red pill carries — and it is the opposite of
		// what `@year:2001` gets, because a year outside the archive is still a year.
		return rowsFor(
			spec,
			terms(spec.name)
				.filter((term) => term.value.startsWith(value))
				.map((term) => ({ value: term.value, hint: term.hint, commits: true })),
		);
	}

	const candidates = CANDIDATES.get(spec.name);
	if (candidates !== undefined) {
		const offers = listedOffers(spec, candidates, value);
		// Nothing on the list fits, which is usually a value nothing would fit — but not always,
		// and `@year:2001` is the exception `builtOffers` explains.
		const shape = spec.templates.find((template) => parses && fills(spec, template, value));
		if (offers.length === 0 && shape !== undefined) offers.push({ value, shape, commits: true });
		return rowsFor(spec, offers);
	}

	if (!dateShaped(spec)) return [];
	// In step with the pill: a value the parser will never take gets no menu, whatever the archive
	// might have offered a reader who typed something else.
	const reachable = spec.templates.some(
		(template) => (parses && fills(spec, template, value)) || begins(spec, template, value),
	);
	return reachable ? rowsFor(spec, builtOffers(spec, value, parses)) : [];
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
 * Past the colon the rows are values to accept — see `valueRows` for where they come from, and
 * `shapeRows` for what accepting one writes. A date filter offers one row per shape still in
 * play, so `@date:` offers all three and `@date:1988/` has ruled the bare year out and offers
 * two; `@year:abc` offers nothing at all, which is the same news the red pill carries.
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

	const rows = valueRows(spec, value, parses);
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
	// "expected book" would be true and useless. A vocabulary is never malformed, only unheard of.
	if (spec.vocabulary === true) return `@${spec.name}:${match.value} — not a ${shapes} the archive has`;
	return `@${spec.name}:${match.value} — expected ${shapes}`;
}
