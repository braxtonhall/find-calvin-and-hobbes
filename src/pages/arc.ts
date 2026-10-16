import { escHtml } from "../utils";
import { buildArcPath } from "../routes";
import { addressOf } from "../base-path";
import { Appearance, Arc, Comic } from "../types";
import { ArcNeighbour, ArcPage, PageSource, arcRange } from "./page";
import { buildFlashLabels, buildArcsButton, buildBackAndHomeButtons } from "./nav-buttons";
import { buildAppearancesSectionHtml, summarizeCollections } from "./detail";
import { ResultRow, resultsHtml } from "./result-rows";

/** The strip an arc's date names: the day's own, never a special that shares its date. */
export function stripOn(source: PageSource, date: string): Comic | undefined {
	return source.comicsByDate.get(date)?.find((comic) => !comic.id);
}

/**
 * Where each book that holds the whole arc prints it, the arc's pages gathered into one appearance
 * per volume. Pages are in the order of the arc's strips, so the first is where the arc begins.
 */
function arcAppearances(strips: (Comic | undefined)[], arc: Arc): Appearance[] {
	const appearances: Appearance[] = [];
	for (const collection of arc.collections) {
		const inBook = strips.flatMap((comic) =>
			(comic?.appearances ?? []).filter((appearance) => appearance.collection === collection),
		);
		const pagesByVolume = new Map<number | undefined, Set<number>>();
		for (const appearance of inBook) {
			if (!pagesByVolume.has(appearance.volume)) pagesByVolume.set(appearance.volume, new Set());
			for (const page of appearance.pages) pagesByVolume.get(appearance.volume)!.add(page);
		}
		const volumes = [...pagesByVolume].sort(([a], [b]) => (a ?? 0) - (b ?? 0));
		for (const [volume, pages] of volumes) {
			appearances.push({
				collection,
				...(volume !== undefined ? { volume } : {}),
				pages: [...pages],
			});
		}
	}
	return appearances;
}

/**
 * Each date's strip as a row of the search results' kind, as a search for them alone would list it,
 * but told by its description, which says what happens in it, or its transcript where it has none.
 */
export function stripsOn(
	source: PageSource,
	dates: string[],
	comics: (Comic | undefined)[] = dates.map((date) => stripOn(source, date)),
): ResultRow[] {
	return comics.flatMap((comic) =>
		comic
			? [
					{
						comic,
						text: source.descriptions?.get(comic.date) ?? comic.transcript ?? "",
						ranges: [],
						source: "filter" as const,
					},
				]
			: [],
	);
}

function neighbour(arc: Arc | undefined): ArcNeighbour | null {
	return arc ? { id: arc.id, range: arcRange(arc) } : null;
}

export function arcPageFrom(source: PageSource, arcId: string): ArcPage {
	const arc = source.arcsById?.get(arcId) ?? null;
	const empty = { strips: [], appearances: [], collections: [], prev: null, next: null };
	if (!arc) return { view: "arc", id: arcId, arc: null, arcsLoaded: source.arcs !== null, ...empty };

	const comics = arc.dates.map((date) => stripOn(source, date));
	const strips = stripsOn(source, arc.dates, comics);
	const collections = summarizeCollections(
		source,
		comics.filter((comic): comic is Comic => comic !== undefined),
	).filter((collection) => arc.collections.includes(collection.id));
	const arcs = source.arcs ?? [];
	const index = arcs.findIndex((candidate) => candidate.id === arc.id);

	return {
		view: "arc",
		id: arcId,
		arc,
		arcsLoaded: true,
		strips,
		appearances: arcAppearances(comics, arc),
		collections,
		prev: neighbour(arcs[index - 1]),
		next: neighbour(arcs[index + 1]),
	};
}

function buildNavButtons(canGoBack: boolean): string {
	return `${buildBackAndHomeButtons(canGoBack)}
		${buildArcsButton("detail-home")}`;
}

function buildNeighbourButton(arc: ArcNeighbour | null, direction: "prev" | "next"): string {
	const arrow = direction === "prev" ? "&larr;" : "&rarr;";
	if (!arc) {
		return `<span class="nav-btn nav-btn--disabled" title="${direction === "prev" ? "First arc" : "Last arc"}">${arrow}</span>`;
	}
	const label = direction === "prev" ? "Previous arc" : "Next arc";
	return `<a class="nav-btn" href="${escHtml(addressOf(buildArcPath(arc.id)))}" title="${label}: ${escHtml(arc.range)}">${arrow}</a>`;
}

export function buildArcHtml(page: ArcPage, canGoBack: boolean): string {
	const { arc } = page;

	if (!arc) {
		const message = page.arcsLoaded ? `Arc "${escHtml(page.id)}" not found.` : "Arc data not available.";
		return `<div class="collection-container">
			${buildNavButtons(canGoBack)}
			<p class="detail-missing">${message}</p>
		</div>`;
	}

	const collectionsById = new Map(page.collections.map((collection) => [collection.id, collection]));
	const count = arc.dates.length;

	return `<div class="collection-container">
		${buildNavButtons(canGoBack)}
		<div class="collection-header">
			<div class="collection-info">
				<h2 class="collection-name">${escHtml(arcRange(arc))}</h2>
				<p class="arc-description">${escHtml(arc.description)}</p>
				<p class="collection-meta"><span class="collection-meta--label">Comics:</span> ${count} strip${count !== 1 ? "s" : ""}</p>
				<div class="detail-actions">
					<button class="copy-link-btn" id="copy-link-btn" data-href="${escHtml(addressOf(buildArcPath(arc.id)))}">${buildFlashLabels("Copy link", "Copied!")}</button>
					${buildNeighbourButton(page.prev, "prev")}
					${buildNeighbourButton(page.next, "next")}
				</div>
			</div>
		</div>
		<div class="columns">
			<div class="columns__main arc-strips">${resultsHtml(page.strips, "")}</div>
			<div class="columns__aside arc-collections">${buildAppearancesSectionHtml(page.appearances, collectionsById, "", false)}</div>
		</div>
	</div>`;
}
