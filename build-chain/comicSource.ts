import { loadRequiredPart, configName } from "./siteConfig";

export interface DailyEntry {
	transcript: string;
	alternate?: string;
	description?: string;
	source?: string;
	review?: string;
	/** Character ids from `characters.yaml`. Checked where it is read, in `characters.ts`. */
	characters?: string[];
}

export interface SpecialEntry extends DailyEntry {
	date: string;
	sort?: number;
}

export interface ComicSource {
	dailies: Record<string, DailyEntry>;
	specials: Record<string, SpecialEntry>;
}

interface RawSource {
	dailies?: Record<string, string | DailyEntry>;
	specials?: Record<string, SpecialEntry>;
}

/** The strips, as `config.yaml` gives them: this project's, unless told otherwise. */
export function loadComicSource(config?: string): ComicSource {
	const value = loadRequiredPart("comics", config);
	if (typeof value !== "object" || Array.isArray(value))
		throw new Error(`comics in ${configName(config)} must be a mapping`);
	const raw = value as RawSource;

	const dailies: Record<string, DailyEntry> = {};
	for (const [key, value] of Object.entries(raw.dailies || {})) {
		dailies[String(key)] = typeof value === "string" ? { transcript: value } : value;
	}

	const specials: Record<string, SpecialEntry> = {};
	for (const [key, value] of Object.entries(raw.specials || {})) {
		specials[String(key)] = { ...value, date: String(value.date) };
	}

	return { dailies, specials };
}
