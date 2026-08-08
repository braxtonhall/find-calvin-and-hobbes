import { search, Tuning } from "../../src/search";
import { GoldenQuery } from "../fixtures/golden";

export interface Evaluation {
	meanReciprocalRank: number;
	recallAtOne: number;
	recallAtTen: number;
	misses: { query: string; date: string; rank: number; found: string[] }[];
}

const NOT_FOUND = 0;

function rankOf(query: GoldenQuery, tuning?: Tuning): { rank: number; found: string[] } {
	const results = search(query.query, "rank", tuning);
	const position = results.findIndex((result) => result.comic.date === query.date);
	return {
		rank: position === -1 ? NOT_FOUND : position + 1,
		found: results.slice(0, 3).map((result) => result.comic.date),
	};
}

export function evaluate(queries: GoldenQuery[], tuning?: Tuning): Evaluation {
	let reciprocalSum = 0;
	let atOne = 0;
	let atTen = 0;
	const misses: Evaluation["misses"] = [];

	for (const query of queries) {
		const { rank, found } = rankOf(query, tuning);
		if (rank !== NOT_FOUND) {
			reciprocalSum += 1 / rank;
			if (rank === 1) atOne++;
			if (rank <= 10) atTen++;
		}
		if (rank !== 1) misses.push({ query: query.query, date: query.date, rank, found });
	}

	return {
		meanReciprocalRank: reciprocalSum / queries.length,
		recallAtOne: atOne / queries.length,
		recallAtTen: atTen / queries.length,
		misses,
	};
}

export function describeMisses(evaluation: Evaluation): string {
	return evaluation.misses
		.map(
			({ query, date, rank, found }) =>
				`  ${rank === 0 ? "absent" : `#${rank}`} ${date} "${query}" -> ${found.join(", ")}`,
		)
		.join("\n");
}
