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
// anywhere else puts it away. Delegated, since the count is drawn again with every page. A tap is
// known by the click's pointer rather than by `isTouchDevice` alone: some Android phones say they
// can hover, and Safari's clicks say nothing of their pointer.
document.addEventListener("click", (event) => {
	const pointer = (event as PointerEvent).pointerType;
	if (pointer ? pointer === "mouse" : !isTouchDevice()) return;
	const count = (event.target as HTMLElement).closest(".nav-count");
	document.querySelectorAll(".nav-count--open").forEach((open) => {
		if (open !== count) open.classList.remove("nav-count--open");
	});
	count?.classList.toggle("nav-count--open");
});
