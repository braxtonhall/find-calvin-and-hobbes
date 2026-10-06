import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import { loadTuning } from "../build-chain/tuning";
import { ENGINE_TUNING } from "./helpers/engine-tuning";

/** `tuning.yaml`: that it must give every setting, as a number, and nothing else. */

/** A project holding just this `tuning.yaml`, or none at all. */
function withTuning<T>(contents: string | null, run: (projectDir: string) => T): T {
	const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "tuning-"));
	try {
		if (contents !== null) fs.writeFileSync(path.join(projectDir, "tuning.yaml"), contents);
		return run(projectDir);
	} finally {
		fs.rmSync(projectDir, { recursive: true, force: true });
	}
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

test("a tuning.yaml that is missing or incomplete stops the build", () => {
	assert.throws(() => withTuning(null, loadTuning), /tuning\.yaml is missing/);
	assert.throws(() => withTuning("# Nothing yet.\n", loadTuning), /must be a mapping/);
	assert.throws(() => withTuning(yamlOf({ runWeight: undefined }), loadTuning), /must give runWeight/);
	assert.throws(() => withTuning(yamlOf({ runWeight: null }), loadTuning), /must give runWeight/);
});

test("a tuning.yaml with a setting that is not a number, or not a setting, stops the build", () => {
	assert.throws(
		() => withTuning(yamlOf({ runWeight: "high" }), loadTuning),
		/runWeight in tuning\.yaml must be a number/,
	);
	assert.throws(() => withTuning(yamlOf({ runWieght: 2 }), loadTuning), /unknown setting, runWieght/);
});
