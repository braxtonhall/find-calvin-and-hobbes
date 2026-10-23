import test from "node:test";
import assert from "node:assert/strict";
import { helpAnchor, helpSections, runs } from "../src/help";
import { STRIP_QUERY, collectionQuery } from "../src/filter-query";

const ids = () => helpSections().flatMap((section) => section.entries.map((entry) => entry.id));

test("the help page", async (suite) => {
	await suite.test("explains each filter this site has, once per language", () => {
		const all = ids();
		assert.equal(new Set(all).size, all.length, "an anchor is used twice");
		for (const id of ["strips-in", "strips-is", "strips-year", "strips-featuring", "strips-during", "collections-has"])
			assert.ok(all.includes(id), id);
	});

	await suite.test("leaves out what this site has turned off", () => {
		// This archive has no creators and no subjects.
		assert.ok(!ids().includes("strips-by"));
		assert.ok(!ids().includes("strips-about"));
		assert.ok(!runs("@about:snowmen", STRIP_QUERY));
		assert.ok(!runs("@about (@id:snowmen)", STRIP_QUERY));
		assert.ok(runs("@featuring:susie", STRIP_QUERY));
	});

	await suite.test("lists a filter's values where they are few", () => {
		const entry = helpSections()
			.flatMap((section) => section.entries)
			.find((each) => each.id === "strips-is")!;
		assert.ok(entry.values[0].terms.some((term) => term.value === "sunday"));
	});

	await suite.test("names the crossing beside the filter that shares its name", () => {
		const entry = helpSections()
			.flatMap((section) => section.entries)
			.find((each) => each.id === "strips-in")!;
		assert.deepEqual(
			entry.forms.map((form) => form.syntax),
			["@in:", "@in"],
		);
	});

	await suite.test("checks a query against the kind it is about", () => {
		assert.ok(runs("@is:colour", collectionQuery("book")));
		assert.ok(!runs("@is:colour", collectionQuery("arc")));
	});
});

test("a search box's way to the help page", async (suite) => {
	await suite.test("goes to the filter being written, where the page has it", () => {
		assert.equal(helpAnchor("strip", "year"), "strips-year");
		assert.equal(helpAnchor("collection", "published"), "collections-published");
		assert.equal(helpAnchor("strip", "as"), "collections-as");
	});

	await suite.test("goes to the language's section otherwise", () => {
		assert.equal(helpAnchor("strip"), "strips");
		assert.equal(helpAnchor("collection"), "collections");
		assert.equal(helpAnchor("strip", "about"), "strips");
	});
});
