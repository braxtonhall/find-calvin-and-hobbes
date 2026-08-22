import "./results.css";

import { state } from "../state";
import { SortMode } from "../types";
import { search, SearchResult } from "../search";
import { assignTiers } from "../tiers";
import { escHtml, highlightRanges, scrollCellIntoViewIfNeeded } from "../utils";
import { buildComicHash, buildSearchHash, navigate, replaceSearch } from "../router";
import { buildFilterBar, filterMenuHasFocus, syncFilterBar } from "./filter-bar";
import { attachQueryInput, syncQueryInput } from "./query-input";

const DATE_ICON = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" aria-hidden="true">
	<rect x="2" y="3.5" width="12" height="10" rx="1.5" /><path d="M2 6.5h12M5.5 2v3M10.5 2v3" />
</svg>`;

const RANK_ICON = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" aria-hidden="true">
	<path d="M3 3v10M3 13l-2-2M3 13l2-2M7.5 4h7M7.5 8h5M7.5 12h3" />
</svg>`;

// A transcript match carries no label, as it always has: it is the default, and naming it would
// put a badge on nearly every row. A date match is the one that needs saying, because nothing in
// the text it shows is why it matched.
const SOURCE_LABELS: Record<SearchResult["source"], string> = {
	transcript: "",
	description: "Description",
	date: "Date",
	// Nothing: a filter-only query is every row it let through, so a badge on all of them says only
	// what the query in the box above already says, and `@in:book3` rows are not date matches.
	filter: "",
};

/**
 * What the search bar's own handlers act on.
 *
 * The bar outlives any one render — see `renderResults` — so its listeners cannot close over the
 * arguments of the render that happened to build them, or the sort button would still be flipping
 * the sort the view opened with.
 */
let currentQuery = "";
let currentSort: SortMode = "rank";

function sortLabelFor(sort: SortMode): string {
	return sort === "rank"
		? "Sorted by relevance — click to sort by date"
		: "Sorted by date — click to sort by relevance";
}

/**
 * Builds the search bar and wires it, once.
 *
 * Kept out of the per-query render because typing in a box that is being replaced underneath you
 * is the whole problem: it used to cost a snapshot-and-restore of the value and the selection on
 * every keystroke, and it left nowhere for the autocomplete menu to keep its state. The bar now
 * survives, so the caret survives with it and `attachQueryInput` can own what it knows.
 */
function buildSearchBar(element: HTMLElement): void {
	element.innerHTML = `<div class="results-sticky">
		<div class="results-search-bar">
			<input
				type="text"
				class="results-input"
				id="results-input"
				placeholder="Search comics..."
				autocomplete="off"
			/>
			<button class="results-clear" id="results-clear" aria-label="Clear search">&times;</button>
			<button class="results-sort" id="results-sort"></button>
		</div>
	</div>
	<div id="results-list"></div>`;

	const input = document.getElementById("results-input") as HTMLInputElement;
	attachQueryInput(input);
	// Attached to the search bar rather than built beside it: the two rows are one block, and the
	// filter bar has to outlive `resultsHtml` for the same reason the input does.
	element.querySelector(".results-sticky")!.appendChild(buildFilterBar(input));

	input.addEventListener("input", () => {
		if (state.resultsDebounceTimer !== null) clearTimeout(state.resultsDebounceTimer);
		const inputQuery = input.value.trim();
		state.resultsDebounceTimer = window.setTimeout(() => {
			if (inputQuery) {
				replaceSearch(buildSearchHash(inputQuery, currentSort));
			} else {
				navigate("#/");
			}
		}, 200);
	});

	input.addEventListener("keydown", (event) => {
		if (event.key === "Enter") {
			event.preventDefault();
			if (state.resultsDebounceTimer !== null) clearTimeout(state.resultsDebounceTimer);
			const inputQuery = input.value.trim();
			if (!inputQuery) {
				navigate("#/");
			} else if (inputQuery !== currentQuery) {
				replaceSearch(buildSearchHash(inputQuery, currentSort));
			}
		}
	});

	document.getElementById("results-clear")!.addEventListener("click", () => {
		navigate("#/");
	});

	document.getElementById("results-sort")!.addEventListener("click", () => {
		if (state.resultsDebounceTimer !== null) clearTimeout(state.resultsDebounceTimer);
		const inputQuery = input.value.trim() || currentQuery;
		if (inputQuery) replaceSearch(buildSearchHash(inputQuery, currentSort === "rank" ? "date" : "rank"));
	});

	element.addEventListener("focusin", (event) => {
		const row = (event.target as HTMLElement).closest(".result-row") as HTMLElement | null;
		if (!row) return;
		if (state.hoveredCell) {
			state.hoveredCell.classList.remove("cell--hover-highlight");
		}
		document
			.querySelectorAll(".result-row--highlight")
			.forEach((highlightedRow) => highlightedRow.classList.remove("result-row--highlight"));

		row.classList.add("result-row--highlight");
		const cell = document.querySelector(`.cell[data-date="${row.dataset.date}"]`);
		if (cell) {
			cell.classList.add("cell--hover-highlight");
			scrollCellIntoViewIfNeeded(cell as HTMLElement);
			state.hoveredCell = cell as HTMLElement;
		}
		state.keyboardNavActive = true;
	});
}

