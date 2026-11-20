/*
 * Stage 3 of the Design view's editor in place, run in node over jsdom with the stand-in for Obsidian: a scale's anchors as rows, a
 * listen's media and a widget's data block as controls, the `each:` picker, and the settings of the other kinds (number, text, date,
 * lines) named in words with the values the format fixes refused with a reason. Every change is one write and one step of Undo through the
 * same `changeLines` and guard as the rest; how it looks is measured in the real app (e2e check 78), which this is not.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { window as w, click, words, typeInto } from "./dom.mjs";
import { core, bookletAround } from "./helpers.mjs";
import { openDesign, doc } from "./design-harness.mjs";

const { Setting } = await import("./obsidian-stub.mjs");
const { DESIGN_STRINGS } = core;
const en = (k) => DESIGN_STRINGS[k].en;

const NOTE = (kept) =>
	bookletAround(
		[
			"> [!module|m] Week",
			"",
			"> [!activity|a repeat] The week",
			"",
			"> [!scale|clarity] How clear was the reading?",
			"> Think of the whole week.",
			"",
			"0. Not clear",
			"1. A little clear",
			"2. Clear",
			"",
			"> [!choice|tools] Which tools did you use?",
			"- [ ] Hammer",
			"- [ ] Saw",
			"",
			"> [!multi|where each:tools] Where did you use it?",
			"- [ ] Shed",
			"- [ ] Garden",
			"",
			"> [!number|sleep min:0 max:24] Hours slept",
			"",
			"> [!text|noticed] What surprised you?",
			"",
			"> [!date|when] When did it happen?",
			"",
			"> [!lines|wins earlier:3] Three things that went well",
			"",
			"> [!listen|ep1 left:60] Episode 1",
			"> ![Episode 1](https://media.example.org/e1.m4a)",
			"> Listen to the whole of it.",
			"",
			"> [!listen|ep2] Episode 2",
			"",
			"> [!listen|ep3] Episode 3",
			"> [Watch it](https://video.example.org/watch/3)",
			"",
			"> [!widget|body describe] Which muscles did you stretch?",
			"> ![[#^body-map]]",
			"",
			"> [!module|m end]",
			"",
			"> [!data|m] Data",
			"",
			"```booklet widget",
			'{ "engine": "svg-regions", "figures": [], "regions": [] }',
			"```",
			"^body-map",
			"",
			"```booklet widget",
			'{ "engine": "grid-select", "cells": [], "items": [] }',
			"```",
			"^board",
			"",
			...(kept ? ["", "%%", "> [!records] App record — do not edit below this line", "", "> [!records|m] Week", "", "```booklet answers", JSON.stringify(kept), "```", "%%", ""] : [""]),
		].join("\n"),
	);

function rig(text) {
	Setting.reset();
	const o = openDesign(text);
	const m = {
		...o,
		open: (needle) => o.select("question", needle),
		input: (label) => {
			const hit = [...o.editor().querySelectorAll("input, button, select")].filter((e) => e.getAttribute("aria-label") === label);
			assert.equal(hit.length, 1, `one control labelled ${label} (${hit.length})`);
			return hit[0];
		},
		has: (label) => [...o.editor().querySelectorAll("input, button, select")].some((e) => e.getAttribute("aria-label") === label),
		async type(el, value) {
			typeInto(el, value);
			el.dispatchEvent(new w.Event("change", { bubbles: true }));
			await o.settle();
		},
		async press(label) {
			click(m.input(label));
			await o.settle();
		},
		/** Chooses in a real <select> of the strip. */
		async choose(select, value) {
			select.value = value;
			select.dispatchEvent(new w.Event("change", { bubbles: true }));
			await o.settle();
		},
		/** The settings row (a Setting) of this name in the open editor. */
		row: (name) => {
			const hit = Setting.made.filter((s) => s.settingEl.isConnected && words(s.nameEl) === name);
			assert.equal(hit.length, 1, `one row named ${name} (${hit.length})`);
			return hit[0];
		},
		/** Chooses in a picker made with Obsidian's Setting. */
		async pick(name, value) {
			m.row(name).components[0].change(value);
			await o.settle();
		},
		strip: () => o.all(".booklet-design-editbox .booklet-design-strip-item").map((e) => e.getAttribute("data-field")),
		item: (name) => o.el.querySelector(`.booklet-design-editbox .booklet-design-strip-item[data-field="${name}"] :is(input, select, button[role="switch"])`),
		refusal: () => words(o.el.querySelector(".booklet-design-edit-refusal")),
		md: () => o.area().value.split("\n"),
		dialog: () => doc.querySelector(".booklet-design-ask"),
		async answer(label) {
			const b = [...m.dialog().querySelectorAll("button")].find((x) => words(x) === label);
			assert.ok(b, `no ${label} in the dialog`);
			click(b);
			await o.view.whenIdle();
		},
	};
	return m;
}

