import fs from "fs";
import path from "path";
import type { LoaderContext } from "webpack";
import { exportArcsJson, loadArcs } from "./arcs";
import { loadCollectionData } from "./collectionPages";
import { loadComicSource } from "./comicSource";
import { generateCollectionIndex } from "./generateCollectionIndex";
import { exportRerunsJson } from "./reruns";
import { loadSiteConfig } from "./siteConfig";

/**
 * The small parts of the archive, as JSON: the same text `YamlToJsonPlugin` hands the page build,
 * from the same functions, so a prerendered page and the app agree about them.
 */
export interface BundledJson {
	reruns: string;
	collectionIndex: string;
	arcs: string;
}

export function loadBundledJson(projectDir = path.join(__dirname, "..")): BundledJson {
	const source = loadComicSource(path.join(projectDir, "comics.yaml"));
	const collectionData = loadCollectionData(projectDir);
	// The books' images are named from the mount, so the app can show them from any page as they are.
	const basePath = loadSiteConfig()?.basePath ?? "/";
	return {
		reruns: exportRerunsJson(projectDir, source),
		collectionIndex: generateCollectionIndex(collectionData, basePath),
		arcs: exportArcsJson(loadArcs(projectDir, source, collectionData)),
	};
}

/** For `src/bundled-data.ts` under Node; see there. */
export function loadBundledData(): { RERUNS: unknown; COLLECTION_INDEX: unknown; ARCS: unknown } {
	const json = loadBundledJson();
	return {
		RERUNS: JSON.parse(json.reruns),
		COLLECTION_INDEX: JSON.parse(json.collectionIndex),
		ARCS: JSON.parse(json.arcs),
	};
}

/**
 * Stands in for `src/bundled-data.ts` in the bundle, as `archiveSpan.ts` does for `src/archive.ts`.
 * Each value is written as a `JSON.parse` of a string rather than as an object literal, which is
 * both what it was before it was bundled and the faster of the two for an engine to read.
 */
export default function bundledDataLoader(this: LoaderContext<unknown>): string {
	const projectDir = this.rootContext;
	const collectionsDir = path.join(projectDir, "collections");
	for (const file of ["comics.yaml", "reruns.yaml", "arcs.yaml", ".env"])
		this.addDependency(path.join(projectDir, file));
	this.addContextDependency(collectionsDir);
	for (const file of fs.readdirSync(collectionsDir)) {
		if (file.endsWith(".yaml")) this.addDependency(path.join(collectionsDir, file));
	}

	const json = loadBundledJson(projectDir);
	const parsed = (text: string) => `JSON.parse(${JSON.stringify(text)})`;
	return [
		`export const RERUNS = ${parsed(json.reruns)};`,
		`export const COLLECTION_INDEX = ${parsed(json.collectionIndex)};`,
		`export const ARCS = ${parsed(json.arcs)};`,
		"",
	].join("\n");
}
