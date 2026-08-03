import "./grid.css";

import { Day } from "./types";
import { RANGE_START, RANGE_END } from "./constants";
import { dateToString, isSabbatical } from "./date-utils";
import { scrollCellIntoViewIfNeeded } from "./utils";
import { state } from "./state";
import { navigate, parseRoute } from "./router";

export function updateGridStatesFromData(): void {
	const cells = document.querySelectorAll(".cell--has-comic");
	for (const cell of cells) {
		const element = cell as HTMLElement;
		const date = element.dataset.date;
		if (!date) continue;
		const comicsForDate = state.comicsByDate.get(date);
		if (!comicsForDate || comicsForDate.length === 0) {
			element.classList.remove("cell--has-comic");
			element.classList.add("cell--none");
		}
	}
}

export function buildGridData(): void {
	const [startYear, startMonth, startDay] = RANGE_START.split("-").map(Number);
	const [endYear, endMonth, endDay] = RANGE_END.split("-").map(Number);

	const startDate = new Date(Date.UTC(startYear, startMonth - 1, startDay));
	const endDate = new Date(Date.UTC(endYear, endMonth - 1, endDay));

	const firstMonday = new Date(startDate);
	firstMonday.setUTCDate(startDate.getUTCDate() - ((startDate.getUTCDay() + 6) % 7));

	const days: Day[] = [];
	const current = new Date(startDate);

	while (current <= endDate) {
		const year = current.getUTCFullYear();
		const month = current.getUTCMonth() + 1;
		const day = current.getUTCDate();
		const dateStr = dateToString(year, month, day);
		const dayOfWeek = current.getUTCDay();
		const msDiff = current.getTime() - firstMonday.getTime();
		const weekIndex = Math.floor(msDiff / (7 * 24 * 60 * 60 * 1000));

		const stateLabel = isSabbatical(dateStr) ? "none" : "has-comic";

		days.push({ date: dateStr, weekIndex, dayOfWeek, state: stateLabel });
		current.setUTCDate(current.getUTCDate() + 1);
	}

	state.allDays = days;
}

export function renderGrid(): void {
	const container = document.getElementById("grid-container")!;
	container.innerHTML = "";

	const dayLabels = ["M", "T", "W", "T", "F", "S", "S"];
	const headerRow = document.createElement("div");
	headerRow.className = "grid-header-row";
	const headerInner = document.createElement("div");
	headerInner.className = "grid-header-inner";
	for (const label of dayLabels) {
		const headerElement = document.createElement("div");
		headerElement.className = "grid-header";
		headerElement.textContent = label;
		headerInner.appendChild(headerElement);
	}
	headerRow.appendChild(headerInner);
	container.appendChild(headerRow);

	const layout = document.createElement("div");
	layout.className = "grid-layout";

	const gridColumn = document.createElement("div");

	const grid = document.createElement("div");
	grid.id = "grid";

	for (const day of state.allDays) {
		const cell = document.createElement("div");
		cell.className = `cell cell--${day.state}`;
		cell.dataset.date = day.date;
		cell.dataset.week = String(day.weekIndex);
		cell.dataset.day = String(day.dayOfWeek);
		cell.style.gridColumn = String(((day.dayOfWeek + 6) % 7) + 1);
		cell.style.gridRow = String(day.weekIndex + 1);

		const [year, month, dayOfMonth] = day.date.split("-").map(Number);
		const dateObject = new Date(Date.UTC(year, month - 1, dayOfMonth));
		cell.setAttribute(
			"aria-label",
			dateObject.toLocaleDateString("en-US", {
				weekday: "long",
				year: "numeric",
				month: "long",
				day: "numeric",
			}) + (day.state !== "none" ? " — has comic" : ""),
		);

		grid.appendChild(cell);
	}

	gridColumn.appendChild(grid);
	layout.appendChild(gridColumn);

	const yearLabelsColumn = document.createElement("div");
	yearLabelsColumn.className = "year-labels";

	const spacer = document.createElement("div");
	spacer.className = "grid-header__spacer";
	yearLabelsColumn.appendChild(spacer);

	const years = new Map<string, Day[]>();
	for (const day of state.allDays) {
		const year = day.date.substring(0, 4);
		if (!years.has(year)) years.set(year, []);
		years.get(year)!.push(day);
	}

	for (const [year, daysForYear] of years) {
		const minWeek = daysForYear[0].weekIndex;
		const maxWeek = daysForYear[daysForYear.length - 1].weekIndex;
		const numWeeks = maxWeek - minWeek + 1;
		const cellSize = window.matchMedia("(max-width: 768px)").matches ? 14 : 10;
		const gap = 1;
		const height = numWeeks * cellSize + (numWeeks - 1) * gap;

		const wrap = document.createElement("div");
		wrap.className = "year-label-wrap";
		wrap.style.height = height + "px";

		const label = document.createElement("div");
		label.className = "year-sticky-label";
		label.textContent = `'${year.slice(2)}`;

		wrap.appendChild(label);
		yearLabelsColumn.appendChild(wrap);
	}

	layout.appendChild(yearLabelsColumn);
	container.appendChild(layout);

	layout.addEventListener("click", (event) => {
		const cell = (event.target as HTMLElement).closest<HTMLElement>(".cell");
		if (!cell) return;
		const date = cell.dataset.date;
		if (date) {
			scrollCellIntoViewIfNeeded(cell);
			navigate("#/comic/" + date);
		}
	});

	layout.addEventListener("mouseover", (event) => {
		if (state.keyboardNavActive) return;
		const cell = (event.target as HTMLElement).closest<HTMLElement>(".cell");
		if (!cell || cell === state.hoveredCell) return;
		const route = parseRoute();
		if (route.view !== "results") return;
		if (cell.classList.contains("cell--none")) return;
		if (cell.classList.contains("cell--search-nonmatch")) return;

		if (state.hoveredCell) {
			state.hoveredCell.classList.remove("cell--hover-highlight");
			document
				.querySelectorAll(`.result-row[data-date="${state.hoveredCell.dataset.date}"]`)
				.forEach((row) => row.classList.remove("result-row--highlight"));
		}

		cell.classList.add("cell--hover-highlight");
		state.hoveredCell = cell;

		const resultRows = document.querySelectorAll(`.result-row[data-date="${cell.dataset.date}"]`);
		if (resultRows.length > 0) {
			resultRows.forEach((row) => row.classList.add("result-row--highlight"));
			const mainView = document.getElementById("main")!;
			const lastRow = resultRows[resultRows.length - 1] as HTMLElement;
			const rowRect = lastRow.getBoundingClientRect();
			const mainRect = mainView.getBoundingClientRect();
			const isVisible = rowRect.top >= mainRect.top && rowRect.bottom <= mainRect.bottom;
			if (!isVisible) {
				resultRows[0].scrollIntoView({ block: "center", behavior: "smooth" });
			}
		}
	});

	layout.addEventListener("mouseout", (event) => {
		if (state.keyboardNavActive) return;
		const cell = (event.target as HTMLElement).closest<HTMLElement>(".cell");
		if (!cell || cell !== state.hoveredCell) return;
		if (cell.contains(event.relatedTarget as Node | null)) return;

		cell.classList.remove("cell--hover-highlight");
		document
			.querySelectorAll(`.result-row[data-date="${cell.dataset.date}"]`)
			.forEach((row) => row.classList.remove("result-row--highlight"));
		state.hoveredCell = null;
	});

	if (!window.matchMedia("(hover: none)").matches) {
		const tooltip = document.createElement("div");
		tooltip.className = "grid-tooltip";
		document.body.appendChild(tooltip);

		let lastMouseX = 0;
		let lastMouseY = 0;

		const updateTooltip = (cell: HTMLElement) => {
			const [year, month, dayOfMonth] = cell.dataset.date!.split("-").map(Number);
			const dateObject = new Date(Date.UTC(year, month - 1, dayOfMonth));
			tooltip.textContent = dateObject.toLocaleDateString("en-US", {
				weekday: "long",
				year: "numeric",
				month: "long",
				day: "numeric",
			});
			const cellRect = cell.getBoundingClientRect();
			tooltip.style.left = cellRect.right + 6 + "px";
			tooltip.style.top = cellRect.top + cellRect.height / 2 + "px";
			tooltip.classList.add("grid-tooltip--visible");
		};

		layout.addEventListener("mousemove", (event) => {
			lastMouseX = event.clientX;
			lastMouseY = event.clientY;
			const cell = (event.target as HTMLElement).closest<HTMLElement>(".cell");
			if (!cell) {
				tooltip.classList.remove("grid-tooltip--visible");
				return;
			}
			updateTooltip(cell);
		});

		layout.addEventListener("mouseleave", () => {
			tooltip.classList.remove("grid-tooltip--visible");
		});

		const sidebar = document.getElementById("sidebar")!;
		sidebar.addEventListener("scroll", () => {
			if (!tooltip.classList.contains("grid-tooltip--visible")) return;
			const elementUnder = document.elementFromPoint(lastMouseX, lastMouseY);
			if (!elementUnder) return;
			const cell = elementUnder.closest<HTMLElement>(".cell");
			if (!cell) {
				tooltip.classList.remove("grid-tooltip--visible");
				return;
			}
			updateTooltip(cell);
		});
	}
}

