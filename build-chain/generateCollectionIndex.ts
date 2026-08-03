import fs from "fs";
import path from "path";
import yaml from "js-yaml";

type JsonSafe = string | number | boolean | null | JsonSafe[] | { [key: string]: JsonSafe };

function jsonSafe(obj: unknown): JsonSafe {
	if (obj instanceof Date) return obj.toISOString();
	if (typeof obj === "object" && obj !== null && !Array.isArray(obj)) {
		const result: Record<string, JsonSafe> = {};
		for (const [k, v] of Object.entries(obj)) {
			result[String(k)] = jsonSafe(v);
		}
		return result;
	}
	if (Array.isArray(obj)) return obj.map(jsonSafe);
	return obj as JsonSafe;
}

interface Collection {
	id: string;
	dailies: string[];
	alterations: Record<string, unknown>;
	specials: Record<string, unknown>;
	extras?: unknown[];
	aspectRatio?: number;
	[key: string]: unknown;
}

function loadCollections(collectionsDir: string): Collection[] {
	const collections: Collection[] = [];
	for (const yf of fs.readdirSync(collectionsDir).sort()) {
		if (!yf.endsWith(".yaml")) continue;
		const filePath = path.join(collectionsDir, yf);
		let data = yaml.load(fs.readFileSync(filePath, "utf-8")) as Record<string, unknown>;
		data = jsonSafe(data) as Record<string, unknown>;
		const collection: Collection = data as unknown as Collection;
		collection.dailies = (collection.dailies || []).map(String);
		collection.alterations = Object.fromEntries(
			Object.entries(collection.alterations || {}).map(([k, v]) => [String(k), v]),
		);
		collection.specials = Object.fromEntries(Object.entries(collection.specials || {}).map(([k, v]) => [String(k), v]));
		if (data["aspect-ratio"] !== undefined) {
			collection.aspectRatio = data["aspect-ratio"] as number;
			delete collection["aspect-ratio"];
		}
		collections.push(collection);
	}
	return collections;
}

export function generateCollectionIndex(projectDir: string): string {
	const collectionsDir = path.join(projectDir, "collections");
	const raw = loadCollections(collectionsDir);

	const sorted = [...raw].sort((a, b) => {
		const aid = a.id;
		const bid = b.id;
		const aIsBook = aid.startsWith("book") && /^\d+$/.test(aid.slice(4));
		const bIsBook = bid.startsWith("book") && /^\d+$/.test(bid.slice(4));
		if (aIsBook && bIsBook) return parseInt(aid.slice(4)) - parseInt(bid.slice(4));
		if (aIsBook) return -1;
		if (bIsBook) return 1;
		return aid.localeCompare(bid);
	});

	const collectionExtras: Record<string, unknown[]> = {};
	for (const c of sorted) {
		if (c.extras && c.extras.length) {
			collectionExtras[c.id] = c.extras;
		}
	}

	const index = {
		collections: sorted.map(({ extras: _, ...rest }) => rest),
		collection_extras: collectionExtras,
	};

	return JSON.stringify(index);
}
