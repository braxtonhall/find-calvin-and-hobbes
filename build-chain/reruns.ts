import { ComicSource } from "./comicSource";
import { loadOptionalPart, configName } from "./siteConfig";

export type Reruns = Record<string, string>;

function isCompactDate(value: string): boolean {
	if (!/^\d{8}$/.test(value)) return false;
	const year = Number(value.slice(0, 4));
	const month = Number(value.slice(4, 6));
	const day = Number(value.slice(6, 8));
	const date = new Date(Date.UTC(year, month - 1, day));
	return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function compactToIsoDate(value: string): string {
	return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}

/** None, and nothing read, where `config.yaml` turns reruns off. */
export function loadReruns(source: ComicSource, config?: string): Reruns {
	const raw = loadOptionalPart("reruns", config);
	if (raw === false) return {};
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
		throw new Error(`reruns in ${configName(config)} must be a date mapping, or false`);
	}

	const originalDates = new Set([
		...Object.keys(source.strips),
		...Object.values(source.specials).map((special) => special.date),
	]);
	const reruns: Reruns = {};
	for (const [rerunCompact, originalCompact] of Object.entries(raw as Record<string, unknown>)) {
		if (!isCompactDate(rerunCompact) || typeof originalCompact !== "string" || !isCompactDate(originalCompact)) {
			throw new Error(`Invalid rerun mapping "${rerunCompact}": expected YYYYMMDD dates.`);
		}
		const rerun = compactToIsoDate(rerunCompact);
		const original = compactToIsoDate(originalCompact);
		if (reruns[rerun]) throw new Error(`Duplicate rerun date "${rerun}".`);
		if (!originalDates.has(originalCompact)) {
			throw new Error(`Rerun ${rerun} refers to missing original date ${original}.`);
		}
		reruns[rerun] = original;
	}

	return reruns;
}

export function exportRerunsJson(source: ComicSource, config?: string): string {
	return JSON.stringify(loadReruns(source, config));
}
