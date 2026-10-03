import { ArcsPage, PageSource } from "./page";
import { arcListFrom, buildArcListHtml } from "./arc-list";
import { buildCollectionsHeaderHtml } from "./collections";

/** Every arc, oldest first — the order the build writes them in. */
export function arcsPageFrom(source: PageSource): ArcsPage {
	return { view: "arcs", list: arcListFrom(source, source.arcs ?? []) };
}

/**
 * The archive always has arcs, so a list with none means they are missing from the data — which is
 * said, as an arc's own page says it, rather than left as an empty page.
 */
export function buildArcsHtml(page: ArcsPage, canGoBack: boolean): string {
	const body =
		page.list.arcs.length > 0 ? buildArcListHtml(page.list) : `<p class="detail-missing">Arc data not available.</p>`;
	return `<div class="collections-container">
		${buildCollectionsHeaderHtml("arcs", canGoBack)}
		${body}
	</div>`;
}
