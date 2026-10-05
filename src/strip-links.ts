import type { StripLinkTemplates } from "./site-config";

/**
 * The links under a strip — Read and License — written from the templates in `config.yaml`, so that
 * where they lead is the configuration's business rather than the page's.
 *
 * Which templates apply depends on what kind of strip it is, and each kind has its own fields:
 *
 * - `daily`, the day's own strip: `{{strip.date}}`, `{{strip.year}}`, `{{strip.month}}`, `{{strip.day}}`.
 * - `rerun`, a day that ran an earlier strip again: those four under `strip.original` and `strip.rerun`.
 * - `special`, a strip that never ran in the paper: `{{strip.id}}` and the four of its date.
 */

export type StripKind = "daily" | "rerun" | "special";

export type StripLinkSubject =
	| { kind: "daily"; date: string }
	| { kind: "rerun"; original: string; rerun: string }
	| { kind: "special"; id: string; date: string };

export interface StripLink {
	label: string;
	href: string;
}

const LABELS: [keyof StripLinkTemplates, string][] = [
	["readUrl", "Read"],
	["licenseUrl", "License"],
];

/** An ISO date's fields, under a name: `strip.year` is `1986`, `strip.month` is `07`. */
function dateFields(prefix: string, date: string): Record<string, string> {
	const [year, month, day] = date.split("-");
	return { [`${prefix}.date`]: date, [`${prefix}.year`]: year, [`${prefix}.month`]: month, [`${prefix}.day`]: day };
}

export function stripLinkFields(subject: StripLinkSubject): Record<string, string> {
	switch (subject.kind) {
		case "daily":
			return dateFields("strip", subject.date);
		case "rerun":
			return { ...dateFields("strip.original", subject.original), ...dateFields("strip.rerun", subject.rerun) };
		case "special":
			return { "strip.id": subject.id, ...dateFields("strip", subject.date) };
	}
}

/** A template with its `{{fields}}` filled in, each escaped for a URL. Throws at a field the strip does not have. */
export function fillLinkTemplate(template: string, fields: Record<string, string>): string {
	return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (token, name: string) => {
		if (!(name in fields)) throw new Error(`Unknown field ${token} in link template "${template}"`);
		return encodeURIComponent(fields[name]);
	});
}

/** The strip's links, in order, leaving out any without a template. */
export function stripLinks(templates: StripLinkTemplates, subject: StripLinkSubject): StripLink[] {
	const fields = stripLinkFields(subject);
	return LABELS.filter(([key]) => templates[key]).map(([key, label]) => ({
		label,
		href: fillLinkTemplate(templates[key]!, fields),
	}));
}
