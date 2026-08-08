import { Comic, SortMode } from "./types";
import { state } from "./state";

export interface SearchResult {
	comic: Comic;
	text: string;
	ranges: [number, number][];
	score: number;
	source: "transcript" | "description";
}

const WORD_PATTERN = /[\p{L}\p{N}']+/gu;

const EXACT_WEIGHT = 1;
const PREFIX_WEIGHT = 0.85;
const DISTANCE_WEIGHTS = [1, 0.7, 0.55];

const PHRASE_MULTIPLIER = 3;
const PROXIMITY_WEIGHT = 0.5;

const DESCRIPTION_WEIGHT = 0.3;
const DESCRIPTION_WINDOW_PER_TERM = 4;

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
	description: IndexedField | null;
}

interface FieldMatch {
	ranges: [number, number][];
	score: number;
	allStrong: boolean;
	window: number;
	phrase: boolean;
}

interface Expansion {
	weights: Map<string, number>;
	strong: Set<string>;
}

let indexedComics: IndexedComic[] = [];
let indexedSource: Comic[] | null = null;
let indexedDescriptions: Map<string, string> | null = null;
let vocabulary = new Map<string, number>();
let fieldCount = 0;
const expansionCache = new Map<string, Expansion>();

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
	if (indexedSource === state.comics && indexedDescriptions === state.descriptions) return;

	indexedSource = state.comics;
	indexedDescriptions = state.descriptions;
	indexedComics = [];
	vocabulary = new Map();
	expansionCache.clear();
	fieldCount = 0;

	const interned = new Map<string, string>();
	for (const comic of state.comics) {
		const fields = [indexField(comic.transcript, interned)];
		if (comic.alternate) fields.push(indexField(comic.alternate, interned));

		const descriptionText = state.descriptions?.get(comic.id || comic.date);
		const description = descriptionText ? indexField(descriptionText, interned) : null;

		fieldCount += fields.length + (description ? 1 : 0);
		indexedComics.push({ comic, fields, description });
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

function expandTerm(term: string): Expansion {
	const cached = expansionCache.get(term);
	if (cached) return cached;

	const maxDistance = maxDistanceFor(term);
	const weights = new Map<string, number>();
	const strong = new Set<string>();

	for (const [word, documentFrequency] of vocabulary) {
		let weight = 0;
		let isStrong = false;
		if (word === term) {
			weight = EXACT_WEIGHT;
			isStrong = true;
		} else if (word.length > term.length && word.startsWith(term)) {
			weight = PREFIX_WEIGHT;
			isStrong = true;
		} else if (maxDistance > 0) {
			const distance = boundedDistance(word, term, maxDistance);
			if (distance > 0 && distance <= maxDistance) weight = DISTANCE_WEIGHTS[distance];
		}
		if (weight > 0) {
			weights.set(word, weight * inverseDocumentFrequency(documentFrequency));
			if (isStrong) strong.add(word);
		}
	}

	const expansion: Expansion = { weights, strong };
	if (expansionCache.size >= MAX_CACHED_EXPANSIONS) expansionCache.clear();
	expansionCache.set(term, expansion);
	return expansion;
}

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

function matchField(field: IndexedField, expansions: Expansion[], loweredQuery: string): FieldMatch | null {
	const termCount = expansions.length;
	const bestWeights = new Float64Array(termCount);
	const counts = new Int32Array(termCount);
	const strongCounts = new Int32Array(termCount);
	const ranges: [number, number][] = [];
	const positions: number[] = [];
	const termIndices: number[] = [];

	for (let index = 0; index < field.words.length; index++) {
		const word = field.words[index];
		let marked = false;
		for (let term = 0; term < termCount; term++) {
			const weight = expansions[term].weights.get(word);
			if (weight === undefined) continue;
			counts[term]++;
			if (expansions[term].strong.has(word)) strongCounts[term]++;
			if (weight > bestWeights[term]) bestWeights[term] = weight;
			positions.push(index);
			termIndices.push(term);
			if (!marked) {
				ranges.push([field.starts[index], field.ends[index]]);
				marked = true;
			}
		}
	}

	let allStrong = true;
	for (let term = 0; term < termCount; term++) {
		if (counts[term] === 0) return null;
		if (strongCounts[term] === 0) allStrong = false;
	}

	let score = 0;
	for (let term = 0; term < termCount; term++) {
		score += bestWeights[term] * (1 + Math.log2(counts[term]));
	}

	let window = Infinity;
	if (termCount > 1) {
		window = minimalWindow(positions, termIndices, termCount);
		if (window !== Infinity) score *= 1 + PROXIMITY_WEIGHT * (termCount / window);
	}

	const phrase = field.lowered.includes(loweredQuery);
	if (phrase) score *= PHRASE_MULTIPLIER;

	return { ranges, score, allStrong, window, phrase };
}

function matchLiteral(field: IndexedField, loweredQuery: string): FieldMatch | null {
	const ranges: [number, number][] = [];
	let index = field.lowered.indexOf(loweredQuery);
	while (index !== -1) {
		ranges.push([index, index + loweredQuery.length]);
		index = field.lowered.indexOf(loweredQuery, index + loweredQuery.length);
	}
	if (ranges.length === 0) return null;
	return { ranges, score: ranges.length, allStrong: true, window: Infinity, phrase: true };
}

function queryTerms(loweredQuery: string): string[] {
	const terms: string[] = [];
	for (const match of loweredQuery.matchAll(WORD_PATTERN)) {
		if (!terms.includes(match[0])) terms.push(match[0]);
	}
	return terms;
}

function qualifiesOnDescriptionAlone(match: FieldMatch, termCount: number): boolean {
	if (!match.allStrong) return false;
	if (termCount <= 1) return true;
	return match.phrase || match.window <= termCount * DESCRIPTION_WINDOW_PER_TERM;
}

export function search(query: string, sort: SortMode): SearchResult[] {
	const trimmed = query.trim();
	if (!trimmed) return [];

	ensureIndex();

	const loweredQuery = trimmed.toLowerCase();
	const terms = queryTerms(loweredQuery);
	const expansions = terms.map(expandTerm);
	if (expansions.some((expansion) => expansion.weights.size === 0)) return [];

	const matchAgainst = (field: IndexedField): FieldMatch | null =>
		terms.length > 0 ? matchField(field, expansions, loweredQuery) : matchLiteral(field, loweredQuery);

	const results: SearchResult[] = [];
	for (const { comic, fields, description } of indexedComics) {
		let best: FieldMatch | null = null;
		let bestText = "";
		for (const field of fields) {
			const match = matchAgainst(field);
			if (match !== null && (best === null || match.score > best.score)) {
				best = match;
				bestText = field.text;
			}
		}

		const descriptionMatch = description ? matchAgainst(description) : null;
		const descriptionScore = descriptionMatch ? descriptionMatch.score * DESCRIPTION_WEIGHT : 0;

		if (best !== null) {
			results.push({
				comic,
				text: bestText,
				ranges: best.ranges,
				score: best.score + descriptionScore,
				source: "transcript",
			});
		} else if (descriptionMatch !== null && qualifiesOnDescriptionAlone(descriptionMatch, terms.length)) {
			results.push({
				comic,
				text: description!.text,
				ranges: descriptionMatch.ranges,
				score: descriptionScore,
				source: "description",
			});
		}
	}

	if (sort === "rank") {
		results.sort((a, b) => b.score - a.score || a.comic.date.localeCompare(b.comic.date));
	}

	return results;
}
