import test from "node:test";
import assert from "node:assert/strict";
import { Completion, completionsAt, describeInvalid, filterSpans } from "../src/completion";
import { FILTER_SPECS } from "../src/filter-spec";
import { scanFilters } from "../src/date-query";

/**
 * A caret is written into the query as `|`, because every one of these cases is about where the
 * caret is and a separate offset argument makes them unreadable.
 */
function at(marked: string): Completion | null {
	const caret = marked.indexOf("|");
	assert.notEqual(caret, -1, "mark the caret with |");
	return completionsAt(marked.slice(0, caret) + marked.slice(caret + 1), caret);
}

function names(marked: string): string[] {
	return (at(marked)?.rows ?? []).map((row) => row.name);
}

function templates(marked: string): (string | undefined)[] {
	return (at(marked)?.rows ?? []).map((row) => row.template);
}

function completions(marked: string): (string | undefined)[] {
	return (at(marked)?.rows ?? []).map((row) => row.insert);
}

/** Each span as the kind it is and the text it covers, which is the whole of what it says. */
function spans(marked: string): [string, string][] {
	const caret = marked.indexOf("|");
	const text = caret === -1 ? marked : marked.slice(0, caret) + marked.slice(caret + 1);
	return filterSpans(text, caret === -1 ? null : caret).map((span) => [span.kind, text.slice(span.start, span.end)]);
}

test("naming a filter", async (suite) => {
	await suite.test("a bare @ offers every filter there is", () => {
		assert.deepEqual(
			names("@|"),
			FILTER_SPECS.map((spec) => spec.name),
		);
	});

	await suite.test("a partial name narrows by prefix", () => {
		assert.deepEqual(names("@y|"), ["year"]);
		assert.deepEqual(names("@d|"), ["day", "date", "daily"]);
		assert.deepEqual(names("@da|"), ["day", "date", "daily"]);
		assert.deepEqual(names("@dat|"), ["date"]);
	});

	await suite.test("a name nothing starts with closes the menu", () => {
		assert.equal(at("@zzz|"), null);
	});

	await suite.test("a complete name still offers itself, so the colon can be accepted", () => {
		const completion = at("@year|");
		assert.deepEqual(
			completion!.rows.map((row) => row.insert),
			["@year:"],
		);
	});

	await suite.test("a valued filter inserts up to the colon and shows its first shape", () => {
		const row = at("@year|")!.rows[0];
		assert.equal(row.insert, "@year:");
		assert.equal(row.template, "YYYY");
	});

	await suite.test("a flag inserts a trailing space and offers no shape", () => {
		const row = at("@sunday|")!.rows[0];
		assert.equal(row.insert, "@sunday ");
		assert.equal(row.template, undefined);
	});

	await suite.test("the name is matched without regard to case", () => {
		assert.deepEqual(names("@YE|"), ["year"]);
	});

	await suite.test("the token spans the whole run, not just what precedes the caret", () => {
		const completion = at("@y|ear");
		assert.equal(completion!.start, 0);
		assert.equal(completion!.end, 5);
	});
});

test("offering the value shapes", async (suite) => {
	await suite.test("@year: offers both year shapes", () => {
		assert.deepEqual(templates("@year:|"), ["YYYY", "YY"]);
	});

	await suite.test("@date: offers all three year-first shapes on their own rows", () => {
		assert.deepEqual(templates("@date:|"), ["YYYY", "YYYY/MM", "YYYY/MM/DD"]);
		assert.deepEqual(templates("@before:|"), ["YYYY", "YYYY/MM", "YYYY/MM/DD"]);
		assert.deepEqual(templates("@after:|"), ["YYYY", "YYYY/MM", "YYYY/MM/DD"]);
	});

	await suite.test("@month: and @day: each offer a number and a name", () => {
		assert.deepEqual(templates("@month:|"), ["MM", "august"]);
		assert.deepEqual(templates("@day:|"), ["DD", "saturday"]);
	});

	await suite.test("a shape the value has only begun cannot be accepted", () => {
		assert.deepEqual(completions("@year:199|"), [undefined]);
		assert.deepEqual(completions("@date:1988/|"), [undefined, undefined]);
	});

	await suite.test("a colon after a flag has nothing to offer", () => {
		assert.equal(at("@sunday:|"), null);
		assert.equal(at("@sunday:yes|"), null);
	});

	await suite.test("a colon after a name that is not a filter has nothing to offer", () => {
		assert.equal(at("@nonsense:|"), null);
	});
});

