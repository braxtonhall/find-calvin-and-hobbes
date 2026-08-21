import test from "node:test";
import assert from "node:assert/strict";
import { assignTiers, ScoredResult, TierMode } from "../src/tiers";

function results(...scores: number[]): ScoredResult[] {
	return scores.map((score, index) => ({ comic: { date: `2000-01-${String(index + 1).padStart(2, "0")}` }, score }));
}

function tiersOf(scores: number[], mode: TierMode): number[] {
	const assigned = assignTiers(results(...scores), mode);
	return results(...scores).map((result) => assigned.get(result.comic.date)!);
}

test("steps places each 15% band below the top score in its own tier", () => {
	// Ratios: 1, 0.85, 0.84, 0.7, 0.69, 0.55, 0.54, 0.4, 0.39.
	const scores = [1, 0.85, 0.84, 0.7, 0.69, 0.55, 0.54, 0.4, 0.39];
	assert.deepEqual(tiersOf(scores, "steps"), [5, 5, 4, 4, 3, 3, 2, 2, 1]);
});

test("fifths places each 20% band below the top score in its own tier", () => {
	const scores = [1, 0.8, 0.79, 0.6, 0.59, 0.4, 0.39, 0.2, 0.19];
	assert.deepEqual(tiersOf(scores, "fifths"), [5, 5, 4, 4, 3, 3, 2, 2, 1]);
});

test("a tight spread leaves the faint tiers unused", () => {
	// The `transmogrifier` shape: 17 matches whose weakest still scores 51% of the top.
	const tiers = tiersOf([1.356, 1.2, 1.05, 0.9, 0.75, 0.688], "steps");
	assert.deepEqual(tiers, [5, 5, 4, 3, 3, 2]);
	assert.ok(!tiers.includes(1), "nothing should reach the faintest tier");
});

test("tiers ignore the order the results arrive in", () => {
	// Date-sorted searches are not score-sorted, so the top score can be anywhere in the list.
	const ascending = tiersOf([0.39, 0.7, 1], "steps");
	assert.deepEqual(ascending, [1, 4, 5]);
});

test("stretch spans the full ramp between the best and worst result", () => {
	const tiers = tiersOf([1, 0.9, 0.8, 0.7, 0.6], "stretch");
	assert.equal(tiers[0], 5);
	assert.equal(tiers[tiers.length - 1], 1);
});

test("stretch pulls near-ties to opposite ends of the ramp", () => {
	assert.deepEqual(tiersOf([0.726, 0.674], "stretch"), [5, 1]);
	assert.deepEqual(tiersOf([0.726, 0.674], "steps"), [5, 5]);
});

test("quantile splits by rank into equal groups and holds ties together", () => {
	assert.deepEqual(tiersOf([10, 9, 8, 7, 6, 5, 4, 3, 2, 1], "quantile"), [5, 5, 4, 4, 3, 3, 2, 2, 1, 1]);
	// Ties share a tier and occupy the ranks they span, so a block at the top pushes the rest down.
	assert.deepEqual(tiersOf([10, 10, 10, 7, 6], "quantile"), [5, 5, 5, 2, 1]);
});

for (const mode of ["steps", "fifths", "stretch", "quantile"] as TierMode[]) {
	test(`${mode} treats a lone result as the best match`, () => {
		assert.deepEqual(tiersOf([0.02], mode), [5]);
	});

	test(`${mode} treats an exhausted spread as all-best rather than dividing by zero`, () => {
		assert.deepEqual(tiersOf([0.5, 0.5, 0.5], mode), [5, 5, 5]);
		assert.deepEqual(tiersOf([0, 0], mode), [5, 5]);
	});

	test(`${mode} returns nothing for an empty result list`, () => {
		assert.equal(assignTiers([], mode).size, 0);
	});
}

test("a date carrying two strips takes the better of their tiers", () => {
	const shared: ScoredResult[] = [
		{ comic: { date: "2000-01-01" }, score: 1 },
		{ comic: { date: "2000-01-01" }, score: 0.2 },
		{ comic: { date: "2000-01-02" }, score: 0.2 },
	];
	const assigned = assignTiers(shared, "steps");
	assert.equal(assigned.size, 2);
	assert.equal(assigned.get("2000-01-01"), 5);
	assert.equal(assigned.get("2000-01-02"), 1);
});
