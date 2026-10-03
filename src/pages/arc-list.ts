import { escHtml } from "../utils";
import { buildArcPath } from "../routes";
import { addressOf } from "../base-path";
import { Arc } from "../types";
import { ArcList, ArcSummary, PageSource, arcRange } from "./page";

/**
 * The list of arcs that `/arcs` and a book's page share. Nothing in it is written down ahead of
 * time: the years, the rows and the bars all come from the arcs it is given, so an arc added to or
 * taken out of `arcs.yaml` changes every list with nothing else to edit.
 */

function summarize(arc: Arc): ArcSummary {
	return { id: arc.id, description: arc.description, dates: arc.dates };
}

/** The arcs in the order given, with the archive's longest arc to scale their bars to. */
export function arcListFrom(source: PageSource, arcs: Arc[]): ArcList {
	const longest = Math.max(0, ...(source.arcs ?? []).map((arc) => arc.dates.length));
	return { arcs: arcs.map(summarize), longest };
}

/**
 * Under a year's heading the year goes without saying, except for an arc that runs into the next
 * one. An arc sits under the year it starts in.
 */
function buildRowHtml(arc: ArcSummary, longest: number): string {
	const width = longest > 0 ? (arc.dates.length / longest) * 100 : 0;
	const strips = `${arc.dates.length} strip${arc.dates.length === 1 ? "" : "s"}`;
	return `<a class="collections-row arc-row" href="${escHtml(addressOf(buildArcPath(arc.id)))}" data-arc-id="${escHtml(arc.id)}">
			<div class="collections-info">
				<div class="collections-name">${escHtml(arcRange(arc, false))}</div>
				<div class="collections-meta">${escHtml(arc.description)}</div>
				<div class="arc-length" style="width: ${width.toFixed(2)}%" title="${strips}"></div>
			</div>
		</a>`;
}

/**
 * A heading wherever the year changes from the row before — which, in a book's print order, may be
 * more than once a year. Each year's rows are grouped under their heading, which stays in view while
 * they scroll past and is pushed out by the next year's.
 */
export function buildArcListHtml(list: ArcList): string {
	const groups: { year: string; rows: string[] }[] = [];
	for (const arc of list.arcs) {
		const year = arc.dates[0].slice(0, 4);
		if (groups[groups.length - 1]?.year !== year) groups.push({ year, rows: [] });
		groups[groups.length - 1].rows.push(buildRowHtml(arc, list.longest));
	}
	const html = groups
		.map(
			({ year, rows }) =>
				`<div class="arc-year-group"><p class="collection-section-heading arc-year">${year}</p>${rows.join("")}</div>`,
		)
		.join("");
	return `<div class="arc-list">${html}</div>`;
}
