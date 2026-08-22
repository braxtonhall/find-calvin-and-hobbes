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
 */

const CHEVRON_ICON = `<svg class="filter-drop-chevron" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
	<path d="M4 6.5l4 4 4-4" />
</svg>`;

const CHECK_ICON = `<svg class="filter-option-check" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
	<path d="M3 8.5l3.5 3.5L13 4.5" />
</svg>`;

/** How many columns the day grid is laid out in, which is what makes it read as a calendar. */
const GRID_COLUMNS = 7;

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
/** The keyboard cursor, as an index into the open menu's rows. `-1` is no cursor at all. */
let cursor = -1;
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
		// Never let the focus move: the blur would tear the menu down before the click resolved, and
		// the caret would leave the query the reader is adding a filter to.
		event.preventDefault();
		const element = event.target as HTMLElement;
		if (element.closest(".filter-menu-clear") !== null) {
			// The cursor follows the pointer here as it does on any other row, which is what takes
			// the ring off the value that was checked a moment ago. `Clear` goes with the last
			// checkmark it clears, so what the cursor lands on is nothing at all — and nothing is
			// the right thing to be pointing at once there is nothing left in the field.
			if (open !== null) cursor = open.field.options.length;
			clearOpenField();
			return;
		}
		const row = element.closest<HTMLElement>(".filter-option");
		if (row === null || open === null) return;
		cursor = Number(row.dataset.index);
		toggle(open.field.options[cursor]);
	});

	return menu;
}

function optionHtml(field: FilterField, option: FilterOption, index: number): string {
	const checked = selected.has(option.token);
	const classes = [
		"filter-option",
		`filter-option--${field.shape}`,
		checked ? "filter-option--checked" : "",
		index === cursor ? "filter-option--cursor" : "",
	]
		.filter(Boolean)
		.join(" ");
	// A check beside the label in a list; in the grid there is no room for one, so a checked cell
	// says so by being filled.
	const check = field.shape === "grid" ? "" : CHECK_ICON;
	return `<div
			class="${classes}"
			role="option"
			id="filter-option-${index}"
			aria-selected="${checked}"
			data-index="${index}"
		>${check}<span class="filter-option-label">${escHtml(option.label)}</span></div>`;
}

function renderMenu(): void {
	const element = menuElement();
	if (open === null) {
		element.classList.remove("filter-menu--visible");
		return;
	}

	const { field } = open;
	const heading = field.heading === undefined ? "" : `<div class="filter-menu-heading">${escHtml(field.heading)}</div>`;
	const rows = field.options.map((option, index) => optionHtml(field, option, index)).join("");
	// Offered only where there is something to clear, and as the one row that is an action rather
	// than a value — so it sits apart from the list rather than in it.
	const clear = field.options.some((option) => selected.has(option.token))
		? `<button type="button" class="filter-menu-clear" id="filter-menu-clear"${cursor === field.options.length ? ` data-cursor="true"` : ""}>Clear</button>`
		: "";

	element.innerHTML = `${heading}<div
			class="filter-menu-options filter-menu-options--${field.shape}"
			role="listbox"
			aria-multiselectable="true"
			aria-label="${escHtml(field.heading ?? field.label)}"
		>${rows}</div>${clear}`;
	element.classList.add("filter-menu--visible");
	positionMenu();

	const active = element.querySelector(".filter-option--cursor") ?? element.querySelector("[data-cursor]");
	if (active === null) open.button.removeAttribute("aria-activedescendant");
	else {
		open.button.setAttribute("aria-activedescendant", active.id);
		active.scrollIntoView({ block: "nearest" });
	}
}

/**
 * Below the button by preference, above it when there is no room, and never off the edge — the same
 * clamp-then-flip as the completion menu. Right-aligned, because the dropdowns sit at the right
 * end of their row and a left-aligned menu would hang off the page.
 */
function positionMenu(): void {
	if (open === null) return;
	const element = menuElement();
	const rect = open.button.getBoundingClientRect();

	const height = element.offsetHeight;
	const below = rect.bottom + 4;
	element.style.top = `${below + height <= window.innerHeight - 8 ? below : Math.max(8, rect.top - height - 4)}px`;

	const width = element.offsetWidth;
	element.style.left = `${Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8))}px`;
}

