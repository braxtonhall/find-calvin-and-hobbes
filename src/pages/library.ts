import { LibraryView } from "../routes";
import { buildBackAndHomeButtons } from "./nav-buttons";

const HEADINGS: Record<LibraryView, string> = { bookmarks: "Bookmarks", bookshelf: "Bookshelf" };

/**
 * A page of the reader's own strips: the heading, and where the rows go. The rows are the app's to
 * draw, since what this browser has kept is only known to it — see `views/library.ts`.
 */
export function buildLibraryHtml(view: LibraryView, canGoBack: boolean): string {
	return `${buildBackAndHomeButtons(canGoBack)}
		<h2 class="library-heading">${HEADINGS[view]}</h2>
		<div class="library-list" id="${view}-list"></div>`;
}
