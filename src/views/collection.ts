import "./collection.css";

import { state } from "../state";
import { escHtml } from "../utils";
import { isDateInCollection } from "../date-utils";
import { attachBackAndHomeHandlers, buildBackAndHomeButtons } from "./nav-buttons";
import type { Collection } from "../types";
import { renderCollectionHtml } from "../renderers/page-html";
import { routeUrl } from "../base-path";

export function renderCollection(collectionId: string): void {
	const element = document.getElementById("view-collection")!;
	const preservePrerenderedMarkup = state.initialPrerendered;
	state.initialPrerendered = false;
	if (!state.collectionIndex || !state.collectionsById) {
		element.innerHTML = `<div class="collection-container">${buildBackAndHomeButtons()}<p class="detail-missing">Collection data not available.</p></div>`;
		attachBackAndHomeHandlers(element);
		return;
	}
	const collection = state.collectionsById.get(collectionId);
	if (!collection) {
		element.innerHTML = `<div class="collection-container">${buildBackAndHomeButtons()}<p class="detail-missing">Collection "${escHtml(collectionId)}" not found.</p></div>`;
		attachBackAndHomeHandlers(element);
		return;
	}
	document.title = `${collection.name} — Find Calvin and Hobbes`;
	updateCollectionDateSet(collection);
	if (preservePrerenderedMarkup) return;
	element.innerHTML = renderCollectionHtml(
		collection,
		state.collectionIndex,
		state.collectionDateSet?.size || 0,
		routeUrl("/"),
		buildBackAndHomeButtons(),
	);
	attachBackAndHomeHandlers(element);
}

export function updateCollectionDateSet(collection: Collection): void {
	state.collectionDateSet = new Set();
	const dates = state.comicsByDate.size ? [...state.comicsByDate.keys()] : state.allDays.map((day) => day.date);
	for (const date of dates) if (isDateInCollection(date, collection)) state.collectionDateSet.add(date);
}
