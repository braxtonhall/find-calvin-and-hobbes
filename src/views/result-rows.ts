import "./results.css";

import { state } from "../state";
import { clearRowHighlights, scrollCellIntoViewIfNeeded } from "../utils";
import { cellForDate } from "../grid";
import { attachRowMenu } from "./row-menu";
import { ResultRow, resultsHtml, rowImageHtml } from "../pages/result-rows";

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

/** How many rows are drawn whole at first: a phone's screen of them several times over. */
const ROWS_DRAWN_FIRST = 30;

/** How many plain rows are drawn at a time after those, between whatever else the page is doing. */
const ROWS_PER_BATCH = 50;

/** How far from the last row drawn more are asked for, if scrolling outruns the batches: this many from the end on screen. */
const ROWS_AHEAD = 10;

/**
 * A list's rows being drawn. A list of thousands — `a`, or Calvin's page — drawn whole at once is
 * seconds on a phone, during which nothing typed shows up. So the first screens of rows are drawn
 * whole, and the rest plain — a header and the text, which is what find-in-page searches — a batch
 * at a time while the page is otherwise idle. A plain row is made whole, its picture and its handlers,
 * when it comes on screen: scrolled to, or found.
 */
interface Batches {
	results: readonly ResultRow[];
	drawn: number;
	/** The row whose coming on screen draws the next batch now rather than when the page is next idle. */
	trigger: Element | null;
	/** Makes each plain row whole as it comes on screen. `null` where there is no `IntersectionObserver`. */
	sighted: IntersectionObserver | null;
}

const batches = new WeakMap<HTMLElement, Batches>();

/** Fired on a list when it draws another batch, for whatever marks its rows to mark the new ones. */
export const ROWS_DRAWN = "rowsdrawn";

/** Safari has no `requestIdleCallback`; a timeout lets a keystroke in between batches all the same. */
const whenIdle: (callback: () => void) => void =
	typeof requestIdleCallback === "undefined" ? (callback) => setTimeout(callback, 16) : requestIdleCallback;

/**
 * The viewport is the root, as for the grid's chunks: whichever of the page and a preview's column is
 * scrolling the rows clips them.
 */
const batchObserver =
	typeof IntersectionObserver === "undefined"
		? null
		: new IntersectionObserver((entries) => {
				for (const entry of entries) {
					if (!entry.isIntersecting) continue;
					const list = entry.target.parentElement;
					const batch = list && batches.get(list);
					if (batch && batch.trigger === entry.target) drawUpTo(list, batch.drawn + 1);
				}
			});

/** Draws `results` into `list`, or `empty` when there are none: the first rows now, the rest as the page has time. */
export function drawRows(list: HTMLElement, results: readonly ResultRow[], empty: string): void {
	const shown = results.slice(0, ROWS_DRAWN_FIRST);
	clearRows(list, resultsHtml(shown, empty));
	const sighted =
		typeof IntersectionObserver === "undefined"
			? null
			: new IntersectionObserver((entries) => {
					for (const entry of entries) {
						if (entry.isIntersecting) makeWhole(list, entry.target as HTMLElement);
					}
				});
	const batch: Batches = { results, drawn: shown.length, trigger: null, sighted };
	batches.set(list, batch);
	attachRowHandlers(list);
	watchForMore(list);

	const drawNext = (): void => {
		if (batches.get(list) !== batch || batch.drawn >= results.length) return;
		drawUpTo(list, batch.drawn + 1);
		whenIdle(drawNext);
	};
	whenIdle(drawNext);
}

/** Empties `list`, or puts `html` in it, with no rows left waiting to be drawn. */
export function clearRows(list: HTMLElement, html = ""): void {
	const previous = batches.get(list);
	if (previous?.trigger) batchObserver?.unobserve(previous.trigger);
	previous?.sighted?.disconnect();
	batches.delete(list);
	list.innerHTML = html;
}

/** Every result `list` has, drawn or not, if `drawRows` drew it. */
export function resultsOf(list: HTMLElement): readonly ResultRow[] | null {
	return batches.get(list)?.results ?? null;
}

/** How many rows `list` has, drawn or not. */
function rowCount(list: HTMLElement): number {
	return batches.get(list)?.results.length ?? list.querySelectorAll(".result-row").length;
}

