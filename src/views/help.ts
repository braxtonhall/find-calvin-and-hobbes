import "./help.css";

import { canGoBack } from "../router";
import { buildHelpHtml } from "../pages/help";
import { attachBackAndHomeHandlers } from "./nav-buttons";
import { attachCopyLinkHandler } from "./copy-link";

/**
 * Draws the help page, or — with `adopt` — takes over the page the build drew, and goes to the
 * entry the address names: `/help#strips-in`, from the search box's menu.
 */
export function renderHelp(adopt: boolean = false): void {
	const element = document.getElementById("view-help")!;
	if (!adopt) element.innerHTML = buildHelpHtml(canGoBack());
	attachBackAndHomeHandlers(element);
	attachCopyLinkHandler(element);
	watchExamples(element.querySelector<HTMLElement>(".help-examples"));
	const target = location.hash.length > 1 ? document.getElementById(decodeURIComponent(location.hash.slice(1))) : null;
	if (target !== null && element.contains(target)) target.scrollIntoView({ block: "start" });
	else document.getElementById("main")!.scrollTop = 0;
}

// Watches the drawn page's examples alone: a redraw leaves the last page's list behind.
const examplesObserver = new ResizeObserver((entries) => entries.forEach((entry) => fitExamples(entry.target)));

function watchExamples(list: HTMLElement | null): void {
	examplesObserver.disconnect();
	if (list !== null) examplesObserver.observe(list);
}

/**
 * Sets every example's query under its question once any one has no room for it beside, so the
 * list reads as one table or one column rather than a mix. Measured side by side each time, as the
 * width that brings the room back can come after the width that took it.
 */
function fitExamples(list: Element): void {
	list.classList.remove("help-examples--stacked");
	const crowded = [...list.children].some((item) => {
		const [question, query] = item.children as HTMLCollectionOf<HTMLElement>;
		return query.offsetTop > question.offsetTop || item.scrollWidth > item.clientWidth;
	});
	list.classList.toggle("help-examples--stacked", crowded);
}
