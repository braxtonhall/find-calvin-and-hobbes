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
import { attachOwnershipControls } from "./ownership";
import {
	attachCellHighlightLink,
	clearCollectionSoon,
	creatorDates,
	featuringDates,
	highlightCollection,
} from "./cell-highlight";
import { attachBookHandlers } from "./books";
import { dayCell } from "../grid";

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
		// A box of many days, zoomed out, shows no bookmarks.
		const cell = dayCell(date);
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
 * Hovering — or focusing — any link to another day's strip lights up its cell: the header's arrows,
 * a run in the paper, a step through an arc. A book's arrows are in its popup, which does its own.
 */
function attachStripLinkHandlers(element: HTMLElement): void {
	element
		.querySelectorAll<HTMLElement>("a#nav-prev, a#nav-next, a.detail-rerun-link[data-date], a.detail-arc-step")
		.forEach((link) => {
			attachCellHighlightLink(link, link.dataset.date!);
		});
}

/**
 * Hovering — or focusing — a link to a set of strips lights up that set in the grid, as a book's cover
 * lights up the book: what the page it leads to would light. `datesOf` is asked on each hover, and
 * `null` for a link it knows nothing about.
 */
function attachSetLinkHandlers(
	element: HTMLElement,
	selector: string,
	datesOf: (link: HTMLElement) => ReadonlySet<string> | null,
): void {
	element.querySelectorAll<HTMLElement>(selector).forEach((link) => {
		const show = () => {
			const dates = element.classList.contains("active") ? datesOf(link) : null;
			if (dates) highlightCollection(dates);
		};
		const clear = () => element.classList.contains("active") && clearCollectionSoon();
		link.addEventListener("mouseenter", show);
		link.addEventListener("focus", show);
		link.addEventListener("mouseleave", clear);
		link.addEventListener("blur", clear);
	});
}

/**
 * An arc's range lights the arc, its dates on the page; a creator's name, their strips, from the
 * ranges that ship in the script — so both work on a cold load too. A character's name lights the
 * strips they are in, which only the archive can say, so it waits for the archive.
 */
function attachGroupLinkHandlers(element: HTMLElement, page: DetailPage): void {
	const arcs = new Map(page.arcs.map((arc) => [arc.id, new Set(arc.dates)]));
	attachSetLinkHandlers(element, ".detail-arc-link", (link) => arcs.get(link.dataset.arcId ?? "") ?? null);
	attachSetLinkHandlers(element, ".detail-creator-link", (link) => {
		const creator = state.creatorsById.get(link.dataset.creatorId ?? "");
		return creator ? creatorDates(creator) : null;
	});
	attachSetLinkHandlers(element, ".detail-character-link", (link) =>
		state.dataLoaded ? featuringDates(link.dataset.characterId ?? "") : null,
	);
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
	attachGroupLinkHandlers(element, page);
	attachBookHandlers(element);

	attachCopyLinkHandler(element);
	attachOwnershipControls(element);

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
