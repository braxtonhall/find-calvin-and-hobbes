import { escHtml } from "../utils";
import { buildArcPath, buildComicPath } from "../routes";
import { addressOf } from "../base-path";
import { formatLongDate } from "../date-utils";
import { Appearance, Arc, Comic } from "../types";
import { ArcNeighbour, ArcPage, ArcStrip, PageSource, arcRange } from "./page";
import { buildFlashLabels, buildArcsButton, buildBackAndHomeButtons } from "./nav-buttons";
import { buildAppearancesSectionHtml, summarizeCollections } from "./detail";
import { bookmarkId, ownershipId } from "../library-file";

/** The strip an arc's date names: the day's own, never a special that shares its date. */
function stripOn(source: PageSource, date: string): Comic | undefined {
	return source.comicsByDate.get(date)?.find((comic) => !comic.id);
}

/**
 * Where each book that holds the whole arc prints it, the arc's pages gathered into one appearance
 * per volume. A book's editions hold the same strips, so it is shown in one of them — the one its
 * strips list first — rather than once per edition. Pages are in the order of the arc's strips, so
 * the first is where the arc begins.
 */
function arcAppearances(strips: (Comic | undefined)[], arc: Arc): Appearance[] {
	const appearances: Appearance[] = [];
	for (const collection of arc.collections) {
		const inBook = strips.flatMap((comic) =>
			(comic?.appearances ?? []).filter((appearance) => appearance.collection === collection),
		);
		const edition = inBook[0]?.edition;
		const pagesByVolume = new Map<number | undefined, Set<number>>();
		for (const appearance of inBook) {
			if (appearance.edition !== edition) continue;
			if (!pagesByVolume.has(appearance.volume)) pagesByVolume.set(appearance.volume, new Set());
			for (const page of appearance.pages) pagesByVolume.get(appearance.volume)!.add(page);
		}
		const volumes = [...pagesByVolume].sort(([a], [b]) => (a ?? 0) - (b ?? 0));
		for (const [volume, pages] of volumes) {
			appearances.push({
				collection,
				...(edition !== undefined ? { edition } : {}),
				...(volume !== undefined ? { volume } : {}),
				pages: [...pages],
			});
		}
	}
	return appearances;
}

function neighbour(arc: Arc | undefined): ArcNeighbour | null {
	return arc ? { id: arc.id, range: arcRange(arc) } : null;
}

export function arcPageFrom(source: PageSource, arcId: string): ArcPage {
	const arc = source.arcsById?.get(arcId) ?? null;
	const empty = { strips: [], appearances: [], collections: [], prev: null, next: null };
	if (!arc) return { view: "arc", id: arcId, arc: null, arcsLoaded: source.arcs !== null, ...empty };

	const comics = arc.dates.map((date) => stripOn(source, date));
	const strips: ArcStrip[] = arc.dates.map((date, index) => ({
		date,
		text: source.descriptions?.get(date) ?? comics[index]?.transcript ?? "",
	}));
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

/**
 * The arc's strips as rows of the search results' kind — the same markup, so the same handlers light
 * each one's cell while it is hovered, and open its menu. Each is the day's own strip, never a
 * special. A strip with no description shows its transcript instead.
 */
function buildStripRowHtml(strip: ArcStrip): string {
	const dateFormatted = formatLongDate(strip.date);
	return `<a class="result-row result-row--no-image" href="${addressOf(buildComicPath(strip.date))}" draggable="false" data-date="${strip.date}" data-bookmark="${bookmarkId({}, strip.date)}" data-ownership="${ownershipId({}, strip.date)}" aria-label="View comic from ${dateFormatted}">
			<div class="result-header">${dateFormatted}</div>
			<div class="result-body">
				<div class="result-text">${escHtml(strip.text)}</div>
			</div>
		</a>`;
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
		<div class="arc-strips">${page.strips.map(buildStripRowHtml).join("")}</div>
		<div class="arc-collections">${buildAppearancesSectionHtml(page.appearances, collectionsById, "", false)}</div>
	</div>`;
}
