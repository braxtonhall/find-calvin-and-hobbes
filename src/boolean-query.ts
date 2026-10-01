import { Filter, FilterMatch, QuotedSpan, Run, passesFilter, quoted, quotedSpans, scanFilters } from "./filter-query";
import { Comic } from "./types";

/**
 * `@or`, `@and`, `@not` and parentheses: how the atoms of a query combine.
 *
 * The atoms are words and filters. Operators are bare `@word`s — a filter always takes a value, so
 * a bare name is free to mean something else — and they bind the way a search engine's do rather
 * than the way a programming language's do. Tightest first:
 *
 * - `@not` takes the one atom after it: `@not baby sitter` is sitter without baby, and
 *   `@not (baby sitter)` is anything but both.
 * - `@or` takes the atom either side: `rosalyn @or baby sitter` is `(rosalyn or baby) sitter`, and
 *   the phrase needs its parentheses — `rosalyn @or (baby sitter)`.
 * - Side by side is AND — with the one exception filters have always had. A strip ran on one day,
 *   so two values of one calendar field side by side could only ever be nothing, and they mean
 *   either instead: `@year:1988 @year:1989` is both years, and `@day:saturday @day:sunday` is the
 *   weekend. Books widen too, though a strip is printed in many: two books mostly share no strips,
 *   so `@in:book1 @in:book3` asking for both would mostly be asking for nothing. Tags are a strip's
 *   own properties and are asked for together, so `@is:` stays AND. An `@or` of one such field is
 *   more of the same, so `@year:1988 @or @year:1989 @year:1990` is any of the three. See `WIDENING`.
 * - `@and` is AND without the exception, for the reader who means it: `@year:1988 @and
 *   @year:1989` is nothing.
 *
 * The parse is lenient, because it runs on every keystroke and a reader halfway through typing is
 * not wrong: an unclosed parenthesis or quotation closes at the end, a stray parenthesis is dropped,
 * and an operator with nothing to work on is ignored.
 *
 * A quotation is one atom, a phrase, and everything in it is text: `"rosalyn @or baby"` is the
 * words `rosalyn or baby` in that order, not a choice between two of them. So `@not "baby sitter"`
 * is anything that does not say baby sitter, where `@not baby sitter` is sitter without baby.
 *
 * What comes out is not a tree. A query is distributed into an OR of plain queries — branches —
 * each of which is exactly what a query was before any of this: words, ranked together as one
 * recitation, and filters that judge the rows. `(rosalyn @or babysitter) pizza` is
 * `rosalyn pizza` or `babysitter pizza`, so each half keeps the phrase scoring and the forgiveness
 * of a misremembered line that splitting the words into separate searches would throw away. And a
 * query without an operator is a single branch, which is the guarantee that none of this changes
 * what it returns.
 */

/**
 * A word, or a run of anything that is not an operator, a filter, a parenthesis or a space — or a
 * quoted phrase, held with its marks straightened and closed so that `search.ts` can tell the two
 * apart: `"baby sitter"`.
 */
interface TextLeaf {
	kind: "text";
	text: string;
	/** Where the atom stood among the atoms. See `segmentsOf` for what it is for. */
	position: number;
}

interface FilterLeaf {
	kind: "filter";
	match: FilterMatch;
	position: number;
}

type Leaf = TextLeaf | FilterLeaf;

type Node = Leaf | { kind: "and" | "or"; items: Node[] } | { kind: "not"; item: Node };

type Token = Leaf | { kind: "open" } | { kind: "close" } | { kind: "operator"; operator: Operator };

/** A quotation with nothing in it: found, so its marks are not taken for text, and then dropped. */
type Gap = { kind: "empty" };

type Operator = "and" | "or" | "not";

/**
 * A bare name, with no colon after it — `@or:x` is not an operator, and `@orange` is not either.
 * Matched apart from `scanFilters` because an operator is not a filter: it has no value, no spec,
 * and no values for the autocomplete menu to offer — only its own name.
 */
