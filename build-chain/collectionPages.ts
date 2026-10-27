import path from "path";
import { configName, loadColourSundays, loadRequiredPart } from "./siteConfig";
import { loadComicSource, SpecialEntry } from "./comicSource";
import { PRINT_FORMATS, usualFormat } from "../src/print-format";
import type { PrintFormat } from "../src/types";
import { aspectRatio } from "./imageSize";
import { variantSourceWidth } from "./imageVariants";
import { isUrl, staticPath } from "./staticFiles";
import { markupProblem } from "../src/inline-markup";

type JsonSafe = string | number | boolean | null | JsonSafe[] | { [key: string]: JsonSafe };

export function jsonSafe(obj: unknown): JsonSafe {
	if (obj instanceof Date) return obj.toISOString();
	if (typeof obj === "object" && obj !== null && !Array.isArray(obj)) {
		const result: Record<string, JsonSafe> = {};
		for (const [k, v] of Object.entries(obj)) {
			result[String(k)] = jsonSafe(v);
		}
		return result;
	}
	if (Array.isArray(obj)) return obj.map(jsonSafe);
	return obj as JsonSafe;
}

export interface Appearance {
	collection: string;
	volume?: number;
	pages: number[];
	/** The book printed this strip differently — it has an entry in the book's `alterations`. */
	altered?: true;
	/** How the book printed the strip, on all its pages together, where that is not the usual. See `printedFormats`. */
	formats?: PrintFormat[];
}

export interface CollectionSource {
	id: string;
	pub_year: number;
	pub_month: number;
	pub_day?: number;
	sundays?: boolean;
	dailies?: unknown[];
	pages?: Record<string, unknown[]>;
	/** A book in several volumes: each volume's pages, in place of `pages`. */
	volumes?: Record<string, Record<string, unknown[]>>;
	extras?: unknown[];
	alterations?: Record<string, unknown>;
	aspectRatio?: number;
	[key: string]: unknown;
}

export interface CollectionData {
	sources: CollectionSource[];
	appearancesByComic: Map<string, Appearance[]>;
	rangesById: Map<string, string[]>;
	specialsById: Map<string, Record<string, true>>;
	/** The covers the build publishes, each file by where it goes. See `staticPath`. */
	files: Map<string, string>;
}

/**
 * A cover as the site shows it: a URL as it is, or a file named with `!Path`, as the path it is
 * published at, noted in `files` for the build to copy there.
 *
 * With its shape, for a page to hold the space for it while it loads: the `aspect-ratio` written
 * beside it, or else the file's own. A URL's is only what is written, since the build never fetches it.
 * A file's has its width too, where the build makes smaller copies of it.
 */
function coverSetting(
	value: unknown,
	ratio: unknown,
	name: string,
	files: Map<string, string>,
	config?: string,
): { image?: string; aspectRatio?: number; width?: number } {
	const written = ratioSetting(ratio, name, config);
	const shaped = (image: string, shape = written) => (shape === undefined ? { image } : { image, aspectRatio: shape });
	if (value === undefined || value === null) return written === undefined ? {} : { aspectRatio: written };
	if (typeof value === "string" && isUrl(value)) return shaped(value);
	if (typeof value === "string" && path.isAbsolute(value)) {
		const published = staticPath(value);
		if (!files.has(published)) files.set(published, value);
		const width = variantSourceWidth(value);
		return { ...shaped(published, written ?? aspectRatio(value)), ...(width === undefined ? {} : { width }) };
	}
	throw new Error(`${name} in ${configName(config)} must be a URL, or a file as !Path ./cover.png`);
}

/** A cover's `aspect-ratio`, its width over its height, where one is written. */
function ratioSetting(value: unknown, name: string, config?: string): number | undefined {
	if (value === undefined || value === null) return undefined;
	if (typeof value !== "number" || !(value > 0)) {
		throw new Error(`${name}'s aspect-ratio in ${configName(config)} must be a positive number`);
	}
	return value;
}

const DAY_MS = 86400000;

const isDateKey = (key: string) => key.length === 8;

function compactToUtc(compact: string): number {
	return Date.UTC(Number(compact.slice(0, 4)), Number(compact.slice(4, 6)) - 1, Number(compact.slice(6, 8)));
}

