/**
 * Lists the archive's likely compounds that `compounds.yaml` says nothing about yet, as lines to
 * paste into its `compounds` groups — or, for a real word that is not a compound, into `keepWhole`.
 *
 * This deliberately includes every plausible balanced/closed split that can be found in the
 * corpus, so it is a curation surface rather than a list to paste whole. Run with `yarn candidates`.
 */
import { CompoundRelation } from "../src/compounds";
import { MINIMUM_PART, countCorpus, readCompoundsFile } from "./compoundLexicon";

const OBVIOUS_SUFFIXES = new Set(["able", "al", "ed", "ing", "ive", "ly", "ment", "ness", "ous", "ted", "tion"]);

function isObviousFalsePositive(whole: string, parts: string[]): boolean {
	return whole.includes("'") || /(.)\1{2,}/.test(whole) || OBVIOUS_SUFFIXES.has(parts[1]);
}

export function buildCandidates(projectDir?: string): CompoundRelation[] {
	const { keepWhole, compounds } = readCompoundsFile(projectDir);
	const listed = new Set(compounds.map((compound) => compound.whole));
	const { words, bigrams } = countCorpus(projectDir);

	const candidates = new Map<string, CompoundRelation>();
	for (const [closed, closedDf] of words) {
		if (keepWhole.has(closed) || listed.has(closed) || closed.length < MINIMUM_PART * 2) continue;

		for (let cut = MINIMUM_PART; cut <= closed.length - MINIMUM_PART; cut++) {
			const parts = [closed.slice(0, cut), closed.slice(cut)];
			if (!words.has(parts[0]) || !words.has(parts[1])) continue;
			if (isObviousFalsePositive(closed, parts)) continue;
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

const candidates = buildCandidates(process.cwd());
for (const preference of ["closed", "balanced"] as const) {
	const group = candidates.filter((candidate) => candidate.preference === preference);
	if (group.length === 0) continue;
	console.log(`  ${preference}:`);
	for (const candidate of group) console.log(`    ${candidate.whole}: ${candidate.parts.join(" ")}`);
}
console.error(`${candidates.length} candidates not yet in compounds.yaml`);
