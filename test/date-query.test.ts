import test from "node:test";
import assert from "node:assert/strict";
import { DateExpression, matchesExpression, parseDateExpression } from "../src/date-query";

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
