import path from "path";
import type { LoaderContext } from "webpack";
import type { ArchiveSpan } from "../src/archive";
import { loadComicSource } from "./comicSource";

const DAY = 24 * 60 * 60 * 1000;

function iso(stamp: number): string {
	return new Date(stamp).toISOString().slice(0, 10);
}

/** The span of `src/archive.ts`, read from `comics.yaml` — this project's, unless told otherwise. */
export function loadArchiveSpan(yamlPath = path.join(__dirname, "..", "comics.yaml")): ArchiveSpan {
	const stamps = Object.keys(loadComicSource(yamlPath).dailies)
		.map((key) => Date.UTC(Number(key.slice(0, 4)), Number(key.slice(4, 6)) - 1, Number(key.slice(6, 8))))
		.sort((one, other) => one - other);
	if (stamps.length === 0) throw new Error(`${yamlPath} has no dailies to take the archive's span from`);

	const gaps: [string, string][] = [];
	for (let index = 1; index < stamps.length; index++) {
		if (stamps[index] - stamps[index - 1] > DAY) gaps.push([iso(stamps[index - 1] + DAY), iso(stamps[index] - DAY)]);
	}
	return { start: iso(stamps[0]), end: iso(stamps[stamps.length - 1]), gaps };
}

/**
 * Stands in for `src/archive.ts` in the bundle, which reads `comics.yaml` from disk — something the
 * build and the tests can do and a browser cannot. The span is written into the bundle as a
 * literal instead, and a change to `comics.yaml` rebuilds it under `--watch`.
 */
export default function archiveSpanLoader(this: LoaderContext<unknown>): string {
	const yamlPath = path.join(this.rootContext, "comics.yaml");
	this.addDependency(yamlPath);
	return `export const ARCHIVE_SPAN = ${JSON.stringify(loadArchiveSpan(yamlPath))};\n`;
}
