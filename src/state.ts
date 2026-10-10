import { Arc, Character, Comic, CollectionIndex, Collection, Creator, Day, Route } from "./types";

export interface AppState {
	comics: Comic[];
	comicsByDate: Map<string, Comic[]>;
	reruns: Map<string, string>;
	descriptions: Map<string, string> | null;
	allDays: Day[];
	searchResultTiers: Map<string, number> | null;
	collectionDateSet: Set<string> | null;
	/** What a Collections tab's search lights: the strips that are why each collection it lists is there. */
	tabMatchDates: Set<string> | null;
	hoveredCell: HTMLElement | null;
	collectionIndex: CollectionIndex | null;
	collectionsById: Map<string, Collection> | null;
	arcs: Arc[] | null;
	arcsById: Map<string, Arc> | null;
	charactersById: Map<string, Character>;
	creatorsById: Map<string, Creator>;
	keyboardNavActive: boolean;
	bookmarkedDates: Set<string>;
	/** The strips the reader owns, by `ownershipId`, and the books, by id. */
	ownedStrips: Set<string>;
	ownedBooks: Set<string>;
	/** The strips and the books the reader has written a note on, keyed as the owned ones are. */
	notedStrips: Set<string>;
	notedBooks: Set<string>;
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
	tabMatchDates: null,
	hoveredCell: null,
	collectionIndex: null,
	collectionsById: null,
	arcs: null,
	arcsById: null,
	charactersById: new Map(),
	creatorsById: new Map(),
	keyboardNavActive: false,
	bookmarkedDates: new Set(),
	ownedStrips: new Set(),
	ownedBooks: new Set(),
	notedStrips: new Set(),
	notedBooks: new Set(),
	bookmarksLoaded: false,
	dataLoaded: false,
	pendingRoute: null,
	resultsDebounceTimer: null,
};
