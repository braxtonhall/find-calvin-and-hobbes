import { state } from "../state";
import { SortMode } from "../types";
import { search } from "../search";
import { TUNING } from "../tuning";
import { COMPOUND_CANONICAL_FORMS } from "../compounds";
import { assignTiers } from "../tiers";
import { navigate } from "../router";
import { HOME_PATH, buildSearchPath } from "../routes";
import { filterMenuHasFocus } from "./filter-bar";
import { attachRowHandlers, resultsHtml } from "./result-rows";
import { SearchBar, buildSearchBar } from "./search-bar";
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

	const results = search(query, sort, TUNING, COMPOUND_CANONICAL_FORMS);
	bar.update(query, sort, results.length);
	bar.list.innerHTML = resultsHtml(results, EMPTY);
	state.searchResultTiers = assignTiers(results);
	attachRowHandlers(bar.list);

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
