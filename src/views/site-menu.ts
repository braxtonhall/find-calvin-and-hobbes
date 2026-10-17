import "./site-menu.css";

import { Route } from "../types";
import { buildSiteMenuItemsHtml, showsSiteMenu } from "../pages/site-menu";

function setMenuOpen(open: boolean): void {
	const toggle = document.querySelector<HTMLElement>(".site-menu-toggle");
	const list = document.getElementById("site-menu-list");
	if (toggle === null || list === null) return;
	toggle.setAttribute("aria-expanded", String(open));
	list.hidden = !open;
}

// Delegated, since the menu is chrome and outlives every render. A click on one of its links shuts
// it too: a link home from home leaves the same menu standing. A click on the greyed item for the
// page it is on goes nowhere, and leaves it open.
document.addEventListener("click", (event) => {
	const element = event.target as HTMLElement;
	const toggle = element.closest(".site-menu-toggle");
	if (toggle !== null) {
		setMenuOpen(toggle.getAttribute("aria-expanded") !== "true");
		return;
	}
	if (element.closest(".site-menu-item--current") !== null) return;
	setMenuOpen(false);
});

document.addEventListener("keydown", (event) => {
	if (event.key !== "Escape") return;
	const toggle = document.querySelector<HTMLElement>(".site-menu-toggle");
	if (toggle?.getAttribute("aria-expanded") !== "true") return;
	setMenuOpen(false);
	toggle.focus();
});

/**
 * Shows the corner menu on the pages it belongs to and hides it on the rest, with the item for the
 * page showing greyed. Hiding is instant and showing fades, which is what the views do; from one of
 * its pages to another it does neither, and stays where it is.
 */
export function updateSiteMenu(view: Route["view"]): void {
	const menu = document.getElementById("site-menu");
	const list = document.getElementById("site-menu-list");
	if (menu === null || list === null) return;
	setMenuOpen(false);
	menu.hidden = !showsSiteMenu(view);
	list.innerHTML = buildSiteMenuItemsHtml(view);
}
