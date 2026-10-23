import { CREDITS_HTML } from "../credits-content";
import { addressOf } from "../base-path";
import { CREDITS_PATH } from "../routes";
import { buildBackButton, buildHomeButton, buildPageTitle } from "./nav-buttons";

export function buildCreditsHtml(canGoBack: boolean): string {
	return `<div class="credits-container">
		${buildBackButton("credits-back", canGoBack)}
		${buildHomeButton("credits-home")}
		${buildPageTitle("credits-heading", "Credits", addressOf(CREDITS_PATH))}

		<div class="credits-content">${CREDITS_HTML}</div>
	</div>`;
}
