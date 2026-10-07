import { Appearance, Character, Comic } from "../types";
import { escHtml } from "../utils";
import { dateToCompact, formatLongDate, weekdayOf } from "../date-utils";
import { buildArcPath, buildCollectionPath, buildComicPath, buildSearchPath } from "../routes";
import { addressOf } from "../base-path";
import { BookNeighbours, DetailArc, DetailCollection, DetailPage, PageSource, arcRange } from "./page";
import { buildBackAndHomeButtons } from "./nav-buttons";
import { PAGE_CONFIG } from "../site-config";
import { StripLinkSubject, stripLinks } from "../strip-links";

export function getAdjacentComicDate(
	source: PageSource,
	date: string,
	direction: -1 | 1,
	jump: number = 1,
): string | null {
	const allDays = source.allDays;
	const currentIndex = allDays.findIndex((d) => d.date === date);
	if (currentIndex === -1) return null;

	let i = currentIndex + direction * jump;
	while (i >= 0 && i < allDays.length) {
		const candidate = allDays[i];
		if (candidate.state === "has-comic" && source.comicsByDate.has(candidate.date)) {
			return candidate.date;
		}
		i += direction;
	}
	return null;
}

export function getSameDayComicDate(source: PageSource, date: string, direction: -1 | 1): string | null {
	const allDays = source.allDays;
	const currentIndex = allDays.findIndex((d) => d.date === date);
	if (currentIndex === -1) return null;

	const targetDayOfWeek = allDays[currentIndex].dayOfWeek;

	let i = currentIndex + direction;
	while (i >= 0 && i < allDays.length) {
		const candidate = allDays[i];
		if (
			candidate.dayOfWeek === targetDayOfWeek &&
			candidate.state === "has-comic" &&
			source.comicsByDate.has(candidate.date)
		) {
			return candidate.date;
		}
		i += direction;
	}
	return null;
}

function comicKey(comic: Comic): string {
	return comic.id || dateToCompact(comic.date);
}

/** The descriptions for these strips alone, keyed as `getDescription` keys them. */
export function descriptionsFor(descriptions: Map<string, string>, comics: Comic[]): Record<string, string> {
	const subset: Record<string, string> = {};
	for (const comic of comics) {
		const key = comic.id || comic.date;
		const description = descriptions.get(key);
		if (description !== undefined) subset[key] = description;
	}
	return subset;
}

export function summarizeCollections(source: PageSource, comics: Comic[]): DetailCollection[] {
	if (!source.collectionsById) return [];
	const keys = comics.map(comicKey);
	const summaries = new Map<string, DetailCollection>();
	for (const comic of comics) {
		for (const appearance of comic.appearances || []) {
			const collection = source.collectionsById.get(appearance.collection);
			if (!collection || summaries.has(collection.id)) continue;
			const alterations: Record<string, string> = {};
			for (const key of keys) {
				const alteration = collection.alterations && collection.alterations[key];
				if (alteration) alterations[key] = alteration;
			}
			summaries.set(collection.id, {
				id: collection.id,
				name: collection.name,
				pub_year: collection.pub_year,
				image: collection.image,
				colour: collection.colour,
				...(collection.aspectRatio !== undefined ? { aspectRatio: collection.aspectRatio } : {}),
				...(collection.editions ? { editions: collection.editions } : {}),
				alterations,
			});
		}
	}
	return [...summaries.values()];
}

/** One row of "Printed in": a strip in a book, or in one edition of a book that has editions. */
function printingKey(comic: Comic, appearance: Pick<Appearance, "collection" | "edition">): string {
	return `${comicKey(comic)} ${appearance.collection} ${appearance.edition ?? ""}`;
}

interface BookOrder {
	/** Every printing in the book, in reading order. */
	dates: string[];
	indexByComic: Map<string, number>;
}

/**
 * Each book's (or edition's) strips in the order a reader meets them: by volume, then page. Strips
 * sharing a page go by date, which is the order the books lay them out in. Built once per archive,
 * since every strip's page asks of the same one.
 */
const bookOrders = new WeakMap<Map<string, Comic[]>, Map<string, BookOrder>>();

