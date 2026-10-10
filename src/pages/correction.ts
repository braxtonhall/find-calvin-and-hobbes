import { escHtml } from "../utils";
import { PAGE_CONFIG, CorrectionTemplates } from "../site-config";
import { CorrectionPage, CorrectionSubject, correctionUrl } from "../correction-links";
import { Page } from "./page";

/**
 * The link every page whose kind has a corrections template carries to the form. Which form that
 * is, and what it opens with, is `config.yaml`'s — see `src/correction-links.ts`. A build made with
 * `CORRECTIONS=false` has no templates, and the link is never written.
 */

/**
 * A page's kind, as `config.yaml` names it. A strip's page is a rerun's when its day reran an earlier
 * strip. `null` for the reader's own lists, which hold nothing of the archive's to correct.
 */
export function correctionPage(view: Page["view"], rerun: boolean): CorrectionPage | null {
	switch (view) {
		case "landing":
			return "home";
		case "results":
			return "search";
		case "detail":
			return rerun ? "rerun" : "strip";
		case "collection":
			return "book";
		case "collections":
			return "books";
		case "bookmarks":
		case "bookshelf":
			return null;
		default:
			return view;
	}
}

export interface CorrectionContext extends CorrectionSubject {
	view: Page["view"];
	/** Whether the page is a rerun day's, which has a template of its own. */
	rerun?: boolean;
}

export function buildCorrectionUrl(
	{ view, rerun = false, ...subject }: CorrectionContext,
	templates: CorrectionTemplates = PAGE_CONFIG.corrections,
): string | null {
	return correctionUrl(templates, correctionPage(view, rerun), subject);
}

const PENCIL = `<svg class="correction-icon" viewBox="0 0 24 24" width="10" height="10" aria-hidden="true"><path d="M4 20h4L19 9a2.83 2.83 0 0 0-4-4L4 16v4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

/**
 * Written once per document, outside the views, so it survives every navigation — which is why it
 * is written even where it does not show, and hidden there instead. `updateCorrectionLink` in
 * `src/views/correction.ts` is what moves it from page to page after that. "" for a build with no
 * templates, which leaves it out of every page rather than hiding it.
 */
export function buildCorrectionLinkHtml(
	context: CorrectionContext,
	templates: CorrectionTemplates = PAGE_CONFIG.corrections,
): string {
	if (Object.keys(templates).length === 0) return "";
	const url = buildCorrectionUrl(context, templates);
	const href = url === null ? "" : ` href="${escHtml(url)}"`;
	const hidden = url === null ? " hidden" : "";
	return `<a class="correction-link" id="correction-link"${href} data-commit="${escHtml(context.commit)}" target="_blank" rel="noopener"${hidden}>${PENCIL}Submit a correction</a>`;
}
