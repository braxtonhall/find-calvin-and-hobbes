import path from "path";
import { Creator, CreditedSpecial, Credit } from "../src/types";
import { ComicSource } from "./comicSource";
import { configName, loadOptionalPart } from "./siteConfig";
import { isUrl, staticPath } from "./staticFiles";

const CREATOR_ID = /^[a-z0-9]+$/;
const COMPACT_DATE = /^\d{8}$/;

/** Which strips a run covers by their day: every one, the Sundays alone, or the rest. */
type RunDays = "sunday" | "daily";

interface Run {
	from: string | null;
	to: string | null;
	days: RunDays | null;
	by: Credit[];
}

/**
 * The creators, as the site reads them, and who made each strip.
 *
 * `byStrip` is keyed as `comics.yaml` keys a strip: by its compact date, or a special's id. `files`
 * are the portraits the build publishes, each file by where it goes, as a book's covers are.
 */
export interface CreatorData {
	creators: Creator[];
	byStrip: Map<string, Credit[]>;
	files: Map<string, string>;
}

const NONE: CreatorData = { creators: [], byStrip: new Map(), files: new Map() };

function isoDate(compact: string): string {
	return `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`;
}

function isSunday(compact: string): boolean {
	const day = new Date(
		Date.UTC(Number(compact.slice(0, 4)), Number(compact.slice(4, 6)) - 1, Number(compact.slice(6, 8))),
	);
	return day.getUTCDay() === 0;
}

/** One credit as the file writes it: an id, or an id with what they did on the strip. */
function readCredit(value: unknown, where: string, known: ReadonlySet<string>): Credit {
	const { id, role } =
		typeof value === "string" ? { id: value, role: undefined } : ((value ?? {}) as { id?: unknown; role?: unknown });
	if (typeof id !== "string" || !known.has(id)) {
		throw new Error(`${where} credits "${String(id)}", who is not one of the people.`);
	}
	if (role === undefined || role === null) return { id };
	if (typeof role !== "string" || role.trim() === "") throw new Error(`${where} gives ${id} an empty role.`);
	return { id, role: role.trim() };
}

function readCredits(value: unknown, where: string, known: ReadonlySet<string>): Credit[] {
	if (!Array.isArray(value) || value.length === 0) throw new Error(`${where} must credit a list of people.`);
	const credits = value.map((item) => readCredit(item, where, known));
	const ids = credits.map((credit) => credit.id);
	const repeated = ids.find((id, index) => ids.indexOf(id) !== index);
	if (repeated) throw new Error(`${where} credits ${repeated} twice.`);
	return credits;
}

function readBound(value: unknown, name: string, where: string): string | null {
	if (value === undefined || value === null) return null;
	const compact = String(value);
	if (!COMPACT_DATE.test(compact)) throw new Error(`${where}'s ${name} must be a date as YYYYMMDD (got "${compact}").`);
	return compact;
}

function readRun(value: unknown, index: number, known: ReadonlySet<string>): Run {
	const where = `Run ${index + 1} of the creators`;
	const { from, to, days, by } = (value ?? {}) as { from?: unknown; to?: unknown; days?: unknown; by?: unknown };
	if (days !== undefined && days !== null && days !== "sunday" && days !== "daily") {
		throw new Error(`${where}'s days must be sunday or daily (got "${String(days)}").`);
	}
	const run: Run = {
		from: readBound(from, "from", where),
		to: readBound(to, "to", where),
		days: (days as RunDays | undefined) ?? null,
		by: readCredits(by, where, known),
	};
	if (run.from && run.to && run.from > run.to) throw new Error(`${where} ends before it starts.`);
	return run;
}

function covers(run: Run, compact: string): boolean {
	if (run.from && compact < run.from) return false;
	if (run.to && compact > run.to) return false;
	if (run.days === "sunday") return isSunday(compact);
	if (run.days === "daily") return !isSunday(compact);
	return true;
}

/**
 * A portrait as the site shows it: a URL as it is, or a file named with `!Path`, as the path it is
 * published at, from the mount, and noted in `files` for the build to copy there.
 */
function readImage(value: unknown, id: string, basePath: string, files: Map<string, string>, config?: string) {
	if (value === undefined || value === null) return undefined;
	if (typeof value === "string" && isUrl(value)) return value;
	if (typeof value === "string" && path.isAbsolute(value)) {
		const published = staticPath(value);
		files.set(published, value);
		return `${basePath}${published}`;
	}
	throw new Error(`Creator "${id}"'s image in ${configName(config)} must be a URL, or a file as !Path ./portrait.png`);
}

/**
 * The strips' dates as ranges, each running over the strips in order, so a stretch with no strip of
 * its own — a rerun, a break — does not split one. Written as a book's date ranges are.
 */
function rangesOf(dates: string[], all: string[]): string[] {
	const credited = new Set(dates);
	const ranges: string[] = [];
	let start: string | null = null;
	let previous: string | null = null;
	const close = () => {
		if (start) ranges.push(start === previous ? start : `${start}-${previous}`);
		start = null;
	};
	for (const date of all) {
		if (credited.has(date)) {
			start ??= date;
			previous = date;
		} else {
			close();
		}
	}
	close();
	return ranges;
}