function getBookOrders(comicsByDate: Map<string, Comic[]>): Map<string, BookOrder> {
	const cached = bookOrders.get(comicsByDate);
	if (cached) return cached;

	const entriesByBook = new Map<string, { comic: Comic; volume: number; page: number }[]>();
	for (const comics of comicsByDate.values()) {
		for (const comic of comics) {
			for (const appearance of comic.appearances || []) {
				const book = `${appearance.collection} ${appearance.edition ?? ""}`;
				if (!entriesByBook.has(book)) entriesByBook.set(book, []);
				entriesByBook.get(book)!.push({ comic, volume: appearance.volume ?? 0, page: appearance.pages[0] ?? 0 });
			}
		}
	}

	const orders = new Map<string, BookOrder>();
	for (const [book, entries] of entriesByBook) {
		entries.sort(
			(a, b) =>
				a.volume - b.volume ||
				a.page - b.page ||
				a.comic.date.localeCompare(b.comic.date) ||
				comicKey(a.comic).localeCompare(comicKey(b.comic)),
		);
		orders.set(book, {
			dates: entries.map((entry) => entry.comic.date),
			indexByComic: new Map(entries.map((entry, index) => [comicKey(entry.comic), index])),
		});
	}
	bookOrders.set(comicsByDate, orders);
	return orders;
}

/** The nearest strip in `dates` from `index` that is on another day — a day's page shows all of its strips. */
function stepToOtherDay(dates: string[], index: number, direction: -1 | 1): string | null {
	for (let i = index + direction; i >= 0 && i < dates.length; i += direction) {
		if (dates[i] !== dates[index]) return dates[i];
	}
	return null;
}

function findBookNeighbours(source: PageSource, comics: Comic[]): Record<string, BookNeighbours> {
	const orders = getBookOrders(source.comicsByDate);
	const neighbours: Record<string, BookNeighbours> = {};
	for (const comic of comics) {
		for (const appearance of comic.appearances || []) {
			const key = printingKey(comic, appearance);
			if (neighbours[key]) continue;
			const order = orders.get(`${appearance.collection} ${appearance.edition ?? ""}`);
			const index = order?.indexByComic.get(comicKey(comic));
			if (!order || index === undefined) continue;
			neighbours[key] = {
				prev: stepToOtherDay(order.dates, index, -1),
				next: stepToOtherDay(order.dates, index, 1),
			};
		}
	}
	return neighbours;
}

const rerunsByOriginal = new WeakMap<Map<string, string>, Map<string, string[]>>();

/** The original day and every rerun of it, in order. */
function findRuns(source: PageSource, originalDate: string): string[] {
	let byOriginal = rerunsByOriginal.get(source.reruns);
	if (!byOriginal) {
		byOriginal = new Map();
		for (const [rerun, original] of source.reruns) {
			byOriginal.set(original, [...(byOriginal.get(original) ?? []), rerun]);
		}
		rerunsByOriginal.set(source.reruns, byOriginal);
	}
	return [originalDate, ...(byOriginal.get(originalDate) ?? []).sort()];
}

/**
 * The arcs of the day's own strip — not a special's, which is never in one. On a rerun day that is
 * the strip shown, so the widget follows it back to the dates it first ran on.
 */
function arcsOf(source: PageSource, comics: Comic[]): DetailArc[] {
	const daily = comics.find((comic) => !comic.id);
	return (daily?.arcs ?? []).flatMap((id) => {
		const arc = source.arcsById?.get(id);
		return arc ? [{ id: arc.id, description: arc.description, dates: arc.dates }] : [];
	});
}

/** The characters the page's strips feature, each once, in the order `characters.yaml` lists them. */
function charactersOf(source: PageSource, comics: Comic[]): Character[] {
	const featured = new Set(comics.flatMap((comic) => comic.characters ?? []));
	return [...source.charactersById.values()].filter((character) => featured.has(character.id));
}

