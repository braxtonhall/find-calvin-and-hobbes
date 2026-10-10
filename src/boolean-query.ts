import {
	Filter,
	FilterMatch,
	OPERATOR_WORDS,
	QueryContext,
	RawFilter,
	Run,
	STRIP_QUERY,
	lexFilters,
	passesFilter,
	quoted,
	quotedSpans,
	readMatch,
} from "./filter-query";
import { CrossingOperator, crossingSpec } from "./filter-spec";
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
 *   own properties and are asked for together, so `@is:` stays AND, and `@i:` with it. An `@or` of
 *   one such field is more of the same, so `@year:1988 @or @year:1989 @year:1990` is any of the
 *   three. See `WIDENING`.
 * - `@and` is AND without the exception, for the reader who means it: `@year:1988 @and
 *   @year:1989` is nothing.
 *
 * The operators that cross between a strip and its collections bind as tightly as `@not`, and like
 * it take the one atom after them, which is usually a group: `@in (@i:own @strips:<1000)` is a
 * strip in a book that is both. `@in` goes up from a strip to its books, `@by` to its creators,
 * `@featuring` to its characters and `@during` to its arcs; `@has` goes down from a collection to
 * its strips. Each is "some": `@in X` is in at least one book that is X. `@only` before one of them
 * makes it "at least one, and all of them": `@only @in @i:own` is printed only in books the reader
 * owns. What stands inside one is written in the language on the other side of it — see
 * `QueryContext` — so `@i:own` inside `@in (…)` is a book the reader owns, and outside it a
 * printing.
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
 * what it returns. Distribution stops at a crossing operator, which is one atom however much is
 * inside it: `@not @in (A @or B)` is not `@not @in A @or @not @in B`. Inside, its query is
 * distributed again on its own.
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

/** A crossing operator and the atom it takes, which is in the language on the other side. */
interface CrossNode {
	kind: "cross";
	operator: CrossingOperator;
	only: boolean;
	item: Node;
	/** Written in the language it goes out of. One written in the other is a mistake. */
	valid: boolean;
}

/** Something written wrong around an atom — an `@only` before what is not a crossing — which sinks its clause. */
interface InvalidNode {
	kind: "invalid";
}

type Node = Leaf | CrossNode | InvalidNode | { kind: "and" | "or"; items: Node[] } | { kind: "not"; item: Node };

interface OperatorToken {
	kind: "operator";
	operator: Operator;
	start: number;
	end: number;
}

interface CrossToken {
	kind: "cross";
	operator: CrossingOperator;
	start: number;
	end: number;
	/** Where it stands, which says whether it can go where it goes. */
	context: QueryContext;
	/** Where it goes: the context of the atom it takes. */
	target: QueryContext;
}

interface OnlyToken {
	kind: "only";
	start: number;
	end: number;
}

/** A filter as the scanner found it, read once the context pass has said where it stands. */
interface RawFilterToken {
	kind: "raw";
	raw: RawFilter;
	position: number;
}

type Token = TextLeaf | FilterLeaf | { kind: "open" } | { kind: "close" } | OperatorToken | CrossToken | OnlyToken;

/** A quotation with nothing in it: found, so its marks are not taken for text, and then dropped. */
type Gap = { kind: "empty" };

type Operator = "and" | "or" | "not";

/**
 * A bare name, with no colon after it — `@or:x` is not an operator, and `@orange` is not either.
 * Matched apart from `lexFilters` because an operator is not a filter: it has no value, no spec,
 * and no values for the autocomplete menu to offer — only its own name.
 */
const OPERATOR_PATTERN = /@([a-zA-Z]+)(?![a-zA-Z:])/g;

/**
 * The filters a strip can satisfy only one value of, which side by side mean either. `@day:` is two
 * of them under one name, so `@day:1 @day:monday` is the Mondays that fell on the first while
 * `@day:1 @day:15` is either day; and the bounds are here too, so `@before:1990 @before:1993` keeps
 * the wider, whichever order they come in.
 *
 * And the books, which a strip can be in several of, but which a reader asking for two of means
 * either of all the same: two books mostly share no strips, and the ones that do mostly hold one
 * inside the other, so both would be nothing or the smaller book. Both is `@and`. The arcs the same
 * way, since no strip is in two.
 *
 * And the creators, for the same reason: two people either made every strip together, where both
 * and either are the same, or one took over from the other, where both is nothing. Only the strips
 * of a handover tell the two apart, and `@and` is there for them.
 *
 * And a collection's id, of which it has one; and its year, which a book has one of. An arc can run
 * across several, but `@published:` widens on every kind, so the two tabs read a query the same way.
 */
