import { createHash } from "crypto";
import fs from "fs";
import path from "path";

/**
 * Where the build publishes a file the configuration names with `!Path`, from the mount: under
 * `static/`, named for its contents, so two names for one file publish it once, and a changed file
 * is never served from a stale cache.
 */
export function staticPath(file: string): string {
	const hash = createHash("sha256").update(fs.readFileSync(file)).digest("hex").slice(0, 16);
	return `static/${hash}${path.extname(file).toLowerCase()}`;
}

/** Whether an image is a whole URL, served from elsewhere, rather than one the build publishes. */
export function isUrl(image: string): boolean {
	return /^https?:\/\//i.test(image);
}
