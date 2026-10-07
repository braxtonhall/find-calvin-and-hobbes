import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import yaml from "js-yaml";
import type { LoaderContext } from "webpack";
import type {
	CorrectionTemplates,
	GridConfig,
	GridLevel,
	GridUnit,
	PageConfig,
	StripLinkTemplates,
} from "../src/site-config";
import { StripKind, StripLinkSubject, stripLinks } from "../src/strip-links";
import { CORRECTION_PAGES, correctionUrl } from "../src/correction-links";
import { SUGGESTION_FIELDS, SuggestionFields, fillSuggestion } from "../src/suggestion-templates";

export interface SiteConfig {
	/** The site's address with no trailing slash — `https://example.com`, or `https://example.com/prefix` — which every page's path is appended to. */
	siteUrl: string;
	host: string;
	/** The path the site is mounted at, `/` or `/prefix/`. See `src/base-path.ts`. */
	basePath: string;
}

/**
 * Reads the `.env` file without mutating `process.env`, so the value can be re-read fresh on every
 * compilation (which lets `--watch` pick up edits to `.env`). A non-empty value already in the
 * process environment — as CI supplies it — takes precedence over the file.
 */
function readDotenvFile(): Record<string, string> {
	let contents: string;
	try {
		contents = fs.readFileSync(path.join(process.cwd(), ".env"), "utf8");
	} catch {
		return {};
	}

	const values: Record<string, string> = {};
	for (const line of contents.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) {
			continue;
		}
		const separator = trimmed.indexOf("=");
		if (separator === -1) {
			continue;
		}
		const key = trimmed.slice(0, separator).trim();
		let value = trimmed.slice(separator + 1).trim();
		if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
			value = value.slice(1, -1);
		}
		values[key] = value;
	}
	return values;
}

/** An environment variable: the process environment when it has one, else the `.env` file, else "". */
function readSetting(name: string, dotenv: Record<string, string>): string {
	const fromEnvironment = (process.env[name] ?? "").trim();
	const fromFile = (dotenv[name] ?? "").trim();
	return fromEnvironment || fromFile;
}

/**
 * A string from `config.yaml` with the environment read into it: `$NAME`, `${NAME}`, and
 * `${NAME:-fallback}` for when it is unset or empty. `$$` is a `$`. Done after the YAML is parsed,
 * so a value from the environment is never read as YAML itself.
 */
function substituteEnvironment(text: string, dotenv: Record<string, string>): string {
	return text.replace(
		/\$(?:(\$)|\{([A-Za-z_]\w*)(?::-([^}]*))?\}|([A-Za-z_]\w*))/g,
		(
			_match,
			dollar: string | undefined,
			braced: string | undefined,
			fallback: string | undefined,
			bare: string | undefined,
		) => {
			if (dollar) return "$";
			const value = readSetting((braced ?? bare)!, dotenv);
			return value || (fallback ?? "");
		},
	);
}

function substituteAll(value: unknown, dotenv: Record<string, string>): unknown {
	// Read later, and as it is. See `readConfig`.
	if (value instanceof Import) return value;
	if (typeof value === "string") return substituteEnvironment(value, dotenv).trim();
	if (Array.isArray(value)) return value.map((item) => substituteAll(item, dotenv));
	if (value && typeof value === "object") {
		return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, substituteAll(item, dotenv)]));
	}
	return value;
}

/** `config.yaml`, with the environment read into it but nothing else made of it yet. */
interface RawConfig {
	name?: unknown;
	series?: unknown;
	description?: unknown;
	favicon?: unknown;
	landing?: { image?: unknown; alt?: unknown; width?: unknown; height?: unknown } | null;
	url?: unknown;
	pageLayout?: unknown;
	corrections?: { enabled?: unknown; pages?: Partial<Record<string, unknown>> | null } | null;
	comics?: unknown;
	tuning?: unknown;
	credits?: unknown;
	arcs?: unknown;
	reruns?: unknown;
	compounds?: unknown;
	characters?: unknown;
	colourSundays?: unknown;
	aspectRatio?: { daily?: unknown; sunday?: unknown } | null;
	details?: Partial<Record<string, unknown>> | null;
	theme?: Partial<Record<string, unknown>> | null;
	search?: { suggestions?: unknown } | null;
	grid?: { periods?: unknown; levels?: unknown; zoom?: unknown } | null;
}

