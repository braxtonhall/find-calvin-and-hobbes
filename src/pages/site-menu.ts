import { BOOKMARKS_PATH, BOOKSHELF_PATH, SETTINGS_PATH } from "../routes";
import { addressOf } from "../base-path";
import { Route } from "../types";

/** The menu's icons, in the idiom of the strip page's: 24 units, stroked in `currentColor`, no fill. */
function menuIcon(paths: string): string {
	return `<svg class="site-menu-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
}

const MENU_ICON = menuIcon(`<path d="M4 6h16M4 12h16M4 18h16" />`);
const BOOKMARKS_ICON = menuIcon(`<path d="M17 3H7a2 2 0 0 0-2 2v16l7-4 7 4V5a2 2 0 0 0-2-2z" />`);
// The strip page's "Own" icon, unowned: its spines want the thicker, square-ended stroke drawn there.
const BOOKSHELF_ICON = menuIcon(
	`<path d="M6 4v16M12 4v16M17.5 4.9l3.9 15.1" stroke-width="2.5" stroke-linecap="butt" />`,
);
const SETTINGS_ICON = menuIcon(
	`<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" />`,
);

/** The pages the menu leads to, which are where it is drawn besides home. */
type SiteMenuPage = "bookmarks" | "bookshelf" | "settings";

/** The views the menu shows on, and which of its items each is: none, for home. */
const MENU_VIEWS: Partial<Record<Route["view"], SiteMenuPage | null>> = {
	landing: null,
	bookmarks: "bookmarks",
	bookshelf: "bookshelf",
	"bookshelf-clippings": "bookshelf",
	"bookshelf-books": "bookshelf",
	settings: "settings",
};

export function showsSiteMenu(view: Route["view"]): boolean {
	return Object.hasOwn(MENU_VIEWS, view);
}

/** A page's own item is there, greyed and going nowhere, so the menu keeps its shape from page to page. */
function menuItem(page: SiteMenuPage, current: SiteMenuPage | null, path: string, icon: string, label: string): string {
	return page === current
		? `<span class="site-menu-item site-menu-item--current" role="menuitem" aria-disabled="true" aria-current="page">${icon}${label}</span>`
		: `<a class="site-menu-item" role="menuitem" href="${addressOf(path)}">${icon}${label}</a>`;
}

/** The menu's items, with the one for `view` greyed. */
export function buildSiteMenuItemsHtml(view: Route["view"]): string {
	const current = MENU_VIEWS[view] ?? null;
	return `${menuItem("bookmarks", current, BOOKMARKS_PATH, BOOKMARKS_ICON, "Bookmarks")}
			${menuItem("bookshelf", current, BOOKSHELF_PATH, BOOKSHELF_ICON, "Bookshelf")}
			<hr class="site-menu-rule" />
			${menuItem("settings", current, SETTINGS_PATH, SETTINGS_ICON, "Settings")}`;
}

/**
 * The corner menu, which holds the links about the reader. Chrome, like the corrections link: written
 * once, beside the views rather than in one, so it stays put from home to the pages it leads to
 * instead of fading out and in with each. It is hidden on every other page; `views/site-menu.ts`
 * keeps it showing, or not, and greys the item for the page it is on.
 */
export function buildSiteMenuHtml(view: Route["view"]): string {
	return `<div class="site-menu" id="site-menu"${showsSiteMenu(view) ? "" : " hidden"}>
		<button type="button" class="site-menu-toggle" title="Menu" aria-label="Menu" aria-haspopup="menu" aria-expanded="false" aria-controls="site-menu-list">${MENU_ICON}</button>
		<div class="site-menu-list" id="site-menu-list" role="menu" hidden>
			${buildSiteMenuItemsHtml(view)}
		</div>
	</div>`;
}
