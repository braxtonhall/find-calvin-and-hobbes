import "./detail.css";

import { state } from "../state";
import { loadDescriptions } from "../details";
import { isBookmarked, toggleBookmark } from "../bookmarks";
import { canGoBack, parseRoute } from "../router";
import { DetailPage } from "../pages/page";
import {
	buildDescriptionSlotContents,
	buildDetailHtml,
	describeImageFor,
	descriptionsFor,
	getPageDescription,
} from "../pages/detail";
import { attachBackAndHomeHandlers } from "./nav-buttons";
import { attachCopyLinkHandler } from "./copy-link";
import { attachCellHighlightLink, highlightCollection } from "./cell-highlight";

function buildBookmarkButtonHandler(bookmarkButton: HTMLButtonElement, date: string): void {
	isBookmarked(date).then((bookmarked) => {
		if (bookmarked) bookmarkButton.classList.add("bookmark-btn--active");
	});
	bookmarkButton.addEventListener("click", async () => {
		const isNowBookmarked = await toggleBookmark(date);
		if (isNowBookmarked) {
			bookmarkButton.classList.add("bookmark-btn--active");
			state.bookmarkedDates.add(date);
		} else {
			bookmarkButton.classList.remove("bookmark-btn--active");
			state.bookmarkedDates.delete(date);
		}
		const cell = document.querySelector(`.cell[data-date="${date}"]`);
		if (cell) {
			if (isNowBookmarked) {
				cell.classList.add("cell--bookmarked");
			} else {
				cell.classList.remove("cell--bookmarked");
			}
		}
	});
}

function patchDetailBlocks(element: HTMLElement, page: DetailPage): void {
	for (const comic of page.comics) {
		const key = comic.id || page.date;
		const block = element.querySelector<HTMLElement>(`.detail-comic[data-comic-key="${key}"]`);
		if (!block) continue;

		const description = getPageDescription(page, comic);

		const descriptionSlot = block.querySelector<HTMLElement>(".detail-description-slot");
		if (descriptionSlot) descriptionSlot.innerHTML = buildDescriptionSlotContents(comic, description, true);

		const image = block.querySelector<HTMLImageElement>(".detail-image");
		if (image) image.alt = describeImageFor(page, comic);
	}
}

/**
 * Hovering any link to another day's strip — the header's arrows, a run in the paper, a step
 * through a book — lights up its cell.
 */
function attachStripLinkHandlers(element: HTMLElement): void {
	element
		.querySelectorAll<HTMLElement>("a#nav-prev, a#nav-next, a.detail-rerun-link, a.printing__arrow")
		.forEach((link) => {
			attachCellHighlightLink(link, link.dataset.date!);
		});
}

/**
 * Hovering a book shows its strips in the grid, as the list of books does. The ranges come from the
 * collection index, so until it has loaded — a cold load — the hover does nothing.
 */
function attachBookHighlightHandlers(element: HTMLElement): void {
	element.querySelectorAll<HTMLElement>(".detail-collected a[data-collection-id]").forEach((book) => {
		// A book followed to its page is left focused, and hidden, which blurs it; by then the grid is
		// the book page's to draw, so only this page while it is showing may touch it.
		const show = () => {
			const collection = state.collectionsById?.get(book.dataset.collectionId ?? "");
			if (collection && element.classList.contains("active")) highlightCollection(collection);
		};
		const clear = () => element.classList.contains("active") && highlightCollection(null);
		book.addEventListener("mouseenter", show);
		book.addEventListener("focus", show);
		book.addEventListener("mouseleave", clear);
		book.addEventListener("blur", clear);
	});
}

/**
 * Whether the books show as a list rather than a row of covers. Kept for as long as the page is
 * open, so a reader stepping through a book by its arrows stays in the list that has them.
 */
let collectedExpanded = false;

function setCollectedExpanded(element: HTMLElement, expanded: boolean): void {
	element.querySelectorAll<HTMLElement>(".detail-collected").forEach((section) => {
		section.classList.toggle("detail-collected--expanded", expanded);
		const toggle = section.querySelector<HTMLButtonElement>(".detail-collected__toggle")!;
		const label = expanded ? "Show book covers" : "Show book details";
		toggle.setAttribute("aria-expanded", String(expanded));
		toggle.setAttribute("aria-label", label);
		toggle.title = label;
	});
}

function attachCollectedToggleHandlers(element: HTMLElement): void {
	if (collectedExpanded) setCollectedExpanded(element, true);
	element.querySelectorAll<HTMLButtonElement>(".detail-collected__toggle").forEach((toggle) => {
		toggle.addEventListener("click", () => {
			collectedExpanded = !collectedExpanded;
			setCollectedExpanded(element, collectedExpanded);
		});
	});
}

/**
 * Draws a strip's page, or — with `adopt` — takes over the one the build drew from the same
 * `page`, attaching what the markup cannot carry: the handlers.
 */
export function renderDetail(page: DetailPage, adopt: boolean = false): void {
	const element = document.getElementById("view-detail")!;
	if (!adopt) {
		document.getElementById("main")!.scrollTop = 0;
		element.innerHTML = buildDetailHtml(page, canGoBack());
	}

	attachBackAndHomeHandlers(element);
	attachStripLinkHandlers(element);
	attachBookHighlightHandlers(element);
	attachCollectedToggleHandlers(element);

	attachCopyLinkHandler(element);

	const bookmarkButton = element.querySelector<HTMLButtonElement>("#bookmark-btn");
	if (bookmarkButton) buildBookmarkButtonHandler(bookmarkButton, page.date);

	if (page.descriptions === null) {
		loadDescriptions().then(() => {
			const route = parseRoute();
			if (route.view !== "detail" || route.date !== page.date) return;
			patchDetailBlocks(element, { ...page, descriptions: descriptionsFor(state.descriptions!, page.comics) });
		});
	}
}