/** The creators' `strips` or `specials`: each by its key, to the people credited. Empty where there are none. */
function readMapping(value: unknown, name: string): Record<string, unknown> {
	if (value === undefined || value === null) return {};
	if (typeof value !== "object" || Array.isArray(value)) {
		throw new Error(`The creators' ${name} must be a mapping of ${name} to the people credited.`);
	}
	return value as Record<string, unknown>;
}

/**
 * The creators and who made each strip, from the file `config.yaml` names:
 *
 *   people   each creator by id, with a `name`, and optionally an `image` and a `link` out
 *   runs     stretches of the dailies and Sundays each credited to people, `from` and `to`
 *            (YYYYMMDD, both ends in, either left open), and optionally only the Sundays or only
 *            the `daily` strips. A later run takes a strip from an earlier one. Never a special:
 *            one is a strip of its own, outside the run of the paper, and who made it is said of
 *            it alone or not at all.
 *   strips   single dailies and Sundays, by date, credited to people, over any run
 *   specials specials, by id, credited to people, as `comics.yaml` names them
 *
 * A credit is an id, or `{ id, role }`, where the role is what they did on the strip: `story`,
 * `art`. A strip is credited to the people of its last run or its own entry, never both added up,
 * so a week of guest strips needs no way to take anyone off.
 *
 * None, and nothing read, where `config.yaml` turns creators off.
 */
export function loadCreators(source: ComicSource, basePath: string = "/", config?: string): CreatorData {
	const raw = loadOptionalPart("creators", config);
	if (raw === false) return NONE;
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
		throw new Error(
			`creators in ${configName(config)} must be a mapping of people, runs, strips and specials, or false`,
		);
	}
	const { people, runs, strips, specials } = raw as {
		people?: unknown;
		runs?: unknown;
		strips?: unknown;
		specials?: unknown;
	};
	if (!people || typeof people !== "object" || Array.isArray(people)) {
		throw new Error(`The creators must list their people, each by id.`);
	}

	const files = new Map<string, string>();
	const listed: Omit<Creator, "ranges" | "strips" | "years">[] = [];
	for (const [id, entry] of Object.entries(people as Record<string, unknown>)) {
		if (!CREATOR_ID.test(id)) throw new Error(`Invalid creator id "${id}": expected lowercase letters and digits.`);
		const { name, image, link } = (entry ?? {}) as { name?: unknown; image?: unknown; link?: unknown };
		if (typeof name !== "string" || name.trim() === "") throw new Error(`Creator "${id}" needs a name.`);
		if (link !== undefined && link !== null && (typeof link !== "string" || !isUrl(link))) {
			throw new Error(`Creator "${id}"'s link must be a URL.`);
		}
		const portrait = readImage(image, id, basePath, files, config);
		listed.push({
			id,
			name: name.trim(),
			...(portrait ? { image: portrait } : {}),
			...(typeof link === "string" ? { link } : {}),
		});
	}
	const known = new Set(listed.map((creator) => creator.id));

	if (runs !== undefined && runs !== null && !Array.isArray(runs))
		throw new Error(`The creators' runs must be a list.`);
	const readRuns = ((runs ?? []) as unknown[]).map((run, index) => readRun(run, index, known));

	const byStrip = new Map<string, Credit[]>();
	const credit = (compact: string) => {
		const run = readRuns.findLast((candidate) => covers(candidate, compact));
		if (run) byStrip.set(compact, run.by);
	};
	for (const compact of Object.keys(source.strips)) credit(compact);

	for (const [key, value] of Object.entries(readMapping(strips, "strips"))) {
		if (!source.strips[key]) throw new Error(`The creators credit strip ${key}, which is not a strip.`);
		byStrip.set(key, readCredits(value, `Strip ${key} in the creators`, known));
	}
	for (const [key, value] of Object.entries(readMapping(specials, "specials"))) {
		if (!source.specials[key]) throw new Error(`The creators credit special ${key}, which is not a special.`);
		byStrip.set(key, readCredits(value, `Special ${key} in the creators`, known));
	}

	const days = Object.keys(source.strips).sort();
	const creators = listed.map((creator): Creator => {
		const credits = [...byStrip].filter(([, credits]) => credits.some((credit) => credit.id === creator.id));
		if (credits.length === 0) throw new Error(`Creator "${creator.id}" is credited on no strip.`);
		const dates = credits.map(([key]) => key).filter((key) => source.strips[key]);
		const specials = credits
			.flatMap(([key]): CreditedSpecial[] => {
				const special = source.specials[key];
				return special ? [{ id: key, title: special.title, date: isoDate(special.date) }] : [];
			})
			.sort(
				(a, b) => a.date.localeCompare(b.date) || (source.specials[a.id].sort ?? 0) - (source.specials[b.id].sort ?? 0),
			);
		const years = new Set(credits.map(([key]) => Number((source.specials[key]?.date ?? key).slice(0, 4))));
		const roles = [
			...new Set(
				credits.flatMap(([, credits]) =>
					credits.filter((credit) => credit.id === creator.id && credit.role).map((credit) => credit.role!),
				),
			),
		];
		return {
			...creator,
			strips: credits.length,
			years: [...years].sort((a, b) => a - b),
			ranges: rangesOf(dates, days),
			...(roles.length > 0 ? { roles } : {}),
			...(specials.length > 0 ? { specials } : {}),
		};
	});

	return { creators, byStrip, files };
}

export function exportCreatorsJson(creators: Creator[]): string {
	return JSON.stringify(creators);
}
