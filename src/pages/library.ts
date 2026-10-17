import { BOOKSHELF_TABS, BookshelfTab, BookshelfView, LibraryView, bookshelfTabs, isBookshelfView } from "../routes";
import { addressOf } from "../base-path";
import { escHtml } from "../utils";
import { buildBackAndHomeButtons } from "./nav-buttons";

const BOOKSHELF_TAB_LABELS: Record<BookshelfTab, string> = { all: "All", clippings: "Clippings", books: "Books" };

/**
 * All · Clippings · Books, in Collections' idiom: the tab showing in bold, the others quiet links.
 * Each is a page of its own, so Back returns to the tab the reader left. A site with no books has no
 * tabs: its Bookshelf is the clippings alone.
 */
function buildBookshelfTabsHtml(current: BookshelfView): string {
	const names = bookshelfTabs();
	if (names.length === 0) return "";
	const tabs = names.map((name) => {
		const { view, path } = BOOKSHELF_TABS[name];
		const label = BOOKSHELF_TAB_LABELS[name];
		return view === current
			? `<span class="collections-tab collections-tab--current" aria-current="page">${label}</span>`
			: `<a class="collections-tab" href="${escHtml(addressOf(path))}">${label}</a>`;
	});
	return `<nav class="collections-tabs" aria-label="Bookshelf">${tabs.join(`\n\t\t\t<span aria-hidden="true">·</span>\n\t\t\t`)}</nav>`;
}

/**
 * A page of the reader's own strips or books: the heading, the Bookshelf's tabs, and where the rows
 * go. The rows are the app's to draw, since what this browser has kept is only known to it — see
 * `views/library.ts`.
 */
export function buildLibraryHtml(view: LibraryView | BookshelfView, canGoBack: boolean): string {
	const shelf = isBookshelfView(view);
	return `${buildBackAndHomeButtons(canGoBack)}
		<h2 class="library-heading${shelf && bookshelfTabs().length > 0 ? " library-heading--tabbed" : ""}">${shelf ? "Bookshelf" : "Bookmarks"}</h2>
		${shelf ? buildBookshelfTabsHtml(view) : ""}
		<div class="library-list" id="${view}-list"></div>`;
}
