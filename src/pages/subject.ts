import { buildSubjectPath } from "../routes";
import { PageSource, SubjectPage } from "./page";
import { buildBackAndHomeButtons, buildSubjectsButton } from "./nav-buttons";
import { Comic, Subject } from "../types";
import { stripOn, stripsOn } from "./arc";
import { buildStripSetHtml } from "./strip-set";
import { subjectStripCount, subjectYears } from "./subjects";

/**
 * No arrows to the subjects either side, as a creator's page has none: the order they are listed in
 * is when each began, which is not a sequence to step through.
 */
export function subjectPageFrom(source: PageSource, subjectId: string): SubjectPage {
	const subject = source.subjectsById.get(subjectId) ?? null;
	return {
		view: "subject",
		id: subjectId,
		subject,
		strips: subject ? stripsOn(source, [], stripsAbout(source, subject)) : [],
	};
}

/** Its dailies and Sundays and its specials together, oldest first, a special after the day's own strip. */
function stripsAbout(source: PageSource, subject: Subject): (Comic | undefined)[] {
	const strips = [
		...subject.dates.map((date) => ({ date, comic: stripOn(source, date) })),
		...(subject.specials ?? []).map((special) => ({
			date: special.date,
			comic: source.comicsByDate.get(special.date)?.find((comic) => comic.id === special.id),
		})),
	];
	return strips.sort((a, b) => a.date.localeCompare(b.date)).map((strip) => strip.comic);
}

/** What it is, and every strip about it. See `buildStripSetHtml`. */
export function buildSubjectHtml(page: SubjectPage, canGoBack: boolean, withStrips = true): string {
	const { subject } = page;
	const nav = `${buildBackAndHomeButtons(canGoBack)}
		${buildSubjectsButton("detail-home")}`;
	const header = subject && {
		name: subject.name,
		...(subject.description ? { description: subject.description } : {}),
		strips: subjectStripCount(subject),
		years: subjectYears(subject),
		path: buildSubjectPath(subject.id),
	};
	return buildStripSetHtml(nav, header, `Subject "${page.id}" not found.`, page.strips, withStrips);
}
