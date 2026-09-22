import { escHtml } from "../utils";
import { Page } from "./page";

/**
 * The corrections form, and the link every page that holds something correctable carries to it.
 *
 * One form serves every deployment — a fork's corrections arrive in the same place as this site's —
 * which is why its address is written here rather than configured. A fork that wants no part of it
 * sets `CORRECTIONS=false` and the link is never written. See `build-chain/siteConfig.ts`.
 */

const FORM_URL = "https://docs.google.com/forms/d/e/1FAIpQLSdlFXnwd3p8fJjuZg91WKNVGMwoTYHvrg-mZJj4VFpcF3nq8w/viewform";

/** The form prefills by field id, and these are that form's own. */
const KIND_FIELD = "entry.762468410";
const URL_FIELD = "entry.1138251038";
const SITE_FIELD = "entry.2127852102";
const COMMIT_FIELD = "entry.46703544";

/** Landing and search hold nothing of the archive to be wrong; every other page is about something. */
export function showsCorrection(view: Page["view"]): boolean {
	return view !== "landing" && view !== "results";
}

/**
 * The box the form opens with checked, which is what the page is about. Credits is about the site
 * rather than the archive, so it checks nothing and the reader says what they mean.
 */
export function correctionKind(view: Page["view"]): string | null {
	switch (view) {
		case "detail":
			return "Comic";
		case "collection":
			return "Collection";
		default:
			return null;
	}
}

/** The origin on its own, which the form keeps in its own column. "" when the address has none. */
function originOf(url: string): string {
	try {
		return new URL(url).origin;
	} catch {
		return "";
	}
}

export interface CorrectionContext {
	view: Page["view"];
	/** The whole address of the page this is about — its path alone, when the build has no origin to write. */
	url: string;
	/** The build this was reported from, so a correction can be read against the archive it was made from. */
	commit: string;
}

export function buildCorrectionUrl({ view, url, commit }: CorrectionContext): string {
	const parameters = new URLSearchParams({ usp: "pp_url" });
	const kind = correctionKind(view);
	if (kind) parameters.set(KIND_FIELD, kind);
	parameters.set(URL_FIELD, url);
	parameters.set(SITE_FIELD, originOf(url));
	parameters.set(COMMIT_FIELD, commit);
	return `${FORM_URL}?${parameters}`;
}

const PENCIL = `<svg class="correction-icon" viewBox="0 0 24 24" width="10" height="10" aria-hidden="true"><path d="M4 20h4L19 9a2.83 2.83 0 0 0-4-4L4 16v4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

/**
 * Written once per document, outside the views, so it survives every navigation — which is why it
 * is written even where it does not show, and hidden there instead. `updateCorrectionLink` in
 * `src/views/correction.ts` is what moves it from page to page after that.
 */
export function buildCorrectionLinkHtml(context: CorrectionContext): string {
	const hidden = showsCorrection(context.view) ? "" : " hidden";
	const href = escHtml(buildCorrectionUrl(context));
	return `<a class="correction-link" id="correction-link" href="${href}" data-commit="${escHtml(context.commit)}" target="_blank" rel="noopener"${hidden}>${PENCIL}Submit a correction</a>`;
}
