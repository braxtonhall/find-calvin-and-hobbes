import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { Page } from "../src/pages/page";
import { buildCorrectionUrl, showsCorrection } from "../src/pages/correction";
import { buildDocumentHtml } from "../src/pages/shell";
import { loadCorrectionsEnabled } from "../build-chain/siteConfig";

/**
 * What the corrections link promises: that the form opens knowing which page it was sent from, and
 * that the link is in every document whether or not it shows there — it is chrome the app moves
 * from page to page, so a document that left it out could never reveal it.
 */

const PROJECT_DIR = process.cwd();
const template = fs.readFileSync(path.join(PROJECT_DIR, "src", "index.html"), "utf8");

const options = { siteUrl: "https://example.test", path: "", commit: "abc1234" };

const detail: Page = {
	view: "detail",
	date: "1986-07-07",
	alternates: [],
	comics: [{ date: "1986-07-07", transcript: "Hi." }],
	rerunOf: null,
	prevDate: null,
	nextDate: null,
	collections: [],
	descriptions: {},
};

const rerun: Page = { ...detail, date: "1995-12-31", rerunOf: "1986-07-07" };

const collection: Page = {
	view: "collection",
	id: "yukonho",
	collection: null,
	indexLoaded: true,
	extras: [],
	dates: [],
	prev: null,
	next: null,
};

function document(page: Page, routePath: string, overrides: Partial<typeof options> = {}): string {
	return buildDocumentHtml(template, page, { ...options, ...overrides, path: routePath });
}

function link(html: string): string {
	const match = html.match(/<a class="correction-link"[^>]*>/);
	assert.ok(match, "the document carries the corrections link");
	return match[0];
}

test("the corrections form's address", async (suite) => {
	await suite.test("checks the box for the kind of page it was sent from", () => {
		assert.match(buildCorrectionUrl({ view: "detail", url: "", commit: "" }), /entry.762468410=Comic/);
		assert.match(buildCorrectionUrl({ view: "collection", url: "", commit: "" }), /entry.762468410=Collection/);
		assert.match(buildCorrectionUrl({ view: "collections", url: "", commit: "" }), /entry.762468410=Collection/);
	});

	await suite.test("checks the rerun box alongside the strip's on a rerun day", () => {
		const kinds = (rerun: boolean) =>
			new URL(buildCorrectionUrl({ view: "detail", url: "", commit: "", rerun })).searchParams.getAll(
				"entry.762468410",
			);
		assert.deepEqual(kinds(true), ["Comic", "Rerun"]);
		assert.deepEqual(kinds(false), ["Comic"]);
	});

	await suite.test("checks nothing where the page is about no one strip or book", () => {
		// Credits shows the link and lets the reader say what they mean; the others do not show it.
		for (const view of ["credits", "landing", "results"] as const) {
			assert.doesNotMatch(buildCorrectionUrl({ view, url: "", commit: "" }), /entry.762468410/);
		}
	});

	await suite.test("names the page, the site it is on, and the build it was made by", () => {
		const url = buildCorrectionUrl({ view: "detail", url: "https://example.test/1986-07-07", commit: "abc1234" });
		const parameters = new URL(url).searchParams;
		assert.equal(parameters.get("usp"), "pp_url");
		assert.equal(parameters.get("entry.1138251038"), "https://example.test/1986-07-07");
		assert.equal(parameters.get("entry.2127852102"), "https://example.test");
		assert.equal(parameters.get("entry.46703544"), "abc1234");
	});

	await suite.test("has no site to name when the build had no address to write", () => {
		// What a build with no SITE_URL writes; the app puts the real address there once it runs.
		const url = buildCorrectionUrl({ view: "detail", url: "/1986-07-07", commit: "abc1234" });
		const parameters = new URL(url).searchParams;
		assert.equal(parameters.get("entry.1138251038"), "/1986-07-07");
		assert.equal(parameters.get("entry.2127852102"), "");
	});

	await suite.test("shows only where there is something of the archive to be wrong", () => {
		assert.equal(showsCorrection("detail"), true);
		assert.equal(showsCorrection("collection"), true);
		assert.equal(showsCorrection("collections"), true);
		assert.equal(showsCorrection("credits"), true);
		assert.equal(showsCorrection("landing"), false);
		assert.equal(showsCorrection("results"), false);
	});
});

test("a document's corrections link", async (suite) => {
	await suite.test("opens the form about the page it is on", () => {
		assert.match(link(document(detail, "/1986-07-07")), /entry.762468410=Comic/);
		assert.match(link(document(detail, "/1986-07-07")), /entry.1138251038=https%3A%2F%2Fexample.test%2F1986-07-07/);
		assert.doesNotMatch(link(document(detail, "/1986-07-07")), /entry.762468410=Rerun/);
		assert.match(link(document(rerun, "/1995-12-31")), /entry.762468410=Comic&amp;entry.762468410=Rerun/);
		assert.match(link(document(collection, "/collection/yukonho")), /entry.762468410=Collection/);
		assert.doesNotMatch(link(document({ view: "credits" }, "/credits")), /entry.762468410/);
	});

	await suite.test("is written where it does not show, so that the app can show it later", () => {
		// The link outlives navigation because nothing re-renders it — which it cannot do from a
		// document that left it out. Landing and search hide it instead.
		for (const [page, routePath] of [
			[{ view: "landing" } as Page, "/"],
			[{ view: "results", q: "", sort: "rank" } as Page, "/search"],
		] as const) {
			assert.match(link(document(page, routePath)), /\shidden>/);
		}
		assert.doesNotMatch(link(document(detail, "/1986-07-07")), /\shidden>/);
		assert.doesNotMatch(link(document({ view: "credits" }, "/credits")), /\shidden>/);
	});

	await suite.test("says which build it came from", () => {
		assert.match(link(document(detail, "/1986-07-07")), /data-commit="abc1234"/);
		assert.match(link(document(detail, "/1986-07-07", { commit: undefined })), /data-commit="unknown"/);
	});

	await suite.test("is left out altogether by a build that wants no part of the form", () => {
		const html = buildDocumentHtml(template, detail, { ...options, path: "/1986-07-07", corrections: false });
		assert.doesNotMatch(html, /correction-link/);
		assert.doesNotMatch(html, /docs.google.com/);
		assert.doesNotMatch(html, /\{\{\w+\}\}/, "every template token is still filled");
	});

	await suite.test("is on unless a build turns it off", () => {
		const saved = process.env.CORRECTIONS;
		try {
			process.env.CORRECTIONS = "";
			assert.equal(loadCorrectionsEnabled(), true);
			process.env.CORRECTIONS = "false";
			assert.equal(loadCorrectionsEnabled(), false);
			process.env.CORRECTIONS = "true";
			assert.equal(loadCorrectionsEnabled(), true);
		} finally {
			if (saved === undefined) delete process.env.CORRECTIONS;
			else process.env.CORRECTIONS = saved;
		}
	});
});
