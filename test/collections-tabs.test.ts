import test from "node:test";
import assert from "node:assert/strict";
import {
	ARCS_PATH,
	BOOKS_PATH,
	BOOKSHELF_BOOKS_PATH,
	BOOKSHELF_CLIPPINGS_PATH,
	COLLECTIONS_PATH,
	bookshelfTabs,
	collectionsTabs,
	parseRoutePath,
} from "../src/routes";
import { PAGE_CONFIG } from "../src/site-config";
import { COLLECTION_INDEX } from "../src/bundled-data";
import { buildCollectionsHeaderHtml } from "../src/pages/collections";
import { buildLandingHtml } from "../src/pages/landing";
import { buildLibraryHtml } from "../src/pages/library";
import { addressOf } from "../src/base-path";

/** Runs `check` on a site with only the given kinds of collection, whatever `config.yaml` has. */
function withTabs(books: boolean, arcs: boolean, check: () => void): void {
	const { collections } = COLLECTION_INDEX;
	const { arcs: hadArcs, creators, characters, subjects } = PAGE_CONFIG;
	try {
		COLLECTION_INDEX.collections = books ? collections : [];
		Object.assign(PAGE_CONFIG, { arcs, creators: false, characters: false, subjects: false });
		check();
	} finally {
		COLLECTION_INDEX.collections = collections;
		Object.assign(PAGE_CONFIG, { arcs: hadArcs, creators, characters, subjects });
	}
}

const heading = (html: string) =>
	html.match(/<div class="page-title collections-heading"><h2 class="page-title__text">([^<]*)<\/h2>/)?.[1];
const landingLink = (html: string) =>
	html.match(/<nav class="landing-links">\s*<a href="([^"]*)">([^<]*)<\/a>/)?.slice(1);

test("collections tabs", async (suite) => {
	await suite.test("with books and arcs, both are tabs under Collections", () => {
		withTabs(true, true, () => {
			assert.deepEqual(collectionsTabs(), ["books", "arcs"]);
			const html = buildCollectionsHeaderHtml("books", false);
			assert.equal(heading(html), "Collections");
			assert.match(html, /collections-tabs/);
			assert.deepEqual(landingLink(buildLandingHtml()), [addressOf(BOOKS_PATH), "Collections"]);
		});
	});

	await suite.test("with only books, the page is Books, with no tabs", () => {
		withTabs(true, false, () => {
			const html = buildCollectionsHeaderHtml("books", false);
			assert.equal(heading(html), "Books");
			assert.doesNotMatch(html, /collections-tabs/);
			assert.deepEqual(landingLink(buildLandingHtml()), [addressOf(BOOKS_PATH), "Books"]);
			assert.equal(parseRoutePath(ARCS_PATH, ""), null);
		});
	});

	await suite.test("with only arcs, the page is Arcs, and the books have no address", () => {
		withTabs(false, true, () => {
			assert.equal(heading(buildCollectionsHeaderHtml("arcs", false)), "Arcs");
			assert.deepEqual(landingLink(buildLandingHtml()), [addressOf(ARCS_PATH), "Arcs"]);
			assert.equal(parseRoutePath(BOOKS_PATH, ""), null);
			assert.equal(parseRoutePath(COLLECTIONS_PATH, ""), null);
		});
	});

	await suite.test("with no collections, the home page has no link to them", () => {
		withTabs(false, false, () => {
			assert.deepEqual(collectionsTabs(), []);
			assert.match(buildLandingHtml(), /<nav class="landing-links">\s*<a href="[^"]*">Credits<\/a>\s*<\/nav>/);
		});
	});

	await suite.test("with no books, the Bookshelf is the clippings alone, with no tabs", () => {
		withTabs(true, false, () => {
			assert.deepEqual(bookshelfTabs(), ["all", "clippings", "books"]);
			assert.deepEqual(parseRoutePath(BOOKSHELF_CLIPPINGS_PATH, ""), { view: "bookshelf-clippings" });
			assert.deepEqual(parseRoutePath(BOOKSHELF_BOOKS_PATH, ""), { view: "bookshelf-books" });
		});
		withTabs(false, true, () => {
			assert.deepEqual(bookshelfTabs(), []);
			assert.equal(parseRoutePath(BOOKSHELF_CLIPPINGS_PATH, ""), null);
			assert.equal(parseRoutePath(BOOKSHELF_BOOKS_PATH, ""), null);
			assert.doesNotMatch(buildLibraryHtml("bookshelf", false), /collections-tabs|library-heading--tabbed/);
		});
	});
});
