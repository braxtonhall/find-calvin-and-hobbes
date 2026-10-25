/**
 * The library as a cloud save keeps it: a Yjs document of three maps, matching the app's schema on
 * the service. Bookmarks map an id to `true`; strips and books map an id to a map of its own of
 * `owned` and `note`, field by field, so that one browser owning a strip while another notes it
 * keeps both. Pure, so it can be tested without a browser or a service; `cloud-sync.ts` moves it
 * in and out of IndexedDB.
 */

import * as Y from "yjs";
import type { LibraryChange } from "./cloud-saves";
import { LibraryData, OwnershipRecord, cleanNote, ownershipRecord } from "./library-file";

/** The document's maps, as the client and the service's schema name them. */
export const LIBRARY_ROOTS = { bookmarks: "map", strips: "map", books: "map" } as const;

export type LibraryRoot = keyof typeof LIBRARY_ROOTS;

/**
 * The ids the service takes. One that isn't — a file's id this archive never had, say — stays in
 * this browser's library, out of the cloud save, since the service would refuse the whole change.
 */
const CLOUD_ID = /^[A-Za-z0-9_-]{1,64}$/;

export function savableId(id: string): boolean {
	return CLOUD_ID.test(id);
}

function root(doc: Y.Doc, name: LibraryRoot): Y.Map<unknown> {
	return doc.getMap<unknown>(name);
}

/** A record as a cloud save holds it, or `null` where it holds none — or nothing a record could be. */
export function recordFromDoc(doc: Y.Doc, name: "strips" | "books", id: string): OwnershipRecord | null {
	const value = root(doc, name).get(id);
	const fields = value instanceof Y.Map ? value.toJSON() : value;
	if (typeof fields !== "object" || fields === null) return null;
	const { owned, note } = fields as Record<string, unknown>;
	const record = ownershipRecord(id, owned === true, typeof note === "string" ? cleanNote(note) : undefined);
	return record.owned || record.note !== undefined ? record : null;
}

export function bookmarkedInDoc(doc: Y.Doc, id: string): boolean {
	return root(doc, "bookmarks").get(id) === true;
}

/** Everything in a cloud save, as this browser's library holds it. */
export function libraryFromDoc(doc: Y.Doc): LibraryData {
	const records = (name: "strips" | "books") =>
		[...root(doc, name).keys()].flatMap((id) => recordFromDoc(doc, name, id) ?? []);
	return {
		bookmarks: [...root(doc, "bookmarks").keys()].filter((id) => bookmarkedInDoc(doc, id)),
		strips: records("strips"),
		books: records("books"),
	};
}

function writeBookmark(doc: Y.Doc, id: string, bookmarked: boolean): void {
	if (!savableId(id)) return;
	const bookmarks = root(doc, "bookmarks");
	if (bookmarked && bookmarks.get(id) !== true) bookmarks.set(id, true);
	else if (!bookmarked && bookmarks.has(id)) bookmarks.delete(id);
}

/** One record into its map, changing only the fields that differ; neither owned nor noted, it is taken out. */
function writeRecord(doc: Y.Doc, name: "strips" | "books", record: OwnershipRecord): void {
	if (!savableId(record.id)) return;
	const records = root(doc, name);
	if (!record.owned && record.note === undefined) {
		if (records.has(record.id)) records.delete(record.id);
		return;
	}
	let fields = records.get(record.id);
	if (!(fields instanceof Y.Map)) {
		fields = new Y.Map<unknown>();
		records.set(record.id, fields);
	}
	const map = fields as Y.Map<unknown>;
	if (map.get("owned") !== record.owned) map.set("owned", record.owned);
	if (record.note === undefined) {
		if (map.has("note")) map.delete("note");
	} else if (map.get("note") !== record.note) {
		map.set("note", record.note);
	}
}

/** Makes the cloud save hold `data` and nothing else it can hold, touching only what differs. */
export function writeLibrary(doc: Y.Doc, data: LibraryData): void {
	const bookmarks = new Set(data.bookmarks);
	for (const id of [...root(doc, "bookmarks").keys()]) if (!bookmarks.has(id)) root(doc, "bookmarks").delete(id);
	for (const id of bookmarks) writeBookmark(doc, id, true);
	for (const [name, list] of [
		["strips", data.strips],
		["books", data.books],
	] as const) {
		const ids = new Set(list.map((record) => record.id));
		for (const id of [...root(doc, name).keys()]) if (!ids.has(id)) root(doc, name).delete(id);
		for (const record of list) writeRecord(doc, name, record);
	}
}

/** A change the reader made, into the cloud save, as one edit made by `origin`. */
export function applyLibraryChange(doc: Y.Doc, change: LibraryChange, origin: unknown): void {
	doc.transact(() => {
		if (change.kind === "bookmark") writeBookmark(doc, change.id, change.bookmarked);
		else if (change.kind === "library") writeLibrary(doc, change.data);
		else writeRecord(doc, change.kind === "strip" ? "strips" : "books", change.record);
	}, origin);
}

/**
 * The entries one edit to a cloud save touched, by map: from the events `observeDeep` hands a map —
 * a key of the map itself, or a field of one of its records, which is that record's.
 */
export function changedIds(events: Y.YEvent<Y.AbstractType<unknown>>[]): Set<string> {
	const ids = new Set<string>();
	for (const event of events) {
		if (event.path.length === 0) for (const key of event.keys.keys()) ids.add(key);
		else ids.add(String(event.path[0]));
	}
	return ids;
}
