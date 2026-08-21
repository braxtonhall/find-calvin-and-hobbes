/**
 * Turns raw relevance scores into the five colour intensities the grid paints during a search.
 *
 * Tiers are always relative to the top-scoring result of the same search, never to an absolute
 * score, because the scales differ wildly between queries and between the ranked and literal
 * paths in `search.ts`. Using only part of the ramp is the correct outcome for a precise query:
 * `transmogrifier` matches 17 strips whose weakest still scores 51% of the top, so it should sit
 * in the top few shades rather than being stretched across all five.
 */

export const TIER_COUNT = 5;

export type TierMode = "steps" | "fifths" | "stretch" | "quantile";

/**
 * Swap this one line to try a different distribution.
 *
 * - `steps`    thresholds every 15% below the top score. The default: measured score spreads
 *              cluster high (the weakest result is usually 30–70% of the top), so even fifths
 *              would leave the two faintest shades nearly unused.
 * - `fifths`   even fifths of the top score. Simplest rule, but compresses most searches into
 *              the top three shades.
 * - `stretch`  rescaled between the highest and lowest score in this search, so every search
 *              spans the whole ramp. Maximum contrast, at the cost of pulling near-ties apart.
 * - `quantile` by rank rather than by score: equal-sized groups, ties held together.
 */
export const TIER_MODE: TierMode = "fifths";

const THRESHOLDS: Record<"steps" | "fifths", readonly number[]> = {
	steps: [0.85, 0.7, 0.55, 0.4],
	fifths: [0.8, 0.6, 0.4, 0.2],
};

// Only the date and the score matter here, so anything shaped like a result will do — which
// keeps this module independent of the search internals and cheap to test.
export interface ScoredResult {
	comic: { date: string };
	score: number;
}

function tierFor(ratio: number, thresholds: readonly number[]): number {
	for (const [index, threshold] of thresholds.entries()) {
		if (ratio >= threshold) return TIER_COUNT - index;
	}
	return 1;
}

/**
 * Maps each matched date to a tier in 1..TIER_COUNT, strongest first. A date can hold more than
 * one strip, so two results can share one cell; the cell takes the better of their tiers.
 */
export function assignTiers(results: ScoredResult[], mode: TierMode = TIER_MODE): Map<string, number> {
	const tiers = new Map<string, number>();
	if (results.length === 0) return tiers;

	const record = (date: string, tier: number): void => {
		const existing = tiers.get(date);
		if (existing === undefined || tier > existing) tiers.set(date, tier);
	};

	// The result list is only sorted by score when the user asked for relevance order, so the
	// extremes have to be found the long way rather than read off either end.
	let top = -Infinity;
	let bottom = Infinity;
	for (const result of results) {
		if (result.score > top) top = result.score;
		if (result.score < bottom) bottom = result.score;
	}

	if (mode === "quantile") {
		const descending = results.map((result) => result.score).sort((a, b) => b - a);
		const firstIndex = new Map<number, number>();
		for (const [index, score] of descending.entries()) {
			if (!firstIndex.has(score)) firstIndex.set(score, index);
		}
		for (const result of results) {
			const rank = firstIndex.get(result.score)!;
			const tier = TIER_COUNT - Math.floor((rank * TIER_COUNT) / results.length);
			record(result.comic.date, Math.min(TIER_COUNT, Math.max(1, tier)));
		}
		return tiers;
	}

	// A single result, an exhausted range, or a degenerate top score all mean there is no spread
	// left to show, so everything reads as the best match rather than dividing by zero.
	if (mode === "stretch") {
		const span = top - bottom;
		for (const result of results) {
			const ratio = span > 0 ? (result.score - bottom) / span : 1;
			record(result.comic.date, tierFor(ratio, THRESHOLDS.fifths));
		}
		return tiers;
	}

	const thresholds = THRESHOLDS[mode];
	for (const result of results) {
		const ratio = top > 0 ? result.score / top : 1;
		record(result.comic.date, tierFor(ratio, thresholds));
	}
	return tiers;
}
