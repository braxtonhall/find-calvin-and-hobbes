import "./collection.css";
import "./collections.css";
import "./arcs.css";

import { state } from "../state";
import { canGoBack } from "../router";
import { ArcList, ArcPage, ArcsPage } from "../pages/page";
import { buildArcHtml } from "../pages/arc";
import { buildArcsBodyHtml, buildArcsHtml } from "../pages/arcs";
import { attachBackAndHomeHandlers } from "./nav-buttons";
import { attachCopyLinkHandler } from "./copy-link";
import { clearCollectionSoon, highlightCollection } from "./cell-highlight";
import { attachRowFocusHandler, attachRowHandlers } from "./result-rows";
import { attachBookHandlers } from "./books";
import { attachTabSearch, keepsHeader, narrowTab, updateTabSearch } from "./tab-search";

/**
 * Hovering a row of an arc list lights that arc in the grid; leaving it goes back to `back`, what the
 * page lights while nothing is hovered — the book on a book's page, and nothing on `/arcs`.
 *
 * `showing` says whether the list may touch the grid at all: a row followed to its arc is left
 * focused, and hidden, which blurs it, and by then the grid is the arc page's to draw.
 */
export function attachArcListHandlers(
	element: HTMLElement,
	list: ArcList,
	back: ReadonlySet<string> | null,
	showing: () => boolean,
): void {
	const byId = new Map(list.arcs.map((arc) => [arc.id, new Set(arc.dates)]));
	element.querySelectorAll<HTMLElement>(".arc-row").forEach((row) => {
		const dates = byId.get(row.dataset.arcId ?? "");
		if (!dates) return;
		const show = () => showing() && highlightCollection(dates);
		const clear = () => showing() && clearCollectionSoon(back);
		row.addEventListener("mouseenter", show);
		row.addEventListener("focus", show);
		row.addEventListener("mouseleave", clear);
		row.addEventListener("blur", clear);
	});
}

/**
 * Draws every arc, or — with `adopt` — takes over the list the build drew from the same `page`. With
 * the search open, only the arcs it finds, as the list of books does.
 */
export function renderArcs(page: ArcsPage, adopt: boolean = false, arriving: boolean = true): void {
	const element = document.getElementById("view-arcs")!;
	const results = narrowTab("arcs", page.q);
	const ids = results?.ids ?? null;
	if (adopt) {
		attachBackAndHomeHandlers(element);
		attachTabSearch(element, "arcs");
	} else if (keepsHeader(element, page.q, arriving)) {
		element.querySelector(".collections-body")!.innerHTML = buildArcsBodyHtml(page, ids);
		updateTabSearch(element, page.q);
	} else {
		element.innerHTML = buildArcsHtml(page, canGoBack(), ids);
		attachBackAndHomeHandlers(element);
		attachTabSearch(element, "arcs");
	}
	attachArcListHandlers(element, page.list, state.tabMatchDates, () => element.classList.contains("active"));
}

let rowFocusAttached = false;

/**
 * Draws an arc's page, or — with `adopt` — takes over the one the build drew from the same `page`.
 * The grid shows the arc while it is open, as a book's page shows the book, and the arc's dates are
 * on the page, so a cold load lights them before the archive has arrived.
 */
export function renderArc(page: ArcPage, adopt: boolean = false): void {
	const element = document.getElementById("view-arc")!;
	const dates = new Set(page.arc?.dates ?? []);
	state.collectionDateSet = dates;
	if (!adopt) element.innerHTML = buildArcHtml(page, canGoBack());
	attachBackAndHomeHandlers(element);
	attachCopyLinkHandler(element);

	const strips = element.querySelector<HTMLElement>(".arc-strips");
	if (strips) attachRowHandlers(strips);
	if (!rowFocusAttached) {
		attachRowFocusHandler(element);
		rowFocusAttached = true;
	}

	attachBookHandlers(element, dates);
}
