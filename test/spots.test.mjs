/*
 * The spot drawings (src/spots.ts): a flat illustration for some of Booklet's icon names, shown in a card's picture tile by
 * the paper looks. spotFor says which names have one; drawPicture puts the spot in the tile beside the line icon.
 */
import { window as w } from "./dom.mjs";
import test from "node:test";
import assert from "node:assert/strict";

import esbuild from "esbuild";

// src/spots.ts imports nothing, so this test bundles it itself (test/build-for-tests.mjs builds drawPicture and the icon set)
await esbuild.build({ entryPoints: ["src/spots.ts"], bundle: true, format: "esm", platform: "neutral", target: "es2021", outfile: "test/.build/spots.mjs", logLevel: "warning" });
const { SPOTS, spotFor } = await import("./.build/spots.mjs");
const { drawPicture, BOOKLET_ICONS } = await import("./.build/screens.mjs");

test("spotFor: a name with a spot gives its markup, any other name gives null", () => {
	assert.equal(Object.keys(SPOTS).length, 24);
	for (const name of Object.keys(SPOTS)) {
		assert.ok(BOOKLET_ICONS.has(name), `${name} is in Booklet's icon set`);
		assert.match(spotFor(name) ?? "", /^<svg viewBox="0 0 100 100">.*<\/svg>$/, name);
	}
	assert.ok(spotFor("scale"));
	assert.equal(spotFor("pencil"), null, "an icon with no spot");
	assert.equal(spotFor(null), null);
	assert.equal(spotFor(""), null);
	assert.equal(spotFor("constructor"), null, "an inherited property is not a name");
	assert.equal(spotFor("__proto__"), null);
});

test("no spot carries a colour, a style or script", () => {
	for (const [name, markup] of Object.entries(SPOTS)) {
		assert.doesNotMatch(markup, /style=|fill="|stroke="|<script|on[a-z]+=|href/, name);
	}
});

test("drawPicture: a name with a spot gets .booklet-spot beside the line icon; a name without keeps just the icon", () => {
	let into = w.document.createElement("div");
	assert.equal(drawPicture(into, "scale", null), true);
	const tile = into.querySelector(".booklet-pic");
	assert.ok(tile?.classList.contains("booklet-pic-spot"));
	assert.equal(tile?.querySelector("svg[data-icon]")?.getAttribute("data-icon"), "lucide-scale", "the line icon is still drawn");
	const spot = tile?.querySelector("svg.booklet-spot");
	assert.ok(spot, "the spot is in the tile");
	assert.equal(spot.getAttribute("aria-hidden"), "true");
	assert.equal(spot.getAttribute("viewBox"), "0 0 100 100");
	assert.equal(spot.querySelectorAll("*").length, 7, "scale has seven shapes");
	assert.equal(spot.querySelector("circle.w.l")?.getAttribute("r"), "11", "classes and attributes came across");

	into = w.document.createElement("div");
	assert.equal(drawPicture(into, "pencil", "🎨"), true);
	assert.equal(into.querySelector(".booklet-spot"), null);
	assert.equal(into.querySelector(".booklet-pic-spot"), null);

	// an emoji tile stays an emoji; a name outside the set gets no spot
	into = w.document.createElement("div");
	assert.equal(drawPicture(into, "not-in-the-set", "🎨"), true);
	assert.equal(into.querySelector(".booklet-spot"), null);
	assert.equal(into.querySelector(".booklet-pic-emoji")?.textContent, "🎨");
});

test("every spot draws all of its shapes", () => {
	for (const [name, markup] of Object.entries(SPOTS)) {
		const into = w.document.createElement("div");
		drawPicture(into, name, null, true);
		const n = into.querySelector(".booklet-spot")?.querySelectorAll("*").length;
		assert.equal(n, (markup.match(/<[a-z]+\b/g) ?? []).length - 1, `${name}: shapes drawn`);
	}
});
