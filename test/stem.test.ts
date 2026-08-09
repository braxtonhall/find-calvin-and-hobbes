import test from "node:test";
import assert from "node:assert/strict";
import { stem } from "../src/stem";

// The stem itself is never shown and does not have to be a word, so these assert that forms
// agree rather than that any particular string comes out.
function agree(...words: string[]): void {
	const stems = words.map(stem);
	assert.equal(
		new Set(stems).size,
		1,
		`expected one stem, got ${words.map((word, index) => `${word} -> ${stems[index]}`).join(", ")}`,
	);
}

function differ(left: string, right: string): void {
	assert.notEqual(stem(left), stem(right), `expected ${left} and ${right} to stay apart, both gave ${stem(left)}`);
}

test("every inflection of a word reduces to one stem", () => {
	agree("check", "checks", "checked", "checking");
	agree("complain", "complains", "complained", "complaining");
	agree("stand", "stands", "standing");
	agree("snack", "snacks");
	agree("calvin", "calvin's");
	agree("hobbes", "hobbes'");
});

test("a doubled consonant and a dropped silent e both come back", () => {
	agree("stop", "stops", "stopped", "stopping");
	agree("hope", "hopes", "hoped", "hoping");
	agree("make", "makes", "making");
	agree("hurry", "hurries", "hurried", "hurrying");
	agree("box", "boxes");
	agree("watch", "watches", "watched", "watching");
});

// The rule that reunites `hope` with `hoping` is the one that could merge `hop` with `hope`,
// and these are the pairs it would take with it if its conditions were any looser.
test("words that only look inflected stay apart", () => {
	differ("car", "care");
	differ("strip", "stripe");
	differ("rob", "robe");
	differ("cure", "cur");
	differ("shine", "shin");
	differ("hop", "hope");
});

// A suffix cannot be stripped off a stem with no vowel left in it, which is the difference
// between a verb and a noun that happens to end the same way.
test("a word that merely ends in a suffix is left whole", () => {
	assert.equal(stem("thing"), stem("things"));
	assert.equal(stem("thing"), "thing");
	assert.equal(stem("king"), "king");
	assert.equal(stem("bed"), "bed");
	assert.equal(stem("bus"), "bus");
});
