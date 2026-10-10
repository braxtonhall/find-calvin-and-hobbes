import { escHtml } from "../utils";
import { buildComicPath, buildCreatorPath } from "../routes";
import { addressOf } from "../base-path";
import { CreatorPage, PageSource } from "./page";
import { CreditedSpecial } from "../types";
import { buildFlashLabels, buildBackAndHomeButtons, buildCreatorsButton } from "./nav-buttons";
import { buildRangeHtml } from "./collection";
import { formatStripCount, formatYears } from "./creators";
import { LINK_ICON_SVG } from "./detail";

/**
 * No arrows to the creators either side, as a book's and an arc's page have: those are in an order
 * of their own, and the people in a list are not a sequence to step through.
 */
export function creatorPageFrom(source: PageSource, creatorId: string): CreatorPage {
	return { view: "creator", id: creatorId, creator: source.creatorsById.get(creatorId) ?? null };
}

function buildNavButtons(canGoBack: boolean): string {
	return `${buildBackAndHomeButtons(canGoBack)}
		${buildCreatorsButton("detail-home")}`;
}

/**
 * Their specials, which no range holds, each by its title as a link to the day it is filed under,
 * whose page shows it. `data-date` lights that day's cell while it is hovered, as a range's ends do.
 */
function buildOtherHtml(specials: CreditedSpecial[]): string {
	if (specials.length === 0) return "";
	const items = specials
		.map(
			(special) =>
				`<li class="collection-range"><a class="collection-range-date" href="${addressOf(buildComicPath(special.date))}" data-date="${special.date}">${escHtml(special.title)}</a></li>`,
		)
		.join("");
	return `<p class="collection-section-heading">Other</p><ul class="collection-ranges creator-specials">${items}</ul>`;
}

/**
 * A creator's page, laid out as a book's: who they are, and the stretches of strips they made, with
 * the grid lighting all of them. Their strips themselves are a search away rather than listed — a
 * strip that ran for fifty years is too many rows for a page — so each range's dash is the search
 * for that range's, oldest first.
 */
export function buildCreatorHtml(page: CreatorPage, canGoBack: boolean): string {
	const { creator } = page;
	if (!creator) {
		return `<div class="collection-container">
			${buildNavButtons(canGoBack)}
			<p class="detail-missing">Creator "${escHtml(page.id)}" not found.</p>
		</div>`;
	}

	const by = `@by:${creator.id}`;
	const roles = creator.roles
		? `<p class="collection-meta"><span class="collection-meta--label">Roles:</span> ${creator.roles.map(escHtml).join(" · ")}</p>`
		: "";
	const link = creator.link
		? `<div class="detail-links"><a class="detail-read-link" href="${escHtml(creator.link)}" target="_blank" rel="noopener">About ${LINK_ICON_SVG}</a></div>`
		: "";
	const ranges = creator.ranges
		.map((range) => `<div class="collection-range">${buildRangeHtml(range, false, by)}</div>`)
		.join("");

	return `<div class="collection-container">
		${buildNavButtons(canGoBack)}
		<div class="collection-header">
			${creator.image ? `<div class="collection-cover"><img class="creator-portrait" src="${escHtml(creator.image)}" alt="${escHtml(creator.name)}" /></div>` : ""}
			<div class="collection-info">
				<h2 class="collection-name">${escHtml(creator.name)}</h2>
				<p class="collection-meta"><span class="collection-meta--label">Comics:</span> ${formatStripCount(creator.strips)}</p>
				<p class="collection-meta"><span class="collection-meta--label">Years:</span> ${formatYears(creator.years)}</p>
				${roles}
				<div class="detail-actions">
					<button class="copy-link-btn" id="copy-link-btn" data-href="${escHtml(addressOf(buildCreatorPath(creator.id)))}">${buildFlashLabels("Copy link", "Copied!")}</button>
				</div>
				${link}
			</div>
		</div>
		${ranges ? `<p class="collection-section-heading">Date Ranges</p><div class="collection-ranges">${ranges}</div>` : ""}
		${buildOtherHtml(creator.specials ?? [])}
	</div>`;
}
