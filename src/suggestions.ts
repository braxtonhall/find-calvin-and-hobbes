import { ARCHIVE_SPAN } from "./archive";
import { RERUNS } from "./bundled-data";
import { scanFilters } from "./filter-query";
import { PAGE_CONFIG } from "./site-config";
import { fillSuggestion, suggestionFields } from "./suggestion-templates";

/**
 * What the search box types into itself when it is empty and the reader presses submit: the
 * suggestions in `config.yaml`, with today's fields filled in.
 *
 * The pool is deliberately half archive and half syntax. A reader who has never typed an `@` will
 * never see the autocomplete, so the only way the filter language reaches them is for the app to
 * use it in front of them: press the button on an empty box, watch `@is:sunday snowman` arrive
 * character by character and earn its pill, and the query is sitting there ready to be edited or
 * searched. Prose queries are what keep that from reading as a lesson — a filter arrives as one of
 * the things people search for rather than as documentation.
 *
 * A suggestion that asks for a filter this site cannot satisfy is left out rather than offered:
 * `@is:rerun` where `config.yaml` turns reruns off. `test/suggestions.test.ts` holds this archive's
 * to more than that — every one must find at least one strip.
 */
export function suggestedQueries(today: Date = new Date()): string[] {
	const fields = suggestionFields(today, ARCHIVE_SPAN, RERUNS);
	return PAGE_CONFIG.suggestions
		.map((template) => fillSuggestion(template, fields))
		.filter((query): query is string => query !== null)
		.filter((query) => scanFilters(query).every((match) => match.valid));
}

/**
 * The pool, shuffled and walked rather than sampled.
 *
 * Rolling the dice each time would repeat itself — a one-in-twenty chance of the same query twice
 * running, which reads as a broken button to anyone pressing it a few times to see what happens.
 * Walking a shuffled bag cannot repeat until the bag is empty, and by then every query has had a
 * turn.
 */
let bag: string[] = [];

function shuffled(): string[] {
	const queries = suggestedQueries();
	for (let index = queries.length - 1; index > 0; index--) {
		const swap = Math.floor(Math.random() * (index + 1));
		[queries[index], queries[swap]] = [queries[swap], queries[index]];
	}
	return queries;
}

/** The next suggestion, or `null` where there are none. */
export function randomQuery(): string | null {
	if (bag.length === 0) bag = shuffled();
	return bag.pop() ?? null;
}
