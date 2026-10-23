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
 * Wires every title's Copy link button — the page's, and any heading's within it — and the title's
 * words beside it, which copy wherever they are clicked, short of a drag that selected some of them,
 * which is someone after the words. The rest of the title's row is left alone. The
 * button carries its address as the links write it, from the mount; the origin is put on
 * here, where it is known.
 */
export function attachCopyLinkHandler(element: HTMLElement): void {
	element.querySelectorAll<HTMLElement>(".page-title").forEach((title) => {
		const copyButton = title.querySelector<HTMLButtonElement>(".copy-link-btn--icon");
		if (!copyButton) return;
		const copy = () => {
			if (window.getSelection()?.toString()) return;
			const url = window.location.origin + copyButton.dataset.href;
			navigator.clipboard.writeText(url).then(() => flashButton(copyButton));
		};
		copyButton.addEventListener("click", copy);
		title.querySelector(".page-title__text")?.addEventListener("click", copy);
	});
}
