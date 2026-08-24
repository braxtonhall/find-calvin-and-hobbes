import type { Compiler, Compilation } from "webpack";
import { sources } from "webpack";
import { loadSiteConfig } from "./siteConfig";
import { renderCollectionHtml, renderCreditsHtml, renderLandingHtml } from "../src/renderers/page-html";
import { renderDetailHtml } from "../src/renderers/detail-html";
import type { CollectionIndex, Comic } from "../src/types";

const PLUGIN_NAME = "RoutePagesPlugin";

function dateLabel(date: string): string {
	const [year, month, day] = date.split("-").map(Number);
	return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-US", {
		weekday: "long",
		year: "numeric",
		month: "long",
		day: "numeric",
		timeZone: "UTC",
	});
}

function pagePath(date: string): string {
	return `/comics/${date.slice(0, 4)}/${date.slice(5, 7)}/${date.slice(8, 10)}/`;
}

function activate(shell: string, view: string, content: string, title: string, extras = ""): string {
	let page = shell
		.replace(/class="view active"/g, 'class="view"')
		.replace("<title>Find Calvin and Hobbes</title>", `<title>${title}</title>`);
	page = page.replace(
		new RegExp(`<div id="view-${view}" class="view(?: active)?"></div>`),
		`<div id="view-${view}" class="view active">${content}</div>`,
	);
	page = page.replace("</head>", `${extras}</head>`);
	return page.replace("</body>", `${extras.includes("initial-data") ? "" : ""}</body>`);
}

class RoutePagesPlugin {
	apply(compiler: Compiler): void {
		compiler.hooks.thisCompilation.tap(PLUGIN_NAME, (compilation: Compilation) => {
			compilation.hooks.processAssets.tap(
				{ name: PLUGIN_NAME, stage: compiler.webpack.Compilation.PROCESS_ASSETS_STAGE_SUMMARIZE },
				(assets) => {
					const shell = assets["index.html"]?.source().toString();
					if (!shell) throw new Error("RoutePagesPlugin requires index.html");
					const comics = JSON.parse(assets["comics.json"].source().toString()) as Comic[];
					const descriptions = new Map<string, string>(
						Object.entries(JSON.parse(assets["descriptions.json"].source().toString())),
					);
					const collectionIndex = JSON.parse(assets["collection-index.json"].source().toString()) as CollectionIndex;
					const byDate = new Map<string, Comic[]>();
					for (const comic of comics) byDate.set(comic.date, [...(byDate.get(comic.date) || []), comic]);
					const base = loadSiteConfig()?.basePath ?? "/";
					const route = (path: string) =>
						base.replace(/\/$/, "") + (path === "/" ? "/" : path + (path.endsWith("/") ? "" : "/"));
					const emit = (path: string, html: string) => compilation.emitAsset(path, new sources.RawSource(html));
					const pageCollectionIndex: CollectionIndex = {
						...collectionIndex,
						collections: collectionIndex.collections.map((collection) => ({
							...collection,
							image: collection.image ? route("/" + collection.image).replace(/\/$/, "") : collection.image,
						})),
					};

					compilation.updateAsset(
						"index.html",
						new sources.RawSource(
							activate(shell, "landing", renderLandingHtml(route("/credits")), "Find Calvin and Hobbes"),
						),
					);
					emit(
						"credits/index.html",
						activate(
							shell,
							"credits",
							renderCreditsHtml(route("/")),
							"Credits — Find Calvin and Hobbes",
							'<script id="initial-data" type="application/json">{}</script>',
						),
					);
					emit("search/index.html", shell);
					for (const collection of pageCollectionIndex.collections) {
						const count = comics.filter((comic) =>
							comic.appearances?.some((appearance) => appearance.collection === collection.id),
						).length;
						const data = `<script id="initial-data" type="application/json">${JSON.stringify({ collectionIndex: pageCollectionIndex })}</script>`;
						emit(
							`collection/${collection.id}/index.html`,
							activate(
								shell,
								"collection",
								renderCollectionHtml(collection, pageCollectionIndex, count, route("/")),
								`${collection.name} — Find Calvin and Hobbes`,
								data,
							),
						);
					}

					const dates = [...byDate.keys()].sort();
					for (const [index, date] of dates.entries()) {
						const previous = dates[index - 1] ? route(pagePath(dates[index - 1])) : null;
						const next = dates[index + 1] ? route(pagePath(dates[index + 1])) : null;
						const dateFormatted = dateLabel(date);
						const pageComics = byDate.get(date)!;
						const pageComicsForHtml = pageComics.map((comic) => ({
							...comic,
							image: comic.image ? route("/" + comic.image).replace(/\/$/, "") : comic.image,
						}));
						const collectionIds = new Set(
							pageComics.flatMap((comic) => (comic.appearances || []).map((appearance) => appearance.collection)),
						);
						const comicCollectionIndex = {
							collections: pageCollectionIndex.collections.filter((collection) => collectionIds.has(collection.id)),
						};
						const content = renderDetailHtml({
							date,
							dateFormatted,
							isSunday: new Date(`${date}T00:00:00Z`).getUTCDay() === 0,
							comics: pageComicsForHtml,
							descriptions,
							collectionIndex: comicCollectionIndex,
							collectionsById: new Map(
								comicCollectionIndex.collections.map((collection) => [collection.id, collection]),
							),
							homeHref: route("/"),
							backHtml: '<span class="detail-back detail-back--disabled">&larr; Back</span>',
							copyHref: route(pagePath(date)),
							previousHref: previous,
							nextHref: next,
							collectionHref: (id) => route(`/collection/${id}`),
						});
						const image = pageComics.find((comic) => comic.image)?.image;
						const imageMeta = image
							? '<meta property="og:image" content="' + route("/" + image).replace(/\/$/, "") + '" />'
							: "";
						const extras =
							'<meta property="og:title" content="' +
							dateFormatted.replace(/"/g, "&quot;") +
							'" /><meta property="og:description" content="' +
							pageComics[0].transcript.replace(/"/g, "&quot;") +
							'" />' +
							imageMeta +
							'<link rel="canonical" href="' +
							route(pagePath(date)) +
							'" /><script id="initial-data" type="application/json">' +
							JSON.stringify({ comics: pageComics, collectionIndex: comicCollectionIndex }) +
							"</script>";
						emit(
							`comics/${date.slice(0, 4)}/${date.slice(5, 7)}/${date.slice(8, 10)}/index.html`,
							activate(shell, "detail", content, `${dateFormatted} — Find Calvin and Hobbes`, extras),
						);
					}
					emit("404.html", shell);
					emit("not_found.html", shell);
				},
			);
		});
	}
}

export default RoutePagesPlugin;
