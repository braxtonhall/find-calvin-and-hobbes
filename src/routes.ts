import { Route, SortMode, TabOrder } from "./types";
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

	// An empty `?q=` asks nothing, the same as none. See `buildTabPath`.
	const q = params.get("q");
	// And a tab's order the same way: date order, the default, is no parameter at all.
	const tabParams = { ...(q ? { q } : {}), ...(params.get("sort") === "count" ? { order: "count" as const } : {}) };

	if (path === BOOKS_PATH || path === COLLECTIONS_PATH) {
		return { view: "collections", ...tabParams };
	}

	// A site without arcs has none of their addresses, so they go home like any other.
	const arcMatch = path.match(/^\/arc\/([a-z0-9]+)$/);
	if (arcMatch && PAGE_CONFIG.arcs) {
		return { view: "arc", id: arcMatch[1] };
	}

	if (path === ARCS_PATH && PAGE_CONFIG.arcs) {
		return { view: "arcs", ...tabParams };
	}

	// Creators the same way, on a site without them.
	const creatorMatch = path.match(/^\/creator\/([a-z0-9]+)$/);
	if (creatorMatch && PAGE_CONFIG.creators) {
		return { view: "creator", id: creatorMatch[1] };
	}

	if (path === CREATORS_PATH && PAGE_CONFIG.creators) {
		return { view: "creators", ...tabParams };
	}

	// And subjects.
	const subjectMatch = path.match(/^\/subject\/([a-z0-9]+)$/);
	if (subjectMatch && PAGE_CONFIG.subjects) {
		return { view: "subject", id: subjectMatch[1] };
	}

	if (path === SUBJECTS_PATH && PAGE_CONFIG.subjects) {
		return { view: "subjects", ...tabParams };
	}

	if (path === SETTINGS_PATH) {
		return { view: "settings" };
	}

	if (path === BOOKMARKS_PATH) {
		return { view: "bookmarks" };
	}

	if (path === BOOKSHELF_PATH) {
		return { view: "bookshelf" };
	}

	if (path === BOOKSHELF_CLIPPINGS_PATH) {
		return { view: "bookshelf-clippings" };
	}

	if (path === BOOKSHELF_BOOKS_PATH) {
		return { view: "bookshelf-books" };
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

/**
 * The pages of the reader's own library that list strips, each a search that is always the same one,
 * with no box to change it.
 */
export type LibraryView = "bookmarks" | "bookshelf" | "bookshelf-clippings";

export const LIBRARY_QUERIES: Record<LibraryView, string> = {
	bookmarks: "@i:bookmarked",
	// The strips they own, and the strips in the books they own.
	bookshelf: "@i:own @or @in @i:own",
	// The strips they own on their own, cut from a paper.
	"bookshelf-clippings": "@i:own",
};

export function isLibraryView(view: string): view is LibraryView {
	return Object.hasOwn(LIBRARY_QUERIES, view);
}

/** The books on the reader's shelf: a search of the books, as a Collections tab's is. */
export const BOOKSHELF_BOOKS_QUERY = "@i:own";

/**
 * The tabs of the Bookshelf, in the order they are shown, each a page of its own. All — every strip
 * they own, in a clipping or a book — is the Bookshelf's own address, and the one it opens on.
 */
export type BookshelfTab = "all" | "clippings" | "books";

export type BookshelfView = "bookshelf" | "bookshelf-clippings" | "bookshelf-books";

export const BOOKSHELF_TABS: Record<BookshelfTab, { view: BookshelfView; path: string }> = {
	all: { view: "bookshelf", path: "/bookshelf" },
	clippings: { view: "bookshelf-clippings", path: "/bookshelf/clippings" },
	books: { view: "bookshelf-books", path: "/bookshelf/books" },
};

export function isBookshelfView(view: string): view is BookshelfView {
	return Object.values(BOOKSHELF_TABS).some((tab) => tab.view === view);
}

/** The tabs of Collections. */
export type CollectionsTab = "books" | "arcs" | "creators" | "subjects";

const TAB_PATHS: Record<CollectionsTab, string> = {
	books: "/books",
	arcs: "/arcs",
	creators: "/creators",
	subjects: "/subjects",
};

/**
 * A tab of Collections, with `query` in its search box — or, given none or an empty one, the whole
 * tab — in `order`. Date order is the default, so only `?sort=count` is ever written.
 */
export function buildTabPath(tab: CollectionsTab, query?: string, order: TabOrder = "date"): string {
	const params = [...(query ? ["q=" + encodeURIComponent(query)] : []), ...(order === "count" ? ["sort=count"] : [])];
	return TAB_PATHS[tab] + (params.length > 0 ? "?" + params.join("&") : "");
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

export function buildSubjectPath(subjectId: string): string {
	return "/subject/" + subjectId;
}

/** The tabs of Collections: the books, the arcs, the creators, and the subjects. */
export const BOOKS_PATH = "/books";
export const ARCS_PATH = "/arcs";
export const CREATORS_PATH = "/creators";
export const SUBJECTS_PATH = "/subjects";

/**
 * Where Collections used to be a list of books alone. It is the books tab now, and the address is
 * kept for the links that still name it: it parses to the books, and `redirectedPath` puts the
 * books' own address in the bar.
 */
export const COLLECTIONS_PATH = "/collections";
export const SETTINGS_PATH = "/settings";
export const BOOKMARKS_PATH = "/bookmarks";
export const BOOKSHELF_PATH = BOOKSHELF_TABS.all.path;
export const BOOKSHELF_CLIPPINGS_PATH = BOOKSHELF_TABS.clippings.path;
export const BOOKSHELF_BOOKS_PATH = BOOKSHELF_TABS.books.path;
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
