import test from "node:test";
import assert from "node:assert/strict";
import { Completion, Row, completionsAt, describeInvalid, filterSpans } from "../src/completion";
import { FILTER_SPECS } from "../src/filter-spec";
import { registerVocabulary } from "../src/filter-vocabulary";
import { parseDateFilters, passesFilters, scanFilters } from "../src/date-query";
import { RANGE_END, RANGE_START } from "../src/constants";
import { isSabbatical } from "../src/date-utils";
import { MONTH_NAMES, WEEKDAY_NAMES, YEARS } from "../src/vocabulary";

/**
 * A caret is written into the query as `|`, because every one of these cases is about where the
 * caret is and a separate offset argument makes them unreadable.
 */
function at(marked: string): Completion | null {
	const caret = marked.indexOf("|");
	assert.notEqual(caret, -1, "mark the caret with |");
	return completionsAt(marked.slice(0, caret) + marked.slice(caret + 1), caret);
}

function names(marked: string): string[] {
	return (at(marked)?.rows ?? []).map((row) => row.name);
}

function templates(marked: string): (string | undefined)[] {
	return (at(marked)?.rows ?? []).map((row) => row.template);
}

function completions(marked: string): (string | undefined)[] {
	return (at(marked)?.rows ?? []).map((row) => row.insert);
}

/** What each row offers to write, which past the colon is the whole of what the reader sees. */
function values(marked: string): (string | undefined)[] {
	return (at(marked)?.rows ?? []).map((row) => row.value);
}

/** What each row says the value is, which for a vocabulary is the whole reason the row is legible. */
function hints(marked: string): string[] {
	return (at(marked)?.rows ?? []).map((row) => row.hint);
}

/** Only the rows of one shape, for the assertions that are about one field's worth of choices. */
function ofShape(marked: string, shape: string): (string | undefined)[] {
	return (at(marked)?.rows ?? []).filter((row) => row.template === shape).map((row) => row.value);
}

function years(marked: string): (string | undefined)[] {
	return ofShape(marked, "YYYY");
}

function months(marked: string): (string | undefined)[] {
	return ofShape(marked, "YYYY/MM");
}

/** Each span as the kind it is and the text it covers, which is the whole of what it says. */
function spans(marked: string): [string, string][] {
	const caret = marked.indexOf("|");
	const text = caret === -1 ? marked : marked.slice(0, caret) + marked.slice(caret + 1);
	return filterSpans(text, caret === -1 ? null : caret).map((span) => [span.kind, text.slice(span.start, span.end)]);
}

/** Every day the archive holds, which is what an offered value has to be able to name. */
const ARCHIVE: string[] = [];
for (let stamp = Date.parse(RANGE_START); stamp <= Date.parse(RANGE_END); stamp += 24 * 60 * 60 * 1000) {
	const date = new Date(stamp).toISOString().slice(0, 10);
	if (!isSabbatical(date)) ARCHIVE.push(date);
}

/**
 * Whether the value names at least one real strip.
 *
 * Asked of `@date:` whichever filter the value came from, because a bound is a different question:
 * `@before:1985` names a real day of the archive and then honestly matches nothing before it, and
 * that is the reader's business rather than the menu's.
 */
function namesRealStrips(name: string, value: string): boolean {
	const spelled = name === "before" || name === "after" ? "date" : name;
	const { filters } = parseDateFilters(`@${spelled}:${value}`);
	return filters !== null && ARCHIVE.some((date) => passesFilters(date, filters));
}

/**
 * Every value the menu will ever offer, over every prefix a reader could be part-way through.
 *
 * One character is enough to escape the list's own cap — no candidate has twenty siblings under a
 * shared first character — so this really does see the uncapped list rather than the first
 * screenful of it.
 */
