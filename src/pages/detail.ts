import { Appearance, Comic } from "../types";
import { escHtml } from "../utils";
import { dateToCompact, formatLongDate, weekdayOf } from "../date-utils";
import { buildArcPath, buildCollectionPath, buildComicPath } from "../routes";
import { addressOf } from "../base-path";
import { DetailArc, DetailCollection, DetailPage, PageSource, arcRange } from "./page";
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

const rerunsByOriginal = new WeakMap<Map<string, string>, Map<string, string[]>>();

/** Every rerun of the strip first run on `originalDate`, in order. Indexed once per archive. */
function findReruns(reruns: Map<string, string>, originalDate: string): string[] {
	let byOriginal = rerunsByOriginal.get(reruns);
	if (!byOriginal) {
		byOriginal = new Map();
		for (const [rerun, original] of reruns) byOriginal.set(original, [...(byOriginal.get(original) ?? []), rerun]);
		for (const dates of byOriginal.values()) dates.sort();
		rerunsByOriginal.set(reruns, byOriginal);
	}
	return byOriginal.get(originalDate) ?? [];
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
		reruns: rerunOf ? [] : findReruns(source.reruns, date),
		prevDate: getAdjacentComicDate(source, date, -1),
		nextDate: getAdjacentComicDate(source, date, 1),
		collections: summarizeCollections(source, comics),
		descriptions: source.descriptions ? descriptionsFor(source.descriptions, comics) : null,
		arcs: arcsOf(source, comics),
	};
}

function formatPages(pages: number[], long: boolean = false): string {
	if (pages.length === 0) return "";
	if (pages.length === 1) return long ? `Page ${pages[0]}` : `p. ${pages[0]}`;
	const isContiguous = pages.every((page, index) => index === 0 || page === pages[index - 1] + 1);
	const list = isContiguous ? `${pages[0]}–${pages[pages.length - 1]}` : pages.join(", ");
	return long ? `Pages ${list}` : `pp. ${list}`;
}

function shortenEditionLabel(label: string): string {
	return label.replace(/\s*\(.*\)\s*$/, "");
}

/** A book the strip is in, or one edition of it — each edition has its own cover, so its own entry. */
interface AppearanceEntry {
	collection: DetailCollection;
	edition?: string;
	image: string;
	captionLines: string[];
	tooltipLines: string[];
}

function buildAppearanceEntries(
	appearances: Appearance[],
	collectionsById: Map<string, DetailCollection>,
): AppearanceEntry[] {
	const entriesById = new Map<string, AppearanceEntry>();

	for (const appearance of appearances) {
		const collection = collectionsById.get(appearance.collection);
		if (!collection) continue;

		const key = `${appearance.collection} ${appearance.edition ?? ""}`;
		let entry = entriesById.get(key);
		if (!entry) {
			const image = (appearance.edition && collection.editions?.[appearance.edition]?.image) || collection.image;
			entry = { collection, edition: appearance.edition, image, captionLines: [], tooltipLines: [] };
			entriesById.set(key, entry);
		}

		if (appearance.edition) {
			const edition = collection.editions && collection.editions[appearance.edition];
			const fullLabel = edition ? edition.label : appearance.edition;
			const totalMatch = fullLabel.match(/\((\d+)/);
			const totalVolumes = totalMatch ? parseInt(totalMatch[1]) : 0;
			// The volume and the page on lines of their own, since the two together are wider than a cover.
			if (appearance.volume) entry.captionLines.push(`Book ${appearance.volume},`);
			entry.captionLines.push(formatPages(appearance.pages));
			entry.tooltipLines.push(
				`${shortenEditionLabel(fullLabel)}, Book ${appearance.volume} of ${totalVolumes}, ${formatPages(appearance.pages).replace("p.", "page")}`,
			);
		} else {
			entry.captionLines.push(formatPages(appearance.pages));
			entry.tooltipLines.push(formatPages(appearance.pages, true));
		}
	}

	return [...entriesById.values()];
}

function buildCoverBoxHtml(entry: AppearanceEntry, alterationKey: string, isSunday: boolean): string {
	const { collection } = entry;
	const isBlackAndWhite = isSunday && !collection.colour;
	const bwClass = isBlackAndWhite ? " collection-book--bw" : "";
	const alteration = collection.alterations && collection.alterations[alterationKey];
	const badge = alteration ? '<div class="collection-book__badge">*</div>' : "";
	// The collection's ratio holds the space until the cover loads; an edition's own cover may differ.
	const ratio = entry.image === collection.image ? ` style="aspect-ratio: ${collection.aspectRatio}"` : "";
	const edition = entry.edition ? ` data-edition="${escHtml(entry.edition)}"` : "";

	return `<a class="collection-book${bwClass}" href="${escHtml(addressOf(buildCollectionPath(collection.id)))}" data-collection-id="${escHtml(collection.id)}"${edition} data-bw="${isBlackAndWhite ? "1" : "0"}" data-alteration="${escHtml(alteration || "")}" data-pages="${escHtml(entry.tooltipLines.join("\n"))}"${ratio}><img src="${escHtml(entry.image)}" alt="${escHtml(collection.name)}" onload="this.parentElement.style.aspectRatio='auto'" onerror="this.parentElement.style.aspectRatio='auto'" />${badge}</a>`;
}

function wrapCollectionSection(inner: string): string {
	return `<p class="detail-collections-heading">Collected in</p>${inner}`;
}

export function buildAppearancesSectionHtml(
	appearances: Appearance[],
	collectionsById: Map<string, DetailCollection>,
	alterationKey: string,
	isSunday: boolean,
): string {
	const entries = buildAppearanceEntries(appearances, collectionsById);
	if (entries.length === 0) {
		return wrapCollectionSection(
			`<div class="detail-collections detail-collections--empty">Not reprinted in any book</div>`,
		);
	}

	const boxes = entries
		.map((entry) => {
			const caption = entry.captionLines
				.map((line) => `<span class="collection-pages__line">${escHtml(line)}</span>`)
				.join("");
			return `<div class="collection-entry">${buildCoverBoxHtml(entry, alterationKey, isSunday)}<div class="collection-pages">${caption}</div></div>`;
		})
		.join("");

	return wrapCollectionSection(`<div class="detail-collections">${boxes}</div>`);
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
		const collectionsHtml = buildAppearancesSectionHtml(
			comic.appearances || [],
			collectionsById,
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
	const rerun = page.reruns.length > 0 ? `<li class="detail-run">Reran ${joinRerunLinks(page.reruns)}</li>` : "";
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
