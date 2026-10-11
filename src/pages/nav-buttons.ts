import { ARCS_PATH, BOOKS_PATH, CREATORS_PATH, HOME_PATH } from "../routes";
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

// Drawn rather than the ⌂ character, which some browsers set in a fallback font tall enough to
// stretch the button.
const HOME_ICON = `<svg class="home-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10.2a1.5 1.5 0 0 1 .55-1.16l6.5-5.3a1.5 1.5 0 0 1 1.9 0l6.5 5.3A1.5 1.5 0 0 1 20 10.2V19a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/></svg>`;

// A link, because home has an address.
export function buildHomeButton(className: string): string {
	return `<a class="${className}" href="${addressOf(HOME_PATH)}">${HOME_ICON} Home</a>`;
}

// The way up from a book to the shelf it sits on.
export function buildCollectionsButton(className: string): string {
	return `<a class="${className}" href="${addressOf(BOOKS_PATH)}">Books</a>`;
}

// The way up from an arc to the list of them.
export function buildArcsButton(className: string): string {
	return `<a class="${className}" href="${addressOf(ARCS_PATH)}">Arcs</a>`;
}

// The way up from a creator to the list of them.
export function buildCreatorsButton(className: string): string {
	return `<a class="${className}" href="${addressOf(CREATORS_PATH)}">Creators</a>`;
}

export function buildBackAndHomeButtons(canGoBack: boolean): string {
	return `${buildBackButton("detail-back", canGoBack)}
		${buildHomeButton("detail-home")}`;
}

/**
 * A button's label and what it says once its action has gone through, stacked in the one place so
 * the button is as wide as the longer of the two whichever is showing. `flashButton` crossfades
 * from one to the other.
 */
export function buildFlashLabels(label: string, done: string): string {
	return `<span class="flash-labels"><span class="flash-labels__label">${label}</span><span class="flash-labels__done" aria-hidden="true">${done}</span></span>`;
}
