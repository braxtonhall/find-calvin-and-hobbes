/**
 * The body of the credits page, from `credits.md`.
 *
 * Like `archive.ts`, this is the Node version, which reads and renders the file from disk; the
 * bundle never runs it, because `build-chain/credits.ts` replaces the module with the same HTML as
 * a literal. See `webpack.config.ts`, and `archive.ts` for why this is a `require`.
 */
declare function require(id: string): unknown;
const { loadCreditsHtml } = require("../build-chain/credits") as { loadCreditsHtml(): string };

export const CREDITS_HTML: string = loadCreditsHtml();
