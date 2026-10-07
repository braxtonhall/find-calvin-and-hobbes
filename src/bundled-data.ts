import { Arc, Character, CollectionIndex, Creator } from "./types";

/**
 * The parts of the archive small enough to ship inside the script rather than fetch after it:
 * which days were reruns of which, the books, the arcs, the characters, and the creators. Together they are a few kilobytes,
 * and having them up front leaves `comics.json` and `descriptions.json` as the only requests the
 * app has to wait for.
 *
 * Like `archive.ts`, this is the Node version, which reads the data files from disk; the bundle
 * never runs it, because `build-chain/bundledData.ts` replaces the module with the same values as
 * literals. See `webpack.config.ts`, and `archive.ts` for why this is a `require`.
 */
declare function require(id: string): unknown;
const { loadBundledData } = require("../build-chain/bundledData") as {
	loadBundledData(): {
		RERUNS: Record<string, string>;
		COLLECTION_INDEX: CollectionIndex;
		ARCS: Arc[];
		CHARACTERS: Character[];
		CREATORS: Creator[];
	};
};

export const { RERUNS, COLLECTION_INDEX, ARCS, CHARACTERS, CREATORS } = loadBundledData();
