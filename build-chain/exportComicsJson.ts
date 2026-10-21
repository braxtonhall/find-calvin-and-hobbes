import fs from "fs";
import path from "path";
import { Appearance, CollectionData } from "./collectionPages";
import { loadComicSource } from "./comicSource";
import { Arc, Credit, PrintFormat } from "../src/types";
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
	subjects?: string[];
	format?: PrintFormat;
}

/**
 * `basePath` is where the site is mounted, `/` or `/prefix/`; the image paths are written from it.
 *
 * Each strip carries the ids of the arcs it belongs to, so a question about a strip's arcs — whether
 * `@is:standalone` lets it through, say — is answered from the strip alone. Only the dailies and
 * Sundays: an arc is made of the strips that ran in the paper, and a special never did.
 *
 * And its characters, its creators and its subjects, for `@featuring:`, `@by:` and `@about:`, special
 * or not, each keyed as `comics.yaml` keys the strip. None where it has none, which is every strip on
 * a site without them.
 */
export function exportComicsJson(
	collectionData: CollectionData,
	basePath: string = "/",
	arcs: Arc[] = [],
	characters: ReadonlyMap<string, string[]> = new Map(),
	creators: ReadonlyMap<string, Credit[]> = new Map(),
	subjects: ReadonlyMap<string, string[]> = new Map(),
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

	const attachLists = (entry: Entry, key: string) => {
		const featured = characters.get(key);
		if (featured) entry.characters = featured;
		const credits = creators.get(key);
		if (credits) entry.creators = credits;
		const about = subjects.get(key);
		if (about) entry.subjects = about;
	};

	const arcsByDate = new Map<string, string[]>();
	for (const arc of arcs) {
		for (const date of arc.dates) arcsByDate.set(date, [...(arcsByDate.get(date) ?? []), arc.id]);
	}

	const entries: Entry[] = [];

	for (const [dateStr, daily] of Object.entries(source.strips)) {
		const entry: Entry = {
			date: formatDate(dateStr),
			transcript: daily.transcript,
		};
		if (daily.alternate) entry.alternate = daily.alternate;
		attach(entry, dateStr);
		attachAppearances(entry, dateStr);
		const dailyArcs = arcsByDate.get(entry.date);
		if (dailyArcs) entry.arcs = dailyArcs;
		attachLists(entry, dateStr);
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
		if (special.format) entry.format = special.format;
		attach(entry, sid);
		attachAppearances(entry, sid);
		attachLists(entry, sid);
		entries.push(entry);
	}

	entries.sort((a, b) => {
		if (a.date !== b.date) return a.date.localeCompare(b.date);
		if ((a.sort || 0) !== (b.sort || 0)) return (a.sort || 0) - (b.sort || 0);
		return (a.id || "").localeCompare(b.id || "");
	});

	return JSON.stringify(entries);
}