test("narrowing the guide to what could still be typed", async (suite) => {
	await suite.test("a shape the value can no longer become drops out", () => {
		assert.deepEqual(templates("@year:1|"), ["YYYY", "YY"]);
		assert.deepEqual(templates("@year:199|"), ["YYYY"]);
		assert.deepEqual(templates("@day:4|"), ["DD"]);
		assert.deepEqual(templates("@month:a|"), ["august"]);
	});

	// Both rows have something to say at this keystroke: 94 is already a year, and it is also two
	// digits into being a different one.
	await suite.test("a filled shape stays, alongside whatever the value could still become", () => {
		assert.deepEqual(templates("@year:94|"), ["YYYY", "YY"]);
		assert.deepEqual(completions("@year:94|"), [undefined, "@year:94 "]);
	});

	await suite.test("a filled shape is the row that can be accepted", () => {
		assert.deepEqual(completions("@year:1994|"), ["@year:1994 "]);
		assert.deepEqual(completions("@month:august|"), ["@month:august "]);
		assert.deepEqual(completions("@day:saturday|"), ["@day:saturday "]);
		assert.deepEqual(completions("@date:1988/09/03|"), ["@date:1988/09/03 "]);
	});

	// Accepting finishes the filter off; it never types the shape's own letters into the query.
	await suite.test("what it accepts is the filter as typed, with a space after it", () => {
		assert.deepEqual(completions("@month:8|"), ["@month:8 "]);
		assert.deepEqual(completions("@day:4|"), ["@day:4 "]);
		assert.deepEqual(completions("@date:19880903|"), ["@date:19880903 "]);
	});

	// A spelling the menu never shows, filling a shape it never spelled out.
	await suite.test("a compact date fills the shape it fills", () => {
		assert.deepEqual(templates("@date:19880903|"), ["YYYY/MM/DD"]);
	});

	await suite.test("a value nothing could rescue leaves no guide either", () => {
		assert.equal(at("@year:abc|"), null);
		assert.equal(at("@month:13|"), null);
		assert.equal(at("@day:funday|"), null);
		assert.equal(at("@date:august|"), null);
	});

	await suite.test("a number keeps the shapes another digit would still fit", () => {
		assert.deepEqual(templates("@month:1|"), ["MM"]);
		assert.deepEqual(templates("@day:3|"), ["DD"]);
	});

	await suite.test("a name keeps the shape it is spelling out", () => {
		assert.deepEqual(templates("@month:aug|"), ["august"]);
		assert.deepEqual(templates("@day:s|"), ["saturday"]);
	});

	// Nothing in the table is longer than "may", so it can only be the month it already is.
	await suite.test("a name with no longer spelling behind it is simply filled", () => {
		assert.deepEqual(completions("@month:may|"), ["@month:may "]);
	});

	await suite.test("a date narrows a field at a time", () => {
		assert.deepEqual(templates("@date:1988/|"), ["YYYY/MM", "YYYY/MM/DD"]);
		assert.deepEqual(templates("@date:1988/09|"), ["YYYY/MM", "YYYY/MM/DD"]);
		assert.deepEqual(completions("@date:1988/09|"), ["@date:1988/09 ", undefined]);
		assert.deepEqual(templates("@date:1988/09/03|"), ["YYYY/MM/DD"]);
	});
});

