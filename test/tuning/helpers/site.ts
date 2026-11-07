import { loadSite } from "find-strips";
import { createSearch } from "find-strips/search";
import type { Comic, SortMode, Tuning } from "find-strips/search";

export type { Tuning };

/** This archive's strips and descriptions, as the search reads them: what the tuning is measured on. */
export interface Archive {
	comics: Comic[];
	descriptions: Map<string, string>;
}

// The site is read from `config.yaml`, so the scripts are run from the repository's root, as the
// package scripts do. One archive per process: the engine keeps the strips in module state.
const site = loadSite("config.yaml");

// Only what the tuning is measured on: each strip's date, transcript and alternate text, with none of
// the data the filters read, so that the scores stay comparable with the ones already logged.
const comics: Comic[] = site.comics.map(({ date, id, transcript, alternate }) => ({
	date,
	transcript,
	...(id ? { id } : {}),
	...(alternate ? { alternate } : {}),
}));
const engine = createSearch({ ...site, comics });

export const { parseDateExpression, parseQuery, stem } = engine;

/** The tuning the site's configuration gives: what the search scores with unless told otherwise. */
export const TUNING: Tuning = site.tuning;

/** The compound words and misspellings the search folds together, as the site's data lists them. */
export const CANONICAL_FORMS = site.compounds;

export function loadRealArchive(): Archive {
	return { comics, descriptions: site.descriptions };
}

export function search(query: string, sort: SortMode, tuning: Tuning) {
	return engine.search(query, { sort, tuning });
}
