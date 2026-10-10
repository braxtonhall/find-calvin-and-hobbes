import { BOOKMARKS_PATH, BOOKSHELF_PATH, BOOKS_PATH, CREDITS_PATH, SETTINGS_PATH } from "../routes";
import { addressOf } from "../base-path";
import { PAGE_CONFIG } from "../site-config";
import { escHtml } from "../utils";

// Drawn in the same idiom as the results-bar icons: 16px, stroked in `currentColor`, no fill.
const SEARCH_ICON = `<svg class="landing-submit-search" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" aria-hidden="true">
	<circle cx="6.8" cy="6.8" r="4.3" /><path d="M10 10l3.5 3.5" />
</svg>`;

/** The menu's icons, in the idiom of the strip page's: 24 units, stroked in `currentColor`, no fill. */
function menuIcon(paths: string): string {
	return `<svg class="landing-menu-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
}

const MENU_ICON = menuIcon(`<path d="M4 6h16M4 12h16M4 18h16" />`);
const BOOKMARKS_ICON = menuIcon(`<path d="M17 3H7a2 2 0 0 0-2 2v16l7-4 7 4V5a2 2 0 0 0-2-2z" />`);
const BOOKSHELF_ICON = menuIcon(`<path d="M4 4v16M8 8v12M12 6v14M16 6l4 14" />`);
const SETTINGS_ICON = menuIcon(
	`<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" />`,
);

function menuItem(path: string, icon: string, label: string): string {
	return `<a class="landing-menu-item" role="menuitem" href="${addressOf(path)}">${icon}${label}</a>`;
}

/** The corner menu, which holds the links about the reader; the comics and the site keep theirs under the box. */
function buildMenuHtml(): string {
	return `<div class="landing-menu">
		<button type="button" class="landing-menu-toggle" id="landing-menu-toggle" title="Menu" aria-label="Menu" aria-haspopup="menu" aria-expanded="false" aria-controls="landing-menu">${MENU_ICON}</button>
		<div class="landing-menu-list" id="landing-menu" role="menu" hidden>
			${menuItem(BOOKMARKS_PATH, BOOKMARKS_ICON, "Bookmarks")}
			${menuItem(BOOKSHELF_PATH, BOOKSHELF_ICON, "Bookshelf")}
			<hr class="landing-menu-rule" />
			${menuItem(SETTINGS_PATH, SETTINGS_ICON, "Settings")}
		</div>
	</div>`;
}

/** The banner `config.yaml` names, or the site's name where it names none. */
function buildLogoHtml(): string {
	if (!PAGE_CONFIG.landingImage) return `<h1 class="landing-title">${escHtml(PAGE_CONFIG.name)}</h1>`;
	// A browser takes the shape to hold for an image from its width and height before it has loaded.
	const size = PAGE_CONFIG.landingSize;
	const sizeAttributes = size ? ` width="${size.width}" height="${size.height}"` : "";
	return `<img class="landing-logo" src="${escHtml(PAGE_CONFIG.landingImage)}" alt="${escHtml(PAGE_CONFIG.landingAlt)}"${sizeAttributes} />`;
}

export function buildLandingHtml(): string {
	return `
		${buildMenuHtml()}
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
			<a href="${addressOf(BOOKS_PATH)}">Collections</a>
			<span aria-hidden="true">·</span>
			<a href="${addressOf(CREDITS_PATH)}">Credits</a>
		</nav>
	`;
}
