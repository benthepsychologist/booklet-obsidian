/*
 * Stage 4 of the Design view's editor in place, run in node over jsdom with the stand-in for Obsidian: the fold switch on a callout, the
 * pickers (an activity's tab, a page's parent, what a copy button copies), the kept entries' switch, and the hint and the solution under a
 * question as fields. Every change is one write and one step of Undo through the same `changeLines` and guard as the rest, and the note is
 * the only truth: what is shown is read back from it. How it looks is measured in the real app, which this is not.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { window as w, click, words, typeInto } from "./dom.mjs";
import { core, bookletAround } from "./helpers.mjs";
import { openDesign, doc } from "./design-harness.mjs";

const { Setting } = await import("./obsidian-stub.mjs");
const { DESIGN_STRINGS } = core;
const en = (k) => DESIGN_STRINGS[k].en;

const NOTE = bookletAround(
	[
		"> [!module|m] Week",
		"",
		"> [!tab|learn] Learn",
		"",
		"> [!tab] This month",
		"",
		"> [!activity|alpha tab:learn repeat] Alpha",
		"",
		"> [!text|why long] Why?",
		"> Think about it.",
		"",
		"> [!hint]- Hint",
		"> Look at the moon.",
		"",
		"> [!solution]- Model answer",
		"> Because.",
		"> Really.",
		"",
		"> [!choice|pick] Which?",
		"- [ ] One",
		"- [ ] Two",
		"",
		"> [!number|n] How many?",
		"",
		"> [!copy|go of:why,why/solution,^block,gone] Copy for my tutor",
		"> Please mark.",
		"",
		"> [!tip]- A tip",
		"> Tip words.",
		"",
		"> [!note] A plain note",
		"> Note words.",
		"",
		"> [!note]+ Open note",
		"> Open words.",
		"",
		"> [!activity|beta tab:gone] Beta",
		"",
		"> [!activity|gamma entries:folded] Gamma",
		"",
		"> [!activity|delta repeat entries:open] Delta",
		"",
		"> [!module|m end]",
		"",
		"> [!activity|bare repeat] Bare activity",
		"",
	].join("\n"),
);

const PAGES = bookletAround(
	[
		"> [!activity|d] Delta pages",
		"",
		"> [!tab|t1] One tab",
		"",
		"> [!page|p1] First",
		"",
		"> [!page|p2 parent:p1] Second",
		"",
		"> [!page|p3 parent:p2] Third",
		"",
		"> [!page|p4] Fourth",
		"",
		"> [!page|p5 parent:ghost] Fifth",
		"",
		"> [!tab|t2] Two tabs",
		"",
		"> [!page|q1] Other tab",
		"",
	].join("\n"),
);

const STEPS = bookletAround(
	[
		"> [!module|m] M",
		"",
		"> [!activity|steps] Steps",
		"",
		"> [!group] Step one",
		"> Setup words.",
		">",
		"> > [!choice|c1] Pick?",
		"> - [ ] A",
		"> - [ ] B",
		">",
		"> > [!hint]-",
		"> > Words that help.",
		"",
		"> [!group]- A folded group",
		"> Inside words.",
		"",
		"> [!choice|bare] Bare question?",
		"- [ ] x",
		"- [ ] y",
		"",
		"> [!hint]- Hint",
		"> - one",
		"> - two",
		"",
		"> [!text|twice] Two hints",
		"",
		"> [!hint]- First",
		"> a",
		"",
		"> [!hint]- Second",
		"> b",
		"",
		"> [!module|m end]",
		"",
	].join("\n"),
);

function rig(text) {
	Setting.reset();
	const o = openDesign(text);
	const m = {
		...o,
		openQ: (needle) => o.select("question", needle),
		openC: (needle) => o.select("callout", needle),
		openG: (needle) => o.select("group", needle),
		openPage: () => click(o.el.querySelector(".booklet-design-page-head .booklet-design-page-edit")),
		/** The control of the box with this accessible label (an aria-label, or a name made from one). */
		ctl: (label) => {
			const hit = [...o.editor().querySelectorAll("input, button, select, textarea")].filter((e) => {
				if (e.getAttribute("aria-label") === label) return true;
				return false;
			});
			assert.equal(hit.length, 1, `one control labelled ${label} (${hit.length})`);
			return hit[0];
		},
		has: (label) => [...o.editor().querySelectorAll("input, button, select, textarea")].some((e) => e.getAttribute("aria-label") === label),
		async type(el, value) {
			typeInto(el, value);
			el.dispatchEvent(new w.Event("change", { bubbles: true }));
			await o.settle();
		},
		async press(el) {
			click(el);
			await o.settle();
		},
		async choose(select, value) {
			select.value = value;
			select.dispatchEvent(new w.Event("change", { bubbles: true }));
			await o.settle();
		},
		item: (name) => o.el.querySelector(`.booklet-design-editbox .booklet-design-strip-item[data-field="${name}"]`),
		sel: (name) => o.el.querySelector(`.booklet-design-editbox .booklet-design-strip-item[data-field="${name}"] select`),
		fold: () => o.el.querySelector(`.booklet-design-editbox .booklet-design-strip-item[data-field="fold"] button[role="switch"]`),
		refusal: () => words(o.el.querySelector(".booklet-design-edit-refusal")),
		md: () => o.area().value.split("\n"),
		dialog: () => doc.querySelector(".booklet-design-ask"),
		async undoAll(n) {
			for (let i = 0; i < n; i++) {
				click(o.undo());
				await o.settle();
			}
		},
		helpEl: (kind) => o.el.querySelector(`.booklet-design-editbox .booklet-design-help[data-help="${kind}"]`),
		strip: () => o.all(".booklet-design-editbox .booklet-design-strip-item").map((e) => e.getAttribute("data-field")),
	};
	return m;
}

