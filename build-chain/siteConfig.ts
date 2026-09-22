import fs from "fs";
import path from "path";

export interface SiteConfig {
	siteUrl: string;
	host: string;
}

/**
 * Reads the `.env` file without mutating `process.env`, so the value can be re-read fresh on every
 * compilation (which lets `--watch` pick up edits to `.env`). A non-empty `SITE_URL` already in the
 * process environment — as CI supplies it — takes precedence over the file.
 */
function readDotenvFile(): Record<string, string> {
	let contents: string;
	try {
		contents = fs.readFileSync(path.join(process.cwd(), ".env"), "utf8");
	} catch {
		return {};
	}

	const values: Record<string, string> = {};
	for (const line of contents.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) {
			continue;
		}
		const separator = trimmed.indexOf("=");
		if (separator === -1) {
			continue;
		}
		const key = trimmed.slice(0, separator).trim();
		let value = trimmed.slice(separator + 1).trim();
		if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
			value = value.slice(1, -1);
		}
		values[key] = value;
	}
	return values;
}

/** A build setting: the process environment when it has one, else the `.env` file, else "". */
function readSetting(name: string): string {
	const fromEnvironment = (process.env[name] ?? "").trim();
	const fromFile = (readDotenvFile()[name] ?? "").trim();
	return fromEnvironment || fromFile;
}

/**
 * Where a page's file goes, which is up to the host it is for.
 *
 * - `html`: `credits.html`, served for `/credits` by a host with clean URLs — GitHub Pages,
 *   Neocities, Netlify, Cloudflare. No redirect on a cold load, so a reload keeps `history.state`.
 * - `directory`: `credits/index.html`, which any host serves for `/credits/`. Hosts without clean
 *   URLs need this; most of them answer `/credits` with a redirect to `/credits/`, and the app
 *   puts the address back the way the links spell it.
 *
 * The home page is `index.html` either way.
 */
export type PageLayout = "html" | "directory";

const PAGE_LAYOUTS: readonly PageLayout[] = ["html", "directory"];

export function loadPageLayout(): PageLayout {
	const raw = readSetting("PAGE_LAYOUT");
	if (!raw) return "html";
	if (!(PAGE_LAYOUTS as readonly string[]).includes(raw)) {
		throw new Error(`PAGE_LAYOUT must be one of ${PAGE_LAYOUTS.join(", ")} (got "${raw}").`);
	}
	return raw as PageLayout;
}

export function pageAssetPath(routePath: string, layout: PageLayout): string {
	if (routePath === "/") return "index.html";
	return layout === "html" ? `${routePath.slice(1)}.html` : `${routePath.slice(1)}/index.html`;
}

/**
 * Returns the configured site, or `null` when no `SITE_URL` is set (so a local build can succeed
 * without one). Throws when a value is set but malformed, so a bad URL fails loudly rather than
 * silently producing wrong output.
 */
export function loadSiteConfig(): SiteConfig | null {
	const raw = readSetting("SITE_URL");
	if (!raw) {
		return null;
	}

	let url: URL;
	try {
		url = new URL(raw);
	} catch {
		throw new Error(`SITE_URL "${raw}" is not a valid URL.`);
	}

	if (url.protocol !== "https:") {
		throw new Error(`SITE_URL must use the https protocol (got "${raw}").`);
	}
	if (url.pathname !== "/" || url.search || url.hash || url.port) {
		throw new Error(`SITE_URL must be a bare https origin with no path, port, query, or fragment (got "${raw}").`);
	}

	return { siteUrl: url.origin, host: url.hostname };
}