export function configPath(projectDir = path.join(__dirname, "..")): string {
	return path.join(projectDir, "config.yaml");
}

/**
 * A file `config.yaml` imports a value from, as `!Import ./file.yaml`: read only where that value is,
 * so that reading the configuration — which the build does over and over — does not read the
 * archive with it. Whether the file is there is asked at once, though, so a file named and missing
 * stops the build however little of the configuration it reads.
 */
class Import {
	constructor(
		readonly file: string,
		/** The files that imported it, outermost first, so a file that imports one of them is caught. */
		readonly importing: readonly string[],
	) {}
}

/**
 * `!Import ./file`, relative to the file the tag is written in. In `config.yaml` it stands for an
 * `Import`, read later; anywhere else, for the file's contents, read in place. Every file it reads
 * in place is added to `files`, where there is a list to add it to.
 */
function importTag(file: string, importing: readonly string[], lazy: boolean, files?: string[]) {
	return yaml.defineScalarTag<unknown>("!Import", {
		resolve: (source) => {
			const target = path.resolve(path.dirname(file), source.trim());
			const name = `${path.basename(file)} imports ${source.trim()}`;
			if (!fs.existsSync(target)) throw new Error(`${name}, which does not exist`);
			if (target === file || importing.includes(target)) throw new Error(`${name}, which imports it back`);
			if (lazy) return new Import(target, [...importing, file]);
			files?.push(target);
			return readImport(target, [...importing, file], files);
		},
		identify: () => false,
	});
}

/** An imported file's contents: YAML parsed, its own imports read in place, and Markdown as text. */
function readImport(file: string, importing: readonly string[], files?: string[]): unknown {
	const text = fs.readFileSync(file, "utf8");
	const extension = path.extname(file).toLowerCase();
	if (extension === ".md") return text;
	if (extension !== ".yaml" && extension !== ".yml") {
		throw new Error(`${path.basename(file)} is imported, but is neither YAML nor Markdown`);
	}
	const schema = yaml.CORE_SCHEMA.withTags(importTag(file, importing, false, files));
	// `loadAll`, because `load` throws on a file with nothing but comments in it.
	const [document = null] = yaml.loadAll(text, { schema, filename: file });
	return document;
}

/** A value as `config.yaml` gives it: written in place, or read from the file it imports. */
function resolved(value: unknown): unknown {
	return value instanceof Import ? readImport(value.file, value.importing) : value;
}

/**
 * Read fresh on every call, as `.env` is, so `--watch` picks up an edit to either. Small, since what
 * it imports is left unread until it is asked for.
 *
 * The environment is read into what `config.yaml` writes, but never into what it imports: `$5` in a
 * transcript is five dollars.
 */
function readConfig(projectDir?: string): RawConfig {
	const file = configPath(projectDir);
	const schema = yaml.CORE_SCHEMA.withTags(importTag(file, [], true));
	const parsed = yaml.load(fs.readFileSync(file, "utf8"), { schema, filename: file }) ?? {};
	if (typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(`${file} must be a mapping`);
	return substituteAll(parsed, readDotenvFile()) as RawConfig;
}

/**
 * The files a build that reads the configuration depends on: `config.yaml`, every file it imports,
 * however deep, and `.env`, which any value can read. For `--watch`.
 *
 * A YAML file is parsed for its own imports only where it has the tag in it at all, so this does not
 * read the whole archive to find there is nothing more to watch.
 */
export function configDependencies(projectDir = path.join(__dirname, "..")): string[] {
	const files = [configPath(projectDir)];
	const visit = (value: unknown) => {
		if (value instanceof Import) {
			files.push(value.file);
			if (fs.readFileSync(value.file, "utf8").includes("!Import")) readImport(value.file, value.importing, files);
		} else if (value && typeof value === "object") {
			Object.values(value).forEach(visit);
		}
	};
	visit(readConfig(projectDir));
	return [...files, path.join(projectDir, ".env")];
}

/** A setting as a string, with empty — or absent — as "". */
function stringSetting(value: unknown, name: string): string {
	if (value === undefined || value === null) return "";
	if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") {
		throw new Error(`${name} in config.yaml must be a single value`);
	}
	return String(value).trim();
}

/** A setting that is on or off: `true` or `false`, and `fallback` when it is not given. */
function flagSetting(value: unknown, name: string, fallback: boolean): boolean {
	const raw = stringSetting(value, name).toLowerCase();
	if (!raw) return fallback;
	if (raw !== "true" && raw !== "false") throw new Error(`${name} in config.yaml must be true or false (got "${raw}")`);
	return raw === "true";
}