const labels = (sel) => [...sel.options].map((o) => [o.value, o.textContent]);

/* ======================================================================== the fold switch ======================================================================== */

test("fold: a callout that can fold has a switch for starting folded; pressing it writes the one character, once, and Undo gives the note back", async () => {
	const v = rig(NOTE);
	v.go("Alpha");
	v.openC("[!tip]- A tip");
	assert.ok(v.fold(), "a tip has the switch");
	assert.equal(words(v.fold()), en("fold.switch"));
	assert.equal(v.fold().getAttribute("aria-checked"), "true");
	const before = v.disk.text;
	await v.press(v.fold());
	assert.equal(v.disk.writes, 1);
	assert.equal(v.disk.text, before.replace("> [!tip]- A tip", "> [!tip] A tip"));
	assert.equal(v.fold().getAttribute("aria-checked"), "false", "the switch reads the note");
	assert.equal(v.md()[0], "> [!tip] A tip", "the Markdown follows");
	await v.press(v.fold());
	assert.equal(v.disk.text, before, "on again is the same bytes");
	assert.equal(v.disk.writes, 2);
	await v.undoAll(2);
	assert.equal(v.disk.text, before);
	assert.equal(v.fold().getAttribute("aria-checked"), "true");
	v.close();
});

test("fold: a plain callout is off, one written with + is off and says so in words, and turning it on writes - in its place; a group folds too", async () => {
	const v = rig(NOTE);
	v.go("Alpha");
	v.openC("[!note] A plain note");
	assert.equal(v.fold().getAttribute("aria-checked"), "false");
	assert.equal(v.item("fold").querySelector(".booklet-design-strip-label").hidden, true, "no note about +");
	const before = v.disk.text;
	await v.press(v.fold());
	assert.equal(v.disk.text, before.replace("> [!note] A plain note", "> [!note]- A plain note"));
	v.openC("[!note]+ Open note");
	assert.equal(v.fold().getAttribute("aria-checked"), "false");
	assert.equal(v.item("fold").querySelector(".booklet-design-strip-label").hidden, false);
	assert.equal(words(v.item("fold").querySelector(".booklet-design-strip-label")), en("fold.plus"));
	const mid = v.disk.text;
	await v.press(v.fold());
	assert.equal(v.disk.text, mid.replace("> [!note]+ Open note", "> [!note]- Open note"));
	v.close();
	const g = rig(STEPS);
	g.go("Steps");
	g.openG("[!group]- A folded group");
	assert.equal(g.fold().getAttribute("aria-checked"), "true");
	const gb = g.disk.text;
	await g.press(g.fold());
	assert.equal(g.disk.text, gb.replace("> [!group]- A folded group", "> [!group] A folded group"));
	g.close();
});

