import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import { Page } from "../src/pages/page";
import { buildCorrectionLinkHtml, buildCorrectionUrl } from "../src/pages/correction";
import { buildDocumentHtml } from "../src/pages/shell";
import { loadPageConfig } from "../build-chain/siteConfig";

/** A project holding just this `config.yaml`, for `loadPageConfig` to read. */
function withConfig<T>(contents: string, run: (projectDir: string) => T): T {
	const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "config-"));
	try {
		fs.writeFileSync(path.join(projectDir, "config.yaml"), contents);
		return run(projectDir);
	} finally {
		fs.rmSync(projectDir, { recursive: true, force: true });
	}
}

/**
 * What the corrections link promises: that the form opens knowing which page it was sent from, and
 * that the link is in every document whether or not it shows there — it is chrome the app moves
 * from page to page, so a document that left it out could never reveal it.
 */

const PROJECT_DIR = process.cwd();
const template = fs.readFileSync(path.join(PROJECT_DIR, "src", "index.html"), "utf8");

const options = { siteUrl: "https://example.test", path: "", commit: "abc1234" };

/** The URL a page's link leads to, which the tests below expect `config.yaml` to give every page but home, search and the library. */
function correction(context: Parameters<typeof buildCorrectionUrl>[0]): string {
	const url = buildCorrectionUrl(context);
	assert.ok(url, `${context.view} has a corrections template`);
	return url;
}

const detail: Page = {
	view: "detail",
	date: "1986-07-07",
	alternates: [],
	comics: [{ date: "1986-07-07", transcript: "Hi." }],
	rerunOf: null,
	prevDate: null,
	nextDate: null,
	runs: ["1986-07-07"],
	bookNeighbours: {},
	collections: [],
	descriptions: {},
	arcs: [],
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
	arcs: { arcs: [], longest: 0 },
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
		assert.match(correction({ view: "detail", url: "", commit: "" }), /entry.762468410=Comic/);
		assert.match(correction({ view: "collection", url: "", commit: "" }), /entry.762468410=Book/);
		assert.match(correction({ view: "collections", url: "", commit: "" }), /entry.762468410=Book/);
		assert.match(correction({ view: "arc", url: "", commit: "" }), /entry.762468410=Arc/);
		assert.match(correction({ view: "arcs", url: "", commit: "" }), /entry.762468410=Arc/);
	});

	await suite.test("checks the rerun box alongside the strip's on a rerun day", () => {
		const kinds = (rerun: boolean) =>
			new URL(correction({ view: "detail", url: "", commit: "", rerun })).searchParams.getAll("entry.762468410");
		assert.deepEqual(kinds(true), ["Comic", "Rerun"]);
		assert.deepEqual(kinds(false), ["Comic"]);
	});

	await suite.test("checks nothing where the page is about no one strip or book", () => {
		// Credits shows the link and lets the reader say what they mean.
		assert.doesNotMatch(correction({ view: "credits", url: "", commit: "" }), /entry.762468410/);
	});

	await suite.test("names the page, the site it is on, and the build it was made by", () => {
		const url = correction({ view: "detail", url: "https://example.test/1986-07-07", commit: "abc1234" });
		const parameters = new URL(url).searchParams;
		assert.equal(parameters.get("usp"), "pp_url");
		assert.equal(parameters.get("entry.1138251038"), "https://example.test/1986-07-07");
		assert.equal(parameters.get("entry.2127852102"), "https://example.test");
		assert.equal(parameters.get("entry.46703544"), "abc1234");
	});

	await suite.test("has no site to name when the build had no address to write", () => {
		// What a build with no SITE_URL writes; the app puts the real address there once it runs.
		const url = correction({ view: "detail", url: "/1986-07-07", commit: "abc1234" });
		const parameters = new URL(url).searchParams;
		assert.equal(parameters.get("entry.1138251038"), "/1986-07-07");
		assert.equal(parameters.get("entry.2127852102"), "");
	});

	await suite.test("is there only for a kind of page with a template", () => {
		for (const view of ["detail", "collection", "collections", "arc", "arcs", "credits"] as const) {
			assert.notEqual(buildCorrectionUrl({ view, url: "", commit: "" }), null, view);
		}
		assert.equal(buildCorrectionUrl({ view: "landing", url: "", commit: "" }), null);
		assert.equal(buildCorrectionUrl({ view: "results", url: "", commit: "" }), null);
		// The bookmarks are this reader's own, so there is nothing of the archive on the page to be wrong.
		assert.equal(buildCorrectionUrl({ view: "library", url: "", commit: "" }), null);
		assert.equal(
			buildCorrectionUrl({ view: "detail", url: "", commit: "", rerun: true }, { strip: "https://x.test" }),
			null,
		);
	});
});

test("a document's corrections link", async (suite) => {
	await suite.test("opens the form about the page it is on", () => {
		assert.match(link(document(detail, "/1986-07-07")), /entry.762468410=Comic/);
		assert.match(link(document(detail, "/1986-07-07")), /entry.1138251038=https%3A%2F%2Fexample.test%2F1986-07-07/);
		assert.doesNotMatch(link(document(detail, "/1986-07-07")), /entry.762468410=Rerun/);
		assert.match(link(document(rerun, "/1995-12-31")), /entry.762468410=Comic&amp;entry.762468410=Rerun/);
		assert.match(link(document(collection, "/book/yukonho")), /entry.762468410=Book/);
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

	await suite.test("is left out altogether by a build with no templates", () => {
		assert.equal(buildCorrectionLinkHtml({ view: "detail", url: "", commit: "abc1234" }, {}), "");
	});
});

test("config.yaml's corrections", async (suite) => {
	const yaml = (corrections: string) => `name: x\nseries: x\ncorrections:\n${corrections}`;

	await suite.test("fills a page's template in, escaping what it fills", () => {
		const config = withConfig(
			yaml("  pages:\n    strip: https://form.test/?u={{page.url}}&o={{page.origin}}&c={{site.commit}}\n"),
			loadPageConfig,
		);
		assert.equal(
			buildCorrectionUrl(
				{ view: "detail", url: "https://example.test/1986-07-07?a=b", commit: "abc" },
				config.corrections,
			),
			"https://form.test/?u=https%3A%2F%2Fexample.test%2F1986-07-07%3Fa%3Db&o=https%3A%2F%2Fexample.test&c=abc",
		);
	});

	await suite.test("has none when CORRECTIONS is false", () => {
		const saved = process.env.CORRECTIONS;
		const contents = yaml("  enabled: ${CORRECTIONS:-true}\n  pages:\n    strip: https://form.test\n");
		try {
			process.env.CORRECTIONS = "";
			assert.deepEqual(withConfig(contents, loadPageConfig).corrections, { strip: "https://form.test" });
			process.env.CORRECTIONS = "false";
			assert.deepEqual(withConfig(contents, loadPageConfig).corrections, {});
		} finally {
			if (saved === undefined) delete process.env.CORRECTIONS;
			else process.env.CORRECTIONS = saved;
		}
	});

	await suite.test("has none for a site that gives none", () => {
		assert.deepEqual(withConfig("name: x\nseries: x\n", loadPageConfig).corrections, {});
	});

	await suite.test("refuses a kind of page or a field it does not know", () => {
		assert.throws(
			() => withConfig(yaml("  pages:\n    comic: https://form.test\n"), loadPageConfig),
			/corrections\.pages\.comic/,
		);
		assert.throws(
			() => withConfig(yaml("  pages:\n    strip: https://form.test/?d={{strip.date}}\n"), loadPageConfig),
			/corrections\.pages\.strip.*strip\.date/,
		);
	});
});
