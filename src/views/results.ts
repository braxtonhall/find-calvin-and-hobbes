import "./results.css";

import { state } from "../state";
import { SortMode } from "../types";
import { search } from "../search";
import { assignTiers } from "../tiers";
import { escHtml, highlightRanges, scrollCellIntoViewIfNeeded } from "../utils";
import { buildSearchHash, navigate, replaceSearch } from "../router";

const DATE_ICON = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" aria-hidden="true">
	<rect x="2" y="3.5" width="12" height="10" rx="1.5" /><path d="M2 6.5h12M5.5 2v3M10.5 2v3" />
</svg>`;

const RANK_ICON = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" aria-hidden="true">
	<path d="M3 3v10M3 13l-2-2M3 13l2-2M7.5 4h7M7.5 8h5M7.5 12h3" />
</svg>`;

export function renderResults(query: string, sort: SortMode): void {
	const element = document.getElementById("view-results")!;
	const results = search(query, sort);

	const sortIsRank = sort === "rank";
	const sortLabel = sortIsRank
		? "Sorted by relevance — click to sort by date"
		: "Sorted by date — click to sort by relevance";

	let html = `<div class="results-search-bar">
		<input
			type="text"
			class="results-input"
			id="results-input"
			value="${escHtml(query)}"
			placeholder="Search comics..."
			autocomplete="off"
		/>
		<button class="results-clear" id="results-clear" aria-label="Clear search">&times;</button>
		<button
			class="results-sort"
			id="results-sort"
			title="${sortLabel}"
			aria-label="${sortLabel}"
			aria-pressed="${sortIsRank}"
		>${sortIsRank ? RANK_ICON : DATE_ICON}</button>
	</div>`;

	if (results.length === 0) {
		html += `<div class="results-empty">No comics found for &ldquo;${escHtml(query)}&rdquo;</div>`;
	} else {
		html += `<div style="color:var(--text-muted);font-size:13px;margin-bottom:16px;">${results.length} result${results.length !== 1 ? "s" : ""} for &ldquo;${escHtml(query)}&rdquo;</div>`;
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
			const sourceTag = source === "description" ? `<span class="result-source">Description</span>` : ``;

			html += `<div class="result-row${comic.image ? "" : " result-row--no-image"}" data-date="${comic.date}" tabindex="0" role="button" aria-label="View comic from ${dateFormatted}">
				<div class="result-header">${dateFormatted}${sourceTag}</div>
				<div class="result-body">
					<div class="result-text">${highlighted}</div>
					${comic.image ? `<div class="result-image-wrap"><img class="result-image" src="${escHtml(comic.image)}" alt="Comic from ${dateFormatted}" onload="this.classList.add('loaded')" onerror="this.style.display='none'" /></div>` : ``}
				</div>
			</div>`;
		}
	}

	const previousInput = document.getElementById("results-input") as HTMLInputElement | null;
	const carried =
		previousInput && document.activeElement === previousInput && previousInput.value.trim() === query
			? {
					value: previousInput.value,
					start: previousInput.selectionStart ?? previousInput.value.length,
					end: previousInput.selectionEnd ?? previousInput.value.length,
					direction: previousInput.selectionDirection ?? "none",
				}
			: null;

	element.innerHTML = html;

	state.searchResultTiers = assignTiers(results);

	const input = document.getElementById("results-input") as HTMLInputElement;
	const clearButton = document.getElementById("results-clear")!;
	const sortButton = document.getElementById("results-sort")!;

	input.addEventListener("input", () => {
		if (state.resultsDebounceTimer !== null) clearTimeout(state.resultsDebounceTimer);
		const inputQuery = input.value.trim();
		state.resultsDebounceTimer = window.setTimeout(() => {
			if (inputQuery) {
				replaceSearch(buildSearchHash(inputQuery, sort));
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
			} else if (inputQuery !== query) {
				replaceSearch(buildSearchHash(inputQuery, sort));
			}
		}
	});

	clearButton.addEventListener("click", () => {
		navigate("#/");
	});

	sortButton.addEventListener("click", () => {
		if (state.resultsDebounceTimer !== null) clearTimeout(state.resultsDebounceTimer);
		const inputQuery = input.value.trim() || query;
		if (inputQuery) replaceSearch(buildSearchHash(inputQuery, sortIsRank ? "date" : "rank"));
	});

	element.querySelectorAll<HTMLElement>(".result-row").forEach((row) => {
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

		row.addEventListener("click", () => {
			navigate("#/comic/" + row.dataset.date);
		});

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

	element.querySelectorAll<HTMLElement>(".result-row").forEach((row, index) => {
		row.addEventListener("keydown", (event) => {
			if (event.key === "ArrowDown" || event.key === "ArrowUp") {
				event.preventDefault();
				const rows = element.querySelectorAll<HTMLElement>(".result-row");
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
			} else if (event.key === "Enter") {
				event.preventDefault();
				navigate("#/comic/" + row.dataset.date);
			}
		});
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

	input.focus();
	if (carried) {
		input.value = carried.value;
		input.setSelectionRange(carried.start, carried.end, carried.direction);
	} else {
		input.setSelectionRange(input.value.length, input.value.length);
	}
}
