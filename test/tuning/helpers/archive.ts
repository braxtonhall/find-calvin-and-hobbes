import path from "path";
import { loadComicSource } from "../../../build-chain/comicSource";
import { state } from "../../../src/state";
import { Comic } from "../../../src/types";

/** This archive's strips and descriptions, as the search reads them: what the tuning is measured on. */
export interface Archive {
	comics: Comic[];
	descriptions: Map<string, string>;
}

const PROJECT_DIR = process.cwd();

function formatDate(key: string): string {
	return `${key.slice(0, 4)}-${key.slice(4, 6)}-${key.slice(6, 8)}`;
}

let realArchive: Archive | null = null;

export function loadRealArchive(): Archive {
	if (realArchive) return realArchive;

	const source = loadComicSource(path.join(PROJECT_DIR, "comics.yaml"));
	const comics: Comic[] = [];
	const descriptions = new Map<string, string>();

	for (const [key, daily] of Object.entries(source.dailies)) {
		const date = formatDate(key);
		const comic: Comic = { date, transcript: daily.transcript };
		if (daily.alternate) comic.alternate = daily.alternate;
		comics.push(comic);
		if (daily.description) descriptions.set(date, daily.description);
	}

	for (const [id, special] of Object.entries(source.specials)) {
		const comic: Comic = { date: formatDate(special.date), transcript: special.transcript, id };
		if (special.alternate) comic.alternate = special.alternate;
		comics.push(comic);
		if (special.description) descriptions.set(id, special.description);
	}

	comics.sort((a, b) => a.date.localeCompare(b.date) || (a.id || "").localeCompare(b.id || ""));

	realArchive = { comics, descriptions };
	return realArchive;
}

export function install(archive: Archive): void {
	state.comics = archive.comics;
	state.descriptions = archive.descriptions;
}
