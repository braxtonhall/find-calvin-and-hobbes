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

export function escRegex(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function highlightMatches(text: string, query: string): string {
	if (!query) {
		return escHtml(text);
	}

	const regex = new RegExp(escRegex(query), "gi");
	let html = "";
	let index = 0;
	for (const match of text.matchAll(regex)) {
		html += escHtml(text.slice(index, match.index)) + `<mark>${escHtml(match[0])}</mark>`;
		index = match.index + match[0].length;
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
