import { BOOKS_STORE_NAME, DATABASE_NAME, DATABASE_VERSION, STORE_NAME, STRIPS_STORE_NAME } from "./constants";

/**
 * The reader's library, in this browser's IndexedDB: the bookmarks, keyed by date, and what they own
 * or have noted of strips and books, keyed by id. Each store is made the first time a version that
 * has it opens, so a browser that only ever bookmarked keeps its bookmarks.
 */
export function openDatabase(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
		request.onupgradeneeded = () => {
			const database = request.result;
			if (!database.objectStoreNames.contains(STORE_NAME)) {
				database.createObjectStore(STORE_NAME, { keyPath: "date" });
			}
			for (const name of [STRIPS_STORE_NAME, BOOKS_STORE_NAME]) {
				if (!database.objectStoreNames.contains(name)) database.createObjectStore(name, { keyPath: "id" });
			}
		};
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}

/**
 * Runs `work` in one transaction over `stores`, and settles with what it settled `finish` with once
 * the transaction has committed — or rejects if it aborts, so nothing is said to be saved that was not.
 */
export async function inTransaction<T>(
	stores: string[],
	mode: IDBTransactionMode,
	work: (transaction: IDBTransaction, finish: (value: T) => void) => void,
): Promise<T> {
	const database = await openDatabase();
	return new Promise((resolve, reject) => {
		const transaction = database.transaction(stores, mode);
		let result: T;
		transaction.oncomplete = () => {
			database.close();
			resolve(result);
		};
		transaction.onerror = () => reject(transaction.error);
		transaction.onabort = () => {
			database.close();
			reject(transaction.error);
		};
		work(transaction, (value) => {
			result = value;
		});
	});
}
