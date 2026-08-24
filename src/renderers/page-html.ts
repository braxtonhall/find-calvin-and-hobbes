import { Collection, CollectionIndex } from "../types";
import { formatCompactRange, getCollectionCoverage } from "../date-utils";
import { escHtml } from "../utils";

export function renderLandingHtml(creditsHref: string): string {
	return `<img class="landing-logo" src="https://upload.wikimedia.org/wikipedia/commons/9/96/Calvin_and_Hobbes_title.png" alt="Calvin and Hobbes" /><form class="landing-form" id="landing-form"><input type="text" class="landing-input" id="landing-input" placeholder="Search comics..." autocomplete="off" /><button type="submit" class="landing-submit" id="landing-submit" title="Search" aria-label="Search">Search</button></form><a class="landing-credits" href="${creditsHref}">Credits</a>`;
}

export function renderCreditsHtml(
	homeHref: string,
	backHtml = `<span class="credits-back credits-back--disabled">&larr; Back</span>`,
): string {
	return `<div class="credits-container">${backHtml}<a class="credits-home" href="${homeHref}"><span class="home-icon">&#8962;</span> Home</a><h2 class="credits-heading">Credits</h2><p class="credits-section"><strong>Calvin and Hobbes</strong> is copyright Bill Watterson / Universal Press Syndicate. All characters and comic strips are the property of their respective owners. This is an unofficial fan archive and is not affiliated with or endorsed by the copyright holders.</p><p class="credits-section"><strong>Transcripts</strong> from the <a href="https://web.archive.org/web/20210706165719/http://www.s-anand.net/comic.calvin.jsz" target="_blank" rel="noopener">Calvin and Hobbes transcript search</a>, the <a href="https://calvinandhobbes.miraheze.org/wiki/Main_Page" target="_blank" rel="noopener">Calvin and Hobbes Miraheze Wiki</a>, and <a href="https://seligman.github.io/comics/calvin_and_hobbes.html" target="_blank" rel="noopener">Calvin and Hobbes Search</a>.</p><p class="credits-section"><strong>Descriptions and page index</strong> from <a href="https://web.archive.org/web/20160526232457/http://www.reemst.com/calvin_and_hobbes/" target="_blank" rel="noopener">Calvin and Hobbes at Martijn's</a> and <a href="https://openlibrary.org/books/OL3311404M/The_Complete_Calvin_and_Hobbes" target="_blank" rel="noopener">OpenLibrary</a>.</p><p class="credits-section"><strong>Comic dates</strong> from <a href="https://en.wikipedia.org/wiki/List_of_Calvin_and_Hobbes_books" target="_blank" rel="noopener">Wikipedia</a> and the <a href="https://calvinandhobbes.fandom.com/" target="_blank" rel="noopener">Calvin and Hobbes Fandom Wiki</a>.</p><p class="credits-section"><strong>Favicon</strong> from the <a href="https://calvinandhobbes.miraheze.org/wiki/Main_Page" target="_blank" rel="noopener">Calvin and Hobbes Miraheze Wiki</a>.</p><p class="credits-section"><strong>Alterations data</strong> from the <a href="https://calvinandhobbes.fandom.com/" target="_blank" rel="noopener">Calvin and Hobbes Fandom Wiki</a>.</p><p class="credits-section"><strong>Logo</strong> from <a href="https://commons.wikimedia.org/wiki/File:Calvin_and_Hobbes_title.png" target="_blank" rel="noopener">Wikimedia Commons</a>.</p><div class="credits-section"><strong>Prior Art</strong><ul><li><a href="https://web.archive.org/web/20081102153520/http://www.s-anand.net/calvinandhobbes.html#19851117" target="_blank" rel="noopener">s-anand.net</a></li><li><a href="https://web.archive.org/web/20060508010745/http://www.reemst.com/calvin_and_hobbes/stripsearch/1989/10/29/calvin_and_hobbes.html" target="_blank" rel="noopener">C.H.E.S.S.</a></li><li><a href="https://web.archive.org/web/20260709131130/http://michaelyingling.com/random/calvin_and_hobbes/" target="_blank" rel="noopener">Mike Yingling's Calvin and Hobbes: The Search Engine</a></li><li><a href="https://web.archive.org/web/20260701171131/https://calvinandhobbes.miraheze.org/wiki/Main_Page" target="_blank" rel="noopener">Calvin and Hobbes Miraheze Wiki</a></li><li><a href="https://web.archive.org/web/20260803211810/https://seligman.github.io/comics/calvin_and_hobbes.html" target="_blank" rel="noopener">Calvin and Hobbes Search</a></li></ul></div><p class="credits-footer">Please send corrections, fixes, and ideas to Braxton Hall through <a href="https://github.com/braxtonhall/find-calvin-and-hobbes" target="_blank" rel="noopener">GitHub</a>.</p></div>`;
}