export function coalesceRanges(keys: Iterable<string>, stepDays: number): string[] {
	const dates = [...new Set(keys)].filter(isDateKey).sort();
	if (dates.length === 0) return [];
	const gap = stepDays * DAY_MS;
	const ranges: string[] = [];
	let start = dates[0];
	let previous = dates[0];
	for (const date of dates.slice(1)) {
		if (compactToUtc(date) - compactToUtc(previous) === gap) {
			previous = date;
		} else {
			ranges.push(start === previous ? start : `${start}-${previous}`);
			start = previous = date;
		}
	}
	ranges.push(start === previous ? start : `${start}-${previous}`);
	return ranges;
}

/**
 * Publication order, which is the only order the archive has an opinion about.
 *
 * This one sort does both jobs. It ranks a strip's appearance boxes — the first printing of a
 * strip leads, the compendium that reprinted it thirty years later trails — and, because
 * `generateCollectionIndex` writes the collections out in the order it is handed them and nothing
 * downstream re-sorts, it is also the order the `@in:` menu offers books in. A reader scanning
 * that menu is looking for a book they own, and books arrive in the world chronologically.
 *
 * Ordering here rather than in the menu is what keeps it free: the list is fixed when the index is
 * emitted, so the completion menu only ever filters it. See `src/filter-vocabulary.ts`.
 *
 * The id is the tie-breaker so a renamed file cannot silently reshuffle two books published the
 * same month. `pub_year: 0` means unknown, and would sort to the front — no such collection has a
 * page index today, so none of them reaches the emitted index at all.
 */
function sortCollections(collections: CollectionSource[]): CollectionSource[] {
	return [...collections].sort(
		(a, b) =>
			a.pub_year - b.pub_year ||
			a.pub_month - b.pub_month ||
			(a.pub_day || 0) - (b.pub_day || 0) ||
			a.id.localeCompare(b.id),
	);
}

/**
 * A strip on a page, as the page lists it: its key, bare, or under how the page printed it where
 * that is not how the strip is usually printed, as `{ink: 19870201}`.
 */
function readEntry(entry: unknown, where: string): { comicKey: string; format?: PrintFormat } {
	if (entry === null || typeof entry !== "object" || Array.isArray(entry)) return { comicKey: String(entry) };
	const fields = Object.entries(entry);
	const [format, comicKey] = fields[0] ?? [];
	if (fields.length !== 1 || !PRINT_FORMATS.includes(format as PrintFormat)) {
		throw new Error(`${where} lists ${JSON.stringify(entry)}: a strip's key, or one under ${PRINT_FORMATS.join(", ")}`);
	}
	return { comicKey: String(comicKey), format: format as PrintFormat };
}

function forEachPage(
	pages: Record<string, unknown[]> | undefined,
	where: string,
	visit: (page: number, comicKey: string, format?: PrintFormat) => void,
): void {
	for (const [page, entries] of Object.entries(pages || {})) {
		const pageNumber = Number(page);
		if (!Number.isInteger(pageNumber)) throw new Error(`Non-integer page number "${page}"`);
		for (const entry of entries || []) {
			const { comicKey, format } = readEntry(entry, `Page ${page} of ${where}`);
			visit(pageNumber, comicKey, format);
		}
	}
}

/** How the book prints the strip on a page that does not say. See `usualFormat`. */
function formatOf(
	comicKey: string,
	collection: CollectionSource,
	specials: Record<string, SpecialEntry>,
): PrintFormat | undefined {
	const special = !isDateKey(comicKey);
	const sunday = !special && new Date(compactToUtc(comicKey)).getUTCDay() === 0;
	return usualFormat({ special, sunday, format: specials[comicKey]?.format }, { colour: collection.colour === true });
}

/** A book's name, notes and extras may carry `<i>` and `<b>`, and only well. See `src/inline-markup.ts`. */
function checkMarkup(collection: CollectionSource): void {
	const words = [
		["name", collection.name],
		...((collection.notes as unknown[] | undefined) ?? []).map((note) => ["a note", note]),
		...(collection.extras ?? []).map((extra) => ["an extra", extra]),
	];
	for (const [field, text] of words) {
		const problem = typeof text === "string" ? markupProblem(text) : undefined;
		if (problem) throw new Error(`${collection.id}'s ${field}, ${JSON.stringify(text)}: ${problem}`);
	}
}

