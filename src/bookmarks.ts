import { DATABASE_NAME, DATABASE_VERSION, STORE_NAME } from "./constants";

function openBookmarksDatabase(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
		request.onupgradeneeded = () => {
			const database = request.result;
			if (!database.objectStoreNames.contains(STORE_NAME)) {
				database.createObjectStore(STORE_NAME, { keyPath: "date" });
			}
		};
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}

export async function isBookmarked(date: string): Promise<boolean> {
	const database = await openBookmarksDatabase();
	return new Promise((resolve, reject) => {
		const transaction = database.transaction(STORE_NAME, "readonly");
		const store = transaction.objectStore(STORE_NAME);
		const request = store.get(date);
		request.onsuccess = () => resolve(!!request.result);
		request.onerror = () => reject(request.error);
		transaction.oncomplete = () => database.close();
	});
}

export async function getBookmarkedDates(): Promise<Set<string>> {
	const database = await openBookmarksDatabase();
	return new Promise((resolve, reject) => {
		const transaction = database.transaction(STORE_NAME, "readonly");
		const store = transaction.objectStore(STORE_NAME);
		const request = store.getAllKeys();
		const dates = new Set<string>();
		request.onsuccess = () => {
			for (const date of request.result) dates.add(String(date));
			resolve(dates);
		};
		request.onerror = () => reject(request.error);
		transaction.oncomplete = () => database.close();
	});
}

export async function toggleBookmark(date: string): Promise<boolean> {
	const database = await openBookmarksDatabase();
	return new Promise((resolve, reject) => {
		const transaction = database.transaction(STORE_NAME, "readwrite");
		const store = transaction.objectStore(STORE_NAME);
		const getRequest = store.get(date);
		getRequest.onsuccess = () => {
			if (getRequest.result) {
				store.delete(date);
				resolve(false);
			} else {
				store.put({ date });
				resolve(true);
			}
		};
		getRequest.onerror = () => reject(getRequest.error);
		transaction.oncomplete = () => database.close();
	});
}
