import { Character, CharacterRoles } from "../src/types";
import { ComicSource } from "./comicSource";
import { configName, loadOptionalPart } from "./siteConfig";
import { readPerson, summarize } from "./stripSets";

/**
 * The characters, as the site reads them, and who each strip features.
 *
 * `byStrip` is keyed as `comics.yaml` keys a strip: by its compact date, or a special's id. It holds
 * who is in the strip, seen or heard, and nobody it only mentions. `roles` says more of a strip
 * where it can: who is only seen, who only heard and who only mentioned. `files` are the portraits
 * the build publishes, each file by where it goes, as a creator's are.
 */
export interface CharacterData {
	characters: Character[];
	byStrip: Map<string, string[]>;
	roles: Map<string, CharacterRoles>;
	files: Map<string, string>;
}

const NONE: CharacterData = { characters: [], byStrip: new Map(), roles: new Map(), files: new Map() };

/** How a strip can have a character other than both seen and heard, as `comics.yaml` writes it. */
const ROLES = ["seen", "heard", "mentioned"] as const;
type Role = (typeof ROLES)[number];

/**
 * One strip's `characters:`, as `comics.yaml` writes it: a character's id where they are seen and
 * heard, and a mapping where they are not, from `seen`, `heard` or `mentioned` to an id or a list
 * of them — `[calvin, {seen: [hobbes, susie]}, {heard: dad}, {mentioned: rosalyn}]`. A mention is
 * someone talked about or spoken to who is neither seen nor heard. Each character once, under one
 * role: seen and heard together is the id alone.
 *
 * Who is in the strip, in the order it lists them, and what more it says of them, where it says any.
 */
function readCast(where: string, value: unknown, known: ReadonlySet<string>): [string[], CharacterRoles] | null {
	if (value === undefined || value === null) return null;
	if (!Array.isArray(value)) throw new Error(`${where} must list its characters as a list of ids.`);
	const roleOf = new Map<string, Role | "both">();
	const said = (role: Role | "both") => (role === "both" ? "seen and heard" : role);
	const add = (id: string, role: Role | "both") => {
		if (!known.has(id))
			throw new Error(
				`${where} ${role === "mentioned" ? "mentions" : "features"} "${id}", which is not one of the characters.`,
			);
		const before = roleOf.get(id);
		if (before === undefined) roleOf.set(id, role);
		else if (before !== role) {
			const both = (before === "seen" && role === "heard") || (before === "heard" && role === "seen");
			throw new Error(
				both
					? `${where} lists "${id}" as both seen and heard: write the id alone.`
					: `${where} lists "${id}" as ${said(before)}, and again as ${said(role)}.`,
			);
		}
	};
	for (const entry of value) {
		if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
			add(String(entry), "both");
			continue;
		}
		for (const [role, ids] of Object.entries(entry as Record<string, unknown>)) {
			if (!(ROLES as readonly string[]).includes(role)) {
				throw new Error(`${where} lists characters under "${role}": expected seen, heard or mentioned.`);
			}
			for (const id of Array.isArray(ids) ? ids : [ids]) add(String(id), role as Role);
		}
	}
	const cast = [...roleOf].filter(([, role]) => role !== "mentioned").map(([id]) => id);
	const only = (role: Role) => [...roleOf].filter(([, other]) => other === role).map(([id]) => id);
	const roles: CharacterRoles = {};
	if (only("seen").length > 0) roles.seenOnly = only("seen");
	if (only("heard").length > 0) roles.heardOnly = only("heard");
	if (only("mentioned").length > 0) roles.mentioned = only("mentioned");
	return [cast, roles];
}

/**
 * The characters, from the file `config.yaml` names, each by id with a `name` and optionally an
 * `image`, as a creator is, in the order the file gives them. Which strips feature a character is written on the strips, in `comics.yaml`, as `characters:
 * [id, ...]`, a special's too — see `readCast`. A character no strip features yet is listed all the
 * same, and one a strip only mentions is not featured by it.
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
	const known = new Set(listed.map((character) => character.id));
	const byStrip = new Map<string, string[]>();
	const roles = new Map<string, CharacterRoles>();
	const read = (where: string, key: string, value: unknown) => {
		const [cast, said] = readCast(where, value, known) ?? [[], {}];
		if (cast.length > 0) byStrip.set(key, cast);
		if (Object.keys(said).length > 0) roles.set(key, said);
	};
	for (const key of Object.keys(source.strips).sort()) read(`Strip ${key}`, key, source.strips[key].characters);
	for (const [key, special] of Object.entries(source.specials)) read(`Special ${key}`, key, special.characters);
	const characters = listed.map((character): Character => ({
		...character,
		...summarize(
			source,
			[...byStrip].filter(([, ids]) => ids.includes(character.id)).map(([key]) => key),
		),
	}));
	return { characters, byStrip, roles, files };
}

export function exportCharactersJson(characters: Character[]): string {
	return JSON.stringify(characters);
}
