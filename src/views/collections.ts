import "./collections.css";

import { isDateInCollection } from "../date-utils";
import { anyCellInView } from "../utils";
import { canGoBack } from "../router";
import { CollectionsPage, CollectionSummary } from "../pages/page";
import { buildCollectionsHtml } from "../pages/collections";
import { attachBackAndHomeHandlers } from "./nav-buttons";

/**
 * Shows a book's strips in the grid as its own page does — its strips lit, the rest dimmed — or,
 * given `null`, puts the grid back as it was. The book's ranges are on the page, so this works on a
 * cold load before the archive has arrived.
 *
 * When none of the book's strips is on screen, the grid scrolls to its first one, the way a hovered
 * search result brings its strip into view. A book with any strip already showing leaves the grid
 * where it is, so running a finger down the list does not throw it about.
 */
function highlightCollection(collection: CollectionSummary | null): void {
	const matched: HTMLElement[] = [];
	for (const cell of document.querySelectorAll<HTMLElement>(".cell")) {
		const date = cell.dataset.date;
		const matches = collection !== null && date !== undefined && isDateInCollection(date, collection);
		cell.classList.toggle("cell--search-match", matches);
		cell.classList.toggle("cell--search-nonmatch", collection !== null && !matches);
		if (matches) matched.push(cell);
	}
	if (matched.length > 0 && !anyCellInView(matched)) {
		matched[0].scrollIntoView({ block: "center", behavior: "smooth" });
	}
}

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
		const show = () => element.classList.contains("active") && highlightCollection(collection);
		const clear = () => element.classList.contains("active") && highlightCollection(null);
		row.addEventListener("mouseenter", show);
		row.addEventListener("focus", show);
		row.addEventListener("mouseleave", clear);
		row.addEventListener("blur", clear);
	});
}
