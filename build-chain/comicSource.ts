import fs from "fs";
import yaml from "js-yaml";

export interface DailyEntry {
	transcript: string;
	alternate?: string;
	description?: string;
	/**
	 * Where this entry's text came from, when it was not the original data: recorded by the date repair
	 * in scripts/sunday-dates so a corrected entry can be traced, and deliberately not shipped to the
	 * browser — exportComicsJson builds its output field by field and never copies this.
	 */
	source?: string;
}

export interface SpecialEntry extends DailyEntry {
	date: string;
	sort?: number;
	"aspect-ratio"?: number;
}

export interface ComicSource {
	dailies: Record<string, DailyEntry>;
	specials: Record<string, SpecialEntry>;
}

interface RawSource {
	dailies?: Record<string, string | DailyEntry>;
	specials?: Record<string, SpecialEntry>;
}

export function loadComicSource(yamlPath: string): ComicSource {
	const raw = yaml.load(fs.readFileSync(yamlPath, "utf-8")) as RawSource;

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