test("fold: a block with no fold in the format has no switch (a question, an activity, a page, a copy button)", () => {
	const v = rig(NOTE);
	v.go("Alpha");
	v.openQ("[!text|why");
	assert.equal(v.fold(), null);
	v.openC("[!copy|go");
	assert.equal(v.fold(), null);
	v.close();
	const p = rig(PAGES);
	p.go("Second");
	p.openPage();
	assert.equal(p.fold(), null, "a page is never folded");
	p.close();
});

/* ======================================================================== the tab picker ======================================================================== */

test("tab: an activity's tab is a picker of its module's tabs; choosing writes only that word, none takes it off, and a tab that is gone is kept and said so", async () => {
	const v = rig(NOTE);
	v.go("Alpha");
	v.openPage();
	const sel = v.sel("tab");
	assert.equal(sel.tagName, "SELECT");
	assert.deepEqual(labels(sel), [["", en("tab.none")], ["learn", "Learn (learn)"], ["this-month", "This month (this-month)"]]);
	assert.equal(sel.value, "learn");
	const before = v.disk.text;
	await v.choose(sel, "this-month");
	assert.equal(v.disk.text, before.replace("alpha tab:learn repeat", "alpha tab:this-month repeat"));
	assert.equal(v.disk.writes, 1);
	await v.choose(v.sel("tab"), "");
	assert.equal(v.disk.text, before.replace("alpha tab:learn repeat", "alpha repeat"));
	await v.undoAll(2);
	assert.equal(v.disk.text, before);
	assert.equal(v.sel("tab").value, "learn");
	v.close();
	// a tab that is not there: kept, in words, and not rewritten by anything else
	const g = rig(NOTE);
	g.go("Beta");
	g.openPage();
	assert.deepEqual(labels(g.sel("tab")).at(-1), ["gone", en("tab.missing").replace("{id}", "gone")]);
	assert.equal(g.sel("tab").value, "gone");
	const b = g.disk.text;
	await g.type(g.item("id").querySelector("input"), "beta2");
	assert.equal(g.disk.text, b.replace("beta tab:gone", "beta2 tab:gone"), "another change leaves the missing tab as written");
	await g.choose(g.sel("tab"), "learn");
	assert.ok(g.disk.text.includes("[!activity|beta2 tab:learn] Beta"));
	g.close();
});

test("tab: an activity outside a module has a picker with nothing to pick, which is off", () => {
	const v = rig(NOTE);
	v.go("Bare activity");
	v.openPage();
	const sel = v.sel("tab");
	assert.deepEqual(labels(sel), [["", en("tab.none")]]);
	assert.equal(sel.disabled, true);
	v.close();
});

/* ======================================================================== the parent picker ======================================================================== */

