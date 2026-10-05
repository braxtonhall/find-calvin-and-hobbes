import type { CorrectionTemplates } from "./site-config";
import { fillLinkTemplate } from "./strip-links";

/**
 * The corrections link's address, written from the templates in `config.yaml`, so that which form
 * a correction goes to — and which pages offer one — is the configuration's business.
 *
 * Each kind of page has a template of its own, and a page whose kind has none carries no link.
 * Every template has the same fields: `{{page.url}}`, the whole address of the page;
 * `{{page.origin}}`, the site it is on; and `{{site.commit}}`, the build it was made by.
 */

/** The kinds of page, as the reader knows them: a strip's page is a rerun's when its day reran an earlier one. */
export const CORRECTION_PAGES = [
	"home",
	"search",
	"strip",
	"rerun",
	"book",
	"books",
	"arc",
	"arcs",
	"library",
	"credits",
] as const;

export type CorrectionPage = (typeof CORRECTION_PAGES)[number];

export interface CorrectionSubject {
	/** The whole address of the page this is about — its path alone, when the build has no origin to write. */
	url: string;
	/** The build this was reported from, so a correction can be read against the archive it was made from. */
	commit: string;
}

/** The origin on its own. "" when the address has none. */
function originOf(url: string): string {
	try {
		return new URL(url).origin;
	} catch {
		return "";
	}
}

export function correctionFields({ url, commit }: CorrectionSubject): Record<string, string> {
	return { "page.url": url, "page.origin": originOf(url), "site.commit": commit };
}

/** The form's address for a page of this kind, or `null` where its kind has no template. */
export function correctionUrl(
	templates: CorrectionTemplates,
	page: CorrectionPage | null,
	subject: CorrectionSubject,
): string | null {
	const template = page && templates[page];
	return template ? fillLinkTemplate(template, correctionFields(subject)) : null;
}
