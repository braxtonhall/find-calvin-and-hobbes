import { ARCHIVE_SPAN } from "./archive";

// Named for what it first held; it holds the whole library now. See `database.ts`.
export const DATABASE_NAME = "bookmarks-db";
export const DATABASE_VERSION = 2;
export const STORE_NAME = "bookmarks";
/** What the reader owns or has noted of each printing in the paper, by `ownershipId`. */
export const STRIPS_STORE_NAME = "owned-strips";
/** What the reader owns or has noted of each book, by its collection id. */
export const BOOKS_STORE_NAME = "owned-books";

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
