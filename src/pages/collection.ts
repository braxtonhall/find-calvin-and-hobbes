import { escHtml } from "../utils";
import {
	isDateInCollection,
	getCollectionCoverage,
	parseDailiesRange,
	compactToDate,
	formatCompactDate,
} from "../date-utils";
import { buildCollectionPath, buildComicPath, buildSearchPath } from "../routes";
import { addressOf } from "../base-path";
import { Collection } from "../types";
import { CollectionNeighbour, CollectionPage, PageSource } from "./page";
import { buildBackAndHomeButtons, buildCollectionsButton } from "./nav-buttons";

export function getTypeLabel(type: string): string {
	const typeLabels: Record<string, string> = {
		collection: "Collection",
		compendium: "Compendium",
		treasury: "Treasury",
		complete: "Complete Collection",
		special: "Special Book",
	};
	return typeLabels[type] || type;
}

export function collectionPageFrom(source: PageSource, collectionId: string): CollectionPage {
	const collection = source.collectionsById?.get(collectionId) ?? null;
	const extras = source.collectionIndex?.collection_extras?.[collectionId] ?? [];

	const collections = source.collectionIndex?.collections ?? [];
	const index = collections.findIndex((candidate) => candidate.id === collectionId);
	const neighbour = (at: number): CollectionNeighbour | null =>
		index >= 0 && at >= 0 && at < collections.length ? { id: collections[at].id, name: collections[at].name } : null;

	const dates: string[] = [];
	if (collection) {
		for (const [date] of source.comicsByDate) {
			if (isDateInCollection(date, collection)) dates.push(date);
		}
	}

	return {
		view: "collection",
		id: collectionId,
		collection,
		indexLoaded: source.collectionIndex !== null,
		extras,
		dates,
		prev: neighbour(index - 1),
		next: neighbour(index + 1),
	};
}

const MONTH_NAMES = [
	"January",
	"February",
	"March",
	"April",
	"May",
	"June",
	"July",
	"August",
	"September",
	"October",
	"November",
	"December",
];

/** `April 1987`, or `April 5, 1987` where the day is known; "" where the year is not. */
export function formatPublicationDate(collection: Pick<Collection, "pub_year" | "pub_month" | "pub_day">): string {
	if (!collection.pub_year) return "";
	const monthName = MONTH_NAMES[collection.pub_month - 1];
	return collection.pub_day
		? `${monthName} ${collection.pub_day}, ${collection.pub_year}`
		: `${monthName} ${collection.pub_year}`;
}

function buildNavButtons(canGoBack: boolean): string {
	return `${buildBackAndHomeButtons(canGoBack)}
		${buildCollectionsButton("detail-home")}`;
}

function buildNeighbourButton(neighbour: CollectionNeighbour | null, direction: "prev" | "next"): string {
	const arrow = direction === "prev" ? "&larr;" : "&rarr;";
	const label = direction === "prev" ? "Previous collection" : "Next collection";
	if (!neighbour) {
		return `<span class="nav-btn nav-btn--disabled" title="${direction === "prev" ? "First collection" : "Last collection"}">${arrow}</span>`;
	}
	return `<a class="nav-btn" href="${escHtml(addressOf(buildCollectionPath(neighbour.id)))}" title="${label}: ${escHtml(neighbour.name)}">${arrow}</a>`;
}

/**
 * One end of a range, as a link to its strip. The ends are always strips: the ranges are coalesced
 * from the strips the book holds (see `coalesceRanges` in the build), so each one starts and stops
 * on a date the archive has. `data-date` is what the view reads to light up the strip's cell.
 */
function buildRangeDateLink(compact: string): string {
	const date = compactToDate(compact).toISOString().slice(0, 10);
	return `<a class="collection-range-date" href="${addressOf(buildComicPath(date))}" data-date="${date}">${formatCompactDate(compact)}</a>`;
}

/** `1987/05/23`, from `19870524` moved by `days` — the form a date filter's value is written in. */
function filterDate(compact: string, days: number): string {
	const date = compactToDate(compact);
	date.setUTCDate(date.getUTCDate() + days);
	return date.toISOString().slice(0, 10).replace(/-/g, "/");
}

/**
 * The search that holds exactly the range, oldest first. `@after` and `@before` leave out the day
 * they name, so each bound is written a day outside the range to keep both ends in it. A book of
 * Sundays only holds only the Sundays between its ends, so its search says so too.
 */
