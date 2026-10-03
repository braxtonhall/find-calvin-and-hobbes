/**
 * When the strip ran, as `comics.yaml` has it: the first day, the last, and every stretch between
 * them with no daily — the two sabbaticals, in this archive. All ISO dates, all inclusive.
 */
export interface ArchiveSpan {
	start: string;
	end: string;
	gaps: [string, string][];
}

// The tests and the page build run this module under Node, and read the span from `comics.yaml`
// here. The bundle never runs it: `build-chain/archiveSpan.ts` replaces the whole module with the
// same value as a literal (see `webpack.config.ts`), so the reader, and Node with it, stay out of
// the browser. That is also why this is a `require` the app's own types don't know about rather
// than an import, which would put `fs` into a program that has no Node in it.
declare function require(id: string): unknown;
const { loadArchiveSpan } = require("../build-chain/archiveSpan") as { loadArchiveSpan(): ArchiveSpan };

export const ARCHIVE_SPAN: ArchiveSpan = loadArchiveSpan();
