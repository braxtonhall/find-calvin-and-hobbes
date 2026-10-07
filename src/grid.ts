import "./grid.css";

import { Day, Route } from "./types";
import { computeDays } from "./days";
import { clearRowHighlights, scrollCellIntoViewIfNeeded, visibleBand } from "./utils";
import { state } from "./state";
import { loadDescriptions } from "./details";
import { isPlainClick, parseRoute } from "./router";
import { buildComicPath } from "./routes";
import { libraryDates } from "./ownership";
import { addressOf } from "./base-path";
import { formatDateRange, formatLongDate } from "./date-utils";
import { ARCS, CHARACTERS, COLLECTION_INDEX, CREATORS, RERUNS } from "./bundled-data";
import { PAGE_CONFIG } from "./site-config";
import { Board, setBoardSource, stopLife } from "./life";
import {
	GridBox,
	GridPage,
	LabelSpan,
	MONTH_NAMES,
	Light,
	Period,
	boxLook,
	boxName,
	layoutPage,
	pageCount,
	pageOf,
	resolvePeriods,
} from "./grid-layout";

const GRID = PAGE_CONFIG.grid;

/** The run's periods, cut to it once its days are known. */
let periods: Period[] = [];

/** Which of the levels the grid is at, and which of that level's pages it is showing. */
const view = { level: GRID.zoom, page: 0 };

interface Drawn {
	page: GridPage;
	/** Whether the boxes stand for many days each, rather than one. */
	aggregate: boolean;
	/** One per box, in the page's order. */
	cells: HTMLElement[];
	/** The cell each of the page's days is in. */
	byDate: Map<string, HTMLElement>;
}

let drawn: Drawn | null = null;

let grid: HTMLElement;
let tooltip: HTMLElement;

export function updateGridStatesFromData(): void {
	// The days themselves, which a box standing for many reads its colour from, and which the grid
	// is drawn from again whenever it changes page.
	for (const day of state.allDays) {
		if (day.state !== "has-comic") continue;
		const comicsForDate = state.comicsByDate.get(day.date);
		if (!comicsForDate || comicsForDate.length === 0) day.state = "none";
	}
	if (!drawn) return;
	if (drawn.aggregate) {
		paintGrid(parseRoute());
		return;
	}
	const { cells, page } = drawn;
	cells.forEach((element, index) => {
		const day = state.allDays[page.boxes[index].first];
		if (state.reruns.has(day.date)) element.classList.add("cell--rerun");
		if (day.state === "none" && element.classList.contains("cell--has-comic")) {
			element.classList.remove("cell--has-comic");
			element.classList.add("cell--none");
		}
	});
}

export function buildGridData(): void {
	state.allDays = computeDays();
	periods = resolvePeriods(GRID.periods, state.allDays[0].date, state.allDays[state.allDays.length - 1].date);
}

/**
 * Text a column of labels is always as wide as, though it is never seen: the sidebar on mobile is as
 * wide as what is in it, and would otherwise narrow on a page with shorter labels, or none.
 */
function createLabelSizer(texts: readonly string[]): HTMLElement {
	const sizer = document.createElement("div");
	sizer.className = "grid-label-sizer";
	sizer.setAttribute("aria-hidden", "true");
	for (const text of texts) {
		const label = document.createElement("div");
		label.className = "grid-sticky-label";
		label.textContent = text;
		sizer.appendChild(label);
	}
	return sizer;
}

function createLabelColumn(className: string, spans: LabelSpan[], sizer: readonly string[] = []): HTMLElement {
	const column = document.createElement("div");
	column.className = `grid-labels ${className}`;
	if (sizer.length > 0) column.appendChild(createLabelSizer(sizer));

	for (const span of spans) {
		// Grid lines are 1-based, so row N of the grid sits between lines N and N+1.
		const wrap = document.createElement("div");
		wrap.className = "grid-label-wrap";
		wrap.style.gridRowStart = String(span.startRow + 1);
		wrap.style.gridRowEnd = String(span.endRow + 1);

		const label = document.createElement("div");
		label.className = "grid-sticky-label";
		label.textContent = span.text;

		wrap.appendChild(label);
		column.appendChild(wrap);
	}

	return column;
}

const HIGHLIGHT_DEADZONE_DAYS = 2 * 7;

