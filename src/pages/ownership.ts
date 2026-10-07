import { escHtml } from "../utils";
import type { OwnershipKind } from "../ownership";

// Three books on a shelf: drawn as solid books once owned, and only as their spines until then,
// since at this size the books' outlines crowd together.
const OWNED_ICON_SVG = `<svg class="ownership-icon" viewBox="0 0 24 24"><path class="ownership-icon__unowned" d="M6 4v16M12 4v16M17.5 4.9l3.9 15.1" fill="none" stroke="currentColor" stroke-width="2.5"/><path class="ownership-icon__owned" d="M4 4h4v16H4zM10 4h4v16h-4zM15.6 5.4l3.8-1 3.9 15.1-3.8 1z" fill="currentColor"/></svg>`;
const NOTE_ICON_SVG = `<svg class="ownership-icon" viewBox="0 0 24 24"><path d="M5 3h10l4 4v14H5zM8.5 11h7M8.5 15h4.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

/**
 * Whether the reader owns a strip or a book, and their note on it: two buttons and the note's box,
 * drawn into a row of buttons and wrapping onto a line of its own below them. Drawn the same for
 * everyone — what this browser has saved is filled in by the view (see `attachOwnershipControls`),
 * as the bookmark button's is.
 */
export function buildOwnershipControlsHtml(kind: OwnershipKind, id: string): string {
	const what = kind === "strip" ? "this printing" : "this book";
	return `<span class="ownership" data-kind="${kind}" data-id="${escHtml(id)}"><span class="ownership-buttons"><button type="button" class="bookmark-btn ownership-owned-btn" title="I own ${what}" aria-label="I own ${what}" aria-pressed="false">${OWNED_ICON_SVG}</button><button type="button" class="bookmark-btn ownership-note-btn" title="Note" aria-label="Note" aria-expanded="false">${NOTE_ICON_SVG}</button></span><textarea class="ownership-note" rows="2" placeholder="A note on ${what}" aria-label="Note" hidden></textarea></span>`;
}
