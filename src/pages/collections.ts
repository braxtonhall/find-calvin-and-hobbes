import { escHtml } from "../utils";
import { srcsetAttributes } from "../srcset";
import { PAGE_CONFIG } from "../site-config";
import { isDateInCollection } from "../date-utils";
import { TabOrder } from "../types";
import { CollectionsTab, buildCollectionPath, buildTabPath } from "../routes";
import { addressOf } from "../base-path";
import { CollectionsPage, CollectionSummary, PageSource } from "./page";
import { buildBackAndHomeButtons } from "./nav-buttons";
import { formatPublicationDate } from "./collection";

/**
 * Most strips first, for a tab the reader has asked to see by count. The sort is stable, so ties keep
 * the tab's own date order.
 */
export function sortedByCount<T>(items: readonly T[], count: (item: T) => number): T[] {
	const counts = new Map(items.map((item) => [item, count(item)]));
	return [...items].sort((a, b) => counts.get(b)! - counts.get(a)!);
}

/** Spread into a tab's page: nothing for date order, which is how the build writes every tab. */
export function orderOf(order: TabOrder | undefined): { order?: "count" } {
	return order === "count" ? { order } : {};
}

/**
 * Every book, in the order the index already holds them — publication order, which is fixed when
 * the build writes the index. See `sortCollections` in `build-chain/collectionPages.ts`. By count,
 * a book's count is the strips its page lists.
 */
export function collectionsPageFrom(source: PageSource, q?: string, order?: TabOrder): CollectionsPage {
	const index = source.collectionIndex?.collections ?? [];
	const books =
		order === "count"
			? sortedByCount(index, (collection) => {
					let strips = 0;
					for (const [date] of source.comicsByDate) if (isDateInCollection(date, collection)) strips++;
					return strips;
				})
			: index;
	const collections = books.map((collection): CollectionSummary => ({
		id: collection.id,
		name: collection.name,
		...(collection.subtitle ? { subtitle: collection.subtitle } : {}),
		pub_year: collection.pub_year,
		pub_month: collection.pub_month,
		...(collection.pub_day ? { pub_day: collection.pub_day } : {}),
		image: collection.image,
		...(collection.aspectRatio !== undefined ? { aspectRatio: collection.aspectRatio } : {}),
		...(collection.width !== undefined ? { width: collection.width } : {}),
		dailies: collection.dailies,
		...(collection.sundays ? { sundays: collection.sundays } : {}),
	}));
	return { view: "collections", collections, ...(q === undefined ? {} : { q }), ...orderOf(order) };
}

/** `data-collection-id` is what the view reads to light up the book's strips while the row is hovered. */
export function buildCollectionRowHtml(collection: CollectionSummary): string {
	// Fitted inside a box fifty-six pixels square, as `.collections-cover` is.
	const width = Math.ceil(Math.min(56, 56 * (collection.aspectRatio ?? 1)));
	const srcset = srcsetAttributes(collection.image, collection.width, `${width}px`);
	return `<a class="collections-row" href="${escHtml(addressOf(buildCollectionPath(collection.id)))}" data-collection-id="${escHtml(collection.id)}">
			<div class="collections-cover">
				<img src="${escHtml(collection.image)}"${srcset} alt="" loading="lazy" />
			</div>
			<div class="collections-info">
				<div class="collections-name">${escHtml(collection.name)}</div>
				<div class="collections-meta">${collection.subtitle ? `${escHtml(collection.subtitle)} · ` : ""}${formatPublicationDate(collection)}</div>
			</div>
		</a>`;
}

export type { CollectionsTab };

/** What a tab's search box holds: nothing, which is how the build writes every tab. */
export type TabQuery = string | undefined;

export const DATE_ICON = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" aria-hidden="true">
	<rect x="2" y="3.5" width="12" height="10" rx="1.5" /><path d="M2 6.5h12M5.5 2v3M10.5 2v3" />
</svg>`;

export const RANK_ICON = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" aria-hidden="true">
	<path d="M3 3v10M3 13l-2-2M3 13l2-2M7.5 4h7M7.5 8h5M7.5 12h3" />
</svg>`;

/**
 * The tab's sort button, as the search page's is: its icon is the order showing, and it flips to the
 * other. The search page's ranked icon is a list longest-first, which is what most strips first is too.
 */
