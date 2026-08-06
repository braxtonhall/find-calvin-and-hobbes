import path from "path";
import { Appearance, CollectionData } from "./collectionPages";
import { loadComicSource } from "./comicSource";

interface ComicDetail {
	description?: string;
	appearances?: Appearance[];
}

export function exportComicDetails(projectDir: string, collectionData: CollectionData): Map<string, string> {
	const source = loadComicSource(path.join(projectDir, "comics.yaml"));

	const shards = new Map<string, Record<string, ComicDetail>>();
	const add = (compactDate: string, comicKey: string, lookupKey: string, description: string) => {
		const month = `${compactDate.slice(0, 4)}-${compactDate.slice(4, 6)}`;
		if (!shards.has(month)) shards.set(month, {});

		const detail: ComicDetail = {};
		if (description) detail.description = description;
		const appearances = collectionData.appearancesByComic.get(lookupKey);
		if (appearances && appearances.length) detail.appearances = appearances;
		shards.get(month)![comicKey] = detail;
	};

	for (const [compactDate, entry] of Object.entries(source.dailies)) {
		const isoDate = `${compactDate.slice(0, 4)}-${compactDate.slice(4, 6)}-${compactDate.slice(6, 8)}`;
		add(compactDate, isoDate, compactDate, entry.description || "");
	}
	for (const [specialId, entry] of Object.entries(source.specials)) {
		add(entry.date, specialId, specialId, entry.description || "");
	}

	const assets = new Map<string, string>();
	for (const month of [...shards.keys()].sort()) {
		assets.set(`comics/${month}.json`, JSON.stringify(shards.get(month)));
	}
	return assets;
}