test("parent: a page's parent is a picker of the other pages of its tab, never itself or its own sub-pages; choosing writes, and a loop is refused with the reason if it is forced", async () => {
	const v = rig(PAGES);
	v.go("First");
	v.openPage();
	let sel = v.sel("parent");
	assert.deepEqual(labels(sel), [["", en("parent.none")], ["p4", "Fourth (p4)"], ["p5", "Fifth (p5)"]], "not itself, not p2 or p3 (its sub-pages), not another tab's page");
	assert.equal(sel.value, "");
	const before = v.disk.text;
	await v.choose(sel, "p4");
	assert.equal(v.disk.text, before.replace("> [!page|p1] First", "> [!page|p1 parent:p4] First"));
	assert.equal(v.disk.writes, 1);
	// force a loop: the page p1 under its own sub-page p3
	sel = v.sel("parent");
	const forced = doc.createElement("option");
	forced.value = "p3";
	forced.textContent = "forced";
	sel.appendChild(forced);
	const mid = v.disk.text;
	sel.value = "p3";
	sel.dispatchEvent(new w.Event("change", { bubbles: true }));
	await v.settle();
	assert.equal(v.disk.text, mid, "nothing is written");
	assert.equal(v.disk.writes, 1);
	assert.match(v.refusal(), /^Not changed\. A page cannot sit under itself or under one of its own sub-pages: that would make a loop\./);
	assert.equal(v.sel("parent").value, "p4", "the picker goes back to what the note has");
	await v.choose(v.sel("parent"), "");
	assert.equal(v.disk.text, before, "no parent: the setting is gone and the note is as it was");
	v.close();
});

test("parent: a parent that is not a page of the tab is kept as written and said so; another change leaves it", async () => {
	const v = rig(PAGES);
	v.go("Fifth");
	v.openPage();
	const sel = v.sel("parent");
	assert.equal(sel.value, "ghost");
	assert.deepEqual(labels(sel).at(-1), ["ghost", en("parent.missing").replace("{id}", "ghost")]);
	const before = v.disk.text;
	await v.type(v.el.querySelector(".booklet-design-editbox .booklet-design-strip-item[data-field='icon'] input"), "star");
	assert.equal(v.disk.text, before.replace("parent:ghost", "parent:ghost icon:star"));
	// and a loop already in the note says so
	v.close();
	const loop = rig(PAGES.replace("> [!page|p1] First", "> [!page|p1 parent:p3] First"));
	loop.go("First");
	loop.openPage();
	assert.deepEqual(labels(loop.sel("parent")).at(-1), ["p3", en("parent.loop").replace("{id}", "p3")]);
	assert.equal(loop.sel("parent").value, "p3");
	loop.close();
});

/* ======================================================================== what a copy button copies ======================================================================== */

test("copy: the list shows each word of of: in order; add, move, change and remove each write once; a word the picker cannot offer rides along as written", async () => {
	const v = rig(NOTE);
	v.go("Alpha");
	v.openC("[!copy|go");
	assert.ok(v.has("Item 1: what it copies"));
	const pick = (n) => v.ctl(`Item ${n}: what it copies`);
	assert.deepEqual(
		[1, 2, 3, 4].map((n) => pick(n).value),
		["why", "why/solution", "^block", "gone"],
	);
	assert.deepEqual(labels(pick(1)).map((x) => x[0]), ["why", "why/hint", "why/solution", "pick", "n"], "the questions of its own activity, each with the hint and the solution folded under it");
	assert.deepEqual(labels(pick(3))[0], ["^block", en("copy.kept").replace("{item}", "^block")], "a word the picker cannot offer is listed first, as written");
	assert.deepEqual(labels(pick(4))[0], ["gone", en("copy.kept").replace("{item}", "gone")]);
	const before = v.disk.text;
	// add
	await v.choose(v.ctl(en("copy.add")), "pick");
	assert.equal(v.disk.text, before.replace("of:why,why/solution,^block,gone]", "of:why,why/solution,^block,gone,pick]"));
	assert.equal(v.disk.writes, 1);
	// move item 5 up twice
	await v.press(v.ctl("Item 5: move up"));
	await v.press(v.ctl("Item 4: move up"));
	assert.ok(v.disk.text.includes("of:why,why/solution,pick,^block,gone]"));
	// change item 1 to another question
	await v.choose(pick(1), "n");
	assert.ok(v.disk.text.includes("of:n,why/solution,pick,^block,gone]"));
	// remove item 2
	await v.press(v.ctl("Item 2: remove"));
	assert.ok(v.disk.text.includes("of:n,pick,^block,gone]"));
	assert.equal(v.disk.writes, 5, "one write for each change");
	assert.equal(v.md()[0], "> [!copy|go of:n,pick,^block,gone] Copy for my tutor", "the Markdown follows");
	// the kept words are as they were all along
	assert.ok(v.disk.text.includes("^block,gone]"));
	await v.undoAll(5);
	assert.equal(v.disk.text, before, "five steps back is the note as it was");
	v.close();
});

