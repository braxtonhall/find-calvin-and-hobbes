import { negatedFilters, scanQuery } from "./boolean-query";
import { FilterMatch, STRIP_QUERY, quotedSpans } from "./filter-query";
import { terms } from "./filter-vocabulary";
import { MONTH_NAMES, YEARS } from "./vocabulary";
import { PAGE_CONFIG } from "./site-config";

/**
 * The filter bar, as string edits.
 *
 * The query text is the only state the bar has: the checkmarks are read out of the characters in
 * the search box on every paint, and a click edits those characters. There is no filter model to
 * keep in step with the query, which is why everything interesting about the bar fits in a module
 * that never touches the DOM — the same split `completion.ts` draws against `views/query-input.ts`.
 *
 * Two rules run through all of it:
 *
 * - **A click only ever touches the filter it names.** Checking a box inserts one token, unchecking
 *   removes the tokens that say that one thing — each with the `@or` that joined it to the rest of
 *   its field, where there is one — and nothing else in the query moves. That is what
 *   makes the bar teach: the reader can see exactly what their click was worth in syntax, and
 *   predict it well enough to type it next time.
 * - **The bar is token-level, not semantic.** A field reflects tokens of its own name and nothing
 *   else, and no two fields own the same token. `@date:1988/9/3` does not check 1988 in `Year`, and
 *   `@day:saturday` checks nothing anywhere; both are left alone and left unrepresented. Reading
 *   the checkmarks off what the query matches instead would look tidier and is a trap —
 *   `@month:aug` and `@date:1988/8` both keep August 1988, so a semantic bar could not say which
 *   tokens an uncheck meant to remove.
 *
 * The bar is deliberately a subset. `@date:`, `@before:`, `@after:` and the weekday half of
 * `@day:` are not in it and not represented by it: it covers what is worth clicking, and the rest
 * stay in the language for a reader who has learned it — which is what the bar is for.
 *
 * `Book` is the one field whose rows are not knowable from a constant, which is why every field's
 * options are a thunk rather than an array: the books arrive with the collection index, after this
 * module has been evaluated and after the bar has been built. Until they do the list is empty, and
 * an empty list is a disabled button — see `paint` in `views/filter-bar.ts`. It earns its place in a
 * bar that is otherwise a subset because eighteen proper nouns is exactly the case where nobody
 * guesses the syntax: a reader knows the book by its title and has no idea it answers to `book3`.
 */

/** One row of a dropdown: the token a click writes, and how the row reads. */
export interface FilterOption {
	/**
	 * The canonical long spelling — `@year:1990`, `@month:august`, `@day:3`. The readable form is
	 * the teachable one, and teaching is the point.
	 */
	token: string;
	label: string;
}

export interface FilterField {
	name: string;
	/** The button's label, which is the noun the tokens under it teach. */
	label: string;
	/** Shown inside the open menu, only where the button's noun is not the whole scope. */
	heading?: string;
	/** The filter names this field is allowed to touch. Disjoint across fields, by construction. */
	owns: readonly string[];
	/** Asked for rather than held, because one field's values arrive with the archive. */
	options: () => readonly FilterOption[];
	/** 31 rows in a column is a bad list, so `Day` is laid out as a calendar instead. */
	shape: "list" | "grid";
	/**
	 * One row at a time, where checking two could only ever match nothing: `@is:` tags intersect,
	 * and no strip is both a Sunday and a daily. Picking a row replaces the one before it, and
	 * `Clear` is how the field is emptied.
	 */
	single?: true;
	/**
	 * Two rows or more can be joined either way, and the menu offers the choice. A strip is printed in
	 * many books, so side by side could have meant the strips in both — but two books mostly share no
	 * strips, so it means either, as two years do, and both is `@in:book1 @and @in:book3`. See
	 * `joinOf`.
	 */
	joins?: true;
}

/** How a field's rows are joined: side by side or by `@or`, which is any of them, or by `@and`. */
export type Join = "all" | "any";

/**
 * How a query has them joined, which can also be neither — `@in:book1 @and @in:book2 @or @in:book3`
 * is the strips in Book 1 and in either of the others. The bar never writes that; a reader can type
 * it, and the toggle then says so by choosing neither.
 */
export type JoinState = Join | "mixed";

/** What a field writes between two rows to join them each way. */
const GLUE: Record<Join, string> = { any: " ", all: " @and " };

function titled(word: string): string {
	return word[0].toUpperCase() + word.slice(1);
}

function range(from: number, to: number): number[] {
	return Array.from({ length: to - from + 1 }, (_, offset) => from + offset);
}

