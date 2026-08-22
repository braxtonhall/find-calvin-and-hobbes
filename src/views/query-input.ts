import "./query-input.css";

import { Completion, FilterSpan, Row, SpanKind, completionsAt, filterSpans } from "../completion";
import { escHtml } from "../utils";

/**
 * The search box, taught to say what it knows about `@filters`.
 *
 * Three things at once, all driven off one read of the query: a pill behind every recognised
 * filter, a menu of what could come next, and a tooltip on whichever filter will not work. The
 * decisions worth arguing about are in `completion.ts`, where they are testable; what is left
 * here is DOM.
 */

/**
 * Everything that decides where a glyph lands, copied off the input rather than restated in CSS.
 * The landing page and the results bar style their inputs differently and a phone changes the
 * font size again, so the mirror has to ask rather than assume.
 */
const METRICS = [
	"fontFamily",
	"fontSize",
	"fontWeight",
	"fontStyle",
	"fontVariant",
	"lineHeight",
	"letterSpacing",
	"wordSpacing",
	"textIndent",
	"textTransform",
	"paddingTop",
	"paddingRight",
	"paddingBottom",
	"paddingLeft",
	"borderTopWidth",
	"borderRightWidth",
	"borderBottomWidth",
	"borderLeftWidth",
	"borderRadius",
] as const;

/** Keys that move the caret without changing the text, so the menu has to be recomputed. */
const CARET_KEYS = new Set(["ArrowLeft", "ArrowRight", "Home", "End"]);

/** A filter in two parts keeps its tint on the name and marks the rest apart — see `FilterSpan`. */
const SPAN_CLASS: Record<SpanKind, string> = {
	match: "query-pill",
	name: "query-pill",
	pending: "query-pill--pending",
	invalid: "query-pill query-pill--invalid",
};

interface Widget {
	input: HTMLInputElement;
	accept(index: number): void;
	refresh(): void;
	reposition(): void;
	resync(): void;
}

const widgets = new Set<Widget>();
/** Whichever widget has the focus, and so the one the single shared menu belongs to. */
let owner: Widget | null = null;
/**
 * Set while `editQueryInput` is writing, and read by the widget's own `input` listener.
 *
 * An edit made by something other than the reader's keyboard must not arm the completion menu: a
 * filter dropdown writing `@year:1990` down the same path as a keystroke would leave the menu
 * hanging open over the results the reader was about to read. The flag carries whether the text is
 * still arriving, which is the other thing the listener would otherwise have assumed.
 */
let editing: { arriving: boolean } | null = null;
let menu: HTMLDivElement | null = null;
let tip: HTMLDivElement | null = null;

function menuElement(): HTMLDivElement {
	if (menu !== null) return menu;

	menu = document.createElement("div");
	menu.className = "query-menu";
	menu.id = "query-menu";
	menu.setAttribute("role", "listbox");

	// On `document.body` rather than inside the search bar: that bar is sticky with a z-index of
	// its own (`results.css`), and a dropdown nested in it would be clipped by it.
	document.body.appendChild(menu);

	menu.addEventListener("mousedown", (event) => {
		const row = (event.target as HTMLElement).closest<HTMLElement>(".query-menu-row");
		if (row === null) return;
		// Never let the input blur: the blur would tear the menu down before the click resolved,
		// and the click would land on nothing.
		event.preventDefault();
		if (row.getAttribute("aria-disabled") === "true") return;
		owner?.accept(Number(row.dataset.index));
	});

	return menu;
}

function tipElement(): HTMLDivElement {
	if (tip !== null) return tip;
	tip = document.createElement("div");
	tip.className = "query-tip";
	document.body.appendChild(tip);
	return tip;
}

/**
 * The reason a filter will not work, floated over the page.
 *
 * Anchored to the pill rather than to the pointer, so it holds still while the mouse moves inside
 * one. It floats because the alternative — a line under the box — grows the search bar and shoves
 * the results down the page every time a value is half-typed.
 */
