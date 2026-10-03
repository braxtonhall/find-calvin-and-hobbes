import "./collections.css";

import { canGoBack } from "../router";
import { CollectionsPage } from "../pages/page";
import { buildCollectionsHtml } from "../pages/collections";
import { attachBackAndHomeHandlers } from "./nav-buttons";
import { clearCollectionSoon, datesOf, highlightCollection } from "./cell-highlight";

/** Draws the list of books, or — with `adopt` — takes over the one the build drew from the same `page`. */
export function renderCollections(page: CollectionsPage, adopt: boolean = false): void {
	const element = document.getElementById("view-collections")!;
	if (!adopt) element.innerHTML = buildCollectionsHtml(page, canGoBack());
	attachBackAndHomeHandlers(element);

	const byId = new Map(page.collections.map((collection) => [collection.id, collection]));
	element.querySelectorAll<HTMLElement>(".collections-row").forEach((row) => {
		const collection = byId.get(row.dataset.collectionId ?? "") ?? null;
		// A row followed to its book is left focused, and hidden, which blurs it; by then the grid is
		// the book page's to draw, so only the list while it is showing may touch it.
		const show = () => element.classList.contains("active") && collection && highlightCollection(datesOf(collection));
		const clear = () => element.classList.contains("active") && clearCollectionSoon();
		row.addEventListener("mouseenter", show);
		row.addEventListener("focus", show);
		row.addEventListener("mouseleave", clear);
		row.addEventListener("blur", clear);
	});
}
