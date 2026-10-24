import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import {
	configDependencies,
	loadFaviconFile,
	loadLandingFile,
	loadPageConfig,
	loadRequiredPart,
} from "../build-chain/siteConfig";
import { buildManifest } from "../build-chain/favicon";
import { sampleGif, withConfig } from "./helpers/config";
import { loadArcs } from "../build-chain/arcs";
import { loadCharacters } from "../build-chain/characters";
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
		assert.match(PAGE_CONFIG.favicon!, /^\/static\/[0-9a-f]{16}-32\.png$/);
		assert.match(PAGE_CONFIG.touchIcon!, /^\/static\/[0-9a-f]{16}-180\.png$/);
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
			"    - title: Read",
			"      href: ${TEST_SITE_READ:-https://read.test}/{{strip.year}}/$$",
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
		assert.deepEqual(config.details.daily, [{ title: "Read", href: "https://read.test/{{strip.year}}/$" }]);
	});

	await suite.test("leaves a landing image that comes out empty unset", () => {
		const config = withEnvironment({ TEST_SITE_BANNER: undefined }, () =>
			withConfig("name: Find Peanuts\nseries: Peanuts\nlanding:\n  image: $TEST_SITE_BANNER\n", loadPageConfig),
		);
		assert.equal(config.landingImage, null);
		assert.equal(config.favicon, null);
		assert.deepEqual(config.details, { daily: [], rerun: [], special: [] });
	});

	await suite.test("refuses a template asking for a field its kind of strip lacks", () => {
		const yaml =
			"name: x\nseries: x\ndetails:\n  daily:\n    - title: Read\n      href: https://read.test/{{strip.original.year}}\n";
		assert.throws(() => withConfig(yaml, loadPageConfig), /details\.daily.*strip\.original\.year/);
	});

	await suite.test("refuses a kind or a link it does not know", () => {
		assert.throws(() => withConfig("name: x\nseries: x\ndetails:\n  sunday: []\n", loadPageConfig), /details\.sunday/);
		assert.throws(
			() => withConfig("name: x\nseries: x\ndetails:\n  daily:\n    readUrl: https://x.test\n", loadPageConfig),
			/details\.daily in .* must be a list/,
		);
		assert.throws(
			() =>
				withConfig(
					"name: x\nseries: x\ndetails:\n  daily:\n    - title: Read\n      url: https://x.test\n",
					loadPageConfig,
				),
			/details\.daily\[0\]\.url/,
		);
		assert.throws(
			() => withConfig("name: x\nseries: x\ndetails:\n  daily:\n    - href: https://x.test\n", loadPageConfig),
			/details\.daily\[0\] in .* needs a title/,
		);
	});

	await suite.test("keeps the links in their order, leaving out any with no href", () => {
		const yaml = [
			"name: x",
			"series: x",
			"details:",
			"  daily:",
			"    - title: License",
			"      href: https://license.test",
			"    - title: Buy",
			"    - title: Read",
			"      href: https://read.test",
		].join("\n");
		assert.deepEqual(withConfig(yaml, loadPageConfig).details.daily, [
			{ title: "License", href: "https://license.test" },
			{ title: "Read", href: "https://read.test" },
		]);
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
			const source = { strips: { "19860119": { transcript: "" } }, specials: {} };
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
			(config) => assert.deepEqual(loadRequiredPart("comics", config), { strips: { "19851118": "Hi." } }),
			{ "strips/index.yaml": "strips: !Import ../days/dailies.yaml\n", "days/dailies.yaml": "'19851118': Hi.\n" },
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

	await suite.test(
		"draws the icons from a favicon named with !Path, on the theme's background for a home screen",
		() => {
			const files = { "icon.png": sampleGif(512, 512) };
			withConfig(
				"name: x\nseries: x\nfavicon: !Path ./icon.png\nurl: https://x.test/repo\n",
				(config) => {
					const page = loadPageConfig(config);
					const favicon = loadFaviconFile(config)!;
					assert.equal(favicon.background, "#ffffff");
					assert.match(favicon.tab, /^static\/[0-9a-f]{16}-32\.png$/);
					assert.equal(page.favicon, `/repo/${favicon.tab}`);
					assert.equal(page.touchIcon, `/repo/${favicon.touch}`);
					// The tab's is drawn on nothing, and so is named apart from the ones drawn on the background.
					assert.notEqual(favicon.tab.split("-")[0], favicon.touch.split("-")[0]);
					assert.equal(favicon.touch.split("-")[0], favicon.app[0].published.split("-")[0]);
					assert.deepEqual(
						favicon.app.map(({ size }) => size),
						[192, 512],
					);
				},
				files,
			);
			assert.throws(
				() => withConfig("name: x\nseries: x\nfavicon: icon.png\n", loadPageConfig),
				/favicon in site\.yaml must be a URL, or a file as !Path/,
			);
			assert.throws(
				() => withConfig("name: x\nseries: x\nfavicon: !Path ./icon.svg\n", loadPageConfig, { "icon.svg": "<svg/>" }),
				/favicon in site\.yaml must be a PNG, JPEG, GIF or WebP/,
			);
		},
	);

	await suite.test("keeps a favicon given as a URL for the tab alone", () => {
		withConfig("name: x\nseries: x\nfavicon: https://x.test/icon.png\n", (config) => {
			const page = loadPageConfig(config);
			assert.equal(page.favicon, "https://x.test/icon.png");
			assert.equal(page.touchIcon, null);
			assert.equal(loadFaviconFile(config), null);
		});
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

	// Two strips and a special, which is all a character's strips are read from.
	const CAST_SOURCE: ComicSource = {
		strips: {
			"19851118": { transcript: "", characters: ["susie"] },
			"19851119": { transcript: "", characters: ["susie", "calvin", "susie"] },
			"19851120": { transcript: "" },
		},
		specials: { poster: { transcript: "", date: "19870301", title: "The poster", characters: ["calvin"] } },
	};
	const loadCast = (config: string) => loadCharacters(CAST_SOURCE, "/", config);

	await suite.test("imports the characters from the file config.yaml names", () => {
		withConfig("name: x\nseries: x\ncharacters: !Import ./cast/people.yaml\n", (config, projectDir) => {
			fs.mkdirSync(path.join(projectDir, "cast"));
			fs.writeFileSync(
				path.join(projectDir, "cast", "people.yaml"),
				"calvin: { name: Calvin }\nsusie: { name: Susie Derkins }\nhobbes: { name: Hobbes }\n",
			);
			assert.equal(loadPageConfig(config).characters, true);
			const { characters, byStrip } = loadCast(config);
			assert.deepEqual(characters, [
				{
					id: "calvin",
					name: "Calvin",
					strips: 2,
					years: [1985, 1987],
					ranges: ["19851119"],
					specials: [{ id: "poster", title: "The poster", date: "1987-03-01" }],
				},
				{ id: "susie", name: "Susie Derkins", strips: 2, years: [1985], ranges: ["19851118-19851119"] },
				// In no strip yet, and listed all the same.
				{ id: "hobbes", name: "Hobbes", strips: 0, years: [], ranges: [] },
			]);
			assert.ok(configDependencies(config).files.includes(path.join(projectDir, "cast", "people.yaml")));
			// Each strip's, once each, in its own order, a special's too.
			assert.deepEqual(
				[...byStrip],
				[
					["19851118", ["susie"]],
					["19851119", ["susie", "calvin"]],
					["poster", ["calvin"]],
				],
			);
		});
	});

	await suite.test("publishes a character's portrait from the mount, as a creator's", () => {
		withConfig(
			"name: x\nseries: x\ncharacters:\n  calvin: { name: Calvin, image: !Path ./calvin.png }\n  susie: { name: Susie, image: https://example.com/susie.png }\n",
			(config, projectDir) => {
				fs.writeFileSync(path.join(projectDir, "calvin.png"), "");
				const { characters, files } = loadCharacters(CAST_SOURCE, "/repo/", config);
				const [published] = [...files.keys()];
				assert.equal(characters[0].image, `/repo/${published}`);
				assert.equal(files.get(published), path.join(projectDir, "calvin.png"));
				assert.equal(characters[1].image, "https://example.com/susie.png");
			},
		);
		assert.throws(
			() => withConfig("name: x\nseries: x\ncharacters:\n  calvin: { name: Calvin, image: calvin.png }\n", loadCast),
			/Character "calvin"'s image .* must be a URL/,
		);
	});

	await suite.test("refuses a strip that features someone the characters' file does not list", () => {
		const source: ComicSource = { strips: { "19851118": { transcript: "", characters: ["suzy"] } }, specials: {} };
		withConfig("name: x\nseries: x\ncharacters:\n  susie: { name: Susie }\n", (config) => {
			assert.throws(() => loadCharacters(source, "/", config), /Strip 19851118 features "suzy"/);
		});
		const special: ComicSource = {
			strips: {},
			specials: { poster: { transcript: "", date: "19870301", title: "x", characters: "susie" as never } },
		};
		withConfig("name: x\nseries: x\ncharacters:\n  susie: { name: Susie }\n", (config) => {
			assert.throws(
				() => loadCharacters(special, "/", config),
				/Special poster must list its characters as a list of ids/,
			);
		});
	});

	await suite.test("reads how a strip has its characters, and leaves its mentions out of who it features", () => {
		const source: ComicSource = {
			strips: {
				"19851118": {
					transcript: "",
					characters: ["calvin", { seen: ["hobbes", "susie"] }, { heard: "mom", mentioned: "dad" }],
				},
				"19851119": { transcript: "", characters: [{ mentioned: ["susie"] }] },
			},
			specials: {},
		};
		withConfig(
			"name: x\nseries: x\ncharacters:\n  calvin: { name: Calvin }\n  hobbes: { name: Hobbes }\n  susie: { name: Susie }\n  mom: { name: Mom }\n  dad: { name: Dad }\n",
			(config) => {
				const { characters, byStrip, roles } = loadCharacters(source, "/", config);
				assert.deepEqual([...byStrip], [["19851118", ["calvin", "hobbes", "susie", "mom"]]]);
				assert.deepEqual(
					[...roles],
					[
						["19851118", { seenOnly: ["hobbes", "susie"], heardOnly: ["mom"], mentioned: ["dad"] }],
						["19851119", { mentioned: ["susie"] }],
					],
				);
				// A mention is no appearance.
				assert.deepEqual(
					characters.map((character) => [character.id, character.strips]),
					[
						["calvin", 1],
						["hobbes", 1],
						["susie", 1],
						["mom", 1],
						["dad", 0],
					],
				);
			},
		);
	});

	await suite.test("says nothing more of strips that only list who is in them", () => {
		withConfig("name: x\nseries: x\ncharacters:\n  calvin: { name: Calvin }\n  susie: { name: Susie }\n", (config) => {
			assert.equal(loadCast(config).roles.size, 0);
		});
	});

	await suite.test("refuses a character listed twice in two ways, or under a role there is not", () => {
		const cast = "name: x\nseries: x\ncharacters:\n  susie: { name: Susie }\n";
		const strip = (characters: unknown): ComicSource => ({
			strips: { "19851118": { transcript: "", characters: characters as never } },
			specials: {},
		});
		withConfig(cast, (config) => {
			assert.throws(
				() => loadCharacters(strip([{ seen: "susie" }, { heard: "susie" }]), "/", config),
				/Strip 19851118 lists "susie" as both seen and heard: write the id alone/,
			);
			assert.throws(
				() => loadCharacters(strip(["susie", { mentioned: "susie" }]), "/", config),
				/Strip 19851118 lists "susie" as seen and heard, and again as mentioned/,
			);
			assert.throws(
				() => loadCharacters(strip([{ smelled: "susie" }]), "/", config),
				/Strip 19851118 lists characters under "smelled"/,
			);
			assert.throws(
				() => loadCharacters(strip([{ mentioned: "suzy" }]), "/", config),
				/Strip 19851118 mentions "suzy", which is not one of the characters/,
			);
		});
	});

	await suite.test("imports a file relative to the one importing it", () => {
		withConfig("name: x\nseries: x\ncharacters: !Import ./cast/index.yaml\n", (config, projectDir) => {
			fs.mkdirSync(path.join(projectDir, "cast"));
			fs.writeFileSync(path.join(projectDir, "cast", "index.yaml"), "!Import ./people.yaml\n");
			fs.writeFileSync(path.join(projectDir, "cast", "people.yaml"), "hobbes: { name: Hobbes }\n");
			assert.deepEqual(
				loadCharacters({ strips: {}, specials: {} }, "/", config).characters.map((character) => character.id),
				["hobbes"],
			);
		});
		withConfig("name: x\nseries: x\ncharacters: !Import ./loop.yaml\n", (config, projectDir) => {
			fs.writeFileSync(path.join(projectDir, "loop.yaml"), "!Import ./site.yaml\n");
			assert.throws(() => loadCast(config), /imports it back/);
		});
	});

	// A missing file is a mistake to stop for rather than a site without characters: only `false` is that.
	await suite.test("fails for an imported file that is not there", () => {
		withConfig("name: x\nseries: x\ncharacters: !Import ./people.yaml\n", (config) => {
			assert.throws(() => loadPageConfig(config), /site\.yaml imports \.\/people\.yaml, which does not exist/);
			assert.throws(() => loadCast(config), /people\.yaml, which does not exist/);
		});
	});

	await suite.test("has no characters where config.yaml turns them off, and must say", () => {
		withConfig("name: x\nseries: x\ncharacters: false\n", (config) => {
			assert.equal(loadPageConfig(config).characters, false);
			// A strip's list is not read, or checked, on a site without them.
			const source: ComicSource = { strips: { "19851118": { transcript: "", characters: ["nobody"] } }, specials: {} };
			const { characters, byStrip } = loadCharacters(source, "/", config);
			assert.deepEqual(characters, []);
			assert.equal(byStrip.size, 0);
		});
		assert.throws(() => withConfig("name: x\nseries: x\ncharacters:\n", loadPageConfig), /must give characters/);
		assert.throws(
			() => withConfig("name: x\nseries: x\ncharacters: true\n", loadCast),
			/characters.*mapping of character ids, or false/,
		);
	});

	await suite.test("refuses malformed characters", () => {
		const read = (characters: string) => () => withConfig(`name: x\nseries: x\ncharacters:\n${characters}`, loadCast);
		assert.throws(read("  Miss Wormwood: { name: Miss Wormwood }\n"), /Invalid character id/);
		assert.throws(read("  wormwood:\n"), /needs a name/);
		assert.throws(read("  wormwood: Miss Wormwood\n"), /needs a name/);
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
	const templates = [{ title: "Read", href: "https://read.test/{{ strip.year }}/{{strip.month}}/{{strip.day}}" }];

	await suite.test("fill a daily's date in", () => {
		assert.deepEqual(stripLinks(templates, { kind: "daily", date: "1986-07-07" }), [
			{ title: "Read", href: "https://read.test/1986/07/07" },
		]);
	});

	await suite.test("fill in both days of a rerun", () => {
		const links = stripLinks(
			[
				{ title: "Read", href: "https://read.test/{{strip.original.date}}" },
				{ title: "License", href: "https://license.test/{{strip.rerun.year}}" },
			],
			{ kind: "rerun", original: "1986-07-07", rerun: "1991-07-08" },
		);
		assert.deepEqual(links, [
			{ title: "Read", href: "https://read.test/1986-07-07" },
			{ title: "License", href: "https://license.test/1991" },
		]);
	});

	await suite.test("escape what they fill in", () => {
		const links = stripLinks([{ title: "Read", href: "https://read.test/?id={{strip.id}}" }], {
			kind: "special",
			id: "a b&c",
			date: "1986-07-07",
		});
		assert.equal(links[0].href, "https://read.test/?id=a%20b%26c");
	});

	await suite.test("are left out where there is no template", () => {
		assert.deepEqual(stripLinks([], { kind: "special", id: "x", date: "1986-07-07" }), []);
		assert.deepEqual(stripLinks([{ title: "Read", href: "" }], { kind: "daily", date: "1986-07-07" }), []);
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

	await suite.test("link the manifest and the icons drawn from the favicon", () => {
		const html = landing();
		assert.match(html, /<link rel="manifest" href="\/manifest\.webmanifest" \/>/);
		assert.match(html, /<meta name="apple-mobile-web-app-title" content="Find Calvin and Hobbes" \/>/);
		assert.match(html, /<link rel="apple-touch-icon" href="\/static\/[0-9a-f]{16}-180\.png" \/>/);
		const hotlinked = configured({ favicon: "https://x.test/icon.png", touchIcon: null }, landing);
		assert.match(hotlinked, /<link rel="icon" href="https:\/\/x\.test\/icon\.png" \/>/);
		assert.doesNotMatch(hotlinked, /apple-touch-icon/);
	});

	await suite.test("write the series into the page", () => {
		const html = configured({ series: "Peanuts" }, landing);
		assert.match(html, /Searching and browsing the Peanuts archive requires JavaScript\./);
	});
});

test("the web app manifest", async (suite) => {
	const theme = { main: "#f6b213", background: "#fbf6f0" } as Parameters<typeof buildManifest>[0]["theme"];

	await suite.test("opens the site on its own from where it is mounted, with the icons drawn from a file", () => {
		const favicon = {
			file: "icon.png",
			background: "#fbf6f0",
			tab: "static/a-32.png",
			touch: "static/b-180.png",
			app: [
				{ size: 192, published: "static/b-192.png" },
				{ size: 512, published: "static/b-512.png" },
			],
		};
		const manifest = JSON.parse(buildManifest({ name: "x", description: null, basePath: "/repo/", theme, favicon }));
		assert.equal(manifest.display, "standalone");
		assert.equal(manifest.start_url, "/repo/");
		assert.equal(manifest.scope, "/repo/");
		assert.equal("description" in manifest, false);
		assert.deepEqual(manifest.icons, [
			{ src: "/repo/static/b-192.png", sizes: "192x192", type: "image/png" },
			{ src: "/repo/static/b-512.png", sizes: "512x512", type: "image/png" },
		]);
	});

	await suite.test("has no icons for a favicon given as a URL", () => {
		const manifest = JSON.parse(buildManifest({ name: "x", description: "y", basePath: "/", theme, favicon: null }));
		assert.deepEqual(manifest.icons, []);
		assert.equal(manifest.description, "y");
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
