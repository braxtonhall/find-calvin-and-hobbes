import { CollectionData } from "./collectionPages";

export function generateCollectionIndex(collectionData: CollectionData): string {
	const collectionExtras: Record<string, unknown[]> = {};
	const collections = [];

	for (const source of collectionData.sources) {
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