function everyValueOffered(): { name: string; typed: string; written: string; insert: string }[] {
	const typed = ["", ...ALPHABET];
	for (const year of YEARS) {
		const long = String(year);
		typed.push(long.slice(0, 2), long.slice(0, 3), long, `${long}/`, `${long}.`, long.slice(2), `${long.slice(2)}/`);
		for (let month = 1; month <= 12; month++) {
			typed.push(`${long}/${month}`, `${long}-${String(month).padStart(2, "0")}`, `${long}/${month}/`);
			typed.push(`${long}${String(month).padStart(2, "0")}`);
			for (const day of [1, 3, 9, 10, 28, 31]) typed.push(`${long}/${month}/${day}`);
		}
	}

	const found: { name: string; typed: string; written: string; insert: string }[] = [];
	for (const spec of FILTER_SPECS) {
		if (spec.kind === "flag") continue;
		for (const value of typed) {
			const text = `@${spec.name}:${value}`;
			for (const row of completionsAt(text, text.length)?.rows ?? []) {
				if (row.value === undefined) continue;
				found.push({ name: spec.name, typed: value, written: row.value, insert: row.insert.trim() });
			}
		}
	}
	assert.ok(found.length > 1000, `only ${found.length} values to check`);
	return found;
}

const ALPHABET = [..."0123456789", ...Array.from({ length: 26 }, (_, index) => String.fromCharCode(97 + index))];

test("naming a filter", async (suite) => {
	await suite.test("a bare @ offers every filter there is", () => {
		assert.deepEqual(
			names("@|"),
			FILTER_SPECS.map((spec) => spec.name),
		);
	});

	await suite.test("a partial name narrows by prefix", () => {
		assert.deepEqual(names("@y|"), ["year"]);
		assert.deepEqual(names("@d|"), ["day", "date", "daily"]);
		assert.deepEqual(names("@da|"), ["day", "date", "daily"]);
		assert.deepEqual(names("@dat|"), ["date"]);
	});

	await suite.test("a name nothing starts with closes the menu", () => {
		assert.equal(at("@zzz|"), null);
	});

	await suite.test("a complete name still offers itself, so the colon can be accepted", () => {
		const completion = at("@year|");
		assert.deepEqual(
			completion!.rows.map((row) => row.insert),
			["@year:"],
		);
	});

	await suite.test("a valued filter inserts up to the colon and shows its first shape", () => {
		const row = at("@year|")!.rows[0];
		assert.equal(row.insert, "@year:");
		assert.equal(row.template, "YYYY");
	});

	await suite.test("a flag inserts a trailing space and offers no shape", () => {
		const row = at("@sunday|")!.rows[0];
		assert.equal(row.insert, "@sunday ");
		assert.equal(row.template, undefined);
	});

	await suite.test("the name is matched without regard to case", () => {
		assert.deepEqual(names("@YE|"), ["year"]);
	});

	await suite.test("the token spans the whole run, not just what precedes the caret", () => {
		const completion = at("@y|ear");
		assert.equal(completion!.start, 0);
		assert.equal(completion!.end, 5);
	});
});

test("offering the values", async (suite) => {
	await suite.test("@year: offers every year the archive holds", () => {
		assert.deepEqual(values("@year:|"), YEARS.map(String));
		assert.deepEqual(completions("@year:|")[0], "@year:1985 ");
	});

	await suite.test("@date: offers every year the strip ran in", () => {
		assert.deepEqual(years("@date:|"), YEARS.map(String));
		assert.deepEqual(years("@before:|"), YEARS.map(String));
		assert.deepEqual(years("@after:|"), YEARS.map(String));
	});

	// Nobody would guess from a list of years that a month or a day could go in there, so the first
	// screenful says so — with the narrower shapes of the first row, which agree with it.
	await suite.test("the narrower shapes ride along under the first row", () => {
		assert.deepEqual(values("@date:|").slice(0, 4), ["1985", "1985/11", "1985/11/18", "1986"]);
		assert.deepEqual(values("@date:1985/|"), ["1985/11", "1985/11/18", "1985/12"]);
		assert.deepEqual(values("@after:19|").slice(0, 4), ["1985", "1985/11", "1985/11/18", "1986"]);
	});

	await suite.test("a colon after a flag has nothing to offer", () => {
		assert.equal(at("@sunday:|"), null);
		assert.equal(at("@sunday:yes|"), null);
	});

	await suite.test("a colon after a name that is not a filter has nothing to offer", () => {
		assert.equal(at("@nonsense:|"), null);
	});

	// A row still knows the shape its value is an example of, and the hint beside it says which —
	// which is how a reader tells the whole year from the month under it.
	await suite.test("a row knows the shape its value is an example of", () => {
		assert.deepEqual(templates("@date:1985|"), ["YYYY", "YYYY/MM", "YYYY/MM/DD", "YYYY/MM"]);
		assert.deepEqual(templates("@date:1985/11/18|"), ["YYYY/MM/DD"]);
		assert.deepEqual(
			(at("@date:1985|")?.rows ?? []).map((row) => row.hint),
			["the whole year", "the whole month", "one day", "the whole month"],
		);
	});

	// The whole of the reason the read-only rows are gone: a row nobody can accept is not a row.
	await suite.test("a value the archive cannot start closes the menu", () => {
		assert.equal(at("@before:0|"), null);
		assert.equal(at("@date:0|"), null);
		assert.equal(at("@month:0|"), null);
		assert.equal(at("@date:1988/13|"), null);
	});

	await suite.test("every row offered can be accepted", () => {
		for (const value of everyValueOffered()) assert.ok(value.insert.startsWith(`@${value.name}:`), value.insert);
	});
});

