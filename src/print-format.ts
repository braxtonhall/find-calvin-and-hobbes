import type { Appearance, Comic, PrintFormat } from "./types";

/**
 * Every way a book prints a strip, in the order a list of them is written: `colour & ink`. Free of
 * the site's configuration, since the build reads it too, to check the books' pages against.
 */
export const PRINT_FORMATS: readonly PrintFormat[] = ["colour", "greyscale", "ink"];

/**
 * How a book prints a strip where its page does not say: a daily in ink, as it ran; a Sunday as the
 * book printed its Sundays, in colour or in greyscale; and a special as `comics.yaml` says it was
 * made. Nothing for a special that does not say, as none does without `colourSundays`.
 */
export function usualFormat(
	strip: { special: boolean; sunday: boolean; format?: PrintFormat },
	book: { colour?: boolean },
): PrintFormat | undefined {
	if (strip.special) return strip.format;
	if (!strip.sunday) return "ink";
	return book.colour === true ? "colour" : "greyscale";
}

/**
 * How a book printed a strip, on all its pages together. The build writes it on an appearance only
 * where it is not the usual, which is most of the archive's thirteen thousand, so it is read here.
 * None where the site has no `colourSundays`, which is what makes there be any.
 */
export function printedFormats(
	comic: Pick<Comic, "date" | "id" | "format">,
	appearance: Pick<Appearance, "formats">,
	book: { colour?: boolean } | undefined,
	colourSundays: boolean,
): PrintFormat[] {
	if (!colourSundays) return [];
	if (appearance.formats) return appearance.formats;
	const sunday = new Date(`${comic.date}T00:00:00Z`).getUTCDay() === 0;
	const usual = usualFormat({ special: comic.id !== undefined, sunday, format: comic.format }, book ?? {});
	return usual ? [usual] : [];
}
