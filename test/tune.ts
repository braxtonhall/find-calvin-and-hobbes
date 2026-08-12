import fs from "fs";
import path from "path";
import { search, TUNING, Tuning } from "../src/search";
import { stem } from "../src/stem";
import { COMPOUNDS } from "../src/compounds";
import {
	describeMisses,
	evaluate,
	evaluateByClass,
	evaluateHollow,
	evaluateNearMiss,
	summarise,
} from "./helpers/metrics";
import { install, loadRealArchive } from "./helpers/archive";
import {
	CLASS_NAMES,
	countByClass,
	LabelledQuery,
	loadGenerated,
	loadGolden,
	select,
	subsample,
} from "./helpers/queries";

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
	// Above 0.5 the fixture's own targets start failing it — a fifth of them match half the query or
	// less — so the grid stops where the measurement says the cost turns. 0 is kept as the record of
	// what the engine admitted before this existed, but the correction guard below rejects it on
	// sight: at 0 a strip can be admitted having matched nothing of the query as written, which is
	// the property the floor exists to hold.
	transcriptLiteralShare: [0, 0.2, 0.3, 0.4, 0.5],
	descriptionLiteralShare: [0, 0.2, 0.3, 0.4, 0.5],
	descriptionMinMass: [0, 1, 1.5, 2.5, 4],
	// The units of `descriptionMinMass`: 0 compares the raw sum over query terms, 1 the mean per
	// matched term. These two have to be read together — at 0 the threshold is inert at every
	// value on the grid above, and at 1 the same numbers mean something entirely different — so a
	// sweep that moves one without the other is measuring noise. See question 5.
	descriptionMassNormalization: [0, 0.5, 1],
	// Pivoted document-length normalization. 0 is the engine as it has always been; the grid stops
	// at 1, full normalization, because beyond it a long field is penalised more than its length.
	transcriptLengthNormalization: [0, 0.25, 0.5, 0.75, 1],
	descriptionLengthNormalization: [0, 0.25, 0.5, 0.75, 1],
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
	descriptionMassNormalization: "described",
	transcriptLengthNormalization: "recited",
	descriptionLengthNormalization: "described",
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

// The third blind spot, and the one the literal-share floors exist to close: a strip that matches
// nothing of the query as written is not an answer to it, however its rarity-weighted coverage
// adds up. `ding dong rosalyn` reached a ping-pong ball, a game of Calvinball, a leaf collection
// and a strip saying `dying` that way, every one of them on a spelling correction alone. MRR
// cannot see it — none of these queries has such a strip as its target, so admitting four of them
// costs the objective nothing — so it has to be a constraint, like monotonicity.
//
// Mined rather than invented, which matters: of the 440 real queries in both fixtures, these are
// the ones that admit such a strip once the floors come off. A probe chosen by hand would mostly
// have tested that a query has no near-neighbours in the corpus, which is a property of the query.
const CORRECTION_PROBES = [
	"ding dong rosalyn",
	"wagon ride born contribution earth better place",
	"night yard hose freeze snow goons dad",
	"football chase chair stuck tackle game",
	"sledding late bedtime hope mom missing",
	"spaceman spiff hall pass principal",
];

