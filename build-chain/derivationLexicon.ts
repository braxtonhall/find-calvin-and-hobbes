/**
 * Seeds `src/derivations.ts`, the curated derivation list the search scorer reads.
 *
 * The general string-prefix rule (`word.startsWith(term)`) used to let a query reach any longer
 * word that began with it — `snow` reached `snowball`, which is right, and `car` reached
 * `carrot`, which is not. That rule is now off by default, and this list is what replaced its
 * useful half: the closed compounds a base word may legitimately reach, and nothing else.
 *
 * The rule is the mirror of `compoundLexicon`. That script splits a closed word where the corpus
 * prefers the open spelling; this one keeps a closed word whole but records the base word that
 * may reach it, where the corpus prefers the closed spelling. Ties go to splitting, so the two
 * lists never overlap.
 *
 * Two things are deliberately excluded before the list is even proposed, because they are not
 * derivations: inflections (where the closed form shares a stem with a half, e.g. `complain` ->
 * `complaining`) are the stemmer's job, and the right-hand half of a compound (`ball` in
 * `snowball`) is omitted because it is a generic head, not the distinctive half a reader types.
 *
 * This is still a candidate list, not the final answer: it emits every left half of a
 * closed-preferring compound, and the reader of the generated file is expected to prune the ones
 * that are noise (`car` -> `carrot` is a prefix, not a compound, but this script cannot tell).
 * Run with `yarn derivations` to regenerate the full set, then prune.
 */
import fs from "fs";
import path from "path";
import { loadComicSource } from "./comicSource";
import { stem } from "../src/stem";

const WORD_PATTERN = /[\p{L}\p{N}']+/gu;

// Both halves must be real words of their own, and long enough not to be an artefact: a
// two-letter fragment matches far too much to be worth recording.
const MINIMUM_PART = 3;

interface Counts {
	words: Map<string, number>;
	bigrams: Map<string, number>;
}

function tokenise(text: string): string[] {
	return [...text.matchAll(WORD_PATTERN)].map((match) => match[0].toLowerCase());
}

// Sound effects and elongations (`aaaa`, `brr`, `hmm`, `zzz`) repeat a couple of letters and
// would otherwise propose `aaa` -> `aaaaaa` and the like. A word needs three distinct letters
// to be a word worth reaching.
function distinctLetters(word: string): number {
	return new Set(word).size;
}

// Document frequency, not term frequency: one strip counts once however often it repeats a
// word, matching how `countDocument` builds the corpus the scorer reads.
function count(documents: string[][]): Counts {
	const words = new Map<string, number>();
	const bigrams = new Map<string, number>();

	for (const tokens of documents) {
		const seenWords = new Set<string>();
		const seenBigrams = new Set<string>();
		for (let index = 0; index < tokens.length; index++) {
			seenWords.add(tokens[index]);
			if (index + 1 < tokens.length) seenBigrams.add(`${tokens[index]} ${tokens[index + 1]}`);
		}
		for (const word of seenWords) words.set(word, (words.get(word) || 0) + 1);
		for (const bigram of seenBigrams) bigrams.set(bigram, (bigrams.get(bigram) || 0) + 1);
	}

	return { words, bigrams };
}

export function buildLexicon(projectDir: string): Map<string, string[]> {
	const source = loadComicSource(path.join(projectDir, "comics.yaml"));

	// A strip is one document across all of its text. Descriptions share `indexField` with
	// transcripts, so they have to inform the lexicon that will be applied to them.
	const documents: string[][] = [];
	for (const entry of [...Object.values(source.dailies), ...Object.values(source.specials)]) {
		documents.push(tokenise([entry.transcript, entry.alternate || "", entry.description || ""].join(" ")));
	}

	const { words, bigrams } = count(documents);
	const derivations = new Map<string, Set<string>>();

	for (const [closed, closedDf] of words) {
		if (closed.length < MINIMUM_PART * 2) continue;
		if (distinctLetters(closed) <= 2) continue;

		for (let cut = MINIMUM_PART; cut <= closed.length - MINIMUM_PART; cut++) {
			const left = closed.slice(0, cut);
			const right = closed.slice(cut);
			if (!words.has(left) || !words.has(right)) continue;

			// An inflection, not a derivation: the closed form shares a stem with one of its
			// halves (`complain` + `ing` -> `complaining`). The stemmer owns those.
			if (stem(closed) === stem(left) || stem(closed) === stem(right)) continue;

			const openDf = bigrams.get(`${left} ${right}`) || 0;
			// The corpus must prefer the closed spelling. Ties go to `compoundLexicon`, whose
			// split turns the closed form into these same two words; recording the reach here
			// too would double it.
			if (openDf >= closedDf) continue;

			// Only the left (modifier) half: `snow` reaches `snowball`, but `ball` does not —
			// the head is generic and every query for it is a flood, not a search.
			if (distinctLetters(left) > 2) add(derivations, left, closed);
			break;
		}
	}

	const sorted = new Map<string, string[]>();
	for (const [base, set] of [...derivations].sort(([a], [b]) => a.localeCompare(b))) {
		sorted.set(
			base,
			[...set].sort((a, b) => a.localeCompare(b)),
		);
	}
	return sorted;
}

function add(derivations: Map<string, Set<string>>, base: string, compound: string): void {
	const set = derivations.get(base) ?? new Set<string>();
	set.add(compound);
	derivations.set(base, set);
}

function render(lexicon: Map<string, string[]>): string {
	const entries = [...lexicon]
		.map(([base, compounds]) => `\t["${base}", [${compounds.map((compound) => `"${compound}"`).join(", ")}]],`)
		.join("\n");

	return `// Seeded by build-chain/derivationLexicon.ts — run \`yarn derivations\`, then prune by hand.
// Regenerating replaces this file with the full candidate set, so prune only after regenerating.
//
// The base words and the closed compounds they may legitimately reach. Only the pairs listed
// here bridge: \`snow\` reaches \`snowball\`, and \`car\` never reaches \`carrot\` because no
// entry says so. The general string-prefix rule this replaced is off by default. Inflections
// are the stemmer's job and stay out of this list.

export const DERIVATIONS: Map<string, string[]> = new Map([
${entries}
]);
`;
}

const projectDir = process.cwd();
const lexicon = buildLexicon(projectDir);
const target = path.join(projectDir, "src", "derivations.ts");
fs.writeFileSync(target, render(lexicon));
console.log(`wrote ${lexicon.size} bases to ${path.relative(projectDir, target)}`);
let pairs = 0;
for (const [base, compounds] of lexicon) {
	pairs += compounds.length;
	console.log(`  ${base} -> ${compounds.join(" ")}`);
}
console.log(`${pairs} pairs`);
