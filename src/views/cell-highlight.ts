import { state } from "../state";
import { anyCellInView, scrollCellIntoViewIfNeeded } from "../utils";
import { isDateInCollection } from "../date-utils";
import { Collection } from "../types";

/**
 * Lights up a strip's cell in the grid while a link to that strip is hovered or focused — the same
 * ring a search result's row puts on its cell — and scrolls the grid to it if it is out of view. A
 * reader tabbing through the page is pointing at the link as much as one with a mouse is.
 */
export function attachCellHighlightLink(link: HTMLElement, date: string): void {
	const show = () => {
		if (state.hoveredCell) state.hoveredCell.classList.remove("cell--hover-highlight");
		const cell = document.querySelector<HTMLElement>(`.cell[data-date="${date}"]`);
		if (!cell) return;
		cell.classList.add("cell--hover-highlight");
		state.hoveredCell = cell;
		scrollCellIntoViewIfNeeded(cell);
	};

	const clear = () => {
		if (!state.hoveredCell) return;
		state.hoveredCell.classList.remove("cell--hover-highlight");
		state.hoveredCell = null;
	};

	link.addEventListener("mouseenter", show);
	link.addEventListener("focus", show);
	link.addEventListener("mouseleave", clear);
	link.addEventListener("blur", clear);
}

type BookRanges = Pick<Collection, "dailies" | "sundays">;

/** Each book's days, worked out the first time it is hovered rather than on every hover. */
const bookDates = new WeakMap<BookRanges, Set<string>>();

export function datesOf(collection: BookRanges): Set<string> {
	const known = bookDates.get(collection);
	if (known) return known;
	const dates = new Set(state.allDays.map((day) => day.date).filter((date) => isDateInCollection(date, collection)));
	// Before the grid is built there are no days to find, and so nothing worth remembering.
	if (state.allDays.length > 0) bookDates.set(collection, dates);
	return dates;
}

/**
 * Shows a set of strips in the grid as a book's own page does — those strips lit, the rest dimmed —
 * or, given `null`, puts the grid back as it was. A book's are `datesOf` its ranges, which are on the
 * page, and an arc's are its dates, so either works on a cold load before the archive has arrived.
 *
 * Going from one book to another only touches the cells that differ between them: a class set to
 * what it already is changes nothing, and so costs no restyle and starts no fade.
 *
 * When none of the strips is on screen, the grid scrolls to the first one, the way a hovered search
 * result brings its strip into view. A set with any strip already showing leaves the grid where it
 * is, so running a finger down a list does not throw it about.
 */
export function highlightCollection(dates: ReadonlySet<string> | null): void {
	cancelCollectionClear();
	const matched: HTMLElement[] = [];
	for (const cell of document.querySelectorAll<HTMLElement>(".cell")) {
		const date = cell.dataset.date;
		const matches = dates !== null && date !== undefined && dates.has(date);
		cell.classList.toggle("cell--search-match", matches);
		cell.classList.toggle("cell--search-nonmatch", dates !== null && !matches);
		if (matches) matched.push(cell);
	}
	if (matched.length > 0 && !anyCellInView(matched)) {
		matched[0].scrollIntoView({ block: "center", behavior: "smooth" });
	}
}

/** Long enough to cross the gap between two books' covers, short enough not to be seen. */
const CLEAR_DELAY_MS = 80;

let pendingClear: number | null = null;

/**
 * Puts the grid back once the pointer has left a book, unless it arrives at another first — in which
 * case that book goes straight to the next, without the whole grid lighting up and dimming again
 * in between. `back` is what it goes back to: the plain grid, or what a list lights while it is
 * showing, which a row hovered in it only narrowed.
 */
export function clearCollectionSoon(back: ReadonlySet<string> | null = null): void {
	cancelCollectionClear();
	pendingClear = window.setTimeout(() => {
		pendingClear = null;
		highlightCollection(back);
	}, CLEAR_DELAY_MS);
}

/** Drops a clear still waiting, so that a page drawn in the meantime keeps the grid it drew. */
export function cancelCollectionClear(): void {
	if (pendingClear === null) return;
	window.clearTimeout(pendingClear);
	pendingClear = null;
}
