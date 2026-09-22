import "./credits.css";

import { canGoBack } from "../router";
import { buildCreditsHtml } from "../pages/credits";
import { attachBackButtonHandler } from "./nav-buttons";

export function renderCredits(adopt: boolean = false): void {
	const element = document.getElementById("view-credits")!;
	if (!adopt) element.innerHTML = buildCreditsHtml(canGoBack());
	attachBackButtonHandler(element, "credits-back");
}
