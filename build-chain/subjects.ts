import { Subject } from "../src/types";
import { ComicSource } from "./comicSource";
import { configName, loadOptionalPart } from "./siteConfig";
import { checkId, isoDate, listedSpecials, readStripLists } from "./stripSets";

/**
 * The subjects, as the site reads them, and which each strip is about.
 *
 * `byStrip` is keyed as `comics.yaml` keys a strip: by its compact date, or a special's id. It lists
 * a strip's subjects in the order the strip does.
 */
export interface SubjectData {
	subjects: Subject[];
	byStrip: Map<string, string[]>;
}

const NONE: SubjectData = { subjects: [], byStrip: new Map() };

/** A setting that may be left out, but not left empty. */
function optionalText(value: unknown, where: string): string | undefined {
	if (value === undefined || value === null) return undefined;
	if (typeof value !== "string" || value.trim() === "") throw new Error(`${where} must be a sentence, or left out.`);
	return value.trim();
}

function readKeywords(value: unknown, id: string): string[] {
	if (value === undefined || value === null) return [];
	if (!Array.isArray(value)) throw new Error(`Subject "${id}" must list its keywords as a list of words.`);
	return value.map((keyword) => {
		if (typeof keyword !== "string" && typeof keyword !== "number") {
			throw new Error(`Subject "${id}" has a keyword that is not a word.`);
		}
		const text = String(keyword).trim();
		if (text === "") throw new Error(`Subject "${id}" has an empty keyword.`);
		return text;
	});
}

/**
 * The subjects, oldest first by the first strip about each — a special by the day it is filed under —
 * and by id where two start on the same day; one no strip is about yet goes last. None, and nothing
 * read, where `config.yaml` turns subjects off — and then a strip's `subjects` are not read either,
 * as its characters are not on a site without characters.
 *
 * Which strips are about a subject is written on the strips, in `comics.yaml`, rather than here, so
 * a strip's subjects are with the rest of what is said about it, a special's too.
 */
export function loadSubjects(source: ComicSource, config?: string): SubjectData {
	const raw = loadOptionalPart("subjects", config);
	if (raw === false) return NONE;
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
		throw new Error(`subjects in ${configName(config)} must be a mapping of subject ids, or false`);
	}

	const entries = Object.entries(raw as Record<string, unknown>);
	for (const [id] of entries) checkId(id, "subject");
	const byStrip = readStripLists(source, "subjects", new Set(entries.map(([id]) => id)), "is about");
	const keysById = new Map<string, string[]>();
	for (const [key, ids] of byStrip) {
		for (const id of ids) keysById.set(id, [...(keysById.get(id) ?? []), key]);
	}

	const subjects = entries.map(([id, entry]): Subject => {
		const { name, description, keywords } = (entry ?? {}) as {
			name?: unknown;
			description?: unknown;
			keywords?: unknown;
		};
		if (typeof name !== "string" || name.trim() === "") throw new Error(`Subject "${id}" needs a name.`);
		const sentence = optionalText(description, `Subject "${id}"'s description`);
		const keys = keysById.get(id) ?? [];
		const specials = listedSpecials(source, keys);
		return {
			id,
			name: name.trim(),
			...(sentence ? { description: sentence } : {}),
			keywords: readKeywords(keywords, id),
			dates: keys.filter((key) => source.strips[key]).map(isoDate),
			...(specials.length > 0 ? { specials } : {}),
		};
	});

	const firstDay = (subject: Subject) =>
		[subject.dates[0], subject.specials?.[0]?.date].filter((date) => date !== undefined).sort()[0];
	subjects.sort((a, b) => {
		const [first, second] = [firstDay(a), firstDay(b)];
		if (first !== second) {
			if (first === undefined) return 1;
			if (second === undefined) return -1;
			return first.localeCompare(second);
		}
		return a.id.localeCompare(b.id);
	});

	return { subjects, byStrip };
}

export function exportSubjectsJson(subjects: Subject[]): string {
	return JSON.stringify(subjects);
}
