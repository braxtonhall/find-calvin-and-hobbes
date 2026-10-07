import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { configDependencies, loadLandingFile, loadPageConfig, loadRequiredPart } from "../build-chain/siteConfig";
import { sampleGif, withConfig } from "./helpers/config";
import { loadArcs } from "../build-chain/arcs";
import { loadCharacters, stripCharacters } from "../build-chain/characters";
import { loadCreditsHtml } from "../build-chain/credits";
import { loadReruns } from "../build-chain/reruns";
import type { CollectionData } from "../build-chain/collectionPages";
import { loadComicSource, type ComicSource } from "../build-chain/comicSource";
import { stripLinks } from "../src/strip-links";
import { PAGE_CONFIG } from "../src/site-config";
import { buildDocumentHtml } from "../src/pages/shell";

/**
 * `config.yaml`: that it reads the environment into its values, and that the links under a strip
 * are written from its templates — and left out where it has none.
 */

function withEnvironment<T>(values: Record<string, string | undefined>, run: () => T): T {
	const saved = Object.fromEntries(Object.keys(values).map((name) => [name, process.env[name]]));
	const assign = (entries: Record<string, string | undefined>) => {
		for (const [name, value] of Object.entries(entries)) {
			if (value === undefined) delete process.env[name];
			else process.env[name] = value;
		}
	};
	assign(values);
	try {
		return run();
	} finally {
		assign(saved);
	}
}

