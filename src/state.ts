import { Comic, CollectionIndex, Collection, Day, Route } from "./types";

export interface AppState {
	comics: Comic[];
	comicsByDate: Map<string, Comic[]>;
	descriptions: Map<string, string> | null;
	allDays: Day[];
	searchResultTiers: Map<string, number> | null;
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
	descriptions: null,
	allDays: [],
	searchResultTiers: null,
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
