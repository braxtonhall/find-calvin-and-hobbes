import test from "node:test";
import assert from "node:assert/strict";
import { parseDateExpression } from "../src/date-query";
import { admits, parseQuery } from "../src/boolean-query";
import { Filter, Run, scanFilters } from "../src/filter-query";
import { registerVocabulary } from "../src/filter-vocabulary";
import { Comic } from "../src/types";
import { DESCRIBED, RECITED } from "./fixtures/golden";
import { loadGenerated } from "./helpers/queries";

/**
 * The books `@in:` is allowed to name, for the whole file.
 *
 * Registered here rather than per case because the parser is otherwise data-free, and this is the
 * one filter it is not: a value off the list is a mistake, and there is no list until something says
 * so. The one case that cares about the other state — nothing registered yet — swaps in an empty
 * list of its own and puts this one back.
 */
const BOOKS = ["book1", "book3", "book5", "lazysunday"].map((value) => ({ value, hint: value }));
registerVocabulary("in", () => BOOKS);

/** Whether the query keeps the row: some branch of it does. */
function passes(subject: string | Comic, query: string, run?: Run): boolean {
	return parseQuery(query).some((branch) => admits(branch, subject, run));
}

/** What the one filter in the query reads as. */
function read(query: string): Filter | null {
	const matches = scanFilters(query);
	assert.equal(matches.length, 1, query);
	return matches[0].filter;
}

/** A strip, for the one filter a date cannot answer. */
function strip(date: string, ...books: string[]): Comic {
	return { date, transcript: "", appearances: books.map((collection) => ({ collection, pages: [] })) };
}