test("config.yaml", async (suite) => {
	await suite.test("names the site, gives its icon, and says what its banner says", () => {
		assert.equal(PAGE_CONFIG.name, "Find Calvin and Hobbes");
		assert.equal(PAGE_CONFIG.landingAlt, "Calvin and Hobbes");
		assert.equal(PAGE_CONFIG.favicon, "https://static.wikitide.net/calvinandhobbeswiki/f/f3/CalvinAndHobbes.png");
		assert.deepEqual(PAGE_CONFIG.landingSize, { width: 722, height: 103 });
	});

	await suite.test("reads the environment into its values", () => {
		const yaml = [
			"name: ${TEST_SITE_NAME}",
			"series: Peanuts",
			"landing:",
			"  image: $TEST_SITE_HOST/banner.png",
			"details:",
			"  daily:",
			"    readUrl: ${TEST_SITE_READ:-https://read.test}/{{strip.year}}/$$",
		].join("\n");
		const config = withEnvironment(
			{ TEST_SITE_NAME: "Find Peanuts", TEST_SITE_HOST: "https://peanuts.test", TEST_SITE_READ: "" },
			() => withConfig(yaml, loadPageConfig),
		);
		assert.equal(config.name, "Find Peanuts");
		assert.equal(config.landingImage, "https://peanuts.test/banner.png");
		// No alt given, so the banner is read out as the site's name.
		assert.equal(config.landingAlt, "Find Peanuts");
		assert.equal(config.landingSize, null);
		assert.equal(config.details.daily.readUrl, "https://read.test/{{strip.year}}/$");
	});

	await suite.test("leaves a landing image that comes out empty unset", () => {
		const config = withEnvironment({ TEST_SITE_BANNER: undefined }, () =>
			withConfig("name: Find Peanuts\nseries: Peanuts\nlanding:\n  image: $TEST_SITE_BANNER\n", loadPageConfig),
		);
		assert.equal(config.landingImage, null);
		assert.equal(config.favicon, null);
		assert.deepEqual(config.details, { daily: {}, rerun: {}, special: {} });
	});

	await suite.test("refuses a template asking for a field its kind of strip lacks", () => {
		const yaml = "name: x\nseries: x\ndetails:\n  daily:\n    readUrl: https://read.test/{{strip.original.year}}\n";
		assert.throws(() => withConfig(yaml, loadPageConfig), /details\.daily.*strip\.original\.year/);
	});

	await suite.test("refuses a kind or a link it does not know", () => {
		assert.throws(() => withConfig("name: x\nseries: x\ndetails:\n  sunday: {}\n", loadPageConfig), /details\.sunday/);
		assert.throws(
			() => withConfig("name: x\nseries: x\ndetails:\n  daily:\n    buyUrl: https://x.test\n", loadPageConfig),
			/details\.daily\.buyUrl/,
		);
	});

	await suite.test("takes the banner's size as both its width and height or neither", () => {
		const size = withConfig(
			"name: x\nseries: x\nlanding:\n  width: 722\n  height: '103'\n",
			loadPageConfig,
		).landingSize;
		assert.deepEqual(size, { width: 722, height: 103 });
		assert.throws(() => withConfig("name: x\nseries: x\nlanding:\n  width: 722\n", loadPageConfig), /both or neither/);
		assert.throws(
			() => withConfig("name: x\nseries: x\nlanding:\n  width: 72.5\n  height: 10\n", loadPageConfig),
			/landing\.width.*whole number/,
		);
	});

	await suite.test("has arcs and reruns unless they are turned off, and must say", () => {
		const both = withConfig(
			"name: x\nseries: x\narcs: !Import ./arcs.yaml\nreruns: !Import ./reruns.yaml\n",
			loadPageConfig,
			{ "arcs.yaml": "{}\n", "reruns.yaml": "{}\n" },
		);
		assert.equal(both.arcs, true);
		assert.equal(both.reruns, true);
		const neither = withConfig("name: x\nseries: x\narcs: false\nreruns: 'False'\n", loadPageConfig);
		assert.equal(neither.arcs, false);
		assert.equal(neither.reruns, false);
		assert.throws(() => withConfig("name: x\nseries: x\narcs:\n", loadPageConfig), /must give arcs/);
	});

	await suite.test("reads a part written in place, and imports Markdown as its text", () => {
		withConfig("name: x\nseries: x\nreruns:\n  '19910505': '19860119'\n", (config) => {
			const source = { dailies: { "19860119": { transcript: "" } }, specials: {} };
			assert.deepEqual(loadReruns(source, config), { "1991-05-05": "1986-01-19" });
		});
		withConfig(
			"credits: !Import ./credits.md\n",
			(config) => {
				assert.equal(loadCreditsHtml(config), "<p>Thanks to <em>everyone</em>.</p>\n");
			},
			{ "credits.md": "Thanks to *everyone*.\n" },
		);
		withConfig(
			"credits: !Import ./credits.txt\n",
			(config) => {
				assert.throws(() => loadCreditsHtml(config), /neither YAML nor Markdown/);
			},
			{ "credits.txt": "Thanks.\n" },
		);
	});

	// `$5` in what a file imports is five dollars, however the environment reads `config.yaml` itself.
	await suite.test("reads the environment into config.yaml, but not into what it imports", () => {
		withEnvironment({ FIVE: "five" }, () =>
			withConfig(
				"name: $FIVE\nseries: x\ncredits: !Import ./credits.md\n",
				(config) => {
					assert.equal(loadPageConfig(config).name, "five");
					assert.match(loadCreditsHtml(config), /\$FIVE dollars/);
				},
				{ "credits.md": "$FIVE dollars\n" },
			),
		);
	});

	await suite.test("watches config.yaml, what it imports however deep, .env, and the folders it maps over", () => {
		withConfig(
			"comics: !Import ./comics/index.yaml\ncollections: !Map [Import, ./books/*.yaml]\n",
			(config, projectDir) => {
				assert.deepEqual(configDependencies(config), {
					files: [
						config,
						path.join(projectDir, "comics", "index.yaml"),
						path.join(projectDir, "comics", "specials", "one.yaml"),
						path.join(projectDir, "books", "one.yaml"),
						path.join(process.cwd(), ".env"),
					],
					directories: [path.join(projectDir, "comics", "specials"), path.join(projectDir, "books")],
				});
			},
			{
				"comics/index.yaml": "specials: !Map [Import, ./specials/*.yaml]\n",
				"comics/specials/one.yaml": "{}\n",
				"books/one.yaml": "{}\n",
			},
		);
	});

	// `../`, which from the project itself would leave it: so the path is the importing file's.
	await suite.test("reads an import's path from the file it is written in", () => {
		withConfig(
			"comics: !Import ./strips/index.yaml\n",
			(config) => assert.deepEqual(loadRequiredPart("comics", config), { dailies: { "19851118": "Hi." } }),
			{ "strips/index.yaml": "dailies: !Import ../days/dailies.yaml\n", "days/dailies.yaml": "'19851118': Hi.\n" },
		);
	});

	await suite.test("maps Import over every file a pattern matches, in the order of their paths", () => {
		withConfig(
			"collections: !Map [Import, books/**/*.yaml]\n",
			(config) => assert.deepEqual(loadRequiredPart("collections", config), [{ id: "a" }, { id: "b" }, { id: "c" }]),
			{
				"books/a.yaml": "id: a\n",
				"books/b/b.yaml": "id: b\n",
				"books/c.yaml": "id: c\n",
				"books/notes.md": "Not a book.\n",
			},
		);
		// From an imported file, the pattern is that file's, as an `!Import` is.
		withConfig(
			"comics: !Import ./strips/index.yaml\n",
			(config) => assert.deepEqual(loadRequiredPart("comics", config), { specials: [{ id: "x" }] }),
			{ "strips/index.yaml": "specials: !Map [Import, ./specials/*.yaml]\n", "strips/specials/x.yaml": "id: x\n" },
		);
	});

	await suite.test("fails for a pattern that matches nothing, or a !Map of anything but Import", () => {
		withConfig("collections: !Map [Import, ./books/*.yaml]\n", (config) => {
			assert.throws(() => loadPageConfig(config), /maps Import over \.\/books\/\*\.yaml, which matches no file/);
		});
		withConfig("collections: !Map [Include, ./books/*.yaml]\n", (config) => {
			assert.throws(() => loadPageConfig(config), /not \[Import, a pattern\]/);
		});
	});

	await suite.test("publishes a banner named with !Path, with its size read from the file unless given", () => {
		const files = { "banner.gif": sampleGif(722, 103) };
		withConfig(
			"name: x\nseries: x\nlanding:\n  image: !Path ./banner.gif\n",
			(config) => {
				const page = loadPageConfig(config);
				const landing = loadLandingFile(config);
				assert.match(landing!.published, /^static\/[0-9a-f]{16}\.gif$/);
				assert.equal(page.landingImage, `/${landing!.published}`);
				assert.deepEqual(page.landingSize, { width: 722, height: 103 });
			},
			files,
		);
		const given = withConfig(
			"name: x\nseries: x\nlanding:\n  image: !Path ./banner.gif\n  width: 361\n  height: 52\n",
			loadPageConfig,
			files,
		);
		assert.deepEqual(given.landingSize, { width: 361, height: 52 });
		assert.equal(withConfig("name: x\nseries: x\nlanding:\n  image: https://x.test/b.png\n", loadLandingFile), null);
		assert.throws(
			() => withConfig("name: x\nseries: x\nlanding:\n  image: banner.png\n", loadPageConfig),
			/landing\.image in site\.yaml must be a URL, or a file as !Path/,
		);
	});

	await suite.test("has colour Sundays only when they are turned on", () => {
		assert.equal(withConfig("name: x\nseries: x\n", loadPageConfig).colourSundays, false);
		assert.equal(withConfig("name: x\nseries: x\ncolourSundays: true\n", loadPageConfig).colourSundays, true);
		assert.throws(
			() => withConfig("name: x\nseries: x\ncolourSundays: yes\n", loadPageConfig),
			/colourSundays.*true or false/,
		);
	});

	await suite.test("reads no arcs.yaml or reruns.yaml for a site without them", () => {
		// The project holds only `config.yaml`, so reading either file would throw.
		withConfig("name: x\nseries: x\narcs: false\nreruns: false\n", (config) => {
			const source = {} as ComicSource;
			assert.deepEqual(loadArcs(source, {} as CollectionData, config), []);
			assert.deepEqual(loadReruns(source, config), {});
		});
	});

	await suite.test("imports the characters from the file config.yaml names", () => {
		withConfig("name: x\nseries: x\ncharacters: !Import ./cast/people.yaml\n", (config, projectDir) => {
			fs.mkdirSync(path.join(projectDir, "cast"));
			fs.writeFileSync(path.join(projectDir, "cast", "people.yaml"), "calvin: Calvin\nsusie: Susie Derkins\n");
			assert.equal(loadPageConfig(config).characters, true);
			const characters = loadCharacters(config);
			assert.deepEqual(characters, [
				{ id: "calvin", name: "Calvin" },
				{ id: "susie", name: "Susie Derkins" },
			]);
			assert.ok(configDependencies(config).files.includes(path.join(projectDir, "cast", "people.yaml")));
			assert.deepEqual(stripCharacters("19851118", { transcript: "", characters: ["susie"] }, characters), ["susie"]);
			assert.deepEqual(stripCharacters("19851118", { transcript: "" }, characters), []);
			assert.throws(
				() => stripCharacters("19851118", { transcript: "", characters: ["suzy"] }, characters),
				/19851118 features "suzy"/,
			);
		});
	});

	await suite.test("imports a file relative to the one importing it", () => {
		withConfig("name: x\nseries: x\ncharacters: !Import ./cast/index.yaml\n", (config, projectDir) => {
			fs.mkdirSync(path.join(projectDir, "cast"));
			fs.writeFileSync(path.join(projectDir, "cast", "index.yaml"), "!Import ./people.yaml\n");
			fs.writeFileSync(path.join(projectDir, "cast", "people.yaml"), "hobbes: Hobbes\n");
			assert.deepEqual(loadCharacters(config), [{ id: "hobbes", name: "Hobbes" }]);
		});
		withConfig("name: x\nseries: x\ncharacters: !Import ./loop.yaml\n", (config, projectDir) => {
			fs.writeFileSync(path.join(projectDir, "loop.yaml"), "!Import ./site.yaml\n");
			assert.throws(() => loadCharacters(config), /imports it back/);
		});
	});

	// A missing file is a mistake to stop for rather than a site without characters: only `false` is that.
	await suite.test("fails for an imported file that is not there", () => {
		withConfig("name: x\nseries: x\ncharacters: !Import ./people.yaml\n", (config) => {
			assert.throws(() => loadPageConfig(config), /site\.yaml imports \.\/people\.yaml, which does not exist/);
			assert.throws(() => loadCharacters(config), /people\.yaml, which does not exist/);
		});
	});

	await suite.test("has no characters where config.yaml turns them off, and must say", () => {
		withConfig("name: x\nseries: x\ncharacters: false\n", (config) => {
			assert.equal(loadPageConfig(config).characters, false);
			assert.deepEqual(loadCharacters(config), []);
			// A strip's list is not read, or checked, on a site without them.
			assert.deepEqual(stripCharacters("19851118", { transcript: "", characters: ["nobody"] }, []), []);
		});
		assert.throws(() => withConfig("name: x\nseries: x\ncharacters:\n", loadPageConfig), /must give characters/);
		assert.throws(
			() => withConfig("name: x\nseries: x\ncharacters: true\n", loadCharacters),
			/characters.*mapping of character ids to names, or false/,
		);
	});

	await suite.test("refuses malformed characters", () => {
		const read = (characters: string) => () =>
			withConfig(`name: x\nseries: x\ncharacters:\n${characters}`, loadCharacters);
		assert.throws(read("  Miss Wormwood: Miss Wormwood\n"), /Invalid character id/);
		assert.throws(read("  wormwood:\n"), /needs a name/);
		assert.throws(read("  - calvin\n"), /mapping/);
	});

	await suite.test("refuses a site with no name, or no series", () => {
		assert.throws(() => withConfig("landing: {}\n", loadPageConfig), /name/);
		assert.throws(() => withConfig("name: x\n", loadPageConfig), /series/);
	});

	// `withConfig` names the file `site.yaml`.
	await suite.test("names the configuration file a mistake is in", () => {
		assert.throws(() => withConfig("name: x\n", loadPageConfig), /^Error: site\.yaml must say what the archive is of/);
		assert.throws(() => withConfig("name: x\nseries: x\ngrid: []\n", loadPageConfig), /grid in site\.yaml/);
		assert.throws(() => withConfig("name: x\nseries: x\narcs:\n", loadPageConfig), /site\.yaml must give arcs/);
		assert.throws(() => withConfig("comics: []\n", loadComicSource), /comics in site\.yaml must be a mapping/);
		assert.throws(() => withConfig("credits: !Import ./nope.md\n", loadCreditsHtml), /site\.yaml imports \.\/nope\.md/);
	});
});

