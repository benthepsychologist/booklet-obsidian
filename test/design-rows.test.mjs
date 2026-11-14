/*
 * The rows of a choice, a multi, a shared menu and a matrix in the Design view's editor in place, run in node over jsdom with the
 * stand-in for Obsidian. The rows are one more view of the box's ONE draft: a row changes the draft and the Markdown at once, nothing
 * reaches the note until Save, and Save is the same `changeLines` through the same guard as every other change, so a change of positions
 * under a kept answer is counted and asked about in the open. How it looks, and how a soft keyboard behaves, is measured in the real
 * app (e2e check 72), which this is not.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { window as w, click, words, typeInto } from "./dom.mjs";
import { core, bookletAround } from "./helpers.mjs";
import { lineOf } from "./design-fixtures.mjs";
import { openDesign, doc } from "./design-harness.mjs";

const { Setting } = await import("./obsidian-stub.mjs");
const { DESIGN_STRINGS, minimalChange, applyChange } = core;

const en = (k) => DESIGN_STRINGS[k].en;
const fill = (k, vars) => en(k).replace(/\{(\w+)\}/g, (_, n) => vars[n]);
const later = (ms) => new Promise((r) => setTimeout(r, ms));

/** A module with a shared menu, two questions that read it, a choice with replies, a multi, a matrix, a lossy question and a hint. */
const NOTE = (kept) =>
	bookletAround(
		[
			"> [!module|m] Feelings",
			"",
			"> [!activity|a] How it went",
			"",
			"> [!menu|places]",
			"- Park",
			"- Garden",
			"- Library",
			"",
			"> [!choice|where] Where are you right now?",
			"- [ ] Calm",
			"  - That is the settling system at work.",
			"- [x] Wound up",
			"  - That is the activating family.",
			"  - It is also useful.",
			"- [ ] Numb",
			"",
			"> [!hint]- A hint",
			"> Think about your body.",
			"",
			"> [!multi|morning menu:places] This morning I went to…",
			"",
			"> [!multi|evening menu:places] This evening I went to…",
			"",
			"> [!multi|outside open] What did you do outside?",
			"- [ ] Walked",
			"- [ ] Gardened",
			"",
			"> [!matrix|topics] How sure are you of each topic?",
			"",
			"- Spring tides",
			"- Neap tides",
			"",
			"0. Not yet",
			"1. Getting there",
			"2. Sure",
			"",
			"> [!choice|odd] Odd one",
			"- [ ] One",
			"  - Said",
			"    and more",
			"",
			"> [!module|m end]",
			...(kept ? ["", "%%", "> [!records] App record — do not edit below this line", "", "> [!records|m] Feelings", "", "```booklet answers", JSON.stringify(kept), "```", "%%", ""] : [""]),
		].join("\n"),
	);
const KEPT = { where: 2, morning: [1, 3], evening: [2], topics: [1, 2] };

/** Opens a view and drives it: the rows are found by their labels, the way a person finds them. */
function rig(text) {
	Setting.reset();
	const o = openDesign(text);
	const m = {
		...o,
		open: (kind, needle) => o.select(kind, needle),
		input: (label) => {
			const hit = [...o.editor().querySelectorAll("input, button, select")].filter((e) => e.getAttribute("aria-label") === label);
			assert.equal(hit.length, 1, `one control labelled ${label} (${hit.length})`);
			return hit[0];
		},
		has: (label) => [...o.editor().querySelectorAll("input, button, select")].some((e) => e.getAttribute("aria-label") === label),
		type(label, value) {
			typeInto(m.input(label), value);
		},
		press(label) {
			click(m.input(label));
		},
		/** The settings row (a Setting) of this name in the open editor. */
		row: (name) => {
			const hit = Setting.made.filter((s) => s.settingEl.isConnected && words(s.nameEl) === name);
			assert.equal(hit.length, 1, `one row named ${name} (${hit.length})`);
			return hit[0];
		},
		rowNames: () => Setting.made.filter((s) => s.settingEl.isConnected).map((s) => words(s.nameEl)),
		refusal: () => words(o.el.querySelector(".booklet-design-edit-refusal")),
		mark: () => words(o.el.querySelector(".booklet-design-edit-mark")),
		button: (label, from = o.editor()) => [...from.querySelectorAll("button")].find((b) => words(b) === label),
		dialog: () => doc.querySelector(".booklet-design-ask"),
		async answer(label) {
			const b = [...m.dialog().querySelectorAll("button")].find((x) => words(x) === label);
			assert.ok(b, `no ${label} in the dialog`);
			click(b);
			await o.view.whenIdle();
		},
		save: () => o.press(m.button("Save")),
		/** The rows of the box, as the words each holds. */
		texts: () => [...o.editor().querySelectorAll(".booklet-design-rows input[type=text]")].map((e) => e.value),
		preview: () => words(o.editor().querySelector(".booklet-design-edit-previewhost")),
		/** What the editor's Markdown says now, as lines. */
		md: () => o.area().value.split("\n"),
	};
	return m;
}

