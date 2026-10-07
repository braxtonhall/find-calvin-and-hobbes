import "./results.css";

import { state } from "../state";
import { SearchResult } from "../search";
import { clearRowHighlights, escHtml, highlightRanges, scrollCellIntoViewIfNeeded } from "../utils";
import { buildComicPath } from "../routes";
import { addressOf } from "../base-path";
import { dateToCompact, formatLongDate } from "../date-utils";
import { cellForDate } from "../grid";
import { srcsetAttributes } from "../srcset";

/**
 * The rows of strips a page lists — the search results, and the bookmarks — and what they do to the
 * grid while they are hovered or stepped through. Both pages draw them the same way; the bookmarks
 * are rows no query found, so they arrive here as `SearchResult`s too. See `bookmarkResults`.
 */

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
 * What the row's badge says: how it matched, and whether it is a day its strip ran again — which is
 * worth saying on every page, because the strip is not from the day in its header.
 */
function labelOf(result: SearchResult): string {
	return [SOURCE_LABELS[result.source], result.rerun ? "Rerun" : ""].filter(Boolean).join(" · ");
}

/** The rows, or `empty` when there are none, each badged with how it matched. */
export function resultsHtml(results: SearchResult[], empty: string): string {
	if (results.length === 0) {
		return `<div class="results-empty">${empty}</div>`;
	}

	let html = "";
	for (const result of results) {
		const { comic, text, ranges } = result;
		const dateFormatted = formatLongDate(comic.date);
		const highlighted = highlightRanges(text, ranges);
		const label = labelOf(result);
		const sourceTag = label ? `<span class="result-source">${label}</span>` : ``;

		// An anchor rather than the `tabindex`/`role="button"` div it used to be: the row goes somewhere
		// with an address, so the browser can offer to copy it or open it in a second tab, and the
		// focus and Enter behaviour that had to be spelled out now comes for free — and announces as a
		// link, which is the truth. `draggable="false"` because dragging from inside an anchor drags the
		// link instead of selecting text, and the transcript below is text a reader may want to copy.
		// Covering a box 200 pixels by 140, as `.result-image-wrap` does: a daily, wider than the box, by its height.
		const srcset = comic.image
			? srcsetAttributes(comic.image, comic.width, `${Math.max(200, Math.ceil(140 * (comic.aspectRatio ?? 1)))}px`)
			: "";
		const comicLink = addressOf(buildComicPath(comic.date, result.matchedAlternate ? [dateToCompact(comic.date)] : []));
		html += `<a class="result-row${comic.image ? "" : " result-row--no-image"}" href="${comicLink}" draggable="false" data-date="${comic.date}" aria-label="View comic from ${dateFormatted}">
			<div class="result-header">${dateFormatted}${sourceTag}</div>
			<div class="result-body">
				<div class="result-text">${highlighted}</div>
				${comic.image ? `<div class="result-image-wrap"><img class="result-image" src="${escHtml(comic.image)}"${srcset} alt="Comic from ${dateFormatted}" onload="this.classList.add('loaded')" onerror="this.style.display='none'" /></div>` : ``}
			</div>
		</a>`;
	}
	return html;
}

/**
 * Tabbing onto a row lights it and its cell, as hovering does. Attached once, to a container that
 * outlives its rows, since a delegated listener does not need re-adding on every redraw.
 */
export function attachRowFocusHandler(element: HTMLElement): void {
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
		const cell = cellForDate(row.dataset.date!);
		if (cell) {
			cell.classList.add("cell--hover-highlight");
			scrollCellIntoViewIfNeeded(cell);
			state.hoveredCell = cell;
		}
		state.keyboardNavActive = true;
	});
}

export function attachRowHandlers(list: HTMLElement): void {
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
			// By the light rather than by the hovered cell's day: zoomed out, the cell is a box, which
			// has none.
			state.hoveredCell?.classList.remove("cell--hover-highlight");
			clearRowHighlights();
			const cell = cellForDate(row.dataset.date!);
			if (cell) {
				cell.classList.add("cell--hover-highlight");
				scrollCellIntoViewIfNeeded(cell);
				state.hoveredCell = cell;
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

					const cell = cellForDate(newRow.dataset.date!);
					if (cell) {
						cell.classList.add("cell--hover-highlight");
						scrollCellIntoViewIfNeeded(cell);
						state.hoveredCell = cell;
					}

					state.keyboardNavActive = true;
				}
			}
			// Enter is the anchor's own: it fires a click, which `attachRouteLinkHandler` picks up.
		});
	});
}
