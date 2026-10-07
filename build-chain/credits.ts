import type { LoaderContext } from "webpack";
import { marked } from "marked";
import { parse } from "node-html-parser";
import { watchConfig, loadRequiredPart, configName } from "./siteConfig";

/** The credits `config.yaml` gives, in Markdown, as the HTML the credits page shows below its heading. */
export function loadCreditsHtml(config?: string): string {
	const markdown = loadRequiredPart("credits", config);
	if (typeof markdown !== "string") throw new Error(`credits in ${configName(config)} must be Markdown`);
	const html = marked.parse(markdown, { async: false });
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
	watchConfig(this);
	return `export const CREDITS_HTML = ${JSON.stringify(loadCreditsHtml())};\n`;
}
