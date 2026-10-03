import { ArcsPage, PageSource } from "./page";
import { arcListFrom, buildArcListHtml } from "./arc-list";
import { buildCollectionsHeaderHtml } from "./collections";

/** Every arc, oldest first — the order `arcs.json` is written in. */
export function arcsPageFrom(source: PageSource): ArcsPage {
	return { view: "arcs", list: arcListFrom(source, source.arcs ?? []) };
}

export function buildArcsHtml(page: ArcsPage, canGoBack: boolean): string {
	return `<div class="collections-container">
		${buildCollectionsHeaderHtml("arcs", canGoBack)}
		${buildArcListHtml(page.list)}
	</div>`;
}
