import test from "node:test";
import assert from "node:assert/strict";
import type { Day } from "../src/types";
import type { GridLevel } from "../src/site-config";
import { Light, boxLook, layoutPage, pageCount, pageOf, resolvePeriods } from "../src/grid-layout";

/**
 * The grid's layout: where each level's boxes go, which page holds which days, and what colour a
 * box standing for many days takes.
 */

/** Every day from `start` to `end`, with a strip on each but those in `none`. */
function run(start: string, end: string, none: string[] = []): Day[] {
	const days: Day[] = [];
	for (let date = new Date(`${start}T00:00:00Z`); date <= new Date(`${end}T00:00:00Z`);) {
		const iso = date.toISOString().slice(0, 10);
		days.push({
			date: iso,
			weekIndex: 0,
			dayOfWeek: date.getUTCDay(),
			state: none.includes(iso) ? "none" : "has-comic",
		});
		date.setUTCDate(date.getUTCDate() + 1);
	}
	return days;
}

const DAYS: GridLevel = { unit: "day", columns: 7, paged: false };

test("periods", async (suite) => {
	await suite.test("end the day before the next begins, cut to the run", () => {
		const periods = resolvePeriods(
			[
				{ label: "1950s", start: "1950-01-01" },
				{ label: "1960s", start: "1960-01-01" },
			],
			"1950-10-02",
			"1965-02-13",
		);
		assert.deepEqual(periods, [
			{ label: "1950s", start: "1950-10-02", end: "1959-12-31" },
			{ label: "1960s", start: "1960-01-01", end: "1965-02-13" },
		]);
	});

	await suite.test("fold whatever lies outside them into the first and last", () => {
		const periods = resolvePeriods(
			[
				{ label: "early", start: "1990-01-01" },
				{ label: "late", start: "1995-01-01" },
			],
			"1985-11-18",
			"2000-02-13",
		);
		assert.deepEqual(
			periods.map((period) => [period.start, period.end]),
			[
				["1985-11-18", "1994-12-31"],
				["1995-01-01", "2000-02-13"],
			],
		);
	});

	await suite.test("drop one with no day of the run in it", () => {
		const periods = resolvePeriods(
			[
				{ label: "a", start: "1985-01-01" },
				{ label: "b", start: "2001-01-01" },
			],
			"1985-11-18",
			"1995-12-31",
		);
		assert.deepEqual(
			periods.map((period) => period.label),
			["a"],
		);
	});
});

