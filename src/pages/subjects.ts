import { escHtml } from "../utils";
import { buildSubjectPath } from "../routes";
import { addressOf } from "../base-path";
import { Subject } from "../types";
import { PageSource, SubjectsPage } from "./page";
import { buildCollectionsHeaderHtml, buildNoMatchesHtml } from "./collections";
import { formatStripCount, formatYears } from "./creators";

/** Every subject, oldest first by the first strip about each — the order the build writes them in. */
export function subjectsPageFrom(source: PageSource, q?: string): SubjectsPage {
	return { view: "subjects", subjects: [...source.subjectsById.values()], ...(q === undefined ? {} : { q }) };
}

/** The years with a strip about the subject, in order. */
export function subjectYears(subject: Pick<Subject, "dates">): number[] {
	return [...new Set(subject.dates.map((date) => Number(date.slice(0, 4))))];
}

/** `1985–1995 · 36 strips`, or only the count for a subject no strip is about yet. */
export function formatSubjectMeta(subject: Pick<Subject, "dates">): string {
	const count = formatStripCount(subject.dates.length);
	return subject.dates.length > 0 ? `${formatYears(subjectYears(subject))} · ${count}` : count;
}

/**
 * A row of the list of books, with nothing where the cover goes. `data-subject-id` is what the view
 * reads to light up its strips while the row is hovered.
 */
function buildRowHtml(subject: Subject): string {
	return `<a class="collections-row subject-row" href="${escHtml(addressOf(buildSubjectPath(subject.id)))}" data-subject-id="${escHtml(subject.id)}">
			<div class="collections-info">
				<div class="collections-name">${escHtml(subject.name)}</div>
				<div class="collections-meta">${formatSubjectMeta(subject)}</div>
			</div>
		</a>`;
}

/** The list, narrowed to `ids` where a search has narrowed it. */
export function buildSubjectsBodyHtml(page: SubjectsPage, ids: ReadonlySet<string> | null = null): string {
	if (page.subjects.length === 0) return `<p class="detail-missing">Subject data not available.</p>`;
	const shown = ids === null ? page.subjects : page.subjects.filter((subject) => ids.has(subject.id));
	if (shown.length === 0) return buildNoMatchesHtml("subjects");
	return `<div class="collections-list">${shown.map(buildRowHtml).join("")}</div>`;
}

export function buildSubjectsHtml(
	page: SubjectsPage,
	canGoBack: boolean,
	ids: ReadonlySet<string> | null = null,
): string {
	return `<div class="collections-container">
		${buildCollectionsHeaderHtml("subjects", canGoBack, page.q)}
		<div class="collections-body">${buildSubjectsBodyHtml(page, ids)}</div>
	</div>`;
}
