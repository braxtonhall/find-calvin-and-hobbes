import { search, Tuning } from "../../src/search";
import { LabelledQuery, QueryClass } from "./queries";

export interface Evaluation {
	queries: number;
	meanReciprocalRank: number;
	recallAtOne: number;
	recallAtTen: number;
	zeroResultRate: number;
	meanResults: number;
	medianResults: number;
	misses: { query: string; date: string; rank: number; found: string[] }[];
}

// Class D has no target, so it is judged on how much noise it lets through instead.
export interface HollowEvaluation {
	queries: number;
	meanResults: number;
	worstResults: number;
	descriptionSourced: number;
}

// Class E asks whether the target beats a named decoy, which a rank alone cannot say.
export interface NearMissEvaluation {
	pairs: number;
	targetAboveDecoy: number;
	losses: { query: string; date: string; decoy: string }[];
}

const NOT_FOUND = 0;

// Anything with a query and a target strip: the golden fixture and the generated one both fit.
export interface Rankable {
	query: string;
	date: string | null;
}

function median(values: number[]): number {
	if (values.length === 0) return 0;
	const sorted = [...values].sort((a, b) => a - b);
	return sorted[Math.floor(sorted.length / 2)];
}

export function evaluate(queries: Rankable[], tuning?: Tuning): Evaluation {
	const rows = queries.filter((query): query is Rankable & { date: string } => query.date !== null);

	let reciprocalSum = 0;
	let atOne = 0;
	let atTen = 0;
	let empty = 0;
	const counts: number[] = [];
	const misses: Evaluation["misses"] = [];

	for (const row of rows) {
		const results = search(row.query, "rank", tuning);
		const position = results.findIndex((result) => result.comic.date === row.date);
		const rank = position === -1 ? NOT_FOUND : position + 1;

		counts.push(results.length);
		if (results.length === 0) empty++;
		if (rank !== NOT_FOUND) {
			reciprocalSum += 1 / rank;
			if (rank === 1) atOne++;
			if (rank <= 10) atTen++;
		}
		if (rank !== 1) {
			misses.push({
				query: row.query,
				date: row.date,
				rank,
				found: results.slice(0, 3).map((result) => result.comic.date),
			});
		}
	}

	const total = rows.length || 1;
	return {
		queries: rows.length,
		meanReciprocalRank: reciprocalSum / total,
		recallAtOne: atOne / total,
		recallAtTen: atTen / total,
		zeroResultRate: empty / total,
		meanResults: counts.reduce((sum, count) => sum + count, 0) / total,
		medianResults: median(counts),
		misses,
	};
}

export function evaluateHollow(queries: LabelledQuery[], tuning?: Tuning): HollowEvaluation {
	const rows = queries.filter((query) => query.class === "D");
	let totalResults = 0;
	let worstResults = 0;
	let descriptionSourced = 0;

	for (const row of rows) {
		const results = search(row.query, "rank", tuning);
		totalResults += results.length;
		worstResults = Math.max(worstResults, results.length);
		descriptionSourced += results.filter((result) => result.source === "description").length;
	}

	return {
		queries: rows.length,
		meanResults: rows.length ? totalResults / rows.length : 0,
		worstResults,
		descriptionSourced,
	};
}

export function evaluateNearMiss(queries: LabelledQuery[], tuning?: Tuning): NearMissEvaluation {
	const rows = queries.filter((query) => query.class === "E" && query.date && query.decoy);
	const losses: NearMissEvaluation["losses"] = [];

	for (const row of rows) {
		const results = search(row.query, "rank", tuning);
		const target = results.findIndex((result) => result.comic.date === row.date);
		const decoy = results.findIndex((result) => result.comic.date === row.decoy);
		const targetWins = target !== -1 && (decoy === -1 || target < decoy);
		if (!targetWins) losses.push({ query: row.query, date: row.date!, decoy: row.decoy! });
	}

	return { pairs: rows.length, targetAboveDecoy: rows.length - losses.length, losses };
}

export function evaluateByClass(queries: LabelledQuery[], tuning?: Tuning): Map<QueryClass, Evaluation> {
	const byClass = new Map<QueryClass, LabelledQuery[]>();
	for (const query of queries) {
		if (!byClass.has(query.class)) byClass.set(query.class, []);
		byClass.get(query.class)!.push(query);
	}

	const evaluations = new Map<QueryClass, Evaluation>();
	for (const [queryClass, rows] of byClass) {
		if (queryClass === "D") continue;
		evaluations.set(queryClass, evaluate(rows, tuning));
	}
	return evaluations;
}

export function describeMisses(evaluation: Evaluation): string {
	return evaluation.misses
		.map(
			({ query, date, rank, found }) =>
				`  ${rank === 0 ? "absent" : `#${rank}`} ${date} "${query}" -> ${found.join(", ")}`,
		)
		.join("\n");
}

export function summarise(label: string, evaluation: Evaluation): string {
	return (
		`${label.padEnd(22)} n ${String(evaluation.queries).padStart(4)}  ` +
		`recall@1 ${evaluation.recallAtOne.toFixed(3)}  recall@10 ${evaluation.recallAtTen.toFixed(3)}  ` +
		`MRR ${evaluation.meanReciprocalRank.toFixed(3)}  zero ${evaluation.zeroResultRate.toFixed(3)}  ` +
		`results ~${evaluation.medianResults}`
	);
}
