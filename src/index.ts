import "./styles/theme.css";
import "./styles/base.css";
import "./styles/components.css";

import { ARCS, CHARACTERS, COLLECTION_INDEX, CREATORS } from "./bundled-data";
import { Term, registerVocabulary } from "./filter-vocabulary";
import { arcRange } from "./pages/page";
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
	resumeRoute,
} from "./router";
import { HOME_PATH, buildComicPath } from "./routes";
import { getSameDayComicDate } from "./pages/detail";
import { attachLifeEasterEgg } from "./life";
import { holdLibrary, readLibrary } from "./ownership";

function initialize(): void {
	// The filters whose values are loaded data. A thunk, so this can be registered before the
	// collection index is in `state` and answer with the books once it is. See `filter-vocabulary.ts`.
	registerVocabulary("in", () =>
		(state.collectionIndex?.collections ?? []).map((collection) => ({ value: collection.id, hint: collection.name })),
	);
	// Empty on a site without characters, where there is no `@featuring:` to ask.
	registerVocabulary("featuring", () => CHARACTERS.map((character) => ({ value: character.id, hint: character.name })));
	// And without creators, where there is no `@by:`.
	registerVocabulary("by", () => CREATORS.map((creator) => ({ value: creator.id, hint: creator.name })));
	// And without arcs, where there is no `@during:`. An arc has no name, so it is offered by its dates.
	const arcs: Term[] = ARCS.map((arc) => ({ value: arc.id, hint: `${arcRange(arc)}: ${arc.description}` }));
	registerVocabulary("during", () => arcs);

	// `@id:` takes any collection's, and inside an operator or on a tab that says which kind, that
	// kind's alone is offered. See `completion.ts`.
	const ids: Record<string, Term[]> = {
		book: COLLECTION_INDEX.collections.map((collection) => ({ value: collection.id, hint: collection.name })),
		arc: arcs,
		creator: CREATORS.map((creator) => ({ value: creator.id, hint: creator.name })),
		character: CHARACTERS.map((character) => ({ value: character.id, hint: character.name })),
	};
	for (const [type, values] of Object.entries(ids)) registerVocabulary(`id:${type}`, () => values);
	registerVocabulary("id", () => Object.values(ids).flat());

	// First, so the requests are on the wire while the grid is drawn. Nothing it does after they
	// answer can run before this function returns, so the grid and the route are in place by then.
	loadComicData();

	buildGridData();
	renderGrid();
	// The build may have written this very page into the document; if so, it is taken over as it
	// stands rather than replaced with a spinner until the archive arrives. See `handleRoute`.
	handleRoute(readPrerenderedPage());

	// After the first paint, not before it: opening IndexedDB can take longer than drawing a
	// prerendered page, and what waits on the answer is the grid's bookmark highlights and any search
	// about the reader's own library, which shows a spinner until it lands.
	// The bookmark and ownership buttons on a page ask for their own separately.
	readLibrary()
		.then(holdLibrary)
		.catch(() => {
			// IndexedDB unavailable — the library won't work, and a search of it finds nothing
		})
		.finally(() => {
			state.bookmarksLoaded = true;
			resumeRoute();
		});
}

document.addEventListener("DOMContentLoaded", () => {
	markInitialHistoryEntry();
	attachRouteLinkHandler();

	initialize();

	window.addEventListener("popstate", () => handleRoute());

	attachLifeEasterEgg();

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
			// The search page's box, or a Collections tab's search, whichever is showing.
			const resultsInput = document.querySelector<HTMLInputElement>(".view.active .results-input");
			if (resultsInput) {
				resultsInput.focus();
			} else if (landingInput) {
				landingInput.focus();
			}
		}
	});

	const sidebar = document.getElementById("sidebar")!;
	const overlay = document.getElementById("mobile-overlay")!;

	// The sidebar stays visible while it slides out, and is hidden once it is gone: hiding it restyles
	// the whole grid, which done mid-slide would stall it (see `#sidebar` in components.css).
	const setSidebarOpen = (open: boolean) => {
		sidebar.classList.toggle("mobile-closing", !open && sidebar.classList.contains("mobile-visible"));
		sidebar.classList.toggle("mobile-visible", open);
		overlay.classList.toggle("visible", open);
	};

	const finishClosing = (event: TransitionEvent) => {
		if (event.target !== sidebar || event.propertyName !== "transform") return;
		// Turning the sidebar back mid-slide cancels the slide it was making and starts another the
		// other way. That is no end to the slide out — hiding it then would snap it shut — so a cancel
		// counts only where nothing has taken its place, as when the page widens past mobile.
		if (event.type === "transitioncancel" && sidebar.getAnimations().length > 0) return;
		if (!sidebar.classList.contains("mobile-visible")) sidebar.classList.remove("mobile-closing");
	};
	sidebar.addEventListener("transitionend", finishClosing);
	sidebar.addEventListener("transitioncancel", finishClosing);

	document.getElementById("mobile-grid-toggle")!.addEventListener("click", () => {
		setSidebarOpen(!sidebar.classList.contains("mobile-visible"));
	});

	overlay.addEventListener("click", () => setSidebarOpen(false));

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
