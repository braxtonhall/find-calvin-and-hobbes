import path from "path";
import { loadComicSource } from "../../build-chain/comicSource";
import { state } from "../../src/state";
import { Comic } from "../../src/types";

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

export interface Entry {
	date: string;
	transcript: string;
	alternate?: string;
	description?: string;
	// Only specials carry an id in the real archive, and it is what separates two strips that
	// share a date.
	id?: string;
}

const FILLER_SUBJECTS = ["sandbox", "cardboard", "sidewalk", "kitchen", "cupboard", "driveway", "porch", "attic"];

// Most fillers carry the stopwords so that "the" and "you" end up common but not universal;
// a word in literally every comic has an inverse document frequency of exactly zero, which
// is a degenerate case the real archive never produces. A minority name Calvin, so that his
// name is moderately common in transcripts while being universal in descriptions.
function fillerTranscript(subject: string, index: number): string {
	return index % 5 === 0
		? `Calvin, nobody goes near a ${subject} anymore.`
		: `I am the one in the ${subject} and you are not going to like it at all.`;
}

/**
 * A synthetic archive padded with filler comics so that document frequencies land in a
 * realistic range. Filler descriptions all name Calvin and Hobbes, as the real ones do.
 */
export function buildArchive(entries: Entry[], fillerCount = 60): Archive {
	const comics: Comic[] = [];
	const descriptions = new Map<string, string>();

	for (const entry of entries) {
		const comic: Comic = { date: entry.date, transcript: entry.transcript };
		if (entry.alternate) comic.alternate = entry.alternate;
		if (entry.id) comic.id = entry.id;
		comics.push(comic);
		if (entry.description) descriptions.set(entry.id || entry.date, entry.description);
	}

	for (let index = 0; index < fillerCount; index++) {
		const date = `1980-01-${String((index % 28) + 1).padStart(2, "0")}`;
		const subject = FILLER_SUBJECTS[index % FILLER_SUBJECTS.length];
		const id = `filler${index}`;
		comics.push({ date, id, transcript: fillerTranscript(subject, index) });
		descriptions.set(id, `Calvin is in the ${subject}. He says something to Hobbes and Hobbes says something back.`);
	}

	comics.sort((a, b) => a.date.localeCompare(b.date) || (a.id || "").localeCompare(b.id || ""));

	return { comics, descriptions };
}
