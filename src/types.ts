export interface Comic {
	date: string;
	transcript: string;
	alternate?: string;
	image?: string;
	id?: string;
	sort?: number;
	aspectRatio?: number;
	appearances?: Appearance[];
}

export interface Appearance {
	collection: string;
	edition?: string;
	volume?: number;
	pages: number[];
}

export interface Edition {
	label: string;
	isbn?: string[];
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

export interface Day {
	date: string;
	weekIndex: number;
	dayOfWeek: number;
	state: string;
}

export type SortMode = "date" | "rank";

export interface Route {
	view: "landing" | "results" | "detail" | "collection" | "credits";
	q?: string;
	sort?: SortMode;
	date?: string;
	id?: string;
}
