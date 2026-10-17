import { CREDITS_PATH, buildTabPath, collectionsTabs } from "../routes";
import { addressOf } from "../base-path";
import { PAGE_CONFIG } from "../site-config";
import { escHtml } from "../utils";
import { collectionsLabel } from "./collections";

// Drawn in the same idiom as the results-bar icons: 16px, stroked in `currentColor`, no fill.
const SEARCH_ICON = `<svg class="landing-submit-search" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" aria-hidden="true">
	<circle cx="6.8" cy="6.8" r="4.3" /><path d="M10 10l3.5 3.5" />
</svg>`;

/** The banner `config.yaml` names, or the site's name where it names none. */
function buildLogoHtml(): string {
	if (!PAGE_CONFIG.landingImage) return `<h1 class="landing-title">${escHtml(PAGE_CONFIG.name)}</h1>`;
	// A browser takes the shape to hold for an image from its width and height before it has loaded.
	const size = PAGE_CONFIG.landingSize;
	const sizeAttributes = size ? ` width="${size.width}" height="${size.height}"` : "";
	return `<img class="landing-logo" src="${escHtml(PAGE_CONFIG.landingImage)}" alt="${escHtml(PAGE_CONFIG.landingAlt)}"${sizeAttributes} />`;
}

/** The link to Collections, opening on its first tab, and nothing on a site that has no collections at all. */
function buildCollectionsLinkHtml(): string {
	const [first] = collectionsTabs();
	if (!first) return "";
	return `<a href="${addressOf(buildTabPath(first))}">${collectionsLabel()}</a>
			<span aria-hidden="true">·</span>`;
}

export function buildLandingHtml(): string {
	return `
		${buildLogoHtml()}
		<form class="landing-form" id="landing-form">
			<div class="query-field">
				<div class="query-box">
					<input
						type="text"
						class="landing-input"
						id="landing-input"
						placeholder="Search comics..."
						autocomplete="off"
						enterkeyhint="search"
					/>
					<button type="submit" class="landing-submit" id="landing-submit" title="Search" aria-label="Search">${SEARCH_ICON}</button>
				</div>
			</div>
		</form>
		<nav class="landing-links">
			${buildCollectionsLinkHtml()}
			<a href="${addressOf(CREDITS_PATH)}">Credits</a>
		</nav>
	`;
}
