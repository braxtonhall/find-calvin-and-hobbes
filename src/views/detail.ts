import "./detail.css";

import { Comic } from "../types";
import { state } from "../state";
import { escHtml } from "../utils";
import { dateToCompact, isDateInCollection } from "../date-utils";
import { isBookmarked, toggleBookmark } from "../bookmarks";
import { navigate } from "../router";
import { attachBackAndHomeHandlers, buildBackAndHomeButtons } from "./nav-buttons";

export function getAdjacentComicDate(date: string, direction: -1 | 1, jump: number = 1): string | null {
	const allDays = state.allDays;
	const currentIndex = allDays.findIndex((d) => d.date === date);
	if (currentIndex === -1) return null;

	let i = currentIndex + direction * jump;
	while (i >= 0 && i < allDays.length) {
		const candidate = allDays[i];
		if (candidate.state === "has-comic" && state.comicsByDate.has(candidate.date)) {
			return candidate.date;
		}
		i += direction;
	}
	return null;
}

export function getSameDayComicDate(date: string, direction: -1 | 1): string | null {
	const allDays = state.allDays;
	const currentIndex = allDays.findIndex((d) => d.date === date);
	if (currentIndex === -1) return null;

	const targetDayOfWeek = allDays[currentIndex].dayOfWeek;

	let i = currentIndex + direction;
	while (i >= 0 && i < allDays.length) {
		const candidate = allDays[i];
		if (
			candidate.dayOfWeek === targetDayOfWeek &&
			candidate.state === "has-comic" &&
			state.comicsByDate.has(candidate.date)
		) {
			return candidate.date;
		}
		i += direction;
	}
	return null;
}

function buildCopyLinkButtonHandler(copyButton: HTMLButtonElement): void {
	copyButton.addEventListener("click", () => {
		const url = window.location.origin + copyButton.dataset.href;
		navigator.clipboard.writeText(url).then(() => {
			copyButton.textContent = "Copied!";
			copyButton.classList.add("copy-link-btn--copied");
			setTimeout(() => {
				copyButton.textContent = "Copy link";
				copyButton.classList.remove("copy-link-btn--copied");
			}, 1500);
		});
	});
}

function buildBookmarkButtonHandler(bookmarkButton: HTMLButtonElement, date: string): void {
	isBookmarked(date).then((bookmarked) => {
		if (bookmarked) bookmarkButton.classList.add("bookmark-btn--active");
	});
	bookmarkButton.addEventListener("click", async () => {
		const isNowBookmarked = await toggleBookmark(date);
		if (isNowBookmarked) {
			bookmarkButton.classList.add("bookmark-btn--active");
			state.bookmarkedDates.add(date);
		} else {
			bookmarkButton.classList.remove("bookmark-btn--active");
			state.bookmarkedDates.delete(date);
		}
		const cell = document.querySelector(`.cell[data-date="${date}"]`);
		if (cell) {
			if (isNowBookmarked) {
				cell.classList.add("cell--bookmarked");
			} else {
				cell.classList.remove("cell--bookmarked");
			}
		}
	});
}

