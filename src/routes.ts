import { Route, SortMode } from "./types";

/**
 * The site's addresses, as strings. Nothing in here touches the DOM or `location`, so the build
 * can use it to decide which files to write and what to link them with, and the router can use it
 * to read the address bar. The two agree because there is only this.
 *
 * Every route has a real file behind it (`1986-07-07.html`), so a cold load needs no host
 * configuration. Hosts differ in how they spell the address they serve it at — some add a
 * trailing slash, some show the `.html` — and `normalizePathname` folds those spellings back into
 * the one the links use.
 */

export const SITE_NAME = "Find Calvin and Hobbes";

export function normalizePathname(pathname: string): string {
	const trimmed = pathname
		.replace(/\/index\.html$/, "/")
		.replace(/\.html$/, "")
		.replace(/\/+$/, "");
	return trimmed === "" ? "/" : trimmed;
}

/** `null` for an address that is not one of ours, which the router sends home. */
export function parseRoutePath(pathname: string, search: string): Route | null {
	const path = normalizePathname(pathname);
	const params = new URLSearchParams(search);

	if (path === "/") return { view: "landing" };

	if (path === "/search") {
		return {
			view: "results",
			q: params.get("q") ?? "",
			// Relevance is the default and `?sort=date` is the alternative. Date order has no
			// ranking in it, so the coverage bar is the only thing keeping a weak match out of
			// the top of the page: `ding dong rosalyn` led with a strip about a ping-pong ball,
			// which is one edit from `ding dong` and nothing to do with the query.
			sort: params.get("sort") === "date" ? "date" : "rank",
		};
	}

	const comicMatch = path.match(/^\/(\d{4}-\d{2}-\d{2})$/);
	if (comicMatch) {
		return { view: "detail", date: comicMatch[1], alternates: params.getAll("alternate") };
	}

	const collectionMatch = path.match(/^\/collection\/([a-z0-9]+)$/);
	if (collectionMatch) {
		return { view: "collection", id: collectionMatch[1] };
	}

	if (path === COLLECTIONS_PATH) {
		return { view: "collections" };
	}

	if (path === "/credits") {
		return { view: "credits" };
	}

	return null;
}

// A link that names no sort is a link to the ranked results, so the parameter only appears on
// the way to date order. An older `&sort=rank` link still parses to the same place it always did.
export function buildSearchPath(query: string, sort: SortMode = "rank"): string {
	return "/search?q=" + encodeURIComponent(query) + (sort === "date" ? "&sort=date" : "");
}

export function buildComicPath(date: string, alternates: string[] = []): string {
	const params = alternates.map((alternate) => "alternate=" + encodeURIComponent(alternate)).join("&");
	return "/" + date + (params ? "?" + params : "");
}

export function buildCollectionPath(collectionId: string): string {
	return "/collection/" + collectionId;
}

export const COLLECTIONS_PATH = "/collections";
export const CREDITS_PATH = "/credits";
export const HOME_PATH = "/";

/**
 * The site used to live behind `#/`, and those addresses are in bookmarks and old messages. A cold
 * load of one lands on the home page with the hash intact; this reads it and names the page it
 * meant, so the router can replace the address rather than show the wrong page.
 */
export function legacyHashPath(hash: string): string | null {
	if (!hash.startsWith("#/")) return null;
	const legacy = hash.slice(1);
	if (legacy === "/") return HOME_PATH;
	if (legacy === "/credits") return CREDITS_PATH;
	const search = legacy.match(/^\/search\?(.*)$/);
	if (search) return "/search?" + search[1];
	const comic = legacy.match(/^\/comic\/(\d{4}-\d{2}-\d{2})(\?.*)?$/);
	if (comic) return "/" + comic[1] + (comic[2] ?? "");
	const collection = legacy.match(/^\/collection\/([a-z0-9]+)$/);
	if (collection) return buildCollectionPath(collection[1]);
	return HOME_PATH;
}
