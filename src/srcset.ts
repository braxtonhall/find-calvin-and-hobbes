import { escHtml } from "./utils";

/**
 * The widths the build makes smaller copies of each image the site publishes at, a cover or a
 * strip, so a page showing it small loads a small file: the ones narrower than the image itself. A
 * book's cover is a thumbnail sixty-four pixels tall, but its file can be eight hundred wide.
 *
 * An image with copies carries its own `width` in the data, which is how a page knows it has them.
 * A cover given as a URL has none, since the build never fetches it.
 */
export const VARIANT_WIDTHS = [160, 320, 480, 640];

/** Where the copy of a published image at `width` is: beside it, as WebP. `/static/1a2b.jpg` is `/static/1a2b-320w.webp`. */
export function variantUrl(image: string, width: number): string {
	return image.replace(/(\.[^./]*)?$/, `-${width}w.webp`);
}

/**
 * An image's `srcset` and `sizes` attributes, with a space before them: its copies and itself, for
 * the browser to pick the smallest that fills `sizes` on the screen it has. Nothing for an image
 * without copies, which is shown as `src` alone.
 */
export function srcsetAttributes(image: string, width: number | undefined, sizes: string): string {
	if (width === undefined) return "";
	const copies = VARIANT_WIDTHS.filter((variant) => variant < width).map(
		(variant) => `${variantUrl(image, variant)} ${variant}w`,
	);
	if (copies.length === 0) return "";
	return ` srcset="${escHtml([...copies, `${image} ${width}w`].join(", "))}" sizes="${escHtml(sizes)}"`;
}