/**
 * Coarse to fine and then format, which is the order a reader reaches for them — the same
 * reasoning `FILTER_SPECS` gives for the autocomplete menu, and not alphabetical.
 *
 * `Format` is the only path to `@is:sunday` and `@is:daily`, and it is the distinction a reader of
 * this archive actually thinks in: the colour full-page Sundays against the black-and-white dailies.
 * It is a strip format that merely coincides with a weekday, which is why it reads as its own
 * field rather than as a shape of `@day:`. The other tags are not in the bar, and neither is it
 * where `config.yaml` has no `colourSundays`, since the tags are not there either.
 */
// Built once here rather than inside the thunks, which `paint` calls on every keystroke.
const YEAR_OPTIONS = YEARS.map((year) => ({ token: `@year:${year}`, label: String(year) }));
const MONTH_OPTIONS = MONTH_NAMES.map((month) => ({ token: `@month:${month}`, label: titled(month) }));
const DAY_OPTIONS = range(1, 31).map((day) => ({ token: `@day:${day}`, label: String(day) }));
const FORMAT_OPTIONS = [
	{ token: "@is:sunday", label: "Sundays" },
	{ token: "@is:daily", label: "Dailies" },
];

export const FILTER_FIELDS: readonly FilterField[] = [
	{
		name: "year",
		label: "Year",
		owns: ["year"],
		shape: "list",
		options: () => YEAR_OPTIONS,
	},
	{
		name: "month",
		label: "Month",
		owns: ["month"],
		shape: "list",
		options: () => MONTH_OPTIONS,
	},
	{
		name: "day",
		label: "Day",
		// The button says `Day`, the name of the token it teaches; the heading says which half of
		// that token is in here, since the weekday half deliberately is not.
		heading: "Day of the month",
		owns: ["day"],
		shape: "grid",
		options: () => DAY_OPTIONS,
	},
	...(PAGE_CONFIG.colourSundays
		? [
				{
					name: "format",
					label: "Format",
					owns: ["is"],
					shape: "list",
					single: true,
					options: () => FORMAT_OPTIONS,
				} satisfies FilterField,
			]
		: []),
	{
		name: "book",
		label: "Book",
		owns: ["in"],
		shape: "list",
		joins: true,
		// The one field whose label and token cannot be the same string: an id takes no spaces and a
		// title is nothing but spaces, so the row reads as the title and writes as the id. Which is
		// also the whole argument for the field existing — see the note at the top of the file.
		options: () => terms("in").map(({ value, hint }) => ({ token: `@in:${value}`, label: hint })),
	},
];

/**
 * The field a token belongs to, or none.
 *
 * Scanned rather than looked up in a map built at module load, because one field's options are not
 * knowable then. Five fields of at most thirty-one rows, asked once per filter in the query — the
 * cost is nothing, and the alternative is a cache with its own question about when to invalidate.
 */
function fieldFor(token: string): FilterField | undefined {
	return FILTER_FIELDS.find((field) => field.options().some((option) => option.token === token));
}

/**
 * The token this match resolves to, in the bar's own spelling, or null where the bar has no box
 * for it.
 *
 * The name is gated on first, and then the value is whatever `readFilter` made of it — the reading
 * `scanFilters` already carries on every match. That is one definition of what a token means,
 * rather than a second value parser that will eventually disagree with `readFilter` about whether
 * `aug` is a month.
 *
 * Reading it settles spelling for free. `@month:aug` and `@month:august` both resolve to the month
 * they mean, so a hand-typed query lights up the same checkmarks a clicked one does. It also needs
 * no special case for the values the bar has no box for: `@day:saturday` reads as a weekday, which
 * no cell in the 1–31 grid matches; `@year:88` is every year ending in 88, which is not one box in
 * the list however few of them the archive holds; and `@month:13` reads as nothing at all.
 */
function tokenOf(match: FilterMatch): string | null {
	const filter = match.filter;
	if (filter === null) return null;
	// A tag, like a book, has only the one spelling — `@is:`'s and `@i:`'s alike.
	if (filter.kind === "is") return `@is:${filter.tag}`;
	if (filter.kind === "i") return `@i:${filter.tag}`;
	if (filter.kind === "in") return `@in:${filter.collection}`;
	if (filter.kind === "year") {
		const { year, ending } = filter.expression.candidates[0];
		return ending ? null : `@year:${year}`;
	}
	if (filter.kind === "month") return `@month:${MONTH_NAMES[filter.month - 1]}`;
	if (filter.kind === "monthDay") return `@day:${filter.day}`;
	return null;
}

/**
 * The filters the bar can see: every one but those under an `@not`, which assert the opposite of
 * their box — see `negatedFilters` — and those inside a crossing operator, which are about a book or
 * a strip on the other side of it rather than the strip itself: `@in (@has @year:1988)` is not a
 * strip from 1988. Left alone by every edit as well as unticked, exactly as `@day:saturday` is.
 */
