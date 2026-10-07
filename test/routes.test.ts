import test from "node:test";
import assert from "node:assert/strict";
import {
	ARCS_PATH,
	BOOKS_PATH,
	LIBRARY_PATH,
	buildArcPath,
	buildLibraryPath,
	buildCollectionPath,
	buildComicPath,
	buildSearchPath,
	COLLECTIONS_PATH,
	legacyHashPath,
	normalizePathname,
	parseRoutePath,
	redirectedPath,
	CREATORS_PATH,
	buildCreatorPath,
} from "../src/routes";
import { PAGE_CONFIG } from "../src/site-config";

test("routes", async (suite) => {
	// Whatever `config.yaml` says about creators: `routes.ts` asks each time it reads a path.
	await suite.test("a creator's page and their list are pages only where there are creators", () => {
		const { creators } = PAGE_CONFIG;
		try {
			PAGE_CONFIG.creators = true;
			assert.deepEqual(parseRoutePath(CREATORS_PATH, ""), { view: "creators" });
			assert.deepEqual(parseRoutePath(buildCreatorPath("watterson"), ""), { view: "creator", id: "watterson" });
			PAGE_CONFIG.creators = false;
			assert.equal(parseRoutePath(CREATORS_PATH, ""), null);
			assert.equal(parseRoutePath(buildCreatorPath("watterson"), ""), null);
		} finally {
			PAGE_CONFIG.creators = creators;
		}
	});

	await suite.test("every path a builder writes parses back to the route it was built from", () => {
		assert.deepEqual(parseRoutePath("/", ""), { view: "landing" });
		assert.deepEqual(parseRoutePath("/credits", ""), { view: "credits" });
		assert.deepEqual(parseRoutePath(BOOKS_PATH, ""), { view: "collections" });
		assert.deepEqual(parseRoutePath(ARCS_PATH, ""), { view: "arcs" });
		assert.deepEqual(parseRoutePath(LIBRARY_PATH, ""), { view: "library", q: "", sort: "rank" });

		const [libraryPath, libraryQuery] = buildLibraryPath("snow goons & co", "date").split("?");
		assert.equal(libraryPath, LIBRARY_PATH);
		assert.deepEqual(parseRoutePath(libraryPath, "?" + libraryQuery), {
			view: "library",
			q: "snow goons & co",
			sort: "date",
		});
		assert.equal(buildLibraryPath(), LIBRARY_PATH);
		assert.equal(buildLibraryPath("", "date"), LIBRARY_PATH + "?sort=date");
		assert.deepEqual(parseRoutePath(LIBRARY_PATH, "?sort=date"), { view: "library", q: "", sort: "date" });

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
		assert.deepEqual(parseRoutePath(buildArcPath("tigertrap"), ""), { view: "arc", id: "tigertrap" });

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
		assert.equal(normalizePathname("/book/yukonho.html"), "/book/yukonho");
		assert.equal(normalizePathname("/index.html"), "/");
		assert.equal(normalizePathname("/"), "/");
		assert.deepEqual(parseRoutePath("/credits/", ""), { view: "credits" });
		assert.deepEqual(parseRoutePath("/books/", ""), { view: "collections" });
		assert.deepEqual(parseRoutePath("/arcs.html", ""), { view: "arcs" });
		assert.deepEqual(parseRoutePath("/library/", ""), { view: "library", q: "", sort: "rank" });
		assert.deepEqual(parseRoutePath("/library.html", ""), { view: "library", q: "", sort: "rank" });
	});

	// On purpose, and with no forwarding: a book's old address is not ours any more.
	await suite.test("a book lives at /book, and its old address goes nowhere", () => {
		assert.equal(buildCollectionPath("yukonho"), "/book/yukonho");
		assert.equal(parseRoutePath("/collection/yukonho", ""), null);
	});

	await suite.test("the old list of books is the books tab, under the books' own address", () => {
		assert.deepEqual(parseRoutePath(COLLECTIONS_PATH, ""), { view: "collections" });
		assert.equal(redirectedPath(COLLECTIONS_PATH), BOOKS_PATH);
		assert.equal(redirectedPath(BOOKS_PATH), null);
		assert.equal(redirectedPath(ARCS_PATH), null);
	});

	await suite.test("an address that is not ours is nobody's", () => {
		assert.equal(parseRoutePath("/comic/1986-07-07", ""), null);
		assert.equal(parseRoutePath("/1986/07/07", ""), null);
		assert.equal(parseRoutePath("/book/Not-An-Id", ""), null);
		assert.equal(parseRoutePath("/arc/Not-An-Id", ""), null);
		assert.equal(parseRoutePath("/404", ""), null);
	});

	await suite.test("the old hash addresses name the pages they always did", () => {
		assert.equal(legacyHashPath("#/"), "/");
		assert.equal(legacyHashPath("#/credits"), "/credits");
		assert.equal(legacyHashPath("#/comic/1986-07-07"), "/1986-07-07");
		assert.equal(legacyHashPath("#/comic/1986-07-07?alternate=19860707"), "/1986-07-07?alternate=19860707");
		assert.equal(legacyHashPath("#/collection/yukonho"), "/book/yukonho");
		assert.equal(legacyHashPath("#/search?q=snow%20goons&sort=date"), "/search?q=snow%20goons&sort=date");
		// Not a route at all, so not a legacy one either: the skip link's target, and no hash.
		assert.equal(legacyHashPath("#main"), null);
		assert.equal(legacyHashPath(""), null);
	});
});
