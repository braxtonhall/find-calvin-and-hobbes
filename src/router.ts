import { Route } from "./types";
import { state } from "./state";
import { scrollCellIntoViewIfNeeded } from "./utils";
import { HOME_PATH, legacyHashPath, normalizePathname, parseRoutePath } from "./routes";
import { Page, pageTitle } from "./pages/page";
import { PAGE_DATA_ID } from "./pages/shell";
import { detailPageFrom } from "./pages/detail";
import { collectionPageFrom } from "./pages/collection";
import { renderLanding } from "./views/landing";
import { renderResults } from "./views/results";
import { renderDetail } from "./views/detail";
import { renderCollection } from "./views/collection";
import { renderCredits } from "./views/credits";
import { closeFilterMenu } from "./views/filter-bar";

export function parseRoute(): Route {
	const route = parseRoutePath(location.pathname, location.search);
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
		// `getAttribute` rather than `.href`, which resolves to an absolute URL.
		event.preventDefault();
		navigate(link.getAttribute("href")!);
	});
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
 * depth is kept: a reload arrives with the state of the entry it reloads.
 */
export function markInitialHistoryEntry(): void {
	const legacy = legacyHashPath(location.hash);
	const url = legacy ?? normalizePathname(location.pathname) + location.search;
	history.replaceState({ depth: currentDepth() } satisfies HistoryState, "", url);
}

export function replaceRoute(path: string): void {
	history.replaceState({ depth: currentDepth() } satisfies HistoryState, "", path);
}

export function navigate(path: string): void {
	history.pushState({ depth: currentDepth() + 1 } satisfies HistoryState, "", path);
	handleRoute();
}

export function replaceSearch(path: string): void {
	replaceRoute(path);
	handleRoute();
}

/**
 * The page the app has the data to draw for a route, or `null` while that data is still loading.
 * The landing and credits pages are made of nothing that has to be fetched.
 */
function pageFor(route: Route): Page | null {
	switch (route.view) {
		case "landing":
			return { view: "landing" };
		case "credits":
			return { view: "credits" };
		case "results":
			return state.dataLoaded ? { view: "results", q: route.q ?? "", sort: route.sort ?? "rank" } : null;
		case "detail":
			return state.dataLoaded ? detailPageFrom(state, route.date ?? "", route.alternates ?? []) : null;
		case "collection":
			return state.dataLoaded ? collectionPageFrom(state, route.id ?? "") : null;
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
			return { page: prerendered, adopt: true };
		case "results":
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

	// The filter dropdowns float on the body, so hiding the results view does not hide them. Every
	// other route leaves them behind; the results view keeps whichever one is open, because a search
	// re-rendered on a keystroke comes through here too.
	if (route.view !== "results") closeFilterMenu();

	const served = prerendered ? servePrerendered(prerendered, route) : null;
	const page = served?.page ?? pageFor(route);
	const adopt = served?.adopt ?? false;

	const viewElement = document.getElementById(`view-${route.view}`)!;
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

export function updateGridState(route: Route): void {
	if (state.hoveredCell) {
		state.hoveredCell.classList.remove("cell--hover-highlight");
		state.hoveredCell = null;
	}

	document.querySelectorAll(".result-row--highlight").forEach((row) => row.classList.remove("result-row--highlight"));

	const allCells = document.querySelectorAll(".cell");
	for (const cell of allCells) {
		cell.classList.remove(
			"cell--search-match",
			"cell--search-nonmatch",
			"cell--search-t1",
			"cell--search-t2",
			"cell--search-t3",
			"cell--search-t4",
			"cell--search-t5",
			"cell--selected",
			"cell--bookmarked",
		);
	}

	for (const cell of allCells) {
		const date = (cell as HTMLElement).dataset.date;
		if (date && state.bookmarkedDates.has(date)) {
			cell.classList.add("cell--bookmarked");
		}
	}

	if (route.view === "landing") {
		state.searchResultTiers = null;
		return;
	}

	if (route.view === "results") {
		if (!state.searchResultTiers) return;
		for (const cell of allCells) {
			const date = (cell as HTMLElement).dataset.date;
			const tier = date ? state.searchResultTiers.get(date) : undefined;
			if (tier !== undefined) {
				cell.classList.add("cell--search-match", `cell--search-t${tier}`);
			} else {
				cell.classList.add("cell--search-nonmatch");
			}
		}
		return;
	}

	if (route.view === "detail") {
		const cell = document.querySelector(`.cell[data-date="${route.date}"]`);
		if (cell) {
			cell.classList.add("cell--selected");
			setTimeout(() => {
				scrollCellIntoViewIfNeeded(cell as HTMLElement);
			}, 50);
		}
		return;
	}

	if (route.view === "collection" && state.collectionDateSet) {
		for (const cell of allCells) {
			const date = (cell as HTMLElement).dataset.date;
			if (date && state.collectionDateSet.has(date)) {
				cell.classList.add("cell--search-match");
			} else {
				cell.classList.add("cell--search-nonmatch");
			}
		}
		return;
	}
}