const onlyLines = (before, after, ...lines) => {
	const x = before.split("\n");
	const y = after.split("\n");
	assert.equal(x.length, y.length, "the same number of lines");
	assert.deepEqual(x.map((l, i) => (l === y[i] ? -1 : i)).filter((i) => i >= 0), lines, "only these lines differ");
	assert.equal(applyChange(before, minimalChange(before, after)), after);
};

/* ======================================================================== a choice ======================================================================== */

test("a choice opens with its options as rows, each with its words, a correct switch, its replies, and Move up, Move down and Remove; the settings above keep `open`, and the shared menu is a picker", () => {
	const v = rig(NOTE());
	v.go("How it went");
	v.open("question", "[!choice|where]");
	const box = v.editor();
	assert.equal(words(box.querySelector(".booklet-design-rows .setting-item-heading")), "Options");
	assert.deepEqual(v.texts(), ["Calm", "That is the settling system at work.", "Wound up", "That is the activating family.", "It is also useful.", "Numb"]);
	assert.deepEqual([...box.querySelectorAll(".booklet-design-rows-switch")].map((b) => b.getAttribute("aria-checked")), ["false", "true", "false"]);
	assert.equal(v.input("Option 1: correct answer").getAttribute("role"), "switch");
	assert.equal(words(v.input("Option 1: correct answer")), "Correct answer");
	assert.equal(v.input("Option 1: move up").disabled, true, "the first cannot go up");
	assert.equal(v.input("Option 3: move down").disabled, true, "the last cannot go down");
	assert.equal(v.input("Option 2: move up").disabled, false);
	for (const l of ["Option 2: remove", "Option 2, reply 2: words", "Option 2, reply 2: remove", "Option 2: add a reply", "Option 3: words"]) assert.ok(v.has(l), l);
	assert.equal(words(v.button("Add an option")), "Add an option");
	assert.deepEqual([...box.querySelectorAll(".booklet-design-optrow")].map((r) => words(doc.getElementById(r.getAttribute("aria-labelledby")))), ["Option 1", "Option 2", "Option 3"], "each row is a named group");
	// the shared menu is a picker of the ids this question can see, and none
	const picker = v.row("Shared menu").components[0];
	assert.deepEqual(Object.keys(picker.options), ["", "places"]);
	assert.equal(picker.options[""], "None: the question has its own options");
	assert.equal(picker.value, "");
	// `open` is a switch in the settings; the menu is not repeated there as a text row
	assert.deepEqual(v.rowNames().filter((n) => ["open", "menu", "Title", "Id", "each", "earlier"].includes(n)), ["Id", "Title", "open", "each", "earlier"]);
	// the Markdown holds the block as it is
	assert.equal(v.area().value.split("\n")[0], "> [!choice|where] Where are you right now?");
	assert.equal(v.mark(), "");
	v.close();
});

test("typing in a row changes the draft at once, the Markdown follows, the preview follows about 150 ms later, the caret stays, and the note is not written", async () => {
	const v = rig(NOTE());
	v.go("How it went");
	v.open("question", "[!choice|where]");
	const before = v.disk.text;
	const input = v.input("Option 3: words");
	input.focus();
	v.type("Option 3: words", "Flat");
	assert.equal(v.md()[6], "- [ ] Flat", "the Markdown follows at once");
	assert.equal(v.input("Option 3: words"), input, "the row is the same row: it was not drawn again under the caret");
	assert.equal(doc.activeElement, input);
	assert.equal(v.mark(), "Unsaved changes");
	assert.equal(v.disk.writes, 0);
	assert.doesNotMatch(v.preview(), /Flat/, "the preview waits a moment");
	await later(250);
	assert.match(v.preview(), /Flat/);
	v.type("Option 2, reply 2: words", "Often useful.");
	assert.equal(v.md()[5], "  - Often useful.");
	assert.equal(v.disk.text, before);
	v.close();
});

