import type { Compilation } from "webpack";
import { Arc, Character, Comic, CollectionIndex } from "../src/types";

/**
 * The archive as the site reads it: the parsed forms of the five JSON texts the app has — two it
 * fetches, and three built into its script (see `bundledData.ts`).
 *
 * `YamlToJsonPlugin` records it here for the compilation that made those texts, and `PagesPlugin`
 * reads it back to build the pages — from the same objects, round-tripped through the same JSON,
 * so a prerendered page and the page the app would draw for itself are built from equal data.
 */
export interface SiteData {
	comics: Comic[];
	reruns: Record<string, string>;
	collectionIndex: CollectionIndex;
	descriptions: Record<string, string>;
	arcs: Arc[];
	characters: Character[];
}

const dataByCompilation = new WeakMap<Compilation, SiteData>();

export function setSiteData(compilation: Compilation, data: SiteData): void {
	dataByCompilation.set(compilation, data);
}

export function getSiteData(compilation: Compilation): SiteData {
	const data = dataByCompilation.get(compilation);
	if (!data)
		throw new Error("Site data has not been emitted for this compilation; is YamlToJsonPlugin ahead of PagesPlugin?");
	return data;
}
