import { Arc, Comic, CollectionIndex, Collection, Day, Route } from "./types";

export interface AppState {
	comics: Comic[];
	comicsByDate: Map<string, Comic[]>;
	reruns: Map<string, string>;
	descriptions: Map<string, string> | null;
	allDays: Day[];
	searchResultTiers: Map<string, number> | null;
	collectionDateSet: Set<string> | null;
	hoveredCell: HTMLElement | null;
	collectionIndex: CollectionIndex | null;
	collectionsById: Map<string, Collection> | null;
	arcs: Arc[] | null;
	arcsById: Map<string, Arc> | null;
	keyboardNavActive: boolean;
	bookmarkedDates: Set<string>;
	/** The strips the reader owns, by `ownershipId`, and the books, by id. */
	ownedStrips: Set<string>;
	ownedBooks: Set<string>;
	/** Whether IndexedDB has answered — or failed to — so an empty library means there is none. */
	bookmarksLoaded: boolean;
	dataLoaded: boolean;
	pendingRoute: Route | null;
	resultsDebounceTimer: number | null;
}

export const state: AppState = {
	comics: [],
	comicsByDate: new Map(),
	reruns: new Map(),
	descriptions: null,
	allDays: [],
	searchResultTiers: null,
	collectionDateSet: null,
	hoveredCell: null,
	collectionIndex: null,
	collectionsById: null,
	arcs: null,
	arcsById: null,
	keyboardNavActive: false,
	bookmarkedDates: new Set(),
	ownedStrips: new Set(),
	ownedBooks: new Set(),
	bookmarksLoaded: false,
	dataLoaded: false,
	pendingRoute: null,
	resultsDebounceTimer: null,
};
