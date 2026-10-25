import { addressOf } from "../base-path";
import { SETTINGS_PATH } from "../routes";
import { spellable } from "../spelling";
import { buildBackAndHomeButtons, buildFlashLabels, buildPageTitle } from "./nav-buttons";
import { cloudSavesService } from "../cloud-saves";

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

/** What cloud saves are, on or off; the light beside the heading says how they stand. */
const CLOUD_SAVES_TEXT =
	"Save your library to the cloud, so it follows you to your other browsers. You'll make a passkey for it, or use one you made before. This is still being tried out, so keep an export of your library too.";

/**
 * Only for a site with a service to save to. Drawn as it is for a browser without them; where
 * they are on, the view lights the light and makes the button Disable.
 */
const CLOUD_SAVES_HTML = `<section class="settings-section cloud-saves">
			<h3 class="settings-section-heading">Experimental Cloud Saves<span class="cloud-saves__light" role="img" tabindex="0" hidden></span></h3>
			<p class="settings-section-text">${CLOUD_SAVES_TEXT}</p>
			<div class="detail-actions">
				<button type="button" class="copy-link-btn" id="cloud-saves-toggle-btn" aria-label="Enable"><span class="cloud-saves__labels"><span class="cloud-saves__label-off">Enable</span><span class="cloud-saves__label-on" aria-hidden="true">Disable</span></span></button>
				<button type="button" class="copy-link-btn" id="cloud-saves-sign-in-btn" hidden>Sign in again</button>
				<span class="library-transfer__status cloud-saves__status" role="status"></span>
			</div>
		</section>`;

/**
 * The reader's own settings: moving their library — the bookmarks, what they own, and their notes,
 * all of which live in this browser — out to a file and back in, saving it to the cloud where the
 * site can, or forgetting it; and how the site spells a word with two spellings. Drawn the same for everyone, since what this
 * browser has kept is only known to the app, which fills it in — see `views/settings.ts`.
 */
export function buildSettingsHtml(canGoBack: boolean): string {
	const choices = SPELLING_CHOICES.map(
		({ value, label }) =>
			`<button type="button" class="settings-choice" role="radio" aria-checked="false" data-spelling="${value}">${label}</button>`,
	).join(`<span aria-hidden="true">·</span>`);
	return `<div class="settings-container">
		${buildBackAndHomeButtons(canGoBack)}
		${buildPageTitle("settings-heading", "Settings", addressOf(SETTINGS_PATH))}
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
		${cloudSavesService() ? CLOUD_SAVES_HTML : ""}
		<section class="settings-section">
			<h3 class="settings-section-heading">Spelling</h3>
			<p class="settings-section-text">How this site spells a word that is ${spellable("spelt")} two ways, in its own text and in the search's suggestions. Inferred, it follows your browser's language and time zone, and then whichever you last wrote out in full.</p>
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