const WIDENING = new Set<Filter["kind"]>([
	"year",
	"month",
	"monthDay",
	"weekday",
	"date",
	"after",
	"before",
	"in",
	"by",
	"during",
	"id",
	"published",
]);

/** A query of more clauses than this is refused rather than searched. See `normalise`. */
const MAX_CLAUSES = 256;

/**
 * A query on the other side of a crossing operator, compiled: the clauses a strip's book, say, must
 * satisfy for `@in (…)` to hold of the strip.
 */
export interface Crossing {
	operator: CrossingOperator;
	/** `@only`: at least one, and every one. */
	only: boolean;
	clauses: Constraint[][];
	/**
	 * Whether the query inside asks `@here:` about the link it crosses, at its own level. One that
	 * does has to be judged afresh for each link; one that does not can be judged once per collection.
	 */
	linked: boolean;
	/** Whether a `@has` asks for the days a strip ran again, which it otherwise leaves out. */
	reruns: boolean;
}

/**
 * Something a row must satisfy to stay in its branch.
 *
 * A word in the main search judges a row only under `@not`, and it is held as the text the reader
 * wrote, because what counts as containing it is a question for the index — see `search.ts`. It is
 * never a negated search: the ranked search reaches for near spellings and forgives missing words,
 * and a row excluded on that kind of evidence is a row the reader never asked to lose. Everywhere
 * else nothing is ranked, and a word judges the row for or against.
 */
export type Constraint =
	| { kind: "filter"; filter: Filter; negated: boolean }
	| { kind: "text"; text: string; negated: boolean }
	| { kind: "cross"; crossing: Crossing; negated: boolean };

/** One plain query: words to rank, and rows to keep. */
export interface Branch {
	/** The words, in the order they were written, split wherever something else stood between them. */
	segments: string[];
	/** A row stays when any clause holds — and a clause holds when all of its constraints do. */
	clauses: Constraint[][];
}

interface Span {
	start: number;
	end: number;
	token: Token | Gap | RawFilterToken;
}

/**
 * The phrase between a pair of quotation marks, as the atom `TextLeaf` describes, or null for one
 * with nothing in it to look for — `""`, or `"  "` — which is dropped as an empty `()` is.
 */
function phraseText(inner: string): string | null {
	const words = inner.trim().split(/\s+/).join(" ");
	return words === "" ? null : `"${words}"`;
}

/**
 * The query as tokens, each filter read in the context it stands in.
 *
 * The context of an atom is the language of the box, changed by each crossing operator that takes
 * it — directly, or as the group it opens. That is the parser's own binding, run ahead of it, so the
 * box can say where each filter stands without parsing the query twice.
 */
function tokenize(text: string, root: QueryContext): Token[] {
	return lex(text, root).tokens;
}

