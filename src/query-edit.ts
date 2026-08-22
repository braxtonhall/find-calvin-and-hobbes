import { FilterMatch, parseDateFilters, scanFilters } from "./date-query";
import { terms } from "./filter-vocabulary";
import { MONTH_NAMES, YEARS } from "./vocabulary";

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
 *   removes the tokens that say that one thing, and nothing else in the query moves. That is what
 *   makes the bar teach: the reader can see exactly what their click was worth in syntax, and
 *   predict it well enough to type it next time.
 * - **The bar is token-level, not semantic.** A field reflects tokens of its own name and nothing
 *   else, and no two fields own the same token. `@date:1988/9/3` does not check 1988 in `Year`, and
 *   `@day:saturday` checks nothing anywhere; both are left alone and left unrepresented. Reading
 *   the checkmarks off the parsed `DateFilters` instead would look tidier and is a trap — `@sunday`,
 *   `@daily` and `@day:saturday` all write into the same `weekdays` set, so a semantic bar would
 *   have to guess which token an uncheck meant to remove.
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
}

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
 * `Format` is the only path to `@sunday` and `@daily`, and it is the distinction a reader of this
 * archive actually thinks in: the colour full-page Sundays against the black-and-white dailies.
 * It is a strip format that merely coincides with a weekday, which is why it reads as its own
 * field rather than as a shape of `@day:`.
 */
// Built once here rather than inside the thunks, which `paint` calls on every keystroke.
const YEAR_OPTIONS = YEARS.map((year) => ({ token: `@year:${year}`, label: String(year) }));
const MONTH_OPTIONS = MONTH_NAMES.map((month) => ({ token: `@month:${month}`, label: titled(month) }));
const DAY_OPTIONS = range(1, 31).map((day) => ({ token: `@day:${day}`, label: String(day) }));
const FORMAT_OPTIONS = [
	{ token: "@sunday", label: "Sundays" },
	{ token: "@daily", label: "Dailies" },
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
	{
		name: "format",
		label: "Format",
		owns: ["sunday", "daily"],
		shape: "list",
		options: () => FORMAT_OPTIONS,
	},
	{
		name: "book",
		label: "Book",
		owns: ["in"],
		shape: "list",
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

function single<Value>(values: Set<Value>, format: (value: Value) => string): string | null {
	if (values.size !== 1) return null;
	return format([...values][0]);
}

/**
 * The token this match resolves to, in the bar's own spelling, or null where the bar has no box
 * for it.
 *
 * The name is gated on first, and then the value is learned by probing it — running the token by
 * itself through the parser and reading which field it populated. That is the trick `scanFilters`
 * already uses to decide validity, and it is here for the same reason: one definition of what a
 * token means, rather than a second value parser that will eventually disagree with `applyFilter`
 * about whether `aug` is a month.
 *
 * Probing settles spelling for free. `@year:88`, `@month:aug` and `@month:august` all resolve to
 * the values they mean, so a hand-typed query lights up the same checkmarks a clicked one does —
 * and it is what lets `@year:88` be cleared by unchecking 1988. It also needs no special case for
 * the values the bar has no box for: `@day:saturday` probes to a weekday, which no cell in the
 * 1–31 grid matches, and `@month:13` probes to nothing at all.
 */
function tokenOf(text: string, match: FilterMatch): string | null {
	if (!match.valid) return null;
	if (match.name === "sunday" || match.name === "daily") return `@${match.name}`;
	if (match.name !== "year" && match.name !== "month" && match.name !== "day" && match.name !== "in") return null;

	const probe = parseDateFilters(text.slice(match.start, match.end)).filters;
	if (probe === null) return null;
	if (match.name === "year") return single(probe.years, (year) => `@year:${year}`);
	if (match.name === "month") return single(probe.months, (month) => `@month:${MONTH_NAMES[month - 1]}`);
	// A book needs no canonicalising — the id is the only spelling there is — but it goes through the
	// probe all the same, so that whether a value counts stays `applyFilter`'s single opinion.
	if (match.name === "in") return single(probe.collections, (id) => `@in:${id}`);
	return single(probe.monthDays, (day) => `@day:${day}`);
}

/**
 * Every option in the bar that this query text asserts, as canonical tokens.
 *
 * One set for the whole bar rather than one per field, because no token is reachable from two
 * dropdowns — which is the property that lets the token-level rule run without exceptions.
 */
export function selectedTokens(text: string): Set<string> {
	const selected = new Set<string>();
	for (const match of scanFilters(text)) {
		const token = tokenOf(text, match);
		if (token !== null && fieldFor(token) !== undefined) selected.add(token);
	}
	return selected;
}

/**
 * The token, written in immediately after the last filter of the same field, else appended.
 *
 * So years collect beside years instead of scattering through the sentence, and the words the
 * reader typed keep their order and their single spaces either way.
 */
export function insertToken(text: string, token: string): string {
	const field = fieldFor(token);
	if (field === undefined) return text;

	let anchor: number | null = null;
	for (const match of scanFilters(text)) {
		if (field.owns.includes(match.name)) anchor = match.end;
	}

	if (anchor === null) {
		const head = text.replace(/\s+$/, "");
		return head === "" ? token : `${head} ${token}`;
	}
	return `${text.slice(0, anchor)} ${token}${text.slice(anchor)}`;
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
	const doomed = scanFilters(text).filter((match) => {
		const token = tokenOf(text, match);
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
 */
function cut(text: string, start: number, end: number): string {
	let from = start;
	while (from > 0 && /\s/.test(text[from - 1])) from--;
	let to = end;
	while (to < text.length && /\s/.test(text[to])) to++;

	const before = text.slice(0, from);
	const after = text.slice(to);
	if (before === "" || after === "") return before + after;
	return `${before} ${after}`;
}