/** The row at `index`, drawn and made whole for the purpose if it is not yet. */
export function rowAt(list: HTMLElement, index: number): HTMLElement | undefined {
	drawUpTo(list, index + 1);
	const row = list.querySelectorAll<HTMLElement>(".result-row")[index];
	if (row) makeWhole(list, row);
	return row;
}

/** Draws plain the rows before `end`, if any are not drawn yet — and, while drawing, a whole batch at least. */
function drawUpTo(list: HTMLElement, end: number): void {
	const batch = batches.get(list);
	if (!batch || end <= batch.drawn) return;
	const until = Math.min(batch.results.length, Math.max(end, batch.drawn + ROWS_PER_BATCH));
	const before = list.children.length;
	list.insertAdjacentHTML("beforeend", resultsHtml(batch.results.slice(batch.drawn, until), "", true));
	batch.drawn = until;
	const added = [...list.children].slice(before) as HTMLElement[];
	for (const row of added) {
		if (batch.sighted) batch.sighted.observe(row);
		else makeWhole(list, row);
	}
	watchForMore(list);
	list.dispatchEvent(new CustomEvent(ROWS_DRAWN));
}

/** Puts a plain row's picture in and attaches what it does, as `drawRows` does for its first rows. */
function makeWhole(list: HTMLElement, row: HTMLElement): void {
	if (!row.classList.contains("result-row--plain")) return;
	const batch = batches.get(list);
	const index = [...list.children].indexOf(row);
	const result = batch?.results[index];
	if (!batch || !result) return;
	batch.sighted?.unobserve(row);
	row.classList.remove("result-row--plain");
	row.querySelector(".result-image-wrap")?.insertAdjacentHTML("beforeend", rowImageHtml(result));
	attachHandlersTo(list, [row]);
}

function watchForMore(list: HTMLElement): void {
	const batch = batches.get(list);
	if (!batch) return;
	if (batch.trigger) batchObserver?.unobserve(batch.trigger);
	batch.trigger = null;
	if (batch.drawn >= batch.results.length) return;
	const rows = list.querySelectorAll(".result-row");
	batch.trigger = rows[Math.max(0, rows.length - ROWS_AHEAD)];
	batchObserver?.observe(batch.trigger);
}

/** Attaches what every row of `list` does: the rows the build drew, or the first batch `drawRows` drew. */
export function attachRowHandlers(list: HTMLElement): void {
	attachHandlersTo(list, [...list.querySelectorAll<HTMLElement>(".result-row")]);
}

function attachHandlersTo(list: HTMLElement, rows: readonly HTMLElement[]): void {
	// Every row measured before any is changed: measuring after a change has the browser lay the page
	// out again, once a row, which for a few thousand rows is most of the time spent drawing them. The
	// text box is a fixed height, so neither change moves anything the others measure.
	const measured = rows.map((row) => {
		const textElement = row.querySelector<HTMLElement>(".result-text")!;
		const overflow = textElement.scrollHeight > textElement.clientHeight;
		const mark = textElement.querySelector<HTMLElement>("mark");
		const maxScroll = textElement.scrollHeight - textElement.clientHeight;
		// Not where the text is scrolled already: only the browser scrolls a plain row's, to show a
		// match it found there, which the mark is no reason to scroll away from.
		const scrollTo =
			mark && textElement.scrollTop === 0
				? Math.max(0, Math.min(mark.offsetTop - textElement.clientHeight / 2, maxScroll))
				: null;
		return { textElement, overflow, scrollTo };
	});
	for (const { textElement, overflow, scrollTo } of measured) {
		if (overflow) textElement.classList.add("result-text--overflow");
		if (scrollTo !== null) textElement.scrollTop = scrollTo;
	}

	for (const row of rows) {
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
	}

	for (const row of rows) {
		row.addEventListener("keydown", (event) => {
			if (event.key === "ArrowDown" || event.key === "ArrowUp") {
				event.preventDefault();
				// Counted when pressed, since rows drawn after this one was can be stepped onto.
				const index = [...list.querySelectorAll(".result-row")].indexOf(row);
				const next = event.key === "ArrowDown" ? index + 1 : index - 1;
				if (next >= 0 && next < rowCount(list)) {
					if (state.hoveredCell) {
						state.hoveredCell.classList.remove("cell--hover-highlight");
					}
					document
						.querySelectorAll(".result-row--highlight")
						.forEach((highlightedRow) => highlightedRow.classList.remove("result-row--highlight"));

					const newRow = rowAt(list, next)!;
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
	}
}
