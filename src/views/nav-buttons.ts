import { canGoBack } from "../router";
import { buildBackButton } from "../pages/nav-buttons";

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
