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

export function scrollCellIntoViewIfNeeded(cell: HTMLElement): void {
	const sidebar = document.getElementById("sidebar")!;
	const container = document.getElementById("grid-container")!;
	const header = document.querySelector<HTMLElement>(".grid-header-row")!;
	const top = header.getBoundingClientRect().bottom;
	const bottom = Math.min(sidebar.getBoundingClientRect().bottom, container.getBoundingClientRect().bottom);

	const cellRect = cell.getBoundingClientRect();
	if (cellRect.top < top || cellRect.bottom > bottom) {
		cell.scrollIntoView({ block: "center", behavior: "smooth" });
	}
}