test("typing the rest of the value in", async (suite) => {
	// Tab walks a field at a time: every year, then every month of the year that was settled, then
	// every day of that month.
	await suite.test("a field's worth of choices at a time", () => {
		assert.deepEqual(years("@date:19|"), YEARS.map(String));
		assert.deepEqual(values("@date:1985|"), ["1985", "1985/11", "1985/11/18", "1985/12"]);
		assert.deepEqual(values("@date:1985/11|").slice(0, 3), ["1985/11", "1985/11/18", "1985/11/19"]);
		assert.deepEqual(values("@date:1985/11/18|"), ["1985/11/18"]);
	});

	// A field the digits pin to one value is settled, so the rows drop to the next field down rather
	// than restating it — and a field they do not pin shows its siblings instead.
	await suite.test("a settled field is not restated", () => {
		assert.deepEqual(years("@date:198|"), ["1985", "1986", "1987", "1988", "1989"]);
		assert.deepEqual(values("@date:1988/9|").slice(0, 2), ["1988/9", "1988/9/1"]);
		assert.deepEqual(values("@date:1988/1|"), ["1988/1", "1988/1/1", "1988/10", "1988/11", "1988/12"]);
	});

	// The rule most likely to be got subtly wrong, so it gets a table of its own: the committing
	// space comes when there is nothing further Tab could add.
	await suite.test("the committing space, or not", () => {
		assert.deepEqual(completions("@month:augus|"), ["@month:august "], "a leaf commits");
		assert.deepEqual(completions("@date:198|")[0], "@date:1985", "a year with months under it does not");
		assert.deepEqual(completions("@date:1985|")[0], "@date:1985 ", "the value was already there, so it commits");
		assert.deepEqual(completions("@year:19|")[0], "@year:1985 ", "a single field is always a leaf");
		assert.deepEqual(completions("@date:1985/11/18|"), ["@date:1985/11/18 "], "a whole date is as deep as it goes");
		assert.deepEqual(completions("@date:1988/9|")[1], "@date:1988/9/1 ", "so every day commits");
	});

	await suite.test("accepting a non-leaf row twice commits", () => {
		assert.deepEqual(completions("@date:1988/|")[0], "@date:1988/1");
		assert.deepEqual(completions("@date:1988/1|")[0], "@date:1988/1 ");
	});

	await suite.test("a number commits as it was typed, rather than as a name", () => {
		assert.deepEqual(completions("@month:8|"), ["@month:8 "]);
		assert.deepEqual(completions("@day:4|"), ["@day:4 "]);
	});

	// The canonical long spelling, which is the rule the filter bar states: the readable form is the
	// teachable one.
	await suite.test("a name is completed to its long spelling", () => {
		assert.deepEqual(completions("@month:aug|"), ["@month:august "]);
		assert.deepEqual(completions("@day:sat|"), ["@day:saturday "]);
		assert.deepEqual(completions("@month:may|"), ["@month:may "]);
	});

	// A four-digit year is reached by typing either spelling of it, and both write the long one.
	await suite.test("a short year completes to the long one", () => {
		assert.deepEqual(values("@year:94|"), ["1994"]);
		assert.deepEqual(completions("@year:94|"), ["@year:1994 "]);
	});

	// A row narrower than the one above it is the same value carried deeper, never a different one:
	// `1985` never sits above `1988/11`.
	await suite.test("a narrower row extends the one above it", () => {
		const fields = (row: Row) => (row.template ?? "").split("/").length;
		for (const marked of ["@date:|", "@date:19|", "@date:1985|", "@date:1988/|", "@date:88|", "@before:9|"]) {
			const rows = at(marked)!.rows;
			for (const [index, row] of rows.entries()) {
				if (index === 0 || fields(row) <= fields(rows[index - 1])) continue;
				const above = rows[index - 1].value!;
				assert.ok(row.value!.startsWith(above), `${marked}: ${row.value} under ${above}`);
			}
		}
	});

	// Never a character rewritten that was already right: the reader's own separators, padding and
	// two-digit years survive being completed.
	await suite.test("what was typed correctly is left as it was typed", () => {
		assert.deepEqual(completions("@date:1988/09/03|"), ["@date:1988/09/03 "]);
		assert.deepEqual(completions("@date:19880903|"), ["@date:19880903 "]);
		assert.deepEqual(values("@date:1988-09|")[1], "1988-09-1");
		assert.deepEqual(values("@date:88|").slice(0, 2), ["88", "88/1"]);
	});

	// A value the archive cannot honour is still a filter the parser takes — see `DateSource` — so
	// where there is nothing to offer instead, what the reader typed is what the row accepts.
	await suite.test("a value outside the archive is still acceptable as typed", () => {
		assert.deepEqual(completions("@year:2001|"), ["@year:2001 "]);
		assert.deepEqual(completions("@date:2001|"), ["@date:2001 "]);
		// May 1994 is a sabbatical from end to end, so there is no day of it to offer.
		assert.deepEqual(completions("@date:1994/5|"), ["@date:1994/5 "]);
	});
});

