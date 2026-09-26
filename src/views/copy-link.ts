/**
 * Wires the page's Copy link button, if it has one. The button carries the page's address as the
 * links write it, from the mount; the origin is put on here, where it is known.
 */
export function attachCopyLinkHandler(element: HTMLElement): void {
	const copyButton = element.querySelector<HTMLButtonElement>("#copy-link-btn");
	if (!copyButton) return;
	copyButton.addEventListener("click", () => {
		const url = window.location.origin + copyButton.dataset.href;
		navigator.clipboard.writeText(url).then(() => {
			copyButton.textContent = "Copied!";
			copyButton.classList.add("copy-link-btn--copied");
			setTimeout(() => {
				copyButton.textContent = "Copy link";
				copyButton.classList.remove("copy-link-btn--copied");
			}, 1500);
		});
	});
}
