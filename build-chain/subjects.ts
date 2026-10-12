import { Subject } from "../src/types";
import { ComicSource } from "./comicSource";
import { configName, loadOptionalPart } from "./siteConfig";

const SUBJECT_ID = /^[a-z0-9]+$/;

/**
 * The subjects, as the site reads them, and which each strip is about.
 *
 * `byStrip` is keyed as `comics.yaml` keys a strip, by its compact date, and lists its subjects in the
 * order the strip does.
 */
export interface SubjectData {
	subjects: Subject[];
	byStrip: Map<string, string[]>;
}

const NONE: SubjectData = { subjects: [], byStrip: new Map() };

function isoDate(compact: string): string {
	return `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`;
}

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

/** The subjects one strip lists, each checked against the subjects' file. */
function readStripSubjects(key: string, value: unknown, known: ReadonlySet<string>): string[] {
	if (!Array.isArray(value)) throw new Error(`Strip ${key} must list its subjects as a list of ids.`);
	const listed = value.map(String);
	for (const id of listed) {
		if (!known.has(id)) throw new Error(`Strip ${key} is about "${id}", which is not one of the subjects.`);
	}
	return [...new Set(listed)];
}

/**
 * The subjects, oldest first by the first strip about each, and by id where two start on the same
 * strip; one no strip is about yet goes last. None, and nothing read, where `config.yaml` turns
 * subjects off — and then a strip's `subjects` are not read either, as its characters are not on a
 * site without characters.
 *
 * Which strips are about a subject is written on the strips, in `comics.yaml`, rather than here, so
 * a strip's subjects are with the rest of what is said about it. Only a daily or a Sunday can be
 * about one: a special that lists subjects stops the build.
 */
export function loadSubjects(source: ComicSource, config?: string): SubjectData {
	const raw = loadOptionalPart("subjects", config);
	if (raw === false) return NONE;
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
		throw new Error(`subjects in ${configName(config)} must be a mapping of subject ids, or false`);
	}

	const entries = Object.entries(raw as Record<string, unknown>);
	for (const [id] of entries) {
		if (!SUBJECT_ID.test(id)) throw new Error(`Invalid subject id "${id}": expected lowercase letters and digits.`);
	}
	const known = new Set(entries.map(([id]) => id));

	const byStrip = new Map<string, string[]>();
	const datesById = new Map<string, string[]>();
	for (const key of Object.keys(source.strips).sort()) {
		const listed = source.strips[key].subjects;
		if (listed === undefined || listed === null) continue;
		const ids = readStripSubjects(key, listed, known);
		if (ids.length === 0) continue;
		byStrip.set(key, ids);
		for (const id of ids) datesById.set(id, [...(datesById.get(id) ?? []), isoDate(key)]);
	}
	for (const [key, special] of Object.entries(source.specials)) {
		if (special.subjects !== undefined && special.subjects !== null) {
			throw new Error(`Special ${key} lists subjects, but only a daily or a Sunday can be about one.`);
		}
	}

	const subjects = entries.map(([id, entry]): Subject => {
		const { name, description, keywords } = (entry ?? {}) as {
			name?: unknown;
			description?: unknown;
			keywords?: unknown;
		};
		if (typeof name !== "string" || name.trim() === "") throw new Error(`Subject "${id}" needs a name.`);
		const sentence = optionalText(description, `Subject "${id}"'s description`);
		return {
			id,
			name: name.trim(),
			...(sentence ? { description: sentence } : {}),
			keywords: readKeywords(keywords, id),
			dates: datesById.get(id) ?? [],
		};
	});

	subjects.sort((a, b) => {
		const [first, second] = [a.dates[0], b.dates[0]];
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