/** The page for a date, from whatever holds the archive — the app's state or the build's data. */
export function detailPageFrom(source: PageSource, date: string, alternates: string[] = []): DetailPage {
	const rerunOf = source.reruns.get(date) ?? null;
	// A rerun day holds no strip of its own; it shows the one that ran again, from the original day.
	const comics = source.comicsByDate.get(date) ?? (rerunOf ? (source.comicsByDate.get(rerunOf) ?? []) : []);
	return {
		view: "detail",
		date,
		alternates,
		comics,
		rerunOf,
		prevDate: getAdjacentComicDate(source, date, -1),
		nextDate: getAdjacentComicDate(source, date, 1),
		runs: comics.length > 0 ? findRuns(source, rerunOf ?? date) : [],
		bookNeighbours: findBookNeighbours(source, comics),
		collections: summarizeCollections(source, comics),
		descriptions: source.descriptions ? descriptionsFor(source.descriptions, comics) : null,
		arcs: arcsOf(source, comics),
		characters: charactersOf(source, comics),
	};
}

/**
 * `p. 22` or `pp. 22–24, 26` — or, `spelled`, `page 22` and `pages 22–24, 26`, where there is room for words.
 * Each run of consecutive pages is collapsed into a range.
 */
function formatPages(pages: number[], spelled: boolean = false): string {
	if (pages.length === 0) return "";
	if (pages.length === 1) return `${spelled ? "page" : "p."} ${pages[0]}`;
	const runs: [number, number][] = [];
	for (const page of [...pages].sort((a, b) => a - b)) {
		const last = runs[runs.length - 1];
		if (last && page === last[1] + 1) last[1] = page;
		else runs.push([page, page]);
	}
	const ranges = runs.map(([first, last]) => (first === last ? `${first}` : `${first}–${last}`));
	return `${spelled ? "pages" : "pp."} ${ranges.join(", ")}`;
}

function shortenEditionLabel(label: string): string {
	return label.replace(/\s*\(.*\)\s*$/, "");
}

/** A book the strip is in, or one edition of it — each edition has its own pages, so its own row. */
interface Printing {
	key: string;
	collection: DetailCollection;
	edition?: string;
	name: string;
	year: number;
	image: string;
	/** The cover's width over its height, where the build knows it. */
	aspectRatio?: number;
	/** Where the strip is, one per volume it is in: the volume, when the book has them, and the pages. */
	places: { volume?: number; pages: number[] }[];
}

function buildPrintings(
	appearances: Appearance[],
	collectionsById: Map<string, DetailCollection>,
	keyOf: (appearance: Appearance) => string,
): Printing[] {
	const printingsByKey = new Map<string, Printing>();

	for (const appearance of appearances) {
		const collection = collectionsById.get(appearance.collection);
		if (!collection) continue;

		const key = keyOf(appearance);
		let printing = printingsByKey.get(key);
		if (!printing) {
			const edition = appearance.edition ? collection.editions?.[appearance.edition] : undefined;
			printing = {
				key,
				collection,
				edition: appearance.edition,
				name: appearance.edition
					? `${collection.name}, ${shortenEditionLabel(edition?.label ?? appearance.edition)}`
					: collection.name,
				year: edition?.pub_year ?? collection.pub_year,
				image: edition?.image ?? collection.image,
				// An edition's own cover has its own shape, known or not.
				aspectRatio: edition?.image ? edition.aspectRatio : collection.aspectRatio,
				places: [],
			};
			printingsByKey.set(key, printing);
		}

		const { volume, pages } = appearance;
		printing.places.push(volume ? { volume, pages } : { pages });
	}

	return [...printingsByKey.values()];
}

const BOOK_ICON = `<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2zM22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

function buildBookArrowHtml(date: string | null, direction: -1 | 1): string {
	const arrow = direction === -1 ? "&larr;" : "&rarr;";
	const title = direction === -1 ? "Previous strip in this book" : "Next strip in this book";
	return date
		? `<a class="nav-btn book__arrow" href="${addressOf(buildComicPath(date))}" data-date="${date}" title="${title}" aria-label="${title}">${arrow}</a>`
		: `<span class="nav-btn nav-btn--disabled book__arrow" title="${direction === -1 ? "First" : "Last"} strip in this book">${arrow}</span>`;
}

/** The badge on a cover whose printing of the strip was altered: an asterisk, which says what it means when hovered. */
const ALTERATION_BADGE = `<span class="collection-book__badge"><svg viewBox="0 0 10 10" aria-hidden="true"><path d="M5 1v8M1.54 3l6.92 4M1.54 7l6.92-4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg><span class="collection-book__badge-label">Altered</span></span>`;

