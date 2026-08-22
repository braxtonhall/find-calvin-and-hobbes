import "./filter-bar.css";

import {
	FILTER_FIELDS,
	FilterField,
	FilterOption,
	clearField,
	insertToken,
	removeToken,
	selectedTokens,
} from "../query-edit";
import { naturalHeight, onViewportShift, place, viewport } from "../placement";
import { escHtml } from "../utils";
import { editQueryInput } from "./query-input";

/**
 * The row under the search box: a result count, and four dropdowns that write `@filters` into the
 * query text.
 *
 * The filter language is good and nobody finds it, because the only two ways in — typing an `@`,
 * and reading the README — both require already knowing. This row is the third: the reader gets the
 * filters they want where they are already trying to narrow something down, and gets them *spelled
 * out in the search box*, so the next time they want strips from 1988 they can type it.
 *
 * Which is why every control here writes into the query and none of them keep any state of their
 * own. Sort is the one thing in this lineup that stays an icon button beside the input: it is
 * `?sort=date` in the URL rather than a filter, and the one control here a reader could never learn
 * to type. The rest of the decisions — what a click is worth in characters, which checkmarks a
 * query lights up — are in `query-edit.ts`, where they are testable. What is left here is DOM.
 *
 * The menu's rows are focused, not tracked. There is no cursor of this module's own: the arrows
 * move the real focus onto a real `role="option"`, so the ring is the browser's `:focus-visible`
 * and the page's one focus rule in `base.css` draws it. Which is the point — these rows show a ring
 * to the keyboard and none to the pointer for the same reason every other control on the page does,
 * rather than because this file remembered to. One thing pays for it, and it is load-bearing rather
 * than tidy: an open menu is repainted in place rather than rebuilt, because a rebuild would detach
 * the row the reader is standing on.
 */

const CHEVRON_ICON = `<svg class="filter-drop-chevron" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
	<path d="M4 6.5l4 4 4-4" />
</svg>`;

const CHECK_ICON = `<svg class="filter-option-check" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
	<path d="M3 8.5l3.5 3.5L13 4.5" />
</svg>`;

/**
 * Tall enough for the eleven years and the twelve months to arrive whole. Here rather than in the
 * stylesheet, for the same reason the completion menu's own is: `place` caps it against the room the
 * viewport actually has, and writes the result inline, where a `max-height` in CSS would only be a
 * second opinion it overrode.
 */
const MENU_HEIGHT = 380;

/** How many columns the day grid is laid out in, which is what makes it read as a calendar. */
const GRID_COLUMNS = 7;

/**
 * The one row that is an action rather than a value, so it sits apart from the list rather than in
 * it — and is offered only where there is something to clear. A real `<button>`, which is what has
 * it announce itself as one, and `tabindex="-1"` so the arrows reach it on the same walk as the
 * values rather than a Tab that would close the menu on its way out.
 */
const CLEAR_HTML = `<button type="button" class="filter-menu-clear" tabindex="-1">Clear</button>`;

interface Dropdown {
	field: FilterField;
	button: HTMLButtonElement;
}

/** The box every click writes into, and the box every checkmark is read back out of. */
let target: HTMLInputElement | null = null;
let dropdowns: Dropdown[] = [];
let count: HTMLElement | null = null;
let menu: HTMLDivElement | null = null;
let open: Dropdown | null = null;
let selected = new Set<string>();

function menuElement(): HTMLDivElement {
	if (menu !== null) return menu;

	menu = document.createElement("div");
	menu.className = "filter-menu";
	menu.id = "filter-menu";

	// On `document.body`, for the same reason `query-menu` is: the search bar it hangs from is
	// `position: sticky` with a z-index of its own, and a menu nested inside it would be clipped.
	document.body.appendChild(menu);

	menu.addEventListener("mousedown", (event) => {
		const element = event.target as HTMLElement;
		if (element.closest(".filter-menu-clear") !== null) {
			clearOpenField();
			return;
		}
		const row = element.closest<HTMLElement>(".filter-option");
		if (row === null || open === null) return;
		toggle(open.field.options[Number(row.dataset.index)]);
	});

	// Bound here as well as on the button, because while the reader is arrowing around the menu the
	// focus is genuinely inside it, and a listener on the button would not hear a key of it.
	menu.addEventListener("keydown", (event) => {
		if (open !== null) handleKey(open, event);
	});

	return menu;
}

