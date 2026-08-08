import { TUNING, Tuning } from "../src/search";
import { DESCRIBED, RECITED } from "./fixtures/golden";
import { describeMisses, evaluate } from "./helpers/metrics";
import { install, loadRealArchive } from "./helpers/archive";

const CANDIDATES: Record<keyof Tuning, number[]> = {
	sequenceWeight: [0, 0.5, 1, 2, 3],
	runWeight: [0, 1, 2, 4, 8],
	transcriptRepeatWeight: [0, 0.25, 0.5, 1],
	descriptionRepeatWeight: [0, 0.1, 0.25, 0.5, 1],
	rarityExponent: [1, 1.25, 1.5, 2],
	transcriptMinCoverage: [0.3, 0.4, 0.5, 0.6, 0.7],
	descriptionMinCoverage: [0.3, 0.4, 0.5, 0.6, 0.7],
	descriptionMinMass: [0, 1, 1.5, 2.5, 4],
	transcriptIdfFloor: [0, 0.25, 0.5, 1],
	descriptionIdfFloor: [0.25, 0.5, 1, 1.5, 2],
	descriptionPreference: [0.4, 0.55, 0.7, 0.85, 1],
	agreementBonus: [0, 0.15, 0.3, 0.6],
};

// Each knob is judged only against the intent it governs. Judging a transcript-only knob on
// the combined score lets the sweep "improve" it by weakening transcripts until description
// matches win, which looks like a gain and is really just a miscalibrated corpus preference.
const OBJECTIVE: Record<keyof Tuning, "recited" | "described" | "combined"> = {
	sequenceWeight: "recited",
	runWeight: "recited",
	transcriptRepeatWeight: "recited",
	transcriptMinCoverage: "recited",
	transcriptIdfFloor: "recited",
	descriptionRepeatWeight: "described",
	descriptionMinCoverage: "described",
	descriptionMinMass: "described",
	descriptionIdfFloor: "described",
	rarityExponent: "combined",
	descriptionPreference: "combined",
	agreementBonus: "combined",
};

const KNOBS = Object.keys(CANDIDATES) as (keyof Tuning)[];
const MINIMUM_GAIN = 0.005;

interface Score {
	recited: number;
	described: number;
	combined: number;
}

function score(tuning: Tuning): Score {
	const recited = evaluate(RECITED, tuning).meanReciprocalRank;
	const described = evaluate(DESCRIBED, tuning).meanReciprocalRank;
	return { recited, described, combined: (recited + described) / 2 };
}

function format(label: string, value: Score): string {
	const columns = [value.combined, value.recited, value.described].map((number) => number.toFixed(4));
	return `${label.padEnd(44)} ${columns[0]}   recited ${columns[1]}   described ${columns[2]}`;
}

install(loadRealArchive());

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
			const candidateScore = score({ ...best, [knob]: value });
			const gain = candidateScore[objective] - chosenScore[objective];
			if (gain > MINIMUM_GAIN) {
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

for (const [label, queries] of [
	["recited", RECITED],
	["described", DESCRIBED],
] as const) {
	const evaluation = evaluate(queries, best);
	console.log(
		`\n${label}: recall@1 ${evaluation.recallAtOne.toFixed(3)} recall@10 ${evaluation.recallAtTen.toFixed(3)} MRR ${evaluation.meanReciprocalRank.toFixed(3)}`,
	);
	if (evaluation.misses.length) console.log(describeMisses(evaluation));
}