export async function loadComicData(): Promise<void> {
	try {
		const response = await fetch("comics.json");
		if (!response.ok) throw new Error(`HTTP ${response.status}`);
		state.comics = await response.json();
		state.comicsByDate = new Map();
		for (const comic of state.comics) {
			if (!state.comicsByDate.has(comic.date)) state.comicsByDate.set(comic.date, []);
			state.comicsByDate.get(comic.date)!.push(comic);
		}
	} catch {
		const loading = document.getElementById("loading")!;
		loading.classList.remove("hidden");
		loading.innerHTML = `
			<div style="text-align:center;font-family:var(--font);color:var(--text);">
				<p style="font-size:16px;margin-bottom:12px;">Could not load comic data.</p>
				<button id="retry-btn" style="padding:8px 16px;font-family:var(--font);font-size:14px;background:var(--golden);color:#fff;border:none;border-radius:4px;cursor:pointer;">Retry</button>
			</div>`;
		document.getElementById("retry-btn")!.addEventListener("click", () => {
			document.getElementById("loading")!.innerHTML = '<div class="spinner"></div>';
			loadComicData();
		});
		return;
	}

	try {
		const collectionsResponse = await fetch("collection-index.json");
		const collectionIndex = await collectionsResponse.json();
		state.collectionIndex = collectionIndex;
		state.collectionsById = new Map();
		for (const collection of collectionIndex.collections) {
			state.collectionsById.set(collection.id, collection);
		}
		state.collectionTooltip = document.createElement("div");
		state.collectionTooltip.className = "collection-tooltip";
		document.body.appendChild(state.collectionTooltip);
	} catch {
		// collection data unavailable — "Appears in" section won't render
	}

	state.dataLoaded = true;
	updateGridStatesFromData();
	document.getElementById("loading")!.classList.add("hidden");

	if (state.pendingRoute) {
		state.pendingRoute = null;
		handleRoute();
	} else {
		updateGridState(parseRoute());
	}
}

// ─── Re-import from router (circular dependency resolved at runtime) ────────

import { handleRoute, updateGridState } from "./router";