function buildCollectionSectionHtml(comic: Comic, date: string, isSunday: boolean): string {
	if (comic.id && state.collectionIndex && state.collectionsById) {
		const matchingCollections = state.collectionIndex.collections
			.filter((collection) => collection.specials && collection.specials[comic.id!])
			.sort((a, b) => {
				if (a.pub_year !== b.pub_year) return a.pub_year - b.pub_year;
				if (a.pub_month !== b.pub_month) return a.pub_month - b.pub_month;
				return (a.pub_day || 0) - (b.pub_day || 0);
			});

		if (matchingCollections.length > 0) {
			let boxes = "";
			for (const collection of matchingCollections) {
				const alteration = collection.alterations && collection.alterations[comic.id!];
				const badge = alteration ? '<div class="collection-book__badge">*</div>' : "";
				const imageUrl = collection.image;
				boxes += `<div class="collection-book" data-collection-id="${escHtml(collection.id)}" data-alteration="${escHtml(alteration || "")}" style="aspect-ratio: ${collection.aspectRatio}"><img src="${escHtml(imageUrl)}" alt="${escHtml(collection.name)}" onload="this.parentElement.style.aspectRatio='auto'" onerror="this.parentElement.style.aspectRatio='auto'" />${badge}</div>`;
			}
			return `<p class="detail-collections-heading">Appears in:</p><div class="detail-collections">${boxes}</div>`;
		} else {
			return `<p class="detail-collections-heading">Appears in:</p><div class="detail-collections detail-collections--empty">No collections</div>`;
		}
	} else if (!comic.id && state.collectionIndex && state.collectionsById) {
		const matchingCollections = state.collectionIndex.collections
			.filter((collection) => isDateInCollection(date, collection))
			.sort((a, b) => {
				if (a.pub_year !== b.pub_year) return a.pub_year - b.pub_year;
				if (a.pub_month !== b.pub_month) return a.pub_month - b.pub_month;
				return (a.pub_day || 0) - (b.pub_day || 0);
			});

		if (matchingCollections.length > 0) {
			let boxes = "";
			for (const collection of matchingCollections) {
				const inColour = collection.colour && isSunday;
				const bwClass = isSunday && !inColour ? " collection-book--bw" : "";
				const compactDate = dateToCompact(date);
				const alterationKey = comic.id || compactDate;
				const alteration = collection.alterations && collection.alterations[alterationKey];
				const badge = alteration ? '<div class="collection-book__badge">*</div>' : "";
				const imageUrl = collection.image;
				boxes += `<div class="collection-book${bwClass}" data-collection-id="${escHtml(collection.id)}" data-colour="${inColour ? "1" : "0"}" data-alteration="${escHtml(alteration || "")}" style="aspect-ratio: ${collection.aspectRatio}"><img src="${escHtml(imageUrl)}" alt="${escHtml(collection.name)}" onload="this.parentElement.style.aspectRatio='auto'" onerror="this.parentElement.style.aspectRatio='auto'" />${badge}</div>`;
			}
			return `<p class="detail-collections-heading">Appears in:</p><div class="detail-collections">${boxes}</div>`;
		} else {
			return `<p class="detail-collections-heading">Appears in:</p><div class="detail-collections detail-collections--empty">No collections</div>`;
		}
	} else if (comic.sort) {
		return `<p class="detail-collections-heading">Appears in:</p><div class="detail-collections detail-collections--empty">No collections</div>`;
	}

	return "";
}

function getAspectRatio(comic: Comic, isSunday: boolean): number {
	if (comic.aspectRatio) return comic.aspectRatio;
	return isSunday ? 1.427 : 3.098;
}

function buildComicBodiesHtml(date: string, dateFormatted: string, isSunday: boolean): string {
	const comicsForDate = state.comicsByDate.get(date);
	if (!comicsForDate || comicsForDate.length === 0) return "";

	let bodies = "";
	for (const comic of comicsForDate) {
		let transcriptHtml: string;
		if (comic.transcript) {
			transcriptHtml = `<div class="detail-transcript">${escHtml(comic.transcript)}</div>`;
		} else {
			transcriptHtml = `<div class="detail-transcript"><em>No text</em></div>`;
		}

		let readLinkHtml = "";
		if (!comic.id) {
			const [year, month, dayOfMonth] = date.split("-");
			const gocomicsUrl = `https://www.gocomics.com/calvinandhobbes/${year}/${month}/${dayOfMonth}`;
			readLinkHtml = `<a class="detail-read-link" href="${escHtml(gocomicsUrl)}" target="_blank" rel="noopener">Read <svg class="detail-read-icon" viewBox="0 0 24 24" width="14" height="14"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></a>`;
		}

		const collectionSectionHtml = buildCollectionSectionHtml(comic, date, isSunday);

		const aspectRatio = getAspectRatio(comic, isSunday);

		bodies += `<div class="detail-comic">
				${comic.image ? `<div class="detail-image-wrapper" style="aspect-ratio: ${aspectRatio}"><div class="detail-image-pulse"></div><img class="detail-image" src="${escHtml(comic.image)}" alt="Comic from ${dateFormatted}" loading="lazy" onload="this.previousElementSibling.classList.add('loaded');this.parentElement.style.aspectRatio='auto'" onerror="this.previousElementSibling.style.display='none';this.style.display='none';this.parentElement.style.aspectRatio='auto'" /></div>` : ``}
			${transcriptHtml}
			${readLinkHtml}
			${collectionSectionHtml}
		</div>`;
	}

	return bodies;
}

