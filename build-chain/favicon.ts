import sharp from "sharp";
import type { Compilation } from "webpack";
import { sources } from "webpack";
import type { FaviconFile, Theme } from "./siteConfig";
import { ICON_SIZES } from "./siteConfig";

/**
 * How much of a home screen icon the picture fills, across: a margin of a tenth on each side, so the
 * rounded corners an iPhone or a launcher cuts the icon to never cut into it.
 */
const HOME_SCREEN_FILL = 0.8;

const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };

/** The picture, `size` pixels square: as it is for a tab, and inset on the background for a home screen. */
async function drawIcon(file: string, size: number, background?: string): Promise<Buffer> {
	if (!background) {
		return sharp(file).resize(size, size, { fit: "contain", background: TRANSPARENT }).png().toBuffer();
	}
	const inner = Math.round(size * HOME_SCREEN_FILL);
	const picture = await sharp(file).resize(inner, inner, { fit: "contain", background: TRANSPARENT }).png().toBuffer();
	return sharp({ create: { width: size, height: size, channels: 4, background } })
		.composite([{ input: picture, gravity: "centre" }])
		.flatten({ background })
		.png()
		.toBuffer();
}

/** Publishes the icons drawn from the favicon's file, where `FaviconFile` says each is. */
export async function emitFavicon(compilation: Compilation, favicon: FaviconFile): Promise<void> {
	const icons: [string, number, string?][] = [
		[favicon.tab, ICON_SIZES.tab],
		[favicon.touch, ICON_SIZES.touch, favicon.background],
		...favicon.app.map(({ size, published }): [string, number, string] => [published, size, favicon.background]),
	];
	await Promise.all(
		icons.map(async ([published, size, background]) =>
			compilation.emitAsset(published, new sources.RawSource(await drawIcon(favicon.file, size, background))),
		),
	);
}

/**
 * The web app manifest, which is what makes the site open in a window of its own, with no address
 * bar, from an icon added to a phone's home screen. Without a favicon given as a file it has no
 * icons, and Android adds the site as a bookmark instead.
 */
export function buildManifest(options: {
	name: string;
	description: string | null;
	basePath: string;
	theme: Theme;
	favicon: FaviconFile | null;
}): string {
	const { name, description, basePath, theme, favicon } = options;
	return JSON.stringify(
		{
			name,
			short_name: name,
			...(description ? { description } : {}),
			start_url: basePath,
			scope: basePath,
			display: "standalone",
			theme_color: theme.main,
			background_color: theme.background,
			icons: (favicon?.app ?? []).map(({ size, published }) => ({
				src: `${basePath}${published}`,
				sizes: `${size}x${size}`,
				type: "image/png",
			})),
		},
		null,
		"\t",
	);
}
