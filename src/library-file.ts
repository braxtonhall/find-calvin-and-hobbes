/**
 * The library as a file: what the Settings page exports, and reads back on import. Pure, so the
 * rules for reading a file and merging it into what is already here can be tested without a
 * browser. `ownership.ts` moves it in and out of IndexedDB.
 */

export const LIBRARY_FILE_VERSION = 1;

/**
 * What the reader owns or has noted of one strip or book. A strip is one printing in the paper — a
 * rerun is its own, by the date it reran — keyed as `ownershipId` keys it; a book by its collection
 * id. A record that is neither owned nor noted is not kept.
 */
export interface OwnershipRecord {
	id: string;
	owned: boolean;
	note?: string;
}

/**
 * The id a strip is owned by: the printing, not the strip. A special by its id; anything that ran in
 * the paper by the day it ran, compact — so a rerun is owned apart from the strip it reran, as a
 * clipping of it carries its own date.
 */
export function ownershipId(comic: { id?: string }, runDate: string): string {
	return comic.id || runDate.replace(/-/g, "");
}

/**
 * The id a strip is bookmarked by: the printing, as `ownershipId`'s is, but with the day it ran
 * written as a strip's page writes it. Bookmarks were once a whole day's, kept by that date, so each
 * one kept from then is now the bookmark of the strip that ran on the day — not of a special.
 */
export function bookmarkId(comic: { id?: string }, runDate: string): string {
	return comic.id || runDate;
}

export interface LibraryData {
	/** By `bookmarkId`: a special's id, or the date it ran, as a strip's page writes it — `1987-05-24`. */
	bookmarks: string[];
	strips: OwnershipRecord[];
	books: OwnershipRecord[];
}

export interface LibraryFile extends LibraryData {
	version: number;
	/** Where the file was exported from, so an import elsewhere can warn it may be another archive's. */
	site: string;
}

export type ParsedLibraryFile =
	{ ok: true; site: string | null; data: LibraryData; skipped: number } | { ok: false; error: string };

export function libraryFile(data: LibraryData, site: string): LibraryFile {
	return { version: LIBRARY_FILE_VERSION, site, ...data };
}

/** `example.com-library-export-2026-10-06.json`, dated in the reader's own time zone. */
export function libraryFileName(hostname: string, date: Date): string {
	const pad = (value: number) => String(value).padStart(2, "0");
	const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
	return `${hostname}-library-export-${day}.json`;
}

export function isLibraryEmpty(data: LibraryData): boolean {
	return data.bookmarks.length === 0 && data.strips.length === 0 && data.books.length === 0;
}

/** A note as kept: without the blank around it, and none at all where it is only blank. */
export function cleanNote(note: string | undefined): string | undefined {
	const trimmed = note?.trim();
	return trimmed ? trimmed : undefined;
}

/**
 * Two notes on the same thing, as one: the one there is where the other is missing, the old alone
 * where it already holds the new, and otherwise the old then the new, each on its own line.
 *
 * "Holds" goes by whole lines, so a file merged in twice adds its note once, while a note of "red"
 * still joins one of "colored".
 */
export function mergeNotes(old: string | undefined, incoming: string | undefined): string | undefined {
	const a = cleanNote(old);
	const b = cleanNote(incoming);
	if (!a || !b) return a ?? b;
	return `\n${a}\n`.includes(`\n${b}\n`) ? a : `${a}\n${b}`;
}

function mergeRecord(old: OwnershipRecord, incoming: OwnershipRecord): OwnershipRecord {
	return ownershipRecord(old.id, old.owned || incoming.owned, mergeNotes(old.note, incoming.note));
}

/** A record as the library keeps it: with no `note` at all where there is none. */
export function ownershipRecord(id: string, owned: boolean, note: string | undefined): OwnershipRecord {
	return note === undefined ? { id, owned } : { id, owned, note };
}

/** Records by id, any id given twice merged into one, in the order each id first appears. */
function mergeRecords(...lists: OwnershipRecord[][]): OwnershipRecord[] {
	const byId = new Map<string, OwnershipRecord>();
	for (const list of lists) {
		for (const entry of list) {
			const existing = byId.get(entry.id);
			byId.set(entry.id, existing ? mergeRecord(existing, entry) : entry);
		}
	}
	return [...byId.values()];
}

/**
 * The library here with a file's merged into it: every bookmark of either, and a strip or book in
 * both owned if either owns it, with both notes. Nothing here is lost.
 */
export function mergeLibraries(current: LibraryData, incoming: LibraryData): LibraryData {
	return {
		bookmarks: [...new Set([...current.bookmarks, ...incoming.bookmarks])],
		strips: mergeRecords(current.strips, incoming.strips),
		books: mergeRecords(current.books, incoming.books),
	};
}

/**
 * One record from a file, or `null` where it is not one: an object with a non-empty string `id`,
 * an `owned` that is true or false if it is there at all, and a `note` that is text if it is there.
 */
function readRecord(value: unknown): OwnershipRecord | null {
	if (typeof value !== "object" || value === null) return null;
	const { id, owned, note } = value as Record<string, unknown>;
	if (typeof id !== "string" || id.trim() === "") return null;
	if (owned !== undefined && typeof owned !== "boolean") return null;
	if (note !== undefined && typeof note !== "string") return null;
	return ownershipRecord(id.trim(), (owned as boolean | undefined) ?? false, cleanNote(note as string | undefined));
}

/**
 * Reads an exported file. A file that is not one — not JSON, not an object, a version this site
 * does not know, a list that is not a list — is refused whole. Within the lists, an entry that is
 * not a bookmark or a record is skipped and counted, and the rest are read. An id this archive has
 * never heard of is kept: the archive's data is corrected over time, and the reader's library
 * should not be corrected with it.
 */
export function parseLibraryFile(text: string): ParsedLibraryFile {
	let raw: unknown;
	try {
		raw = JSON.parse(text);
	} catch {
		return { ok: false, error: "This file isn't a library export: it isn't JSON." };
	}
	if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
		return { ok: false, error: "This file isn't a library export." };
	}
	const file = raw as Record<string, unknown>;
	if (file.version !== LIBRARY_FILE_VERSION) {
		return typeof file.version === "number" && file.version > LIBRARY_FILE_VERSION
			? { ok: false, error: "This file was exported by a newer version of the site." }
			: { ok: false, error: "This file isn't a library export." };
	}
	for (const name of ["bookmarks", "strips", "books"]) {
		if (file[name] !== undefined && !Array.isArray(file[name])) {
			return { ok: false, error: `This file isn't a library export: its ${name} aren't a list.` };
		}
	}

	let skipped = 0;
	const bookmarks: string[] = [];
	for (const value of (file.bookmarks as unknown[] | undefined) ?? []) {
		if (typeof value === "string" && value.trim() !== "") bookmarks.push(value.trim());
		else skipped++;
	}
	const records = (values: unknown[] | undefined): OwnershipRecord[] => {
		const read: OwnershipRecord[] = [];
		for (const value of values ?? []) {
			const entry = readRecord(value);
			if (!entry) skipped++;
			// Neither owned nor noted is what having no record says already.
			else if (entry.owned || entry.note !== undefined) read.push(entry);
		}
		return mergeRecords(read);
	};

	return {
		ok: true,
		site: typeof file.site === "string" ? file.site : null,
		data: {
			bookmarks: [...new Set(bookmarks)],
			strips: records(file.strips as unknown[] | undefined),
			books: records(file.books as unknown[] | undefined),
		},
		skipped,
	};
}