function positives(text: string): FilterMatch[] {
	const negated = negatedFilters(text);
	return scanQuery(text, STRIP_QUERY).filters.filter((match) => !negated.has(match.start) && !match.context.link);
}

/** The filters in the query that tick one of this field's boxes, in the order they were written. */
function fieldMatches(text: string, field: FilterField): FilterMatch[] {
	const tokens = new Set(field.options().map((option) => option.token));
	return positives(text).filter((match) => {
		const token = tokenOf(match);
		return token !== null && tokens.has(token);
	});
}

/**
 * Every option in the bar that this query text asserts, as canonical tokens.
 *
 * One set for the whole bar rather than one per field, because no token is reachable from two
 * dropdowns — which is the property that lets the token-level rule run without exceptions.
 */
export function selectedTokens(text: string): Set<string> {
	const selected = new Set<string>();
	for (const match of positives(text)) {
		const token = tokenOf(match);
		if (token !== null && fieldFor(token) !== undefined) selected.add(token);
	}
	return selected;
}

/**
 * What stands between two rows: a bare `@or`, an `@and` with or without words beside it, or words
 * or nothing at all, which leave them side by side. Anything else with an operator or a parenthesis
 * in it is `mixed` rather than worked out, since the bar would only be guessing.
 *
 * Side by side and `@or` are both any, and mean the same together — `@in:book1 @or @in:book2
 * @in:book3` is any of the three. They are told apart only so that a new row is written the way
 * the reader wrote the last one.
 */
type Gap = "side" | "or" | "and" | "mixed";

function gapOf(gap: string): Gap {
	if (/^\s*@or\s*$/i.test(gap)) return "or";
	if (/[()]|@(?:or|not)(?![a-zA-Z:])/i.test(gap)) return "mixed";
	return /@and(?![a-zA-Z:])/i.test(gap) ? "and" : "side";
}

/**
 * How the field's rows are joined in this query, or null where fewer than two of them are ticked
 * and there is nothing to join. One answer where every gap between them gives it, and `mixed`
 * where they disagree.
 */
export function joinOf(text: string, field: FilterField): JoinState | null {
	const matches = fieldMatches(text, field);
	if (matches.length < 2) return null;
	const joins = new Set(
		matches.slice(1).map((match, index) => {
			const gap = gapOf(text.slice(matches[index].end, match.start));
			return gap === "and" ? "all" : gap === "mixed" ? "mixed" : "any";
		}),
	);
	return joins.size === 1 ? [...joins][0] : "mixed";
}

/**
 * The field's rows joined the other way: gathered where the first of them stood, in the order they
 * were written, and joined as asked.
 *
 * Gathered, because `@in:book1 @or snow @in:book3` cannot be made all of them by one `@and`
 * without leaving the `@or` to take `snow` in with the first book. The rows are the field's own, so moving them is still an edit to
 * nothing but what the toggle names.
 */
export function setJoin(text: string, field: FilterField, join: Join): string {
	const matches = fieldMatches(text, field);
	const current = joinOf(text, field);
	if (current === null || current === join) return text;

	const chain = [...new Set(matches.map((match) => tokenOf(match)!))].join(GLUE[join]);
	// Right to left, so the spans still describe the string being cut — and the first is replaced
	// last, which nothing to its right can have moved.
	let result = text;
	for (const match of matches.slice(1).reverse()) result = cut(result, match.start, match.end);
	return `${result.slice(0, matches[0].start)}${chain}${result.slice(matches[0].end)}`;
}

/** What a row added after the field's last one should be joined to it with. See `insertToken`. */
function glueBeside(text: string, field: FilterField): string {
	const matches = fieldMatches(text, field);
	if (matches.length < 2) return " ";
	const [previous, last] = matches.slice(-2);
	const gap = gapOf(text.slice(previous.end, last.start));
	return gap === "or" ? " @or " : gap === "and" ? " @and " : " ";
}

/** The text with its last quotation closed, where it was left open. */
function closeQuote(text: string): string {
	return quotedSpans(text).at(-1)?.closed === false ? `${text}"` : text;
}

/**
 * The token, written in immediately after the last filter of the same field, else appended.
 *
 * So years collect beside years instead of scattering through the sentence, and the words the
 * reader typed keep their order and their single spaces either way. In a field that `joins`, it is
 * joined the way the row it lands beside is joined to the one before it — so in a query that has
 * them mixed, it joins the group it was written into — and side by side, which is either, to a row
 * on its own.
 */
