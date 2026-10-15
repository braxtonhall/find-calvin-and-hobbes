import { ArcList, ArcsPage, PageSource } from "./page";
import { arcListFrom, buildArcListHtml } from "./arc-list";
import { TabOrder } from "../types";
import { buildCollectionsHeaderHtml, buildNoMatchesHtml, orderOf, sortedByCount } from "./collections";

/** Every arc, oldest first — the order the build writes them in — or longest first. */
export function arcsPageFrom(source: PageSource, q?: string, order?: TabOrder): ArcsPage {
	const arcs = source.arcs ?? [];
	return {
		view: "arcs",
		list: arcListFrom(source, order === "count" ? sortedByCount(arcs, (arc) => arc.dates.length) : arcs),
		...(q === undefined ? {} : { q }),
		...orderOf(order),
	};
}

/** The list, narrowed to `ids` where a search has narrowed it. */
export function narrowArcs(list: ArcList, ids: ReadonlySet<string> | null): ArcList {
	return ids === null ? list : { ...list, arcs: list.arcs.filter((arc) => ids.has(arc.id)) };
}

/**
 * The archive always has arcs, so a list with none means they are missing from the data — which is
 * said, as an arc's own page says it, rather than left as an empty page. A search that finds none
 * says that instead.
 */
export function buildArcsBodyHtml(page: ArcsPage, ids: ReadonlySet<string> | null = null): string {
	if (page.list.arcs.length === 0) return `<p class="detail-missing">Arc data not available.</p>`;
	const list = narrowArcs(page.list, ids);
	if (list.arcs.length === 0) return buildNoMatchesHtml("arcs");
	// Longest first, the years are all mixed up, so there are none to head the rows with.
	return buildArcListHtml(list, page.order !== "count");
}

export function buildArcsHtml(page: ArcsPage, canGoBack: boolean, ids: ReadonlySet<string> | null = null): string {
	return `<div class="collections-container">
		${buildCollectionsHeaderHtml("arcs", canGoBack, page.q, page.order)}
		<div class="collections-body">${buildArcsBodyHtml(page, ids)}</div>
	</div>`;
}
