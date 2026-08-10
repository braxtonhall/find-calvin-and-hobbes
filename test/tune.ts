import fs from "fs";
import path from "path";
import { search, TUNING, Tuning } from "../src/search";
import {
	describeMisses,
	evaluate,
	evaluateByClass,
	evaluateHollow,
	evaluateNearMiss,
	summarise,
} from "./helpers/metrics";
import { install, loadRealArchive } from "./helpers/archive";
import { CLASS_NAMES, countByClass, LabelledQuery, loadGenerated, loadGolden, select } from "./helpers/queries";

const CANDIDATES: Record<string, number[]> = {
	sequenceWeight: [0, 0.5, 1, 2, 3],
	runWeight: [0, 1, 2, 4, 8],
	transcriptRepeatWeight: [0, 0.25, 0.5, 1],
	descriptionRepeatWeight: [0, 0.1, 0.25, 0.5, 1],
	// Inert while both repeat weights leave it nothing to count differently, and inert on the
	// current fixture regardless — it is here so that queries written to separate emphasis from
	// variety have a knob to move. Judged on both intents because one value serves both corpora.
	repeatVariety: [0, 0.25, 0.5, 0.75, 1],
	rarityExponent: [1, 1.25, 1.5, 2],
	// Both floors ran with 0.3 as the bottom of the grid while sitting at or near it, so the
	// sweep could not try the only direction that helped and reported eleven `keep` lines that
	// read as convergence. At 0.1 the description floor takes class C's zero-result rate from
	// 25% to 3% and the held-out rate to nothing, with both guard rails still holding.
	// 0 is deliberately absent from both: it reduces required coverage to a single term, which
	// turns every query into an OR and is caught by the hollow-bloat guard rather than the
	// objective. Leaving it out keeps the grid inside the range where the guard has margin.
	transcriptCoverageFloor: [0.02, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5, 0.6, 0.7],
	descriptionCoverageFloor: [0.02, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5, 0.6, 0.7],
	// 1 is the 1/m decay the engine has always used, so it is the top of each grid: values above
	// it loosen a long query further, which is the direction that produced 471 results for five
	// words in the first place.
	transcriptLengthForgiveness: [0.25, 0.4, 0.55, 0.7, 0.85, 1],
	descriptionLengthForgiveness: [0.25, 0.4, 0.55, 0.7, 0.85, 1],
	// 0 admits everything the engine admitted before this existed. Above 0.5 the fixture's own
	// targets start failing it — a fifth of them match half the query or less — so the grid
	// stops where the measurement says the cost turns.
	transcriptLiteralShare: [0, 0.2, 0.3, 0.4, 0.5],
	descriptionLiteralShare: [0, 0.2, 0.3, 0.4, 0.5],
	descriptionMinMass: [0, 1, 1.5, 2.5, 4],
	descriptionIdfFloor: [0.25, 0.5, 1, 1.5, 2],
	// 0 is a real value here rather than an omission: it suppresses the inflection lookup, so
	// the bottom of each grid is the engine as it was before the stemmer existed.
	transcriptInflectionWeight: [0, 0.5, 0.7, 0.85, 1],
	descriptionInflectionWeight: [0, 0.5, 0.7, 0.85, 1],
	descriptionPreference: [0.4, 0.55, 0.7, 0.85, 1],
	agreementBonus: [0, 0.15, 0.3, 0.6],
};

// transcriptIdfFloor is deliberately absent. It governs candidate seeding and highlighting
// rather than ranking, so it is inert in MRR by construction and no query class will move it.
// Its behaviour is pinned by an assertion in search.test.ts instead.

