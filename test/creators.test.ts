import test from "node:test";
import assert from "node:assert/strict";
import { withConfig } from "./helpers/config";
import { loadCreators } from "../build-chain/creators";
import { loadPageConfig } from "../build-chain/siteConfig";
import { loadComicSource, type ComicSource } from "../build-chain/comicSource";
import { formatYears } from "../src/pages/creators";

/**
 * The creators' file: who made each strip, from runs and single strips, and what the site learns
 * about each creator from that.
 */

const strip = { transcript: "" };

/** A Saturday, a Sunday and a Monday in 1988, the Sunday after, and a strip in 1990; and a special. */
const SOURCE: ComicSource = {
	strips: {
		"19880102": strip,
		"19880103": strip,
		"19880104": strip,
		"19880110": strip,
		"19900105": strip,
	},
	specials: { poster: { ...strip, date: "19890601", title: "The poster" } },
};

function load(creators: string, files: Record<string, string | Buffer> = {}) {
	return withConfig(
		`name: x\nseries: x\ncreators: !Import ./creators.yaml\n`,
		(config) => loadCreators(SOURCE, "/repo/", config),
		{ "creators.yaml": creators, ...files },
	);
}

const ids = (data: ReturnType<typeof load>, key: string) => data.byStrip.get(key)?.map((credit) => credit.id);

