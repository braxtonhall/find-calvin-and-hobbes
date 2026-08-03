import { Comic, CollectionIndex, Collection, Day, Route } from "./types";

export interface AppState {
	comics: Comic[];
	comicsByDate: Map<string, Comic[]>;
	allDays: Day[];
	searchResultsDateSet: Set<string> | null;
	collectionDateSet: Set<string> | null;
	hoveredCell: HTMLElement | null;
	collectionIndex: CollectionIndex | null;
	collectionsById: Map<string, Collection> | null;
	collectionTooltip: HTMLElement | null;
	keyboardNavActive: boolean;
	bookmarkedDates: Set<string>;
	dataLoaded: boolean;
	pendingRoute: Route | null;
	resultsDebounceTimer: number | null;
}

export const state: AppState = {
	comics: [],
	comicsByDate: new Map(),
	allDays: [],
	searchResultsDateSet: null,
	collectionDateSet: null,
	hoveredCell: null,
	collectionIndex: null,
	collectionsById: null,
	collectionTooltip: null,
	keyboardNavActive: false,
	bookmarkedDates: new Set(),
	dataLoaded: false,
	pendingRoute: null,
	resultsDebounceTimer: null,
};
