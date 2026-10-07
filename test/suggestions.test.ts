import test from "node:test";
import assert from "node:assert/strict";
import { suggestedQueries, randomQuery } from "../src/suggestions";
import { featuredDate, fillSuggestion, suggestionFields } from "../src/suggestion-templates";
import { scanFilters } from "../src/filter-query";
import { registerVocabulary } from "../src/filter-vocabulary";
import { search } from "../src/search";
import { TUNING } from "../src/tuning";
import { COMPOUND_CANONICAL_FORMS } from "../src/compounds";
import { state } from "../src/state";
import { ARCHIVE_SPAN } from "../src/archive";
import { RERUNS } from "../src/bundled-data";
import { PAGE_CONFIG } from "../src/site-config";
import { loadPageConfig } from "../build-chain/siteConfig";
import { loadCollectionData } from "../build-chain/collectionPages";
import { loadComicSource } from "../build-chain/comicSource";
import { exportComicsJson } from "../build-chain/exportComicsJson";
import { exportRerunsJson } from "../build-chain/reruns";
import { exportDescriptions } from "../build-chain/exportDescriptions";
import { generateCollectionIndex } from "../build-chain/generateCollectionIndex";
import { loadArcs } from "../build-chain/arcs";
import { CollectionIndex } from "../src/types";
import { withConfig } from "./helpers/config";

const collectionData = loadCollectionData();
const comicSource = loadComicSource();

/*
 * The books, read out of the very index the app boots with.
 *
 * Without this the guard below would not bite on `@in:` at all: an unregistered vocabulary takes
 * every value on trust — see `src/filter-vocabulary.ts` — so `@in:sundaypage` would sail through the
 * one test whose whole job is to catch a typo in the pool. Every other filter in here is checked
 * against a constant, and this is what puts `@in:` on the same footing.
 */
const index: CollectionIndex = JSON.parse(generateCollectionIndex(collectionData));
registerVocabulary("in", () =>
	index.collections.map((collection) => ({ value: collection.id, hint: collection.name })),
);

/** The archive as the app has it once it has loaded: the strips with their books and arcs, the reruns, the descriptions. */
function installSiteArchive(): void {
	const arcs = loadArcs(comicSource, collectionData);
	state.comics = JSON.parse(exportComicsJson(collectionData, "/", arcs));
	state.reruns = new Map(Object.entries(JSON.parse(exportRerunsJson(comicSource))));
	state.descriptions = new Map(Object.entries(JSON.parse(exportDescriptions())));
}

/** Every day of a leap year, so each month and day — and 29 February — is asked about once. */
const EVERY_DAY = Array.from({ length: 366 }, (_, offset) => new Date(2028, 0, 1 + offset));

test("this archive's suggestions", async (suite) => {
	// The guard that matters: a filter typo in the pool is a die that lands on an empty page, and
	// an invalid match is exactly how the parser reports a filter nothing can satisfy. The app would
	// quietly leave such a suggestion out, so this archive, which has every feature, must have none.
	await suite.test("all ask for something the parser can satisfy", () => {
		for (const query of suggestedQueries()) {
			assert.ok(
				scanFilters(query).every((match) => match.valid),
				query,
			);
		}
		assert.equal(suggestedQueries().length, PAGE_CONFIG.suggestions.length, "a suggestion was left out");
	});

	await suite.test("each find at least one strip, whatever the day", () => {
		installSiteArchive();
		const queries = new Set(EVERY_DAY.flatMap((day) => suggestedQueries(day)));
		for (const query of queries)
			assert.ok(search(query, "rank", TUNING, COMPOUND_CANONICAL_FORMS).length > 0, `"${query}" finds nothing`);
	});

	// Half the point of the pool is that the app is seen using the filter language, so this is a
	// guard against the teaching half being quietly emptied out.
	await suite.test("keep showing the filter syntax off", () => {
		const filtered = suggestedQueries().filter((query) => query.includes("@"));
		assert.ok(filtered.length >= 5, `only ${filtered.length} of the suggestions use a filter`);
		assert.ok(filtered.length < suggestedQueries().length, "every suggestion is a filter");
	});
});

test("drawing a suggestion", async (suite) => {
	const pool = suggestedQueries();

	await suite.test("walks the whole pool before repeating anything", () => {
		const drawn = pool.map(() => randomQuery());
		assert.equal(new Set(drawn).size, pool.length);
		assert.deepEqual([...drawn].sort(), [...pool].sort());
	});

	await suite.test("refills, so it keeps going past the end of the pool", () => {
		const drawn = pool.concat(pool).map(() => randomQuery());
		for (const query of pool) {
			assert.equal(drawn.filter((each) => each === query).length, 2, query);
		}
	});

	await suite.test("shuffles, rather than handing them out in order", () => {
		// Twenty draws in declared order is a one-in-20! coincidence; a hundred is not a flake.
		const orders = Array.from({ length: 5 }, () => pool.map(() => randomQuery()).join("|"));
		assert.ok(new Set(orders).size > 1, "five passes over the pool came out in the same order");
	});
});