/** The parts of the archive every site has. */
export type RequiredPart = "comics" | "tuning" | "credits";
/** The parts a site can go without, with `false`. */
export type OptionalPart = "arcs" | "reruns" | "compounds" | "characters";

/** Whether nothing was given for the part at all. */
function missing(value: unknown): boolean {
	return value === undefined || value === null || value === "";
}

/**
 * Whether `config.yaml` turns the part off. Not left to a default: every part must be given, or set
 * to false, so that leaving one out is a mistake the build stops for rather than a quiet change in
 * what the site has.
 */
function partIsOff(value: unknown, name: OptionalPart): boolean {
	if (value === false || (typeof value === "string" && value.toLowerCase() === "false")) return true;
	if (missing(value)) throw new Error(`config.yaml must give ${name}: !Import a file of them, or false for none`);
	return false;
}

/** A part every site has, as written or imported. Unchecked: each part's own loader checks it. */
export function loadRequiredPart(name: RequiredPart, projectDir?: string): unknown {
	const value = readConfig(projectDir)[name];
	if (missing(value) || value === false) throw new Error(`config.yaml must give ${name}: !Import a file of it`);
	return resolved(value);
}

/** A part a site can go without, as written or imported, or `false` where it is turned off. Unchecked, as above. */
export function loadOptionalPart(name: OptionalPart, projectDir?: string): unknown {
	const value = readConfig(projectDir)[name];
	return partIsOff(value, name) ? false : resolved(value);
}

/** Which of the archive's optional parts this site has, from `config.yaml` alone. See `PageConfig`. */
export function loadFeatures(projectDir?: string): Pick<PageConfig, "arcs" | "reruns" | "characters"> {
	const raw = readConfig(projectDir);
	return {
		arcs: !partIsOff(raw.arcs, "arcs"),
		reruns: !partIsOff(raw.reruns, "reruns"),
		characters: !partIsOff(raw.characters, "characters"),
	};
}

const CHARACTER_ID = /^[a-z0-9]+$/;

/** The characters, each one's name by id, in the order the menu offers them, or `false` for none. */
export function loadCharacterSetting(projectDir?: string): Record<string, string> | false {
	const value = loadOptionalPart("characters", projectDir);
	if (value === false) return false;
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw new Error("characters in config.yaml must be a mapping of character ids to names, or false");
	}
	const characters: Record<string, string> = {};
	for (const [id, name] of Object.entries(value)) {
		if (!CHARACTER_ID.test(id)) throw new Error(`Invalid character id "${id}": expected lowercase letters and digits.`);
		if (typeof name !== "string" || name.trim() === "") throw new Error(`Character "${id}" needs a name.`);
		characters[id] = name;
	}
	return characters;
}

const STRIP_KINDS: readonly StripKind[] = ["daily", "rerun", "special"];
const LINK_KEYS: readonly (keyof StripLinkTemplates)[] = ["readUrl", "licenseUrl"];

/** Something of each kind to fill the templates in for, so a template asking for a field its kind lacks fails the build. */
const SAMPLE_SUBJECTS: Record<StripKind, StripLinkSubject> = {
	daily: { kind: "daily", date: "1986-07-07" },
	rerun: { kind: "rerun", original: "1986-07-07", rerun: "1991-07-08" },
	special: { kind: "special", id: "sample", date: "1986-07-07" },
};

function loadLinkTemplates(details: RawConfig["details"]): PageConfig["details"] {
	if (details !== undefined && details !== null && (typeof details !== "object" || Array.isArray(details))) {
		throw new Error("details in config.yaml must be a mapping");
	}
	for (const kind of Object.keys(details ?? {})) {
		if (!(STRIP_KINDS as readonly string[]).includes(kind)) {
			throw new Error(`details.${kind} in config.yaml is not one of ${STRIP_KINDS.join(", ")}`);
		}
	}

	const result = {} as PageConfig["details"];
	for (const kind of STRIP_KINDS) {
		const raw = (details?.[kind] ?? {}) as Record<string, unknown>;
		const templates: StripLinkTemplates = {};
		for (const [key, value] of Object.entries(raw)) {
			if (!(LINK_KEYS as readonly string[]).includes(key)) {
				throw new Error(`details.${kind}.${key} in config.yaml is not one of ${LINK_KEYS.join(", ")}`);
			}
			const template = stringSetting(value, `details.${kind}.${key}`);
			if (template) templates[key as keyof StripLinkTemplates] = template;
		}
		try {
			stripLinks(templates, SAMPLE_SUBJECTS[kind]);
		} catch (error) {
			throw new Error(`details.${kind} in config.yaml: ${(error as Error).message}`);
		}
		result[kind] = templates;
	}
	return result;
}

