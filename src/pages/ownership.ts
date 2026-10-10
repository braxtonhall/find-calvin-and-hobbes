import { escHtml } from "../utils";
import type { OwnershipKind } from "../ownership";
import { BOOKMARK_ICON_SVG } from "./bookmark-icon";

// Three books on a shelf: drawn as solid books once owned, and only as their spines until then,
// since at this size the books' outlines crowd together.
export const OWNED_ICON_SVG = `<svg class="ownership-icon" viewBox="0 0 24 24"><path class="ownership-icon__unowned" d="M6 4v16M12 4v16M17.5 4.9l3.9 15.1" fill="none" stroke="currentColor" stroke-width="2.5"/><path class="ownership-icon__owned" d="M4 4h4v16H4zM10 4h4v16h-4zM15.6 5.4l3.8-1 3.9 15.1-3.8 1z" fill="currentColor"/></svg>`;
export const NOTE_ICON_SVG = `<svg class="ownership-icon" viewBox="0 0 24 24"><path d="M5 3h10l4 4v14H5zM8.5 11h7M8.5 15h4.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

/** A button's word: what it does, and once it is done, what has been done, the way its icon fills in. */
function label(off: string, on: string): string {
	return `<span class="ownership-label ownership-label--off">${off}</span><span class="ownership-label ownership-label--on">${on}</span>`;
}

/**
 * Whether the reader owns a strip or a book, and their note on it: two buttons and the note's box,
 * set into the page's row of actions and wrapping onto a line of its own below them. A strip, given
 * the `bookmarkId` it is bookmarked by and the day it ran, has its bookmark button before them. Drawn
 * the same for everyone — what this browser has saved is filled in by the view (see
 * `attachOwnershipControls`).
 */
export function buildOwnershipControlsHtml(
	kind: OwnershipKind,
	id: string,
	bookmark?: { id: string; date: string },
): string {
	const what = kind === "strip" ? "this printing" : "this book";
	const bookmarkButton = bookmark
		? `<button type="button" class="bookmark-btn ownership-btn ownership-bookmark-btn" data-bookmark="${escHtml(bookmark.id)}" data-date="${bookmark.date}" aria-label="Bookmark" aria-pressed="false">${BOOKMARK_ICON_SVG}${label("Bookmark", "Bookmarked")}</button>`
		: "";
	return `<span class="ownership" data-kind="${kind}" data-id="${escHtml(id)}"><span class="ownership-buttons">${bookmarkButton}<button type="button" class="bookmark-btn ownership-btn ownership-owned-btn" aria-label="Own" aria-pressed="false">${OWNED_ICON_SVG}${label("Own", "Owned")}</button><button type="button" class="bookmark-btn ownership-btn ownership-note-btn" aria-label="Note" aria-expanded="false">${NOTE_ICON_SVG}${label("Note", "Noted")}</button></span><textarea class="ownership-note" rows="2" placeholder="A note on ${what}" aria-label="Note" hidden></textarea></span>`;
}