test("creators", async (suite) => {
	await suite.test("credits every daily and Sunday a run covers, and a special only by name", () => {
		const data = load("people:\n  a: { name: Ann }\nruns:\n  - by: [a]\n");
		for (const key of Object.keys(SOURCE.strips)) assert.deepEqual(ids(data, key), ["a"]);
		assert.equal(ids(data, "poster"), undefined);
		const [ann] = data.creators;
		assert.equal(ann.strips, 5);
		assert.deepEqual(ann.years, [1988, 1990]);
		const named = load("people:\n  a: { name: Ann }\nruns:\n  - by: [a]\nspecials:\n  poster: [a]\n");
		assert.deepEqual(ids(named, "poster"), ["a"]);
		assert.equal(named.creators[0].strips, 6);
		assert.deepEqual(named.creators[0].years, [1988, 1989, 1990]);
		// Listed apart from the ranges, which hold only the paper's strips.
		assert.deepEqual(named.creators[0].ranges, ["19880102-19900105"]);
		assert.deepEqual(named.creators[0].specials, [{ id: "poster", title: "The poster", date: "1989-06-01" }]);
		assert.equal(ann.specials, undefined);
		// Over the strips in order, so the days between them do not split the range.
		assert.deepEqual(ann.ranges, ["19880102-19900105"]);
	});

	await suite.test("a later run takes a strip from an earlier one, and a strip's own credit from both", () => {
		const data = load(
			[
				"people:",
				"  a: { name: Ann }",
				"  b: { name: Bob }",
				"  c: { name: Cy }",
				"runs:",
				"  - by: [a]",
				'  - { from: "19880104", to: "19891231", by: [b] }',
				"strips:",
				'  "19880110": [a, { id: c, role: art }]',
			].join("\n"),
		);
		assert.deepEqual(ids(data, "19880103"), ["a"]);
		assert.deepEqual(ids(data, "19880104"), ["b"]);
		// Inside Bob's run, but a special, which no run reaches.
		assert.equal(ids(data, "poster"), undefined);
		assert.deepEqual(ids(data, "19900105"), ["a"]);
		// Replaced, not added to: Bob's run does not reach it.
		assert.deepEqual(data.byStrip.get("19880110"), [{ id: "a" }, { id: "c", role: "art" }]);
		const [ann, bob, cy] = data.creators;
		assert.deepEqual(ann.ranges, ["19880102-19880103", "19880110-19900105"]);
		assert.deepEqual(bob.ranges, ["19880104"]);
		assert.equal(bob.strips, 1);
		assert.deepEqual(cy.roles, ["art"]);
		assert.equal(ann.roles, undefined);
	});

	await suite.test("a run can be only the Sundays, or only the rest", () => {
		const data = load(
			"people:\n  a: { name: Ann }\n  s: { name: Sue }\nruns:\n  - { days: daily, by: [a] }\n  - { days: sunday, by: [s] }\n",
		);
		assert.deepEqual(ids(data, "19880102"), ["a"]);
		assert.deepEqual(ids(data, "19880103"), ["s"]);
		assert.deepEqual(ids(data, "19880110"), ["s"]);
		assert.deepEqual(data.creators[1].ranges, ["19880103", "19880110"]);
	});

	await suite.test("keeps a creator's link, and publishes a portrait from the mount", () => {
		const data = load(
			"people:\n  a:\n    name: Ann\n    link: https://example.com/ann\n    image: !Path ./ann.png\nruns:\n  - by: [a]\n",
			{ "ann.png": Buffer.from("portrait") },
		);
		const [ann] = data.creators;
		assert.equal(ann.link, "https://example.com/ann");
		assert.match(ann.image!, /^\/repo\/static\/[0-9a-f]{16}\.png$/);
		assert.equal(data.files.size, 1);
		const url = load("people:\n  a: { name: Ann, image: https://example.com/ann.png }\nruns:\n  - by: [a]\n");
		assert.equal(url.creators[0].image, "https://example.com/ann.png");
		assert.equal(url.files.size, 0);
	});

	await suite.test("refuses what it cannot make sense of", () => {
		const people = "people:\n  a: { name: Ann }\n";
		assert.throws(() => load(`${people}runs:\n  - by: [z]\n`), /credits "z", who is not one of the people/);
		assert.throws(() => load(`${people}runs:\n  - by: []\n`), /must credit a list of people/);
		assert.throws(() => load(`${people}runs:\n  - { by: [a], days: monday }\n`), /days must be sunday or daily/);
		assert.throws(() => load(`${people}runs:\n  - { by: [a], from: 1988 }\n`), /from must be a date as YYYYMMDD/);
		assert.throws(() => load(`${people}runs:\n  - { by: [a], from: "19900101", to: "19880101" }\n`), /ends before/);
		assert.throws(() => load(`${people}strips:\n  "19870101": [a]\n`), /19870101, which is not a strip/);
		// Each in its own place: a special is not a strip, nor a strip a special.
		assert.throws(() => load(`${people}strips:\n  poster: [a]\n`), /poster, which is not a strip/);
		assert.throws(() => load(`${people}specials:\n  "19880102": [a]\n`), /19880102, which is not a special/);
		assert.throws(() => load(`${people}runs:\n  - by: [a, a]\n`), /credits a twice/);
		assert.throws(() => load(`${people}  b: { name: Bob }\nruns:\n  - by: [a]\n`), /"b" is credited on no strip/);
		assert.throws(() => load("people:\n  Ann: { name: Ann }\n"), /Invalid creator id/);
		assert.throws(() => load("people:\n  a: {}\n"), /needs a name/);
		assert.throws(
			() => load(`people:\n  a: { name: Ann, link: wikipedia }\nruns:\n  - by: [a]\n`),
			/link must be a URL/,
		);
	});

	await suite.test("has none where config.yaml turns them off, and must say", () => {
		withConfig("name: x\nseries: x\ncreators: false\n", (config) => {
			assert.equal(loadPageConfig(config).creators, false);
			assert.deepEqual(loadCreators(SOURCE, "/", config).creators, []);
		});
		assert.throws(() => withConfig("name: x\nseries: x\ncreators:\n", loadPageConfig), /must give creators/);
	});

	await suite.test("a special needs a title, which is what a creator's page lists it by", () => {
		const comics = (special: string) =>
			withConfig("name: x\nseries: x\ncomics: !Import ./comics.yaml\n", loadComicSource, {
				"comics.yaml": `strips: {}\nspecials:\n  poster:\n    date: "19890601"\n    transcript: ""\n${special}`,
			});
		assert.equal(comics("    title: ' The poster '\n").specials.poster.title, "The poster");
		assert.throws(() => comics(""), /Special poster needs a title/);
		assert.throws(() => comics("    title: ''\n"), /Special poster needs a title/);
	});

	await suite.test("writes the years as runs of them", () => {
		assert.equal(formatYears([1985, 1986, 1987]), "1985\u20131987");
		assert.equal(formatYears([1950, 1951, 1963]), "1950\u20131951, 1963");
		assert.equal(formatYears([1990]), "1990");
	});
});
