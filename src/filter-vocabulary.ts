/**
 * The values of a filter whose vocabulary arrives with the archive.
 *
 * `@year:` and `@month:` know their values from a constant; `@in:` cannot. The books are loaded
 * data, and three separate places need to agree about them: the parser in `date-query.ts`, which
 * decides whether `@in:snowman` is a mistake; the completion menu, which offers the ids and their
 * titles; and the filter bar, which fills a dropdown with them. None of the three may fetch
 * anything, so the list is injected here once at boot and read from this one place — the same
 * reasoning `filter-spec.ts` gives for being the single table of filter names.
 *
 * Dependency-free, and for the same reason that file is: `date-query.ts` imports it, so anything
 * here that reached back into the parser would be a cycle.
 *
 * One rule runs through it:
 *
 * > **An empty vocabulary knows everything.**
 *
 * `collection-index.json` arrives over the network, after the search box is already typeable, and
 * its fetch can fail silently. A parser that judged ids against a list which had not arrived would
 * paint a reader's own `@in:book3` red and then green a moment later — and red forever on a failed
 * fetch, while the filter went on working, since membership is read off `comics.json` instead. A
 * list that has not arrived is not evidence that a value is wrong. So emptiness means
 * "unconstrained", which is also what lets the parser be tested with nothing registered at all.
 */

/** One value a data-driven filter takes: what a reader types, and what it names. */
export interface Term {
	/** The spelling the filter takes. Space-free and lowercase, because `scanFilters` requires it. */
	value: string;
	/** What the value is, for the row that offers it — a book id is not a book title. */
	hint: string;
}

/**
 * A thunk rather than an array, so a vocabulary can be registered before its data has arrived and
 * answer with the real values once it has. Nothing has to notice the moment it lands.
 */
export type Vocabulary = () => readonly Term[];

const REGISTRY = new Map<string, Vocabulary>();

/** Teach a filter its values, for a vocabulary that arrives with the archive. */
export function registerVocabulary(name: string, vocabulary: Vocabulary): void {
	REGISTRY.set(name, vocabulary);
}

/** The values, in the order the menu should offer them. Empty until they arrive. */
export function terms(name: string): readonly Term[] {
	return REGISTRY.get(name)?.() ?? [];
}

/**
 * Whether the value is one this filter takes — and true for every value while the list is empty.
 * See the note above: that permissiveness is the point, not an oversight.
 */
export function knows(name: string, value: string): boolean {
	const known = terms(name);
	return known.length === 0 || known.some((term) => term.value === value);
}