let lastMouseX = 0;
let lastMouseY = 0;
// The rendered detail view only ever shows one date, so its Sunday-ness is safe to keep here.
let tooltipIsSunday = false;
let tooltipFollowersAttached = false;

function hideCollectionTooltip(): void {
	state.collectionTooltip?.classList.remove("collection-tooltip--visible");
}

function showCollectionTooltip(book: HTMLElement): void {
	const tooltip = state.collectionTooltip;
	if (!tooltip) return;
	const collectionId = book.dataset.collectionId;
	if (!collectionId) return;
	const collection = state.collectionsById!.get(collectionId);
	if (!collection) return;

	const pubYear = collection.pub_year.toString();
	let html = `<span class="collection-tooltip__name">${escHtml(collection.name)}</span> <span class="collection-tooltip__year">(${pubYear})</span>`;

	const notes: string[] = [];
	const inColour = book.dataset.colour === "1";
	if (tooltipIsSunday && !inColour) {
		notes.push("Printed in black & white");
	}
	const alteration = book.dataset.alteration;
	if (alteration) {
		notes.push(alteration);
	}
	if (notes.length > 0) {
		html += `<div class="collection-tooltip__divider">${notes.map((note) => escHtml(note)).join("<br>")}</div>`;
	}

	tooltip.innerHTML = html;
	const bookRect = book.getBoundingClientRect();
	const tooltipWidth = tooltip.offsetWidth;
	const tooltipHeight = tooltip.offsetHeight;
	const center = bookRect.left + bookRect.width / 2;
	const pad = 8;
	const left = Math.max(pad, Math.min(center - tooltipWidth / 2, window.innerWidth - tooltipWidth - pad));
	tooltip.style.left = left + "px";
	tooltip.style.transform = "none";
	tooltip.style.top = Math.max(0, bookRect.top - tooltipHeight - pad) + "px";
	tooltip.classList.add("collection-tooltip--visible");
}

function followCollectionTooltip(): void {
	const tooltip = state.collectionTooltip;
	if (!tooltip || !tooltip.classList.contains("collection-tooltip--visible")) return;
	const elementUnder = document.elementFromPoint(lastMouseX, lastMouseY);
	const book = elementUnder?.closest<HTMLElement>(".collection-book");
	if (!book) {
		hideCollectionTooltip();
		return;
	}
	showCollectionTooltip(book);
}

function attachCollectionTooltipFollowers(): void {
	if (tooltipFollowersAttached) return;
	tooltipFollowersAttached = true;

	document.addEventListener("mousemove", (event) => {
		lastMouseX = event.clientX;
		lastMouseY = event.clientY;
	});

	// Wait a frame so the layout has settled after the scroll/resize/load that triggered us.
	const follow = () => requestAnimationFrame(followCollectionTooltip);
	const main = document.getElementById("main")!;
	main.addEventListener("scroll", follow);
	window.addEventListener("resize", follow);
	// Image loads reflow the page around the tooltip; load doesn't bubble, so capture it.
	main.addEventListener("load", follow, true);
}

