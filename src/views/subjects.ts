import "./collection.css";
import "./collections.css";
import "./arcs.css";
import "./subjects.css";

import { state } from "../state";
import { canGoBack } from "../router";
import { SubjectPage, SubjectsPage } from "../pages/page";
import { buildSubjectHtml } from "../pages/subject";
import { buildSubjectsBodyHtml, buildSubjectsHtml, subjectDays } from "../pages/subjects";
import { attachBackAndHomeHandlers } from "./nav-buttons";
import { clearCollectionSoon, highlightCollection } from "./cell-highlight";
import { renderStripSet } from "./strip-set";
import { attachTabSearch, keepsHeader, narrowTab, updateTabSearch } from "./tab-search";

/**
 * Draws the list of subjects, or — with `adopt` — takes over the one the build drew from the same
 * `page`. With the search open, only the subjects it finds, as the list of books does.
 */
export function renderSubjects(page: SubjectsPage, adopt: boolean = false, arriving: boolean = true): void {
	const element = document.getElementById("view-subjects")!;
	const results = narrowTab("subjects", page.q);
	const ids = results?.ids ?? null;
	if (adopt) {
		attachBackAndHomeHandlers(element);
		attachTabSearch(element, "subjects");
	} else if (keepsHeader(element, arriving)) {
		element.querySelector(".collections-body")!.innerHTML = buildSubjectsBodyHtml(page, ids);
		updateTabSearch(element, page.q, page.order);
	} else {
		element.innerHTML = buildSubjectsHtml(page, canGoBack(), ids);
		attachBackAndHomeHandlers(element);
		attachTabSearch(element, "subjects");
	}

	const byId = new Map(page.subjects.map((subject) => [subject.id, new Set(subjectDays(subject))]));
	element.querySelectorAll<HTMLElement>(".subject-row").forEach((row) => {
		const dates = byId.get(row.dataset.subjectId ?? "");
		if (!dates) return;
		// As the list of books does: only while the list is showing may it touch the grid.
		const show = (scroll: boolean) => element.classList.contains("active") && highlightCollection(dates, scroll);
		const clear = () => element.classList.contains("active") && clearCollectionSoon(state.tabMatchDates);
		row.addEventListener("mouseenter", () => show(false));
		row.addEventListener("focus", () => show(true));
		row.addEventListener("mouseleave", clear);
		row.addEventListener("blur", clear);
	});
}

/** Draws a subject's page, or — with `adopt` — takes over the one the build drew from the same `page`. */
export function renderSubject(page: SubjectPage, adopt: boolean = false): void {
	const element = document.getElementById("view-subject")!;
	const html = adopt ? null : buildSubjectHtml(page, canGoBack(), false);
	renderStripSet(element, html, new Set(page.subject ? subjectDays(page.subject) : []), page.strips);
}