test("today in the strip's run", async (suite) => {
	const span = { start: "1985-11-18", end: "1995-12-31", gaps: [["1991-05-06", "1992-02-08"]] as [string, string][] };

	await suite.test("repeats the full years end to end", () => {
		assert.equal(featuredDate(new Date(2026, 9, 5), span, {}), "1986-10-05");
		assert.equal(featuredDate(new Date(2035, 9, 5), span, {}), "1995-10-05");
		assert.equal(featuredDate(new Date(2036, 9, 5), span, {}), "1986-10-05");
		assert.equal(featuredDate(new Date(1980, 9, 5), span, {}), "1990-10-05");
	});

	await suite.test("takes the day before a leap day the year lacks", () => {
		assert.equal(featuredDate(new Date(2028, 1, 29), span, {}), "1988-02-29");
		assert.equal(featuredDate(new Date(2032, 1, 29), span, {}), "1992-02-29");
		assert.equal(featuredDate(new Date(2024, 1, 29), span, {}), "1994-02-28");
	});

	await suite.test("moves a day with no strip to the next year that has it", () => {
		assert.equal(featuredDate(new Date(2031, 5, 1), span, {}), "1992-06-01");
		assert.equal(featuredDate(new Date(2031, 0, 15), span, {}), "1991-01-15");
		assert.equal(featuredDate(new Date(2032, 0, 15), span, {}), "1993-01-15");
	});

	await suite.test("keeps a day in a gap that reran a strip", () => {
		const reruns = { "1991-06-01": "1986-01-04" };
		assert.equal(featuredDate(new Date(2031, 5, 1), span, reruns), "1991-06-01");
		// Only that day: the rest of the gap still has no strip.
		assert.equal(featuredDate(new Date(2031, 5, 2), span, reruns), "1992-06-02");
	});

	await suite.test("is nothing in an archive without a full year", () => {
		assert.equal(featuredDate(new Date(2026, 9, 5), { start: "1985-11-18", end: "1986-06-30", gaps: [] }, {}), null);
	});

	await suite.test("is never a day this archive has no strip for", () => {
		const days = new Set(Object.keys(comicSource.dailies));
		for (const day of EVERY_DAY) {
			const featured = featuredDate(day, ARCHIVE_SPAN, RERUNS)!;
			assert.ok(days.has(featured.replaceAll("-", "")) || Object.hasOwn(RERUNS, featured), featured);
		}
	});

	// Every day of the sabbaticals reran a strip, so this archive never needs to move one.
	await suite.test("lands in this archive's sabbaticals, on their reruns", () => {
		assert.equal(featuredDate(new Date(2031, 5, 1), ARCHIVE_SPAN, RERUNS), "1991-06-01");
		assert.equal(featuredDate(new Date(2034, 5, 1), ARCHIVE_SPAN, RERUNS), "1994-06-01");
		assert.equal(featuredDate(new Date(2034, 5, 1), ARCHIVE_SPAN, {}), "1995-06-01");
	});
});

test("a suggestion's fields", async (suite) => {
	const fields = suggestionFields(new Date(2026, 9, 5), ARCHIVE_SPAN, RERUNS);

	await suite.test("are filled in", () => {
		assert.equal(fillSuggestion("@month:{{today.month}} @day:{{ today.day }}", fields), "@month:oct @day:5");
		assert.equal(fillSuggestion("{{featured.month}} {{featured.day}} {{featured.year}}", fields), "oct 5 1986");
	});

	await suite.test("leave a suggestion out when there is no value for one today", () => {
		assert.equal(fillSuggestion("{{featured.year}}", { "today.month": "oct" }), null);
	});

	await suite.test("stop the build when one does not exist", () => {
		assert.throws(
			() => withConfig("name: x\nseries: x\nsearch:\n  suggestions:\n    - '{{today.year}}'\n", loadPageConfig),
			/Unknown field \{\{today\.year\}\}/,
		);
	});
});

test("config.yaml's suggestions", async (suite) => {
	const load = (search: string) => withConfig(`name: x\nseries: x\n${search}`, loadPageConfig).suggestions;

	await suite.test("are optional", () => {
		assert.deepEqual(load(""), []);
		assert.deepEqual(load("search:\n  suggestions: []\n"), []);
	});

	await suite.test("are checked", () => {
		assert.throws(() => load("search:\n  suggestions: snow\n"), /must be a list/);
		assert.throws(() => load("search:\n  suggestions:\n    - snow\n    - snow\n"), /twice/);
		assert.throws(() => load("search:\n  suggestions:\n    - ''\n"), /is empty/);
		assert.throws(() => load("search:\n  tuning: {}\n"), /search\.tuning/);
	});
});