test("the values the archive can offer", async (suite) => {
	// The strip starts on the 18th of November 1985, so those are the only two months of that year
	// and the 18th is the first day of the first of them.
	await suite.test("only the months and days the strip actually ran", () => {
		assert.deepEqual(months("@date:1985/|"), ["1985/11", "1985/12"]);
		assert.deepEqual(values("@date:1985/11|")[1], "1985/11/18");
	});

	await suite.test("a sabbatical is not a month to offer", () => {
		// Away from the 5th of May 1991 to February 1992: May is offered for the four days before it
		// starts, and the rest of the year is not there to be offered at all.
		assert.deepEqual(months("@date:1991/|"), ["1991/1", "1991/2", "1991/3", "1991/4", "1991/5"]);
		assert.deepEqual(values("@date:1991/5|"), ["1991/5", "1991/5/1", "1991/5/2", "1991/5/3", "1991/5/4"]);
		assert.deepEqual(months("@date:1994/|"), ["1994/1", "1994/2", "1994/3", "1994/4"]);
	});

	// Every value the menu came up with itself, as against the reader's own, which the menu accepts
	// as typed and does not vouch for — see "a value outside the archive".
	await suite.test("no value the menu offers is a day the archive does not hold", () => {
		let checked = 0;
		for (const value of everyValueOffered()) {
			if (value.written === value.typed) continue;
			assert.ok(namesRealStrips(value.name, value.written), `@${value.name}:${value.written}`);
			checked++;
		}
		assert.ok(checked > 1000, `only ${checked} values to check`);
	});

	await suite.test("every value it offers is one the parser takes", () => {
		for (const value of everyValueOffered()) {
			const matches = scanFilters(value.insert);
			assert.equal(matches.length, 1, value.insert);
			assert.equal(matches[0].valid, true, value.insert);
		}
	});

	// The invariant the whole rule exists to guarantee, and the one whose failure mode is a dead
	// Tab key: accepting the top row over and over ends in a finished filter.
	await suite.test("accepting the top row repeatedly ends in a committed filter", () => {
		for (const seed of ["@date:", "@date:19", "@date:9", "@date:1988/", "@year:", "@month:a", "@day:s", "@after:19"]) {
			let text = seed;
			let steps = 0;
			while (!text.endsWith(" ")) {
				assert.ok(steps++ < 5, `${seed} took more than five steps, at ${text}`);
				const completion = completionsAt(text, text.length);
				const row = completion?.rows.find((each) => each.insert !== undefined);
				assert.ok(row?.insert !== undefined, `${seed} ran out of rows at ${text}`);
				text = text.slice(0, completion!.start) + row.insert + text.slice(completion!.end);
			}
		}
	});
});