const OPERATOR_PATTERN = /@(and|or|not)(?![a-zA-Z:])/gi;

/**
 * The filters a strip can satisfy only one value of, which side by side mean either. `@day:` is two
 * of them under one name, so `@day:1 @day:monday` is the Mondays that fell on the first while
 * `@day:1 @day:15` is either day; and the bounds are here too, so `@before:1990 @before:1993` keeps
 * the wider, whichever order they come in.
 *
 * And the books, which a strip can be in several of, but which a reader asking for two of means
 * either of all the same: two books mostly share no strips, and the ones that do mostly hold one
 * inside the other, so both would be nothing or the smaller book. Both is `@and`.
 */
const WIDENING = new Set<Filter["kind"]>(["year", "month", "monthDay", "weekday", "date", "after", "before", "in"]);

/** A query of more clauses than this is refused rather than searched. See `normalise`. */
const MAX_CLAUSES = 256;

/**
 * Something a row must satisfy to stay in its branch.
 *
 * A word under `@not` is the one place a word judges a row rather than ranking it, and it is held
 * as the text the reader wrote, because what counts as containing it is a question for the index —
 * see `search.ts`. It is never a negated search: the ranked search reaches for near spellings and
 * forgives missing words, and a row excluded on that kind of evidence is a row the reader never
 * asked to lose.
 */
export type Constraint = { kind: "filter"; filter: Filter; negated: boolean } | { kind: "text"; text: string };

/** One plain query: words to rank, and rows to keep. */
export interface Branch {
	/** The words, in the order they were written, split wherever something else stood between them. */
	segments: string[];
	/** A row stays when any clause holds — and a clause holds when all of its constraints do. */
	clauses: Constraint[][];
}

/**
 * Where the operators are: every `@and`, `@or` and `@not` that is not part of a filter's value or
 * between quotation marks.
 */
function operatorMatches(text: string, filters: FilterMatch[], quotes: QuotedSpan[]) {
	return [...text.matchAll(OPERATOR_PATTERN)].filter(
		(match) =>
			!quoted(quotes, match.index) &&
			!filters.some((filter) => match.index >= filter.start && match.index < filter.end),
	);
}

/**
 * The phrase between a pair of quotation marks, as the atom `TextLeaf` describes, or null for one
 * with nothing in it to look for — `""`, or `"  "` — which is dropped as an empty `()` is.
 */
function phraseText(inner: string): string | null {
	const words = inner.trim().split(/\s+/).join(" ");
	return words === "" ? null : `"${words}"`;
}

function tokenize(text: string): Token[] {
	const filters = scanFilters(text);
	const quotes = quotedSpans(text);
	const inFilter = (index: number) => filters.some((match) => index >= match.start && index < match.end);

	interface Span {
		start: number;
		end: number;
		token: Token | Gap;
	}
	const spans: Span[] = filters.map((match) => ({
		start: match.start,
		end: match.end,
		token: { kind: "filter", match, position: 0 },
	}));
	for (const match of operatorMatches(text, filters, quotes)) {
		const operator = match[1].toLowerCase() as Operator;
		spans.push({ start: match.index, end: match.index + match[0].length, token: { kind: "operator", operator } });
	}
	for (const match of text.matchAll(/[()]/g)) {
		if (inFilter(match.index) || quoted(quotes, match.index)) continue;
		spans.push({ start: match.index, end: match.index + 1, token: { kind: match[0] === "(" ? "open" : "close" } });
	}
	for (const quote of quotes) {
		const phrase = phraseText(quote.inner);
		// Still a span when it is empty, so that its marks are not read as a word of their own.
		spans.push({
			start: quote.start,
			end: quote.end,
			token: phrase === null ? { kind: "empty" } : { kind: "text", text: phrase, position: 0 },
		});
	}
	spans.sort((one, other) => one.start - other.start);

	const tokens: Token[] = [];
	let position = 0;
	const words = (between: string) => {
		for (const word of between.split(/\s+/)) {
			if (word !== "") tokens.push({ kind: "text", text: word, position: position++ });
		}
	};
	let cursor = 0;
	for (const span of spans) {
		words(text.slice(cursor, span.start));
		cursor = span.end;
		const { token } = span;
		// A parenthesis takes no position, so it never separates two words: in
		// `(rosalyn @or baby) sitter`, `baby sitter` is still a phrase the reader wrote.
		if (token.kind === "empty") continue;
		if (token.kind === "filter" || token.kind === "text") token.position = position++;
		if (token.kind === "operator") position++;
		tokens.push(token);
	}
	words(text.slice(cursor));
	return tokens;
}