export function buildRangeSearchPath(entry: string, sundays: boolean = false): string {
	const [start, end] = parseDailiesRange(entry);
	const bounds = `@after:${filterDate(start, -1)} @before:${filterDate(end, 1)}`;
	return buildSearchPath(sundays ? `${bounds} @sunday` : bounds, "date");
}

function buildRangeHtml(entry: string, sundays: boolean): string {
	const [start, end] = parseDailiesRange(entry);
	if (start === end) return buildRangeDateLink(start);
	// A small thing to find: the dash between the ends is the search for everything between them.
	const dash = `<a class="collection-range-dash" href="${escHtml(addressOf(buildRangeSearchPath(entry, sundays)))}">\u2013</a>`;
	return `${buildRangeDateLink(start)} ${dash} ${buildRangeDateLink(end)}`;
}

export function buildCollectionHtml(page: CollectionPage, canGoBack: boolean): string {
	const { collection } = page;

	if (!collection) {
		const message = page.indexLoaded ? `Collection "${escHtml(page.id)}" not found.` : "Collection data not available.";
		return `<div class="collection-container">
			${buildNavButtons(canGoBack)}
			<p class="detail-missing">${message}</p>
		</div>`;
	}

	const typeLabel = getTypeLabel(collection.type);
	const imageUrl = collection.image;
	const coverage = getCollectionCoverage(collection);
	const pubDateFormatted = formatPublicationDate(collection);

	let rangesHtml = "";
	if (collection.dailies && collection.dailies.length > 0) {
		rangesHtml = collection.dailies
			.map((range) => `<div class="collection-range">${buildRangeHtml(range, collection.sundays ?? false)}</div>`)
			.join("");
	} else {
		rangesHtml = `<div class="collection-no-ranges">Strip list not fully indexed</div>`;
	}

	let extrasHtml = "";
	if (page.extras.length > 0) {
		extrasHtml = `<p class="collection-section-heading">Extras</p><ul class="collection-extras">${page.extras.map((extra) => `<li>${escHtml(extra)}</li>`).join("")}</ul>`;
	}

	const hasDailies = collection.dailies && collection.dailies.length > 0;
	const numComicsInCollection = page.dates.length;
	let comicsSummary = "";
	if (numComicsInCollection > 0) {
		comicsSummary = `<p class="collection-meta"><span class="collection-meta--label">Comics:</span> ${numComicsInCollection} strip${numComicsInCollection !== 1 ? "s" : ""}${hasDailies ? " in order" : " (unordered)"}</p>`;
	}

	return `<div class="collection-container">
		${buildNavButtons(canGoBack)}
		<div class="collection-header">
			<div class="collection-cover" style="aspect-ratio: ${collection.aspectRatio}">
				<img src="${imageUrl}" alt="${escHtml(collection.name)} cover" onload="this.parentElement.style.aspectRatio='auto'" onerror="this.parentElement.style.aspectRatio='auto'" />
			</div>
			<div class="collection-info">
				<h2 class="collection-name">${escHtml(collection.name)}</h2>
				<div class="collection-type">${typeLabel}</div>
				<p class="collection-meta"><span class="collection-meta--label">Published:</span> ${pubDateFormatted}</p>
				<p class="collection-meta"><span class="collection-meta--label">Coverage:</span> ${coverage.join(" · ")}</p>
				${comicsSummary}
				${collection.notes && collection.notes.length > 0 ? `<p class="collection-note">${escHtml(collection.notes[0])}</p>` : ""}
				<div class="detail-actions">
					<button class="copy-link-btn" id="copy-link-btn" data-href="${escHtml(addressOf(buildCollectionPath(collection.id)))}">Copy link</button>
					${buildNeighbourButton(page.prev, "prev")}
					${buildNeighbourButton(page.next, "next")}
				</div>
			</div>
		</div>
		<p class="collection-section-heading">Date Ranges</p>
		<div class="collection-ranges">${rangesHtml}</div>
		${extrasHtml}
		${collection.links && collection.links.length > 0 ? `<p class="collection-section-heading">Links</p><div class="collection-links">${collection.links.map((link) => `<a class="collection-link" href="${escHtml(link.href)}" target="_blank" rel="noopener">${escHtml(link.title)}</a>`).join("")}</div>` : ``}
	</div>`;
}
