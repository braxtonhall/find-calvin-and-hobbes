import { Arc } from "../src/types";
import { CollectionData } from "./collectionPages";
import { ComicSource } from "./comicSource";
import { loadOptionalPart, configName } from "./siteConfig";

const ARC_ID = /^[a-z0-9]+$/;

function compactToIsoDate(value: string): string {
	return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}

/**
 * The books that print every strip of the arc, in the order the index holds them.
 *
 * Read off the same appearances `comics.json` carries, so a book is listed here exactly when each of
 * the arc's strips names it. A book with several editions is still one book: its editions hold the
 * same strips, so asking of the book is asking of each of them.
 */
function collectionsHolding(compactDates: string[], collectionData: CollectionData): string[] {
	const holders = (compact: string) =>
		new Set((collectionData.appearancesByComic.get(compact) ?? []).map((appearance) => appearance.collection));
	const [first, ...rest] = compactDates.map(holders);
	return collectionData.sources
		.map((source) => source.id)
		.filter((id) => first.has(id) && rest.every((held) => held.has(id)));
}

/**
 * The arcs, as the site reads them, oldest first.
 *
 * The shape of each entry is checked and a malformed one stops the build, the way a bad rerun does;
 * a date must also name a daily or Sunday strip, since that is what an arc is made of. Beyond that
 * the content is trusted: whether the dates make a story is a question the data was checked for
 * once, by hand, rather than one the build asks every time.
 *
 * None, and nothing read, where `config.yaml` turns arcs off.
 */
export function loadArcs(source: ComicSource, collectionData: CollectionData, config?: string): Arc[] {
	const raw = loadOptionalPart("arcs", config);
	if (raw === false) return [];
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
		throw new Error(`arcs in ${configName(config)} must be a mapping of arc ids, or false`);
	}

	const arcs: Arc[] = [];
	for (const [id, entry] of Object.entries(raw as Record<string, unknown>)) {
		if (!ARC_ID.test(id)) throw new Error(`Invalid arc id "${id}": expected lowercase letters and digits.`);
		const { description, dates } = (entry ?? {}) as { description?: unknown; dates?: unknown };
		if (typeof description !== "string" || description.trim() === "") {
			throw new Error(`Arc "${id}" needs a description.`);
		}
		if (!Array.isArray(dates) || dates.length === 0) throw new Error(`Arc "${id}" needs a list of dates.`);
		const compactDates = dates.map(String);
		for (const compact of compactDates) {
			if (!source.dailies[compact]) throw new Error(`Arc "${id}" names ${compact}, which is not a strip.`);
		}
		const sorted = [...compactDates].sort();
		arcs.push({
			id,
			description,
			dates: sorted.map(compactToIsoDate),
			collections: collectionsHolding(sorted, collectionData),
		});
	}

	return arcs.sort((a, b) => a.dates[0].localeCompare(b.dates[0]) || a.id.localeCompare(b.id));
}

export function exportArcsJson(arcs: Arc[]): string {
	return JSON.stringify(arcs);
}
