/**
 * The compound lexicon of `src/compounds.ts`, read from the archive and the compounds `config.yaml` gives.
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
 * The compounds `config.yaml` gives adjust the rule from both sides: the words it must keep whole, and the
 * compounds it cannot find, split by hand. Both are optional, and so are the compounds, which can be false. The lexicon
 * is derived on every build rather than checked in, so a corrected transcript is reflected the
 * next time the site is built.
 */
import path from "path";
import type { LoaderContext } from "webpack";
import type { CompoundRelation } from "../src/compounds";
import { loadComicSource } from "./comicSource";
import { watchConfig, loadOptionalPart } from "./siteConfig";

const WORD_PATTERN = /[\p{L}\p{N}']+/gu;

// Both halves must be real words of their own, and long enough not to be an artefact:
// a two-letter fragment matches far too much to be worth the split.
export const MINIMUM_PART = 3;

// The open form must be at least this common before a split is considered at all, so a
// single stray occurrence cannot decompose a word across the whole archive.
const MINIMUM_OPEN = 2;

const PREFERENCES: readonly CompoundRelation["preference"][] = ["closed", "balanced", "open"];

/** What `compounds.yaml` says: the words to keep whole, and the compounds split by hand. */
export interface CompoundsFile {
	keepWhole: Set<string>;
	compounds: CompoundRelation[];
}

export interface Counts {
	words: Map<string, number>;
	bigrams: Map<string, number>;
}

function defaultProjectDir(): string {
	return path.join(__dirname, "..");
}

/** A single lowercase word, as the tokeniser would produce it. */
function isWord(value: string): boolean {
	return (
		value === value.toLowerCase() && [...value.matchAll(WORD_PATTERN)].map((match) => match[0]).join(" ") === value
	);
}

/**
 * The compounds `config.yaml` gives, checked; none where it sets them to false, or imports a file with
 * nothing in it.
 */
export function readCompoundsFile(projectDir = defaultProjectDir()): CompoundsFile {
	const value = loadOptionalPart("compounds", projectDir);
	if (value === false || value === null) return { keepWhole: new Set(), compounds: [] };
	const raw = value as Record<string, unknown>;
	if (typeof raw !== "object" || Array.isArray(raw))
		throw new Error("compounds in config.yaml must be a mapping, or false");
	for (const key of Object.keys(raw)) {
		if (key !== "keepWhole" && key !== "compounds") throw new Error(`compounds has an unknown setting, ${key}`);
	}

	const keepWhole = new Set<string>();
	const rawKeep = raw.keepWhole ?? [];
	if (!Array.isArray(rawKeep)) throw new Error("keepWhole in compounds must be a list of words");
	for (const word of rawKeep) {
		if (typeof word !== "string" || !isWord(word) || word.includes(" ")) {
			throw new Error(`keepWhole in compounds lists ${JSON.stringify(word)}, which is not one lowercase word`);
		}
		keepWhole.add(word);
	}

	const compounds: CompoundRelation[] = [];
	const seen = new Set<string>();
	const rawGroups = (raw.compounds ?? {}) as Record<string, unknown>;
	if (typeof rawGroups !== "object" || Array.isArray(rawGroups)) {
		throw new Error("compounds in compounds must be a mapping of closed, balanced and open");
	}
	for (const [group, entries] of Object.entries(rawGroups)) {
		const preference = PREFERENCES.find((candidate) => candidate === group);
		if (!preference) throw new Error(`compounds in compounds has an unknown group, ${group}`);
		if (entries === null) continue;
		if (typeof entries !== "object" || Array.isArray(entries)) {
			throw new Error(`compounds.${group} in compounds must map each compound to its parts`);
		}
		for (const [whole, written] of Object.entries(entries as Record<string, unknown>)) {
			const parts = typeof written === "string" ? written.split(" ") : [];
			if (
				!isWord(whole) ||
				whole.includes(" ") ||
				typeof written !== "string" ||
				!isWord(written) ||
				parts.length < 2
			) {
				throw new Error(`compounds.${group}.${whole} in compounds must be one lowercase word split into two or more`);
			}
			if (seen.has(whole)) throw new Error(`compounds lists ${whole} more than once`);
			if (keepWhole.has(whole)) throw new Error(`compounds both splits ${whole} and keeps it whole`);
			seen.add(whole);
			compounds.push({ whole, parts, preference });
		}
	}

	return { keepWhole, compounds };
}

function tokenise(text: string): string[] {
	return [...text.matchAll(WORD_PATTERN)].map((match) => match[0].toLowerCase());
}

/**
 * How many strips use each word, and each pair of words side by side.
 *
 * Document frequency, not term frequency: one strip counts once however often it repeats a
 * word, matching how `countDocument` builds the corpus the scorer reads.
 */
export function countCorpus(projectDir = defaultProjectDir()): Counts {
	const source = loadComicSource(projectDir);
	const words = new Map<string, number>();
	const bigrams = new Map<string, number>();

	for (const entry of [...Object.values(source.dailies), ...Object.values(source.specials)]) {
		const tokens = tokenise([entry.transcript, entry.alternate || "", entry.description || ""].join(" "));
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

/** Every compound the search splits, by its closed form, in alphabetical order. */
export function loadCompoundRelations(projectDir = defaultProjectDir()): [string, CompoundRelation][] {
	const { keepWhole, compounds } = readCompoundsFile(projectDir);
	const { words, bigrams } = countCorpus(projectDir);
	const lexicon = new Map<string, CompoundRelation>();

	for (const [closed, closedDf] of words) {
		if (keepWhole.has(closed)) continue;
		if (closed.length < MINIMUM_PART * 2) continue;

		for (let cut = MINIMUM_PART; cut <= closed.length - MINIMUM_PART; cut++) {
			const left = closed.slice(0, cut);
			const right = closed.slice(cut);
			if (!words.has(left) || !words.has(right)) continue;

			const openDf = bigrams.get(`${left} ${right}`) || 0;
			if (openDf < MINIMUM_OPEN || openDf < closedDf) continue;

			lexicon.set(closed, { whole: closed, parts: [left, right], preference: "open" });
			break;
		}
	}
	for (const compound of compounds) {
		lexicon.set(compound.whole, compound);
	}

	return [...lexicon].sort(([a], [b]) => a.localeCompare(b));
}

/**
 * Stands in for `src/compounds.ts` in the bundle, as `archiveSpan.ts` does for `src/archive.ts`:
 * the lexicon as a literal, rebuilt under `--watch` when the archive or `compounds.yaml` changes.
 */
export default function compoundLexiconLoader(this: LoaderContext<unknown>): string {
	const projectDir = this.rootContext;
	watchConfig(this, projectDir);
	const entries = JSON.stringify(loadCompoundRelations(projectDir));
	return [
		`const entries = ${entries};`,
		`export const COMPOUND_RELATIONS = new Map(entries);`,
		`export const COMPOUND_CANONICAL_FORMS = new Map(entries.map(([whole, relation]) => [whole, relation.parts]));`,
		"",
	].join("\n");
}
