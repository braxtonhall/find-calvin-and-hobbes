import type { LoaderContext } from "webpack";
import type { Tuning } from "../src/search";
import { watchConfig, loadRequiredPart, configName } from "./siteConfig";

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

/** The tuning `config.yaml` gives, checked: every setting, each a number, and nothing else. */
export function loadTuning(config?: string): Tuning {
	const raw = loadRequiredPart("tuning", config);
	if (!raw || typeof raw !== "object" || Array.isArray(raw))
		throw new Error(`tuning in ${configName(config)} must be a mapping`);

	const settings = raw as Record<string, unknown>;
	for (const key of Object.keys(settings)) {
		if (!(TUNING_KEYS as readonly string[]).includes(key)) throw new Error(`tuning has an unknown setting, ${key}`);
	}
	const tuning = {} as Tuning;
	for (const key of TUNING_KEYS) {
		const value = settings[key];
		if (value === undefined || value === null) throw new Error(`tuning must give ${key}`);
		if (typeof value !== "number" || !Number.isFinite(value)) {
			throw new Error(`${key} in tuning must be a number (got ${JSON.stringify(value)})`);
		}
		tuning[key] = value;
	}
	return tuning;
}

/**
 * Stands in for `src/tuning.ts` in the bundle, as `archiveSpan.ts` does for `src/archive.ts`: the
 * tuning as a literal, rebuilt under `--watch` when it changes.
 */
export default function tuningLoader(this: LoaderContext<unknown>): string {
	watchConfig(this);
	return `export const TUNING = ${JSON.stringify(loadTuning())};\n`;
}