test("narrowing to what has been typed", async (suite) => {
	await suite.test("a name narrows by prefix, under its long spelling", () => {
		assert.deepEqual(values("@month:j|"), ["january", "june", "july"]);
		assert.deepEqual(values("@day:s|"), ["sunday", "saturday"]);
		assert.deepEqual(values("@day:m|"), ["monday"]);
		assert.deepEqual(values("@month:sept|"), ["september"]);
	});

	await suite.test("a year narrows under both of its spellings", () => {
		assert.deepEqual(values("@year:9|"), ["1990", "1991", "1992", "1993", "1994", "1995"]);
		assert.deepEqual(values("@year:8|"), ["1985", "1986", "1987", "1988", "1989"]);
		assert.deepEqual(values("@year:199|"), ["1990", "1991", "1992", "1993", "1994", "1995"]);
		assert.deepEqual(values("@year:19|"), YEARS.map(String));
	});

	await suite.test("a number narrows by prefix", () => {
		assert.deepEqual(values("@month:1|"), ["1", "10", "11", "12"]);
		assert.deepEqual(values("@day:3|"), ["3", "30", "31"]);
	});

	await suite.test("a value nothing could rescue leaves no menu either", () => {
		assert.equal(at("@year:abc|"), null);
		assert.equal(at("@month:13|"), null);
		assert.equal(at("@day:funday|"), null);
		assert.equal(at("@date:august|"), null);
	});

	// Which shapes a value could still become is no longer a row of its own, but it still decides
	// whether there is a menu at all.
	await suite.test("a value that can become nothing at all closes the menu", () => {
		assert.equal(at("@date:1988/13|"), null);
		assert.equal(at("@date:1988/9/32|"), null);
		assert.equal(at("@date:1985//11|"), null);
	});

	await suite.test("a compact date is read by width, and a whole one is complete", () => {
		assert.deepEqual(templates("@date:19880903|"), ["YYYY/MM/DD"]);
		// Its narrower shapes have no separators to write either.
		assert.deepEqual(values("@date:19880|").slice(0, 3), ["198801", "19880101", "198802"]);
	});
});

test("the two vocabularies", async (suite) => {
	// The one screen where a reader learns that `@day:` takes either kind, so both have to be on it.
	await suite.test("a bare colon shows numbers and names together", () => {
		const shown = values("@day:|");
		assert.ok(shown.includes("1"), "no numbers");
		assert.ok(shown.includes("monday"), "no names");
		assert.deepEqual(shown.slice(0, 4), ["1", "2", "3", WEEKDAY_NAMES[0]]);
		assert.deepEqual(values("@month:|").slice(0, 4), ["1", "2", "3", MONTH_NAMES[0]]);
	});

	// Which is the only screen that needs the mixing rule: digits and letters are disjoint, so the
	// first character typed settles the vocabulary on its own.
	await suite.test("one character settles which vocabulary is in play", () => {
		assert.ok(values("@day:1|")!.every((value) => /^\d+$/.test(value!)));
		assert.ok(values("@day:m|")!.every((value) => /^[a-z]+$/.test(value!)));
	});

	await suite.test("a row carries the hint of the shape it is an example of", () => {
		const rows = at("@day:|")!.rows;
		assert.equal(rows[0].hint, "1 to 31, a day of the month");
		assert.equal(rows[3].hint, "a weekday name or abbreviation");
		// Said once per run rather than on all twenty rows of it.
		assert.equal(rows[1].hint, "");
	});
});

test("how long the list gets", async (suite) => {
	// Everything the calendar can offer arrives whole; the menu scrolls, and a list with the value
	// the reader wants below the fold is better than one that never mentions it.
	await suite.test("every list the calendar offers arrives whole", () => {
		assert.equal(values("@day:|").length, 31 + WEEKDAY_NAMES.length);
		assert.equal(values("@month:|").length, 12 + MONTH_NAMES.length);
		assert.equal(values("@day:1|").length, 11);
		assert.equal(values("@year:|").length, YEARS.length);
		// The whole month, and then every day of it.
		assert.equal(values("@date:1988/9|").length, 31);
	});

	// The cap exists for exactly this: a vocabulary that arrives with the data and turns out to be
	// longer than any list the calendar could produce. Eighteen books are well under it; sixty are not.
	await suite.test("a longer vocabulary than the calendar's is cut off", () => {
		const many = Array.from({ length: 60 }, (_, index) => ({ value: `book${index}`, hint: `Book ${index}` }));
		try {
			registerVocabulary("in", () => many);
			assert.equal(values("@in:book|").length, 40);
		} finally {
			registerVocabulary("in", () => []);
		}
		assert.equal(at("@in:book|"), null);
	});
});