/** The tokens, and the context the next atom would stand in after them. */
function lex(text: string, root: QueryContext): { tokens: Token[]; after: QueryContext } {
	const filters = lexFilters(text);
	const quotes = quotedSpans(text);
	const inFilter = (index: number) => filters.some((match) => index >= match.start && index < match.end);

	const spans: Span[] = filters.map((raw) => ({
		start: raw.start,
		end: raw.end,
		token: { kind: "raw", raw, position: 0 },
	}));
	for (const match of text.matchAll(OPERATOR_PATTERN)) {
		const word = match[1].toLowerCase();
		if (!OPERATOR_WORDS.has(word) || quoted(quotes, match.index) || inFilter(match.index)) continue;
		const start = match.index;
		const end = start + match[0].length;
		if (word === "and" || word === "or" || word === "not") {
			spans.push({ start, end, token: { kind: "operator", operator: word, start, end } });
		} else if (word === "only") {
			spans.push({ start, end, token: { kind: "only", start, end } });
		} else {
			const operator = word as CrossingOperator;
			spans.push({ start, end, token: { kind: "cross", operator, start, end, context: root, target: root } });
		}
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
	const stack: QueryContext[] = [root];
	// The context a crossing operator has set for the atom it takes, until that atom arrives.
	let pending: QueryContext | null = null;
	const here = () => pending ?? stack[stack.length - 1];

	let position = 0;
	const words = (between: string) => {
		for (const word of between.split(/\s+/)) {
			if (word === "") continue;
			tokens.push({ kind: "text", text: word, position: position++ });
			pending = null;
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
		if (token.kind === "raw") {
			tokens.push({ kind: "filter", match: readMatch(token.raw, here()), position: position++ });
			pending = null;
			continue;
		}
		if (token.kind === "text") {
			token.position = position++;
			pending = null;
		} else if (token.kind === "open") {
			stack.push(here());
			pending = null;
		} else if (token.kind === "close") {
			if (stack.length > 1) stack.pop();
			pending = null;
		} else if (token.kind === "operator") {
			position++;
			// `@not` hands its atom on as it found it; `@and` and `@or` end whatever was waiting.
			if (token.operator !== "not") pending = null;
		} else if (token.kind === "only") {
			position++;
		} else if (token.kind === "cross") {
			position++;
			const spec = crossingSpec(token.operator)!;
			token.context = here();
			token.target = { language: spec.to, ...(spec.type ? { type: spec.type } : {}), link: true };
			pending = token.target;
		}
		tokens.push(token);
	}
	words(text.slice(cursor));
	return { tokens, after: here() };
}

/**
 * The context an atom starting at `index` stands in: the language it is written in there, and
 * whether a crossing stands between it and the top. What the menu offers, and how a half-typed
 * filter is judged, depend on it.
 */
export function contextAt(text: string, index: number, root: QueryContext): QueryContext {
	return lex(text.slice(0, index), root).after;
}

/** Whether a crossing operator can be written where it stands. */
function crossesFrom(token: CrossToken): boolean {
	return crossingSpec(token.operator)!.from === token.context.language;
}

/** The relationship filters, each short for its operator around `@id:` — `@in:x` is `@in (@id:x)`. */
const RELATIONSHIPS: Partial<Record<Filter["kind"], CrossingOperator>> = {
	in: "in",
	by: "by",
	featuring: "featuring",
	during: "during",
};

function relationshipOf(filter: Filter): { operator: CrossingOperator; id: string } | null {
	const operator = RELATIONSHIPS[filter.kind];
	if (operator === undefined) return null;
	switch (filter.kind) {
		case "in":
			return { operator, id: filter.collection };
		case "by":
			return { operator, id: filter.creator };
		case "featuring":
			return { operator, id: filter.character };
		case "during":
			return { operator, id: filter.arc };
		default:
			return null;
	}
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
		if (token.kind === "cross") {
			const item = this.unary();
			return item === null
				? null
				: { kind: "cross", operator: token.operator, only: false, item, valid: crossesFrom(token) };
		}
		if (token.kind === "only") {
			const item = this.unary();
			if (item === null) return null;
			if (item.kind === "cross") return { ...item, only: true };
			// `@only @in:x` is `@only @in (@id:x)`, as `@in:x` is `@in (@id:x)`.
			const relationship = item.kind === "filter" && item.match.filter ? relationshipOf(item.match.filter) : null;
			if (relationship !== null && item.kind === "filter") {
				const match: FilterMatch = {
					...item.match,
					name: "id",
					value: relationship.id,
					filter: { kind: "id", id: relationship.id },
				};
				const inner: FilterLeaf = { kind: "filter", match, position: item.position };
				return { kind: "cross", operator: relationship.operator, only: true, item: inner, valid: true };
			}
			return { kind: "invalid" };
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

/** An atom of the distributed query: a word, a filter, or a crossing operator and everything it holds. */
type Atom = Leaf | CrossNode | InvalidNode;

interface Literal {
	atom: Atom;
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
	if (node.kind === "text" || node.kind === "filter" || node.kind === "cross" || node.kind === "invalid") {
		return [[{ atom: node, negated }]];
	}
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
 * The crossing as its compiled query, or null where everything inside it is a mistake — which a
 * mistake anywhere sinks the clause of, as a filter that cannot be read does.
 */
function compileCrossing(node: CrossNode): Crossing | null {
	if (!node.valid) return null;
	const clauses = compileClauses(normalise(node.item, false));
	if (clauses.length === 0) return null;
	return {
		operator: node.operator,
		only: node.only,
		clauses,
		linked: clauses.some((clause) =>
			clause.some((constraint) => constraint.kind === "filter" && constraint.filter.kind === "here"),
		),
		reruns: node.operator === "has" && clausesAskForReruns(clauses),
	};
}

/**
 * One literal as what it asks of a row, or null for a mistake. A filter that cannot be read is a
 * mistake, and a mistake satisfies nothing — under `@not` as much as anywhere, since `@not
 * @month:13` is no more a sensible request than `@month:13`.
 */
function constraintOf({ atom, negated }: Literal): Constraint | null {
	if (atom.kind === "invalid") return null;
	if (atom.kind === "text") return { kind: "text", text: atom.text, negated };
	if (atom.kind === "filter")
		return atom.match.filter === null ? null : { kind: "filter", filter: atom.match.filter, negated };
	const crossing = compileCrossing(atom);
	return crossing === null ? null : { kind: "cross", crossing, negated };
}

/** The clauses as constraints, with every clause that holds a mistake dropped. */
function compileClauses(clauses: Literal[][]): Constraint[][] {
	const compiled: Constraint[][] = [];
	for (const clause of clauses) {
		const constraints = clause.map(constraintOf);
		if (constraints.every((constraint) => constraint !== null)) compiled.push(constraints as Constraint[]);
	}
	return compiled;
}

/** The query's tree, or null where it has nothing in it. */
function treeOf(text: string, root: QueryContext): Node | null {
	return new Parser(tokenize(text, root)).sequence(false);
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
	const tree = treeOf(text, STRIP_QUERY);
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
		const words: TextLeaf[] = [];
		const constraints: Constraint[] = [];
		let mistaken = false;
		try {
			for (const literal of clause) {
				if (literal.atom.kind === "text" && !literal.negated) {
					words.push(literal.atom);
					continue;
				}
				const constraint = constraintOf(literal);
				if (constraint === null) mistaken = true;
				else constraints.push(constraint);
			}
		} catch (error) {
			if (error instanceof TooManyClauses) return [];
			throw error;
		}
		if (mistaken) continue;

		const segments = segmentsOf(words);
		const key = JSON.stringify(segments);
		const branch = branches.get(key);
		if (branch === undefined) branches.set(key, { segments, clauses: [constraints] });
		else branch.clauses.push(constraints);
	}
	return [...branches.values()];
}

/**
 * The query as clauses to judge, with nothing ranked: what a Collections tab lists, where `root` is
 * the tab. Every word is a constraint, for or against. Empty where nothing can match, as
 * `parseQuery` is; null where the query has nothing in it at all, which lists everything.
 */
export function compileQuery(text: string, root: QueryContext): Constraint[][] | null {
	const tree = treeOf(text, root);
	if (tree === null) return null;
	try {
		return compileClauses(normalise(tree, false));
	} catch (error) {
		if (error instanceof TooManyClauses) return [];
		throw error;
	}
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
		if (node === null || node.kind === "text" || node.kind === "invalid") return;
		if (node.kind === "filter") {
			if (negated) starts.add(node.match.start);
		} else if (node.kind === "not") walk(node.item, !negated);
		else if (node.kind === "cross") walk(node.item, negated);
		else for (const item of node.items) walk(item, negated);
	};
	walk(treeOf(text, STRIP_QUERY), false);
	return starts;
}

/** One operator in the text, and whether it has the atoms it works on. */
export interface OperatorMatch {
	operator: Operator | CrossingOperator | "only";
	start: number;
	end: number;
	/** Something it can join stands before it. Only `@and` and `@or` need this. */
	before: boolean;
	/** Something it can work on stands after it — an atom, a group, or an operator that has one. */
	after: boolean;
	/**
	 * Nothing after it but more operators waiting on the same atom, and then the end of the query:
	 * `@in @has`, which is a query still being written rather than one with nothing to work on.
	 */
	unfinished: boolean;
	/** Why it can never work where it stands, whatever comes after it. */
	reason?: string;
}

/** Where a crossing operator goes, for the reader told it cannot go there from here. */
function crossingMistake(token: CrossToken): string {
	if (token.operator === "has")
		return "@has goes from a collection to its strips: use it on the Collections page, or inside @in (…)";
	return `@${token.operator} goes from a strip to its collections. Did you mean @has @${token.operator} …?`;
}

/**
 * Every operator in the text, judged the way `Parser` will treat it: an `@or` or `@and` with no
 * atom or group before it is dropped, and an operator with nothing after it is ignored. A crossing
 * operator written in the language it does not go out of, and an `@only` before anything but a
 * crossing, are mistakes.
 *
 * The search box's question rather than the search's, which is lenient about both. A group is
 * taken to have something in it, which is the benefit of the doubt a reader who has typed the `(`
 * and not yet the rest is owed.
 */
export function scanOperators(text: string, root: QueryContext = STRIP_QUERY): OperatorMatch[] {
	return scanQuery(text, root).operators;
}

/** Every filter in the text, read where it stands, and every operator, judged. See `scanOperators`. */
export function scanQuery(text: string, root: QueryContext): { filters: FilterMatch[]; operators: OperatorMatch[] } {
	const tokens = tokenize(text, root);
	const operand = (index: number): boolean => {
		const token = tokens[index];
		if (token === undefined || token.kind === "close") return false;
		if (token.kind === "operator") return token.operator === "not" && operand(index + 1);
		if (token.kind === "cross" || token.kind === "only") return operand(index + 1);
		return true;
	};
	// Whether the chain of operators from here runs off the end of the query, rather than into a
	// parenthesis that closes, or an `@and` or `@or`, either of which leaves it nothing to take.
	const runsOut = (index: number): boolean => {
		const token = tokens[index];
		if (token === undefined) return true;
		if (token.kind === "operator") return token.operator === "not" && runsOut(index + 1);
		if (token.kind === "cross" || token.kind === "only") return runsOut(index + 1);
		return false;
	};

	const filters: FilterMatch[] = [];
	const operators: OperatorMatch[] = [];
	for (const [index, token] of tokens.entries()) {
		if (token.kind === "filter") {
			filters.push(token.match);
			continue;
		}
		if (token.kind !== "operator" && token.kind !== "cross" && token.kind !== "only") continue;
		const previous = tokens[index - 1];
		const found: OperatorMatch = {
			operator: token.kind === "only" ? "only" : token.operator,
			start: token.start,
			end: token.end,
			before:
				previous !== undefined &&
				previous.kind !== "open" &&
				previous.kind !== "operator" &&
				previous.kind !== "cross" &&
				previous.kind !== "only",
			after: operand(index + 1),
			unfinished: runsOut(index + 1),
		};
		if (token.kind === "cross" && !crossesFrom(token)) found.reason = crossingMistake(token);
		if (token.kind === "only") {
			const next = tokens[index + 1];
			const crossing =
				next === undefined ||
				next.kind === "cross" ||
				(next.kind === "filter" && next.match.filter !== null && relationshipOf(next.match.filter) !== null);
			if (!crossing) found.reason = "@only goes before @has, @in or another operator like them: @only @in @i:own";
		}
		operators.push(found);
	}
	return { filters, operators };
}

/**
 * Whether a row stays in the branch.
 *
 * `contains` answers whether the row holds the text of a word, which only the search index can.
 * Without it, as with a bare date, every row is taken not to. `crosses` answers a crossing operator,
 * which only `query-eval.ts` can; without it, none holds.
 */
export function admits(
	branch: Pick<Branch, "clauses">,
	subject: string | Comic,
	run?: Run,
	contains?: (text: string) => boolean,
	crosses?: (crossing: Crossing) => boolean,
): boolean {
	return branch.clauses.some((clause) =>
		clause.every((constraint) => {
			if (constraint.kind === "filter") return passesFilter(subject, constraint.filter, run) !== constraint.negated;
			if (constraint.kind === "text") return (contains?.(constraint.text) ?? false) !== constraint.negated;
			return (crosses?.(constraint.crossing) ?? false) !== constraint.negated;
		}),
	);
}

/**
 * Whether some clause asks for the days a strip ran again — see `search`. `@is:rerun` does, and so
 * does each of the reader's own `@i:` tags, since a clipping of a rerun is a printing like any other, and
 * could otherwise never be found.
 */
export function clausesAskForReruns(clauses: Constraint[][]): boolean {
	return clauses.some((clause) =>
		clause.some(
			(constraint) =>
				constraint.kind === "filter" &&
				!constraint.negated &&
				((constraint.filter.kind === "is" && constraint.filter.tag === "rerun") || constraint.filter.kind === "i"),
		),
	);
}

export function asksForReruns(branch: Branch): boolean {
	return clausesAskForReruns(branch.clauses);
}

/** Whether the branch can turn a row away at all. A clause with nothing in it holds of every row. */
export function constrains(branch: Branch): boolean {
	return branch.clauses.every((clause) => clause.length > 0);
}

/**
 * Whether anything in the query is about the reader rather than the archive — which a page cannot
 * answer until this browser's library has been read.
 */
export function asksAboutReader(text: string, root: QueryContext): boolean {
	return scanQuery(text, root).filters.some((match) => match.personal === true);
}
