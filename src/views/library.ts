import "./library.css";

import { state } from "../state";
import { search } from "../search";
import { TUNING } from "../tuning";
import { COMPOUND_CANONICAL_FORMS } from "../compounds";
import { assignTiers } from "../tiers";
import { canGoBack } from "../router";
import { LIBRARY_QUERIES, LibraryView } from "../routes";
import { buildLibraryHtml } from "../pages/library";
import { attachBackAndHomeHandlers } from "./nav-buttons";
import { attachRowFocusHandler, attachRowHandlers, resultsHtml } from "./result-rows";

const EMPTY: Record<LibraryView, string> = {
	bookmarks: "No bookmarks yet",
	bookshelf: "Nothing owned yet",
};

/** The views whose focus handler is attached already: it is delegated, and the view outlives its rows. */
const focusAttached = new WeakSet<HTMLElement>();

/**
 * Draws the reader's bookmarks or bookshelf: the search its query is, in date order, with no box to
 * change it. Drawn afresh on every visit, since the library may have changed since the last.
 */
export function renderLibrary(view: LibraryView): void {
	const element = document.getElementById(`view-${view}`)!;
	element.innerHTML = buildLibraryHtml(view, canGoBack());
	attachBackAndHomeHandlers(element);
	if (!focusAttached.has(element)) {
		attachRowFocusHandler(element);
		focusAttached.add(element);
	}

	renderLibraryRows(view);
}

/** Draws the page's rows again, and only them: what is in the library has changed while it is open. */
export function renderLibraryRows(view: LibraryView): void {
	const element = document.getElementById(`view-${view}`)!;
	const results = search(LIBRARY_QUERIES[view], "date", TUNING, COMPOUND_CANONICAL_FORMS);
	const list = element.querySelector<HTMLElement>(".library-list")!;
	list.innerHTML = resultsHtml(results, EMPTY[view]);
	state.searchResultTiers = assignTiers(results);
	attachRowHandlers(list);
}