/**
 * One book the strip is in, as a cover that can be selected. The cover over the volume and page the
 * strip is on is all the row shows. Selected, it opens a popup above it with the book's name, the
 * way to its page, and arrows through its strips: the `<template>` is what the view fills the popup
 * with, inert until then.
 *
 * `neighbours` is `null` where there is no one strip to step from, as on an arc's page. `data-book`
 * is the book and edition, which the view reads to keep a book selected from one strip to the next.
 */
function buildBookHtml(
	printing: Printing,
	neighbours: BookNeighbours | undefined | null,
	alterationKey: string,
	isSunday: boolean,
): string {
	const { collection } = printing;
	const isBlackAndWhite = PAGE_CONFIG.colourSundays && isSunday && !collection.colour;
	const alteration = collection.alterations && collection.alterations[alterationKey];
	// The cover's ratio holds the space until it loads.
	const ratio = printing.aspectRatio ? ` style="aspect-ratio: ${printing.aspectRatio}"` : "";
	// One short line for the label under the cover: `Bk 1 · p. 357`, the volume shortened to fit. An
	// arc's label names only the page its first strip is on; the popup has the rest.
	const places =
		neighbours === null
			? printing.places.slice(0, 1).map((place) => ({ ...place, pages: place.pages.slice(0, 1) }))
			: printing.places;
	const caption = places
		.map((place) => (place.volume ? `Bk ${place.volume} · ${formatPages(place.pages)}` : formatPages(place.pages)))
		.join(", ");
	// The popup has room for the words: `Book 1, page 357`.
	const where = printing.places.map((place) =>
		place.volume ? `Book ${place.volume}, ${formatPages(place.pages, true)}` : formatPages(place.pages, true),
	);
	// Black and white is about the page the strip is on, so it goes on that line; an alteration gets its own.
	const colour = isBlackAndWhite ? " · Black & white" : "";
	const notes = alteration ? [`Altered · ${alteration}`] : [];
	const book = `${collection.id} ${printing.edition ?? ""}`;

	const href = escHtml(addressOf(buildCollectionPath(collection.id)));
	// A link to the book's page, which a mouse follows; a tap opens the popup instead — see `attachBookHandlers`.
	const cover = `<a class="book__cover" href="${href}" aria-haspopup="dialog" aria-expanded="false" data-collection-id="${escHtml(collection.id)}" aria-label="${escHtml(printing.name)}"><span class="collection-entry"><span class="collection-book${isBlackAndWhite ? " collection-book--bw" : ""}"${ratio}><img src="${escHtml(printing.image)}" alt="" onload="this.parentElement.style.aspectRatio='auto'" onerror="this.parentElement.style.aspectRatio='auto'" />${alteration ? ALTERATION_BADGE : ""}</span><span class="collection-pages">${caption}</span></span></a>`;

	// The way to the book's page sits between the arrows through it — alone, where there are none.
	const goTo = `<a class="nav-btn book__go" href="${href}" data-collection-id="${escHtml(collection.id)}" title="Go to this book" aria-label="Go to this book">${BOOK_ICON}</a>`;
	const nav =
		neighbours === null
			? `<span class="book__nav">${goTo}</span>`
			: `<span class="book__nav">${buildBookArrowHtml(neighbours?.prev ?? null, -1)}${goTo}${buildBookArrowHtml(neighbours?.next ?? null, 1)}</span>`;
	const card = `<template class="book__card">
		<div class="book__text">
			<a class="book__name" href="${href}" data-collection-id="${escHtml(collection.id)}">${escHtml(printing.name)}</a> <span class="book__year">${printing.year}</span>
			<span class="book__line">${escHtml(where.join("; ") + colour)}</span>
			${notes.map((note) => `<span class="book__line book__note">${escHtml(note)}</span>`).join("")}
		</div>
		${nav}
	</template>`;

	return `<div class="book" data-book="${escHtml(book)}">${cover}${card}</div>`;
}

/**
 * The books a strip is in: a row of covers, any one of which opens a popup with the rest.
 * `neighbours` is by printing key, or `null` where there are no arrows, as on an arc's page.
 */
