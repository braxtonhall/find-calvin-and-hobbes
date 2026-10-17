import { state } from "../state";
import { SortMode } from "../types";
import { search } from "../search";
import { TUNING } from "../tuning";
import { CANONICAL_FORMS } from "../compounds";
import { assignTiers } from "../tiers";
import { navigate, replaceSearch } from "../router";
import { HOME_PATH, buildSearchPath } from "../routes";
import { filterMenuHasFocus } from "./filter-bar";
import { attachRowHandlers } from "./result-rows";
import { resultsHtml } from "../pages/result-rows";
import { SearchBar, buildSearchBar } from "./search-bar";
import { syncQueryInput } from "./query-input";
import { isTouchDevice } from "../utils";

/**
 * The count moved to the filter bar and dropped the query on the way — `12 results`, not
 * `12 results for "snow goons"`, and `No comics found` rather than `No comics found for …`. Both
 * were restating the query that is sitting in the input one line up, and the widest line on the
 * page is worth more than a second copy of it.
 */
const EMPTY = "No comics found";

/**
 * Built on the first render and kept: see `buildSearchBar`. Built again only if something has
 * written over the view since — the loading spinner does.
 */
let bar: SearchBar | null = null;

export function renderResults(query: string, sort: SortMode): void {
	const element = document.getElementById("view-results")!;

	if (!bar || !element.contains(bar.input)) {
		bar = buildSearchBar(element, {
			id: "results",
			placeholder: "Search comics...",
			pathFor: buildSearchPath,
			onEmpty: () => navigate(HOME_PATH),
		});
	}

	const results = search(query, sort, TUNING, CANONICAL_FORMS);
	bar.update(query, sort, results.length);
	// An empty box asks nothing, so it is told nothing: no "No comics found", and no grid dimmed
	// around matches there are none of. Only a phone stays here with one — see `buildSearchBar`.
	if (query.trim() === "") {
		bar.list.innerHTML = "";
		state.searchResultTiers = null;
	} else {
		bar.list.innerHTML = resultsHtml(results, EMPTY);
		state.searchResultTiers = assignTiers(results);
		attachRowHandlers(bar.list);
	}

	// Arriving from another view, rather than typing here or stepping through the rows. The filter
	// menu counts as being here: it is floated on `document.body` rather than nested in this element,
	// so `contains` cannot see a reader who is standing on one of its rows — and the search that
	// follows a checkmark comes back through here 200ms later. Never on a touchscreen, where the focus
	// would raise a keyboard over the results.
	if (!isTouchDevice() && !element.contains(document.activeElement) && !filterMenuHasFocus()) {
		bar.input.focus();
		bar.input.setSelectionRange(bar.input.value.length, bar.input.value.length);
	}
}

/**
 * The focus, in the box, holding what the home page's box held with its caret where that one's was —
 * for a phone, where that box hands the tap on to this one. Called from inside the tap, which is the
 * only time iOS will raise the keyboard for a `focus()`, and on the empty search page, which is
 * always ready to be shown: a query is searched once the box has it, so one that has to wait for
 * the archive waits under a bar that is already up. The box keeps the value as it was written, and
 * the address the trimmed query, as typing here would leave them.
 */
export function focusResultsInput(value: string, start: number, end: number): void {
	if (!bar) return;
	bar.input.value = value;
	bar.input.focus();
	bar.input.setSelectionRange(start, end);
	syncQueryInput(bar.input);
	const query = value.trim();
	if (query !== "") replaceSearch(buildSearchPath(query));
}

/**
 * The spinner under the bar rather than over it, for a search typed before the archive has arrived,
 * and whether there was a bar showing to put it under. The bar is kept for `renderResults` to reuse.
 */
export function showResultsLoading(): boolean {
	const element = document.getElementById("view-results")!;
	if (!bar || !element.contains(bar.input)) return false;
	bar.list.innerHTML = '<div class="results-empty"><div class="spinner results-spinner"></div></div>';
	return true;
}
