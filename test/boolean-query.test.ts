import test from "node:test";
import assert from "node:assert/strict";
import { Branch, admits, negatedFilters, parseQuery } from "../src/boolean-query";

/** The branches as their words, and whether a day survives each — the shape a reader can check. */
function shape(query: string): string[][] {
	return parseQuery(query).map((branch) => branch.segments);
}

function keeps(query: string, date: string, contains?: (text: string) => boolean): boolean {
	return parseQuery(query).some((branch: Branch) => admits(branch, date, undefined, contains));
}

test("operators", async (suite) => {
	await suite.test("a query without an operator is one branch, as it always was", () => {
		assert.deepEqual(shape("clean your room"), [["clean your room"]]);
		assert.deepEqual(shape("clean @year:1988 your room"), [["clean", "your room"]]);
	});

	// Google's precedence: `@or` takes the atom either side, and side by side is looser.
	await suite.test("@or binds tighter than side by side", () => {
		assert.deepEqual(shape("rosalyn @or baby sitter"), [["rosalyn", "sitter"], ["baby sitter"]]);
		assert.deepEqual(shape("rosalyn @or (baby sitter)"), [["rosalyn"], ["baby sitter"]]);
	});

	await suite.test("a group distributes over the words beside it", () => {
		assert.deepEqual(shape("(rosalyn @or babysitter) pizza"), [["rosalyn", "pizza"], ["babysitter pizza"]]);
	});

	// Two words are a phrase only where the reader wrote them side by side. A parenthesis is not
	// something written between them; an operator or another word is.
	await suite.test("distributed words are a phrase only where they were written as one", () => {
		assert.deepEqual(shape("calvin @or hobbes snow"), [["calvin", "snow"], ["hobbes snow"]]);
		assert.deepEqual(shape("(calvin) (hobbes)"), [["calvin hobbes"]]);
	});

	await suite.test("@and is a space", () => {
		assert.deepEqual(shape("calvin @and hobbes"), [["calvin", "hobbes"]]);
		assert.deepEqual(shape("@AND calvin @Or hobbes"), [["calvin"], ["hobbes"]]);
	});

	await suite.test("@not takes one atom", () => {
		const has =
			(...words: string[]) =>
			(text: string) =>
				words.includes(text);
		assert.ok(keeps("@not baby sitter", "1988-01-01", has("sitter")), "sitter without baby");
		assert.ok(!keeps("@not baby sitter", "1988-01-01", has("baby", "sitter")));
		assert.deepEqual(shape("@not baby sitter"), [["sitter"]]);
		// Anything but both.
		assert.ok(keeps("@not (baby sitter)", "1988-01-01", has("baby")));
		assert.ok(keeps("@not (baby sitter)", "1988-01-01", has("sitter")));
		assert.ok(!keeps("@not (baby sitter)", "1988-01-01", has("baby", "sitter")));
	});

	await suite.test("@not on a filter", () => {
		assert.ok(!keeps("@not @year:1988", "1988-08-03"));
		assert.ok(keeps("@not @year:1988", "1989-08-03"));
		assert.ok(keeps("@not @not @year:1988", "1988-08-03"));
		assert.ok(keeps("@not (@year:1988 @or @year:1989)", "1990-08-03"));
		assert.ok(!keeps("@not (@year:1988 @or @year:1989)", "1989-08-03"));
	});

	// One branch per distinct set of words, however many clauses distribution made of it, so the
	// words are ranked once rather than once per clause.
	await suite.test("clauses over the same words are one branch", () => {
		const branches = parseQuery("calvin @not (baby sitter)");
		assert.equal(branches.length, 1);
		assert.deepEqual(branches[0].segments, ["calvin"]);
		assert.equal(branches[0].clauses.length, 2);

		assert.equal(parseQuery("@in:book1 @or @in:book3").length, 1);
	});

	// An `@or` of one widening field is more of the same, so the third year joins it rather than
	// having to hold alongside it.
	await suite.test("an @or of one field widens with the rest of that field", () => {
		for (const date of ["1988-08-03", "1989-08-03", "1990-08-03"]) {
			assert.ok(keeps("@year:1988 @or @year:1989 @year:1990", date));
			assert.ok(keeps("@year:1990 @year:1988 @or @year:1989", date));
			assert.ok(keeps("(@year:1988 @or @year:1989) @year:1990", date));
		}
		assert.ok(!keeps("@year:1988 @or @year:1989 @year:1990", "1991-08-03"));
	});

	await suite.test("an @or of anything else does not", () => {
		// Snow or 1988, and 1990: a 1988 strip without snow is out.
		assert.ok(!keeps("@year:1988 @or snow @year:1990", "1988-08-03"));
		// A day of the month and a day of the week are different fields.
		assert.ok(!keeps("@day:3 @or @day:4 @day:monday", "1988-08-03"));
		assert.ok(keeps("@day:3 @or @day:4 @day:wednesday", "1988-08-03"));
		// `@and` is still both.
		assert.ok(!keeps("@year:1988 @or @year:1989 @and @year:1990", "1988-08-03"));
	});

	await suite.test("a broken filter sinks its own clause and no other", () => {
		assert.deepEqual(parseQuery("@month:13"), []);
		assert.deepEqual(parseQuery("@not @month:13"), []);
		assert.deepEqual(shape("@month:13 @or snow"), [["snow"]]);
	});

	// It runs on every keystroke, and a query half typed is not a mistake.
	await suite.test("a half-written query still parses", () => {
		assert.deepEqual(shape("(rosalyn @or baby"), [["rosalyn"], ["baby"]]);
		assert.deepEqual(shape("rosalyn) baby"), [["rosalyn baby"]]);
		assert.deepEqual(shape("rosalyn @or"), [["rosalyn"]]);
		assert.deepEqual(shape("@or rosalyn"), [["rosalyn"]]);
		assert.deepEqual(shape("rosalyn @not"), [["rosalyn"]]);
		assert.deepEqual(shape("()"), []);
		assert.deepEqual(shape("@or"), []);
	});

	// An operator is a bare name: with a colon or more letters it is something else.
	await suite.test("only a bare name is an operator", () => {
		assert.deepEqual(shape("@orange"), [["@orange"]]);
		assert.deepEqual(shape("@or:x"), [["@or:x"]]);
		assert.deepEqual(shape("bill@or ben"), [["bill"], ["ben"]]);
	});

	await suite.test("a parenthesis ends a filter's value", () => {
		assert.ok(keeps("(@year:1988)", "1988-08-03"));
		assert.ok(keeps("(@year:1989 @or @year:1988)", "1988-08-03"));
	});

	await suite.test("distribution past its limit is refused rather than searched", () => {
		const pair = "(a @or b)";
		assert.equal(parseQuery(Array(8).fill(pair).join(" ")).length, 256);
		assert.deepEqual(parseQuery(Array(9).fill(pair).join(" ")), []);
	});

	await suite.test("which filters stand under @not", () => {
		const starts = (query: string) => [...negatedFilters(query)];
		assert.deepEqual(starts("@year:1988"), []);
		assert.deepEqual(starts("@not @year:1988"), [5]);
		assert.deepEqual(starts("@not (snow @or @year:1988) @year:1989"), [15]);
		assert.deepEqual(starts("@not @not @year:1988"), []);
	});
});
