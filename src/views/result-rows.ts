import "./results.css";

import { state } from "../state";
import { clearRowHighlights, scrollCellIntoViewIfNeeded } from "../utils";
import { cellForDate } from "../grid";
import { attachRowMenu } from "./row-menu";

/**
 * What the rows of strips a page lists do to the grid while they are hovered or stepped through. The
 * rows themselves are drawn by `pages/result-rows.ts`, which the build draws them with too.
 */

/** Where the mouse last was, so the row under it can be lit again once the rows are redrawn. */
let pointer: { x: number; y: number } | null = null;
document.addEventListener("mousemove", (event) => {
	pointer = { x: event.clientX, y: event.clientY };
});

/**
 * After the rows are drawn again, takes the light off the rows and cell that were lit — their row may
 * be gone — and, when the mouse is what changed them, lights the row now under it, as moving onto it
 * would have.
 */
export function relightRows(byPointer: boolean): void {
	if (state.hoveredCell) {
		state.hoveredCell.classList.remove("cell--hover-highlight");
		state.hoveredCell = null;
	}
	clearRowHighlights();
	if (!byPointer || !pointer) return;
	state.keyboardNavActive = false;
	document.elementFromPoint(pointer.x, pointer.y)?.closest(".result-row")?.dispatchEvent(new MouseEvent("mouseenter"));
}

/**
 * Tabbing onto a row lights it and its cell, as hovering does. Attached once, to a container that
 * outlives its rows, since a delegated listener does not need re-adding on every redraw.
 */
export function attachRowFocusHandler(element: HTMLElement): void {
	element.addEventListener("focusin", (event) => {
		const row = (event.target as HTMLElement).closest(".result-row") as HTMLElement | null;
		if (!row) return;
		if (state.hoveredCell) {
			state.hoveredCell.classList.remove("cell--hover-highlight");
		}
		document
			.querySelectorAll(".result-row--highlight")
			.forEach((highlightedRow) => highlightedRow.classList.remove("result-row--highlight"));

		row.classList.add("result-row--highlight");
		const cell = cellForDate(row.dataset.date!);
		if (cell) {
			cell.classList.add("cell--hover-highlight");
			scrollCellIntoViewIfNeeded(cell);
			state.hoveredCell = cell;
		}
		state.keyboardNavActive = true;
	});
}

export function attachRowHandlers(list: HTMLElement): void {
	list.querySelectorAll<HTMLElement>(".result-row").forEach((row) => {
		const textElement = row.querySelector<HTMLElement>(".result-text")!;
		if (textElement.scrollHeight > textElement.clientHeight) {
			textElement.classList.add("result-text--overflow");
		}
		const mark = textElement.querySelector("mark");
		if (mark) {
			const maxScroll = textElement.scrollHeight - textElement.clientHeight;
			const scrollTo = mark.offsetTop - textElement.clientHeight / 2;
			textElement.scrollTop = Math.max(0, Math.min(scrollTo, maxScroll));
		}

		if (row.dataset.ownership) {
			attachRowMenu(row);
			// Opening the row's menu is pointing at the strip on purpose, so it brings the strip into view,
			// as a focus does and a hover does not.
			row.addEventListener("contextmenu", () => {
				const cell = cellForDate(row.dataset.date!);
				if (cell) scrollCellIntoViewIfNeeded(cell);
			});
		}

		row.addEventListener("mouseenter", () => {
			if (state.keyboardNavActive) return;
			// By the light rather than by the hovered cell's day: zoomed out, the cell is a box, which
			// has none.
			state.hoveredCell?.classList.remove("cell--hover-highlight");
			clearRowHighlights();
			// Lit where it is, not scrolled to: the pointer may only be passing over the row. Focusing
			// the row, or following it, brings the strip into view.
			const cell = cellForDate(row.dataset.date!);
			if (cell) {
				cell.classList.add("cell--hover-highlight");
				state.hoveredCell = cell;
			}
			// This row alone: a row is one strip, and another that ran the same day is not the one
			// pointed at. The cell is the day's, so pointing at it lights every row of the day.
			row.classList.add("result-row--highlight");
		});

		row.addEventListener("mouseleave", () => {
			if (state.keyboardNavActive) return;
			if (state.hoveredCell) {
				state.hoveredCell.classList.remove("cell--hover-highlight");
				state.hoveredCell = null;
			}
			row.classList.remove("result-row--highlight");
		});
	});

	list.querySelectorAll<HTMLElement>(".result-row").forEach((row, index) => {
		row.addEventListener("keydown", (event) => {
			if (event.key === "ArrowDown" || event.key === "ArrowUp") {
				event.preventDefault();
				const rows = list.querySelectorAll<HTMLElement>(".result-row");
				const next = event.key === "ArrowDown" ? index + 1 : index - 1;
				if (next >= 0 && next < rows.length) {
					if (state.hoveredCell) {
						state.hoveredCell.classList.remove("cell--hover-highlight");
					}
					document
						.querySelectorAll(".result-row--highlight")
						.forEach((highlightedRow) => highlightedRow.classList.remove("result-row--highlight"));

					const newRow = rows[next];
					newRow.focus();
					newRow.classList.add("result-row--highlight");

					const cell = cellForDate(newRow.dataset.date!);
					if (cell) {
						cell.classList.add("cell--hover-highlight");
						scrollCellIntoViewIfNeeded(cell);
						state.hoveredCell = cell;
					}

					state.keyboardNavActive = true;
				}
			}
			// Enter is the anchor's own: it fires a click, which `attachRouteLinkHandler` picks up.
		});
	});
}
