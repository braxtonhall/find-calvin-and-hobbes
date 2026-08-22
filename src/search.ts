import { Comic, SortMode } from "./types";
import { state } from "./state";
import { COMPOUNDS } from "./compounds";
import { stem } from "./stem";
import {
	DateExpression,
	DateFilters,
	DatePrecision,
	matchesExpression,
	parseDateExpression,
	parseDateFilters,
	passesFilters,
} from "./date-query";

export interface SearchResult {
	comic: Comic;
	text: string;
	ranges: [number, number][];
	score: number;
	/**
	 * Why this row is here. `date` is a strip the reader's own date expression named; `filter` is one
	 * a filter admitted when there was nothing else in the query to match — a different claim, and
	 * `@in:book3` is what makes the difference worth drawing.
	 */
	source: "transcript" | "description" | "date" | "filter";
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
	transcriptLiteralShare: number;
	descriptionLiteralShare: number;
	descriptionMinMass: number;
	descriptionMassNormalization: number;
	transcriptLengthNormalization: number;
	descriptionLengthNormalization: number;
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
	// The share of the query's terms a field must match outright — as written, extended, or in
	// another inflection — before a spelling correction is allowed to carry the rest. Coverage
	// is rarity-weighted, so two rare words can answer a ten-word query; this is the plain
	// count, which they cannot, and it is the only thing standing between a reader and a strip
	// about a ping-pong ball when they asked for `ding dong rosalyn`.
	//
	// Measured, not swept: every gain here is under the sweep's 0.005 threshold, so it would
	// keep 0 forever. At 0.2 nothing regresses — train recited 0.9211 -> 0.9218, described
	// 0.8542 -> 0.8544, held-out 0.9308 -> 0.9318, both golden intents still 1.000, no
	// zero-result query, and the monotonicity, collapse and hollow guards unmoved. What it
	// removes from `ding dong rosalyn` is the four strips that had matched nothing but a
	// correction: a ping-pong ball, a game of Calvinball, a leaf collection, and `dying`.
	// Not higher: at 0.3 the zero-result rate leaves nought and recited starts falling.
	transcriptLiteralShare: 0.2,
	descriptionLiteralShare: 0.2,
	// Raised from 1.5 together with the normalization below, which is the only way it could move:
	// at normalization 0 this threshold is inert at every value up to 3.5 and destructive from 4,
	// so neither knob does anything without the other. A sweep works one parameter at a time and
	// therefore cannot find this pair — see question 5.
	descriptionMinMass: 2.5,
	// How much of the query's length is divided out of the mass gate: `achieved / matched ** b`,
	// so 0 is the raw sum this has always compared and 1 is the mean mass per matched term.
	//
	// The gate asks whether a query has enough content to be worth answering from descriptions, but
	// `achieved` sums over query terms, so it grows with query length and answers a different
	// question. Measured 2026-08-12: `snow` scores 3.90 and the class D archetype `calvin tells
	// hobbes about his mom` scores 5.42, so the flood outweighs the keyword and no threshold
	// separates them — which is why the gate has been inert from 0 to 3.5 and, at 4, takes all 110
	// of `snow`'s description results while the hollow mean falls only from 179 to 167.
	//
	// Measured, not swept, and it has to be set jointly with the threshold above. At 1 with a
	// threshold of 2.5 the hollow queries of class D fall from 179 results to 103 while every other
	// measure holds exactly: train recited 0.9261, described 0.8538, held out unchanged, 27 absent
	// targets, both golden intents 1.000, all six description probes at full strength and every
	// monotonicity probe intact. Not higher: at a threshold of 3 a real target starts to fail.
	//
	// Once shipped, the existing bloat guard defends it without anything new being written — the
	// baseline hollow mean is 103, so its 1.5x ceiling is 154 and every route back to the old
	// behaviour lands at 179 and is rejected.
	descriptionMassNormalization: 1,
	// Pivoted document-length normalization, `1 - b + b * (length / average length)`, dividing the
	// field's strength. 0 leaves the score untouched, which is what the engine has always done; 1
	// is full normalization, where a match in a field of twice the average is worth half as much.
	//
	// There is currently none, and the bias runs toward long fields rather than being merely
	// absent: repetition is counted as `1 + repeatWeight * log2(repeated)`, and a longer field has
	// more room to repeat a word. `transmogrifier` scores 1.3550 in a 117-word transcript against
	// 1.1050 in a 25-word one. That is not evenly spread over the corpus — Sunday transcripts
	// average 89.9 words against a weekday's 47.8 — so it is a systematic advantage for Sundays.
	//
	// Both measured, not swept, and both gain less than the sweep's 0.005 threshold on the intent
	// they are judged against, so a sweep would keep 0 forever.
	//
	// 0 for transcripts, and the measurement is the reason rather than caution. 0.25 is worth
	// +0.0017 on the recited intent — a third of the sweep's own threshold — and it costs a pinned
	// property: `repeatVariety` exists to make a transcript saying `snow` and `snowball` outrank
	// one saying `snow` once, and at 0.25 the seven-word strip falls behind the four-word one
	// because length cancels the variety bonus. `test/search.test.ts` fails on exactly that case.
	// A third of a threshold does not buy a property, which is the same trade
	// `transcriptInflectionWeight` refused. Above 0.25 the described intent falls too, and at 1 a
	// golden recitation goes with it.
	//
	// 0.1 for descriptions, which is the largest value that is no worse anywhere. It is worth
	// +0.0067 on the described intent — above the sweep's threshold, unlike most of these — and
	// +0.0022 recited, with held out improving on both. Not higher: at 0.15 the golden described
	// set drops to 0.978, because `learning to ride a bicycle crash` then ranks 1986-09-02 first.
	// Those two strips are consecutive days of one story and both descriptions are about learning
	// to ride and crashing, so it is a knife-edge rather than a clear error — but the golden set is
	// a guard rail and the rule is that it does not regress. The gain from 0.15 to 0.25 is real
	// (described reaches 0.8680) and is available if that query is ever re-examined.
	transcriptLengthNormalization: 0,
	descriptionLengthNormalization: 0.1,
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

/**
 * What a date match is worth, by how precisely the reader named the date.
 *
 * Deliberately not part of `Tuning`. Every number in that block is measured against
 * `test/fixtures`, and no query in either fixture contains a date — `test/date-query.test.ts`
 * asserts as much — so `test/tune.ts` would be sweeping these against noise. They are calibrated
 * against the range text scores actually reach instead, which is a different kind of evidence and
 * belongs somewhere else. Do not add them to `CANDIDATES`.
 *
 * The ceiling a text score can reach is knowable from the code rather than guessed at:
 * `transcriptScore` is `strength * multiplier / normalizer` with `normalizer` at least
 * `1 + sequenceWeight`, so the multiplier can never lift a score above `strength`; `strength` is
 * `base / ceiling` with each term capped at its own ceiling, so only repetition can push it past
 * 1, at `1 + transcriptRepeatWeight * log2(repeats)`; and the agreement bonus adds at most 15%
 * more. Measured 2026-08-21 over the real archive, the highest score any query reaches is 2.316
 * (`i`), then 2.239 (`the`, `a`), 2.107 (`you`), 1.993 (`snow`), 1.702 (`calvin`), 1.499
 * (`rosalyn`). Across the 528 generated fixture queries the top score is p50 0.617, p90 1.158,
 * p99 1.318, max 1.574.
 *
 * `exact` at 3 clears all of that, and reaching it by repetition alone would take one query word
 * said 87 times in a single strip. A reader who wrote a whole date named one day, so it leads.
 * The cost is bounded: because the expression must be the entire query, an exact date can only
 * ever sit beside a handful of incidental text matches, so there is no case where it flattens a
 * real result set into the faintest grid shade.
 *
 * `narrow` at 1.5 is the band the strongest single keywords occupy — a good text match, not a
 * great one, for the 31 strips of a month or the 52 Sundays of a `sunday 1988`. It is close to
 * unfalsifiable in this archive: `august 1988` and `november 28 1985` return no text results at
 * all, so nothing competes with it.
 *
 * `broad` at 0.8 is below a strong text match, which is what a bare year should be, and it is the
 * one rung the archive can actually demonstrate. `1988` matches 366 strips by date and exactly
 * two by dialogue — 1988-10-27 at 1.107 and 1987-06-22 at 1.103, the only strips in the archive
 * whose text contains a year — and those two are what the reader wants first. Not lower: the year
 * then lands at 0.65 of the top score, tier 3 of 5, so the calendar lights up legibly instead of
 * at the faintest shade.
 */
export const DATE_STRENGTH: Record<DatePrecision, number> = { exact: 3, narrow: 1.5, broad: 0.8 };

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
	// Mean words per *field*, not per document: a comic with an alternate is one document but two
	// transcripts, and length normalization divides a single field's score, so the average it is
	// measured against has to be counted the same way.
	averageFieldLength: number;
}

