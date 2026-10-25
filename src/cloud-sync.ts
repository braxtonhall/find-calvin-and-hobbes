/**
 * The cloud saves themselves, fetched only once a reader turns them on — see `cloud-saves.ts`.
 *
 * This browser's library stays where the site reads it, in IndexedDB; the cloud save is a copy of
 * it, in the bobs-sink client's working document, which the client keeps in step with the service.
 * A change made here is written to both; one that arrives from the cloud is written into IndexedDB,
 * entry by entry, and the page lit again to match.
 */

import * as Y from "yjs";
import { SinkClient, type ClientSyncStatus, type IdentityStatus } from "@bobs-sink/client";
import {
	LIBRARY_ROOTS,
	LibraryRoot,
	applyLibraryChange,
	bookmarkedInDoc,
	changedIds,
	libraryFromDoc,
	recordFromDoc,
} from "./cloud-library";
import {
	LibrarySummary,
	cloudSavesService,
	dropPendingChanges,
	onLibraryChange,
	rememberCloudSaves,
	summarizeLibrary,
} from "./cloud-saves";
import { LibraryData, mergeLibraries } from "./library-file";
import { LibraryEntries, holdLibrary, putLibraryEntries, readLibrary, replaceLibrary } from "./ownership";
import { parseRoute } from "./router";
import { paintGrid } from "./grid";
import { announceLibraryChange } from "./views/row-menu";
import { PAGE_CONFIG } from "./site-config";

/** What the Settings page says of the cloud saves. */
export interface CloudStatus {
	on: boolean;
	identity: IdentityStatus["kind"];
	sync: ClientSyncStatus;
	/** The last thing that went wrong in the background, to say until the reader acts again. */
	problem: string | null;
}

/** One of the reader's cloud saves, to pick from. */
export interface CloudSaveChoice {
	id: string;
	summary: LibrarySummary;
	lastUsedAt: string;
}

export type JoinOutcome = { kind: "joined" } | { kind: "choose"; saves: CloudSaveChoice[] };

/** The origin of the edits this browser's library makes to the cloud save, to tell them from the cloud's. */
const FROM_LIBRARY = Symbol("library");

let opening: Promise<SinkClient> | null = null;
let on = false;
let problem: string | null = null;
// Set while this module replaces the working document itself, and says what this browser's library becomes.
let replacing = false;
const listeners = new Set<(status: CloudStatus) => void>();

function client(): Promise<SinkClient> {
	opening ??= SinkClient.open({ serviceUrl: cloudSavesService()!, roots: LIBRARY_ROOTS }).then(
		(sink) => {
			wire(sink);
			return sink;
		},
		(error: unknown) => {
			opening = null;
			throw error;
		},
	);
	return opening;
}

function statusOf(sink: SinkClient): CloudStatus {
	return { on, identity: sink.identity.kind, sync: sink.sync, problem };
}

async function announce(): Promise<void> {
	const status = statusOf(await client());
	for (const listener of listeners) listener(status);
}

/** Hears the status now, and whenever it changes. Returns how to stop. */
export function watchCloudStatus(listener: (status: CloudStatus) => void): () => void {
	listeners.add(listener);
	void announce();
	return () => listeners.delete(listener);
}

function wire(sink: SinkClient): void {
	sink.bind((doc) => {
		const observers = (Object.keys(LIBRARY_ROOTS) as LibraryRoot[]).map((name) => {
			const observer = (events: Y.YEvent<Y.AbstractType<unknown>>[], transaction: Y.Transaction) => {
				// Only once they are on: before that, this document is only being made ready.
				if (on) void settle(doc, name, changedIds(events), transaction.origin !== FROM_LIBRARY);
			};
			doc.getMap(name).observeDeep(observer);
			return () => doc.getMap(name).unobserveDeep(observer);
		});
		return () => observers.forEach((stop) => stop());
	});
	// The client put another document in place — the cloud's, after it refused a change or was
	// rebuilt — which this browser's library now follows.
	sink.on("doc", (doc) => {
		if (on && !replacing) void follow(libraryFromDoc(doc));
	});
	sink.on("rejected", () => {
		problem = "The cloud refused a change, so this browser took the cloud save's library as it was.";
	});
	sink.on("error", () => {
		problem = "Something went wrong syncing in the background.";
		void announce();
	});
	sink.on("sync", () => void announce());
	sink.on("identity", () => void announce());
}

/**
 * Writes what an edit to the cloud save touched into this browser's library. One made here wrote
 * them already, but is written again, in case the cloud changed them in between; one from the
 * cloud lights the page again too.
 */
async function settle(doc: Y.Doc, name: LibraryRoot, ids: Set<string>, fromCloud: boolean): Promise<void> {
	const entries: LibraryEntries = { bookmarks: new Map(), strips: new Map(), books: new Map() };
	for (const id of ids) {
		if (name === "bookmarks") entries.bookmarks.set(id, bookmarkedInDoc(doc, id));
		else entries[name].set(id, recordFromDoc(doc, name, id));
	}
	try {
		await putLibraryEntries(entries);
	} catch {
		problem = "Couldn't save a change from the cloud in this browser.";
		void announce();
		return;
	}
	if (fromCloud) relight();
}

