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

// Pressing the count shows how many there are, the whole fraction, until a moment after; so does
// stepping on a touchscreen, while a pointer has hover for it, which is the stylesheet's. Said on the
// root rather than the count: each step draws the count anew, and one drawn while stepping is drawn
// shown, with nothing to slide from, so the fraction holds still from page to page. Only the first
// step slides it in: said once the router has drawn the page stepped to, later in this click, and
// its count laid out at rest. Delegated, since the stepper is drawn again with every page.
const FRACTION_SHOWN_MS = 1500;
let fractionTimer: ReturnType<typeof setTimeout> | undefined;

document.addEventListener("click", (event) => {
	const target = event.target as HTMLElement;
	const stepped = isTouchDevice() && target.closest(".nav-row .nav-arrows") !== null;
	if (!stepped && !target.closest(".nav-count")) return;
	const root = document.documentElement;
	clearTimeout(fractionTimer);
	fractionTimer = setTimeout(() => root.classList.remove("nav-stepping"), FRACTION_SHOWN_MS);
	if (root.classList.contains("nav-stepping")) return;
	setTimeout(() => {
		void root.offsetWidth;
		root.classList.add("nav-stepping");
	});
});
