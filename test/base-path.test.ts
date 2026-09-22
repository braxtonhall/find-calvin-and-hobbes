import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { addressOf, basePath, pathOf } from "../src/base-path";
import { loadSiteConfig } from "../build-chain/siteConfig";
import { buildDocumentHtml } from "../src/pages/shell";
import { buildDetailHtml } from "../src/pages/detail";
import { DetailPage } from "../src/pages/page";
import { loadCollectionData } from "../build-chain/collectionPages";
import { exportComicsJson } from "../build-chain/exportComicsJson";
import { generateCollectionIndex } from "../build-chain/generateCollectionIndex";
import { Comic, CollectionIndex } from "../src/types";

/**
 * A site mounted below the root — `SITE_URL=https://user.github.io/repo` — has to write every
 * address from the mount and read every address back through it, while `routes.ts` goes on
 * spelling paths from `/`. The mount comes from the environment (see `src/base-path.ts`), so
 * these set it as the build would and put it back after.
 */

const environment = globalThis as { __BASE_PATH__?: string };

function mounted<T>(at: string, run: () => T): T {
	const saved = environment.__BASE_PATH__;
	environment.__BASE_PATH__ = at;
	try {
		return run();
	} finally {
		if (saved === undefined) delete environment.__BASE_PATH__;
		else environment.__BASE_PATH__ = saved;
	}
}

function withSiteUrl<T>(value: string, run: () => T): T {
	const saved = process.env.SITE_URL;
	process.env.SITE_URL = value;
	try {
		return run();
	} finally {
		if (saved === undefined) delete process.env.SITE_URL;
		else process.env.SITE_URL = saved;
	}
}

const PROJECT_DIR = process.cwd();

test("the mount", async (suite) => {
	await suite.test("is the root unless the environment says otherwise", () => {
		assert.equal(basePath(), "/");
		assert.equal(addressOf("/1986-07-07"), "/1986-07-07");
		assert.equal(pathOf("/1986-07-07"), "/1986-07-07");
		assert.equal(mounted("/repo/", basePath), "/repo/");
	});

	await suite.test("goes on the front of a path and comes off the front of an address", () => {
		mounted("/repo/", () => {
			assert.equal(addressOf("/"), "/repo/");
			assert.equal(addressOf("/1986-07-07"), "/repo/1986-07-07");
			assert.equal(addressOf("/search?q=snow"), "/repo/search?q=snow");
			assert.equal(pathOf("/repo/"), "/");
			assert.equal(pathOf("/repo"), "/", "the host may drop the slash on the mount itself");
			assert.equal(pathOf("/repo/1986-07-07"), "/1986-07-07");
			assert.equal(pathOf("/repo/credits.html"), "/credits.html", "spelling is the router's business");
		});
	});

	await suite.test("does not claim an address outside it", () => {
		mounted("/repo/", () => {
			assert.equal(pathOf("/"), null);
			assert.equal(pathOf("/1986-07-07"), null);
			assert.equal(pathOf("/repository/1986-07-07"), null, "a prefix of the name is not the name");
		});
	});
});

test("SITE_URL", async (suite) => {
	await suite.test("with no path mounts the site at the root", () => {
		const config = withSiteUrl("https://example.test", loadSiteConfig);
		assert.deepEqual(config, { siteUrl: "https://example.test", host: "example.test", basePath: "/" });
	});

	await suite.test("with a path mounts the site there, however the slash is spelled", () => {
		for (const raw of ["https://user.github.io/repo", "https://user.github.io/repo/"]) {
			const config = withSiteUrl(raw, loadSiteConfig);
			assert.deepEqual(config, {
				siteUrl: "https://user.github.io/repo",
				host: "user.github.io",
				basePath: "/repo/",
			});
		}
	});

	await suite.test("still refuses what is not an https origin plus a path", () => {
		assert.throws(() => withSiteUrl("http://example.test/repo", loadSiteConfig), /https/);
		assert.throws(() => withSiteUrl("https://example.test/repo?x", loadSiteConfig), /query/);
		assert.throws(() => withSiteUrl("https://example.test:8443/repo", loadSiteConfig), /port/);
	});
});

test("a site mounted at /repo/", async (suite) => {
	const template = fs.readFileSync(path.join(PROJECT_DIR, "src", "index.html"), "utf8");
	const collectionData = loadCollectionData(PROJECT_DIR);

	await suite.test("names its images from the mount", () => {
		const comics: Comic[] = JSON.parse(exportComicsJson(PROJECT_DIR, collectionData, "/repo/"));
		const index: CollectionIndex = JSON.parse(generateCollectionIndex(collectionData, "/repo/"));
		// The strips are not in the repository, so their images may or may not be on disk; the covers are.
		for (const comic of comics) if (comic.image) assert.match(comic.image, /^\/repo\/assets\/comics\//);
		assert.ok(index.collections.length > 0);
		for (const collection of index.collections) assert.match(collection.image, /^\/repo\/assets\//);
	});

	await suite.test("links, fetches and unfurls from the mount", () => {
		mounted("/repo/", () => {
			const page: DetailPage = {
				view: "detail",
				date: "1986-07-07",
				alternates: [],
				comics: [{ date: "1986-07-07", transcript: "Hi.", image: "/repo/assets/comics/19860707.gif" }],
				rerunOf: null,
				prevDate: "1986-07-06",
				nextDate: "1986-07-08",
				collections: [],
				descriptions: {},
			};
			const document = buildDocumentHtml(template, page, {
				siteUrl: "https://user.github.io/repo",
				path: "/1986-07-07",
			});
			assert.match(document, /<link rel="stylesheet" href="\/repo\/index.css" \/>/);
			assert.match(document, /<script defer src="\/repo\/index.js"><\/script>/);
			assert.match(document, /<link rel="canonical" href="https:\/\/user.github.io\/repo\/1986-07-07" \/>/);
			assert.match(
				document,
				/<meta property="og:image" content="https:\/\/user.github.io\/repo\/assets\/comics\/19860707.gif" \/>/,
			);
			const view = buildDetailHtml(page, false);
			assert.match(view, /id="nav-prev" href="\/repo\/1986-07-06"/);
			assert.match(view, /id="nav-next" href="\/repo\/1986-07-08"/);
			assert.match(view, /data-href="\/repo\/1986-07-07"/);
			assert.match(view, /class="detail-home" href="\/repo\/"/);

			const rerun = buildDetailHtml({ ...page, comics: [], rerunOf: "1986-07-07", date: "1991-05-05" }, false);
			assert.match(rerun, /class="detail-rerun-link" href="\/repo\/1986-07-07" data-original-date="1986-07-07"/);
		});
	});
});
