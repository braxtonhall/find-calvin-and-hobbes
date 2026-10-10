import { Route } from "./types";
import { state } from "./state";
import { scrollCellIntoViewIfNeeded } from "./utils";
import { stopLife } from "./life";
import {
	HOME_PATH,
	LIBRARY_QUERIES,
	legacyHashPath,
	normalizePathname,
	parseRoutePath,
	redirectedPath,
} from "./routes";
import { addressOf, pathOf } from "./base-path";
import { Page, pageTitle } from "./pages/page";
import { PAGE_DATA_ID } from "./pages/shell";
import { detailPageFrom } from "./pages/detail";
import { collectionPageFrom } from "./pages/collection";
import { collectionsPageFrom } from "./pages/collections";
import { arcPageFrom } from "./pages/arc";
import { arcsPageFrom } from "./pages/arcs";
import { creatorPageFrom } from "./pages/creator";
import { creatorsPageFrom } from "./pages/creators";
import { renderLanding } from "./views/landing";
import { renderResults } from "./views/results";
import { renderDetail } from "./views/detail";
import { renderCollection } from "./views/collection";
import { renderCollections } from "./views/collections";
import { renderArc, renderArcs } from "./views/arcs";
import { renderCreator, renderCreators } from "./views/creators";
import { loadDescriptions } from "./details";
import { renderSettings } from "./views/settings";
import { renderLibrary, renderLibraryRows } from "./views/library";
import { LIBRARY_CHANGE_EVENT, closeRowMenu } from "./views/row-menu";
import { relightRows } from "./views/result-rows";
import { asksAboutReader } from "./boolean-query";
import { STRIP_QUERY, collectionQuery } from "./filter-query";
import { renderCredits } from "./views/credits";
import { closeFilterMenu } from "./views/filter-bar";
import { closeBookPopup } from "./views/books";
import { updateCorrectionLink } from "./views/correction";
import { cancelCollectionClear } from "./views/cell-highlight";
import { cellForDate, followRoute, paintGrid } from "./grid";

/** The views that are tabs of Collections, which share their header. */
const TAB_VIEWS: ReadonlySet<string> = new Set(["collections", "arcs", "creators"]);

export function parseRoute(): Route {
	let path = pathOf(location.pathname);
	// An address that has moved is shown as where it lives now, wherever the reader came to it from.
	const moved = path === null ? null : redirectedPath(normalizePathname(path));
	if (moved !== null) {
		replaceRoute(moved + location.search);
		path = moved;
	}
	const route = path === null ? null : parseRoutePath(path, location.search);
	if (route) return route;
	replaceRoute(HOME_PATH);
	return { view: "landing" };
}

/**
 * The primary button with no modifier held.
 *
 * A cmd-click, a shift-click or a middle-click is a request for a second tab or window, and the
 * thing under the cursor is a real link now, so the browser serves that request better than we can.
 */
