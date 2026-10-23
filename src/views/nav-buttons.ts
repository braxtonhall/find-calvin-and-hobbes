import { canGoBack } from "../router";
import { buildBackButton } from "../pages/nav-buttons";
import { isTouchDevice } from "../utils";

/**
 * Wires the Back button, after making sure it says what the history does. A prerendered page is
 * built with Back disabled — a cold load has nothing behind it — but a reload of a page reached by
 * clicking keeps its history depth, and that is only known here.
 */
export function attachBackButtonHandler(element: HTMLElement, className: string): void {
	let button = element.querySelector<HTMLButtonElement>(`button.${className}`);
	if (!button) return;
	if (button.disabled === canGoBack()) {
		button.outerHTML = buildBackButton(className, canGoBack());
		button = element.querySelector<HTMLButtonElement>(`button.${className}`)!;
	}
	if (!button.disabled) button.addEventListener("click", () => history.back());
}

export function attachBackAndHomeHandlers(element: HTMLElement): void {
	attachBackButtonHandler(element, "detail-back");
}

// A touchscreen has no hover to show what a stepper's count counts, so a tap on it does, and a tap
// anywhere else puts it away. Delegated, since the count is drawn again with every page.
//
// The count is narrow between two links, and a thumb aimed at it tends to land on an arrow, so a step
// by an arrow shows it too: on the page stepped to, once the router has drawn it, later in this click.
// Either way it goes again after a moment, so as not to sit over the page's title.
const COUNT_SHOWN_MS = 1500;
let countTimer: ReturnType<typeof setTimeout> | undefined;

function showCountBriefly(count: Element): void {
	clearTimeout(countTimer);
	count.classList.add("nav-count--open");
	countTimer = setTimeout(() => count.classList.remove("nav-count--open"), COUNT_SHOWN_MS);
}

document.addEventListener("click", (event) => {
	if (!isTouchDevice()) return;
	const target = event.target as HTMLElement;
	const count = target.closest(".nav-count");
	const wasOpen = count?.classList.contains("nav-count--open") ?? false;
	document.querySelectorAll(".nav-count--open").forEach((open) => open.classList.remove("nav-count--open"));
	clearTimeout(countTimer);
	if (count && !wasOpen) showCountBriefly(count);
	if (target.closest(".nav-arrows > a.nav-btn")) {
		setTimeout(() => {
			const shown = [...document.querySelectorAll<HTMLElement>(".nav-count")].find((c) => c.offsetParent !== null);
			if (shown) showCountBriefly(shown);
		});
	}
});
