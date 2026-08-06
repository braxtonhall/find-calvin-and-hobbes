export interface Comic {
	date: string;
	transcript: string;
	image?: string;
	id?: string;
	sort?: number;
	aspectRatio?: number;
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

export interface Route {
	view: "landing" | "results" | "detail" | "collection" | "credits";
	q?: string;
	date?: string;
	id?: string;
}
