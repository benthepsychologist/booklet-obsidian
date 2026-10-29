/*
 * A card's picture (src/screens.ts, drawPicture; SPEC section 3): a name in Booklet's icon set is drawn by Obsidian from its
 * Lucide id; when Obsidian draws nothing for it, the card falls back to its emoji, else to no picture (it shows its number).
 * Obsidian's stub (test/obsidian-stub.mjs) draws nothing for an id that starts `lucide-zzz` or `lucide-nothing`.
 */
import { window as w } from "./dom.mjs";
import test from "node:test";
import assert from "node:assert/strict";

const { drawPicture, BOOKLET_ICONS } = await import("./.build/screens.mjs");

const tile = () => w.document.createElement("div");

test("a picture: the icon if Obsidian draws it, else the emoji, else nothing; a name outside the set is no icon", () => {
	// an icon in the set that Obsidian draws
	let into = tile();
	assert.equal(drawPicture(into, "pencil", "🎨"), true);
	assert.equal(into.querySelector(".booklet-pic svg")?.getAttribute("data-icon"), "lucide-pencil", "the icon wins over the emoji");
	assert.equal(into.querySelector(".booklet-pic-emoji"), null);

	// no name in the set is one Obsidian cannot draw, so two made-up names stand in, in the set for this test only
	for (const name of ["zzz-undrawn", "nothing-here"]) {
		BOOKLET_ICONS.add(name);
		try {
			into = tile();
			assert.equal(drawPicture(into, name, "🎨"), true, `${name}: the emoji stands in`);
			assert.equal(into.querySelector(".booklet-pic svg"), null, `${name}: nothing was drawn`);
			assert.equal(into.querySelector(".booklet-pic.booklet-pic-emoji")?.textContent, "🎨");

			into = tile();
			assert.equal(drawPicture(into, name, null), false, `${name}: no emoji, no picture`);
			assert.equal(into.children.length, 0, `${name}: the empty tile is taken away`);
		} finally {
			BOOKLET_ICONS.delete(name);
		}
	}

	// a name outside the set is never handed to Obsidian
	into = tile();
	assert.equal(drawPicture(into, "not-in-the-set", "🎨"), true);
	assert.equal(into.querySelector("svg"), null);
	into = tile();
	assert.equal(drawPicture(into, "not-in-the-set", null), false);
	assert.equal(into.children.length, 0);

	// a big picture is the same tile with its size class
	into = tile();
	drawPicture(into, "pencil", null, true);
	assert.ok(into.querySelector(".booklet-pic.booklet-pic-big svg"));
});
