import { COLLECTIONS_PATH, HOME_PATH } from "../routes";
import { addressOf } from "../base-path";

/**
 * Back is a `<button>` whether or not it can go anywhere: `history.back()` is a step through a
 * list only the browser holds, so there is no href to give it. A prerendered page is built with
 * `canGoBack` false, since a cold load has nothing behind it; the app re-checks when it attaches
 * the handler, because a reload keeps the history depth.
 */
export function buildBackButton(className: string, canGoBack: boolean): string {
	return canGoBack
		? `<button class="${className}">&larr; Back</button>`
		: `<button class="${className} ${className}--disabled" disabled title="Nowhere to go back to">&larr; Back</button>`;
}

// A link, because home has an address.
export function buildHomeButton(className: string): string {
	return `<a class="${className}" href="${addressOf(HOME_PATH)}"><span class="home-icon">&#8962;</span> Home</a>`;
}

// The way up from a book to the shelf it sits on.
export function buildCollectionsButton(className: string): string {
	return `<a class="${className}" href="${addressOf(COLLECTIONS_PATH)}">Collections</a>`;
}

export function buildBackAndHomeButtons(canGoBack: boolean): string {
	return `${buildBackButton("detail-back", canGoBack)}
		${buildHomeButton("detail-home")}`;
}
