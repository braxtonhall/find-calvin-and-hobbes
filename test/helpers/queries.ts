import fs from "fs";
import path from "path";
import { DESCRIBED, RECITED } from "../fixtures/golden";

export type QueryClass = "A" | "B" | "C" | "D" | "E";
export type QueryStatus = "validated" | "ambiguous";
export type Split = "train" | "test";

export interface LabelledQuery {
	id: string;
	query: string;
	// The strip the query should find. Null for class D, which has no valid target.
	date: string | null;
	class: QueryClass;
	corruption?: string;
	// Class E only: a plausible strip that must not outrank the target.
	decoy?: string;
	status: QueryStatus;
	reason?: string;
	// Derived by `loadGenerated`, never authored. See the note on `splitFor`.
	split: Split;
	source: string;
}

// The shape as it appears in the file: everything above except the fields the loader derives.
export type AuthoredQuery = Omit<LabelledQuery, "split">;

export const GENERATED_PATH = path.join("test", "fixtures", "generated", "queries.jsonl");

export const CLASS_NAMES: Record<QueryClass, string> = {
	A: "recited",
	B: "described",
	C: "hybrid",
	D: "hollow",
	E: "near-miss",
};

const TEST_SPLIT_SHARE = 0.2;

/**
 * Splits are assigned from the strip, never from the query, so that two paraphrases of the
 * same memory cannot land on opposite sides and leak the answer across the boundary.
 *
 * This is computed, never authored. The 2026-08-10 generation run wrote 18 rows across 6 strips
 * onto the wrong side of the boundary, and that was not carelessness: the prompt asked an agent to
 * reproduce an FNV-1a hash by hand, which nobody can do. A field that is a function of another
 * field belongs to the loader, so `loadGenerated` fills it in and `test/fixtures.test.ts` fails any
 * row that tries to carry its own.
 */
export function splitFor(key: string): Split {
	let hash = 2166136261;
	for (let index = 0; index < key.length; index++) {
		hash ^= key.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}
	return ((hash >>> 0) % 1000) / 1000 < TEST_SPLIT_SHARE ? "test" : "train";
}

export function parseQueryLine(line: string, lineNumber: number): AuthoredQuery {
	let row: AuthoredQuery;
	try {
		row = JSON.parse(line);
	} catch {
		throw new Error(`${GENERATED_PATH}:${lineNumber} is not valid JSON`);
	}
	return row;
}

export function loadGenerated(): LabelledQuery[] {
	const absolute = path.join(process.cwd(), GENERATED_PATH);
	if (!fs.existsSync(absolute)) return [];

	return (
		fs
			.readFileSync(absolute, "utf-8")
			.split("\n")
			.map((line, index) => ({ line: line.trim(), number: index + 1 }))
			.filter(({ line }) => line.length > 0)
			.map(({ line, number }) => parseQueryLine(line, number))
			// Hollow rows have no strip, so they fall back to their own id — stable, and the only
			// thing about them that is.
			.map((row) => ({ ...row, split: splitFor(row.date ?? row.id) }))
	);
}

// The hand-written set predates the tuning and is never folded into train, so that at least
// one measurement stays independent of everything the loop does.
export function loadGolden(): LabelledQuery[] {
	const build = (queries: typeof RECITED, queryClass: QueryClass): LabelledQuery[] =>
		queries.map((query, index) => ({
			id: `golden-${queryClass}${index}`,
			query: query.query,
			date: query.date,
			class: queryClass,
			corruption: query.note,
			status: "validated" as const,
			split: "train" as const,
			source: "hand",
		}));

	return [...build(RECITED, "A"), ...build(DESCRIBED, "B")];
}

export interface Selection {
	split?: Split;
	classes?: QueryClass[];
	status?: QueryStatus;
}

export function select(queries: LabelledQuery[], selection: Selection = {}): LabelledQuery[] {
	const { split, classes, status = "validated" } = selection;
	return queries.filter(
		(query) =>
			(status === undefined || query.status === status) &&
			(split === undefined || query.split === split) &&
			(classes === undefined || classes.includes(query.class)),
	);
}

export function countByClass(queries: LabelledQuery[]): Record<string, number> {
	const counts: Record<string, number> = {};
	for (const query of queries) counts[query.class] = (counts[query.class] || 0) + 1;
	return counts;
}

// mulberry32, the same generator the strip draw uses. Seeded rather than random because a sweep
// that sampled differently on every run would attribute its own sampling noise to the parameters.
function shuffled<T>(items: T[], seed: number): T[] {
	let state = seed;
	const next = () => {
		state = (state + 0x6d2b79f5) | 0;
		let drawn = Math.imul(state ^ (state >>> 15), 1 | state);
		drawn = (drawn + Math.imul(drawn ^ (drawn >>> 7), 61 | drawn)) ^ drawn;
		return ((drawn ^ (drawn >>> 14)) >>> 0) / 4294967296;
	};

	const copy = [...items];
	for (let index = copy.length - 1; index > 0; index--) {
		const other = Math.floor(next() * (index + 1));
		[copy[index], copy[other]] = [copy[other], copy[index]];
	}
	return copy;
}

/**
 * At most `size` queries, for sweeping against when the full split is too slow to evaluate a few
 * hundred times. Returns the input untouched when it is already small enough.
 *
 * Stratified by class rather than drawn flat, because the objective is not one number: the recited
 * intent is scored on A+C and the described intent on B+C, so a draw that happened to thin class B
 * would quietly reweight what the sweep is optimising and nothing in the log would show it.
 *
 * Sorted by id before the shuffle, so the sample depends on which queries exist rather than on the
 * order the fixture happens to list them in — appending a row to the file must not silently
 * resample everything that came before it.
 */
export function subsample(queries: LabelledQuery[], size: number, seed: number): LabelledQuery[] {
	if (queries.length <= size) return queries;

	const byClass = new Map<QueryClass, LabelledQuery[]>();
	for (const query of queries) {
		if (!byClass.has(query.class)) byClass.set(query.class, []);
		byClass.get(query.class)!.push(query);
	}

	const drawn: LabelledQuery[] = [];
	for (const queryClass of [...byClass.keys()].sort()) {
		const rows = byClass.get(queryClass)!;
		// At least one of any class that is present at all: a class the sample rounds away is a
		// class the sweep is blind to, which is the failure this whole document is about.
		const share = Math.max(1, Math.round((rows.length / queries.length) * size));
		const ordered = [...rows].sort((left, right) => left.id.localeCompare(right.id));
		drawn.push(...shuffled(ordered, seed).slice(0, share));
	}

	return drawn;
}
