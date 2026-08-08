import "./grid.css";

import { Day } from "./types";
import { RANGE_START, RANGE_END } from "./constants";
import { dateToString, isSabbatical } from "./date-utils";
import { scrollCellIntoViewIfNeeded } from "./utils";
import { state } from "./state";
import { loadDescriptions } from "./details";
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

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

interface LabelSpan {
	text: string;
	startWeek: number;
	endWeek: number;
}

function createLabelColumn(className: string, spans: LabelSpan[]): HTMLElement {
	const column = document.createElement("div");
	column.className = `grid-labels ${className}`;

	for (const span of spans) {
		// Grid lines are 1-based, so row N of the grid sits between lines N and N+1.
		const wrap = document.createElement("div");
		wrap.className = "grid-label-wrap";
		wrap.style.gridRowStart = String(span.startWeek + 1);
		wrap.style.gridRowEnd = String(span.endWeek + 1);

		const label = document.createElement("div");
		label.className = "grid-sticky-label";
		label.textContent = span.text;

		wrap.appendChild(label);
		column.appendChild(wrap);
	}

	return column;
}

function buildLabelSpans(prefixLength: number, weekCount: number, text: (period: string) => string): LabelSpan[] {
	const firstDays = new Map<string, Day>();
	for (const day of state.allDays) {
		const period = day.date.substring(0, prefixLength);
		if (!firstDays.has(period)) firstDays.set(period, day);
	}

	const starts = [...firstDays];
	return starts.map(([period, firstDay], index) => ({
		text: text(period),
		startWeek: firstDay.weekIndex,
		endWeek: starts[index + 1]?.[1].weekIndex ?? weekCount,
	}));
}

const HIGHLIGHT_DEADZONE_DAYS = 2 * 7;

function renderYearRail(cells: HTMLElement[]): void {
	const rail = document.getElementById("year-rail")!;
	const sidebar = document.getElementById("sidebar")!;
	const scroller = document.getElementById("grid-container")!;
	const header = document.querySelector<HTMLElement>(".grid-header-row")!;

	const bounds = new Map<string, { first: number; last: number }>();
	for (const [index, day] of state.allDays.entries()) {
		const year = day.date.substring(0, 4);
		const existing = bounds.get(year);
		if (existing) existing.last = index;
		else bounds.set(year, { first: index, last: index });
	}

	const entries = [...bounds].map(([year, { first, last }]) => {
		const button = document.createElement("button");
		button.type = "button";
		button.className = "year-rail-button";
		button.setAttribute("aria-label", `Jump to ${year}`);

		const pill = document.createElement("span");
		pill.className = "year-rail-pill";
		pill.textContent = `'${year.slice(2)}`;
		button.appendChild(pill);

		const firstCell = cells[first];
		button.addEventListener("click", () => {
			const offset = firstCell.getBoundingClientRect().top - cells[0].getBoundingClientRect().top;
			scroller.scrollTo({ top: offset, behavior: "smooth" });
		});

		return { button, firstCell, lastCell: cells[Math.max(first, last - HIGHLIGHT_DEADZONE_DAYS)] };
	});

	rail.replaceChildren(...entries.map((entry) => entry.button));

	const updateActiveYears = () => {
		const viewport = sidebar.getBoundingClientRect();
		const top = viewport.top + header.getBoundingClientRect().height;
		for (const { button, firstCell, lastCell } of entries) {
			const onScreen =
				firstCell.getBoundingClientRect().top < viewport.bottom && lastCell.getBoundingClientRect().bottom > top;
			button.classList.toggle("year-rail-button--active", onScreen);
			if (onScreen) button.setAttribute("aria-current", "true");
			else button.removeAttribute("aria-current");
		}
	};

	let queued = false;
	const queueUpdate = () => {
		if (queued) return;
		queued = true;
		requestAnimationFrame(() => {
			queued = false;
			updateActiveYears();
		});
	};

	sidebar.addEventListener("scroll", queueUpdate);
	scroller.addEventListener("scroll", queueUpdate);
	window.addEventListener("resize", queueUpdate);
	updateActiveYears();
}

export function renderGrid(): void {
	const layout = document.getElementById("grid-layout")!;

	const grid = document.createElement("div");
	grid.id = "grid";

	const cells: HTMLElement[] = [];

	for (const day of state.allDays) {
		const cell = document.createElement("div");
		cell.className = `cell cell--${day.state}`;
		cell.dataset.date = day.date;

		const [year, month, dayOfMonth] = day.date.split("-").map(Number);
		const dateObject = new Date(Date.UTC(year, month - 1, dayOfMonth));
		cell.setAttribute(
			"aria-label",
			dateObject.toLocaleDateString("en-US", {
				weekday: "long",
				year: "numeric",
				month: "long",
				day: "numeric",
				timeZone: "UTC",
			}) + (day.state !== "none" ? " — has comic" : ""),
		);

		// Only visible on mobile, where cells are large enough to hold a number.
		const dateLabel = document.createElement("span");
		dateLabel.className = "cell-date";
		dateLabel.setAttribute("aria-hidden", "true");
		dateLabel.textContent = String(dayOfMonth);
		cell.appendChild(dateLabel);

		cells.push(cell);
		grid.appendChild(cell);
	}

	const weekCount = state.allDays[state.allDays.length - 1].weekIndex + 1;

	const monthSpans = buildLabelSpans(7, weekCount, (month) => MONTH_NAMES[Number(month.substring(5, 7)) - 1]);
	const yearSpans = buildLabelSpans(4, weekCount, (year) => `'${year.slice(2)}`);

	const monthLabelsColumn = createLabelColumn("month-labels", monthSpans);
	const yearLabelsColumn = createLabelColumn("year-labels", yearSpans);

	layout.replaceChildren(grid, monthLabelsColumn, yearLabelsColumn);

	renderYearRail(cells);

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
			timeZone: "UTC",
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

	const followScroll = () => {
		if (!tooltip.classList.contains("grid-tooltip--visible")) return;
		const elementUnder = document.elementFromPoint(lastMouseX, lastMouseY);
		if (!elementUnder) return;
		const cell = elementUnder.closest<HTMLElement>(".cell");
		if (!cell) {
			tooltip.classList.remove("grid-tooltip--visible");
			return;
		}
		updateTooltip(cell);
	};

	// The sidebar scrolls on desktop, the grid container on mobile.
	document.getElementById("sidebar")!.addEventListener("scroll", followScroll);
	document.getElementById("grid-container")!.addEventListener("scroll", followScroll);
}

export async function loadComicData(): Promise<void> {
	void loadDescriptions();

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