test("highlighting what is already there", async (suite) => {
	await suite.test("a filter that parses is covered end to end", () => {
		assert.deepEqual(spans("@year:1994|"), [["match", "@year:1994"]]);
		assert.deepEqual(spans("@sunday|"), [["match", "@sunday"]]);
	});

	await suite.test("a value still being typed is marked apart from the name it belongs to", () => {
		assert.deepEqual(spans("@year:199|"), [
			["name", "@year"],
			["pending", ":199"],
		]);
	});

	// The extent is the whole signal: the two halves close up into one pill on the keystroke that
	// makes the filter parse, and come apart again on the one that stops it parsing.
	await suite.test("typing a year in closes the pill up and opens it again", () => {
		assert.deepEqual(
			["@year|", "@year:|", "@year:1|", "@year:19|", "@year:199|", "@year:1994|"].map((marked) =>
				spans(marked)
					.map(([kind]) => kind)
					.join("+"),
			),
			["name", "name+pending", "name+pending", "match", "name+pending", "match"],
		);
	});

	// No value given yet is not a bad value given, so it waits for the caret to leave before it
	// says so — and the colon it has committed to is the part still being typed.
	await suite.test("a colon with nothing after it waits under the caret and is an error once left", () => {
		assert.deepEqual(spans("@year:|"), [
			["name", "@year"],
			["pending", ":"],
		]);
		assert.deepEqual(spans("@year: snowman|"), [["invalid", "@year:"]]);
	});

	await suite.test("a filter left half-typed is a mistake once the caret has moved on", () => {
		assert.deepEqual(spans("@year|"), [["name", "@year"]]);
		assert.deepEqual(spans("@year snow|man"), [["invalid", "@year"]]);
		assert.deepEqual(spans("@year"), [["invalid", "@year"]]);
		assert.deepEqual(spans("@year:199 snow|man"), [["invalid", "@year:199"]]);
	});

	// Waiting rescues nothing here, so this one does not get the benefit of the doubt the caret
	// buys `@year:` — there is no month it could still become.
	await suite.test("a value that could never work is a mistake under the caret too", () => {
		assert.deepEqual(spans("@month:13|"), [["invalid", "@month:13"]]);
		assert.deepEqual(spans("@year:abc|"), [["invalid", "@year:abc"]]);
	});

	// The colon does nothing here — `@sunday:` searches for what `@sunday` searches for — so the
	// pill stops at the filter and leaves the stray character to look stray.
	await suite.test("a colon a flag never asked for is left out of the pill", () => {
		assert.deepEqual(spans("@sunday:|"), [["match", "@sunday"]]);
	});

	await suite.test("a value nothing will rescue is covered end to end as an error", () => {
		assert.deepEqual(spans("@month:13|"), [["invalid", "@month:13"]]);
		assert.deepEqual(spans("@day:funday|"), [["invalid", "@day:funday"]]);
		assert.deepEqual(spans("@sunday:yes|"), [["invalid", "@sunday:yes"]]);
	});

	await suite.test("every filter in the query is found, in the order they were typed", () => {
		assert.deepEqual(spans("clean @year:1988 your @month:13 room"), [
			["match", "@year:1988"],
			["invalid", "@month:13"],
		]);
	});

	await suite.test("an error carries the reason it will be shown with", () => {
		const [broken] = filterSpans("@month:13", null);
		assert.equal(broken.reason, "@month:13 — expected MM or august");
	});

	await suite.test("a filter that is fine carries no reason", () => {
		for (const span of filterSpans("@year:1988 @sunday", null)) assert.equal(span.reason, undefined);
	});
});

test("explaining a filter that will not work", async (suite) => {
	function reason(query: string): string {
		const matches = scanFilters(query);
		assert.equal(matches.length, 1, query);
		assert.equal(matches[0].valid, false, `expected "${query}" to be invalid`);
		return describeInvalid(matches[0]);
	}

	await suite.test("a bad value names the shapes that would have worked", () => {
		assert.equal(reason("@month:13"), "@month:13 — expected MM or august");
		assert.equal(reason("@year:abc"), "@year:abc — expected YYYY or YY");
		assert.equal(reason("@day:funday"), "@day:funday — expected DD or saturday");
	});

	await suite.test("a missing value says so", () => {
		assert.equal(reason("@year"), "@year needs a value — YYYY or YY");
	});

	await suite.test("a flag carrying a value says so", () => {
		assert.equal(reason("@sunday:yes"), "@sunday takes no value");
	});
});

test("finding the token", async (suite) => {
	await suite.test("text with no @ has no menu", () => {
		assert.equal(at("snowman|"), null);
		assert.equal(at("|"), null);
		assert.equal(at("clean your room|"), null);
	});

	await suite.test("a filter mid-query is found, and the words around it are left alone", () => {
		const completion = at("clean @yea| your room");
		assert.equal(completion!.start, 6);
		assert.equal(completion!.end, 10);
		assert.deepEqual(
			completion!.rows.map((row) => row.name),
			["year"],
		);
	});

	await suite.test("whitespace ends the token, so a finished filter is behind us", () => {
		assert.equal(at("@year:1990 |"), null);
		assert.equal(at("@year:1990 snowman|"), null);
	});

	// `FILTER_PATTERN` has no word-boundary requirement, so the parser really does read this as a
	// filter. The menu agrees rather than quietly differing from what the search will do.
	await suite.test("an @ inside a word is still the token the parser will read", () => {
		assert.deepEqual(names("bill@yea|"), ["year"]);
		assert.equal(scanFilters("bill@year:1990").length, 1);
	});

	await suite.test("the nearest @ to the left wins", () => {
		assert.deepEqual(names("@day@yea|"), ["year"]);
	});

	await suite.test("a token that is not a filter shape has no menu", () => {
		assert.equal(at("@year1990|"), null);
		assert.equal(at("email@example.com|"), null);
	});
});
