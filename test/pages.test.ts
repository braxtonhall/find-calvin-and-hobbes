import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { loadCollectionData } from "../build-chain/collectionPages";
import { loadComicSource } from "../build-chain/comicSource";
import { exportComicsJson } from "../build-chain/exportComicsJson";
import { exportRerunsJson } from "../build-chain/reruns";
import { exportDescriptions } from "../build-chain/exportDescriptions";
import { generateCollectionIndex } from "../build-chain/generateCollectionIndex";
import { computeDays } from "../src/days";
import { Collection, Comic } from "../src/types";
import { Page, PageSource } from "../src/pages/page";
import { detailPageFrom } from "../src/pages/detail";
import { buildRangeSearchPath, collectionPageFrom } from "../src/pages/collection";
import { parseQueryFilters, passesFilters } from "../src/filter-query";
import { parseRoutePath } from "../src/routes";
import { collectionsPageFrom } from "../src/pages/collections";
import { isDateInCollection } from "../src/date-utils";
import { buildDocumentHtml, buildViewHtml, PAGE_DATA_ID } from "../src/pages/shell";
import { loadPageLayout, pageAssetPath } from "../build-chain/siteConfig";

/**
 * What a prerendered document promises: that the view it holds is the one the app would draw
 * from the data it holds. The app relies on this when it adopts a document on a cold load rather
 * than redrawing it, so it is checked here the way the app would check it — by reading the data
 * back out of the document and drawing.
 */

const PROJECT_DIR = process.cwd();
const template = fs.readFileSync(path.join(PROJECT_DIR, "src", "index.html"), "utf8");

function loadSource(): PageSource {
	const collectionData = loadCollectionData(PROJECT_DIR);
	const comics: Comic[] = JSON.parse(exportComicsJson(PROJECT_DIR, collectionData));
	const reruns: Record<string, string> = JSON.parse(
		exportRerunsJson(PROJECT_DIR, loadComicSource(path.join(PROJECT_DIR, "comics.yaml"))),
	);
	const collectionIndex = JSON.parse(generateCollectionIndex(collectionData));
	const descriptions: Record<string, string> = JSON.parse(exportDescriptions(PROJECT_DIR));

	const comicsByDate = new Map<string, Comic[]>();
	for (const comic of comics) {
		if (!comicsByDate.has(comic.date)) comicsByDate.set(comic.date, []);
		comicsByDate.get(comic.date)!.push(comic);
	}
	const collectionsById = new Map<string, Collection>(
		collectionIndex.collections.map((collection: Collection) => [collection.id, collection]),
	);
	return {
		comicsByDate,
		reruns: new Map(Object.entries(reruns)),
		allDays: computeDays(),
		collectionIndex,
		collectionsById,
		descriptions: new Map(Object.entries(descriptions)),
	};
}

function embeddedPage(document: string): Page {
	const match = document.match(new RegExp(`<script type="application/json" id="${PAGE_DATA_ID}">(.*?)</script>`, "s"));
	assert.ok(match, "the document embeds its page");
	return JSON.parse(match[1]);
}

function activeView(document: string, view: string): string {
	const match = document.match(
		new RegExp(
			`<div id="view-${view}" class="view active">(.*?)</div>\\s*<div id="view-|<div id="view-${view}" class="view active">(.*)</div>\\s*</main>`,
			"s",
		),
	);
	assert.ok(match, `the ${view} view is active`);
	return match[1] ?? match[2];
}

const source = loadSource();
const options = { siteUrl: "https://example.test", path: "" };