export function tabSortButtonAttributes(order: TabOrder): { icon: string; label: string; pressed: string } {
	return order === "count"
		? { icon: RANK_ICON, label: "Sorted by strip count — click to sort by date", pressed: "true" }
		: { icon: DATE_ICON, label: "Sorted by date — click to sort by strip count", pressed: "false" };
}

/** The noun a tab lists, for its search box and for a search that finds none of them. */
export const TAB_NOUNS: Record<CollectionsTab, string> = {
	books: "books",
	arcs: "arcs",
	creators: "creators",
	subjects: "subjects",
};

/**
 * The search box — see `views/tab-search.ts` for what it does. Built as the search page's is, with
 * its × to empty it and its sort beside it, but with no filter bar: the menu is how a tab's filters
 * are found. The × has nothing to do while the box is empty.
 */
function buildTabSearchHtml(current: CollectionsTab, query: string, order: TabOrder): string {
	const sort = tabSortButtonAttributes(order);
	return `<div class="results-sticky collections-search">
		<div class="results-search-bar">
			<input
				type="text"
				class="results-input collections-search-input"
				placeholder="Search ${TAB_NOUNS[current]}..."
				autocomplete="off"
				enterkeyhint="search"
				value="${escHtml(query)}"
			/>
			<button class="results-clear collections-search-clear" aria-label="Clear search"${query ? "" : " disabled"}>&times;</button>
			<button class="results-sort collections-sort" title="${sort.label}" aria-label="${sort.label}" aria-pressed="${sort.pressed}">${sort.icon}</button>
		</div>
	</div>`;
}

/**
 * Collections is books, arcs, creators and subjects, each a collection of strips, and each tab has an
 * address of its own. The tab showing is plain bold text; the others are links, quiet the way the home
 * page's are. A site without arcs, creators or subjects has only the tabs it has, and with only the books, no
 * tabs at all — but the search box all the same.
 *
 * Each tab's link carries the query and the order, so switching tabs asks the same question of
 * another kind of collection, and lists the answer the same way.
 */
export function buildCollectionsHeaderHtml(
	current: CollectionsTab,
	canGoBack: boolean,
	query?: TabQuery,
	order: TabOrder = "date",
): string {
	const tab = (name: CollectionsTab, label: string) =>
		name === current
			? `<span class="collections-tab collections-tab--current" aria-current="page">${label}</span>`
			: `<a class="collections-tab" data-tab="${name}" href="${escHtml(addressOf(buildTabPath(name, query, order)))}">${label}</a>`;
	const heading = `${buildBackAndHomeButtons(canGoBack)}
		<h2 class="collections-heading">Collections</h2>`;
	const tabs = [
		tab("books", "Books"),
		...(PAGE_CONFIG.arcs ? [tab("arcs", "Arcs")] : []),
		...(PAGE_CONFIG.creators ? [tab("creators", "Creators")] : []),
		...(PAGE_CONFIG.subjects ? [tab("subjects", "Subjects")] : []),
	];
	return `${heading}
		${tabs.length > 1 ? `<nav class="collections-tabs" aria-label="Collections">${tabs.join(`\n\t\t\t<span aria-hidden="true">·</span>\n\t\t\t`)}</nav>` : ""}
		${buildTabSearchHtml(current, query ?? "", order)}`;
}

/** What a search that finds none of a tab's collections says, in place of the list. */
export function buildNoMatchesHtml(current: CollectionsTab): string {
	return `<div class="results-empty">No ${TAB_NOUNS[current]} found</div>`;
}

/** The list of books, narrowed to `ids` where a search has narrowed it. */
export function buildCollectionsBodyHtml(page: CollectionsPage, ids: ReadonlySet<string> | null = null): string {
	const shown = ids === null ? page.collections : page.collections.filter((collection) => ids.has(collection.id));
	if (shown.length === 0 && ids !== null) return buildNoMatchesHtml("books");
	return `<div class="collections-list">
			${shown.map(buildCollectionRowHtml).join("")}
		</div>`;
}

export function buildCollectionsHtml(
	page: CollectionsPage,
	canGoBack: boolean,
	ids: ReadonlySet<string> | null = null,
): string {
	return `<div class="collections-container">
		${buildCollectionsHeaderHtml("books", canGoBack, page.q, page.order)}
		<div class="collections-body">${buildCollectionsBodyHtml(page, ids)}</div>
	</div>`;
}