test("strip links", async (suite) => {
	const templates = { readUrl: "https://read.test/{{ strip.year }}/{{strip.month}}/{{strip.day}}" };

	await suite.test("fill a daily's date in", () => {
		assert.deepEqual(stripLinks(templates, { kind: "daily", date: "1986-07-07" }), [
			{ label: "Read", href: "https://read.test/1986/07/07" },
		]);
	});

	await suite.test("fill in both days of a rerun", () => {
		const links = stripLinks(
			{
				readUrl: "https://read.test/{{strip.original.date}}",
				licenseUrl: "https://license.test/{{strip.rerun.year}}",
			},
			{ kind: "rerun", original: "1986-07-07", rerun: "1991-07-08" },
		);
		assert.deepEqual(links, [
			{ label: "Read", href: "https://read.test/1986-07-07" },
			{ label: "License", href: "https://license.test/1991" },
		]);
	});

	await suite.test("escape what they fill in", () => {
		const links = stripLinks(
			{ readUrl: "https://read.test/?id={{strip.id}}" },
			{ kind: "special", id: "a b&c", date: "1986-07-07" },
		);
		assert.equal(links[0].href, "https://read.test/?id=a%20b%26c");
	});

	await suite.test("are left out where there is no template", () => {
		assert.deepEqual(stripLinks({}, { kind: "special", id: "x", date: "1986-07-07" }), []);
		assert.deepEqual(stripLinks({ readUrl: "", licenseUrl: "" }, { kind: "daily", date: "1986-07-07" }), []);
	});
});

