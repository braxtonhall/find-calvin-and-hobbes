import { state } from "../state";
import { replaceSearch } from "../router";
import { CollectionsTab, buildTabPath } from "../routes";
import { addressOf } from "../base-path";
import { CollectionType } from "../filter-spec";
import { collectionQuery } from "../filter-query";
import { CollectionResults, searchCollections } from "../query-eval";
import { COMPOUND_CANONICAL_FORMS } from "../compounds";
import { attachQueryInput, syncQueryInput } from "./query-input";
import { isTouchDevice } from "../utils";

/**
 * The search box of the Collections page, always there, and emptied by its ×. The query lives in
 * the address, so it is kept exactly as typed from one tab to the next, and each tab asks it of its
 * own kind of collection in the one collection language. The page keeps its own layout and order;
 * the search only narrows it, and lights in the grid the strips that are why each collection is there.
 *
 * The box survives a search the way the search page's does — see `buildSearchBar` — so only the
 * list under it is drawn again as the reader types.
 */

/** Which kind of collection each tab lists. */
export const TAB_TYPES: Record<CollectionsTab, CollectionType> = { books: "book", arcs: "arc", creators: "creator" };

let debounce: number | null = null;

/**
 * The collections the tab's query finds, or null where it is empty, which lists all of them. What
 * the grid lights is set here too, so that it agrees with the list.
 */
export function narrowTab(tab: CollectionsTab, query: string | undefined): CollectionResults | null {
	const results = query === undefined ? null : searchCollections(query, TAB_TYPES[tab], COMPOUND_CANONICAL_FORMS);
	state.tabMatchDates = results?.dates ?? null;
	return results;
}

/**
 * Whether the view already shows this tab's header, so that only the list needs drawing again.
 * Arriving from another page draws it all, since the Back button with it depends on how the reader
 * got here.
 */
export function keepsHeader(element: HTMLElement, arriving: boolean): boolean {
	return !arriving && element.querySelector(".collections-container") !== null;
}

/** Brings a kept header up to the query: the box, if it is not already holding it, and the other tabs' links. */
export function updateTabSearch(element: HTMLElement, query: string | undefined): void {
	const input = element.querySelector<HTMLInputElement>(".collections-search-input")!;
	if (input.value.trim() !== (query ?? "")) {
		input.value = query ?? "";
		syncQueryInput(input);
		syncClear(element, input);
	}
	element.querySelectorAll<HTMLAnchorElement>("a.collections-tab[data-tab]").forEach((link) => {
		link.href = addressOf(buildTabPath(link.dataset.tab as CollectionsTab, query));
	});
}

/** The × has something to clear only while the box holds something. */
function syncClear(element: HTMLElement, input: HTMLInputElement): void {
	const clear = element.querySelector<HTMLButtonElement>(".collections-search-clear");
	if (clear) clear.disabled = input.value === "";
}

/** Wires the search box and its ×. Once per header drawn. */
export function attachTabSearch(element: HTMLElement, tab: CollectionsTab): void {
	const input = element.querySelector<HTMLInputElement>(".collections-search-input")!;

	attachQueryInput(input, collectionQuery(TAB_TYPES[tab]));

	const search = (immediately: boolean) => {
		if (debounce !== null) clearTimeout(debounce);
		const run = () => {
			debounce = null;
			replaceSearch(buildTabPath(tab, input.value.trim()));
		};
		if (immediately) run();
		else debounce = window.setTimeout(run, 200);
	};
	input.addEventListener("input", () => {
		syncClear(element, input);
		search(false);
	});
	input.addEventListener("keydown", (event) => {
		if (event.key !== "Enter") return;
		event.preventDefault();
		// Done with the keyboard, which would otherwise stay up over the list.
		if (isTouchDevice()) input.blur();
		search(true);
	});

	element.querySelector(".collections-search-clear")?.addEventListener("click", () => {
		if (debounce !== null) clearTimeout(debounce);
		debounce = null;
		input.value = "";
		syncQueryInput(input);
		syncClear(element, input);
		// Ready for the next query — but not on a phone, where focus would bring the keyboard up.
		if (!isTouchDevice()) input.focus();
		replaceSearch(buildTabPath(tab));
	});
}
