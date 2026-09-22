import fs from "fs";
import path from "path";
import type { Compiler, Compilation } from "webpack";
import { sources } from "webpack";
import { Collection, Comic } from "../src/types";
import { computeDays } from "../src/days";
import { buildCollectionPath, buildComicPath, CREDITS_PATH, HOME_PATH } from "../src/routes";
import { Page, PageSource } from "../src/pages/page";
import { detailPageFrom } from "../src/pages/detail";
import { collectionPageFrom } from "../src/pages/collection";
import { buildDocumentHtml } from "../src/pages/shell";
import { getSiteData, SiteData } from "./siteData";
import { loadPageLayout, loadSiteConfig, pageAssetPath } from "./siteConfig";
import { buildSitemapXml } from "./sitemap";

const PLUGIN_NAME = "PagesPlugin";

/** The address `/search?q=…` is served from; the rows are the app's to draw. */
const SEARCH_PATH = "/search";

/**
 * The app's `state`, as the build sees it: the same maps the app fills from the fetched JSON,
 * filled from the same JSON before it is written.
 */
function buildPageSource(data: SiteData): PageSource {
	const comicsByDate = new Map<string, Comic[]>();
	for (const comic of data.comics) {
		if (!comicsByDate.has(comic.date)) comicsByDate.set(comic.date, []);
		comicsByDate.get(comic.date)!.push(comic);
	}
	const collectionsById = new Map<string, Collection>();
	for (const collection of data.collectionIndex.collections) {
		collectionsById.set(collection.id, collection);
	}
	return {
		comicsByDate,
		allDays: computeDays(),
		collectionIndex: data.collectionIndex,
		collectionsById,
		descriptions: new Map(Object.entries(data.descriptions)),
	};
}

/**
 * Writes one HTML file per address the site has, each holding its page as the app would draw it
 * and the data the app would draw it from. A cold load of any address then paints without
 * JavaScript, unfurls with its own title and preview when the link is shared, and — once the
 * script runs — is taken over in place rather than redrawn.
 *
 * The home page is also written as `404.html` and `not_found.html`, which is where GitHub Pages
 * and Neocities respectively send an address that has no file; the app reads the address and
 * takes it from there. Where the other files go is `PAGE_LAYOUT`'s call — see `siteConfig.ts`.
 *
 * When the site's URL is known, `sitemap.xml` is written too, listing the pages a crawler should
 * start from — see `sitemap.ts` for which those are.
 */
class PagesPlugin {
	constructor(private readonly templatePath: string) {}

	apply(compiler: Compiler): void {
		const templatePath = this.templatePath;

		compiler.hooks.thisCompilation.tap(PLUGIN_NAME, (compilation: Compilation) => {
			compilation.fileDependencies.add(templatePath);
			compilation.fileDependencies.add(path.join(process.cwd(), ".env"));

			compilation.hooks.processAssets.tap(
				{
					name: PLUGIN_NAME,
					// After `YamlToJsonPlugin` has emitted the archive, which is what these are built from.
					stage: compiler.webpack.Compilation.PROCESS_ASSETS_STAGE_SUMMARIZE,
				},
				() => {
					const data = getSiteData(compilation);
					const source = buildPageSource(data);
					const template = fs.readFileSync(templatePath, "utf8");
					const siteUrl = loadSiteConfig()?.siteUrl ?? "";
					const layout = loadPageLayout();

					const emit = (assetPath: string, routePath: string, page: Page) => {
						const html = buildDocumentHtml(template, page, { siteUrl, path: routePath });
						compilation.emitAsset(assetPath, new sources.RawSource(html));
					};
					const emitPage = (routePath: string, page: Page) => emit(pageAssetPath(routePath, layout), routePath, page);

					const landing: Page = { view: "landing" };
					emitPage(HOME_PATH, landing);
					emit("404.html", HOME_PATH, landing);
					emit("not_found.html", HOME_PATH, landing);

					emitPage(CREDITS_PATH, { view: "credits" });
					emitPage(SEARCH_PATH, { view: "results", q: "", sort: "rank" });

					const collectionPaths: string[] = [];
					for (const collection of data.collectionIndex.collections) {
						const routePath = buildCollectionPath(collection.id);
						collectionPaths.push(routePath);
						emitPage(routePath, collectionPageFrom(source, collection.id));
					}

					for (const date of source.comicsByDate.keys()) {
						emitPage(buildComicPath(date), detailPageFrom(source, date));
					}

					if (siteUrl) {
						const sitemap = buildSitemapXml(siteUrl, [HOME_PATH, CREDITS_PATH, ...collectionPaths]);
						compilation.emitAsset("sitemap.xml", new sources.RawSource(sitemap));
					}
				},
			);
		});
	}
}

export default PagesPlugin;