/** Rows to a `.grid-chunk`: small enough that a screenful is a handful, large enough to be few. */
const ROWS_PER_CHUNK = 8;

/**
 * Where a row sits, worked out from the grid's own box rather than read off a cell: an off-screen
 * chunk of the grid is skipped by the browser, and measuring a cell in one would have it laid out
 * again on every scroll.
 */
function rowGeometry(): { gap: number; pitch: number } {
	const gap = parseFloat(getComputedStyle(grid).rowGap) || 0;
	const rows = drawn?.page.rows || 1;
	return { gap, pitch: (grid.getBoundingClientRect().height + gap) / rows };
}

interface RailEntry {
	button: HTMLButtonElement;
	firstRow: number;
	lastRow: number;
}

let railEntries: RailEntry[] = [];

function updateActiveYears(): void {
	const { top, bottom } = visibleBand();
	const gridTop = grid.getBoundingClientRect().top;
	const { gap, pitch } = rowGeometry();
	const cellSize = pitch - gap;
	for (const { button, firstRow, lastRow } of railEntries) {
		const onScreen = gridTop + firstRow * pitch < bottom && gridTop + lastRow * pitch + cellSize > top;
		button.classList.toggle("year-rail-button--active", onScreen);
		if (onScreen) button.setAttribute("aria-current", "true");
		else button.removeAttribute("aria-current");
	}
}

/** The year rail's buttons, one for each of the page's years. */
function drawYearRail(page: GridPage, deadzone: number): void {
	const rail = document.getElementById("year-rail")!;
	const scroller = document.getElementById("grid-container")!;

	railEntries = page.rail.map((span) => {
		const button = document.createElement("button");
		button.type = "button";
		button.className = "year-rail-button";
		button.setAttribute("aria-label", `Jump to ${span.name}`);

		const pill = document.createElement("span");
		pill.className = "year-rail-pill";
		pill.textContent = span.text;
		button.appendChild(pill);

		button.addEventListener("click", () => {
			scroller.scrollTo({ top: span.startRow * rowGeometry().pitch, behavior: "smooth" });
		});

		const lastBox = page.boxes[Math.max(span.firstBox, span.lastBox - deadzone)];
		return { button, firstRow: span.startRow, lastRow: lastBox.row };
	});

	// The rail keeps its width whichever years it lists, or none, for the same reason the labels do.
	const sizer = document.createElement("span");
	sizer.className = "year-rail-pill year-rail-sizer";
	sizer.setAttribute("aria-hidden", "true");
	sizer.textContent = "'00";
	rail.replaceChildren(...railEntries.map((entry) => entry.button), sizer);
	updateActiveYears();
}

function attachYearRail(): void {
	let queued = false;
	const queueUpdate = () => {
		if (queued) return;
		queued = true;
		requestAnimationFrame(() => {
			queued = false;
			updateActiveYears();
		});
	};

	document.getElementById("grid-scroller")!.addEventListener("scroll", queueUpdate);
	document.getElementById("grid-container")!.addEventListener("scroll", queueUpdate);
	window.addEventListener("resize", queueUpdate);

	attachRailScrubbing();
}

/**
 * A finger run along the rail jumps the grid to each year it passes over, and the rail lights them
 * as it goes. A tap is still only a tap: nothing happens until the finger reaches another year, and
 * then the jumps are instant, since a smooth scroll would trail behind the finger.
 */
function attachRailScrubbing(): void {
	const rail = document.getElementById("year-rail")!;
	const scroller = document.getElementById("grid-container")!;
	let pointer: number | null = null;
	let current: HTMLButtonElement | null = null;
	let scrubbed = false;

	const buttonAt = (event: PointerEvent) =>
		document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLButtonElement>(".year-rail-button") ?? null;

	rail.addEventListener("pointerdown", (event) => {
		pointer = event.pointerId;
		current = buttonAt(event);
		scrubbed = false;
	});

	rail.addEventListener("pointermove", (event) => {
		if (event.pointerId !== pointer) return;
		const button = buttonAt(event);
		if (!button || button === current || !rail.contains(button)) return;
		current = button;
		scrubbed = true;
		const entry = railEntries.find((candidate) => candidate.button === button);
		if (entry) scroller.scrollTo({ top: entry.firstRow * rowGeometry().pitch });
	});

	const end = (event: PointerEvent) => {
		if (event.pointerId === pointer) pointer = null;
	};
	rail.addEventListener("pointerup", end);
	rail.addEventListener("pointercancel", end);

	// The finger lifting at the end of a run would otherwise click the year it started on, and
	// scroll back to it.
	rail.addEventListener(
		"click",
		(event) => {
			if (!scrubbed) return;
			scrubbed = false;
			event.stopPropagation();
		},
		true,
	);
}

