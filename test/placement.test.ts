import test from "node:test";
import assert from "node:assert/strict";
import { Box, place } from "../src/placement";

/** A phone-shaped viewport, and the same one with a keyboard taking the bottom half of it. */
const PHONE: Box = { top: 0, left: 0, width: 390, height: 800 };
const KEYBOARD: Box = { top: 0, left: 0, width: 390, height: 380 };

const MENU = { width: 320, height: 280 };

function box(top: number, height = 40, left = 20, width = 350): Box {
	return { top, left, height, width };
}

test("choosing a side", async (suite) => {
	await suite.test("below the anchor wherever there is room for it", () => {
		const spot = place(box(100), MENU, PHONE, 4);
		assert.equal(spot.flipped, false);
		assert.equal(spot.top, 144);
	});

	await suite.test("above it when there is not", () => {
		const spot = place(box(600), MENU, PHONE, 4);
		assert.equal(spot.flipped, true);
		assert.equal(spot.top, 600 - 4 - 280);
	});

	// The landing page: an input floated in the middle of a viewport the keyboard has cut in half,
	// scrolled just far enough to be visible, which leaves it near the bottom of the visible band.
	await suite.test("a keyboard under a centred input flips the menu above it", () => {
		const layout = place(box(320), MENU, PHONE, 4);
		const visible = place(box(320), MENU, KEYBOARD, 4);
		assert.equal(layout.flipped, false, "room below by the layout viewport, which is the bug");
		assert.equal(visible.flipped, true);
	});

	// The results page: a sticky bar at the top of the view, where the room is all below and
	// flipping above would cover the input the menu belongs to.
	await suite.test("a keyboard under a bar pinned to the top leaves the menu below it", () => {
		const spot = place(box(12), MENU, KEYBOARD, 4);
		assert.equal(spot.flipped, false);
		assert.equal(spot.top, 56);
	});

	await suite.test("neither side fitting takes the roomier one", () => {
		const squeezed: Box = { top: 0, left: 0, width: 390, height: 300 };
		assert.equal(place(box(180), MENU, squeezed, 4).flipped, true);
		assert.equal(place(box(60), MENU, squeezed, 4).flipped, false);
	});
});

test("capping the height", async (suite) => {
	await suite.test("room to spare caps nothing", () => {
		assert.equal(place(box(100), MENU, PHONE, 4).maxHeight, 280);
	});

	await suite.test("a menu taller than its room is capped to it", () => {
		// A band 380 tall, 8 off its bottom edge, an anchor ending at 140 and a 4px gap.
		const spot = place(box(100), MENU, KEYBOARD, 4);
		assert.equal(spot.flipped, false);
		assert.equal(spot.maxHeight, 228);
	});

	await suite.test("the cap never goes below what is worth showing", () => {
		const pinched: Box = { top: 0, left: 0, width: 390, height: 200 };
		const spot = place(box(90), MENU, pinched, 4);
		assert.equal(spot.maxHeight, 120);
		// Which is more room than there is, so the box gives up its gap rather than its rows.
		assert.equal(spot.top, 8);
	});

	await suite.test("a capped menu above is still measured from its anchor", () => {
		const spot = place(box(300), MENU, KEYBOARD, 4);
		assert.equal(spot.flipped, true);
		assert.equal(spot.top, 300 - 4 - spot.maxHeight);
	});
});

test("staying on the screen", async (suite) => {
	await suite.test("aligned with the anchor's near edge", () => {
		assert.equal(place(box(100, 40, 20), MENU, PHONE, 4).left, 20);
	});

	await suite.test("an anchor near the right edge pulls the box back onto the screen", () => {
		assert.equal(place(box(100, 40, 300), MENU, PHONE, 4).left, 390 - 320 - 8);
	});

	await suite.test("right-aligned puts the box's far edge on the anchor's", () => {
		assert.equal(place(box(100, 40, 40, 300), MENU, PHONE, 4, "end").left, 40 + 300 - 320);
	});

	await suite.test("a box wider than the viewport sits flush with the near edge", () => {
		assert.equal(place(box(100), { width: 500, height: 100 }, PHONE, 4).left, 8);
	});

	// A keyboard raised under a scrolled page leaves the visible band partway down the document,
	// and everything is measured against where that band is rather than where the page starts.
	await suite.test("the band's own offset is where the edges are", () => {
		const scrolled: Box = { top: 400, left: 0, width: 390, height: 380 };
		assert.equal(place(box(410), MENU, scrolled, 4).top, 454);
		assert.equal(place(box(700), MENU, scrolled, 4).flipped, true);
		// A menu with more rows than the band has room for is capped to the band and sits inside it.
		const long = place(box(420), { width: 320, height: 600 }, scrolled, 4);
		assert.equal(long.maxHeight, 308);
		assert.equal(long.top + long.maxHeight, 772);
	});

	await suite.test("a band too short for either side clamps to the band, not to the document", () => {
		const scrolled: Box = { top: 400, left: 0, width: 390, height: 200 };
		assert.equal(place(box(500), MENU, scrolled, 4).top, 408);
	});
});
