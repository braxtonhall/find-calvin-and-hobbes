import "./row-menu.css";

import { state } from "../state";
import { escHtml } from "../utils";
import { formatLongDate } from "../date-utils";
import { isDayBookmarked, toggleBookmark } from "../bookmarks";
import { OwnershipKind, getOwnership, updateOwnership } from "../ownership";
import { dayCell } from "../grid";
import { BOOKMARK_ICON_SVG } from "../pages/bookmark-icon";
import { NOTE_ICON_SVG, OWNED_ICON_SVG } from "../pages/ownership";

/**
 * The menu a strip's or a book's row opens on a right-click or a long press: own it or note it, and
 * bookmark a strip, without going to its page. Floated on the body, like the filter bar's menus, and
 * drawn afresh each time from what `state` holds, so it always says what the row is now.
 */

/** How long a finger has to stay down before it is a long press rather than a tap. */
const LONG_PRESS_DELAY = 500;
/** How far it may drift meanwhile, in pixels, before it is a scroll instead. */
const LONG_PRESS_SLOP = 10;

/** Says something in the library changed from a row, so a page listing the library can draw itself again. */
export const LIBRARY_CHANGE_EVENT = "librarychange";

let menu: HTMLElement | null = null;
let menuRow: HTMLElement | null = null;

/** Keeps the row tinted as hovered while the pointer is in its menu, which is not inside it, nor `:hover` it. */
const MENU_OPEN_CLASS = "row--menu-open";

/** Puts the menu away, if it is open: a page left behind takes its menu with it. */
export function closeRowMenu(): void {
	closeMenu(false);
}

function closeMenu(refocus: boolean): void {
	if (!menu) return;
	const pointerInMenu = menu.matches(":hover");
	menu.remove();
	menu = null;
	const row = menuRow;
	menuRow = null;
	row?.classList.remove(MENU_OPEN_CLASS);
	// The pointer was kept on the row while it was in the menu; with the menu gone, it has left it.
	if (pointerInMenu && row && !row.matches(":hover")) leave(row, null);
	if (refocus && row?.isConnected) row.focus({ preventScroll: true });
}

/** Tells the row the pointer has left it, past the guard below that keeps it while the pointer is in the menu. */
function leave(row: HTMLElement, relatedTarget: EventTarget | null): void {
	row.dispatchEvent(new MouseEvent("mouseleave", { relatedTarget: relatedTarget ?? document.body }));
}

/** `byPointer` when the menu was used with the mouse, which is still over the page's rows. */
function changed(byPointer: boolean): void {
	document.dispatchEvent(new CustomEvent(LIBRARY_CHANGE_EVENT, { detail: { byPointer } }));
}

function item(action: string, icon: string, label: string, active: boolean): string {
	return `<button type="button" class="row-menu-item${active ? " row-menu-item--active" : ""}" role="menuitem" data-action="${action}" tabindex="-1">${icon}<span>${label}</span></button>`;
}

/**
 * What a row is: a strip's, by the `data-bookmark` and `data-ownership` that `resultsHtml` writes, or
 * a book's, by its `data-collection-id`. `title` is its day, or the book's name.
 */
interface RowTarget {
	kind: OwnershipKind;
	id: string;
	title: string;
	bookmark?: { id: string; date: string };
}

function targetOf(row: HTMLElement): RowTarget {
	const book = row.dataset.collectionId;
	if (book) {
		return { kind: "book", id: book, title: row.querySelector(".collections-name")?.textContent ?? book };
	}
	const date = row.dataset.date!;
	return {
		kind: "strip",
		id: row.dataset.ownership!,
		title: formatLongDate(date),
		bookmark: { id: row.dataset.bookmark!, date },
	};
}

function menuHtml(target: RowTarget): string {
	const owned = (target.kind === "strip" ? state.ownedStrips : state.ownedBooks).has(target.id);
	const noted = (target.kind === "strip" ? state.notedStrips : state.notedBooks).has(target.id);
	const items = [
		item("own", OWNED_ICON_SVG, `${owned ? "Disown" : "Own"} this ${target.kind}`, owned),
		item("note", NOTE_ICON_SVG, noted ? "Edit note" : "Add note", noted),
	];
	if (target.bookmark) {
		const bookmarked = state.bookmarkedStrips.has(target.bookmark.id);
		items.unshift(item("bookmark", BOOKMARK_ICON_SVG, bookmarked ? "Remove bookmark" : "Add bookmark", bookmarked));
	}
	return items.join("");
}

