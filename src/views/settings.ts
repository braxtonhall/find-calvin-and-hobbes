import "./settings.css";

import { canGoBack, handleRoute } from "../router";
import { buildSettingsHtml } from "../pages/settings";
import { clearLibrary } from "../ownership";
import { Spelling, chooseSpelling, guessedSpelling, rememberedSpelling } from "../spelling";
import { attachBackAndHomeHandlers } from "./nav-buttons";
import { ask, attachLibraryTransferHandlers } from "./library-transfer";
import { flashButton } from "./copy-link";

/** Draws the settings, or — with `adopt` — takes over the page the build drew. */
export function renderSettings(adopt: boolean = false): void {
	const element = document.getElementById("view-settings")!;
	if (!adopt) element.innerHTML = buildSettingsHtml(canGoBack());
	attachBackAndHomeHandlers(element);
	attachLibraryTransferHandlers(element);
	attachSpellingHandlers(element);
	attachClearHandler(element);
}

/**
 * The spelling toggle, and the word it spells under it — which follows the pointer across the
 * choices before one is made, and the choice once it is.
 */
function attachSpellingHandlers(element: HTMLElement): void {
	const choices = [...element.querySelectorAll<HTMLButtonElement>(".settings-choice")];
	const word = element.querySelector<HTMLElement>(".settings-preview-word")!;
	const note = element.querySelector<HTMLElement>(".settings-preview-note")!;
	const spellingOf = (button: HTMLButtonElement): Spelling | null => (button.dataset.spelling as Spelling | "") || null;

	const preview = (spelling: Spelling | null) => {
		const shown = spelling ?? guessedSpelling();
		word.textContent = `@is:${shown === "american" ? "color" : "colour"}`;
		note.textContent = spelling === null ? "(guessed from your browser)" : "";
	};
	const show = () => {
		const kept = rememberedSpelling();
		for (const button of choices) button.setAttribute("aria-checked", String(spellingOf(button) === kept));
		preview(kept);
	};

	for (const button of choices) {
		button.addEventListener("click", () => {
			chooseSpelling(spellingOf(button));
			show();
		});
		button.addEventListener("mouseenter", () => preview(spellingOf(button)));
		button.addEventListener("focus", () => preview(spellingOf(button)));
		button.addEventListener("mouseleave", show);
		button.addEventListener("blur", show);
	}
	show();
}

const CLEAR = "Clear everything";

/** The button that forgets everything, once the reader has said they mean it. */
function attachClearHandler(element: HTMLElement): void {
	const button = element.querySelector<HTMLButtonElement>("#settings-clear-btn")!;
	button.addEventListener("click", async () => {
		const sure = await ask(
			"Clear your bookmarks, the strips and books you own, your notes and your spelling from this browser? This can't be undone. Export your library first to keep a copy.",
			[CLEAR, "Cancel"],
		);
		if (sure !== CLEAR) return;
		try {
			await clearLibrary();
			chooseSpelling(null);
			// The page drawn again with the spelling unset, and the grid without the bookmarks.
			handleRoute();
			const cleared = document.querySelector<HTMLButtonElement>("#settings-clear-btn");
			if (cleared) flashButton(cleared, "Cleared!", "Clear all data");
		} catch {
			const status = document.querySelector<HTMLElement>(".settings-clear-status");
			if (status) status.textContent = "Couldn't clear your library from this browser.";
		}
	});
}