test("copy: the last item cannot be taken out, and says why; the list says so when there is nothing to copy", async () => {
	const v = rig(NOTE.replace("of:why,why/solution,^block,gone", "of:why"));
	v.go("Alpha");
	v.openC("[!copy|go");
	const before = v.disk.text;
	await v.press(v.ctl("Item 1: remove"));
	assert.equal(v.disk.text, before);
	assert.match(v.refusal(), /^Not changed\. A copy button needs something to copy, so the last item stays\./);
	assert.equal(v.ctl("Item 1: move up").disabled, true);
	assert.equal(v.ctl("Item 1: move down").disabled, true);
	v.close();
	// no of: at all: an empty list and an add picker
	const e = rig(NOTE.replace(" of:why,why/solution,^block,gone", ""));
	e.go("Alpha");
	e.openC("[!copy|go");
	assert.equal(words(e.el.querySelector(".booklet-design-editbox .booklet-design-rows-none")), en("copy.none"));
	await e.choose(e.ctl(en("copy.add")), "why");
	assert.ok(e.disk.text.includes("> [!copy|go of:why] Copy for my tutor"));
	e.close();
});

/* ======================================================================== the kept entries ======================================================================== */

test("entries: a repeat activity has a switch for entries:folded; one that does not repeat says so and cannot press it; another value is kept and said", async () => {
	const v = rig(NOTE);
	v.go("Alpha");
	v.openPage();
	const sw = () => v.el.querySelector(".booklet-design-editbox .booklet-design-strip-item[data-field='entries'] button[role=switch]");
	assert.equal(sw().getAttribute("aria-checked"), "false");
	assert.equal(sw().disabled, false);
	assert.equal(words(sw()), en("entries.switch"));
	const before = v.disk.text;
	await v.press(sw());
	assert.equal(v.disk.text, before.replace("[!activity|alpha tab:learn repeat]", "[!activity|alpha tab:learn repeat entries:folded]"));
	assert.equal(sw().getAttribute("aria-checked"), "true");
	await v.press(sw());
	assert.equal(v.disk.text, before, "off again is the same bytes");
	assert.equal(v.disk.writes, 2);
	// not repeat, no entries: the switch is off, in words, and cannot be pressed
	v.go("Beta");
	v.openPage();
	assert.equal(sw().disabled, true);
	assert.equal(words(v.el.querySelector(".booklet-design-editbox .booklet-design-strip-item[data-field='entries'] .booklet-design-strip-label")), en("entries.needsRepeat"));
	// not repeat but the line says entries:folded: the switch is on and can be turned off
	v.go("Gamma");
	v.openPage();
	assert.equal(sw().getAttribute("aria-checked"), "true");
	assert.equal(sw().disabled, false);
	const g = v.disk.text;
	await v.press(sw());
	assert.equal(v.disk.text, g.replace("gamma entries:folded]", "gamma]"));
	// another value: kept as written, said so, replaced only by turning the switch on
	v.go("Delta");
	v.openPage();
	assert.equal(sw().getAttribute("aria-checked"), "false");
	assert.equal(words(v.el.querySelector(".booklet-design-editbox .booklet-design-strip-item[data-field='entries'] .booklet-design-strip-label")), en("entries.differs").replace("{value}", "open"));
	const d = v.disk.text;
	await v.press(sw());
	assert.equal(v.disk.text, d.replace("entries:open", "entries:folded"));
	v.close();
});

