/**
 * Generates `src/compounds.ts`, the closed-compound lexicon the search index splits on.
 *
 * `goodnight` and `good night` are the same phrase to a reader and two unrelated tokens to
 * the engine, which is how `aren't you going to say goodnight to hobbes` reaches a strip
 * that writes it open and finds nothing. Canonicalising both the index and the query onto
 * the open form removes the distinction.
 *
 * The rule is deliberately narrow: split a closed word only where this corpus itself
 * prefers the open spelling. A distinctive compound like `snowman` *is* the rare token
 * doing the admitting, so decomposing it spends the rarity that was buying precision —
 * splitting everything plausible breaks the monotonicity probes. Requiring the open form
 * to be at least as common as the closed one keeps those whole.
 *
 * Decompose only, never join. 277 open bigrams here have a closed form in the vocabulary,
 * and the frequent ones (`all the`, `in to`, `may be`, `a way`) would wreck any joining
 * rule. A splitting rule never sees them.
 *
 * Run with `yarn compounds` after correcting a transcript. The corpus is finished, so
 * nothing else changes the output.
 */
import fs from "fs";
import path from "path";
import { loadComicSource } from "./comicSource";

const WORD_PATTERN = /[\p{L}\p{N}']+/gu;

// Both halves must be real words of their own, and long enough not to be an artefact:
// a two-letter fragment matches far too much to be worth the split.
const MINIMUM_PART = 3;

// The open form must be at least this common before a split is considered at all, so a
// single stray occurrence cannot decompose a word across the whole archive.
const MINIMUM_OPEN = 2;

/**
 * Real words the rule mis-splits, kept whole by hand. `wormwood` matters most: splitting a
 * character's name into `worm` + `wood` would scatter the 153 strips that mention him.
 */
const DENY = new Set([
	"washer", // was her
	"theirs", // the irs
	"programmed", // pro grammed
	"wormwood",
	"herewith",
	"outback",
	// The open bigram here is a clause — "the sun set behind the hill" — not an alternate
	// spelling of the noun. Splitting spends the rarity of a word that appears in one strip.
	"sunset",
	"aaaaaa",
	"yowwow",
	"zzzzzzzz",
]);

interface Counts {
	words: Map<string, number>;
	bigrams: Map<string, number>;
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

function tokenise(text: string): string[] {
	return [...text.matchAll(WORD_PATTERN)].map((match) => match[0].toLowerCase());
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
	const lexicon = new Map<string, string[]>();

	for (const [closed, closedDf] of words) {
		if (DENY.has(closed)) continue;
		if (closed.length < MINIMUM_PART * 2) continue;

		for (let cut = MINIMUM_PART; cut <= closed.length - MINIMUM_PART; cut++) {
			const left = closed.slice(0, cut);
			const right = closed.slice(cut);
			if (!words.has(left) || !words.has(right)) continue;

			const openDf = bigrams.get(`${left} ${right}`) || 0;
			// The corpus must actually prefer the open spelling. Ties go to splitting, since
			// a compound written both ways is exactly the case this exists to unify.
			if (openDf < MINIMUM_OPEN || openDf < closedDf) continue;

			lexicon.set(closed, [left, right]);
			break;
		}
	}

	return new Map([...lexicon].sort(([a], [b]) => a.localeCompare(b)));
}

function render(lexicon: Map<string, string[]>): string {
	const entries = [...lexicon]
		.map(([closed, parts]) => `\t["${closed}", [${parts.map((part) => `"${part}"`).join(", ")}]],`)
		.join("\n");

	// Emitted tab-indented and double-quoted to match the prettier config, so the generated
	// file is already formatted. Running prettier repo-wide dirties the data files, so the
	// generator must not depend on it.
	return `// Generated by build-chain/compoundLexicon.ts — run \`yarn compounds\`. Do not edit by hand.
//
// Closed compounds this corpus writes more often in the open form. The index and the query
// are both rewritten onto the open spelling, so \`goodnight\` and \`good night\` are one thing.
// Compounds the corpus prefers closed — \`snowman\`, \`homework\`, \`bedtime\` — are absent by
// design: they are the rare tokens doing the admitting, and splitting them spends that rarity.

export const COMPOUNDS: Map<string, string[]> = new Map([
${entries}
]);
`;
}

const projectDir = process.cwd();
const lexicon = buildLexicon(projectDir);
const target = path.join(projectDir, "src", "compounds.ts");
fs.writeFileSync(target, render(lexicon));
console.log(`wrote ${lexicon.size} entries to ${path.relative(projectDir, target)}`);
for (const [closed, parts] of lexicon) console.log(`  ${closed} -> ${parts.join(" ")}`);
