// First: turns on `@featuring` and `@by`, which `FILTER_SPECS` reads once, as it loads.
import "./helpers/characters";

import test from "node:test";
import assert from "node:assert/strict";
import { compileQuery, contextAt, parseQuery, scanQuery } from "../src/boolean-query";
import { completionsAt, filterSpans } from "../src/completion";
import { STRIP_QUERY, collectionQuery, parseComparison } from "../src/filter-query";
import { registerVocabulary } from "../src/filter-vocabulary";
import { Compounds, search } from "../src/search";
import { searchCollections } from "../src/query-eval";
import { selectedTokens } from "../src/query-edit";
import { buildCollectionsHeaderHtml } from "../src/pages/collections";
import { guessSpelling, setSpelling } from "../src/spelling";
import { state } from "../src/state";
import { Arc, Character, Collection, Comic, Creator } from "../src/types";
import { install } from "./helpers/archive";
import { ENGINE_TUNING } from "./helpers/engine-tuning";

/**
 * The two search languages of `search-language-plan.md`: the strips' in the main search, and the
 * collections' on the Collections page, with the operators that cross between them.
 */

const NO_COMPOUNDS: Compounds = new Map();

function book(id: string, name: string, pub_year: number, colour = false): Collection {
	return {
		id,
		name,
		pub_year,
		pub_month: 1,
		image: "",
		colour,
		notes: [],
		dailies: [],
		alterations: {},
		specials: {},
	};
}

const BOOKS = [
	book("snowbook", "Snow Book", 1988, true),
	book("plainbook", "Plain Book", 1990),
	book("emptybook", "Empty Book", 1991),
];

const ARCS: Arc[] = [
	{
		id: "snowarc",
		description: "Calvin builds a fort in the winter.",
		dates: ["1988-01-03", "1988-01-04"],
		collections: [],
	},
	{ id: "schoolarc", description: "Calvin at school.", dates: ["1988-01-05"], collections: [] },
];

const CHARACTERS: Character[] = [
	{ id: "susie", name: "Susie Derkins" },
	{ id: "mom", name: "Mom" },
	{ id: "rosalyn", name: "Rosalyn" },
];

function creator(id: string, name: string, roles?: string[]): Creator {
	return { id, name, strips: 0, years: [], ranges: [], ...(roles ? { roles } : {}) };
}

const CREATORS: Creator[] = [creator("bill", "Bill Watterson"), creator("ink", "An Inker", ["art"])];

/** A Sunday and two dailies in two arcs, one strip in no book, and a special. */
const COMICS: Comic[] = [
	{
		date: "1988-01-03",
		transcript: "Snow everywhere! Let's build a fort.",
		appearances: [
			{ collection: "snowbook", pages: [1], altered: true },
			{ collection: "plainbook", pages: [1] },
		],
		arcs: ["snowarc"],
		characters: ["susie"],
		creators: [{ id: "bill" }],
	},
	{
		date: "1988-01-04",
		transcript: "Can I stay home today?",
		appearances: [{ collection: "snowbook", pages: [2] }],
		arcs: ["snowarc"],
		characters: ["mom"],
		creators: [{ id: "bill" }],
	},
	{ date: "1988-01-04", id: "special1", transcript: "A special strip." },
	{
		date: "1988-01-05",
		transcript: "Susie throws a snowball at me.",
		appearances: [{ collection: "plainbook", pages: [2] }],
		arcs: ["schoolarc"],
		characters: ["susie"],
		creators: [
			{ id: "bill", role: "story" },
			{ id: "ink", role: "art" },
		],
	},
	{ date: "1990-02-04", transcript: "A quiet day.", creators: [{ id: "ink", role: "art" }] },
];

const DESCRIPTIONS = new Map([
	["1988-01-03", "Calvin and Hobbes play in the snow."],
	["1988-01-04", "Calvin asks Mom to let him stay home."],
	["1988-01-05", "Susie hits Calvin with a snowball."],
	["1990-02-04", "Nothing happens."],
]);