test("layoutPage", async (suite) => {
	await suite.test("draws days a week to a row, Monday first, as the grid always has", () => {
		// 1985-11-18 was a Monday; 1985-11-20 a Wednesday.
		const page = layoutPage(run("1985-11-20", "1985-12-01"), DAYS, [], 0);
		assert.equal(page.boxes.length, 12);
		assert.deepEqual(
			page.boxes.slice(0, 6).map((box) => [box.row, box.col]),
			[
				[0, 2],
				[0, 3],
				[0, 4],
				[0, 5],
				[0, 6],
				[1, 0],
			],
		);
		assert.equal(page.rows, 2);
	});

	await suite.test("lines months up with the calendar, whatever month the run starts in", () => {
		const level: GridLevel = { unit: "month", columns: 6, paged: false };
		const page = layoutPage(run("1985-11-18", "1986-07-02"), level, [], 0);
		assert.deepEqual(
			page.boxes.map((box) => [box.start.slice(0, 7), box.row, box.col]),
			[
				["1985-11", 0, 4],
				["1985-12", 0, 5],
				["1986-01", 1, 0],
				["1986-02", 1, 1],
				["1986-03", 1, 2],
				["1986-04", 1, 3],
				["1986-05", 1, 4],
				["1986-06", 1, 5],
				["1986-07", 2, 0],
			],
		);
		assert.equal(page.boxes[0].start, "1985-11-18");
		assert.equal(page.boxes[8].end, "1986-07-02");
		assert.deepEqual(
			page.labels.map((span) => [span.text, span.startRow, span.endRow]),
			[
				["'85", 0, 1],
				["'86", 1, 3],
			],
		);
	});

	await suite.test("draws one period a page, splitting a week the periods split", () => {
		const days = run("1989-12-01", "1990-01-31");
		const periods = resolvePeriods(
			[
				{ label: "80s", start: "1980-01-01" },
				{ label: "90s", start: "1990-01-01" },
			],
			days[0].date,
			days[days.length - 1].date,
		);
		const weeks: GridLevel = { unit: "week", columns: 4, paged: true };
		assert.equal(pageCount(weeks, periods), 2);
		assert.equal(pageOf("1990-01-03", weeks, periods), 1);

		const eighties = layoutPage(days, weeks, periods, 0);
		const nineties = layoutPage(days, weeks, periods, 1);
		// 1990-01-01 was a Monday, so its week is wholly the nineties'; the week before ends on New Year's Eve.
		assert.equal(eighties.boxes[eighties.boxes.length - 1].end, "1989-12-31");
		assert.equal(nineties.boxes[0].start, "1990-01-01");
		assert.equal(nineties.boxes[0].row, 0);
	});

	await suite.test("gives a row two labels would start in to the later one", () => {
		// Six weeks to a row: some rows begin two months, and only the later is labelled.
		const page = layoutPage(run("1990-01-01", "1990-12-31"), { unit: "week", columns: 6, paged: false }, [], 0);
		const rows = page.narrowLabels.map((span) => span.startRow);
		assert.deepEqual(
			rows,
			[...new Set(rows)].sort((one, other) => one - other),
		);
		assert.ok(page.narrowLabels.length < 12);
		for (const span of page.narrowLabels) assert.ok(span.endRow > span.startRow);
		// The last label still runs to the end of the page.
		assert.equal(page.narrowLabels[page.narrowLabels.length - 1].endRow, page.rows);
	});

	await suite.test("gives decades to the years and nothing to the periods", () => {
		const days = run("1985-11-18", "1995-12-31");
		const years = layoutPage(days, { unit: "year", columns: 2, paged: false }, [], 0);
		assert.equal(years.boxes.length, 11);
		assert.deepEqual(
			years.labels.map((span) => span.name),
			["1980s", "1990s"],
		);
		const periods = resolvePeriods([{ label: "all", start: "1985-01-01" }], days[0].date, days[days.length - 1].date);
		const whole = layoutPage(days, { unit: "period", columns: 1, paged: false }, periods, 0);
		assert.equal(whole.boxes.length, 1);
		assert.equal(whole.labels.length, 0);
	});
});

test("boxLook", async (suite) => {
	const days = run("1990-01-01", "1990-01-03", ["1990-01-03"]);
	const box = { first: 0, last: 2, start: "1990-01-01", end: "1990-01-03", row: 0, col: 0 };
	const lit = (lights: Record<string, Light>) => (date: string) => lights[date];

	await suite.test("is a strip's colour when any day has one, on a page that lights nothing", () => {
		assert.deepEqual(boxLook(days, box, undefined), { hasComic: true, light: undefined });
		const allGrey = run("1990-01-01", "1990-01-02", ["1990-01-01", "1990-01-02"]);
		assert.deepEqual(boxLook(allGrey, { ...box, last: 1 }, undefined), { hasComic: false, light: undefined });
	});

	await suite.test("takes the strongest match, over any number of misses", () => {
		const look = boxLook(days, box, lit({ "1990-01-01": 2, "1990-01-02": 4, "1990-01-03": false }));
		assert.deepEqual(look, { hasComic: true, light: 4 });
	});

	await suite.test("is a dimmed strip, not a dimmed grey, when nothing matched", () => {
		const look = boxLook(days, box, lit({ "1990-01-01": false, "1990-01-02": false, "1990-01-03": false }));
		assert.deepEqual(look, { hasComic: true, light: false });
	});

	await suite.test("shows a matched rerun over a missed strip, grey as a rerun's cell is", () => {
		const look = boxLook(days, box, lit({ "1990-01-01": false, "1990-01-02": false, "1990-01-03": 3 }));
		assert.deepEqual(look, { hasComic: false, light: true });
	});

	await suite.test("shows a matched strip over a matched rerun", () => {
		const look = boxLook(days, box, lit({ "1990-01-01": 1, "1990-01-02": false, "1990-01-03": 5 }));
		assert.deepEqual(look, { hasComic: true, light: 1 });
	});
});
