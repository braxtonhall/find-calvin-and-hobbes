import { Comic, SortMode } from "./types";
import { state } from "./state";

export interface SearchResult {
	comic: Comic;
	text: string;
	ranges: [number, number][];
	score: number;
}

const WORD_PATTERN = /[\p{L}\p{N}']+/gu;

const EXACT_WEIGHT = 1;
const PREFIX_WEIGHT = 0.85;
const DISTANCE_WEIGHTS = [1, 0.7, 0.55];

const PHRASE_MULTIPLIER = 3;
const PROXIMITY_WEIGHT = 0.5;

const MAX_CACHED_EXPANSIONS = 200;

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
	fields: IndexedField[];
}

interface FieldMatch {
	ranges: [number, number][];
	score: number;
}

let indexedComics: IndexedComic[] = [];
let indexedSource: Comic[] | null = null;
let vocabulary = new Map<string, number>();
let fieldCount = 0;
const expansionCache = new Map<string, Map<string, number>>();

function indexField(text: string, interned: Map<string, string>): IndexedField {
	const words: string[] = [];
	const starts: number[] = [];
	const ends: number[] = [];
	const seen = new Set<string>();

	for (const match of text.matchAll(WORD_PATTERN)) {
		const lowered = match[0].toLowerCase();
		let word = interned.get(lowered);
		if (word === undefined) {
			word = lowered;
			interned.set(word, word);
		}
		words.push(word);
		starts.push(match.index);
		ends.push(match.index + match[0].length);
		if (!seen.has(word)) {
			seen.add(word);
			vocabulary.set(word, (vocabulary.get(word) || 0) + 1);
		}
	}

	return { text, lowered: text.toLowerCase(), words, starts: Int32Array.from(starts), ends: Int32Array.from(ends) };
}

function ensureIndex(): void {
	if (indexedSource === state.comics) return;

	indexedSource = state.comics;
	indexedComics = [];
	vocabulary = new Map();
	expansionCache.clear();
	fieldCount = 0;

	const interned = new Map<string, string>();
	for (const comic of state.comics) {
		const fields = [indexField(comic.transcript, interned)];
		if (comic.alternate) fields.push(indexField(comic.alternate, interned));
		fieldCount += fields.length;
		indexedComics.push({ comic, fields });
	}
}

function inverseDocumentFrequency(documentFrequency: number): number {
	return Math.log(1 + fieldCount / documentFrequency);
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

function expandTerm(term: string): Map<string, number> {
	const cached = expansionCache.get(term);
	if (cached) return cached;

	const maxDistance = maxDistanceFor(term);
	const weights = new Map<string, number>();

	for (const [word, documentFrequency] of vocabulary) {
		let weight = 0;
		if (word === term) {
			weight = EXACT_WEIGHT;
		} else if (word.length > term.length && word.startsWith(term)) {
			weight = PREFIX_WEIGHT;
		} else if (maxDistance > 0) {
			const distance = boundedDistance(word, term, maxDistance);
			if (distance > 0 && distance <= maxDistance) weight = DISTANCE_WEIGHTS[distance];
		}
		if (weight > 0) weights.set(word, weight * inverseDocumentFrequency(documentFrequency));
	}

	if (expansionCache.size >= MAX_CACHED_EXPANSIONS) expansionCache.clear();
	expansionCache.set(term, weights);
	return weights;
}

/** Smallest span of words containing at least one hit for every term. */
function minimalWindow(positions: number[], termIndices: number[], termCount: number): number {
	const seen = new Int32Array(termCount);
	let distinct = 0;
	let left = 0;
	let smallest = Infinity;

	for (let right = 0; right < positions.length; right++) {
		if (seen[termIndices[right]]++ === 0) distinct++;
		while (distinct === termCount) {
			smallest = Math.min(smallest, positions[right] - positions[left] + 1);
			if (--seen[termIndices[left]] === 0) distinct--;
			left++;
		}
	}

	return smallest;
}

function matchField(field: IndexedField, expansions: Map<string, number>[], loweredQuery: string): FieldMatch | null {
	const termCount = expansions.length;
	const bestWeights = new Float64Array(termCount);
	const counts = new Int32Array(termCount);
	const ranges: [number, number][] = [];
	const positions: number[] = [];
	const termIndices: number[] = [];

	for (let index = 0; index < field.words.length; index++) {
		const word = field.words[index];
		let marked = false;
		for (let term = 0; term < termCount; term++) {
			const weight = expansions[term].get(word);
			if (weight === undefined) continue;
			counts[term]++;
			if (weight > bestWeights[term]) bestWeights[term] = weight;
			positions.push(index);
			termIndices.push(term);
			if (!marked) {
				ranges.push([field.starts[index], field.ends[index]]);
				marked = true;
			}
		}
	}

	for (let term = 0; term < termCount; term++) {
		if (counts[term] === 0) return null;
	}

	let score = 0;
	for (let term = 0; term < termCount; term++) {
		score += bestWeights[term] * (1 + Math.log2(counts[term]));
	}

	if (termCount > 1) {
		const window = minimalWindow(positions, termIndices, termCount);
		if (window !== Infinity) score *= 1 + PROXIMITY_WEIGHT * (termCount / window);
	}

	if (field.lowered.includes(loweredQuery)) score *= PHRASE_MULTIPLIER;

	return { ranges, score };
}

function matchLiteral(field: IndexedField, loweredQuery: string): FieldMatch | null {
	const ranges: [number, number][] = [];
	let index = field.lowered.indexOf(loweredQuery);
	while (index !== -1) {
		ranges.push([index, index + loweredQuery.length]);
		index = field.lowered.indexOf(loweredQuery, index + loweredQuery.length);
	}
	return ranges.length > 0 ? { ranges, score: ranges.length } : null;
}

function queryTerms(loweredQuery: string): string[] {
	const terms: string[] = [];
	for (const match of loweredQuery.matchAll(WORD_PATTERN)) {
		if (!terms.includes(match[0])) terms.push(match[0]);
	}
	return terms;
}

export function search(query: string, sort: SortMode): SearchResult[] {
	const trimmed = query.trim();
	if (!trimmed) return [];

	ensureIndex();

	const loweredQuery = trimmed.toLowerCase();
	const terms = queryTerms(loweredQuery);
	const expansions = terms.map(expandTerm);
	// A term that matches nothing in the corpus can never be satisfied.
	if (expansions.some((expansion) => expansion.size === 0)) return [];

	const results: SearchResult[] = [];
	for (const { comic, fields } of indexedComics) {
		let best: FieldMatch | null = null;
		let bestText = "";
		for (const field of fields) {
			const match = terms.length > 0 ? matchField(field, expansions, loweredQuery) : matchLiteral(field, loweredQuery);
			if (match !== null && (best === null || match.score > best.score)) {
				best = match;
				bestText = field.text;
			}
		}
		if (best !== null) {
			results.push({ comic, text: bestText, ranges: best.ranges, score: best.score });
		}
	}

	if (sort === "rank") {
		results.sort((a, b) => b.score - a.score || a.comic.date.localeCompare(b.comic.date));
	}

	return results;
}
