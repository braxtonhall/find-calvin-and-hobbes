import { CREDITS_HTML } from "../credits-content";
import { buildBackButton, buildHomeButton } from "./nav-buttons";

export function buildCreditsHtml(canGoBack: boolean): string {
	return `<div class="credits-container">
		${buildBackButton("credits-back", canGoBack)}
		${buildHomeButton("credits-home")}
		<h2 class="credits-heading">Credits</h2>

		<div class="credits-content">${CREDITS_HTML}</div>
	</div>`;
}
