import { escHtml } from "../utils";
import { ARCS_PATH, BOOKS_PATH, buildCollectionPath } from "../routes";
import { addressOf } from "../base-path";
import { CollectionsPage, CollectionSummary, PageSource } from "./page";
import { buildBackAndHomeButtons } from "./nav-buttons";
import { formatPublicationDate, getTypeLabel } from "./collection";

/**
 * Every book, in the order the index already holds them — publication order, which is fixed when
 * the build writes the index. See `sortCollections` in `build-chain/collectionPages.ts`.
 */
export function collectionsPageFrom(source: PageSource): CollectionsPage {
	const collections = (source.collectionIndex?.collections ?? []).map((collection): CollectionSummary => ({
		id: collection.id,
		name: collection.name,
		type: collection.type,
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
				<div class="collections-meta">${getTypeLabel(collection.type)} · ${formatPublicationDate(collection)}</div>
			</div>
		</a>`;
}

export type CollectionsTab = "books" | "arcs";

/**
 * Collections is books and arcs, each a collection of strips, and each tab has an address of its
 * own. The tab showing is plain bold text; the other is a link, quiet the way the home page's are.
 */
export function buildCollectionsHeaderHtml(current: CollectionsTab, canGoBack: boolean): string {
	const tab = (name: CollectionsTab, label: string, path: string) =>
		name === current
			? `<span class="collections-tab collections-tab--current" aria-current="page">${label}</span>`
			: `<a class="collections-tab" href="${addressOf(path)}">${label}</a>`;
	return `${buildBackAndHomeButtons(canGoBack)}
		<h2 class="collections-heading">Collections</h2>
		<nav class="collections-tabs" aria-label="Collections">
			${tab("books", "Books", BOOKS_PATH)}
			<span aria-hidden="true">·</span>
			${tab("arcs", "Arcs", ARCS_PATH)}
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
