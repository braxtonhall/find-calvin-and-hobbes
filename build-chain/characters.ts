import { Character } from "../src/types";
import { ComicSource } from "./comicSource";
import { configName, loadOptionalPart } from "./siteConfig";
import { readPerson, readStripLists, summarize } from "./stripSets";

/**
 * The characters, as the site reads them, and who each strip features.
 *
 * `byStrip` is keyed as `comics.yaml` keys a strip: by its compact date, or a special's id. `files`
 * are the portraits the build publishes, each file by where it goes, as a creator's are.
 */
export interface CharacterData {
	characters: Character[];
	byStrip: Map<string, string[]>;
	files: Map<string, string>;
}

const NONE: CharacterData = { characters: [], byStrip: new Map(), files: new Map() };

/**
 * The characters, from the file `config.yaml` names, each by id with a `name` and optionally an
 * `image`, as a creator is, in the order the file gives them, which is the order the menu offers them
 * in. Which strips feature a character is written on the strips, in `comics.yaml`, as `characters:
 * [id, ...]`, a special's too. A character no strip features yet is listed all the same.
 *
 * None, and nothing read — not even a strip's `characters` — where `config.yaml` turns them off.
 */
export function loadCharacters(source: ComicSource, basePath: string = "/", config?: string): CharacterData {
	const raw = loadOptionalPart("characters", config);
	if (raw === false) return NONE;
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
		throw new Error(`characters in ${configName(config)} must be a mapping of character ids, or false`);
	}

	const files = new Map<string, string>();
	const listed = Object.entries(raw as Record<string, unknown>).map(([id, entry]) =>
		readPerson(id, entry, "character", basePath, files, config),
	);
	const byStrip = readStripLists(source, "characters", new Set(listed.map((character) => character.id)), "features");
	const characters = listed.map((character): Character => ({
		...character,
		...summarize(
			source,
			[...byStrip].filter(([, ids]) => ids.includes(character.id)).map(([key]) => key),
		),
	}));
	return { characters, byStrip, files };
}

export function exportCharactersJson(characters: Character[]): string {
	return JSON.stringify(characters);
}
