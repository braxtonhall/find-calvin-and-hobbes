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

	const selectCell = (cell: HTMLElement) => {
		const date = cell.dataset.date;
		if (!date) return;
		scrollCellIntoViewIfNeeded(cell);
		navigate("#/comic/" + date);
	};

	let suppressClick = false;

	layout.addEventListener("click", (event) => {
		if (suppressClick) {
			suppressClick = false;
			return;
		}
		const cell =
			(event.target as HTMLElement).closest<HTMLElement>(".cell") ?? cellAtPoint(event.clientX, event.clientY);
		if (cell) selectCell(cell);
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

	let lastPointerX = 0;
	let lastPointerY = 0;
	let lastAnchorAbove = false;
	let pinnedCell: HTMLElement | null = null;

	const hideTooltip = () => {
		pinnedCell = null;
		tooltip.classList.remove("grid-tooltip--visible");
	};

	const updateTooltip = (cell: HTMLElement, anchorAbove: boolean) => {
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
		const width = tooltip.offsetWidth;
		const height = tooltip.offsetHeight;
		const pad = 6;

		if (anchorAbove) {
			const center = cellRect.left + cellRect.width / 2 - width / 2;
			const top = cellRect.top - height - pad;
			tooltip.style.transform = "none";
			tooltip.style.left = Math.max(pad, Math.min(center, window.innerWidth - width - pad)) + "px";
			tooltip.style.top = (top < pad ? cellRect.bottom + pad : top) + "px";
		} else {
			const right = cellRect.right + pad;
			const left = right + width > window.innerWidth - pad ? cellRect.left - width - pad : right;
			const middle = cellRect.top + cellRect.height / 2;
			tooltip.style.transform = "translateY(-50%)";
			tooltip.style.left = Math.max(pad, left) + "px";
			tooltip.style.top = Math.max(height / 2 + pad, Math.min(middle, window.innerHeight - height / 2 - pad)) + "px";
		}

		tooltip.classList.add("grid-tooltip--visible");
	};

	const showTooltipForMouse = (event: PointerEvent) => {
		const cell = (event.target as HTMLElement).closest<HTMLElement>(".cell");
		if (!cell) {
			hideTooltip();
			return;
		}
		pinnedCell = null;
		lastAnchorAbove = false;
		updateTooltip(cell, false);
	};

	const pinTooltip = (cell: HTMLElement) => {
		lastAnchorAbove = true;
		updateTooltip(cell, true);
		pinnedCell = cell;
	};

	const LONG_PRESS_MS = 400;
	const LONG_PRESS_SLOP = 6;

	let pressTimer: number | null = null;
	let pressStartX = 0;
	let pressStartY = 0;
	let inspecting = false;
	let inspectedCell: HTMLElement | null = null;
	let lastPointerWasTouch = false;

	const cellAtPoint = (x: number, y: number) => document.elementFromPoint(x, y)?.closest<HTMLElement>(".cell") ?? null;

	const cancelPress = () => {
		if (pressTimer !== null) clearTimeout(pressTimer);
		pressTimer = null;
	};

	const stopInspecting = () => {
		cancelPress();
		inspecting = false;
		inspectedCell = null;
		hideTooltip();
	};

	layout.addEventListener("pointerdown", (event) => {
		if (event.pointerType !== "mouse") return;
		lastPointerWasTouch = false;
		suppressClick = false;
		showTooltipForMouse(event);
	});

	layout.addEventListener("pointermove", (event) => {
		if (event.pointerType !== "mouse") return;
		lastPointerX = event.clientX;
		lastPointerY = event.clientY;
		showTooltipForMouse(event);
	});

	layout.addEventListener("pointerleave", (event) => {
		if (event.pointerType === "mouse") hideTooltip();
	});

	layout.addEventListener(
		"touchstart",
		(event) => {
			suppressClick = false;
			lastPointerWasTouch = true;
			cancelPress();
			hideTooltip();
			if (event.touches.length !== 1) return;

			const touch = event.touches[0];
			pressStartX = touch.clientX;
			pressStartY = touch.clientY;
			lastPointerX = touch.clientX;
			lastPointerY = touch.clientY;
			const cell = cellAtPoint(touch.clientX, touch.clientY);
			if (!cell) return;

			pressTimer = window.setTimeout(() => {
				pressTimer = null;
				inspecting = true;
				inspectedCell = cell;
				lastAnchorAbove = true;
				updateTooltip(cell, true);
			}, LONG_PRESS_MS);
		},
		{ passive: true },
	);

	layout.addEventListener(
		"touchmove",
		(event) => {
			const touch = event.touches[0];
			if (!touch) return;
			lastPointerX = touch.clientX;
			lastPointerY = touch.clientY;

			if (!event.cancelable || event.touches.length !== 1) {
				stopInspecting();
				return;
			}

			if (inspecting) {
				event.preventDefault();
				inspectedCell = cellAtPoint(touch.clientX, touch.clientY);
				if (inspectedCell) updateTooltip(inspectedCell, true);
				else hideTooltip();
				return;
			}

			// Moving before the press lands means this is a scroll, not an inspect.
			if (Math.hypot(touch.clientX - pressStartX, touch.clientY - pressStartY) > LONG_PRESS_SLOP) cancelPress();
		},
		{ passive: false },
	);

	layout.addEventListener(
		"touchend",
		(event) => {
			const wasInspecting = inspecting;
			const tapped = !wasInspecting && pressTimer !== null;
			const touch = event.changedTouches[0];
			const releasedOn = touch ? cellAtPoint(touch.clientX, touch.clientY) : null;
			const cell = wasInspecting ? inspectedCell : releasedOn;
			stopInspecting();
			if (!wasInspecting && !tapped) return;

			if (event.cancelable) event.preventDefault();
			suppressClick = true;
			if (!cell) return;
			selectCell(cell);
			pinTooltip(cell);
		},
		{ passive: false },
	);

	layout.addEventListener("touchcancel", stopInspecting);

	document.addEventListener(
		"pointerdown",
		(event) => {
			if (!layout.contains(event.target as Node)) hideTooltip();
		},
		true,
	);

	layout.addEventListener("contextmenu", (event) => {
		if (lastPointerWasTouch) event.preventDefault();
	});

	const followScroll = () => {
		if (!tooltip.classList.contains("grid-tooltip--visible")) return;

		if (pinnedCell) {
			const cellRect = pinnedCell.getBoundingClientRect();
			const centerX = cellRect.left + cellRect.width / 2;
			const centerY = cellRect.top + cellRect.height / 2;
			if (cellAtPoint(centerX, centerY) !== pinnedCell) hideTooltip();
			else updateTooltip(pinnedCell, true);
			return;
		}

		const elementUnder = document.elementFromPoint(lastPointerX, lastPointerY);
		if (!elementUnder) return;
		const cell = elementUnder.closest<HTMLElement>(".cell");
		if (!cell) {
			hideTooltip();
			return;
		}
		updateTooltip(cell, lastAnchorAbove);
	};

	// The sidebar scrolls on desktop, the grid container on mobile.
	document.getElementById("sidebar")!.addEventListener("scroll", followScroll);
	document.getElementById("grid-container")!.addEventListener("scroll", followScroll);
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
		// collection data unavailable - "Appears in" section won't render
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