test("a prerendered document", async (suite) => {
	await suite.test("holds the view its embedded data draws, for a strip", () => {
		// A Sunday with two printings, a strip with an alternate transcript, and a rerun day are the
		// busy cases.
		for (const date of ["1985-11-18", "1986-07-06", "1987-01-07", "1991-05-05", "1995-12-31"]) {
			const page = detailPageFrom(source, date);
			const document = buildDocumentHtml(template, page, { ...options, path: `/${date}` });
			const embedded = embeddedPage(document);
			assert.deepEqual(embedded, page);
			assert.equal(activeView(document, "detail"), buildViewHtml(embedded, false));
		}
	});

	await suite.test("holds the view its embedded data draws, for a book", () => {
		for (const collection of source.collectionIndex!.collections) {
			const page = collectionPageFrom(source, collection.id);
			const document = buildDocumentHtml(template, page, { ...options, path: `/collection/${collection.id}` });
			const embedded = embeddedPage(document);
			assert.deepEqual(embedded, page);
			assert.equal(activeView(document, "collection"), buildViewHtml(embedded, false));
			assert.ok(page.dates.length > 0, `${collection.id} highlights something in the grid`);
		}
	});

	await suite.test("steps from each book to the next in publication order, and stops at either end", () => {
		const collections = source.collectionIndex!.collections;
		collections.forEach((collection, index) => {
			const page = collectionPageFrom(source, collection.id);
			assert.equal(page.prev?.id ?? null, index > 0 ? collections[index - 1].id : null);
			assert.equal(page.next?.id ?? null, index < collections.length - 1 ? collections[index + 1].id : null);
		});
	});

	await suite.test("links each end of a book's ranges to a strip the archive has", () => {
		for (const collection of source.collectionIndex!.collections) {
			const html = buildViewHtml(collectionPageFrom(source, collection.id), false);
			const dates = [...html.matchAll(/class="collection-range-date" href="[^"]*" data-date="([^"]+)"/g)].map(
				(match) => match[1],
			);
			assert.ok(dates.length > 0, `${collection.id} links its ranges`);
			for (const date of dates) assert.ok(source.comicsByDate.has(date), `${collection.id} links ${date}`);
		}
	});

	await suite.test("searches a book's range from its dash, finding just the book's strips in it", () => {
		const iso = (compact: string, days = 0) => {
			const date = new Date(
				Date.UTC(Number(compact.slice(0, 4)), Number(compact.slice(4, 6)) - 1, Number(compact.slice(6, 8)) + days),
			);
			return date.toISOString().slice(0, 10);
		};
		const allDates = [...source.comicsByDate.keys()];
		for (const collection of source.collectionIndex!.collections) {
			const held = collectionPageFrom(source, collection.id).dates;
			for (const entry of collection.dailies.filter((range) => range.includes("-"))) {
				const [start, end] = entry.split("-");
				const [pathname, search] = buildRangeSearchPath(entry, collection.sundays ?? false).split("?");
				const route = parseRoutePath(pathname, "?" + search);
				assert.equal(route?.view, "results");
				assert.equal(route?.sort, "date");
				const { filters, residual } = parseQueryFilters(route!.q!);
				assert.equal(residual, "", `${entry} is all filter`);
				assert.ok(passesFilters(iso(start), filters!), `${entry} keeps its first day`);
				assert.ok(passesFilters(iso(end), filters!), `${entry} keeps its last day`);
				assert.ok(!passesFilters(iso(start, -1), filters!), `${entry} stops at its first day`);
				assert.ok(!passesFilters(iso(end, 1), filters!), `${entry} stops at its last day`);
				// A Sundays-only book's range spans the weekdays between its Sundays; the search must not.
				assert.deepEqual(
					allDates.filter((date) => passesFilters(date, filters!)),
					held.filter((date) => date >= iso(start) && date <= iso(end)),
					`${collection.id} ${entry} finds the book's strips and no others`,
				);
			}
		}
	});

	await suite.test("holds the view its embedded data draws, for the list of books", () => {
		const page = collectionsPageFrom(source);
		const document = buildDocumentHtml(template, page, { ...options, path: "/collections" });
		const embedded = embeddedPage(document);
		assert.deepEqual(embedded, page);
		assert.equal(activeView(document, "collections"), buildViewHtml(embedded, false));
		assert.match(document, /<title>Collections — Find Calvin and Hobbes<\/title>/);

		assert.deepEqual(
			page.collections.map((collection) => collection.id),
			source.collectionIndex!.collections.map((collection) => collection.id),
			"in publication order",
		);
		// What a hovered row lights up in the grid is what the book's own page lights up.
		for (const summary of page.collections) {
			const hovered = [...source.comicsByDate.keys()].filter((date) => isDateInCollection(date, summary));
			assert.deepEqual(hovered, collectionPageFrom(source, summary.id).dates, `${summary.id} lights its strips`);
		}
	});

	await suite.test("names itself and where it lives", () => {
		const document = buildDocumentHtml(template, detailPageFrom(source, "1986-07-07"), {
			...options,
			path: "/1986-07-07",
		});
		assert.match(document, /<title>1986-07-07 — Find Calvin and Hobbes<\/title>/);
		assert.match(document, /<link rel="canonical" href="https:\/\/example.test\/1986-07-07" \/>/);
		assert.match(document, /<meta property="og:url" content="https:\/\/example.test\/1986-07-07" \/>/);
		assert.doesNotMatch(document, /\{\{\w+\}\}/, "every template token is filled");
	});

	await suite.test("keeps its data inside its script tag whatever the transcript says", () => {
		const page = detailPageFrom(source, "1986-07-07");
		page.comics = [{ ...page.comics[0], transcript: 'Look: </script><script>alert("hi")</script>' }];
		const document = buildDocumentHtml(template, page, options);
		assert.deepEqual(embeddedPage(document), page);
		assert.doesNotMatch(document, /alert\("hi"\)<\/script>/);
	});
});

test("the page layout", async (suite) => {
	await suite.test("puts a page where its host will find it", () => {
		assert.equal(pageAssetPath("/", "html"), "index.html");
		assert.equal(pageAssetPath("/", "directory"), "index.html");
		assert.equal(pageAssetPath("/credits", "html"), "credits.html");
		assert.equal(pageAssetPath("/credits", "directory"), "credits/index.html");
		assert.equal(pageAssetPath("/collections", "html"), "collections.html");
		assert.equal(pageAssetPath("/collections", "directory"), "collections/index.html");
		assert.equal(pageAssetPath("/collection/yukonho", "html"), "collection/yukonho.html");
		assert.equal(pageAssetPath("/collection/yukonho", "directory"), "collection/yukonho/index.html");
	});

	await suite.test("is html unless told otherwise, and refuses a layout it does not know", () => {
		const saved = process.env.PAGE_LAYOUT;
		try {
			process.env.PAGE_LAYOUT = "";
			assert.equal(loadPageLayout(), "html");
			process.env.PAGE_LAYOUT = "directory";
			assert.equal(loadPageLayout(), "directory");
			process.env.PAGE_LAYOUT = "folders";
			assert.throws(() => loadPageLayout(), /PAGE_LAYOUT/);
		} finally {
			if (saved === undefined) delete process.env.PAGE_LAYOUT;
			else process.env.PAGE_LAYOUT = saved;
		}
	});
});
