import "./library.css";

import { state } from "../state";
import { search } from "../search";
import { TUNING } from "../tuning";
import { CANONICAL_FORMS } from "../compounds";
import { assignTiers } from "../tiers";
import { canGoBack } from "../router";
import { BOOKSHELF_BOOKS_QUERY, BookshelfView, LIBRARY_QUERIES, LibraryView, isLibraryView } from "../routes";
import { buildLibraryHtml } from "../pages/library";
import { buildCollectionRowHtml, collectionsPageFrom } from "../pages/collections";
import { attachBackAndHomeHandlers } from "./nav-buttons";
import { attachCopyLinkHandler } from "./copy-link";
import { attachRowFocusHandler, drawRows } from "./result-rows";
import { attachCollectionRowHandlers } from "./collections";
import { narrowTab } from "./tab-search";

const EMPTY: Record<LibraryView | BookshelfView, string> = {
	bookmarks: "No bookmarks yet",
	"bookshelf-clippings": "No clippings yet",
	"bookshelf-books": "No books yet",
	bookshelf: "Nothing owned yet",
};

/** The views whose focus handler is attached already: it is delegated, and the view outlives its rows. */
const focusAttached = new WeakSet<HTMLElement>();

/**
 * Draws the reader's bookmarks or a tab of their bookshelf: the search its query is, with no box to
 * change it — strips in date order, or books in the order Collections lists them. Drawn afresh on
 * every visit, since the library may have changed since the last.
 */
export function renderLibrary(view: LibraryView | BookshelfView): void {
	const element = document.getElementById(`view-${view}`)!;
	element.innerHTML = buildLibraryHtml(view, canGoBack());
	attachBackAndHomeHandlers(element);
	attachCopyLinkHandler(element);
	if (isLibraryView(view) && !focusAttached.has(element)) {
		attachRowFocusHandler(element);
		focusAttached.add(element);
	}

	renderLibraryRows(view);
}

/** Draws the page's rows again, and only them: what is in the library has changed while it is open. */
export function renderLibraryRows(view: LibraryView | BookshelfView): void {
	const element = document.getElementById(`view-${view}`)!;
	const list = element.querySelector<HTMLElement>(".library-list")!;
	if (!isLibraryView(view)) {
		renderShelvedBooks(element, list);
		return;
	}
	const results = search(LIBRARY_QUERIES[view], "date", TUNING, CANONICAL_FORMS);
	drawRows(list, results, EMPTY[view]);
	state.searchResultTiers = assignTiers(results);
}

/** The books the reader owns, as Collections' rows, with their strips lit in the grid as a tab's search lights them. */
function renderShelvedBooks(element: HTMLElement, list: HTMLElement): void {
	const ids = narrowTab("books", BOOKSHELF_BOOKS_QUERY)?.ids ?? new Set<string>();
	const { collections } = collectionsPageFrom(state);
	const shown = collections.filter((collection) => ids.has(collection.id));
	list.innerHTML =
		shown.length === 0
			? `<div class="results-empty">${EMPTY["bookshelf-books"]}</div>`
			: `<div class="collections-list">${shown.map(buildCollectionRowHtml).join("")}</div>`;
	attachCollectionRowHandlers(element, shown);
}
