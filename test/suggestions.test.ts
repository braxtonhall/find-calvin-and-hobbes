import test from "node:test";
import assert from "node:assert/strict";
import { SUGGESTED_QUERIES, randomQuery } from "../src/suggestions";
import { parseDateFilters } from "../src/date-query";

test("the suggestion pool", async (suite) => {
	await suite.test("holds no duplicates and nothing that needs trimming", () => {
		assert.equal(new Set(SUGGESTED_QUERIES).size, SUGGESTED_QUERIES.length);
		for (const query of SUGGESTED_QUERIES) assert.equal(query, query.trim());
		for (const query of SUGGESTED_QUERIES) assert.notEqual(query, "");
	});

	// The guard that matters: a filter typo in the pool is a die that lands on an empty page, and
	// `impossible` is exactly how the parser reports a filter nothing can satisfy.
	await suite.test("asks for nothing the parser cannot satisfy", () => {
		for (const query of SUGGESTED_QUERIES) {
			const { filters } = parseDateFilters(query);
			assert.notEqual(filters?.impossible, true, query);
		}
	});

	// Half the point of the pool is that the app is seen using the filter language, so this is a
	// guard against the teaching half being quietly emptied out.
	await suite.test("keeps showing the filter syntax off", () => {
		const filtered = SUGGESTED_QUERIES.filter((query) => query.includes("@"));
		assert.ok(filtered.length >= 5, `only ${filtered.length} of the suggestions use a filter`);
		assert.ok(filtered.length < SUGGESTED_QUERIES.length, "every suggestion is a filter");
	});
});

test("drawing a suggestion", async (suite) => {
	await suite.test("walks the whole pool before repeating anything", () => {
		const drawn = SUGGESTED_QUERIES.map(() => randomQuery());
		assert.equal(new Set(drawn).size, SUGGESTED_QUERIES.length);
		assert.deepEqual([...drawn].sort(), [...SUGGESTED_QUERIES].sort());
	});

	await suite.test("refills, so it keeps going past the end of the pool", () => {
		const drawn = SUGGESTED_QUERIES.concat(SUGGESTED_QUERIES).map(() => randomQuery());
		for (const query of SUGGESTED_QUERIES) {
			assert.equal(drawn.filter((each) => each === query).length, 2, query);
		}
	});

	await suite.test("shuffles, rather than handing them out in order", () => {
		// Twenty draws in declared order is a one-in-20! coincidence; a hundred is not a flake.
		const orders = Array.from({ length: 5 }, () => SUGGESTED_QUERIES.map(() => randomQuery()).join("|"));
		assert.ok(new Set(orders).size > 1, "five passes over the pool came out in the same order");
	});
});
