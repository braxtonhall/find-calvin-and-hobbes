import test from "node:test";
import assert from "node:assert/strict";
import { loadCollectionData } from "../build-chain/collectionPages";
import { generateCollectionIndex } from "../build-chain/generateCollectionIndex";
import { CollectionIndex } from "../src/types";

/**
 * What the emitted collection index promises, asserted against the real archive.
 *
 * The properties rather than the counts: a compendium whose page index is eventually filled in
 * should make this file's job easier, not fail it. There is exactly one number here, and it is a
 * floor.
 */

const data = loadCollectionData(process.cwd());
const index: CollectionIndex = JSON.parse(generateCollectionIndex(data));

/** Every book a strip claims to have been printed in. */
const printed = new Set<string>();
for (const appearances of data.appearancesByComic.values()) {
	for (const appearance of appearances) printed.add(appearance.collection);
}

const emitted = new Set(index.collections.map((collection) => collection.id));

test("the collection index", async (suite) => {
	await suite.test("holds every book a strip was printed in", () => {
		for (const id of printed) assert.ok(emitted.has(id), `${id} is printed in but not indexed`);
	});

	/*
	 * The invariant the emptiness check exists to create, and the reason `@in:` can offer every id in
	 * here: a collection nobody appears in could only ever be a value the menu offered and then
	 * answered with nothing.
	 */
	await suite.test("and no book that holds nothing", () => {
		for (const id of emitted) assert.ok(printed.has(id), `${id} is indexed but holds no strips`);
	});

	// The same invariant read off the emitted fields rather than off the source data, so a change to
	// how membership is decided cannot quietly satisfy one and not the other.
	await suite.test("so every entry names at least one strip of its own", () => {
		for (const collection of index.collections) {
			const held = collection.dailies.length + Object.keys(collection.specials).length;
			assert.ok(held > 0, `${collection.id} names no dates and no specials`);
		}
	});

	await suite.test("carries extras only for books it kept", () => {
		for (const id of Object.keys(index.collection_extras ?? {})) {
			assert.ok(emitted.has(id), `${id} has extras but is not indexed`);
		}
	});

	/*
	 * What makes an id usable as an `@in:` value at all. `scanFilters` matches `\S+` and lowercases
	 * what it finds, so an id with a space or a capital in it would be a book the filter could name
	 * in the menu and never parse — see `src/filter-vocabulary.ts`.
	 */
	await suite.test("names its books with something a reader could type", () => {
		for (const collection of index.collections) {
			assert.match(collection.id, /^[a-z0-9]+$/, collection.id);
			assert.ok(collection.name.length > 0, `${collection.id} has no name to hint with`);
		}
	});

	// A floor rather than a count: the eleven books, the treasuries, the Complete and the Sunday
	// collections are all indexed today, and nothing here should start passing by emitting less.
	await suite.test("is not empty", () => {
		assert.ok(index.collections.length >= 18, `only ${index.collections.length} collections`);
	});
});