/** The archive above, with the strip of 1988-01-04 run again in 1995. */
function setUp(): void {
	install({ comics: COMICS, descriptions: DESCRIPTIONS });
	state.comicsByDate = new Map();
	for (const comic of COMICS)
		state.comicsByDate.set(comic.date, [...(state.comicsByDate.get(comic.date) ?? []), comic]);
	state.reruns = new Map([["1995-01-04", "1988-01-04"]]);
	state.collectionIndex = { collections: BOOKS };
	state.collectionsById = new Map(BOOKS.map((each) => [each.id, each]));
	state.arcs = ARCS;
	state.arcsById = new Map(ARCS.map((arc) => [arc.id, arc]));
	state.charactersById = new Map(CHARACTERS.map((character) => [character.id, character]));
	state.creatorsById = new Map(CREATORS.map((each) => [each.id, each]));
	state.bookmarkedDates = new Set();
	state.ownedStrips = new Set();
	state.ownedBooks = new Set();
	state.notedStrips = new Set();
	state.notedBooks = new Set();
}

/** What the main search finds, as each row's date, a rerun day's marked. */
function strips(query: string): string[] {
	return search(query, "date", ENGINE_TUNING, NO_COMPOUNDS).map(
		(result) => `${result.comic.id ?? result.comic.date}${result.rerun ? " rerun" : ""}`,
	);
}

/** What a tab lists for the query, by id, in the tab's order. */
function listed(query: string, type: "book" | "arc" | "creator" | "character"): string[] {
	const results = searchCollections(query, type, NO_COMPOUNDS);
	assert.ok(results, `"${query}" has something in it`);
	const order = {
		book: BOOKS.map((each) => each.id),
		arc: ARCS.map((arc) => arc.id),
		creator: CREATORS.map((each) => each.id),
		character: CHARACTERS.map((character) => character.id),
	}[type];
	return order.filter((id) => results.ids.has(id));
}

/** Each filter as the language it was read in, and whether it was valid there. */
function readings(text: string, root = STRIP_QUERY): string[] {
	return scanQuery(text, root).filters.map(
		(match) => `${text.slice(match.start, match.end)} ${match.context.language}${match.valid ? "" : " ✗"}`,
	);
}