/**
 * The corrections link's templates, by kind of page, or none when `enabled` (`CORRECTIONS`) is
 * false — which leaves the link out of every page, and the form's address out of the build.
 */
/** Every field filled, so a template asking for one that does not exist fails the build. */
const SAMPLE_SUGGESTION_FIELDS = Object.fromEntries(SUGGESTION_FIELDS.map((field) => [field, "1"])) as SuggestionFields;

/** What an empty search box types into itself, as templates, in order. None, and the box does nothing. */
function loadSuggestions(search: RawConfig["search"]): string[] {
	if (search === undefined || search === null) return [];
	if (typeof search !== "object" || Array.isArray(search)) throw new Error("search in config.yaml must be a mapping");
	for (const key of Object.keys(search)) {
		if (key !== "suggestions") throw new Error(`search.${key} in config.yaml is not one of suggestions`);
	}
	const suggestions = search.suggestions ?? [];
	if (!Array.isArray(suggestions)) throw new Error("search.suggestions in config.yaml must be a list");

	const seen = new Set<string>();
	return suggestions.map((value, index) => {
		const suggestion = stringSetting(value, `search.suggestions[${index}]`);
		if (!suggestion) throw new Error(`search.suggestions[${index}] in config.yaml is empty`);
		if (seen.has(suggestion)) throw new Error(`search.suggestions in config.yaml lists "${suggestion}" twice`);
		seen.add(suggestion);
		try {
			fillSuggestion(suggestion, SAMPLE_SUGGESTION_FIELDS);
		} catch (error) {
			throw new Error(`search.suggestions in config.yaml: ${(error as Error).message}`);
		}
		return suggestion;
	});
}

function loadCorrectionTemplates(corrections: RawConfig["corrections"]): CorrectionTemplates {
	if (
		corrections !== undefined &&
		corrections !== null &&
		(typeof corrections !== "object" || Array.isArray(corrections))
	) {
		throw new Error("corrections in config.yaml must be a mapping");
	}
	if (!flagSetting(corrections?.enabled, "corrections.enabled", true)) return {};

	const pages = corrections?.pages ?? {};
	if (typeof pages !== "object" || Array.isArray(pages)) {
		throw new Error("corrections.pages in config.yaml must be a mapping");
	}
	const result: CorrectionTemplates = {};
	for (const [page, value] of Object.entries(pages)) {
		if (!(CORRECTION_PAGES as readonly string[]).includes(page)) {
			throw new Error(`corrections.pages.${page} in config.yaml is not one of ${CORRECTION_PAGES.join(", ")}`);
		}
		const template = stringSetting(value, `corrections.pages.${page}`);
		if (!template) continue;
		const templates = { [page]: template } as CorrectionTemplates;
		try {
			correctionUrl(templates, page as keyof CorrectionTemplates, { url: "https://example.test/", commit: "sample" });
		} catch (error) {
			throw new Error(`corrections.pages.${page} in config.yaml: ${(error as Error).message}`);
		}
		Object.assign(result, templates);
	}
	return result;
}

/** A size in whole pixels, or `null` when it is not given. */
function pixelSetting(value: unknown, name: string): number | null {
	const raw = stringSetting(value, name);
	if (!raw) return null;
	if (!/^[1-9]\d*$/.test(raw))
		throw new Error(`${name} in config.yaml must be a whole number of pixels (got "${raw}")`);
	return Number(raw);
}

/** A strip's width over its height: a positive number, or `null` where it is not given. */
function ratioSetting(value: unknown, name: string): number | null {
	const raw = stringSetting(value, name);
	if (!raw) return null;
	const ratio = Number(raw);
	if (!(ratio > 0)) throw new Error(`${name} in config.yaml must be a positive number (got "${raw}")`);
	return ratio;
}