function buildPrintingsSectionHtml(
	printings: Printing[],
	neighbours: Record<string, BookNeighbours> | null,
	alterationKey: string,
	isSunday: boolean,
): string {
	const heading = `<p class="detail-collections-heading">Collected in</p>`;
	if (printings.length === 0) {
		return `${heading}<p class="printings__empty">Not reprinted in any book</p>`;
	}

	const books = printings
		.map((printing) => buildBookHtml(printing, neighbours && neighbours[printing.key], alterationKey, isSunday))
		.join("");
	return `${heading}<div class="detail-collections">${books}</div>`;
}

/** The books an arc is in, from the appearances its page gathers: one row per book and edition. */
export function buildAppearancesSectionHtml(
	appearances: Appearance[],
	collectionsById: Map<string, DetailCollection>,
	alterationKey: string,
	isSunday: boolean,
): string {
	const printings = buildPrintings(
		appearances,
		collectionsById,
		(appearance) => `${appearance.collection} ${appearance.edition ?? ""}`,
	);
	return buildPrintingsSectionHtml(printings, null, alterationKey, isSunday);
}

function describeImage(description: string | undefined, dateFormatted: string): string {
	return description ? description : `Comic from ${dateFormatted}`;
}

export function getPageDescription(page: DetailPage, comic: Comic): string | undefined {
	return page.descriptions?.[comic.id || comic.date];
}

export function buildDescriptionSlotContents(comic: Comic, description: string | undefined, resolved: boolean): string {
	if (comic.image) return "";
	if (!resolved) {
		return `<div class="detail-description-skeleton"><span></span><span></span><span></span></div>`;
	}
	if (!description) return "";
	return `<p class="detail-description">${escHtml(description)}</p>`;
}

function buildTranscriptHtml(comic: Comic, date: string, alternates: string[]): string {
	const hasAlternate = Boolean(comic.alternate);
	const toggleId = `alternate-toggle-${date}-${comic.id || "daily"}`;
	const isAlternate = alternates.includes(dateToCompact(date));
	const label = hasAlternate
		? `<p class="detail-transcript-label"><span class="detail-transcript-label__title">Transcript</span> <span class="detail-transcript-toggle"><span aria-hidden="true">&middot;</span><span class="detail-transcript-toggle__original">Original</span><input id="${escHtml(toggleId)}" type="checkbox" aria-label="Show alternate transcript"${isAlternate ? " checked" : ""} /><span class="detail-transcript-toggle__alternate">Alternate</span></span></p>`
		: `<p class="detail-transcript-label"><span class="detail-transcript-label__title">Transcript</span></p>`;
	const original = comic.transcript
		? `<div class="detail-transcript detail-transcript--original">${escHtml(comic.transcript)}</div>`
		: `<div class="detail-transcript detail-transcript--original"><em>No text</em></div>`;
	const alternate = hasAlternate
		? `<div class="detail-transcript detail-transcript--alternate">${escHtml(comic.alternate!)}</div>`
		: "";
	return `<div class="detail-transcript-wrap">${label}<div class="detail-transcript-content">${original}${alternate}</div></div>`;
}

export function describeImageFor(page: DetailPage, comic: Comic): string {
	return describeImage(getPageDescription(page, comic), formatLongDate(page.date));
}