/** Recursive descent over the tokens, tightest binding at the bottom. */
class Parser {
	private index = 0;

	constructor(private readonly tokens: Token[]) {}

	/** Side by side, until the group closes — or, at the top, until the tokens run out. */
	sequence(nested: boolean): Node | null {
		// Each run is what stood side by side between one `@and` and the next.
		const runs: Node[][] = [[]];
		while (this.index < this.tokens.length) {
			const token = this.tokens[this.index];
			if (token.kind === "close") {
				if (nested) break;
				this.index++;
				continue;
			}
			if (token.kind === "operator" && token.operator === "and") {
				this.index++;
				runs.push([]);
				continue;
			}
			const item = this.disjunction();
			if (item !== null) runs[runs.length - 1].push(item);
		}
		return combine("and", runs.flatMap(widen));
	}

	private disjunction(): Node | null {
		const items: Node[] = [];
		const first = this.unary();
		if (first !== null) items.push(first);
		while (this.peekOperator() === "or") {
			this.index++;
			const next = this.unary();
			if (next !== null) items.push(next);
		}
		return combine("or", items);
	}

	private unary(): Node | null {
		const token = this.tokens[this.index];
		if (token === undefined || token.kind === "close") return null;
		this.index++;
		if (token.kind === "text" || token.kind === "filter") return token;
		if (token.kind === "open") {
			const inner = this.sequence(true);
			if (this.tokens[this.index]?.kind === "close") this.index++;
			return inner;
		}
		// An `@or` or `@and` with nothing before it has nothing to join, and is dropped.
		if (token.operator !== "not") return null;
		const operand = this.unary();
		return operand === null ? null : { kind: "not", item: operand };
	}

	private peekOperator(): Operator | null {
		const token = this.tokens[this.index];
		return token?.kind === "operator" ? token.operator : null;
	}
}

/**
 * The `WIDENING` field an item is a choice among values of, or null: a filter of that field, or an
 * OR of nothing but them. The OR is one more of the same, so `@year:1988 @or @year:1989 @year:1990`
 * is any of the three, rather than two years both of which a strip would have to have run in.
 */
function wideningKind(item: Node): Filter["kind"] | null {
	if (item.kind === "filter") {
		const filter = item.match.filter;
		return filter !== null && WIDENING.has(filter.kind) ? filter.kind : null;
	}
	if (item.kind !== "or") return null;
	const kinds = new Set(item.items.map(wideningKind));
	const [kind] = kinds;
	return kinds.size === 1 ? kind : null;
}

/**
 * One run of side-by-side items, with the filters of each `WIDENING` field gathered into an OR where
 * the first of them stood — along with any OR of that field alone, which says nothing different.
 * Nothing else is gathered: not a filter under `@not`, nor one beside an `@or` that takes in
 * anything else, each of which says how it combines already. Nor one that cannot be read, which has
 * to stay where it can sink the clause it is in.
 */
function widen(items: Node[]): Node[] {
	const gathered = new Map<Filter["kind"], Node[]>();
	for (const item of items) {
		const kind = wideningKind(item);
		if (kind !== null) gathered.set(kind, [...(gathered.get(kind) ?? []), item]);
	}

	const result: Node[] = [];
	for (const item of items) {
		const kind = wideningKind(item);
		const group = kind === null ? undefined : gathered.get(kind)!;
		if (group === undefined) result.push(item);
		else if (group[0] === item)
			result.push(
				combine(
					"or",
					group.flatMap((each) => (each.kind === "or" ? each.items : [each])),
				)!,
			);
	}
	return result;
}

