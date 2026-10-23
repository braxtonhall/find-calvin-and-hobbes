import "./collection.css";
import "./collections.css";
import "./arcs.css";
import "./people.css";

import { state } from "../state";
import { canGoBack } from "../router";
import { CharacterPage, CreatorPage } from "../pages/page";
import {
	PeoplePage,
	buildCharacterHtml,
	buildCreatorHtml,
	buildPeopleBodyHtml,
	buildPeopleHtml,
	peopleOf,
} from "../pages/people";
import { attachBackAndHomeHandlers } from "./nav-buttons";
import { attachCopyLinkHandler } from "./copy-link";
import { attachCellHighlightLink, clearCollectionSoon, highlightCollection, personDates } from "./cell-highlight";
import { attachTabSearch, keepsHeader, narrowTab, updateTabSearch } from "./tab-search";
import { renderStripSet } from "./strip-set";

/**
 * Draws the list of creators or of characters, or — with `adopt` — takes over the one the build drew
 * from the same `page`. With the search open, only the ones it finds, as the list of books does.
 */
export function renderPeople(page: PeoplePage, adopt: boolean = false, arriving: boolean = true): void {
	const tab = page.view;
	const element = document.getElementById(`view-${page.view}`)!;
	const results = narrowTab(tab, page.q);
	const ids = results?.ids ?? null;
	if (adopt) {
		attachBackAndHomeHandlers(element);
		attachTabSearch(element, tab);
	} else if (keepsHeader(element, arriving)) {
		element.querySelector(".collections-body")!.innerHTML = buildPeopleBodyHtml(page, ids);
		updateTabSearch(element, page.q, page.order);
	} else {
		element.innerHTML = buildPeopleHtml(page, canGoBack(), ids);
		attachBackAndHomeHandlers(element);
		attachTabSearch(element, tab);
	}

	const byId = new Map(peopleOf(page).map((person) => [person.id, person]));
	element.querySelectorAll<HTMLElement>(".person-row").forEach((row) => {
		const person = byId.get(row.dataset.personId ?? "");
		if (!person) return;
		// As the list of books does: only while the list is showing may it touch the grid.
		const show = (scroll: boolean) =>
			element.classList.contains("active") && highlightCollection(personDates(person), scroll);
		const clear = () => element.classList.contains("active") && clearCollectionSoon(state.tabMatchDates);
		row.addEventListener("mouseenter", () => show(false));
		row.addEventListener("focus", () => show(true));
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
	state.collectionDateSet = page.creator ? personDates(page.creator) : new Set();
	if (!adopt) element.innerHTML = buildCreatorHtml(page, canGoBack());
	attachBackAndHomeHandlers(element);
	attachCopyLinkHandler(element);
	element.querySelectorAll<HTMLElement>(".collection-range-date").forEach((link) => {
		attachCellHighlightLink(link, link.dataset.date!);
	});
}

/** Draws a character's page, or — with `adopt` — takes over the one the build drew from the same `page`. */
export function renderCharacter(page: CharacterPage, adopt: boolean = false): void {
	const element = document.getElementById("view-character")!;
	const html = adopt ? null : buildCharacterHtml(page, canGoBack(), false);
	renderStripSet(element, html, page.character ? personDates(page.character) : new Set(), page.strips);
}
