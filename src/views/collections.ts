import "./collections.css";

import { state } from "../state";
import { canGoBack } from "../router";
import { CollectionsPage } from "../pages/page";
import { buildCollectionsBodyHtml, buildCollectionsHtml } from "../pages/collections";
import { attachBackAndHomeHandlers } from "./nav-buttons";
import { clearCollectionSoon, datesOf, highlightCollection } from "./cell-highlight";
import { attachTabSearch, keepsHeader, narrowTab, updateTabSearch } from "./tab-search";
import { attachRowMenu } from "./row-menu";

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
		updateTabSearch(element, page.q);
	} else {
		element.innerHTML = buildCollectionsHtml(page, canGoBack(), ids);
		attachBackAndHomeHandlers(element);
		attachTabSearch(element, "books");
	}

	const byId = new Map(page.collections.map((collection) => [collection.id, collection]));
	element.querySelectorAll<HTMLElement>(".collections-row").forEach((row) => {
		const collection = byId.get(row.dataset.collectionId ?? "") ?? null;
		// A row followed to its book is left focused, and hidden, which blurs it; by then the grid is
		// the book page's to draw, so only the list while it is showing may touch it.
		const show = () => element.classList.contains("active") && collection && highlightCollection(datesOf(collection));
		const clear = () => element.classList.contains("active") && clearCollectionSoon(state.tabMatchDates);
		row.addEventListener("mouseenter", show);
		row.addEventListener("focus", show);
		row.addEventListener("mouseleave", clear);
		row.addEventListener("blur", clear);
		attachRowMenu(row);
	});
}