function attachCollectionBookHandlers(element: HTMLElement, isSunday: boolean): void {
	element.querySelectorAll<HTMLElement>(".collection-book").forEach((book) => {
		book.addEventListener("click", () => {
			const collectionId = book.dataset.collectionId;
			if (!collectionId) return;
			hideCollectionTooltip();
			navigate("#/collection/" + collectionId);
		});
	});

	if (!state.collectionTooltip) return;

	tooltipIsSunday = isSunday;
	attachCollectionTooltipFollowers();

	element.querySelectorAll<HTMLElement>(".collection-book").forEach((book) => {
		book.addEventListener("mouseenter", () => showCollectionTooltip(book));
		book.addEventListener("mouseleave", hideCollectionTooltip);
	});

	followCollectionTooltip();
}

export function renderDetail(date: string): void {
	document.getElementById("main")!.scrollTop = 0;
	const element = document.getElementById("view-detail")!;
	const comicsForDate = state.comicsByDate.get(date);

	const [year, month, dayOfMonth] = date.split("-").map(Number);
	const dateObject = new Date(Date.UTC(year, month - 1, dayOfMonth));
	const dateFormatted = dateObject.toLocaleDateString("en-US", {
		weekday: "long",
		year: "numeric",
		month: "long",
		day: "numeric",
		timeZone: "UTC",
	});
	const isSunday = dateObject.getUTCDay() === 0;

	const prevDate = getAdjacentComicDate(date, -1);
	const nextDate = getAdjacentComicDate(date, 1);

	const prevButtonHtml = prevDate
		? `<button class="nav-btn" id="nav-prev" data-date="${prevDate}" title="Previous comic">&larr;</button>`
		: `<span class="nav-btn nav-btn--disabled" title="First comic">&larr;</span>`;
	const nextButtonHtml = nextDate
		? `<button class="nav-btn" id="nav-next" data-date="${nextDate}" title="Next comic">&rarr;</button>`
		: `<span class="nav-btn nav-btn--disabled" title="Last comic">&rarr;</span>`;

	const headerHtml = `<div class="detail-container">
		${buildBackAndHomeButtons()}
		<h2 class="detail-date">${dateFormatted}</h2>
		<div class="detail-actions">
			<button class="copy-link-btn" id="copy-link-btn" data-href="${window.location.pathname}#/comic/${date}">Copy link</button><button class="bookmark-btn" id="bookmark-btn" data-date="${date}" title="Bookmark"><svg class="bookmark-icon" viewBox="0 0 24 24"><path d="M17 3H7a2 2 0 0 0-2 2v16l7-4 7 4V5a2 2 0 0 0-2-2z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg></button> ${prevButtonHtml} ${nextButtonHtml}
		</div>`;

	if (!comicsForDate || comicsForDate.length === 0) {
		element.innerHTML = `${headerHtml}
			<p class="detail-missing">No comics found</p>
		</div>`;
	} else {
		const bodies = buildComicBodiesHtml(date, dateFormatted, isSunday);
		element.innerHTML = `${headerHtml}
			${bodies}
		</div>`;
	}

	attachBackAndHomeHandlers(element);

	const copyButton = element.querySelector<HTMLButtonElement>("#copy-link-btn");
	if (copyButton) buildCopyLinkButtonHandler(copyButton);

	const bookmarkButton = element.querySelector<HTMLButtonElement>("#bookmark-btn");
	if (bookmarkButton) buildBookmarkButtonHandler(bookmarkButton, date);

	const prevButton = element.querySelector<HTMLButtonElement>("#nav-prev");
	if (prevButton) {
		prevButton.addEventListener("click", () => navigate("#/comic/" + prevDate));
	}

	const nextButton = element.querySelector<HTMLButtonElement>("#nav-next");
	if (nextButton) {
		nextButton.addEventListener("click", () => navigate("#/comic/" + nextDate));
	}

	attachCollectionBookHandlers(element, isSunday);
}
