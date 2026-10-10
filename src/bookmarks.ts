import { STORE_NAME } from "./constants";
import { inTransaction } from "./database";
import { state } from "./state";
import { dayCell } from "./grid";

// A bookmark is a strip's, by `bookmarkId`. The store's key is still called `date`, as it was when
// a bookmark was a whole day's; a special's bookmark keeps its id there.

export function isBookmarked(id: string): Promise<boolean> {
	return inTransaction<boolean>([STORE_NAME], "readonly", (transaction, finish) => {
		const request = transaction.objectStore(STORE_NAME).get(id);
		request.onsuccess = () => finish(!!request.result);
	});
}

/**
 * Bookmarks the strip that ran on `date`, or takes its bookmark off. Settles with whether it is now
 * bookmarked, once `state` and the day's cell on the grid show it too.
 */
export function toggleBookmark(id: string, date: string): Promise<boolean> {
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
		// A box of many days, zoomed out, shows no bookmarks.
		dayCell(date)?.classList.toggle("cell--bookmarked", isDayBookmarked(date));
		return bookmarked;
	});
}

/** Whether any strip that ran on `date` is bookmarked: the day's own, a rerun, or a special. The grid shows a day so. */
export function isDayBookmarked(date: string): boolean {
	if (state.bookmarkedStrips.has(date)) return true;
	return (state.comicsByDate.get(date) ?? []).some((comic) => comic.id && state.bookmarkedStrips.has(comic.id));
}
