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

/**
 * Returns the configured site, or `null` when no `SITE_URL` is set (so a local build can succeed
 * without one). Throws when a value is set but malformed, so a bad URL fails loudly rather than
 * silently producing wrong output.
 */
export function loadSiteConfig(): SiteConfig | null {
	const fromEnvironment = (process.env.SITE_URL ?? "").trim();
	const fromFile = (readDotenvFile().SITE_URL ?? "").trim();
	const raw = fromEnvironment || fromFile;
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
