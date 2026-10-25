import type { CloudSaveChoice, CloudStatus } from "../cloud-sync";
import { cloudSavesOn, describeSummary, loadCloudSync } from "../cloud-saves";
import { escHtml } from "../utils";
import { ask } from "./library-transfer";

const CREATE = "Create new cloud save";
const JOIN = "I already have a cloud save";
const DISABLE = "Disable";

/**
 * How cloud saves that are on stand: the light beside the heading, and what it says to a pointer on
 * it — all the section says of them, under a description that stays the same either way.
 */
function describeStatus(status: CloudStatus): { light: string; label: string } {
	if (status.identity === "needs-sign-in") {
		return { light: "paused", label: "Signed out from another browser: sign in again to carry on" };
	}
	switch (status.sync) {
		case "synced":
			return { light: "synced", label: "Saved to the cloud" };
		case "connecting":
			return { light: "connecting", label: "Connecting…" };
		case "offline":
			return { light: "offline", label: "Offline: changes are kept here until it's back" };
		case "stopped":
			return { light: "paused", label: "Syncing stopped: disable, then enable again" };
		case "local":
			return { light: "paused", label: "Cloud save gone: disable, then enable again" };
	}
}

/** What to say of a passkey prompt, or a service, that came to nothing. */
function describeFailure(error: unknown): string {
	const names = [error, (error as { cause?: unknown } | null)?.cause].map(
		(e) => (e as { name?: unknown } | null)?.name,
	);
	if (names.includes("NotAllowedError") || names.includes("AbortError")) return "No passkey was used.";
	return "Couldn't reach the cloud saves. Try again in a while.";
}

/**
 * Which cloud save to take, in a modal over the page: each by what it holds, the most recently used
 * first. Settles with its id, or `null` when the reader backed out.
 */
function chooseCloudSave(saves: CloudSaveChoice[]): Promise<string | null> {
	const dialog = document.createElement("dialog");
	dialog.className = "library-dialog cloud-saves-dialog";
	const choices = saves
		.map((save) => {
			const used = new Date(save.lastUsedAt).toLocaleDateString("en-US", { dateStyle: "medium" });
			return `<button class="copy-link-btn cloud-saves-choice" value="${escHtml(save.id)}">${escHtml(describeSummary(save.summary))}<span class="cloud-saves-choice__used">Last used ${escHtml(used)}</span></button>`;
		})
		.join("");
	dialog.innerHTML = `<p class="library-dialog__message">That passkey has ${saves.length} cloud saves. Which should this browser use? Your library here is merged into it.</p>
		<form method="dialog">
			<div class="cloud-saves-choices">${choices}</div>
			<div class="detail-actions library-dialog__choices"><button class="copy-link-btn" value="">Cancel</button></div>
		</form>`;
	// Escape closes the dialog, and is kept from the page, where it would also go home.
	dialog.addEventListener("keydown", (event) => {
		if (event.key === "Escape") event.stopPropagation();
	});
	document.body.appendChild(dialog);
	return new Promise((resolve) => {
		dialog.addEventListener("close", () => {
			dialog.remove();
			resolve(dialog.returnValue || null);
		});
		dialog.showModal();
	});
}

/**
 * Wires the Settings page's Cloud Saves section, where the site has one — see `buildSettingsHtml`.
 * Off, it offers Enable; on, it says how they stand, with Disable, and Sign in again when this
 * browser was signed out.
 */
export function attachCloudSavesHandlers(element: HTMLElement): void {
	const section = element.querySelector<HTMLElement>(".cloud-saves");
	if (!section) return;
	const light = section.querySelector<HTMLElement>(".cloud-saves__light")!;
	const line = section.querySelector<HTMLElement>(".cloud-saves__status")!;
	// One button, Enable or Disable, as wide as the wider of the two, so it never moves between them.
	const toggle = section.querySelector<HTMLButtonElement>("#cloud-saves-toggle-btn")!;
	const signIn = section.querySelector<HTMLButtonElement>("#cloud-saves-sign-in-btn")!;
	const buttons = [toggle, signIn];

	const showOn = (on: boolean) => {
		section.classList.toggle("cloud-saves--on", on);
		toggle.setAttribute("aria-label", on ? DISABLE : "Enable");
	};

	let busy = false;
	const show = (status: CloudStatus) => {
		showOn(status.on);
		signIn.hidden = !status.on || status.identity !== "needs-sign-in";
		const described = status.on ? describeStatus(status) : null;
		light.hidden = !described;
		light.dataset.light = described?.light ?? "";
		light.dataset.label = described?.label ?? "";
		light.setAttribute("aria-label", described?.label ?? "");
		if (!busy) line.textContent = status.problem ?? "";
	};

	let stop: (() => void) | null = null;
	const watch = (sync: typeof import("../cloud-sync")) => {
		stop?.();
		stop = sync.watchCloudStatus((status) => {
			// The page was drawn again, and this section with it.
			if (!section.isConnected) {
				stop?.();
				return;
			}
			show(status);
		});
	};

	// Said at once, as far as it is known before the client is fetched, so nothing moves once it is.
	if (cloudSavesOn()) {
		showOn(true);
		light.hidden = false;
		light.dataset.light = "connecting";
		light.dataset.label = "Connecting…";
		light.setAttribute("aria-label", "Connecting…");
		loadCloudSync()
			.then(watch)
			.catch(() => {
				line.textContent = "Couldn't load the cloud saves.";
			});
	}

	/** Runs one of the section's actions, with its buttons held still and a word of what it waits on. */
	const run = async (waiting: string, action: (sync: typeof import("../cloud-sync")) => Promise<void>) => {
		busy = true;
		buttons.forEach((button) => (button.disabled = true));
		line.textContent = waiting;
		let message = "";
		try {
			const sync = await loadCloudSync();
			watch(sync);
			await action(sync);
		} catch (error) {
			message = describeFailure(error);
		} finally {
			busy = false;
			buttons.forEach((button) => (button.disabled = false));
			line.textContent = message;
		}
	};

	/** Signs in with a passkey made before, and picks a cloud save where it has more than one. */
	const join = async (sync: typeof import("../cloud-sync")) => {
		const outcome = await sync.joinCloudSave();
		if (outcome.kind === "joined") return;
		line.textContent = "";
		const id = await chooseCloudSave(outcome.saves);
		if (id) await sync.pickCloudSave(id);
		else await sync.cancelJoin();
	};

	const enable = async () => {
		const choice = await ask(
			"Save your library to the cloud? Make a new cloud save of what's in this browser, or sign in to one you made in another browser — this browser's library is merged into it.",
			[CREATE, JOIN, "Cancel"],
		);
		if (!choice) return;
		await run("Waiting for your passkey…", (sync) => (choice === CREATE ? sync.createCloudSave() : join(sync)));
	};

	const disable = async () => {
		const sure = await ask(
			"Stop saving to the cloud in this browser? Your library stays here, and your cloud save keeps what it has.",
			[DISABLE, "Cancel"],
		);
		if (sure !== DISABLE) return;
		await run("", (sync) => sync.disableCloudSaves());
	};

	toggle.addEventListener("click", () => (section.classList.contains("cloud-saves--on") ? disable() : enable()));
	signIn.addEventListener("click", () => run("Waiting for your passkey…", join));
}
