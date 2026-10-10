import { Constraint, Crossing, compileQuery } from "./boolean-query";
import { CollectionType, crossingSpec } from "./filter-spec";
import { Filter, Run, collectionQuery, compares, passesFilter } from "./filter-query";
import { matchesExpression } from "./date-query";
import type { Compounds } from "./search";
import { stripContains, textContains } from "./search";
import { state } from "./state";
import { Collection, Comic } from "./types";

/**
 * Judging a query that is not ranked: the collection language, and both sides of every crossing
 * operator.
 *
 * A collection is a set of strips — a book's, an arc's, a creator's or a character's — with a few
 * words of its own and a few facts about itself. Every kind is judged by the same filters (see
 * `COLLECTION_TAGS`): one that cannot be true of a kind is false of it. Its text is its own words
 * and every word of its strips, so the words of a query may be found in different strips of it.
 *
 * Crossing from a strip to its collections, or from a collection to its strips, judges the query
 * inside against each one on the other side. Each answer is kept for the length of one search, so a
 * book's answer is worked out once however many of its strips ask — unless the query inside asks
 * `@here:` about the particular strip and collection, which has to be asked of each pair.
 */

/** A collection, as the collection language sees one. */
export interface Group {
	type: CollectionType;
	id: string;
	/** Its own words: a book's name and subtitle, an arc's description, a person's name. */
	words: string;
	/** Its strips, as the archive holds them, in its order. Never a day a strip ran again. */
	strips: Comic[];
	/** The book, for a book's facts. */
	book?: Collection;
}

/** One row a strip query judges: a strip, as it ran on one day. */
export interface StripRow {
	comic: Comic;
	run?: Run;
}

/** A strip in a collection, for `@here:` to describe. */
interface Link {
	comic: Comic;
	group: Group;
}

interface Groups {
	list: Group[];
	byId: Map<string, Group>;
}

/** What each kind's groups were built from, so they are built again only when it changes. */
let builtFrom: unknown[] = [];
let built = new Map<CollectionType, Groups>();

function sources(): unknown[] {
	return [state.comics, state.collectionIndex, state.arcs, state.creatorsById, state.charactersById];
}

/** The ids of the collections of one kind a strip belongs to. A rerun day's row belongs where its strip does. */
export function groupIdsOf(comic: Comic, type: CollectionType): string[] {
	switch (type) {
		case "book":
			return [...new Set((comic.appearances ?? []).map((appearance) => appearance.collection))];
		case "arc":
			return comic.arcs ?? [];
		case "creator":
			return (comic.creators ?? []).map((credit) => credit.id);
		case "character":
			return comic.characters ?? [];
	}
}

/** Every collection of one kind, in the order its page lists them, each with its strips. */
export function groups(type: CollectionType): Groups {
	const now = sources();
	if (now.some((source, index) => source !== builtFrom[index])) {
		builtFrom = now;
		built = new Map();
	}
	const known = built.get(type);
	if (known) return known;

	const list: Group[] = [];
	if (type === "book") {
		for (const book of state.collectionIndex?.collections ?? []) {
			const words = book.subtitle ? `${book.name} ${book.subtitle}` : book.name;
			list.push({ type, id: book.id, words, strips: [], book });
		}
	} else if (type === "arc") {
		for (const arc of state.arcs ?? []) list.push({ type, id: arc.id, words: arc.description, strips: [] });
	} else if (type === "creator") {
		for (const creator of state.creatorsById.values()) {
			list.push({ type, id: creator.id, words: creator.name, strips: [] });
		}
	} else {
		for (const character of state.charactersById.values()) {
			list.push({ type, id: character.id, words: character.name, strips: [] });
		}
	}

	const byId = new Map(list.map((group) => [group.id, group]));
	for (const comic of state.comics) {
		for (const id of groupIdsOf(comic, type)) byId.get(id)?.strips.push(comic);
	}
	const result = { list, byId };
	built.set(type, result);
	return result;
}

/** What each role tag takes a credit's role to say. */
const ROLES: Record<string, RegExp> = {
	writer: /^(story|stories|writer|writing|written|script|words)$/i,
	artist: /^(art|artist|drawing|drawn|pencils|inks|illustration)$/i,
};

/**
 * Whether a creator's credits say they did this, on any strip. A credit that says nothing of what
 * they did says they did all of it: a creator alone on a strip both wrote and drew it.
 */
function didRole(group: Group, tag: string): boolean {
	return group.strips.some((comic) =>
		(comic.creators ?? []).some(
			(credit) => credit.id === group.id && (credit.role === undefined || ROLES[tag].test(credit.role)),
		),
	);
}

