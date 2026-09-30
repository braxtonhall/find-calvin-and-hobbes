import { state } from "./state";

/**
 * An easter egg: the Konami code turns the grid into a Game of Life board, seeded with whichever
 * cells were lit. It is drawn with data attributes alone, never classes, so that any class a cell
 * gains or loses while it runs is the app's doing — and anything the app does to the grid, short of
 * a hover ring, puts the grid back as it was.
 */

const CODE = [
	"arrowup",
	"arrowup",
	"arrowdown",
	"arrowdown",
	"arrowleft",
	"arrowright",
	"arrowleft",
	"arrowright",
	"b",
	"a",
];
const WINDOW_MS = 10_000;

const TICK_MS = 250;
const EXTINCTION_GRACE_MS = 3_000;
const HOVER_CLASS = "cell--hover-highlight";
const MODIFIER_KEYS = new Set(["Shift", "Control", "Alt", "Meta", "CapsLock"]);

export interface KeyPress {
	key: string;
	time: number;
}

/** Whether the last presses spell the code, inside the window. */
export function completesKonami(history: KeyPress[]): boolean {
	if (history.length < CODE.length) return false;
	const tail = history.slice(-CODE.length);
	const keys = tail.map((press) => press.key.toLowerCase());
	if (CODE.some((key, index) => keys[index] !== key)) return false;
	return tail[tail.length - 1].time - tail[0].time <= WINDOW_MS;
}

/**
 * One generation of B3/S23 on a board `cols` wide, stored row by row. Beyond its edges — before
 * Monday, after Sunday, above the first week and below the last — there is nothing.
 */
export function step(alive: Uint8Array, rows: number, cols = 7): Uint8Array {
	const next = new Uint8Array(alive.length);
	for (let row = 0; row < rows; row++) {
		for (let col = 0; col < cols; col++) {
			let neighbours = 0;
			for (let dRow = -1; dRow <= 1; dRow++) {
				const r = row + dRow;
				if (r < 0 || r >= rows) continue;
				for (let dCol = -1; dCol <= 1; dCol++) {
					const c = col + dCol;
					if (c < 0 || c >= cols || (dRow === 0 && dCol === 0)) continue;
					neighbours += alive[r * cols + c];
				}
			}
			const index = row * cols + col;
			next[index] = neighbours === 3 || (neighbours === 2 && alive[index]) ? 1 : 0;
		}
	}
	return next;
}

interface Run {
	grid: HTMLElement;
	cells: HTMLElement[];
	/** Where each cell sits on the board, by its place in `cells`. */
	positions: number[];
	/** Each cell's classes when the run began, less the hover ring, which may come and go freely. */
	snapshot: Map<HTMLElement, string>;
	board: Uint8Array;
	rows: number;
	interval: number | null;
	extinction: number | null;
	observer: MutationObserver;
}

let run: Run | null = null;

function renderingClasses(cell: HTMLElement): string {
	return [...cell.classList]
		.filter((name) => name !== HOVER_CLASS)
		.sort()
		.join(" ");
}

/** A cell the grid is showing as lit: a match, or on a page that dims nothing, any strip or bookmark. */
function isLit(cell: HTMLElement): boolean {
	const classes = cell.classList;
	if (classes.contains("cell--search-nonmatch")) return false;
	return (
		!classes.contains("cell--none") || classes.contains("cell--bookmarked") || classes.contains("cell--search-match")
	);
}

function draw(current: Run, previous: Uint8Array | null): void {
	current.cells.forEach((cell, index) => {
		const position = current.positions[index];
		if (previous && previous[position] === current.board[position]) return;
		cell.toggleAttribute("data-alive", current.board[position] === 1);
	});
}

function tick(): void {
	if (!run) return;
	const previous = run.board;
	run.board = step(previous, run.rows);
	draw(run, previous);
	if (!run.board.includes(1)) settle(run, true);
	else if (run.board.every((value, index) => value === previous[index])) settle(run, false);
}

/** A still board stops ticking and stays as it is; an empty one lingers a moment, then goes. */
function settle(current: Run, extinct: boolean): void {
	if (current.interval !== null) window.clearInterval(current.interval);
	current.interval = null;
	if (extinct) current.extinction = window.setTimeout(stopLife, EXTINCTION_GRACE_MS);
}

export function startLife(): void {
	stopLife();
	const grid = document.getElementById("grid");
	if (!grid || state.allDays.length === 0) return;

	const cells = [...grid.querySelectorAll<HTMLElement>(".cell")];
	const rows = state.allDays[state.allDays.length - 1].weekIndex + 1;
	// The cells were drawn from `allDays`, in its order, and the grid's columns run Monday to Sunday.
	const positions = state.allDays.map((day) => day.weekIndex * 7 + ((day.dayOfWeek + 6) % 7));
	const board = new Uint8Array(rows * 7);
	cells.forEach((cell, index) => {
		if (isLit(cell)) board[positions[index]] = 1;
	});

	const observer = new MutationObserver((records) => {
		if (!run) return;
		const { snapshot } = run;
		const changed = records.some((record) => {
			const cell = record.target as HTMLElement;
			return snapshot.has(cell) && renderingClasses(cell) !== snapshot.get(cell);
		});
		if (changed) stopLife();
	});

	run = {
		grid,
		cells,
		positions,
		snapshot: new Map(cells.map((cell) => [cell, renderingClasses(cell)])),
		board,
		rows,
		interval: null,
		extinction: null,
		observer,
	};

	grid.setAttribute("data-life", "");
	draw(run, null);
	observer.observe(grid, { subtree: true, attributeFilter: ["class"] });

	if (board.includes(1)) run.interval = window.setInterval(tick, TICK_MS);
	else settle(run, true);
}

/** Puts the grid back as the page draws it. Safe to call when nothing is running. */
export function stopLife(): void {
	if (!run) return;
	const current = run;
	run = null;
	if (current.interval !== null) window.clearInterval(current.interval);
	if (current.extinction !== null) window.clearTimeout(current.extinction);
	current.observer.disconnect();
	current.grid.removeAttribute("data-life");
	for (const cell of current.cells) cell.removeAttribute("data-alive");
}

/** Listens for the code, anywhere but in a text field. */
export function attachLifeEasterEgg(): void {
	const history: KeyPress[] = [];
	document.addEventListener("keydown", (event) => {
		const activeTag = (document.activeElement as HTMLElement | null)?.tagName;
		if (activeTag === "INPUT" || activeTag === "TEXTAREA" || activeTag === "SELECT") return;
		if (event.repeat || MODIFIER_KEYS.has(event.key)) return;

		history.push({ key: event.key, time: event.timeStamp });
		if (history.length > CODE.length) history.shift();
		if (!completesKonami(history)) return;

		history.length = 0;
		startLife();
	});
}
