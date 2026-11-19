/*
 * The look of the Design view's canvas (look.ts resolveDesignLook, design-view.ts): the page and what is drawn on it take Paper and petrol
 * light or dark, or Obsidian's look, from a selector in the header bar; the left column and the header stay as they are. Run in node over
 * jsdom, so this says what is put on which element (the attribute, the class and the selector); the colours these select are measured in
 * the real app (check 74 of e2e-tests/design-checks.js).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { window as w, words } from "./dom.mjs";
import { FULL } from "./design-fixtures.mjs";
import { openDesign } from "./design-harness.mjs";
import { core } from "./helpers.mjs";

const { resolveDesignLook, resolveLook, LOOKS, LOOK_LABELS } = await import("./.build/look.mjs");
const { DESIGN_STRINGS } = core;
const doc = w.document;

/** The select, its canvas and the rest of the view, as a person meets them. */
function rig(opts) {
	const v = openDesign(FULL, opts);
	return {
		...v,
		dropdown: () => v.el.querySelector(".booklet-design-bar .booklet-design-look-select"),
		canvas: () => v.el.querySelector(".booklet-design-scroll"),
		choose(look) {
			const s = this.dropdown();
			s.value = look;
			s.dispatchEvent(new w.Event("change", { bubbles: true }));
		},
		dark(on) {
			doc.body.classList.toggle("theme-dark", on);
			v.events.get("css-change")();
		},
	};
}

test.afterEach(() => doc.body.classList.remove("theme-dark"));

test("with no choice in the view, the canvas takes the look a Booklet view takes", () => {
	for (const stored of [undefined, "paper-light", "paper-dark", "obsidian", "sepia", null])
		for (const dark of [false, true]) assert.equal(resolveDesignLook(stored, dark), resolveLook(stored, dark), `${String(stored)}, dark ${dark}`);
	assert.equal(resolveDesignLook(undefined, false), "paper-light");
	assert.equal(resolveDesignLook(undefined, true), "paper-dark");
});

test("a choice made in the view is any of the three looks, whatever the settings and the mode say", () => {
	for (const stored of [undefined, "paper-light", "paper-dark", "obsidian"])
		for (const dark of [false, true]) for (const look of LOOKS) assert.equal(resolveDesignLook(stored, dark, look), look);
});

test("a value that is not a look is no choice", () => {
	for (const bad of ["paper", "", 3, null, {}]) assert.equal(resolveDesignLook("paper-dark", false, bad), "paper-dark", String(bad));
});

test("the header bar has a dropdown of the three looks, named by a visible word, in the plugin's own words", () => {
	const v = rig();
	const s = v.dropdown();
	assert.ok(s, "the dropdown is in the toolbar beside Undo and Redo");
	assert.equal(s.tagName, "SELECT");
	assert.equal(s.closest(".booklet-design-bar").getAttribute("role"), "toolbar");
	assert.deepEqual([...s.options].map((o) => o.value), [...LOOKS]);
	assert.deepEqual([...s.options].map((o) => o.textContent), LOOKS.map((l) => LOOK_LABELS[l]), "the words are the settings' words");
	const label = s.closest("label");
	assert.ok(label, "a label holds it, so the word names it for a screen reader and a click on the word focuses it");
	assert.equal(words(label.querySelector(".booklet-design-look-label")), DESIGN_STRINGS["look.label"].en);
	assert.equal(s.getAttribute("aria-label"), null, "no aria-label: Obsidian would show it as a tooltip, and the label names it");
});

test("each look's words are in Spanish and French as well, and the English words are the settings' words", () => {
	for (const look of LOOKS) {
		const e = DESIGN_STRINGS[`look.${look}`];
		assert.equal(e.en, LOOK_LABELS[look]);
		assert.ok(e.es && e.fr, `look.${look} has es and fr`);
	}
	for (const k of ["look.label", "look.title"]) assert.ok(DESIGN_STRINGS[k].es && DESIGN_STRINGS[k].fr, k);
});

