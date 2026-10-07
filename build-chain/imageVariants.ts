import { createHash } from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import sharp from "sharp";
import type { Compilation } from "webpack";
import { sources } from "webpack";
import { VARIANT_WIDTHS, variantUrl } from "../src/srcset";
import { knownImageSize } from "./imageSize";

/** What the copies can be made from: every format `imageSize` reads but BMP, which sharp does not. */
const RESIZABLE = new Set([".gif", ".jpg", ".jpeg", ".png", ".webp"]);

/** The copies' WebP quality. Part of each copy's name in the cache, so a change to it makes them afresh. */
const QUALITY = 80;

/**
 * Where the build keeps the copies between builds, by the contents of the image they were made from:
 * making them is most of a build's time, where there are thousands of strips, and an image seldom changes.
 */
const DEFAULT_CACHE = path.join(__dirname, "..", "node_modules", ".cache", "image-variants");

/** The widths the build makes copies of an image at: those of `VARIANT_WIDTHS` narrower than it. */
function variantWidths(file: string): number[] {
	if (!RESIZABLE.has(path.extname(file).toLowerCase())) return [];
	const { width } = knownImageSize(file);
	return VARIANT_WIDTHS.filter((variant) => variant < width);
}

/** An image's width, for the data to carry where the build makes copies of it, which is how a page knows it has them. */
export function variantSourceWidth(file: string): number | undefined {
	return variantWidths(file).length > 0 ? knownImageSize(file).width : undefined;
}

/** Each file's hash, kept while the file is unchanged, so a rebuild under `--watch` reads only what changed. */
const hashes = new Map<string, { stamp: string; hash: string }>();

function contentHash(file: string): string {
	const { mtimeMs, size } = fs.statSync(file);
	const stamp = `${mtimeMs} ${size}`;
	const known = hashes.get(file);
	if (known?.stamp === stamp) return known.hash;
	const hash = createHash("sha256").update(fs.readFileSync(file)).digest("hex").slice(0, 32);
	hashes.set(file, { stamp, hash });
	return hash;
}

/** The image's copies at `widths`, as files in `cache`, made where they are not there yet. */
async function cachedCopies(file: string, widths: number[], cache: string): Promise<string[]> {
	const hash = contentHash(file);
	const copies = widths.map((width) => path.join(cache, `${hash}-${width}w-q${QUALITY}.webp`));
	const missing = widths.flatMap((width, index) => (fs.existsSync(copies[index]) ? [] : [index]));
	if (missing.length > 0) {
		fs.mkdirSync(cache, { recursive: true });
		// Read once for all its widths. Written beside and moved into place, so a build stopped partway
		// never leaves half a copy for the next one to publish.
		const image = sharp(file);
		await Promise.all(
			missing.map(async (index) => {
				const partial = `${copies[index]}.${process.pid}.partial`;
				await image.clone().resize({ width: widths[index] }).webp({ quality: QUALITY }).toFile(partial);
				fs.renameSync(partial, copies[index]);
			}),
		);
	}
	return copies;
}

/**
 * Publishes the smaller copies of each image, `[published, file]`, beside it: where `variantUrl` says
 * they are. A few images at a time, since each is worked on in threads of its own. The copies are
 * kept in `cache`, which a test gives a folder of its own.
 */
export async function emitVariants(
	compilation: Compilation,
	images: Iterable<[string, string]>,
	cache = DEFAULT_CACHE,
): Promise<void> {
	const queue = [...images];
	const work = async () => {
		for (let next = queue.shift(); next; next = queue.shift()) {
			const [published, file] = next;
			const widths = variantWidths(file);
			if (widths.length === 0) continue;
			const copies = await cachedCopies(file, widths, cache);
			widths.forEach((width, index) =>
				compilation.emitAsset(variantUrl(published, width), new sources.RawSource(fs.readFileSync(copies[index]))),
			);
		}
	};
	await Promise.all(Array.from({ length: os.availableParallelism() }, work));
}
