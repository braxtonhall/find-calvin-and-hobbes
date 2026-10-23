import { state } from "../state";
import { attachBackAndHomeHandlers } from "./nav-buttons";
import { attachCopyLinkHandler } from "./copy-link";
import type { ResultRow } from "../pages/result-rows";
import { attachRowFocusHandler, attachRowHandlers, drawRows } from "./result-rows";

/** The pages whose rows' focus is already handled: each element is drawn into again and again. */
const rowFocusAttached = new WeakSet<HTMLElement>();

/**
 * Draws a subject's page or a character's — `html`, drawn without its rows, which are drawn from
 * `strips` a batch at a time; or with none, takes over the one the build drew, rows and all — and
 * attaches its handlers. The grid shows `dates` while it is open, as an arc's page shows the arc,
 * and those ship in the script, so a cold load lights them before the archive has arrived.
 */
export function renderStripSet(
	element: HTMLElement,
	html: string | null,
	dates: ReadonlySet<string>,
	strips: readonly ResultRow[],
): void {
	state.collectionDateSet = new Set(dates);
	if (html !== null) element.innerHTML = html;
	attachBackAndHomeHandlers(element);
	attachCopyLinkHandler(element);

	const list = element.querySelector<HTMLElement>(".arc-strips");
	if (list && html !== null) drawRows(list, strips, "");
	else if (list) attachRowHandlers(list);
	if (!rowFocusAttached.has(element)) {
		attachRowFocusHandler(element);
		rowFocusAttached.add(element);
	}
}
