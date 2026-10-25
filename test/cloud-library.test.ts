import test from "node:test";
import assert from "node:assert/strict";
import * as Y from "yjs";
import { applyLibraryChange, changedIds, libraryFromDoc, writeLibrary } from "../src/cloud-library";
import { describeSummary, summarizeLibrary } from "../src/cloud-saves";
import { LibraryData } from "../src/library-file";

const library: LibraryData = {
	bookmarks: ["1987-05-24", "198511281"],
	strips: [
		{ id: "19851118", owned: true },
		{ id: "198511281", owned: false, note: "want" },
	],
	books: [{ id: "compendium1", owned: true, note: "signed" }],
};

/** The document as the service checks it against the app's schema. */
function asSaved(doc: Y.Doc): unknown {
	return {
		bookmarks: doc.getMap("bookmarks").toJSON(),
		strips: doc.getMap("strips").toJSON(),
		books: doc.getMap("books").toJSON(),
	};
}

test("cloud library", async (suite) => {
	await suite.test("a library written into a cloud save reads back as it was", () => {
		const doc = new Y.Doc();
		writeLibrary(doc, library);
		assert.deepEqual(libraryFromDoc(doc), library);
		assert.deepEqual(asSaved(doc), {
			bookmarks: { "1987-05-24": true, "198511281": true },
			strips: { "19851118": { owned: true }, "198511281": { owned: false, note: "want" } },
			books: { compendium1: { owned: true, note: "signed" } },
		});
	});

	await suite.test(
		"writing a library takes out what it no longer has, and keeps ids the service would refuse out",
		() => {
			const doc = new Y.Doc();
			writeLibrary(doc, library);
			writeLibrary(doc, {
				bookmarks: ["1987-05-24", "not an id"],
				strips: [{ id: "19851118", owned: true }],
				books: [],
			});
			assert.deepEqual(libraryFromDoc(doc), {
				bookmarks: ["1987-05-24"],
				strips: [{ id: "19851118", owned: true }],
				books: [],
			});
		},
	);

	await suite.test("a change to one record touches only the fields that differ", () => {
		const laptop = new Y.Doc();
		writeLibrary(laptop, library);
		const phone = new Y.Doc();
		Y.applyUpdate(phone, Y.encodeStateAsUpdate(laptop));

		// One browser owns the strip while the other notes it; both are kept.
		applyLibraryChange(laptop, { kind: "strip", record: { id: "198511281", owned: true, note: "want" } }, null);
		applyLibraryChange(phone, { kind: "strip", record: { id: "198511281", owned: false, note: "found one" } }, null);
		Y.applyUpdate(laptop, Y.encodeStateAsUpdate(phone));
		Y.applyUpdate(phone, Y.encodeStateAsUpdate(laptop));

		const merged = { id: "198511281", owned: true, note: "found one" };
		assert.deepEqual(libraryFromDoc(laptop).strips[1], merged);
		assert.deepEqual(libraryFromDoc(phone).strips[1], merged);
	});

	await suite.test("a record neither owned nor noted, or a bookmark taken off, leaves the cloud save", () => {
		const doc = new Y.Doc();
		writeLibrary(doc, library);
		applyLibraryChange(doc, { kind: "book", record: { id: "compendium1", owned: false } }, null);
		applyLibraryChange(doc, { kind: "bookmark", id: "1987-05-24", bookmarked: false }, null);
		assert.deepEqual(doc.getMap("books").toJSON(), {});
		assert.deepEqual(doc.getMap("bookmarks").toJSON(), { "198511281": true });
	});

	await suite.test("an edit's events name the entries it touched", () => {
		const doc = new Y.Doc();
		writeLibrary(doc, library);
		const seen: string[][] = [];
		doc.getMap("strips").observeDeep((events) => seen.push([...changedIds(events)].sort()));
		applyLibraryChange(doc, { kind: "strip", record: { id: "198511281", owned: true, note: "want" } }, null);
		applyLibraryChange(doc, { kind: "strip", record: { id: "19851119", owned: true } }, null);
		applyLibraryChange(doc, { kind: "strip", record: { id: "19851118", owned: false } }, null);
		assert.deepEqual(seen, [["198511281"], ["19851119"], ["19851118"]]);
	});

	await suite.test("a cloud save is summed up by what it holds", () => {
		assert.equal(describeSummary(summarizeLibrary(library)), "2 bookmarks, 1 clipping, 1 book, 2 notes");
	});
});
