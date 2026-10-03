import { Appearance, Comic } from "../types";
import { escHtml } from "../utils";
import { dateToCompact, formatLongDate, weekdayOf } from "../date-utils";
import { buildArcPath, buildCollectionPath, buildComicPath } from "../routes";
import { addressOf } from "../base-path";
import { BookNeighbours, DetailArc, DetailCollection, DetailPage, PageSource, arcRange } from "./page";
import { buildBackAndHomeButtons } from "./nav-buttons";

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
	};
}

function formatPages(pages: number[]): string {
	if (pages.length === 0) return "";
	if (pages.length === 1) return `p. ${pages[0]}`;
	const isContiguous = pages.every((page, index) => index === 0 || page === pages[index - 1] + 1);
	return `pp. ${isContiguous ? `${pages[0]}–${pages[pages.length - 1]}` : pages.join(", ")}`;
}

function shortenEditionLabel(label: string): string {
	return label.replace(/\s*\(.*\)\s*$/, "");
}

/** A book the strip is in, or one edition of it — each edition has its own pages, so its own row. */
interface Printing {
	key: string;
	collection: DetailCollection;
	name: string;
	year: number;
	image: string;
	/** Where the strip is, one per volume it is in: `Book 1` (when the book has volumes) and `p. 22`. */
	places: { volume?: string; pages: string }[];
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
				name: appearance.edition
					? `${collection.name}, ${shortenEditionLabel(edition?.label ?? appearance.edition)}`
					: collection.name,
				year: edition?.pub_year ?? collection.pub_year,
				image: edition?.image ?? collection.image,
				places: [],
			};
			printingsByKey.set(key, printing);
		}

		const pages = formatPages(appearance.pages);
		printing.places.push(appearance.volume ? { volume: `Book ${appearance.volume}`, pages } : { pages });
	}

	return [...printingsByKey.values()];
}

function buildBookArrowHtml(date: string | null, direction: -1 | 1): string {
	const arrow = direction === -1 ? "&larr;" : "&rarr;";
	const title = direction === -1 ? "Previous strip in this book" : "Next strip in this book";
	return date
		? `<a class="nav-btn printing__arrow" href="${addressOf(buildComicPath(date))}" data-date="${date}" title="${title}" aria-label="${title}">${arrow}</a>`
		: `<span class="nav-btn nav-btn--disabled printing__arrow" title="${direction === -1 ? "First" : "Last"} strip in this book">${arrow}</span>`;
}

/** A book's row in the list. `neighbours` is `null` where there is no one strip to step from, as on an arc's page. */
function buildPrintingRowHtml(
	printing: Printing,
	neighbours: BookNeighbours | undefined | null,
	alterationKey: string,
	isSunday: boolean,
): string {
	const { collection } = printing;
	const isBlackAndWhite = isSunday && !collection.colour;
	const alteration = collection.alterations && collection.alterations[alterationKey];
	const notes = [
		...(isBlackAndWhite ? ["black & white"] : []),
		...(alteration ? [`<span class="printing__alteration">${escHtml(alteration)}</span>`] : []),
	];
	const places = printing.places.map((place) => (place.volume ? `${place.volume}, ${place.pages}` : place.pages));
	const detail = [escHtml(places.join("; ")), ...notes].join(" &middot; ");

	return `<li class="printing">
		<a class="printing__book" href="${escHtml(addressOf(buildCollectionPath(collection.id)))}" data-collection-id="${escHtml(collection.id)}">
			<span class="printing__cover${isBlackAndWhite ? " printing__cover--bw" : ""}"><span class="printing__cover-image"><img src="${escHtml(printing.image)}" alt="" loading="lazy" />${alteration ? `<span class="collection-book__badge printing__badge">*</span>` : ""}</span></span>
			<span class="printing__text">
				<span class="printing__name">${escHtml(printing.name)} <span class="printing__year">${printing.year}</span></span>
				<span class="printing__detail">${detail}</span>
			</span>
		</a>
		${neighbours === null ? "" : `<span class="printing__nav">${buildBookArrowHtml(neighbours?.prev ?? null, -1)}${buildBookArrowHtml(neighbours?.next ?? null, 1)}</span>`}
	</li>`;
}

/** A book's cover, as the collapsed row shows it: the cover over the volume and page the strip is on. */
function buildCoverHtml(printing: Printing, alterationKey: string, isSunday: boolean): string {
	const { collection } = printing;
	const isBlackAndWhite = isSunday && !collection.colour;
	const alteration = collection.alterations && collection.alterations[alterationKey];
	const badge = alteration ? `<span class="collection-book__badge">*</span>` : "";
	// The collection's ratio holds the space until the cover loads; an edition's own cover may differ.
	const ratio =
		printing.image === collection.image && collection.aspectRatio
			? ` style="aspect-ratio: ${collection.aspectRatio}"`
			: "";
	// The volume and the page on lines of their own, since the two together are wider than a cover.
	const caption = printing.places
		.flatMap((place) => (place.volume ? [place.volume, place.pages] : [place.pages]))
		.map((line) => `<span class="collection-pages__line">${escHtml(line)}</span>`)
		.join("");

	return `<div class="collection-entry"><a class="collection-book${isBlackAndWhite ? " collection-book--bw" : ""}" href="${escHtml(addressOf(buildCollectionPath(collection.id)))}" data-collection-id="${escHtml(collection.id)}"${ratio}><img src="${escHtml(printing.image)}" alt="${escHtml(printing.name)}" onload="this.parentElement.style.aspectRatio='auto'" onerror="this.parentElement.style.aspectRatio='auto'" />${badge}</a><div class="collection-pages">${caption}</div></div>`;
}

