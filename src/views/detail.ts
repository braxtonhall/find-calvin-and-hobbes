import "./detail.css";

import { state } from "../state";
import { isShowing } from "../utils";
import { loadDescriptions } from "../details";
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
import { attachCellHighlightLink, clearCollectionSoon, personDates, highlightCollection } from "./cell-highlight";
import { attachBookHandlers } from "./books";
import { subjectDays } from "../pages/subjects";

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
	element.querySelectorAll<HTMLElement>("a.nav-btn[data-date], a.detail-rerun-link[data-date]").forEach((link) => {
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
		const show = (scroll: boolean) => {
			const dates = isShowing(element) ? datesOf(link) : null;
			if (dates) highlightCollection(dates, scroll);
		};
		const clear = () => isShowing(element) && clearCollectionSoon();
		link.addEventListener("mouseenter", () => show(false));
		link.addEventListener("focus", () => show(true));
		link.addEventListener("mouseleave", clear);
		link.addEventListener("blur", clear);
	});
}

/**
 * An arc's range lights the arc, its dates on the page; a creator's or a character's name, their
 * strips, from the ranges that ship in the script; a subject's name, its strips, whose dates ship
 * there too — so all of them work on a cold load.
 */
function attachGroupLinkHandlers(element: HTMLElement, page: DetailPage): void {
	const arcs = new Map(page.arcs.map((arc) => [arc.id, new Set(arc.dates)]));
	attachSetLinkHandlers(element, ".detail-arc-link", (link) => arcs.get(link.dataset.arcId ?? "") ?? null);
	attachSetLinkHandlers(element, ".detail-creator-link", (link) => {
		const creator = state.creatorsById.get(link.dataset.creatorId ?? "");
		return creator ? personDates(creator) : null;
	});
	attachSetLinkHandlers(element, ".detail-character-link", (link) => {
		const character = state.charactersById.get(link.dataset.characterId ?? "");
		return character ? personDates(character) : null;
	});
	attachSetLinkHandlers(element, ".detail-subject-link", (link) => {
		const subject = state.subjectsById.get(link.dataset.subjectId ?? "");
		return subject ? new Set(subjectDays(subject)) : null;
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
	attachDetailHandlers(element, page, () => {
		const route = parseRoute();
		return route.view === "detail" && route.date === page.date;
	});
}

/**
 * What a strip's page does once drawn, wherever it is drawn: on its own, or as a search's preview.
 * `stillShowing` says whether the page is still there when its descriptions arrive to be filled in.
 */
export function attachDetailHandlers(element: HTMLElement, page: DetailPage, stillShowing: () => boolean): void {
	attachStripLinkHandlers(element);
	attachGroupLinkHandlers(element, page);
	attachBookHandlers(element);

	attachCopyLinkHandler(element);
	attachOwnershipControls(element);

	if (page.descriptions === null) {
		loadDescriptions().then(() => {
			if (!stillShowing()) return;
			patchDetailBlocks(element, { ...page, descriptions: descriptionsFor(state.descriptions!, page.comics) });
		});
	}
}