/** This browser's library, made to be `data` — the cloud save's — and the page lit again. */
async function follow(data: LibraryData): Promise<void> {
	await replaceLibrary(data);
	holdLibrary(data);
	relight();
}

/** The grid, any rows that ask about the reader, and any strip's or book's buttons, as the library now stands. */
function relight(): void {
	paintGrid(parseRoute());
	announceLibraryChange(false);
}

function listen(sink: SinkClient): void {
	onLibraryChange((change) => applyLibraryChange(sink.doc, change, FROM_LIBRARY));
}

async function turnOn(sink: SinkClient): Promise<void> {
	on = true;
	problem = null;
	rememberCloudSaves(true);
	listen(sink);
	await announce();
}

/**
 * On a page load in a browser that saves to the cloud: this browser's library follows the cloud
 * save, as last heard from it, then takes the changes made here since.
 */
export async function startCloudSync(): Promise<void> {
	const sink = await client();
	if (on) return;
	// The client's own storage was cleared, and with it what it knew: following its empty document
	// would empty the library too. Off instead, as the client already is.
	if (sink.identity.kind === "anonymous" || sink.document === undefined) {
		rememberCloudSaves(false);
		dropPendingChanges();
		await announce();
		return;
	}
	on = true;
	await follow(libraryFromDoc(sink.doc));
	listen(sink);
	await announce();
}

/** Makes this browser's library the working document's, before it goes up as a new cloud save. */
async function loadLibraryInto(sink: SinkClient): Promise<void> {
	const data = await readLibrary();
	applyLibraryChange(sink.doc, { kind: "library", data }, FROM_LIBRARY);
}

/** A new cloud save, of this browser's library, under a new passkey. */
export async function createCloudSave(): Promise<void> {
	const sink = await client();
	if (sink.identity.kind !== "anonymous") await signOut(sink);
	await loadLibraryInto(sink);
	await sink.enableCloudSaves({ userName: `${PAGE_CONFIG.name} library` });
	await turnOn(sink);
}

/**
 * Signs in with a passkey made before. Where it has no cloud save yet, this browser's library
 * becomes its first; where it has one, this browser takes it; where it has more, they are handed
 * back to choose from — see `pickCloudSave`.
 */
export async function joinCloudSave(): Promise<JoinOutcome> {
	const sink = await client();
	const { documents, result } = await sink.signIn({ unmatched: "choose" });
	if (result === "resumed") {
		await mergeInto(sink, sink.document!.documentId, false);
		return { kind: "joined" };
	}
	if (documents.length === 0) {
		await loadLibraryInto(sink);
		await sink.createDocumentFromLocal();
		await turnOn(sink);
		return { kind: "joined" };
	}
	if (documents.length === 1) {
		await pickCloudSave(documents[0].id);
		return { kind: "joined" };
	}
	const saves: CloudSaveChoice[] = [];
	for (const document of documents) {
		const doc = await sink.readDocument(document.id);
		saves.push({ id: document.id, summary: summarizeLibrary(libraryFromDoc(doc)), lastUsedAt: document.lastUsedAt });
		doc.destroy();
	}
	saves.sort((a, b) => Date.parse(b.lastUsedAt) - Date.parse(a.lastUsedAt));
	return { kind: "choose", saves };
}

/** Takes one of the reader's cloud saves, with this browser's library merged into it, as an import merges. */
export async function pickCloudSave(id: string): Promise<void> {
	await mergeInto(await client(), id, true);
}

async function mergeInto(sink: SinkClient, id: string, fetch: boolean): Promise<void> {
	if (fetch) {
		replacing = true;
		try {
			await sink.useRemote(id);
		} finally {
			replacing = false;
		}
	}
	const merged = mergeLibraries(await readLibrary(), libraryFromDoc(sink.doc));
	applyLibraryChange(sink.doc, { kind: "library", data: merged }, FROM_LIBRARY);
	await follow(merged);
	await turnOn(sink);
}

/** Signs this browser out, leaving its library as it is, and the cloud save as it is too. */
async function signOut(sink: SinkClient): Promise<void> {
	replacing = true;
	try {
		await sink.signOut();
	} finally {
		replacing = false;
	}
}

/** Stops saving to the cloud in this browser. Its library stays here, and the cloud save stays too. */
export async function disableCloudSaves(): Promise<void> {
	const sink = await client();
	on = false;
	onLibraryChange(null);
	dropPendingChanges();
	rememberCloudSaves(false);
	problem = null;
	await signOut(sink);
	await announce();
}

/** Backs out of choosing between cloud saves: signed out again, as before. */
export async function cancelJoin(): Promise<void> {
	const sink = await client();
	if (!on) await signOut(sink);
	await announce();
}

export async function cloudStatus(): Promise<CloudStatus> {
	return statusOf(await client());
}