/**
 * The rows, and nothing about the query.
 *
 * The count moved to the filter bar and dropped the query on the way — `12 results`, not
 * `12 results for "snow goons"`, and `No comics found` rather than `No comics found for …`. Both
 * were restating the query that is sitting in the input one line up, and the widest line on the
 * page is worth more than a second copy of it.
 */
function resultsHtml(results: SearchResult[]): string {
	if (results.length === 0) {
		return `<div class="results-empty">No comics found</div>`;
	}

	let html = "";
	for (const { comic, text, ranges, source } of results) {
		const [year, month, day] = comic.date.split("-").map(Number);
		const dateObject = new Date(Date.UTC(year, month - 1, day));
		const dateFormatted = dateObject.toLocaleDateString("en-US", {
			weekday: "long",
			year: "numeric",
			month: "long",
			day: "numeric",
			timeZone: "UTC",
		});
		const highlighted = highlightRanges(text, ranges);
		const label = SOURCE_LABELS[source];
		const sourceTag = label ? `<span class="result-source">${label}</span>` : ``;

		// An anchor rather than the `tabindex`/`role="button"` div it used to be: the row goes somewhere
		// with an address, so the browser can offer to copy it or open it in a second tab, and the
		// focus and Enter behaviour that had to be spelled out now comes for free — and announces as a
		// link, which is the truth. `draggable="false"` because dragging from inside an anchor drags the
		// link instead of selecting text, and the transcript below is text a reader may want to copy.
		html += `<a class="result-row${comic.image ? "" : " result-row--no-image"}" href="${buildComicHash(comic.date)}" draggable="false" data-date="${comic.date}" aria-label="View comic from ${dateFormatted}">
			<div class="result-header">${dateFormatted}${sourceTag}</div>
			<div class="result-body">
				<div class="result-text">${highlighted}</div>
				${comic.image ? `<div class="result-image-wrap"><img class="result-image" src="${escHtml(comic.image)}" alt="Comic from ${dateFormatted}" onload="this.classList.add('loaded')" onerror="this.style.display='none'" /></div>` : ``}
			</div>
		</a>`;
	}
	return html;
}

