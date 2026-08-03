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
	const sidebarRect = sidebar.getBoundingClientRect();
	const cellRect = cell.getBoundingClientRect();
	const isVisible = cellRect.top >= sidebarRect.top && cellRect.bottom <= sidebarRect.bottom;
	if (!isVisible) {
		cell.scrollIntoView({ block: "center", behavior: "smooth" });
	}
}
