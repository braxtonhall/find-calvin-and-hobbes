import "./landing.css";

import { buildSearchHash, navigate } from "../router";
import { randomQuery } from "../suggestions";
import { attachQueryInput, editQueryInput } from "./query-input";

// Drawn in the same idiom as the results-bar icons: 16px, stroked in `currentColor`, no fill.
const SEARCH_ICON = `<svg class="landing-submit-search" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" aria-hidden="true">
	<circle cx="6.8" cy="6.8" r="4.3" /><path d="M10 10l3.5 3.5" />
</svg>`;

/** Fast enough not to be a wait, slow enough that the `@` and the pill it earns can be read. */
const TYPE_INTERVAL = 32;

/**
 * A query typing itself into the box, and how far along it is.
 *
 * Module state rather than a closure, because `renderLanding` builds a fresh input on every visit
 * and an animation still writing into the last one has to be stoppable from outside the render
 * that started it.
 */
let typeOut: { input: HTMLInputElement; query: string; timer: number } | null = null;

function cancelTypeOut(): void {
	if (typeOut === null) return;
	clearTimeout(typeOut.timer);
	typeOut = null;
}

/** The rest of it, at once — for the reader who pressed submit again rather than waiting. */
function finishTypeOut(): void {
	if (typeOut === null) return;
	const { input, query } = typeOut;
	cancelTypeOut();
	editQueryInput(input, query);
}

function typeStep(input: HTMLInputElement, query: string, landed: number): void {
	// A box that has gone from under us — the view was rebuilt, or left.
	if (!input.isConnected) {
		typeOut = null;
		return;
	}

	// `arriving` while there is more to come, so a half-written value wears the pending pill on its
	// way to being a filter rather than flashing red at every keystroke of the animation.
	editQueryInput(input, query.slice(0, landed), landed < query.length);
	if (landed >= query.length) {
		typeOut = null;
		return;
	}
	typeOut = {
		input,
		query,
		timer: window.setTimeout(() => typeStep(input, query, landed + 1), TYPE_INTERVAL),
	};
}

/**
 * What an empty box's submit does, in place of the die that used to sit in the middle of the page.
 *
 * The die failed in both directions at once: for a reader who came to type it was a dead control in
 * the most valuable position on the site, and for a reader who pressed it the pool is half prose,
 * so the button meant to reveal the filter syntax most likely landed them on `susie`. This does the
 * teaching the die was for without spending the centre of the page advertising itself — it is found
 * by pressing the obvious button on an empty field, which is a thing readers do.
 *
 * Typed out rather than pasted in because watching `@sunday snowman` arrive character by character,
 * earning its pill as the name lands, is the whole lesson. It does not search: the query is left in
 * the box with the caret after it, and the next submit — or Enter — searches it by the ordinary
 * path, because the box is no longer empty.
 */
function startTypeOut(input: HTMLInputElement): void {
	const query = randomQuery();
	if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
		editQueryInput(input, query);
		return;
	}
	typeStep(input, query, 1);
}

export function renderLanding(): void {
	// Whatever was being written is being written into a node this render is about to replace.
	cancelTypeOut();

	const element = document.getElementById("view-landing")!;
	element.innerHTML = `
		<img
			class="landing-logo"
			src="https://upload.wikimedia.org/wikipedia/commons/9/96/Calvin_and_Hobbes_title.png"
			alt="Calvin and Hobbes"
		/>
		<form class="landing-form" id="landing-form">
			<input
				type="text"
				class="landing-input"
				id="landing-input"
				placeholder="Search comics..."
				autocomplete="off"
			/>
			<button type="submit" class="landing-submit" id="landing-submit" title="Search" aria-label="Search">${SEARCH_ICON}</button>
		</form>
		<a class="landing-credits" href="#/credits">Credits</a>
	`;

	const input = document.getElementById("landing-input") as HTMLInputElement;
	const submit = document.getElementById("landing-submit") as HTMLButtonElement;
	attachQueryInput(input);
	// Into the box the widget just built, rather than beside it: the page keeps one rounded field
	// under the logo, and the control lives in room the input already reserves for it with its own
	// right padding. The highlight mirror copies that padding at runtime, so the pills stay put.
	input.parentElement!.appendChild(submit);
	input.focus();

	// The button never takes the focus, so the caret stays in the box through a click on it. Which
	// also keeps the blur below meaning what it says: the reader looked away, rather than pressed
	// the button that is about to be handled.
	submit.addEventListener("mousedown", (event) => event.preventDefault());

	// The animation is writing into a focused input and must never fight the reader for the caret:
	// a keystroke leaves whatever landed so far and hands the box back.
	input.addEventListener("keydown", cancelTypeOut);
	input.addEventListener("blur", cancelTypeOut);

	document.getElementById("landing-form")!.addEventListener("submit", (event) => {
		event.preventDefault();
		// Submitting mid-animation completes it rather than starting a second one over the top.
		if (typeOut !== null) {
			finishTypeOut();
			return;
		}
		const query = input.value.trim();
		if (query === "") startTypeOut(input);
		else navigate(buildSearchHash(query));
	});
}