interface Expansion {
	matchWeights: Map<string, number>;
	contributions: Map<string, number>;
	// The subset of `matchWeights` reached without spelling correction.
	literalWords: Set<string>;
	ceiling: number;
	rarity: number;
	present: boolean;
}

interface FieldHits {
	positions: number[];
	terms: number[];
	weights: number[];
	contributions: number[];
	literal: boolean[];
}

interface Summary {
	base: number;
	achieved: number;
	// How many query terms this field actually hit. The mass gate divides by it, so that the
	// question it asks is "were the words you matched specific ones" rather than "how many were
	// there" — a sum over terms answers the second and was never meant to.
	matched: number;
	ceiling: number;
	coverage: number;
	// The share of the query's live terms this field matched without spelling correction.
	// Coverage is rarity-weighted, so a couple of rare words can stand in for a whole query;
	// this is the plain count, which they cannot.
	literalShare: number;
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
	return { name, documentFrequency: new Map(), documentCount: 0, inflections: new Map(), averageFieldLength: 0 };
}

function averageFieldLength(fields: IndexedField[][]): number {
	let words = 0;
	let count = 0;
	for (const group of fields)
		for (const field of group) {
			words += field.words.length;
			count++;
		}
	return count === 0 ? 0 : words / count;
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
	const transcriptFields: IndexedField[][] = [];
	const descriptionFields: IndexedField[][] = [];
	for (const comic of state.comics) {
		const transcripts = [indexField(comic.transcript, interned)];
		if (comic.alternate) transcripts.push(indexField(comic.alternate, interned));

		const descriptionText = state.descriptions?.get(comic.id || comic.date);
		const description = descriptionText ? indexField(descriptionText, interned) : null;

		countDocument(transcriptCorpus, transcripts);
		transcriptFields.push(transcripts);
		if (description) {
			countDocument(descriptionCorpus, [description]);
			descriptionFields.push([description]);
		}

		indexedComics.push({ comic, transcripts, description });
	}

	indexInflections(transcriptCorpus);
	indexInflections(descriptionCorpus);
	transcriptCorpus.averageFieldLength = averageFieldLength(transcriptFields);
	descriptionCorpus.averageFieldLength = averageFieldLength(descriptionFields);
}

