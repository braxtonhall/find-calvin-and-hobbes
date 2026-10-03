import test from "node:test";
import assert from "node:assert/strict";
import { registerVocabulary } from "../src/filter-vocabulary";
import {
	FILTER_FIELDS,
	FilterField,
	chooseToken,
	clearField,
	insertToken,
	joinOf,
	removeToken,
	selectedTokens,
	setJoin,
} from "../src/query-edit";

/**
 * The `Book` field's rows are loaded data, so a test that wants them has to say so. Registered for
 * the whole file rather than per case: nothing here depends on the field being empty, and the one
 * case that does — a bar built before the archive arrived — registers an empty list of its own.
 */
const BOOKS = [
	{ value: "book1", hint: "Calvin and Hobbes" },
	{ value: "book3", hint: "Yukon Ho!" },
	{ value: "book4", hint: "Weirdos From Another Planet!" },
	{ value: "lazysunday", hint: "The Calvin and Hobbes Lazy Sunday Book" },
];

registerVocabulary("in", () => BOOKS);

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
		const labels = each
			.options()
			.filter((option) => selected.has(option.token))
			.map((option) => option.label);
		if (labels.length > 0) painted[each.name] = labels;
	}
	return painted;
}

test("the fields", async (suite) => {
	await suite.test("no token is reachable from two dropdowns", () => {
		const seen = new Set<string>();
		for (const each of FILTER_FIELDS) {
			for (const option of each.options()) {
				assert.equal(seen.has(option.token), false, `${option.token} twice`);
				seen.add(option.token);
			}
		}
	});

	await suite.test("every value is one the archive could hold", () => {
		assert.equal(field("year").options()[0].label, "1985");
		assert.equal(field("year").options().at(-1)!.label, "1995");
		assert.equal(field("month").options().length, 12);
		assert.equal(field("day").options().length, 31);
	});

	await suite.test("a book reads as its title and writes as its id", () => {
		assert.deepEqual(field("book").options(), [
			{ token: "@in:book1", label: "Calvin and Hobbes" },
			{ token: "@in:book3", label: "Yukon Ho!" },
			{ token: "@in:book4", label: "Weirdos From Another Planet!" },
			{ token: "@in:lazysunday", label: "The Calvin and Hobbes Lazy Sunday Book" },
		]);
	});

	// The bar is built with the results view and the collection index lands after it, so this is the
	// state every first paint is in — and `views/filter-bar.ts` reads it as a disabled button.
	await suite.test("a field whose values have not arrived is empty rather than wrong", () => {
		try {
			registerVocabulary("in", () => []);
			assert.deepEqual(field("book").options(), []);
			assert.deepEqual(checked("@in:book3"), {});
			assert.equal(insertToken("snowman", "@in:book3"), "snowman");
		} finally {
			registerVocabulary("in", () => BOOKS);
		}
	});

	await suite.test("months are offered by their long spelling", () => {
		assert.deepEqual(
			field("month")
				.options()
				.map((option) => option.token),
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
		assert.deepEqual(checked("@is:sunday"), { format: ["Sundays"] });
		assert.deepEqual(checked("@is:daily"), { format: ["Dailies"] });
	});

	await suite.test("a hand-typed spelling checks the same box", () => {
		assert.deepEqual(checked("@month:aug"), { month: ["August"] });
		assert.deepEqual(checked("@month:8"), { month: ["August"] });
		assert.deepEqual(checked("@DAY:03"), { day: ["3"] });
	});

	await suite.test("a book checks its own box", () => {
		assert.deepEqual(checked("@in:book3"), { book: ["Yukon Ho!"] });
		assert.deepEqual(checked("@IN:BOOK3"), { book: ["Yukon Ho!"] });
		assert.deepEqual(checked("@in:book3 @in:lazysunday"), {
			book: ["Yukon Ho!", "The Calvin and Hobbes Lazy Sunday Book"],
		});
	});

	await suite.test("repeating a filter checks both", () => {
		assert.deepEqual(checked("@year:1988 @year:1990"), { year: ["1988", "1990"] });
	});

	await suite.test("checkmarks survive the words around them", () => {
		assert.deepEqual(checked("clean @year:1988 your room @is:sunday"), { year: ["1988"], format: ["Sundays"] });
	});

	await suite.test("what the bar has no box for checks nothing anywhere", () => {
		assert.deepEqual(checked("@month:13"), {});
		assert.deepEqual(checked("@day:saturday"), {});
		assert.deepEqual(checked("@date:1988/9/3"), {});
		assert.deepEqual(checked("@before:1990 @after:1987"), {});
		assert.deepEqual(checked("@year:2001"), {});
		// Every year ending in 88, which is not one box however few such years the archive holds.
		assert.deepEqual(checked("@year:88"), {});
		// A book the archive does not have is not a filter at all, so it is not a checkmark either.
		assert.deepEqual(checked("@in:snowman"), {});
		// Only two of the tags are in the bar.
		assert.deepEqual(checked("@is:rerun @is:reused @is:altered @is:empty"), {});
		assert.deepEqual(checked("@is:monday"), {});
		assert.deepEqual(checked("snow goons"), {});
	});
});

test("insert: checkmarks to query text", async (suite) => {
	await suite.test("an empty box gets the token and nothing else", () => {
		assert.equal(insertToken("", "@year:1990"), "@year:1990");
		assert.equal(insertToken("   ", "@is:sunday"), "@is:sunday");
	});

	await suite.test("the token is appended to a query that has no filter of its field", () => {
		assert.equal(insertToken("snow goons", "@year:1990"), "snow goons @year:1990");
		assert.equal(insertToken("snow goons ", "@year:1990"), "snow goons @year:1990");
	});

	await suite.test("a second year lands beside the first, not at the end of the sentence", () => {
		assert.equal(insertToken("@year:1988 snow goons", "@year:1990"), "@year:1988 @year:1990 snow goons");
		assert.equal(insertToken("@year:88 snow goons", "@year:1990"), "@year:88 @year:1990 snow goons");
	});

	// Side by side, which is either, unless the books already there are joined otherwise — see `joinOf`.
	await suite.test("books collect beside books", () => {
		assert.equal(insertToken("@in:book3 snowman", "@in:book4"), "@in:book3 @in:book4 snowman");
		assert.equal(
			insertToken("@in:book3 @or @in:book4 snowman", "@in:lazysunday"),
			"@in:book3 @or @in:book4 @or @in:lazysunday snowman",
		);
		assert.equal(
			insertToken("@in:book3 @in:book4 snowman", "@in:lazysunday"),
			"@in:book3 @in:book4 @in:lazysunday snowman",
		);
		assert.equal(
			insertToken("@in:book3 @and @in:book4 snowman", "@in:lazysunday"),
			"@in:book3 @and @in:book4 @and @in:lazysunday snowman",
		);
		assert.equal(
			insertToken("(@in:book3 @or @in:book4)", "@in:lazysunday"),
			"(@in:book3 @or @in:book4 @or @in:lazysunday)",
		);
	});

	await suite.test("only books are joined by @or", () => {
		assert.equal(insertToken("@year:1988", "@year:1990"), "@year:1988 @year:1990");
		assert.equal(insertToken("@year:1988 @or @year:1989", "@year:1990"), "@year:1988 @or @year:1989 @year:1990");
	});

	await suite.test("a field collects beside its own name and no other", () => {
		assert.equal(insertToken("@year:1988 @month:august", "@year:1990"), "@year:1988 @year:1990 @month:august");
		assert.equal(insertToken("@year:1988 @month:august", "@day:3"), "@year:1988 @month:august @day:3");
		// The two tags are one field, so the second joins the first — and so does a tag the bar has
		// no box for.
		assert.equal(insertToken("@is:sunday snowman", "@is:daily"), "@is:sunday @is:daily snowman");
		assert.equal(insertToken("@is:rerun snowman", "@is:sunday"), "@is:rerun @is:sunday snowman");
	});

	await suite.test("the words keep their order and their single spaces", () => {
		assert.equal(insertToken("clean @year:1988 your room", "@year:1990"), "clean @year:1988 @year:1990 your room");
		assert.equal(insertToken("clean your room", "@month:august"), "clean your room @month:august");
	});
});

test("remove: unchecking a box", async (suite) => {
	await suite.test("a differently spelled token clears from its own checkbox", () => {
		assert.equal(removeToken("@month:8", "@month:august"), "");
		assert.equal(removeToken("@month:aug snowman", "@month:august"), "snowman");
	});

	await suite.test("every span that says the same thing goes", () => {
		assert.equal(removeToken("@month:august snow @month:aug goons", "@month:august"), "snow goons");
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

	await suite.test("the @or that joined it goes with it", () => {
		assert.equal(
			removeToken("@in:book3 @or @in:book4 @or @in:lazysunday", "@in:book4"),
			"@in:book3 @or @in:lazysunday",
		);
		assert.equal(removeToken("@in:book3 @or @in:book4 snowman", "@in:book3"), "@in:book4 snowman");
		assert.equal(removeToken("snowman @or @year:1988", "@year:1988"), "snowman");
		assert.equal(removeToken("@year:1988 @and @year:1989", "@year:1989"), "@year:1988");
		assert.equal(removeToken("(@in:book3 @or @in:book4) snowman", "@in:book4"), "(@in:book3) snowman");
		assert.equal(removeToken("(@in:book3 @or @in:book4) snowman", "@in:book3"), "(@in:book4) snowman");
	});

	// `@or` binds tighter, so the token was in its group, and taking the `@and` would change what the
	// rest of the query means.
	await suite.test("between an @and and an @or, the @or goes", () => {
		const mixed = "@in:book3 @and @in:book4 @or @in:lazysunday";
		assert.equal(removeToken(mixed, "@in:book4"), "@in:book3 @and @in:lazysunday");
		assert.equal(removeToken(mixed, "@in:book3"), "@in:book4 @or @in:lazysunday");
		assert.equal(removeToken(mixed, "@in:lazysunday"), "@in:book3 @and @in:book4");
		assert.equal(
			removeToken("@in:book3 @or @in:book4 @and @in:lazysunday", "@in:book4"),
			"@in:book3 @and @in:lazysunday",
		);
	});

	// Side by side, books widen, so they group as tightly as an `@or` would.
	await suite.test("between an @and and a book beside it, the @and stays", () => {
		const mixed = "@in:book3 @and @in:book4 @in:lazysunday";
		assert.equal(removeToken(mixed, "@in:book4"), "@in:book3 @and @in:lazysunday");
		assert.equal(removeToken(mixed, "@in:lazysunday"), "@in:book3 @and @in:book4");
		assert.equal(removeToken("@in:book3 @and @in:book4 snowman", "@in:book4"), "@in:book3 snowman");
	});
});

test("negated filters", async (suite) => {
	await suite.test("tick nothing, and are not the bar's to remove", () => {
		assert.deepEqual(checked("@not @year:1988"), {});
		assert.deepEqual(checked("@not (@in:book3 @or snow) @in:book4"), { book: ["Weirdos From Another Planet!"] });
		assert.deepEqual(checked("@not @not @year:1988"), { year: ["1988"] });
		assert.equal(removeToken("@not @year:1988", "@year:1988"), "@not @year:1988");
		assert.equal(clearField("@not @year:1988 @year:1990", field("year")), "@not @year:1988");
	});

	await suite.test("are not what a new row is written beside", () => {
		assert.equal(insertToken("@not @in:book3 snowman", "@in:book4"), "@not @in:book3 snowman @in:book4");
	});
});

test("join: any or all of a field's rows", async (suite) => {
	const book = () => field("book");

	await suite.test("there is nothing to join until two rows are ticked", () => {
		assert.equal(joinOf("snowman", book()), null);
		assert.equal(joinOf("@in:book3 snowman", book()), null);
	});

	await suite.test("read off what stands between them", () => {
		assert.equal(joinOf("@in:book3 @or @in:book4", book()), "any");
		assert.equal(joinOf("(@in:book3 @OR @in:book4)", book()), "any");
		assert.equal(joinOf("@in:book3 @in:book4", book()), "any");
		assert.equal(joinOf("@in:book3 snow @in:book4", book()), "any");
		assert.equal(joinOf("@in:book3 @and @in:book4", book()), "all");
		assert.equal(joinOf("@in:book3 snow @and @in:book4", book()), "all");
		// Side by side and `@or` say the same thing about books, together or apart.
		assert.equal(joinOf("@in:book3 @or @in:book4 @in:lazysunday", book()), "any");
	});

	// Only typed, never written by the bar, and the toggle shows it by choosing neither.
	await suite.test("joined both ways is neither", () => {
		assert.equal(joinOf("@in:book3 @and @in:book4 @or @in:lazysunday", book()), "mixed");
		assert.equal(joinOf("@in:book3 snow @or @in:book4", book()), "mixed");
		assert.equal(joinOf("(@in:book3 snow) @in:book4", book()), "mixed");
		assert.equal(joinOf("@in:book3 @and @in:book4 @in:lazysunday", book()), "mixed");
	});

	await suite.test("either choice settles a mixed query", () => {
		const mixed = "@in:book3 @and @in:book4 @or @in:lazysunday";
		assert.equal(setJoin(mixed, book(), "any"), "@in:book3 @in:book4 @in:lazysunday");
		assert.equal(setJoin(mixed, book(), "all"), "@in:book3 @and @in:book4 @and @in:lazysunday");
	});

	await suite.test("a new row joins the group it lands beside", () => {
		assert.equal(
			insertToken("@in:book3 @and @in:book4 @or @in:lazysunday", "@in:book1"),
			"@in:book3 @and @in:book4 @or @in:lazysunday @or @in:book1",
		);
		assert.equal(
			insertToken("@in:book3 @or @in:book4 @and @in:lazysunday", "@in:book1"),
			"@in:book3 @or @in:book4 @and @in:lazysunday @and @in:book1",
		);
	});

	await suite.test("the toggle rewrites the joins and nothing else", () => {
		assert.equal(setJoin("@in:book3 @and @in:book4 snowman", book(), "any"), "@in:book3 @in:book4 snowman");
		assert.equal(setJoin("@in:book3 @in:book4 snowman", book(), "all"), "@in:book3 @and @in:book4 snowman");
		assert.equal(setJoin("@in:book3 @or @in:book4 snowman", book(), "all"), "@in:book3 @and @in:book4 snowman");
		assert.equal(setJoin("(@in:book3 @or @in:book4)", book(), "all"), "(@in:book3 @and @in:book4)");
		assert.equal(
			setJoin("@in:book3 @and @in:book4 @and @in:lazysunday", book(), "any"),
			"@in:book3 @in:book4 @in:lazysunday",
		);
	});

	await suite.test("rows apart are gathered where the first stood", () => {
		assert.equal(setJoin("@in:book3 snow @in:book4 goons", book(), "all"), "@in:book3 @and @in:book4 snow goons");
	});

	await suite.test("the join already chosen is not an edit", () => {
		assert.equal(setJoin("@in:book3 @or @in:book4", book(), "any"), "@in:book3 @or @in:book4");
		assert.equal(setJoin("@in:book3 snowman", book(), "any"), "@in:book3 snowman");
	});
});

test("choose: a field that takes one row at a time", async (suite) => {
	await suite.test("only Format takes one", () => {
		assert.deepEqual(
			FILTER_FIELDS.filter((each) => each.single).map((each) => each.name),
			["format"],
		);
	});

	await suite.test("an empty field gets the token, as a check would", () => {
		assert.equal(chooseToken("snowman", field("format"), "@is:sunday"), "snowman @is:sunday");
	});

	await suite.test("a second choice replaces the first where it stood", () => {
		assert.equal(chooseToken("@is:sunday snowman", field("format"), "@is:daily"), "@is:daily snowman");
		assert.equal(chooseToken("clean @is:daily your room", field("format"), "@is:sunday"), "clean @is:sunday your room");
	});

	await suite.test("choosing the row already chosen is not an edit", () => {
		assert.equal(chooseToken("@is:sunday snowman", field("format"), "@is:sunday"), "@is:sunday snowman");
	});

	await suite.test("a hand-typed pair is settled to the one chosen", () => {
		assert.equal(chooseToken("@is:sunday @is:daily snowman", field("format"), "@is:daily"), "@is:daily snowman");
	});

	await suite.test("the tags the bar has no box for are left alone", () => {
		assert.equal(chooseToken("@is:rerun @is:sunday", field("format"), "@is:daily"), "@is:rerun @is:daily");
	});
});

test("clear: the whole field at once", async (suite) => {
	await suite.test("every token the field has a box for", () => {
		assert.equal(
			clearField("@year:1988 @year:1990 snow @month:august goons", field("year")),
			"snow @month:august goons",
		);
		assert.equal(clearField("@is:sunday @is:daily snowman", field("format")), "snowman");
		assert.equal(clearField("@is:sunday @is:rerun snowman", field("format")), "@is:rerun snowman");
		assert.equal(clearField("@in:book3 @year:1988 @in:book4", field("book")), "@year:1988");
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
	const tokens = ["@year:1990", "@month:august", "@day:3", "@is:sunday", "@is:daily"];

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

test("insert: an open quotation is closed before a token is appended", () => {
	assert.equal(insertToken('"snow goons', "@year:1990"), '"snow goons" @year:1990');
	assert.equal(insertToken('"snow goons"', "@year:1990"), '"snow goons" @year:1990');
	assert.equal(insertToken('"snow goons @year:1988', "@year:1990"), '"snow goons @year:1988" @year:1990');
});
