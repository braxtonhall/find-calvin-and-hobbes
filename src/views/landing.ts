import "./landing.css";

import { buildSearchHash, navigate } from "../router";
import { randomQuery } from "../suggestions";
import { attachQueryInput } from "./query-input";

// Drawn in the same idiom as the results-bar icons: 16px, stroked in `currentColor`, no fill.
// The die's pips are the exception, because three dots at this size have to be solid to read.
const SEARCH_ICON = `<svg class="landing-submit-search" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" aria-hidden="true">
	<circle cx="6.8" cy="6.8" r="4.3" /><path d="M10 10l3.5 3.5" />
</svg>`;

// A die rather than shuffle arrows: at 16px two crossing arrows are a smudge, and a die reads as
// chance without needing to be recognised as an icon at all.
const DIE_ICON = `<svg class="landing-submit-die" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" aria-hidden="true">
	<rect x="2.4" y="2.4" width="11.2" height="11.2" rx="2.6" />
	<circle cx="5.6" cy="5.6" r="0.85" fill="currentColor" stroke="none" />
	<circle cx="8" cy="8" r="0.85" fill="currentColor" stroke="none" />
	<circle cx="10.4" cy="10.4" r="0.85" fill="currentColor" stroke="none" />
</svg>`;

export function renderLanding(): void {
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
			<button type="submit" class="landing-submit landing-submit--die" id="landing-submit">${SEARCH_ICON}${DIE_ICON}</button>
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

	/**
	 * An empty box has nothing to submit, so the button that would be doing nothing offers a strip
	 * to read instead. Both icons live in the button and the class decides which one is showing,
	 * which is what lets them cross-fade — the swap answers a keystroke rather than a timer.
	 *
	 * The die is in the markup rather than applied from here on the way in, because a fresh box is
	 * always empty: painting the search icon first and crossing over to the die would put a
	 * flicker on every arrival, which is the motion this design is trying not to have.
	 */
	function syncSubmit(): void {
		const empty = input.value.trim() === "";
		submit.classList.toggle("landing-submit--die", empty);
		const label = empty ? "Show me a comic" : "Search";
		submit.title = label;
		submit.setAttribute("aria-label", label);
	}

	input.addEventListener("input", syncSubmit);
	syncSubmit();

	document.getElementById("landing-form")!.addEventListener("submit", (event) => {
		event.preventDefault();
		// Which also gives the Enter on an empty box something to mean, where it used to be dead.
		const query = input.value.trim();
		navigate(buildSearchHash(query === "" ? randomQuery() : query));
	});
}
