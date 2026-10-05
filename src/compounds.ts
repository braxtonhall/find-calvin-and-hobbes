/**
 * The compound words the search treats as their parts, so `goodnight` and `good night` find each
 * other: read from the archive and `compounds.yaml` by `build-chain/compoundLexicon.ts`.
 *
 * Relations preserve whole-form identity; canonical forms are a derived matching/indexing view.
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
const { loadCompoundRelations } = require("../build-chain/compoundLexicon") as {
	loadCompoundRelations(): [string, CompoundRelation][];
};

const entries = loadCompoundRelations();

export const COMPOUND_RELATIONS: Map<string, CompoundRelation> = new Map(entries);

export const COMPOUND_CANONICAL_FORMS: Map<string, string[]> = new Map(
	entries.map(([whole, relation]) => [whole, relation.parts]),
);