/** A collection's own tag. One that cannot be true of its kind is false, not a mistake. */
function hasCollectionTag(group: Group, tag: string): boolean {
	switch (tag) {
		case "book":
		case "arc":
		case "creator":
		case "character":
			return group.type === tag;
		case "colour":
			return group.book?.colour === true;
		case "writer":
		case "artist":
			return group.type === "creator" && didRole(group, tag);
		default:
			return false;
	}
}

/** The reader's own relationship to a collection: `@i:`. Only a book can be owned or noted. */
function isMine(group: Group, tag: string): boolean {
	if (group.type !== "book") return false;
	if (tag === "own") return state.ownedBooks.has(group.id);
	if (tag === "noted") return state.notedBooks.has(group.id);
	return false;
}

/** How this strip appears in this collection: `@here:`. A tag that cannot be true of the link's kind is false. */
function hereHolds(link: Link | null, tag: string): boolean {
	if (link === null) return false;
	if (tag === "altered") {
		return (
			link.group.type === "book" &&
			(link.comic.appearances ?? []).some(
				(appearance) => appearance.collection === link.group.id && appearance.altered === true,
			)
		);
	}
	return false;
}

function passesCollectionFilter(group: Group, filter: Filter, link: Link | null): boolean {
	switch (filter.kind) {
		case "here":
			return hereHolds(link, filter.tag);
		case "id":
			return group.id === filter.id;
		case "tag":
			return hasCollectionTag(group, filter.tag);
		case "i":
			return isMine(group, filter.tag);
		case "strips":
			return compares(filter.comparison, group.strips.length);
		// A book by the year it came out; an arc by any year one of its strips ran.
		case "published":
			if (group.book !== undefined) return matchesExpression(filter.expression, String(group.book.pub_year));
			return group.type === "arc" && group.strips.some((comic) => matchesExpression(filter.expression, comic.date));
		default:
			// A strip's filter, which the parser never lets stand here.
			return false;
	}
}

/**
 * Answers queries for one search. Made fresh for each, since what it remembers includes what the
 * reader owns, which can change between two.
 */
export class Evaluator {
	/** Each crossing's answer for each collection or strip it was asked of, where it does not depend on the link. */
	private readonly answers = new Map<Crossing, Map<object, boolean>>();
	/** The strips that say each text. */
	private readonly saying = new Map<string, Set<Comic>>();
	/** Each strip's rerun days, as rows, made once so that their answers can be kept. */
	private rerunRows: Map<string, Comic[]> | null = null;
	private originals: Set<string> | null = null;

	constructor(private readonly compounds: Compounds) {}

	/** Whether a strip's row passes the clauses, standing in `link` where it is inside a crossing. */
	stripHolds(clauses: Constraint[][], row: StripRow, link: Link | null = null): boolean {
		return clauses.some((clause) =>
			clause.every((constraint) => {
				let holds: boolean;
				if (constraint.kind === "text") holds = stripContains(row.comic, constraint.text, this.compounds);
				else if (constraint.kind === "cross") holds = this.crossFromStrip(constraint.crossing, row);
				else if (constraint.filter.kind === "here") holds = hereHolds(link, constraint.filter.tag);
				else holds = passesFilter(row.comic, constraint.filter, row.run);
				return holds !== constraint.negated;
			}),
		);
	}

	/** Whether a collection passes the clauses, standing in `link` where it is inside a crossing. */
	groupHolds(clauses: Constraint[][], group: Group, link: Link | null = null): boolean {
		return clauses.some((clause) =>
			clause.every((constraint) => {
				let holds: boolean;
				if (constraint.kind === "text") holds = this.groupContains(group, constraint.text);
				else if (constraint.kind === "cross") holds = this.crossFromGroup(constraint.crossing, group);
				else holds = passesCollectionFilter(group, constraint.filter, link);
				return holds !== constraint.negated;
			}),
		);
	}

	/** `@in (…)`, `@by (…)`, `@featuring (…)` or `@during (…)`, asked of one strip. */
	crossFromStrip(crossing: Crossing, row: StripRow): boolean {
		const type = crossingSpec(crossing.operator)?.type;
		if (type === undefined) return false;
		const { byId } = groups(type);
		const related = groupIdsOf(row.comic, type)
			.map((id) => byId.get(id))
			.filter((group): group is Group => group !== undefined);
		const test = (group: Group) =>
			this.remembered(crossing, group, () => this.groupHolds(crossing.clauses, group, { comic: row.comic, group }));
		return crossing.only ? related.length > 0 && related.every(test) : related.some(test);
	}

