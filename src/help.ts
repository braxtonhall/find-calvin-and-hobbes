/**
 * What the help page says: how to write a query, in the filters and operators this site has.
 *
 * Built from the same tables the parser and the menu read — `FILTER_SPECS` and `CROSSING_SPECS` — so
 * a filter a site has turned off, like `@about:` without subjects, is never explained, and a filter
 * added there is listed here without a second list to keep. What the tables cannot say is written
 * here, kept by the filter's name, and only shown where the filter is.
 *
 * Pure, like `completion.ts`: the page is drawn by the build as well as the app, from this alone.
 */

import { RANGE_START } from "./constants";
import { FilterSpan, filterSpans } from "./completion";
import { OPERATOR_WORDS, QueryContext, STRIP_QUERY, collectionQuery, quoted, quotedSpans } from "./filter-query";
import {
	CROSSING_SPECS,
	CollectionType,
	CrossingSpec,
	FILTER_NAMES,
	FILTER_SPECS,
	FilterSpec,
	Language,
	crossingSpec,
	OperatorSpec,
	operatorSpec,
} from "./filter-spec";
import { AS_TAGS, Term, VOLUMES, Where, characterAsTags, terms } from "./filter-vocabulary";
import { CollectionsTab, TAB_TYPES, buildSearchPath, buildTabPath, collectionsTabs } from "./routes";
import { PAGE_CONFIG } from "./site-config";
import { YEARS } from "./constants";
import { RERUNS } from "./bundled-data";

/** One way of writing an entry: `@in:` and a book, or `@in` and a group. */
export interface HelpForm {
	/** What is written as it is: `@in:`, `@not`. */
	syntax: string;
	/** What the reader fills in after it: `book`, `( … )`. */
	slot?: string;
	hint: string;
}

/** A list of the values an entry takes, under the kind of collection they are for, where they differ. */
export interface HelpValues {
	kind?: string;
	terms: readonly Term[];
}

export interface HelpEntry {
	/** The anchor on the page: `strips-in`, `collections-is`. */
	id: string;
	forms: HelpForm[];
	/** Sentences, with `code` in backticks. */
	/** What the entry is, where its forms do not say. */
	summary?: string;
	notes: string[];
	values: HelpValues[];
	/** The tab that lists every value, for a vocabulary too long to list here. */
	browse?: CollectionsTab;
}

export interface HelpSection {
	id: string;
	title: string;
	/** Sentences, with `code` in backticks, each a paragraph. */
	intro: string[];
	entries: HelpEntry[];
}

export interface HelpExample {
	question: string;
	query: string;
	/** Where the query is searched: the main search, or a tab of Collections. */
	path: string;
	/** The query's filters, as the box it is searched in paints them. */
	spans: FilterSpan[];
}

/** A year of the run for the sentences to write about, a few in where there are a few. */
const YEAR = YEARS[Math.min(3, YEARS.length - 1)] ?? Number(RANGE_START.slice(0, 4));
const NEXT_YEAR = YEAR + 1;
const SHORT_YEAR = String(YEAR).slice(2);

/** The tab that lists every value of a filter whose values are collections. */
const BROWSE: Partial<Record<string, CollectionsTab>> = {
	in: "books",
	during: "arcs",
	by: "creators",
	featuring: "characters",
	about: "subjects",
};

/** The filters whose values are few enough to list in full. */
const LISTED = new Set(["is", "i", "as"]);

