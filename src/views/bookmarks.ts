import "./bookmarks.css";

import { state } from "../state";
import { bookmarkResults } from "../search";
import { canGoBack } from "../router";
import { buildBackAndHomeButtons } from "../pages/nav-buttons";
import { attachBackAndHomeHandlers } from "./nav-buttons";
import { attachRowFocusHandler, attachRowHandlers, resultsHtml, SEARCH_LABELS, SourceLabels } from "./result-rows";

const EMPTY =
	"No bookmarks yet. Bookmark a strip from its page and it will be listed here. Bookmarks are kept in this browser.";

// A bookmarked rerun day is here because it was bookmarked, not because its date matched anything.
const LABELS: SourceLabels = { ...SEARCH_LABELS, rerun: "Rerun" };

let focusHandlerAttached = false;

/**
 * The bookmarked strips, drawn as the search results are. Only drawn once both the archive and the
 * bookmarks have arrived — see `pageFor` — so an empty list here means there really are none.
 */
export function renderBookmarks(): void {
	const element = document.getElementById("view-bookmarks")!;
	element.innerHTML = `${buildBackAndHomeButtons(canGoBack())}
		<h2 class="bookmarks-heading">Bookmarks</h2>
		<div id="bookmarks-list">${resultsHtml(bookmarkResults(state.bookmarkedDates), EMPTY, LABELS)}</div>`;
	attachBackAndHomeHandlers(element);
	attachRowHandlers(document.getElementById("bookmarks-list")!);
	// The view element outlives its contents, so its delegated listener is added once.
	if (!focusHandlerAttached) {
		attachRowFocusHandler(element);
		focusHandlerAttached = true;
	}
	// Tiers from the last search would otherwise ride along into the grid.
	state.searchResultTiers = null;
}