const WORD_PATTERN = /[\p{L}\p{N}']+/gu;

// Both sides go through the index's own decomposition, since `goodnight` is `good night` to the
// scorer and a guard that disagreed would be asking about a vocabulary the engine does not have.
const words = (text: string) =>
	[...text.toLowerCase().matchAll(WORD_PATTERN)].flatMap((match) => COMPOUNDS.get(match[0]) || [match[0]]);

// Whether the field holds any query word as written, extended, or in another inflection — the
// engine's three literal routes. `stem` is imported for the same reason the decomposition is: what
// counts as the same word is the scorer's definition, not this file's.
//
// Read off the field text rather than the highlight ranges, which are filtered by
// transcriptIdfFloor: a field matching only a common word literally reports no ranges at all, and
// scoring that as a violation would fail configurations that are perfectly sound.
function literal(text: string, terms: string[], stems: Set<string>): boolean {
	return words(text).some(
		(word) =>
			terms.includes(word) ||
			terms.some((term) => word.length > term.length && word.startsWith(term)) ||
			stems.has(stem(word)),
	);
}

function bare(probe: string, tuning: Tuning): string[] {
	const terms = words(probe);
	const stems = new Set(terms.map(stem));
	return search(probe, "rank", tuning)
		.filter((result) => !literal(result.text, terms, stems))
		.map((result) => result.comic.date);
}

function corrections(tuning: Tuning): string[] {
	return CORRECTION_PROBES.flatMap((probe) => {
		const admitted = bare(probe, tuning);
		if (admitted.length === 0) return [];
		const first = admitted.slice(0, 3).join(", ");
		return [`"${probe}" admits ${admitted.length} strips matching none of it literally (${first})`];
	});
}

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

// The sweep evaluates its objective a few hundred times — 18 parameters across 101 candidate
// values, twice — so its cost is the train split's size multiplied by that. The 2026-08-09 run
// took 55 minutes at 332 queries and 64 values; the same run on a five-pass set would be past two
// hours. So the sweep sees a subsample and every move it accepts is then re-confirmed on the whole
// split, which costs one evaluation per move rather than one per candidate.
//
// 250 is the plan's number, and it is a floor as much as a budget: below ~200 the differences
// between candidate values sit inside the noise. If the split ever grows enough that the sweep is
// slow again, raise the machine's parallelism rather than lowering this.
const SWEEP_SUBSAMPLE = 250;
// Fixed, so that re-running a sweep on an unchanged set reaches the same decisions from the same
// evidence. Changing it is a way to ask whether a result was an artefact of the draw.
const SWEEP_SEED = 20260810;

// Only the classes the objective reads. D is scored on result count and E on rank gaps, neither of
// which is part of `score`, so spending the sample's budget on them would buy nothing — they are
// reported on the full split below, and the hollow guard reads every D row in the fixture anyway.
const scored = select(trainSet, { classes: ["A", "B", "C"] });
const sweepSet = subsample(scored, SWEEP_SUBSAMPLE, SWEEP_SEED);
const subsampling = sweepSet.length < scored.length;

function score(tuning: Tuning, rows: LabelledQuery[]): Score {
	const recited = evaluate(recitedOf(rows), tuning).meanReciprocalRank;
	const described = evaluate(describedOf(rows), tuning).meanReciprocalRank;
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
console.log(
	subsampling
		? `sweeping on ${sweepSet.length} of the ${scored.length} scored train queries ` +
				`${JSON.stringify(countByClass(sweepSet))}, seed ${SWEEP_SEED}; every accepted move is ` +
				`then re-confirmed on all ${scored.length}`
		: `sweeping on all ${scored.length} scored train queries; too few to be worth subsampling`,
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

// The same two checks for the correction guard. First that the baseline satisfies it, for the
// reason above: a constraint the current configuration fails rejects every candidate and reports
// a dead end as an optimum.
const baselineCorrections = corrections(TUNING);
if (baselineCorrections.length > 0) {
	console.error(`\nthe baseline already admits strips that match nothing of the query literally:`);
	for (const correction of baselineCorrections) console.error(`  ${correction}`);
	console.error(`\nEvery candidate would be rejected and the sweep would report a false optimum.`);
	process.exit(1);
}

// And then that each probe is live — that it would admit such a strip with the floors off. A probe
// no longer capable of failing guards nothing, and would sit here looking like protection while
// the property drifted out from under it. This is the check the monotonicity constraint went two
// runs without.
const openLiteral: Tuning = { ...TUNING, transcriptLiteralShare: 0, descriptionLiteralShare: 0 };
const deadProbes = CORRECTION_PROBES.filter((probe) => bare(probe, openLiteral).length === 0);
if (deadProbes.length > 0) {
	console.error(`\nthese correction probes admit nothing even with the literal share floors at 0:`);
	for (const probe of deadProbes) console.error(`  ${probe}`);
	console.error(`A probe that cannot fail is not a guard. Mine the fixture for replacements.`);
	process.exit(1);
}
console.log(
	`correction probes   ` +
		CORRECTION_PROBES.map(
			(probe) => `${probe.split(" ").slice(0, 2).join(" ")} ${bare(probe, openLiteral).length}`,
		).join("  ") +
		`  (strips each would admit on a correction alone, floors off)`,
);

let best = { ...TUNING };
let bestScore = score(best, sweepSet);
console.log(format("baseline", bestScore));
if (subsampling) console.log(format("baseline (all scored train)", score(best, scored)));

// Why a knob was kept, which `keep` on its own never said. A value can fail for three quite
// different reasons — it gained nothing, it gained on its own intent while costing more elsewhere,
// or it gained and a constraint forbade it — and only the third tells you a guard is doing work.
// The 2026-08-10 review had to write "the two possibilities cannot be separated" about eighteen
// parameters, which is a report about this file rather than about the engine.
interface Attempt {
	knob: string;
	value: number;
	gain: number;
	collateral: boolean;
	blocked: string[];
}

const blockedAttempts: Attempt[] = [];

for (let pass = 1; pass <= 2; pass++) {
	console.log(`\n--- pass ${pass} ---`);
	for (const knob of KNOBS) {
		const objective = OBJECTIVE[knob];
		let chosen = best[knob];
		let chosenScore = bestScore;
		const attempts: Attempt[] = [];

		for (const value of CANDIDATES[knob]) {
			if (value === best[knob]) continue;
			const candidate = { ...best, [knob]: value };
			const candidateScore = score(candidate, sweepSet);
			const gain = candidateScore[objective] - chosenScore[objective];
			// A parameter must earn its keep on the intent it governs, and must not pay for it
			// out of the other one. Transcript parameters reach description queries through the
			// merge, so "transcript-only" is true of the mechanism, not of the effect.
			const collateral = candidateScore.combined < bestScore.combined - 1e-9;
			// Only asked of a value that would otherwise win, since each probe is a real search and
			// the answer is only interesting for a candidate the objective wants.
			const blocked =
				gain > MINIMUM_GAIN && !collateral
					? [...violations(candidate), ...collapses(candidate), ...bloats(candidate), ...corrections(candidate)]
					: [];
			attempts.push({ knob, value, gain, collateral, blocked });

			if (gain > MINIMUM_GAIN && !collateral && blocked.length === 0) {
				chosen = value;
				chosenScore = candidateScore;
			}
		}

		// A candidate the objective wanted and a rule refused is a finding in its own right, so it
		// is named on the spot and collected for the tuning log.
		for (const attempt of attempts) {
			if (attempt.blocked.length > 0) {
				console.log(`  ${knob} = ${attempt.value} gained ${attempt.gain.toFixed(4)} but is BLOCKED:`);
				for (const reason of attempt.blocked) console.log(`    ${reason}`);
				blockedAttempts.push(attempt);
			} else if (attempt.gain > MINIMUM_GAIN && attempt.collateral) {
				console.log(
					`  ${knob} = ${attempt.value} gained ${attempt.gain.toFixed(4)} on ${objective} ` +
						`but the combined score would fall`,
				);
			}
		}

		if (chosen === best[knob]) {
			// The best value tried and what it was worth, so a `keep` can be read as "nothing here"
			// rather than "nothing measured".
			const closest = attempts.reduce<Attempt | null>(
				(leader, attempt) => (leader === null || attempt.gain > leader.gain ? attempt : leader),
				null,
			);
			const near = closest
				? `   best alternative ${closest.value} at ${closest.gain >= 0 ? "+" : ""}${closest.gain.toFixed(4)}`
				: "";
			console.log(`${knob.padEnd(44)} keep ${best[knob]}   (${objective})${near}`);
			continue;
		}
		const gain = chosenScore[objective] - bestScore[objective];
		best = { ...best, [knob]: chosen };
		bestScore = chosenScore;
		console.log(format(`${knob} -> ${chosen}   (${objective} +${gain.toFixed(4)})`, chosenScore));
	}
}

if (blockedAttempts.length > 0) {
	console.log(`\n${blockedAttempts.length} candidate values were wanted by the objective and refused by a constraint:`);
	for (const attempt of blockedAttempts) {
		console.log(`  ${attempt.knob} = ${attempt.value} (+${attempt.gain.toFixed(4)}): ${attempt.blocked[0]}`);
	}
	console.log(`Those are the guards earning their place. A run with none has not proved they work.`);
}

console.log(`\n${format(subsampling ? "tuned (on the subsample)" : "tuned", bestScore)}`);

// The subsample decided; the whole split confirms. A move worth less than the sampling noise is
// exactly the kind this document keeps catching after the fact, so each one is re-tested here
// against every scored train query, in the order the sweep made them, and dropped if it does not
// hold up. The constraints are re-checked too: dropping one move leaves a combination the sweep
// never evaluated, and a combination nothing checked is how an invariant escapes.
const dropped: string[] = [];
if (subsampling) {
	const moves = KNOBS.filter((knob) => best[knob] !== TUNING[knob]);
	console.log(`\n--- confirming ${moves.length} move${moves.length === 1 ? "" : "s"} on all ${scored.length} ---`);

	let confirmed = { ...TUNING };
	let confirmedScore = score(confirmed, scored);
	for (const knob of moves) {
		const objective = OBJECTIVE[knob];
		const candidate = { ...confirmed, [knob]: best[knob] };
		const candidateScore = score(candidate, scored);
		const gain = candidateScore[objective] - confirmedScore[objective];
		const collateral = candidateScore.combined < confirmedScore.combined - 1e-9;
		const blocked = [
			...violations(candidate),
			...collapses(candidate),
			...bloats(candidate),
			...corrections(candidate),
		];

		if (gain > MINIMUM_GAIN && !collateral && blocked.length === 0) {
			confirmed = candidate;
			confirmedScore = candidateScore;
			console.log(format(`${knob} -> ${best[knob]}   confirmed (${objective} +${gain.toFixed(4)})`, candidateScore));
			continue;
		}

		let why = `${objective} +${gain.toFixed(4)} on the full split, under the ${MINIMUM_GAIN} threshold`;
		if (blocked.length > 0) why = blocked[0];
		else if (collateral) why = `the combined score would fall`;
		dropped.push(`${knob} ${TUNING[knob]} -> ${best[knob]}: ${why}`);
		console.log(`${`${knob} -> ${best[knob]}`.padEnd(44)} DROPPED   ${why}`);
	}

	best = confirmed;
	bestScore = confirmedScore;
	console.log(`\n${format("tuned (all scored train)", bestScore)}`);
	if (dropped.length > 0) {
		console.log(`${dropped.length} move${dropped.length === 1 ? "" : "s"} did not survive the full split:`);
		for (const line of dropped) console.log(`  ${line}`);
		console.log(`That is the subsample doing its job, not a failure. The values below exclude them.`);
	}
}

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
		// The contested count leads because it is the only one that says anything about the ranker.
		// `11/15 beat their decoy` was read as a ranking result for a whole run; it was nine
		// walkovers, two real comparisons and four queries that returned nothing.
		console.log(
			`  E near-miss          ${nearMiss.targetAboveDecoy}/${nearMiss.contested} contested pairs won  ` +
				`(of ${nearMiss.pairs}: ${nearMiss.decoyUncontested.length} decoy never admitted, ` +
				`${nearMiss.targetAbsent.length} target absent)`,
		);
		for (const loss of nearMiss.decoyWins) {
			console.log(`    decoy wins: "${loss.query}" — target #${loss.targetRank}, ${loss.decoy} #${loss.decoyRank}`);
		}
		for (const row of nearMiss.targetAbsent) console.log(`    target absent: "${row.query}" (${row.date})`);
		for (const row of nearMiss.decoyUncontested) {
			console.log(`    untested: "${row.query}" — ${row.decoy} was never admitted`);
		}
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
		// What the sweep actually decided on, and what the whole split then threw out. Without
		// these two a later reader cannot tell a run that measured 250 queries from one that
		// measured 500, and the parameters would look more firmly established than they are.
		sweepSize: sweepSet.length,
		droppedOnFullTrain: dropped,
		// Candidates the objective wanted and a constraint refused. An empty list in a run that also
		// moved nothing means the guards were never tested, which is worth knowing later.
		blockedByConstraint: blockedAttempts.map((attempt) => ({
			knob: attempt.knob,
			value: attempt.value,
			gain: attempt.gain,
			reason: attempt.blocked[0],
		})),
		parameters: best,
		train: trainSummary,
		heldOut: heldSummary,
		golden: goldenSummary,
		generated: generatedSummary,
	}) + "\n",
);
console.log(`\nappended to ${LOG_PATH}`);