/**
 * Marks the chunks on screen, for `.grid-chunk--in-view`. The viewport is the root, so the scroller
 * on desktop and the grid's container on mobile both clip it — and a closed mobile sidebar,
 * being off screen, has none.
 */
const chunkObserver =
	typeof IntersectionObserver === "undefined"
		? null
		: new IntersectionObserver((entries) => {
				for (const entry of entries) entry.target.classList.toggle("grid-chunk--in-view", entry.isIntersecting);
			});

function watchChunksInView(chunks: HTMLElement[]): void {
	chunkObserver?.disconnect();
	for (const chunk of chunks) chunkObserver?.observe(chunk);
}

function createDayCell(day: Day): HTMLElement {
	// An anchor, so that cmd-click opens the day in a new tab and right-click offers its address.
	// `attachRouteLinkHandler` catches the plain click and re-renders in place as it always has.
	const cell = document.createElement("a");
	cell.className = `cell cell--${day.state}`;
	// Drawn again after the archive has arrived, as a change of page does, it knows its reruns.
	if (state.dataLoaded && state.reruns.has(day.date)) cell.classList.add("cell--rerun");
	cell.href = addressOf(buildComicPath(day.date));
	// Out of the tab order deliberately. There are one of these per day of the run, and the grid
	// sits ahead of `main`, so a reader tabbing towards the content would walk the whole archive to
	// reach it. The href is here to be copied and opened, not stepped through; stepping through the
	// comics is what the arrow keys on a detail page are for.
	cell.tabIndex = -1;
	// A ten-pixel link is a drag waiting to happen by accident, and dragging one has no use worth
	// the misfires.
	cell.draggable = false;
	cell.dataset.date = day.date;

	cell.setAttribute("aria-label", formatLongDate(day.date) + (day.state !== "none" ? " — has comic" : ""));

	// Only visible on mobile, where cells are large enough to hold a number.
	const dateLabel = document.createElement("span");
	dateLabel.className = "cell-date";
	dateLabel.setAttribute("aria-hidden", "true");
	dateLabel.textContent = String(Number(day.date.substring(8, 10)));
	cell.appendChild(dateLabel);
	return cell;
}

/** A box standing for many days, which zooms in on them when clicked. Out of the tab order, as a day's is. */
function createBoxCell(box: GridBox, label: string): HTMLElement {
	const cell = document.createElement("button");
	cell.type = "button";
	cell.className = "cell cell--aggregate";
	cell.tabIndex = -1;
	cell.dataset.start = box.start;
	cell.dataset.label = label;
	cell.setAttribute("aria-label", `${label} — zoom in`);
	// A period is big enough to say which it is, and there is no other label to say so.
	if (GRID.levels[view.level].unit === "period") {
		const name = document.createElement("span");
		name.className = "cell-label";
		name.setAttribute("aria-hidden", "true");
		name.textContent = label;
		cell.appendChild(name);
	}
	return cell;
}

function boxLabel(box: GridBox): string {
	const unit = GRID.levels[view.level].unit;
	return unit === "week" ? formatDateRange(box.start, box.end) : boxName(box, unit, periods);
}

