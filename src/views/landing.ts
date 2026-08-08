import "./landing.css";

import { buildSearchHash, navigate } from "../router";

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
		</form>
		<a class="landing-credits" href="#/credits">Credits</a>
	`;

	const input = document.getElementById("landing-input") as HTMLInputElement;
	input.focus();

	document.getElementById("landing-form")!.addEventListener("submit", (event) => {
		event.preventDefault();
		const query = input.value.trim();
		if (query) navigate(buildSearchHash(query));
	});
}
