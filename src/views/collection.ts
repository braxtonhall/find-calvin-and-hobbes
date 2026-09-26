import "./collection.css";

import { state } from "../state";
import { canGoBack } from "../router";
import { CollectionPage } from "../pages/page";
import { buildCollectionHtml } from "../pages/collection";
import { attachBackAndHomeHandlers } from "./nav-buttons";
import { attachCopyLinkHandler } from "./copy-link";
import { attachCellHighlightLink } from "./cell-highlight";

/**
 * Draws a book's page, or — with `adopt` — takes over the one the build drew from the same `page`.
 * Either way the grid learns which strips the book holds from the page, so a cold load highlights
 * them before the archive has arrived.
 */
export function renderCollection(page: CollectionPage, adopt: boolean = false): void {
	const element = document.getElementById("view-collection")!;
	state.collectionDateSet = new Set(page.dates);
	if (!adopt) element.innerHTML = buildCollectionHtml(page, canGoBack());
	attachBackAndHomeHandlers(element);
	attachCopyLinkHandler(element);
	element.querySelectorAll<HTMLElement>(".collection-range-date").forEach((link) => {
		attachCellHighlightLink(link, link.dataset.date!);
	});
}