function loadAspectRatio(aspectRatio: RawConfig["aspectRatio"]): PageConfig["aspectRatio"] {
	const daily = ratioSetting(aspectRatio?.daily, "aspectRatio.daily");
	if (daily === null) throw new Error("config.yaml must give a daily strip's shape, as aspectRatio.daily");
	return { daily, sunday: ratioSetting(aspectRatio?.sunday, "aspectRatio.sunday") ?? daily };
}

function loadLandingSize(landing: RawConfig["landing"]): PageConfig["landingSize"] {
	const width = pixelSetting(landing?.width, "landing.width");
	const height = pixelSetting(landing?.height, "landing.height");
	if ((width === null) !== (height === null)) {
		throw new Error("landing.width and landing.height in config.yaml go together: give both or neither");
	}
	return width !== null && height !== null ? { width, height } : null;
}

/** The colours `config.yaml` names, by their role on the page. See `theme.ts`, which draws the rest from them. */
export interface Theme {
	background: string;
	text: string;
	textMuted: string;
	main: string;
	bookmark: string;
	neutral: string;
	selected: string;
	hover: string;
	hoverRow: string;
	match: string;
	matchApproximate: string;
}

const THEME_KEYS: readonly (keyof Theme)[] = [
	"background",
	"text",
	"textMuted",
	"main",
	"bookmark",
	"neutral",
	"selected",
	"hover",
	"hoverRow",
	"match",
	"matchApproximate",
];

const HEX_COLOUR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/** Every colour of the theme, as `#rrggbb` in lowercase. There are no defaults: an archive picks its own. */
function loadThemeSettings(theme: RawConfig["theme"]): Theme {
	if (theme === undefined || theme === null) throw new Error("config.yaml must give the site a theme");
	if (typeof theme !== "object" || Array.isArray(theme)) throw new Error("theme in config.yaml must be a mapping");
	for (const key of Object.keys(theme)) {
		if (!(THEME_KEYS as readonly string[]).includes(key)) {
			throw new Error(`theme.${key} in config.yaml is not one of ${THEME_KEYS.join(", ")}`);
		}
	}

	const result = {} as Theme;
	for (const key of THEME_KEYS) {
		const value = stringSetting(theme[key], `theme.${key}`);
		// An unquoted `#f6b213` is a YAML comment, which leaves the setting empty.
		if (!value) throw new Error(`config.yaml must give theme.${key}, as a quoted colour like "#f6b213"`);
		if (!HEX_COLOUR.test(value)) {
			throw new Error(`theme.${key} in config.yaml must be a colour like "#f6b213" (got "${value}")`);
		}
		const digits = value.slice(1).toLowerCase();
		result[key] = `#${digits.length === 3 ? [...digits].map((digit) => digit + digit).join("") : digits}`;
	}
	return result;
}

export function loadTheme(projectDir?: string): Theme {
	return loadThemeSettings(readConfig(projectDir).theme);
}

/** Coarsest last, which is the order the levels must be listed in. */
const GRID_UNITS: readonly GridUnit[] = ["day", "week", "month", "year", "period"];

/** One level of days, all on one page: the grid as it is with no `grid` at all. */
const DEFAULT_GRID: GridConfig = { periods: [], levels: [{ unit: "day", columns: 7, paged: false }], zoom: 0 };

/** A period's start: a year, which is its first of January, or a date. */
function periodStart(value: unknown, name: string): string {
	const raw = value !== null && typeof value === "object" ? "" : stringSetting(value, name);
	if (/^\d{4}$/.test(raw)) return `${raw}-01-01`;
	const date = new Date(`${raw}T00:00:00Z`);
	if (/^\d{4}-\d{2}-\d{2}$/.test(raw) && !isNaN(date.getTime()) && date.toISOString().startsWith(raw)) return raw;
	throw new Error(`${name} in config.yaml must be a year like 1990 or a date like 1990-06-01`);
}

