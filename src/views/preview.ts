import { state } from "../state";
import { detailPageFrom } from "../pages/detail";
import { buildComicPath } from "../routes";
import { addressOf } from "../base-path";
import { PreviewStep, buildPreviewArrowsHtml, buildPreviewHtml, previewPageOf } from "../pages/preview";
import type { Place } from "../pages/page";
import { isPlainClick } from "../router";
import { cellForDate, setPreviewedDate } from "../grid";
import { isShowing, scrollCellIntoViewIfNeeded } from "../utils";
import { respell } from "../spelling";
import { weekdayOf } from "../date-utils";
import { attachDetailHandlers } from "./detail";
import { attachCellHighlightLink } from "./cell-highlight";
import { closeBookPopup } from "./books";
import { ROWS_DRAWN, resultsOf, rowAt } from "./result-rows";
import { alternatesOf, rowHrefOf } from "../pages/result-rows";
import { ownershipId } from "../library-file";

/*
 * A search's preview of one of its strips, beside the results, where the page is wide enough for
 * both. Picking a row, or a result's cell in the grid, shows its strip there rather than following
 * it to its own page, and the preview's arrows step through the results. Anything else followed from
 * the preview — a book, an arc, the strip's own page — is followed as anywhere else.
 *
 * The preview is not in the address. It outlives the results being drawn again — a keystroke, a
 * sort, a strip's page and back — for as long as its strip is still one of them.
 */

const STORAGE_KEY = "preview";

/** Whether the reader wants a preview at all; the toggle beside the sort button says. On until turned off. */
function previewEnabled(): boolean {
	try {
		return localStorage.getItem(STORAGE_KEY) !== "off";
	} catch {
		return true;
	}
}

function choosePreview(enabled: boolean): void {
	try {
		if (enabled) localStorage.removeItem(STORAGE_KEY);
		else localStorage.setItem(STORAGE_KEY, "off");
	} catch {
		// Storage blocked — the choice lasts as long as the page.
	}
	enabledHere = enabled;
}

let enabledHere = previewEnabled();

/** The results view, the block that lays the results and the preview side by side, and the two. */
let view: HTMLElement | null = null;
let layout: HTMLElement | null = null;
let list: HTMLElement | null = null;
let pane: HTMLElement | null = null;
let toggle: HTMLButtonElement | null = null;

/**
 * The strips the preview is showing, by their rows' `data-ownership`, which names one strip on one
 * day: a row picked from the results is its own strip; a cell picked from the grid, since a cell is a
 * day, is every strip of the day that was a result then, as the day's own page would have them. Fixed
 * when the preview opens, so the preview stays only while every one of them is still a result.
 * `null` when closed.
 */
let previewing: readonly string[] | null = null;

/**
 * Whether the preview is showing exactly `strips`: a day's cell, picked again, is followed to the
 * day's page rather than previewed again.
 */
function isPreviewing(strips: readonly string[]): boolean {
	return (
		previewing !== null && previewing.length === strips.length && strips.every((strip) => previewing!.includes(strip))
	);
}

/**
 * Whether the preview is showing `strip`, alone or as one of its day's: its row is marked, and,
 * picked again, is followed to its page rather than previewed again.
 */
function isShowingStrip(strip: string): boolean {
	return previewing?.includes(strip) ?? false;
}

/**
 * A result, by what its row says, whether or not the row is drawn yet: the results are drawn a batch
 * at a time, and the preview steps through, counts and finds a day among all of them.
 */
interface Entry {
	/** Where it sits among the results. */
	index: number;
	date: string;
	/** Its row's `data-ownership`. */
	strip: string;
	href: string;
	/** The transcripts its strip's page shows the alternate of first, as its row's link says. */
	alternates: string[];
}

/** `strips`' results among `all`, if every one of them is there; otherwise none. */
function rowsOf(all: Entry[], strips: readonly string[]): Entry[] {
	const shown = all.filter((entry) => strips.includes(entry.strip));
	return shown.length === strips.length ? shown : [];
}

const PREVIEW_ICON = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" aria-hidden="true">
	<rect class="preview-icon__pane" x="9" y="3.5" width="5" height="9" /><rect x="2" y="3.5" width="12" height="9" rx="1.5" />
