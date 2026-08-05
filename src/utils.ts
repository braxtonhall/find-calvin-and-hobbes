export function escHtml(text: string): string {
	const container = document.createElement("div");
	container.appendChild(document.createTextNode(text));
	return container.innerHTML;
}

export function escRegex(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