/* ======================================================================== hint and solution under a question ======================================================================== */

test("helps: a question's box has a field each for its hint and its solution: title, words and fold; the lines are the note's, byte for byte", async () => {
	const v = rig(NOTE);
	v.go("Alpha");
	v.openQ("[!text|why");
	assert.ok(v.helpEl("hint") && v.helpEl("solution"));
	assert.equal(v.ctl("Hint: title").value, "Hint");
	assert.equal(v.ctl("Hint: words").value, "Look at the moon.");
	assert.equal(v.ctl("Hint: starts folded").getAttribute("aria-checked"), "true");
	assert.equal(v.ctl("Solution: title").value, "Model answer");
	assert.equal(v.ctl("Solution: words").value, "Because.\nReally.");
	assert.equal(v.el.querySelector(".booklet-design-editbox .booklet-design-edit-rest").hidden, true, "nothing is left that only the Markdown edits");
	const before = v.disk.text;
	// the words are applied when the field is left: one write, only the line that changed
	await v.type(v.ctl("Hint: words"), "Look at the sky.");
	assert.equal(v.disk.writes, 1);
	assert.equal(v.disk.text, before.replace("> Look at the moon.", "> Look at the sky."));
	// two lines, one of them kept as it was
	await v.type(v.ctl("Solution: words"), "Because.\nThe moon pulls.");
	assert.equal(v.disk.text, before.replace("> Look at the moon.", "> Look at the sky.").replace("> Really.", "> The moon pulls."));
	// the title
	await v.type(v.ctl("Solution: title"), "Why");
	assert.ok(v.disk.text.includes("> [!solution]- Why\n> Because.\n> The moon pulls."));
	// the fold switch
	await v.press(v.ctl("Hint: starts folded"));
	assert.ok(v.disk.text.includes("> [!hint] Hint\n> Look at the sky."));
	assert.equal(v.ctl("Hint: starts folded").getAttribute("aria-checked"), "false");
	assert.equal(v.disk.writes, 4);
	await v.undoAll(4);
	assert.equal(v.disk.text, before, "four steps back is the note as it was");
	v.close();
});

test("helps: add a hint or a solution where there is none, and remove it: the note goes back to the same bytes", async () => {
	const v = rig(NOTE);
	v.go("Alpha");
	v.openQ("[!choice|pick");
	const before = v.disk.text;
	assert.equal(v.helpEl("hint"), null);
	assert.ok(v.has(en("helps.add.hint")) && v.has(en("helps.add.solution")));
	await v.press(v.ctl(en("helps.add.hint")));
	assert.equal(v.disk.text, before.replace("- [ ] Two\n", "- [ ] Two\n\n> [!hint]- Hint\n"));
	assert.equal(v.disk.writes, 1);
	assert.ok(v.helpEl("hint"));
	assert.equal(doc.activeElement, v.ctl("Hint: words"), "the focus is where the words go");
	typeInto(v.ctl("Hint: words"), "Pick the first.");
	v.ctl("Hint: words").dispatchEvent(new w.Event("change", { bubbles: true }));
	await v.settle();
	assert.ok(v.disk.text.includes("> [!hint]- Hint\n> Pick the first."));
	await v.press(v.ctl(en("helps.add.solution")));
	assert.ok(v.disk.text.includes("> [!hint]- Hint\n> Pick the first.\n\n> [!solution]- Solution\n"));
	// remove both
	await v.press(v.ctl(en("helps.remove.solution")));
	await v.press(v.ctl(en("helps.remove.hint")));
	assert.equal(v.disk.text, before);
	assert.ok(v.has(en("helps.add.hint")), "the add button is back");
	assert.equal(v.disk.writes, 5);
	await v.undoAll(5);
	assert.equal(v.disk.text, before);
	v.close();
});

