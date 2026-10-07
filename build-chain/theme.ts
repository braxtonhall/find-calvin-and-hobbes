import type { LoaderContext } from "webpack";
import { Theme, watchConfig, loadTheme } from "./siteConfig";

/**
 * The theme's stylesheet: the colours `config.yaml` names, and the ones drawn from them.
 *
 * The search-confidence ramps are spaced evenly in OKLab rather than in sRGB, so the steps look as
 * even as they measure. Each reads as three bands, not one gradient:
 *   1. a high-confidence match, the colour itself;
 *   2. every other match, tiers 4..1 packed one unit apart;
 *   3. no match at all, the faded colour (see `faded`).
 * Each ramp is nine units wide and the two band boundaries take three units apiece, so both are
 * about three times a step inside the cluster. That contrast is what makes them read as boundaries
 * rather than as further notches; the four clustered tiers only need to be told apart end to end,
 * not neighbour by neighbour.
 */

type Rgb = [number, number, number];
type Lab = [number, number, number];

function parse(hex: string): Rgb {
	return [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16)) as Rgb;
}

function format(rgb: Rgb): string {
	return `#${rgb
		.map((channel) =>
			Math.max(0, Math.min(255, Math.round(channel)))
				.toString(16)
				.padStart(2, "0"),
		)
		.join("")}`;
}

function toLinear(channel: number): number {
	const value = channel / 255;
	return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function fromLinear(value: number): number {
	return 255 * (value <= 0.0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - 0.055);
}

function toOklab(hex: string): Lab {
	const [r, g, b] = parse(hex).map(toLinear);
	const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
	const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
	const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
	return [
		0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
		1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
		0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
	];
}

function fromOklab([lightness, a, b]: Lab): string {
	const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
	const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
	const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
	return format(
		[
			4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
			-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
			-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
		].map(fromLinear) as Rgb,
	);
}

/** The search tiers 4..1 between a colour and its faded form, strongest first. */
export function ramp(full: string, faded: string): string[] {
	const from = toOklab(full);
	const to = toOklab(faded);
	return [3, 4, 5, 6].map((units) =>
		fromOklab(from.map((value, index) => value + ((to[index] - value) * units) / 9) as Lab),
	);
}

/**
 * A colour at 40% opacity over the background: a day a search did not match, and the empty end of
 * that colour's ramp. In sRGB, as the browser would blend it.
 */
export function faded(hex: string, background: string): string {
	const under = parse(background);
	return format(parse(hex).map((channel, index) => channel + (under[index] - channel) * 0.6) as Rgb);
}

/** The main colour darkened enough to be read as text on the background. */
export function darkened(hex: string): string {
	return format(parse(hex).map((channel) => channel * 0.8) as Rgb);
}

/** The custom properties the stylesheets are written with, by name. */
export function themeProperties(theme: Theme): Record<string, string> {
	// A colour, its faded form, and the search tiers between them.
	const shades = (name: string, full: string) => {
		const dim = faded(full, theme.background);
		const tiers = ramp(full, dim).map((colour, index) => [`${name}-t${4 - index}`, colour]);
		return { [name]: full, [`${name}-faded`]: dim, ...Object.fromEntries(tiers) };
	};
	return {
		bg: theme.background,
		"bg-sidebar": theme.background,
		text: theme.text,
		"text-muted": theme.textMuted,
		...shades("main", theme.main),
		"main-text": darkened(theme.main),
		...shades("bookmark", theme.bookmark),
		neutral: theme.neutral,
		"neutral-faded": faded(theme.neutral, theme.background),
		selected: theme.selected,
		hover: theme.hover,
		"hover-row": theme.hoverRow,
		match: theme.match,
		"match-approximate": theme.matchApproximate,
	};
}

export function themeCss(theme: Theme): string {
	const properties = Object.entries(themeProperties(theme)).map(([name, value]) => `\t--${name}: ${value};\n`);
	return `:root {\n${properties.join("")}}\n`;
}

/**
 * Stands in for `src/styles/theme.css`, which holds nothing but a note saying so: the theme from
 * `config.yaml`, rebuilt under `--watch` when the file or `.env` changes.
 */
export default function themeLoader(this: LoaderContext<unknown>): string {
	const projectDir = this.rootContext;
	watchConfig(this, projectDir);
	return themeCss(loadTheme(projectDir));
}
