import path from "path";
import { ListedSpecial, Person, StripSummary } from "../src/types";
import { ComicSource } from "./comicSource";
import { configName } from "./siteConfig";
import { staticPath, isUrl } from "./staticFiles";

/**
 * What the creators, the characters and the subjects have in common: each names strips, by the key
 * `comics.yaml` gives a strip — its compact date, or a special's id — and each is summed up from
 * the strips it names in the same way.
 */

const LISTED_ID = /^[a-z0-9]+$/;

/** `noun` is what the file calls one, for the message: `creator`, `character`, `subject`. */
export function checkId(id: string, noun: string): void {
	if (!LISTED_ID.test(id)) throw new Error(`Invalid ${noun} id "${id}": expected lowercase letters and digits.`);
}

export function isoDate(compact: string): string {
	return `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`;
}

/**
 * Each strip's list of ids under `field`, as `comics.yaml` writes it on the strip, each checked
 * against `known`, by the strip's key, in the order the strip lists them and each once. A strip
 * that lists none is left out. `says` is what a strip listing an id says of it, for the message:
 * `features`, `is about`.
 */
export function readStripLists(
	source: ComicSource,
	field: "characters" | "subjects",
	known: ReadonlySet<string>,
	says: string,
): Map<string, string[]> {
	const byStrip = new Map<string, string[]>();
	const read = (where: string, key: string, value: unknown) => {
		if (value === undefined || value === null) return;
		if (!Array.isArray(value)) throw new Error(`${where} must list its ${field} as a list of ids.`);
		const listed = [...new Set(value.map(String))];
		for (const id of listed) {
			if (!known.has(id)) throw new Error(`${where} ${says} "${id}", which is not one of the ${field}.`);
		}
		if (listed.length > 0) byStrip.set(key, listed);
	};
	for (const key of Object.keys(source.strips).sort()) read(`Strip ${key}`, key, source.strips[key][field]);
	for (const [key, special] of Object.entries(source.specials)) read(`Special ${key}`, key, special[field]);
	return byStrip;
}

/** The specials among `keys`, oldest first by the day each is filed under, and by `sort` on the same day. */
export function listedSpecials(source: ComicSource, keys: Iterable<string>): ListedSpecial[] {
	return [...keys]
		.flatMap((key): ListedSpecial[] => {
			const special = source.specials[key];
			return special ? [{ id: key, title: special.title, date: isoDate(special.date) }] : [];
		})
		.sort(
			(a, b) => a.date.localeCompare(b.date) || (source.specials[a.id].sort ?? 0) - (source.specials[b.id].sort ?? 0),
		);
}

/**
 * The strips' dates as ranges, each running over the strips in order, so a stretch with no strip of
 * its own — a rerun, a break — does not split one. Written as a book's date ranges are.
 */
function rangesOf(dates: ReadonlySet<string>, all: string[]): string[] {
	const ranges: string[] = [];
	let start: string | null = null;
	let previous: string | null = null;
	const close = () => {
		if (start) ranges.push(start === previous ? start : `${start}-${previous}`);
		start = null;
	};
	for (const date of all) {
		if (dates.has(date)) {
			start ??= date;
			previous = date;
		} else {
			close();
		}
	}
	close();
	return ranges;
}

/** Where the strips `keys` names are, summed up: how many, the years, the dailies' ranges and the specials. */
export function summarize(source: ComicSource, keys: readonly string[]): StripSummary {
	const dates = new Set(keys.filter((key) => source.strips[key]));
	const specials = listedSpecials(source, keys);
	const years = new Set(keys.map((key) => Number((source.specials[key]?.date ?? key).slice(0, 4))));
	return {
		strips: keys.length,
		years: [...years].sort((a, b) => a - b),
		ranges: rangesOf(dates, Object.keys(source.strips).sort()),
		...(specials.length > 0 ? { specials } : {}),
	};
}

/**
 * Someone as a creators' or a characters' file writes them, by id: a `name`, and optionally an
 * `image`, read by `readPortrait`. `noun` is what the file calls one, for the messages.
 */
export function readPerson(
	id: string,
	entry: unknown,
	noun: string,
	basePath: string,
	files: Map<string, string>,
	config?: string,
): Pick<Person, "id" | "name" | "image"> {
	checkId(id, noun);
	const { name, image } = (entry ?? {}) as { name?: unknown; image?: unknown };
	const named = `${noun[0].toUpperCase()}${noun.slice(1)} "${id}"`;
	if (typeof name !== "string" || name.trim() === "") throw new Error(`${named} needs a name.`);
	const portrait = readPortrait(image, named, basePath, files, config);
	return { id, name: name.trim(), ...(portrait ? { image: portrait } : {}) };
}

/**
 * A portrait as the site shows it: a URL as it is, or a file named with `!Path`, as the path it is
 * published at, from the mount, and noted in `files` for the build to copy there.
 */
function readPortrait(value: unknown, named: string, basePath: string, files: Map<string, string>, config?: string) {
	if (value === undefined || value === null) return undefined;
	if (typeof value === "string" && isUrl(value)) return value;
	if (typeof value === "string" && path.isAbsolute(value)) {
		const published = staticPath(value);
		files.set(published, value);
		return `${basePath}${published}`;
	}
	throw new Error(`${named}'s image in ${configName(config)} must be a URL, or a file as !Path ./portrait.png`);
}
