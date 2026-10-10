import { buildBackAndHomeButtons, buildFlashLabels } from "./nav-buttons";

/**
 * The spellings the reader can choose for a word spelt two ways, as the toggle names them: none, so
 * that the browser is guessed from; the one most of the English-speaking world writes; and the
 * other one.
 */
export const SPELLING_CHOICES = [
	{ value: "", label: "Inferred" },
	{ value: "british", label: "English" },
	{ value: "american", label: "Incorrect" },
] as const;

/**
 * The reader's own settings: moving their library — the bookmarks, what they own, and their notes,
 * all of which live in this browser — out to a file and back in, or forgetting it; and how the
 * search's menu spells a word with two spellings. Drawn the same for everyone, since what this
 * browser has kept is only known to the app, which fills it in — see `views/settings.ts`.
 */
export function buildSettingsHtml(canGoBack: boolean): string {
	const choices = SPELLING_CHOICES.map(
		({ value, label }) =>
			`<button type="button" class="settings-choice" role="radio" aria-checked="false" data-spelling="${value}">${label}</button>`,
	).join(`<span aria-hidden="true">·</span>`);
	return `<div class="settings-container">
		${buildBackAndHomeButtons(canGoBack)}
		<h2 class="settings-heading">Settings</h2>
		<section class="settings-section">
			<h3 class="settings-section-heading">Your library</h3>
			<p class="settings-section-text">Your bookmarks, the strips and books you own, and your notes are kept in this browser. Export them to a file to keep or to move to another browser, and import that file there.</p>
			<div class="detail-actions library-transfer">
				<button type="button" class="copy-link-btn" id="library-export-btn">Export</button>
				<button type="button" class="copy-link-btn" id="library-import-btn">${buildFlashLabels("Import", "Imported!")}</button>
				<span class="library-transfer__status" role="status"></span>
				<input type="file" id="library-import-file" accept="application/json,.json" hidden />
			</div>
		</section>
		<section class="settings-section">
			<h3 class="settings-section-heading">Spelling</h3>
			<p class="settings-section-text">How the search's suggestions spell a word that is spelt two ways. Inferred, they follow your browser's language and time zone, and then whichever you last wrote out in full.</p>
			<div class="settings-choices" role="radiogroup" aria-label="Spelling">${choices}</div>
			<p class="settings-preview">Suggests <code class="settings-preview-word">@is:colour</code> <span class="settings-preview-note"></span></p>
		</section>
		<section class="settings-section">
			<h3 class="settings-section-heading">Clear your data</h3>
			<p class="settings-section-text">Forget everything this site has kept in this browser: your bookmarks, the strips and books you own, your notes, and your spelling.</p>
			<div class="detail-actions">
				<button type="button" class="copy-link-btn" id="settings-clear-btn">${buildFlashLabels("Clear all data", "Cleared!")}</button>
				<span class="library-transfer__status settings-clear-status" role="status"></span>
			</div>
		</section>
	</div>`;
}
