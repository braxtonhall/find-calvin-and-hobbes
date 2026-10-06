/**
 * How this archive's search scores a match: `tuning.yaml`, read by `build-chain/tuning.ts`. The
 * engine in `search.ts` has no values of its own and is handed these by whatever searches.
 *
 * Like `archive.ts`, this is the Node version, which reads the file from disk; the bundle never
 * runs it, because `build-chain/tuning.ts` replaces the module with the same values as a literal.
 * See `webpack.config.ts`, and `archive.ts` for why this is a `require`.
 */

import type { Tuning } from "./search";

declare function require(id: string): unknown;
const { loadTuning } = require("../build-chain/tuning") as { loadTuning(): Tuning };

export const TUNING: Tuning = loadTuning();
