import { escHtml } from "../utils";
import { buildCollectionPath } from "../routes";
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

export function buildCollectionsHtml(page: CollectionsPage, canGoBack: boolean): string {
	return `<div class="collections-container">
		${buildBackAndHomeButtons(canGoBack)}
		<h2 class="collections-heading">Collections</h2>
		<div class="collections-list">
			${page.collections.map(buildRowHtml).join("")}
		</div>
	</div>`;
}