function optionHtml(field: FilterField, option: FilterOption, index: number): string {
	const checked = selected.has(option.token);
	const classes = ["filter-option", `filter-option--${field.shape}`, checked ? "filter-option--checked" : ""]
		.filter(Boolean)
		.join(" ");
	// A check beside the label in a list; in the grid there is no room for one, so a checked cell
	// says so by being filled.
	const check = field.shape === "grid" ? "" : CHECK_ICON;
	// Focusable, and never by Tab: the arrows are what walk this list, and a Tab that stepped
	// through thirty-one days on its way to the next control would be a trap with a door.
	return `<div
			class="${classes}"
			role="option"
			aria-selected="${checked}"
			data-index="${index}"
			tabindex="-1"
		>${check}<span class="filter-option-label">${escHtml(option.label)}</span></div>`;
}

/** Whether the field has anything in it to clear, which is the only thing `Clear` is offered for. */
function hasClearable(field: FilterField): boolean {
	return field.options.some((option) => selected.has(option.token));
}

/**
 * The menu from scratch, which only a newly opened dropdown needs.
 *
 * Everything after that goes through `paintMenu`, and the split is what lets the ring in here be
 * real focus: reassigning this `innerHTML` under an open menu would detach the row the reader is
 * standing on, and a focus that drops to `document.body` halfway through ticking a checkmark is a
 * ring gone out and a screen reader that has lost its place.
 */
function buildMenu(): void {
	const element = menuElement();
	if (open === null) {
		element.classList.remove("filter-menu--visible");
		return;
	}

	const { field } = open;
	const heading = field.heading === undefined ? "" : `<div class="filter-menu-heading">${escHtml(field.heading)}</div>`;
	const rows = field.options.map((option, index) => optionHtml(field, option, index)).join("");
	element.innerHTML = `${heading}<div
			class="filter-menu-options filter-menu-options--${field.shape}"
			role="listbox"
			aria-multiselectable="true"
			aria-label="${escHtml(field.heading ?? field.label)}"
		>${rows}</div>${hasClearable(field) ? CLEAR_HTML : ""}`;
	element.classList.add("filter-menu--visible");
	positionMenu();
}

/**
 * The two things that change under an open menu — which rows are checked, and whether there is
 * anything left to clear — written onto the nodes that are already standing.
 */
function paintMenu(): void {
	if (open === null) return;
	const element = menuElement();
	const { field } = open;

	for (const row of element.querySelectorAll<HTMLElement>(".filter-option")) {
		const checked = selected.has(field.options[Number(row.dataset.index)].token);
		row.classList.toggle("filter-option--checked", checked);
		row.setAttribute("aria-selected", String(checked));
	}

	const clear = element.querySelector<HTMLButtonElement>(".filter-menu-clear");
	const wanted = hasClearable(field);
	if (wanted && clear === null) element.insertAdjacentHTML("beforeend", CLEAR_HTML);
	else if (!wanted && clear !== null) {
		// `Clear` goes with the last checkmark it clears. A reader standing on it gets the button
		// the menu hangs from back, rather than the focus falling to `document.body`.
		if (document.activeElement === clear) open.button.focus();
		clear.remove();
	}

	// `Clear` arriving or leaving changes the height, and a menu that had to flip above its button
	// is placed from its bottom edge.
	positionMenu();
}

/**
 * By the same rule as the completion menu, and right-aligned: the dropdowns sit at the right end of
 * their row, and a left-aligned menu under them would hang off the page.
 */
