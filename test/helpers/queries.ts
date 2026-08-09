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
	split: Split;
	source: string;
}

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
 */
export function splitFor(key: string): Split {
	let hash = 2166136261;
	for (let index = 0; index < key.length; index++) {
		hash ^= key.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}
	return ((hash >>> 0) % 1000) / 1000 < TEST_SPLIT_SHARE ? "test" : "train";
}

export function parseQueryLine(line: string, lineNumber: number): LabelledQuery {
	let row: LabelledQuery;
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

	return fs
		.readFileSync(absolute, "utf-8")
		.split("\n")
		.map((line, index) => ({ line: line.trim(), number: index + 1 }))
		.filter(({ line }) => line.length > 0)
		.map(({ line, number }) => parseQueryLine(line, number));
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