function showTip(text: string, rect: DOMRect): void {
	const element = tipElement();
	element.textContent = text;
	element.classList.add("query-tip--visible");
	const above = rect.top - element.offsetHeight - 6;
	element.style.top = `${above >= 8 ? above : rect.bottom + 6}px`;
	element.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - element.offsetWidth - 8))}px`;
}

function hideTip(): void {
	tip?.classList.remove("query-tip--visible");
}

window.addEventListener("resize", () => {
	for (const widget of widgets) {
		// A view that rebuilt itself left its input behind; this is the only chance to notice.
		if (!widget.input.isConnected) widgets.delete(widget);
		else widget.resync();
	}
});

window.addEventListener("scroll", () => owner?.reposition(), true);

/** The query, with the filters in it painted according to how far along each one is. */
function paintHighlights(text: string, spans: FilterSpan[]): string {
	let html = "";
	let cursor = 0;
	for (const [index, span] of spans.entries()) {
		const next = spans[index + 1];
		// A settled name and the value still being typed after it are one pill in two parts, so
		// only the outer corners of the pair are rounded.
		const joined = next?.kind === "pending" && next.start === span.end;
		const classes = SPAN_CLASS[span.kind] + (joined ? " query-pill--head" : "");
		const reason = span.reason === undefined ? "" : ` data-start="${span.start}" data-reason="${escHtml(span.reason)}"`;
		html += escHtml(text.slice(cursor, span.start));
		html += `<span class="${classes}"${reason}>${escHtml(text.slice(span.start, span.end))}</span>`;
		cursor = span.end;
	}
	return html + escHtml(text.slice(cursor));
}

function rowHtml(row: Row, index: number, active: boolean): string {
	const template =
		// The colon stays in the name's own font; only the slot left to fill changes typeface.
		row.template === undefined ? "" : `:<span class="query-menu-template">${escHtml(row.template)}</span>`;
	const disabled = row.insert === undefined ? ` aria-disabled="true"` : "";
	return `<div
			class="query-menu-row${active ? " query-menu-row--active" : ""}"
			role="option"
			id="query-menu-row-${index}"
			aria-selected="${active}"${disabled}
			data-index="${index}"
		>
			<span class="query-menu-syntax">@${escHtml(row.name)}${template}</span>
			<span class="query-menu-hint">${escHtml(row.hint)}</span>
		</div>`;
}

/**
 * Repaint a box whose value was set from outside — a route change, a link followed back here.
 *
 * A dispatched `input` event would do the same job and also wake the view's own debounce, which
 * would search for the query it was just handed and re-render on the way back. This says only the
 * part that needs saying.
 */
export function syncQueryInput(input: HTMLInputElement): void {
	for (const widget of widgets) {
		if (widget.input === input) widget.refresh();
	}
}

/**
 * Write a value into the box on the reader's behalf — a filter dropdown, a query typing itself out
 * on the landing page.
 *
 * The `input` event is dispatched, because the point of these edits is that the view follows them:
 * the results search for what was just written, and the pills land on it as it arrives. What does
 * not follow is the completion menu, which answers typing and only typing — see `armed`.
 *
 * `arriving` says there is more text on its way, which buys a half-written value the same benefit
 * of the doubt a reader typing it would get: `@year:19` wears the pending pill on its way to
 * `@year:1995` rather than flashing red at every keystroke of the animation.
 */
export function editQueryInput(input: HTMLInputElement, value: string, arriving = false): void {
	editing = { arriving };
	try {
		input.value = value;
		input.setSelectionRange(value.length, value.length);
		input.dispatchEvent(new Event("input", { bubbles: true }));
	} finally {
		editing = null;
	}
}

export function attachQueryInput(input: HTMLInputElement): void {
	if (input.parentElement?.classList.contains("query-box")) return;

	// `renderLanding` rebuilds its input from scratch on every visit, so the widget it was attached
	// to last time is now holding a detached node. Drop it here rather than waiting for a resize.
	for (const stale of widgets) {
		if (!stale.input.isConnected) widgets.delete(stale);
	}

	const field = document.createElement("div");
	field.className = "query-field";
	const box = document.createElement("div");
	box.className = "query-box";
	const highlights = document.createElement("div");
	highlights.className = "query-highlights";
	highlights.setAttribute("aria-hidden", "true");
	// Says the same thing the tooltip does, for a reader who cannot hover: announced when it
	// changes, and taking no space, which is the whole reason the tooltip floats.
	const note = document.createElement("div");
	note.className = "query-note";
	note.setAttribute("role", "status");

	input.replaceWith(field);
	box.append(highlights, input);
	field.append(box, note);

	input.setAttribute("role", "combobox");
	input.setAttribute("aria-controls", "query-menu");
	input.setAttribute("aria-autocomplete", "list");
	input.setAttribute("aria-expanded", "false");

	let completion: Completion | null = null;
	let spans: FilterSpan[] = [];
	let highlighted = -1;
	/**
	 * Whether this query is being written right now, which is what buys a half-finished filter the
	 * benefit of the doubt — see `filterSpans`. Typing earns it; submitting the query or leaving
	 * the box spends it, and so does arriving with a query already in hand, because a query that
	 * came from a link or from the page before was finished as far as its author was concerned.
	 */
	let writing = false;
	/**
	 * The menu answers typing and nothing else.
	 *
	 * Arriving with a query already in the box — a followed link, the back button, the landing
	 * page handing one over — must not open it: a finished `@sunday` would come up reading as a
	 * filter still being written, and the reader who is here to look at results has to dismiss a
	 * menu they never asked for. So the menu waits to be typed at, Escape puts it back to waiting,
	 * and so does leaving the box.
	 */
	let armed = false;
	let focused = document.activeElement === input;
	/** The broken pill the pointer is inside, which outranks the one the caret is inside. */
	let hovered: HTMLElement | null = null;

	function syncMetrics(): void {
		const computed = getComputedStyle(input);
		for (const property of METRICS) highlights.style[property] = computed[property];
	}

	function selectable(): number[] {
		const rows = completion?.rows ?? [];
		return rows.map((row, index) => (row.insert === undefined ? -1 : index)).filter((index) => index >= 0);
	}

	function visible(): boolean {
		return completion !== null && focused && armed;
	}

	function repositionMenu(): void {
		if (!visible()) return;
		const element = menuElement();
		const rect = box.getBoundingClientRect();
		element.style.minWidth = `${rect.width}px`;
		element.style.maxWidth = `${Math.max(rect.width, 320)}px`;

		// Below by preference, above when there is no room, and never off the edge — the same
		// clamp-then-flip the collection tooltip does in `detail.ts`.
		const height = element.offsetHeight;
		const below = rect.bottom + 4;
		const top = below + height <= window.innerHeight - 8 ? below : Math.max(8, rect.top - height - 4);
		element.style.top = `${top}px`;
		element.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - element.offsetWidth - 8))}px`;
	}

	function renderMenu(): void {
		const element = menuElement();
		if (!visible()) {
			element.classList.remove("query-menu--visible");
			input.setAttribute("aria-expanded", "false");
			input.removeAttribute("aria-activedescendant");
			return;
		}

		element.innerHTML = completion!.rows.map((row, index) => rowHtml(row, index, index === highlighted)).join("");
		element.classList.add("query-menu--visible");
		input.setAttribute("aria-expanded", "true");
		if (highlighted < 0) input.removeAttribute("aria-activedescendant");
		else input.setAttribute("aria-activedescendant", `query-menu-row-${highlighted}`);
		repositionMenu();
	}

	function pillAt(x: number, y: number): HTMLElement | null {
		// The pills are painted behind the input and take no pointer events of their own — they
		// would otherwise swallow the clicks that place the caret — so the pointer is tested
		// against their boxes by hand. Clipped by the mirror, which scrolls with the text.
		const bounds = highlights.getBoundingClientRect();
		if (x < bounds.left || x > bounds.right || y < bounds.top || y > bounds.bottom) return null;
		for (const pill of highlights.querySelectorAll<HTMLElement>(".query-pill--invalid")) {
			const rect = pill.getBoundingClientRect();
			if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) return pill;
		}
		return null;
	}

	/**
	 * The broken filter the caret is inside — strictly inside, and not while the menu is up.
	 *
	 * Strictly, because the end of a filter is where the caret sits while it is being typed, and a
	 * tooltip that pops up on the keystroke that breaks a value and vanishes on the backspace that
	 * fixes it is noise wearing the clothes of help. Inside means the reader has gone back to look
	 * at it, which is a question worth answering. Hovering is the other way to ask.
	 */
	function caretPill(): HTMLElement | null {
		if (!focused || visible()) return null;
		const caret = input.selectionStart;
		if (caret === null) return null;
		const span = spans.find((each) => each.kind === "invalid" && caret > each.start && caret < each.end);
		if (span === undefined) return null;
		return highlights.querySelector<HTMLElement>(`.query-pill--invalid[data-start="${span.start}"]`);
	}

	function updateTip(): void {
		const pill = hovered ?? caretPill();
		if (pill === null) hideTip();
		else showTip(pill.dataset.reason ?? "", pill.getBoundingClientRect());
	}

	function reposition(): void {
		repositionMenu();
		updateTip();
	}

	function refresh(): void {
		const text = input.value;
		const caret = input.selectionStart;
		completion = completionsAt(text, caret ?? text.length);

		spans = filterSpans(text, writing ? caret : null);
		highlights.innerHTML = paintHighlights(text, spans);
		highlights.scrollLeft = input.scrollLeft;

		const broken = spans.find((span) => span.kind === "invalid");
		note.textContent = broken?.reason ?? "";

		const options = selectable();
		highlighted = options.length > 0 ? options[0] : -1;
		renderMenu();
		hovered = null;
		updateTip();
	}

	function accept(index: number): void {
		const row = completion?.rows[index];
		if (completion === null || row?.insert === undefined) return;
		const text = input.value;
		// Never two spaces where one will do: a completion that brings its own steps over the one
		// already there rather than adding a second.
		const rest = row.insert.endsWith(" ") && text[completion.end] === " " ? completion.end + 1 : completion.end;
		const caret = completion.start + row.insert.length;
		input.value = text.slice(0, completion.start) + row.insert + text.slice(rest);
		input.setSelectionRange(caret, caret);
		// Let the view's own handler see it, so the results follow the accepted filter.
		input.dispatchEvent(new Event("input", { bubbles: true }));
	}

	function move(direction: number): void {
		const options = selectable();
		if (options.length === 0) return;
		const current = options.indexOf(highlighted);
		highlighted = options[(Math.max(current, 0) + direction + options.length) % options.length];
		renderMenu();
		menuElement().querySelector(".query-menu-row--active")?.scrollIntoView({ block: "nearest" });
	}

	/*
	 * Bound on the wrapper in the capture phase, which is what makes `stopPropagation` mean
	 * something here. Listeners on the input itself all run in the same at-target phase in
	 * registration order, so a capture listener on the input could not reliably get in front of
	 * the results view's own Enter handler; one on an ancestor can, and stopping there keeps the
	 * event away from the input and from `document` alike.
	 */
	field.addEventListener(
		"keydown",
		(event) => {
			if (event.target !== input) return;

			// The Enter that runs the search is also the Enter that settles whether a filter still
			// being written was going to be finished. It was not: `@year:` had its chance. Left to
			// propagate, so the view's own handler searches as it always did.
			if (event.key === "Enter" && !(visible() && highlighted >= 0)) {
				writing = false;
				armed = false;
				refresh();
				return;
			}

			if (event.key === "Escape") {
				// Only the menu. With it already shut, Escape goes back to meaning "leave this view",
				// which is what the global handler in `index.ts` does with it.
				if (!visible()) return;
				event.preventDefault();
				event.stopPropagation();
				armed = false;
				renderMenu();
				updateTip();
				return;
			}

			if (!visible()) return;

			if (event.key === "ArrowDown" || event.key === "ArrowUp") {
				if (selectable().length === 0) return;
				event.preventDefault();
				event.stopPropagation();
				move(event.key === "ArrowDown" ? 1 : -1);
				return;
			}

			if (event.key === "Tab" || event.key === "Enter") {
				// Nothing highlighted means nothing to accept: Tab leaves the field and Enter searches,
				// both of which are what they would have done without a menu on screen.
				if (highlighted < 0) return;
				event.preventDefault();
				event.stopPropagation();
				accept(highlighted);
			}
		},
		true,
	);

	input.addEventListener("input", () => {
		if (editing === null) {
			armed = true;
			writing = true;
		} else {
			// Disarmed rather than merely left alone: a menu the reader opened by typing has no
			// business staying up over an edit they made by clicking something else.
			armed = false;
			writing = editing.arriving;
		}
		refresh();
	});

	input.addEventListener("click", refresh);
	input.addEventListener("scroll", () => {
		highlights.scrollLeft = input.scrollLeft;
		updateTip();
	});

	input.addEventListener("keyup", (event) => {
		if (CARET_KEYS.has(event.key)) refresh();
	});

	// The caret scrolls the input after the keystroke's default action, not during it.
	input.addEventListener("keydown", () => {
		requestAnimationFrame(() => (highlights.scrollLeft = input.scrollLeft));
	});

	field.addEventListener("mousemove", (event) => {
		const pill = pillAt(event.clientX, event.clientY);
		if (pill === hovered) return;
		hovered = pill;
		updateTip();
	});

	field.addEventListener("mouseleave", () => {
		if (hovered === null) return;
		hovered = null;
		updateTip();
	});

	input.addEventListener("focus", () => {
		focused = true;
		owner = widget;
		refresh();
	});

	input.addEventListener("blur", () => {
		focused = false;
		armed = false;
		writing = false;
		if (owner === widget) owner = null;
		// Repainted rather than only re-hidden: a filter left half-written is a mistake once the
		// reader has walked away from it, however excusable it was under the caret.
		refresh();
	});

	const widget: Widget = {
		input,
		accept,
		refresh,
		reposition,
		resync() {
			syncMetrics();
			reposition();
		},
	};
	widgets.add(widget);
	if (focused) owner = widget;

	syncMetrics();
	refresh();
}
