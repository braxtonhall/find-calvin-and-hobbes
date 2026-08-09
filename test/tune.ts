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
	rarityExponent: [1, 1.25, 1.5, 2],
	transcriptCoverageFloor: [0.3, 0.4, 0.5, 0.6, 0.7],
	descriptionCoverageFloor: [0.3, 0.4, 0.5, 0.6, 0.7],
	descriptionMinMass: [0, 1, 1.5, 2.5, 4],
	descriptionIdfFloor: [0.25, 0.5, 1, 1.5, 2],
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
	descriptionRepeatWeight: "described",
	descriptionCoverageFloor: "described",
	descriptionMinMass: "described",
	descriptionIdfFloor: "described",
	rarityExponent: "combined",
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
];

function violations(tuning: Tuning): string[] {
	return MONOTONICITY_PROBES.filter(([shorter, longer]) => {
		return search(longer, "rank", tuning).length > search(shorter, "rank", tuning).length;
	}).map(([shorter, longer]) => `"${longer}" widens "${shorter}"`);
}

interface Score {
	recited: number;
	described: number;
	combined: number;
}

install(loadRealArchive());

const generated = loadGenerated();
const golden = loadGolden();
const train = select(generated, { split: "train" });
const held = select(generated, { split: "test" });

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
			if (gain > MINIMUM_GAIN && !collateral && violations(candidate).length === 0) {
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