test("helps: a hint that holds a list stays in the Markdown with the reason; its title and fold switch still work and no words field is offered; typed words that would be read as a list are refused", async () => {
	const v = rig(STEPS);
	v.go("Steps");
	v.openQ("[!choice|bare");
	assert.ok(v.helpEl("hint"));
	assert.equal(v.has("Hint: words"), false, "no words field");
	assert.match(words(v.helpEl("hint").querySelector(".booklet-design-rows-refused")), /The hint is edited in the Markdown below: it holds a list\./);
	assert.equal(v.has(en("helps.remove.hint")), false, "not removed from here");
	assert.equal(v.el.querySelector(".booklet-design-editbox .booklet-design-edit-md").open, true, "the Markdown is open, with the lines in it");
	const before = v.disk.text;
	await v.press(v.ctl("Hint: starts folded"));
	assert.equal(v.disk.text, before.replace("> [!hint]- Hint\n> - one", "> [!hint] Hint\n> - one"));
	await v.type(v.ctl("Hint: title"), "Help");
	assert.ok(v.disk.text.includes("> [!hint] Help\n> - one\n> - two"));
	v.close();
	// words typed that would be read as something else are refused
	const w2 = rig(NOTE);
	w2.go("Alpha");
	w2.openQ("[!text|why");
	const b = w2.disk.text;
	await w2.type(w2.ctl("Hint: words"), "Fine.\n- but a list");
	assert.equal(w2.disk.text, b);
	assert.match(w2.refusal(), /^Not changed\. A line of that text would be read as something else/);
	assert.equal(w2.ctl("Hint: words").value, "Look at the moon.", "the field goes back to the note's words");
	w2.close();
});

test("helps: a question with two hints is edited in the Markdown, with the reason, and nothing can be added", () => {
	const v = rig(STEPS);
	v.go("Steps");
	v.openQ("[!text|twice");
	assert.equal(v.helpEl("hint"), null);
	assert.match(words(v.el.querySelector(".booklet-design-editbox .booklet-design-helps .booklet-design-rows-refused")), /edited in the Markdown below\. The question has more than one hint/);
	assert.equal(v.has(en("helps.add.solution")), false);
	v.close();
});

test("helps: the hint nested in a group (one > deeper) is the same field, and a change keeps the group's own marks", async () => {
	const v = rig(STEPS);
	v.go("Steps");
	v.openQ("[!choice|c1");
	assert.equal(v.ctl("Hint: words").value, "Words that help.");
	assert.equal(v.ctl("Hint: title").value, "");
	const before = v.disk.text;
	await v.type(v.ctl("Hint: words"), "Other words.");
	assert.equal(v.disk.text, before.replace("> > Words that help.", "> > Other words."));
	await v.press(v.ctl("Hint: starts folded"));
	assert.equal(v.disk.text, before.replace("> > Words that help.", "> > Other words.").replace("> > [!hint]-", "> > [!hint]"));
	await v.press(v.ctl(en("helps.remove.hint")));
	assert.ok(!v.disk.text.includes("[!hint]- \n") && !v.disk.text.includes("> > [!hint]"));
	await v.press(v.ctl(en("helps.add.hint")));
	assert.ok(v.disk.text.includes("> [!hint]- Hint"), "added under the question, at the group's depth");
	v.close();
});

test("helps: the Markdown below and the fields are in step: a change in the Markdown shows in the fields, and a change in the fields shows in the Markdown", async () => {
	const v = rig(NOTE);
	v.go("Alpha");
	v.openQ("[!text|why");
	await v.type(v.ctl("Hint: words"), "New hint.");
	assert.ok(v.md().includes("> New hint."));
	const md = v.area();
	v.el.querySelector(".booklet-design-editbox .booklet-design-edit-md").open = true;
	await v.type(md, v.md().join("\n").replace("> New hint.", "> From the Markdown."));
	assert.equal(v.ctl("Hint: words").value, "From the Markdown.");
	v.close();
});
