import { Route, SortMode } from "./types";
import { PAGE_CONFIG } from "./site-config";

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

	// Relevance is the default and `?sort=date` is the alternative. Date order has no ranking in it,
	// so the coverage bar is the only thing keeping a weak match out of the top of the page:
	// `ding dong rosalyn` led with a strip about a ping-pong ball, which is one edit from `ding dong`
	// and nothing to do with the query.
	const sort: SortMode = params.get("sort") === "date" ? "date" : "rank";

	if (path === "/search") {
		return { view: "results", q: params.get("q") ?? "", sort };
	}

	const comicMatch = path.match(/^\/(\d{4}-\d{2}-\d{2})$/);
	if (comicMatch) {
		return { view: "detail", date: comicMatch[1], alternates: params.getAll("alternate") };
	}

	// A book is still a "collection" to the code; only its address says book. The old
	// `/collection/…` addresses are not ours any more, and go home like any other.
	const collectionMatch = path.match(/^\/book\/([a-z0-9]+)$/);
	if (collectionMatch) {
		return { view: "collection", id: collectionMatch[1] };
	}

	// A tab's search is open wherever the address has a `?q=`, even an empty one. See `buildTabPath`.
	const q = params.get("q");
	const searched = q === null ? {} : { q };

	if (path === BOOKS_PATH || path === COLLECTIONS_PATH) {
		return { view: "collections", ...searched };
	}

	// A site without arcs has none of their addresses, so they go home like any other.
	const arcMatch = path.match(/^\/arc\/([a-z0-9]+)$/);
	if (arcMatch && PAGE_CONFIG.arcs) {
		return { view: "arc", id: arcMatch[1] };
	}

	if (path === ARCS_PATH && PAGE_CONFIG.arcs) {
		return { view: "arcs", ...searched };
	}

	// Creators the same way, on a site without them.
	const creatorMatch = path.match(/^\/creator\/([a-z0-9]+)$/);
	if (creatorMatch && PAGE_CONFIG.creators) {
		return { view: "creator", id: creatorMatch[1] };
	}

	if (path === CREATORS_PATH && PAGE_CONFIG.creators) {
		return { view: "creators", ...searched };
	}

	if (path === SETTINGS_PATH) {
		return { view: "settings" };
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

/** The tabs of Collections. */
export type CollectionsTab = "books" | "arcs" | "creators";

const TAB_PATHS: Record<CollectionsTab, string> = { books: "/books", arcs: "/arcs", creators: "/creators" };

/**
 * A tab of Collections, with its search box open on `query` — or, given none, closed. An open box
 * with nothing typed in it yet is `?q=` alone, so that it stays open on the way to another tab.
 */
export function buildTabPath(tab: CollectionsTab, query?: string): string {
	return TAB_PATHS[tab] + (query === undefined ? "" : "?q=" + encodeURIComponent(query));
}

export function buildComicPath(date: string, alternates: string[] = []): string {
	const params = alternates.map((alternate) => "alternate=" + encodeURIComponent(alternate)).join("&");
	return "/" + date + (params ? "?" + params : "");
}

export function buildCollectionPath(collectionId: string): string {
	return "/book/" + collectionId;
}

export function buildArcPath(arcId: string): string {
	return "/arc/" + arcId;
}

export function buildCreatorPath(creatorId: string): string {
	return "/creator/" + creatorId;
}

/** The tabs of Collections: the books, the arcs, and the creators. */
export const BOOKS_PATH = "/books";
export const ARCS_PATH = "/arcs";
export const CREATORS_PATH = "/creators";

/**
 * Where Collections used to be a list of books alone. It is the books tab now, and the address is
 * kept for the links that still name it: it parses to the books, and `redirectedPath` puts the
 * books' own address in the bar.
 */
export const COLLECTIONS_PATH = "/collections";
export const SETTINGS_PATH = "/settings";
export const CREDITS_PATH = "/credits";
export const HOME_PATH = "/";

/** The address an old one now lives at, or `null` for one that has not moved. */
export function redirectedPath(path: string): string | null {
	return path === COLLECTIONS_PATH ? BOOKS_PATH : null;
}

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
