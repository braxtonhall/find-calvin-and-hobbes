import test from "node:test";
import assert from "node:assert/strict";
import { FILTER_FIELDS, FilterField, clearField, insertToken, removeToken, selectedTokens } from "../src/query-edit";

function field(name: string): FilterField {
	const found = FILTER_FIELDS.find((each) => each.name === name);
	assert.ok(found, `no ${name} field`);
	return found;
}

/** The labels a query lights up, per field, which is the whole of what the bar shows. */
function checked(text: string): Record<string, string[]> {
	const selected = selectedTokens(text);
	const painted: Record<string, string[]> = {};
	for (const each of FILTER_FIELDS) {
		const labels = each.options.filter((option) => selected.has(option.token)).map((option) => option.label);
		if (labels.length > 0) painted[each.name] = labels;
	}
	return painted;
}

test("the fields", async (suite) => {
	await suite.test("no token is reachable from two dropdowns", () => {
		const seen = new Set<string>();
		for (const each of FILTER_FIELDS) {
			for (const option of each.options) {
				assert.equal(seen.has(option.token), false, `${option.token} twice`);
				seen.add(option.token);
			}
		}
	});

	await suite.test("every value is one the archive could hold", () => {
		assert.equal(field("year").options[0].label, "1985");
		assert.equal(field("year").options.at(-1)!.label, "1995");
		assert.equal(field("month").options.length, 12);
		assert.equal(field("day").options.length, 31);
	});

	await suite.test("months are offered by their long spelling", () => {
		assert.deepEqual(
			field("month").options.map((option) => option.token),
			[
				"@month:january",
				"@month:february",
				"@month:march",
				"@month:april",
				"@month:may",
				"@month:june",
				"@month:july",
				"@month:august",
				"@month:september",
				"@month:october",
				"@month:november",
				"@month:december",
			],
		);
	});
});

test("projection: query text to checkmarks", async (suite) => {
	await suite.test("a canonical token checks its own box", () => {
		assert.deepEqual(checked("@year:1988"), { year: ["1988"] });
		assert.deepEqual(checked("@month:august"), { month: ["August"] });
		assert.deepEqual(checked("@day:3"), { day: ["3"] });
		assert.deepEqual(checked("@sunday"), { format: ["Sundays"] });
		assert.deepEqual(checked("@daily"), { format: ["Dailies"] });
	});

	await suite.test("a hand-typed spelling checks the same box", () => {
		assert.deepEqual(checked("@year:88"), { year: ["1988"] });
		assert.deepEqual(checked("@month:aug"), { month: ["August"] });
		assert.deepEqual(checked("@month:8"), { month: ["August"] });
		assert.deepEqual(checked("@DAY:03"), { day: ["3"] });
	});

	await suite.test("repeating a filter checks both", () => {
		assert.deepEqual(checked("@year:1988 @year:1990"), { year: ["1988", "1990"] });
	});

	await suite.test("checkmarks survive the words around them", () => {
		assert.deepEqual(checked("clean @year:1988 your room @sunday"), { year: ["1988"], format: ["Sundays"] });
	});

	await suite.test("what the bar has no box for checks nothing anywhere", () => {
		assert.deepEqual(checked("@month:13"), {});
		assert.deepEqual(checked("@day:saturday"), {});
		assert.deepEqual(checked("@date:1988/9/3"), {});
		assert.deepEqual(checked("@before:1990 @after:1987"), {});
		assert.deepEqual(checked("@year:2001"), {});
		// A flag carrying a value is a misreading of the syntax, not a narrower query.
		assert.deepEqual(checked("@sunday:yes"), {});
		assert.deepEqual(checked("snow goons"), {});
	});
});

