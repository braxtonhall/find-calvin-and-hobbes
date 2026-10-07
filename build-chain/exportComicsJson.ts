import fs from "fs";
import path from "path";
import { Appearance, CollectionData } from "./collectionPages";
import { DailyEntry, loadComicSource } from "./comicSource";
import { Arc, Character } from "../src/types";
import { stripCharacters } from "./characters";

const EXTENSIONS = [".gif", ".jpg", ".jpeg", ".png", ".webp", ".bmp"];

function findImage(key: string, assetsDir: string, basePath: string): string {
	for (const ext of EXTENSIONS) {
		const candidate = path.join(assetsDir, `${key}${ext}`);
		if (fs.existsSync(candidate)) {
			// From the mount, since the page showing it may live at any depth.
			return `${basePath}assets/comics/${key}${ext}`;
		}
	}
	return "";
}

function formatDate(dateStr: string): string {
	return `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;
}

interface Entry {
	date: string;
	transcript: string;
	alternate?: string;
	image?: string;
	id?: string;
	sort?: number;
	aspectRatio?: number;
	appearances?: Appearance[];
	arcs?: string[];
	characters?: string[];
}

/**
 * `basePath` is where the site is mounted, `/` or `/prefix/`; the image paths are written from it.
 *
 * Each strip carries the ids of the arcs it belongs to, so a question about a strip's arcs — whether
 * `@is:standalone` lets it through, say — is answered from the strip alone. Only the dailies and
 * Sundays: an arc is made of the strips that ran in the paper, and a special never did.
 *
 * Each strip carries its characters the same way, for `@featuring:`, special or not. None where
 * `characters` is empty, which is a site without `characters.yaml`.
 */
export function exportComicsJson(
	projectDir: string,
	collectionData: CollectionData,
	basePath: string = "/",
	arcs: Arc[] = [],
	characters: Character[] = [],
): string {
	const assetsDir = path.join(projectDir, "assets", "comics");
	const source = loadComicSource(projectDir);

	const attachAppearances = (entry: Entry, lookupKey: string) => {
		const appearances = collectionData.appearancesByComic.get(lookupKey);
		if (appearances && appearances.length) entry.appearances = appearances;
	};

	const attachCharacters = (entry: Entry, key: string, listing: DailyEntry) => {
		const featured = stripCharacters(key, listing, characters);
		if (featured.length) entry.characters = featured;
	};

	const arcsByDate = new Map<string, string[]>();
	for (const arc of arcs) {
		for (const date of arc.dates) arcsByDate.set(date, [...(arcsByDate.get(date) ?? []), arc.id]);
	}

	const entries: Entry[] = [];

	for (const [dateStr, daily] of Object.entries(source.dailies)) {
		const entry: Entry = {
			date: formatDate(dateStr),
			transcript: daily.transcript,
		};
		if (daily.alternate) entry.alternate = daily.alternate;
		const img = findImage(dateStr, assetsDir, basePath);
		if (img) entry.image = img;
		attachAppearances(entry, dateStr);
		const dailyArcs = arcsByDate.get(entry.date);
		if (dailyArcs) entry.arcs = dailyArcs;
		attachCharacters(entry, dateStr, daily);
		entries.push(entry);
	}

	for (const [sid, special] of Object.entries(source.specials)) {
		const entry: Entry = {
			date: formatDate(special.date),
			transcript: special.transcript,
			id: sid,
		};
		if (special.alternate) entry.alternate = special.alternate;
		if (special.sort) entry.sort = special.sort;
		if (special["aspect-ratio"]) entry.aspectRatio = special["aspect-ratio"];
		const img = findImage(sid, assetsDir, basePath);
		if (img) entry.image = img;
		attachAppearances(entry, sid);
		attachCharacters(entry, sid, special);
		entries.push(entry);
	}

	entries.sort((a, b) => {
		if (a.date !== b.date) return a.date.localeCompare(b.date);
		if ((a.sort || 0) !== (b.sort || 0)) return (a.sort || 0) - (b.sort || 0);
		return (a.id || "").localeCompare(b.id || "");
	});

	return JSON.stringify(entries);
}
