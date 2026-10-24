// First: turns on `@featuring` and `@as:seen` and its kin, which `FILTER_SPECS` reads once, as it loads.
import "./helpers/character-roles";

import test from "node:test";
import assert from "node:assert/strict";
import { scanQuery } from "../src/boolean-query";
import { completionsAt } from "../src/completion";
import { STRIP_QUERY, collectionQuery } from "../src/filter-query";
import { Compounds, search } from "../src/search";
import { searchCollections } from "../src/query-eval";
import { state } from "../src/state";
import { Character, Comic } from "../src/types";
import { install } from "./helpers/archive";
import { ENGINE_TUNING } from "./helpers/engine-tuning";

/** `@as:` inside `@featuring (…)`: how a strip has a character — seen, heard, or only mentioned. */

const NO_COMPOUNDS: Compounds = new Map();

const CHARACTERS: Character[] = [
	{ id: "calvin", name: "Calvin", strips: 0, years: [], ranges: [] },
	{ id: "susie", name: "Susie Derkins", strips: 0, years: [], ranges: [] },
	{ id: "mom", name: "Mom", strips: 0, years: [], ranges: [] },
];

/**
 * Calvin and Susie both seen and heard; Susie seen but silent and Mom only heard; Susie only
 * talked about, and run again in 1995; and Mom alone, seen and heard.
 */
const COMICS: Comic[] = [
	{ date: "1988-01-03", transcript: "Snow!", characters: ["calvin", "susie"] },
	{
		date: "1988-01-04",
		transcript: "Dinner!",
		characters: ["calvin", "susie", "mom"],
		seenOnly: ["susie"],
		heardOnly: ["mom"],
	},
	{ date: "1988-01-05", transcript: "Susie is weird.", characters: ["calvin"], mentioned: ["susie"] },
	{ date: "1988-01-06", transcript: "Bedtime.", characters: ["mom"] },
];

function setUp(): void {
	install({ comics: COMICS, descriptions: new Map() });
	state.comicsByDate = new Map(COMICS.map((comic) => [comic.date, [comic]]));
	state.reruns = new Map([["1995-01-05", "1988-01-05"]]);
	state.collectionIndex = { collections: [] };
	state.collectionsById = new Map();
	state.arcs = [];
	state.arcsById = new Map();
	state.charactersById = new Map(CHARACTERS.map((character) => [character.id, character]));
	state.creatorsById = new Map();
	state.subjectsById = new Map();
}

/** What the main search finds, as each row's date, a rerun day's marked. */
function strips(query: string): string[] {
	return search(query, "date", ENGINE_TUNING, NO_COMPOUNDS).map(
		(result) => `${result.comic.date}${result.rerun ? " rerun" : ""}`,
	);
}

/** What the Characters tab lists for the query, in the tab's order. */
function listed(query: string): string[] {
	const results = searchCollections(query, "character", NO_COMPOUNDS);
	assert.ok(results, `"${query}" has something in it`);
	return CHARACTERS.map((character) => character.id).filter((id) => results.ids.has(id));
}

function valid(query: string, root = STRIP_QUERY): boolean[] {
	return scanQuery(query, root).filters.map((filter) => filter.valid);
}

test("how a strip has its characters", async (suite) => {
	setUp();

	await suite.test("a listed character is seen and heard unless the strip says otherwise", () => {
		assert.deepEqual(strips("@featuring (@id:susie @as:seen)"), ["1988-01-03", "1988-01-04"]);
		assert.deepEqual(strips("@featuring (@id:susie @as:heard)"), ["1988-01-03"]);
		assert.deepEqual(strips("@featuring (@id:mom @as:seen)"), ["1988-01-06"]);
		assert.deepEqual(strips("@featuring (@id:mom @as:heard)"), ["1988-01-04", "1988-01-06"]);
	});

	await suite.test("seen and never heard, as the issue asks it", () => {
		assert.deepEqual(strips("@featuring (@as:seen @not @as:heard)"), ["1988-01-04"]);
		assert.deepEqual(strips("@featuring (@not @as:heard)"), ["1988-01-04"], "a mention is not let in by @not");
	});

	await suite.test("a mention is left out unless @as:mentioned asks for it", () => {
		assert.deepEqual(strips("@featuring:susie"), ["1988-01-03", "1988-01-04"]);
		assert.deepEqual(strips("@featuring (@id:susie)"), ["1988-01-03", "1988-01-04"]);
		assert.deepEqual(strips("@featuring (@id:susie @as:mentioned)"), ["1988-01-05"]);
		assert.deepEqual(strips("@featuring (@id:susie @or @as:mentioned)"), ["1988-01-03", "1988-01-04", "1988-01-05"]);
		assert.deepEqual(strips("@featuring (@id:susie @not @as:mentioned)"), ["1988-01-03", "1988-01-04"]);
		assert.deepEqual(strips("@not @featuring:susie"), ["1988-01-05", "1988-01-06"]);
	});

	await suite.test("a rerun day mentions whom its strip did", () => {
		assert.deepEqual(strips("@is:rerun @featuring (@id:susie @as:mentioned)"), ["1995-01-05 rerun"]);
	});

	await suite.test("@has asks the same of a character's strips, mentions only where asked", () => {
		assert.deepEqual(listed("@has @as:mentioned"), ["susie"]);
		assert.deepEqual(listed("@has (@as:seen @not @as:heard)"), ["susie"]);
		assert.deepEqual(listed("@has (@as:heard @not @as:seen)"), ["mom"]);
		assert.deepEqual(listed("@only @has @as:heard"), ["calvin", "mom"]);
		assert.deepEqual(listed("@has @year:1988"), ["calvin", "susie", "mom"]);
	});

	await suite.test("the tags are a character's, and a book's are not", () => {
		assert.deepEqual(valid("@featuring (@as:heard)"), [true]);
		assert.deepEqual(valid("@has @as:mentioned", collectionQuery("character")), [true]);
		assert.deepEqual(valid("@in (@as:heard)"), [false]);
		assert.deepEqual(valid("@featuring (@as:ink)"), [false]);
		assert.deepEqual(valid("@during (@as:seen)"), [false]);
		assert.deepEqual(valid("@as:seen"), [false]);
		assert.deepEqual(valid("@featuring (@as:smelled)"), [false]);
	});

	await suite.test("the menu offers a character's tags inside @featuring", () => {
		const query = "@featuring (@as:";
		const offered = (completionsAt(query, query.length)?.rows ?? []).map((row) => row.value);
		assert.deepEqual(offered, ["seen", "heard", "mentioned"]);
	});
});