const LINK_ICON_SVG = `<svg class="detail-read-icon" viewBox="0 0 24 24" width="14" height="14"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

/** Which of `config.yaml`'s link templates a strip on this page takes, and what fills them in. */
function linkSubject(page: DetailPage, comic: Comic): StripLinkSubject {
	if (comic.id) return { kind: "special", id: comic.id, date: comic.date };
	if (page.rerunOf) return { kind: "rerun", original: page.rerunOf, rerun: page.date };
	return { kind: "daily", date: page.date };
}

/** The strip's Read and License links, as `config.yaml` writes them; nothing when it writes neither. */
function buildStripLinksHtml(page: DetailPage, comic: Comic): string {
	const subject = linkSubject(page, comic);
	const links = stripLinks(PAGE_CONFIG.details[subject.kind], subject);
	if (links.length === 0) return "";
	const anchors = links
		.map(
			({ label, href }) =>
				`<a class="detail-read-link" href="${escHtml(href)}" target="_blank" rel="noopener">${label} ${LINK_ICON_SVG}</a>`,
		)
		.join("");
	return `<div class="detail-links">${anchors}</div>`;
}

function buildComicBodiesHtml(page: DetailPage, date: string, dateFormatted: string, isSunday: boolean): string {
	const { comics, alternates } = page;
	const collectionsById = new Map(page.collections.map((collection) => [collection.id, collection]));
	const descriptionsResolved = page.descriptions !== null;

	let bodies = "";
	for (const comic of comics) {
		const description = getPageDescription(page, comic);

		const transcriptHtml = buildTranscriptHtml(comic, date, alternates);

		const readLinkHtml = buildStripLinksHtml(page, comic);

		// The image's ratio holds the space until it loads.
		const ratio = comic.aspectRatio ? ` style="aspect-ratio: ${comic.aspectRatio}"` : "";
		const illustratedClass = comic.image ? " detail-comic--illustrated" : "";
		const runsHtml = buildRunsHtml(page, date, comic);
		const collectionsHtml = buildPrintingsSectionHtml(
			buildPrintings(comic.appearances || [], collectionsById, (appearance) => printingKey(comic, appearance)),
			page.bookNeighbours,
			comicKey(comic),
			isSunday,
		);

		bodies += `<div class="detail-comic${illustratedClass}" data-comic-key="${escHtml(comic.id || date)}">
				${comic.image ? `<div class="detail-image-wrapper"${ratio}><div class="detail-image-pulse"></div><img class="detail-image" src="${escHtml(comic.image)}" alt="${escHtml(describeImage(description, dateFormatted))}" loading="lazy" onload="this.previousElementSibling.classList.add('loaded');this.parentElement.style.aspectRatio='auto'" onerror="this.previousElementSibling.style.display='none';this.style.display='none';this.parentElement.style.aspectRatio='auto'" /></div>` : ``}
			<div class="detail-description-slot">${buildDescriptionSlotContents(comic, description, descriptionsResolved)}</div>
			${transcriptHtml}
			${readLinkHtml}
			${runsHtml}
			<div class="detail-collections-slot">${collectionsHtml}</div>
		</div>`;
	}

	return bodies;
}

/** A link to another day's strip. `data-date` is what the view reads to light up its cell in the grid while hovered. */
function buildRerunLinkHtml(date: string): string {
	return `<a class="detail-rerun-link" href="${addressOf(buildComicPath(date))}" data-date="${date}">${formatLongDate(date)}</a>`;
}

function joinRerunLinks(dates: string[]): string {
	return dates.map(buildRerunLinkHtml).join(" and ");
}

/**
 * One step along an arc, boxed like the header's arrows but at the end of the arc's own line, which
 * says what they step through. An end of the arc keeps its arrow, disabled, so neither one moves.
 */
function buildArcStepHtml(date: string | undefined, direction: "prev" | "next"): string {
	const arrow = direction === "prev" ? "&larr;" : "&rarr;";
	if (!date) {
		return `<span class="nav-btn nav-btn--disabled" title="${direction === "prev" ? "First" : "Last"} strip in this arc">${arrow}</span>`;
	}
	const label = direction === "prev" ? "Previous strip in this arc" : "Next strip in this arc";
	return `<a class="nav-btn detail-arc-step" href="${addressOf(buildComicPath(date))}" data-date="${date}" title="${label}" aria-label="${label}">${arrow}</a>`;
}

/**
 * `Part 2 of 4 in the Nov 18–19, 1985 arc`, with its arrows at the end of the line. The range is the
 * way to the arc's page; `data-arc-id` is what the view reads to light up the whole arc while it is
 * hovered, and its title is the arc's description.
 */
function buildArcLineHtml(arc: DetailArc, date: string): string {
	const index = arc.dates.indexOf(date);
	const link = `<a class="detail-rerun-link detail-arc-link" href="${escHtml(addressOf(buildArcPath(arc.id)))}" data-arc-id="${escHtml(arc.id)}" title="${escHtml(arc.description)}">${escHtml(arcRange(arc))}</a>`;
	const steps = buildArcStepHtml(arc.dates[index - 1], "prev") + buildArcStepHtml(arc.dates[index + 1], "next");
	return `<li class="detail-run detail-arc"><span class="detail-arc__text">Part ${index + 1} of ${arc.dates.length} in the ${link} arc</span><span class="detail-arc__nav">${steps}</span></li>`;
}

/** A rerun day shows the strip it reran, so this sits above it as a note of where it's from. */
function buildRerunBannerHtml(originalDate: string): string {
	return `<p class="detail-rerun-banner">Originally ran ${buildRerunLinkHtml(originalDate)}</p>`;
}

/**
 * `Featuring Calvin, Hobbes and Dad`, in the order `characters.yaml` lists them. Each name is a search
 * for every strip featuring them, oldest first, since a search that is only a filter has nothing to
 * rank by.
 */
function buildFeaturingLineHtml(page: DetailPage, comic: Comic): string {
	const links = page.characters
		.filter((character) => comic.characters?.includes(character.id))
		.map(
			(character) =>
				`<a class="detail-rerun-link" href="${escHtml(addressOf(buildSearchPath(`@featuring:${character.id}`, "date")))}">${escHtml(character.name)}</a>`,
		);
	if (links.length === 0) return "";
	const names = links.length > 1 ? `${links.slice(0, -1).join(", ")} and ${links[links.length - 1]}` : links[0];
	return `<li class="detail-run">Featuring ${names}</li>`;
}

/**
 * Who the strip features, the arcs it is part of, and when else the paper ran it on an original day,
 * together under the strip. Only the day's own strip ran in the paper, so a special has only the
 * first: it never reran, and is in no arc. A rerun day's reruns are empty; where its strip is from is
 * said above it instead.
 */
function buildRunsHtml(page: DetailPage, date: string, comic: Comic): string {
	const featuring = buildFeaturingLineHtml(page, comic);
	if (comic.id) return featuring ? `<ul class="detail-runs">${featuring}</ul>` : "";
	const reruns = page.rerunOf ? [] : page.runs.slice(1);
	const rerun = reruns.length > 0 ? `<li class="detail-run">Reran ${joinRerunLinks(reruns)}</li>` : "";
	const lines = featuring + page.arcs.map((arc) => buildArcLineHtml(arc, date)).join("") + rerun;
	return lines ? `<ul class="detail-runs">${lines}</ul>` : "";
}

export function buildDetailHtml(page: DetailPage, canGoBack: boolean): string {
	const { date, comics, prevDate, nextDate, rerunOf } = page;
	const dateFormatted = formatLongDate(date);
	const isSunday = weekdayOf(date) === 0;
	// A rerun's strip is drawn as of the day it originally ran — its own weekday, its own description.
	const contentDate = rerunOf ?? date;
	const contentDateFormatted = rerunOf ? formatLongDate(contentDate) : dateFormatted;
	const contentIsSunday = rerunOf ? weekdayOf(contentDate) === 0 : isSunday;

	const prevButtonHtml = prevDate
		? `<a class="nav-btn" id="nav-prev" href="${addressOf(buildComicPath(prevDate))}" data-date="${prevDate}" title="Previous comic">&larr;</a>`
		: `<span class="nav-btn nav-btn--disabled" title="First comic">&larr;</span>`;
	const nextButtonHtml = nextDate
		? `<a class="nav-btn" id="nav-next" href="${addressOf(buildComicPath(nextDate))}" data-date="${nextDate}" title="Next comic">&rarr;</a>`
		: `<span class="nav-btn nav-btn--disabled" title="Last comic">&rarr;</span>`;

	const headerHtml = `<div class="detail-container">
		${buildBackAndHomeButtons(canGoBack)}
		<h2 class="detail-date">${dateFormatted}</h2>
		<div class="detail-actions">
			<button class="copy-link-btn" id="copy-link-btn" data-href="${addressOf(buildComicPath(date))}">Copy link</button><button class="bookmark-btn" id="bookmark-btn" data-date="${date}" title="Bookmark"><svg class="bookmark-icon" viewBox="0 0 24 24"><path d="M17 3H7a2 2 0 0 0-2 2v16l7-4 7 4V5a2 2 0 0 0-2-2z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg></button> ${prevButtonHtml} ${nextButtonHtml}
		</div>`;

	const rerunBannerHtml = rerunOf ? buildRerunBannerHtml(rerunOf) : "";
	const bodyHtml =
		comics.length === 0
			? `<p class="detail-missing">No comics found</p>`
			: buildComicBodiesHtml(page, contentDate, contentDateFormatted, contentIsSunday);

	return `${headerHtml}
		${rerunBannerHtml}
		${bodyHtml}
	</div>`;
}
