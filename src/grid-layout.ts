import type { Day } from "./types";
import type { GridConfig, GridLevel, GridUnit } from "./site-config";

/**
 * Where the grid's boxes go, and what colour one standing for many days takes. Pure, like
 * `days.ts`, so that the arithmetic can be tested without a page: `grid.ts` draws what this lays out.
 *
 * Every unit is counted from a fixed point — days and weeks from a Monday, months and years from the
 * calendar's own — and a box's column is its count modulo the columns. So the days of a week share a
 * row starting on Monday, as they always have, and six months to a row puts January at the start of
 * every other one, whichever page the row is on.
 */

/** A period of `config.yaml`, cut to the run. Inclusive ISO dates. */
export interface Period {
	label: string;
	start: string;
	end: string;
}

export interface GridBox {
	/** The box's first and last days, as indices into the run's days. */
	first: number;
	last: number;
	start: string;
	end: string;
	row: number;
	col: number;
}

/** A label down the side of the grid, over the rows from `startRow` up to `endRow`. */
export interface LabelSpan {
	/** What is written: `'85`. */
	text: string;
	/** What it is called, for a reader who cannot see it: `1985`. */
	name: string;
	startRow: number;
	endRow: number;
	/** The first and last boxes it labels, as indices into the page's boxes. */
	firstBox: number;
	lastBox: number;
}

export interface GridPage {
	boxes: GridBox[];
	rows: number;
	/** The labels beside the grid on a wide screen, and on a narrow one, where the year rail has the years. */
	labels: LabelSpan[];
	narrowLabels: LabelSpan[];
	/** The year rail's years, at every level that has years to jump between. */
	rail: LabelSpan[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

function dayNumber(date: string): number {
	return Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10))) / DAY_MS;
}

function isoOf(number: number): string {
	return new Date(number * DAY_MS).toISOString().slice(0, 10);
}

/**
 * The periods, cut to the run between `runStart` and `runEnd`. Each ends the day before the next
 * begins, the first takes in whatever comes before it, and the last whatever comes after; one left
 * with no day of the run is dropped.
 */
export function resolvePeriods(periods: GridConfig["periods"], runStart: string, runEnd: string): Period[] {
	const result: Period[] = [];
	periods.forEach((period, index) => {
		const next = periods[index + 1];
		const start = index === 0 || period.start < runStart ? runStart : period.start;
		const end = next && next.start <= runEnd ? isoOf(dayNumber(next.start) - 1) : runEnd;
		if (start <= end) result.push({ label: period.label, start, end });
	});
	return result;
}

/** How many pages a level has: one per period when it is paged, else one. */
export function pageCount(level: GridLevel, periods: readonly Period[]): number {
	return level.paged ? Math.max(1, periods.length) : 1;
}

function periodIndexOf(date: string, periods: readonly Period[]): number {
	const index = periods.findIndex((period) => date <= period.end);
	return index === -1 ? periods.length - 1 : index;
}

/** The page of `level` that holds `date`. */
export function pageOf(date: string, level: GridLevel, periods: readonly Period[]): number {
	return level.paged && periods.length > 0 ? periodIndexOf(date, periods) : 0;
}

/** Which box of its unit a day falls in, counted from a fixed point so that columns line up across pages. */
function ordinalOf(date: string, unit: GridUnit, periods: readonly Period[]): number {
	switch (unit) {
		// 1970-01-05 was a Monday, and is day 4: three more puts every Monday on a multiple of seven.
		case "day":
			return dayNumber(date) + 3;
		case "week":
			return Math.floor((dayNumber(date) + 3) / 7);
		case "month":
			return Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7)) - 1;
		case "year":
			return Number(date.slice(0, 4));
		case "period":
			return periodIndexOf(date, periods);
	}
}

export const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const LONG_MONTH_NAMES = [
	"January",
	"February",
	"March",
	"April",
	"May",
	"June",
	"July",
	"August",
	"September",
	"October",
	"November",
	"December",
];

interface LabelKind {
	key: (date: string) => string;
	text: (key: string) => string;
	name: (key: string) => string;
}

const YEAR_LABELS: LabelKind = {
	key: (date) => date.slice(0, 4),
	text: (year) => `'${year.slice(2)}`,
	name: (year) => year,
};

const DECADE_LABELS: LabelKind = {
	key: (date) => date.slice(0, 3),
	text: (decade) => `'${decade.slice(2)}0s`,
	name: (decade) => `${decade}0s`,
};

const MONTH_LABELS: LabelKind = {
	key: (date) => date.slice(0, 7),
	text: (month) => MONTH_NAMES[Number(month.slice(5, 7)) - 1],
	name: (month) => `${LONG_MONTH_NAMES[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`,
};

/**
 * The side labels for each unit, on a wide screen and a narrow one. A narrow screen has the wide
 * labels on the year rail, so it labels the side only where there is something finer to say.
 * Periods are their own labels.
 */
