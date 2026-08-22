import { Route, SortMode } from "./types";
import { state } from "./state";
import { scrollCellIntoViewIfNeeded } from "./utils";
import { renderLanding } from "./views/landing";
import { renderResults } from "./views/results";
import { renderDetail } from "./views/detail";
import { renderCollection } from "./views/collection";
import { renderCredits } from "./views/credits";
import { closeFilterMenu } from "./views/filter-bar";

export function parseRoute(): Route {
	const hash = location.hash;
	if (!hash || hash === "#/" || hash === "#") return { view: "landing" };

	const noHash = hash.startsWith("#") ? hash.slice(1) : hash;

	const searchMatch = noHash.match(/^\/search\?(.*)$/);
	if (searchMatch) {
		const params = new URLSearchParams(searchMatch[1]);
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

	const comicMatch = noHash.match(/^\/comic\/(\d{4}-\d{2}-\d{2})$/);
	if (comicMatch) {
		return { view: "detail", date: comicMatch[1] };
	}

	const collectionMatch = noHash.match(/^\/collection\/([a-z0-9]+)$/);
	if (collectionMatch) {
		return { view: "collection", id: collectionMatch[1] };
	}

	if (noHash === "/credits") {
		return { view: "credits" };
	}

	replaceRoute("#/");
	return { view: "landing" };
}

// A link that names no sort is a link to the ranked results, so the parameter only appears on
// the way to date order. An older `&sort=rank` link still parses to the same place it always did.
export function buildSearchHash(query: string, sort: SortMode = "rank"): string {
	return "#/search?q=" + encodeURIComponent(query) + (sort === "date" ? "&sort=date" : "");
}

export function buildComicHash(date: string): string {
	return "#/comic/" + date;
}

export function buildCollectionHash(collectionId: string): string {
	return "#/collection/" + collectionId;
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
 * to copy its address — the browser cannot do either for a `<div>` with a click handler. This is
 * what stops a plain click from being handled natively, and it has to, twice over: a native hash
 * navigation lands with `history.state === null`, so `canGoBack` reads a depth of 0 and the Back
 * button on the destination renders disabled, and the render would run from `hashchange` rather
 * than from us.
 *
 * `#/` is the prefix every route shares and no other anchor on the page has: the skip link is
 * `#main`, and everything leaving the site is absolute.
 */
export function attachRouteLinkHandler(): void {
	document.addEventListener("click", (event) => {
		if (event.defaultPrevented) return;
		const link = (event.target as HTMLElement).closest<HTMLAnchorElement>('a[href^="#/"]');
		if (!link || !isPlainClick(event)) return;
		if (link.target !== "" && link.target !== "_self") return;
		// `getAttribute` rather than `.href`, which resolves to an absolute URL — `navigate` puts the
		// pathname back on itself.
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

export function markInitialHistoryEntry(): void {
	if (history.state === null) {
		history.replaceState({ depth: 0 } satisfies HistoryState, "", window.location.pathname + window.location.hash);
	}
}

export function replaceRoute(hash: string): void {
	history.replaceState({ depth: currentDepth() } satisfies HistoryState, "", window.location.pathname + hash);
}

export function navigate(hash: string): void {
	history.pushState({ depth: currentDepth() + 1 } satisfies HistoryState, "", window.location.pathname + hash);
	handleRoute();
}

export function replaceSearch(hash: string): void {
	replaceRoute(hash);
	handleRoute();
}

export function handleRoute(): void {
	const route = parseRoute();

	document.querySelectorAll(".view").forEach((viewElement) => {
		viewElement.classList.remove("active");
		viewElement.removeAttribute("style");
	});

	// The filter dropdowns float on the body, so hiding the results view does not hide them. Every
	// other route leaves them behind; the results view keeps whichever one is open, because a search
	// re-rendered on a keystroke comes through here too.
	if (route.view !== "results") closeFilterMenu();

	if (!state.dataLoaded && route.view !== "landing") {
		showLoadingView(route);
		updateGridState(route);
		return;
	}

	state.pendingRoute = null;

	switch (route.view) {
		case "landing": {
			document.getElementById("view-landing")!.classList.add("active");
			renderLanding();
			document.title = "Find Calvin and Hobbes";
			break;
		}
		case "results": {
			document.getElementById("view-results")!.classList.add("active");
			renderResults(route.q || "", route.sort || "rank");
			document.getElementById("main")!.scrollTop = 0;
			document.title = `${route.q} — Find Calvin and Hobbes`;
			break;
		}
		case "detail": {
			document.getElementById("view-detail")!.classList.add("active");
			renderDetail(route.date || "");
			document.title = `${route.date} — Find Calvin and Hobbes`;
			break;
		}
		case "collection": {
			document.getElementById("view-collection")!.classList.add("active");
			renderCollection(route.id || "");
			break;
		}
		case "credits": {
			document.getElementById("view-credits")!.classList.add("active");
			renderCredits();
			document.getElementById("main")!.scrollTop = 0;
			document.title = "Credits — Find Calvin and Hobbes";
			break;
		}
	}

	updateGridState(route);
}

function showLoadingView(route: Route): void {
	const viewElement = document.getElementById(`view-${route.view}`)!;
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
