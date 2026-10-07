import test from "node:test";
import assert from "node:assert/strict";
import { loadCollectionData } from "../build-chain/collectionPages";
import { exportComicsJson } from "../build-chain/exportComicsJson";
import { generateCollectionIndex } from "../build-chain/generateCollectionIndex";
import { loadComicImages } from "../build-chain/siteConfig";
import { withConfig } from "./helpers/config";

/** The covers and the strips' images: named by path in the configuration, and published by the build. */

const book = (id: string, image: string) => `id: ${id}\npub_year: 1987\npub_month: 1\nimage: ${image}\n`;

test("publishes a cover named with !Path under static/, by its contents", () => {
	withConfig(
		"collections: !Map [Import, ./books/*.yaml]\n",
		(config, projectDir) => {
			const data = loadCollectionData(config);
			const [a, b, c] = data.sources.map((source) => source.image as string);
			assert.match(a, /^static\/[0-9a-f]{16}\.png$/);
			// The same picture under two names is published once; a different one is not confused with it.
			assert.equal(b, a);
			assert.notEqual(c, a);
			assert.deepEqual(
				[...data.files.entries()].sort(),
				[
					[a, `${projectDir}/covers/one.png`],
					[c, `${projectDir}/covers/two.png`],
				].sort(),
			);
		},
		{
			"books/a.yaml": book("a", "!Path ../covers/one.png"),
			"books/b.yaml": book("b", "!Path ../covers/copy.png"),
			"books/c.yaml": book("c", "!Path ../covers/two.png"),
			"covers/one.png": "one",
			"covers/copy.png": "one",
			"covers/two.png": "two",
		},
	);
});

test("keeps a cover given as a URL, and writes a published one from the mount", () => {
	withConfig(
		"comics:\n  dailies:\n    '19870101': Hi.\ncollections:\n" +
			"  - {id: a, pub_year: 1987, pub_month: 1, image: 'https://example.test/a.png', pages: {1: ['19870101']}}\n" +
			"  - {id: b, pub_year: 1987, pub_month: 2, image: !Path ./b.gif, pages: {1: ['19870101']}}\n",
		(config) => {
			const data = loadCollectionData(config);
			const index = JSON.parse(generateCollectionIndex(data, "/repo/"));
			const images = Object.fromEntries(
				index.collections.map((collection: { id: string; image: string }) => [collection.id, collection.image]),
			);
			assert.equal(images.a, "https://example.test/a.png");
			assert.match(images.b, /^\/repo\/static\/[0-9a-f]{16}\.gif$/);
		},
		{ "b.gif": "b" },
	);
});

test("refuses a cover that is neither a URL nor a file, or a file that is not there", () => {
	assert.throws(
		() =>
			withConfig("collections:\n  - {id: a, pub_year: 1987, pub_month: 1, image: covers/a.png}\n", loadCollectionData),
		/a's image in site\.yaml must be a URL, or a file as !Path/,
	);
	assert.throws(
		() => withConfig("collections:\n  - {id: a, image: !Path ./nope.png}\n", loadCollectionData),
		/site\.yaml names \.\/nope\.png, which does not exist/,
	);
});

test("finds the strips' images in the folder comicImages names, or none without one", () => {
	const comics = "comics:\n  dailies:\n    '19870101': Hi.\n    '19870102': Bye.\n";
	const files = { "strips/19870101.gif": "gif", "strips/notes.txt": "" };
	const images = (setting: string) =>
		withConfig(
			`${comics}collections: []\ncomicImages: ${setting}\n`,
			(config) => {
				const data = loadCollectionData(config);
				return JSON.parse(exportComicsJson(data, "/repo/", [], [], config)).map(
					(comic: { date: string; image?: string }) => [comic.date, comic.image],
				);
			},
			files,
		);
	assert.deepEqual(images("./strips"), [
		["1987-01-01", "/repo/assets/comics/19870101.gif"],
		["1987-01-02", undefined],
	]);
	assert.deepEqual(images("false"), [
		["1987-01-01", undefined],
		["1987-01-02", undefined],
	]);
	// A folder that isn't there yet has no images in it.
	assert.deepEqual(images("./elsewhere"), [
		["1987-01-01", undefined],
		["1987-01-02", undefined],
	]);
	assert.throws(() => images("./strips/notes.txt"), /comicImages in site\.yaml must be a folder/);
	assert.throws(() => images("[strips]"), /comicImages in site\.yaml must be a folder/);
	assert.equal(
		withConfig("name: x\n", (config) => loadComicImages(config)),
		null,
	);
});
