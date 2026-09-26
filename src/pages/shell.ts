import { escHtml } from "../utils";
import { formatLongDate } from "../date-utils";
import { SITE_NAME } from "../routes";
import { basePath } from "../base-path";
import { Page, pageTitle } from "./page";
import { buildLandingHtml } from "./landing";
import { buildCreditsHtml } from "./credits";
import { buildDetailHtml } from "./detail";
import { buildCollectionHtml } from "./collection";
import { buildCollectionsHtml } from "./collections";
import { buildCorrectionLinkHtml } from "./correction";

/**
 * A whole document: the template in `src/index.html` with a page's head and body filled in.
 *
 * The build writes one of these per address. The template holds everything every page shares —
 * the sidebar, the script and stylesheet, the view containers — and this fills the three things
 * that vary: the title, the head's metadata, and the content of the view that is showing, plus
 * the mount the script and stylesheet are served from. The page's data goes into the head as JSON
 * so the app can pick the page up where the build left it without fetching the archive first.
 */

export const VIEWS = ["landing", "results", "detail", "collection", "collections", "credits"] as const;

export const PAGE_DATA_ID = "page-data";

const DEFAULT_DESCRIPTION =
	"Search the complete Calvin and Hobbes archive. Browse every comic strip from 1985 to 1995.";
const DEFAULT_IMAGE = "https://upload.wikimedia.org/wikipedia/commons/9/96/Calvin_and_Hobbes_title.png";

const DESCRIPTION_LENGTH = 200;

export interface DocumentOptions {
	/** The origin the site is served from, or "" when it is not known — then no absolute URLs are written. */
	siteUrl: string;
	/** The address this document is served at, for the canonical link and `og:url`. */
	path: string;
	/** The build this document was written by, which the corrections link reports. */
	commit?: string;
	/** Whether to write the corrections link at all. A fork that wants none sets `CORRECTIONS=false`. */
	corrections?: boolean;
}

/** A transcript is a wall of dialogue; the first sentence or two of it is what a link preview has room for. */
function summarize(text: string): string {
	const collapsed = text.replace(/\s+/g, " ").trim();
	if (collapsed.length <= DESCRIPTION_LENGTH) return collapsed;
	const cut = collapsed.slice(0, DESCRIPTION_LENGTH);
	const lastSpace = cut.lastIndexOf(" ");
	return (lastSpace > DESCRIPTION_LENGTH / 2 ? cut.slice(0, lastSpace) : cut) + "…";
}

function pageDescription(page: Page): string {
	switch (page.view) {
		case "detail": {
			const comic = page.comics[0];
			const lead = `Calvin and Hobbes for ${formatLongDate(page.date)}.`;
			if (page.rerunOf) return `${lead} A rerun of the strip from ${formatLongDate(page.rerunOf)}.`;
			return comic?.transcript ? `${lead} ${summarize(comic.transcript)}` : lead;
		}
		case "collection": {
			const { collection } = page;
			if (!collection) return DEFAULT_DESCRIPTION;
			const note = collection.notes && collection.notes.length > 0 ? ` ${collection.notes[0]}` : "";
			return `${collection.name}, published ${collection.pub_year}. Every Calvin and Hobbes strip it holds, and where to find each one.${note}`;
		}
		case "collections":
			return "Every Calvin and Hobbes book, in the order they were published, and which strips each one holds.";
		default:
			return DEFAULT_DESCRIPTION;
	}
}

/**
 * The strip itself where there is one on disk, so that a shared link previews the comic rather
 * than the logo. An image path is already written from the mount, so it goes on the origin alone.
 */
function pageImage(page: Page, siteUrl: string): string {
	const origin = siteUrl ? new URL(siteUrl).origin : "";
	const own = page.view === "detail" ? page.comics.find((comic) => comic.image)?.image : undefined;
	if (own) return origin + own;
	if (page.view === "collection" && page.collection) return origin + page.collection.image;
	return DEFAULT_IMAGE;
}

/** JSON inside a `<script>` ends at the first `</script`, wherever a transcript puts one. */
function embedJson(value: unknown): string {
	return JSON.stringify(value).replace(/</g, "\\u003c");
}

function buildHeadHtml(page: Page, options: DocumentOptions): string {
	const title = pageTitle(page);
	const description = pageDescription(page);
	const image = pageImage(page, options.siteUrl);
	const url = options.siteUrl ? options.siteUrl + options.path : "";
	const hasOwnImage = image !== DEFAULT_IMAGE;

	const tags = [
		`<meta name="description" content="${escHtml(description)}" />`,
		`<meta property="og:title" content="${escHtml(title)}" />`,
		`<meta property="og:description" content="${escHtml(description)}" />`,
		`<meta property="og:image" content="${escHtml(image)}" />`,
		...(url
			? [`<meta property="og:url" content="${escHtml(url)}" />`, `<link rel="canonical" href="${escHtml(url)}" />`]
			: []),
		`<meta name="twitter:card" content="${hasOwnImage ? "summary_large_image" : "summary"}" />`,
		`<script type="application/json" id="${PAGE_DATA_ID}">${embedJson(page)}</script>`,
	];
	return tags.join("\n\t\t");
}

export function buildViewHtml(page: Page, canGoBack: boolean): string {
	switch (page.view) {
		case "landing":
			return buildLandingHtml();
		case "credits":
			return buildCreditsHtml(canGoBack);
		case "detail":
			return buildDetailHtml(page, canGoBack);
		case "collection":
			return buildCollectionHtml(page, canGoBack);
		case "collections":
			return buildCollectionsHtml(page, canGoBack);
		case "results":
			// The rows are the app's to draw: they depend on the query, and there is no file per query.
			return "";
	}
}

function buildViewsHtml(page: Page): string {
	return VIEWS.map((view) => {
		const active = view === page.view;
		return `<div id="view-${view}" class="view${active ? " active" : ""}">${active ? buildViewHtml(page, false) : ""}</div>`;
	}).join("\n\t\t\t");
}

export function buildDocumentHtml(template: string, page: Page, options: DocumentOptions): string {
	const fields: Record<string, string> = {
		title: escHtml(pageTitle(page)),
		head: buildHeadHtml(page, options),
		views: buildViewsHtml(page),
		base: escHtml(basePath()),
		correction:
			options.corrections === false
				? ""
				: buildCorrectionLinkHtml({
						view: page.view,
						// Without a `SITE_URL` the build has no origin to write; the app fills the real one in.
						url: options.siteUrl + options.path,
						commit: options.commit ?? "unknown",
						rerun: page.view === "detail" && page.rerunOf !== null,
					}),
	};
	return template.replace(/\{\{(\w+)\}\}/g, (token, name: string) => {
		if (!(name in fields)) throw new Error(`Unknown template token ${token} in ${SITE_NAME} page template`);
		return fields[name];
	});
}
