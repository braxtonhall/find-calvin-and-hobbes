import test from "node:test";
import assert from "node:assert/strict";
import { search, TUNING, Tuning } from "../src/search";
import { buildArchive, Entry, install } from "./helpers/archive";

function ranked(query: string, tuning?: Tuning): string[] {
	return search(query, "rank", tuning).map((result) => result.comic.date);
}

function scoreOf(query: string, date: string): number {
	const result = search(query, "rank").find((candidate) => candidate.comic.date === date);
	assert.ok(result, `expected ${date} to match "${query}"`);
	return result.score;
}

function sourceOf(query: string, date: string): string {
	const result = search(query, "rank").find((candidate) => candidate.comic.date === date);
	assert.ok(result, `expected ${date} to match "${query}"`);
	return result.source;
}

const CLEAN_ROOM: Entry[] = [
	{
		date: "2000-01-01",
		transcript: "Clean your room, Calvin! I already cleaned it once this year.",
		description: "Calvin is told by Mom to clean his bedroom. Hobbes watches.",
	},
	{
		date: "2000-01-02",
		transcript: "Your room is a disaster. I cannot clean what I cannot see.",
		description: "Calvin argues with Mom about the state of his bedroom.",
	},
];

test("a contiguous phrase outranks the same words scattered", () => {
	install(buildArchive(CLEAN_ROOM));
	assert.deepEqual(ranked("clean your room").slice(0, 2), ["2000-01-01", "2000-01-02"]);
	assert.ok(scoreOf("clean your room", "2000-01-01") > scoreOf("clean your room", "2000-01-02"));
});

test("punctuation between the query words does not break the phrase bonus", () => {
	install(buildArchive([{ date: "2000-01-01", transcript: "Clean your room, Calvin!" }]));
	const punctuated = scoreOf("clean your room", "2000-01-01");
	install(buildArchive([{ date: "2000-01-01", transcript: "Clean your room Calvin" }]));
	assert.equal(scoreOf("clean your room", "2000-01-01"), punctuated);
});

test("word order matters to a transcript match", () => {
	install(buildArchive([{ date: "2000-01-01", transcript: "Clean your room, Calvin!" }]));
	const inOrder = scoreOf("clean your room", "2000-01-01");
	const reversed = scoreOf("room your clean", "2000-01-01");
	assert.ok(reversed < inOrder, `expected ${reversed} < ${inOrder}`);
});

test("a long recitation survives one misremembered word", () => {
	install(
		buildArchive([
			{
				date: "2000-01-01",
				transcript: "You know you'll hate something when they won't tell you what it is.",
			},
		]),
	);
	assert.deepEqual(ranked("you know you'll hate something when they don't tell you what it is"), ["2000-01-01"]);
});

test("a query term absent from every comic is ignored rather than fatal", () => {
	install(buildArchive([{ date: "2000-01-01", transcript: "I rigged a tuna fish sandwich yesterday." }]));
	assert.deepEqual(ranked("rigged a tuna fish baguette yesterday"), ["2000-01-01"]);
});

const UBIQUITOUS: Entry[] = [
	{
		date: "2000-01-01",
		transcript: "It is a duplicator now. Counterfeiting is one of its many uses.",
		description: "Calvin shows Hobbes the duplicator he built out of a cardboard box.",
	},
	{
		date: "2000-01-02",
		transcript: "Calvin, get down here right now.",
		description: "Calvin ignores Mom and keeps reading in the hallway with Hobbes.",
	},
];

test("a word in every description carries no weight there but still counts in a transcript", () => {
	install(buildArchive(UBIQUITOUS));
	assert.equal(sourceOf("calvin", "2000-01-02"), "transcript");
	assert.ok(
		!search("calvin", "rank").some((result) => result.source === "description"),
		"a word present in every description must not admit description-only results",
	);
});

test("a ubiquitous description word neither admits nor blocks a result", () => {
	install(buildArchive(UBIQUITOUS));
	assert.deepEqual(ranked("calvin duplicator"), ["2000-01-01"]);
	assert.deepEqual(ranked("calvin hallway"), ["2000-01-02"]);
});

// The corpus has to be big enough for `bathtub` to be common WITHOUT being weightless. An
// earlier version of this used three documents, which put `bathtub` in all of them: its IDF was
// zero, it was dropped below descriptionIdfFloor before scoring, and the two candidates were
// left covering one equally rare term each. The assertion pinned a preference between two
// symmetric documents, so it was measuring a tie-break rather than the rule in its own name.
test("a partial description match survives only if it covers the rare term", () => {
	const filler: Entry[] = Array.from({ length: 7 }, (_, index) => ({
		date: `2000-02-${String(index + 1).padStart(2, "0")}`,
		transcript: "Nothing to see here.",
		description: "Hobbes naps on the windowsill.",
	}));
	install(
		buildArchive([
			{
				date: "2000-01-01",
				transcript: "Nothing to see here.",
				description: "Calvin uses the transmogrifier in the bathtub.",
			},
			{
				date: "2000-01-02",
				transcript: "Nothing to see here.",
				description: "Calvin is in the bathtub by the window.",
			},
			{ date: "2000-01-03", transcript: "Nothing to see here.", description: "Calvin fills the bathtub up." },
			...filler,
		]),
	);
	// `bathtub` is in 3 of 10 descriptions and carries real weight; `transmogrifier` is in one.
	// The two strips that have only the common word must not ride in on it.
	assert.deepEqual(ranked("transmogrifier bathtub"), ["2000-01-01"]);
});