function loadGridPeriods(periods: unknown): GridConfig["periods"] {
	if (periods === undefined || periods === null) return [];
	if (typeof periods !== "object" || Array.isArray(periods)) {
		throw new Error("grid.periods in config.yaml must be a mapping of each period's name to its start");
	}
	// A name that is a whole number, like 1990, is listed before all the others, in numeric order,
	// whatever order the file gives it in — quoted or not. All of them numbers, they come out in
	// numeric order, which is the order of their starts anyway; some of each cannot be put back.
	const names = Object.keys(periods);
	const numeric = names.filter((name) => /^(0|[1-9]\d*)$/.test(name) && Number(name) < 2 ** 32 - 1);
	if (numeric.length > 0 && numeric.length < names.length) {
		throw new Error(
			`grid.periods in config.yaml names some periods with whole numbers, like ${numeric[0]}, and some ` +
				"not, and cannot keep them in order: name all of them with numbers, or none, like 1990s",
		);
	}
	const result = Object.entries(periods).map(([label, value]) => ({
		label,
		start: periodStart(value, `grid.periods.${label}`),
	}));
	result.forEach((period, index) => {
		const previous = result[index - 1];
		if (previous && period.start <= previous.start) {
			throw new Error(`grid.periods.${period.label} in config.yaml must start after ${previous.label} does`);
		}
	});
	return result;
}

function loadGridLevel(value: unknown, index: number, hasPeriods: boolean): GridLevel {
	const name = `grid.levels[${index}]`;
	if (!value || typeof value !== "object" || Array.isArray(value))
		throw new Error(`${name} in config.yaml must be a mapping`);
	const raw = value as Record<string, unknown>;
	for (const key of Object.keys(raw)) {
		if (!["unit", "columns", "page"].includes(key)) {
			throw new Error(`${name}.${key} in config.yaml is not one of unit, columns, page`);
		}
	}

	const unit = stringSetting(raw.unit, `${name}.unit`) as GridUnit;
	if (!GRID_UNITS.includes(unit))
		throw new Error(`${name}.unit in config.yaml must be one of ${GRID_UNITS.join(", ")}`);
	if (unit === "period" && !hasPeriods)
		throw new Error(`${name} in config.yaml is of periods, but grid.periods names none`);

	const columnsRaw = stringSetting(raw.columns, `${name}.columns`);
	if (columnsRaw && !/^[1-9]\d*$/.test(columnsRaw)) {
		throw new Error(`${name}.columns in config.yaml must be a whole number (got "${columnsRaw}")`);
	}
	if (unit === "day" && columnsRaw && columnsRaw !== "7") {
		throw new Error(`${name}.columns in config.yaml must be 7, or left out: days are drawn a week to a row`);
	}
	if (unit !== "day" && !columnsRaw) throw new Error(`${name} in config.yaml must give its columns`);

	const page = stringSetting(raw.page, `${name}.page`);
	if (page && page !== "period") throw new Error(`${name}.page in config.yaml must be period, or left out`);
	if (page && unit === "period") throw new Error(`${name} in config.yaml cannot be paged by the periods it draws`);
	if (page && !hasPeriods) throw new Error(`${name} in config.yaml is paged by period, but grid.periods names none`);

	return { unit, columns: unit === "day" ? 7 : Number(columnsRaw), paged: page === "period" };
}

function loadGrid(grid: RawConfig["grid"]): GridConfig {
	if (grid === undefined || grid === null) return DEFAULT_GRID;
	if (typeof grid !== "object" || Array.isArray(grid)) throw new Error("grid in config.yaml must be a mapping");
	for (const key of Object.keys(grid)) {
		if (!["periods", "levels", "zoom"].includes(key)) {
			throw new Error(`grid.${key} in config.yaml is not one of periods, levels, zoom`);
		}
	}

	const periods = loadGridPeriods(grid.periods);
	if (!Array.isArray(grid.levels) || grid.levels.length === 0) {
		throw new Error("grid.levels in config.yaml must list at least one level");
	}
	const levels = grid.levels.map((level, index) => loadGridLevel(level, index, periods.length > 0));
	if (levels[0].unit !== "day") throw new Error("grid.levels in config.yaml must start with the days");
	levels.forEach((level, index) => {
		const previous = levels[index - 1];
		if (previous && GRID_UNITS.indexOf(level.unit) <= GRID_UNITS.indexOf(previous.unit)) {
			throw new Error(`grid.levels in config.yaml must go from ${GRID_UNITS.join(" to ")}, each at most once`);
		}
	});

	const zoomRaw = stringSetting(grid.zoom, "grid.zoom");
	const zoom = zoomRaw ? levels.findIndex((level) => level.unit === zoomRaw) : 0;
	if (zoom === -1) throw new Error(`grid.zoom in config.yaml must be one of the levels' units (got "${zoomRaw}")`);

	return { periods, levels, zoom };
}

