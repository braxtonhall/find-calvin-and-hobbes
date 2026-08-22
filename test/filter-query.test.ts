import test from "node:test";
import assert from "node:assert/strict";
import { parseDateExpression } from "../src/date-query";
import { parseQueryFilters, passesFilters, scanFilters } from "../src/filter-query";
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

/** A strip, for the one filter a date cannot answer. */
function strip(date: string, ...books: string[]): Comic {
	return { date, transcript: "", appearances: books.map((collection) => ({ collection, pages: [] })) };
}

test("filters", async (suite) => {
	await suite.test("a filter is lifted out and the rest is the query", () => {
		const { filters, residual } = parseQueryFilters("@year:1988 rosalyn");
		assert.ok(filters);
		assert.deepEqual([...filters.years], [1988]);
		assert.equal(residual, "rosalyn");
	});

	await suite.test("a month is named or numbered", () => {
		for (const value of ["8", "08", "aug", "august"]) {
			const { filters } = parseQueryFilters(`@month:${value}`);
			assert.deepEqual([...filters!.months], [8], value);
		}
	});

	await suite.test("@in names a book by its id", () => {
		const { filters } = parseQueryFilters("@in:book3");
		assert.deepEqual([...filters!.collections], ["book3"]);
		// Nothing about a book is a date, so no calendar field hears it.
		assert.equal(filters!.years.size + filters!.months.size + filters!.monthDays.size, 0);
		assert.deepEqual([...parseQueryFilters("@IN:BOOK3").filters!.collections], ["book3"]);
	});

	await suite.test("books of one filter union", () => {
		const { filters } = parseQueryFilters("@in:book1 @in:book3");
		assert.deepEqual([...filters!.collections].sort(), ["book1", "book3"]);
		assert.ok(passesFilters(strip("1988-06-01", "book1"), filters!));
		assert.ok(passesFilters(strip("1988-06-01", "book3"), filters!));
		assert.ok(!passesFilters(strip("1988-06-01", "book5"), filters!));
	});

	await suite.test("a book intersects a date", () => {
		const { filters } = parseQueryFilters("@in:book3 @year:1988");
		assert.ok(passesFilters(strip("1988-06-01", "book3"), filters!));
		assert.ok(!passesFilters(strip("1989-06-01", "book3"), filters!));
		assert.ok(!passesFilters(strip("1988-06-01", "book5"), filters!));
	});

	// A strip is usually in several books at once, and any one of them answers for it.
	await suite.test("a strip in several books answers for each of them", () => {
		const printed = strip("1988-06-01", "book3", "lazysunday");
		assert.ok(passesFilters(printed, parseQueryFilters("@in:book3").filters!));
		assert.ok(passesFilters(printed, parseQueryFilters("@in:lazysunday").filters!));
		assert.ok(!passesFilters(printed, parseQueryFilters("@in:book1").filters!));
	});

	await suite.test("a strip in no book at all is in no book", () => {
		const loose: Comic = { date: "1985-11-28", transcript: "" };
		assert.ok(!passesFilters(loose, parseQueryFilters("@in:book3").filters!));
		assert.ok(passesFilters(loose, parseQueryFilters("@year:1985").filters!));
	});

	/*
	 * The subject of `passesFilters` widened so that `@in:` could be answered at all, and this is
	 * what keeps that from quietly changing the seven filters that came before it: a date still
	 * answers every one of them. It cannot answer `@in:`, and says so rather than guessing — two
	 * strips ran on 1985-11-28 and only one is in a book, so a day cannot decide it even in
	 * principle.
	 */
	await suite.test("a date still answers every filter that is about dates", () => {
		assert.ok(passesFilters("1988-08-03", parseQueryFilters("@year:1988 @month:aug").filters!));
		assert.ok(!passesFilters("1988-08-03", parseQueryFilters("@in:book3").filters!));
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
			const { filters } = parseQueryFilters("@in:whatever");
			assert.ok(!filters!.impossible);
			assert.ok(passesFilters(strip("1988-06-01", "whatever"), filters!));
			assert.ok(!passesFilters(strip("1988-06-01", "book3"), filters!));
		} finally {
			registerVocabulary("in", () => BOOKS);
		}
	});

	await suite.test("values of one field union", () => {
		const { filters } = parseQueryFilters("@year:1988 @year:1989");
		assert.deepEqual([...filters!.years].sort(), [1988, 1989]);
		assert.ok(passesFilters("1988-06-01", filters!));
		assert.ok(passesFilters("1989-06-01", filters!));
		assert.ok(!passesFilters("1990-06-01", filters!));
	});

	await suite.test("fields intersect", () => {
		const { filters } = parseQueryFilters("@year:1988 @month:8");
		assert.ok(passesFilters("1988-08-03", filters!));
		assert.ok(!passesFilters("1988-09-03", filters!));
		assert.ok(!passesFilters("1989-08-03", filters!));
	});

	// `@day` carries two kinds of value, and they are two fields under one name: same kind
	// unions, different kinds intersect. Anything else makes the weekend inexpressible.
	await suite.test("@day takes a day of the month or a day of the week", () => {
		assert.deepEqual([...parseQueryFilters("@day:3").filters!.monthDays], [3]);
		assert.equal(parseQueryFilters("@day:3").filters!.weekdays.size, 0);
		assert.deepEqual([...parseQueryFilters("@day:mon").filters!.weekdays], [1]);
		assert.deepEqual([...parseQueryFilters("@day:monday").filters!.weekdays], [1]);
		assert.deepEqual([...parseQueryFilters("@day:saturday @day:sunday").filters!.weekdays].sort(), [0, 6]);
		assert.deepEqual([...parseQueryFilters("@day:1 @day:15").filters!.monthDays].sort(), [1, 15]);
	});

	await suite.test("a day of the month and a day of the week narrow each other", () => {
		const { filters } = parseQueryFilters("@day:1 @day:monday");
		assert.deepEqual([...filters!.monthDays], [1]);
		assert.deepEqual([...filters!.weekdays], [1]);
		assert.ok(passesFilters("1988-08-01", filters!), "a Monday, and the first");
		assert.ok(!passesFilters("1988-08-08", filters!), "a Monday, not the first");
		assert.ok(!passesFilters("1988-05-01", filters!), "the first, a Sunday");
	});

	// A date only ever gets more specific, so `august 3` is not one. This is where a reader says
	// which fields they meant, and it is the reason nothing is lost by rejecting the bare form.
	await suite.test("a day in every year is what the filters are for", () => {
		const { filters } = parseQueryFilters("@month:august @day:3");
		assert.ok(passesFilters("1988-08-03", filters!));
		assert.ok(passesFilters("1989-08-03", filters!));
		assert.ok(!passesFilters("1988-08-04", filters!));
		assert.ok(!passesFilters("1988-09-03", filters!));
	});

	await suite.test("the archive's own vocabulary", () => {
		assert.deepEqual([...parseQueryFilters("@sunday").filters!.weekdays], [0]);
		assert.deepEqual([...parseQueryFilters("@daily").filters!.weekdays].sort(), [1, 2, 3, 4, 5, 6]);
	});

	// A filter is deliberate syntax, so it may demand an unambiguous order instead of guessing.
	await suite.test("@date values are year first, never ambiguous", () => {
		const settled = parseQueryFilters("@date:1988/9/3").filters!;
		assert.ok(passesFilters("1988-09-03", settled));
		assert.ok(!passesFilters("1988-03-09", settled));
		assert.ok(passesFilters("1988-09-03", parseQueryFilters("@date:1988-sep-3").filters!));
		assert.ok(parseQueryFilters("@date:9/3/1988").filters!.impossible);
	});

	await suite.test("@date accepts a year, a month or a day", () => {
		assert.ok(passesFilters("1988-08-03", parseQueryFilters("@date:1988").filters!));
		assert.ok(passesFilters("1988-08-03", parseQueryFilters("@date:1988-08").filters!));
		assert.ok(!passesFilters("1988-09-03", parseQueryFilters("@date:1988-08").filters!));
		assert.ok(passesFilters("1988-08-03", parseQueryFilters("@date:19880803").filters!));
	});

	// The pair that settles the exclusive reading: "after 1987 and before 1990" is 1989.
	await suite.test("@before and @after exclude the whole span they name", () => {
		const { filters } = parseQueryFilters("@after:1987 @before:1990");
		assert.ok(passesFilters("1989-01-01", filters!));
		assert.ok(passesFilters("1989-12-31", filters!));
		assert.ok(!passesFilters("1987-12-31", filters!));
		assert.ok(!passesFilters("1990-01-01", filters!));
	});

	// Two bounds of the same kind are one field, so they union like every other repeated value —
	// the widest wins, and the order they were typed in cannot change the answer.
	await suite.test("repeated bounds union to the widest, whatever order they come in", () => {
		for (const query of ["@before:1990 @before:1993", "@before:1993 @before:1990"]) {
			const { filters } = parseQueryFilters(query);
			assert.ok(passesFilters("1992-06-01", filters!), query);
			assert.ok(!passesFilters("1993-06-01", filters!), query);
		}

		for (const query of ["@after:1990 @after:1987", "@after:1987 @after:1990"]) {
			const { filters } = parseQueryFilters(query);
			assert.ok(passesFilters("1988-06-01", filters!), query);
			assert.ok(!passesFilters("1987-06-01", filters!), query);
		}

		// Different fields still intersect, which is what makes a window expressible at all.
		const window = parseQueryFilters("@after:1986 @after:1988 @before:1993 @before:1991").filters!;
		assert.ok(passesFilters("1990-06-01", window));
		assert.ok(passesFilters("1992-06-01", window), "the wider @before wins");
		assert.ok(passesFilters("1988-06-01", window), "and so does the wider @after");
		assert.ok(!passesFilters("1986-06-01", window));
		assert.ok(!passesFilters("1993-06-01", window));
	});

	await suite.test("an unknown filter is left to the text search", () => {
		const { filters, residual, segments } = parseQueryFilters("@foo:bar");
		assert.equal(filters, null);
		assert.equal(residual, "@foo:bar");
		assert.deepEqual(segments, ["@foo:bar"]);
	});

	// A filter says where to look, not that something is there, so a year outside the archive is
	// a valid thing to write. `@after:1984` is how you say "from the beginning".
	await suite.test("a filter year need not be one the archive holds", () => {
		const early = parseQueryFilters("@after:1984").filters!;
		assert.ok(!early.impossible);
		assert.ok(passesFilters("1985-11-18", early));
		assert.ok(passesFilters("1995-12-31", early));

		const window = parseQueryFilters("@after:1984 @before:1987").filters!;
		assert.ok(passesFilters("1985-11-18", window));
		assert.ok(passesFilters("1986-06-01", window));
		assert.ok(!passesFilters("1987-01-01", window));

		// Valid but empty, rather than malformed: the two are indistinguishable to a reader, and
		// this way the rule is simply "a filter names a span".
		const future = parseQueryFilters("@year:2001").filters!;
		assert.ok(!future.impossible);
		// The predicate is about the date, not the archive — a 2001 date does pass a 2001 filter.
		// What makes the query empty is that the archive holds no such strip.
		assert.ok(!passesFilters("1988-08-03", future));
		assert.ok(passesFilters("2001-09-11", future));
		assert.ok(!parseQueryFilters("@date:2001-09-11").filters!.impossible);
		assert.ok(!parseQueryFilters("@before:2024").filters!.impossible);
		assert.ok(passesFilters("1988-08-03", parseQueryFilters("@before:2024").filters!));

		// A two-digit year still reads as the 1900s, which is the only century the strip ran in.
		assert.deepEqual([...parseQueryFilters("@year:88").filters!.years], [1988]);
		assert.deepEqual([...parseQueryFilters("@year:84").filters!.years], [1984]);
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
			// A book that is not one of the archive's is a typo rather than a place to look — unlike
			// `@year:2001`, which is a real coordinate that honestly holds nothing.
			"@sunday:yes",
			"@year",
			"@in",
			"@in:snowman",
		]) {
			assert.ok(parseQueryFilters(query).filters!.impossible, query);
			assert.ok(!passesFilters("1988-08-03", parseQueryFilters(query).filters!), query);
		}
	});

	// A filter lifted out of the middle of a query must not join the words either side of it.
	await suite.test("segments record where the filter was", () => {
		const middle = parseQueryFilters("clean @year:1988 your room");
		assert.deepEqual(middle.segments, ["clean", "your room"]);
		assert.equal(middle.residual, "clean your room");

		const leading = parseQueryFilters("@year:1988 clean your room");
		assert.deepEqual(leading.segments, ["clean your room"]);

		const none = parseQueryFilters("clean your room");
		assert.deepEqual(none.segments, ["clean your room"]);
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
		const { filters, residual } = parseQueryFilters(query);
		assert.equal(filters, null, `"${query}" now carries a filter; eval.test.ts measures a different engine`);
		assert.equal(residual, query);
	}
});

// `scanFilters` is what `parseQueryFilters` is built on, and it is also what paints the query box.
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
		const matches = scanFilters("@sunday @year:1988 snowman @month:aug");
		assert.deepEqual(
			matches.map((match) => match.name),
			["sunday", "year", "month"],
		);
		assert.ok(matches.every((match) => match.valid));
	});

	await suite.test("a flag is reported with no value", () => {
		const [match] = scanFilters("@daily");
		assert.equal(match.value, undefined);
		assert.ok(match.valid);
	});

	// The same list `parseQueryFilters` calls impossible, one entry at a time, so the box can point
	// at the filter that did it rather than at the whole query.
	await suite.test("a filter the parser cannot use is reported invalid", () => {
		for (const query of [
			"@month:13",
			"@year:abc",
			"@year:199",
			"@day:32",
			"@day:funday",
			"@before:august-3",
			"@sunday:yes",
			"@year",
			"@in",
			"@in:snowman",
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
	await suite.test("the spans account for exactly what parseQueryFilters removes", () => {
		const query = "clean @year:1988 your @sunday room";
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
			parseQueryFilters(query).residual,
		);
	});
});
