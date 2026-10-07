import test from "node:test";
import assert from "node:assert/strict";
import { loadTuning } from "../build-chain/tuning";
import { withConfig } from "./helpers/config";
import { ENGINE_TUNING } from "./helpers/engine-tuning";

/** The tuning: that it must give every setting, as a number, and nothing else. */

/** A project whose `config.yaml` imports this `tuning.yaml`, which is not there for `null`. */
function withTuning<T>(contents: string | null, run: (config: string) => T): T {
	return withConfig("tuning: !Import ./tuning.yaml\n", run, contents === null ? {} : { "tuning.yaml": contents });
}

/** Every setting, as `tuning.yaml` would write it, with `changes` applied: a value, or `undefined` to leave one out. */
function yamlOf(changes: Record<string, unknown> = {}): string {
	return Object.entries({ ...ENGINE_TUNING, ...changes })
		.filter(([, value]) => value !== undefined)
		.map(([key, value]) => `${key}: ${typeof value === "string" ? JSON.stringify(value) : value}\n`)
		.join("");
}

test("a complete tuning.yaml is read as it is written", () => {
	assert.deepEqual(withTuning(`# Notes.\n${yamlOf()}`, loadTuning), ENGINE_TUNING);
});

test("tuning can be written in config.yaml itself", () => {
	const inline = yamlOf()
		.split("\n")
		.map((line) => (line ? `  ${line}` : line))
		.join("\n");
	assert.deepEqual(withConfig(`tuning:\n${inline}`, loadTuning), ENGINE_TUNING);
});

test("a tuning.yaml that is missing or incomplete stops the build", () => {
	assert.throws(() => withTuning(null, loadTuning), /imports \.\/tuning\.yaml, which does not exist/);
	assert.throws(() => withConfig("name: x\n", loadTuning), /must give tuning/);
	assert.throws(() => withTuning("# Nothing yet.\n", loadTuning), /must be a mapping/);
	assert.throws(() => withTuning(yamlOf({ runWeight: undefined }), loadTuning), /must give runWeight/);
	assert.throws(() => withTuning(yamlOf({ runWeight: null }), loadTuning), /must give runWeight/);
});

test("a tuning.yaml with a setting that is not a number, or not a setting, stops the build", () => {
	assert.throws(() => withTuning(yamlOf({ runWeight: "high" }), loadTuning), /runWeight in tuning must be a number/);
	assert.throws(() => withTuning(yamlOf({ runWieght: 2 }), loadTuning), /unknown setting, runWieght/);
});
