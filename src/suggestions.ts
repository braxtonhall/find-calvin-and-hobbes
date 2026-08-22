const now = new Date();

const month = now.toLocaleString("en-US", { month: "short" }).toLowerCase();
const day = now.getDate();

/**
 * What the search box types into itself when it is empty and the reader presses submit.
 *
 * The pool is deliberately half archive and half syntax. A reader who has never typed an `@` will
 * never see the autocomplete, so the only way the filter language reaches them is for the app to
 * use it in front of them: press the button on an empty box, watch `@sunday snowman` arrive
 * character by character and earn its pill, and the query is sitting there ready to be edited or
 * searched. Prose queries are what keep that from reading as a lesson — a filter arrives as one of
 * the things people search for rather than as documentation.
 *
 * Every entry was run against the real archive and returns at least one strip. `@after:1995` and
 * friends are the trap here: the strip ends in December 1995, so a bound just past the end is a
 * perfectly valid filter that can never match. Check a new entry before adding it — the reader is
 * one keystroke from searching whatever lands in the box.
 */
export const SUGGESTED_QUERIES: readonly string[] = [
	"revenge of the baby-sat",
	"snow goons",
	"weirdos from another planet",
	"@year:1995 there's treasure everywhere",
	"homicidal psycho jungle cat!",
	"transmogrifier",
	"spaceman spiff",
	"stupendous man",
	"susie",
	"miss wormwood",
	"duplicator",
	"time machine",
	"yukon",
	"water balloon",
	"waiting for the school bus",
	"@month:december @day:24 @sunday",
	"@year:1988",
	"november 18 1985",
	"@sunday calvinball",
	"@sunday snowman",
	"@sunday @year:1986",
	"@year:1985",
	`@month:${month} @day:${day}`,
];

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
	const queries = [...SUGGESTED_QUERIES];
	for (let index = queries.length - 1; index > 0; index--) {
		const swap = Math.floor(Math.random() * (index + 1));
		[queries[index], queries[swap]] = [queries[swap], queries[index]];
	}
	return queries;
}

export function randomQuery(): string {
	if (bag.length === 0) bag = shuffled();
	return bag.pop()!;
}