test("highlighting what is already there", async (suite) => {
	await suite.test("a filter that parses is covered end to end", () => {
		assert.deepEqual(spans("@year:1994|"), [["match", "@year:1994"]]);
		assert.deepEqual(spans("@sunday|"), [["match", "@sunday"]]);
	});

	await suite.test("a value still being typed is marked apart from the name it belongs to", () => {
		assert.deepEqual(spans("@year:199|"), [
			["name", "@year"],
			["pending", ":199"],
		]);
	});

	// The extent is the whole signal: the two halves close up into one pill on the keystroke that
	// makes the filter parse, and come apart again on the one that stops it parsing.
	await suite.test("typing a year in closes the pill up and opens it again", () => {
		assert.deepEqual(
			["@year|", "@year:|", "@year:1|", "@year:19|", "@year:199|", "@year:1994|"].map((marked) =>
				spans(marked)
					.map(([kind]) => kind)
					.join("+"),
			),
			["name", "name+pending", "name+pending", "match", "name+pending", "match"],
		);
	});

	// No value given yet is not a bad value given, so it waits for the caret to leave before it
	// says so — and the colon it has committed to is the part still being typed.
	await suite.test("a colon with nothing after it waits under the caret and is an error once left", () => {
		assert.deepEqual(spans("@year:|"), [
			["name", "@year"],
			["pending", ":"],
		]);
		assert.deepEqual(spans("@year: snowman|"), [["invalid", "@year:"]]);
	});

	// Which is the other half of what `begins` decides, and the half the menu no longer shows: a
	// date on its way somewhere wears the pending pill, and one that is going nowhere goes red.
	await suite.test("a date is a pill in two parts until it parses", () => {
		assert.deepEqual(spans("@date:1988/09|"), [["match", "@date:1988/09"]]);
		assert.deepEqual(spans("@date:august|"), [["invalid", "@date:august"]]);
		assert.deepEqual(spans("@date:1988/9/32|"), [["invalid", "@date:1988/9/32"]]);
		assert.deepEqual(spans("@date:1988/13|"), [
			["name", "@date"],
			["pending", ":1988/13"],
		]);
	});

	await suite.test("a filter left half-typed is a mistake once the caret has moved on", () => {
		assert.deepEqual(spans("@year|"), [["name", "@year"]]);
		assert.deepEqual(spans("@year snow|man"), [["invalid", "@year"]]);
		assert.deepEqual(spans("@year"), [["invalid", "@year"]]);
		assert.deepEqual(spans("@year:199 snow|man"), [["invalid", "@year:199"]]);
	});

	// Waiting rescues nothing here, so this one does not get the benefit of the doubt the caret
	// buys `@year:` — there is no month it could still become.
	await suite.test("a value that could never work is a mistake under the caret too", () => {
		assert.deepEqual(spans("@month:13|"), [["invalid", "@month:13"]]);
		assert.deepEqual(spans("@year:abc|"), [["invalid", "@year:abc"]]);
	});

	// The colon does nothing here — `@sunday:` searches for what `@sunday` searches for — so the
	// pill stops at the filter and leaves the stray character to look stray.
	await suite.test("a colon a flag never asked for is left out of the pill", () => {
		assert.deepEqual(spans("@sunday:|"), [["match", "@sunday"]]);
	});

	await suite.test("a value nothing will rescue is covered end to end as an error", () => {
		assert.deepEqual(spans("@month:13|"), [["invalid", "@month:13"]]);
		assert.deepEqual(spans("@day:funday|"), [["invalid", "@day:funday"]]);
		assert.deepEqual(spans("@sunday:yes|"), [["invalid", "@sunday:yes"]]);
	});

	await suite.test("every filter in the query is found, in the order they were typed", () => {
		assert.deepEqual(spans("clean @year:1988 your @month:13 room"), [
			["match", "@year:1988"],
			["invalid", "@month:13"],
		]);
	});

	await suite.test("an error carries the reason it will be shown with", () => {
		const [broken] = filterSpans("@month:13", null);
		assert.equal(broken.reason, "@month:13 — expected MM or august");
	});

	await suite.test("a filter that is fine carries no reason", () => {
		for (const span of filterSpans("@year:1988 @sunday", null)) assert.equal(span.reason, undefined);
	});
});