test("reading a query where it stands", async (suite) => {
	await suite.test("a crossing operator changes the language of the atom it takes", () => {
		assert.deepEqual(readings("@i:own @in @i:own"), ["@i:own strip", "@i:own collection"]);
		assert.deepEqual(readings("@in (@i:own @strips:<1000) @is:sunday"), [
			"@i:own collection",
			"@strips:<1000 collection",
			"@is:sunday strip",
		]);
		assert.deepEqual(readings("@has (@is:sunday @year:1988) @strips:>5", collectionQuery("arc")), [
			"@is:sunday strip",
			"@year:1988 strip",
			"@strips:>5 collection",
		]);
		// Nested, and back out again at the parenthesis.
		assert.deepEqual(readings("@in (@has (@is:sunday) @i:own) @year:1988"), [
			"@is:sunday strip",
			"@i:own collection",
			"@year:1988 strip",
		]);
	});

	await suite.test("@not and @only pass the language on to what they take", () => {
		assert.deepEqual(readings("@not @in @i:own"), ["@i:own collection"]);
		assert.deepEqual(readings("@only @in @i:own"), ["@i:own collection"]);
		assert.deepEqual(readings("@has @not @is:sunday", collectionQuery()), ["@is:sunday strip"]);
	});

	await suite.test("@or ends what a crossing operator was waiting to take", () => {
		assert.deepEqual(readings("@in @i:own @or @i:own"), ["@i:own collection", "@i:own strip"]);
	});

	await suite.test("bare, @in is the operator; with a colon, the filter", () => {
		assert.deepEqual(readings("@in:snowbook"), ["@in:snowbook strip"]);
		assert.deepEqual(readings("@in snowbook"), []);
		assert.equal(parseQuery("@in:snowbook").length, 1);
	});

	await suite.test("a strip filter on a tab is a mistake that asks whether @has was meant", () => {
		const [match] = scanQuery("@is:sunday", collectionQuery("arc")).filters;
		assert.equal(match.valid, false);
		assert.equal(match.reason, "Did you mean @has @is:sunday?");
		const [year] = scanQuery("@year:1988", collectionQuery("book")).filters;
		assert.equal(year.reason, "Did you mean @has @year:1988?");
		assert.deepEqual(compileQuery("@is:sunday", collectionQuery("arc")), []);
	});

	await suite.test("a collection's filter in the main search is a mistake", () => {
		const [match] = scanQuery("@strips:>5", STRIP_QUERY).filters;
		assert.equal(match.valid, false);
		assert.match(match.reason!, /describes a collection/);
		assert.deepEqual(parseQuery("@strips:>5"), []);
		const [tag] = scanQuery("@is:colour", STRIP_QUERY).filters;
		assert.match(tag.reason!, /Did you mean @in @is:colour/);
	});

	await suite.test("the reader's own tags under @is: point to @i:", () => {
		const [owned] = scanQuery("@is:owned", STRIP_QUERY).filters;
		assert.equal(owned.valid, false);
		assert.equal(owned.reason, "Did you mean @i:own?");
		assert.equal(scanQuery("@is:noted", collectionQuery("book")).filters[0].reason, "Did you mean @i:noted?");
		const [bookmarked] = scanQuery("@i:bookmarked", collectionQuery("book")).filters;
		assert.equal(bookmarked.reason, "Did you mean @has @i:bookmarked?");
	});

	await suite.test("@here: needs a link to describe", () => {
		assert.equal(scanQuery("@here:altered", STRIP_QUERY).filters[0].valid, false);
		assert.match(scanQuery("@here:altered", STRIP_QUERY).filters[0].reason!, /inside @in/);
		assert.equal(scanQuery("@in (@here:altered)", STRIP_QUERY).filters[0].valid, true);
		assert.equal(scanQuery("@has @here:altered", collectionQuery("book")).filters[0].valid, true);
		assert.equal(scanQuery("@here:altered", collectionQuery("book")).filters[0].valid, false);
	});

	await suite.test(
		"a crossing operator in the wrong language, or @only before nothing that crosses, is a mistake",
		() => {
			const onTab = scanQuery("@in @i:own", collectionQuery("book")).operators;
			assert.match(onTab[0].reason!, /Did you mean @has @in/);
			const inSearch = scanQuery("@has @is:sunday", STRIP_QUERY).operators;
			assert.match(inSearch[0].reason!, /@has goes from a collection/);
			const only = scanQuery("@only @is:sunday", STRIP_QUERY).operators;
			assert.match(only[0].reason!, /@only goes before/);
			assert.deepEqual(parseQuery("@only @is:sunday"), []);
			assert.equal(scanQuery("@only @in:snowbook", STRIP_QUERY).operators[0].reason, undefined);
			// Nothing after it yet is a query still being written, not a mistake.
			assert.equal(scanQuery("@only", STRIP_QUERY).operators[0].reason, undefined);
		},
	);

	await suite.test("the context at a point is what an atom typed there would be read in", () => {
		assert.equal(contextAt("@in (", 5, STRIP_QUERY).language, "collection");
		assert.equal(contextAt("@in (", 5, STRIP_QUERY).type, "book");
		assert.equal(contextAt("@in (@i:own) ", 16, STRIP_QUERY).language, "strip");
		assert.equal(contextAt("@during ", 8, STRIP_QUERY).type, "arc");
		assert.equal(contextAt("@has ", 5, collectionQuery("book")).language, "strip");
		assert.equal(contextAt("@has ", 5, collectionQuery("book")).link, true);
		assert.equal(contextAt("", 0, collectionQuery("arc")).type, "arc");
	});

	await suite.test("comparisons are GitHub's", () => {
		assert.deepEqual(parseComparison(">5"), { low: 6, high: Infinity });
		assert.deepEqual(parseComparison(">=5"), { low: 5, high: Infinity });
		assert.deepEqual(parseComparison("<5"), { low: -Infinity, high: 4 });
		assert.deepEqual(parseComparison("<=5"), { low: -Infinity, high: 5 });
		assert.deepEqual(parseComparison("5"), { low: 5, high: 5 });
		assert.deepEqual(parseComparison("5..10"), { low: 5, high: 10 });
		assert.equal(parseComparison("10..5"), null);
		assert.equal(parseComparison(">"), null);
		assert.equal(parseComparison("five"), null);
	});

	await suite.test("a crossing is one atom, which distribution does not go through", () => {
		// `@not @in (A @or B)` is one clause, not the two `@not @in A @or @not @in B` would be.
		const branches = parseQuery("@not @in (@id:snowbook @or @id:plainbook)");
		assert.equal(branches.length, 1);
		assert.equal(branches[0].clauses.length, 1);
		assert.equal(branches[0].clauses[0][0].kind, "cross");
	});
});