function combine(kind: "and" | "or", items: Node[]): Node | null {
	if (items.length === 0) return null;
	return items.length === 1 ? items[0] : { kind, items };
}

interface Literal {
	leaf: Leaf;
	negated: boolean;
}

class TooManyClauses extends Error {}

/**
 * The node as an OR of ANDs of atoms, each atom possibly negated: `@not` pushed down to the atoms,
 * then AND distributed over OR.
 *
 * Distribution multiplies — four ORs of two side by side are sixteen clauses — and nobody types a
 * query that needs more than a handful, so past `MAX_CLAUSES` the query is refused rather than
 * expanded without end.
 */
function normalise(node: Node, negated: boolean): Literal[][] {
	if (node.kind === "text" || node.kind === "filter") return [[{ leaf: node, negated }]];
	if (node.kind === "not") return normalise(node.item, !negated);

	const conjunctive = (node.kind === "and") !== negated;
	const parts = node.items.map((item) => normalise(item, negated));
	if (!conjunctive) return parts.flat();

	let clauses: Literal[][] = [[]];
	for (const part of parts) {
		const next: Literal[][] = [];
		for (const clause of clauses) for (const other of part) next.push([...clause, ...other]);
		if (next.length > MAX_CLAUSES) throw new TooManyClauses();
		clauses = next;
	}
	return clauses;
}

/**
 * The words of one clause as runs the reader actually wrote: two words are one run only where they
 * stood next to each other. In `calvin @or hobbes snow`, the clause `hobbes snow` is a phrase and
 * the clause `calvin snow` is two words that were never side by side, which the ranked search must
 * not reward as though they had been. The same rule a filter between two words has always followed.
 */
function segmentsOf(words: TextLeaf[]): string[] {
	const segments: string[] = [];
	let previous: number | null = null;
	for (const word of [...words].sort((one, other) => one.position - other.position)) {
		if (previous !== null && word.position === previous + 1) segments[segments.length - 1] += ` ${word.text}`;
		else segments.push(word.text);
		previous = word.position;
	}
	return segments;
}

/**
 * The query, as the plain queries it is the OR of. Clauses that would rank the same words are one
 * branch, so the words are searched once and only the rows it keeps differ: `calvin @not (baby
 * sitter)` is one search for `calvin`, keeping rows without baby or without sitter.
 *
 * Empty where the query has nothing in it to search — no atoms at all, a clause that holds a filter
 * nothing can satisfy, or more clauses than `MAX_CLAUSES`.
 */
export function parseQuery(text: string): Branch[] {
	const tree = new Parser(tokenize(text)).sequence(false);
	if (tree === null) return [];

	let clauses: Literal[][];
	try {
		clauses = normalise(tree, false);
	} catch (error) {
		if (error instanceof TooManyClauses) return [];
		throw error;
	}

	const branches = new Map<string, Branch>();
	for (const clause of clauses) {
		// A filter that cannot be read is a mistake, and a mistake satisfies nothing — under `@not`
		// as much as anywhere, since `@not @month:13` is no more a sensible request than `@month:13`.
		if (clause.some(({ leaf }) => leaf.kind === "filter" && leaf.match.filter === null)) continue;

		const words: TextLeaf[] = [];
		const constraints: Constraint[] = [];
		for (const { leaf, negated } of clause) {
			if (leaf.kind === "filter") constraints.push({ kind: "filter", filter: leaf.match.filter!, negated });
			else if (negated) constraints.push({ kind: "text", text: leaf.text });
			else words.push(leaf);
		}

		const segments = segmentsOf(words);
		const key = JSON.stringify(segments);
		const branch = branches.get(key);
		if (branch === undefined) branches.set(key, { segments, clauses: [constraints] });
		else branch.clauses.push(constraints);
	}
	return [...branches.values()];
}

