import { Collection, Comic, CollectionIndex, Day, SortMode } from "../types";
import { SITE_NAME } from "../routes";

/**
 * What a page is made of, as plain data.
 *
 * A page is built from one of these and nothing else — not from `state`, not from `location` —
 * which is what lets the build write the same page the app would draw. The build computes a
 * `Page` from the archive on disk and embeds it in the file it writes; the app computes one from
 * the data it has fetched, or reads the embedded one back on a cold load and adopts the markup
 * that was already built from it.
 */

export interface LandingPage {
	view: "landing";
}

export interface CreditsPage {
	view: "credits";
}

/** Never prerendered — the rows depend on the query — but the title comes from here like the rest. */
export interface ResultsPage {
	view: "results";
	q: string;
	sort: SortMode;
}

/**
 * The slice of a collection a strip's page needs: enough to draw its cover and its tooltip. The
 * alterations are only the ones for the strips on the page, since the full map on a compendium
 * would be repeated on every strip it holds.
 */
export type DetailCollection = Pick<
	Collection,
	"id" | "name" | "pub_year" | "image" | "colour" | "aspectRatio" | "editions" | "alterations"
>;

export interface DetailPage {
	view: "detail";
	date: string;
	/** Compact dates whose alternate transcript is shown first — the `?alternate=` parameter. */
	alternates: string[];
	comics: Comic[];
	/** The date of the strip that ran again on this one, when this is a rerun day and holds no strip of its own. */
	rerunOf: string | null;
	prevDate: string | null;
	nextDate: string | null;
	collections: DetailCollection[];
	/** By comic key; `null` while the descriptions are still on their way, which draws a skeleton. */
	descriptions: Record<string, string> | null;
}

export interface CollectionPage {
	view: "collection";
	id: string;
	/** `null` when the id names no book. */
	collection: Collection | null;
	indexLoaded: boolean;
	extras: string[];
	/** The strips the book holds, which is what the grid highlights. */
	dates: string[];
}

export type Page = LandingPage | CreditsPage | ResultsPage | DetailPage | CollectionPage;

/**
 * Where a page's data comes from. The app's `state` is one of these; the build assembles another
 * from the archive on disk.
 */
export interface PageSource {
	comicsByDate: Map<string, Comic[]>;
	/** Rerun date to the date of the strip it reran. */
	reruns: Map<string, string>;
	allDays: Day[];
	collectionIndex: CollectionIndex | null;
	collectionsById: Map<string, Collection> | null;
	descriptions: Map<string, string> | null;
}

export function pageTitle(page: Page): string {
	switch (page.view) {
		case "landing":
			return SITE_NAME;
		case "results":
			return `${page.q || "Search"} — ${SITE_NAME}`;
		case "detail":
			return `${page.date} — ${SITE_NAME}`;
		case "collection":
			return `${page.collection?.name ?? "Collection not found"} — ${SITE_NAME}`;
		case "credits":
			return `Credits — ${SITE_NAME}`;
	}
}
