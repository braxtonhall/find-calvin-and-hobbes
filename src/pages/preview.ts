import { escHtml } from "../utils";
import { ownershipId } from "../library-file";
import { DetailPage } from "./page";
import { buildDetailShellHtml } from "./detail";
import { buildNavRow } from "./nav-buttons";

/**
 * A search's preview of one of its rows, or of a day's: the strip's own page, beside the results, for
 * the strips that are results — a day with two strips previews whichever was picked, or, picked from
 * the grid, both if both are results. Its arrows step through the results rather than the days, and
 * in place of Back and Home it has a way to close it and a way to the strip's own page, with the
 * arrows beside them. Drawn by `buildDetailShellHtml`, so it is whatever the strip's page is.
 */

/** The row either side of the one previewed: its own page's address, and its day. */
export interface PreviewStep {
	href: string;
	date: string;
}

/**
 * The day's page narrowed to the strips `keys` name, as `ownershipId` does — the ones among the
 * results — or `null` if the day has none of them.
 */
export function previewPageOf(page: DetailPage, keys: readonly string[]): DetailPage | null {
	const comics = page.comics.filter((comic) => keys.includes(ownershipId(comic, page.date)));
	return comics.length > 0 ? { ...page, comics } : null;
}

/**
 * The preview's arrows. Links to the rows' own pages, so a modified click opens one in a tab of its
 * own; a plain click is the view's, which steps the preview. `data-date` lights the cell, as the strip
 * page's arrows do.
 */
export function buildPreviewArrowsHtml(prev: PreviewStep | null, next: PreviewStep | null): string {
	const arrow = (step: PreviewStep | null, direction: "prev" | "next") => {
		const glyph = direction === "prev" ? "&larr;" : "&rarr;";
		if (!step) {
			return `<span class="nav-btn nav-btn--disabled" title="${direction === "prev" ? "First" : "Last"} result">${glyph}</span>`;
		}
		const label = direction === "prev" ? "Previous result" : "Next result";
		return `<a class="nav-btn preview-step" href="${escHtml(step.href)}" data-step="${direction}" data-date="${step.date}" title="${label}" aria-label="${label}">${glyph}</a>`;
	};
	return arrow(prev, "prev") + arrow(next, "next");
}

/** `href` is the strip's own page, as its row links to it. */
export function buildPreviewHtml(
	page: DetailPage,
	href: string,
	prev: PreviewStep | null,
	next: PreviewStep | null,
): string {
	const leading = buildNavRow(
		`<button class="detail-back preview-close">Close</button>
		<a class="detail-home" href="${escHtml(href)}">Open page</a>`,
		buildPreviewArrowsHtml(prev, next),
	);
	return buildDetailShellHtml(page, leading);
}