test("the strip language", async (suite) => {
	setUp();

	await suite.test("@i:own is the printing, and @in @i:own a book of it", () => {
		setUp();
		state.ownedStrips = new Set(["19880105"]);
		state.ownedBooks = new Set(["snowbook"]);
		assert.deepEqual(strips("@i:own"), ["1988-01-05"]);
		assert.deepEqual(strips("@in @i:own"), ["1988-01-03", "1988-01-04"]);
		// The rerun of 1988-01-04 is in an owned book, but nothing here asked for the days strips ran again.
		assert.deepEqual(strips("@i:own @or @in @i:own"), ["1988-01-03", "1988-01-04", "1988-01-05"]);
		// Only a tag asked for brings in the days a strip ran again, so not one asked against.
		assert.deepEqual(strips("@not @i:own @not @in @i:own"), ["special1", "1990-02-04"]);
		// And a day a strip ran again is kept only by the clause that asked for it.
		assert.deepEqual(strips("@i:own @or (@in @i:own @is:rerun)"), ["1988-01-05", "1995-01-04 rerun"]);
	});

	await suite.test("a personal tag brings in the days a strip ran again, judged as their own printing", () => {
		setUp();
		state.ownedStrips = new Set(["19950104"]);
		assert.deepEqual(strips("@i:own"), ["1995-01-04 rerun"]);
		state.bookmarkedDates = new Set(["1995-01-04", "1988-01-03"]);
		assert.deepEqual(strips("@i:bookmarked"), ["1988-01-03", "1995-01-04 rerun"]);
		state.notedStrips = new Set(["special1"]);
		assert.deepEqual(strips("@i:noted"), ["special1"]);
	});

	await suite.test("@only is at least one, and all of them", () => {
		setUp();
		state.ownedBooks = new Set(["snowbook"]);
		// 1988-01-03 is in an unowned book too; 1990-02-04 is in none, so not "only" in anything.
		assert.deepEqual(strips("@only @in @i:own"), ["1988-01-04"]);
		assert.deepEqual(strips("@only @in:snowbook"), ["1988-01-04"]);
		assert.deepEqual(strips("@not @in @strips:>0"), ["special1", "1990-02-04"]);
	});

	await suite.test("@here: describes the link: altered in this book, not in some book", () => {
		setUp();
		assert.deepEqual(strips("@is:altered"), ["1988-01-03"]);
		assert.deepEqual(strips("@in @here:altered"), ["1988-01-03"]);
		assert.deepEqual(strips("@in (@id:snowbook @here:altered)"), ["1988-01-03"]);
		assert.deepEqual(strips("@in (@id:plainbook @here:altered)"), []);
		assert.deepEqual(strips("@in:plainbook @in (@not @id:plainbook @here:altered)"), ["1988-01-03"]);
		assert.deepEqual(strips("@only @in @not @here:altered"), ["1988-01-04", "1988-01-05"]);
	});

	await suite.test("each kind of collection has its operator, and its filter as short for it", () => {
		setUp();
		assert.deepEqual(strips("@during:snowarc"), ["1988-01-03", "1988-01-04"]);
		assert.deepEqual(strips("@during (@strips:<2)"), ["1988-01-05"]);
		assert.deepEqual(strips("@during (@has @is:sunday)"), ["1988-01-03", "1988-01-04"]);
		assert.deepEqual(strips("@featuring (@strips:<2)"), ["1988-01-04"]);
		assert.deepEqual(strips("@by (@is:artist @not @is:writer)"), ["1988-01-05", "1990-02-04"]);
		assert.deepEqual(strips("@only @by @is:writer"), ["1988-01-03", "1988-01-04"]);
		assert.deepEqual(strips("@in (@has @featuring:mom)"), ["1988-01-03", "1988-01-04"]);
	});

	await suite.test("inside an operator a collection's text is its own words and its strips'", () => {
		setUp();
		// The Snow Book's title says snow; the Plain Book's strips do.
		assert.deepEqual(strips("@in (snow)"), ["1988-01-03", "1988-01-04", "1988-01-05"]);
		assert.deepEqual(strips("@in (@has snowball)"), ["1988-01-03", "1988-01-05"]);
	});

	await suite.test("words and a crossing rank together, the crossing only judging", () => {
		setUp();
		const found = strips("susie");
		assert.deepEqual(found, ["1988-01-05"]);
		state.ownedBooks = new Set(["plainbook"]);
		assert.deepEqual(strips("susie @in @i:own"), found);
		assert.deepEqual(strips("susie @not @in @i:own"), []);
	});
});

