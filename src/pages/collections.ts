import { escHtml } from "../utils";
import { srcsetAttributes } from "../srcset";
import { PAGE_CONFIG } from "../site-config";
import { CollectionsTab, buildCollectionPath, buildTabPath } from "../routes";
import { addressOf } from "../base-path";
import { CollectionsPage, CollectionSummary, PageSource } from "./page";
import { buildBackAndHomeButtons } from "./nav-buttons";
import { formatPublicationDate } from "./collection";

/**
 * Every book, in the order the index already holds them — publication order, which is fixed when
 * the build writes the index. See `sortCollections` in `build-chain/collectionPages.ts`.
 */
export function collectionsPageFrom(source: PageSource, q?: string): CollectionsPage {
	const collections = (source.collectionIndex?.collections ?? []).map((collection): CollectionSummary => ({
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
	return { view: "collections", collections, ...(q === undefined ? {} : { q }) };
}

/** `data-collection-id` is what the view reads to light up the book's strips while the row is hovered. */
function buildRowHtml(collection: CollectionSummary): string {
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

// Drawn in the same idiom as the results-bar icons: 16px, stroked in `currentColor`, no fill.
const SEARCH_ICON = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" aria-hidden="true">
	<circle cx="6.8" cy="6.8" r="4.3" /><path d="M10 10l3.5 3.5" />
</svg>`;

/** What a tab's search box holds: nothing while it is closed, which is how every page is built. */
export type TabQuery = string | undefined;

/** The noun a tab lists, for its search box and for a search that finds none of them. */
export const TAB_NOUNS: Record<CollectionsTab, string> = { books: "books", arcs: "arcs", creators: "creators" };

/**
 * The search box, open — see `views/tab-search.ts` for what it does. Built as the search page's is,
 * with its × to close it, and with no sort and no filter bar: a tab keeps its own order, and the
 * menu is how its filters are found.
 */
function buildTabSearchHtml(current: CollectionsTab, query: string): string {
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
			<button class="results-clear collections-search-close" aria-label="Close search">&times;</button>
		</div>
	</div>`;
}

/**
 * Collections is books, arcs and creators, each a collection of strips, and each tab has an address
 * of its own. The tab showing is plain bold text; the others are links, quiet the way the home
 * page's are. A site without arcs or creators has only the tabs it has, and with only the books, no
 * tabs at all — but the search button all the same, at the end of the row the tabs would be in.
 *
 * With the search open, each tab's link keeps it open on the same query, so switching tabs asks the
 * same question of another kind of collection.
 */
export function buildCollectionsHeaderHtml(current: CollectionsTab, canGoBack: boolean, query?: TabQuery): string {
	const tab = (name: CollectionsTab, label: string) =>
		name === current
			? `<span class="collections-tab collections-tab--current" aria-current="page">${label}</span>`
			: `<a class="collections-tab" data-tab="${name}" href="${escHtml(addressOf(buildTabPath(name, query)))}">${label}</a>`;
	const heading = `${buildBackAndHomeButtons(canGoBack)}
		<h2 class="collections-heading">Collections</h2>`;
	const tabs = [
		tab("books", "Books"),
		...(PAGE_CONFIG.arcs ? [tab("arcs", "Arcs")] : []),
		...(PAGE_CONFIG.creators ? [tab("creators", "Creators")] : []),
	];
	const open = query !== undefined;
	const toggle = `<button class="results-sort collections-search-toggle" title="Search ${TAB_NOUNS[current]}" aria-label="Search ${TAB_NOUNS[current]}" aria-pressed="${open}">${SEARCH_ICON}</button>`;
	return `${heading}
		<div class="collections-toolbar">
			${tabs.length > 1 ? `<nav class="collections-tabs" aria-label="Collections">${tabs.join(`\n\t\t\t<span aria-hidden="true">·</span>\n\t\t\t`)}</nav>` : ""}
			${toggle}
		</div>
		${open ? buildTabSearchHtml(current, query) : ""}`;
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
			${shown.map(buildRowHtml).join("")}
		</div>`;
}

export function buildCollectionsHtml(
	page: CollectionsPage,
	canGoBack: boolean,
	ids: ReadonlySet<string> | null = null,
): string {
	return `<div class="collections-container">
		${buildCollectionsHeaderHtml("books", canGoBack, page.q)}
		<div class="collections-body">${buildCollectionsBodyHtml(page, ids)}</div>
	</div>`;
}