export function renderCollectionHtml(
	collection: Collection,
	index: CollectionIndex,
	comicsCount: number,
	homeHref: string,
	navigationHtml = `<a class="detail-home" href="${homeHref}"><span class="home-icon">&#8962;</span> Home</a>`,
): string {
	const labels: Record<string, string> = {
		collection: "Collection",
		compendium: "Compendium",
		treasury: "Treasury",
		complete: "Complete Collection",
		special: "Special Book",
	};
	const months = [
		"January",
		"February",
		"March",
		"April",
		"May",
		"June",
		"July",
		"August",
		"September",
		"October",
		"November",
		"December",
	];
	const published = collection.pub_year
		? `${months[collection.pub_month - 1]}${collection.pub_day ? ` ${collection.pub_day},` : ""} ${collection.pub_year}`
		: "";
	const ranges = collection.dailies?.length
		? collection.dailies
				.map((range) => `<div class="collection-range">${escHtml(formatCompactRange(range))}</div>`)
				.join("")
		: `<div class="collection-no-ranges">Strip list not fully indexed</div>`;
	const extras = index.collection_extras?.[collection.id];
	const extrasHtml = extras?.length
		? `<p class="collection-section-heading">Extras</p><ul class="collection-extras">${extras.map((extra) => `<li>${escHtml(extra)}</li>`).join("")}</ul>`
		: "";
	const summary = comicsCount
		? `<p class="collection-meta"><span class="collection-meta--label">Comics:</span> ${comicsCount} strip${comicsCount === 1 ? "" : "s"}${collection.dailies?.length ? " in order" : " (unordered)"}</p>`
		: "";
	return `<div class="collection-container">${navigationHtml}<div class="collection-header"><div class="collection-cover" style="aspect-ratio: ${collection.aspectRatio}"><img src="${escHtml(collection.image)}" alt="${escHtml(collection.name)} cover" onload="this.parentElement.style.aspectRatio='auto'" onerror="this.parentElement.style.aspectRatio='auto'" /></div><div class="collection-info"><h2 class="collection-name">${escHtml(collection.name)}</h2><div class="collection-type">${escHtml(labels[collection.type] || collection.type)}</div><p class="collection-meta"><span class="collection-meta--label">Published:</span> ${published}</p><p class="collection-meta"><span class="collection-meta--label">Coverage:</span> ${escHtml(getCollectionCoverage(collection).join(" · "))}</p>${summary}${collection.notes?.length ? `<p class="collection-note">${escHtml(collection.notes[0])}</p>` : ""}</div></div><p class="collection-section-heading">Date Ranges</p><div class="collection-ranges">${ranges}</div>${extrasHtml}${collection.links?.length ? `<p class="collection-section-heading">Links</p><div class="collection-links">${collection.links.map((link) => `<a class="collection-link" href="${escHtml(link.href)}" target="_blank" rel="noopener">${escHtml(link.title)}</a>`).join("")}</div>` : ""}</div>`;
}
