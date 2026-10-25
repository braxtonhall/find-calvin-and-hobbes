/**
 * Experimental cloud saves: the reader's library, kept in a bobs-sink document as well as in this
 * browser, so it follows them to their other browsers. Only for a site whose `config.yaml` names a
 * service, and only once a reader turns them on.
 *
 * This is the part every page carries: whether they are on, and the changes to the library that
 * have to reach the cloud. The rest — the client, and the document the library is kept in — is
 * `cloud-sync.ts`, fetched only once they are on.
 */

import { PAGE_CONFIG } from "./site-config";
import type { LibraryData, OwnershipRecord } from "./library-file";

/** One change the reader made to the library: a bookmark, a record as it now stands, or all of it at once. */
export type LibraryChange =
	| { kind: "bookmark"; id: string; bookmarked: boolean }
	| { kind: "strip" | "book"; record: OwnershipRecord }
	| { kind: "library"; data: LibraryData };

const STORAGE_KEY = "cloud-saves";

/** The service's origin, from `config.yaml`, or `null` where the site has no cloud saves. */
export function cloudSavesService(): string | null {
	return PAGE_CONFIG.cloudSaves;
}

/** Whether this browser saves its library to the cloud. */
export function cloudSavesOn(): boolean {
	if (cloudSavesService() === null) return false;
	try {
		return localStorage.getItem(STORAGE_KEY) === "on";
	} catch {
		return false;
	}
}

export function rememberCloudSaves(on: boolean): void {
	try {
		if (on) localStorage.setItem(STORAGE_KEY, "on");
		else localStorage.removeItem(STORAGE_KEY);
	} catch {
		// Storage blocked — they stay on until the page is left.
	}
}

let listener: ((change: LibraryChange) => void) | null = null;

// Changes made before `cloud-sync.ts` was listening, which it takes as it starts. Kept in storage, so
// one made while it could not be fetched — offline, say — still reaches the cloud on a later visit.
const PENDING_KEY = "cloud-saves-pending";
let pending: LibraryChange[] = readPending();

function readPending(): LibraryChange[] {
	try {
		const kept: unknown = JSON.parse(localStorage.getItem(PENDING_KEY) ?? "[]");
		return Array.isArray(kept) ? (kept as LibraryChange[]) : [];
	} catch {
		return [];
	}
}

function keepPending(): void {
	try {
		if (pending.length === 0) localStorage.removeItem(PENDING_KEY);
		else localStorage.setItem(PENDING_KEY, JSON.stringify(pending));
	} catch {
		// Storage blocked or full — they are kept until the page is left.
	}
}

/** Tells the cloud of a change the reader made, once it is saved in this browser. */
export function libraryChanged(change: LibraryChange): void {
	if (listener) {
		listener(change);
	} else if (cloudSavesOn()) {
		pending.push(change);
		keepPending();
	}
}

/** For `cloud-sync.ts`: hears every change from now on, and those made before it was listening. */
export function onLibraryChange(next: ((change: LibraryChange) => void) | null): void {
	listener = next;
	if (!next) return;
	const waiting = pending;
	pending = [];
	keepPending();
	for (const change of waiting) next(change);
}

/** Forgets the changes still waiting, as turning cloud saves off does. */
export function dropPendingChanges(): void {
	pending = [];
	keepPending();
}

export function loadCloudSync(): Promise<typeof import("./cloud-sync")> {
	return import(/* webpackChunkName: "cloud-sync" */ "./cloud-sync");
}

/** Starts saving to the cloud, where this browser does. The page is drawn by then; nothing waits on it. */
export function startCloudSaves(): void {
	if (!cloudSavesOn()) return;
	loadCloudSync()
		.then((sync) => sync.startCloudSync())
		.catch(() => {
			// The service or the chunk is out of reach — the library here goes on as it is.
		});
}

/** What one cloud save holds, for picking between them: as many of each as the reader would count. */
export interface LibrarySummary {
	bookmarks: number;
	/** Strips owned: a clipping of the paper each. */
	clippings: number;
	books: number;
	notes: number;
}

export function summarizeLibrary(data: LibraryData): LibrarySummary {
	const records = [...data.strips, ...data.books];
	return {
		bookmarks: data.bookmarks.length,
		clippings: data.strips.filter((record) => record.owned).length,
		books: data.books.filter((record) => record.owned).length,
		notes: records.filter((record) => record.note !== undefined).length,
	};
}

/** `3 bookmarks, 1 clipping, 0 books, 2 notes`. */
export function describeSummary(summary: LibrarySummary): string {
	const count = (n: number, one: string) => `${n.toLocaleString()} ${one}${n === 1 ? "" : "s"}`;
	return [
		count(summary.bookmarks, "bookmark"),
		count(summary.clippings, "clipping"),
		count(summary.books, "book"),
		count(summary.notes, "note"),
	].join(", ");
}
