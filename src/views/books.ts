import "./books.css";

import { state } from "../state";
import { onViewportShift, viewport } from "../placement";
import { attachCellHighlightLink, clearCollectionSoon, datesOf, highlightCollection } from "./cell-highlight";

/*
 * The books a strip is in, on a strip's page or an arc's: a row of covers, each a link to its book's
 * page. Pointed at, or focused from the keyboard, a cover shows a popup above it — the book's name,
 * the way to its page, and arrows through its strips — which lingers once left, long enough for the
 * pointer to cross into it. A click follows the link. A tap has no pointer to linger with, so it
 * opens the popup and keeps it open instead, until a press anywhere else, or Escape, puts it away,
 * as the filter bar's menus are. The popup floats on `document.body`, as their menu does, so nothing
 * on the page can clip it.
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
let selected: HTMLAnchorElement | null = null;

/**
 * The book selected, by `data-book`. Carried to the next page only by the popup's own arrows, so a
 * reader stepping through a book finds it selected again on the next strip, arrows and all. Any
 * other way off the page forgets it.
 */
let selectedBook: string | null = null;

/** Set by a click on one of the popup's arrows, for the router's close to read on the way out. */
let stepping = false;

/**
 * Whether the popup was pointed at or tabbed to, and so goes once the pointer and the focus have both
 * left it, rather than tapped open and kept until put away. Kept when the popup closes, so a popup
 * carried to the next page by its arrows opens there the same way.
 */
let hovered = false;

/** How long a left popup waits, for a pointer on its way from the cover into it. */
const LINGER_MS = 300;

let lingering: number | undefined;

/** Set while the focus is handed back to a cover, which should not open its popup again for it. */
let refocusing = false;

/** Whether the last press on a cover was a finger or a pen, whose click opens the popup rather than following the link. */
let tapped = false;

let popup: HTMLDivElement | null = null;

/** The cover itself, without its caption: what the popup points at. */
function coverRect(cover: HTMLElement): DOMRect {
	return (cover.querySelector<HTMLElement>(".collection-book") ?? cover).getBoundingClientRect();
}

function focusQuietly(cover: HTMLElement): void {
	refocusing = true;
	cover.focus();
	refocusing = false;
}

function popupElement(): HTMLDivElement {
	if (popup !== null) return popup;
	popup = document.createElement("div");
	popup.className = "book-popup";
	popup.setAttribute("role", "dialog");
	document.body.appendChild(popup);

	// The popup is floated on the body, so a Tab off either end would leave for the browser's chrome
	// rather than the page. It is spent getting out instead: back onto the cover the popup belongs to,
	// or forward past it, the browser's own Tab carrying on from the cover to whatever follows it.
	popup.addEventListener("keydown", (event) => {
		if (event.key !== "Tab" || selected === null) return;
		const stops = [...popup!.querySelectorAll<HTMLElement>("a[href]")];
		const edge = event.shiftKey ? stops[0] : stops[stops.length - 1];
		if (document.activeElement !== edge) return;
		if (event.shiftKey) event.preventDefault();
		const cover = selected;
		closePopup(true);
		focusQuietly(cover);
	});
	popup.addEventListener("focusout", () => hovered && linger());
	return popup;
}

/**
 * Puts a pointed-at popup away once neither the pointer nor the keyboard's focus is on it or its
 * cover — after a moment, so a pointer can cross the gap between them.
 */
function linger(): void {
	window.clearTimeout(lingering);
	lingering = window.setTimeout(() => {
		if (!hovered || selected === null) return;
		const element = popupElement();
		if (selected.matches(":hover") || element.matches(":hover")) return;
		// Only a visible focus holds it: a cover clicked into a new tab keeps a focus nobody sees.
		const focused = document.activeElement;
		const held = focused !== null && (selected.contains(focused) || element.contains(focused));
		if (held && focused.matches(":focus-visible")) return;
		closePopup(true);
	}, LINGER_MS);
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
	cover: HTMLAnchorElement,
	view: HTMLElement,
	back: ReadonlySet<string> | null,
	hover: boolean,
): void {
	closePopup(false);
	const template = cover.parentElement?.querySelector<HTMLTemplateElement>("template.book__card");
	if (!template) return;

	selected = cover;
	selectedBook = cover.parentElement?.dataset.book ?? null;
	hovered = hover;
	window.clearTimeout(lingering);
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
}

function closePopup(forget: boolean): void {
	if (forget) selectedBook = null;
	window.clearTimeout(lingering);
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
	const covers = [...view.querySelectorAll<HTMLAnchorElement>(".book__cover")];
	for (const cover of covers) {
		attachBookHighlight(cover, view, back);
		cover.addEventListener("pointerenter", (event) => {
			if (event.pointerType === "mouse" && selected !== cover) openPopup(cover, view, back, true);
		});
		// Only a focus the reader can see: a tap or a click can focus a cover too.
		cover.addEventListener("focus", () => {
			if (!refocusing && selected !== cover && cover.matches(":focus-visible")) openPopup(cover, view, back, true);
		});
		cover.addEventListener("blur", () => hovered && linger());
		// The popup is floated on the body, so the next Tab stop after the cover is not in it. Tab is
		// sent into it instead.
		cover.addEventListener("keydown", (event) => {
			if (event.key !== "Tab" || event.shiftKey || selected !== cover) return;
			const first = popupElement().querySelector<HTMLElement>("a[href]");
			if (!first) return;
			event.preventDefault();
			first.focus();
		});
		cover.addEventListener("pointerdown", (event) => {
			tapped = event.pointerType !== "mouse";
		});
		// A mouse's click, or Enter, follows the link; a tap opens the popup, or closes its own.
		cover.addEventListener("click", (event) => {
			const tap = tapped;
			tapped = false;
			if (!tap) return;
			event.preventDefault();
			if (selected === cover && !hovered) closePopup(true);
			else openPopup(cover, view, back, false);
		});
	}

	const again = covers.find((cover) => cover.parentElement?.dataset.book === selectedBook);
	if (!again) {
		selectedBook = null;
		return;
	}
	// A frame on, once the router has put the page where it is going to be scrolled to. A pointed-at
	// popup is left for the pointer's next move to keep or put away.
	requestAnimationFrame(() => {
		if (again.isConnected && view.classList.contains("active")) openPopup(again, view, back, hovered);
	});
}

/*
 * A pointed-at popup lingers once the pointer leaves it and its cover, and stays when the pointer
 * comes back to either in time.
 */
document.addEventListener("mouseover", (event) => {
	if (!hovered || selected === null) return;
	const element = event.target as Element;
	if (selected.contains(element) || popupElement().contains(element)) window.clearTimeout(lingering);
	else linger();
});

document.addEventListener("mouseout", (event) => {
	if (hovered && selected !== null && event.relatedTarget === null) linger();
});

/*
 * A press anywhere that is not the popup or a cover puts the popup away, as one outside the filter
 * bar's menu does. A cover is left to its own click, which either follows it, closes its popup, or
 * opens another. In the capture phase, so nothing on the page can stop it on the way.
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
	const inside = popupElement().contains(document.activeElement);
	closePopup(true);
	if (inside) focusQuietly(cover);
});

window.addEventListener("resize", positionPopup);
// Captured, because the page scrolls inside `#main` rather than the window.
window.addEventListener("scroll", positionPopup, true);
onViewportShift(positionPopup);
