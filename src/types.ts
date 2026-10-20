export interface Comic {
	date: string;
	transcript: string;
	alternate?: string;
	image?: string;
	id?: string;
	sort?: number;
	/** The image's width over its height, read from its file by the build. Only with an image. */
	aspectRatio?: number;
	/** The image's width in pixels, where the build makes smaller copies of it. See `srcset.ts`. */
	width?: number;
	appearances?: Appearance[];
	/** The arcs the strip belongs to, by id. None does to more than one today, but nothing forbids it. */
	arcs?: string[];
	/** The characters the strip features, by id, as `comics.yaml` lists them. */
	characters?: string[];
	/** Who made the strip, as the creators' file credits it. */
	creators?: Credit[];
	/** What the strip is about, by id, as `comics.yaml` lists them: a running gag, a recurring game. */
	subjects?: string[];
}

export interface Appearance {
	collection: string;
	volume?: number;
	pages: number[];
	altered?: true;
}

export interface Collection {
	id: string;
	name: string;
	/** A line under the name, like `Treasury`. Left out, the book has none. */
	subtitle?: string;
	pub_year: number;
	pub_month: number;
	pub_day?: number;
	image: string;
	/** Whether it printed the Sundays in colour. Read only where `config.yaml` has `colourSundays`. */
	colour?: boolean;
	sundays?: boolean;
	notes: string[];
	dailies: string[];
	alterations: Record<string, string>;
	specials: Record<string, string>;
	links?: { title: string; href: string }[];
	/** The cover's width over its height: `aspect-ratio` in the book's file, else read from the cover's file. */
	aspectRatio?: number;
	/** The cover's width in pixels, where the build makes smaller copies of it. See `srcset.ts`. */
	width?: number;
}

export interface CollectionIndex {
	collections: Collection[];
	collection_extras?: Record<string, string[]>;
}

/**
 * A story told over several strips. It has no title: it is named by its dates and described in a
 * sentence, as `arcs.yaml` writes it.
 */
export interface Arc {
	id: string;
	description: string;
	/** Its strips' dates, in order. */
	dates: string[];
	/** The books that print every strip of it, in publication order. */
	collections: string[];
}

/**
 * Where someone's strips are, as their page and the list of them say. Their strips themselves are not
 * listed — someone in every strip of a fifty-year run is in too many — but summed up, and their dailies
 * and Sundays written as ranges, which light the grid without the archive.
 */
export interface StripSummary {
	/** How many strips they are in, specials too. */
	strips: number;
	/** The years with a strip of theirs, in order. */
	years: number[];
	/** Their daily and Sunday strips, as a book's date ranges are written: compact, `start-end`, over the strips in order. */
	ranges: string[];
	/** The specials they are in, which no range holds, oldest first; none where they have none. */
	specials?: ListedSpecial[];
}

/** Someone with a page of their own: a creator, or a character. */
export interface Person extends StripSummary {
	id: string;
	name: string;
	/** A portrait, from the mount where the build publishes it. */
	image?: string;
}

/** Someone a strip can feature: the id `@featuring:` takes, the name a reader knows them by, and where they are found. */
export type Character = Person;

/** One person credited on a strip, and what they did on it where the credit says: `story`, `art`. */
export interface Credit {
	id: string;
	role?: string;
}

/** Someone who made strips: the id `@by:` takes, the name a reader knows them by, and where they are found. */
export interface Creator extends Person {
	/** Pages about them elsewhere, like an encyclopedia's, as a book's links are. */
	links?: { title: string; href: string }[];
	/** What their credits say they did, in the order first met; none where no credit says. */
	roles?: string[];
}

/**
 * Something strips come back to, like a running gag: the id `@about:` takes, the name a reader knows
 * it by, and the strips that are about it, which `comics.yaml` says strip by strip.
 */
export interface Subject {
	id: string;
	name: string;
	/** A sentence about it, where `subjects.yaml` gives one. */
	description?: string;
	/** Other words a reader might look for it by, which a search of the subjects finds it by too. */
	keywords: string[];
	/** Its dailies' and Sundays' dates, oldest first. */
	dates: string[];
	/** The specials about it, oldest first; none where there are none. */
	specials?: ListedSpecial[];
}

/** A special as a list of strips names it: by its title, and the day it is filed under, which is where it is shown. */
export interface ListedSpecial {
	id: string;
	title: string;
	/** As the site writes a date: `1985-11-28`. */
	date: string;
}

export interface Day {
	date: string;
	weekIndex: number;
	dayOfWeek: number;
	state: string;
}

export type SortMode = "date" | "rank";

/** How a Collections tab is ordered: by date, as the build writes it, or by how many strips each holds. */
export type TabOrder = "date" | "count";

export interface Route {
	view:
		| "landing"
		| "results"
		| "detail"
		| "collection"
		| "collections"
		| "arc"
		| "arcs"
		| "creator"
		| "creators"
		| "character"
		| "characters"
		| "subject"
		| "subjects"
		| "settings"
		| "bookmarks"
		| "bookshelf"
		| "bookshelf-clippings"
		| "bookshelf-books"
		| "credits";
	q?: string;
	sort?: SortMode;
	/** Only ever `count`: a tab in date order says nothing. */
	order?: "count";
	date?: string;
	alternates?: string[];
	id?: string;
}
