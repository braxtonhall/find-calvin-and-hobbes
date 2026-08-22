import { CollectionData } from "./collectionPages";

/**
 * The books, as the site reads them.
 *
 * A collection no strip appears in does not go in. It could only ever produce a page saying its
 * strip list is not indexed, and — since the search box grew an `@in:` filter — a value the menu
 * would offer and then answer with nothing. So the invariant is structural rather than hoped for:
 * every collection in this file holds at least one comic.
 *
 * Membership is read off `appearancesByComic`, which is the same map `exportComicsJson` writes into
 * `comics.json`, so the index and the strips agree by construction. Deliberately not off the
 * `dailies` ranges: `loadCollectionData` falls back to a hand-written `dailies:` list where a
 * collection has no page index, and a book with a range but no appearances is precisely the one
 * `@in:` must not offer.
 */
export function generateCollectionIndex(collectionData: CollectionData): string {
	const collectionExtras: Record<string, unknown[]> = {};
	const collections = [];

	const printed = new Set<string>();
	for (const appearances of collectionData.appearancesByComic.values()) {
		for (const appearance of appearances) printed.add(appearance.collection);
	}

	for (const source of collectionData.sources) {
		// Both the entry and its extras are written below, so one `continue` drops the pair and there
		// is no second place for a stale key to survive in.
		if (!printed.has(source.id)) continue;

		const { extras, pages: _pages, editions, dailies: _dailies, specials: _specials, ...rest } = source;

		if (extras && extras.length) {
			collectionExtras[source.id] = extras;
		}

		const collection: Record<string, unknown> = {
			...rest,
			dailies: collectionData.rangesById.get(source.id) || [],
			specials: collectionData.specialsById.get(source.id) || {},
			alterations: Object.fromEntries(
				Object.entries((source.alterations as Record<string, unknown>) || {}).map(([k, v]) => [String(k), v]),
			),
		};

		if (editions) {
			collection.editions = Object.fromEntries(
				Object.entries(editions).map(([name, { volumes: _volumes, ...meta }]) => [name, meta]),
			);
		}

		collections.push(collection);
	}

	return JSON.stringify({ collections, collection_extras: collectionExtras });
}
