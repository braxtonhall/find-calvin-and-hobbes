import { ARCS_PATH, BOOKS_PATH, CHARACTERS_PATH, CREATORS_PATH, HOME_PATH, SUBJECTS_PATH } from "../routes";
import { addressOf } from "../base-path";
import { escHtml } from "../utils";
import type { Place } from "./page";

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

/** `Strip 3 of 10`, `Results 3 and 4 of 10`, or `Not among the 10 strips`. */
function describePlace(place: Place, noun: string): string {
	const of = place.of.toLocaleString("en-US");
	const plural = place.of === 1 ? noun.toLowerCase() : `${noun.toLowerCase()}s`;
	if (place.at.length === 0) return `Not among the ${of} ${plural}`;
	const at = place.at.map((n) => n.toLocaleString("en-US"));
	const list = at.length === 1 ? at[0] : `${at.slice(0, -1).join(", ")} and ${at[at.length - 1]}`;
	return `${noun}${at.length === 1 ? "" : "s"} ${list} of ${of}`;
}

/**
 * The arrows with where the page sits between them, `← 2 →`, which the row draws as one button so it
 * reads as a step through a list: `3,4` for two places, a dash for none. The numbers go ungrouped, so
 * the comma between two places is the only one. How many there are is left to the tooltip, which
 * `noun` names the things counted in. The count is as wide as the last place would be, so the arrows
 * stay put from one page to the next. No count where the page is in no list at all.
 */
export function buildStepperHtml(prevHtml: string, nextHtml: string, place: Place | null, noun: string): string {
	if (!place) return prevHtml + nextHtml;
	const at = place.at.length > 0 ? place.at.join(",") : "&ndash;";
	const label = describePlace(place, noun);
	const count = `<span class="nav-count" role="img" style="--digits: ${String(place.of).length}" data-tip="${label}" aria-label="${label}">${at}</span>`;
	return prevHtml + count + nextHtml;
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
