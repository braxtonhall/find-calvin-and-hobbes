import "./books.css";

import { state } from "../state";
import { onViewportShift, viewport } from "../placement";
import { attachCellHighlightLink, clearCollectionSoon, datesOf, highlightCollection } from "./cell-highlight";

/*
 * The books a strip is in, on a strip's page or an arc's: a row of covers, each a button. Clicking
 * or tapping one selects it and opens a popup above it — the book's name, the way to its page, and
 * arrows through its strips — which a click anywhere else, or Escape, puts away, as the filter bar's
 * menus are. The popup floats on `document.body`, as their menu does, so nothing on the page can
 * clip it.
 */

/**
 * Hovering — or focusing — a book shows its strips in the grid, as the list of books does. The
 * ranges come from the collection index, so until it has loaded — a cold load — the hover does
 * nothing. `back` is what the grid goes back to when the pointer leaves: the plain grid on a strip's
 * page, the arc on an arc's.
 *
 * `view` is the page the book is on. A book followed to its page is left focused, and hidden, which
 * blurs it; by then the grid is the book page's to draw, so only this page while it is showing may
 * touch it.
 */
function attachBookHighlight(target: HTMLElement, view: HTMLElement, back: ReadonlySet<string> | null): void {
	const show = () => {
		const collection = state.collectionsById?.get(target.dataset.collectionId ?? "");
		if (collection && view.classList.contains("active")) highlightCollection(datesOf(collection));
	};
	const clear = () => view.classList.contains("active") && clearCollectionSoon(back);
	target.addEventListener("mouseenter", show);
	target.addEventListener("focus", show);
	target.addEventListener("mouseleave", clear);
	target.addEventListener("blur", clear);
}

// ─── The popup ──────────────────────────────────────────────────────────────

/** The cover whose popup is open. */
let selected: HTMLButtonElement | null = null;

/**
 * The book selected, by `data-book`. Carried to the next page only by the popup's own arrows, so a
 * reader stepping through a book finds it selected again on the next strip, arrows and all. Any
 * other way off the page forgets it.
 */
let selectedBook: string | null = null;

/** Set by a click on one of the popup's arrows, for the router's close to read on the way out. */
let stepping = false;

let popup: HTMLDivElement | null = null;

/** The cover itself, without its caption: what the popup points at. */
function coverRect(cover: HTMLElement): DOMRect {
	return (cover.querySelector<HTMLElement>(".collection-book") ?? cover).getBoundingClientRect();
}

function popupElement(): HTMLDivElement {
	if (popup !== null) return popup;
	popup = document.createElement("div");
	popup.className = "book-popup";
	popup.setAttribute("role", "dialog");
	document.body.appendChild(popup);

	// The popup is floated on the body, so a Tab off either end would leave for the browser's chrome
	// rather than the page. It is spent getting out instead, back to the cover the popup belongs to.
	popup.addEventListener("keydown", (event) => {
		if (event.key !== "Tab" || selected === null) return;
		const stops = [...popup!.querySelectorAll<HTMLElement>("a[href]")];
		const edge = event.shiftKey ? stops[0] : stops[stops.length - 1];
		if (document.activeElement !== edge) return;
		event.preventDefault();
		const cover = selected;
		closePopup(true);
		cover.focus();
	});
	return popup;
}

/** Above the cover by preference, where it covers nothing of the row; below it when there is no room. */
function positionPopup(): void {
	if (selected === null) return;
	const element = popupElement();
	const rect = coverRect(selected);
	const room = viewport();
	const edge = 8;
	const gap = 8;
	const width = element.offsetWidth;
	const height = element.offsetHeight;
	const above = rect.top - gap - height;
	const top = above >= room.top + edge ? above : rect.bottom + gap;
	// Kept over the page, clear of the grid beside it, as well as on the screen.
	const page = document.getElementById("main")!.getBoundingClientRect();
	const start = Math.max(room.left, page.left) + edge;
	const end = Math.min(room.left + room.width, page.right) - edge;
	const centred = rect.left + rect.width / 2 - width / 2;
	const left = Math.max(start, Math.min(centred, end - width));
	element.style.top = `${top}px`;
	element.style.left = `${left}px`;
}