/** Draws the page the grid is on, at the level it is at, unlit: `paintGrid` lights it. */
function drawGrid(): void {
	// Both hold cells that are about to go, and the hovered one's rows are lit with it.
	stopLife();
	state.hoveredCell = null;
	clearRowHighlights();
	tooltip.classList.remove("grid-tooltip--visible");

	const level = GRID.levels[view.level];
	const page = layoutPage(state.allDays, level, periods, view.page);
	const aggregate = level.unit !== "day";
	const layout = document.getElementById("grid-layout")!;
	layout.style.setProperty("--columns", String(level.columns));
	document.querySelector(".grid-header-row")!.classList.toggle("grid-header-row--hidden", aggregate);

	// The rows are drawn in chunks the browser can skip while they are off screen (see
	// `.grid-chunk`), so that lighting or dimming the whole grid only restyles the part in view.
	const chunks: HTMLElement[] = [];
	for (let firstRow = 0; firstRow < page.rows; firstRow += ROWS_PER_CHUNK) {
		const chunk = document.createElement("div");
		chunk.className = "grid-chunk";
		chunk.style.setProperty("--chunk-rows", String(Math.min(ROWS_PER_CHUNK, page.rows - firstRow)));
		chunks.push(chunk);
	}

	const cells: HTMLElement[] = [];
	const byDate = new Map<string, HTMLElement>();
	for (const box of page.boxes) {
		const cell = aggregate ? createBoxCell(box, boxLabel(box)) : createDayCell(state.allDays[box.first]);
		cell.style.gridArea = `${(box.row % ROWS_PER_CHUNK) + 1} / ${box.col + 1}`;
		for (let index = box.first; index <= box.last; index++) byDate.set(state.allDays[index].date, cell);
		chunks[Math.floor(box.row / ROWS_PER_CHUNK)].appendChild(cell);
		cells.push(cell);
	}

	grid.replaceChildren(...chunks);
	watchChunksInView(chunks);
	drawn = { page, aggregate, cells, byDate };

	layout.replaceChildren(
		grid,
		// Sized for the months at every level, so the grid's column, and the buttons under it, keep
		// their width as it zooms.
		createLabelColumn("month-labels", page.narrowLabels, MONTH_NAMES),
		createLabelColumn("year-labels", page.labels),
	);

	drawYearRail(page, level.unit === "day" ? HIGHLIGHT_DEADZONE_DAYS : 0);
	updateControls();
}

/** The cell showing `date`: its own, or the box it is in when zoomed out. None when it is on another page. */
export function cellForDate(date: string): HTMLElement | null {
	return drawn?.byDate.get(date) ?? null;
}

/** `date`'s own cell, when the grid is drawing days and `date` is on the page. */
export function dayCell(date: string): HTMLElement | null {
	return drawn && !drawn.aggregate ? cellForDate(date) : null;
}

/** Turns to the page holding `date`, when the grid is showing another. Undrawn: `paintGrid` lights it. */
function showDate(date: string): void {
	if (!drawn || drawn.byDate.has(date)) return;
	const page = pageOf(date, GRID.levels[view.level], periods);
	if (page === view.page) return;
	abandonMove();
	const direction = Math.sign(page - view.page);
	view.page = page;
	drawGrid();
	arrive(slide(direction));
}

/** A search's best matches: the days of its highest tier. */
function bestMatches(tiers: ReadonlyMap<string, number>): Set<string> {
	let best = 0;
	for (const tier of tiers.values()) best = Math.max(best, tier);
	return new Set([...tiers].filter(([, tier]) => tier === best).map(([date]) => date));
}

/** The pages that light a set of strips of their own, in `state.collectionDateSet`: a book's, an arc's, a creator's. */
const LIGHTS_ITS_OWN = new Set<Route["view"]>(["collection", "arc", "creator"]);

/**
 * What the page showing is about, and the days the grid should turn to for it: a search's best
 * matches, a book's or an arc's strips, the bookmarks. `null` where the page is about no days, or
 * they are not known yet.
 */
function subjectOf(route: Route): { key: string; dates: ReadonlySet<string> } | null {
	const tiers = state.searchResultTiers;
	if (route.view === "results" && tiers) return { key: `results:${route.q ?? ""}`, dates: bestMatches(tiers) };
	if (route.view === "library" && state.bookmarksLoaded) {
		const key = `library:${route.q ?? ""}`;
		return { key, dates: tiers ? bestMatches(tiers) : libraryDates() };
	}
	if (LIGHTS_ITS_OWN.has(route.view) && state.collectionDateSet) {
		return { key: `${route.view}:${route.id ?? ""}`, dates: state.collectionDateSet };
	}
	return null;
}

/** The subject the grid last turned to, so that it turns once a visit and the reader can page away. */
let subjectShown: string | null = null;

/**
 * Turns the grid to the page the page showing is about. A strip's page always shows its strip. Any
 * other turns to its subject's days the first time they are known, and then leaves the grid to the
 * reader — the page drawing again, as it does when the archive or the bookmarks arrive, does not
 * turn it back. Leaving forgets the subject, so coming back to it turns there again.
 */
