/**
 * Generates the user-editable candidate list consumed by compoundLexicon.ts.
 *
 * This deliberately includes every plausible balanced/closed split that can be found in the
 * corpus. The generated file is a curation surface: remove candidates that are not compounds
 * before running `yarn compounds`.
 */
import fs from "fs";
import path from "path";
import { loadComicSource } from "./comicSource";

const WORD_PATTERN = /[\p{L}\p{N}']+/gu;
const MINIMUM_PART = 3;
const DENY = new Set([
	"washer",
	"theirs",
	"programmed",
	"wormwood",
	"herewith",
	"outback",
	"sunset",
	"aaaaaa",
	"yowwow",
	"zzzzzzzz",
]);

interface Counts {
	words: Map<string, number>;
	bigrams: Map<string, number>;
}

export interface CompoundCandidate {
	whole: string;
	parts: string[];
	preference: "closed" | "balanced";
}

function count(documents: string[][]): Counts {
	const words = new Map<string, number>();
	const bigrams = new Map<string, number>();

	for (const tokens of documents) {
		const seenWords = new Set(tokens);
		const seenBigrams = new Set<string>();
		for (let index = 0; index + 1 < tokens.length; index++) {
			seenBigrams.add(`${tokens[index]} ${tokens[index + 1]}`);
		}
		for (const word of seenWords) words.set(word, (words.get(word) || 0) + 1);
		for (const bigram of seenBigrams) bigrams.set(bigram, (bigrams.get(bigram) || 0) + 1);
	}

	return { words, bigrams };
}

function tokenise(text: string): string[] {
	return [...text.matchAll(WORD_PATTERN)].map((match) => match[0].toLowerCase());
}

export function buildCandidates(projectDir: string): CompoundCandidate[] {
	const source = loadComicSource(path.join(projectDir, "comics.yaml"));
	const documents: string[][] = [];
	for (const entry of [...Object.values(source.dailies), ...Object.values(source.specials)]) {
		documents.push(tokenise([entry.transcript, entry.alternate || "", entry.description || ""].join(" ")));
	}

	const { words, bigrams } = count(documents);
	const candidates = new Map<string, CompoundCandidate>();
	for (const [closed, closedDf] of words) {
		if (DENY.has(closed) || closed.length < MINIMUM_PART * 2) continue;

		for (let cut = MINIMUM_PART; cut <= closed.length - MINIMUM_PART; cut++) {
			const parts = [closed.slice(0, cut), closed.slice(cut)];
			if (!words.has(parts[0]) || !words.has(parts[1])) continue;
			const openDf = bigrams.get(parts.join(" ")) || 0;
			if (openDf > closedDf) continue;

			candidates.set(closed, {
				whole: closed,
				parts,
				preference: openDf === closedDf ? "balanced" : "closed",
			});
			break;
		}
	}

	return [...candidates].sort(([a], [b]) => a.localeCompare(b)).map(([, candidate]) => candidate);
}

const projectDir = process.cwd();
const candidates = buildCandidates(projectDir);
const target = path.join(projectDir, "build-chain", "compound-candidates.json");
fs.writeFileSync(target, `${JSON.stringify(candidates, null, "\t")}\n`);
console.log(`wrote ${candidates.length} candidates to ${path.relative(projectDir, target)}`);
