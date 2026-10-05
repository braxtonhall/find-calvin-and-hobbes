import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { loadTheme } from "../build-chain/siteConfig";
import { themeCss, themeProperties } from "../build-chain/theme";
import { withConfig } from "./helpers/config";

/**
 * `config.yaml`'s theme: that it is checked, and that the colours drawn from it are the ones the
 * stylesheets were written against.
 */

test("the colours drawn from this archive's theme", () => {
	const properties = themeProperties(loadTheme());
	// These were hand-written in `base.css` before the theme was configurable, and are what the
	// ramp's spacing was judged on.
	assert.equal(properties["main-text"], "#c58e0f");
	assert.deepEqual(
		[properties["main-faded"], properties["bookmark-faded"], properties["neutral-faded"]],
		["#f9db98", "#fcc490", "#f0edea"],
	);
	assert.deepEqual(
		["t4", "t3", "t2", "t1"].map((tier) => properties[`main-${tier}`]),
		["#f7c053", "#f8c560", "#f8c96c", "#f8ce78"],
	);
	assert.deepEqual(
		["t4", "t3", "t2", "t1"].map((tier) => properties[`bookmark-${tier}`]),
		["#ff9448", "#ff9c56", "#ffa462", "#feac6e"],
	);
});

// A property the theme stopped writing would leave its colour unset, and nothing else would say so.
// Properties a stylesheet sets for itself, or a script sets with `setProperty`, are not the theme's.
test("every custom property the stylesheets use is in the theme", () => {
	const files = fs
		.readdirSync("src", { recursive: true, encoding: "utf8" })
		.filter((file) => file.endsWith(".css") || file.endsWith(".ts"))
		.map((file) => fs.readFileSync(path.join("src", file), "utf8"));
	const used = new Set(files.flatMap((text) => [...text.matchAll(/var\(--([\w-]+)\)/g)].map((match) => match[1])));
	const defined = new Set(
		files.flatMap((text) => [...text.matchAll(/(?<![\w-])--([\w-]+)(?=\s*:|",)/g)].map((match) => match[1])),
	);
	const themed = new Set(Object.keys(themeProperties(loadTheme())));
	const missing = [...used].filter((name) => !themed.has(name) && !defined.has(name));
	assert.deepEqual(missing, []);
});

test("a theme's three-digit colours are written out in full", () => {
	const css = withConfig('theme:\n  main: "#36C"\n' + fullThemeExcept("main"), (dir) => themeCss(loadTheme(dir)));
	assert.match(css, /--main: #3366cc;/);
});

test("a malformed theme stops the build", () => {
	const rejects = (contents: string, message: RegExp) => assert.throws(() => withConfig(contents, loadTheme), message);

	rejects("theme:\n" + fullThemeExcept("main"), /must give theme\.main/);
	// Unquoted, the colour is a comment and the setting is empty.
	rejects("theme:\n  main: #f6b213\n" + fullThemeExcept("main"), /must give theme\.main, as a quoted colour/);
	rejects('theme:\n  main: "gold"\n' + fullThemeExcept("main"), /theme\.main .* must be a colour/);
	rejects('theme:\n  accent: "#000000"\n' + fullThemeExcept(), /theme\.accent .* is not one of/);
	rejects("theme: '#f6b213'\n", /must be a mapping/);
});

/** Every theme setting but `left`, indented to go under `theme:`. */
function fullThemeExcept(left?: string): string {
	const keys = [
		"background",
		"text",
		"textMuted",
		"main",
		"bookmark",
		"neutral",
		"selected",
		"hover",
		"hoverRow",
		"match",
		"matchApproximate",
	];
	return keys
		.filter((key) => key !== left)
		.map((key) => `  ${key}: "#808080"\n`)
		.join("");
}
