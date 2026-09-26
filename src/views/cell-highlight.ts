import { state } from "../state";
import { scrollCellIntoViewIfNeeded } from "../utils";

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