// A wrong word in a two-word query leaves nothing to forgive it with, so the pair behaves as
// an AND. The allowance only appears once the query is long enough to carry one.
test("required coverage tightens as the query shortens", () => {
	install(
		buildArchive([
			{ date: "2000-01-01", transcript: "Rosalyn is here to babysit.", description: "Rosalyn arrives." },
			{ date: "2000-01-02", transcript: "Susie is reading outside.", description: "Susie reads on the porch." },
		]),
	);
	assert.deepEqual(ranked("rosalyn"), ["2000-01-01"]);
	assert.deepEqual(ranked("susie"), ["2000-01-02"]);
	assert.deepEqual(ranked("rosalyn susie"), [], "neither term may carry a two-word query alone");
});

test("description vocabulary absent from the transcript is still findable", () => {
	install(
		buildArchive([
			{
				date: "2000-01-01",
				transcript: "Do you believe in fate? What a scary thought!",
				description: "Calvin and Hobbes ride the wagon down the hill discussing whether life is predestined.",
			},
		]),
	);
	const results = search("wagon predestined", "rank");
	assert.equal(results.length, 1);
	assert.equal(results[0].comic.date, "2000-01-01");
	assert.equal(results[0].source, "description");
});

test("highlight ranges skip uninformative words unless nothing else matched", () => {
	install(buildArchive([{ date: "2000-01-01", transcript: "You are the one in the transmogrifier." }]));
	const mixed = search("the transmogrifier", "rank")[0];
	assert.equal(mixed.ranges.length, 1, "only the informative term should highlight");
	assert.equal(mixed.text.slice(mixed.ranges[0][0], mixed.ranges[0][1]).toLowerCase(), "transmogrifier");

	const bare = search("the", "rank").find((result) => result.comic.date === "2000-01-01");
	assert.ok(bare && bare.ranges.length > 0, "a query of only common words must still highlight");
});

test("a typo still finds the strip", () => {
	install(buildArchive([{ date: "2000-01-01", transcript: "Isn't that your transmogrifier?" }]));
	assert.deepEqual(ranked("transmogrifer"), ["2000-01-01"]);
});

test("an alternate transcript is searched and does not inflate document frequency", () => {
	install(
		buildArchive([
			{
				date: "2000-01-01",
				transcript: "The first version says nothing unusual.",
				alternate: "The second version mentions the transmogrifier.",
			},
		]),
	);
	const results = search("transmogrifier", "rank");
	assert.equal(results.length, 1);
	assert.match(results[0].text, /second version/);
});

test("date sort keeps archive order and rank sort orders by score", () => {
	install(buildArchive(CLEAN_ROOM));
	const byDate = search("clean your room", "date").map((result) => result.comic.date);
	assert.deepEqual(byDate, [...byDate].sort());
	const scores = search("clean your room", "rank").map((result) => result.score);
	assert.deepEqual(
		scores,
		[...scores].sort((a, b) => b - a),
	);
});

test("an empty query returns nothing and a punctuation query falls back to substring", () => {
	install(buildArchive([{ date: "2000-01-01", transcript: "Ack! No no no!! ?!" }]));
	assert.deepEqual(search("", "rank"), []);
	assert.deepEqual(search("   ", "rank"), []);
	assert.deepEqual(ranked("?!"), ["2000-01-01"]);
});

// A compound the corpus usually writes open is indexed and queried as its parts, so the two
// spellings are one token to the scorer. The highlight still has to cover the word as written.
test("a closed compound and its open spelling find each other", () => {
	install(
		buildArchive([
			{ date: "2000-01-01", transcript: "Aren't you going to say good night to Hobbes?" },
			{ date: "2000-01-02", transcript: "She said goodnight and turned off the lamp." },
		]),
	);

	assert.deepEqual(ranked("goodnight"), ["2000-01-01", "2000-01-02"]);
	assert.deepEqual(ranked("good night"), ["2000-01-01", "2000-01-02"]);
});

test("a split compound is highlighted once, across the whole word", () => {
	install(buildArchive([{ date: "2000-01-01", transcript: "She said goodnight and left." }]));

	const [result] = search("goodnight", "rank");
	assert.equal(result.comic.date, "2000-01-01");
	const [start, end] = result.ranges[0];
	assert.equal(result.ranges.length, 1, `expected one range, got ${JSON.stringify(result.ranges)}`);
	assert.equal(result.text.slice(start, end), "goodnight");
});

test("tuning is injectable and coverage is what admits partial matches", () => {
	install(
		buildArchive([
			{ date: "2000-01-01", transcript: "You know you'll hate something when they won't tell you." },
			{ date: "2000-01-02", transcript: "I don't know what you mean by that." },
		]),
	);
	const strict: Tuning = { ...TUNING, transcriptCoverageFloor: 1 };
	assert.deepEqual(ranked("you know you'll hate something when they don't tell you", strict), []);
	assert.deepEqual(ranked("you know you'll hate something when they don't tell you"), ["2000-01-01"]);
});
