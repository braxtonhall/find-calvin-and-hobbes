import { OwnershipKind, getOwnership, updateOwnership } from "../ownership";
import { OwnershipRecord } from "../library-file";

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

/**
 * Wires each strip's or book's ownership buttons under `element` — see `buildOwnershipControlsHtml`.
 * The owned button toggles; the note button opens the note's box, which is open already where there
 * is a note, and saves as it is typed in. Nothing here touches the grid.
 */
export function attachOwnershipControls(element: HTMLElement): void {
	element.querySelectorAll<HTMLElement>(".ownership").forEach((controls) => {
		const kind = controls.dataset.kind as OwnershipKind;
		const id = controls.dataset.id!;
		const ownedButton = controls.querySelector<HTMLButtonElement>(".ownership-owned-btn")!;
		const noteButton = controls.querySelector<HTMLButtonElement>(".ownership-note-btn")!;
		const note = controls.querySelector<HTMLTextAreaElement>(".ownership-note")!;

		getOwnership(kind, id)
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
				// IndexedDB unavailable — the buttons do nothing that lasts, as the bookmark button's doesn't
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
