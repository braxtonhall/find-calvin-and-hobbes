import test from "node:test";
import assert from "node:assert/strict";
import { loadCompoundRelations, readCompoundsFile } from "../build-chain/compoundLexicon";
import { COMPOUND_CANONICAL_FORMS, COMPOUND_RELATIONS } from "../src/compounds";
import { withConfig } from "./helpers/config";

/**
 * `compounds.yaml`: that the corpus rule runs without it, and that it keeps words whole and splits
 * the ones the rule cannot find.
 */

// `goodnight` once, `good night` twice: the rule splits it. `snowman` is never written open, so
// only a hand-split entry can. `sunset` is written open as often as closed.
const COMICS = `strips:
  "20000101": Say goodnight.
  "20000102": Good night, Hobbes.
  "20000103": Good night, Mom.
  "20000104": A snowman at sunset.
  "20000105": The snow man. The sun set.
  "20000106": Sun set again, and snow.
`;

/** A project importing this archive and this `compounds.yaml` — or, for `null`, with the compounds off. */
function withProject<T>(compounds: string | null, run: (config: string) => T): T {
	const files: Record<string, string> = { "comics.yaml": COMICS };
	if (compounds !== null) files["compounds.yaml"] = compounds;
	const part = compounds === null ? "false" : "!Import ./compounds.yaml";
	return withConfig(`comics: !Import ./comics.yaml\ncompounds: ${part}\n`, run, files);
}

const wholes = (config: string) => loadCompoundRelations(config).map(([whole]) => whole);

test("with the compounds off, the rule splits what the archive writes open", () => {
	withProject(null, (config) => {
		assert.deepEqual(wholes(config), ["goodnight", "sunset"]);
		assert.deepEqual(new Map(loadCompoundRelations(config)).get("goodnight"), {
			whole: "goodnight",
			parts: ["good", "night"],
			preference: "open",
		});
	});
});

test("a compounds.yaml with nothing in it is the same as the compounds off", () => {
	withProject("# Nothing yet.\n", (config) => assert.deepEqual(wholes(config), ["goodnight", "sunset"]));
});

test("keepWhole stops the rule splitting a word", () => {
	withProject("keepWhole:\n  - sunset\n", (config) => assert.deepEqual(wholes(config), ["goodnight"]));
});

test("a compound split by hand is split, with its preference", () => {
	withProject("compounds:\n  closed:\n    snowman: snow man\n", (config) => {
		assert.deepEqual(new Map(loadCompoundRelations(config)).get("snowman"), {
			whole: "snowman",
			parts: ["snow", "man"],
			preference: "closed",
		});
	});
});

test("a compound split by hand overrides the rule's split of it", () => {
	withProject("compounds:\n  balanced:\n    sunset: sun set\n", (config) => {
		assert.equal(new Map(loadCompoundRelations(config)).get("sunset")?.preference, "balanced");
	});
});

test("a malformed compounds.yaml stops the build", () => {
	const rejects = (contents: string, message: RegExp) =>
		withProject(contents, (config) => assert.throws(() => readCompoundsFile(config), message));

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
