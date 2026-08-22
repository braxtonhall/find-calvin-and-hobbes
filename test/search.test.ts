import test from "node:test";
import assert from "node:assert/strict";
import { search, TUNING, Tuning } from "../src/search";
import { registerVocabulary } from "../src/filter-vocabulary";
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

test("date sort orders chronologically and rank sort orders by score", () => {
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

// The prefix rule already reaches `complains` from `complain`, because the corpus word is the
// longer of the two. This is the same relation in the direction a prefix cannot go, and it
// runs on descriptions only: a recitation quotes the strip, so its inflections are the
// strip's own, while a description query is the reader's sentence about the picture.
const BEDTIME: Entry[] = [
	{
		date: "2000-01-01",
		transcript: "Nothing to see here.",
		description: "Calvin complains that bedtime is a fascist regime.",
	},
	{
		date: "2000-01-02",
		transcript: "Nothing to see here.",
		description: "Calvin complained that bedtime is unfair.",
	},
	...Array.from({ length: 7 }, (_, index) => ({
		date: `2000-02-${String(index + 1).padStart(2, "0")}`,
		transcript: "Nothing to see here.",
		description: "Hobbes naps on the windowsill.",
	})),
];

test("a description written in another tense is still reachable", () => {
	install(buildArchive(BEDTIME));
	// Both are reachable, which is the property. Their order against each other is not: neither
	// holds the word as typed, so both are reached the same way and nothing ranked them until
	// `descriptionLengthNormalization` began breaking the tie by density. Which of the two comes
	// first is pinned by the next test, on a query that does hold one of them literally.
	assert.deepEqual(ranked("complaining").sort(), ["2000-01-01", "2000-01-02"]);
});

// Rarity is anchored on the term as typed and another inflection is worth less than the word
// itself, so widening what a term can reach never reorders what it already reached. At one
// term the two are not even comparable: required coverage is total, which only the word as
// written can pay, so a single-word query answers with exactly what was asked for.
test("the inflection that was typed still outranks the one that was not", () => {
	install(buildArchive(BEDTIME));
	assert.deepEqual(ranked("complained bedtime"), ["2000-01-02", "2000-01-01"]);
	assert.deepEqual(ranked("complained"), ["2000-01-02"]);
});

// One term reaches several words, so a field saying `snow` five times and a field saying
// `snow` and `snowball` once each both collect more hits than a field saying `snow` alone.
// `repeatVariety` decides whether the second of those counts as emphasis.
const SNOW: Entry[] = [
	{ date: "2000-01-01", transcript: "There is snow outside." },
	{ date: "2000-01-02", transcript: "Snow, snow, snow, snow and more snow outside." },
	{ date: "2000-01-03", transcript: "There is snow and a snowball outside." },
	...Array.from({ length: 7 }, (_, index) => ({
		date: `2000-02-${String(index + 1).padStart(2, "0")}`,
		transcript: "Nothing to see here at all.",
	})),
];

test("repeatVariety decides whether a second matched word counts as saying it again", () => {
	install(buildArchive(SNOW));
	const emphasis: Tuning = { ...TUNING, repeatVariety: 0 };

	// At 1 the extra word is a repetition, so one `snow` and one `snowball` outrank one `snow`.
	assert.deepEqual(ranked("snow outside").slice(0, 3), ["2000-01-02", "2000-01-03", "2000-01-01"]);
	// At 0 only the same word again counts, and the pair falls back behind the single mention.
	assert.deepEqual(ranked("snow outside", emphasis).slice(0, 3), ["2000-01-02", "2000-01-01", "2000-01-03"]);

	// Either way, five of one word beat one of it: a rarer relative must not displace the
	// repetition of the word that was typed.
	assert.equal(ranked("snow outside", emphasis)[0], "2000-01-02");
});

// The allowance that lets a long recitation survive a wrong word also lets a long query be
// answered by strips holding a fraction of it. `lengthForgiveness` is how fast that trade is
// made, and the two boundaries have to survive every value of it.
test("length forgiveness decides how fast a long query relaxes", () => {
	install(
		buildArchive([
			{ date: "2000-01-01", transcript: "Calvin and Hobbes discuss the transmogrifier at length today." },
			{ date: "2000-01-02", transcript: "Susie reads a book about the transmogrifier." },
			{ date: "2000-01-03", transcript: "Calvin and Hobbes discuss nothing at all today." },
		]),
	);
	const strict: Tuning = { ...TUNING, transcriptLengthForgiveness: 0.25 };
	const query = "calvin and hobbes discuss the transmogrifier at length today";

	assert.ok(
		ranked(query, strict).length <= ranked(query).length,
		"holding the bar up for a long query cannot admit more than letting it fall",
	);
	// A one-word query demands everything whatever the forgiveness, because m ** anything is 1
	// when m is 1, so a short query still has no room for a wrong word.
	assert.deepEqual(ranked("transmogrifier", strict), ranked("transmogrifier"));
});

// Coverage is rarity-weighted, so a strip holding two rare words can answer a query it has
// almost nothing to do with. `literalShare` is the plain count of terms matched without
// spelling correction, which is what separates the two cases below.
test("a literal share floor keeps out strips that only matched a misspelling", () => {
	install(
		buildArchive([
			{ date: "2000-01-01", transcript: "Ding dong. It's Rosalyn at the door." },
			{ date: "2000-01-02", transcript: "I cut a ping pong ball in half for school." },
			...Array.from({ length: 7 }, (_, index) => ({
				date: `2000-02-${String(index + 1).padStart(2, "0")}`,
				transcript: "Nothing to see here at all.",
			})),
		]),
	);

	// `ping` and `pong` are each one edit from `ding` and `dong`, so with no floor the ball
	// answers a question about a doorbell, and the doorbell answers a question about the ball.
	const open: Tuning = { ...TUNING, transcriptLiteralShare: 0 };
	assert.deepEqual(ranked("ding dong", open), ["2000-01-01", "2000-01-02"]);
	assert.deepEqual(ranked("ping pong", open), ["2000-01-02", "2000-01-01"]);

	// Requiring a third of the query to be matched outright leaves each of them with nothing to
	// answer the other: neither holds a term of it as written, extended, or in another inflection.
	const literal: Tuning = { ...TUNING, transcriptLiteralShare: 0.34 };
	assert.deepEqual(ranked("ding dong", literal), ["2000-01-01"]);
	assert.deepEqual(ranked("ping pong", literal), ["2000-01-02"]);
});

test("a typo is still forgiven when the rest of the query is literal", () => {
	install(buildArchive([{ date: "2000-01-01", transcript: "Isn't that your transmogrifier, Calvin?" }]));
	const literal: Tuning = { ...TUNING, transcriptLiteralShare: 0.34 };
	// One word of three is misspelt, so two thirds are still matched outright and the floor is
	// met. The floor bounds how much of a query a correction may carry, not whether it may.
	assert.deepEqual(ranked("your transmogrifer calvin", literal), ["2000-01-01"]);
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

test("document length normalization is off by default and prefers the shorter field when on", () => {
	// The same match in two transcripts of very different lengths, with the padding chosen so it
	// shares no vocabulary with the query and can only affect the result through length.
	install(
		buildArchive([
			{ date: "2000-01-01", transcript: "Isn't that your transmogrifier?" },
			{
				date: "2000-01-02",
				transcript:
					"Isn't that your transmogrifier? " +
					"Mom said we should go outside and play until dinner, so we went to the yard and " +
					"looked at the sky for a while, and then we came back in again because it rained.",
			},
		]),
	);

	// Off: the longer transcript is not penalised for its length, and wins on repetition alone or
	// ties. This is the behaviour every other parameter was fitted against.
	const off = search("transmogrifier", "rank");
	assert.equal(off.length, 2);
	assert.ok(
		off[0].score === off[1].score || off[0].comic.date === "2000-01-02",
		`without normalization the longer field must not be penalised, got ${off.map((r) => `${r.comic.date}:${r.score.toFixed(3)}`).join(" ")}`,
	);

	// On: the short transcript is mostly about the transmogrifier and the long one mostly is not.
	const on: Tuning = { ...TUNING, transcriptLengthNormalization: 1 };
	assert.deepEqual(ranked("transmogrifier", on), ["2000-01-01", "2000-01-02"]);
});

test("the description mass gate is a sum until normalized, and then a mean", () => {
	// The filler descriptions rotate eight subjects across sixty comics, so a subject word is
	// moderately common — rare enough to carry mass, common enough that a query full of them is
	// not specific. `snowman` appears once and is genuinely rare.
	install(
		buildArchive([
			{
				date: "2000-01-01",
				transcript: "Whump. Thpt.",
				description: "Calvin builds a snowman near the sandbox, the porch and the driveway.",
			},
		]),
	);

	// `achieved` sums over query terms, so padding a query with moderately common words raises the
	// total without making the query more specific. At normalization 0 a threshold therefore
	// rejects the one precise word and admits the vague four — which is backwards, and is why the
	// gate could never be raised far enough to stop a hollow query without deleting `snow` first.
	const summed: Tuning = { ...TUNING, descriptionMinMass: 8, descriptionMassNormalization: 0 };
	assert.deepEqual(ranked("snowman", summed), [], "one rare term cannot reach a threshold four terms sum to");
	assert.deepEqual(ranked("snowman sandbox porch driveway", summed), ["2000-01-01"]);

	// At normalization 1 the threshold is mass per matched term, so it means the same thing to a
	// query of one word as to a query of four, and the specific query is the one that survives.
	const meaned: Tuning = { ...TUNING, descriptionMinMass: 4, descriptionMassNormalization: 1 };
	assert.deepEqual(ranked("snowman", meaned), ["2000-01-01"]);
	assert.deepEqual(ranked("snowman sandbox porch driveway", meaned), [], "diluted by its own vaguer words");
});

function keys(results: { comic: { date: string; id?: string } }[]): string[] {
	return results.map((result) => `${result.comic.date}/${result.comic.id ?? ""}`);
}

// Two strips sharing a date, deliberately built in the wrong order so the sort has to do the
// work rather than inheriting whatever order the index happened to visit them in.
const SHARED_DATE: Entry[] = [
	{ date: "2000-01-03", transcript: "The wagon rolls down the hill." },
	{ date: "2000-01-01", transcript: "The wagon rolls down the hill.", id: "b" },
	{ date: "2000-01-01", transcript: "The wagon rolls down the hill.", id: "a" },
	{ date: "2000-01-02", transcript: "The wagon rolls slowly down the long steep hill and then some." },
];

function installShuffled(entries: Entry[]): void {
	const archive = buildArchive(entries);
	// A deterministic derangement of the archive order.
	archive.comics.reverse();
	install(archive);
}

test("date order is chronological and ignores the score", () => {
	installShuffled(SHARED_DATE);
	const byDate = search("wagon rolls down the hill", "date");
	assert.deepEqual(keys(byDate), ["2000-01-01/a", "2000-01-01/b", "2000-01-02/", "2000-01-03/"]);

	// The weakest match sits in the middle by date, so this ordering cannot have come from scores.
	const scores = byDate.map((result) => result.score);
	assert.ok(scores[2] < scores[1], "the 01-02 strip scores below the 01-01 strips");
	assert.ok(scores[2] < scores[3], "the 01-02 strip scores below the 01-03 strip");
});

test("rank order breaks score ties by date, then by id", () => {
	installShuffled(SHARED_DATE);
	const byRank = search("wagon rolls down the hill", "rank");

	// The three identical transcripts tie exactly; the fourth is padded and scores lower.
	const [first, second, third, last] = byRank;
	assert.equal(first.score, second.score);
	assert.equal(second.score, third.score);
	assert.ok(last.score < third.score, `expected ${last.score} < ${third.score}`);

	assert.deepEqual(keys(byRank), ["2000-01-01/a", "2000-01-01/b", "2000-01-03/", "2000-01-02/"]);
});

test("a daily sorts ahead of a special sharing its date", () => {
	installShuffled([
		{ date: "2000-01-01", transcript: "The wagon rolls down the hill.", id: "zzz" },
		{ date: "2000-01-01", transcript: "The wagon rolls down the hill." },
	]);
	for (const sort of ["date", "rank"] as const) {
		assert.deepEqual(keys(search("wagon rolls down the hill", sort)), ["2000-01-01/", "2000-01-01/zzz"], sort);
	}
});

test("a literal query is ordered the same way as a ranked one", () => {
	installShuffled(SHARED_DATE);
	assert.deepEqual(keys(search("!!!", "date")), []);
	installShuffled([
		{ date: "2000-01-02", transcript: "Wow!!! Look at that." },
		{ date: "2000-01-01", transcript: "Wow!!! Look!!! At that!!!", id: "s" },
		{ date: "2000-01-01", transcript: "Wow!!! Look at that." },
	]);
	// Date order is chronological even though the 01-01 special has the most hits.
	assert.deepEqual(keys(search("!!!", "date")), ["2000-01-01/", "2000-01-01/s", "2000-01-02/"]);
	// Rank order leads with the three-hit special, then falls back to chronology for the tie.
	assert.deepEqual(keys(search("!!!", "rank")), ["2000-01-01/s", "2000-01-01/", "2000-01-02/"]);
});

// Date search. Note every fixture above uses dates in 2000 and `buildArchive`'s fillers sit in
// 1980, both outside the archive's own 1985-1995 span — so no existing test can pick up a date
// match by accident, and these need in-range dates to work at all.
const DATED: Entry[] = [
	{ date: "1988-08-03", transcript: "A tiger appears out of nowhere.", description: "Hobbes pounces on Calvin." },
	{ date: "1988-08-10", transcript: "The sandbox is a wasteland.", description: "Calvin digs a hole." },
	{ date: "1989-08-03", transcript: "Snow goons are on the march.", description: "Calvin builds a snowman." },
	{
		date: "1988-10-27",
		transcript: "Just think, 1988 was a fine year for dust.",
		description: "Calvin lectures Hobbes.",
	},
];

test("a date finds a strip that nothing in the query matches", () => {
	install(buildArchive(DATED));
	const result = search("august 3 1988", "rank").find((candidate) => candidate.comic.date === "1988-08-03");
	assert.ok(result, "expected the strip published that day");
	assert.equal(result.source, "date");
	assert.deepEqual(result.ranges, [], "nothing in the text is why it matched, so nothing is highlighted");
	assert.equal(result.text, "A tiger appears out of nowhere.");
});

test("every spelling of one date finds the same strip", () => {
	install(buildArchive(DATED));
	const forms = [
		"1988-08-03",
		"1988/8/3",
		"19880803",
		"aug 3, 1988",
		"august 3rd 1988",
		"3 august 1988",
		"wednesday, august 3, 1988",
		"aug 3 '88",
	];
	for (const form of forms) {
		// The text search still runs, and one fixture strip says "1988" out loud, so the list is
		// not always a single row — what every spelling must agree on is which strip the date names
		// and that it leads.
		const results = search(form, "rank");
		assert.equal(results[0].comic.date, "1988-08-03", form);
		const byDate = results.filter((result) => result.source === "date").map((result) => result.comic.date);
		assert.deepEqual(byDate, ["1988-08-03"], form);
	}
});

test("an ambiguous date offers both strips, and the unambiguous form does not", () => {
	install(
		buildArchive([
			{ date: "1988-09-03", transcript: "Rituals are important." },
			{ date: "1988-03-09", transcript: "I wish I was a tiger." },
		]),
	);
	assert.deepEqual(ranked("9/3/1988"), ["1988-03-09", "1988-09-03"]);
	assert.deepEqual(ranked("1988/9/3"), ["1988-09-03"]);
	// 1988-03-09 was the Wednesday of the two, so the weekday picks it out.
	assert.deepEqual(ranked("wednesday 9/3/1988"), ["1988-03-09"]);
});

test("a date carrying two strips returns both, the daily first", () => {
	installShuffled([
		{ date: "1988-08-03", transcript: "A tiger appears.", id: "special" },
		{ date: "1988-08-03", transcript: "A tiger appears." },
	]);
	for (const sort of ["date", "rank"] as const) {
		assert.deepEqual(keys(search("1988-08-03", sort)), ["1988-08-03/", "1988-08-03/special"], sort);
	}
});

test("how precisely the date was named decides its strength", () => {
	install(buildArchive(DATED));
	const exact = scoreOf("1988-08-03", "1988-08-03");
	const narrow = scoreOf("august 1988", "1988-08-03");
	const broad = scoreOf("1988", "1988-08-03");
	assert.ok(exact > narrow, `expected ${exact} > ${narrow}`);
	assert.ok(narrow > broad, `expected ${narrow} > ${broad}`);

	// An exact date outranks the best a text match can do, and a bare year does not.
	install(buildArchive([...DATED, { date: "1990-01-01", transcript: "Snow snow snow snow snow snow." }]));
	const text = scoreOf("snow", "1990-01-01");
	assert.ok(scoreOf("1988-08-03", "1988-08-03") > text, "an exact date leads");
	assert.ok(scoreOf("1988", "1988-08-03") < text, "a bare year does not");
});

test("a strip matched by both the date and the text keeps its text row", () => {
	install(buildArchive(DATED));
	const result = search("1988", "rank").find((candidate) => candidate.comic.date === "1988-10-27");
	assert.ok(result);
	assert.equal(result.source, "transcript", "the highlight is the more useful thing to show");
	assert.ok(result.ranges.length > 0);
	// It matched two independent ways, so it must outscore both the year alone and its own text.
	assert.ok(result.score > scoreOf("1988", "1988-08-03"), "above the strips that matched by date only");
	assert.equal(sourceOf("august 3 1988", "1988-08-03"), "date", "and a date-only row still says so");
});

test("only a whole query is read as a date", () => {
	install(buildArchive(DATED));
	for (const query of ["august", "sunday", "1812", "1988 august tiger", "tiger 1988"]) {
		const dated = search(query, "rank").filter((result) => result.source === "date");
		assert.deepEqual(dated, [], `"${query}" is an ordinary text query`);
	}
});

test("a filter restricts a search and never adds to it", () => {
	install(buildArchive(DATED));
	const all = ranked("tiger");
	const filtered = ranked("@year:1988 tiger");
	assert.ok(all.length > 0);
	assert.ok(
		filtered.every((date) => all.includes(date)),
		"a filter cannot introduce a result",
	);
	assert.ok(filtered.every((date) => date.startsWith("1988")));
	assert.deepEqual(ranked("@year:1999 tiger"), [], "a filter that excludes everything returns nothing");
	assert.ok(
		ranked("@year:1988 tiger").every((date) => sourceOf("@year:1988 tiger", date) !== "date"),
		"filtered text matches keep their own source",
	);
});

test("a filter with nothing beside it returns everything it passes", () => {
	install(buildArchive(DATED));
	assert.deepEqual(ranked("@year:1988").sort(), ["1988-08-03", "1988-08-10", "1988-10-27"]);
	for (const date of ranked("@year:1988")) {
		// `filter` rather than `date`: these rows are what the filters let through, not strips whose
		// date the reader named. The distinction is invisible here and load-bearing for `@in:`.
		assert.equal(sourceOf("@year:1988", date), "filter");
	}
	assert.deepEqual(ranked("@month:8 @day:3").sort(), ["1988-08-03", "1989-08-03"]);
	assert.deepEqual(ranked("@year:1988 @day:wednesday").sort(), ["1988-08-03", "1988-08-10"]);
	assert.deepEqual(ranked("@year:1988 @day:thursday"), ["1988-10-27"]);
	// Unscoped, a weekday reaches the whole archive — including the fillers, which really are
	// Wednesdays. A filter constrains only what it names.
	assert.ok(ranked("@day:wednesday").length > ranked("@year:1988 @day:wednesday").length);
});

test("a filter composes with an implicit date and with the literal path", () => {
	install(buildArchive(DATED));
	// The residual is still wholly a date, so both mechanisms apply: 1988, then only Wednesdays.
	assert.deepEqual(ranked("@day:wednesday 1988").sort(), ["1988-08-03", "1988-08-10"]);

	install(
		buildArchive([
			{ date: "1988-08-03", transcript: "Wow!!!" },
			{ date: "1990-08-03", transcript: "Wow!!!" },
		]),
	);
	assert.deepEqual(ranked("@year:1988 !!!"), ["1988-08-03"]);
});

test("an unknown filter is ordinary text, and a broken one finds nothing", () => {
	install(buildArchive(DATED));
	assert.deepEqual(ranked("@foo:tiger"), ranked("foo tiger"));
	for (const query of ["@month:13", "@year:2001", "@day:funday"]) {
		assert.deepEqual(ranked(query), [], query);
	}
});

// A filter lifted out from between two words must not join them. Punctuation is ignored outright
// (see "punctuation between the query words does not break the phrase bonus" above); a filter is
// not punctuation, it is an excision, and the words either side were never adjacent.
test("a filter in the middle of a query breaks the contiguous-phrase bonus", () => {
	install(
		buildArchive([
			{ date: "1988-01-01", transcript: "Clean your room, Calvin!" },
			{ date: "1988-01-02", transcript: "Clean it. Your room is a disaster." },
		]),
	);

	// The bonus is withheld rather than a penalty levied, and scores are normalised by the best
	// multiplier the query actually reached — which is the contiguous strip itself. So the break
	// shows up as the gap closing: the scattered strip stops being marked down for missing a
	// phrase the reader never wrote.
	const phrase = "clean your room";
	const broken = "clean @year:1988 your room";
	assert.ok(scoreOf(phrase, "1988-01-01") > scoreOf(phrase, "1988-01-02"), "the phrase earns its bonus");
	assert.equal(
		scoreOf(broken, "1988-01-01"),
		scoreOf(broken, "1988-01-02"),
		"with the filter between them, neither strip matched a phrase the reader typed",
	);
	assert.ok(scoreOf(broken, "1988-01-02") > scoreOf(phrase, "1988-01-02"));

	// A leading filter leaves one segment, so there is no break and nothing changes.
	assert.equal(scoreOf("@year:1988 clean your room", "1988-01-01"), scoreOf(phrase, "1988-01-01"));
	assert.equal(scoreOf("@year:1988 clean your room", "1988-01-02"), scoreOf(phrase, "1988-01-02"));
});

/**
 * `@in:`, which is the one filter that asks about a strip rather than about the day it ran.
 *
 * Both paths through `search` are covered here, because they reach the predicate differently: a
 * filter with nothing beside it walks the index directly, while a filter beside a word narrows
 * whatever the text search returned. Filler strips are printed in nothing, so they cannot leak in.
 */
test("a filter over the books a strip was printed in", () => {
	const PRINTED: Entry[] = [
		{ date: "1988-08-03", transcript: "A tiger in the snow.", books: ["book3", "complete"] },
		{ date: "1988-08-10", transcript: "A tiger on the sidewalk.", books: ["complete"] },
		{ date: "1989-08-03", transcript: "A tiger in the snow again.", books: ["book4", "complete"] },
		{ date: "1990-08-03", transcript: "A tiger nobody reprinted." },
	];
	const BOOKS = ["book3", "book4", "complete"].map((value) => ({ value, hint: value }));

	install(buildArchive(PRINTED));
	try {
		registerVocabulary("in", () => BOOKS);

		// The filter is the whole query, so every strip that passes it is a row.
		assert.deepEqual(ranked("@in:book3"), ["1988-08-03"]);
		assert.deepEqual(ranked("@in:complete").sort(), ["1988-08-03", "1988-08-10", "1989-08-03"]);
		assert.equal(sourceOf("@in:book3", "1988-08-03"), "filter");

		// Beside a word it narrows what the text search found, and adds nothing to it.
		assert.deepEqual(ranked("@in:book3 tiger"), ["1988-08-03"]);
		assert.ok(ranked("tiger").length > ranked("@in:book3 tiger").length);

		// One filter, two books: the values union, exactly as two years do.
		assert.deepEqual(ranked("@in:book3 @in:book4").sort(), ["1988-08-03", "1989-08-03"]);

		// Two filters: the fields intersect.
		assert.deepEqual(ranked("@in:complete @year:1989"), ["1989-08-03"]);
		assert.deepEqual(ranked("@in:book3 @year:1989"), []);

		// A strip in no book is in no book, however much of the query it otherwise answers.
		assert.deepEqual(ranked("@in:complete @year:1990"), []);
		assert.deepEqual(ranked("@year:1990 tiger"), ["1990-08-03"]);

		// A book the archive does not have is a filter nothing satisfies, not a search for a word.
		assert.deepEqual(ranked("@in:snowman"), []);
		assert.deepEqual(ranked("@in:snowman tiger"), []);
	} finally {
		registerVocabulary("in", () => []);
	}
});
