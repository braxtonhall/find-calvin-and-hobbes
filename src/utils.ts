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

/** Whether any of `cells` is wholly inside the part of the grid on screen, below its sticky header. */
export function anyCellInView(cells: Iterable<HTMLElement>): boolean {
	const sidebar = document.getElementById("sidebar")!;
	const container = document.getElementById("grid-container")!;
	const header = document.querySelector<HTMLElement>(".grid-header-row")!;
	const top = header.getBoundingClientRect().bottom;
	const bottom = Math.min(sidebar.getBoundingClientRect().bottom, container.getBoundingClientRect().bottom);

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
