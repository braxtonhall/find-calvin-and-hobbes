import "./collection.css";
import "./collections.css";
import "./creators.css";

import { state } from "../state";
import { canGoBack } from "../router";
import { CreatorPage, CreatorsPage } from "../pages/page";
import { buildCreatorHtml } from "../pages/creator";
import { buildCreatorsHtml } from "../pages/creators";
import { attachBackAndHomeHandlers } from "./nav-buttons";
import { attachCopyLinkHandler } from "./copy-link";
import { attachCellHighlightLink, clearCollectionSoon, creatorDates, highlightCollection } from "./cell-highlight";

/** Draws the list of creators, or — with `adopt` — takes over the one the build drew from the same `page`. */
export function renderCreators(page: CreatorsPage, adopt: boolean = false): void {
	const element = document.getElementById("view-creators")!;
	if (!adopt) element.innerHTML = buildCreatorsHtml(page, canGoBack());
	attachBackAndHomeHandlers(element);

	const byId = new Map(page.creators.map((creator) => [creator.id, creator]));
	element.querySelectorAll<HTMLElement>(".creator-row").forEach((row) => {
		const creator = byId.get(row.dataset.creatorId ?? "");
		if (!creator) return;
		// As the list of books does: only while the list is showing may it touch the grid.
		const show = () => element.classList.contains("active") && highlightCollection(creatorDates(creator));
		const clear = () => element.classList.contains("active") && clearCollectionSoon();
		row.addEventListener("mouseenter", show);
		row.addEventListener("focus", show);
		row.addEventListener("mouseleave", clear);
		row.addEventListener("blur", clear);
	});
}

/**
 * Draws a creator's page, or — with `adopt` — takes over the one the build drew from the same
 * `page`. The grid shows their strips while it is open, as a book's page shows the book's, from the
 * ranges on the page, so a cold load lights them before the archive has arrived.
 */
export function renderCreator(page: CreatorPage, adopt: boolean = false): void {
	const element = document.getElementById("view-creator")!;
	state.collectionDateSet = page.creator ? creatorDates(page.creator) : new Set();
	if (!adopt) element.innerHTML = buildCreatorHtml(page, canGoBack());
	attachBackAndHomeHandlers(element);
	attachCopyLinkHandler(element);
	element.querySelectorAll<HTMLElement>(".collection-range-date").forEach((link) => {
		attachCellHighlightLink(link, link.dataset.date!);
	});
}
