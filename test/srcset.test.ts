import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import sharp from "sharp";
import type { Compilation } from "webpack";
import { VARIANT_WIDTHS, srcsetAttributes, variantUrl } from "../src/srcset";
import { emitVariants, variantSourceWidth } from "../build-chain/imageVariants";
import { sampleGif } from "./helpers/config";

/** The `srcset` and `sizes` an `<img>` would carry, read back out of the attributes. */
function parse(attributes: string): { srcset: string[]; sizes: string } | null {
	const match = attributes.match(/^ srcset="([^"]*)" sizes="([^"]*)"$/);
	return match ? { srcset: match[1].split(", "), sizes: match[2] } : null;
}

/** A folder of its own for the test's images, removed after. */
function inFolder<T>(run: (dir: string) => Promise<T>): Promise<T> {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "srcset-"));
	return run(dir).finally(() => fs.rmSync(dir, { recursive: true, force: true }));
}

/** A real image of this size, for sharp to make copies of. */
async function image(file: string, width: number, height: number): Promise<string> {
	await sharp({ create: { width, height, channels: 3, background: "#f6b213" } }).toFile(file);
	return file;
}

test("a copy is beside its image, as WebP, named by its width", () => {
	assert.equal(variantUrl("/static/1a2b.jpg", 320), "/static/1a2b-320w.webp");
	assert.equal(variantUrl("/prefix/assets/comics/19851118.gif", 160), "/prefix/assets/comics/19851118-160w.webp");
	// Only the last extension goes, and a dot in a folder's name is not one.
	assert.equal(variantUrl("/a.b/c.d.png", 480), "/a.b/c.d-480w.webp");
	assert.equal(variantUrl("/a.b/cover", 480), "/a.b/cover-480w.webp");
});

test("an image lists its copies narrower than itself, then itself at its own width", () => {
	assert.deepEqual(parse(srcsetAttributes("/static/c.jpg", 500, "64px")), {
		srcset: ["/static/c-160w.webp 160w", "/static/c-320w.webp 320w", "/static/c-480w.webp 480w", "/static/c.jpg 500w"],
		sizes: "64px",
	});
	const wide = parse(srcsetAttributes("/static/c.jpg", 2000, "800px"))!;
	assert.equal(wide.srcset.length, VARIANT_WIDTHS.length + 1);
	assert.equal(wide.srcset.at(-1), "/static/c.jpg 2000w");
});

test("an image the same width as a copy is not listed twice", () => {
	assert.deepEqual(parse(srcsetAttributes("/s/c.png", 320, "64px"))!.srcset, ["/s/c-160w.webp 160w", "/s/c.png 320w"]);
});

test("an image without copies is shown by its src alone", () => {
	// A cover given as a URL, which the build never fetches.
	assert.equal(srcsetAttributes("https://example.com/cover.jpg", undefined, "64px"), "");
	// An image no wider than the narrowest copy, of which none are made.
	assert.equal(srcsetAttributes("/static/c.jpg", VARIANT_WIDTHS[0], "64px"), "");
	assert.equal(srcsetAttributes("/static/c.jpg", 100, "64px"), "");
});

test("the attributes are escaped", () => {
	const attributes = srcsetAttributes('/static/"&.jpg', 500, '"64px"');
	assert.ok(!attributes.includes('/"&'), attributes);
	assert.match(attributes, /\/static\/&quot;&amp;-160w\.webp 160w/);
	assert.match(attributes, / sizes="&quot;64px&quot;"$/);
});

test("the build gives an image a width only where it makes copies of it", async () => {
	await inFolder(async (dir) => {
		const wide = path.join(dir, "wide.gif");
		fs.writeFileSync(wide, sampleGif(900, 300));
		assert.equal(variantSourceWidth(wide), 900);
		const narrow = path.join(dir, "narrow.gif");
		fs.writeFileSync(narrow, sampleGif(VARIANT_WIDTHS[0], 100));
		assert.equal(variantSourceWidth(narrow), undefined);
		// Sharp reads no BMP, so none gets copies, however wide.
		const bitmap = path.join(dir, "wide.bmp");
		const head = Buffer.alloc(26);
		head.write("BM", 0, "ascii");
		head.writeInt32LE(900, 18);
		head.writeInt32LE(300, 22);
		fs.writeFileSync(bitmap, head);
		assert.equal(variantSourceWidth(bitmap), undefined);
	});
});

test("the build publishes each copy where the page looks for it, at its width", async () => {
	await inFolder(async (dir) => {
		const strip = await image(path.join(dir, "19851118.png"), 500, 160);
		const cover = await image(path.join(dir, "cover.jpg"), 200, 250);
		const tiny = await image(path.join(dir, "tiny.png"), 100, 100);
		const emitted = new Map<string, Buffer>();
		const compilation = {
			emitAsset: (name: string, source: { buffer(): Buffer }) => emitted.set(name, source.buffer()),
		} as unknown as Compilation;

		// A cache of the test's own, so it leaves nothing in the build's.
		const cache = path.join(dir, "cache");
		await emitVariants(
			compilation,
			[
				["assets/comics/19851118.png", strip],
				["static/abc.jpg", cover],
				["static/tiny.png", tiny],
			],
			cache,
		);
		assert.equal(fs.readdirSync(cache).length, emitted.size);

		// Exactly the copies each page's `srcset` names, less the image itself, which is published elsewhere.
		const named = (image: string, width: number) =>
			parse(srcsetAttributes(image, width, "1px"))
				?.srcset.slice(0, -1)
				.map((entry) => entry.split(" ")[0]) ?? [];
		assert.deepEqual(
			[...emitted.keys()].sort(),
			[...named("assets/comics/19851118.png", 500), ...named("static/abc.jpg", 200)].sort(),
		);
		for (const [name, contents] of emitted) {
			const { format, width } = await sharp(contents).metadata();
			assert.equal(format, "webp", name);
			assert.equal(`${width}w`, name.match(/-(\d+w)\.webp$/)![1], name);
		}
	});
});
