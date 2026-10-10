import "./results.css";

import { state } from "../state";
import { SortMode } from "../types";
import { replaceSearch } from "../router";
import { buildFilterBar } from "./filter-bar";
import { attachQueryInput, syncQueryInput } from "./query-input";
import { attachRowFocusHandler } from "./result-rows";
import { isTouchDevice } from "../utils";

const DATE_ICON = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" aria-hidden="true">
	<rect x="2" y="3.5" width="12" height="10" rx="1.5" /><path d="M2 6.5h12M5.5 2v3M10.5 2v3" />
</svg>`;

const RANK_ICON = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" aria-hidden="true">
	<path d="M3 3v10M3 13l-2-2M3 13l2-2M7.5 4h7M7.5 8h5M7.5 12h3" />
</svg>`;

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
	/** Where an emptied box goes: an empty search is not a page of its own. */
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

	element.innerHTML = `<div class="results-sticky">
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
	<div id="${options.id}-list"></div>`;

	const input = element.querySelector<HTMLInputElement>(".results-input")!;
	const sortButton = element.querySelector<HTMLButtonElement>(".results-sort")!;
	const clearButton = element.querySelector<HTMLButtonElement>(".results-clear")!;
	const onEmpty = (): void => options.onEmpty();
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
				onEmpty();
			}
		}, 200);
	});

	input.addEventListener("keydown", (event) => {
		if (event.key === "Enter") {
			event.preventDefault();
			if (state.resultsDebounceTimer !== null) clearTimeout(state.resultsDebounceTimer);
			// Search is done with the keyboard, which would otherwise stay up over the results.
			if (isTouchDevice()) input.blur();
			const inputQuery = input.value.trim();
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
