import "./collection.css";

import { state } from "../state";
import { escHtml } from "../utils";
import { isDateInCollection, getCollectionCoverage, formatCompactRange } from "../date-utils";
import { attachBackAndHomeHandlers, buildBackAndHomeButtons } from "./nav-buttons";

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

export function renderCollection(collectionId: string): void {
	const element = document.getElementById("view-collection")!;

	if (!state.collectionIndex || !state.collectionsById) {
		element.innerHTML = `<div class="collection-container">
			${buildBackAndHomeButtons()}
			<p class="detail-missing">Collection data not available.</p>
		</div>`;
		attachBackAndHomeHandlers(element);
		return;
	}

	const collection = state.collectionsById.get(collectionId);
	if (!collection) {
		element.innerHTML = `<div class="collection-container">
			${buildBackAndHomeButtons()}
			<p class="detail-missing">Collection "${escHtml(collectionId)}" not found.</p>
		</div>`;
		attachBackAndHomeHandlers(element);
		return;
	}

	document.title = `${collection.name} — Find Calvin and Hobbes`;

	state.collectionDateSet = new Set();
	for (const [date] of state.comicsByDate) {
		if (isDateInCollection(date, collection)) {
			state.collectionDateSet.add(date);
		}
	}

	const typeLabel = getTypeLabel(collection.type);
	const imageUrl = collection.image;
	const coverage = getCollectionCoverage(collection);

	let pubDateFormatted = "";
	if (collection.pub_year) {
		const monthNames = [
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
		const monthName = monthNames[collection.pub_month - 1];
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
	const extras = state.collectionIndex.collection_extras && state.collectionIndex.collection_extras[collectionId];
	if (extras && extras.length > 0) {
		extrasHtml = `<p class="collection-section-heading">Extras</p><ul class="collection-extras">${extras.map((extra) => `<li>${escHtml(extra)}</li>`).join("")}</ul>`;
	}

	const hasDailies = collection.dailies && collection.dailies.length > 0;
	const numComicsInCollection = state.collectionDateSet.size;
	let comicsSummary = "";
	if (numComicsInCollection > 0) {
		comicsSummary = `<p class="collection-meta"><span class="collection-meta--label">Comics:</span> ${numComicsInCollection} strip${numComicsInCollection !== 1 ? "s" : ""}${hasDailies ? " in order" : " (unordered)"}</p>`;
	}

	element.innerHTML = `<div class="collection-container">
		${buildBackAndHomeButtons()}
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

	attachBackAndHomeHandlers(element);
}