/** The parts of the configuration the pages are drawn with. See `src/site-config.ts`. */
export function loadPageConfig(projectDir?: string): PageConfig {
	const raw = readConfig(projectDir);
	const name = stringSetting(raw.name, "name");
	if (!name) throw new Error("config.yaml must give the site a name");
	const series = stringSetting(raw.series, "series");
	if (!series) throw new Error("config.yaml must say what the archive is of, as series");
	return {
		name,
		series,
		description: stringSetting(raw.description, "description") || null,
		favicon: stringSetting(raw.favicon, "favicon") || null,
		landingImage: stringSetting(raw.landing?.image, "landing.image") || null,
		landingAlt: stringSetting(raw.landing?.alt, "landing.alt") || name,
		landingSize: loadLandingSize(raw.landing),
		themeColor: loadThemeSettings(raw.theme).main,
		details: loadLinkTemplates(raw.details),
		corrections: loadCorrectionTemplates(raw.corrections),
		suggestions: loadSuggestions(raw.search),
		colourSundays: flagSetting(raw.colourSundays, "colourSundays", false),
		aspectRatio: loadAspectRatio(raw.aspectRatio),
		grid: loadGrid(raw.grid),
		...loadFeatures(projectDir),
	};
}

/**
 * Stands in for `src/site-config.ts` in the bundle, as `archiveSpan.ts` does for `src/archive.ts`.
 * Watches `.env` too, since any value in the configuration can read it.
 */
export default function siteConfigLoader(this: LoaderContext<unknown>): string {
	const projectDir = this.rootContext;
	for (const file of configDependencies(projectDir)) this.addDependency(file);
	return `export const PAGE_CONFIG = ${JSON.stringify(loadPageConfig(projectDir))};\n`;
}

/**
 * Where a page's file goes, which is up to the host it is for.
 *
 * - `html`: `credits.html`, served for `/credits` by a host with clean URLs — GitHub Pages,
 *   Neocities, Netlify, Cloudflare. No redirect on a cold load, so a reload keeps `history.state`.
 * - `directory`: `credits/index.html`, which any host serves for `/credits/`. Hosts without clean
 *   URLs need this; most of them answer `/credits` with a redirect to `/credits/`, and the app
 *   puts the address back the way the links spell it.
 *
 * The home page is `index.html` either way.
 */
export type PageLayout = "html" | "directory";

const PAGE_LAYOUTS: readonly PageLayout[] = ["html", "directory"];

export function loadPageLayout(): PageLayout {
	const raw = stringSetting(readConfig().pageLayout, "pageLayout");
	if (!raw) return "html";
	if (!(PAGE_LAYOUTS as readonly string[]).includes(raw)) {
		throw new Error(`pageLayout (PAGE_LAYOUT) must be one of ${PAGE_LAYOUTS.join(", ")} (got "${raw}").`);
	}
	return raw as PageLayout;
}

export function pageAssetPath(routePath: string, layout: PageLayout): string {
	if (routePath === "/") return "index.html";
	return layout === "html" ? `${routePath.slice(1)}.html` : `${routePath.slice(1)}/index.html`;
}

/**
 * The commit the pages were built from, which a correction reports so that it can be read against
 * the archive it was made from. "unknown" where there is no git to ask — a build from a tarball.
 */
export function loadCommitSha(): string {
	try {
		return execSync("git rev-parse --short HEAD", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
	} catch {
		return "unknown";
	}
}

/**
 * Returns the configured site, or `null` when no `url` (`SITE_URL`) is set (so a local build can succeed
 * without one). Throws when a value is set but malformed, so a bad URL fails loudly rather than
 * silently producing wrong output.
 *
 * A path on the URL mounts the site below the origin's root — `https://user.github.io/repo` is
 * what a GitHub project page is served at — and the build writes every address from there.
 */
export function loadSiteConfig(): SiteConfig | null {
	const raw = stringSetting(readConfig().url, "url");
	if (!raw) {
		return null;
	}

	let url: URL;
	try {
		url = new URL(raw);
	} catch {
		throw new Error(`SITE_URL "${raw}" is not a valid URL.`);
	}

	if (url.protocol !== "https:") {
		throw new Error(`SITE_URL must use the https protocol (got "${raw}").`);
	}
	if (url.search || url.hash || url.port) {
		throw new Error(`SITE_URL must be an https URL with no port, query, or fragment (got "${raw}").`);
	}

	const basePath = url.pathname.replace(/\/*$/, "/");
	return { siteUrl: url.origin + basePath.slice(0, -1), host: url.hostname, basePath };
}