test("a correct switch writes [x] and [ ]; add, move and remove an option or a reply each change the draft and put the focus where the person is working", async () => {
	const v = rig(NOTE());
	v.go("How it went");
	v.open("question", "[!choice|where]");
	v.press("Option 1: correct answer");
	assert.equal(v.md()[1], "- [x] Calm");
	assert.equal(v.input("Option 1: correct answer").getAttribute("aria-checked"), "true");
	assert.equal(doc.activeElement, v.input("Option 1: correct answer"), "the focus stays on the switch");
	v.press("Option 1: correct answer");
	assert.equal(v.md()[1], "- [ ] Calm");
	// add an option: it is at the end and its words have the focus
	click(v.button("Add an option"));
	assert.equal(v.md()[7], "- [ ] ");
	assert.equal(doc.activeElement, v.input("Option 4: words"));
	// move: the option goes with its replies, and the focus is on the same button at the new place
	v.press("Option 2: move up");
	assert.deepEqual(v.md().slice(1, 6), ["- [x] Wound up", "  - That is the activating family.", "  - It is also useful.", "- [ ] Calm", "  - That is the settling system at work."]);
	assert.equal(doc.activeElement, v.input("Option 1: move down"), "the first cannot go up any more: its twin takes the focus");
	v.press("Option 1: move down");
	assert.equal(doc.activeElement, v.input("Option 2: move down"), "the focus follows the button that was pressed, to the place the option went");
	// a reply: added under its option, with the focus in it; removed, and the focus goes on
	v.press("Option 3: add a reply");
	assert.equal(v.md()[7], "  - ", "as far in as the option's words");
	assert.equal(doc.activeElement, v.input("Option 3, reply 1: words"));
	v.type("Option 3, reply 1: words", "Flat.");
	v.press("Option 3, reply 1: remove");
	assert.deepEqual(v.md().slice(6, 8), ["- [ ] Numb", "- [ ] "]);
	assert.equal(doc.activeElement, v.input("Option 3: add a reply"));
	v.press("Option 4: remove");
	assert.equal(doc.activeElement, v.input("Option 3: words"), "the focus goes to the row before the one that went");
	assert.equal(v.disk.writes, 0, "none of it was written");
	await later(250);
	assert.equal(v.texts().length, 6);
	v.close();
});

test("words that the format would read as something else are refused with a reason and nothing changes", () => {
	const v = rig(NOTE());
	v.go("How it went");
	v.open("question", "[!choice|where]");
	const was = v.area().value;
	v.type("Option 1, reply 1: words", "[ ] That is an option");
	assert.match(v.refusal(), /^Not changed\. The format would read that text as something other than the row it is in/);
	assert.equal(v.area().value, was);
	assert.equal(v.input("Option 1, reply 1: words").getAttribute("aria-invalid"), "true");
	v.type("Option 1, reply 1: words", "A fine reply");
	assert.equal(v.refusal(), "");
	assert.equal(v.md()[2], "  - A fine reply");
	assert.equal(v.input("Option 1, reply 1: words").getAttribute("aria-invalid"), null);
	v.close();
});