/** Keeps the menu inside the window: below and right of the point, or flipped to fit. */
function place(element: HTMLElement, x: number, y: number): void {
	const { width, height } = element.getBoundingClientRect();
	const margin = 8;
	const left = x + width + margin > window.innerWidth ? Math.max(margin, x - width) : x;
	const top = y + height + margin > window.innerHeight ? Math.max(margin, y - height) : y;
	element.style.left = `${left}px`;
	element.style.top = `${top}px`;
}

function openMenu(row: HTMLElement, x: number, y: number): void {
	closeMenu(false);
	menuRow = row;
	row.classList.add(MENU_OPEN_CLASS);
	const target = targetOf(row);
	menu = document.createElement("div");
	menu.className = "row-menu";
	menu.setAttribute("role", "menu");
	menu.setAttribute("aria-label", target.kind === "strip" ? `Strip from ${target.title}` : target.title);
	menu.innerHTML = menuHtml(target);
	document.body.appendChild(menu);
	place(menu, x, y);

	const items = [...menu.querySelectorAll<HTMLButtonElement>(".row-menu-item")];
	items[0].focus({ preventScroll: true });

	// Out of the menu and anywhere but back onto its row is out of the row too.
	menu.addEventListener("mouseenter", () => row.classList.add(MENU_OPEN_CLASS));
	menu.addEventListener("mouseleave", (event) => {
		row.classList.remove(MENU_OPEN_CLASS);
		if (!row.contains(event.relatedTarget as Node | null)) leave(row, event.relatedTarget);
	});

	menu.addEventListener("keydown", (event) => {
		if (event.key === "Escape" || event.key === "Tab") {
			// Escape is kept from the page, where it would also go home.
			event.preventDefault();
			event.stopPropagation();
			closeMenu(true);
		} else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
			event.preventDefault();
			const index = items.indexOf(document.activeElement as HTMLButtonElement);
			const step = event.key === "ArrowDown" ? 1 : -1;
			items[(index + step + items.length) % items.length].focus();
		}
	});

	menu.addEventListener("click", (event) => {
		const button = (event.target as HTMLElement).closest<HTMLButtonElement>(".row-menu-item");
		if (!button) return;
		const action = button.dataset.action;
		// A click from the keyboard comes with no count of presses.
		const byPointer = event.detail > 0;
		closeMenu(action !== "note");
		if (action === "bookmark" && target.bookmark) bookmark(target.bookmark, byPointer);
		else if (action === "own") own(target, byPointer);
		else if (action === "note") editNote(row, target);
	});
}

function bookmark({ id, date }: { id: string; date: string }, byPointer: boolean): void {
	toggleBookmark(id)
		.then(() => {
			dayCell(date)?.classList.toggle("cell--bookmarked", isDayBookmarked(date));
			changed(byPointer);
		})
		.catch(() => {
			// IndexedDB unavailable — nothing is kept
		});
}

function own({ kind, id }: RowTarget, byPointer: boolean): void {
	updateOwnership(kind, id, (record) => ({ owned: !record.owned }))
		.then(() => changed(byPointer))
		.catch(() => {});
}

