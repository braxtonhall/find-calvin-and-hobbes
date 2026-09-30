import test from "node:test";
import assert from "node:assert/strict";
import { KeyPress, completesKonami, step } from "../src/life";

/** A board from rows of `#` and `.`, seven wide unless the rows say otherwise. */
function board(...rows: string[]): Uint8Array {
	return Uint8Array.from(rows.join("").split(""), (character) => (character === "#" ? 1 : 0));
}

function show(alive: Uint8Array, cols = 7): string[] {
	const rows: string[] = [];
	for (let index = 0; index < alive.length; index += cols) {
		rows.push([...alive.slice(index, index + cols)].map((value) => (value ? "#" : ".")).join(""));
	}
	return rows;
}

test("stepping the board", async (suite) => {
	await suite.test("a blinker turns over and back", () => {
		const vertical = board(".......", "..#....", "..#....", "..#....", ".......");
		const horizontal = step(vertical, 5);
		assert.deepEqual(show(horizontal), [".......", ".......", ".###...", ".......", "......."]);
		assert.deepEqual(step(horizontal, 5), vertical);
	});

	await suite.test("a block stays put", () => {
		const block = board(".......", "..##...", "..##...", ".......");
		assert.deepEqual(step(block, 4), block);
	});

	await suite.test("Sunday and Monday are not neighbours", () => {
		// Wrapped, these three would be a blinker; apart, all three die alone.
		const straddling = board(".......", "##....#", ".......");
		assert.deepEqual(show(step(straddling, 3)), [".......", ".......", "......."]);
	});

	await suite.test("a glider runs into the right edge and becomes a block", () => {
		let glider = board("....#..", ".....#.", "...###.", ".......", ".......", ".......", ".......", ".......");
		for (let generation = 0; generation < 12; generation++) glider = step(glider, 8);
		assert.deepEqual(show(glider), [
			".......",
			".......",
			".......",
			".....##",
			".....##",
			".......",
			".......",
			".......",
		]);
	});

	await suite.test("the top and bottom do not wrap", () => {
		const straddling = board("..#....", ".......", ".......", "..#....", "..#....");
		// Wrapped, the top cell would make a blinker of the bottom two; unwrapped, all three die alone.
		assert.deepEqual(show(step(straddling, 5)), [".......", ".......", ".......", ".......", "......."]);
	});
});

const CODE = [
	"ArrowUp",
	"ArrowUp",
	"ArrowDown",
	"ArrowDown",
	"ArrowLeft",
	"ArrowRight",
	"ArrowLeft",
	"ArrowRight",
	"b",
	"a",
];

/** The keys pressed a second apart, the last of them `last` milliseconds after the first. */
function presses(keys: string[], last = 5_000): KeyPress[] {
	return keys.map((key, index) => ({ key, time: (index / (keys.length - 1)) * last }));
}

test("typing the code", async (suite) => {
	await suite.test("is the ten keys", () => {
		assert.equal(completesKonami(presses(CODE)), true);
	});

	await suite.test("takes B and A in capitals", () => {
		assert.equal(completesKonami(presses([...CODE.slice(0, 8), "B", "A"])), true);
	});

	await suite.test("counts only the latest presses", () => {
		assert.equal(completesKonami(presses(["x", "ArrowUp", ...CODE])), true);
	});

	await suite.test("has ten seconds and no more", () => {
		assert.equal(completesKonami(presses(CODE, 10_000)), true);
		assert.equal(completesKonami(presses(CODE, 10_001)), false);
	});

	await suite.test("needs all ten", () => {
		assert.equal(completesKonami(presses(CODE.slice(1))), false);
		assert.equal(completesKonami(presses([...CODE, "Enter"])), false);
	});

	await suite.test("needs every key in its place", () => {
		const wrong = [...CODE];
		wrong[4] = "ArrowRight";
		assert.equal(completesKonami(presses(wrong)), false);
	});
});