function positionMenu(): void {
	if (open === null) return;
	const element = menuElement();
	const rect = open.button.getBoundingClientRect();
	// The values are what overflow here, not the menu: the heading and `Clear` stay put while the
	// list between them scrolls.
	const options = element.querySelector<HTMLElement>(".filter-menu-options");
	const height = Math.min(MENU_HEIGHT, naturalHeight(element, options ?? element));

	const spot = place(rect, { width: element.offsetWidth, height }, viewport(), 4, "end");
	element.style.top = `${spot.top}px`;
	element.style.left = `${spot.left}px`;
	element.style.maxHeight = `${spot.maxHeight}px`;
}

/**
 * `at` is the row the keyboard should land on, or `null` for a menu the pointer opened — where
 * moving the focus in would take the caret out of the query box and leave a ring sitting on a row
 * nobody is typing at.
 */
function openMenu(dropdown: Dropdown, at: number | null): void {
	if (open !== null && open !== dropdown) closeMenu();
	open = dropdown;
	dropdown.button.setAttribute("aria-expanded", "true");
	buildMenu();
	if (at !== null) focusStops()[at]?.focus();
}

/**
 * `restore` hands the focus back to the button the menu belongs to, which is where a reader who
 * pressed Escape or Tab expects to find it. The pointer paths do not ask for it: they leave the
 * focus wherever the click put it, and programmatically pulling it to the button would light a ring
 * on it that no key was pressed for. Nor does the router's teardown — the view that button is in is
 * on its way out, and the focus belongs in the one arriving.
 */
function closeMenu(restore = false): void {
	if (open === null) return;
	const element = menuElement();
	const { button } = open;
	// Read before the menu is hidden: nothing inside a `visibility: hidden` subtree can hold the
	// focus, so asking afterwards would only be asking about `document.body`.
	const held = element.contains(document.activeElement);
	button.setAttribute("aria-expanded", "false");
	open = null;
	element.classList.remove("filter-menu--visible");
	if (held && restore) button.focus();
}

/**
 * Every edit the bar makes goes through here: the query text is rewritten and an ordinary `input`
 * event is dispatched, so the results follow by the path typing already uses — no history entry,
 * and the existing 200ms debounce coalesces a burst of clicks across several boxes into one search.
 *
 * The checkmarks do not wait for it. They are read straight back off the box, because a checkbox
 * that took a search to tick would feel broken.
 */
function write(text: string): void {
	if (target === null || text === target.value) return;
	editQueryInput(target, text);
	paint();
}

function toggle(option: FilterOption): void {
	if (target === null) return;
	write(selected.has(option.token) ? removeToken(target.value, option.token) : insertToken(target.value, option.token));
}

function clearOpenField(): void {
	if (target === null || open === null) return;
	write(clearField(target.value, open.field));
}

/** Where the focus lands when the menu is opened from the keyboard: the first checked row. */
function firstChecked(field: FilterField): number {
	const index = field.options.findIndex((option) => selected.has(option.token));
	return index < 0 ? 0 : index;
}

/**
 * Every row the arrows visit, in the order they visit them: the values, and the `Clear` after them
 * where there is one. Document order, which is the order they read in.
 */
function focusStops(): HTMLElement[] {
	return [...menuElement().querySelectorAll<HTMLElement>(".filter-option, .filter-menu-clear")];
}

function moveFocus(step: number): void {
	const stops = focusStops();
	if (stops.length === 0) return;
	const current = stops.indexOf(document.activeElement as HTMLElement);
	// From outside the menu — one the pointer opened, whose button still holds the focus — the first
	// step lands on an end of the list rather than one past it.
	const next = current < 0 ? (step > 0 ? 0 : stops.length - 1) : (current + step + stops.length) % stops.length;
	// Native focus scrolls its row into the options' own scroller on the way, which is the one thing
	// a cursor of our own had to do for itself.
	stops[next].focus();
}

