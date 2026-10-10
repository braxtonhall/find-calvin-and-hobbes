import { escHtml } from "../utils";
import { buildCreatorPath } from "../routes";
import { addressOf } from "../base-path";
import { Creator } from "../types";
import { CreatorsPage, PageSource } from "./page";
import { buildCollectionsHeaderHtml, buildNoMatchesHtml } from "./collections";

/** Every creator, in the order the creators' file lists them. */
export function creatorsPageFrom(source: PageSource, q?: string): CreatorsPage {
	return { view: "creators", creators: [...source.creatorsById.values()], ...(q === undefined ? {} : { q }) };
}

/** `1985–1995`, or `1950–1960, 1963`: the years, with each run of them as its ends. */
export function formatYears(years: readonly number[]): string {
	const runs: [number, number][] = [];
	for (const year of years) {
		const last = runs[runs.length - 1];
		if (last && year === last[1] + 1) last[1] = year;
		else runs.push([year, year]);
	}
	return runs.map(([first, last]) => (first === last ? `${first}` : `${first}–${last}`)).join(", ");
}

/** `3,160 strips`. */
export function formatStripCount(strips: number): string {
	return `${strips.toLocaleString("en-US")} strip${strips === 1 ? "" : "s"}`;
}

/**
 * A row of the list of books, with the portrait where the cover goes. Where some creators have one
 * and some don't, the rest keep the space, so the names line up. `data-creator-id` is what the view
 * reads to light up their strips while the row is hovered.
 */
function buildRowHtml(creator: Creator, portraits: boolean): string {
	const cover = portraits
		? `<div class="collections-cover">${creator.image ? `<img class="creator-portrait" src="${escHtml(creator.image)}" alt="" loading="lazy" />` : ""}</div>`
		: "";
	return `<a class="collections-row creator-row" href="${escHtml(addressOf(buildCreatorPath(creator.id)))}" data-creator-id="${escHtml(creator.id)}">
			${cover}
			<div class="collections-info">
				<div class="collections-name">${escHtml(creator.name)}</div>
				<div class="collections-meta">${formatYears(creator.years)} · ${formatStripCount(creator.strips)}</div>
			</div>
		</a>`;
}

/** The list, narrowed to `ids` where a search has narrowed it. */
export function buildCreatorsBodyHtml(page: CreatorsPage, ids: ReadonlySet<string> | null = null): string {
	if (page.creators.length === 0) return `<p class="detail-missing">Creator data not available.</p>`;
	// Whether any has a portrait is the whole list's question, so the names line up the same narrowed.
	const portraits = page.creators.some((creator) => creator.image);
	const shown = ids === null ? page.creators : page.creators.filter((creator) => ids.has(creator.id));
	if (shown.length === 0) return buildNoMatchesHtml("creators");
	return `<div class="collections-list">${shown.map((creator) => buildRowHtml(creator, portraits)).join("")}</div>`;
}

export function buildCreatorsHtml(
	page: CreatorsPage,
	canGoBack: boolean,
	ids: ReadonlySet<string> | null = null,
): string {
	return `<div class="collections-container">
		${buildCollectionsHeaderHtml("creators", canGoBack, page.q)}
		<div class="collections-body">${buildCreatorsBodyHtml(page, ids)}</div>
	</div>`;
}
