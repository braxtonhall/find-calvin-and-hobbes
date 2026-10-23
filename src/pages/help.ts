import { addressOf } from "../base-path";
import { HelpEntry, HelpExample, HelpForm, HelpSection, HelpValues, helpExamples, helpSections } from "../help";
import { HELP_PATH, buildTabPath } from "../routes";
import { markSpellable } from "../spelling";
import { paintHighlights } from "./query-html";
import { filterSpans } from "../completion";
import { STRIP_QUERY } from "../filter-query";
import { escHtml } from "../utils";
import { TAB_LABELS } from "./collections";
import { buildBackAndHomeButtons, buildPageTitle } from "./nav-buttons";

/** Text the site wrote, escaped, in the reader's spelling once `respell` has been at it. */
function text(value: string): string {
	return markSpellable(escHtml(value));
}

/**
 * A query in a sentence, framed and painted as the search box would paint it. Every filter on a
 * settled pill: these are fragments to read — `@in:x`, `@id:a` — rather than searches to run, and
 * one the archive would not take is no less an example for that.
 */
function sentenceQuery(query: string): string {
	const spans = filterSpans(query, null, STRIP_QUERY).map((span) => ({
		...span,
		kind: "match" as const,
		reason: undefined,
	}));
	return `<span class="help-query help-query--inline">${paintHighlights(query, spans)}</span>`;
}

/** A sentence with queries in backticks. */
function prose(sentence: string): string {
	return sentence
		.split("`")
		.map((part, index) => (index % 2 === 1 ? sentenceQuery(part) : text(part)))
		.join("");
}

/** A link to one place on this page, through the router like any other link of ours. */
function anchorHref(id: string): string {
	return escHtml(addressOf(HELP_PATH) + "#" + id);
}

/** The way to the help page from a search that found nothing: to the top of it. */
export function buildHelpLinkHtml(): string {
	return `<a class="results-help" href="${escHtml(addressOf(HELP_PATH))}">How to search</a>`;
}

/** In the menu's idiom: the name as it is written, and the slot to fill in after it. */
function formHtml(form: HelpForm): string {
	const slot = form.slot === undefined ? "" : `<span class="help-slot">${escHtml(form.slot)}</span>`;
	const gap = form.slot !== undefined && !form.syntax.endsWith(":") ? " " : "";
	return `<div class="help-form">
		<code class="help-syntax">${escHtml(form.syntax)}${gap}${slot}</code>
		<span class="help-hint">${text(form.hint)}</span>
	</div>`;
}

function valuesHtml(values: HelpValues): string {
	const rows = values.terms
		.map(
			(term) =>
				`<li><code class="help-code">${text(term.value)}</code> <span class="help-hint">${text(term.hint)}</span></li>`,
		)
		.join("");
	const kind = values.kind === undefined ? "" : `<p class="help-kind">${escHtml(values.kind)}</p>`;
	return `${kind}<ul class="help-values">${rows}</ul>`;
}

function entryHtml(entry: HelpEntry): string {
	const browse =
		entry.browse === undefined
			? ""
			: `<p class="help-note">Every one is under <a href="${escHtml(addressOf(buildTabPath(entry.browse)))}">${TAB_LABELS[entry.browse]}</a>, and the menu offers them as you type.</p>`;
	return `<div class="help-entry" id="${entry.id}">
		${entry.forms.map(formHtml).join("")}
		<div class="help-body">
			${entry.summary === undefined ? "" : `<p class="help-summary">${text(entry.summary)}</p>`}
			${entry.notes.map((note) => `<p class="help-note">${prose(note)}</p>`).join("")}
			${entry.values.map(valuesHtml).join("")}
			${browse}
		</div>
	</div>`;
}

function sectionHtml(section: HelpSection): string {
	return `<section class="help-section" id="${section.id}">
		<h3 class="help-section-heading">${escHtml(section.title)}</h3>
		${section.intro.map((sentence) => `<p class="help-intro">${prose(sentence)}</p>`).join("")}
		${section.entries.map(entryHtml).join("")}
	</section>`;
}

function examplesHtml(examples: HelpExample[]): string {
	const items = examples
		.map(
			(example) => `<li class="help-example">
				<a href="${escHtml(addressOf(example.path))}">${escHtml(example.question)}</a>
				<span class="help-query">${paintHighlights(example.query, example.spans)}</span>
			</li>`,
		)
		.join("");
	return `<section class="help-section" id="examples">
		<h3 class="help-section-heading">Examples</h3>
		<ul class="help-examples">${items}</ul>
	</section>`;
}

/**
 * How to search, as a reference: each filter and operator this site has, with the forms it is
 * written in, what it means, and the values it takes where they are few. Drawn the same for everyone.
 */
export function buildHelpHtml(canGoBack: boolean): string {
	const sections = helpSections();
	const examples = helpExamples();
	const contents = [
		...(examples.length > 0 ? [{ id: "examples", title: "Examples" }] : []),
		...sections.map((section) => ({ id: section.id, title: section.title })),
	]
		.map((item) => `<a class="help-contents-link" href="${anchorHref(item.id)}">${escHtml(item.title)}</a>`)
		.join(`<span aria-hidden="true">·</span>`);
	return `<div class="help-container">
		${buildBackAndHomeButtons(canGoBack)}
		${buildPageTitle("help-heading", "Help", addressOf(HELP_PATH))}
		<nav class="help-contents" aria-label="Contents">${contents}</nav>
		${examples.length > 0 ? examplesHtml(examples) : ""}
		${sections.map(sectionHtml).join("")}
	</div>`;
}