test("explaining a filter that will not work", async (suite) => {
	function reason(query: string): string {
		const matches = scanFilters(query);
		assert.equal(matches.length, 1, query);
		assert.equal(matches[0].valid, false, `expected "${query}" to be invalid`);
		return describeInvalid(matches[0]);
	}

	await suite.test("a bad value names the shapes that would have worked", () => {
		assert.equal(reason("@month:13"), "@month:13 — expected MM or august");
		assert.equal(reason("@year:abc"), "@year:abc — expected YYYY or YY");
		assert.equal(reason("@day:funday"), "@day:funday — expected DD or saturday");
	});

	await suite.test("a missing value says so", () => {
		assert.equal(reason("@year"), "@year needs a value — YYYY or YY");
		// True of a vocabulary too — a filter with no value has not reached the question of whether
		// the value is one the archive has.
		assert.equal(reason("@in"), "@in needs a value — book");
	});

	await suite.test("a flag carrying a value says so", () => {
		assert.equal(reason("@sunday:yes"), "@sunday takes no value");
	});
});

test("finding the token", async (suite) => {
	await suite.test("text with no @ has no menu", () => {
		assert.equal(at("snowman|"), null);
		assert.equal(at("|"), null);
		assert.equal(at("clean your room|"), null);
	});

	await suite.test("a filter mid-query is found, and the words around it are left alone", () => {
		const completion = at("clean @yea| your room");
		assert.equal(completion!.start, 6);
		assert.equal(completion!.end, 10);
		assert.deepEqual(
			completion!.rows.map((row) => row.name),
			["year"],
		);
	});

	await suite.test("whitespace ends the token, so a finished filter is behind us", () => {
		assert.equal(at("@year:1990 |"), null);
		assert.equal(at("@year:1990 snowman|"), null);
	});

	// `FILTER_PATTERN` has no word-boundary requirement, so the parser really does read this as a
	// filter. The menu agrees rather than quietly differing from what the search will do.
	await suite.test("an @ inside a word is still the token the parser will read", () => {
		assert.deepEqual(names("bill@yea|"), ["year"]);
		assert.equal(scanFilters("bill@year:1990").length, 1);
	});

	await suite.test("the nearest @ to the left wins", () => {
		assert.deepEqual(names("@day@yea|"), ["year"]);
	});

	await suite.test("a token that is not a filter shape has no menu", () => {
		assert.equal(at("@year1990|"), null);
		assert.equal(at("email@example.com|"), null);
	});
});

/**
 * `@in:`, whose values are neither a shape nor a constant but the books of the archive.
 *
 * Every case registers them and puts the empty list back, and the reset is load-bearing rather
 * than tidy: `everyValueOffered` above walks all of `FILTER_SPECS`, and `namesRealStrips` answers
 * by date — so a registration left standing would have the menu offering `book3` to a test asking
 * which day of the archive it names.
 */