function openPopup(
	cover: HTMLButtonElement,
	view: HTMLElement,
	back: ReadonlySet<string> | null,
	focus: boolean,
): void {
	closePopup(false);
	const template = cover.parentElement?.querySelector<HTMLTemplateElement>("template.book__card");
	if (!template) return;

	selected = cover;
	selectedBook = cover.parentElement?.dataset.book ?? null;
	cover.setAttribute("aria-expanded", "true");

	const element = popupElement();
	element.replaceChildren(template.content.cloneNode(true));
	element.setAttribute("aria-label", cover.getAttribute("aria-label") ?? "");
	element.querySelectorAll<HTMLElement>("a.book__arrow").forEach((link) => {
		// A plain click only, which is the one the router follows here rather than in another tab.
		link.addEventListener("click", (event) => {
			stepping = event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
		});
		attachCellHighlightLink(link, link.dataset.date!);
	});
	element.querySelectorAll<HTMLElement>("[data-collection-id]").forEach((link) => {
		attachBookHighlight(link, view, back);
	});

	element.classList.add("book-popup--visible");
	positionPopup();
	if (focus) element.querySelector<HTMLElement>("a[href]")?.focus();
}

function closePopup(forget: boolean): void {
	if (forget) selectedBook = null;
	if (selected === null) return;
	selected.setAttribute("aria-expanded", "false");
	selected = null;
	popupElement().classList.remove("book-popup--visible");
}

/**
 * Called by the router whenever it draws a page, as it closes the filter bar's menu: the popup is
 * floated on the body, so hiding the view it hangs from does not hide it. Leaving by one of the
 * popup's arrows keeps the book selected, so the strip drawn next opens it again; leaving any other
 * way puts it away for good.
 */
export function closeBookPopup(): void {
	closePopup(!stepping);
	stepping = false;
}

/**
 * The covers on a strip's page or an arc's: their highlights in the grid, and the popup each
 * opens. A book left selected on the last page opens again here if this page has it.
 */
export function attachBookHandlers(view: HTMLElement, back: ReadonlySet<string> | null = null): void {
	const covers = [...view.querySelectorAll<HTMLButtonElement>(".book__cover")];
	for (const cover of covers) {
		attachBookHighlight(cover, view, back);
		// A click from the keyboard has no pointer behind it, and is the one that should take the
		// focus into the popup.
		cover.addEventListener("click", (event) => {
			if (selected === cover) closePopup(true);
			else openPopup(cover, view, back, event.detail === 0);
		});
	}

	const again = covers.find((cover) => cover.parentElement?.dataset.book === selectedBook);
	if (!again) {
		selectedBook = null;
		return;
	}
	// A frame on, once the router has put the page where it is going to be scrolled to.
	requestAnimationFrame(() => {
		if (again.isConnected && view.classList.contains("active")) openPopup(again, view, back, false);
	});
}

/*
 * A press anywhere that is not the popup or a cover puts the popup away, as one outside the filter
 * bar's menu does. A cover is left to its own click, which either closes its popup or opens another.
 * In the capture phase, so nothing on the page can stop it on the way.
 */
document.addEventListener(
	"mousedown",
	(event) => {
		if (selected === null) return;
		const element = event.target as HTMLElement;
		if (element.closest(".book-popup") !== null || element.closest(".book__cover") !== null) return;
		closePopup(true);
	},
	true,
);

document.addEventListener("keydown", (event) => {
	if (event.key !== "Escape" || selected === null) return;
	const cover = selected;
	closePopup(true);
	cover.focus();
});

window.addEventListener("resize", positionPopup);
// Captured, because the page scrolls inside `#main` rather than the window.
window.addEventListener("scroll", positionPopup, true);
onViewportShift(positionPopup);