test("link previews", async (suite) => {
	const template = fs.readFileSync(path.join(process.cwd(), "src", "index.html"), "utf8");
	const landing = () => buildDocumentHtml(template, { view: "landing" }, { siteUrl: "", path: "/" });

	/** The page as a site configured with these instead would write it. */
	function configured<T>(overrides: Partial<typeof PAGE_CONFIG>, run: () => T): T {
		const saved = { ...PAGE_CONFIG };
		Object.assign(PAGE_CONFIG, overrides);
		try {
			return run();
		} finally {
			Object.assign(PAGE_CONFIG, saved);
		}
	}

	await suite.test("fall back on the configured description and the banner", () => {
		const html = landing();
		assert.match(html, /<meta name="description" content="Search the complete Calvin and Hobbes archive\./);
		assert.match(html, /<meta property="og:description" content="Search the complete/);
		assert.match(
			html,
			/<meta property="og:image" content="https:\/\/upload\.wikimedia\.org\/[^"]*Calvin_and_Hobbes_title\.png"/,
		);
	});

	await suite.test("leave out a description and an image there is none of", () => {
		const html = configured({ description: null, landingImage: null }, landing);
		assert.doesNotMatch(html, /name="description"|og:description|og:image/);
		assert.match(html, /<meta property="og:title" content="Find Calvin and Hobbes" \/>/);
	});

	await suite.test("write the series into the page", () => {
		const html = configured({ series: "Peanuts" }, landing);
		assert.match(html, /Searching and browsing the Peanuts archive requires JavaScript\./);
	});
});

test("the grid's configuration", async (suite) => {
	const grid = (yaml: string) => withConfig(`name: x\nseries: x\n${yaml}`, loadPageConfig).grid;

	await suite.test("is a single page of days without one", () => {
		assert.deepEqual(grid(""), {
			periods: [],
			levels: [{ unit: "day", columns: 7, paged: false }],
			zoom: 0,
		});
	});

	await suite.test("reads periods in order, a year as its first of January", () => {
		const config = grid(
			[
				"grid:",
				"  periods:",
				"    1950s: 1950",
				"    1960s: 1960-06-01",
				"  levels:",
				"    - unit: day",
				"      page: period",
				"    - unit: month",
				"      columns: 6",
				"    - unit: period",
				"      columns: 1",
				"  zoom: month",
			].join("\n"),
		);
		assert.deepEqual(config.periods, [
			{ label: "1950s", start: "1950-01-01" },
			{ label: "1960s", start: "1960-06-01" },
		]);
		assert.deepEqual(config.levels, [
			{ unit: "day", columns: 7, paged: true },
			{ unit: "month", columns: 6, paged: false },
			{ unit: "period", columns: 1, paged: false },
		]);
		assert.equal(config.zoom, 1);
	});

	await suite.test("keeps periods named by year in order", () => {
		const config = grid(
			'grid:\n  periods:\n    "1985": 1985\n    1986: 1986\n    1990: 1990\n  levels:\n    - unit: day\n',
		);
		assert.deepEqual(
			config.periods.map((period) => period.label),
			["1985", "1986", "1990"],
		);
	});

	await suite.test("needs no periods for levels that neither draw nor page by them", () => {
		const config = grid("grid:\n  levels:\n    - unit: day\n    - unit: month\n      columns: 6\n  zoom: month\n");
		assert.deepEqual(config, {
			periods: [],
			levels: [
				{ unit: "day", columns: 7, paged: false },
				{ unit: "month", columns: 6, paged: false },
			],
			zoom: 1,
		});
	});

	await suite.test("refuses what it cannot draw", () => {
		const day = "  levels:\n    - unit: day\n";
		const cases: [string, RegExp][] = [
			["grid:\n  levels: []\n", /at least one level/],
			["grid:\n  levels:\n    - unit: month\n      columns: 6\n", /must start with the days/],
			[`grid:\n${day}    - unit: year\n      columns: 2\n    - unit: month\n      columns: 6\n`, /must go from day/],
			[`grid:\n${day}    - unit: month\n`, /must give its columns/],
			["grid:\n  levels:\n    - unit: day\n      columns: 6\n", /must be 7/],
			["grid:\n  levels:\n    - unit: day\n      page: period\n", /grid\.periods names none/],
			[`grid:\n${day}    - unit: period\n      columns: 1\n`, /grid\.periods names none/],
			["grid:\n  periods:\n    b: 1990\n    a: 1980\n" + day, /must start after b/],
			['grid:\n  periods:\n    Early: 1985\n    "1990": 1990\n    Late: 1993\n' + day, /like 1990, and some not/],
			["grid:\n  periods:\n    a: 1990-13-01\n" + day, /a year like 1990 or a date/],
			[`grid:\n${day}  zoom: year\n`, /grid\.zoom.*"year"/],
		];
		for (const [yaml, error] of cases) assert.throws(() => grid(yaml), error, yaml);
	});
});