export function followRoute(route: Route): void {
	if (route.view === "detail" && route.date) {
		subjectShown = null;
		// A turn still fading out was asked for before the strip was: the strip has the say.
		abandonMove();
		showDate(route.date);
		return;
	}
	const subject = subjectOf(route);
	if (!subject) {
		if (!["results", "library", ...LIGHTS_ITS_OWN].includes(route.view)) subjectShown = null;
		return;
	}
	if (subject.key === subjectShown) return;
	subjectShown = subject.key;
	abandonMove();
	showAnyOf(subject.dates);
}

/** Turns to the page holding the first of `dates`, unless the grid is already showing one of them. */
function showAnyOf(dates: ReadonlySet<string>): void {
	if (!drawn) return;
	let first: string | null = null;
	for (const date of dates) {
		if (drawn.byDate.has(date)) return;
		if (first === null || date < first) first = date;
	}
	if (first !== null) showDate(first);
}

const LIT_CLASSES = [
	"cell--search-match",
	"cell--search-nonmatch",
	"cell--search-t1",
	"cell--search-t2",
	"cell--search-t3",
	"cell--search-t4",
	"cell--search-t5",
];

function applyLight(cell: HTMLElement, light: Light): void {
	if (light === undefined) return;
	if (light === false) {
		cell.classList.add("cell--search-nonmatch");
		return;
	}
	cell.classList.add("cell--search-match");
	if (light !== true) cell.classList.add(`cell--search-t${light}`);
}

/** A box standing for many days, drawn as its strongest day is: see `boxLook`. */
function paintBox(
	cell: HTMLElement,
	box: GridBox,
	lightOf: ((date: string) => Light) | undefined,
	selected: string | null,
): void {
	const look = boxLook(state.allDays, box, lightOf);
	cell.classList.remove(...LIT_CLASSES, "cell--selected", "cell--has-comic", "cell--none");
	cell.classList.add(look.hasComic ? "cell--has-comic" : "cell--none");
	applyLight(cell, look.light);
	if (selected !== null && selected >= box.start && selected <= box.end) cell.classList.add("cell--selected");
}

/** How the page showing lights each day, or `undefined` where it lights none. */
function lightFor(route: Route): ((date: string) => Light) | undefined {
	const tiers = state.searchResultTiers;
	const byTier = tiers ? (date: string) => tiers.get(date) ?? false : undefined;

	if (route.view === "results") return byTier;

	// Lit and dimmed the way a book's page is, with the library as the book — once it is known;
	// until then an empty set would dim the whole grid, only to light it back up a moment later. A
	// search of them is lit as any search is.
	if (route.view === "library") {
		if (!state.bookmarksLoaded) return undefined;
		if (byTier) return byTier;
		const dates = libraryDates();
		return (date) => dates.has(date);
	}

	// A book's strips, an arc's or a creator's: whichever the page showing set out to light.
	const dates = state.collectionDateSet;
	if (LIGHTS_ITS_OWN.has(route.view) && dates) return (date) => dates.has(date);

	return undefined;
}

/** Lights the grid for `route`: bookmarks, the open strip, and whatever the page lights and dims. */
export function paintGrid(route: Route): void {
	if (!drawn) return;
	const { aggregate, cells, page } = drawn;
	const lightOf = lightFor(route);
	const selected = route.view === "detail" ? (route.date ?? null) : null;

	cells.forEach((cell, index) => {
		if (aggregate) {
			paintBox(cell, page.boxes[index], lightOf, selected);
			return;
		}
		const date = cell.dataset.date!;
		cell.classList.remove(...LIT_CLASSES, "cell--selected", "cell--bookmarked");
		if (state.bookmarkedDates.has(date)) cell.classList.add("cell--bookmarked");
		applyLight(cell, lightOf?.(date));
		if (date === selected) cell.classList.add("cell--selected");
	});
}

/**
 * Lights `dates` and dims the rest, as a book's page does, or with `null` takes that lighting off.
 * A day's cell has only the classes that differ toggled, so one already right costs no restyle and
 * starts no fade. Returns the cells lit.
 */