/** Whatever the focus is standing on: a value to toggle, or the `Clear` below them. */
function activateFocused(): void {
	if (open === null) return;
	const active = document.activeElement as HTMLElement | null;
	const row = active === null ? null : active.closest<HTMLElement>(".filter-option");
	// Toggling never closes the menu: these are multi-selects, and a reader picking two years
	// should not have to open the same dropdown twice.
	if (row !== null) toggle(open.field.options[Number(row.dataset.index)]);
	// Nothing at all when the focus is still on the button, which is a menu the pointer opened and
	// a reader who has not said which row they mean yet.
	else if (active?.classList.contains("filter-menu-clear") === true) clearOpenField();
}

/**
 * One handler for both the places the focus can be while a dropdown is live — the button, and a row
 * of the open menu — because the keys mean the same thing from either.
 */
function handleKey(dropdown: Dropdown, event: KeyboardEvent): void {
	const isOpen = open === dropdown;
	const { field } = dropdown;

	if (event.key === "Escape") {
		// Only the menu, and the focus comes back to the button it hangs from. With it shut, Escape
		// goes back to meaning "leave this view", which is what the global handler in `index.ts` does.
		if (!isOpen) return;
		event.preventDefault();
		event.stopPropagation();
		closeMenu(true);
		return;
	}

	if (event.key === "ArrowDown" || event.key === "ArrowUp") {
		event.preventDefault();
		event.stopPropagation();
		if (!isOpen) openMenu(dropdown, firstChecked(field));
		// A grid steps by a row rather than by a cell, which is what its shape promises.
		else moveFocus((event.key === "ArrowDown" ? 1 : -1) * (field.shape === "grid" ? GRID_COLUMNS : 1));
		return;
	}

	if (isOpen && (event.key === "ArrowRight" || event.key === "ArrowLeft")) {
		if (field.shape !== "grid") return;
		event.preventDefault();
		event.stopPropagation();
		moveFocus(event.key === "ArrowRight" ? 1 : -1);
		return;
	}

	if (event.key === "Enter" || event.key === " ") {
		event.preventDefault();
		if (!isOpen) openMenu(dropdown, firstChecked(field));
		else activateFocused();
		return;
	}

	if (event.key === "Tab" && isOpen) {
		// From a row the Tab is spent getting out, because the menu is floated on `document.body`
		// and the focus in it has no page order to carry on from. From the button it is left alone
		// and goes on to the next control, exactly as it did before there was a menu to close.
		if (menuElement().contains(document.activeElement)) event.preventDefault();
		closeMenu(true);
	}
}

function attachDropdown(dropdown: Dropdown): void {
	const { button } = dropdown;

	button.addEventListener("click", () => {
		// Opened without the focus going in: no ring on a row the reader is not typing at, and the
		// caret stays in the query box, which in Safari and Firefox is where it still is.
		if (open === dropdown) closeMenu();
		else openMenu(dropdown, null);
	});

	button.addEventListener("keydown", (event) => handleKey(dropdown, event));
}

/*
 * A click anywhere that is not this menu or another dropdown's button is a click that means to be
 * reading results again.
 *
 * In the capture phase, which is load-bearing rather than tidy: clicking `Clear` takes `Clear` out
 * of the menu along with the last checkmark it cleared, and by the time a bubbling listener ran, the
 * node it was told about would be detached with no `.filter-menu` above it any more — so the menu
 * would close on the one click with the most reason to leave it open. The value rows are safe now
 * that they are repainted rather than rebuilt, but `Clear` still comes and goes.
 */
document.addEventListener(
	"mousedown",
	(event) => {
		if (open === null) return;
		const element = event.target as HTMLElement;
		if (element.closest(".filter-menu") !== null || element.closest(".filter-drop") !== null) return;
		closeMenu();
	},
	true,
);

window.addEventListener("resize", positionMenu);
// Captured, because the row the menu hangs from is sticky inside a scroller of its own.
window.addEventListener("scroll", positionMenu, true);
// And the visible band moves under a software keyboard without either of those firing.
onViewportShift(positionMenu);

