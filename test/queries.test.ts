import test from "node:test";
import assert from "node:assert/strict";
import { LabelledQuery, QueryClass, subsample } from "./helpers/queries";

function rows(counts: Partial<Record<QueryClass, number>>): LabelledQuery[] {
	return Object.entries(counts).flatMap(([queryClass, count]) =>
		Array.from({ length: count as number }, (_, index) => ({
			id: `${queryClass}-${String(index).padStart(3, "0")}`,
			query: `query ${queryClass} ${index}`,
			date: "1990-01-01",
			class: queryClass as QueryClass,
			status: "validated" as const,
			split: "train" as const,
			source: "test",
		})),
	);
}

// The sweep decides on the subsample and only re-tests the moves it accepts, so a sampler that
// drifted between runs, or that quietly dropped a class, would move parameters for reasons no
// log would show.
test("the sweep subsample is stable, stratified, and a subset", async (suite) => {
	const set = rows({ A: 200, B: 150, C: 120, D: 20, E: 10 });

	await suite.test("a set already within budget is returned untouched", () => {
		const small = rows({ A: 10, B: 5 });
		assert.deepEqual(subsample(small, 250, 1), small);
		assert.deepEqual(subsample(set, 500, 1), set);
	});

	await suite.test("the same seed and set draw the same queries", () => {
		const ids = (rows: LabelledQuery[]) => rows.map((row) => row.id);
		assert.deepEqual(ids(subsample(set, 250, 7)), ids(subsample(set, 250, 7)));
		assert.notDeepEqual(ids(subsample(set, 250, 7)), ids(subsample(set, 250, 8)));
	});

	await suite.test("every drawn query comes from the set, and none twice", () => {
		const drawn = subsample(set, 250, 7);
		const available = new Set(set.map((row) => row.id));
		assert.ok(drawn.every((row) => available.has(row.id)));
		assert.equal(new Set(drawn.map((row) => row.id)).size, drawn.length);
	});

	await suite.test("class proportions survive the draw", () => {
		const drawn = subsample(set, 250, 7);
		// 250 of 500 is half of each class, and the total lands on the budget rather than near it.
		assert.equal(drawn.length, 250);
		for (const [queryClass, expected] of [
			["A", 100],
			["B", 75],
			["C", 60],
			["D", 10],
			["E", 5],
		] as const) {
			assert.equal(drawn.filter((row) => row.class === queryClass).length, expected, queryClass);
		}
	});

	await suite.test("a class too small to round to one is still represented", () => {
		// 3 of 903 rounds to 0.8 of a query. A class the sample rounds away is a class the sweep
		// cannot see at all, which is worse than a sample that misses its budget by two.
		const lopsided = rows({ A: 900, E: 3 });
		const drawn = subsample(lopsided, 250, 7);
		assert.equal(drawn.filter((row) => row.class === "E").length, 1);
	});

	await suite.test("appending a query does not resample the ones already there", () => {
		// The draw is ordered by id, not by position in the file, so yesterday's rows are drawn
		// from the same order today. Only the arrival of new rows moves the sample.
		const before = subsample(rows({ A: 400 }), 100, 7).map((row) => row.id);
		const after = subsample([...rows({ A: 400 })].reverse(), 100, 7).map((row) => row.id);
		assert.deepEqual(after, before);
	});
});