/** What each strip filter has to say beyond its hint, by name. */
const STRIP_NOTES: Partial<Record<string, string[]>> = {
	in: ["Two side by side mean either book: `@in:a @in:b`. `@in:a @and @in:b` is both."],
	is: ["Repeated, a strip must have every tag."],
	i: ["What you own, bookmarked and noted is kept in this browser. Repeated, a strip must be every one."],
	during: ["Two side by side mean either arc."],
	featuring: ["Two side by side mean a strip featuring both."],
	by: ["Two side by side mean either creator's strips."],
	about: ["Two side by side mean a strip about both."],
	year: [
		`\`@year:${SHORT_YEAR}\` is every year ending in those digits, never a guess at the century. Two side by side mean either year.`,
	],
	month: ["`@month:8` and `@month:august` are the same month, in every year."],
	day: [
		"`@day:3` is the third of every month, and `@day:saturday` every Saturday. `@day:1 @day:monday` is the Mondays that fell on the first.",
	],
	date: [`Year first, at whatever precision you give: \`@date:${YEAR}/9/3\` is September 3rd, never March 9th.`],
	before: ["A bound is a single day, so its year needs all four digits."],
	after: ["A bound is a single day, so its year needs all four digits."],
};

/** `: @in (@id:a @as:ink) is a strip printed as bare ink in book a`, from one of the tags this site has. */
function asExample(): string {
	const term = AS_TAGS[AS_TAGS.length - 1];
	if (term === undefined) return "";
	const printed = term.hint.replace(/^P/, "p").replace(/this book$/, "book a");
	return `: \`@in (@id:a @as:${term.value})\` is a strip ${printed}`;
}

/** What each collection filter has to say beyond its hint, by name. */
const COLLECTION_NOTES: Partial<Record<string, string[]>> = {
	is: ["`@is:any` is true of every collection, so `@in @is:any` is a strip in any book at all."],
	i: ["What you own and noted is kept in this browser."],
	id: ["A collection's id is the last part of its page's address."],
	published: ["A book's year, or any year an arc's or a subject's strips ran. Two side by side mean either."],
	as: [
		`Filters on how a book and a strip in it go together, so it goes inside \`@in ( … )\` or \`@has ( … )\`, where there are both${asExample()}.`,
		...(characterAsTags().length > 0
			? [
					"Inside `@featuring ( … )`, it says how the strip has the character: `@featuring (@id:a @not @as:heard)` is a strip where character a is seen but never heard. A strip that only mentions a character is left out unless `@as:mentioned` asks for it.",
				]
			: []),
	],
	book: [
		"For a book that comes as a set, numbered as the set numbers them. Like `@as:`, it goes inside `@in ( … )` or `@has ( … )`: `@in (@id:a @book:2 @page:47)` is page 47 of the second book of set a.",
		"A book that is not a set has no number, so `@in @book:1` is a strip in some set. Two side by side mean either.",
	],
	page: [
		`Like \`@as:\`, it goes inside \`@in ( … )\` or \`@has ( … )\`: \`@in (@id:a @page:47)\` is what book a prints on page 47.${VOLUMES ? " Each book of a set starts its pages again, so add `@book:` to say which." : ""}`,
		"A strip printed across two pages is on both. Two side by side mean either page.",
	],
};

/** `@in:x is short for @in (@id:x)`, for each crossing that has a filter of its name. */
function shortFor(spec: CrossingSpec): string {
	return `\`@${spec.name}:x\` is short for \`@${spec.name} (@id:x)\`.`;
}

/** The kinds of collection this site has, in the order of their tabs. */
function siteTypes(): CollectionType[] {
	return collectionsTabs().map((tab) => TAB_TYPES[tab]);
}

/** `a, b and c`. */
function andList(words: readonly string[]): string {
	return words.length > 1 ? `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}` : words.join("");
}

/**
 * Where a filter for only some kinds of collection works, where the site has a kind it is not for:
 * `Works on the Books and Arcs tabs, and inside @in ( … ) and @during ( … ).`
 */