export function isPlainClick(event: MouseEvent): boolean {
	return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

/**
 * Sends every in-app anchor through `navigate`, once, for the whole app.
 *
 * The anchors carry real hrefs so that cmd-click opens a comic in a new tab and right-click offers
 * to copy its address — the browser cannot do either for a `<div>` with a click handler. A plain
 * click has to be caught, though: left to the browser it would be a full page load, and the
 * destination would render from its own file with `history.state === null`, so `canGoBack` would
 * read a depth of 0 and the Back button there would render disabled.
 *
 * A root-relative href is the mark of one of ours: the skip link is `#main`, and everything
 * leaving the site is absolute.
 */
export function attachRouteLinkHandler(): void {
	document.addEventListener("click", (event) => {
		if (event.defaultPrevented) return;
		const link = (event.target as HTMLElement).closest<HTMLAnchorElement>('a[href^="/"]:not([href^="//"])');
		if (!link || !isPlainClick(event)) return;
		if (link.target !== "" && link.target !== "_self") return;
		if (link.hasAttribute("download")) return;
		if (navigateTo(link.href)) event.preventDefault();
	});
}

/**
 * Follows an address as an anchor spells it — `/prefix/1986-07-07?alternate=…` — and says whether
 * it was one of ours to follow. One outside the mount is left to the browser.
 */
export function navigateTo(href: string): boolean {
	const url = new URL(href, location.href);
	const path = pathOf(url.pathname);
	if (path === null) return false;
	navigate(path + url.search);
	return true;
}

interface HistoryState {
	depth: number;
}

function currentDepth(): number {
	const historyState = history.state as HistoryState | null;
	return typeof historyState?.depth === "number" ? historyState.depth : 0;
}

export function canGoBack(): boolean {
	return currentDepth() > 0;
}

/**
 * Settles the address the page was opened at.
 *
 * Three spellings can arrive here for one page: the one the links use, the one a static host
 * redirects to on the way to `index.html` (`/credits/`), and the old `#/credits`. All of them are
 * rewritten to the first so that what is in the bar is what a copy of it should say. The history
 * depth is kept: a reload arrives with the state of the entry it reloads. An address outside the
 * mount is not ours to tidy; `parseRoute` sends it home.
 */
export function markInitialHistoryEntry(): void {
	const legacy = legacyHashPath(location.hash);
	const path = legacy === null ? pathOf(location.pathname) : null;
	const url =
		legacy !== null
			? addressOf(legacy)
			: path !== null
				? addressOf(normalizePathname(path)) + location.search
				: location.pathname + location.search;
	history.replaceState({ depth: currentDepth() } satisfies HistoryState, "", url);
}

// The paths these take are the ones `routes.ts` builds, from the mount; the address bar gets the
// mount put back on.
export function replaceRoute(path: string): void {
	history.replaceState({ depth: currentDepth() } satisfies HistoryState, "", addressOf(path));
}

export function navigate(path: string): void {
	history.pushState({ depth: currentDepth() + 1 } satisfies HistoryState, "", addressOf(path));
	handleRoute();
}

export function replaceSearch(path: string): void {
	replaceRoute(path);
	handleRoute();
}

/**
 * Whether a query about the reader — what they own, bookmarked or noted — has to wait for this
 * browser's library before it can be answered. Drawn before IndexedDB answers, it would find nothing.
 */
function waitsForLibrary(query: string, language: "strip" | "collection"): boolean {
	return !state.bookmarksLoaded && asksAboutReader(query, language === "strip" ? STRIP_QUERY : collectionQuery());
}

/**
 * Whether a Collections tab has what its search needs: the archive, for which strips each collection
 * holds; their descriptions, which its words are found in too; and, for a query about the reader,
 * their library. A closed or empty search needs none of it.
 */
function tabReady(query: string | undefined): boolean {
	if (query === undefined || query.trim() === "") return true;
	if (!state.dataLoaded || waitsForLibrary(query, "collection")) return false;
	if (!state.descriptions) {
		void loadDescriptions().then(resumeRoute);
		return false;
	}
	return true;
}

/**
 * The page the app has the data to draw for a route, or `null` while that data is still loading.
 * The landing, credits and settings pages are made of nothing that has to be fetched.
 */
function pageFor(route: Route): Page | null {
	switch (route.view) {
		case "landing":
			return { view: "landing" };
		case "credits":
			return { view: "credits" };
		case "settings":
			return { view: "settings" };
		case "results":
			if (!state.dataLoaded || waitsForLibrary(route.q ?? "", "strip")) return null;
			return { view: "results", q: route.q ?? "", sort: route.sort ?? "rank" };
		case "bookmarks":
		case "bookshelf":
			if (!state.dataLoaded || waitsForLibrary(LIBRARY_QUERIES[route.view], "strip")) return null;
			return { view: route.view };
		case "detail":
			return state.dataLoaded ? detailPageFrom(state, route.date ?? "", route.alternates ?? []) : null;
		case "collection":
			return state.dataLoaded ? collectionPageFrom(state, route.id ?? "") : null;
		case "collections":
			return state.dataLoaded && tabReady(route.q) ? collectionsPageFrom(state, route.q) : null;
		case "arcs":
			return state.dataLoaded && tabReady(route.q) ? arcsPageFrom(state, route.q) : null;
		// The creators ship inside the script, so their pages need nothing fetched — but a search of
		// them is a search of their strips.
		case "creators":
			return tabReady(route.q) ? creatorsPageFrom(state, route.q) : null;
		case "creator":
			return creatorPageFrom(state, route.id ?? "");
		case "arc":
			if (!state.dataLoaded) return null;
			// The rows are the strips' descriptions, which arrive on their own; the spinner waits for
			// them rather than drawing rows that change under the reader.
			if (!state.descriptions) {
				void loadDescriptions().then(resumeRoute);
				return null;
			}
			return arcPageFrom(state, route.id ?? "");
	}
}

/**
 * Picks up after something the page was waiting on has arrived — the archive, or the bookmarks. A
 * route that was showing a spinner is drawn now; any other only needs the grid brought up to date.
 */
export function resumeRoute(): void {
	if (state.pendingRoute) {
		handleRoute();
	} else {
		updateGridState(parseRoute());
	}
}

/**
 * The page the build wrote into this document, if it wrote one. Read once, on boot; every later
 * route is drawn from the fetched archive.
 */
export function readPrerenderedPage(): Page | null {
	const script = document.getElementById(PAGE_DATA_ID);
	if (!script?.textContent) return null;
	try {
		return JSON.parse(script.textContent) as Page;
	} catch {
		return null;
	}
}

/**
 * Whether the page the build wrote is the page the address asks for — and if so whether its
 * markup can be kept as it stands, or has to be redrawn from the same data. The only thing that
 * forces a redraw is a `?alternate=` the build could not have known about.
 */
function servePrerendered(prerendered: Page, route: Route): { page: Page; adopt: boolean } | null {
	if (prerendered.view !== route.view) return null;
	switch (prerendered.view) {
		case "landing":
		case "credits":
		case "settings":
			return { page: prerendered, adopt: true };
		// The build writes each tab with its search closed.
		case "collections":
		case "arcs":
		case "creators":
			return route.q === undefined ? { page: prerendered, adopt: true } : null;
		// The rows are the reader's library, which the build cannot know.
		case "results":
		case "bookmarks":
		case "bookshelf":
			return null;
		case "detail": {
			if (prerendered.date !== route.date) return null;
			const alternates = route.alternates ?? [];
			const same =
				alternates.length === prerendered.alternates.length &&
				alternates.every((alternate, index) => alternate === prerendered.alternates[index]);
			return same ? { page: prerendered, adopt: true } : { page: { ...prerendered, alternates }, adopt: false };
		}
		case "collection":
		case "arc":
		case "creator":
			return prerendered.id === route.id ? { page: prerendered, adopt: true } : null;
	}
}

/**
 * Draws the page the address names.
 *
 * On boot the document may already hold that page, built by the build from the same data and the
 * same code that would draw it here; then `prerendered` is what the build embedded, and the view
 * is adopted — handlers attached, nothing redrawn — rather than replaced with a spinner until the
 * archive arrives.
 */
export function handleRoute(prerendered: Page | null = null): void {
	const route = parseRoute();

	const served = prerendered ? servePrerendered(prerendered, route) : null;
	const page = served?.page ?? pageFor(route);
	const adopt = served?.adopt ?? false;

	// Before the loading view can return early below: the link is chrome, and stale chrome would
	// send a correction about the page the reader came from. Whether a date is a rerun is only known
	// once there is a page; until then the link says less, and this runs again when the data lands.
	updateCorrectionLink(route.view, page?.view === "detail" && page.rerunOf !== null);

	const viewElement = document.getElementById(`view-${route.view}`)!;
	// Rather than typing on, or re-sorting, the page that was already showing.
	const arriving = !viewElement.classList.contains("active");
	// From one tab of Collections to another, the header is the same, so only the list under it fades
	// in. See `.view--tab-switch`.
	if (arriving) {
		const leaving = document.querySelector(".view.active");
		const switching = TAB_VIEWS.has(route.view) && leaving !== null && TAB_VIEWS.has(leaving.id.replace(/^view-/, ""));
		viewElement.classList.toggle("view--tab-switch", switching);
	}

	// The filter dropdowns float on the body, so hiding the view they hang from does not hide them.
	// Arriving at any view leaves them behind; staying on one with a search bar keeps whichever one
	// is open, because a search re-rendered on a keystroke comes through here too.
	if (arriving || route.view !== "results") closeFilterMenu();
	// A book's popup the same way, but on every page: any page with covers on it is drawn afresh, and
	// opens the popup again itself if its book is still selected.
	closeBookPopup();
	closeRowMenu();

	document.querySelectorAll(".view").forEach((element) => {
		if (element === viewElement) return;
		element.classList.remove("active");
		element.removeAttribute("style");
	});

	if (!page) {
		showLoadingView(viewElement, route);
		updateGridState(route);
		return;
	}

	state.pendingRoute = null;
	// The spinner's inline layout, if it was showing here. Left alone on an adopted view, whose
	// entrance animation is already running and should not be restarted.
	if (!adopt) viewElement.removeAttribute("style");
	viewElement.classList.add("active");

	switch (page.view) {
		case "landing": {
			renderLanding(adopt);
			break;
		}
		case "results": {
			renderResults(page.q, page.sort);
			document.getElementById("main")!.scrollTop = 0;
			break;
		}
		case "detail": {
			renderDetail(page, adopt);
			break;
		}
		case "collection": {
			renderCollection(page, adopt);
			document.getElementById("main")!.scrollTop = 0;
			break;
		}
		case "collections": {
			renderCollections(page, adopt, arriving);
			if (arriving) document.getElementById("main")!.scrollTop = 0;
			break;
		}
		case "arc": {
			renderArc(page, adopt);
			document.getElementById("main")!.scrollTop = 0;
			break;
		}
		case "arcs": {
			renderArcs(page, adopt, arriving);
			if (arriving) document.getElementById("main")!.scrollTop = 0;
			break;
		}
		case "creator": {
			renderCreator(page, adopt);
			document.getElementById("main")!.scrollTop = 0;
			break;
		}
		case "creators": {
			renderCreators(page, adopt, arriving);
			if (arriving) document.getElementById("main")!.scrollTop = 0;
			break;
		}
		case "bookmarks":
		case "bookshelf": {
			renderLibrary(page.view);
			document.getElementById("main")!.scrollTop = 0;
			break;
		}
		case "settings": {
			renderSettings(adopt);
			document.getElementById("main")!.scrollTop = 0;
			break;
		}
		case "credits": {
			renderCredits(adopt);
			document.getElementById("main")!.scrollTop = 0;
			break;
		}
	}

	document.title = pageTitle(page);
	updateGridState(route);
}

function showLoadingView(viewElement: HTMLElement, route: Route): void {
	viewElement.classList.add("active");
	viewElement.style.height = "100%";
	viewElement.style.display = "flex";
	viewElement.style.alignItems = "center";
	viewElement.style.justifyContent = "center";
	viewElement.innerHTML = '<div class="spinner"></div>';
	state.pendingRoute = route;
}

/**
 * A strip or a book bookmarked, owned or noted from a row's menu may come onto the page or leave it, where the
 * page's rows are a question about the reader. Only the rows are drawn again, and the grid lit to
 * match, so the page keeps its scroll.
 */
document.addEventListener(LIBRARY_CHANGE_EVENT, (event) => {
	const route = parseRoute();
	if (route.view === "results" && asksAboutReader(route.q ?? "", STRIP_QUERY)) {
		renderResults(route.q ?? "", route.sort ?? "rank");
	} else if (route.view === "bookmarks" || route.view === "bookshelf") {
		renderLibraryRows(route.view);
	} else if (route.view === "collections" && route.q && asksAboutReader(route.q, collectionQuery())) {
		renderCollections(collectionsPageFrom(state, route.q), false, false);
	} else {
		return;
	}
	paintGrid(route);
	relightRows((event as CustomEvent<{ byPointer: boolean }>).detail.byPointer);
});

export function updateGridState(route: Route): void {
	// Any page drawn, even one whose grid looks the same, ends a game of life — and a book's hover
	// still waiting to be cleared, which would otherwise undo the page's own lighting.
	stopLife();
	cancelCollectionClear();

	if (state.hoveredCell) {
		state.hoveredCell.classList.remove("cell--hover-highlight");
		state.hoveredCell = null;
	}

	document.querySelectorAll(".result-row--highlight").forEach((row) => row.classList.remove("result-row--highlight"));

	if (route.view === "landing") state.searchResultTiers = null;

	// The grid turns to the page holding what this one is about, if it is showing another.
	followRoute(route);

	paintGrid(route);

	if (route.view === "detail" && route.date) {
		const cell = cellForDate(route.date);
		if (cell) {
			setTimeout(() => {
				scrollCellIntoViewIfNeeded(cell);
			}, 50);
		}
	}
}
