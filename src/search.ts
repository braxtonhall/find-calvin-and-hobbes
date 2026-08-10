import { Comic, SortMode } from "./types";
import { state } from "./state";
import { COMPOUNDS } from "./compounds";
import { stem } from "./stem";

export interface SearchResult {
	comic: Comic;
	text: string;
	ranges: [number, number][];
	score: number;
	source: "transcript" | "description";
}

// Transcripts and descriptions are searched with the same query but different scoring.
// A transcript query is a recitation, so word order carries most of the signal; a
// description query is a bag of keywords, so word rarity carries it instead.
export interface Tuning {
	sequenceWeight: number;
	runWeight: number;
	transcriptRepeatWeight: number;
	descriptionRepeatWeight: number;
	repeatVariety: number;
	rarityExponent: number;
	transcriptCoverageFloor: number;
	descriptionCoverageFloor: number;
	transcriptLengthForgiveness: number;
	descriptionLengthForgiveness: number;
	descriptionMinMass: number;
	transcriptIdfFloor: number;
	descriptionIdfFloor: number;
	transcriptInflectionWeight: number;
	descriptionInflectionWeight: number;
	descriptionPreference: number;
	agreementBonus: number;
}

export const TUNING: Tuning = {
	sequenceWeight: 1,
	runWeight: 2,
	// Measured, not swept: the sweep judges this on the recited intent alone, where 0.25 gains
	// 0.0022 against a 0.005 threshold, so it would keep 1 forever. Across the whole grid 0.25
	// is the only value that is at least as good as every other on every measure at once —
	// train recited 0.9189 -> 0.9211 and described unmoved at its own maximum, held-out
	// identical, and both golden sets at 1.000, golden described having sat at 0.971. Above it
	// golden described falls away again; below it the described intent does.
	transcriptRepeatWeight: 0.25,
	descriptionRepeatWeight: 0,
	// How much of a term's variety counts as repetition. 1 is what the engine has always done
	// and what every other parameter here was fitted against, so it is the default until
	// something can tell the two apart. Nothing in the fixture can: across 394 generated and
	// 50 golden queries, 0 and 1 produce identical ranks for every single one, and differ only
	// in which text five `snow` results display. The queries that would resolve it are the ones
	// nobody has written — a strip that says one word repeatedly against a strip that says
	// several forms of it once.
	repeatVariety: 1,
	rarityExponent: 1.25,
	transcriptCoverageFloor: 0.4,
	// Measured, not swept: 0.3 was the bottom of the sweep's own candidate grid, so the only
	// direction that helped was never tried and eleven `keep` lines read as convergence. Down
	// here the described intent goes 0.7524 -> 0.8674 MRR, hybrid queries returning nothing go
	// from 25% to 1%, and the held-out zero rate reaches nought, with the golden set unmoved.
	// Not lower: at 0 the requirement degenerates to a single term and hollow queries jump from
	// 145 results to 239, and 0.02 buys 0.007 MRR that 62 distinct strips cannot resolve.
	descriptionCoverageFloor: 0.05,
	// How fast the coverage requirement decays as the query lengthens: the requirement is
	// `floor + (1 - floor) / m ** forgiveness`, so 1 is the 1/m decay this has always used and
	// lower values hold the bar up for long queries.
	//
	// Both ship at 1, which is exactly the previous engine, because the two corpora need
	// different answers and neither has been measured yet. What is measured is that they need
	// asking separately: `how do you play house` returns 471 where `play house` returns 28, and
	// 434 of the 471 are description matches against 37 transcript ones. The transcript side
	// barely moves, and it is the side that must not be tightened carelessly — a class A query
	// is a long recitation with a misremembered word in it by definition.
	transcriptLengthForgiveness: 1,
	descriptionLengthForgiveness: 1,
	descriptionMinMass: 1.5,
	transcriptIdfFloor: 0.5,
	descriptionIdfFloor: 1,
	// How much another inflection of a query word is worth beside the word itself.
	//
	// Off for transcripts, measured rather than assumed: across a 5x5 grid the transcript
	// weight moves the recited intent by 0.0016 — a third of the sweep's own noise threshold —
	// and takes a golden query with it, since `learning to ride a bicycle crash` then reaches
	// the neighbouring strip that says "once you learn how to ride a bicycle". That fits what
	// the two corpora are: a recitation quotes the strip, so its inflections are already the
	// strip's, while a description query is the reader's own sentence about the picture.
	//
	// 0.7 for descriptions is where the described intent peaks (0.8497 -> 0.8542), class C
	// stops returning nothing at all, and both queries that found no result now rank 2 and 3.
	// Not higher: at 1 an inflection is worth as much as the word itself and held-out MRR
	// falls from 0.931 to 0.911.
	transcriptInflectionWeight: 0,
	descriptionInflectionWeight: 0.7,
	descriptionPreference: 0.7,
	agreementBonus: 0.15,
};

