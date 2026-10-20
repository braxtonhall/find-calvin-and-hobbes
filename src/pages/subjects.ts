import { escHtml } from "../utils";
import { buildSubjectPath } from "../routes";
import { addressOf } from "../base-path";
import { Subject, TabOrder } from "../types";
import { PageSource, SubjectsPage } from "./page";
import { buildCollectionsHeaderHtml, buildNoMatchesHtml, orderOf, sortedByCount } from "./collections";
import { formatStripCount, formatYears } from "./strip-set";

/**
 * Every subject, oldest first by the first strip about each — the order the build writes them in —
 * or most strips first.
 */
export function subjectsPageFrom(source: PageSource, q?: string, order?: TabOrder): SubjectsPage {
	const subjects = [...source.subjectsById.values()];
	return {
		view: "subjects",
		subjects: order === "count" ? sortedByCount(subjects, subjectStripCount) : subjects,
		...(q === undefined ? {} : { q }),
		...orderOf(order),
	};
}

/** How many strips are about the subject, specials too. */
export function subjectStripCount(subject: Pick<Subject, "dates" | "specials">): number {
	return subject.dates.length + (subject.specials?.length ?? 0);
}

/** The days of the strips about the subject, in order: its dailies' and Sundays', and those its specials are filed under. */
export function subjectDays(subject: Pick<Subject, "dates" | "specials">): string[] {
	return [...subject.dates, ...(subject.specials ?? []).map((special) => special.date)].sort();
}

/** The years with a strip about the subject, in order. */
export function subjectYears(subject: Pick<Subject, "dates" | "specials">): number[] {
	return [...new Set(subjectDays(subject).map((date) => Number(date.slice(0, 4))))];
}

/** `1985–1995 · 36 strips`, or only the count for a subject no strip is about yet. */
export function formatSubjectMeta(subject: Pick<Subject, "dates" | "specials">): string {
	const count = formatStripCount(subjectStripCount(subject));
	return subjectStripCount(subject) > 0 ? `${formatYears(subjectYears(subject))} · ${count}` : count;
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
		${buildCollectionsHeaderHtml("subjects", canGoBack, page.q, page.order)}
		<div class="collections-body">${buildSubjectsBodyHtml(page, ids)}</div>
	</div>`;
}