test("the collection language", async (suite) => {
	await suite.test("a book's own tags, and a tag that cannot be true of a kind is false", () => {
		setUp();
		state.ownedBooks = new Set(["plainbook"]);
		state.notedBooks = new Set(["emptybook"]);
		assert.deepEqual(listed("@i:own", "book"), ["plainbook"]);
		assert.deepEqual(listed("@not @i:own", "book"), ["snowbook", "emptybook"]);
		assert.deepEqual(listed("@i:noted", "book"), ["emptybook"]);
		assert.deepEqual(listed("@i:own", "arc"), []);
		assert.deepEqual(listed("@not @i:own", "arc"), ["snowarc", "schoolarc"]);
		assert.deepEqual(listed("@is:book", "book"), ["snowbook", "plainbook", "emptybook"]);
		assert.deepEqual(listed("@is:book", "arc"), []);
		assert.deepEqual(listed("@is:colour", "book"), ["snowbook"]);
		assert.deepEqual(listed("@is:color", "book"), ["snowbook"], "an alias");
		assert.deepEqual(listed("@is:writer", "creator"), ["bill"]);
		// Bill is credited for the story alone once, and with nothing said the rest of the time.
		assert.deepEqual(listed("@is:artist", "creator"), ["bill", "ink"]);
	});

	await suite.test("counts, years and ids", () => {
		setUp();
		assert.deepEqual(listed("@strips:>=2", "book"), ["snowbook", "plainbook"]);
		assert.deepEqual(listed("@strips:0", "book"), ["emptybook"]);
		assert.deepEqual(listed("@strips:1..1", "arc"), ["schoolarc"]);
		assert.deepEqual(listed("@published:1988", "book"), ["snowbook"]);
		assert.deepEqual(listed("@published:90", "book"), ["plainbook"], "two digits, as @year: takes them");
		assert.deepEqual(listed("@published:>1988", "book"), [], "a comparison is not a year");
		assert.deepEqual(listed("@published:1988", "arc"), ["snowarc", "schoolarc"], "an arc by the years it ran");
		assert.deepEqual(listed("@published:1989", "arc"), []);
		assert.deepEqual(listed("@published:1988 @published:1991", "book"), ["snowbook", "emptybook"], "years widen");
		assert.deepEqual(listed("@published:1988 @and @published:1991", "book"), []);
		assert.deepEqual(listed("@published:1988 @published:1990", "arc"), ["snowarc", "schoolarc"]);
		assert.deepEqual(listed("@published:1988", "creator"), [], "a creator has no year");
		assert.deepEqual(listed("@id:plainbook @id:snowbook", "book"), ["snowbook", "plainbook"], "ids widen");
	});

	await suite.test("words may be found in different strips, a phrase only in one", () => {
		setUp();
		// Susie is in one strip of the arc and Mom in the other; no single strip has both.
		assert.deepEqual(listed("susie mom", "character"), []);
		assert.deepEqual(listed("snow mom", "arc"), ["snowarc"]);
		assert.deepEqual(listed("@has (snow mom)", "arc"), []);
		assert.deepEqual(listed('"build a fort"', "arc"), ["snowarc"]);
		assert.deepEqual(listed('"fort snowball"', "arc"), []);
		// Its own words count too: the arc's description says winter, and none of its strips do.
		assert.deepEqual(listed("winter", "arc"), ["snowarc"]);
		assert.deepEqual(listed("@has winter", "arc"), []);
		// By the word and its inflections, as a word under `@not` is: `snowball` is not `snow`.
		assert.deepEqual(listed("@not snow", "arc"), ["schoolarc"]);
		assert.deepEqual(listed("susie", "character"), ["susie"]);
	});

	await suite.test("@has looks through the strips, and grouping says whether one strip must do it all", () => {
		setUp();
		assert.deepEqual(listed("@has @is:sunday", "arc"), ["snowarc"]);
		assert.deepEqual(listed("@not @has @is:sunday", "arc"), ["schoolarc"]);
		assert.deepEqual(listed("@has @not @is:sunday", "arc"), ["snowarc", "schoolarc"]);
		assert.deepEqual(listed("@has (@is:sunday @featuring:mom)", "arc"), []);
		assert.deepEqual(listed("@has @is:sunday @has @featuring:mom", "arc"), ["snowarc"]);
		assert.deepEqual(listed("@only @has @year:1988", "creator"), ["bill"]);
		assert.deepEqual(listed("@only @has @is:sunday", "book"), []);
		// At least one, so the empty book is not "only" anything, though it has nothing that isn't.
		assert.deepEqual(listed("@only @has @is:daily", "book"), []);
		assert.deepEqual(listed("@not @has @not @is:daily", "book"), ["emptybook"]);
		assert.deepEqual(listed("@has @here:altered", "book"), ["snowbook"]);
		assert.deepEqual(listed("@has @here:altered", "arc"), [], "only a book alters a strip");
		assert.deepEqual(listed("@has @in @i:own", "arc"), []);
	});

	await suite.test("@has leaves the days a strip ran again out, unless it asks for them", () => {
		setUp();
		assert.deepEqual(listed("@has @year:1995", "book"), []);
		assert.deepEqual(listed("@has (@is:rerun @year:1995)", "book"), ["snowbook"]);
		state.ownedStrips = new Set(["19950104"]);
		assert.deepEqual(listed("@has @i:own", "arc"), ["snowarc"]);
	});

	await suite.test("a strip query pasted onto a tab: plain words carry over, strip filters ask for @has", () => {
		setUp();
		assert.deepEqual(listed("snowball", "book"), ["plainbook"]);
		assert.deepEqual(listed("snowball @is:sunday", "book"), []);
	});

	await suite.test("the grid lights the strips that are why each collection is listed", () => {
		setUp();
		const dates = (query: string, type: "book" | "arc") =>
			[...searchCollections(query, type, NO_COMPOUNDS)!.dates].sort();
		assert.deepEqual(dates("snowball", "book"), ["1988-01-05"]);
		assert.deepEqual(dates("@has @is:sunday", "arc"), ["1988-01-03"]);
		// Nothing about any strip in particular, so every strip of each.
		assert.deepEqual(dates("@strips:>=2", "arc"), ["1988-01-03", "1988-01-04"]);
		// Listed for its title alone: all of its strips.
		assert.deepEqual(dates("plain", "book"), ["1988-01-03", "1988-01-05"]);
	});

	await suite.test("an empty query lists everything", () => {
		setUp();
		assert.equal(searchCollections("", "book", NO_COMPOUNDS), null);
		assert.equal(searchCollections("   ", "arc", NO_COMPOUNDS), null);
	});
});

