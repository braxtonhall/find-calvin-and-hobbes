import { escHtml } from "../utils";
import { buildCharacterPath, buildComicPath, buildCreatorPath } from "../routes";
import { addressOf } from "../base-path";
import { ListedSpecial, Person, TabOrder } from "../types";
import { CharacterPage, CharactersPage, CreatorPage, CreatorsPage, PageSource } from "./page";
import { buildFlashLabels, buildBackAndHomeButtons, buildCharactersButton, buildCreatorsButton } from "./nav-buttons";
import { buildLinksHtml, buildRangeHtml } from "./collection";
import { buildCollectionsHeaderHtml, buildNoMatchesHtml, orderOf } from "./collections";
import { stripsOn } from "./arc";
import { buildStripSetHtml, formatStripCount, formatYears } from "./strip-set";

/**
 * The creators and the characters, each listed as a tab of Collections in the same way. Each one's
 * own page differs: a creator's is laid out as a book's, their strips as ranges, since one may have
 * made every strip of a fifty-year run; a character's as a subject's, every strip they are in.
 */

export type PeopleTab = "creators" | "characters";
export type PeoplePage = CreatorsPage | CharactersPage;

const KINDS: Record<PeopleTab, { noun: string; path: (id: string) => string }> = {
	creators: { noun: "Creator", path: buildCreatorPath },
	characters: { noun: "Character", path: buildCharacterPath },
};

export function peopleOf(page: PeoplePage): Person[] {
	return page.view === "creators" ? page.creators : page.characters;
}

/** The day they are first in, compact, as `ranges` writes one; none where they are in no strip yet. */
function firstDay(person: Person): string | undefined {
	const days = [person.ranges[0]?.slice(0, 8), person.specials?.[0]?.date.replace(/-/g, "")];
	return days.filter((day) => day !== undefined).sort()[0];
}

/** Earliest first, and anyone in no strip yet last. */
function byFirstDay(a: Person, b: Person): number {
	const [first, second] = [firstDay(a), firstDay(b)];
	if (first === second) return 0;
	if (first === undefined) return 1;
	if (second === undefined) return -1;
	return first.localeCompare(second);
}

function byStrips(a: Person, b: Person): number {
	return b.strips - a.strips;
}

/** Most strips first, those in as many by when they first appear, and any still tied by id. */
export function byAppearances(a: Person, b: Person): number {
	return byStrips(a, b) || byFirstDay(a, b) || a.id.localeCompare(b.id);
}

/** By when they first appear, those first seen the same day most strips first, and any still tied by id. */
function byDebut(a: Person, b: Person): number {
	return byFirstDay(a, b) || byStrips(a, b) || a.id.localeCompare(b.id);
}

/** Every one of `people`, by when they first appear, or most strips first. */
function ordered<T extends Person>(people: Map<string, T>, order?: TabOrder): T[] {
	return [...people.values()].sort(order === "count" ? byAppearances : byDebut);
}

export function creatorsPageFrom(source: PageSource, q?: string, order?: TabOrder): CreatorsPage {
	return {
		view: "creators",
		creators: ordered(source.creatorsById, order),
		...(q === undefined ? {} : { q }),
		...orderOf(order),
	};
}

export function charactersPageFrom(source: PageSource, q?: string, order?: TabOrder): CharactersPage {
	return {
		view: "characters",
		characters: ordered(source.charactersById, order),
		...(q === undefined ? {} : { q }),
		...orderOf(order),
	};
}

/**
 * No arrows to the people either side, as a book's and an arc's page have: those are in an order
 * of their own, and the people in a list are not a sequence to step through.
 */
export function creatorPageFrom(source: PageSource, creatorId: string): CreatorPage {
	return { view: "creator", id: creatorId, creator: source.creatorsById.get(creatorId) ?? null };
}

/** Every strip they are in, oldest first, a special after its day's own strip, as the archive orders them. */
export function characterPageFrom(source: PageSource, characterId: string): CharacterPage {
	const character = source.charactersById.get(characterId) ?? null;
	const featured = character
		? [...source.comicsByDate.values()].flat().filter((comic) => comic.characters?.includes(character.id))
		: [];
	return { view: "character", id: characterId, character, strips: stripsOn(source, [], featured) };
}

/** `1985–1995 · 36 strips`, or only the count for someone in no strip yet, as a character may be. */
export function formatPersonMeta(person: Pick<Person, "strips" | "years">): string {
	const count = formatStripCount(person.strips);
	return person.years.length > 0 ? `${formatYears(person.years)} · ${count}` : count;
}

/**
 * A row of the list of books, with the portrait where the cover goes. Where some have one and some
 * don't, the rest keep the space, so the names line up. `data-person-id` is what the view reads to
 * light up their strips while the row is hovered.
 */
