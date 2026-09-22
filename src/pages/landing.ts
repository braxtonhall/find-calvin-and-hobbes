import { CREDITS_PATH } from "../routes";
import { addressOf } from "../base-path";

// Drawn in the same idiom as the results-bar icons: 16px, stroked in `currentColor`, no fill.
const SEARCH_ICON = `<svg class="landing-submit-search" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" aria-hidden="true">
	<circle cx="6.8" cy="6.8" r="4.3" /><path d="M10 10l3.5 3.5" />
</svg>`;

export function buildLandingHtml(): string {
	return `
		<img
			class="landing-logo"
			src="https://upload.wikimedia.org/wikipedia/commons/9/96/Calvin_and_Hobbes_title.png"
			alt="Calvin and Hobbes"
		/>
		<form class="landing-form" id="landing-form">
			<input
				type="text"
				class="landing-input"
				id="landing-input"
				placeholder="Search comics..."
				autocomplete="off"
			/>
			<button type="submit" class="landing-submit" id="landing-submit" title="Search" aria-label="Search">${SEARCH_ICON}</button>
		</form>
		<a class="landing-credits" href="${addressOf(CREDITS_PATH)}">Credits</a>
	`;
}
