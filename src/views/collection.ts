import "./collection.css";

import { state } from "../state";
import { canGoBack } from "../router";
import { CollectionPage } from "../pages/page";
import { buildCollectionHtml } from "../pages/collection";
import { attachBackAndHomeHandlers } from "./nav-buttons";
import { attachCopyLinkHandler } from "./copy-link";
import { attachOwnershipControls } from "./ownership";
import { attachCellHighlightLink } from "./cell-highlight";
import { attachArcListHandlers } from "./arcs";

/**
 * Draws a book's page, or — with `adopt` — takes over the one the build drew from the same `page`.
 * Either way the grid learns which strips the book holds from the page, so a cold load highlights
 * them before the archive has arrived.
 *
 * Opening the Arcs section leaves the grid on the book; only a hovered arc narrows it.
 */
export function renderCollection(page: CollectionPage, adopt: boolean = false): void {
	const element = document.getElementById("view-collection")!;
	const bookDates = new Set(page.dates);
	state.collectionDateSet = bookDates;
	if (!adopt) element.innerHTML = buildCollectionHtml(page, canGoBack());
	attachBackAndHomeHandlers(element);
	attachCopyLinkHandler(element);
	attachOwnershipControls(element);
	element.querySelectorAll<HTMLElement>(".collection-range-date").forEach((link) => {
		attachCellHighlightLink(link, link.dataset.date!);
	});

	const arcsSection = element.querySelector<HTMLElement>(".collection-arcs");
	if (arcsSection) attachArcListHandlers(arcsSection, page.arcs, bookDates, () => element.classList.contains("active"));
}
