import { ArcList, ArcsPage, PageSource } from "./page";
import { arcListFrom, buildArcListHtml } from "./arc-list";
import { buildCollectionsHeaderHtml, buildNoMatchesHtml } from "./collections";

/** Every arc, oldest first — the order the build writes them in. */
export function arcsPageFrom(source: PageSource, q?: string): ArcsPage {
	return { view: "arcs", list: arcListFrom(source, source.arcs ?? []), ...(q === undefined ? {} : { q }) };
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
	return list.arcs.length > 0 ? buildArcListHtml(list) : buildNoMatchesHtml("arcs");
}

export function buildArcsHtml(page: ArcsPage, canGoBack: boolean, ids: ReadonlySet<string> | null = null): string {
	return `<div class="collections-container">
		${buildCollectionsHeaderHtml("arcs", canGoBack, page.q)}
		<div class="collections-body">${buildArcsBodyHtml(page, ids)}</div>
	</div>`;
}