/**
 * The books a strip is in: a row of covers, which is all most readers need, and folded under the
 * heading the same books as a list — named, dated, and each with arrows through its strips. The
 * heading folds as a book's page's sections do; open, the list stands in for the covers. Both are
 * drawn, so opening it needs no redraw.
 *
 * `neighbours` is by `printingKey`, or `null` where the list has no arrows, as on an arc's page.
 */
function buildPrintingsSectionHtml(
	printings: Printing[],
	neighbours: Record<string, BookNeighbours> | null,
	alterationKey: string,
	isSunday: boolean,
): string {
	if (printings.length === 0) {
		return `<p class="detail-collections-heading">Collected in</p><p class="printings__empty">Not reprinted in any book</p>`;
	}

	const covers = printings.map((printing) => buildCoverHtml(printing, alterationKey, isSunday)).join("");
	const rows = printings
		.map((printing) => buildPrintingRowHtml(printing, neighbours && neighbours[printing.key], alterationKey, isSunday))
		.join("");

	return `<details class="detail-collected"><summary class="detail-collections-heading">Collected in</summary><ul class="detail-printings">${rows}</ul></details><div class="detail-collections">${covers}</div>`;
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

function getAspectRatio(comic: Comic, isSunday: boolean): number {
	if (comic.aspectRatio) return comic.aspectRatio;
	return isSunday ? 1.427 : 3.098;
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

function buildComicBodiesHtml(page: DetailPage, date: string, dateFormatted: string, isSunday: boolean): string {
	const { comics, alternates } = page;
	const collectionsById = new Map(page.collections.map((collection) => [collection.id, collection]));
	const descriptionsResolved = page.descriptions !== null;

	let bodies = "";
	for (const comic of comics) {
		const description = getPageDescription(page, comic);

		const transcriptHtml = buildTranscriptHtml(comic, date, alternates);

		let readLinkHtml = "";
		if (!comic.id) {
			const [year, month, dayOfMonth] = date.split("-");
			const gocomicsUrl = `https://www.gocomics.com/calvinandhobbes/${year}/${month}/${dayOfMonth}`;
			const licensingUrl = `https://licensing.andrewsmcmeel.com/features/ch?date=${date}`;
			const linkIconSvg = `<svg class="detail-read-icon" viewBox="0 0 24 24" width="14" height="14"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
			readLinkHtml = `<div class="detail-links"><a class="detail-read-link" href="${escHtml(gocomicsUrl)}" target="_blank" rel="noopener">Read ${linkIconSvg}</a><a class="detail-read-link" href="${escHtml(licensingUrl)}" target="_blank" rel="noopener">License ${linkIconSvg}</a></div>`;
		}

		const aspectRatio = getAspectRatio(comic, isSunday);
		const illustratedClass = comic.image ? " detail-comic--illustrated" : "";
		// Only the day's own strip ran in the paper; a special never did, so never reran, and is in no arc.
		const runsHtml = !comic.id ? buildRunsHtml(page, date) : "";
		const collectionsHtml = buildPrintingsSectionHtml(
			buildPrintings(comic.appearances || [], collectionsById, (appearance) => printingKey(comic, appearance)),
			page.bookNeighbours,
			comicKey(comic),
			isSunday,
		);

		bodies += `<div class="detail-comic${illustratedClass}" data-comic-key="${escHtml(comic.id || date)}">
				${comic.image ? `<div class="detail-image-wrapper" style="aspect-ratio: ${aspectRatio}"><div class="detail-image-pulse"></div><img class="detail-image" src="${escHtml(comic.image)}" alt="${escHtml(describeImage(description, dateFormatted))}" loading="lazy" onload="this.previousElementSibling.classList.add('loaded');this.parentElement.style.aspectRatio='auto'" onerror="this.previousElementSibling.style.display='none';this.style.display='none';this.parentElement.style.aspectRatio='auto'" /></div>` : ``}
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
 * When else the paper ran the strip on an original day, and the arcs it is part of, together under
 * the strip. A rerun day's reruns are empty; where its strip is from is said above it instead.
 */
function buildRunsHtml(page: DetailPage, date: string): string {
	const reruns = page.rerunOf ? [] : page.runs.slice(1);
	const rerun = reruns.length > 0 ? `<li class="detail-run">Reran ${joinRerunLinks(reruns)}</li>` : "";
	const lines = rerun + page.arcs.map((arc) => buildArcLineHtml(arc, date)).join("");
	return lines ? `<ul class="detail-runs">${lines}</ul>` : "";
}

export function buildDetailHtml(page: DetailPage, canGoBack: boolean): string {
	const { date, comics, prevDate, nextDate, rerunOf } = page;
	const dateFormatted = formatLongDate(date);
	const isSunday = weekdayOf(date) === 0;
	// A rerun's strip is drawn as of the day it originally ran — its own weekday, its own read links.
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
