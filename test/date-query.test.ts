import test from "node:test";
import assert from "node:assert/strict";
import {
	DateExpression,
	matchesExpression,
	parseDateExpression,
	parseDateFilters,
	passesFilters,
	scanFilters,
} from "../src/date-query";
import { DESCRIBED, RECITED } from "./fixtures/golden";
import { loadGenerated } from "./helpers/queries";

function parsed(query: string): DateExpression {
	const expression = parseDateExpression(query);
	assert.ok(expression, `expected "${query}" to parse as a date`);
	return expression;
}

/** Every date in 1985-1995 the expression matches, so a form can be pinned by its whole reach. */
function reach(query: string): string[] {
	const expression = parsed(query);
	const dates: string[] = [];
	for (let year = 1985; year <= 1995; year++) {
		for (let month = 1; month <= 12; month++) {
			for (let day = 1; day <= 31; day++) {
				const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
				const real = new Date(`${date}T00:00:00Z`);
				if (real.getUTCMonth() !== month - 1 || real.getUTCDate() !== day) continue;
				if (matchesExpression(expression, date)) dates.push(date);
			}
		}
	}
	return dates;
}

test("one date, written every way a reader might write it", async (suite) => {
	const forms = [
		"1988-08-03",
		"1988/8/3",
		"1988.08.03",
		"1988 08 03",
		"19880803",
		"aug 3, 1988",
		"aug. 3 1988",
		"august 3rd 1988",
		"3 august 1988",
		"1988 august 3",
		"august 3 1988",
		"wednesday, august 3, 1988",
		"wed august 3 1988",
		"aug 3 '88",
	];

	for (const form of forms) {
		await suite.test(form, () => {
			assert.deepEqual(reach(form), ["1988-08-03"]);
			assert.equal(parsed(form).precision, "exact");
		});
	}
});

test("an ambiguous numeric date means both readings", async (suite) => {
	await suite.test("a pair of small numbers with a year is two dates", () => {
		assert.deepEqual(reach("9/3/1988"), ["1988-03-09", "1988-09-03"]);
	});

	// The unambiguous form is how a reader says which one they meant, so it must not also offer
	// the other reading.
	await suite.test("a leading year settles it", () => {
		assert.deepEqual(reach("1988/9/3"), ["1988-09-03"]);
		assert.deepEqual(reach("1988-09-03"), ["1988-09-03"]);
	});

	await suite.test("a number above twelve can only be a day", () => {
		assert.deepEqual(reach("13/8/1988"), ["1988-08-13"]);
		assert.deepEqual(reach("12/25/1988"), ["1988-12-25"]);
	});

	// 1988-09-03 was a Saturday and 1988-03-09 a Wednesday, so the weekday is not decoration
	// here — it is the thing that decides which date was meant.
	await suite.test("a weekday disambiguates rather than merely agreeing", () => {
		assert.deepEqual(reach("wednesday 9/3/1988"), ["1988-03-09"]);
		assert.deepEqual(reach("saturday 9/3/1988"), ["1988-09-03"]);
	});
});

test("a partial date reaches every strip it could name", async (suite) => {
	await suite.test("a month and a year", () => {
		for (const form of ["august 1988", "1988-08", "8/1988", "198808"]) {
			assert.equal(reach(form).length, 31, form);
			assert.equal(reach(form)[0], "1988-08-01", form);
			assert.equal(parsed(form).precision, "narrow", form);
		}
	});

	// Separator identity is gone by the time the tokens are assembled, so a month and year written
	// with a space is the same thing as one written with a dash. Both have to work.
	await suite.test("a month and year separated by a space", () => {
		assert.deepEqual(reach("1988 3"), reach("1988-03"));
		assert.equal(reach("1988 3").length, 31);
	});

	await suite.test("a bare year", () => {
		assert.equal(reach("1988").length, 366);
		assert.equal(parsed("1988").precision, "broad");
	});

	// A year with a weekday is one day in seven of that year, not the whole of it, so it must not
	// carry the same strength as a bare year.
	await suite.test("a year with a weekday is narrow, not broad", () => {
		const sundays = reach("sunday 1988");
		assert.equal(sundays.length, 52);
		assert.equal(parsed("sunday 1988").precision, "narrow");
		assert.ok(sundays.every((date) => new Date(`${date}T00:00:00Z`).getUTCDay() === 0));
	});

	await suite.test("february 29th exists in the years that had one", () => {
		assert.deepEqual(reach("february 29 1988"), ["1988-02-29"]);
		assert.equal(parseDateExpression("february 29 1989"), null);
	});
});

