import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import { loadCompoundRelations, readCompoundsFile } from "../build-chain/compoundLexicon";
import { COMPOUND_CANONICAL_FORMS, COMPOUND_RELATIONS } from "../src/compounds";

/**
 * `compounds.yaml`: that the corpus rule runs without it, and that it keeps words whole and splits
 * the ones the rule cannot find.
 */

// `goodnight` once, `good night` twice: the rule splits it. `snowman` is never written open, so
// only a hand-split entry can. `sunset` is written open as often as closed.
const COMICS = `dailies:
  "20000101": Say goodnight.
  "20000102": Good night, Hobbes.
  "20000103": Good night, Mom.
  "20000104": A snowman at sunset.
  "20000105": The snow man. The sun set.
  "20000106": Sun set again, and snow.
`;

/** A project holding this archive and, unless it is left out, this `compounds.yaml`. */
function withProject<T>(compounds: string | null, run: (projectDir: string) => T): T {
	const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "compounds-"));
	try {
		fs.writeFileSync(path.join(projectDir, "comics.yaml"), COMICS);
		if (compounds !== null) fs.writeFileSync(path.join(projectDir, "compounds.yaml"), compounds);
		return run(projectDir);
	} finally {
		fs.rmSync(projectDir, { recursive: true, force: true });
	}
}

const wholes = (projectDir: string) => loadCompoundRelations(projectDir).map(([whole]) => whole);

test("without compounds.yaml, the rule splits what the archive writes open", () => {
	withProject(null, (projectDir) => {
		assert.deepEqual(wholes(projectDir), ["goodnight", "sunset"]);
		assert.deepEqual(new Map(loadCompoundRelations(projectDir)).get("goodnight"), {
			whole: "goodnight",
			parts: ["good", "night"],
			preference: "open",
		});
	});
});

test("a compounds.yaml with nothing in it is the same as none", () => {
	withProject("# Nothing yet.\n", (projectDir) => assert.deepEqual(wholes(projectDir), ["goodnight", "sunset"]));
});

test("keepWhole stops the rule splitting a word", () => {
	withProject("keepWhole:\n  - sunset\n", (projectDir) => assert.deepEqual(wholes(projectDir), ["goodnight"]));
});

test("a compound split by hand is split, with its preference", () => {
	withProject("compounds:\n  closed:\n    snowman: snow man\n", (projectDir) => {
		assert.deepEqual(new Map(loadCompoundRelations(projectDir)).get("snowman"), {
			whole: "snowman",
			parts: ["snow", "man"],
			preference: "closed",
		});
	});
});

test("a compound split by hand overrides the rule's split of it", () => {
	withProject("compounds:\n  balanced:\n    sunset: sun set\n", (projectDir) => {
		assert.equal(new Map(loadCompoundRelations(projectDir)).get("sunset")?.preference, "balanced");
	});
});

test("a malformed compounds.yaml stops the build", () => {
	const rejects = (contents: string, message: RegExp) =>
		withProject(contents, (projectDir) => assert.throws(() => readCompoundsFile(projectDir), message));

	rejects("deny:\n  - sunset\n", /unknown setting, deny/);
	rejects("keepWhole: sunset\n", /must be a list/);
	rejects("keepWhole:\n  - Sunset\n", /not one lowercase word/);
	rejects("keepWhole:\n  - sun set\n", /not one lowercase word/);
	rejects("compounds:\n  sometimes:\n    snowman: snow man\n", /unknown group, sometimes/);
	rejects("compounds:\n  closed:\n    - snowman\n", /must map each compound/);
	rejects("compounds:\n  closed:\n    snowman: snowman\n", /split into two or more/);
	rejects("compounds:\n  closed:\n    snowman: Snow Man\n", /split into two or more/);
	rejects("compounds:\n  closed:\n    snowman: snow man\n  open:\n    snowman: snow man\n", /more than once/);
	rejects("keepWhole:\n  - snowman\ncompounds:\n  closed:\n    snowman: snow man\n", /keeps it whole/);
});

test("this archive's relations keep their preference beside the parts the search reads", () => {
	assert.deepEqual(COMPOUND_RELATIONS.get("snowball"), {
		whole: "snowball",
		parts: ["snow", "ball"],
		preference: "closed",
	});
	assert.deepEqual(COMPOUND_CANONICAL_FORMS.get("snowball"), ["snow", "ball"]);
});
