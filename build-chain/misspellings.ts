/**
 * The misspellings `config.yaml` gives: words a reader writes wrong so often, or so reasonably —
 * `suzie`, `colour` — that the search takes them as the word itself rather than as a guess at it.
 *
 * Folded into the search's canonical forms beside the compounds (see `compoundLexicon.ts`), so a
 * misspelling is indexed and queried as its word: it matches exactly, quoted or not, and a strip
 * that writes it is found by the word too.
 */
import { loadOptionalPart, configName } from "./siteConfig";

/** A single lowercase word, as the tokeniser would produce it. */
function isWord(value: unknown): value is string {
	return typeof value === "string" && value === value.toLowerCase() && /^[\p{L}\p{N}']+$/u.test(value);
}

/**
 * The misspellings `config.yaml` gives, checked, each to the word it means; none where it sets
 * them to false, or imports a file with nothing in it.
 */
export function readMisspellingsFile(config?: string): Map<string, string> {
	const value = loadOptionalPart("misspellings", config);
	const misspellings = new Map<string, string>();
	if (value === false || value === null) return misspellings;
	if (typeof value !== "object" || Array.isArray(value))
		throw new Error(`misspellings in ${configName(config)} must map each word to its misspellings, or false`);

	const words = Object.keys(value as Record<string, unknown>);
	for (const [word, written] of Object.entries(value as Record<string, unknown>)) {
		if (!isWord(word)) throw new Error(`misspellings lists ${JSON.stringify(word)}, which is not one lowercase word`);
		if (!Array.isArray(written)) throw new Error(`misspellings.${word} must be a list of words`);
		for (const misspelling of written) {
			if (!isWord(misspelling)) {
				throw new Error(`misspellings.${word} lists ${JSON.stringify(misspelling)}, which is not one lowercase word`);
			}
			if (misspelling === word) throw new Error(`misspellings.${word} lists the word itself`);
			if (words.includes(misspelling)) throw new Error(`misspellings lists ${misspelling} as a word and a misspelling`);
			if (misspellings.has(misspelling)) throw new Error(`misspellings lists ${misspelling} more than once`);
			misspellings.set(misspelling, word);
		}
	}

	return misspellings;
}