function dropdownHtml(field: FilterField): string {
	return `<button
			type="button"
			class="filter-drop"
			id="filter-drop-${field.name}"
			aria-haspopup="listbox"
			aria-expanded="false"
			aria-controls="filter-menu"
		>
			<span class="filter-drop-label">${escHtml(field.label)}</span>
			${CHEVRON_ICON}
		</button>`;
}

/**
 * The buttons say nothing about what is in them — no `Year: 1988`, no count badge, and no tint for
 * a dropdown that is holding something. The first two change the button's width as the reader
 * works, and four buttons lighting up in a row put more colour on the quietest part of the page
 * than anything there is worth.
 *
 * Nothing is lost by it, because the state was never theirs to hold: the filters are spelled out in
 * the query box directly above, wearing pills, which is the whole point of the bar. What the eye
 * gets from the query text, the label says for a reader who is not looking at it.
 */
function paint(): void {
	if (target === null) return;
	selected = selectedTokens(target.value);

	for (const dropdown of dropdowns) {
		const chosen = dropdown.field.options.filter((option) => selected.has(option.token)).length;
		const label = chosen === 0 ? dropdown.field.label : `${dropdown.field.label}, ${chosen} selected`;
		dropdown.button.setAttribute("aria-label", label);
	}

	paintMenu();
}

/**
 * Built once, with the search bar, rather than in `resultsHtml` — which is rebuilt on every
 * keystroke and would tear an open dropdown down as the reader typed. The bar survives its
 * renders, exactly as the input does and for exactly the same reason.
 */
export function buildFilterBar(input: HTMLInputElement): HTMLElement {
	target = input;

	const bar = document.createElement("div");
	bar.className = "filter-bar";
	bar.innerHTML = `<div class="filter-count" id="filter-count" role="status"></div>
		<div class="filter-fields">${FILTER_FIELDS.map(dropdownHtml).join("")}</div>`;

	count = bar.querySelector<HTMLElement>(".filter-count");
	dropdowns = FILTER_FIELDS.map((field) => ({
		field,
		button: bar.querySelector<HTMLButtonElement>(`#filter-drop-${field.name}`)!,
	}));
	for (const dropdown of dropdowns) attachDropdown(dropdown);

	// Straight off the box rather than out of the render, so a hand-typed `@year:88` ticks 1988 on
	// the keystroke that finishes it instead of 200ms later when the search comes back.
	input.addEventListener("input", paint);

	paint();
	return bar;
}

/**
 * Leaving the results view takes any open dropdown with it.
 *
 * The menu is floated on `document.body`, so it does not go away when the view it hangs from is
 * hidden — it is left standing over whatever came next. Which is easy to reach: unchecking the last
 * filter of a one-filter query empties the box, and an empty box goes home.
 *
 * Called by the router rather than noticed from here, because a view being switched out is not an
 * event this module can hear. `replaceSearch` re-renders the results through the same path on every
 * keystroke, so this has to be the router's business: only *leaving* closes the menu, and typing
 * with one open does not.
 */
export function closeFilterMenu(): void {
	closeMenu();
}

/**
 * Whether the focus is inside the open menu, which `renderResults` has to ask because its "did the
 * reader arrive from another view" test is `contains` on the results element — and this menu is
 * floated on `document.body`, out of its reach. Without it, the search that follows a checkmark
 * 200ms later would take the focus off the row the reader is standing on.
 */
export function filterMenuHasFocus(): boolean {
	return open !== null && menuElement().contains(document.activeElement);
}

/** The two things a render has left to say: how many strips matched, and which boxes are ticked. */
export function syncFilterBar(results: number): void {
	// Nothing where there are none: the empty state says "No comics found" a line below, and
	// "0 results" beside it would only be saying it twice.
	if (count !== null) count.textContent = results === 0 ? "" : `${results} result${results === 1 ? "" : "s"}`;
	paint();
}