function buildRowHtml(tab: PeopleTab, person: Person, portraits: boolean): string {
	const cover = portraits
		? `<div class="collections-cover">${person.image ? `<img class="person-portrait" src="${escHtml(person.image)}" alt="" loading="lazy" />` : ""}</div>`
		: "";
	return `<a class="collections-row person-row" href="${escHtml(addressOf(KINDS[tab].path(person.id)))}" data-person-id="${escHtml(person.id)}">
			${cover}
			<div class="collections-info">
				<div class="collections-name">${escHtml(person.name)}</div>
				<div class="collections-meta">${formatPersonMeta(person)}</div>
			</div>
		</a>`;
}

/** The list, narrowed to `ids` where a search has narrowed it. */
export function buildPeopleBodyHtml(page: PeoplePage, ids: ReadonlySet<string> | null = null): string {
	const tab = page.view;
	const people = peopleOf(page);
	if (people.length === 0) return `<p class="detail-missing">${KINDS[tab].noun} data not available.</p>`;
	// Whether any has a portrait is the whole list's question, so the names line up the same narrowed.
	const portraits = people.some((person) => person.image);
	const shown = ids === null ? people : people.filter((person) => ids.has(person.id));
	if (shown.length === 0) return buildNoMatchesHtml(tab);
	return `<div class="collections-list">${shown.map((person) => buildRowHtml(tab, person, portraits)).join("")}</div>`;
}

export function buildPeopleHtml(page: PeoplePage, canGoBack: boolean, ids: ReadonlySet<string> | null = null): string {
	return `<div class="collections-container">
		${buildCollectionsHeaderHtml(page.view, canGoBack, page.q, page.order)}
		<div class="collections-body">${buildPeopleBodyHtml(page, ids)}</div>
	</div>`;
}

function buildCreatorNavButtons(canGoBack: boolean): string {
	return `${buildBackAndHomeButtons(canGoBack)}
		${buildCreatorsButton("detail-home")}`;
}

/**
 * Their specials, which no range holds, each by its title as a link to the day it is filed under,
 * whose page shows it. `data-date` lights that day's cell while it is hovered, as a range's ends do.
 */
function buildOtherHtml(specials: ListedSpecial[]): string {
	if (specials.length === 0) return "";
	const items = specials
		.map(
			(special) =>
				`<li class="collection-range"><a class="collection-range-date" href="${addressOf(buildComicPath(special.date))}" data-date="${special.date}">${escHtml(special.title)}</a></li>`,
		)
		.join("");
	return `<p class="collection-section-heading">Other</p><ul class="collection-ranges person-specials">${items}</ul>`;
}

/**
 * A creator's page, laid out as a book's: who they are, the stretches of strips they made, and their
 * links out last, under Links, as a book's links are, with the grid lighting all of them. Their
 * strips themselves are a search away rather than listed — a strip that ran for fifty years is too
 * many rows for a page — so each range's dash is the search for that range's, oldest first.
 */
export function buildCreatorHtml(page: CreatorPage, canGoBack: boolean): string {
	const { creator } = page;
	if (!creator) {
		return `<div class="collection-container">
			${buildCreatorNavButtons(canGoBack)}
			<p class="detail-missing">Creator "${escHtml(page.id)}" not found.</p>
		</div>`;
	}

	const roles = creator.roles
		? `<p class="collection-meta"><span class="collection-meta--label">Roles:</span> ${creator.roles.map(escHtml).join(" · ")}</p>`
		: "";
	const ranges = creator.ranges
		.map((range) => `<div class="collection-range">${buildRangeHtml(range, false, `@by:${creator.id}`)}</div>`)
		.join("");

	return `<div class="collection-container">
		${buildCreatorNavButtons(canGoBack)}
		<div class="collection-header">
			${creator.image ? `<div class="collection-cover"><img class="person-portrait" src="${escHtml(creator.image)}" alt="${escHtml(creator.name)}" /></div>` : ""}
			<div class="collection-info">
				<h2 class="collection-name">${escHtml(creator.name)}</h2>
				<p class="collection-meta"><span class="collection-meta--label">Comics:</span> ${formatStripCount(creator.strips)}</p>
				<p class="collection-meta"><span class="collection-meta--label">Years:</span> ${formatYears(creator.years)}</p>
				${roles}
				<div class="detail-actions">
					<button class="copy-link-btn" id="copy-link-btn" data-href="${escHtml(addressOf(buildCreatorPath(creator.id)))}">${buildFlashLabels("Copy link", "Copied!")}</button>
				</div>
			</div>
		</div>
		${ranges ? `<p class="collection-section-heading">Date Ranges</p><div class="collection-ranges">${ranges}</div>` : ""}
		${buildOtherHtml(creator.specials ?? [])}
		${buildLinksHtml(creator.links ?? [])}
	</div>`;
}

/** Who they are, and every strip they are in. See `buildStripSetHtml`. */
export function buildCharacterHtml(page: CharacterPage, canGoBack: boolean): string {
	const { character } = page;
	const nav = `${buildBackAndHomeButtons(canGoBack)}
		${buildCharactersButton("detail-home")}`;
	const header = character && {
		name: character.name,
		...(character.image ? { image: character.image } : {}),
		strips: character.strips,
		years: character.years,
		path: buildCharacterPath(character.id),
	};
	return buildStripSetHtml(nav, header, `Character "${page.id}" not found.`, page.strips);
}
