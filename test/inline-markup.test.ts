import test from "node:test";
import assert from "node:assert/strict";
import { inlineHtml, markupProblem, plainText } from "../src/inline-markup";
import { loadCollectionData } from "../build-chain/collectionPages";
import { generateCollectionIndex } from "../build-chain/generateCollectionIndex";
import { CollectionIndex } from "../src/types";

test("inline markup", async (suite) => {
	await suite.test("keeps <i> and <b> as HTML and escapes the rest", () => {
		assert.equal(inlineHtml("Just <i>Packed</i> & <b>Boink</b>"), "Just <i>Packed</i> &amp; <b>Boink</b>");
		assert.equal(inlineHtml("<em>no</em>"), "&lt;em&gt;no&lt;/em&gt;");
	});

	await suite.test("drops the tags from the plain words", () => {
		assert.equal(plainText("The Days Are Just <i>Packed</i>"), "The Days Are Just Packed");
	});

	await suite.test("finds markup that is not well written", () => {
		assert.equal(markupProblem("Just <i>Packed</i>"), undefined);
		assert.equal(markupProblem("<i><b>both</b></i>"), undefined);
		assert.ok(markupProblem("Just <i>Packed"));
		assert.ok(markupProblem("Just Packed</i>"));
		assert.ok(markupProblem("<i><b>crossed</i></b>"));
		assert.ok(markupProblem("<em>other</em>"));
	});

	await suite.test("never reaches a book's name, which the search reads", () => {
		const index: CollectionIndex = JSON.parse(generateCollectionIndex(loadCollectionData()));
		for (const collection of index.collections) {
			assert.ok(!collection.name.includes("<"), `${collection.id}'s name has markup`);
			if (collection.styledName) assert.equal(plainText(collection.styledName), collection.name);
		}
		const packed = index.collections.find((collection) => collection.id === "packed");
		assert.equal(packed?.styledName, "The Days Are Just <i>Packed</i>");
	});
});