test("filters", async (suite) => {
	await suite.test("a filter is lifted out and the rest is the query", () => {
		const [branch] = parseQuery("@year:1988 rosalyn");
		assert.deepEqual(branch.segments, ["rosalyn"]);
		assert.deepEqual(branch.clauses, [[{ kind: "filter", filter: read("@year:1988"), negated: false }]]);
	});

	await suite.test("a month is named or numbered", () => {
		for (const value of ["8", "08", "aug", "august"]) {
			assert.deepEqual(read(`@month:${value}`), { kind: "month", month: 8 }, value);
		}
	});

	await suite.test("@in names a book by its id", () => {
		assert.deepEqual(read("@in:book3"), { kind: "in", collection: "book3" });
		assert.deepEqual(read("@IN:BOOK3"), { kind: "in", collection: "book3" });
	});

	// A strip can be printed in many books, but two books mostly share none, so asking for two is
	// asking for either — and both is `@and`.
	await suite.test("books side by side widen", () => {
		const query = "@in:book1 @in:book3";
		assert.ok(passes(strip("1988-06-01", "book1", "book3"), query));
		assert.ok(passes(strip("1988-06-01", "book1"), query));
		assert.ok(passes(strip("1988-06-01", "book3"), query));
		assert.ok(!passes(strip("1988-06-01", "book5"), query));
	});

	await suite.test("books joined by @and intersect", () => {
		const query = "@in:book1 @and @in:book3";
		assert.ok(passes(strip("1988-06-01", "book1", "book3"), query));
		assert.ok(passes(strip("1988-06-01", "book1", "book3", "book5"), query));
		assert.ok(!passes(strip("1988-06-01", "book1"), query));
		assert.ok(!passes(strip("1988-06-01", "book3"), query));
	});

	await suite.test("tags side by side still intersect", () => {
		assert.ok(passes(strip("1988-06-01", "book1"), "@in:book1 @is:daily"));
		assert.ok(!passes(strip("1988-06-01", "book1"), "@is:daily @is:sunday"));
	});

	await suite.test("a book intersects a date", () => {
		const query = "@in:book3 @year:1988";
		assert.ok(passes(strip("1988-06-01", "book3"), query));
		assert.ok(!passes(strip("1989-06-01", "book3"), query));
		assert.ok(!passes(strip("1988-06-01", "book5"), query));
	});

	// A strip is usually in several books at once, and any one of them answers for it.
	await suite.test("a strip in several books answers for each of them", () => {
		const printed = strip("1988-06-01", "book3", "lazysunday");
		assert.ok(passes(printed, "@in:book3"));
		assert.ok(passes(printed, "@in:lazysunday"));
		assert.ok(!passes(printed, "@in:book1"));
	});

	await suite.test("a strip in no book at all is in no book", () => {
		const loose: Comic = { date: "1985-11-28", transcript: "" };
		assert.ok(!passes(loose, "@in:book3"));
		assert.ok(passes(loose, "@year:1985"));
	});

	/*
	 * The subject of `passesFilter` widened so that `@in:` could be answered at all, and this is
	 * what keeps that from quietly changing the seven filters that came before it: a date still
	 * answers every one of them. It cannot answer `@in:`, and says so rather than guessing — two
	 * strips ran on 1985-11-28 and only one is in a book, so a day cannot decide it even in
	 * principle.
	 */
	await suite.test("a date still answers every filter that is about dates", () => {
		assert.ok(passes("1988-08-03", "@year:1988 @month:aug"));
		assert.ok(!passes("1988-08-03", "@in:book3"));
	});

	/*
	 * The books arrive over the network, after the box is already typeable, and that fetch can
	 * fail. A parser holding `@in:book3` to a list that had not arrived would call a reader's own
	 * query a mistake and then take it back — so an empty list means "no opinion", and the filter
	 * goes on working either way, because membership is read off the strips and not off the index.
	 */
	await suite.test("with no books registered, any book is taken on trust", () => {
		try {
			registerVocabulary("in", () => []);
			assert.ok(scanFilters("@in:whatever")[0].valid);
			assert.ok(passes(strip("1988-06-01", "whatever"), "@in:whatever"));
			assert.ok(!passes(strip("1988-06-01", "book3"), "@in:whatever"));
		} finally {
			registerVocabulary("in", () => BOOKS);
		}
	});

	await suite.test("values of one field union", () => {
		for (const query of ["@year:1988 @year:1989", "@year:1988 @or @year:1989"]) {
			assert.ok(passes("1988-06-01", query), query);
			assert.ok(passes("1989-06-01", query), query);
			assert.ok(!passes("1990-06-01", query), query);
		}
	});

	// A space widens a calendar field; `@and` is the reader saying they mean AND, and gets it.
	await suite.test("@and does not widen", () => {
		assert.ok(!passes("1988-06-01", "@year:1988 @and @year:1989"));
		assert.ok(!passes("1989-06-01", "@year:1988 @and @year:1989"));
		assert.ok(passes("1988-06-01", "@year:1988 @and @year:88"), "two spellings that agree");
	});

	// Only what stands side by side widens. Under `@not` or beside an `@or`, a filter has already
	// been told how it combines.
	await suite.test("a filter inside a group is not widened from outside it", () => {
		const query = "(@year:1988 @or @in:book1) @year:1989";
		assert.ok(passes(strip("1989-06-01", "book1"), query));
		assert.ok(!passes(strip("1988-06-01"), query), "1988 is not 1989");
		assert.ok(!passes("1990-06-01", "@year:1990 @not @year:1990"));
	});

	await suite.test("a broken filter beside good ones of its field still finds nothing", () => {
		assert.ok(!passes("1988-08-03", "@month:13 @month:8"));
	});

	await suite.test("fields intersect", () => {
		const query = "@year:1988 @month:8";
		assert.ok(passes("1988-08-03", query));
		assert.ok(!passes("1988-09-03", query));
		assert.ok(!passes("1989-08-03", query));
	});

	await suite.test("@day takes a day of the month or a day of the week", () => {
		assert.deepEqual(read("@day:3"), { kind: "monthDay", day: 3 });
		assert.deepEqual(read("@day:mon"), { kind: "weekday", weekday: 1 });
		assert.deepEqual(read("@day:monday"), { kind: "weekday", weekday: 1 });
		assert.ok(passes("1988-08-06", "@day:saturday @day:sunday"), "the weekend");
		assert.ok(passes("1988-08-07", "@day:saturday @day:sunday"), "the weekend");
		assert.ok(!passes("1988-08-08", "@day:saturday @day:sunday"));
		assert.ok(passes("1988-08-15", "@day:1 @day:15"));
	});

	await suite.test("a day of the month and a day of the week narrow each other", () => {
		const query = "@day:1 @day:monday";
		assert.ok(passes("1988-08-01", query), "a Monday, and the first");
		assert.ok(!passes("1988-08-08", query), "a Monday, not the first");
		assert.ok(!passes("1988-05-01", query), "the first, a Sunday");
	});

	// A date only ever gets more specific, so `august 3` is not one. This is where a reader says
	// which fields they meant, and it is the reason nothing is lost by rejecting the bare form.
	await suite.test("a day in every year is what the filters are for", () => {
		const query = "@month:august @day:3";
		assert.ok(passes("1988-08-03", query));
		assert.ok(passes("1989-08-03", query));
		assert.ok(!passes("1988-08-04", query));
		assert.ok(!passes("1988-09-03", query));
	});

	await suite.test("@is:sunday and @is:daily are the Sundays and everything else", () => {
		assert.ok(passes("1988-08-07", "@is:sunday"));
		assert.ok(!passes("1988-08-08", "@is:sunday"));
		assert.ok(passes("1988-08-08", "@is:daily"));
		assert.ok(passes("1988-08-06", "@is:daily"), "a Saturday is a daily");
		assert.ok(!passes("1988-08-07", "@is:daily"));
	});

	// A tag is its own field rather than a spelling of `@day:`, so it narrows a weekday rather than
	// joining it.
	await suite.test("@is:sunday narrows @day rather than widening it", () => {
		assert.ok(!passes("1988-08-07", "@is:sunday @day:monday"));
		assert.ok(!passes("1988-08-08", "@is:sunday @day:monday"));
		assert.ok(passes("1988-08-07", "@is:sunday @day:sunday"));
		assert.ok(passes("1988-08-06", "@is:daily @day:saturday"));
	});

	// A strip can carry many tags, so repeating `@is:` asks for all of them.
	await suite.test("tags intersect", () => {
		assert.ok(!passes("1988-08-07", "@is:sunday @is:daily"));
		assert.ok(!passes("1988-08-08", "@is:sunday @is:daily"));
		const wordlessSunday: Comic = { date: "1988-08-07", transcript: "" };
		assert.ok(passes(wordlessSunday, "@is:sunday @is:empty"));
		assert.ok(!passes({ ...wordlessSunday, date: "1988-08-08" }, "@is:sunday @is:empty"));
	});

	// Which showing of a strip a row is belongs to the row, and only the search knows the reruns, so
	// only its `run` answers these.
	await suite.test("@is:reused and @is:rerun are answered by the row's run", () => {
		const comic: Comic = { date: "1988-08-03", transcript: "" };
		assert.ok(passes(comic, "@is:reused", "reused"));
		assert.ok(!passes(comic, "@is:reused", "rerun"));
		assert.ok(!passes(comic, "@is:reused"));
		assert.ok(passes(comic, "@is:rerun", "rerun"));
		assert.ok(!passes(comic, "@is:rerun", "reused"));
		assert.ok(!passes(comic, "@is:rerun"));
		assert.ok(!passes(comic, "@is:reused @is:rerun", "rerun"));
	});

	// Not about the day at all: a fact about the strip's text, so only a strip can answer it,
	// exactly as `@in` does for the books.
	await suite.test("@is:empty matches a strip with an empty transcript", () => {
		const wordless: Comic = { date: "1988-06-01", transcript: "" };
		const spoken: Comic = { date: "1988-06-02", transcript: "Calvinball!" };
		assert.ok(passes(wordless, "@is:empty"));
		assert.ok(!passes(spoken, "@is:empty"));
		// A date cannot say whether a strip is wordless.
		assert.ok(!passes("1988-06-01", "@is:empty"));
	});

	// `@is:altered` is read off the same appearances as `@in`, but it is a field of its own: altered
	// in any book, whichever books `@in` names.
	await suite.test("@is:altered matches a strip some book printed altered", () => {
		const changed: Comic = {
			date: "1985-12-15",
			transcript: "",
			appearances: [
				{ collection: "book1", pages: [1], altered: true },
				{ collection: "book3", pages: [2] },
			],
		};
		const faithful = strip("1985-12-16", "book1", "book3");
		assert.ok(passes(changed, "@is:altered"));
		assert.ok(!passes(faithful, "@is:altered"));
		assert.ok(passes(changed, "@in:book1 @is:altered"));
		assert.ok(passes(changed, "@in:book3 @is:altered"));
		assert.ok(!passes(changed, "@in:book5 @is:altered"));
		// A date cannot say whether a book changed the strip.
		assert.ok(!passes("1985-12-15", "@is:altered"));
	});

	// A filter is deliberate syntax, so it may demand an unambiguous order instead of guessing.
	await suite.test("@date values are year first, never ambiguous", () => {
		assert.ok(passes("1988-09-03", "@date:1988/9/3"));
		assert.ok(!passes("1988-03-09", "@date:1988/9/3"));
		assert.ok(passes("1988-09-03", "@date:1988-sep-3"));
		assert.equal(read("@date:9/3/1988"), null);
	});

	await suite.test("@date accepts a year, a month or a day", () => {
		assert.ok(passes("1988-08-03", "@date:1988"));
		assert.ok(passes("1988-08-03", "@date:1988-08"));
		assert.ok(!passes("1988-09-03", "@date:1988-08"));
		assert.ok(passes("1988-08-03", "@date:19880803"));
	});

	// The pair that settles the exclusive reading: "after 1987 and before 1990" is 1989.
	await suite.test("@before and @after exclude the whole span they name", () => {
		const query = "@after:1987 @before:1990";
		assert.ok(passes("1989-01-01", query));
		assert.ok(passes("1989-12-31", query));
		assert.ok(!passes("1987-12-31", query));
		assert.ok(!passes("1990-01-01", query));
	});

	// Two bounds of the same kind are one field, so they union like every other repeated value —
	// the widest wins, and the order they were typed in cannot change the answer.
	await suite.test("repeated bounds union to the widest, whatever order they come in", () => {
		for (const query of ["@before:1990 @before:1993", "@before:1993 @before:1990"]) {
			assert.ok(passes("1992-06-01", query), query);
			assert.ok(!passes("1993-06-01", query), query);
		}

		for (const query of ["@after:1990 @after:1987", "@after:1987 @after:1990"]) {
			assert.ok(passes("1988-06-01", query), query);
			assert.ok(!passes("1987-06-01", query), query);
		}

		// Different fields still intersect, which is what makes a window expressible at all.
		const window = "@after:1986 @after:1988 @before:1993 @before:1991";
		assert.ok(passes("1990-06-01", window));
		assert.ok(passes("1992-06-01", window), "the wider @before wins");
		assert.ok(passes("1988-06-01", window), "and so does the wider @after");
		assert.ok(!passes("1986-06-01", window));
		assert.ok(!passes("1993-06-01", window));
	});

	await suite.test("an unknown filter is left to the text search", () => {
		assert.deepEqual(parseQuery("@foo:bar"), [{ segments: ["@foo:bar"], clauses: [[]] }]);
		// A tag is only a tag under `@is:`.
		assert.deepEqual(parseQuery("@sunday"), [{ segments: ["@sunday"], clauses: [[]] }]);
	});

	// A filter says where to look, not that something is there, so a year outside the archive is
	// a valid thing to write. `@after:1984` is how you say "from the beginning".
	await suite.test("a filter year need not be one the archive holds", () => {
		assert.notEqual(read("@after:1984"), null);
		assert.ok(passes("1985-11-18", "@after:1984"));
		assert.ok(passes("1995-12-31", "@after:1984"));

		const window = "@after:1984 @before:1987";
		assert.ok(passes("1985-11-18", window));
		assert.ok(passes("1986-06-01", window));
		assert.ok(!passes("1987-01-01", window));

		// Valid but empty, rather than malformed: the two are indistinguishable to a reader, and
		// this way the rule is simply "a filter names a span".
		assert.notEqual(read("@year:2001"), null);
		// The predicate is about the date, not the archive — a 2001 date does pass a 2001 filter.
		// What makes the query empty is that the archive holds no such strip.
		assert.ok(!passes("1988-08-03", "@year:2001"));
		assert.ok(passes("2001-09-11", "@year:2001"));
		assert.notEqual(read("@date:2001-09-11"), null);
		assert.notEqual(read("@before:2024"), null);
		assert.ok(passes("1988-08-03", "@before:2024"));
	});

	// The century is never guessed, so nothing about the archive's own span is built into the
	// filter: `@year:88` is 1988 here, and would be 1888 as well in an archive that reached it.
	await suite.test("two digits are every year that ends in them", () => {
		assert.deepEqual(read("@year:88"), {
			kind: "year",
			expression: { candidates: [{ year: 88, ending: true }], precision: "broad" },
		});
		assert.ok(passes("1888-08-03", "@date:88"), "@date reads two digits the same way");
		assert.ok(passes("1888-08-03", "@date:88/8"));
		assert.ok(!passes("1888-09-03", "@date:88/8"));
		for (const date of ["1988-08-03", "1888-08-03", "2088-08-03"]) assert.ok(passes(date, "@year:88"), date);
		assert.ok(!passes("1989-08-03", "@year:88"));
		assert.ok(passes("1908-08-03", "@year:08"), "a leading zero is a digit like any other");
		assert.ok(!passes("1980-08-03", "@year:08"));
		// A year, and nothing more specific: that is `@date:`.
		for (const value of ["1988/8", "1988-08-03", "198808", "aug", "198", "8"]) {
			assert.equal(read(`@year:${value}`), null, value);
		}
		// Four digits are the same rule, and pick out one year.
		assert.ok(passes("1988-08-03", "@year:1988"));
		assert.ok(!passes("1888-08-03", "@year:1988"));
	});

	// A reader's own query is still held to the archive, which is what keeps `1812` text.
	await suite.test("an out-of-range year typed bare is still not a date", () => {
		assert.equal(parseDateExpression("1812"), null);
		assert.equal(parseDateExpression("2001-09-11"), null);
	});

	await suite.test("a recognised filter with an unusable value finds nothing", () => {
		for (const query of [
			"@month:13",
			"@year:abc",
			"@day:32",
			"@day:funday",
			"@before:august-3",
			// A bound is one day, and every year ending in 88 has no single edge.
			"@before:88",
			"@after:95/6",
			// A book that is not one of the archive's is a typo rather than a place to look — unlike
			// `@year:2001`, which is a real coordinate that honestly holds nothing.
			"@year",
			"@in",
			"@in:snowman",
			"@is",
			"@is:monday",
		]) {
			assert.equal(read(query), null, query);
			assert.deepEqual(parseQuery(query), [], query);
			assert.ok(!passes("1988-08-03", query), query);
		}
	});

	// A filter lifted out of the middle of a query must not join the words either side of it.
	await suite.test("segments record where the filter was", () => {
		assert.deepEqual(parseQuery("clean @year:1988 your room")[0].segments, ["clean", "your room"]);
		assert.deepEqual(parseQuery("@year:1988 clean your room")[0].segments, ["clean your room"]);
		assert.deepEqual(parseQuery("clean your room")[0].segments, ["clean your room"]);
	});
});