// Each parameter is judged only against the intent it governs. Judging a transcript parameter
// on the combined score lets the sweep "improve" it by weakening transcripts until description
// matches win, which looks like a gain and is really a miscalibrated corpus preference.
const OBJECTIVE: Record<string, "recited" | "described" | "combined"> = {
	sequenceWeight: "recited",
	runWeight: "recited",
	transcriptRepeatWeight: "recited",
	transcriptCoverageFloor: "recited",
	transcriptInflectionWeight: "recited",
	transcriptLengthForgiveness: "recited",
	descriptionLengthForgiveness: "described",
	transcriptLiteralShare: "recited",
	descriptionLiteralShare: "described",
	descriptionRepeatWeight: "described",
	descriptionInflectionWeight: "described",
	descriptionCoverageFloor: "described",
	descriptionMinMass: "described",
	descriptionIdfFloor: "described",
	rarityExponent: "combined",
	repeatVariety: "combined",
	descriptionPreference: "combined",
	agreementBonus: "combined",
};

const KNOBS = Object.keys(CANDIDATES) as (keyof Tuning)[];
const MINIMUM_GAIN = 0.005;
const LOG_PATH = path.join("test", "fixtures", "tuning-log.jsonl");

// Ranking metrics cannot see this, so it has to be a constraint rather than part of the
// objective. A saturated query set will happily trade the property away for a rounding error.
const MONOTONICITY_PROBES = [
	["rosalyn help", "calvin rosalyn help"],
	["transmogrifier", "calvin transmogrifier"],
	["snow goons", "calvin snow goons"],
	["clean your room", "calvin clean your room"],
	["rosalyn susie", "calvin rosalyn susie"],
	["good night", "calvin good night"],
];

// The same blind spot from the other direction. Every query in both fixtures is a phrase, so
// a candidate can zero single-keyword description search without moving any MRR in the sweep:
// descriptionMinMass at 4 takes `snow` from 129 description results to none while train,
// held-out and golden all stay identical to four decimals. Measured, not hypothetical.
const DESCRIPTION_PROBES = ["snow", "snowman", "wagon", "rosalyn", "bicycle", "doctor"];

// Half of baseline, so ordinary tightening is allowed and a collapse is not.
const COLLAPSE_SHARE = 0.5;

function descriptionResults(probe: string, tuning: Tuning): number {
	return search(probe, "rank", tuning).filter((result) => result.source === "description").length;
}

function violations(tuning: Tuning): string[] {
	return MONOTONICITY_PROBES.filter(([shorter, longer]) => {
		return search(longer, "rank", tuning).length > search(shorter, "rank", tuning).length;
	}).map(([shorter, longer]) => `"${longer}" widens "${shorter}"`);
}

// Filled once the archive is installed, since every probe is a real search.
let baselineDescriptionResults = new Map<string, number>();

function collapses(tuning: Tuning): string[] {
	return DESCRIPTION_PROBES.flatMap((probe) => {
		const before = baselineDescriptionResults.get(probe)!;
		const after = descriptionResults(probe, tuning);
		return after < Math.ceil(before * COLLAPSE_SHARE)
			? [`"${probe}" ${before} -> ${after} description-sourced results`]
			: [];
	});
}

// The collapse guard stops the description corpus disappearing; this stops it flooding. Class D
// is scored on result count rather than rank, so it never enters the objective and a candidate
// that doubles every result set costs the sweep nothing — descriptionCoverageFloor at 0 reduces
// required coverage to a single term, which scores best on every ranking metric in this file
// while taking hollow queries from 145 results to 239. Ranking metrics cannot see a result set
// that is merely useless, so this has to be a constraint too.
const BLOAT_SHARE = 1.5;

let baselineHollowResults = 0;

function hollowResults(tuning: Tuning): number {
	const rows = select(generated, { classes: ["D"] });
	if (rows.length === 0) return 0;
	return rows.reduce((total, row) => total + search(row.query, "rank", tuning).length, 0) / rows.length;
}

function bloats(tuning: Tuning): string[] {
	if (baselineHollowResults === 0) return [];
	const after = hollowResults(tuning);
	return after > baselineHollowResults * BLOAT_SHARE
		? [`hollow queries ${baselineHollowResults.toFixed(0)} -> ${after.toFixed(0)} results on average`]
		: [];
}

interface Score {
	recited: number;
	described: number;
	combined: number;
}

install(loadRealArchive());
baselineDescriptionResults = new Map(DESCRIPTION_PROBES.map((probe) => [probe, descriptionResults(probe, TUNING)]));

