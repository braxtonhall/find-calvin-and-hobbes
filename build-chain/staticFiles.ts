import { createHash } from "crypto";
import fs from "fs";
import path from "path";

/**
 * Where the build publishes a file the configuration names with `!Path`, from the mount: under
 * `static/`, named for its contents, so two names for one file publish it once, and a changed file
 * is never served from a stale cache.
 */
export function staticPath(file: string): string {
	return `static/${contentHash(file)}${path.extname(file).toLowerCase()}`;
}

/**
 * Where the build publishes an icon it draws from `file`, `size` pixels square, as `staticPath` names
 * the file itself: named for what it is drawn from, and for the colour it is drawn on where it has one.
 */
export function iconPath(file: string, size: number, background?: string): string {
	return `static/${contentHash(file, background ?? "")}-${size}.png`;
}

function contentHash(file: string, extra = ""): string {
	return createHash("sha256").update(fs.readFileSync(file)).update(extra).digest("hex").slice(0, 16);
}

/** Whether an image is a whole URL, served from elsewhere, rather than one the build publishes. */
export function isUrl(image: string): boolean {
	return /^https?:\/\//i.test(image);
}