/**
 * Pivoted length normalization, the BM25 shape: at 0 the divisor is 1 and the score is untouched,
 * at 1 a field of twice the average is worth half as much. Floored well above zero because an
 * empty field would otherwise divide by `1 - b`, which is 0 at full normalization.
 */
function lengthPivot(field: IndexedField, corpus: Corpus, normalization: number): number {
	if (normalization === 0 || corpus.averageFieldLength === 0) return 1;
	return Math.max(0.01, 1 - normalization + normalization * (field.words.length / corpus.averageFieldLength));
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
	const literalWords = new Set<string>();
	let bestContribution = 0;
	let bestRarity = 0;

	for (const word of corpus.documentFrequency.keys()) {
		let weight = 0;
		// The word as written, extended, or in another inflection is the word. A word within an
		// edit or two is a guess at what was meant, which is a different kind of evidence and is
		// tracked separately: the weights cannot tell them apart, since a description inflection
		// and a single typo are both 0.7.
		let literal = false;
		if (word === term) {
			weight = EXACT_WEIGHT;
			literal = true;
		} else if (word.length > term.length && word.startsWith(term)) {
			weight = PREFIX_WEIGHT;
			literal = true;
		} else if (maxDistance > 0) {
			const distance = boundedDistance(word, term, maxDistance);
			if (distance > 0 && distance <= maxDistance) weight = DISTANCE_WEIGHTS[distance];
		}
		// Taken as a floor rather than a replacement: `sinks` and `sink` are one edit apart and
		// would otherwise be scored as a typo, at 0.7, when they are the same word.
		if (inflections !== undefined && inflections.has(word)) {
			weight = Math.max(weight, inflectionWeight);
			literal = literal || inflectionWeight > 0;
		}
		if (weight === 0) continue;
		if (literal) literalWords.add(word);

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
			? { matchWeights: new Map(), contributions: new Map(), literalWords: new Set(), ceiling: 0, rarity, present }
			: { matchWeights, contributions, literalWords, ceiling, rarity, present };

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
	const hits: FieldHits = { positions: [], terms: [], weights: [], contributions: [], literal: [] };

	for (let index = 0; index < field.words.length; index++) {
		const word = field.words[index];
		for (let term = 0; term < expansions.length; term++) {
			const weight = expansions[term].matchWeights.get(word);
			if (weight === undefined) continue;
			hits.positions.push(index);
			hits.terms.push(term);
			hits.weights.push(weight);
			hits.contributions.push(expansions[term].contributions.get(word)!);
			hits.literal.push(expansions[term].literalWords.has(word));
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
	const literal = new Uint8Array(termCount);

	for (let index = 0; index < hits.positions.length; index++) {
		const term = hits.terms[index];
		const contribution = hits.contributions[index];
		counts[term]++;
		if (hits.literal[index]) literal[term] = 1;
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
	// A term the query asked for that this corpus can answer at all. One absent from both
	// corpora is a typo with nothing behind it and is already excluded from the ceiling, so
	// counting it here would ask a field to match a word that does not exist.
	let live = 0;
	let literalTerms = 0;
	let matched = 0;
	for (let term = 0; term < termCount; term++) {
		if (ceilings[term] > 0) {
			live++;
			literalTerms += literal[term];
		}
		// Capped at the ceiling, which is anchored on the term as typed: correcting `help` to
		// the rarer `held` must never score higher than matching `help` itself.
		const contribution = Math.min(best[term], ceilings[term]);
		ceiling += ceilings[term];
		achieved += contribution;
		// At variety 1 this is the hit count and `repeats` was never filled, which the blend
		// gives back exactly; at 0 it is the most any one word was repeated.
		const repeated = repeats[term] + variety * (counts[term] - repeats[term]);
		if (counts[term] > 0) {
			matched++;
			base += contribution * (1 + repeatWeight * Math.log2(repeated));
		}
	}

	return {
		base,
		achieved,
		matched,
		ceiling,
		coverage: ceiling > 0 ? achieved / ceiling : 0,
		// Only asked of a query with something else in it. At one term there is no rest of the
		// query for a correction to over-carry, and `requiredCoverage` already demands the whole
		// of it there — so applying this too would not bound typo tolerance, it would delete it,
		// and `transmogrifer` would find nothing at all.
		literalShare: live > 1 ? literalTerms / live : 1,
	};
}

/**
 * Weighted longest common subsequence of the query against the matched field positions,
 * plus the longest stretch of it that is contiguous in the field.
 *
 * `breaks` holds the positions in `order` where the query itself was not continuous, because an
 * `@` filter was lifted out from between two words. A run may not cross one: the reader did not
 * write those words side by side, so a field that says them side by side has not matched a
 * phrase they typed. Only contiguity is affected — a filter reorders nothing, so the subsequence
 * is indifferent to it — and `order.length` is unchanged, so this withholds a bonus rather than
 * levying a penalty. That makes a filter a stronger separator than punctuation, which is ignored
 * outright; the asymmetry is the point, since punctuation is text and a filter is an excision.
 */
function orderedSubsequence(order: number[], hits: FieldHits, breaks: Set<number>): { lcs: number; run: number } {
	const rows = order.length;
	const columns = hits.positions.length;
	let previous = new Float64Array(columns + 1);
	let current = new Float64Array(columns + 1);
	let previousRun = new Float64Array(columns + 1);
	let currentRun = new Float64Array(columns + 1);
	let run = 0;

	for (let row = 1; row <= rows; row++) {
		const continues = !breaks.has(row - 1);
		for (let column = 1; column <= columns; column++) {
			const weight = hits.terms[column - 1] === order[row - 1] ? hits.weights[column - 1] : 0;
			if (weight > 0) {
				current[column] = Math.max(previous[column - 1] + weight, previous[column], current[column - 1]);
				const adjacent = continues && column > 1 && hits.positions[column - 2] === hits.positions[column - 1] - 1;
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
	corpus: Corpus,
	expansions: Expansion[],
	ceilings: Float64Array,
	required: number,
	order: number[],
	breaks: Set<number>,
	tuning: Tuning,
): TranscriptMatch | null {
	const hits = collectHits(field, expansions);
	if (hits.positions.length === 0) return null;

	const summary = summarise(hits, ceilings, tuning.transcriptRepeatWeight, tuning.repeatVariety);
	if (summary.ceiling === 0 || summary.coverage < required) return null;
	if (summary.literalShare < tuning.transcriptLiteralShare) return null;

	const { lcs, run } = orderedSubsequence(order, hits, breaks);
	const proportionalRun = run / order.length;

	return {
		strength: summary.base / summary.ceiling / lengthPivot(field, corpus, tuning.transcriptLengthNormalization),
		multiplier: 1 + tuning.sequenceWeight * (lcs / order.length) + tuning.runWeight * proportionalRun ** 2,
		ranges: matchRanges(field, hits, expansions, tuning.transcriptIdfFloor),
	};
}

function scoreDescription(
	field: IndexedField,
	corpus: Corpus,
	expansions: Expansion[],
	ceilings: Float64Array,
	required: number,
	tuning: Tuning,
): FieldMatch | null {
	const hits = collectHits(field, expansions);
	if (hits.positions.length === 0) return null;

	const summary = summarise(hits, ceilings, tuning.descriptionRepeatWeight, tuning.repeatVariety);
	if (summary.ceiling === 0 || summary.coverage < required) return null;
	// Divided by the query's own length before the comparison, so the threshold means the same
	// thing to a one-word query as to a six-word one. At normalization 0 the divisor is 1 and this
	// is the raw sum it has always been.
	const mass = summary.achieved / Math.max(1, summary.matched) ** tuning.descriptionMassNormalization;
	if (mass < tuning.descriptionMinMass) return null;
	if (summary.literalShare < tuning.descriptionLiteralShare) return null;

	return {
		score: summary.base / summary.ceiling / lengthPivot(field, corpus, tuning.descriptionLengthNormalization),
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
	const { filters, residual, segments } = parseDateFilters(loweredQuery);

	let results: SearchResult[];
	if (residual === "") {
		// Filters with nothing left to search: the filter is the whole query, so everything that
		// passes it is a result. This is the only place a filter produces a row instead of removing
		// one.
		results = filterOnlyResults(filters!);
	} else {
		results = searchText(segments, residual, tuning);
		// Implicit date search is all or nothing: `parseDateExpression` returns null unless the whole
		// residual is a date, so the text query is never rewritten and the coverage arithmetic in
		// `rankedSearch` never sees a stray year or day number.
		const expression = parseDateExpression(residual);
		if (expression !== null) results = withDateMatches(results, expression, tuning);
		// Filters restrict the finished set. Applied before the union, they would let a date match
		// through that the reader had explicitly excluded.
		if (filters !== null) results = results.filter((result) => passesFilters(result.comic, filters));
	}

	// Date order is purely chronological: the score decided which strips are here, not where they
	// sit. Rank order puts the score first and falls back to the same chronology for ties.
	if (sort === "rank") {
		results.sort((a, b) => b.score - a.score || compareChronologically(a, b));
	} else {
		results.sort(compareChronologically);
	}

	return results;
}

/**
 * The query is decomposed the same way the index is, so `order`, `effectiveTerms` and the
 * coverage denominators are all derived from the split form and the two sides agree. One segment
 * per stretch of the query between `@` filters, so the ranked path can tell where the reader's
 * own words were not continuous.
 */
function searchText(segments: string[], residual: string, tuning: Tuning): SearchResult[] {
	const sequences = segments.map((segment) =>
		[...segment.matchAll(WORD_PATTERN)].flatMap((match) => decompose(match[0])),
	);
	if (sequences.every((sequence) => sequence.length === 0)) return literalSearch(residual);
	return rankedSearch(sequences, tuning);
}

/** The transcript a date match shows. A wordless strip has none, so it shows its description. */
function dateText(indexed: IndexedComic): string {
	return indexed.comic.transcript || indexed.description?.text || "";
}

/**
 * Adds the strips the date names to whatever the text search found.
 *
 * A strip that matched both keeps its text row: the highlight is the more useful thing to show,
 * and the date is already in the header either way. Only the score combines, the same way a
 * transcript and a description combine, because it is the same question — two independent kinds
 * of evidence agreeing. So `source: "date"` marks the rows that matched by date and nothing else,
 * which is what makes the label worth reading.
 */
function withDateMatches(textResults: SearchResult[], expression: DateExpression, tuning: Tuning): SearchResult[] {
	const strength = DATE_STRENGTH[expression.precision];
	// Keyed on the comic itself rather than on its date: two strips can share a date, and
	// `rankedSearch` returns the very objects the index holds, so identity is exact and free.
	const matched = new Set<Comic>();
	for (const indexed of indexedComics) {
		if (matchesExpression(expression, indexed.comic.date)) matched.add(indexed.comic);
	}

	const results: SearchResult[] = [];
	const covered = new Set<Comic>();
	for (const result of textResults) {
		covered.add(result.comic);
		if (!matched.has(result.comic)) {
			results.push(result);
			continue;
		}
		const score = Math.max(result.score, strength) + tuning.agreementBonus * Math.min(result.score, strength);
		results.push({ ...result, score });
	}

	for (const indexed of indexedComics) {
		if (!matched.has(indexed.comic) || covered.has(indexed.comic)) continue;
		results.push({ comic: indexed.comic, text: dateText(indexed), ranges: [], score: strength, source: "date" });
	}

	return results;
}

function filterOnlyResults(filters: DateFilters): SearchResult[] {
	const results: SearchResult[] = [];
	for (const indexed of indexedComics) {
		if (!passesFilters(indexed.comic, filters)) continue;
		// Every row ties, and `assignTiers` normalises on the top score, so the number only has to
		// be positive; `broad` is the honest one, because a filter restricts rather than ranks.
		//
		// And `filter` rather than `date`, because these rows did not match a date: they are what is
		// left after the filters had their say. Most of the time that amounts to the same thing and
		// the old label was near enough — but `@in:book3` is not a date by any reading, and a badge
		// saying so on all 274 of its rows would be plainly wrong.
		results.push({
			comic: indexed.comic,
			text: dateText(indexed),
			ranges: [],
			score: DATE_STRENGTH.broad,
			source: "filter",
		});
	}
	return results;
}

/**
 * The archive's own ordering, mirroring `build-chain/exportComicsJson.ts`: date, then comic id.
 * Only specials carry an id, so the empty string keeps a daily ahead of a special sharing its
 * date. Without the id the two strips on 1985-11-28 would be left in whatever order the index
 * happened to visit them.
 */
function compareChronologically(a: SearchResult, b: SearchResult): number {
	return a.comic.date.localeCompare(b.comic.date) || (a.comic.id || "").localeCompare(b.comic.id || "");
}

function rankedSearch(sequences: string[][], tuning: Tuning): SearchResult[] {
	const sequence = sequences.flat();
	const terms = [...new Set(sequence)];
	const termIndices = new Map(terms.map((term, index) => [term, index]));
	const order = sequence.map((term) => termIndices.get(term)!);

	// Where one segment of the query ends and the next begins, because a filter sat between them.
	// A segment that tokenized to nothing contributes no boundary of its own.
	const breaks = new Set<number>();
	let boundary = 0;
	for (const segment of sequences) {
		if (segment.length === 0) continue;
		if (boundary > 0) breaks.add(boundary);
		boundary += segment.length;
	}

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
			const match = scoreTranscript(
				field,
				transcriptCorpus,
				transcriptExpansions,
				transcriptCeilings,
				transcriptRequired,
				order,
				breaks,
				tuning,
			);
			if (match === null) continue;
			if (transcript === null || match.strength * match.multiplier > transcript.strength * transcript.multiplier) {
				transcript = match;
				transcriptText = field.text;
			}
		}
		if (transcript !== null && transcript.multiplier > bestMultiplier) bestMultiplier = transcript.multiplier;

		const summary = description
			? scoreDescription(
					description,
					descriptionCorpus,
					descriptionExpansions,
					descriptionCeilings,
					descriptionRequired,
					tuning,
				)
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
