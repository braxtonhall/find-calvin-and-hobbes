import "./collection.css";
import "./collections.css";
import "./arcs.css";
import "./subjects.css";

import { state } from "../state";
import { canGoBack } from "../router";
import { SubjectPage, SubjectsPage } from "../pages/page";
import { buildSubjectHtml } from "../pages/subject";
import { buildSubjectsBodyHtml, buildSubjectsHtml } from "../pages/subjects";
import { attachBackAndHomeHandlers } from "./nav-buttons";
import { attachCopyLinkHandler } from "./copy-link";
import { clearCollectionSoon, highlightCollection } from "./cell-highlight";
import { attachRowFocusHandler, attachRowHandlers } from "./result-rows";
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
		updateTabSearch(element, page.q);
	} else {
		element.innerHTML = buildSubjectsHtml(page, canGoBack(), ids);
		attachBackAndHomeHandlers(element);
		attachTabSearch(element, "subjects");
	}

	const byId = new Map(page.subjects.map((subject) => [subject.id, new Set(subject.dates)]));
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

let rowFocusAttached = false;

/**
 * Draws a subject's page, or — with `adopt` — takes over the one the build drew from the same
 * `page`. The grid shows its strips while it is open, as an arc's page shows the arc, and its dates
 * ship in the script, so a cold load lights them before the archive has arrived.
 */
export function renderSubject(page: SubjectPage, adopt: boolean = false): void {
	const element = document.getElementById("view-subject")!;
	state.collectionDateSet = new Set(page.subject?.dates ?? []);
	if (!adopt) element.innerHTML = buildSubjectHtml(page, canGoBack());
	attachBackAndHomeHandlers(element);
	attachCopyLinkHandler(element);

	const strips = element.querySelector<HTMLElement>(".arc-strips");
	if (strips) attachRowHandlers(strips);
	if (!rowFocusAttached) {
		attachRowFocusHandler(element);
		rowFocusAttached = true;
	}
}
