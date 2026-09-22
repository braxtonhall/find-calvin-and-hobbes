import "./styles/base.css";
import "./styles/components.css";

import { getBookmarkedDates } from "./bookmarks";
import { registerVocabulary } from "./filter-vocabulary";
import { state } from "./state";
import { buildGridData, renderGrid, loadComicData } from "./grid";
import {
	attachRouteLinkHandler,
	handleRoute,
	markInitialHistoryEntry,
	navigate,
	navigateTo,
	parseRoute,
	readPrerenderedPage,
} from "./router";
import { HOME_PATH, buildComicPath } from "./routes";
import { getSameDayComicDate } from "./pages/detail";

async function initialize(): Promise<void> {
	// The one filter whose values are loaded data. A thunk, so this can be registered before the
	// collection index has been fetched and answer with the books the moment it has — nothing has to
	// notice when that happens, and an index that never arrives leaves an empty list, which every
	// reader of it already treats as "no opinion". See `filter-vocabulary.ts`.
	registerVocabulary("in", () =>
		(state.collectionIndex?.collections ?? []).map((collection) => ({ value: collection.id, hint: collection.name })),
	);

	try {
		state.bookmarkedDates = await getBookmarkedDates();
	} catch {
		// IndexedDB unavailable — bookmarks won't work
	}

	buildGridData();
	renderGrid();
	// The build may have written this very page into the document; if so, it is taken over as it
	// stands rather than replaced with a spinner until the archive arrives. See `handleRoute`.
	handleRoute(readPrerenderedPage());
	loadComicData();
}

document.addEventListener("DOMContentLoaded", () => {
	markInitialHistoryEntry();
	attachRouteLinkHandler();

	initialize();

	window.addEventListener("popstate", () => handleRoute());

	document.addEventListener("keydown", (event) => {
		const activeTag = (document.activeElement as HTMLElement | null)?.tagName;
		const isInput = activeTag === "INPUT" || activeTag === "TEXTAREA" || activeTag === "SELECT";

		if (event.key === "Escape") {
			if (parseRoute().view !== "landing") {
				event.preventDefault();
				navigate(HOME_PATH);
			}
		}

		if ((event.key === "ArrowLeft" || event.key === "ArrowRight") && !isInput) {
			const route = parseRoute();
			if (route.view === "detail" && route.date) {
				event.preventDefault();
				// The arrows on the page already know where they go, and they know it on a prerendered
				// page before the archive has loaded, which is more than the state does.
				const arrow = document.querySelector<HTMLAnchorElement>(event.key === "ArrowLeft" ? "#nav-prev" : "#nav-next");
				if (arrow) navigateTo(arrow.href);
			}
		}

		if ((event.key === "ArrowUp" || event.key === "ArrowDown") && !isInput) {
			const route = parseRoute();
			if (route.view === "detail" && route.date) {
				event.preventDefault();
				const direction = event.key === "ArrowUp" ? -1 : 1;
				const adjacentDate = getSameDayComicDate(state, route.date, direction);
				if (adjacentDate) navigate(buildComicPath(adjacentDate));
			}
		}

		if (event.key === "b" && !isInput) {
			const route = parseRoute();
			if (route.view === "detail") {
				event.preventDefault();
				const bookmarkButton = document.querySelector<HTMLButtonElement>("#bookmark-btn");
				if (bookmarkButton) bookmarkButton.click();
			}
		}

		if (event.key === "/" && !isInput) {
			event.preventDefault();
			const landingInput = document.getElementById("landing-input") as HTMLInputElement | null;
			const resultsInput = document.getElementById("results-input") as HTMLInputElement | null;
			if (resultsInput) {
				resultsInput.focus();
			} else if (landingInput) {
				landingInput.focus();
			}
		}
	});

	document.getElementById("mobile-grid-toggle")!.addEventListener("click", () => {
		const sidebar = document.getElementById("sidebar")!;
		const overlay = document.getElementById("mobile-overlay")!;
		const isOpen = sidebar.classList.toggle("mobile-visible");
		overlay.classList.toggle("visible", isOpen);
	});

	document.getElementById("mobile-overlay")!.addEventListener("click", () => {
		document.getElementById("sidebar")!.classList.remove("mobile-visible");
		document.getElementById("mobile-overlay")!.classList.remove("visible");
	});

	document.addEventListener("mousemove", (event) => {
		if (state.keyboardNavActive) {
			state.keyboardNavActive = false;
			if (state.hoveredCell) {
				state.hoveredCell.classList.remove("cell--hover-highlight");
				state.hoveredCell = null;
			}
			document
				.querySelectorAll(".result-row--highlight")
				.forEach((row) => row.classList.remove("result-row--highlight"));
			const elementUnder = document.elementFromPoint(event.clientX, event.clientY);
			if (elementUnder) {
				const resultRow = elementUnder.closest(".result-row");
				if (resultRow) resultRow.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
			}
		}
	});
});
