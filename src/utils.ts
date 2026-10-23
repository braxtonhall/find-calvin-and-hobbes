import type { HighlightRange } from "./search";

const HTML_ESCAPES: Record<string, string> = {
	"&": "&amp;",
	"<": "&lt;",
	">": "&gt;",
	'"': "&quot;",
	"'": "&#39;",
};

export function escHtml(text: string): string {
	return text.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);
}

export function highlightRanges(text: string, ranges: readonly HighlightRange[]): string {
	let html = "";
	let index = 0;
	for (const [start, end, literal] of ranges) {
		if (start < index) continue;
		const className = literal ? "" : ` class="mark--fuzzy"`;
		html += escHtml(text.slice(index, start)) + `<mark${className}>${escHtml(text.slice(start, end))}</mark>`;
		index = end;
	}
	return html + escHtml(text.slice(index));
}

/**
 * Whether the reader is on a touchscreen, where focusing a box raises a keyboard over half the page.
 * Asked of the device's capabilities rather than its user agent, and asked fresh each time, since a
 * tablet can gain or lose a mouse.
 */
export function isTouchDevice(): boolean {
	return window.matchMedia("(hover: none) and (pointer: coarse)").matches;
}

/**
 * The part of the grid on screen, below the days of the week laid over its top: the desktop's
 * scroller clips it, or the mobile container. Zoomed out, where the days are not drawn, it starts at
 * the top of the scroller.
 */
export function visibleBand(): { top: number; bottom: number } {
	const scroller = document.getElementById("grid-scroller")!.getBoundingClientRect();
	const container = document.getElementById("grid-container")!.getBoundingClientRect();
	const header = document.querySelector<HTMLElement>(".grid-header-row")!.getBoundingClientRect();
	return {
		top: Math.max(scroller.top, container.top, header.height > 0 ? header.bottom : -Infinity),
		bottom: Math.min(scroller.bottom, container.bottom),
	};
}

/** Takes the light off every result row lit for a cell. Only one day's rows are ever lit at once. */
/**
 * Whether `element` is on the page showing: a view that is active, or something inside one, as a
 * search's preview of a strip is. A view left behind keeps its markup, hidden.
 */
export function isShowing(element: HTMLElement): boolean {
	return element.closest(".view.active") !== null;
}

export function clearRowHighlights(): void {
	document
		.querySelectorAll(".result-row--highlight")
		.forEach((highlightedRow) => highlightedRow.classList.remove("result-row--highlight"));
}

/** Whether any of `cells` is wholly inside the part of the grid on screen. */
export function anyCellInView(cells: Iterable<HTMLElement>): boolean {
	const { top, bottom } = visibleBand();

	// Each cell's chunk is asked first. An off-screen chunk is skipped by the browser, and measuring a
	// cell inside one would have it styled and laid out only to learn that it is off screen.
	const chunksInView = new Map<Element, boolean>();
	for (const cell of cells) {
		const chunk = cell.parentElement!;
		let chunkInView = chunksInView.get(chunk);
		if (chunkInView === undefined) {
			const chunkRect = chunk.getBoundingClientRect();
			chunkInView = chunkRect.bottom > top && chunkRect.top < bottom;
			chunksInView.set(chunk, chunkInView);
		}
		if (!chunkInView) continue;
		const cellRect = cell.getBoundingClientRect();
		if (cellRect.top >= top && cellRect.bottom <= bottom) return true;
	}
	return false;
}

export function scrollCellIntoViewIfNeeded(cell: HTMLElement): void {
	if (!anyCellInView([cell])) cell.scrollIntoView({ block: "center", behavior: "smooth" });
}