/** The note, in a modal over the page: saved by Save, or by Cmd/Ctrl+Enter, and left as it was otherwise. */
function editNote(row: HTMLElement, { kind, id, title }: RowTarget): void {
	const dialog = document.createElement("dialog");
	dialog.className = "library-dialog row-note-dialog";
	dialog.innerHTML = `<form method="dialog">
			<p class="library-dialog__message">Note on ${kind === "strip" ? "the strip from " : ""}<strong>${escHtml(title)}</strong></p>
			<textarea class="ownership-note row-note" rows="5" placeholder="A note on this ${kind}" aria-label="Note"></textarea>
			<div class="detail-actions library-dialog__choices">
				<button class="copy-link-btn" value="save">Save</button>
				<button class="copy-link-btn" value="cancel">Cancel</button>
			</div>
		</form>`;
	const note = dialog.querySelector<HTMLTextAreaElement>("textarea")!;

	dialog.addEventListener("keydown", (event) => {
		// Escape closes the dialog, and is kept from the page, where it would also go home.
		if (event.key === "Escape") event.stopPropagation();
		if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
			event.preventDefault();
			dialog.close("save");
		}
	});
	dialog.addEventListener("close", () => {
		const save = dialog.returnValue === "save";
		dialog.remove();
		if (row.isConnected) row.focus({ preventScroll: true });
		if (!save) return;
		updateOwnership(kind, id, () => ({ note: note.value }))
			.then(() => changed(false))
			.catch(() => {});
	});

	document.body.appendChild(dialog);
	dialog.showModal();
	getOwnership(kind, id)
		.then((record) => {
			// Unless the reader has started typing while this was being read.
			if (record?.note !== undefined && note.value === "") note.value = record.note;
		})
		.catch(() => {})
		.finally(() => {
			note.focus();
			note.setSelectionRange(note.value.length, note.value.length);
		});
}

/**
 * Opens the menu on a strip's or a book's row (see `targetOf`) from a right-click, the context-menu key, or a long press. Android sends
 * a long press as a `contextmenu` too; iOS does not, so a touch held still is timed here as well,
 * and the tap it ends in is kept from following the link.
 */
export function attachRowMenu(row: HTMLElement): void {
	row.addEventListener("contextmenu", (event) => {
		event.preventDefault();
		if (menuRow === row) return;
		// From the keyboard there is no pointer, and the event lands at the row's corner, or nowhere.
		if (event.clientX === 0 && event.clientY === 0) {
			const rect = row.getBoundingClientRect();
			openMenu(row, rect.left + 16, rect.top + 16);
		} else {
			openMenu(row, event.clientX, event.clientY);
		}
	});

	let timer: number | null = null;
	let start: { x: number; y: number } | null = null;
	let pressed = false;
	const cancel = () => {
		if (timer !== null) window.clearTimeout(timer);
		timer = null;
		start = null;
	};

	row.addEventListener("pointerdown", (event) => {
		pressed = false;
		if (event.pointerType !== "touch") return;
		cancel();
		start = { x: event.clientX, y: event.clientY };
		timer = window.setTimeout(() => {
			timer = null;
			pressed = true;
			if (menuRow !== row && start) openMenu(row, start.x, start.y);
		}, LONG_PRESS_DELAY);
	});
	row.addEventListener("pointermove", (event) => {
		if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > LONG_PRESS_SLOP) cancel();
	});
	row.addEventListener("pointerup", cancel);
	row.addEventListener("pointercancel", cancel);
	row.addEventListener("click", (event) => {
		if (!pressed) return;
		pressed = false;
		event.preventDefault();
		event.stopPropagation();
	});
}

// The menu is floated on the body, so the pointer going from a row into its menu leaves the row, which
// would take the light off it and its day. Caught on the way down, before it reaches the row's own listeners.
document.addEventListener(
	"mouseleave",
	(event) => {
		if (event.target === menuRow && menu?.contains(event.relatedTarget as Node | null)) event.stopPropagation();
	},
	true,
);

// A press anywhere else puts the menu away, as scrolling the page from under it does.
document.addEventListener(
	"pointerdown",
	(event) => {
		if (menu && !menu.contains(event.target as Node)) closeMenu(false);
	},
	true,
);
// Captured, because the page scrolls inside `#main` rather than the window. Only a scroll that moves
// the row: the grid scrolls to the row's day when the row is pressed.
window.addEventListener(
	"scroll",
	(event) => {
		const scrolled = event.target;
		if (menuRow && (scrolled === document || (scrolled instanceof Node && scrolled.contains(menuRow)))) {
			closeMenu(false);
		}
	},
	true,
);
window.addEventListener("resize", () => closeMenu(false));
window.addEventListener("blur", () => closeMenu(false));
