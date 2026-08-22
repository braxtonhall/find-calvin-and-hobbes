import { canGoBack } from "../router";

export function buildBackButton(className: string): string {
	return canGoBack()
		? `<button class="${className}">&larr; Back</button>`
		: `<span class="${className} ${className}--disabled" title="Nowhere to go back to">&larr; Back</span>`;
}

export function attachBackButtonHandler(element: HTMLElement, className: string): void {
	const backButton = element.querySelector<HTMLButtonElement>(`button.${className}`);
	if (backButton) backButton.addEventListener("click", () => history.back());
}

// A link, because home has an address. Back stays a button: `history.back()` is a step through a
// list only the browser holds, and there is no URL to put in an href for it.
export function buildHomeButton(className: string): string {
	return `<a class="${className}" href="#/"><span class="home-icon">&#8962;</span> Home</a>`;
}

export function buildBackAndHomeButtons(): string {
	return `${buildBackButton("detail-back")}
		${buildHomeButton("detail-home")}`;
}

export function attachBackAndHomeHandlers(element: HTMLElement): void {
	attachBackButtonHandler(element, "detail-back");
}