function kindsNote(spec: FilterSpec): string[] {
	// A link filter's own note says where it goes.
	if (spec.types === undefined || spec.link) return [];
	const tabs = collectionsTabs();
	const fits = tabs.filter((tab) => spec.types!.includes(TAB_TYPES[tab]));
	if (fits.length === tabs.length || fits.length === 0) return [];
	const labels = fits.map((tab) => `${tab[0].toUpperCase()}${tab.slice(1)}`);
	const where = `the ${andList(labels)} ${fits.length === 1 ? "tab" : "tabs"}`;
	const inside = CROSSING_SPECS.filter(
		(crossing) => crossing.type !== undefined && fits.some((tab) => TAB_TYPES[tab] === crossing.type),
	);
	const operators = inside.map((crossing) => `\`@${crossing.name} ( … )\``);
	return [`Works on ${where}${operators.length > 0 ? `, and inside ${andList(operators)}` : ""}.`];
}

/**
 * One form per shape the value takes. A filter with one shape says what the filter is beside it; one
 * with several says what each shape is, and leaves what the filter is to `summary`.
 */
function filterForms(spec: FilterSpec): HelpForm[] {
	if (spec.templates.length === 1)
		return [{ syntax: `@${spec.name}:`, slot: spec.templates[0].label, hint: spec.hint }];
	return spec.templates.map((template) => ({ syntax: `@${spec.name}:`, slot: template.label, hint: template.hint }));
}

/** What the filter is, where its forms are each about a shape instead. */
function summary(spec: FilterSpec): string | undefined {
	return spec.templates.length > 1 ? spec.hint : undefined;
}

function crossingForm(spec: CrossingSpec): HelpForm {
	return { syntax: `@${spec.name}`, slot: "( … )", hint: spec.hint };
}

function stripValues(spec: FilterSpec): HelpValues[] {
	return LISTED.has(spec.name) ? [{ terms: terms(spec.name) }] : [];
}

/** A collection filter's values, kind by kind where the kinds do not share them all. */
function collectionValues(spec: FilterSpec): HelpValues[] {
	if (!LISTED.has(spec.name)) return [];
	// `@as:`'s are the kind's at the other end of its link.
	const where = (type: CollectionType): Where =>
		spec.name === "as" ? { language: "collection", linked: type } : { language: "collection", type };
	const types = siteTypes().filter((type) => spec.types === undefined || spec.types.includes(type));
	const lists = types.map((type) => ({ type, terms: terms(spec.name, where(type)) }));
	const same = lists.every(
		(list) => list.terms.map((term) => term.value).join() === lists[0].terms.map((term) => term.value).join(),
	);
	if (same || lists.length === 1) return lists.length === 0 ? [] : [{ terms: lists[0].terms }];
	return lists.map((list) => ({ kind: `${list.type[0].toUpperCase()}${list.type.slice(1)}s`, terms: list.terms }));
}

/** The years of the archive's first rerun, the day it ran again and the day it first ran, for the sentences to write about. */
const [RERAN_YEAR, FIRST_YEAR] = (Object.entries(RERUNS)[0] ?? [String(NEXT_YEAR), String(YEAR)]).map((date) =>
	date.slice(0, 4),
);

/** What each operator from a strip to another day it ran has to say beyond its hint, by name. */
const RUN_NOTES: Partial<Record<string, string[]>> = {
	reran: [
		`What follows is about the day it ran again: \`@year:${FIRST_YEAR} @reran @year:${RERAN_YEAR}\` is a strip from ${FIRST_YEAR} that ran again in ${RERAN_YEAR}, shown on the day it first ran.`,
	],
	reuses: [
		`What follows is about the day it first ran: \`@year:${RERAN_YEAR} @reuses @year:${FIRST_YEAR}\` is a rerun in ${RERAN_YEAR} of a strip from ${FIRST_YEAR}, shown on the day it ran again.`,
	],
};

function stripEntries(): HelpEntry[] {
	const runs = CROSSING_SPECS.filter((spec) => spec.from === "strip" && spec.to === "strip").map((spec): HelpEntry => ({
		id: `strips-${spec.name}`,
		forms: [crossingForm(spec)],
		notes: RUN_NOTES[spec.name] ?? [],
		values: [],
	}));
	return [...filterEntries(), ...runs];
}

