import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import type { LoaderContext } from "webpack";
import type { Tuning } from "../src/search";

const TUNING_KEYS = [
	"sequenceWeight",
	"runWeight",
	"transcriptRepeatWeight",
	"descriptionRepeatWeight",
	"repeatVariety",
	"rarityExponent",
	"exactWeight",
	"prefixWeight",
	"transcriptCoverageFloor",
	"descriptionCoverageFloor",
	"transcriptLengthForgiveness",
	"descriptionLengthForgiveness",
	"transcriptLiteralShare",
	"descriptionLiteralShare",
	"descriptionMinMass",
	"descriptionMassNormalization",
	"transcriptLengthNormalization",
	"descriptionLengthNormalization",
	"transcriptIdfFloor",
	"descriptionIdfFloor",
	"transcriptInflectionWeight",
	"descriptionInflectionWeight",
	"descriptionPreference",
	"agreementBonus",
] as const satisfies readonly (keyof Tuning)[];

// Fails to compile when `Tuning` gains a setting this list lacks, so the file cannot be read without it.
const EVERY_KEY: Record<Exclude<keyof Tuning, (typeof TUNING_KEYS)[number]>, never> = {};
void EVERY_KEY;

export function tuningPath(projectDir = path.join(__dirname, "..")): string {
	return path.join(projectDir, "tuning.yaml");
}

/** `tuning.yaml`, checked: every setting, each a number, and nothing else. */
export function loadTuning(projectDir?: string): Tuning {
	const file = tuningPath(projectDir);
	if (!fs.existsSync(file)) throw new Error("tuning.yaml is missing: the search needs a value for every setting");
	const [raw] = yaml.loadAll(fs.readFileSync(file, "utf8")) as unknown[];
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("tuning.yaml must be a mapping");

	const settings = raw as Record<string, unknown>;
	for (const key of Object.keys(settings)) {
		if (!(TUNING_KEYS as readonly string[]).includes(key))
			throw new Error(`tuning.yaml has an unknown setting, ${key}`);
	}
	const tuning = {} as Tuning;
	for (const key of TUNING_KEYS) {
		const value = settings[key];
		if (value === undefined || value === null) throw new Error(`tuning.yaml must give ${key}`);
		if (typeof value !== "number" || !Number.isFinite(value)) {
			throw new Error(`${key} in tuning.yaml must be a number (got ${JSON.stringify(value)})`);
		}
		tuning[key] = value;
	}
	return tuning;
}

/**
 * Stands in for `src/tuning.ts` in the bundle, as `archiveSpan.ts` does for `src/archive.ts`: the
 * tuning as a literal, rebuilt under `--watch` when `tuning.yaml` changes.
 */
export default function tuningLoader(this: LoaderContext<unknown>): string {
	const projectDir = this.rootContext;
	this.addDependency(tuningPath(projectDir));
	return `export const TUNING = ${JSON.stringify(loadTuning(projectDir))};\n`;
}