export function lightDates(dates: ReadonlySet<string> | null): HTMLElement[] {
	if (!drawn) return [];
	const { aggregate, cells, page } = drawn;
	const matched: HTMLElement[] = [];

	if (aggregate) {
		const route = parseRoute();
		const selected = route.view === "detail" ? (route.date ?? null) : null;
		const lightOf = dates ? (date: string) => dates.has(date) : undefined;
		cells.forEach((cell, index) => {
			paintBox(cell, page.boxes[index], lightOf, selected);
			if (cell.classList.contains("cell--search-match")) matched.push(cell);
		});
		return matched;
	}

	for (const cell of cells) {
		const date = cell.dataset.date;
		const matches = dates !== null && date !== undefined && dates.has(date);
		cell.classList.toggle("cell--search-match", matches);
		cell.classList.toggle("cell--search-nonmatch", dates !== null && !matches);
		if (matches) matched.push(cell);
	}
	return matched;
}

/** The grid as a board for the Game of Life: the page showing, each cell where it is drawn. */
function gridBoard(): Board | null {
	if (!drawn) return null;
	const columns = GRID.levels[view.level].columns;
	return {
		grid,
		cells: drawn.cells,
		positions: drawn.page.boxes.map((box) => box.row * columns + box.col),
		rows: drawn.page.rows,
		columns,
	};
}

// ─── The controls under the grid ────────────────────────────────────────────

interface Controls {
	bar: HTMLElement;
	previous: HTMLButtonElement;
	zoomOut: HTMLButtonElement;
	zoomIn: HTMLButtonElement;
	next: HTMLButtonElement;
}

let controls: Controls | null = null;

/**
 * Moves the grid to `level` and `page`, lit as the page showing lights it, with `anchor`'s cell in
 * view — or, with none, the top of the page.
 */
function goTo(level: number, page: number, anchor: string | null): void {
	view.level = level;
	view.page = page;
	drawGrid();
	paintGrid(parseRoute());
	const cell = anchor ? cellForDate(anchor) : null;
	if (cell) {
		cell.scrollIntoView({ block: "center" });
	} else {
		document.getElementById("grid-scroller")!.scrollTop = 0;
		document.getElementById("grid-container")!.scrollTop = 0;
	}
}

// ─── Moving between pages and levels ────────────────────────────────────────

/** How long the page showing takes to leave, and the next to arrive. */
const MOVE_OUT_MS = 110;
const MOVE_IN_MS = 180;
/** How far a page slides as it turns. */
const TURN_DISTANCE = 8;

/** A move whose page is still leaving, and how to finish it. */
let moving: { out: Animation; land: () => void } | null = null;