const LABELS: Record<GridUnit, { wide: LabelKind | null; narrow: LabelKind | null }> = {
	day: { wide: YEAR_LABELS, narrow: MONTH_LABELS },
	week: { wide: YEAR_LABELS, narrow: MONTH_LABELS },
	month: { wide: YEAR_LABELS, narrow: null },
	year: { wide: DECADE_LABELS, narrow: null },
	period: { wide: null, narrow: null },
};

function labelSpans(boxes: readonly GridBox[], rows: number, kind: LabelKind | null): LabelSpan[] {
	if (!kind) return [];
	const spans: LabelSpan[] = [];
	boxes.forEach((box, index) => {
		const key = kind.key(box.start);
		const current = spans[spans.length - 1];
		if (current && kind.key(boxes[current.firstBox].start) === key) {
			current.lastBox = index;
			return;
		}
		if (current) current.endRow = Math.max(box.row, current.startRow + 1);
		spans.push({
			text: kind.text(key),
			name: kind.name(key),
			startRow: box.row,
			endRow: rows,
			firstBox: index,
			lastBox: index,
		});
	});
	return spans;
}

/**
 * One page of one level: a box for each of its unit's stretches that falls on the page, holding the
 * page's days in it. A stretch the page's edge cuts through — a week across New Year, where the
 * periods change at New Year — is drawn on both pages, each with its own part.
 */
export function layoutPage(days: readonly Day[], level: GridLevel, periods: readonly Period[], page: number): GridPage {
	const runStart = dayNumber(days[0].date);
	const period = level.paged ? periods[page] : undefined;
	const first = period ? dayNumber(period.start) - runStart : 0;
	const last = period ? dayNumber(period.end) - runStart : days.length - 1;

	const boxes: GridBox[] = [];
	let firstRow = 0;
	let previousOrdinal: number | null = null;
	for (let index = first; index <= last; index++) {
		const date = days[index].date;
		const ordinal = ordinalOf(date, level.unit, periods);
		if (ordinal === previousOrdinal) {
			const box = boxes[boxes.length - 1];
			box.last = index;
			box.end = date;
			continue;
		}
		previousOrdinal = ordinal;
		const absoluteRow = Math.floor(ordinal / level.columns);
		if (boxes.length === 0) firstRow = absoluteRow;
		boxes.push({
			first: index,
			last: index,
			start: date,
			end: date,
			row: absoluteRow - firstRow,
			col: ordinal - absoluteRow * level.columns,
		});
	}

	const rows = boxes.length === 0 ? 0 : boxes[boxes.length - 1].row + 1;
	return {
		boxes,
		rows,
		labels: labelSpans(boxes, rows, LABELS[level.unit].wide),
		narrowLabels: labelSpans(boxes, rows, LABELS[level.unit].narrow),
		rail: labelSpans(boxes, rows, level.unit === "period" ? null : YEAR_LABELS),
	};
}

/** What a box is, for its tooltip, short of a day's, which the grid writes in full. */
export function boxName(box: GridBox, unit: GridUnit, periods: readonly Period[]): string {
	switch (unit) {
		case "day":
			return box.start;
		case "week":
			return box.start === box.end ? box.start : `${box.start} – ${box.end}`;
		case "month":
			return MONTH_LABELS.name(box.start.slice(0, 7));
		case "year":
			return box.start.slice(0, 4);
		case "period":
			return periods[periodIndexOf(box.start, periods)].label;
	}
}

/**
 * How a page lights a day: a search's tier for it, `true` for a match with no tier (a book's strips,
 * the bookmarks), `false` for a day it dims, and `undefined` on a page that lights nothing.
 */
export type Light = number | boolean | undefined;

/** How a box is drawn: as a day with a strip or without, lit as `light` says. */
export interface Look {
	hasComic: boolean;
	light: Light;
}

const STRONGEST = 15;

/**
 * How strongly a day shows, strongest highest: a match by its tier, then a matched day with no
 * strip of its own — a rerun — then, on a page that lights nothing, a strip, then no strip, and
 * last the dimmed: a strip, then no strip.
 */
function strength(hasComic: boolean, light: Light): number {
	if (light === undefined) return hasComic ? 6 : 5;
	if (light === false) return hasComic ? 2 : 1;
	if (!hasComic) return 10;
	return 10 + (light === true ? 5 : light);
}

/**
 * A box standing for many days shows its strongest one, so a single match among them lights it,
 * and it is grey only if every day in it is. Bookmarks are not drawn on such a box at all.
 */
export function boxLook(days: readonly Day[], box: GridBox, lightOf: ((date: string) => Light) | undefined): Look {
	let best = -1;
	let look: Look = { hasComic: false, light: undefined };
	for (let index = box.first; index <= box.last; index++) {
		const day = days[index];
		const hasComic = day.state !== "none";
		const light = lightOf?.(day.date);
		const score = strength(hasComic, light);
		if (score <= best) continue;
		best = score;
		// A matched day with no strip is grey whatever its tier, as a rerun's cell is.
		look = { hasComic, light: !hasComic && light !== undefined && light !== false ? true : light };
		if (best === STRONGEST) break;
	}
	return look;
}
