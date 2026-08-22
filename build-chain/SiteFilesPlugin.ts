import fs from "fs";
import path from "path";
import type { Compiler, Compilation } from "webpack";
import { sources } from "webpack";
import { loadSiteConfig } from "./siteConfig";

const PLUGIN_NAME = "SiteFilesPlugin";

/**
 * Emits the site's static files that depend on `SITE_URL`: `robots.txt`, `sitemap.xml`, and the
 * `CNAME` file for a GitHub Pages custom domain. Reads `.env` fresh on every compilation and watches
 * it, so `--watch` rebuilds when the configured URL changes. When no `SITE_URL` is set, the sitemap
 * reference and `sitemap.xml`/`CNAME` are omitted and the site deploys to the default `*.github.io`.
 */
class SiteFilesPlugin {
	constructor(private readonly staticDir: string) {}

	apply(compiler: Compiler): void {
		const staticDir = this.staticDir;

		compiler.hooks.thisCompilation.tap(PLUGIN_NAME, (compilation: Compilation) => {
			compilation.fileDependencies.add(path.join(process.cwd(), ".env"));

			compilation.hooks.processAssets.tap(
				{
					name: PLUGIN_NAME,
					stage: compiler.webpack.Compilation.PROCESS_ASSETS_STAGE_ADDITIONAL,
				},
				() => {
					const config = loadSiteConfig();
					const siteUrl = config?.siteUrl ?? "";

					const robotsSource = fs.readFileSync(path.join(staticDir, "robots.txt"), "utf8");
					const robotsLines = siteUrl
						? robotsSource.split("\n")
						: robotsSource.split("\n").filter((line) => !line.includes("{{siteUrl}}"));
					const robots = robotsLines.join("\n").replace(/{{siteUrl}}/g, siteUrl);
					compilation.emitAsset("robots.txt", new sources.RawSource(robots));

					if (config) {
						const sitemapSource = fs.readFileSync(path.join(staticDir, "sitemap.xml"), "utf8");
						const sitemap = sitemapSource.replace(/{{siteUrl}}/g, config.siteUrl);
						compilation.emitAsset("sitemap.xml", new sources.RawSource(sitemap));

						compilation.emitAsset("CNAME", new sources.RawSource(config.host));
					}
				},
			);
		});
	}
}

export default SiteFilesPlugin;
