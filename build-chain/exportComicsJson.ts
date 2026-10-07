import fs from "fs";
import path from "path";
import { Appearance, CollectionData } from "./collectionPages";
import { DailyEntry, loadComicSource } from "./comicSource";
import { Arc, Character, Credit } from "../src/types";
import { stripCharacters } from "./characters";
import { loadComicImages } from "./siteConfig";
import { aspectRatio } from "./imageSize";
import { variantSourceWidth } from "./imageVariants";

const EXTENSIONS = [".gif", ".jpg", ".jpeg", ".png", ".webp", ".bmp"];

/** Where the build publishes the strips' images, from the mount. See `comicImages` in the configuration. */
export const COMIC_IMAGES_PATH = "assets/comics/";

/**
 * A strip's image, as a page links to it, and its shape, for the page to hold the space for it while
 * it loads, and its width where the build makes smaller copies of it; nothing for a strip with none
 * in `images`, the names of the files in `folder`.
 */
function attachImage(entry: Entry, key: string, folder: string, images: ReadonlySet<string>, basePath: string): void {
	const name = EXTENSIONS.map((ext) => `${key}${ext}`).find((name) => images.has(name));
	if (!name) return;
	// From the mount, since the page showing it may live at any depth.
	entry.image = `${basePath}${COMIC_IMAGES_PATH}${name}`;
	entry.aspectRatio = aspectRatio(path.join(folder, name));
	const width = variantSourceWidth(path.join(folder, name));
	if (width !== undefined) entry.width = width;
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
	width?: number;
	appearances?: Appearance[];
	arcs?: string[];
	characters?: string[];
	creators?: Credit[];
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
 *
 * And its creators, keyed in `creators` as `comics.yaml` keys the strip. None where it has none.
 */
export function exportComicsJson(
	collectionData: CollectionData,
	basePath: string = "/",
	arcs: Arc[] = [],
	characters: Character[] = [],
	creators: ReadonlyMap<string, Credit[]> = new Map(),
	config?: string,
): string {
	const folder = loadComicImages(config);
	const images = new Set(folder && fs.existsSync(folder) ? fs.readdirSync(folder) : []);
	const attach = (entry: Entry, key: string) => folder && attachImage(entry, key, folder, images, basePath);
	const source = loadComicSource(config);

	const attachAppearances = (entry: Entry, lookupKey: string) => {
		const appearances = collectionData.appearancesByComic.get(lookupKey);
		if (appearances && appearances.length) entry.appearances = appearances;
	};

	const attachCharacters = (entry: Entry, key: string, listing: DailyEntry) => {
		const featured = stripCharacters(key, listing, characters);
		if (featured.length) entry.characters = featured;
		const credits = creators.get(key);
		if (credits) entry.creators = credits;
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
		attach(entry, dateStr);
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
		attach(entry, sid);
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
