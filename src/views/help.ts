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
	const target = location.hash.length > 1 ? document.getElementById(decodeURIComponent(location.hash.slice(1))) : null;
	if (target !== null && element.contains(target)) target.scrollIntoView({ block: "start" });
	else document.getElementById("main")!.scrollTop = 0;
}
