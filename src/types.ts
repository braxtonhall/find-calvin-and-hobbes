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
}

export interface Appearance {
	collection: string;
	edition?: string;
	volume?: number;
	pages: number[];
	altered?: true;
}

export interface Edition {
	label: string;
	isbn?: string[];
	/** When the edition came out later than the collection it belongs to. */
	pub_year?: number;
	/** Its own cover, when it has one; otherwise it wears the collection's. */
	image?: string;
	/** Its own cover's width over its height: `aspect-ratio` in its book's file, else read from the file. */
	aspectRatio?: number;
	/** Its own cover's width in pixels, where the build makes smaller copies of it. See `srcset.ts`. */
	width?: number;
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
	editions?: Record<string, Edition>;
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
	/** The books that print every strip of it, once per book however many editions it has, in publication order. */
	collections: string[];
}

/** Someone a strip can feature: the id `@featuring:` takes, and the name a reader knows them by. */
export interface Character {
	id: string;
	name: string;
}

/** One person credited on a strip, and what they did on it where the credit says: `story`, `art`. */
export interface Credit {
	id: string;
	role?: string;
}

/** Someone who made strips: the id `@by:` takes, the name a reader knows them by, and where they are found. */
export interface Creator {
	id: string;
	name: string;
	/** A portrait, from the mount where the build publishes it. */
	image?: string;
	/** A page about them elsewhere, like an encyclopedia's. */
	link?: string;
	/** How many strips they are credited on, specials too. */
	strips: number;
	/** The years with a strip of theirs, in order. */
	years: number[];
	/** Their daily and Sunday strips, as a book's date ranges are written: compact, `start-end`, over the strips in order. */
	ranges: string[];
	/** What their credits say they did, in the order first met; none where no credit says. */
	roles?: string[];
	/** The specials they are credited on, which no range holds, oldest first; none where they have none. */
	specials?: CreditedSpecial[];
}

/** A special as a creator's page lists it: by its title, and the day it is filed under, which is where it is shown. */
export interface CreditedSpecial {
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
		| "settings"
		| "credits";
	q?: string;
	sort?: SortMode;
	date?: string;
	alternates?: string[];
	id?: string;
}
