import test from "node:test";
import assert from "node:assert/strict";
import { buildSitemapXml } from "../build-chain/sitemap";

test("lists each path under the site URL, and nothing else", () => {
	const xml = buildSitemapXml("https://example.com", ["/", "/credits", "/collection/book1"]);
	const locs = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((match) => match[1]);
	assert.deepEqual(locs, [
		"https://example.com/",
		"https://example.com/credits",
		"https://example.com/collection/book1",
	]);
});

test("escapes a path for XML", () => {
	const xml = buildSitemapXml("https://example.com", ["/a&b"]);
	assert.match(xml, /<loc>https:\/\/example\.com\/a&amp;b<\/loc>/);
});
