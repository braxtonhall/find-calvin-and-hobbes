import { escHtml } from "../utils";
import { buildSubjectPath } from "../routes";
import { addressOf } from "../base-path";
import { PageSource, SubjectPage } from "./page";
import { buildFlashLabels, buildBackAndHomeButtons, buildSubjectsButton } from "./nav-buttons";
import { buildStripRowHtml, stripsOn } from "./arc";
import { formatStripCount, formatYears } from "./creators";
import { subjectYears } from "./subjects";

/**
 * No arrows to the subjects either side, as a creator's page has none: the order they are listed in
 * is when each began, which is not a sequence to step through.
 */
export function subjectPageFrom(source: PageSource, subjectId: string): SubjectPage {
	const subject = source.subjectsById.get(subjectId) ?? null;
	return { view: "subject", id: subjectId, subject, strips: subject ? stripsOn(source, subject.dates) : [] };
}

function buildNavButtons(canGoBack: boolean): string {
	return `${buildBackAndHomeButtons(canGoBack)}
		${buildSubjectsButton("detail-home")}`;
}

/**
 * A subject's page, laid out as an arc's: what it is, and every strip about it, oldest first, as
 * rows of the search results' kind, with the grid lighting all of them.
 */
export function buildSubjectHtml(page: SubjectPage, canGoBack: boolean): string {
	const { subject } = page;
	if (!subject) {
		return `<div class="collection-container">
			${buildNavButtons(canGoBack)}
			<p class="detail-missing">Subject "${escHtml(page.id)}" not found.</p>
		</div>`;
	}

	const description = subject.description ? `<p class="arc-description">${escHtml(subject.description)}</p>` : "";
	const years =
		subject.dates.length > 0
			? `<p class="collection-meta"><span class="collection-meta--label">Years:</span> ${formatYears(subjectYears(subject))}</p>`
			: "";

	return `<div class="collection-container">
		${buildNavButtons(canGoBack)}
		<div class="collection-header">
			<div class="collection-info">
				<h2 class="collection-name">${escHtml(subject.name)}</h2>
				${description}
				<p class="collection-meta"><span class="collection-meta--label">Comics:</span> ${formatStripCount(subject.dates.length)}</p>
				${years}
				<div class="detail-actions">
					<button class="copy-link-btn" id="copy-link-btn" data-href="${escHtml(addressOf(buildSubjectPath(subject.id)))}">${buildFlashLabels("Copy link", "Copied!")}</button>
				</div>
			</div>
		</div>
		<div class="arc-strips">${page.strips.map(buildStripRowHtml).join("")}</div>
	</div>`;
}
