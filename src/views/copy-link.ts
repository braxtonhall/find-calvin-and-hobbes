/**
 * Shows that a button's action went through: `done` in the button's place, coloured, for a moment,
 * and then its `label` again.
 */
export function flashButton(button: HTMLButtonElement, done: string, label: string): void {
	button.textContent = done;
	button.classList.add("copy-link-btn--copied");
	setTimeout(() => {
		button.textContent = label;
		button.classList.remove("copy-link-btn--copied");
	}, 1500);
}

/**
 * Wires the page's Copy link button, if it has one. The button carries the page's address as the
 * links write it, from the mount; the origin is put on here, where it is known.
 */
export function attachCopyLinkHandler(element: HTMLElement): void {
	const copyButton = element.querySelector<HTMLButtonElement>("#copy-link-btn");
	if (!copyButton) return;
	copyButton.addEventListener("click", () => {
		const url = window.location.origin + copyButton.dataset.href;
		navigator.clipboard.writeText(url).then(() => flashButton(copyButton, "Copied!", "Copy link"));
	});
}