test("in a light Obsidian with nothing chosen the canvas, and only the canvas, is in Paper and petrol light", () => {
	const v = rig();
	const c = v.canvas();
	assert.equal(c.getAttribute("data-booklet-look"), "paper-light");
	assert.ok(c.classList.contains("booklet-view"), "the paper rules are written for .booklet-view[data-booklet-look]");
	assert.equal(v.dropdown().value, "paper-light");
	for (const outside of [v.el, v.el.querySelector(".booklet-design-left"), v.el.querySelector(".booklet-design-top"), v.el.querySelector(".booklet-design-bar"), v.el.querySelector(".booklet-design-crumb")]) {
		assert.equal(outside.getAttribute("data-booklet-look"), null, `${outside.className}: no look`);
		assert.ok(!outside.classList.contains("booklet-view"), `${outside.className}: not a .booklet-view`);
	}
	assert.equal(v.all(".booklet-view").length, 1, "nothing but the canvas is a .booklet-view");
	assert.ok(c.querySelector(".booklet-design-page"), "the page is drawn inside it");
});

test("with the settings on Obsidian the canvas has the attribute and not the class, so no paper rule reaches it", () => {
	const v = rig({ look: "obsidian" });
	assert.equal(v.canvas().getAttribute("data-booklet-look"), "obsidian");
	assert.ok(!v.canvas().classList.contains("booklet-view"));
	assert.equal(v.dropdown().value, "obsidian");
	assert.equal(v.all(".booklet-view").length, 0);
});

test("the dropdown sets the canvas to the look chosen, in the three looks and back, with nothing else changed", () => {
	const v = rig();
	for (const look of ["paper-dark", "obsidian", "paper-light", "obsidian", "paper-dark"]) {
		v.choose(look);
		assert.equal(v.canvas().getAttribute("data-booklet-look"), look);
		assert.equal(v.canvas().classList.contains("booklet-view"), look !== "obsidian");
		assert.equal(v.dropdown().value, look);
	}
	assert.equal(v.disk.writes, 0, "nothing is written to the note");
	assert.equal(v.el.getAttribute("data-booklet-look"), null);
});

test("a choice is kept while the view draws again, on another page and after a change of the note", () => {
	const v = rig();
	v.choose("obsidian");
	const labels = v.navLabels();
	assert.ok(labels.length > 2);
	v.go(labels[labels.length - 1]);
	assert.equal(v.canvas().getAttribute("data-booklet-look"), "obsidian", "another page, drawn again");
	assert.equal(v.dropdown().value, "obsidian", "the new dropdown says it");
	v.choose("paper-dark");
	v.go(labels[1]);
	assert.equal(v.canvas().getAttribute("data-booklet-look"), "paper-dark");
	assert.ok(v.canvas().classList.contains("booklet-view"));
});

test("Obsidian's mode changing moves a canvas nobody chose a look for, and leaves one that has a choice", () => {
	const v = rig();
	v.dark(true);
	assert.equal(v.canvas().getAttribute("data-booklet-look"), "paper-dark");
	assert.equal(v.dropdown().value, "paper-dark", "the dropdown follows");
	v.dark(false);
	assert.equal(v.canvas().getAttribute("data-booklet-look"), "paper-light");
	v.choose("obsidian");
	v.dark(true);
	assert.equal(v.canvas().getAttribute("data-booklet-look"), "obsidian", "a choice is kept");
	assert.ok(!v.canvas().classList.contains("booklet-view"));
	v.dark(false);
	assert.equal(v.canvas().getAttribute("data-booklet-look"), "obsidian");
});

test("the look chosen in the settings reaches an open canvas that has no choice of its own, and not one that has", () => {
	const v = rig();
	v.settings.look = "paper-dark";
	v.view.applyLook();
	assert.equal(v.canvas().getAttribute("data-booklet-look"), "paper-dark");
	v.choose("paper-light");
	v.settings.look = "obsidian";
	v.view.applyLook();
	assert.equal(v.canvas().getAttribute("data-booklet-look"), "paper-light", "the choice made in the view wins");
});

test("an open edit box is inside the canvas, so it takes the look too", () => {
	const v = rig();
	v.go("Spending");
	v.select("question", "[!text|spent]");
	assert.ok(v.editor(), "the box is open");
	assert.ok(v.canvas().contains(v.editor()));
	v.choose("paper-dark");
	assert.ok(v.canvas().contains(v.editor()), "still open and still inside it");
	assert.equal(v.canvas().getAttribute("data-booklet-look"), "paper-dark");
});
