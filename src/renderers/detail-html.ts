import { CollectionIndex, Comic, Appearance, Collection } from "../types";
import { dateToCompact } from "../date-utils";
import { escHtml } from "../utils";

export interface DetailHtmlContext {
	date: string;
	dateFormatted: string;
	isSunday: boolean;
	comics: Comic[];
	descriptions: Map<string, string> | null;
	collectionIndex: CollectionIndex | null;
	collectionsById: Map<string, Collection> | null;
	homeHref: string;
	backHtml: string;
	copyHref: string;
	previousHref: string | null;
	nextHref: string | null;
	collectionHref: (id: string) => string;
}

function formatPages(pages: number[], long = false): string {
	if (pages.length === 0) return "";
	if (pages.length === 1) return long ? `Page ${pages[0]}` : `p. ${pages[0]}`;
	const contiguous = pages.every((page, index) => index === 0 || page === pages[index - 1] + 1);
	const list = contiguous ? `${pages[0]}–${pages[pages.length - 1]}` : pages.join(", ");
	return long ? `Pages ${list}` : `pp. ${list}`;
}

function shortenEditionLabel(label: string): string {
	return label.replace(/\s*\(.*\)\s*$/, "");
}

function appearanceHtml(
	appearances: Appearance[],
	collectionsById: Map<string, Collection>,
	contextDate: string,
	contextCollectionHref: (id: string) => string,
): string {
	const entries = new Map<string, { collection: Collection; captions: string[]; tooltips: string[] }>();
	for (const appearance of appearances) {
		const collection = collectionsById.get(appearance.collection);
		if (!collection) continue;
		let entry = entries.get(appearance.collection);
		if (!entry) {
			entry = { collection, captions: [], tooltips: [] };
			entries.set(appearance.collection, entry);
		}
		if (appearance.edition) {
			const edition = collection.editions?.[appearance.edition];
			const label = edition ? edition.label : appearance.edition;
			const total = label.match(/\((\d+)/)?.[1] || "0";
			const volume = appearance.volume ? ` ${appearance.volume}` : "";
			entry.captions.push(`${label.charAt(0)}${volume}, ${formatPages(appearance.pages)}`);
			entry.tooltips.push(
				`${shortenEditionLabel(label)}, Book ${appearance.volume} of ${total}, ${formatPages(appearance.pages).replace("p.", "page")}`,
			);
		} else {
			entry.captions.push(formatPages(appearance.pages));
			entry.tooltips.push(formatPages(appearance.pages, true));
		}
	}

	if (entries.size === 0)
		return `<p class="detail-collections-heading">Printed in:</p><div class="detail-collections detail-collections--empty">Not reprinted in any book</div>`;
	const boxes = [...entries.values()]
		.map(({ collection, captions, tooltips }) => {
			const bw = collection.sundays && !collection.colour ? " collection-book--bw" : "";
			const alteration = collection.alterations?.[dateToCompact(contextDate)] || "";
			const badge = alteration ? '<div class="collection-book__badge">*</div>' : "";
			const pages = tooltips.map(escHtml).join("\n");
			return `<div class="collection-entry"><a class="collection-book${bw}" href="${escHtml(contextCollectionHref(collection.id))}" data-collection-id="${escHtml(collection.id)}" data-bw="${bw ? "1" : "0"}" data-alteration="${escHtml(alteration)}" data-pages="${pages}" style="aspect-ratio: ${collection.aspectRatio}"><img src="${escHtml(collection.image)}" alt="${escHtml(collection.name)}" loading="lazy" onload="this.parentElement.style.aspectRatio='auto'" onerror="this.parentElement.style.aspectRatio='auto'" />${badge}</a><div class="collection-pages">${captions.map((caption) => `<span class="collection-pages__line">${escHtml(caption)}</span>`).join("")}</div></div>`;
		})
		.join("");
	return `<p class="detail-collections-heading">Printed in:</p><div class="detail-collections">${boxes}</div>`;
}

function collectionHtml(comic: Comic, context: DetailHtmlContext): string {
	if (!context.collectionIndex || !context.collectionsById) return "";
	return appearanceHtml(
		comic.appearances || [],
		context.collectionsById,
		comic.id || context.date,
		context.collectionHref,
	);
}

function comicHtml(comic: Comic, context: DetailHtmlContext): string {
	const description = context.descriptions?.get(comic.id || context.date);
	const isResolved = context.descriptions !== null;
	const image = comic.image
		? `<div class="detail-image-wrapper" style="aspect-ratio: ${comic.aspectRatio || (context.isSunday ? 1.427 : 3.098)}"><div class="detail-image-pulse"></div><img class="detail-image" src="${escHtml(comic.image)}" alt="${escHtml(description || `Comic from ${context.dateFormatted}`)}" loading="lazy" onload="this.previousElementSibling.classList.add('loaded');this.parentElement.style.aspectRatio='auto'" onerror="this.previousElementSibling.style.display='none';this.style.display='none';this.parentElement.style.aspectRatio='auto'" /></div>`
		: "";
	const descriptionHtml = comic.image
		? ""
		: !isResolved
			? `<div class="detail-description-skeleton"><span></span><span></span><span></span></div>`
			: description
				? `<p class="detail-description">${escHtml(description)}</p><p class="detail-transcript-label">Transcript</p>`
				: "";
	const readLinks = !comic.id
		? `<div class="detail-links"><a class="detail-read-link" href="https://www.gocomics.com/calvinandhobbes/${context.date.slice(0, 4)}/${context.date.slice(5, 7)}/${context.date.slice(8, 10)}" target="_blank" rel="noopener">Read <svg class="detail-read-icon" viewBox="0 0 24 24" width="14" height="14"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></a><a class="detail-read-link" href="https://licensing.andrewsmcmeel.com/features/ch?date=${context.date}" target="_blank" rel="noopener">License <svg class="detail-read-icon" viewBox="0 0 24 24" width="14" height="14"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></a></div>`
		: "";
	return `<div class="detail-comic${comic.image ? " detail-comic--illustrated" : ""}" data-comic-key="${escHtml(comic.id || context.date)}">${image}<div class="detail-description-slot">${descriptionHtml}</div><div class="detail-transcript">${escHtml(comic.transcript || "")}</div>${readLinks}<div class="detail-collections-slot">${collectionHtml(comic, context)}</div></div>`;
}

export function renderDetailHtml(context: DetailHtmlContext): string {
	const previous = context.previousHref
		? `<a class="nav-btn" id="nav-prev" href="${context.previousHref}" title="Previous comic">&larr;</a>`
		: `<span class="nav-btn nav-btn--disabled" title="First comic">&larr;</span>`;
	const next = context.nextHref
		? `<a class="nav-btn" id="nav-next" href="${context.nextHref}" title="Next comic">&rarr;</a>`
		: `<span class="nav-btn nav-btn--disabled" title="Last comic">&rarr;</span>`;
	const bodies = context.comics.map((comic) => comicHtml(comic, context)).join("");
	return `<div class="detail-container">${context.backHtml}<a class="detail-home" href="${context.homeHref}"><span class="home-icon">&#8962;</span> Home</a><h2 class="detail-date">${context.dateFormatted}</h2><div class="detail-actions"><button class="copy-link-btn" id="copy-link-btn" data-href="${context.copyHref}">Copy link</button><button class="bookmark-btn" id="bookmark-btn" data-date="${context.date}" title="Bookmark"><svg class="bookmark-icon" viewBox="0 0 24 24"><path d="M17 3H7a2 2 0 0 0-2 2v16l7-4 7 4V5a2 2 0 0 0-2-2z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg></button> ${previous} ${next}</div>${bodies || '<p class="detail-missing">No comics found</p>'}</div>`;
}
