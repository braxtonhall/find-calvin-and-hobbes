import { canGoBack, navigate } from "../router";

export function buildBackButton(className: string): string {
	return canGoBack()
		? `<button class="${className}">&larr; Back</button>`
		: `<span class="${className} ${className}--disabled" title="Nowhere to go back to">&larr; Back</span>`;
}

export function attachBackButtonHandler(element: HTMLElement, className: string): void {
	const backButton = element.querySelector<HTMLButtonElement>(`button.${className}`);
	if (backButton) backButton.addEventListener("click", () => history.back());
}

export function buildBackAndHomeButtons(): string {
	return `${buildBackButton("detail-back")}
		<button class="detail-home"><span class="home-icon">&#8962;</span> Home</button>`;
}

export function attachBackAndHomeHandlers(element: HTMLElement): void {
	attachBackButtonHandler(element, "detail-back");
	element.querySelector(".detail-home")!.addEventListener("click", () => navigate("#/"));
}
