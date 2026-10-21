import { loadColourSundays, loadRequiredPart, configName } from "./siteConfig";
import { PRINT_FORMATS } from "../src/print-format";
import type { PrintFormat } from "../src/types";

export interface StripEntry {
	transcript: string;
	alternate?: string;
	description?: string;
	source?: string;
	review?: string;
	/** Character ids from `characters.yaml`. Checked where it is read, in `stripSets.ts`. */
	characters?: string[];
	/** Subject ids from `subjects.yaml`. Checked where it is read, in `stripSets.ts`. */
	subjects?: string[];
}

export interface SpecialEntry extends StripEntry {
	date: string;
	/** What a list of strips calls it, having no date of its own to go by: a creator's, a character's or a subject's page lists its specials by it. */
	title: string;
	sort?: number;
	/**
	 * How it was made to be printed, which a book's page prints it in where the page does not say:
	 * an alternate daily is ink. Every special has one where `config.yaml` has `colourSundays`.
	 */
	format?: PrintFormat;
}

export interface ComicSource {
	strips: Record<string, StripEntry>;
	specials: Record<string, SpecialEntry>;
}

interface RawSource {
	strips?: Record<string, string | StripEntry>;
	specials?: Record<string, SpecialEntry>;
}

/** The strips, as `config.yaml` gives them: this project's, unless told otherwise. */
export function loadComicSource(config?: string): ComicSource {
	const value = loadRequiredPart("comics", config);
	if (typeof value !== "object" || Array.isArray(value))
		throw new Error(`comics in ${configName(config)} must be a mapping`);
	const raw = value as RawSource;

	const strips: Record<string, StripEntry> = {};
	for (const [key, value] of Object.entries(raw.strips || {})) {
		strips[String(key)] = typeof value === "string" ? { transcript: value } : value;
	}

	const colourSundays = loadColourSundays(config);
	const specials: Record<string, SpecialEntry> = {};
	for (const [key, value] of Object.entries(raw.specials || {})) {
		const title = typeof value.title === "string" ? value.title.trim() : "";
		if (!title) throw new Error(`Special ${key} needs a title.`);
		const { format } = value;
		if (format !== undefined && !PRINT_FORMATS.includes(format))
			throw new Error(`Special ${key}'s format must be one of ${PRINT_FORMATS.join(", ")} (got "${format}").`);
		if (colourSundays && format === undefined)
			throw new Error(`Special ${key} needs a format, one of ${PRINT_FORMATS.join(", ")}: how it is printed.`);
		specials[String(key)] = { ...value, date: String(value.date), title };
	}

	return { strips, specials };
}
