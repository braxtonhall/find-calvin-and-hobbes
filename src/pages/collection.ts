import { escHtml } from "../utils";
import { isDateInCollection, getCollectionCoverage, formatCompactRange } from "../date-utils";
import { CollectionPage, PageSource } from "./page";
import { buildBackAndHomeButtons } from "./nav-buttons";

function getTypeLabel(type: string): string {
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

export function buildCollectionHtml(page: CollectionPage, canGoBack: boolean): string {
	const { collection } = page;

	if (!collection) {
		const message = page.indexLoaded ? `Collection "${escHtml(page.id)}" not found.` : "Collection data not available.";
		return `<div class="collection-container">
			${buildBackAndHomeButtons(canGoBack)}
			<p class="detail-missing">${message}</p>
		</div>`;
	}

	const typeLabel = getTypeLabel(collection.type);
	const imageUrl = collection.image;
	const coverage = getCollectionCoverage(collection);

	let pubDateFormatted = "";
	if (collection.pub_year) {
		const monthName = MONTH_NAMES[collection.pub_month - 1];
		pubDateFormatted = `${monthName} ${collection.pub_year}`;
		if (collection.pub_day) {
			pubDateFormatted = `${monthName} ${collection.pub_day}, ${collection.pub_year}`;
		}
	}

	let rangesHtml = "";
	if (collection.dailies && collection.dailies.length > 0) {
		rangesHtml = collection.dailies
			.map((range) => `<div class="collection-range">${formatCompactRange(range)}</div>`)
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
		${buildBackAndHomeButtons(canGoBack)}
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
			</div>
		</div>
		<p class="collection-section-heading">Date Ranges</p>
		<div class="collection-ranges">${rangesHtml}</div>
		${extrasHtml}
		${collection.links && collection.links.length > 0 ? `<p class="collection-section-heading">Links</p><div class="collection-links">${collection.links.map((link) => `<a class="collection-link" href="${escHtml(link.href)}" target="_blank" rel="noopener">${escHtml(link.title)}</a>`).join("")}</div>` : ``}
	</div>`;
}
