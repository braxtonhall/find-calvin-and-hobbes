import { escHtml } from "../utils";
import { PAGE_CONFIG } from "../site-config";
import { ARCS_PATH, BOOKS_PATH, CREATORS_PATH, buildCollectionPath } from "../routes";
import { addressOf } from "../base-path";
import { CollectionsPage, CollectionSummary, PageSource } from "./page";
import { buildBackAndHomeButtons } from "./nav-buttons";
import { formatPublicationDate } from "./collection";

/**
 * Every book, in the order the index already holds them — publication order, which is fixed when
 * the build writes the index. See `sortCollections` in `build-chain/collectionPages.ts`.
 */
export function collectionsPageFrom(source: PageSource): CollectionsPage {
	const collections = (source.collectionIndex?.collections ?? []).map((collection): CollectionSummary => ({
		id: collection.id,
		name: collection.name,
		...(collection.subtitle ? { subtitle: collection.subtitle } : {}),
		pub_year: collection.pub_year,
		pub_month: collection.pub_month,
		...(collection.pub_day ? { pub_day: collection.pub_day } : {}),
		image: collection.image,
		dailies: collection.dailies,
		...(collection.sundays ? { sundays: collection.sundays } : {}),
	}));
	return { view: "collections", collections };
}

/** `data-collection-id` is what the view reads to light up the book's strips while the row is hovered. */
function buildRowHtml(collection: CollectionSummary): string {
	return `<a class="collections-row" href="${escHtml(addressOf(buildCollectionPath(collection.id)))}" data-collection-id="${escHtml(collection.id)}">
			<div class="collections-cover">
				<img src="${escHtml(collection.image)}" alt="" loading="lazy" />
			</div>
			<div class="collections-info">
				<div class="collections-name">${escHtml(collection.name)}</div>
				<div class="collections-meta">${collection.subtitle ? `${escHtml(collection.subtitle)} · ` : ""}${formatPublicationDate(collection)}</div>
			</div>
		</a>`;
}

export type CollectionsTab = "books" | "arcs" | "creators";

/**
 * Collections is books, arcs and creators, each a collection of strips, and each tab has an address
 * of its own. The tab showing is plain bold text; the others are links, quiet the way the home
 * page's are. A site without arcs or creators has only the tabs it has, and with only the books, no
 * tabs at all.
 */
export function buildCollectionsHeaderHtml(current: CollectionsTab, canGoBack: boolean): string {
	const tab = (name: CollectionsTab, label: string, path: string) =>
		name === current
			? `<span class="collections-tab collections-tab--current" aria-current="page">${label}</span>`
			: `<a class="collections-tab" href="${addressOf(path)}">${label}</a>`;
	const heading = `${buildBackAndHomeButtons(canGoBack)}
		<h2 class="collections-heading">Collections</h2>`;
	const tabs = [
		tab("books", "Books", BOOKS_PATH),
		...(PAGE_CONFIG.arcs ? [tab("arcs", "Arcs", ARCS_PATH)] : []),
		...(PAGE_CONFIG.creators ? [tab("creators", "Creators", CREATORS_PATH)] : []),
	];
	if (tabs.length === 1) return heading;
	return `${heading}
		<nav class="collections-tabs" aria-label="Collections">
			${tabs.join(`\n\t\t\t<span aria-hidden="true">·</span>\n\t\t\t`)}
		</nav>`;
}

export function buildCollectionsHtml(page: CollectionsPage, canGoBack: boolean): string {
	return `<div class="collections-container">
		${buildCollectionsHeaderHtml("books", canGoBack)}
		<div class="collections-list">
			${page.collections.map(buildRowHtml).join("")}
		</div>
	</div>`;
}
