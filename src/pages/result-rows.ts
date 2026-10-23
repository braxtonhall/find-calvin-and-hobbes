import type { SearchResult } from "../search";
import { escHtml, highlightRanges } from "../utils";
import { buildComicPath } from "../routes";
import { addressOf } from "../base-path";
import { dateToCompact, formatLongDate } from "../date-utils";
import { srcsetAttributes } from "../srcset";
import { bookmarkId, ownershipId } from "../library-file";

/**
 * The rows of strips a page lists: the search results, the bookmarks and the bookshelf, and the
 * strips of an arc or a subject. Drawn by the build as well as the app, so nothing here touches the
 * page; what the rows do once drawn is `views/result-rows.ts`.
 */

/** A row: a search's result, or a strip a page lists as one, which has no score to rank it by. */
export type ResultRow = Omit<SearchResult, "score">;

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
function labelOf(result: ResultRow): string {
	return [SOURCE_LABELS[result.source], result.rerun ? "Rerun" : ""].filter(Boolean).join(" · ");
}

/** The transcripts a row's strip opens on the alternate of, when the alternate is what matched. */
export function alternatesOf(result: ResultRow): string[] {
	return result.matchedAlternate ? [dateToCompact(result.comic.date)] : [];
}

/** Where a row goes: its strip's page. */
export function rowHrefOf(result: ResultRow): string {
	return addressOf(buildComicPath(result.comic.date, alternatesOf(result)));
}

/**
 * A row's picture of its strip. Left out of a row drawn plain, and put in when the row is first on
 * screen — see `drawRows`.
 */
export function rowImageHtml(result: ResultRow): string {
	const { comic } = result;
	if (!comic.image) return "";
	const dateFormatted = formatLongDate(comic.date);
	// Covering a box 200 pixels by 140, as `.result-image-wrap` does: a daily, wider than the box, by its height.
	const srcset = srcsetAttributes(
		comic.image,
		comic.width,
		`${Math.max(200, Math.ceil(140 * (comic.aspectRatio ?? 1)))}px`,
	);
	return `<img class="result-image" src="${escHtml(comic.image)}"${srcset} alt="Comic from ${dateFormatted}" loading="lazy" onload="this.classList.add('loaded')" onerror="this.style.display='none'" />`;
}

/**
 * The rows, or `empty` when there are none, each badged with how it matched. A `plain` row is its
 * header and its text, for find-in-page to search, with its picture's box left empty for now.
 */
export function resultsHtml(results: readonly ResultRow[], empty: string, plain = false): string {
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
		// with an address, so a cmd-click opens it in a second tab (a right-click opens the strip's own
		// menu instead — see `row-menu.ts`), and the
		// focus and Enter behaviour that had to be spelled out now comes for free — and announces as a
		// link, which is the truth. `draggable="false"` because dragging from inside an anchor drags the
		// link instead of selecting text, and the transcript below is text a reader may want to copy.
		const comicLink = rowHrefOf(result);
		html += `<a class="result-row${comic.image ? "" : " result-row--no-image"}${plain ? " result-row--plain" : ""}" href="${comicLink}" draggable="false" data-date="${comic.date}" data-bookmark="${escHtml(bookmarkId(comic, comic.date))}" data-ownership="${escHtml(ownershipId(comic, comic.date))}" aria-label="View comic from ${dateFormatted}">
			<div class="result-header">${dateFormatted}${sourceTag}</div>
			<div class="result-body">
				<div class="result-text">${highlighted}</div>
				${comic.image ? `<div class="result-image-wrap">${plain ? "" : rowImageHtml(result)}</div>` : ``}
			</div>
		</a>`;
	}
	return html;
}
