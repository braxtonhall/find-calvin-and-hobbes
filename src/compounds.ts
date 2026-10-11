/**
 * The compound words the search treats as their parts, so `goodnight` and `good night` find each
 * other: read from the archive and `compounds.yaml` by `build-chain/compoundLexicon.ts`. Beside
 * them, the misspellings `misspellings.yaml` gives, which the search treats as their words, so
 * `suzie` is `susie`.
 *
 * Relations preserve whole-form identity; canonical forms are a derived matching/indexing view,
 * with the misspellings folded in.
 *
 * Like `archive.ts`, this is the Node version, which reads the files from disk; the bundle never
 * runs it, because `build-chain/compoundLexicon.ts` replaces the module with the same values as a
 * literal. See `webpack.config.ts`, and `archive.ts` for why this is a `require`.
 */

export interface CompoundRelation {
	whole: string;
	parts: string[];
	preference: "open" | "closed" | "balanced";
}

declare function require(id: string): unknown;
const { loadCompoundRelations, loadCanonicalForms } = require("../build-chain/compoundLexicon") as {
	loadCompoundRelations(): [string, CompoundRelation][];
	loadCanonicalForms(config: undefined, relations: [string, CompoundRelation][]): [string, string[]][];
};

const entries = loadCompoundRelations();

export const COMPOUND_RELATIONS: Map<string, CompoundRelation> = new Map(entries);

export const CANONICAL_FORMS: Map<string, string[]> = new Map(loadCanonicalForms(undefined, entries));