</svg>`;

/**
 * Whether there is room for the preview: the stylesheet decides, by the width of the results view,
 * and says so in `--preview-fits`, so the width is written in one place.
 */
function fits(): boolean {
	return layout !== null && getComputedStyle(layout).getPropertyValue("--preview-fits").trim() === "1";
}

function available(): boolean {
	return enabledHere && view !== null && isShowing(view) && fits();
}

function entries(): Entry[] {
	return (list ? (resultsOf(list) ?? []) : []).map((result, index) => ({
		index,
		date: result.comic.date,
		strip: ownershipId(result.comic, result.comic.date),
		href: rowHrefOf(result),
		alternates: alternatesOf(result),
	}));
}

/** The row of `entry`, drawn for the purpose if it is not drawn yet. */
function rowOf(entry: Entry): HTMLElement | undefined {
	return list ? rowAt(list, entry.index) : undefined;
}

function stepOf(entry: Entry | undefined): PreviewStep | null {
	return entry ? { href: entry.href, date: entry.date } : null;
}

/** Marks the rows drawn of `shown`; a row drawn later is marked as it is drawn. */
function markRows(shown: readonly Entry[]): void {
	const strips = new Set(shown.map((entry) => entry.strip));
	for (const row of list?.querySelectorAll<HTMLElement>(".result-row") ?? []) {
		const marked = strips.has(row.dataset.ownership!);
		row.classList.toggle("result-row--previewing", marked);
		if (marked) row.setAttribute("aria-current", "true");
		else row.removeAttribute("aria-current");
	}
}

/** Where the rows previewed sit among the results. */
function placeOf(all: Entry[], shown: readonly Entry[]): Place {
	return { at: shown.map((entry) => entry.index + 1).sort((a, b) => a - b), of: all.length };
}

/**
 * The results either side of the rows previewed: the nearest not among them before the first, and
 * after it. A day's other strip, sorted further down, is no step from the day it is already part of.
 */
function neighbours(all: Entry[], shown: readonly Entry[]): [Entry | undefined, Entry | undefined] {
	const index = shown[0].index;
	return [
		all.slice(0, index).findLast((entry) => !shown.includes(entry)),
		all.slice(index + 1).find((entry) => !shown.includes(entry)),
	];
}

/** What scrolls the results: their own column beside a preview, or else the page. */
function resultsScroller(): HTMLElement {
	return layout?.classList.contains("results-layout--previewing")
		? layout.querySelector<HTMLElement>(".results-main")!
		: document.getElementById("main")!;
}

/**
 * Lays the results out beside the preview, or not, keeping them scrolled where they were: one of the
 * two scrollers takes over from the other, and both start the rows the view's padding down.
 */
function setPreviewing(beside: boolean): void {
	if (!layout || layout.classList.contains("results-layout--previewing") === beside) return;
	const scrolled = resultsScroller().scrollTop;
	layout.classList.toggle("results-layout--previewing", beside);
	resultsScroller().scrollTop = scrolled;
}

/** Scrolls the results to `row`, unless it is already in sight below the search bar. */
function scrollRowIntoView(row: HTMLElement): void {
	const scroller = resultsScroller();
	const frame = scroller.getBoundingClientRect();
	const top = view?.querySelector(".results-sticky")?.getBoundingClientRect().bottom ?? frame.top;
	const rect = row.getBoundingClientRect();
	if (rect.top >= top && rect.bottom <= frame.bottom) return;
	const centred = (top + frame.bottom) / 2 - rect.height / 2;
	scroller.scrollBy({ top: rect.top - centred, behavior: "smooth" });
}

/** The preview's arrows: a plain click steps, and the focus stays on the arrow it was on. */
function attachArrows(): void {
	pane?.querySelectorAll<HTMLAnchorElement>("a.preview-step").forEach((arrow) => {
		arrow.addEventListener("click", (event) => {
			if (!isPlainClick(event)) return;
			event.preventDefault();
			stepPreview(arrow.dataset.step === "prev" ? -1 : 1);
		});
	});
}

/**
 * Shows `target`'s strips in the preview, and brings them into view in the grid — and, with
 * `scrollList`, in the results, for rows not picked from them. Says whether there were any to show.
 */
function show(target: readonly string[], scrollList: boolean): boolean {
	const all = entries();
	const shown = rowsOf(all, target);
	if (!pane || !layout || shown.length === 0) return false;
	const first = shown[0];
	const date = first.date;
	const alternates = [...new Set(shown.flatMap((entry) => entry.alternates))];
	const page = previewPageOf(
		detailPageFrom(state, date, alternates),
		shown.map((entry) => entry.strip),
	);
	if (!page) return false;
	// One strip's own page is where its row goes; more than one, the day's.
	const href = shown.length === 1 ? first.href : addressOf(buildComicPath(date, alternates));

	// What the focus was on, to be put on the same thing for what is shown next.
	const focused = document.activeElement as HTMLElement | null;
	const onArrow = focused?.matches(".results-preview a.preview-step") ? focused.dataset.step : undefined;
	const onRow = focused?.matches(".result-row") ?? false;
	const inPane = focused !== null && pane.contains(focused);

	// A book's popup is floated on the body, and would be left pointing at a cover that is gone.
	closeBookPopup();
	previewing = target;
	const [prev, next] = neighbours(all, shown);
	pane.innerHTML = buildPreviewHtml(page, href, stepOf(prev), stepOf(next), placeOf(all, shown));
	pane.scrollTop = 0;
	const drawn = pane;
	attachDetailHandlers(pane, page, () => previewing === target && drawn.isConnected);
	attachArrows();
	pane.querySelector(".preview-close")!.addEventListener("click", closePreview);
	respell(pane);

	present();
	const cell = cellForDate(date);
	if (cell) scrollCellIntoViewIfNeeded(cell);
	const firstRow = scrollList || onRow ? rowOf(first) : undefined;
	if (scrollList && firstRow) scrollRowIntoView(firstRow);

	if (onArrow) pane.querySelector<HTMLElement>(`a.preview-step[data-step="${onArrow}"]`)?.focus();
	// Still in the preview, for the keys that step it to keep stepping it.
	else if (inPane) pane.focus({ preventScroll: true });
	else if (onRow && firstRow && !shown.some((entry) => entry.strip === focused!.dataset.ownership)) focusRow(firstRow);
	return true;
}

/** Set while the preview moves the focus onto a row itself, which is no reader focusing it. */
let refocusing = false;

function focusRow(row: HTMLElement): void {
	refocusing = true;
	row.focus({ preventScroll: true });
	refocusing = false;
}

/**
 * Lays the preview out beside the results, rows marked and cell ringed, while there is room for both;
 * while there is not, puts it out of the way without closing it, so a window widened again brings it
 * back. With nothing previewed, takes it all away.
 */
function present(): void {
	const shown = previewing === null ? [] : rowsOf(entries(), previewing);
	const room = shown.length > 0 && fits();
	setPreviewing(room);
	markRows(room ? shown : []);
	setPreviewedDate(room ? shown[0].date : null);
}

export function closePreview(): void {
	if (previewing === null) return;
	// A focus in the preview would go with it; it goes to the row it was showing instead.
	const entry = pane?.contains(document.activeElement) ? rowsOf(entries(), previewing)[0] : undefined;
	const back = entry && rowOf(entry);
	previewing = null;
	closeBookPopup();
	if (pane) pane.innerHTML = "";
	present();
	if (back) focusRow(back);
}

/**
 * The previous or next result, as the arrows step. Says whether there is a preview showing to step,
 * which a key held for the purpose is then spent on even at either end.
 */
export function stepPreview(direction: -1 | 1): boolean {
	if (previewing === null || !available()) return false;
	const target = previewing;
	const all = entries();
	const shown = rowsOf(all, target);
	if (shown.length === 0) return true;
	const step = neighbours(all, shown)[direction === -1 ? 0 : 1];
	if (step) show([step.strip], true);
	return true;
}

/**
 * The result day nearest the one previewed, as a strip's page steps through the days: the next or
 * previous day with a result, or, `weekly`, the nearest with one on the same day of the week. Shows
 * every result of that day, as its cell does. Says whether there is a preview showing to step.
 */
export function stepPreviewDay(direction: -1 | 1, weekly: boolean): boolean {
	if (previewing === null || !available()) return false;
	const all = entries();
	const shown = rowsOf(all, previewing);
	if (shown.length === 0) return true;
	const from = shown[0].date;
	const dates = [...new Set(all.map((entry) => entry.date))]
		.filter((date) => (direction === 1 ? date > from : date < from))
		.filter((date) => !weekly || weekdayOf(date) === weekdayOf(from))
		.sort();
	const to = direction === 1 ? dates[0] : dates[dates.length - 1];
	if (to)
		show(
			all.filter((entry) => entry.date === to).map((entry) => entry.strip),
			true,
		);
	return true;
}

/** Whether a strip is showing in the preview, for the keys a strip's page answers to. */
export function previewShowing(): boolean {
	return previewing !== null && available();
}

/** Whether the focus is inside the preview, where the arrow keys step through the days as a strip's page's do. */
export function previewHasFocus(): boolean {
	return pane !== null && pane.contains(document.activeElement);
}

function showToggle(): void {
	if (!toggle) return;
	const label = enabledHere
		? "Previewing strips beside the results — click to open them on their own page"
		: "Opening strips on their own page — click to preview them beside the results";
	toggle.title = label;
	toggle.setAttribute("aria-label", label);
	toggle.setAttribute("aria-pressed", String(enabledHere));
}

/**
 * Puts the preview, and its toggle, into a results view just built: `layout` is the block the
 * results are in, `list` where the rows go, and `toolbar` the row the toggle goes at the end of.
 * Built again only when the view is.
 */
export function attachPreview(
	element: HTMLElement,
	into: HTMLElement,
	rowsList: HTMLElement,
	toolbar: HTMLElement,
): void {
	view = element;
	layout = into;
	list = rowsList;

	pane = document.createElement("aside");
	pane.className = "results-preview";
	pane.setAttribute("aria-label", "Preview");
	// Focusable, so a click anywhere in it puts the focus there, for the arrow keys to step it.
	pane.tabIndex = -1;
	layout.appendChild(pane);

	toggle = document.createElement("button");
	toggle.className = "results-sort results-preview-toggle";
	toggle.innerHTML = PREVIEW_ICON;
	toolbar.appendChild(toggle);
	showToggle();
	toggle.addEventListener("click", () => {
		choosePreview(!enabledHere);
		showToggle();
		if (!enabledHere) closePreview();
	});

	// A row picked while there is room for the preview is shown in it — or, picked while the preview
	// already shows it, alone or with its day's other strip, followed to its page, so a double click
	// opens it. A modified click is a request for a tab of its own, and is left to the browser; Enter
	// on a row is a click.
	element.addEventListener("click", (event) => {
		if (event.defaultPrevented || !isPlainClick(event)) return;
		const row = (event.target as HTMLElement).closest<HTMLAnchorElement>(".result-row");
		if (!row || !list?.contains(row) || !available()) return;
		if (isShowingStrip(row.dataset.ownership!)) return;
		if (!show([row.dataset.ownership!], false)) return;
		event.preventDefault();
		// On the row, for the keys that step from it. Chrome puts it there on the press; Safari does
		// not focus a link that is clicked.
		if (document.activeElement !== row) focusRow(row);
	});

	// A row focused from the keyboard — tabbed to, or stepped to with the arrow keys — is previewed, if
	// the preview is open. A click focuses one too, in some browsers, but the click is the one to show
	// it: shown here, the click would find it already previewed, and follow it to its page.
	element.addEventListener("focusin", (event) => {
		const row = (event.target as HTMLElement).closest<HTMLAnchorElement>(".result-row");
		if (!row || refocusing || !list?.contains(row) || !previewShowing() || !row.matches(":focus-visible")) return;
		if (!isShowingStrip(row.dataset.ownership!)) show([row.dataset.ownership!], false);
	});

	// A batch of rows drawn as the reader scrolls may hold one the preview is showing.
	rowsList.addEventListener(ROWS_DRAWN, () => {
		if (previewing !== null) present();
	});

	// The window narrowed past room for it puts the preview out of the way, rather than leave its
	// cell ringed in the grid with nothing beside the results to say why, and widened brings it back.
	new ResizeObserver(() => {
		if (previewing !== null && isShowing(element)) present();
	}).observe(layout);
}

/*
 * A result's cell, clicked in the grid, previews its day: each strip of it that is a result — both
 * of a day's two only if both are. The grid's own handler still scrolls the cell into view. Attached
 * once the grid is there to attach it to.
 */
document.addEventListener("DOMContentLoaded", () => {
	document.getElementById("grid-layout")?.addEventListener("click", (event) => {
		if (event.defaultPrevented || !isPlainClick(event) || !available()) return;
		const date = (event.target as HTMLElement).closest<HTMLElement>(".cell")?.dataset.date;
		if (!date) return;
		const day = entries()
			.filter((entry) => entry.date === date)
			.map((entry) => entry.strip);
		// Its day already all the preview shows, the cell is followed to the day's page, as a row is.
		if (isPreviewing(day)) return;
		if (show(day, true)) event.preventDefault();
	});
});

/**
 * After the rows are drawn again: the preview follows its strips to wherever they now are among them,
 * its arrows to their new neighbours, or closes if any of its strips is no longer a result.
 */
export function syncPreview(): void {
	if (previewing === null || !pane) return;
	const target = previewing;
	const all = entries();
	const shown = rowsOf(all, target);
	if (shown.length === 0) {
		closePreview();
		return;
	}
	// A view built afresh has an empty preview, which is drawn whole.
	if (!pane.querySelector(".detail-container")) {
		show(target, false);
		return;
	}
	present();
	const arrows = pane.querySelector<HTMLElement>(".nav-arrows");
	if (!arrows) return;
	const [prev, next] = neighbours(all, shown);
	arrows.innerHTML = buildPreviewArrowsHtml(stepOf(prev), stepOf(next), placeOf(all, shown));
	arrows
		.querySelectorAll<HTMLElement>("a.preview-step")
		.forEach((arrow) => attachCellHighlightLink(arrow, arrow.dataset.date!));
	attachArrows();
}
