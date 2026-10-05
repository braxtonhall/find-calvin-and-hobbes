import type { ArchiveSpan } from "./archive";

/**
 * The fields a suggestion in `config.yaml` can be written with, filled in when the reader asks for
 * one, so that some of them are about today:
 *
 * - `{{today.month}}` and `{{today.day}}`: today's month, as `oct`, and its day of the month, as `5`.
 * - `{{featured.month}}`, `{{featured.day}}` and `{{featured.year}}`: today's date in the strip's
 *   run (see `featuredDate`), in the same spellings: a day the strip ran new, or reran one.
 *
 * Free of the configuration, unlike `suggestions.ts`, so that the build can check the templates
 * with it while it reads them.
 */

export const SUGGESTION_FIELDS = [
	"today.month",
	"today.day",
	"featured.month",
	"featured.day",
	"featured.year",
] as const;

export type SuggestionFields = Partial<Record<(typeof SUGGESTION_FIELDS)[number], string>>;

const SHORT_MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

const FIELD = /\{\{\s*([\w.]+)\s*\}\}/g;

/**
 * A suggestion with its fields filled in, or `null` when it asks for one there is no value for
 * today — a featured date, in an archive without a full year. Throws at a field that does not exist.
 */
export function fillSuggestion(template: string, fields: SuggestionFields): string | null {
	let missing = false;
	const filled = template.replace(FIELD, (token, name: string) => {
		if (!(SUGGESTION_FIELDS as readonly string[]).includes(name)) {
			throw new Error(`Unknown field ${token} in suggestion "${template}"`);
		}
		const value = fields[name as keyof SuggestionFields];
		if (value === undefined) missing = true;
		return value ?? "";
	});
	return missing ? null : filled;
}

function iso(year: number, monthIndex: number, day: number): string {
	return `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Today's date in the strip's run, as an ISO date: the archive's full years, from January to
 * December, repeated end to end from the first of them — so for a strip whose full years are
 * 1986 to 1995, 2026 is 1986, 2035 is 1995, and 2036 starts again at 1986.
 *
 * A leap day in a common year is the day before. A date in a gap in the run — a sabbatical — is
 * still a day of the run if the paper reran a strip on it, which `reruns` says, and is empty where
 * the site has no reruns. Otherwise it moves to the next year of the cycle that has the date, so the
 * reader still gets today's date. `null` where there is no full year, or no year of the cycle has
 * the date at all.
 */
export function featuredDate(today: Date, span: ArchiveSpan, reruns: Readonly<Record<string, string>>): string | null {
	const firstFull = Number(span.start.slice(0, 4)) + (span.start.endsWith("-01-01") ? 0 : 1);
	const lastFull = Number(span.end.slice(0, 4)) - (span.end.endsWith("-12-31") ? 0 : 1);
	const cycle = lastFull - firstFull + 1;
	if (cycle < 1) return null;

	const month = today.getMonth();
	const offset = (((today.getFullYear() - firstFull) % cycle) + cycle) % cycle;
	for (let step = 0; step < cycle; step++) {
		const year = firstFull + ((offset + step) % cycle);
		const date = new Date(year, month, today.getDate());
		const day = date.getMonth() === month ? today.getDate() : today.getDate() - 1;
		const candidate = iso(year, month, day);
		const inGap = span.gaps.some(([start, end]) => start <= candidate && candidate <= end);
		if (!inGap || Object.hasOwn(reruns, candidate)) return candidate;
	}
	return null;
}

/** The fields for today. */
export function suggestionFields(
	today: Date,
	span: ArchiveSpan,
	reruns: Readonly<Record<string, string>>,
): SuggestionFields {
	const fields: SuggestionFields = {
		"today.month": SHORT_MONTHS[today.getMonth()],
		"today.day": String(today.getDate()),
	};
	const featured = featuredDate(today, span, reruns);
	if (featured) {
		const [year, month, day] = featured.split("-").map(Number);
		fields["featured.month"] = SHORT_MONTHS[month - 1];
		fields["featured.day"] = String(day);
		fields["featured.year"] = String(year);
	}
	return fields;
}
