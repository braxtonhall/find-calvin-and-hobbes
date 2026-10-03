export interface Comic {
	date: string;
	transcript: string;
	alternate?: string;
	image?: string;
	id?: string;
	sort?: number;
	aspectRatio?: number;
	appearances?: Appearance[];
	/** The arcs the strip belongs to, by id. None does to more than one today, but nothing forbids it. */
	arcs?: string[];
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
}

export interface Collection {
	id: string;
	name: string;
	type: string;
	pub_year: number;
	pub_month: number;
	pub_day?: number;
	image: string;
	colour: boolean;
	sundays?: boolean;
	notes: string[];
	dailies: string[];
	alterations: Record<string, string>;
	specials: Record<string, string>;
	links?: { title: string; href: string }[];
	aspectRatio?: number;
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

export interface Day {
	date: string;
	weekIndex: number;
	dayOfWeek: number;
	state: string;
}

export type SortMode = "date" | "rank";

export interface Route {
	view: "landing" | "results" | "detail" | "collection" | "collections" | "arc" | "arcs" | "library" | "credits";
	q?: string;
	sort?: SortMode;
	date?: string;
	alternates?: string[];
	id?: string;
}
