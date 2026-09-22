import test from "node:test";
import assert from "node:assert/strict";
import {
	buildCollectionPath,
	buildComicPath,
	buildSearchPath,
	legacyHashPath,
	normalizePathname,
	parseRoutePath,
} from "../src/routes";

test("routes", async (suite) => {
	await suite.test("every path a builder writes parses back to the route it was built from", () => {
		assert.deepEqual(parseRoutePath("/", ""), { view: "landing" });
		assert.deepEqual(parseRoutePath("/credits", ""), { view: "credits" });

		const [comicPath, comicSearch] = buildComicPath("1986-07-07").split("?");
		assert.deepEqual(parseRoutePath(comicPath, comicSearch ?? ""), {
			view: "detail",
			date: "1986-07-07",
			alternates: [],
		});

		const [alternatePath, alternateSearch] = buildComicPath("1986-07-07", ["19860707"]).split("?");
		assert.deepEqual(parseRoutePath(alternatePath, "?" + alternateSearch), {
			view: "detail",
			date: "1986-07-07",
			alternates: ["19860707"],
		});

		assert.deepEqual(parseRoutePath(buildCollectionPath("yukonho"), ""), { view: "collection", id: "yukonho" });

		const [searchPath, searchQuery] = buildSearchPath("snow goons & co", "date").split("?");
		assert.deepEqual(parseRoutePath(searchPath, "?" + searchQuery), {
			view: "results",
			q: "snow goons & co",
			sort: "date",
		});
	});

	await suite.test("the comic address is the bare date", () => {
		assert.equal(buildComicPath("1986-07-07"), "/1986-07-07");
	});

	await suite.test("a host's spelling of an address is folded back into ours", () => {
		assert.equal(normalizePathname("/1986-07-07/"), "/1986-07-07");
		assert.equal(normalizePathname("/1986-07-07.html"), "/1986-07-07");
		assert.equal(normalizePathname("/1986-07-07/index.html"), "/1986-07-07");
		assert.equal(normalizePathname("/collection/yukonho.html"), "/collection/yukonho");
		assert.equal(normalizePathname("/index.html"), "/");
		assert.equal(normalizePathname("/"), "/");
		assert.deepEqual(parseRoutePath("/credits/", ""), { view: "credits" });
	});

	await suite.test("an address that is not ours is nobody's", () => {
		assert.equal(parseRoutePath("/comic/1986-07-07", ""), null);
		assert.equal(parseRoutePath("/1986/07/07", ""), null);
		assert.equal(parseRoutePath("/collection/Not-An-Id", ""), null);
		assert.equal(parseRoutePath("/404", ""), null);
	});

	await suite.test("the old hash addresses name the pages they always did", () => {
		assert.equal(legacyHashPath("#/"), "/");
		assert.equal(legacyHashPath("#/credits"), "/credits");
		assert.equal(legacyHashPath("#/comic/1986-07-07"), "/1986-07-07");
		assert.equal(legacyHashPath("#/comic/1986-07-07?alternate=19860707"), "/1986-07-07?alternate=19860707");
		assert.equal(legacyHashPath("#/collection/yukonho"), "/collection/yukonho");
		assert.equal(legacyHashPath("#/search?q=snow%20goons&sort=date"), "/search?q=snow%20goons&sort=date");
		// Not a route at all, so not a legacy one either: the skip link's target, and no hash.
		assert.equal(legacyHashPath("#main"), null);
		assert.equal(legacyHashPath(""), null);
	});
});