const line = (v, needle) => v.disk.text.split("\n").findIndex((l) => l.includes(needle));

/* ======================================================================== a scale ======================================================================== */

test("a scale opens with its anchors as rows: the number that is kept and the words, move, remove and add; each change is one write and one step", async () => {
	const v = rig(NOTE());
	v.go("The week");
	v.open("[!scale|clarity]");
	const box = v.editor();
	assert.equal(words(box.querySelector(".booklet-design-rows .setting-item-heading")), "Anchors (the number is the answer that is kept)");
	assert.equal(v.input("Anchor 1: number").value, "0");
	assert.equal(v.input("Anchor 1: words").value, "Not clear");
	assert.equal(v.input("Anchor 3: words").value, "Clear");
	assert.equal(v.input("Anchor 1: move up").disabled, true);
	assert.equal(v.input("Anchor 3: move down").disabled, true);
	assert.ok(v.has("Add an anchor"));
	assert.equal(v.el.querySelector(".booklet-design-editbox .booklet-design-field.is-desc").value, "Think of the whole week.", "the description is the field above, the anchors are the rows below");
	const before = v.disk.text;
	// words: applied when the row is left
	await v.type(v.input("Anchor 2: words"), "Some");
	assert.equal(v.disk.writes, 1);
	assert.equal(v.disk.text, before.replace("1. A little clear", "1. Some"));
	// the number is its own row, and digits only
	await v.type(v.input("Anchor 3: number"), "x");
	assert.match(v.refusal(), /^Not changed\. An anchor's number is digits only/);
	assert.equal(v.disk.writes, 1);
	assert.equal(v.input("Anchor 3: number").value, "2", "the row goes back to the note's number");
	await v.type(v.input("Anchor 3: number"), "4");
	assert.equal(v.disk.text, before.replace("1. A little clear", "1. Some").replace("2. Clear", "4. Clear"));
	// add, move, remove
	await v.press("Add an anchor");
	assert.equal(v.md().at(-1), "5. ", "the next number is the last one and one");
	assert.equal(doc.activeElement, v.input("Anchor 4: words"), "its words have the focus");
	await v.press("Anchor 4: move up");
	await v.press("Anchor 3: remove");
	assert.deepEqual(v.md(), ["> [!scale|clarity] How clear was the reading?", "> Think of the whole week.", "", "0. Not clear", "1. Some", "4. Clear"]);
	assert.equal(v.disk.writes, 5, "five changes, five writes (the refused number wrote none)");
	// every change is a step of Undo
	for (let i = 0; i < 5; i++) {
		click(v.undo());
		await v.settle();
	}
	assert.equal(v.disk.text, before, "five steps back is the note as it was");
	v.close();
});

test("a scale: removing an anchor that an answer kept uses asks first, in the open, and declining writes nothing; adding at the end asks nothing", async () => {
	const v = rig(NOTE({ clarity: 1 }));
	v.go("The week");
	v.open("[!scale|clarity]");
	const before = v.disk.text;
	await v.press("Add an anchor");
	assert.equal(v.dialog(), null, "adding at the end asks nothing");
	assert.equal(v.disk.writes, 1);
	click(v.input("Anchor 2: remove"));
	await new Promise((r) => setTimeout(r, 20));
	assert.ok(v.dialog(), "removing the anchor a kept answer picks asks");
	assert.equal(v.disk.writes, 1, "nothing is written while it asks");
	await v.answer("Cancel");
	assert.equal(v.disk.writes, 1, "declining writes nothing");
	assert.ok(v.disk.text.includes("1. A little clear"));
	assert.notEqual(v.disk.text, before);
	v.close();
});

/* ======================================================================== the strip ======================================================================== */

test("the other kinds' settings are named in words, with the line's own word after: number, text, date, lines, listen and widget", () => {
	const v = rig(NOTE());
	v.go("The week");
	const names = (needle) => {
		v.open(needle);
		const out = v.all(".booklet-design-editbox .booklet-design-strip-item").map((e) => [e.getAttribute("data-field"), words(e.querySelector(".booklet-design-strip-label, button[role=switch]"))]);
		return out;
	};
	assert.deepEqual(names("[!number|sleep"), [["id", "Id"], ["min", "Smallest number (min)"], ["max", "Largest number (max)"], ["step", "Step between numbers (step)"], ["each", "Ask once for each pick in (each)"]]);
	assert.deepEqual(names("[!text|noticed]").map((x) => x[1]), ["Id", "Big box (long)", "Ask once for each pick in (each)"]);
	assert.deepEqual(names("[!date|when]").map((x) => x[1]), ["Id", "Ask once for each pick in (each)"]);
	assert.deepEqual(names("[!lines|wins").map((x) => x[1]), ["Id", "Ask once for each pick in (each)", "How many earlier answers to suggest (earlier)"]);
	assert.deepEqual(names("[!listen|ep1").map((x) => x[1]), ["Id", "Finished when this many seconds are left (left)"]);
	assert.deepEqual(names("[!widget|body").map((x) => x[1]), ["Id", "Only shown, not answered (readonly)", "Show what each part says (describe)", "Ask once for each pick in (each)", "How many earlier answers to suggest (earlier)"]);
	v.close();
});

test("min, max, step, earlier and left take the values the format fixes: a number is written, anything else is refused with a reason and the field goes back; empty takes the setting off", async () => {
	const v = rig(NOTE());
	v.go("The week");
	v.open("[!number|sleep");
	const before = v.disk.text;
	await v.type(v.item("max"), "many");
	assert.match(v.refusal(), /^Not changed\. `max` takes a number, such as 0, 12 or 2\.5\./);
	assert.equal(v.disk.writes, 0);
	assert.equal(v.item("max").value, "24");
	await v.type(v.item("max"), "12.5");
	assert.equal(v.disk.text, before.replace("max:24", "max:12.5"));
	await v.type(v.item("step"), "0.5");
	assert.ok(v.disk.text.includes("[!number|sleep min:0 max:12.5 step:0.5]"));
	await v.type(v.item("min"), "");
	assert.ok(v.disk.text.includes("[!number|sleep max:12.5 step:0.5]"), "empty takes it off");
	assert.equal(v.item("step").inputMode, "decimal");
	assert.equal(v.disk.writes, 3);
	v.open("[!lines|wins");
	assert.equal(v.item("earlier").inputMode, "numeric");
	await v.type(v.item("earlier"), "-1");
	assert.match(v.refusal(), /`earlier` takes a whole number written in digits/);
	await v.type(v.item("earlier"), "5");
	assert.ok(v.disk.text.includes("[!lines|wins earlier:5]"));
	v.open("[!listen|ep1");
	await v.type(v.item("left"), "1m");
	assert.match(v.refusal(), /`left` takes a whole number of seconds/);
	await v.type(v.item("left"), "90");
	assert.ok(v.disk.text.includes("[!listen|ep1 left:90]"));
	v.close();
});

test("the each: picker lists the choices, multis and widgets of the activity and the data blocks in reach, never the question itself; choosing writes, nothing takes it off", async () => {
	const v = rig(NOTE());
	v.go("The week");
	v.open("[!multi|where");
	const sel = v.item("each");
	assert.equal(sel.tagName, "SELECT");
	assert.equal(sel.value, "tools");
	assert.deepEqual([...sel.options].map((o) => [o.value, o.textContent]), [["", "Nothing: asked once"], ["tools", "tools (choice)"], ["body", "body (widget)"]]);
	const before = v.disk.text;
	await v.choose(sel, "body");
	assert.equal(v.disk.text, before.replace("each:tools", "each:body"));
	assert.equal(v.disk.writes, 1);
	await v.choose(v.item("each"), "");
	assert.equal(v.disk.text, before.replace(" each:tools", ""));
	assert.equal(v.item("each").value, "");
	// a question with none: the picker offers every source, and the choice that is a source itself is not a follow-up
	v.open("[!number|sleep");
	assert.deepEqual([...v.item("each").options].map((o) => o.value), ["", "tools", "where", "body"], "the multi is a source now that it has no each: of its own");
	await v.choose(v.item("each"), "tools");
	assert.ok(v.disk.text.includes("[!number|sleep min:0 max:24 each:tools]"));
	// a source the line names that the note does not have is listed, as the line says
	v.open("[!lines|wins");
	assert.equal(v.item("each").value, "");
	v.close();
	const odd = rig(NOTE().replace("[!lines|wins earlier:3]", "[!lines|wins each:ghost]"));
	odd.go("The week");
	odd.open("[!lines|wins");
	assert.equal(odd.item("each").value, "ghost");
	assert.equal([...odd.item("each").options].at(-1).textContent, "ghost (not found here)");
	odd.close();
});

test("the each: picker goes back to what the note has when the change it made is declined, even though it still has the focus (found in the real app, e2e check 80)", async () => {
	const v = rig(NOTE({ where: [1] }));
	v.go("The week");
	v.open("[!multi|where");
	const before = v.disk.text;
	const sel = v.item("each");
	sel.focus();
	assert.equal(doc.activeElement, sel);
	sel.value = "body";
	sel.dispatchEvent(new w.Event("change", { bubbles: true }));
	await new Promise((r) => setTimeout(r, 20));
	assert.ok(v.dialog(), "a kept answer exists, so changing how the question is asked asks first");
	sel.focus(); // the focus is on the picker again when the dialog is answered, as the real app leaves it (e2e check 80)
	await v.answer("Cancel");
	assert.equal(v.disk.text, before, "declining writes nothing");
	assert.equal(v.item("each").value, "tools", "and the picker reads what the note has again, not what was declined");
	v.close();
});

/* ======================================================================== listen ======================================================================== */

test("a listen's media is two controls, its address and its name, under its words; they write the media line and no other, one step each", async () => {
	const v = rig(NOTE());
	v.go("The week");
	v.open("[!listen|ep1");
	const box = v.editor();
	assert.equal(words(box.querySelector(".booklet-design-rows .setting-item-heading")), "Media");
	assert.equal(v.input("Media address").value, "https://media.example.org/e1.m4a");
	assert.equal(v.input("Name of the media").value, "Episode 1");
	assert.equal(box.querySelector(".booklet-design-field.is-desc").value, "Listen to the whole of it.", "the words are the lines apart from the media");
	assert.equal(box.querySelector(".booklet-design-rows"), box.querySelector(".booklet-design-rows"));
	const before = v.disk.text;
	await v.type(v.input("Media address"), "https://media.example.org/e2.m4a");
	assert.equal(v.disk.text, before.replace("e1.m4a", "e2.m4a"));
	await v.type(v.input("Name of the media"), "Episode One");
	assert.equal(v.disk.text, before.replace("e1.m4a", "e2.m4a").replace("![Episode 1]", "![Episode One]"));
	assert.equal(v.disk.writes, 2);
	// a refusal is said, and the control goes back
	await v.type(v.input("Media address"), "https://media.example.org/watch");
	assert.match(v.refusal(), /^Not changed\. An embed's address ends in an audio or video extension/);
	assert.equal(v.input("Media address").value, "https://media.example.org/e2.m4a");
	assert.equal(v.disk.writes, 2);
	// the description is written around the media, which stays where it is
	const area = box.querySelector(".booklet-design-field.is-desc");
	await v.type(area, "Listen to the whole of it, twice.");
	assert.ok(v.disk.text.includes("> ![Episode One](https://media.example.org/e2.m4a)\n> Listen to the whole of it, twice."));
	for (let i = 0; i < 3; i++) {
		click(v.undo());
		await v.settle();
	}
	assert.equal(v.disk.text, before);
	v.close();
});

test("a listen with a link has no name control apart from the link's words, and says the person can only tick it; one with no media adds it when an address is typed", async () => {
	const v = rig(NOTE());
	v.go("The week");
	v.open("[!listen|ep3");
	assert.equal(v.input("Media address").value, "https://video.example.org/watch/3");
	assert.equal(v.input("Name of the media").value, "Watch it");
	assert.match(words(v.editor()), /a link, so the person answering can only tick it as done/);
	v.open("[!listen|ep2");
	assert.equal(v.input("Media address").value, "");
	assert.equal(v.has("Name of the media"), false);
	const before = v.disk.text;
	await v.type(v.input("Media address"), "media/e2.mp3");
	assert.equal(v.disk.text, before.replace("> [!listen|ep2] Episode 2\n", "> [!listen|ep2] Episode 2\n> ![Episode 2](media/e2.mp3)\n"));
	assert.equal(v.disk.writes, 1);
	assert.equal(v.input("Media address").value, "media/e2.mp3", "the control is drawn for the media it has now");
	assert.equal(v.input("Name of the media").value, "Episode 2");
	// an address that is no playable file is a link
	click(v.undo());
	await v.settle();
	assert.equal(v.disk.text, before);
	v.open("[!listen|ep2");
	await v.type(v.input("Media address"), "https://video.example.org/watch/2");
	assert.ok(v.disk.text.includes("> [Episode 2](https://video.example.org/watch/2)"));
	v.close();
});

test("a media line the controls cannot show is said in words, the Markdown opens, and nothing is rewritten", () => {
	const v = rig(NOTE().replace("> ![Episode 1](https://media.example.org/e1.m4a)", "> ![Episode 1][ref]"));
	v.go("The week");
	v.open("[!listen|ep1");
	assert.match(words(v.editor()), /a media line the controls cannot show/);
	assert.equal(v.has("Media address"), false);
	assert.equal(v.editor().querySelector("details").open, true, "the Markdown is open");
	v.close();
});

/* ======================================================================== widget ======================================================================== */

test("a widget's data block is a picker of the blocks it can see, with the engine said and a button to the block's own Markdown; its JSON is never rewritten by a control", async () => {
	const v = rig(NOTE());
	v.go("The week");
	v.open("[!widget|body");
	const box = v.editor();
	assert.equal(words(box.querySelector(".booklet-design-rows .setting-item-heading")), "Data block");
	const sel = v.row("Data block it draws").components[0].selectEl;
	assert.deepEqual([...sel.options].map((o) => [o.value, o.textContent]), [["body-map", "body-map (svg-regions)"], ["board", "board (grid-select)"]]);
	assert.equal(sel.value, "body-map");
	assert.match(words(box), /Drawn by the svg-regions engine\. Its data is JSON, so it is edited in its own Markdown\./);
	assert.equal(box.querySelector(".booklet-design-field.is-desc").value, "", "no words under it");
	const before = v.disk.text;
	await v.pick("Data block it draws", "board");
	assert.equal(v.disk.text, before.replace("![[#^body-map]]", "![[#^board]]"));
	assert.equal(v.disk.writes, 1);
	assert.match(words(v.editor()), /Drawn by the grid-select engine/);
	// the button opens the block's own Markdown: the fence is a block of its own, shown with its text
	await v.press("Open the data block board");
	assert.match(v.area().value, /^```booklet widget\n\{ "engine": "grid-select"/);
	assert.equal(v.disk.writes, 1, "opening it wrote nothing");
	v.close();
});

test("a widget with no embed gets one when a block is chosen; one whose block is not in reach says so", async () => {
	const v = rig(NOTE().replace("> ![[#^body-map]]\n", ""));
	v.go("The week");
	v.open("[!widget|body");
	const sel = v.row("Data block it draws").components[0].selectEl;
	assert.equal(sel.value, "");
	assert.equal(sel.options[0].textContent, "Choose a data block");
	const before = v.disk.text;
	await v.pick("Data block it draws", "board");
	assert.equal(v.disk.text, before.replace("describe] Which muscles did you stretch?\n", "describe] Which muscles did you stretch?\n> ![[#^board]]\n"));
	v.close();
	const lost = rig(NOTE().replace("![[#^body-map]]", "![[#^nowhere]]"));
	lost.go("The week");
	lost.open("[!widget|body");
	assert.match(words(lost.editor()), /The data block nowhere is not one this widget can see/);
	assert.equal([...lost.row("Data block it draws").components[0].selectEl.options].at(-1).textContent, "nowhere (not found here)");
	lost.close();
});

/* ======================================================================== the box ======================================================================== */

test("every new string has Spanish and French, and the strip's words for each kind that has controls are all in the table", () => {
	for (const k of Object.keys(DESIGN_STRINGS).filter((k) => /^(setting|each|media|widget)\./.test(k))) {
		assert.ok(DESIGN_STRINGS[k].es && DESIGN_STRINGS[k].fr, `${k} has es and fr`);
	}
	assert.equal(en("setting.long"), "Big box");
});
