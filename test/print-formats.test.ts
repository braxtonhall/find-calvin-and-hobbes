import test from "node:test";
import assert from "node:assert/strict";
import { loadCollectionData } from "../build-chain/collectionPages";
import { loadComicSource } from "../build-chain/comicSource";
import { printedFormats } from "../src/print-format";
import { withConfig } from "./helpers/config";

/**
 * How a book printed each strip: what a page says, as `{ink: 19880103}`, else a daily in ink, a
 * Sunday as the book printed its Sundays, and a special as `comics.yaml` says it was made. Written
 * on an appearance only where it is not that usual, which the site reads for itself.
 */

const COMICS = `strips: {}
specials:
  poster:
    date: "19890601"
    title: The poster
    transcript: ""
    format: colour
`;

/** What the build writes of each appearance's formats, `usual` where nothing, in the books with these pages. */
function formats(pages: string, colourSundays = true): Record<string, Record<string, string[] | "usual">> {
	const config = `name: x
series: x
colourSundays: ${colourSundays}
comics: !Import ./comics.yaml
collections:
  - { id: colourbook, pub_year: 1990, pub_month: 1, colour: true, pages: { 1: [19880103, 19880104] } }
${pages}`;
	return withConfig(
		config,
		(file) => {
			const data = loadCollectionData(file);
			const result: Record<string, Record<string, string[] | "usual">> = {};
			for (const [key, appearances] of data.appearancesByComic) {
				result[key] = {};
				for (const appearance of appearances) result[key][appearance.collection] = appearance.formats ?? "usual";
			}
			return result;
		},
		{ "comics.yaml": COMICS },
	);
}

test("print formats", async (suite) => {
	await suite.test("a bare entry is printed as the strip usually is, in this book, which goes unsaid", () => {
		const printed = formats(
			`  - { id: greybook, pub_year: 1990, pub_month: 2, pages: { 1: [19880103, 19880104, poster] } }`,
		);
		assert.deepEqual(printed["19880103"], { colourbook: "usual", greybook: "usual" });
		assert.deepEqual(printed["19880104"], { colourbook: "usual", greybook: "usual" });
		assert.deepEqual(printed.poster, { greybook: "usual" });
		const said = formats(
			`  - { id: greybook, pub_year: 1990, pub_month: 2, pages: { 1: [{greyscale: 19880103}, {ink: 19880104}, {colour: poster}] } }`,
		);
		assert.deepEqual(said["19880103"], { colourbook: "usual", greybook: "usual" }, "said, but the usual all the same");
		assert.deepEqual(said.poster, { greybook: "usual" });
	});

	await suite.test("a page can say otherwise, and a strip printed twice is printed both ways", () => {
		const printed = formats(
			`  - { id: catalogue, pub_year: 1991, pub_month: 1, colour: true, pages: { 1: [19880103, {ink: 19880104}], 2: [{ink: 19880103}], 3: [{greyscale: poster}] } }`,
		);
		assert.deepEqual(printed["19880103"].catalogue, ["colour", "ink"]);
		assert.deepEqual(printed["19880104"].catalogue, "usual");
		assert.deepEqual(printed.poster.catalogue, ["greyscale"]);
	});

	await suite.test("an entry that is neither a key nor one under a format is a mistake", () => {
		const wrong = (entry: string) => () =>
			formats(`  - { id: odd, pub_year: 1991, pub_month: 1, pages: { 4: [${entry}] } }`);
		assert.throws(wrong("{sepia: 19880103}"), /Page 4 of odd lists/);
		assert.throws(wrong("{ink: 19880103, colour: 19880104}"), /Page 4 of odd lists/);
	});

	await suite.test("there are none where the Sundays were not a format of their own", () => {
		const printed = formats(
			`  - { id: catalogue, pub_year: 1991, pub_month: 1, colour: true, pages: { 2: [{ink: 19880103}] } }`,
			false,
		);
		assert.deepEqual(printed["19880103"], { colourbook: "usual", catalogue: "usual" });
	});

	await suite.test("the site reads the usual where the build wrote nothing", () => {
		const sunday = { date: "1988-01-03" };
		const daily = { date: "1988-01-04" };
		const poster = { date: "1989-06-01", id: "poster", format: "colour" as const };
		assert.deepEqual(printedFormats(sunday, {}, { colour: true }, true), ["colour"]);
		assert.deepEqual(printedFormats(sunday, {}, { colour: false }, true), ["greyscale"]);
		assert.deepEqual(printedFormats(daily, {}, { colour: true }, true), ["ink"]);
		assert.deepEqual(printedFormats(poster, {}, undefined, true), ["colour"]);
		assert.deepEqual(printedFormats({ date: "1989-06-01", id: "unsaid" }, {}, undefined, true), []);
		assert.deepEqual(printedFormats(sunday, { formats: ["colour", "ink"] }, { colour: true }, true), ["colour", "ink"]);
		assert.deepEqual(printedFormats(sunday, {}, { colour: true }, false), []);
	});

	await suite.test("a special says how it was made, where the Sundays were a format of their own", () => {
		const source = (format: string, colourSundays = true) =>
			withConfig(
				`name: x\nseries: x\ncolourSundays: ${colourSundays}\ncomics: !Import ./comics.yaml\n`,
				loadComicSource,
				{
					"comics.yaml": `strips: {}\nspecials:\n  poster:\n    date: "19890601"\n    title: The poster\n    transcript: ""\n${format}`,
				},
			);
		assert.equal(source("    format: ink\n").specials.poster.format, "ink");
		assert.throws(() => source(""), /Special poster needs a format/);
		assert.throws(() => source("    format: sepia\n"), /Special poster's format must be one of/);
		assert.equal(source("", false).specials.poster.format, undefined);
	});
});