test("what is not a date", async (suite) => {
	const rejected: [string, string][] = [
		["august", "a bare month is an ordinary word"],
		["may", "and so is the one that is also a verb"],
		["march", "and the one that is also a noun"],
		["sunday", "a bare weekday is an ordinary word"],
		["3rd", "a bare day names nothing"],
		["august 3", "a month and a day name a day in every year, which is `@month:august @day:3`"],
		["august 3rd", "however it is spelled"],
		["9/3", "and however it is written"],
		["12/25", "christmas every year is a filter, not a date"],
		["february 29", "a real day, but in no year in particular"],
		["sunday august 3", "a weekday cannot supply the missing year either"],
		["88", "a bare two-digit number collides with prose"],
		["rosalyn", "an ordinary query"],
		["1988 rosalyn", "one stray word is enough"],
		["1988 august rosalyn", "the whole query has to be the date"],
		["1988 1990", "a second year cannot be placed"],
		["1812", "outside the archive"],
		["2001-09-11", "outside the archive, in full"],
		["the 1812 overture has cannons in the percussion", "a real generated fixture query"],
		["35-ton behemoth", "another one"],
		["11 1/2", "prose numbers"],
		["13/13/1988", "no month can be thirteen"],
		["february 30 1988", "not a real day"],
		["august 32", "nor is that"],
		["thursday august 3 1988", "1988-08-03 was a Wednesday"],
		["", "nothing at all"],
	];

	for (const [query, reason] of rejected) {
		await suite.test(`${JSON.stringify(query)} — ${reason}`, () => {
			assert.equal(parseDateExpression(query), null);
		});
	}
});