function filterEntries(): HelpEntry[] {
	return FILTER_SPECS.filter((spec) => spec.language === "strip").map((spec) => {
		const crossing = crossingSpec(spec.name);
		const crosses = crossing !== undefined && crossing.from === "strip";
		return {
			id: `strips-${spec.name}`,
			forms: [...filterForms(spec), ...(crosses ? [crossingForm(crossing)] : [])],
			summary: summary(spec),
			notes: [...(crosses ? [shortFor(crossing)] : []), ...(STRIP_NOTES[spec.name] ?? [])],
			values: stripValues(spec),
			browse:
				BROWSE[spec.name] !== undefined && collectionsTabs().includes(BROWSE[spec.name]!)
					? BROWSE[spec.name]
					: undefined,
		};
	});
}

function collectionEntries(): HelpEntry[] {
	const has = CROSSING_SPECS.filter((spec) => spec.from === "collection").map((spec): HelpEntry => ({
		id: `collections-${spec.name}`,
		forms: [crossingForm(spec)],
		notes: [
			`What follows is written as you would search for strips in the main box: \`@has @year:${YEAR}\` is a collection with a strip from ${YEAR}, and \`@not @has @year:${YEAR}\` one with none.`,
		],
		values: [],
	}));
	const filters = FILTER_SPECS.filter((spec) => spec.language !== "strip").map((spec): HelpEntry => ({
		id: `collections-${spec.name}`,
		forms: filterForms(spec),
		summary: summary(spec),
		notes: [...kindsNote(spec), ...(COLLECTION_NOTES[spec.name] ?? [])],
		values: collectionValues(spec),
	}));
	return [...has, ...filters];
}

/** The operators that go up from a strip to a collection, as `@in ( … )`, `@during ( … )` and the rest write them. */
function upward(): string {
	const names = CROSSING_SPECS.filter((spec) => spec.from === "strip" && spec.to === "collection").map(
		(spec) => `\`@${spec.name} ( … )\``,
	);
	return names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names.join("");
}

function operatorForm(name: OperatorSpec["name"]): HelpForm {
	return { syntax: `@${name}`, hint: operatorSpec(name).hint };
}

const OPERATORS: HelpEntry[] = [
	{
		id: "operators-not",
		forms: [operatorForm("not")],
		notes: ["`@not a b` is b without a, and `@not (a b)` is anything without both."],
		values: [],
	},
	{
		id: "operators-or",
		forms: [operatorForm("or")],
		notes: ["It holds tighter than a space: `a @or b c` is `(a @or b) c`."],
		values: [],
	},
	{
		id: "operators-and",
		forms: [operatorForm("and")],
		notes: [
			`Side by side already means both, except for a filter repeated where a strip can only have one value — two years mean either year. \`@and\` means both even then, so \`@year:${YEAR} @and @year:${NEXT_YEAR}\` finds nothing.`,
		],
		values: [],
	},
	{
		id: "operators-group",
		forms: [{ syntax: "( … )", hint: "One group, to the operators around it" }],
		notes: ["A parenthesis left open closes at the end.", "`[ … ]` and `{ … }` group too."],
		values: [],
	},
	{
		id: "operators-only",
		forms: [operatorForm("only")],
		notes: [
			`Before \`@in\`, \`@has\` and their kind, it asks for every one to match rather than just one: \`@in @i:own\` is a strip in a book you own, and \`@only @in @i:own\` a strip printed only in books you own.${PAGE_CONFIG.reruns ? " Before `@reran`, every day the strip ran again." : ""}`,
		],
		values: [],
	},
];

