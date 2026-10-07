import { STORE_NAME } from "./constants";
import { inTransaction } from "./database";

export function isBookmarked(date: string): Promise<boolean> {
	return inTransaction<boolean>([STORE_NAME], "readonly", (transaction, finish) => {
		const request = transaction.objectStore(STORE_NAME).get(date);
		request.onsuccess = () => finish(!!request.result);
	});
}

export function getBookmarkedDates(): Promise<Set<string>> {
	return inTransaction<Set<string>>([STORE_NAME], "readonly", (transaction, finish) => {
		const request = transaction.objectStore(STORE_NAME).getAllKeys();
		request.onsuccess = () => finish(new Set(request.result.map(String)));
	});
}

export function toggleBookmark(date: string): Promise<boolean> {
	return inTransaction<boolean>([STORE_NAME], "readwrite", (transaction, finish) => {
		const store = transaction.objectStore(STORE_NAME);
		const getRequest = store.get(date);
		getRequest.onsuccess = () => {
			if (getRequest.result) {
				store.delete(date);
				finish(false);
			} else {
				store.put({ date });
				finish(true);
			}
		};
	});
}