test("filters", async (suite) => {
	await suite.test("a filter is lifted out and the rest is the query", () => {
		const { filters, residual } = parseDateFilters("@year:1988 rosalyn");
		assert.ok(filters);
		assert.deepEqual([...filters.years], [1988]);
		assert.equal(residual, "rosalyn");
	});

	await suite.test("a month is named or numbered", () => {
		for (const value of ["8", "08", "aug", "august"]) {
			const { filters } = parseDateFilters(`@month:${value}`);
			assert.deepEqual([...filters!.months], [8], value);
		}
	});

	await suite.test("values of one field union", () => {
		const { filters } = parseDateFilters("@year:1988 @year:1989");
		assert.deepEqual([...filters!.years].sort(), [1988, 1989]);
		assert.ok(passesFilters("1988-06-01", filters!));
		assert.ok(passesFilters("1989-06-01", filters!));
		assert.ok(!passesFilters("1990-06-01", filters!));
	});

	await suite.test("fields intersect", () => {
		const { filters } = parseDateFilters("@year:1988 @month:8");
		assert.ok(passesFilters("1988-08-03", filters!));
		assert.ok(!passesFilters("1988-09-03", filters!));
		assert.ok(!passesFilters("1989-08-03", filters!));
	});

	// `@day` carries two kinds of value, and they are two fields under one name: same kind
	// unions, different kinds intersect. Anything else makes the weekend inexpressible.
	await suite.test("@day takes a day of the month or a day of the week", () => {
		assert.deepEqual([...parseDateFilters("@day:3").filters!.monthDays], [3]);
		assert.equal(parseDateFilters("@day:3").filters!.weekdays.size, 0);
		assert.deepEqual([...parseDateFilters("@day:mon").filters!.weekdays], [1]);
		assert.deepEqual([...parseDateFilters("@day:monday").filters!.weekdays], [1]);
		assert.deepEqual([...parseDateFilters("@day:saturday @day:sunday").filters!.weekdays].sort(), [0, 6]);
		assert.deepEqual([...parseDateFilters("@day:1 @day:15").filters!.monthDays].sort(), [1, 15]);
	});

	await suite.test("a day of the month and a day of the week narrow each other", () => {
		const { filters } = parseDateFilters("@day:1 @day:monday");
		assert.deepEqual([...filters!.monthDays], [1]);
		assert.deepEqual([...filters!.weekdays], [1]);
		assert.ok(passesFilters("1988-08-01", filters!), "a Monday, and the first");
		assert.ok(!passesFilters("1988-08-08", filters!), "a Monday, not the first");
		assert.ok(!passesFilters("1988-05-01", filters!), "the first, a Sunday");
	});

	// A date only ever gets more specific, so `august 3` is not one. This is where a reader says
	// which fields they meant, and it is the reason nothing is lost by rejecting the bare form.
	await suite.test("a day in every year is what the filters are for", () => {
		const { filters } = parseDateFilters("@month:august @day:3");
		assert.ok(passesFilters("1988-08-03", filters!));
		assert.ok(passesFilters("1989-08-03", filters!));
		assert.ok(!passesFilters("1988-08-04", filters!));
		assert.ok(!passesFilters("1988-09-03", filters!));
	});

	await suite.test("the archive's own vocabulary", () => {
		assert.deepEqual([...parseDateFilters("@sunday").filters!.weekdays], [0]);
		assert.deepEqual([...parseDateFilters("@daily").filters!.weekdays].sort(), [1, 2, 3, 4, 5, 6]);
	});

	// A filter is deliberate syntax, so it may demand an unambiguous order instead of guessing.
	await suite.test("@date values are year first, never ambiguous", () => {
		const settled = parseDateFilters("@date:1988/9/3").filters!;
		assert.ok(passesFilters("1988-09-03", settled));
		assert.ok(!passesFilters("1988-03-09", settled));
		assert.ok(passesFilters("1988-09-03", parseDateFilters("@date:1988-sep-3").filters!));
		assert.ok(parseDateFilters("@date:9/3/1988").filters!.impossible);
	});

	await suite.test("@date accepts a year, a month or a day", () => {
		assert.ok(passesFilters("1988-08-03", parseDateFilters("@date:1988").filters!));
		assert.ok(passesFilters("1988-08-03", parseDateFilters("@date:1988-08").filters!));
		assert.ok(!passesFilters("1988-09-03", parseDateFilters("@date:1988-08").filters!));
		assert.ok(passesFilters("1988-08-03", parseDateFilters("@date:19880803").filters!));
	});

	// The pair that settles the exclusive reading: "after 1987 and before 1990" is 1989.
	await suite.test("@before and @after exclude the whole span they name", () => {
		const { filters } = parseDateFilters("@after:1987 @before:1990");
		assert.ok(passesFilters("1989-01-01", filters!));
		assert.ok(passesFilters("1989-12-31", filters!));
		assert.ok(!passesFilters("1987-12-31", filters!));
		assert.ok(!passesFilters("1990-01-01", filters!));
	});

	// Two bounds of the same kind are one field, so they union like every other repeated value —
	// the widest wins, and the order they were typed in cannot change the answer.
	await suite.test("repeated bounds union to the widest, whatever order they come in", () => {
		for (const query of ["@before:1990 @before:1993", "@before:1993 @before:1990"]) {
			const { filters } = parseDateFilters(query);
			assert.ok(passesFilters("1992-06-01", filters!), query);
			assert.ok(!passesFilters("1993-06-01", filters!), query);
		}

		for (const query of ["@after:1990 @after:1987", "@after:1987 @after:1990"]) {
			const { filters } = parseDateFilters(query);
			assert.ok(passesFilters("1988-06-01", filters!), query);
			assert.ok(!passesFilters("1987-06-01", filters!), query);
		}

		// Different fields still intersect, which is what makes a window expressible at all.
		const window = parseDateFilters("@after:1986 @after:1988 @before:1993 @before:1991").filters!;
		assert.ok(passesFilters("1990-06-01", window));
		assert.ok(passesFilters("1992-06-01", window), "the wider @before wins");
		assert.ok(passesFilters("1988-06-01", window), "and so does the wider @after");
		assert.ok(!passesFilters("1986-06-01", window));
		assert.ok(!passesFilters("1993-06-01", window));
	});

	await suite.test("an unknown filter is left to the text search", () => {
		const { filters, residual, segments } = parseDateFilters("@foo:bar");
		assert.equal(filters, null);
		assert.equal(residual, "@foo:bar");
		assert.deepEqual(segments, ["@foo:bar"]);
	});

	// A filter says where to look, not that something is there, so a year outside the archive is
	// a valid thing to write. `@after:1984` is how you say "from the beginning".
	await suite.test("a filter year need not be one the archive holds", () => {
		const early = parseDateFilters("@after:1984").filters!;
		assert.ok(!early.impossible);
		assert.ok(passesFilters("1985-11-18", early));
		assert.ok(passesFilters("1995-12-31", early));

		const window = parseDateFilters("@after:1984 @before:1987").filters!;
		assert.ok(passesFilters("1985-11-18", window));
		assert.ok(passesFilters("1986-06-01", window));
		assert.ok(!passesFilters("1987-01-01", window));

		// Valid but empty, rather than malformed: the two are indistinguishable to a reader, and
		// this way the rule is simply "a filter names a span".
		const future = parseDateFilters("@year:2001").filters!;
		assert.ok(!future.impossible);
		// The predicate is about the date, not the archive — a 2001 date does pass a 2001 filter.
		// What makes the query empty is that the archive holds no such strip.
		assert.ok(!passesFilters("1988-08-03", future));
		assert.ok(passesFilters("2001-09-11", future));
		assert.ok(!parseDateFilters("@date:2001-09-11").filters!.impossible);
		assert.ok(!parseDateFilters("@before:2024").filters!.impossible);
		assert.ok(passesFilters("1988-08-03", parseDateFilters("@before:2024").filters!));

		// A two-digit year still reads as the 1900s, which is the only century the strip ran in.
		assert.deepEqual([...parseDateFilters("@year:88").filters!.years], [1988]);
		assert.deepEqual([...parseDateFilters("@year:84").filters!.years], [1984]);
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
			"@sunday:yes",
			"@year",
		]) {
			assert.ok(parseDateFilters(query).filters!.impossible, query);
			assert.ok(!passesFilters("1988-08-03", parseDateFilters(query).filters!), query);
		}
	});

	// A filter lifted out of the middle of a query must not join the words either side of it.
	await suite.test("segments record where the filter was", () => {
		const middle = parseDateFilters("clean @year:1988 your room");
		assert.deepEqual(middle.segments, ["clean", "your room"]);
		assert.equal(middle.residual, "clean your room");

		const leading = parseDateFilters("@year:1988 clean your room");
		assert.deepEqual(leading.segments, ["clean your room"]);

		const none = parseDateFilters("clean your room");
		assert.deepEqual(none.segments, ["clean your room"]);
	});
});

/**
 * The guard that makes the evaluation thresholds in `test/eval.test.ts` safe. Date search is
 * additive — it only ever fires when the whole query is a date, or when an `@` filter is
 * present — so as long as no fixture query does either, the engine those thresholds measure is
 * untouched. Two queries come close and are the reason this is worth asserting rather than
 * assuming: "the 1812 overture has cannons in the percussion" and "The 35-ton behemoth...".
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
		const { filters, residual } = parseDateFilters(query);
		assert.equal(filters, null, `"${query}" now carries a filter; eval.test.ts measures a different engine`);
		assert.equal(residual, query);
	}
});

// `scanFilters` is what `parseDateFilters` is built on, and it is also what paints the query box.
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

	// The same list `parseDateFilters` calls impossible, one entry at a time, so the box can point
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
	await suite.test("the spans account for exactly what parseDateFilters removes", () => {
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
			parseDateFilters(query).residual,
		);
	});
});