/**
 * Where each negated filter starts in the text: the ones standing under an odd number of `@not`s,
 * however far up the tree the `@not` is — `@not (@year:1988 @or snow)` negates the year.
 *
 * The filter bar's question rather than the search's. A box that ticked for `@not @year:1988` would
 * be saying the opposite of the query, and unticking it would leave an `@not` with nothing to work
 * on, so the bar leaves a negated filter alone and unrepresented.
 */
export function negatedFilters(text: string): Set<number> {
	const starts = new Set<number>();
	const walk = (node: Node | null, negated: boolean): void => {
		if (node === null || node.kind === "text") return;
		if (node.kind === "filter") {
			if (negated) starts.add(node.match.start);
		} else if (node.kind === "not") walk(node.item, !negated);
		else for (const item of node.items) walk(item, negated);
	};
	walk(new Parser(tokenize(text)).sequence(false), false);
	return starts;
}

/** One operator in the text, and whether it has the atoms it works on. */
export interface OperatorMatch {
	operator: Operator;
	start: number;
	end: number;
	/** Something it can join stands before it. Only `@and` and `@or` need this. */
	before: boolean;
	/** Something it can work on stands after it — an atom, a group, or an `@not` that has one. */
	after: boolean;
}

/**
 * Every operator in the text, judged the way `Parser` will treat it: an `@or` or `@and` with no
 * atom or group before it is dropped, and an operator with nothing after it is ignored.
 *
 * The search box's question rather than the search's, which is lenient about both. A group is
 * taken to have something in it, which is the benefit of the doubt a reader who has typed the `(`
 * and not yet the rest is owed.
 */
export function scanOperators(text: string): OperatorMatch[] {
	const tokens = tokenize(text);
	const operand = (index: number): boolean => {
		const token = tokens[index];
		if (token === undefined || token.kind === "close") return false;
		if (token.kind !== "operator") return true;
		return token.operator === "not" && operand(index + 1);
	};

	// `tokenize` keeps no offsets, so the operators are found again in the text, in the same order.
	const found: OperatorMatch[] = [];
	const offsets = operatorMatches(text, scanFilters(text), quotedSpans(text));
	let next = 0;
	for (const [index, token] of tokens.entries()) {
		if (token.kind !== "operator") continue;
		const match = offsets[next++];
		const previous = tokens[index - 1];
		found.push({
			operator: token.operator,
			start: match.index,
			end: match.index + match[0].length,
			before: previous !== undefined && previous.kind !== "open" && previous.kind !== "operator",
			after: operand(index + 1),
		});
	}
	return found;
}

/**
 * Whether a row stays in the branch.
 *
 * `contains` answers whether the row holds the text of a word under `@not`, which only the search
 * index can. Without it, as with a bare date, every row is taken not to.
 */
export function admits(
	branch: Branch,
	subject: string | Comic,
	run?: Run,
	contains?: (text: string) => boolean,
): boolean {
	return branch.clauses.some((clause) =>
		clause.every((constraint) =>
			constraint.kind === "filter"
				? passesFilter(subject, constraint.filter, run) !== constraint.negated
				: !(contains?.(constraint.text) ?? false),
		),
	);
}

/** Whether some clause of the branch asks for the days a strip ran again — see `search`. */
export function asksForReruns(branch: Branch): boolean {
	return branch.clauses.some((clause) =>
		clause.some(
			(constraint) =>
				constraint.kind === "filter" &&
				!constraint.negated &&
				constraint.filter.kind === "is" &&
				constraint.filter.tag === "rerun",
		),
	);
}

/** Whether the branch can turn a row away at all. A clause with nothing in it holds of every row. */
export function constrains(branch: Branch): boolean {
	return branch.clauses.every((clause) => clause.length > 0);
}
