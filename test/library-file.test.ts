import test from "node:test";
import assert from "node:assert/strict";
import {
	LibraryData,
	libraryFile,
	libraryFileName,
	mergeLibraries,
	mergeNotes,
	inLibrary,
	ownedDates,
	ownershipId,
	parseLibraryFile,
} from "../src/library-file";

const empty: LibraryData = { bookmarks: [], strips: [], books: [] };

test("library file", async (suite) => {
	await suite.test("a strip is owned by its printing: a special by its id, anything else by the day it ran", () => {
		assert.equal(ownershipId({}, "1990-08-12"), "19900812");
		assert.equal(ownershipId({ id: "198511281" }, "1985-11-28"), "198511281");
	});

	await suite.test("owned strips list by the day they ran, and an owned book's by the days they first ran", () => {
		const comics = [
			{ date: "1985-11-18", appearances: [{ collection: "calvin" }] },
			{ date: "1985-11-19", appearances: [{ collection: "other" }] },
			{ date: "1985-11-28", id: "198511281" },
		];
		const dates = ownedDates(["19900812", "198511281", "unknown"], new Set(["calvin"]), comics);
		assert.deepEqual([...dates].sort(), ["1985-11-18", "1985-11-28", "1990-08-12"]);
	});

	await suite.test("an owned special is listed without its day's daily, and an owned book without its reruns", () => {
		const library = { bookmarks: new Set<string>(), strips: new Set(["198511281"]), books: new Set(["calvin"]) };
		assert.equal(inLibrary(library, { date: "1985-11-28", id: "198511281" }, false), true);
		assert.equal(inLibrary(library, { date: "1985-11-28" }, false), false);
		const inBook = { date: "1985-11-18", appearances: [{ collection: "calvin" }] };
		assert.equal(inLibrary(library, inBook, false), true);
		assert.equal(inLibrary(library, { ...inBook, date: "1995-11-18" }, true), false);
	});

	await suite.test("a bookmark lists everything on its page", () => {
		const library = { bookmarks: new Set(["1985-11-28"]), strips: new Set<string>(), books: new Set<string>() };
		assert.equal(inLibrary(library, { date: "1985-11-28" }, false), true);
		assert.equal(inLibrary(library, { date: "1985-11-28", id: "198511281" }, false), true);
	});

	await suite.test("an export reads back as what was exported", () => {
		const data: LibraryData = {
			bookmarks: ["1987-05-24"],
			strips: [
				{ id: "19900812", owned: true },
				{ id: "198511281", owned: false, note: "Want the clipping" },
			],
			books: [{ id: "authoritative", owned: true, note: "Paperback" }],
		};
		const parsed = parseLibraryFile(JSON.stringify(libraryFile(data, "https://example.com/")));
		assert.deepEqual(parsed, { ok: true, site: "https://example.com/", data, skipped: 0 });
	});

	await suite.test("a file that isn't an export is refused whole", () => {
		for (const text of [
			"not json",
			"[]",
			"null",
			JSON.stringify({ bookmarks: [] }),
			JSON.stringify({ version: 1, strips: {} }),
		]) {
			assert.equal(parseLibraryFile(text).ok, false, text);
		}
		const newer = parseLibraryFile(JSON.stringify({ version: 2 }));
		assert.ok(!newer.ok && /newer/.test(newer.error));
	});

	await suite.test("entries that can't be read are skipped and counted; unknown ids are kept", () => {
		const parsed = parseLibraryFile(
			JSON.stringify({
				version: 1,
				bookmarks: ["1987-05-24", 7, "", "1987-05-24"],
				strips: [{ id: "nothing-like-a-date", owned: true }, { owned: true }, { id: "19900812", owned: "yes" }, "x"],
				books: [
					{ id: "book1", note: 3 },
					{ id: "book2", owned: false },
					{ id: "book3", note: "  " },
				],
			}),
		);
		assert.deepEqual(parsed, {
			ok: true,
			site: null,
			data: { bookmarks: ["1987-05-24"], strips: [{ id: "nothing-like-a-date", owned: true }], books: [] },
			skipped: 6,
		});
	});

	await suite.test("notes merge: the one there is, the old where it holds the new, else old then new", () => {
		assert.equal(mergeNotes(undefined, undefined), undefined);
		assert.equal(mergeNotes("old", undefined), "old");
		assert.equal(mergeNotes(" ", "new"), "new");
		assert.equal(mergeNotes("same", "same"), "same");
		assert.equal(mergeNotes("old", "new"), "old\nnew");
		// A file merged in again adds nothing more.
		assert.equal(mergeNotes(mergeNotes("b", "a"), "a"), "b\na");
		assert.equal(mergeNotes("x\ny\nz", "y\nz"), "x\ny\nz");
		// Whole lines only.
		assert.equal(mergeNotes("colored", "red"), "colored\nred");
		assert.equal(mergeNotes("x\ny", "y\nz"), "x\ny\ny\nz");
	});

	await suite.test("a merge keeps everything of both, owned if either owns it", () => {
		const current: LibraryData = {
			bookmarks: ["1987-05-24", "1988-01-01"],
			strips: [
				{ id: "19900812", owned: true, note: "Yellowed" },
				{ id: "19860101", owned: false, note: "Want" },
			],
			books: [{ id: "book1", owned: true }],
		};
		const incoming: LibraryData = {
			bookmarks: ["1988-01-01", "1989-02-02"],
			strips: [
				{ id: "19900812", owned: false, note: "Clipped" },
				{ id: "19860101", owned: true, note: "Want" },
			],
			books: [{ id: "book2", owned: true }],
		};
		assert.deepEqual(mergeLibraries(current, incoming), {
			bookmarks: ["1987-05-24", "1988-01-01", "1989-02-02"],
			strips: [
				{ id: "19900812", owned: true, note: "Yellowed\nClipped" },
				{ id: "19860101", owned: true, note: "Want" },
			],
			books: [
				{ id: "book1", owned: true },
				{ id: "book2", owned: true },
			],
		});
		// Merging a library into itself changes nothing.
		assert.deepEqual(mergeLibraries(current, current), current);
		assert.deepEqual(mergeLibraries(empty, current), current);
	});

	await suite.test("the file is named for the host and the day", () => {
		assert.equal(
			libraryFileName("example.com", new Date(2026, 9, 6, 23, 59)),
			"example.com-library-export-2026-10-06.json",
		);
	});
});