	/** `@has (…)`, asked of one collection. */
	crossFromGroup(crossing: Crossing, group: Group): boolean {
		const rows = this.rowsOf(group, crossing.reruns);
		const test = (row: StripRow) =>
			this.remembered(crossing, row.comic, () => this.stripHolds(crossing.clauses, row, { comic: row.comic, group }));
		return crossing.only ? rows.length > 0 && rows.every(test) : rows.some(test);
	}

	/** The strips a `@has` looks through: the collection's own, and the days they ran again where asked. */
	rowsOf(group: Group, reruns: boolean): StripRow[] {
		const originals = this.rerunOriginals();
		const rows: StripRow[] = group.strips.map((comic) => ({
			comic,
			...(!comic.id && originals.has(comic.date) ? { run: "reused" as const } : {}),
		}));
		if (!reruns) return rows;
		for (const comic of group.strips) {
			if (comic.id) continue;
			for (const rerun of this.rerunsOf(comic)) rows.push({ comic: rerun, run: "rerun" });
		}
		return rows;
	}

	/** The strips anywhere in the archive that say the text. */
	stripsSaying(text: string): Set<Comic> {
		let found = this.saying.get(text);
		if (found === undefined) {
			found = new Set(state.comics.filter((comic) => stripContains(comic, text, this.compounds)));
			this.saying.set(text, found);
		}
		return found;
	}

	/** Whether the collection says the text: in its own words, or in any of its strips. */
	groupContains(group: Group, text: string): boolean {
		if (textContains(group.words, text, this.compounds)) return true;
		const saying = this.stripsSaying(text);
		return group.strips.some((comic) => saying.has(comic));
	}

	private remembered(crossing: Crossing, subject: object, answer: () => boolean): boolean {
		if (crossing.linked) return answer();
		let answers = this.answers.get(crossing);
		if (answers === undefined) {
			answers = new Map();
			this.answers.set(crossing, answers);
		}
		const known = answers.get(subject);
		if (known !== undefined) return known;
		const holds = answer();
		answers.set(subject, holds);
		return holds;
	}

	private rerunOriginals(): Set<string> {
		this.originals ??= new Set(state.reruns.values());
		return this.originals;
	}

	/** The rows of the days a strip ran again, under those days. */
	private rerunsOf(comic: Comic): Comic[] {
		if (this.rerunRows === null) {
			this.rerunRows = new Map();
			for (const [rerunDate, originalDate] of state.reruns) {
				const original = state.comicsByDate.get(originalDate)?.find((candidate) => !candidate.id);
				if (!original) continue;
				const rows = this.rerunRows.get(originalDate) ?? [];
				rows.push({ ...original, date: rerunDate, id: undefined });
				this.rerunRows.set(originalDate, rows);
			}
		}
		return this.rerunRows.get(comic.date) ?? [];
	}
}

/** What a Collections tab lists for a query, and what the grid lights while it does. */
export interface CollectionResults {
	/** The collections that match, by id. The page lists them in its own order. */
	ids: Set<string>;
	/**
	 * The days of the strips that are why each one is listed: those that say its words, and those a
	 * `@has` found. A collection listed for its own words alone, or for no strip in particular — how
	 * many it has, whether it is owned — lights all of its strips.
	 */
	dates: Set<string>;
}

/**
 * The collections of one kind a query on its tab finds, or null where the query has nothing in it,
 * which lists every one.
 */
export function searchCollections(query: string, type: CollectionType, compounds: Compounds): CollectionResults | null {
	const trimmed = query.trim().toLowerCase();
	if (!trimmed) return null;
	const clauses = compileQuery(trimmed, collectionQuery(type));
	if (clauses === null) return null;

	const evaluator = new Evaluator(compounds);
	const ids = new Set<string>();
	const dates = new Set<string>();
	for (const group of groups(type).list) {
		const passing = clauses.filter((clause) => evaluator.groupHolds([clause], group));
		if (passing.length === 0) continue;
		ids.add(group.id);

		// The strips each passing clause asked for, for its words or by a `@has`.
		const lit = new Set<Comic>();
		let asked = false;
		for (const clause of passing) {
			for (const constraint of clause) {
				if (constraint.negated) continue;
				if (constraint.kind === "text") {
					asked = true;
					const saying = evaluator.stripsSaying(constraint.text);
					for (const comic of group.strips) if (saying.has(comic)) lit.add(comic);
				} else if (constraint.kind === "cross") {
					asked = true;
					for (const row of evaluator.rowsOf(group, constraint.crossing.reruns)) {
						if (evaluator.stripHolds(constraint.crossing.clauses, row, { comic: row.comic, group })) lit.add(row.comic);
					}
				}
			}
		}
		for (const comic of asked && lit.size > 0 ? lit : group.strips) dates.add(comic.date);
	}
	return { ids, dates };
}