/**
 * The guard that makes the evaluation thresholds in `test/eval.test.ts` safe. Date search is
 * additive — it only ever fires when the whole query is a date, or when an `@` filter is
 * present — so as long as no fixture query does either, the engine those thresholds measure is
 * untouched. Two queries come close and are the reason this is worth asserting rather than
 * assuming: "the 1812 overture has cannons in the percussion" and "The 35-ton behemoth...".
 *
 * It reaches across to `parseDateExpression` because it is one claim about both halves, and
 * splitting it would load the whole fixture set twice to assert half as much each time. It sits on
 * this side for the same reason the parsers do: filters are downstream of dates.
 */
test("no query in the evaluation fixtures is a date or carries a filter", () => {
	const queries = [...RECITED, ...DESCRIBED, ...loadGenerated()].map((row) => row.query.toLowerCase());
	assert.ok(queries.length > 500, `expected the full fixture set, saw ${queries.length}`);

	for (const query of queries) {
		assert.equal(
			parseDateExpression(query),
			null,
			`"${query}" now parses as a date; eval.test.ts measures a different engine`,
		);
		assert.deepEqual(
			parseQuery(query),
			[{ segments: [query.trim().split(/\s+/).join(" ")], clauses: [[]] }],
			`"${query}" now carries a filter or an operator; eval.test.ts measures a different engine`,
		);
	}
});

