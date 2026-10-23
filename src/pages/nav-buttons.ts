import { ARCS_PATH, BOOKS_PATH, CHARACTERS_PATH, CREATORS_PATH, HOME_PATH, SUBJECTS_PATH } from "../routes";
import { addressOf } from "../base-path";
import { escHtml } from "../utils";

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

// The way up from a character to the list of them.
export function buildCharactersButton(className: string): string {
	return `<a class="${className}" href="${addressOf(CHARACTERS_PATH)}">Characters</a>`;
}

// The way up from a subject to the list of them.
export function buildSubjectsButton(className: string): string {
	return `<a class="${className}" href="${addressOf(SUBJECTS_PATH)}">Subjects</a>`;
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

/**
 * The buttons above a page, with arrows to its neighbours after them: the row is the site's ways
 * around, and the row of actions under the title is left to what the page holds.
 */
export function buildNavRow(buttonsHtml: string, arrowsHtml: string): string {
	return `<div class="nav-row">${buttonsHtml}<span class="nav-arrows">${arrowsHtml}</span></div>`;
}

const COPY_LINK_ICON = `<svg class="copy-link-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`;
const COPIED_ICON = `<svg class="copy-link-icon copy-link-icon--copied" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M7.5 12.5l3 3 6-6.5" fill="none" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

/**
 * A page's title, and the button that copies a link to the page after its last word. A click
 * anywhere on the title copies too, and the button shows it; see `attachCopyLinkHandler`. `className`
 * is the title's look, `.detail-date` or `.collection-name`; `titleHtml` is escaped already.
 */
export function buildPageTitle(className: string, titleHtml: string, href: string): string {
	return `<div class="page-title ${className}"><h2 class="page-title__text">${titleHtml}</h2><button type="button" class="copy-link-btn copy-link-btn--icon" id="copy-link-btn" data-href="${escHtml(href)}" aria-label="Copy link">${buildFlashLabels(COPY_LINK_ICON, COPIED_ICON)}</button></div>`;
}