const WORD_PATTERN = /[\p{L}\p{N}']+/gu;

const EXACT_WEIGHT = 1;
const PREFIX_WEIGHT = 0.85;
const DISTANCE_WEIGHTS = [1, 0.7, 0.55];

const MAX_CACHED_EXPANSIONS = 400;

function maxDistanceFor(term: string): number {
	if (term.length <= 3) return 0;
	if (term.length <= 7) return 1;
	return 2;
}

interface IndexedField {
	text: string;
	lowered: string;
	words: string[];
	starts: Int32Array;
	ends: Int32Array;
}

interface IndexedComic {
	comic: Comic;
	transcripts: IndexedField[];
	description: IndexedField | null;
}

interface Corpus {
	name: string;
	documentFrequency: Map<string, number>;
	documentCount: number;
	// Words grouped by stem. Grouping rather than rewriting is what keeps this off the corpus
	// statistics: every word keeps its own document frequency, so a query for `complains` is
	// still as rare as `complains` is and only what it can match has widened.
	inflections: Map<string, Set<string>>;
}

interface Expansion {
	matchWeights: Map<string, number>;
	contributions: Map<string, number>;
	ceiling: number;
	rarity: number;
	present: boolean;
}

interface FieldHits {
	positions: number[];
	terms: number[];
	weights: number[];
	contributions: number[];
}

interface Summary {
	base: number;
	achieved: number;
	ceiling: number;
	coverage: number;
}

interface FieldMatch {
	score: number;
	ranges: [number, number][];
}

// A transcript's sequence multiplier is only meaningful next to what the query could achieve,
// so it is kept apart from the rarity score until the whole corpus has been seen.
interface TranscriptMatch {
	strength: number;
	multiplier: number;
	ranges: [number, number][];
}

let indexedComics: IndexedComic[] = [];
let indexedSource: Comic[] | null = null;
let indexedDescriptions: Map<string, string> | null = null;
let transcriptCorpus = emptyCorpus("transcript");
let descriptionCorpus = emptyCorpus("description");
let cachedTuning: Tuning | null = null;
const expansionCache = new Map<string, Expansion>();

function emptyCorpus(name: string): Corpus {
	return { name, documentFrequency: new Map(), documentCount: 0, inflections: new Map() };
}

function indexInflections(corpus: Corpus): void {
	for (const word of corpus.documentFrequency.keys()) {
		const key = stem(word);
		const family = corpus.inflections.get(key);
		if (family === undefined) corpus.inflections.set(key, new Set([word]));
		else family.add(word);
	}
}

/**
 * A closed compound the corpus usually writes open becomes its parts, so that `goodnight`
 * and `good night` are the same thing to the scorer. The split replaces the compound rather
 * than sitting beside it: keeping both would count the token's mass twice in `summarise`.
 */
function decompose(word: string): string[] {
	return COMPOUNDS.get(word) ?? [word];
}

function indexField(text: string, interned: Map<string, string>): IndexedField {
	const words: string[] = [];
	const starts: number[] = [];
	const ends: number[] = [];

	for (const match of text.matchAll(WORD_PATTERN)) {
		// Every part keeps the whole token's offsets, so a highlight still covers the word
		// the reader can actually see rather than half of it.
		for (const part of decompose(match[0].toLowerCase())) {
			let word = interned.get(part);
			if (word === undefined) {
				word = part;
				interned.set(word, word);
			}
			words.push(word);
			starts.push(match.index);
			ends.push(match.index + match[0].length);
		}
	}

	return { text, lowered: text.toLowerCase(), words, starts: Int32Array.from(starts), ends: Int32Array.from(ends) };
}

// One document is one comic, so a word shared by a transcript and its alternate counts once.
function countDocument(corpus: Corpus, fields: IndexedField[]): void {
	corpus.documentCount++;
	const seen = new Set<string>();
	for (const field of fields) {
		for (const word of field.words) {
			if (seen.has(word)) continue;
			seen.add(word);
			corpus.documentFrequency.set(word, (corpus.documentFrequency.get(word) || 0) + 1);
		}
	}
}

function ensureIndex(): void {
	if (indexedSource === state.comics && indexedDescriptions === state.descriptions) return;

	indexedSource = state.comics;
	indexedDescriptions = state.descriptions;
	indexedComics = [];
	transcriptCorpus = emptyCorpus("transcript");
	descriptionCorpus = emptyCorpus("description");
	expansionCache.clear();

	const interned = new Map<string, string>();
	for (const comic of state.comics) {
		const transcripts = [indexField(comic.transcript, interned)];
		if (comic.alternate) transcripts.push(indexField(comic.alternate, interned));

		const descriptionText = state.descriptions?.get(comic.id || comic.date);
		const description = descriptionText ? indexField(descriptionText, interned) : null;

		countDocument(transcriptCorpus, transcripts);
		if (description) countDocument(descriptionCorpus, [description]);

		indexedComics.push({ comic, transcripts, description });
	}

	indexInflections(transcriptCorpus);
	indexInflections(descriptionCorpus);
}

function inverseDocumentFrequency(corpus: Corpus, word: string): number {
	const frequency = corpus.documentFrequency.get(word);
	if (!frequency) return 0;
	return Math.max(0, Math.log(corpus.documentCount / frequency));
}

function boundedDistance(a: string, b: string, max: number): number {
	if (Math.abs(a.length - b.length) > max) return max + 1;

	let beforePrevious: number[] = [];
	let previous: number[] = [];
	for (let column = 0; column <= b.length; column++) previous.push(column);

	for (let row = 1; row <= a.length; row++) {
		const current = [row];
		let rowMinimum = row;
		for (let column = 1; column <= b.length; column++) {
			const cost = a[row - 1] === b[column - 1] ? 0 : 1;
			let value = Math.min(previous[column] + 1, current[column - 1] + 1, previous[column - 1] + cost);
			if (row > 1 && column > 1 && a[row - 1] === b[column - 2] && a[row - 2] === b[column - 1]) {
				value = Math.min(value, beforePrevious[column - 2] + 1);
			}
			current.push(value);
			if (value < rowMinimum) rowMinimum = value;
		}
		if (rowMinimum > max) return max + 1;
		beforePrevious = previous;
		previous = current;
	}

	return previous[b.length];
}

/**
 * Expands a term to the words it can match, weighted by how rare each is in this corpus.
 * A term below `suppressBelow` is dropped entirely: it neither matches nor counts toward
 * coverage. Rarity is anchored on the term as typed, so expanding `calvin` to the rarer
 * `calvin's` cannot make `calvin` itself look informative.
 */
function expandTerm(
	corpus: Corpus,
	term: string,
	tuning: Tuning,
	suppressBelow: number,
	inflectionWeight: number,
): Expansion {
	const key = `${corpus.name}\0${term}`;
	const cached = expansionCache.get(key);
	if (cached) return cached;

	const maxDistance = maxDistanceFor(term);
	const inflections = inflectionWeight > 0 ? corpus.inflections.get(stem(term)) : undefined;
	const matchWeights = new Map<string, number>();
	const contributions = new Map<string, number>();
	let bestContribution = 0;
	let bestRarity = 0;

	for (const word of corpus.documentFrequency.keys()) {
		let weight = 0;
		if (word === term) {
			weight = EXACT_WEIGHT;
		} else if (word.length > term.length && word.startsWith(term)) {
			weight = PREFIX_WEIGHT;
		} else if (maxDistance > 0) {
			const distance = boundedDistance(word, term, maxDistance);
			if (distance > 0 && distance <= maxDistance) weight = DISTANCE_WEIGHTS[distance];
		}
		// Taken as a floor rather than a replacement: `sinks` and `sink` are one edit apart and
		// would otherwise be scored as a typo, at 0.7, when they are the same word.
		if (weight < inflectionWeight && inflections !== undefined && inflections.has(word)) {
			weight = inflectionWeight;
		}
		if (weight === 0) continue;

		const idf = inverseDocumentFrequency(corpus, word);
		const contribution = weight * Math.pow(idf, tuning.rarityExponent);
		matchWeights.set(word, weight);
		contributions.set(word, contribution);
		if (contribution > bestContribution) {
			bestContribution = contribution;
			bestRarity = idf;
		}
	}

	const exact = corpus.documentFrequency.has(term);
	const rarity = exact ? inverseDocumentFrequency(corpus, term) : bestRarity;
	const ceiling = exact ? contributions.get(term)! : bestContribution;
	const present = matchWeights.size > 0;

	const expansion: Expansion =
		rarity < suppressBelow
			? { matchWeights: new Map(), contributions: new Map(), ceiling: 0, rarity, present }
			: { matchWeights, contributions, ceiling, rarity, present };

	if (expansionCache.size >= MAX_CACHED_EXPANSIONS) expansionCache.clear();
	expansionCache.set(key, expansion);
	return expansion;
}

/**
 * How much of the query's rarity mass a field must carry to be admitted. A short query has
 * no room for a wrong word — at one term this demands everything, and at two it demands more
 * than either term of a pair holds alone. The allowance grows with query length, so one
 * misremembered word in a long recitation stays forgivable.
 *
 * `forgiveness` is how fast it grows. The allowance exists so that a near-miss is admitted
 * and the sequence bonus can then rank it, not so that a long query becomes an OR — and at 1
 * it decays as 1/m, which hands a twenty-term query the right to miss most of itself. Below 1
 * the requirement still falls with length, just slowly enough that the holes stay holes.
 * Every value keeps the two boundaries the shape depends on: at one term it demands
 * everything, since m ** anything is 1, and it never rises above the floor.
 */
function requiredCoverage(floor: number, terms: number, forgiveness: number): number {
	if (terms === 0) return 0;
	return floor + (1 - floor) / Math.pow(terms, forgiveness);
}

/**
 * The effective length of the query: each term counts for as much as it is worth beside the
 * most informative one, so a common word adds a fraction of a term rather than a whole one.
 * Counting raw terms would let `calvin` turn `rosalyn AND help` into `rosalyn OR help` purely
 * by being typed, since the extra term buys a discount far larger than the word is worth.
 */
function effectiveTerms(ceilings: Float64Array): number {
	let total = 0;
	let largest = 0;
	for (let term = 0; term < ceilings.length; term++) {
		total += ceilings[term];
		if (ceilings[term] > largest) largest = ceilings[term];
	}

	return largest > 0 ? total / largest : 0;
}

/**
 * Per-term coverage denominators. A term this corpus has never seen, but the other corpus
 * has, counts as maximally rare here, so a field that cannot match it is penalised rather
 * than silently excused. A term absent from both corpora is a typo, and is dropped.
 */
function denominators(here: Expansion[], there: Expansion[], corpus: Corpus, tuning: Tuning): Float64Array {
	const absent = Math.pow(Math.max(0, Math.log(corpus.documentCount)), tuning.rarityExponent);
	const ceilings = new Float64Array(here.length);

	for (let term = 0; term < here.length; term++) {
		if (here[term].present) ceilings[term] = here[term].ceiling;
		else if (there[term].present) ceilings[term] = absent;
	}

	return ceilings;
}

function collectHits(field: IndexedField, expansions: Expansion[]): FieldHits {
	const hits: FieldHits = { positions: [], terms: [], weights: [], contributions: [] };

	for (let index = 0; index < field.words.length; index++) {
		const word = field.words[index];
		for (let term = 0; term < expansions.length; term++) {
			const weight = expansions[term].matchWeights.get(word);
			if (weight === undefined) continue;
			hits.positions.push(index);
			hits.terms.push(term);
			hits.weights.push(weight);
			hits.contributions.push(expansions[term].contributions.get(word)!);
		}
	}

	return hits;
}

function summarise(hits: FieldHits, ceilings: Float64Array, repeatWeight: number, variety: number): Summary {
	const termCount = ceilings.length;
	const best = new Float64Array(termCount);
	const counts = new Int32Array(termCount);

	// Two readings of what the repeat weight is counting, and `repeatVariety` slides between
	// them. A term reaches several words at once — `play` hits `play` and `playing` by prefix,
	// and now `played` by stem — so a field that says each of them once has either said one
	// thing three ways (`hits`, variety 1) or said three different words once each (`repeats`,
	// variety 0). Which one earns a repetition bonus is a question about readers, not about
	// arithmetic, so it is a parameter rather than a decision.
	//
	// A word is identified by its contribution, which is a property of the word and the term
	// together. The map is skipped at variety 1, where the per-word tally is unused.
	const occurrences = variety < 1 ? new Map<string, number>() : null;
	const repeats = new Int32Array(termCount);

	for (let index = 0; index < hits.positions.length; index++) {
		const term = hits.terms[index];
		const contribution = hits.contributions[index];
		counts[term]++;
		if (occurrences !== null) {
			const key = `${term}\0${contribution}`;
			const seen = (occurrences.get(key) || 0) + 1;
			occurrences.set(key, seen);
			if (seen > repeats[term]) repeats[term] = seen;
		}
		if (contribution > best[term]) best[term] = contribution;
	}

	let base = 0;
	let achieved = 0;
	let ceiling = 0;
	for (let term = 0; term < termCount; term++) {
		// Capped at the ceiling, which is anchored on the term as typed: correcting `help` to
		// the rarer `held` must never score higher than matching `help` itself.
		const contribution = Math.min(best[term], ceilings[term]);
		ceiling += ceilings[term];
		achieved += contribution;
		// At variety 1 this is the hit count and `repeats` was never filled, which the blend
		// gives back exactly; at 0 it is the most any one word was repeated.
		const repeated = repeats[term] + variety * (counts[term] - repeats[term]);
		if (counts[term] > 0) base += contribution * (1 + repeatWeight * Math.log2(repeated));
	}

	return { base, achieved, ceiling, coverage: ceiling > 0 ? achieved / ceiling : 0 };
}

/**
 * Weighted longest common subsequence of the query against the matched field positions,
 * plus the longest stretch of it that is contiguous in the field.
 */
function orderedSubsequence(order: number[], hits: FieldHits): { lcs: number; run: number } {
	const rows = order.length;
	const columns = hits.positions.length;
	let previous = new Float64Array(columns + 1);
	let current = new Float64Array(columns + 1);
	let previousRun = new Float64Array(columns + 1);
	let currentRun = new Float64Array(columns + 1);
	let run = 0;

	for (let row = 1; row <= rows; row++) {
		for (let column = 1; column <= columns; column++) {
			const weight = hits.terms[column - 1] === order[row - 1] ? hits.weights[column - 1] : 0;
			if (weight > 0) {
				current[column] = Math.max(previous[column - 1] + weight, previous[column], current[column - 1]);
				const adjacent = column > 1 && hits.positions[column - 2] === hits.positions[column - 1] - 1;
				currentRun[column] = (adjacent ? previousRun[column - 1] : 0) + weight;
				if (currentRun[column] > run) run = currentRun[column];
			} else {
				current[column] = Math.max(previous[column], current[column - 1]);
				currentRun[column] = 0;
			}
		}
		[previous, current] = [current, previous];
		[previousRun, currentRun] = [currentRun, previousRun];
	}

	return { lcs: previous[columns], run };
}

function matchRanges(field: IndexedField, hits: FieldHits, expansions: Expansion[], floor: number): [number, number][] {
	const anyAboveFloor = expansions.some((expansion) => expansion.rarity >= floor);
	const ranges: [number, number][] = [];
	let last = -1;

	for (let index = 0; index < hits.positions.length; index++) {
		if (anyAboveFloor && expansions[hits.terms[index]].rarity < floor) continue;
		const position = hits.positions[index];
		// Deduped on the span rather than the position: both halves of a split compound sit
		// at different positions but cover the same characters, and would emit it twice.
		const start = field.starts[position];
		if (start === last) continue;
		last = start;
		ranges.push([start, field.ends[position]]);
	}

	return ranges;
}

function scoreTranscript(
	field: IndexedField,
	expansions: Expansion[],
	ceilings: Float64Array,
	required: number,
	order: number[],
	tuning: Tuning,
): TranscriptMatch | null {
	const hits = collectHits(field, expansions);
	if (hits.positions.length === 0) return null;

	const summary = summarise(hits, ceilings, tuning.transcriptRepeatWeight, tuning.repeatVariety);
	if (summary.ceiling === 0 || summary.coverage < required) return null;

	const { lcs, run } = orderedSubsequence(order, hits);
	const proportionalRun = run / order.length;

	return {
		strength: summary.base / summary.ceiling,
		multiplier: 1 + tuning.sequenceWeight * (lcs / order.length) + tuning.runWeight * proportionalRun ** 2,
		ranges: matchRanges(field, hits, expansions, tuning.transcriptIdfFloor),
	};
}

function scoreDescription(
	field: IndexedField,
	expansions: Expansion[],
	ceilings: Float64Array,
	required: number,
	tuning: Tuning,
): FieldMatch | null {
	const hits = collectHits(field, expansions);
	if (hits.positions.length === 0) return null;

	const summary = summarise(hits, ceilings, tuning.descriptionRepeatWeight, tuning.repeatVariety);
	if (summary.ceiling === 0 || summary.coverage < required) return null;
	if (summary.achieved < tuning.descriptionMinMass) return null;

	return {
		score: summary.base / summary.ceiling,
		ranges: matchRanges(field, hits, expansions, tuning.descriptionIdfFloor),
	};
}

function literalRanges(field: IndexedField, loweredQuery: string): [number, number][] {
	const ranges: [number, number][] = [];
	let index = field.lowered.indexOf(loweredQuery);
	while (index !== -1) {
		ranges.push([index, index + loweredQuery.length]);
		index = field.lowered.indexOf(loweredQuery, index + loweredQuery.length);
	}
	return ranges;
}

// Queries with no word characters at all can only be answered as a substring scan.
function literalSearch(loweredQuery: string): SearchResult[] {
	const results: SearchResult[] = [];

	for (const { comic, transcripts, description } of indexedComics) {
		let ranges: [number, number][] = [];
		let text = "";
		for (const field of transcripts) {
			const found = literalRanges(field, loweredQuery);
			if (found.length > ranges.length) {
				ranges = found;
				text = field.text;
			}
		}
		if (ranges.length > 0) {
			results.push({ comic, text, ranges, score: ranges.length, source: "transcript" });
			continue;
		}
		if (!description) continue;
		const found = literalRanges(description, loweredQuery);
		if (found.length > 0) {
			results.push({ comic, text: description.text, ranges: found, score: found.length, source: "description" });
		}
	}

	return results;
}

export function search(query: string, sort: SortMode, tuning: Tuning = TUNING): SearchResult[] {
	const trimmed = query.trim();
	if (!trimmed) return [];

	ensureIndex();
	if (cachedTuning !== tuning) {
		expansionCache.clear();
		cachedTuning = tuning;
	}

	const loweredQuery = trimmed.toLowerCase();
	// The query is decomposed the same way the index is, so `order`, `effectiveTerms` and the
	// coverage denominators are all derived from the split form and the two sides agree.
	const sequence = [...loweredQuery.matchAll(WORD_PATTERN)].flatMap((match) => decompose(match[0]));

	const results = sequence.length === 0 ? literalSearch(loweredQuery) : rankedSearch(sequence, tuning);

	if (sort === "rank") {
		results.sort((a, b) => b.score - a.score || a.comic.date.localeCompare(b.comic.date));
	}

	return results;
}

function rankedSearch(sequence: string[], tuning: Tuning): SearchResult[] {
	const terms = [...new Set(sequence)];
	const termIndices = new Map(terms.map((term, index) => [term, index]));
	const order = sequence.map((term) => termIndices.get(term)!);

	const transcriptExpansions = terms.map((term) =>
		expandTerm(transcriptCorpus, term, tuning, 0, tuning.transcriptInflectionWeight),
	);
	const descriptionExpansions = terms.map((term) =>
		expandTerm(descriptionCorpus, term, tuning, tuning.descriptionIdfFloor, tuning.descriptionInflectionWeight),
	);
	const transcriptCeilings = denominators(transcriptExpansions, descriptionExpansions, transcriptCorpus, tuning);
	const descriptionCeilings = denominators(descriptionExpansions, transcriptExpansions, descriptionCorpus, tuning);
	const transcriptRequired = requiredCoverage(
		tuning.transcriptCoverageFloor,
		effectiveTerms(transcriptCeilings),
		tuning.transcriptLengthForgiveness,
	);
	const descriptionRequired = requiredCoverage(
		tuning.descriptionCoverageFloor,
		effectiveTerms(descriptionCeilings),
		tuning.descriptionLengthForgiveness,
	);

	interface Candidate {
		comic: Comic;
		transcript: TranscriptMatch | null;
		transcriptText: string;
		description: FieldMatch | null;
		descriptionText: string;
	}

	const candidates: Candidate[] = [];
	let bestMultiplier = 0;

	for (const { comic, transcripts, description } of indexedComics) {
		let transcript: TranscriptMatch | null = null;
		let transcriptText = "";
		for (const field of transcripts) {
			const match = scoreTranscript(field, transcriptExpansions, transcriptCeilings, transcriptRequired, order, tuning);
			if (match === null) continue;
			if (transcript === null || match.strength * match.multiplier > transcript.strength * transcript.multiplier) {
				transcript = match;
				transcriptText = field.text;
			}
		}
		if (transcript !== null && transcript.multiplier > bestMultiplier) bestMultiplier = transcript.multiplier;

		const summary = description
			? scoreDescription(description, descriptionExpansions, descriptionCeilings, descriptionRequired, tuning)
			: null;

		if (transcript === null && summary === null) continue;
		candidates.push({
			comic,
			transcript,
			transcriptText,
			description: summary,
			descriptionText: description?.text || "",
		});
	}

	// Normalising by the best sequence multiplier the query actually reached, rather than by a
	// verbatim match nobody typed, keeps keyword queries comparable with descriptions. The
	// floor is an in-order match with nothing contiguous, so scattered words cannot claim
	// full marks simply by being the only thing that matched.
	const normalizer = Math.max(bestMultiplier, 1 + tuning.sequenceWeight);
	const results: SearchResult[] = [];

	for (const candidate of candidates) {
		const transcriptScore = candidate.transcript
			? (candidate.transcript.strength * candidate.transcript.multiplier) / normalizer
			: 0;
		const descriptionScore = candidate.description ? candidate.description.score * tuning.descriptionPreference : 0;

		const score =
			Math.max(transcriptScore, descriptionScore) + tuning.agreementBonus * Math.min(transcriptScore, descriptionScore);
		const preferTranscript = candidate.transcript !== null && transcriptScore >= descriptionScore;

		results.push({
			comic: candidate.comic,
			text: preferTranscript ? candidate.transcriptText : candidate.descriptionText,
			ranges: preferTranscript ? candidate.transcript!.ranges : candidate.description!.ranges,
			score,
			source: preferTranscript ? "transcript" : "description",
		});
	}

	return results;
}
