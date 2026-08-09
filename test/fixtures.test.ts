import test from "node:test";
import assert from "node:assert/strict";
import { loadRealArchive } from "./helpers/archive";
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

// Queries copied out of the source text measure the corpus against itself. A recitation is a
// memory, so it must differ from the transcript somewhere; a description query is written by
// someone who has never read the description, so it cannot echo its phrasing.
test("generated queries do not leak the text they are meant to find", async (suite) => {
	const recited = generated.filter((row: LabelledQuery) => row.class === "A" && row.date);
	const described = generated.filter((row: LabelledQuery) => row.class === "B" && row.date);

	await suite.test("a recited query is never a verbatim span of the transcript", () => {
		for (const row of recited) {
			const query = words(row.query).join(" ");
			const transcript = words(transcriptOf(row.date!)).join(" ");
			assert.ok(!transcript.includes(query), `${row.id}: "${row.query}" is copied verbatim from the transcript`);
		}
	});

	await suite.test("a described query shares no three-word span with the description", () => {
		for (const row of described) {
			const description = spans(descriptionOf(row.date!), 3);
			for (const span of spans(row.query, 3)) {
				assert.ok(!description.has(span), `${row.id}: "${row.query}" echoes the description at "${span}"`);
			}
		}
	});
});
