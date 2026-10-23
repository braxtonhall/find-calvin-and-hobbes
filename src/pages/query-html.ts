import { FilterSpan, SpanKind } from "../completion";
import { escHtml } from "../utils";

/**
 * A query as the search box paints it: the filters on their pills, and the words as they are. Here
 * rather than in `views/query-input.ts` so that a page the build draws can show a query the same way.
 */

/** A filter in two parts keeps its tint on the name and marks the rest apart — see `FilterSpan`. */
const SPAN_CLASS: Record<SpanKind, string> = {
	match: "query-pill",
	name: "query-pill",
	pending: "query-pill--pending",
	invalid: "query-pill query-pill--invalid",
};

/** The query, with the filters in it painted according to how far along each one is. */
export function paintHighlights(text: string, spans: FilterSpan[]): string {
	let html = "";
	let cursor = 0;
	for (const [index, span] of spans.entries()) {
		const next = spans[index + 1];
		// A settled name and the value still being typed after it are one pill in two parts, so
		// only the outer corners of the pair are rounded.
		const joined = next?.kind === "pending" && next.start === span.end;
		const classes = SPAN_CLASS[span.kind] + (joined ? " query-pill--head" : "");
		const reason = span.reason === undefined ? "" : ` data-start="${span.start}" data-reason="${escHtml(span.reason)}"`;
		html += escHtml(text.slice(cursor, span.start));
		html += `<span class="${classes}"${reason}>${escHtml(text.slice(span.start, span.end))}</span>`;
		cursor = span.end;
	}
	return html + escHtml(text.slice(cursor));
}
