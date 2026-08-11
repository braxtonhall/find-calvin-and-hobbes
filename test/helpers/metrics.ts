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
/**
 * A near-miss pair has four possible outcomes and only one of them is about ranking. Reporting them
 * as one number said `11/15 beat their decoy` on 2026-08-10, which the 2026-08-10 review then wrote
 * up as four pairs ranking the decoy above the target. Not one of them did: all four were queries
 * whose target returned nothing, and nine of the eleven "wins" were pairs whose decoy the engine
 * never admitted, so there was nothing to outrank. Two pairs of fifteen were testing a ranking.
 *
 * `contested` is the only count that measures the ranker. The other three measure the fixture.
 */
export interface NearMissEvaluation {
	pairs: number;
	targetAboveDecoy: number;
	// Both strips admitted, so the comparison happened: targetAboveDecoy + decoyWins.
	contested: number;
	// Both admitted and the decoy came out on top. The only real ranking failure of the four.
	decoyWins: { query: string; date: string; decoy: string; targetRank: number; decoyRank: number }[];
	// The target was not in the results at all. A zero-result failure wearing a ranking failure's
	// clothes — the query never got as far as being ranked against anything.
	targetAbsent: { query: string; date: string; decoy: string }[];
	// The decoy was not admitted, so the pair is a walkover and tests nothing. Cheap to write and
	// worth nothing, which is why it needs its own number rather than counting as a win.
	decoyUncontested: { query: string; date: string; decoy: string }[];
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
	const decoyWins: NearMissEvaluation["decoyWins"] = [];
	const targetAbsent: NearMissEvaluation["targetAbsent"] = [];
	const decoyUncontested: NearMissEvaluation["decoyUncontested"] = [];
	let targetAboveDecoy = 0;

	for (const row of rows) {
		const results = search(row.query, "rank", tuning);
		const target = results.findIndex((result) => result.comic.date === row.date);
		const decoy = results.findIndex((result) => result.comic.date === row.decoy);
		const where = { query: row.query, date: row.date!, decoy: row.decoy! };

		if (target === -1) {
			targetAbsent.push(where);
		} else if (decoy === -1) {
			decoyUncontested.push(where);
		} else if (target < decoy) {
			targetAboveDecoy++;
		} else {
			decoyWins.push({ ...where, targetRank: target + 1, decoyRank: decoy + 1 });
		}
	}

	return {
		pairs: rows.length,
		targetAboveDecoy,
		contested: targetAboveDecoy + decoyWins.length,
		decoyWins,
		targetAbsent,
		decoyUncontested,
		// Kept so the tuning log stays comparable across runs: everything that is not a clean win,
		// which is what the single number used to mean.
		losses: [...decoyWins.map(({ query, date, decoy }) => ({ query, date, decoy })), ...targetAbsent],
	};
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