// `scanFilters` is what `parseQuery` is built on, and it is also what paints the query box.
// These pin the two things the box needs and the parser never had to expose: where a filter sits,
// and which one of them is the broken one.
test("scanning filters", async (suite) => {
	await suite.test("a filter is reported with the span it occupies", () => {
		const query = "clean @year:1988 your room";
		const matches = scanFilters(query);
		assert.equal(matches.length, 1);
		assert.equal(query.slice(matches[0].start, matches[0].end), "@year:1988");
		assert.equal(matches[0].name, "year");
		assert.equal(matches[0].value, "1988");
		assert.ok(matches[0].valid);
	});

	await suite.test("every filter is reported, in the order it was written", () => {
		const matches = scanFilters("@is:sunday @year:1988 snowman @month:aug");
		assert.deepEqual(
			matches.map((match) => match.name),
			["is", "year", "month"],
		);
		assert.ok(matches.every((match) => match.valid));
	});

	// The same list `parseQuery` finds nothing in, one entry at a time, so the box can point
	// at the filter that did it rather than at the whole query.
	await suite.test("a filter the parser cannot use is reported invalid", () => {
		for (const query of [
			"@month:13",
			"@year:abc",
			"@year:199",
			"@day:32",
			"@day:funday",
			"@before:august-3",
			"@year",
			"@in",
			"@in:snowman",
			"@is",
			"@is:monday",
		]) {
			const matches = scanFilters(query);
			assert.equal(matches.length, 1, query);
			assert.equal(matches[0].valid, false, query);
		}
	});

	await suite.test("an unrecognised name is not a filter at all", () => {
		assert.deepEqual(scanFilters("@foo:bar"), []);
		assert.deepEqual(scanFilters("snowman"), []);
		assert.deepEqual(scanFilters(""), []);
	});

	await suite.test("a valid filter beside a broken one is still valid", () => {
		const matches = scanFilters("@year:1988 @month:13");
		assert.deepEqual(
			matches.map((match) => match.valid),
			[true, false],
		);
	});

	// Two callers, one scan: whatever the box paints as a filter is what the search will excise.
	await suite.test("the spans account for exactly what parseQuery removes", () => {
		const query = "clean @year:1988 your @is:sunday room";
		const matches = scanFilters(query);
		let cursor = 0;
		const pieces: string[] = [];
		for (const match of matches) {
			pieces.push(query.slice(cursor, match.start));
			cursor = match.end;
		}
		pieces.push(query.slice(cursor));
		assert.equal(
			pieces
				.map((piece) => piece.trim())
				.filter(Boolean)
				.join(" "),
			parseQuery(query)[0].segments.join(" "),
		);
	});
});
