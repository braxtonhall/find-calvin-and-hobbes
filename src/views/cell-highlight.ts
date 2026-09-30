import { state } from "../state";
import { anyCellInView, scrollCellIntoViewIfNeeded } from "../utils";
import { isDateInCollection } from "../date-utils";
import { Collection } from "../types";

/**
 * Lights up a strip's cell in the grid while a link to that strip is hovered — the same ring a
 * search result's row puts on its cell — and scrolls the grid to it if it is out of view.
 */
export function attachCellHighlightLink(link: HTMLElement, date: string): void {
	link.addEventListener("mouseenter", () => {
		if (state.hoveredCell) state.hoveredCell.classList.remove("cell--hover-highlight");
		const cell = document.querySelector<HTMLElement>(`.cell[data-date="${date}"]`);
		if (!cell) return;
		cell.classList.add("cell--hover-highlight");
		state.hoveredCell = cell;
		scrollCellIntoViewIfNeeded(cell);
	});

	link.addEventListener("mouseleave", () => {
		if (!state.hoveredCell) return;
		state.hoveredCell.classList.remove("cell--hover-highlight");
		state.hoveredCell = null;
	});
}

/**
 * Shows a book's strips in the grid as its own page does — its strips lit, the rest dimmed — or,
 * given `null`, puts the grid back as it was. The book's ranges are on the page, so this works on a
 * cold load before the archive has arrived.
 *
 * When none of the book's strips is on screen, the grid scrolls to its first one, the way a hovered
 * search result brings its strip into view. A book with any strip already showing leaves the grid
 * where it is, so running a finger down the list does not throw it about.
 */
export function highlightCollection(collection: Pick<Collection, "dailies" | "sundays"> | null): void {
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
