import test from "node:test";
import assert from "node:assert/strict";
import { loadRealArchive } from "./helpers/archive";
import { RECITED } from "./fixtures/golden";
import { stem } from "../src/stem";
import { CLASS_NAMES, GENERATED_PATH, LabelledQuery, loadGenerated, splitFor } from "./helpers/queries";

const CLASSES = Object.keys(CLASS_NAMES);
const STATUSES = ["validated", "ambiguous"];

const WORD = /[\p{L}\p{N}']+/gu;
const words = (text: string) => [...text.toLowerCase().matchAll(WORD)].map((match) => match[0]);

function spans(text: string, size: number): Set<string> {
	const tokens = words(text);
	const found = new Set<string>();
	for (let index = 0; index + size <= tokens.length; index++) {
		found.add(tokens.slice(index, index + size).join(" "));
	}
	return found;
}

const archive = loadRealArchive();
const byDate = new Map(archive.comics.map((comic) => [comic.date, comic]));
const generated = loadGenerated();

const transcriptOf = (date: string) => {
	const comic = byDate.get(date);
	return comic ? `${comic.transcript} ${comic.alternate || ""}` : "";
};
const descriptionOf = (date: string) => {
	const comic = byDate.get(date);
	return comic ? archive.descriptions.get(comic.id || comic.date) || "" : "";
};

// Document frequency over the descriptions, matching how the index counts: one comic is one
// document. The engine's own test for whether a word is worth anything in this corpus: below
// descriptionIdfFloor a term is dropped outright, so a query resting on such words is resting
// on nothing. `calvin` is in 98% of descriptions and fails this, as it should.
const DESCRIPTION_IDF_FLOOR = 1;
const documentFrequency = new Map<string, number>();
for (const description of archive.descriptions.values()) {
	for (const word of new Set(words(description))) {
		documentFrequency.set(word, (documentFrequency.get(word) || 0) + 1);
	}
}
const informative = (word: string) => {
	const frequency = documentFrequency.get(word);
	return frequency !== undefined && Math.log(archive.descriptions.size / frequency) >= DESCRIPTION_IDF_FLOOR;
};

// Every bound a recitation has to clear, measured in one place so the calibration test below
// can hold the hand-written set to exactly the rules the generator is held to.
function recite(query: string, date: string) {
	const asked = words(query);
	const transcript = words(transcriptOf(date));
	const joined = transcript.join(" ");
	const present = new Set(transcript);

	let run = 0;
	for (let start = 0; start < asked.length; start++) {
		for (let end = start; end < asked.length; end++) {
			if (!joined.includes(asked.slice(start, end + 1).join(" "))) break;
			run = Math.max(run, end - start + 1);
		}
	}

	return {
		run,
		overlap: asked.filter((word) => present.has(word)).length / asked.length,
		length: asked.length,
		share: asked.length / Math.max(1, transcript.length),
	};
}

test(`${GENERATED_PATH} schema`, async (suite) => {
	await suite.test("every row has the required shape", () => {
		for (const row of generated) {
			const where = `row ${row.id ?? "(no id)"}`;
			assert.equal(typeof row.id, "string", `${where}: id must be a string`);
			assert.ok(row.query && typeof row.query === "string", `${where}: query must be a non-empty string`);
			assert.ok(CLASSES.includes(row.class), `${where}: class ${row.class} is not one of ${CLASSES}`);
			assert.ok(STATUSES.includes(row.status), `${where}: status ${row.status} is not one of ${STATUSES}`);
			assert.ok(["train", "test"].includes(row.split), `${where}: split ${row.split} is not train or test`);
			assert.ok(row.source && typeof row.source === "string", `${where}: source must be recorded`);
			if (row.status === "ambiguous") assert.ok(row.reason, `${where}: an ambiguous row must record why`);
		}
	});

	await suite.test("ids are unique", () => {
		const seen = new Set<string>();
		for (const row of generated) {
			assert.ok(!seen.has(row.id), `duplicate id ${row.id}`);
			seen.add(row.id);
		}
	});

	await suite.test("targets resolve to real strips", () => {
		for (const row of generated) {
			if (row.class === "D") {
				assert.equal(row.date, null, `${row.id}: a hollow query must have no target`);
				continue;
			}
			assert.ok(row.date && byDate.has(row.date), `${row.id}: date ${row.date} is not a strip in the archive`);
			if (row.class === "E") {
				assert.ok(row.decoy, `${row.id}: a near-miss query must name a decoy`);
				assert.ok(byDate.has(row.decoy!), `${row.id}: decoy ${row.decoy} is not a strip in the archive`);
				assert.notEqual(row.decoy, row.date, `${row.id}: the decoy must differ from the target`);
			}
		}
	});

	await suite.test("splits follow the strip, not the query", () => {
		for (const row of generated) {
			assert.equal(
				row.split,
				splitFor(row.date ?? row.id),
				`${row.id}: split must be derived from the strip so paraphrases cannot straddle the boundary`,
			);
		}
	});
});

// A description query is written by someone who has never read the description, so it cannot
// echo its phrasing. There is deliberately no matching rule for class A: a remembered line is
// verbatim by nature, and banning that is what broke the recited set (see the calibration test
// below). Class A is bounded by length and by share of the transcript instead.
test("generated queries do not leak the text they are meant to find", async (suite) => {
	const described = generated.filter((row: LabelledQuery) => row.class === "B" && row.date);

	await suite.test("a described query shares no three-word span with the description", () => {
		for (const row of described) {
			const description = spans(descriptionOf(row.date!), 3);
			for (const span of spans(row.query, 3)) {
				assert.ok(!description.has(span), `${row.id}: "${row.query}" echoes the description at "${span}"`);
			}
		}
	});
});

// A class A query is bracketed from both sides. Below, it must stay close enough to the
// transcript to be a memory rather than a thesaurus pass: the first generated batches kept a
// run of 3 words and 44-59% overlap, which nothing can find. Above, it must stay small enough
// to be a query rather than a transcription — and this is the half that was missing. Banning
// verbatim spans outright, as an earlier rule did, made "reproduce the strip and change two
// words" the cheapest way to satisfy the run and overlap rules, and the generator took it:
// the median class A row covered 73% of its transcript against the hand-written set's 19%,
// one covered 108%, and the class returned a 0% zero rate and MRR 0.993 while discriminating
// between no two configurations at all.
//
// Class C is deliberately excluded: a hybrid query draws some of its words from the
// description, so holding it to a recitation standard would be measuring the wrong thing.
const MINIMUM_RUN = 5;
const MINIMUM_OVERLAP = 0.7;

// Both bounds are the hand-written set's own maxima, so every rule here is calibrated against
// a real query rather than a theory of one. The calibration test below pins that.
const LONGEST_RECITED = 14;
const MAXIMUM_SHARE = 0.65;

test("generated recitations are memories, not transcriptions", async (suite) => {
	const recited = generated.filter((row: LabelledQuery) => row.class === "A" && row.date);
	const measure = (row: LabelledQuery) => recite(row.query, row.date!);

	await suite.test(`a recited query keeps a verbatim run of ${MINIMUM_RUN} words`, () => {
		assert.deepEqual(
			recited.filter((row) => measure(row).run < MINIMUM_RUN).map((row) => `${row.id} (run ${measure(row).run})`),
			[],
			"a recitation with no intact phrase is a paraphrase, and measures the generator",
		);
	});

	await suite.test(`a recited query keeps ${MINIMUM_OVERLAP * 100}% of its words`, () => {
		assert.deepEqual(
			recited
				.filter((row) => measure(row).overlap < MINIMUM_OVERLAP)
				.map((row) => `${row.id} (${(measure(row).overlap * 100).toFixed(0)}%)`),
			[],
			"too few of the words survive in the transcript to call this a memory of it",
		);
	});

	await suite.test(`a recited query is at most ${LONGEST_RECITED} words`, () => {
		assert.deepEqual(
			recited
				.filter((row) => measure(row).length > LONGEST_RECITED)
				.map((row) => `${row.id} (${measure(row).length} words)`),
			[],
			"nobody types a paragraph from memory; a query this long is a transcription",
		);
	});

	await suite.test(`a recited query covers at most ${MAXIMUM_SHARE * 100}% of the transcript`, () => {
		assert.deepEqual(
			recited
				.filter((row) => measure(row).share > MAXIMUM_SHARE)
				.map((row) => `${row.id} (${(measure(row).share * 100).toFixed(0)}% of the strip)`),
			[],
			"a query that reproduces the strip is the corpus measuring itself, and is found by anything",
		);
	});
});

// The rule that was missing. Every threshold above is a claim about what a real recited query
// looks like, and the 27 hand-written ones are the only evidence in the repository of what
// that is. A rule they fail is measuring the wrong thing — which is exactly what happened:
// the verbatim-span ban rejected 17 of these 27, including `will you check for monsters under
// the bed`, while the set it produced scored MRR 1.000 and told the sweep nothing.
test("the class A rules accept the queries a person actually wrote", () => {
	const failures = RECITED.filter((row) => {
		const measured = recite(row.query, row.date);
		return (
			measured.run < MINIMUM_RUN ||
			measured.overlap < MINIMUM_OVERLAP ||
			measured.length > LONGEST_RECITED ||
			measured.share > MAXIMUM_SHARE
		);
	});

	// One golden query is a genuine outlier rather than evidence the rules are wrong, so the
	// bar is 26 of 27 rather than all of them. Any further slippage means a threshold moved
	// away from the hand-written set and needs justifying against it, not against a theory.
	assert.ok(
		failures.length <= 1,
		`${failures.length} of ${RECITED.length} hand-written recited queries fail the class A rules, ` +
			`so the rules describe something other than a real query:\n` +
			failures.map((row) => `  "${row.query}" -> ${JSON.stringify(recite(row.query, row.date))}`).join("\n"),
	);
});

// The anti-leak rules stop a query being too close to its source. These stop it being too far.
// A paragraph-length paraphrase that shares no informative word with the description it targets
// cannot be answered at any parameter value, so a set full of them measures the generator
// rather than the engine: the 45 rows written in the first loop scored MRR 0.022 against the
// hand-written set's 1.000, on queries averaging 23 words against the golden set's 5.
test("generated description queries are answerable at all", async (suite) => {
	const described = generated.filter((row: LabelledQuery) => row.class === "B" && row.date);

	// The hand-written set tops out at eight words and a real keyword query is shorter still,
	// so the cap is generous: only paragraph-length paraphrases fail it.
	const LONGEST = 12;

	await suite.test(`a described query is at most ${LONGEST} words`, () => {
		const long = described
			.map((row) => ({ row, length: words(row.query).length }))
			.filter(({ length }) => length > LONGEST);
		assert.deepEqual(
			long.map(({ row, length }) => `${row.id} (${length} words)`),
			[],
			`a description query nobody would type cannot measure the engine`,
		);
	});

	await suite.test("a described query shares an informative word with its description", () => {
		const unanswerable = described.filter((row) => {
			const description = new Set(words(descriptionOf(row.date!)));
			return !words(row.query).some((word) => description.has(word) && informative(word));
		});
		assert.deepEqual(
			unanswerable.map((row) => row.id),
			[],
			`no informative word in common with the description, so no lexical matcher can find it`,
		);
	});
});

// An emphasis pair: the target says one word over and over, the decoy says two other forms of
// that same word once each and never the word itself. Both strips look equally relevant to a
// bag of words, and they come apart only on whether variety counts as repetition. Requiring the
// repeated word to be in the query, informative, and absent from the decoy makes the pair
// decidable by the rule above as well, so it measures the parameter rather than confusion.
const EMPHASIS_REPEATS = 3;
const EMPHASIS_FORMS = 2;
const EMPHASIS_FROM = 12;
const EMPHASIS_SHARE = 0.25;

function emphasises(row: LabelledQuery): string | null {
	const target = words(`${transcriptOf(row.date!)} ${descriptionOf(row.date!)}`);
	const decoy = words(`${transcriptOf(row.decoy!)} ${descriptionOf(row.decoy!)}`);
	const asked = new Set(words(row.query));

	const families = new Map<string, Set<string>>();
	for (const word of decoy) {
		const key = stem(word);
		if (!families.has(key)) families.set(key, new Set());
		families.get(key)!.add(word);
	}

	const repeats = new Map<string, number>();
	for (const word of target) repeats.set(word, (repeats.get(word) || 0) + 1);

	for (const [word, count] of repeats) {
		if (count < EMPHASIS_REPEATS || !asked.has(word) || !informative(word)) continue;
		if (families.get(stem(word))?.has(word)) continue;
		if ((families.get(stem(word))?.size ?? 0) >= EMPHASIS_FORMS) return word;
	}
	return null;
}

// A near-miss pair asks the engine to prefer one of two similar strips, which is only a question
// if something in the query separates them. The generation protocol asked for a decoy that was
// plausibly confusable and never required it to be distinguishable, and paraphrase-level decoys
// usually are not: 4 of the first 7 pairs shared no distinguishing word at all, a 5th was
// separated only by `an`, and the class scored 0/7. That measured the fixture, not the ranker.
test("generated near-miss pairs are decidable", async (suite) => {
	const pairs = generated.filter((row: LabelledQuery) => row.class === "E" && row.date && row.decoy);

	const vocabulary = (date: string) => new Set([...words(descriptionOf(date)), ...words(transcriptOf(date))]);

	await suite.test("a near-miss query holds an informative word the decoy does not", () => {
		const undecidable = pairs.filter((row) => {
			const target = vocabulary(row.date!);
			const decoy = vocabulary(row.decoy!);
			return !words(row.query).some((word) => target.has(word) && !decoy.has(word) && informative(word));
		});
		assert.deepEqual(
			undecidable.map((row) => `${row.id} (vs ${row.decoy})`),
			[],
			"nothing in the query separates the target from its decoy, so no ranking of the two can be correct",
		);
	});

	// `repeatVariety` asks whether several forms of a word are the same evidence as one word
	// said several times, and nothing in the fixture can answer it: at 0 and at 1 all 444
	// queries return their target at exactly the same rank. An emphasis pair is the shape that
	// separates them. The archive offers 23,607 of them, so the gap is in what the protocol
	// asks for rather than in what the corpus holds.
	//
	// `stem` is imported rather than reimplemented here, unlike the document frequencies above:
	// what makes two words the same word is the engine's definition, and a pair built on any
	// other one would not stress the parameter it exists to stress.
	await suite.test("some near-miss pairs separate emphasis from variety", () => {
		const emphasis = pairs.filter((row) => emphasises(row) !== null);
		// A share only means something once there are pairs enough for it to be about the
		// protocol rather than about luck.
		const required = pairs.length < EMPHASIS_FROM ? 0 : Math.ceil(pairs.length * EMPHASIS_SHARE);
		assert.ok(
			emphasis.length >= required,
			`${emphasis.length} of ${pairs.length} near-miss pairs separate emphasis from variety, and ` +
				`${required} are needed. Such a pair repeats one informative query word in the target at least ` +
				`${EMPHASIS_REPEATS} times, and names a decoy that never uses that word but does use ` +
				`${EMPHASIS_FORMS} other forms of it.`,
		);
	});
});