test("the search box", async (suite) => {
	function menu(text: string, root = STRIP_QUERY): string[] {
		return (completionsAt(text, text.length, root)?.rows ?? []).map((row) => row.insert);
	}

	await suite.test("a tab offers the collection language's filters and @has, and none of the strips'", () => {
		const rows = menu("@", collectionQuery("book"));
		assert.ok(rows.includes("@is:") && rows.includes("@strips:") && rows.includes("@id:") && rows.includes("@has "));
		assert.ok(!rows.includes("@year:") && !rows.includes("@in:") && !rows.includes("@in "));
		assert.ok(!rows.includes("@here:"), "no link to describe at the top of a tab");
	});

	await suite.test("inside an operator, the language on the other side of it", () => {
		const inBook = menu("@in (@");
		assert.ok(inBook.includes("@strips:") && inBook.includes("@here:") && inBook.includes("@has "));
		assert.ok(!inBook.includes("@year:"));
		const inHas = menu("@has (@", collectionQuery("arc"));
		assert.ok(inHas.includes("@year:") && inHas.includes("@here:") && inHas.includes("@in "));
		// Back out of the parenthesis, back in the box's own.
		assert.ok(menu("@in (@i:own) @").includes("@year:"));
	});

	await suite.test("@is: offers each language's own tags", () => {
		assert.ok(menu("@i:", collectionQuery("book")).includes("@i:own "));
		assert.ok(!menu("@i:", collectionQuery("book")).includes("@i:bookmarked "));
		assert.ok(menu("@i:").includes("@i:bookmarked "));
		assert.ok(menu("@is:b", collectionQuery("book")).includes("@is:book "));
		assert.ok(!menu("@is:", collectionQuery("book")).includes("@is:sunday "));
		assert.ok(menu("@in @is:").includes("@is:book "));
		assert.ok(menu("@is:").includes("@is:sunday "));
	});

	await suite.test("@id: offers the kind the context names", () => {
		try {
			registerVocabulary("id:book", () => [{ value: "snowbook", hint: "Snow Book" }]);
			registerVocabulary("id:arc", () => [{ value: "snowarc", hint: "An arc" }]);
			registerVocabulary("id", () => [
				{ value: "snowbook", hint: "Snow Book" },
				{ value: "snowarc", hint: "An arc" },
			]);
			assert.deepEqual(menu("@in (@id:"), ["@id:snowbook "]);
			assert.deepEqual(menu("@id:", collectionQuery("arc")), ["@id:snowarc "]);
			assert.deepEqual(menu("@id:", collectionQuery()), ["@id:snowbook ", "@id:snowarc "]);
		} finally {
			registerVocabulary("id:book", () => []);
			registerVocabulary("id:arc", () => []);
			registerVocabulary("id", () => []);
		}
	});

	// D24: one row for the pair, in the reader's spelling while both are possible, and in whichever
	// is still possible once the typing has ruled the other out.
	await suite.test("colour and color are one row, spelt as the reader would", () => {
		const offered = (text: string) => menu(text, collectionQuery("book")).filter((row) => /colou?r/.test(row));
		try {
			setSpelling("american");
			assert.deepEqual(offered("@is:"), ["@is:color "]);
			assert.deepEqual(offered("@is:colo"), ["@is:color "]);
			assert.deepEqual(offered("@is:colou"), ["@is:colour "]);
			setSpelling("british");
			assert.deepEqual(offered("@is:"), ["@is:colour "]);
			assert.deepEqual(offered("@is:color"), ["@is:color "]);
		} finally {
			setSpelling(null);
		}
	});

	await suite.test("the guess is American only for en-US in a US time zone", () => {
		assert.equal(guessSpelling("en-US", "America/Chicago"), "american");
		assert.equal(guessSpelling("en-US", "America/Toronto"), "british");
		assert.equal(guessSpelling("en-US", "Europe/London"), "british");
		assert.equal(guessSpelling("en", "America/New_York"), "british");
		assert.equal(guessSpelling("en-GB", "America/New_York"), "british");
	});

	await suite.test("the reader's own tags are painted as any filter is, and the mistakes say why", () => {
		const spans = filterSpans("@i:own @in @i:own @is:sunday", null);
		assert.deepEqual(
			spans.map((span) => span.kind),
			["match", "match", "match", "match"],
		);
		const onTab = filterSpans("@is:sunday", null, collectionQuery("arc"));
		assert.deepEqual(
			onTab.map((span) => [span.kind, span.reason]),
			[["invalid", "Did you mean @has @is:sunday?"]],
		);
		const nested = filterSpans("@has @is:sunday", null, collectionQuery("arc"));
		assert.deepEqual(
			nested.map((span) => span.kind),
			["match", "match"],
		);
	});

	await suite.test("the filter bar ticks nothing inside an operator", () => {
		assert.deepEqual([...selectedTokens("@is:sunday @in (@has @year:1988)")], ["@is:sunday"]);
	});
});

test("the Collections page's search box", async (suite) => {
	await suite.test("it is always there; empty, its × is disabled, and the build writes every tab that way", () => {
		const html = buildCollectionsHeaderHtml("books", false);
		assert.match(html, /class="results-input collections-search-input"[^>]*value=""/s);
		assert.match(html, /collections-search-clear"[^>]*disabled/);
		assert.match(html, /href="\/arcs"/);
		assert.match(buildCollectionsHeaderHtml("books", false, ""), /href="\/arcs"/);
	});

	await suite.test("it holds the query, and every other tab keeps the same one", () => {
		const html = buildCollectionsHeaderHtml("arcs", false, 'snow "fort"');
		assert.match(html, /class="results-input collections-search-input"[^>]*value="snow &quot;fort&quot;"/s);
		assert.doesNotMatch(html, /collections-search-clear"[^>]*disabled/);
		assert.match(html, /href="\/books\?q=snow%20%22fort%22"/);
	});
});
