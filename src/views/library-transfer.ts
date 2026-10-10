import { basePath } from "../base-path";
import { handleRoute } from "../router";
import { escHtml } from "../utils";
import { holdLibrary, readLibrary, replaceLibrary } from "../ownership";
import { flashButton } from "./copy-link";
import { isLibraryEmpty, libraryFile, libraryFileName, mergeLibraries, parseLibraryFile } from "../library-file";

/** The site this page is served from, mount and all: what an export says it came from. */
function thisSite(): string {
	return window.location.origin + basePath();
}

/**
 * Asks the reader to choose, in a modal over the page: the label of the button they chose, or
 * `null` when they backed out of it — with Escape, or the last button, which is always the way out.
 */
export function ask(message: string, choices: string[]): Promise<string | null> {
	const dialog = document.createElement("dialog");
	dialog.className = "library-dialog";
	dialog.innerHTML = `<p class="library-dialog__message">${message}</p>
		<form method="dialog" class="detail-actions library-dialog__choices">${choices
			.map((choice) => `<button class="copy-link-btn" value="${escHtml(choice)}">${escHtml(choice)}</button>`)
			.join("")}</form>`;
	// Escape closes the dialog, and is kept from the page, where it would also go home.
	dialog.addEventListener("keydown", (event) => {
		if (event.key === "Escape") event.stopPropagation();
	});
	document.body.appendChild(dialog);
	return new Promise((resolve) => {
		dialog.addEventListener("close", () => {
			const chosen = dialog.returnValue;
			dialog.remove();
			resolve(chosen && chosen !== choices[choices.length - 1] ? chosen : null);
		});
		dialog.showModal();
	});
}

function download(name: string, contents: string): void {
	const url = URL.createObjectURL(new Blob([contents], { type: "application/json" }));
	const link = document.createElement("a");
	link.href = url;
	link.download = name;
	document.body.appendChild(link);
	link.click();
	link.remove();
	URL.revokeObjectURL(url);
}

const OVERWRITE = "Overwrite";
const MERGE = "Merge";
const CANCEL = "Cancel";

/**
 * Reads a file into the library. A file from another site has to be confirmed first, since its
 * ids may be another archive's; a library that already has something in it asks whether to
 * overwrite it or merge the file into it; an empty one just takes the file. Settles with whether
 * it was imported, and anything else to tell the reader.
 */
async function importLibrary(file: File): Promise<{ imported: boolean; message: string }> {
	const parsed = parseLibraryFile(await file.text());
	if (!parsed.ok) return { imported: false, message: parsed.error };

	if (parsed.site !== thisSite()) {
		const from = parsed.site
			? `This file was exported from <strong>${escHtml(parsed.site)}</strong>, not this site.`
			: "This file doesn't say which site it was exported from.";
		const sure = await ask(`${from} It may be for a different archive. Import it anyway?`, [
			"I'm sure, import it",
			CANCEL,
		]);
		if (!sure) return { imported: false, message: "" };
	}

	const current = await readLibrary();
	let data = parsed.data;
	if (!isLibraryEmpty(current)) {
		const choice = await ask(
			"Your library already has bookmarks, owned strips or books, or notes. Overwrite it with this file, or merge the file into it?",
			[OVERWRITE, MERGE, CANCEL],
		);
		if (!choice) return { imported: false, message: "" };
		if (choice === MERGE) data = mergeLibraries(current, parsed.data);
	}

	await replaceLibrary(data);
	holdLibrary(data);
	const skipped =
		parsed.skipped > 0 ? `Skipped ${parsed.skipped} entr${parsed.skipped === 1 ? "y" : "ies"} it couldn't read.` : "";
	return { imported: true, message: skipped };
}

/** Wires the Settings page's Export and Import buttons — see `buildSettingsHtml`. */
export function attachLibraryTransferHandlers(element: HTMLElement): void {
	const status = element.querySelector<HTMLElement>(".library-transfer__status")!;
	const input = element.querySelector<HTMLInputElement>("#library-import-file")!;

	element.querySelector("#library-export-btn")!.addEventListener("click", () => {
		status.textContent = "";
		readLibrary()
			.then((data) => {
				const contents = JSON.stringify(libraryFile(data, thisSite()), null, "\t");
				download(libraryFileName(window.location.hostname, new Date()), contents);
			})
			.catch(() => {
				status.textContent = "Couldn't read your library from this browser.";
			});
	});

	const importButton = element.querySelector<HTMLButtonElement>("#library-import-btn")!;
	importButton.addEventListener("click", () => input.click());

	input.addEventListener("change", () => {
		const file = input.files?.[0];
		// Cleared, so choosing the same file again is still a change.
		input.value = "";
		if (!file) return;
		status.textContent = "";
		importLibrary(file)
			.then(({ imported, message }) => {
				// The grid drawn again with the bookmarks as they now are. The page itself stays, buttons,
				// status line and all.
				handleRoute();
				const button = document.querySelector<HTMLButtonElement>("#library-import-btn") ?? importButton;
				if (imported) flashButton(button);
				const line = document.querySelector<HTMLElement>(".library-transfer__status") ?? status;
				line.textContent = message;
			})
			.catch(() => {
				status.textContent = "Couldn't save the file to your library in this browser.";
			});
	});
}