function prefersReducedMotion(): boolean {
	return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Brings the page just drawn in, from `from`: a transform it settles out of. */
function arrive(from: string): void {
	if (prefersReducedMotion()) return;
	document.getElementById("grid-layout")!.animate(
		[
			{ transform: from, opacity: 0 },
			{ transform: "none", opacity: 1 },
		],
		{ duration: MOVE_IN_MS, easing: "ease-out" },
	);
}

/**
 * The page showing fades out into `to`, `land` draws the next, and it fades in from `from`. A click
 * while a page is still leaving lands that move at once, and leaves from there, so a run of clicks
 * goes as far as it was asked to.
 */
function move(to: string, land: () => void, from: string): void {
	finishMove();
	if (prefersReducedMotion()) {
		land();
		return;
	}

	tooltip.classList.remove("grid-tooltip--visible");
	const out = document.getElementById("grid-layout")!.animate(
		[
			{ transform: "none", opacity: 1 },
			{ transform: to, opacity: 0 },
		],
		{ duration: MOVE_OUT_MS, easing: "ease-in", fill: "forwards" },
	);
	const current = { out, land };
	moving = current;
	out.finished.then(
		() => {
			if (moving !== current) return;
			moving = null;
			land();
			// Dropped only now, with the next page drawn under it, so the old one never flashes back.
			out.cancel();
			arrive(from);
		},
		() => {},
	);
}

/** Lands a move whose page is still leaving, at once. */
function finishMove(): void {
	if (!moving) return;
	const { out, land } = moving;
	moving = null;
	land();
	out.cancel();
}

/** Drops a move whose page is still leaving, for a route that turns the grid to a page of its own. */
function abandonMove(): void {
	if (!moving) return;
	moving.out.cancel();
	moving = null;
}

function slide(direction: number): string {
	return `translateX(${direction * TURN_DISTANCE}px)`;
}

/** Turns `by` pages: the page showing slides off towards the side it is on, and the next slides in from the other. */
function turnPage(by: number): void {
	finishMove();
	const pages = pageCount(GRID.levels[view.level], periods);
	const page = Math.max(0, Math.min(pages - 1, view.page + by));
	if (page === view.page) return;
	const direction = Math.sign(page - view.page);
	move(slide(-direction), () => goTo(view.level, page, null), slide(direction));
}

/** Zooms to `level` with `anchor` in view: the level showing fades out, and the next fades in. */
function zoomTo(level: number, anchor: string | null): void {
	if (level < 0 || level >= GRID.levels.length || level === view.level) return;
	move("none", () => goTo(level, anchor ? pageOf(anchor, GRID.levels[level], periods) : 0, anchor), "none");
}

/** The day to keep in view across a zoom: the open strip if it is on the page, else the first day showing. */
function anchorDate(): string | null {
	if (!drawn || drawn.page.boxes.length === 0) return null;
	const route = parseRoute();
	if (route.view === "detail" && route.date && drawn.byDate.has(route.date)) return route.date;

	const { pitch } = rowGeometry();
	const firstRow = Math.max(0, Math.round((visibleBand().top - grid.getBoundingClientRect().top) / pitch));
	const box = drawn.page.boxes.find((candidate) => candidate.row >= firstRow) ?? drawn.page.boxes[0];
	return box.start;
}

function zoom(by: number): void {
	finishMove();
	zoomTo(view.level + by, anchorDate());
}

function controlButton(className: string, text: string, label: string, onClick: () => void): HTMLButtonElement {
	const button = document.createElement("button");
	button.type = "button";
	button.className = `grid-control ${className}`;
	button.textContent = text;
	button.setAttribute("aria-label", label);
	button.addEventListener("click", onClick);
	return button;
}

function buildControls(): void {
	const bar = document.createElement("div");
	bar.className = "grid-controls";
	controls = {
		bar,
		previous: controlButton("grid-control--page", "‹", "Earlier", () => turnPage(-1)),
		zoomOut: controlButton("grid-control--zoom", "−", "Zoom out", () => zoom(1)),
		zoomIn: controlButton("grid-control--zoom", "+", "Zoom in", () => zoom(-1)),
		next: controlButton("grid-control--page", "›", "Later", () => turnPage(1)),
	};
	bar.append(controls.previous, controls.zoomOut, controls.zoomIn, controls.next);
	// Beside the scroller rather than in it, so that it stays put at the foot of the grid, and its
	// scrollbar never runs down past the buttons.
	document.getElementById("grid-column")!.appendChild(bar);
}

/** Shows only the buttons that do something here, and dims the ones at the end of their road. */
function updateControls(): void {
	if (!controls) return;
	const { bar, previous, zoomOut, zoomIn, next } = controls;
	const pages = pageCount(GRID.levels[view.level], periods);
	const paged = pages > 1;
	const zooms = GRID.levels.length > 1;

	for (const button of [previous, next]) {
		button.classList.toggle("grid-control--gone", !paged);
		button.inert = !paged;
	}
	zoomOut.hidden = zoomIn.hidden = !zooms;
	bar.hidden = !paged && !zooms;

	previous.disabled = view.page === 0;
	next.disabled = view.page === pages - 1;
	zoomIn.disabled = view.level === 0;
	zoomOut.disabled = view.level === GRID.levels.length - 1;

	if (paged) {
		previous.setAttribute("aria-label", previous.disabled ? "Earlier" : `Show ${periods[view.page - 1].label}`);
		next.setAttribute("aria-label", next.disabled ? "Later" : `Show ${periods[view.page + 1].label}`);
	}
}

export function renderGrid(): void {
	const layout = document.getElementById("grid-layout")!;

	grid = document.createElement("div");
	grid.id = "grid";

	tooltip = document.createElement("div");
	tooltip.className = "grid-tooltip";
	document.body.appendChild(tooltip);

	buildControls();
	attachYearRail();
	setBoardSource(gridBoard);

	// Opened on a strip, the grid starts on the page holding it, rather than drawing another first.
	const route = parseRoute();
	if (route.view === "detail" && route.date) view.page = pageOf(route.date, GRID.levels[view.level], periods);
	drawGrid();

	layout.addEventListener("click", (event) => {
		const cell = (event.target as HTMLElement).closest<HTMLElement>(".cell");
		if (!cell) return;
		// A box of many days zooms in on them.
		if (cell.dataset.start) {
			finishMove();
			zoomTo(view.level - 1, cell.dataset.start);
			return;
		}
		// The href does the navigating; this is only the scroll that used to ride along with it.
		// Skipped for a modified click, which is leaving the current page where it stands —
		// including its grid.
		if (!isPlainClick(event)) return;
		if (cell.dataset.date) scrollCellIntoViewIfNeeded(cell);
	});

	layout.addEventListener("mouseover", (event) => {
		if (state.keyboardNavActive) return;
		const cell = (event.target as HTMLElement).closest<HTMLElement>(".cell");
		if (!cell || cell === state.hoveredCell) return;
		// A box of many days has many rows; pointing at it is only the tooltip.
		if (!cell.dataset.date) return;
		const route = parseRoute();
		// The two pages whose rows are the grid's cells, lit and dimmed; anywhere else a hover is
		// only the tooltip.
		if (route.view !== "results" && route.view !== "library") return;
		// A rerun day holds no strip of its own — its strip is filed under the day it first ran — but it
		// is a row all the same, so it is not the empty day `cell--none` otherwise means.
		if (cell.classList.contains("cell--none") && !cell.classList.contains("cell--rerun")) return;
		if (cell.classList.contains("cell--search-nonmatch")) return;

		// By the light rather than by the hovered cell's day: zoomed out, a row may have lit a box,
		// which has none.
		state.hoveredCell?.classList.remove("cell--hover-highlight");
		clearRowHighlights();

		cell.classList.add("cell--hover-highlight");
		state.hoveredCell = cell;

		// The showing page's rows only: the other page keeps its rows while hidden, and a hidden row
		// cannot be scrolled to.
		const resultRows = document.querySelectorAll(`.view.active .result-row[data-date="${cell.dataset.date}"]`);
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
		clearRowHighlights();
		state.hoveredCell = null;
	});

	let lastMouseX = 0;
	let lastMouseY = 0;

	const updateTooltip = (cell: HTMLElement) => {
		tooltip.textContent = cell.dataset.label ?? formatLongDate(cell.dataset.date!);
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

	// The scroller scrolls on desktop, the grid container on mobile.
	document.getElementById("grid-scroller")!.addEventListener("scroll", followScroll);
	document.getElementById("grid-container")!.addEventListener("scroll", followScroll);
}

/**
 * The parts of the archive that ship inside the script. Set before anything is fetched, so `@in:`
 * knows the books from the first keystroke. See `bundled-data.ts`.
 */
function useBundledData(): void {
	state.reruns = new Map(Object.entries(RERUNS));
	state.collectionIndex = COLLECTION_INDEX;
	state.collectionsById = new Map(COLLECTION_INDEX.collections.map((collection) => [collection.id, collection]));
	state.arcs = ARCS;
	state.arcsById = new Map(ARCS.map((arc) => [arc.id, arc]));
	state.charactersById = new Map(CHARACTERS.map((character) => [character.id, character]));
	state.creatorsById = new Map(CREATORS.map((creator) => [creator.id, creator]));
}

export async function loadComicData(): Promise<void> {
	useBundledData();
	// Both requests leave now, side by side: the descriptions are wanted by fewer pages and are
	// waited on where they are, so nothing here holds the archive up for them.
	void loadDescriptions();

	try {
		const response = await fetch(addressOf("/comics.json"));
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
				<button id="retry-btn" style="padding:8px 16px;font-family:var(--font);font-size:14px;background:var(--main);color:#fff;border:none;border-radius:4px;cursor:pointer;">Retry</button>
			</div>`;
		document.getElementById("retry-btn")!.addEventListener("click", () => {
			document.getElementById("loading")!.innerHTML = '<div class="spinner"></div>';
			loadComicData();
		});
		return;
	}

	state.dataLoaded = true;
	updateGridStatesFromData();
	document.getElementById("loading")!.classList.add("hidden");

	resumeRoute();
}

// ─── Re-import from router (circular dependency resolved at runtime) ────────

import { resumeRoute } from "./router";