const generated = loadGenerated();
const golden = loadGolden();
const train = select(generated, { split: "train" });
const held = select(generated, { split: "test" });

baselineHollowResults = hollowResults(TUNING);

// Below this the differences between candidate values sit inside the noise, and the sweep
// would be fitting a handful of queries rather than measuring anything.
const MINIMUM_TRAIN = 40;

// Until the generated set is large enough the golden set stands in, and the generated rows are
// still reported so the set can be watched as it grows. Once it is large enough the golden set
// goes back to being an independent reference that nothing is tuned against.
const usingGolden = train.length < MINIMUM_TRAIN;
const trainSet = usingGolden ? golden : train;

const recitedOf = (rows: LabelledQuery[]) => select(rows, { classes: ["A", "C"] });
const describedOf = (rows: LabelledQuery[]) => select(rows, { classes: ["B", "C"] });

function score(tuning: Tuning): Score {
	const recited = evaluate(recitedOf(trainSet), tuning).meanReciprocalRank;
	const described = evaluate(describedOf(trainSet), tuning).meanReciprocalRank;
	return { recited, described, combined: (recited + described) / 2 };
}

function format(label: string, value: Score): string {
	const columns = [value.combined, value.recited, value.described].map((number) => number.toFixed(4));
	return `${label.padEnd(44)} ${columns[0]}   recited ${columns[1]}   described ${columns[2]}`;
}

console.log(
	`train ${trainSet.length}  held-out ${held.length}  golden ${golden.length}  ` +
		`generated ${generated.length} ${JSON.stringify(countByClass(generated))}`,
);
if (usingGolden) {
	console.log(
		`tuning on the golden set: only ${train.length} generated queries are in train, below the ` +
			`${MINIMUM_TRAIN} needed for a difference between candidates to mean anything`,
	);
}

// A constraint the current configuration already fails rejects every candidate, which freezes
// the sweep and looks exactly like convergence. Refuse to run rather than report a fixed point
// that is really a dead end.
const baselineViolations = violations(TUNING);
if (baselineViolations.length > 0) {
	console.error(`\nthe baseline already violates the monotonicity constraint:`);
	for (const violation of baselineViolations) console.error(`  ${violation}`);
	console.error(`\nEvery candidate would be rejected and the sweep would report a false optimum.`);
	process.exit(1);
}

// And the same check the other way: a probe that already returns nothing constrains nothing,
// so the guard would be silently vacuous for it rather than protecting anything.
const emptyProbes = DESCRIPTION_PROBES.filter((probe) => baselineDescriptionResults.get(probe) === 0);
if (emptyProbes.length > 0) {
	console.error(`\nthese description probes return nothing at the baseline: ${emptyProbes.join(", ")}`);
	console.error(`A probe with no baseline results cannot detect a collapse and guards nothing.`);
	process.exit(1);
}
console.log(
	`description probes  ` +
		DESCRIPTION_PROBES.map((probe) => `${probe} ${baselineDescriptionResults.get(probe)}`).join("  "),
);

let best = { ...TUNING };
let bestScore = score(best);
console.log(format("baseline", bestScore));

for (let pass = 1; pass <= 2; pass++) {
	console.log(`\n--- pass ${pass} ---`);
	for (const knob of KNOBS) {
		const objective = OBJECTIVE[knob];
		let chosen = best[knob];
		let chosenScore = bestScore;

		for (const value of CANDIDATES[knob]) {
			if (value === best[knob]) continue;
			const candidate = { ...best, [knob]: value };
			const candidateScore = score(candidate);
			const gain = candidateScore[objective] - chosenScore[objective];
			// A parameter must earn its keep on the intent it governs, and must not pay for it
			// out of the other one. Transcript parameters reach description queries through the
			// merge, so "transcript-only" is true of the mechanism, not of the effect.
			const collateral = candidateScore.combined < bestScore.combined - 1e-9;
			if (
				gain > MINIMUM_GAIN &&
				!collateral &&
				violations(candidate).length === 0 &&
				collapses(candidate).length === 0 &&
				bloats(candidate).length === 0
			) {
				chosen = value;
				chosenScore = candidateScore;
			}
		}

		if (chosen === best[knob]) {
			console.log(`${knob.padEnd(44)} keep ${best[knob]}   (${objective})`);
			continue;
		}
		const gain = chosenScore[objective] - bestScore[objective];
		best = { ...best, [knob]: chosen };
		bestScore = chosenScore;
		console.log(format(`${knob} -> ${chosen}   (${objective} +${gain.toFixed(4)})`, chosenScore));
	}
}