/** The page, section by section. */
export function helpSections(): HelpSection[] {
	const collections = collectionsTabs().length > 0;
	return [
		{
			id: "words",
			title: "Words",
			intro: [
				"Type words to search what the strips say. The strips that say them best come first, and a line remembered not quite right still finds its strip.",
				'Quotation marks ask for exact words: `"exact words"` is those words, side by side and in that order. Everything inside is text, never a filter or a date.',
				`Typing a date finds the strips from it too: \`august 3 ${YEAR}\` for a day, \`august ${YEAR}\` for a month, or \`${YEAR}\` for a year.`,
			],
			entries: [],
		},
		{
			id: "strips",
			title: "Filtering strips",
			intro: [
				`${collections ? "What the main search box takes, and what goes inside `@has ( … )`" : "What the search box takes"}${PAGE_CONFIG.reruns ? ", `@reran ( … )` and `@reuses ( … )`" : ""}. A filter's value follows its colon, with no spaces.`,
			],
			entries: stripEntries(),
		},
		...(collections
			? [
					{
						id: "collections",
						title: "Filtering collections",
						intro: [
							`What the Collections page's box takes, where the tab says which kind of collection it finds, and what goes inside ${upward()}. A collection's own words are its name, its description and, for an arc, the words of its strips.`,
						],
						entries: collectionEntries(),
					},
				]
			: []),
		{
			id: "operators",
			title: "Combining",
			intro: ["Words and filters side by side narrow each other. These say otherwise."],
			entries: OPERATORS,
		},
	];
}

/** Where a query is written, by the tab it is for: the main search, or one tab's box. */
function contextFor(tab: CollectionsTab | undefined): QueryContext {
	return tab === undefined ? STRIP_QUERY : collectionQuery(TAB_TYPES[tab]);
}

/**
 * Whether a query is one this site can run as written: nothing in it red, and no `@name` it does not
 * have. The parser reads an unknown name as words — `@about:snowmen` on a site without subjects is
 * a search for "about snowmen" — which is right for a reader's typo and wrong for an example.
 */
export function runs(query: string, context: QueryContext): boolean {
	const quotes = quotedSpans(query);
	for (const match of query.matchAll(/@([a-zA-Z]+)/g)) {
		const name = match[1].toLowerCase();
		if (!quoted(quotes, match.index) && !FILTER_NAMES.has(name) && !OPERATOR_WORDS.has(name)) return false;
	}
	return filterSpans(query, null, context).every((span: FilterSpan) => span.kind !== "invalid");
}

/**
 * The examples `config.yaml` gives, each with the address that searches it. One about a tab the site
 * does not have, or asking for a filter it has turned off, is left out, as a suggestion would be.
 */
export function helpExamples(): HelpExample[] {
	const tabs = collectionsTabs();
	return PAGE_CONFIG.examples
		.filter((example) => example.tab === undefined || tabs.includes(example.tab))
		.filter((example) => runs(example.query, contextFor(example.tab)))
		.map((example) => ({
			question: example.question,
			query: example.query,
			spans: filterSpans(example.query, null, contextFor(example.tab)),
			path: example.tab === undefined ? buildSearchPath(example.query) : buildTabPath(example.tab, example.query),
		}));
}

/** Every entry's anchor, read once: the sections are the same for as long as the page is open. */
let anchors: ReadonlySet<string> | null = null;

/**
 * Where on the page to send a reader from a search box: the entry for the filter the caret is in,
 * where the page has one, or else the section for the language the caret is writing.
 */
export function helpAnchor(language: Language, name?: string): string {
	anchors ??= new Set(helpSections().flatMap((section) => section.entries.map((entry) => entry.id)));
	const section = language === "strip" ? "strips" : "collections";
	if (name !== undefined && anchors.has(`${section}-${name}`)) return `${section}-${name}`;
	// A link filter is written in either language, and explained once, with the collections.
	if (name !== undefined && anchors.has(`collections-${name}`)) return `collections-${name}`;
	return section === "collections" && collectionsTabs().length === 0 ? "strips" : section;
}
