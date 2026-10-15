import "./collections.css";

import { state } from "../state";
import { canGoBack } from "../router";
import { CollectionSummary, CollectionsPage } from "../pages/page";
import { buildCollectionsBodyHtml, buildCollectionsHtml } from "../pages/collections";
import { attachBackAndHomeHandlers } from "./nav-buttons";
import { clearCollectionSoon, datesOf, highlightCollection } from "./cell-highlight";
import { attachTabSearch, keepsHeader, narrowTab, updateTabSearch } from "./tab-search";
import { attachRowMenu, hasMenuOpen } from "./row-menu";

/**
 * Draws the list of books, or — with `adopt` — takes over the one the build drew from the same `page`.
 * With the search open, only the books it finds; and while the reader types, only the list is drawn
 * again, under the box they are typing in.
 */
export function renderCollections(page: CollectionsPage, adopt: boolean = false, arriving: boolean = true): void {
	const element = document.getElementById("view-collections")!;
	const results = narrowTab("books", page.q);
	const ids = results?.ids ?? null;
	if (adopt) {
		attachBackAndHomeHandlers(element);
		attachTabSearch(element, "books");
	} else if (keepsHeader(element, arriving)) {
		element.querySelector(".collections-body")!.innerHTML = buildCollectionsBodyHtml(page, ids);
		updateTabSearch(element, page.q, page.order);
	} else {
		element.innerHTML = buildCollectionsHtml(page, canGoBack(), ids);
		attachBackAndHomeHandlers(element);
		attachTabSearch(element, "books");
	}

	attachCollectionRowHandlers(element, page.collections);
}

/**
 * Hovering or focusing a book's row lights its strips in the grid, and letting go goes back to what
 * the page lights, in `state.tabMatchDates`. Each row has the book's menu too.
 */
export function attachCollectionRowHandlers(element: HTMLElement, collections: CollectionSummary[]): void {
	const byId = new Map(collections.map((collection) => [collection.id, collection]));
	element.querySelectorAll<HTMLElement>(".collections-row").forEach((row) => {
		const collection = byId.get(row.dataset.collectionId ?? "") ?? null;
		// A row followed to its book is left focused, and hidden, which blurs it; by then the grid is
		// the book page's to draw, so only the list while it is showing may touch it.
		const show = (scroll: boolean) =>
			element.classList.contains("active") && collection && highlightCollection(datesOf(collection), scroll);
		const clear = () => element.classList.contains("active") && clearCollectionSoon(state.tabMatchDates);
		row.addEventListener("mouseenter", () => show(false));
		row.addEventListener("focus", () => show(true));
		row.addEventListener("mouseleave", clear);
		// Not when the focus goes into the row's own menu: the row is still the one pointed at.
		row.addEventListener("blur", () => hasMenuOpen(row) || clear());
		// Opening the row's menu is pointing at the book on purpose, so it brings the strips into view as a focus does.
		row.addEventListener("contextmenu", () => show(true));
		attachRowMenu(row);
	});
}