function openMenu(dropdown: Dropdown, from: number): void {
	if (open !== null && open !== dropdown) closeMenu();
	open = dropdown;
	cursor = from;
	dropdown.button.setAttribute("aria-expanded", "true");
	renderMenu();
}

function closeMenu(): void {
	if (open === null) return;
	open.button.setAttribute("aria-expanded", "false");
	open.button.removeAttribute("aria-activedescendant");
	open = null;
	cursor = -1;
	menuElement().classList.remove("filter-menu--visible");
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

/** Where the cursor lands when the menu is opened from the keyboard: the first checked row. */
function firstChecked(field: FilterField): number {
	const index = field.options.findIndex((option) => selected.has(option.token));
	return index < 0 ? 0 : index;
}

function moveCursor(dropdown: Dropdown, step: number): void {
	// The Clear button, where there is one, is the row after the last option — reachable by the
	// same arrows rather than by a Tab that would close the menu on its way out.
	const rows = dropdown.field.options.length + (menuElement().querySelector(".filter-menu-clear") === null ? 0 : 1);
	// From no cursor at all — a menu opened by the pointer, or one whose `Clear` row left with the
	// checkmarks it cleared — the first step lands on an end of the list rather than one past it.
	if (cursor < 0 || cursor >= rows) cursor = step > 0 ? 0 : rows - 1;
	else cursor = (cursor + step + rows) % rows;
	renderMenu();
}

function activateCursor(dropdown: Dropdown): void {
	const option = dropdown.field.options[cursor];
	// Toggling never closes the menu: these are multi-selects, and a reader picking two years
	// should not have to open the same dropdown twice.
	if (option === undefined) clearOpenField();
	else toggle(option);
}

function attachDropdown(dropdown: Dropdown): void {
	const { field, button } = dropdown;

	button.addEventListener("click", () => {
		if (open === dropdown) closeMenu();
		else openMenu(dropdown, -1);
	});

	button.addEventListener("keydown", (event) => {
		const isOpen = open === dropdown;

		if (event.key === "Escape") {
			// Only the menu, and the focus stays where it already is. With it shut, Escape goes back
			// to meaning "leave this view", which is what the global handler in `index.ts` does.
			if (!isOpen) return;
			event.preventDefault();
			event.stopPropagation();
			closeMenu();
			return;
		}

		if (event.key === "ArrowDown" || event.key === "ArrowUp") {
			event.preventDefault();
			event.stopPropagation();
			if (!isOpen) openMenu(dropdown, firstChecked(field));
			// A grid steps by a row rather than by a cell, which is what its shape promises.
			else moveCursor(dropdown, (event.key === "ArrowDown" ? 1 : -1) * (field.shape === "grid" ? GRID_COLUMNS : 1));
			return;
		}

		if (isOpen && (event.key === "ArrowRight" || event.key === "ArrowLeft")) {
			if (field.shape !== "grid") return;
			event.preventDefault();
			event.stopPropagation();
			moveCursor(dropdown, event.key === "ArrowRight" ? 1 : -1);
			return;
		}

		if (event.key === "Enter" || event.key === " ") {
			event.preventDefault();
			if (!isOpen) openMenu(dropdown, firstChecked(field));
			else if (cursor >= 0) activateCursor(dropdown);
			return;
		}

		if (event.key === "Tab" && isOpen) closeMenu();
	});
}

/*
 * A click anywhere that is not this menu or another dropdown's button is a click that means to be
 * reading results again.
 *
 * In the capture phase, which is load-bearing rather than tidy: a click on a row repaints the menu,
 * and by the time a bubbling listener ran, the row it was told about would be a detached node with
 * no `.filter-menu` above it any more — so the menu would close on every checkmark.
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

	if (open !== null) renderMenu();
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

/** The two things a render has left to say: how many strips matched, and which boxes are ticked. */
export function syncFilterBar(results: number): void {
	// Nothing where there are none: the empty state says "No comics found" a line below, and
	// "0 results" beside it would only be saying it twice.
	if (count !== null) count.textContent = results === 0 ? "" : `${results} result${results === 1 ? "" : "s"}`;
	paint();
}
