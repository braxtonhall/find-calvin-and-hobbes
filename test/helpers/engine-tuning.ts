import type { Tuning } from "../../src/search";

/**
 * A fixed tuning for the engine's own tests, so they are about how the engine behaves rather than
 * about any one archive's fit: an archive retuning its `tuning.yaml` cannot break them, and they
 * need no archive to run.
 *
 * The values are the ones the tests were written against — Calvin and Hobbes's as they stood when
 * the tuning moved out of the engine. A test about one setting overrides it in a copy of these.
 */
export const ENGINE_TUNING: Tuning = {
	sequenceWeight: 1,
	runWeight: 2,
	transcriptRepeatWeight: 0.25,
	descriptionRepeatWeight: 0,
	repeatVariety: 1,
	rarityExponent: 1.25,
	exactWeight: 1,
	prefixWeight: 0,
	transcriptCoverageFloor: 0.4,
	descriptionCoverageFloor: 0.05,
	transcriptLengthForgiveness: 1,
	descriptionLengthForgiveness: 1,
	transcriptLiteralShare: 0.2,
	descriptionLiteralShare: 0.2,
	descriptionMinMass: 2.5,
	descriptionMassNormalization: 1,
	transcriptLengthNormalization: 0,
	descriptionLengthNormalization: 0.1,
	transcriptIdfFloor: 0.5,
	descriptionIdfFloor: 1,
	transcriptInflectionWeight: 0.1,
	descriptionInflectionWeight: 0.7,
	descriptionPreference: 0.7,
	agreementBonus: 0.15,
};
