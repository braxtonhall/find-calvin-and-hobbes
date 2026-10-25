import { NOTE_MAX_LENGTH } from "../library-file";

/** How long a note gets before its box says how much of the limit it has used. */
const COUNT_FROM = NOTE_MAX_LENGTH * 0.9;

/** The count under a note's box (see `buildNoteBoxHtml`), as the note in it now stands: none until it nears the limit. */
export function showNoteCount(note: HTMLTextAreaElement): void {
	const count = note.nextElementSibling;
	if (!count?.classList.contains("ownership-note-count")) return;
	const length = note.value.length;
	count.textContent = length >= COUNT_FROM ? `${length.toLocaleString()} / ${NOTE_MAX_LENGTH.toLocaleString()}` : "";
}

/** Keeps a note's count up with what is typed in it. A note filled in by the page is counted with `showNoteCount`. */
export function attachNoteCount(note: HTMLTextAreaElement): void {
	note.addEventListener("input", () => showNoteCount(note));
	showNoteCount(note);
}
