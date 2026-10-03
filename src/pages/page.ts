import { Appearance, Arc, Collection, Comic, CollectionIndex, Day, SortMode } from "../types";
import { SITE_NAME } from "../routes";
import { formatDateRange } from "../date-utils";

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
 * Never prerendered either: the bookmarks live in this browser's IndexedDB, so the build has no
 * rows to write, and the page is empty until the app has read them.
 */
export interface LibraryPage {
	view: "library";
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

export interface BookNeighbours {
	prev: string | null;
	next: string | null;
}

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
	/** The days the newspaper ran this page's strip: the original, then each rerun, in order. */
	runs: string[];
	/** The strips either side of each of this page's strips in each book, by `printingKey`. */
	bookNeighbours: Record<string, BookNeighbours>;
	collections: DetailCollection[];
	/** By comic key; `null` while the descriptions are still on their way, which draws a skeleton. */
	descriptions: Record<string, string> | null;
	/** The arcs the page's strip belongs to — on a rerun day, the arcs of the strip it shows. */
	arcs: DetailArc[];
}

/** An arc as a strip's page names it: enough to say which part this is, step along it, and light it up. */
export type DetailArc = Pick<Arc, "id" | "description" | "dates">;

export interface CollectionPage {
	view: "collection";
	id: string;
	/** `null` when the id names no book. */
	collection: Collection | null;
	indexLoaded: boolean;
	extras: string[];
	/** The strips the book holds, which is what the grid highlights. */
	dates: string[];
	/** The books either side of this one in publication order, which the arrows step to. */
	prev: CollectionNeighbour | null;
	next: CollectionNeighbour | null;
	/** The arcs the book prints in full, in the order it prints them. */
	arcs: ArcList;
}

export type CollectionNeighbour = Pick<Collection, "id" | "name">;

/** The slice of an arc a list of arcs needs: its row, and in its dates, the strips it lights in the grid. */
export type ArcSummary = Pick<Arc, "id" | "description" | "dates">;

/**
 * A list of arcs, as `/arcs` and a book's page both draw it.
 *
 * `longest` is the longest arc in the whole archive rather than in the list, so that an arc's length
 * bar is the same width wherever it is drawn.
 */
export interface ArcList {
	arcs: ArcSummary[];
	longest: number;
}

export interface ArcsPage {
	view: "arcs";
	/** Every arc, oldest first. */
	list: ArcList;
}

/** A strip as an arc's page lists it: its date, and what happens in it. */
export interface ArcStrip {
	date: string;
	text: string;
}

/** The arc either side of this one, named by its dates since an arc has no title. */
export interface ArcNeighbour {
	id: string;
	range: string;
}

export interface ArcPage {
	view: "arc";
	id: string;
	/** `null` when the id names no arc. */
	arc: Arc | null;
	arcsLoaded: boolean;
	strips: ArcStrip[];
	/**
	 * Where each book that holds the whole arc prints it: one appearance per volume, with the pages of
	 * all the arc's strips together. A book with several editions is shown in one of them.
	 */
	appearances: Appearance[];
	collections: DetailCollection[];
	prev: ArcNeighbour | null;
	next: ArcNeighbour | null;
}

/**
 * The slice of a book the list of books needs: enough to draw its row, and — in the ranges and
 * `sundays` — enough to light up its strips in the grid without the archive, so a row hovered on a
 * cold load answers before the fetch does. A list of dates per book would say the same thing at
 * many times the size.
 */
export type CollectionSummary = Pick<
	Collection,
	"id" | "name" | "type" | "pub_year" | "pub_month" | "pub_day" | "image" | "dailies" | "sundays"
>;

export interface CollectionsPage {
	view: "collections";
	/** In publication order. */
	collections: CollectionSummary[];
}

export type Page =
	| LandingPage
	| CreditsPage
	| ResultsPage
	| LibraryPage
	| DetailPage
	| CollectionPage
	| CollectionsPage
	| ArcPage
	| ArcsPage;

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
	/** Oldest first; `null` until they have loaded. */
	arcs: Arc[] | null;
	arcsById: Map<string, Arc> | null;
}

/** An arc by its dates: `Nov 18–19, 1985`. */
export function arcRange(arc: Pick<Arc, "dates">, withYear: boolean = true): string {
	return formatDateRange(arc.dates[0], arc.dates[arc.dates.length - 1], withYear);
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
		case "collections":
			return `Books — ${SITE_NAME}`;
		case "arc":
			return `${page.arc ? arcRange(page.arc) : "Arc not found"} — ${SITE_NAME}`;
		case "arcs":
			return `Arcs — ${SITE_NAME}`;
		case "library":
			return page.q ? `${page.q} — Library — ${SITE_NAME}` : `Library — ${SITE_NAME}`;
		case "credits":
			return `Credits — ${SITE_NAME}`;
	}
}