console.log(`\n${format("tuned", bestScore)}`);
console.log(JSON.stringify(best, null, "\t"));

// A value resting against the end of its own candidate list is not a converged parameter, it is
// an unanswered question: the sweep never saw what lies beyond it. This is indistinguishable
// from a real optimum in the log — the run of 2026-08-09 printed `keep` for all eleven knobs
// with descriptionCoverageFloor pinned to the bottom of its grid, and the value one notch below
// turned out to be worth 0.11 MRR on the described intent.
const atEdge = KNOBS.flatMap((knob) => {
	const values = [...CANDIDATES[knob]].sort((a, b) => a - b);
	const value = best[knob] as number;
	if (values.length < 2 || (value !== values[0] && value !== values[values.length - 1])) return [];
	const direction = value === values[0] ? "below" : "above";
	return [
		`  ${knob} = ${value} is the ${direction === "below" ? "lowest" : "highest"} value tried; nothing ${direction} it was measured`,
	];
});
if (atEdge.length > 0) {
	console.log(`\nparameters resting on the edge of their grid:`);
	for (const line of atEdge) console.log(line);
	console.log(`Extend the candidate list before reading these as converged.`);
}

function report(label: string, rows: LabelledQuery[]): Record<string, unknown> {
	if (rows.length === 0) return {};
	console.log(`\n=== ${label} (${rows.length} queries)`);

	const summary: Record<string, unknown> = {};
	for (const [queryClass, evaluation] of evaluateByClass(rows, best)) {
		console.log(summarise(`  ${queryClass} ${CLASS_NAMES[queryClass]}`, evaluation));
		summary[queryClass] = {
			queries: evaluation.queries,
			recallAtOne: evaluation.recallAtOne,
			meanReciprocalRank: evaluation.meanReciprocalRank,
			zeroResultRate: evaluation.zeroResultRate,
		};
		if (evaluation.zeroResultRate > 0 || evaluation.recallAtOne < 1) console.log(describeMisses(evaluation));
	}

	const hollow = evaluateHollow(rows, best);
	if (hollow.queries > 0) {
		console.log(
			`  D hollow             n ${String(hollow.queries).padStart(4)}  mean results ${hollow.meanResults.toFixed(1)}  ` +
				`worst ${hollow.worstResults}  description-sourced ${hollow.descriptionSourced}`,
		);
		summary.D = hollow;
	}

	const nearMiss = evaluateNearMiss(rows, best);
	if (nearMiss.pairs > 0) {
		console.log(`  E near-miss          ${nearMiss.targetAboveDecoy}/${nearMiss.pairs} beat their decoy`);
		for (const loss of nearMiss.losses) console.log(`    lost: "${loss.query}" to ${loss.decoy}`);
		summary.Epairs = nearMiss;
	}

	return summary;
}

const trainSummary = report(usingGolden ? "train (golden)" : "train", trainSet);
const heldSummary = report("held out", held);
const goldenSummary = usingGolden ? trainSummary : report("golden", golden);
// Reported even when too small to tune on, so classes D and E can be watched as they arrive.
const generatedSummary = usingGolden ? report("generated (not tuned on)", select(generated)) : trainSummary;

fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
fs.appendFileSync(
	LOG_PATH,
	JSON.stringify({
		at: new Date().toISOString(),
		trainSize: trainSet.length,
		heldOutSize: held.length,
		goldenSize: golden.length,
		usingGoldenAsTrain: usingGolden,
		parameters: best,
		train: trainSummary,
		heldOut: heldSummary,
		golden: goldenSummary,
		generated: generatedSummary,
	}) + "\n",
);
console.log(`\nappended to ${LOG_PATH}`);