test("insert: checkmarks to query text", async (suite) => {
	await suite.test("an empty box gets the token and nothing else", () => {
		assert.equal(insertToken("", "@year:1990"), "@year:1990");
		assert.equal(insertToken("   ", "@sunday"), "@sunday");
	});

	await suite.test("the token is appended to a query that has no filter of its field", () => {
		assert.equal(insertToken("snow goons", "@year:1990"), "snow goons @year:1990");
		assert.equal(insertToken("snow goons ", "@year:1990"), "snow goons @year:1990");
	});

	await suite.test("a second year lands beside the first, not at the end of the sentence", () => {
		assert.equal(insertToken("@year:1988 snow goons", "@year:1990"), "@year:1988 @year:1990 snow goons");
		assert.equal(insertToken("@year:88 snow goons", "@year:1990"), "@year:88 @year:1990 snow goons");
	});

	await suite.test("a field collects beside its own name and no other", () => {
		assert.equal(insertToken("@year:1988 @month:august", "@year:1990"), "@year:1988 @year:1990 @month:august");
		assert.equal(insertToken("@year:1988 @month:august", "@day:3"), "@year:1988 @month:august @day:3");
		// The two flags are one field, so the second joins the first.
		assert.equal(insertToken("@sunday snowman", "@daily"), "@sunday @daily snowman");
	});

	await suite.test("the words keep their order and their single spaces", () => {
		assert.equal(insertToken("clean @year:1988 your room", "@year:1990"), "clean @year:1988 @year:1990 your room");
		assert.equal(insertToken("clean your room", "@month:august"), "clean your room @month:august");
	});
});

test("remove: unchecking a box", async (suite) => {
	await suite.test("a differently spelled token clears from its own checkbox", () => {
		assert.equal(removeToken("@year:88", "@year:1988"), "");
		assert.equal(removeToken("@month:aug snowman", "@month:august"), "snowman");
	});

	await suite.test("every span that says the same thing goes", () => {
		assert.equal(removeToken("@year:1988 snow @year:88 goons", "@year:1988"), "snow goons");
	});

	await suite.test("the surrounding words and the other tokens are left alone", () => {
		assert.equal(removeToken("clean @year:1988 your room", "@year:1988"), "clean your room");
		assert.equal(
			removeToken("@day:saturday @year:1988 @day:3", "@day:3"),
			"@day:saturday @year:1988",
			"the weekday half of @day: is not the bar's to touch",
		);
		assert.equal(removeToken("@date:1988/9/3 snowman", "@year:1988"), "@date:1988/9/3 snowman");
	});

	await suite.test("whitespace collapses", () => {
		assert.equal(removeToken("clean  @year:1988  your room", "@year:1988"), "clean your room");
		assert.equal(removeToken("@year:1988 snowman", "@year:1988"), "snowman");
		assert.equal(removeToken("snowman @year:1988", "@year:1988"), "snowman");
		assert.equal(removeToken("@year:1988", "@year:1988"), "");
	});

	await suite.test("a box that was not checked is not an edit", () => {
		assert.equal(removeToken("@year:1988 snowman", "@year:1990"), "@year:1988 snowman");
	});
});

test("clear: the whole field at once", async (suite) => {
	await suite.test("every token the field has a box for", () => {
		assert.equal(clearField("@year:1988 @year:90 snow @month:august goons", field("year")), "snow @month:august goons");
		assert.equal(clearField("@sunday @daily snowman", field("format")), "snowman");
	});

	await suite.test("and nothing it merely shares a name with", () => {
		assert.equal(clearField("@day:3 @day:saturday @day:17", field("day")), "@day:saturday");
	});

	await suite.test("a field with no selection is not an edit", () => {
		assert.equal(clearField("snow goons", field("month")), "snow goons");
	});
});

test("round trip", async (suite) => {
	const queries = [
		"",
		"snow goons",
		"clean @year:1988 your room",
		"@day:saturday snowman",
		"@month:aug @day:3",
		"  spaceman   spiff  ",
	];
	const tokens = ["@year:1990", "@month:august", "@day:3", "@sunday", "@daily"];

	for (const query of queries) {
		for (const token of tokens) {
			// A value the query already asserts is a different story: unchecking it clears every
			// token that says it, the reader's own `@month:aug` included, which is the point of
			// unchecking rather than a failure to round trip.
			if (selectedTokens(query).has(token)) continue;
			await suite.test(`check then uncheck ${token} in "${query}"`, () => {
				const inserted = insertToken(query, token);
				assert.notEqual(inserted, query);
				assert.equal(selectedTokens(inserted).has(token), true);
				// Trailing space and all, except where the token was appended onto one: a query is
				// left with no space on its end, which is the same promise unchecking makes.
				assert.equal(removeToken(inserted, token), query.replace(/\s+$/, ""));
			});
		}
	}
});