test("positions under a kept answer: Save counts and asks in the open; Cancel writes nothing and keeps the draft; Yes writes only those lines; an edit that keeps every position asks nothing", async () => {
	const note = NOTE(KEPT);
	const v = rig(note);
	v.go("How it went");
	v.open("question", "[!choice|where]");
	// a reply, a mark and an appended option: no question
	v.type("Option 1, reply 1: words", "Settling.");
	v.press("Option 3: correct answer");
	click(v.button("Add an option"));
	v.type("Option 4: words", "Flat");
	await v.save();
	assert.equal(v.dialog(), null, "nothing a kept answer says has changed");
	assert.equal(v.disk.writes, 1);
	const w = lineOf(note, "[!choice|where]");
	assert.deepEqual(v.disk.text.split("\n").slice(w, w + 8), ["> [!choice|where] Where are you right now?", "- [ ] Calm", "  - Settling.", "- [x] Wound up", "  - That is the activating family.", "  - It is also useful.", "- [x] Numb", "- [ ] Flat"]);
	// now the second option goes up: the kept answer 2 would mean Calm
	click(v.act(v.block("question", "[!choice|where]"), "edit"));
	const before = v.disk.text;
	v.press("Option 2: move up");
	click(v.button("Save"));
	assert.ok(v.dialog(), "a question is open");
	const ask = words(v.dialog());
	assert.match(ask, /The options of `where` touches 1 saved answer\./);
	assert.match(ask, /stay in the note's records as they are/);
	assert.equal(v.disk.writes, 1, "nothing is written while it is open");
	await v.answer("Cancel");
	assert.equal(v.disk.text, before, "the note is as it was");
	assert.ok(v.editor(), "the editor stays open");
	assert.match(v.md()[1], /Wound up/, "with the draft in it");
	assert.equal(v.status(), "Nothing was changed.");
	click(v.button("Save"));
	await v.answer("Change");
	assert.equal(v.disk.writes, 2);
	assert.equal(v.disk.text.split("\n")[w + 1], "- [x] Wound up");
	assert.equal(v.disk.text.slice(v.disk.text.indexOf("%%")), before.slice(before.indexOf("%%")), "the kept answers are the bytes they were");
	click(v.undo());
	await v.settle();
	assert.equal(v.disk.text, before, "Undo brings back every byte");
	v.close();
});

test("with nothing kept, the same position changes ask nothing and are written", async () => {
	const note = NOTE();
	const v = rig(note);
	v.go("How it went");
	v.open("question", "[!choice|where]");
	v.press("Option 2: move up");
	v.press("Option 3: remove");
	await v.save();
	assert.equal(v.dialog(), null);
	assert.equal(v.disk.writes, 1);
	const w = lineOf(note, "[!choice|where]");
	assert.deepEqual(v.disk.text.split("\n").slice(w, w + 6), ["> [!choice|where] Where are you right now?", "- [x] Wound up", "  - That is the activating family.", "  - It is also useful.", "- [ ] Calm", "  - That is the settling system at work."]);
	v.close();
});

/* ======================================================================== the shared menu a question names ======================================================================== */

test("choosing a shared menu replaces the option rows by a line saying so and a button to the menu; none brings the question's own options back; Cancel throws it all away", async () => {
	const note = NOTE();
	const v = rig(note);
	v.go("How it went");
	v.open("question", "[!choice|where]");
	await v.row("Shared menu").components[0].change("places");
	assert.deepEqual(v.md(), ["> [!choice|where menu:places] Where are you right now?", "", "> [!hint]- A hint", "> Think about your body."]);
	assert.equal(words(v.editor().querySelector(".booklet-design-rows-usesmenu")), "Uses the shared menu places.Go to the menu");
	assert.equal(v.texts().length, 0, "the question's own option lines are not shown");
	assert.equal(v.has("Option 1: words"), false);
	assert.equal(v.has("Option 1: remove"), false);
	assert.equal(v.button("Add an option"), undefined, "a question with a menu has no options of its own to add to");
	assert.equal(v.row("Shared menu").components[0].value, "places");
	assert.ok(v.input("Open the shared menu places"));
	assert.equal(doc.activeElement, v.row("Shared menu").components[0].selectEl, "the focus stays on the picker");
	await v.row("Shared menu").components[0].change("");
	assert.equal(v.area().value, core.blockLines(note, core.walkDesign(core.parseDesign(note)).find((n) => n.id === "where")).join("\n"), "the options are back, byte for byte");
	assert.equal(v.mark(), "");
	// and the other way, then Cancel
	await v.row("Shared menu").components[0].change("places");
	assert.equal(v.mark(), "Unsaved changes");
	click(v.button("Cancel"));
	assert.equal(v.disk.text, note);
	assert.equal(v.disk.writes, 0);
	v.close();
});

test("a question that names a menu: its button opens the menu block, which lists its items as rows and the questions that use it; a menu used by none says so", async () => {
	const note = NOTE(KEPT);
	const v = rig(note);
	v.go("How it went");
	v.open("question", "[!multi|morning");
	assert.equal(words(v.editor().querySelector(".booklet-design-rows-usesmenu")), "Uses the shared menu places.Go to the menu");
	assert.equal(v.row("Shared menu").components[0].value, "places");
	assert.equal(v.rowNames().includes("menu"), false);
	click(v.input("Open the shared menu places"));
	assert.equal(v.all(".booklet-design-editbox").length, 1);
	assert.equal(v.area().value, "> [!menu|places]\n- Park\n- Garden\n- Library");
	assert.equal(words(v.editor().querySelector(".booklet-design-rows-usedby")), "Used by: morning, evening");
	assert.deepEqual(v.texts(), ["Park", "Garden", "Library"]);
	// a reorder counts the answers kept for BOTH questions
	v.press("Item 1: move down");
	click(v.button("Save"));
	const ask = words(v.dialog());
	assert.match(ask, /The options of `morning` touches 1 saved answer\./);
	assert.match(ask, /The options of `evening` touches 1 saved answer\./);
	await v.answer("Cancel");
	assert.equal(v.disk.writes, 0);
	v.close();
});

test("a shared menu: add, reword the end, remove an item nobody picked; and a menu no question names says so", async () => {
	const lonely = bookletAround("> [!activity|a] Words\n\n> [!menu|nobody]\n- One\n- Two\n");
	const v = rig(lonely);
	v.go("Words");
	v.open("menu", "[!menu|nobody]");
	assert.equal(words(v.editor().querySelector(".booklet-design-rows-usedby")), "Not used yet");
	click(v.button("Add an item"));
	assert.equal(doc.activeElement, v.input("Item 3: words"));
	v.type("Item 3: words", "Three");
	v.press("Item 1: remove");
	assert.equal(v.area().value, "> [!menu|nobody]\n- Two\n- Three");
	assert.equal(doc.activeElement, v.input("Item 1: words"));
	await v.save();
	assert.equal(v.dialog(), null);
	assert.equal(v.disk.text, lonely.replace("- One\n- Two", "- Two\n- Three"));
	v.close();
});

/* ======================================================================== a matrix ======================================================================== */

test("a matrix: items and anchors are rows, an anchor's number is its own field, add appends the next number, and the blank line a 0 list needs is kept", async () => {
	const note = NOTE();
	const v = rig(note);
	v.go("How it went");
	v.open("question", "[!matrix|topics]");
	assert.deepEqual(v.texts(), ["Spring tides", "Neap tides", "0", "Not yet", "1", "Getting there", "2", "Sure"]);
	const heads = [...v.editor().querySelectorAll(".booklet-design-rows .setting-item-heading")].map(words);
	assert.deepEqual(heads, ["Items", "Anchors (the number is the answer that is kept)"]);
	click(v.button("Add an anchor"));
	assert.equal(v.md().at(-1), "3. ");
	assert.equal(doc.activeElement, v.input("Anchor 4: words"));
	v.type("Anchor 4: words", "Very sure");
	// a number is taken when its box is left
	const num = v.input("Anchor 1: number");
	num.value = "5";
	num.dispatchEvent(new w.Event("change", { bubbles: true }));
	assert.equal(v.md()[5], "5. Not yet");
	num.value = "x";
	num.dispatchEvent(new w.Event("change", { bubbles: true }));
	assert.match(v.refusal(), /^Not changed\. An anchor's number is digits only/);
	assert.equal(v.input("Anchor 1: number").value, "5", "the field shows what the draft has");
	click(v.button("Add an item"));
	assert.equal(v.md()[3], "- Neap tides");
	assert.equal(v.md()[4], "- ");
	assert.equal(v.md()[5], "", "the blank line above the numbered list is kept");
	v.press("Anchor 1: remove");
	await v.save();
	assert.equal(v.dialog(), null, "nothing is kept: nothing to ask");
	const w0 = lineOf(note, "[!matrix|topics]");
	assert.deepEqual(v.disk.text.split("\n").slice(w0, w0 + 11), ["> [!matrix|topics] How sure are you of each topic?", "", "- Spring tides", "- Neap tides", "- ", "", "1. Getting there", "2. Sure", "3. Very sure", "", "> [!choice|odd] Odd one"]);
	v.close();
});

test("a matrix with answers kept: removing or moving an item, or removing an anchor, is asked about; adding at the end is not", async () => {
	const note = NOTE(KEPT);
	const v = rig(note);
	v.go("How it went");
	v.open("question", "[!matrix|topics]");
	click(v.button("Add an item"));
	click(v.button("Add an anchor"));
	await v.save();
	assert.equal(v.dialog(), null);
	assert.equal(v.disk.writes, 1);
	v.open("question", "[!matrix|topics]");
	v.press("Item 1: move down");
	click(v.button("Save"));
	assert.match(words(v.dialog()), /The items and anchors of `topics` touches 1 saved answer\./);
	await v.answer("Cancel");
	assert.equal(v.disk.writes, 1);
	v.press("Item 2: move up");
	v.press("Anchor 3: remove");
	click(v.button("Save"));
	assert.match(words(v.dialog()), /The items and anchors of `topics` touches 1 saved answer\./);
	await v.answer("Change");
	assert.equal(v.disk.writes, 2);
	v.close();
});

/* ======================================================================== what is not offered, and the Markdown ======================================================================== */

test("a block the rows cannot show without changing it has the Markdown alone and says why; its `menu` setting stays a text row", () => {
	const v = rig(NOTE());
	v.go("How it went");
	v.open("question", "[!choice|odd]");
	const rows = v.editor().querySelector(".booklet-design-rows");
	assert.match(words(rows.querySelector(".booklet-design-rows-refused")), /^The rows are not offered for this block, so it is edited in the Markdown below\. There is a line under the list that the rows cannot show/);
	assert.equal(rows.querySelectorAll("input, button, select").length, 0);
	assert.equal(v.area().value, ["> [!choice|odd] Odd one", "- [ ] One", "  - Said", "    and more"].join("\n"), "the Markdown is as written");
	assert.ok(v.rowNames().includes("menu"), "the settings keep their own `menu` row where there is no picker");
	v.close();
});

test("typing in the Markdown reads the rows again; a text the rows cannot show replaces them by the reason without losing the typed text, and a text they can show brings them back", async () => {
	const v = rig(NOTE());
	v.go("How it went");
	v.open("question", "[!choice|odd]");
	typeInto(v.area(), "> [!choice|odd] Odd one\n- [ ] One\n- [ ] Two");
	await later(250);
	assert.deepEqual(v.texts(), ["One", "Two"]);
	typeInto(v.area(), "> [!choice|odd] Odd one\n- [ ] One\n\n- [ ] Two");
	await later(250);
	assert.equal(v.texts().length, 0);
	assert.match(words(v.editor().querySelector(".booklet-design-rows-refused")), /blank line/);
	assert.equal(v.area().value, "> [!choice|odd] Odd one\n- [ ] One\n\n- [ ] Two", "what was typed is still there");
	typeInto(v.area(), "> [!multi|odd open] Odd one\n- [ ] One\n  - Said\n- [ ] Two");
	await later(250);
	assert.deepEqual(v.texts(), ["One", "Said", "Two"]);
	assert.ok(v.row("open"));
	assert.equal(v.row("open").components[0].value, true);
	// a block that is turned into one the rows do not know has no rows part at all
	typeInto(v.area(), "> [!text|odd] Odd one");
	await later(250);
	assert.equal(v.editor().querySelector(".booklet-design-rows").classList.contains("is-empty"), true);
	v.close();
});

test("Save, Cancel and Esc mean what they meant: Esc keeps a draft once and throws it away on the second press; the rows' draft is the box's draft", async () => {
	const v = rig(NOTE());
	v.go("How it went");
	v.open("question", "[!choice|where]");
	v.press("Option 3: remove");
	assert.equal(v.mark(), "Unsaved changes");
	const key = (k) => v.editor().dispatchEvent(new w.KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
	key("Escape");
	assert.ok(v.editor(), "the first Esc keeps it");
	assert.match(words(v.editor().querySelector(".booklet-design-editor-state")), /Esc again/i);
	key("Escape");
	assert.equal(v.editor(), null, "the second throws it away");
	assert.equal(v.disk.writes, 0);
	// reopened: the options are as the note has them
	v.open("question", "[!choice|where]");
	assert.equal(v.texts().length, 6);
	// a row change and then back again is no change
	v.press("Option 1: correct answer");
	v.press("Option 1: correct answer");
	assert.equal(v.mark(), "");
	v.close();
});

test("the table has the words the rows ask for in Spanish and French, with their {n} and {m} where English has them", () => {
	const keys = Object.keys(DESIGN_STRINGS).filter((k) => k.startsWith("rows."));
	assert.ok(keys.length >= 40);
	for (const k of keys) {
		const e = DESIGN_STRINGS[k];
		assert.ok(e.es && e.fr, `${k} has both`);
		for (const slot of ["es", "fr"]) for (const name of e.en.match(/\{\w+\}/g) ?? []) assert.ok(e[slot].includes(name), `${k} ${slot} keeps ${name}`);
	}
	assert.equal(fill("rows.option.up", { n: 2 }), "Option 2: move up");
});
