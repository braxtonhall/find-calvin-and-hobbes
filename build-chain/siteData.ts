import type { Compilation } from "webpack";
import { Comic, CollectionIndex } from "../src/types";

/**
 * The archive as the site reads it: the parsed forms of the three JSON files the app fetches.
 *
 * `YamlToJsonPlugin` records it here for the compilation that emitted those files, and
 * `PagesPlugin` reads it back to build the pages — from the same objects, round-tripped through
 * the same JSON, so a prerendered page and the page the app would draw from a fetch are built
 * from equal data.
 */
export interface SiteData {
	comics: Comic[];
	collectionIndex: CollectionIndex;
	descriptions: Record<string, string>;
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
