import "./results.css";

import { state } from "../state";
import { escHtml, highlightMatches, scrollCellIntoViewIfNeeded } from "../utils";
import { navigate, replaceRoute, updateGridState } from "../router";

export function renderResults(query: string): void {
	const element = document.getElementById("view-results")!;
	const results = state.comics.filter((comic) => comic.transcript.toLowerCase().includes(query.toLowerCase()));

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
	</div>`;

	if (results.length === 0) {
		html += `<div class="results-empty">No comics found for &ldquo;${escHtml(query)}&rdquo;</div>`;
	} else {
		html += `<div style="color:var(--text-muted);font-size:13px;margin-bottom:16px;">${results.length} result${results.length !== 1 ? "s" : ""} for &ldquo;${escHtml(query)}&rdquo;</div>`;
		for (const comic of results) {
			const [year, month, day] = comic.date.split("-").map(Number);
			const dateObject = new Date(Date.UTC(year, month - 1, day));
			const dateFormatted = dateObject.toLocaleDateString("en-US", {
				weekday: "long",
				year: "numeric",
				month: "long",
				day: "numeric",
				timeZone: "UTC",
			});
			const highlighted = highlightMatches(comic.transcript, query);

			html += `<div class="result-row${comic.image ? "" : " result-row--no-image"}" data-date="${comic.date}" tabindex="0" role="button" aria-label="View comic from ${dateFormatted}">
				<div class="result-header">${dateFormatted}</div>
				<div class="result-body">
					<div class="result-text">${highlighted}</div>
					${comic.image ? `<div class="result-image-wrap"><img class="result-image" src="${escHtml(comic.image)}" alt="Comic from ${dateFormatted}" onload="this.classList.add('loaded')" onerror="this.style.display='none'" /></div>` : ``}
				</div>
			</div>`;
		}
	}

	element.innerHTML = html;

	state.searchResultsDateSet = new Set(results.map((comic) => comic.date));

	const input = document.getElementById("results-input") as HTMLInputElement;
	const clearButton = document.getElementById("results-clear")!;

	input.addEventListener("input", () => {
		if (state.resultsDebounceTimer !== null) clearTimeout(state.resultsDebounceTimer);
		const inputQuery = input.value.trim();
		state.resultsDebounceTimer = window.setTimeout(() => {
			if (inputQuery) {
				replaceRoute("#/search?q=" + encodeURIComponent(inputQuery));
				renderResults(inputQuery);
				updateGridState({ view: "results" });
				document.getElementById("main")!.scrollTop = 0;
				document.title = inputQuery + " — Calvin & Hobbes Search";
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
			if (inputQuery) {
				navigate("#/search?q=" + encodeURIComponent(inputQuery));
			} else {
				navigate("#/");
			}
		}
	});

	clearButton.addEventListener("click", () => {
		navigate("#/");
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
	input.setSelectionRange(input.value.length, input.value.length);
}
