import fs from "fs";
import path from "path";
import type { LoaderContext } from "webpack";
import { marked } from "marked";
import { parse } from "node-html-parser";

/** `credits.md`, as the HTML the credits page shows below its heading. */
export function loadCreditsHtml(markdownPath = path.join(__dirname, "..", "credits.md")): string {
	const html = marked.parse(fs.readFileSync(markdownPath, "utf8"), { async: false });
	const body = parse(html);
	// Every link on the credits page leads off the site, so every one opens beside it.
	for (const link of body.querySelectorAll("a[href]")) {
		link.setAttribute("target", "_blank");
		link.setAttribute("rel", "noopener");
	}
	return body.toString();
}

/** Stands in for `src/credits-content.ts` in the bundle, as `archiveSpan.ts` does for `src/archive.ts`. */
export default function creditsLoader(this: LoaderContext<unknown>): string {
	const markdownPath = path.join(this.rootContext, "credits.md");
	this.addDependency(markdownPath);
	return `export const CREDITS_HTML = ${JSON.stringify(loadCreditsHtml(markdownPath))};\n`;
}
