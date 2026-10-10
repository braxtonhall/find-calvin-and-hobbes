import { STORE_NAME } from "./constants";
import { inTransaction } from "./database";
import { state } from "./state";

// A bookmark is a strip's, by `bookmarkId`. The store's key is still called `date`, as it was when
// a bookmark was a whole day's; a special's bookmark keeps its id there.

export function isBookmarked(id: string): Promise<boolean> {
	return inTransaction<boolean>([STORE_NAME], "readonly", (transaction, finish) => {
		const request = transaction.objectStore(STORE_NAME).get(id);
		request.onsuccess = () => finish(!!request.result);
	});
}

/** Bookmarks the strip, or takes its bookmark off. Settles with whether it is now bookmarked, once `state` holds it too. */
export function toggleBookmark(id: string): Promise<boolean> {
	return inTransaction<boolean>([STORE_NAME], "readwrite", (transaction, finish) => {
		const store = transaction.objectStore(STORE_NAME);
		const getRequest = store.get(id);
		getRequest.onsuccess = () => {
			if (getRequest.result) {
				store.delete(id);
				finish(false);
			} else {
				store.put({ date: id });
				finish(true);
			}
		};
	}).then((bookmarked) => {
		if (bookmarked) state.bookmarkedStrips.add(id);
		else state.bookmarkedStrips.delete(id);
		return bookmarked;
	});
}

/** Whether any strip that ran on `date` is bookmarked: the day's own, a rerun, or a special. The grid shows a day so. */
export function isDayBookmarked(date: string): boolean {
	if (state.bookmarkedStrips.has(date)) return true;
	return (state.comicsByDate.get(date) ?? []).some((comic) => comic.id && state.bookmarkedStrips.has(comic.id));
}
