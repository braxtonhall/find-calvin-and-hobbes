import { escHtml } from "./utils";

/**
 * The little markup a book's words may carry in the data: `<i>` and `<b>`, as in
 * `The Days Are Just <i>Packed</i>`. Nothing else, and nothing to escape — no `<` in the data is
 * anything but one of these, which `markupProblem` holds the build to.
 */
const TAG = /<(\/?)([ib])>/g;

/** The words without their markup, for wherever they are not HTML: the search, a tab's title, an `alt`. */
export function plainText(text: string): string {
	return text.replace(TAG, "");
}

/** The words as HTML, escaped but for their `<i>` and `<b>`. */
export function inlineHtml(text: string): string {
	return escHtml(text).replace(/&lt;(\/?[ib])&gt;/g, "<$1>");
}

/** A name as a page shows it: with its markup, where the build kept any. */
export function nameHtml(named: { name: string; styledName?: string }): string {
	return inlineHtml(named.styledName ?? named.name);
}

/** What is wrong with the words' markup — a tag left open, or one not allowed — or nothing. */
export function markupProblem(text: string): string | undefined {
	const open: string[] = [];
	for (const [, closing, name] of text.matchAll(TAG)) {
		if (!closing) open.push(name);
		else if (open.pop() !== name) return `</${name}> closes nothing open`;
	}
	if (open.length > 0) return `<${open[open.length - 1]}> is never closed`;
	if (text.replace(TAG, "").includes("<")) return "only <i> and <b> may be written in angle brackets";
	return undefined;
}