test("a vocabulary that arrives with the data", async (suite) => {
	const BOOKS = [
		{ value: "book3", hint: "Yukon Ho!" },
		{ value: "book4", hint: "Weirdos From Another Planet!" },
		{ value: "complete", hint: "The Complete Calvin and Hobbes" },
		{ value: "lazysunday", hint: "The Calvin and Hobbes Lazy Sunday Book" },
	];

	function withBooks(check: () => void): void {
		try {
			registerVocabulary("in", () => BOOKS);
			check();
		} finally {
			registerVocabulary("in", () => []);
		}
	}

	// The one row before the colon still shows a shape, because there is nothing to fill in yet —
	// and `book` is a word rather than a slot, which is the whole of what the filter takes.
	await suite.test("the name row says the filter takes a book", () => {
		assert.deepEqual(names("@i|"), ["in"]);
		assert.deepEqual(templates("@in|"), ["book"]);
		assert.deepEqual(completions("@in|"), ["@in:"]);
	});

	await suite.test("a bare colon offers every book, in the order they were registered", () => {
		withBooks(() => {
			assert.deepEqual(values("@in:|"), ["book3", "book4", "complete", "lazysunday"]);
		});
	});

	/*
	 * The id is what the filter takes and the title is what a reader recognises, so the row has to
	 * carry both. Which means the hint dedupe has to be off here: it exists so that twenty rows do
	 * not all read "1 to 31, a day of the month", and a title is not that kind of hint. Two books
	 * whose titles happened to match would otherwise blank the second one out, leaving it reading as
	 * though it belonged to the row above — so a value's own hint is never treated as repetition.
	 */
	await suite.test("every row is hinted with its own book, not with the shape", () => {
		withBooks(() => {
			assert.deepEqual(
				hints("@in:|"),
				BOOKS.map((book) => book.hint),
			);
			assert.equal(
				hints("@in:|").filter((hint) => hint === "").length,
				0,
				"a blanked hint would read as belonging to the row above",
			);
		});
	});

	await suite.test("a prefix narrows the list", () => {
		withBooks(() => {
			assert.deepEqual(values("@in:book|"), ["book3", "book4"]);
			assert.deepEqual(values("@in:book3|"), ["book3"]);
			assert.deepEqual(values("@in:c|"), ["complete"]);
			assert.deepEqual(values("@in:l|"), ["lazysunday"]);
		});
	});

	// Every book is a leaf: there is nothing deeper to reach, so accepting one finishes the filter
	// off and brings the committing space with it.
	await suite.test("accepting a book commits the filter", () => {
		withBooks(() => {
			assert.deepEqual(completions("@in:book3|"), ["@in:book3 "]);
			assert.deepEqual(completions("@in:c|"), ["@in:complete "]);
		});
	});

	/*
	 * The opposite of what `@year:2001` gets, and deliberately: a year outside the archive is still
	 * a year, so the menu offers it and it honestly matches nothing. A book that is not one of the
	 * archive's is not a book at all, and a row offering it would be a row that could only lie.
	 */
	await suite.test("a value on no list is offered by nothing and closes the menu", () => {
		withBooks(() => {
			assert.equal(at("@in:snowman|"), null);
			assert.equal(at("@in:book9|"), null);
		});
	});

	await suite.test("the pill follows the book rather than a shape", () => {
		withBooks(() => {
			assert.deepEqual(spans("@in:book3|"), [["match", "@in:book3"]]);
			// Half-typed under the caret: the name is settled and the rest is on its way to `book3`.
			assert.deepEqual(spans("@in:boo|"), [
				["name", "@in"],
				["pending", ":boo"],
			]);
			// The same text with the caret elsewhere is the mistake it looks like.
			assert.deepEqual(spans("@in:boo"), [["invalid", "@in:boo"]]);
			assert.deepEqual(spans("@in:snowman"), [["invalid", "@in:snowman"]]);
		});
	});

	await suite.test("a colon with nothing after it is pending, not wrong", () => {
		withBooks(() => {
			assert.deepEqual(spans("@in:|"), [
				["name", "@in"],
				["pending", ":"],
			]);
			assert.deepEqual(spans("@in:"), [["invalid", "@in:"]]);
		});
	});

	await suite.test("the reason names the list rather than a shape", () => {
		withBooks(() => {
			const [broken] = filterSpans("@in:snowman", null);
			assert.equal(broken.reason, "@in:snowman — not a book the archive has");
		});
	});

	/*
	 * The state every load starts in and a failed fetch stays in. The affordances go quiet — no
	 * menu, and `views/filter-bar.ts` disables the button — but nothing calls the reader wrong, and
	 * a pasted `@in:book3` goes on working, because membership is read off the strips rather than
	 * off the index that did not arrive.
	 */
	await suite.test("before the books arrive, the filter is quiet rather than broken", () => {
		assert.equal(at("@in:|"), null);
		assert.equal(at("@in:book3|"), null);
		// The name is still offered: it comes from the static table, not from the archive.
		assert.deepEqual(templates("@in|"), ["book"]);
		assert.deepEqual(spans("@in:book3|"), [["match", "@in:book3"]]);
		assert.deepEqual(spans("@in:snowman|"), [["match", "@in:snowman"]]);
	});
});
