/**
 * Which of a term's two spellings to offer — `color` or `colour` — while what has been typed fits
 * both. Browsers keep no spelling preference to ask, so it is guessed, in order:
 *
 * 1. the spelling the reader last committed in full, remembered in this browser;
 * 2. American where the browser's first language is `en-US` and its time zone is one of the United
 *    States' — `en-US` alone is the default English of too many installs to mean much, and
 *    `America/*` alone takes in Canada and the rest of the Americas;
 * 3. otherwise the other spelling.
 *
 * The guess only matters until the fifth letter, which rules one of them out.
 */

export type Spelling = "american" | "british";

const STORAGE_KEY = "spelling";

/** The United States' time zones, as browsers name them. */
const US_TIME_ZONES = new Set([
	"America/New_York",
	"America/Detroit",
	"America/Kentucky/Louisville",
	"America/Kentucky/Monticello",
	"America/Indiana/Indianapolis",
	"America/Indiana/Vincennes",
	"America/Indiana/Winamac",
	"America/Indiana/Marengo",
	"America/Indiana/Petersburg",
	"America/Indiana/Vevay",
	"America/Indiana/Tell_City",
	"America/Indiana/Knox",
	"America/Chicago",
	"America/Menominee",
	"America/North_Dakota/Center",
	"America/North_Dakota/New_Salem",
	"America/North_Dakota/Beulah",
	"America/Denver",
	"America/Boise",
	"America/Phoenix",
	"America/Los_Angeles",
	"America/Anchorage",
	"America/Juneau",
	"America/Sitka",
	"America/Metlakatla",
	"America/Yakutat",
	"America/Nome",
	"America/Adak",
	"Pacific/Honolulu",
	"US/Eastern",
	"US/Central",
	"US/Mountain",
	"US/Pacific",
	"US/Alaska",
	"US/Hawaii",
	"US/Arizona",
]);

/** Set by a test, which has no browser to ask. */
let fixed: Spelling | null = null;

export function setSpelling(spelling: Spelling | null): void {
	fixed = spelling;
}

/** Step 2: the browser's language and time zone, together. */
export function guessSpelling(language: string | undefined, timeZone: string | undefined): Spelling {
	return language === "en-US" && timeZone !== undefined && US_TIME_ZONES.has(timeZone) ? "american" : "british";
}

/** Step 1: the spelling kept in this browser, or none — the Settings page's "Inferred". */
export function rememberedSpelling(): Spelling | null {
	try {
		const value = localStorage.getItem(STORAGE_KEY);
		return value === "american" || value === "british" ? value : null;
	} catch {
		return null;
	}
}

/** Keeps a spelling, chosen on the Settings page — or, given none, forgets it, back to the guess. */
export function chooseSpelling(spelling: Spelling | null): void {
	try {
		if (spelling === null) localStorage.removeItem(STORAGE_KEY);
		else localStorage.setItem(STORAGE_KEY, spelling);
	} catch {
		// Storage blocked — the guess will do.
	}
}

/** Step 2, asked of this browser. */
export function guessedSpelling(): Spelling {
	try {
		return guessSpelling(
			navigator.languages?.[0] ?? navigator.language,
			Intl.DateTimeFormat().resolvedOptions().timeZone,
		);
	} catch {
		return "british";
	}
}

export function preferredSpelling(): Spelling {
	if (fixed !== null) return fixed;
	return rememberedSpelling() ?? guessedSpelling();
}

/** Remembers the spelling a reader has written out in full: `@is:color` or `@is:colour`. */
export function rememberSpelling(text: string): void {
	const spelt = /@is:colou?r(?![a-z])/i.exec(text);
	if (spelt === null) return;
	chooseSpelling(/colour/i.test(spelt[0]) ? "british" : "american");
}
