import { Route } from "../types";
import { buildCorrectionUrl, showsCorrection } from "../pages/correction";

/**
 * Keeps the corrections link on the page that is showing.
 *
 * The link is chrome — written once, outside the views, so nothing re-renders it — which means the
 * address it carries is whichever one the build wrote until this replaces it. That is also where
 * the origin comes from: a build with no `SITE_URL` has none to write, so the form would otherwise
 * be told a path with no site. Hiding is instant and showing fades, which is what the views do.
 */
export function updateCorrectionLink(view: Route["view"], rerun: boolean): void {
	const link = document.querySelector<HTMLAnchorElement>("#correction-link");
	// Absent when the build was made with `CORRECTIONS=false`.
	if (!link) return;

	const shows = showsCorrection(view);
	link.hidden = !shows;
	if (shows) {
		link.href = buildCorrectionUrl({ view, url: location.href, commit: link.dataset.commit ?? "unknown", rerun });
	}
}
