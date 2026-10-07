import "./library.css";

import { state } from "../state";
import { SortMode } from "../types";
import { searchBookmarks } from "../search";
import { isLibraryResult, libraryDates } from "../ownership";
import { TUNING } from "../tuning";
import { COMPOUND_CANONICAL_FORMS } from "../compounds";
import { assignTiers } from "../tiers";
import { canGoBack } from "../router";
import { buildLibraryPath } from "../routes";
import { buildBackAndHomeButtons } from "../pages/nav-buttons";
import { attachBackAndHomeHandlers } from "./nav-buttons";
import { attachRowHandlers, resultsHtml } from "./result-rows";
import { SearchBar, buildSearchBar } from "./search-bar";
import { attachLibraryTransferHandlers, buildLibraryTransferHtml } from "./library-transfer";

const EMPTY = "Nothing in your library found";

/**
 * Built with the page and kept while the reader searches it, as the search page's is — see
 * `buildSearchBar`. Built again on `arriving` from elsewhere, because the back button is drawn with
 * the page, and whether it can go back depends on how the reader got here.
 */
let bar: SearchBar | null = null;

/**
 * The bookmarked strips and the owned ones — owned themselves, or in an owned book — drawn as the
 * search results are, and searched the way they are. Only drawn once both the archive and the
 * library have arrived — see `pageFor` — so an empty list here
 * means there really are none, or none the query matches.
 */
export function renderLibrary(query: string, sort: SortMode, arriving: boolean): void {
	const element = document.getElementById("view-library")!;

	if (arriving || !bar || !element.contains(bar.input)) {
		element.innerHTML = `${buildBackAndHomeButtons(canGoBack())}
			<div class="library-header">
				<h2 class="library-heading">Library</h2>
				${buildLibraryTransferHtml()}
			</div>
			<div class="library-search"></div>`;
		attachBackAndHomeHandlers(element);
		attachLibraryTransferHandlers(element);
		bar = buildSearchBar(element.querySelector(".library-search")!, {
			id: "library",
			placeholder: "Search library",
			pathFor: buildLibraryPath,
			// An empty box on this page is the whole library, not a way home.
			listsWithoutQuery: true,
		});
	}

	const results = searchBookmarks(query, sort, TUNING, COMPOUND_CANONICAL_FORMS, libraryDates()).filter(
		isLibraryResult,
	);
	bar.update(query, sort, results.length);
	bar.list.innerHTML = resultsHtml(results, EMPTY);
	attachRowHandlers(bar.list);
	// With a query the grid shows how well each bookmark matched, as the search page's does; without
	// one, `updateGridState` lights every bookmark alike.
	state.searchResultTiers = query ? assignTiers(results) : null;
}
