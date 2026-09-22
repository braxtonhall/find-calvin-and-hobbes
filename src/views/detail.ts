import "./detail.css";

import { state } from "../state";
import { escHtml } from "../utils";
import { loadDescriptions } from "../details";
import { isBookmarked, toggleBookmark } from "../bookmarks";
import { canGoBack, parseRoute } from "../router";
import { DetailCollection, DetailPage } from "../pages/page";
import {
	buildDescriptionSlotContents,
	buildDetailHtml,
	describeImageFor,
	descriptionsFor,
	getPageDescription,
} from "../pages/detail";
import { attachBackAndHomeHandlers } from "./nav-buttons";

function buildCopyLinkButtonHandler(copyButton: HTMLButtonElement): void {
	copyButton.addEventListener("click", () => {
		const url = window.location.origin + copyButton.dataset.href;
		navigator.clipboard.writeText(url).then(() => {
			copyButton.textContent = "Copied!";
			copyButton.classList.add("copy-link-btn--copied");
			setTimeout(() => {
				copyButton.textContent = "Copy link";
				copyButton.classList.remove("copy-link-btn--copied");
			}, 1500);
		});
	});
}

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

let lastMouseX = 0;
let lastMouseY = 0;
let tooltipFollowersAttached = false;

/** The books the covers on the page belong to — what the tooltip reads, since it has only the cover's id. */
let tooltipCollections = new Map<string, DetailCollection>();

/**
 * One tooltip element for the life of the page, made the first time a page with covers on it
 * asks. Made here rather than when the collection index loads, because a prerendered page has
 * its covers before the index does.
 */
function getCollectionTooltip(): HTMLElement {
	if (!state.collectionTooltip) {
		state.collectionTooltip = document.createElement("div");
		state.collectionTooltip.className = "collection-tooltip";
		document.body.appendChild(state.collectionTooltip);
	}
	return state.collectionTooltip;
}

function hideCollectionTooltip(): void {
	state.collectionTooltip?.classList.remove("collection-tooltip--visible");
}

function showCollectionTooltip(book: HTMLElement): void {
	const collectionId = book.dataset.collectionId;
	if (!collectionId) return;
	const collection = tooltipCollections.get(collectionId);
	if (!collection) return;
	const tooltip = getCollectionTooltip();

	const pubYear = collection.pub_year.toString();
	let html = `<span class="collection-tooltip__name">${escHtml(collection.name)}</span> <span class="collection-tooltip__year">(${pubYear})</span>`;

	const pageLines = book.dataset.pages ? book.dataset.pages.split("\n").filter(Boolean) : [];
	if (pageLines.length > 0) {
		html += `<div class="collection-tooltip__pages">${pageLines.map((line) => escHtml(line)).join("<br>")}</div>`;
	}

	const notes: string[] = [];
	if (book.dataset.bw === "1") {
		notes.push("Printed in black & white");
	}
	const alteration = book.dataset.alteration;
	if (alteration) {
		notes.push(alteration);
	}
	if (notes.length > 0) {
		html += `<div class="collection-tooltip__divider">${notes.map((note) => escHtml(note)).join("<br>")}</div>`;
	}

	tooltip.innerHTML = html;
	const bookRect = book.getBoundingClientRect();
	const tooltipWidth = tooltip.offsetWidth;
	const tooltipHeight = tooltip.offsetHeight;
	const center = bookRect.left + bookRect.width / 2;
	const pad = 8;
	const left = Math.max(pad, Math.min(center - tooltipWidth / 2, window.innerWidth - tooltipWidth - pad));
	tooltip.style.left = left + "px";
	tooltip.style.transform = "none";
	tooltip.style.top = Math.max(0, bookRect.top - tooltipHeight - pad) + "px";
	tooltip.classList.add("collection-tooltip--visible");
}

function followCollectionTooltip(): void {
	const tooltip = state.collectionTooltip;
	if (!tooltip || !tooltip.classList.contains("collection-tooltip--visible")) return;
	const elementUnder = document.elementFromPoint(lastMouseX, lastMouseY);
	const book = elementUnder?.closest<HTMLElement>(".collection-book");
	if (!book) {
		hideCollectionTooltip();
		return;
	}
	showCollectionTooltip(book);
}

function attachCollectionTooltipFollowers(): void {
	if (tooltipFollowersAttached) return;
	tooltipFollowersAttached = true;

	document.addEventListener("mousemove", (event) => {
		lastMouseX = event.clientX;
		lastMouseY = event.clientY;
	});

	// Wait a frame so the layout has settled after the scroll/resize/load that triggered us.
	const follow = () => requestAnimationFrame(followCollectionTooltip);
	const main = document.getElementById("main")!;
	main.addEventListener("scroll", follow);
	window.addEventListener("resize", follow);
	// Image loads reflow the page around the tooltip; load doesn't bubble, so capture it.
	main.addEventListener("load", follow, true);
}

function attachCollectionBookHandlers(element: HTMLElement, page: DetailPage): void {
	tooltipCollections = new Map(page.collections.map((collection) => [collection.id, collection]));

	// The cover's href does the navigating. This only clears the tooltip out of the way of whatever
	// the click turns out to be — including a cmd-click, which leaves this page standing.
	element.querySelectorAll<HTMLElement>(".collection-book").forEach((book) => {
		book.addEventListener("click", hideCollectionTooltip);
	});

	if (tooltipCollections.size === 0) return;

	attachCollectionTooltipFollowers();

	element.querySelectorAll<HTMLElement>(".collection-book").forEach((book) => {
		book.addEventListener("mouseenter", () => showCollectionTooltip(book));
		book.addEventListener("mouseleave", hideCollectionTooltip);
	});

	followCollectionTooltip();
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

	const copyButton = element.querySelector<HTMLButtonElement>("#copy-link-btn");
	if (copyButton) buildCopyLinkButtonHandler(copyButton);

	const bookmarkButton = element.querySelector<HTMLButtonElement>("#bookmark-btn");
	if (bookmarkButton) buildBookmarkButtonHandler(bookmarkButton, page.date);

	attachCollectionBookHandlers(element, page);

	if (page.descriptions === null) {
		loadDescriptions().then(() => {
			const route = parseRoute();
			if (route.view !== "detail" || route.date !== page.date) return;
			patchDetailBlocks(element, { ...page, descriptions: descriptionsFor(state.descriptions!, page.comics) });
		});
	}
}