export function insertToken(text: string, token: string): string {
	const field = fieldFor(token);
	if (field === undefined) return text;

	let anchor: number | null = null;
	for (const match of positives(text)) {
		if (field.owns.includes(match.name)) anchor = match.end;
	}

	if (anchor === null) {
		// An open quotation runs to the end of the query, and a token appended inside it would be
		// part of the phrase rather than a filter. Closing it first changes nothing it meant.
		const head = closeQuote(text.replace(/\s+$/, ""));
		return head === "" ? token : `${head} ${token}`;
	}
	const glue = field.joins === true ? glueBeside(text, field) : " ";
	return `${text.slice(0, anchor)}${glue}${token}${text.slice(anchor)}`;
}

/** The bookmark button's one filter: the strips the reader bookmarked. */
export const BOOKMARKED = "@i:bookmarked";

/** Whether the query asks for the bookmarks, as the bar sees it — not under `@not`, nor inside an operator. */
export function asksForBookmarks(text: string): boolean {
	return positives(text).some((match) => tokenOf(match) === BOOKMARKED);
}

/**
 * The bookmark button, pressed: `@i:bookmarked` on the end of the query, or taken out of it by the
 * same rules a dropdown's row is, wherever and however often it was written.
 */
export function toggleBookmarks(text: string): string {
	if (asksForBookmarks(text)) return removeTokens(text, [BOOKMARKED]);
	const head = closeQuote(text.replace(/\s+$/, ""));
	return head === "" ? BOOKMARKED : `${head} ${BOOKMARKED}`;
}

/**
 * The token as the field's only selection: written in beside the one it replaces, and every other
 * row of the field taken out. Picking the row that is already the only one is not an edit.
 */
export function chooseToken(text: string, field: FilterField, token: string): string {
	const inserted = selectedTokens(text).has(token) ? text : insertToken(text, token);
	return removeTokens(
		inserted,
		field
			.options()
			.map((option) => option.token)
			.filter((other) => other !== token),
	);
}

/** Every token that says this one thing, however it was spelled. */
export function removeToken(text: string, token: string): string {
	return removeTokens(text, [token]);
}

/**
 * Everything this field has a box for, and nothing else.
 *
 * A `Clear` that swept the whole `@day:` prefix would take `@day:saturday` with it — a token the
 * bar never claimed to represent and has no checkmark for, so clearing it would be an edit the
 * reader could not have predicted from anything on screen.
 */
export function clearField(text: string, field: FilterField): string {
	return removeTokens(
		text,
		field.options().map((option) => option.token),
	);
}

function removeTokens(text: string, tokens: Iterable<string>): string {
	const wanted = new Set(tokens);
	const doomed = positives(text).filter((match) => {
		const token = tokenOf(match);
		return token !== null && wanted.has(token);
	});

	// Right to left, so the spans still describe the string being cut.
	let result = text;
	for (const match of doomed.reverse()) result = cut(result, match.start, match.end);
	return result;
}

/**
 * The token, and the whitespace it was sitting in — one space back where words survive either
 * side of it, none where they do not.
 *
 * Which is what makes a check followed by an uncheck give back the query it started as, rather
 * than the same words with a gap in them or a space on the end.
 *
 * An `@or` or `@and` that joined the token to its neighbour goes with it: `@in:book1 @or @in:book3`
 * loses a book and is left with a book, not with an `@or` that would now join the book to whatever
 * comes next. Where there is one either side, the `@or` goes, since it binds tighter and the token
 * was in its group — `@in:book1 @and @in:book2 @or @in:book3` without Book 2 is Book 1 and Book 3,
 * which taking the `@and` instead would turn into either. Between two of a kind, the one before.
 */
function cut(text: string, start: number, end: number): string {
	let before = text.slice(0, start).replace(/\s+$/, "");
	let after = text.slice(end).replace(/^\s+/, "");
	const left = /(^|[\s(])@(or|and)$/i.exec(before);
	const right = /^@(or|and)(?![a-zA-Z:])\s*/i.exec(after);
	// Side by side with another of its own name, the token was in a group that binds tighter than an
	// `@and` before it, as a group under `@or` does: `@in:book1 @and @in:book2 @in:book3` without
	// Book 2 is still Book 1 and Book 3.
	const name = /^@[a-zA-Z]+:/.exec(text.slice(start, end))?.[0].toLowerCase();
	const beside = right === null && name !== undefined && after.toLowerCase().startsWith(name);
	const takeLeft =
		left !== null &&
		((right === null && !(beside && left[2].toLowerCase() === "and")) ||
			left[2].toLowerCase() === "or" ||
			right?.[1].toLowerCase() === "and");
	if (takeLeft) before = before.slice(0, left.index + left[1].length).replace(/\s+$/, "");
	else if (right !== null) after = after.slice(right[0].length);
	// Nor inside a parenthesis, so `(@in:book1 @or @in:book3)` loses a book and stays `(@in:book1)`.
	if (before === "" || after === "" || before.endsWith("(") || after.startsWith(")")) return before + after;
	return `${before} ${after}`;
}
