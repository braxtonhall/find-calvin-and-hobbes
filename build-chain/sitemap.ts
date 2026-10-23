import { escHtml } from "../src/utils";

/**
 * The sitemap names the pages worth a crawler's first look: the home page, the credits, the
 * searching page, and the lists of books, arcs, creators, characters and subjects the site has, with
 * a page for each one in them.
 *
 * The comic pages are left out on purpose. They are indexable, and reachable — each links to the
 * one before and after it, and the grid links them all once the script runs — but listing all
 * three thousand would say they are what the site is for, when the search is. The search itself
 * has no entry either: its rows depend on the query, and `robots.txt` keeps crawlers off it.
 */
export function buildSitemapXml(siteUrl: string, paths: readonly string[]): string {
	const entries = paths.map(
		(routePath) => `  <url>
    <loc>${escHtml(siteUrl + routePath)}</loc>
  </url>`,
	);
	return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.join("\n")}
</urlset>
`;
}
