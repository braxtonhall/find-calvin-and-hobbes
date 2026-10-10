import { Character } from "../src/types";
import { StripEntry } from "./comicSource";
import { loadCharacterSetting } from "./siteConfig";

/**
 * The characters a strip can feature, in the order `config.yaml` gives them, which is the order the
 * menu offers them in. None where it sets `characters` to false.
 */
export function loadCharacters(config?: string): Character[] {
	const characters = loadCharacterSetting(config);
	return characters === false ? [] : Object.entries(characters).map(([id, name]) => ({ id, name }));
}

/**
 * The characters `comics.yaml` lists for one strip, each checked against the characters' file. None
 * where the strip lists none, and none on a site without characters, whatever the strip lists.
 */
export function stripCharacters(key: string, entry: StripEntry, characters: Character[]): string[] {
	if (characters.length === 0 || entry.characters === undefined || entry.characters === null) return [];
	if (!Array.isArray(entry.characters)) throw new Error(`Strip ${key} must list its characters as a list of ids.`);
	const listed = entry.characters.map(String);
	for (const id of listed) {
		if (!characters.some((character) => character.id === id)) {
			throw new Error(`Strip ${key} features "${id}", which is not one of the characters.`);
		}
	}
	return listed;
}

export function exportCharactersJson(characters: Character[]): string {
	return JSON.stringify(characters);
}
