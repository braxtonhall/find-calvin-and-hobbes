import test from "node:test";
import assert from "node:assert/strict";
import { search } from "../src/search";
import { DESCRIBED, RECITED } from "./fixtures/golden";
import { describeMisses, evaluate } from "./helpers/metrics";
import { install, loadRealArchive } from "./helpers/archive";

test("golden queries", async (suite) => {
	install(loadRealArchive());

	// Thresholds sit roughly one query below what the tuned weights achieve, so a real
	// regression fails while ordinary churn does not.
	await suite.test("recited dialogue ranks its strip first", () => {
		const evaluation = evaluate(RECITED);
		assert.ok(
			evaluation.recallAtOne >= 0.92,
			`recall@1 ${evaluation.recallAtOne.toFixed(3)} below 0.92\n${describeMisses(evaluation)}`,
		);
		assert.ok(evaluation.recallAtTen >= 0.96, `recall@10 ${evaluation.recallAtTen.toFixed(3)} below 0.96`);
		assert.ok(
			evaluation.meanReciprocalRank >= 0.94,
			`MRR ${evaluation.meanReciprocalRank.toFixed(3)} below 0.94\n${describeMisses(evaluation)}`,
		);
	});

	await suite.test("described scenes rank their strip first", () => {
		const evaluation = evaluate(DESCRIBED);
		assert.ok(
			evaluation.recallAtOne >= 0.91,
			`recall@1 ${evaluation.recallAtOne.toFixed(3)} below 0.91\n${describeMisses(evaluation)}`,
		);
		assert.ok(
			evaluation.recallAtTen >= 0.95,
			`recall@10 ${evaluation.recallAtTen.toFixed(3)} below 0.95\n${describeMisses(evaluation)}`,
		);
		assert.ok(
			evaluation.meanReciprocalRank >= 0.94,
			`MRR ${evaluation.meanReciprocalRank.toFixed(3)} below 0.94\n${describeMisses(evaluation)}`,
		);
	});
});

test("real archive behaviour", async (suite) => {
	install(loadRealArchive());

	await suite.test("a name that fills the descriptions returns only transcript matches", () => {
		const results = search("calvin", "rank");
		assert.ok(results.length > 0);
		assert.ok(
			results.every((result) => result.source === "transcript"),
			"calvin appears in 98% of descriptions and must not admit description-only hits",
		);
	});

	await suite.test("a rare keyword returns a short, description-led result set", () => {
		const results = search("transmogrifier", "rank");
		assert.ok(results.length <= 40, `expected a tight result set, got ${results.length}`);
		assert.ok(results.some((result) => result.source === "description"));
	});

	await suite.test("a rare term cannot be dropped in favour of a common one", () => {
		const archive = loadRealArchive();
		const mentions = new Set(
			archive.comics
				.filter((comic) => {
					const description = archive.descriptions.get(comic.id || comic.date) || "";
					return /transmogrif/i.test(`${comic.transcript} ${comic.alternate || ""} ${description}`);
				})
				.map((comic) => comic.date),
		);
		const strays = search("calvin transmogrifier", "rank").filter((result) => !mentions.has(result.comic.date));
		assert.deepEqual(
			strays.map((result) => result.comic.date),
			[],
			"every result must mention the rare term",
		);
	});

	await suite.test("a single query stays well under a frame budget", () => {
		search("warm up", "rank");
		const started = process.hrtime.bigint();
		search("calvin clean your room right now young man", "rank");
		const elapsed = Number(process.hrtime.bigint() - started) / 1e6;
		assert.ok(elapsed < 250, `query took ${elapsed.toFixed(1)}ms`);
	});
});
