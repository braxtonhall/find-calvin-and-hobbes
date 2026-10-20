import { escHtml } from "../utils";
import { addressOf } from "../base-path";
import { buildFlashLabels } from "./nav-buttons";
import { ResultRow, resultsHtml } from "./result-rows";

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

/** What the top of a subject's or a character's page says of it. */
export interface StripSetHeader {
	name: string;
	/** A character's portrait. */
	image?: string;
	/** A subject's sentence about itself. */
	description?: string;
	strips: number;
	years: number[];
	/** Its own page's path, for Copy link. */
	path: string;
}

/**
 * A subject's page, or a character's, laid out as an arc's: what it is, and every strip it is in,
 * oldest first, as rows of the search results' kind, with the grid lighting all of them. `nav` is
 * the buttons above it; `missing` is what the page says where the id names nothing.
 */
export function buildStripSetHtml(
	nav: string,
	header: StripSetHeader | null,
	missing: string,
	strips: ResultRow[],
): string {
	if (!header) {
		return `<div class="collection-container">
			${nav}
			<p class="detail-missing">${escHtml(missing)}</p>
		</div>`;
	}

	const image = header.image
		? `<div class="collection-cover"><img class="person-portrait" src="${escHtml(header.image)}" alt="${escHtml(header.name)}" /></div>`
		: "";
	const description = header.description ? `<p class="arc-description">${escHtml(header.description)}</p>` : "";
	const years =
		header.years.length > 0
			? `<p class="collection-meta"><span class="collection-meta--label">Years:</span> ${formatYears(header.years)}</p>`
			: "";

	return `<div class="collection-container">
		${nav}
		<div class="collection-header">
			${image}
			<div class="collection-info">
				<h2 class="collection-name">${escHtml(header.name)}</h2>
				${description}
				<p class="collection-meta"><span class="collection-meta--label">Comics:</span> ${formatStripCount(header.strips)}</p>
				${years}
				<div class="detail-actions">
					<button class="copy-link-btn" id="copy-link-btn" data-href="${escHtml(addressOf(header.path))}">${buildFlashLabels("Copy link", "Copied!")}</button>
				</div>
			</div>
		</div>
		<div class="arc-strips">${resultsHtml(strips, "")}</div>
	</div>`;
}
