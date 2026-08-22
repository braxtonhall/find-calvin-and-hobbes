import "./styles/base.css";
import "./styles/components.css";

import { getBookmarkedDates } from "./bookmarks";
import { registerVocabulary } from "./filter-vocabulary";
import { state } from "./state";
import { buildGridData, renderGrid, loadComicData } from "./grid";
import { handleRoute, markInitialHistoryEntry, navigate, parseRoute } from "./router";
import { getAdjacentComicDate, getSameDayComicDate } from "./views/detail";

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
	handleRoute();
	loadComicData();
}

document.addEventListener("DOMContentLoaded", () => {
	markInitialHistoryEntry();

	initialize();

	window.addEventListener("hashchange", handleRoute);
	window.addEventListener("popstate", handleRoute);

	document.addEventListener("keydown", (event) => {
		const activeTag = (document.activeElement as HTMLElement | null)?.tagName;
		const isInput = activeTag === "INPUT" || activeTag === "TEXTAREA" || activeTag === "SELECT";

		if (event.key === "Escape") {
			if (parseRoute().view !== "landing") {
				event.preventDefault();
				navigate("#/");
			}
		}

		if ((event.key === "ArrowLeft" || event.key === "ArrowRight") && !isInput) {
			const route = parseRoute();
			if (route.view === "detail" && route.date) {
				event.preventDefault();
				const direction = event.key === "ArrowLeft" ? -1 : 1;
				const adjacentDate = getAdjacentComicDate(route.date, direction);
				if (adjacentDate) navigate("#/comic/" + adjacentDate);
			}
		}

		if ((event.key === "ArrowUp" || event.key === "ArrowDown") && !isInput) {
			const route = parseRoute();
			if (route.view === "detail" && route.date) {
				event.preventDefault();
				const direction = event.key === "ArrowUp" ? -1 : 1;
				const adjacentDate = getSameDayComicDate(route.date, direction);
				if (adjacentDate) navigate("#/comic/" + adjacentDate);
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
