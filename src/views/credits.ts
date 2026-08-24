import "./credits.css";

import { attachBackButtonHandler, buildBackButton } from "./nav-buttons";
import { renderCreditsHtml } from "../renderers/page-html";
import { routeUrl } from "../base-path";
import { state } from "../state";

export function renderCredits(): void {
	const element = document.getElementById("view-credits")!;
	state.initialPrerendered = false;
	element.innerHTML = renderCreditsHtml(routeUrl("/"), buildBackButton("credits-back"));

	attachBackButtonHandler(element, "credits-back");
}
