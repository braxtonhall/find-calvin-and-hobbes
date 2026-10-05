/**
 * The parts of `config.yaml` the pages are drawn with: the site's name, the home page's banner, and
 * the templates for the links under a strip. The deployment settings stay in the build, which is
 * the only thing that reads them.
 *
 * Like `archive.ts`, this is the Node version, which reads the file from disk; the bundle never
 * runs it, because `build-chain/siteConfig.ts` replaces the module with the same values as a
 * literal. See `webpack.config.ts`, and `archive.ts` for why this is a `require`.
 */

/** The templates for one kind of strip's links. A link with no template is not drawn. See `strip-links.ts`. */
export interface StripLinkTemplates {
	readUrl?: string;
	licenseUrl?: string;
}

export interface PageConfig {
	name: string;
	/** What the archive is of — "Calvin and Hobbes" — for the sentences the link previews are written in. */
	series: string;
	/** The link preview's description for a page with none of its own, or `null` for none. */
	description: string | null;
	/** The icon in the browser's tab, or `null` to leave it to the browser. */
	favicon: string | null;
	/** The home page's banner, and the preview image of a page with none of its own; `null` for neither. */
	landingImage: string | null;
	/** The banner's alt text: what it says, or the name where `config.yaml` doesn't give it. */
	landingAlt: string;
	/** The banner's size in pixels, when `config.yaml` gives it, for the page to hold its shape while it loads. */
	landingSize: { width: number; height: number } | null;
	/** Whether the site has story arcs, from `arcs.yaml`: their pages, a strip's place in one, and `@is:standalone`. */
	arcs: boolean;
	/** Whether the site has reruns, from `reruns.yaml`: the days' pages, and `@is:reused` and `@is:rerun`. */
	reruns: boolean;
	details: {
		daily: StripLinkTemplates;
		rerun: StripLinkTemplates;
		special: StripLinkTemplates;
	};
}

declare function require(id: string): unknown;
const { loadPageConfig } = require("../build-chain/siteConfig") as { loadPageConfig(): PageConfig };

export const PAGE_CONFIG: PageConfig = loadPageConfig();
