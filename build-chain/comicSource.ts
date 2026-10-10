import { loadRequiredPart, configName } from "./siteConfig";

export interface StripEntry {
	transcript: string;
	alternate?: string;
	description?: string;
	source?: string;
	review?: string;
	/** Character ids from `characters.yaml`. Checked where it is read, in `characters.ts`. */
	characters?: string[];
}

export interface SpecialEntry extends StripEntry {
	date: string;
	/** What a list of strips calls it, having no date of its own to go by: a creator's page lists their specials by it. */
	title: string;
	sort?: number;
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

	const specials: Record<string, SpecialEntry> = {};
	for (const [key, value] of Object.entries(raw.specials || {})) {
		const title = typeof value.title === "string" ? value.title.trim() : "";
		if (!title) throw new Error(`Special ${key} needs a title.`);
		specials[String(key)] = { ...value, date: String(value.date), title };
	}

	return { strips, specials };
}
