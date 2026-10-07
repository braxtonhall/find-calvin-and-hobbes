import { BOOKS_STORE_NAME, STORE_NAME, STRIPS_STORE_NAME } from "./constants";
import { inTransaction } from "./database";
import { LibraryData, OwnershipRecord, cleanNote } from "./library-file";

export type OwnershipKind = "strip" | "book";

function storeFor(kind: OwnershipKind): string {
	return kind === "strip" ? STRIPS_STORE_NAME : BOOKS_STORE_NAME;
}

export function getOwnership(kind: OwnershipKind, id: string): Promise<OwnershipRecord | null> {
	const store = storeFor(kind);
	return inTransaction<OwnershipRecord | null>([store], "readonly", (transaction, finish) => {
		const request = transaction.objectStore(store).get(id);
		request.onsuccess = () => finish((request.result as OwnershipRecord | undefined) ?? null);
	});
}

/**
 * Changes one record, read and written in the same transaction so a change made before the page
 * has read the record cannot write over the rest of it. A record left neither owned nor noted is
 * removed. Settles with the record as it now stands.
 */
export function updateOwnership(
	kind: OwnershipKind,
	id: string,
	change: (record: OwnershipRecord) => Partial<OwnershipRecord>,
): Promise<OwnershipRecord> {
	const name = storeFor(kind);
	return inTransaction<OwnershipRecord>([name], "readwrite", (transaction, finish) => {
		const store = transaction.objectStore(name);
		const request = store.get(id);
		request.onsuccess = () => {
			const current: OwnershipRecord = (request.result as OwnershipRecord | undefined) ?? { id, owned: false };
			const changed = { ...current, ...change(current), id };
			const note = cleanNote(changed.note);
			const next: OwnershipRecord =
				note === undefined ? { id, owned: changed.owned } : { id, owned: changed.owned, note };
			if (next.owned || next.note !== undefined) store.put(next);
			else store.delete(id);
			finish(next);
		};
	});
}

/** Everything in the library, as a file holds it. */
export function readLibrary(): Promise<LibraryData> {
	return inTransaction<LibraryData>(
		[STORE_NAME, STRIPS_STORE_NAME, BOOKS_STORE_NAME],
		"readonly",
		(transaction, finish) => {
			const data: LibraryData = { bookmarks: [], strips: [], books: [] };
			const bookmarks = transaction.objectStore(STORE_NAME).getAllKeys();
			bookmarks.onsuccess = () => (data.bookmarks = bookmarks.result.map(String));
			const strips = transaction.objectStore(STRIPS_STORE_NAME).getAll();
			strips.onsuccess = () => (data.strips = strips.result as OwnershipRecord[]);
			const books = transaction.objectStore(BOOKS_STORE_NAME).getAll();
			books.onsuccess = () => (data.books = books.result as OwnershipRecord[]);
			finish(data);
		},
	);
}

/** Replaces everything in the library with `data`, in one transaction: all of it, or none. */
export function replaceLibrary(data: LibraryData): Promise<void> {
	return inTransaction<void>([STORE_NAME, STRIPS_STORE_NAME, BOOKS_STORE_NAME], "readwrite", (transaction, finish) => {
		const bookmarks = transaction.objectStore(STORE_NAME);
		const strips = transaction.objectStore(STRIPS_STORE_NAME);
		const books = transaction.objectStore(BOOKS_STORE_NAME);
		bookmarks.clear();
		strips.clear();
		books.clear();
		for (const date of data.bookmarks) bookmarks.put({ date });
		for (const record of data.strips) strips.put(record);
		for (const record of data.books) books.put(record);
		finish();
	});
}
