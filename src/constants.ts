import { ARCHIVE_SPAN } from "./archive";

export const DATABASE_NAME = "bookmarks-db";
export const DATABASE_VERSION = 1;
export const STORE_NAME = "bookmarks";

// All three come from `comics.yaml`, by way of `archive.ts`.
export const SABBATICALS: [string, string][] = ARCHIVE_SPAN.gaps;

export const RANGE_START = ARCHIVE_SPAN.start;
export const RANGE_END = ARCHIVE_SPAN.end;

const FIRST_YEAR = Number(RANGE_START.slice(0, 4));
const LAST_YEAR = Number(RANGE_END.slice(0, 4));

/** Every year the strip ran in, ascending. */
export const YEARS: readonly number[] = Array.from(
	{ length: LAST_YEAR - FIRST_YEAR + 1 },
	(_, offset) => FIRST_YEAR + offset,
);
