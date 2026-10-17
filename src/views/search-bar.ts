import "./results.css";

import { state } from "../state";
import { SortMode } from "../types";
import { replaceSearch } from "../router";
import { buildFilterBar } from "./filter-bar";
import { attachQueryInput, syncQueryInput } from "./query-input";
import { attachRowFocusHandler } from "./result-rows";
import { isTouchDevice } from "../utils";
import { DATE_ICON, RANK_ICON } from "../pages/collections";

function sortLabelFor(sort: SortMode): string {
	return sort === "rank"
		? "Sorted by relevance — click to sort by date"
		: "Sorted by date — click to sort by relevance";
}

export interface SearchBarOptions {
	/** Prefixes the input's and the list's ids. */
	id: string;
	placeholder: string;
	/** Where a query takes the reader, in the order asked for. */
	pathFor(query: string, sort: SortMode): string;
	/**
	 * Where the clear button goes, and an emptied box: an empty search is not a page of its own. Not
	 * on a touchscreen, where the box is the page the home page's box hands its tap to, and emptying
	 * it leaves it standing empty; only the clear button goes.
	 */
	onEmpty(): void;
}

export interface SearchBar {
	input: HTMLInputElement;
	/** Where the rows go. Beside the bar rather than in it, and redrawn on every render. */
	list: HTMLElement;
	/** Brings the bar up to the route it is showing, and the count up to the rows under it. */
	update(query: string, sort: SortMode, results: number): void;
}

/**
 * Builds the search bar into `element` and wires it, once.
 *
 * Kept out of the per-query render because typing in a box that is being replaced underneath you
 * is the whole problem: it used to cost a snapshot-and-restore of the value and the selection on
 * every keystroke, and it left nowhere for the autocomplete menu to keep its state. The bar now
 * survives, so the caret survives with it and `attachQueryInput` can own what it knows.
 */
export function buildSearchBar(element: HTMLElement, options: SearchBarOptions): SearchBar {
	/**
	 * What the bar's own handlers act on.
	 *
	 * The bar outlives any one render, so its listeners cannot close over the arguments of the
	 * render that happened to build them, or the sort button would still be flipping the sort the
	 * view opened with.
	 */
	let currentQuery = "";
	let currentSort: SortMode = "rank";

	// The bar and the rows are one column of `.results-layout`, which a preview of a strip can stand
	// beside — see `preview.ts`.
	element.innerHTML = `<div class="results-layout"><div class="results-main"><div class="results-sticky">
		<div class="results-search-bar">
			<input
				type="text"
				class="results-input"
				id="${options.id}-input"
				placeholder="${options.placeholder}"
				autocomplete="off"
				enterkeyhint="search"
			/>
			<button class="results-clear" aria-label="Clear search">&times;</button>
			<button class="results-sort"></button>
		</div>
	</div>
	<div id="${options.id}-list"></div></div></div>`;

	const input = element.querySelector<HTMLInputElement>(".results-input")!;
	const sortButton = element.querySelector<HTMLButtonElement>(".results-sort")!;
	const clearButton = element.querySelector<HTMLButtonElement>(".results-clear")!;
	const onEmpty = (): void => options.onEmpty();
	// What an emptied box does, as opposed to the clear button. See `onEmpty`.
	const onEmptied = (): void => {
		if (isTouchDevice()) {
			replaceSearch(options.pathFor("", currentSort));
		} else {
			onEmpty();
		}
	};
	const list = element.querySelector<HTMLElement>(`#${options.id}-list`)!;
	attachQueryInput(input);
	// Attached to the search bar rather than built beside it: the two rows are one block, and the
	// filter bar has to outlive `resultsHtml` for the same reason the input does.
	const filterBar = buildFilterBar(input);
	element.querySelector(".results-sticky")!.appendChild(filterBar.element);

	input.addEventListener("input", () => {
		if (state.resultsDebounceTimer !== null) clearTimeout(state.resultsDebounceTimer);
		const inputQuery = input.value.trim();
		state.resultsDebounceTimer = window.setTimeout(() => {
			if (inputQuery) {
				replaceSearch(options.pathFor(inputQuery, currentSort));
			} else {
				onEmptied();
			}
		}, 200);
	});

	input.addEventListener("keydown", (event) => {
		if (event.key === "Enter") {
			event.preventDefault();
			if (state.resultsDebounceTimer !== null) clearTimeout(state.resultsDebounceTimer);
			const inputQuery = input.value.trim();
			// Nothing to search, on the page a phone keeps for an empty box: the keyboard stays, to type with.
			if (!inputQuery && isTouchDevice()) {
				onEmptied();
				return;
			}
			// Search is done with the keyboard, which would otherwise stay up over the results.
			if (isTouchDevice()) input.blur();
			if (!inputQuery) {
				onEmpty();
			} else if (inputQuery !== currentQuery) {
				replaceSearch(options.pathFor(inputQuery, currentSort));
			}
		}
	});

	clearButton.addEventListener("click", () => {
		if (state.resultsDebounceTimer !== null) clearTimeout(state.resultsDebounceTimer);
		onEmpty();
	});

	sortButton.addEventListener("click", () => {
		if (state.resultsDebounceTimer !== null) clearTimeout(state.resultsDebounceTimer);
		const inputQuery = input.value.trim() || currentQuery;
		if (inputQuery) {
			replaceSearch(options.pathFor(inputQuery, currentSort === "rank" ? "date" : "rank"));
		}
	});

	attachRowFocusHandler(element);

	return {
		input,
		list,
		update(query, sort, results) {
			currentQuery = query;
			currentSort = sort;

			const label = sortLabelFor(sort);
			sortButton.innerHTML = sort === "rank" ? RANK_ICON : DATE_ICON;
			sortButton.title = label;
			sortButton.setAttribute("aria-label", label);
			sortButton.setAttribute("aria-pressed", String(sort === "rank"));

			// Only when the query arriving is not the one the box already holds — a followed link, the
			// back button — because assigning to the box moves the caret to the end of it. Compared
			// trimmed, since the box is what trimmed the query on its way into the URL: a reader who
			// typed a trailing space is still holding the query that came back, and that space has a
			// job to do after a flag.
			if (input.value.trim() !== query) {
				input.value = query;
				input.setSelectionRange(query.length, query.length);
				syncQueryInput(input);
			}

			filterBar.sync(results);
		},
	};
}
