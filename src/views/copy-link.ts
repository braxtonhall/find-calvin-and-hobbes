const flashTimers = new WeakMap<HTMLButtonElement, ReturnType<typeof setTimeout>>();

/**
 * Shows that a button's action went through: its done label, from `buildFlashLabels`, faded in over
 * its label and coloured, for a moment, and then its label again. Pressed again mid-flash, the
 * moment starts over.
 */
export function flashButton(button: HTMLButtonElement): void {
	const label = button.querySelector(".flash-labels__label");
	const done = button.querySelector(".flash-labels__done");
	const show = (flashing: boolean) => {
		button.classList.toggle("copy-link-btn--copied", flashing);
		label?.toggleAttribute("aria-hidden", flashing);
		done?.toggleAttribute("aria-hidden", !flashing);
	};
	clearTimeout(flashTimers.get(button));
	show(true);
	flashTimers.set(
		button,
		setTimeout(() => show(false), 1500),
	);
}

/**
 * Wires the page's Copy link button, if it has one, and the title it sits in, which copies wherever
 * it is clicked — short of a drag that selected some of it, which is someone after the words. The
 * button carries the page's address as the links write it, from the mount; the origin is put on
 * here, where it is known.
 */
export function attachCopyLinkHandler(element: HTMLElement): void {
	const copyButton = element.querySelector<HTMLButtonElement>("#copy-link-btn");
	if (!copyButton) return;
	const title = copyButton.closest<HTMLElement>(".page-title") ?? copyButton;
	title.addEventListener("click", () => {
		if (window.getSelection()?.toString()) return;
		const url = window.location.origin + copyButton.dataset.href;
		navigator.clipboard.writeText(url).then(() => flashButton(copyButton));
	});
}