/** The books, as `config.yaml` gives them: a list, usually `!Map [Import, ./collections/*.yaml]`. */
export function loadCollectionData(config?: string): CollectionData {
	const books = loadRequiredPart("collections", config);
	if (!Array.isArray(books)) throw new Error(`collections in ${configName(config)} must be a list of books`);

	const sources: CollectionSource[] = [];
	const files = new Map<string, string>();
	for (const book of books) {
		if (!book || typeof book !== "object" || Array.isArray(book)) {
			throw new Error(`collections in ${configName(config)} must be a list of books, each a mapping`);
		}
		const { "aspect-ratio": ratio, ...raw } = jsonSafe(book) as Record<string, unknown>;
		const collection = raw as unknown as CollectionSource;
		Object.assign(collection, coverSetting(raw.image, ratio, `${raw.id}'s image`, files, config));
		checkMarkup(collection);
		sources.push(collection);
	}

	const sorted = sortCollections(sources);

	// One bucket per (collection, volume) so a strip printed on two pages of the
	// same book yields a single appearance carrying both page numbers.
	const buckets = new Map<
		string,
		{ appearance: Appearance; pages: Set<number>; formats: Set<PrintFormat>; usual?: PrintFormat }
	>();
	const keysById = new Map<string, Set<string>>();
	// How a page printed its strip is only a question where the Sundays were a format of their own.
	const specials = loadColourSundays(config) ? loadComicSource(config).specials : null;

	const record = (
		collection: CollectionSource,
		comicKey: string,
		page: number,
		format: PrintFormat | undefined,
		volume?: number,
	) => {
		const collectionId = collection.id;
		if (!keysById.has(collectionId)) keysById.set(collectionId, new Set());
		keysById.get(collectionId)!.add(comicKey);

		const bucketKey = `${comicKey} ${collectionId} ${volume ?? ""}`;
		let bucket = buckets.get(bucketKey);
		if (!bucket) {
			const appearance: Appearance = {
				collection: collectionId,
				...(volume !== undefined ? { volume } : {}),
				pages: [],
				...(collection.alterations?.[comicKey] ? { altered: true as const } : {}),
			};
			const usual = specials ? formatOf(comicKey, collection, specials) : undefined;
			bucket = { appearance, pages: new Set(), formats: new Set(), usual };
			buckets.set(bucketKey, bucket);
		}
		bucket.pages.add(page);
		const printed = format ?? bucket.usual;
		if (specials && printed) bucket.formats.add(printed);
	};

	for (const collection of sorted) {
		forEachPage(collection.pages, collection.id, (page, comicKey, format) =>
			record(collection, comicKey, page, format),
		);
		for (const [volume, pages] of Object.entries(collection.volumes || {})) {
			const volumeNumber = Number(volume);
			if (!Number.isInteger(volumeNumber)) throw new Error(`Non-integer volume "${volume}" in ${collection.id}`);
			forEachPage(pages, `${collection.id} volume ${volume}`, (page, comicKey, format) =>
				record(collection, comicKey, page, format, volumeNumber),
			);
		}
	}

	const rangesById = new Map<string, string[]>();
	const specialsById = new Map<string, Record<string, true>>();
	for (const collection of sorted) {
		const keys = keysById.get(collection.id);
		rangesById.set(
			collection.id,
			keys ? coalesceRanges(keys, collection.sundays ? 7 : 1) : (collection.dailies || []).map(String),
		);
		const specials: Record<string, true> = {};
		for (const key of keys || []) if (!isDateKey(key)) specials[key] = true;
		specialsById.set(collection.id, specials);
	}

	// `sorted` is already publication order, so the rank a strip's appearances are sorted by is a
	// read off the same list the index is emitted from. There is one ordering.
	const order = new Map(sorted.map((collection, index) => [collection.id, index]));
	const appearancesByComic = new Map<string, Appearance[]>();
	for (const [bucketKey, bucket] of buckets) {
		const comicKey = bucketKey.slice(0, bucketKey.indexOf(" "));
		bucket.appearance.pages = [...bucket.pages].sort((a, b) => a - b);
		// Only where it is not the usual, which the site reads for itself: see `printedFormats`.
		const usual = bucket.formats.size === 1 && bucket.usual !== undefined && bucket.formats.has(bucket.usual);
		if (bucket.formats.size && !usual) {
			bucket.appearance.formats = PRINT_FORMATS.filter((format) => bucket.formats.has(format));
		}
		if (!appearancesByComic.has(comicKey)) appearancesByComic.set(comicKey, []);
		appearancesByComic.get(comicKey)!.push(bucket.appearance);
	}
	for (const appearances of appearancesByComic.values()) {
		appearances.sort((a, b) => {
			if (a.collection !== b.collection) return order.get(a.collection)! - order.get(b.collection)!;
			return (a.volume || 0) - (b.volume || 0);
		});
	}

	return { sources: sorted, appearancesByComic, rangesById, specialsById, files };
}
