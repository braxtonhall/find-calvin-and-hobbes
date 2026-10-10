import { OwnershipKind, getOwnership, updateOwnership } from "../ownership";
import { OwnershipRecord } from "../library-file";
import { isBookmarked, toggleBookmark } from "../bookmarks";
import { state } from "../state";

/** How long the note waits after the last keystroke before it saves. Leaving the box saves at once. */
const NOTE_SAVE_DELAY = 400;

function showRecord(controls: HTMLElement, record: OwnershipRecord): void {
	const owned = controls.querySelector<HTMLButtonElement>(".ownership-owned-btn")!;
	const noteButton = controls.querySelector<HTMLButtonElement>(".ownership-note-btn")!;
	owned.classList.toggle("ownership-btn--active", record.owned);
	owned.setAttribute("aria-pressed", String(record.owned));
	noteButton.classList.toggle("ownership-btn--active", record.note !== undefined);
}

function setNoteOpen(controls: HTMLElement, open: boolean): void {
	controls.querySelector<HTMLTextAreaElement>(".ownership-note")!.hidden = !open;
	controls.querySelector<HTMLButtonElement>(".ownership-note-btn")!.setAttribute("aria-expanded", String(open));
}

function showBookmark(button: HTMLButtonElement, bookmarked: boolean): void {
	button.classList.toggle("bookmark-btn--active", bookmarked);
	button.setAttribute("aria-pressed", String(bookmarked));
}

/**
 * A strip's bookmark button: toggles, and shows the day on the grid as bookmarked while any strip
 * that ran on it is. Its state is in `state` once the library has loaded, and asked of IndexedDB
 * until then.
 */
function attachBookmarkButton(button: HTMLButtonElement): void {
	const id = button.dataset.bookmark!;
	const date = button.dataset.date!;
	if (state.bookmarksLoaded) {
		showBookmark(button, state.bookmarkedStrips.has(id));
	} else {
		isBookmarked(id)
			.then((bookmarked) => showBookmark(button, bookmarked))
			.catch(() => {
				// IndexedDB unavailable — the button does nothing that lasts
			});
	}
	button.addEventListener("click", () => {
		toggleBookmark(id, date)
			.then((bookmarked) => showBookmark(button, bookmarked))
			.catch(() => {});
	});
}

/**
 * The strip's or book's record, for its buttons. Once the library has loaded, `state` says whether
 * it is owned and whether there is a note, so IndexedDB is asked only for a note's text.
 */
function readRecord(kind: OwnershipKind, id: string): Promise<OwnershipRecord | null> {
	if (!state.bookmarksLoaded) return getOwnership(kind, id);
	const owned = (kind === "strip" ? state.ownedStrips : state.ownedBooks).has(id);
	const noted = (kind === "strip" ? state.notedStrips : state.notedBooks).has(id);
	if (noted) return getOwnership(kind, id);
	return Promise.resolve(owned ? { id, owned } : null);
}

/**
 * Wires each strip's or book's ownership buttons under `element` — see `buildOwnershipControlsHtml`.
 * A strip's bookmark button and the owned button toggle; the note button opens the note's box,
 * which is open already where there is a note, and saves as it is typed in. Only the bookmark
 * touches the grid.
 */
export function attachOwnershipControls(element: HTMLElement): void {
	element.querySelectorAll<HTMLElement>(".ownership").forEach((controls) => {
		const kind = controls.dataset.kind as OwnershipKind;
		const id = controls.dataset.id!;
		const ownedButton = controls.querySelector<HTMLButtonElement>(".ownership-owned-btn")!;
		const noteButton = controls.querySelector<HTMLButtonElement>(".ownership-note-btn")!;
		const note = controls.querySelector<HTMLTextAreaElement>(".ownership-note")!;
		const bookmarkButton = controls.querySelector<HTMLButtonElement>(".ownership-bookmark-btn");
		if (bookmarkButton) attachBookmarkButton(bookmarkButton);

		readRecord(kind, id)
			.then((record) => {
				if (!record) return;
				showRecord(controls, record);
				// Unless the reader has started a note of their own while this was being read.
				if (record.note !== undefined && note.value === "") {
					note.value = record.note;
					setNoteOpen(controls, true);
				}
			})
			.catch(() => {
				// IndexedDB unavailable — the buttons do nothing that lasts
			});

		ownedButton.addEventListener("click", () => {
			updateOwnership(kind, id, (record) => ({ owned: !record.owned }))
				.then((record) => showRecord(controls, record))
				.catch(() => {});
		});

		noteButton.addEventListener("click", () => {
			const open = note.hidden;
			setNoteOpen(controls, open);
			if (open) note.focus();
		});

		let timer: number | null = null;
		const save = () => {
			if (timer !== null) window.clearTimeout(timer);
			timer = null;
			updateOwnership(kind, id, () => ({ note: note.value }))
				.then((record) => showRecord(controls, record))
				.catch(() => {});
		};
		note.addEventListener("input", () => {
			if (timer !== null) window.clearTimeout(timer);
			timer = window.setTimeout(save, NOTE_SAVE_DELAY);
		});
		note.addEventListener("change", save);
	});
}