function attachRowHandlers(list: HTMLElement): void {
	list.querySelectorAll<HTMLElement>(".result-row").forEach((row) => {
		const textElement = row.querySelector<HTMLElement>(".result-text")!;
		if (textElement.scrollHeight > textElement.clientHeight) {
			textElement.classList.add("result-text--overflow");
		}
		const mark = textElement.querySelector("mark");
		if (mark) {
			const maxScroll = textElement.scrollHeight - textElement.clientHeight;
			const scrollTo = mark.offsetTop - textElement.clientHeight / 2;
			textElement.scrollTop = Math.max(0, Math.min(scrollTo, maxScroll));
		}

		row.addEventListener("mouseenter", () => {
			if (state.keyboardNavActive) return;
			if (state.hoveredCell) {
				state.hoveredCell.classList.remove("cell--hover-highlight");
				document
					.querySelectorAll(`.result-row[data-date="${state.hoveredCell.dataset.date}"]`)
					.forEach((highlightedRow) => highlightedRow.classList.remove("result-row--highlight"));
			}
			const cell = document.querySelector(`.cell[data-date="${row.dataset.date}"]`);
			if (cell) {
				cell.classList.add("cell--hover-highlight");
				scrollCellIntoViewIfNeeded(cell as HTMLElement);
				state.hoveredCell = cell as HTMLElement;
			}
			document
				.querySelectorAll(`.result-row[data-date="${row.dataset.date}"]`)
				.forEach((highlightedRow) => highlightedRow.classList.add("result-row--highlight"));
		});

		row.addEventListener("mouseleave", () => {
			if (state.keyboardNavActive) return;
			if (state.hoveredCell) {
				state.hoveredCell.classList.remove("cell--hover-highlight");
				state.hoveredCell = null;
			}
			document
				.querySelectorAll(`.result-row[data-date="${row.dataset.date}"]`)
				.forEach((highlightedRow) => highlightedRow.classList.remove("result-row--highlight"));
		});
	});

	list.querySelectorAll<HTMLElement>(".result-row").forEach((row, index) => {
		row.addEventListener("keydown", (event) => {
			if (event.key === "ArrowDown" || event.key === "ArrowUp") {
				event.preventDefault();
				const rows = list.querySelectorAll<HTMLElement>(".result-row");
				const next = event.key === "ArrowDown" ? index + 1 : index - 1;
				if (next >= 0 && next < rows.length) {
					if (state.hoveredCell) {
						state.hoveredCell.classList.remove("cell--hover-highlight");
					}
					document
						.querySelectorAll(".result-row--highlight")
						.forEach((highlightedRow) => highlightedRow.classList.remove("result-row--highlight"));

					const newRow = rows[next];
					newRow.focus();
					newRow.classList.add("result-row--highlight");

					const cell = document.querySelector(`.cell[data-date="${newRow.dataset.date}"]`);
					if (cell) {
						cell.classList.add("cell--hover-highlight");
						scrollCellIntoViewIfNeeded(cell as HTMLElement);
						state.hoveredCell = cell as HTMLElement;
					}

					state.keyboardNavActive = true;
				}
			}
			// Enter is the anchor's own: it fires a click, which `attachRouteLinkHandler` picks up.
		});
	});
}

export function renderResults(query: string, sort: SortMode): void {
	const element = document.getElementById("view-results")!;
	currentQuery = query;
	currentSort = sort;

	const firstBuild = element.querySelector(".results-search-bar") === null;
	if (firstBuild) buildSearchBar(element);

	const input = document.getElementById("results-input") as HTMLInputElement;
	const sortButton = document.getElementById("results-sort")!;
	const label = sortLabelFor(sort);
	sortButton.innerHTML = sort === "rank" ? RANK_ICON : DATE_ICON;
	sortButton.title = label;
	sortButton.setAttribute("aria-label", label);
	sortButton.setAttribute("aria-pressed", String(sort === "rank"));

	// Only when the query arriving is not the one the box already holds — a followed link, the back
	// button — because assigning to the box moves the caret to the end of it. Compared trimmed,
	// since the box is what trimmed the query on its way into the URL: a reader who typed a
	// trailing space is still holding the query that came back, and that space has a job to do
	// after a flag.
	if (input.value.trim() !== query) {
		input.value = query;
		input.setSelectionRange(query.length, query.length);
		syncQueryInput(input);
	}

	const results = search(query, sort);
	syncFilterBar(results.length);
	const list = document.getElementById("results-list")!;
	list.innerHTML = resultsHtml(results);
	state.searchResultTiers = assignTiers(results);
	attachRowHandlers(list);

	// Arriving from another view, rather than typing here or stepping through the rows. The filter
	// menu counts as being here: it is floated on `document.body` rather than nested in this element,
	// so `contains` cannot see a reader who is standing on one of its rows — and the search that
	// follows a checkmark comes back through here 200ms later.
	if (!element.contains(document.activeElement) && !filterMenuHasFocus()) {
		input.focus();
		input.setSelectionRange(input.value.length, input.value.length);
	}
}
