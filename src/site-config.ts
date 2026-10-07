/**
 * The parts of `config.yaml` the pages are drawn with: the site's name, the home page's banner, and
 * the templates for the links under a strip and the corrections link. The deployment settings stay in the build, which is
 * the only thing that reads them.
 *
 * Like `archive.ts`, this is the Node version, which reads the file from disk; the bundle never
 * runs it, because `build-chain/siteConfig.ts` replaces the module with the same values as a
 * literal. See `webpack.config.ts`, and `archive.ts` for why this is a `require`.
 */

import type { CorrectionPage } from "./correction-links";

/** The templates for one kind of strip's links. A link with no template is not drawn. See `strip-links.ts`. */
export interface StripLinkTemplates {
	readUrl?: string;
	licenseUrl?: string;
}

/**
 * The corrections form's address for each kind of page, as a template. A kind with none carries no
 * link, and a build with none at all — or made with `CORRECTIONS=false` — writes no link anywhere.
 * See `correction-links.ts`.
 */
export type CorrectionTemplates = Partial<Record<CorrectionPage, string>>;

/** What one box of the grid stands for. See `grid-layout.ts`. */
export type GridUnit = "day" | "week" | "month" | "year" | "period";

export interface GridLevel {
	unit: GridUnit;
	/** How many boxes to a row: seven for days, Monday to Sunday. */
	columns: number;
	/** Whether the level is drawn a period at a time, with arrows between them, rather than all at once. */
	paged: boolean;
}

/** How the grid is drawn: at which levels of detail, and in which stretches of the run. */
export interface GridConfig {
	/** The named stretches of the run, each with the ISO date it starts on, in order. */
	periods: { label: string; start: string }[];
	/** Most detailed first, which is always the days. */
	levels: GridLevel[];
	/** Which of `levels` the grid opens at. */
	zoom: number;
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
	/** The browser's colour for the page's surroundings, like a phone's address bar: the theme's main colour. */
	themeColor: string;
	/** Whether the site has story arcs, from `arcs.yaml`: their pages, a strip's place in one, and `@is:standalone`. */
	arcs: boolean;
	/** Whether the site has reruns, from `reruns.yaml`: the days' pages, and `@is:reused` and `@is:rerun`. */
	reruns: boolean;
	/** Whether the site has characters, from the file `config.yaml` names: `@featuring:` and a strip's Featuring line. */
	characters: boolean;
	/**
	 * Whether the Sundays ran in colour and the dailies in black and white: whether there are
	 * `@is:sunday` and `@is:daily` and the bar's Format field, and whether a book's `colour` — that
	 * it printed its Sundays in colour — means anything.
	 */
	colourSundays: boolean;
	/**
	 * A strip's width over its height, which its page holds the space for until the image loads: a
	 * daily's, and a Sunday's, which is the daily's where `config.yaml` gives none. A strip's own
	 * `aspect-ratio` in `comics.yaml` comes first.
	 */
	aspectRatio: { daily: number; sunday: number };
	details: {
		daily: StripLinkTemplates;
		rerun: StripLinkTemplates;
		special: StripLinkTemplates;
	};
	corrections: CorrectionTemplates;
	/** What an empty search box types into itself, as templates. See `suggestion-templates.ts`. */
	suggestions: string[];
	grid: GridConfig;
}

declare function require(id: string): unknown;
const { loadPageConfig } = require("../build-chain/siteConfig") as { loadPageConfig(): PageConfig };

export const PAGE_CONFIG: PageConfig = loadPageConfig();
