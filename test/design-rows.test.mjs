/*
 * The rows of a choice, a multi, a shared menu and a matrix in the Design view's editor in place, run in node over jsdom with the
 * stand-in for Obsidian. A row changes the note the moment it is made, as one step of Undo, through the same `changeLines` and the same
 * guard as every other change, so a change of positions under a kept answer is counted and asked about in the open as it is made. How it looks, and how a soft keyboard behaves, is measured in the real
 * app (e2e check 72), which this is not.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { window as w, click, words, typeInto, press } from "./dom.mjs";
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
		/** Types into a row and leaves it: applied, and this waits for the write. */
		async type(label, value) {
			const el = m.input(label);
			typeInto(el, value);
			el.dispatchEvent(new w.Event("change", { bubbles: true }));
			await o.settle();
		},
		/** Presses a row's button and waits for the write. */
		async press(label) {
			click(m.input(label));
			await o.settle();
		},
		/** Presses a row's button for a change that is asked about: it does not wait for the answer. */
		async pressAsk(label) {
			click(m.input(label));
			await later(20);
		},
		/** Presses a button of the box (Add an option ...) and waits for the write. */
		async add(label) {
			click(m.button(label));
			await o.settle();
		},
		/** The settings row (a Setting) of this name in the open editor. */
		row: (name) => {
			const hit = Setting.made.filter((s) => s.settingEl.isConnected && words(s.nameEl) === name);
			assert.equal(hit.length, 1, `one row named ${name} (${hit.length})`);
			return hit[0];
		},
		rowNames: () => Setting.made.filter((s) => s.settingEl.isConnected).map((s) => words(s.nameEl)),
		/** The names of the strip under the words: the id, the flags and the values, in order. */
		strip: () => o.all(".booklet-design-editbox .booklet-design-strip-item").map((e) => e.getAttribute("data-field")),
		/** The control of the strip item of this name (a text input, or the switch of a flag). */
		item: (name) => o.el.querySelector(`.booklet-design-editbox .booklet-design-strip-item[data-field="${name}"] :is(input, button[role="switch"])`),
		/** The words of the block's title field. */
		title: () => o.el.querySelector(".booklet-design-editbox .booklet-design-field.is-title"),
		refusal: () => words(o.el.querySelector(".booklet-design-edit-refusal")),
		button: (label, from = o.editor()) => [...from.querySelectorAll("button")].find((b) => words(b) === label),
		dialog: () => doc.querySelector(".booklet-design-ask"),
		async answer(label) {
			const b = [...m.dialog().querySelectorAll("button")].find((x) => words(x) === label);
			assert.ok(b, `no ${label} in the dialog`);
			click(b);
			await o.view.whenIdle();
		},
		/** Types into the Markdown and leaves it. */
		async typeArea(text) {
			typeInto(o.area(), text);
			o.area().dispatchEvent(new w.Event("change", { bubbles: true }));
			await o.settle();
		},
		/** The rows of the box, as the words each holds. */
		texts: () => [...o.editor().querySelectorAll(".booklet-design-rows input[type=text]")].map((e) => e.value),
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
	assert.deepEqual(v.strip().filter((n) => ["open", "menu", "id", "each", "earlier"].includes(n)), ["id", "open", "each", "earlier"]);
	assert.equal(v.title().value, "Where are you right now?", "and the title is the field above");
	// the Markdown holds the block as it is
	assert.equal(v.area().value.split("\n")[0], "> [!choice|where] Where are you right now?");
	assert.equal(v.editor().querySelector(".booklet-design-edit-mark"), null, "no Unsaved mark: there is no draft");
	v.close();
});

test("typing in a row is applied when the row is left: one write, the Markdown and the preview follow at once, and the caret stays", async () => {
	const v = rig(NOTE());
	v.go("How it went");
	v.open("question", "[!choice|where]");
	const before = v.disk.text;
	const input = v.input("Option 3: words");
	input.focus();
	typeInto(input, "Flat");
	assert.equal(v.disk.text, before, "typing alone writes nothing");
	input.dispatchEvent(new w.Event("change", { bubbles: true }));
	await v.settle();
	assert.equal(v.disk.writes, 1);
	assert.equal(v.md()[6], "- [ ] Flat", "the Markdown follows");
	assert.equal(v.disk.text.split("\n")[lineOf(before, "- [ ] Numb")], "- [ ] Flat");
	assert.equal(v.input("Option 3: words"), input, "the row is the same row: it was not drawn again under the caret");
	assert.equal(doc.activeElement, input);
	assert.equal(v.editor().querySelector(".booklet-design-edit-previewhost"), null, "there is no preview: the block is the block");
	await v.type("Option 2, reply 2: words", "Often useful.");
	assert.equal(v.md()[5], "  - Often useful.");
	assert.equal(v.disk.writes, 2, "one write for each");
	// typing the same words again is no change: nothing is written
	await v.type("Option 2, reply 2: words", "Often useful.");
	assert.equal(v.disk.writes, 2);
	v.close();
});

test("a correct switch writes [x] and [ ]; add, move and remove an option or a reply each write at once, as one step, and put the focus where the person is working", async () => {
	const v = rig(NOTE());
	v.go("How it went");
	v.open("question", "[!choice|where]");
	await v.press("Option 1: correct answer");
	assert.equal(v.md()[1], "- [x] Calm");
	assert.equal(v.input("Option 1: correct answer").getAttribute("aria-checked"), "true");
	assert.equal(doc.activeElement, v.input("Option 1: correct answer"), "the focus stays on the switch");
	await v.press("Option 1: correct answer");
	assert.equal(v.md()[1], "- [ ] Calm");
	// add an option: it is at the end and its words have the focus
	await v.add("Add an option");
	assert.equal(v.md()[7], "- [ ] ");
	assert.equal(doc.activeElement, v.input("Option 4: words"));
	// move: the option goes with its replies, and the focus is on the same button at the new place
	await v.press("Option 2: move up");
	assert.deepEqual(v.md().slice(1, 6), ["- [x] Wound up", "  - That is the activating family.", "  - It is also useful.", "- [ ] Calm", "  - That is the settling system at work."]);
	assert.equal(doc.activeElement, v.input("Option 1: move down"), "the first cannot go up any more: its twin takes the focus");
	await v.press("Option 1: move down");
	assert.equal(doc.activeElement, v.input("Option 2: move down"), "the focus follows the button that was pressed, to the place the option went");
	// a reply: added under its option, with the focus in it; removed, and the focus goes on
	await v.press("Option 3: add a reply");
	assert.equal(v.md()[7], "  - ", "as far in as the option's words");
	assert.equal(doc.activeElement, v.input("Option 3, reply 1: words"));
	await v.type("Option 3, reply 1: words", "Flat.");
	await v.press("Option 3, reply 1: remove");
	assert.deepEqual(v.md().slice(6, 8), ["- [ ] Numb", "- [ ] "]);
	assert.equal(doc.activeElement, v.input("Option 3: add a reply"));
	await v.press("Option 4: remove");
	assert.equal(doc.activeElement, v.input("Option 3: words"), "the focus goes to the row before the one that went");
	assert.equal(v.disk.writes, 9, "each of the nine changes is one write");
	assert.equal(v.texts().length, 6);
	// nine writes, nine steps: Undo nine times is the note as it was
	for (let i = 0; i < 9; i++) {
		click(v.undo());
		await v.settle();
	}
	assert.equal(v.disk.text, NOTE(), "nine steps back is the note as it was");
	v.close();
});

test("words that the format would read as something else are refused with a reason, nothing is written, and the row goes back to the note's words", async () => {
	const v = rig(NOTE());
	v.go("How it went");
	v.open("question", "[!choice|where]");
	const was = v.area().value;
	await v.type("Option 1, reply 1: words", "[ ] That is an option");
	assert.match(v.refusal(), /^Not changed\. The format would read that text as something other than the row it is in/);
	assert.equal(v.area().value, was);
	assert.equal(v.disk.writes, 0);
	assert.equal(v.input("Option 1, reply 1: words").value, "That is the settling system at work.", "the row shows the note's words again");
	await v.type("Option 1, reply 1: words", "A fine reply");
	assert.equal(v.refusal(), "");
	assert.equal(v.md()[2], "  - A fine reply");
	assert.equal(v.input("Option 1, reply 1: words").getAttribute("aria-invalid"), null);
	v.close();
});

test("positions under a kept answer: the change is counted and asked about in the open as it is made; no writes nothing and the rows show the note; yes writes only those lines; an edit that keeps every position asks nothing", async () => {
	const note = NOTE(KEPT);
	const v = rig(note);
	v.go("How it went");
	v.open("question", "[!choice|where]");
	// a reply, a mark and an appended option: no question
	await v.type("Option 1, reply 1: words", "Settling.");
	await v.press("Option 3: correct answer");
	await v.add("Add an option");
	await v.type("Option 4: words", "Flat");
	assert.equal(v.dialog(), null, "nothing a kept answer says has changed");
	assert.equal(v.disk.writes, 4, "one write for each");
	const w = lineOf(note, "[!choice|where]");
	assert.deepEqual(v.disk.text.split("\n").slice(w, w + 8), ["> [!choice|where] Where are you right now?", "- [ ] Calm", "  - Settling.", "- [x] Wound up", "  - That is the activating family.", "  - It is also useful.", "- [x] Numb", "- [ ] Flat"]);
	assert.ok(v.editor(), "the block stays open");
	// now the second option goes up: the kept answer 2 would mean Calm
	const before = v.disk.text;
	await v.pressAsk("Option 2: move up");
	assert.ok(v.dialog(), "a question is open");
	const ask = words(v.dialog());
	assert.match(ask, /The options of “where” touch 1 saved answer\./);
	assert.match(ask, /stay in the note's records as they are/);
	assert.equal(v.disk.writes, 4, "nothing is written while it is open");
	await v.answer("Cancel");
	assert.equal(v.disk.text, before, "the note is as it was");
	assert.ok(v.editor(), "the editor stays open");
	assert.match(v.md()[1], /Calm/, "with the note's order in it");
	assert.equal(v.status(), "Nothing was changed.");
	await v.pressAsk("Option 2: move up");
	await v.answer("Change");
	assert.equal(v.disk.writes, 5);
	assert.equal(v.disk.text.split("\n")[w + 1], "- [x] Wound up");
	assert.equal(v.disk.text.slice(v.disk.text.indexOf("%%")), before.slice(before.indexOf("%%")), "the kept answers are the bytes they were");
	click(v.undo());
	await v.settle();
	assert.equal(v.disk.text, before, "Undo brings back every byte");
	v.close();
});

test("with nothing kept, the same position changes ask nothing and are written, each as its own step", async () => {
	const note = NOTE();
	const v = rig(note);
	v.go("How it went");
	v.open("question", "[!choice|where]");
	await v.press("Option 2: move up");
	await v.press("Option 3: remove");
	assert.equal(v.dialog(), null);
	assert.equal(v.disk.writes, 2);
	const w = lineOf(note, "[!choice|where]");
	assert.deepEqual(v.disk.text.split("\n").slice(w, w + 6), ["> [!choice|where] Where are you right now?", "- [x] Wound up", "  - That is the activating family.", "  - It is also useful.", "- [ ] Calm", "  - That is the settling system at work."]);
	v.close();
});

/* ======================================================================== the shared menu a question names ======================================================================== */

test("choosing a shared menu applies at once and replaces the option rows by a line saying so and a button to the menu; none brings the question's own options back from the stash, byte for byte; Undo steps back through both", async () => {
	const note = NOTE();
	const v = rig(note);
	v.go("How it went");
	v.open("question", "[!choice|where]");
	await v.row("Shared menu").components[0].change("places");
	await v.settle();
	assert.equal(v.disk.writes, 1);
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
	await v.settle();
	assert.equal(v.area().value, core.blockLines(note, core.walkDesign(core.parseDesign(note)).find((n) => n.id === "where")).join("\n"), "the options are back, byte for byte");
	assert.equal(v.disk.text, note, "and so is the note");
	// and the other way, then Undo
	await v.row("Shared menu").components[0].change("places");
	await v.settle();
	assert.equal(v.disk.writes, 3);
	click(v.undo());
	await v.settle();
	assert.equal(v.disk.text, note, "Undo of the last choice is the note with its options");
	assert.equal(v.texts().length, 6, "and the rows show them");
	v.close();
});

test("the stash of a question's own options belongs to the open block and is lost when the block closes: choosing none then gives a question with no options, and Undo is the way back", async () => {
	const note = NOTE();
	const v = rig(note);
	v.go("How it went");
	v.open("question", "[!choice|where]");
	await v.row("Shared menu").components[0].change("places");
	await v.settle();
	// the block is closed and opened again: the stash was the box's, and it is gone
	press(v.area(), "Escape");
	assert.equal(v.editor(), null);
	v.open("question", "[!choice|where");
	await v.row("Shared menu").components[0].change("");
	await v.settle();
	assert.equal(v.texts().length, 0, "no options come back: they were only in the stash");
	assert.equal(v.md()[0], "> [!choice|where] Where are you right now?");
	// and Undo twice gives the question as it was, options and all
	click(v.undo());
	await v.settle();
	click(v.undo());
	await v.settle();
	assert.equal(v.disk.text, note, "every byte of the options is in the history");
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
	await v.settle();
	assert.equal(v.all(".booklet-design-editbox").length, 1);
	assert.equal(v.area().value, "> [!menu|places]\n- Park\n- Garden\n- Library");
	assert.equal(words(v.editor().querySelector(".booklet-design-rows-usedby")), "Used by: morning, evening");
	assert.deepEqual(v.texts(), ["Park", "Garden", "Library"]);
	// a reorder counts the answers kept for BOTH questions
	await v.pressAsk("Item 1: move down");
	const ask = words(v.dialog());
	assert.match(ask, /The options of “morning” touch 1 saved answer\./);
	assert.match(ask, /The options of “evening” touch 1 saved answer\./);
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
	await v.add("Add an item");
	assert.equal(doc.activeElement, v.input("Item 3: words"));
	await v.type("Item 3: words", "Three");
	await v.press("Item 1: remove");
	assert.equal(v.area().value, "> [!menu|nobody]\n- Two\n- Three");
	assert.equal(doc.activeElement, v.input("Item 1: words"));
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
	await v.add("Add an anchor");
	assert.equal(v.md().at(-1), "3. New anchor", "the new anchor starts with a short word of its own, not an empty line");
	assert.equal(doc.activeElement, v.input("Anchor 4: words"));
	assert.equal(v.input("Anchor 4: words").selectionStart, 0, "the focus is in its words, with the placeholder selected: ...");
	assert.equal(v.input("Anchor 4: words").selectionEnd, "New anchor".length, "... so what is typed replaces it");
	await v.type("Anchor 4: words", "Very sure");
	// a number is taken when its box is left
	const num = v.input("Anchor 1: number");
	num.value = "5";
	num.dispatchEvent(new w.Event("change", { bubbles: true }));
	await v.settle();
	assert.equal(v.md()[5], "5. Not yet");
	num.value = "x";
	num.dispatchEvent(new w.Event("change", { bubbles: true }));
	await v.settle();
	assert.match(v.refusal(), /^Not changed\. An anchor's number is digits only/);
	assert.equal(v.input("Anchor 1: number").value, "5", "the field shows what the note has");
	await v.add("Add an item");
	assert.equal(v.md()[3], "- Neap tides");
	assert.equal(v.md()[4], "- ");
	assert.equal(v.md()[5], "", "the blank line above the numbered list is kept");
	await v.press("Anchor 1: remove");
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
	await v.add("Add an item");
	await v.add("Add an anchor");
	assert.equal(v.dialog(), null);
	assert.equal(v.disk.writes, 2);
	await v.pressAsk("Item 1: move down");
	assert.match(words(v.dialog()), /The items and anchors of “topics” touch 1 saved answer\./);
	await v.answer("Cancel");
	assert.equal(v.disk.writes, 2);
	await v.pressAsk("Item 2: move up");
	assert.match(words(v.dialog()), /The items and anchors of “topics” touch 1 saved answer\./);
	await v.answer("Change");
	assert.equal(v.disk.writes, 3);
	await v.pressAsk("Anchor 3: remove");
	assert.match(words(v.dialog()), /The items and anchors of “topics” touch 1 saved answer\./);
	await v.answer("Change");
	assert.equal(v.disk.writes, 4);
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
	assert.ok(v.strip().includes("menu"), "the strip keeps its own `menu` value where there is no picker");
	v.close();
});

test("leaving the Markdown reads the rows again; a text the rows cannot show replaces them by the reason without losing the typed text, and a text they can show brings them back", async () => {
	const v = rig(NOTE());
	v.go("How it went");
	v.open("question", "[!choice|odd]");
	await v.typeArea("> [!choice|odd] Odd one\n- [ ] One\n- [ ] Two");
	assert.deepEqual(v.texts(), ["One", "Two"]);
	const odd = "> [!choice|odd] Odd one\n- [ ] One\n  - Said\n    and more";
	await v.typeArea(odd);
	assert.equal(v.texts().length, 0);
	assert.match(words(v.editor().querySelector(".booklet-design-rows-refused")), /There is a line under the list that the rows cannot show/);
	assert.equal(v.area().value, odd, "what was typed is still there");
	await v.typeArea("> [!multi|odd open] Odd one\n- [ ] One\n  - Said\n- [ ] Two");
	assert.deepEqual(v.texts(), ["One", "Said", "Two"]);
	assert.ok(v.item("open"));
	assert.equal(v.item("open").getAttribute("aria-checked"), "true");
	// a block that is turned into one the rows do not know has no rows part at all
	await v.typeArea("> [!text|odd] Odd one");
	assert.equal(v.editor().querySelector(".booklet-design-rows").classList.contains("is-empty"), true);
	v.close();
});

test("Esc closes the block after applying; a row's change is already in the note, so nothing is thrown away, and a change and its undoing are two steps", async () => {
	const v = rig(NOTE());
	v.go("How it went");
	v.open("question", "[!choice|where]");
	await v.press("Option 3: remove");
	assert.equal(v.disk.writes, 1);
	const key = (k) => v.editor().dispatchEvent(new w.KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
	key("Escape");
	await v.settle();
	assert.equal(v.editor(), null, "Esc closes it, and says nothing of a draft");
	assert.equal(v.disk.writes, 1, "and writes nothing more");
	// reopened: the options are as the note has them, with the option gone
	v.open("question", "[!choice|where]");
	assert.equal(v.texts().length, 5);
	// a row change and then back again is two changes
	await v.press("Option 1: correct answer");
	await v.press("Option 1: correct answer");
	assert.equal(v.disk.writes, 3);
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

/* ======================================================================== rows stay in step with the note (found in the real app) ======================================================================== */

test("the rows show the note after an option is moved and another removed (a move puts the words into the rows without leaving them looking as if typed in)", async () => {
	const v = rig(NOTE());
	v.go("How it went");
	v.open("question", "[!multi|outside");
	await v.press("Option 2: move up");
	assert.deepEqual(v.texts(), ["Gardened", "Walked"]);
	await v.press("Option 1: remove");
	assert.deepEqual(v.texts(), ["Walked"], "the screen shows what the note has, not the row that was removed");
	assert.match(v.disk.text, /\[!multi\|outside open\] What did you do outside\?\n- \[ \] Walked\n\n/);
	v.close();
});

test("a row put right from the note (by Undo, or by a move) is not typing: the Markdown typed after it is read back into the rows, and words typed in a row that moved are written", async () => {
	const v = rig(NOTE());
	v.go("How it went");
	v.open("question", "[!choice|where]");
	await v.type("Option 3: words", "Numb and still");
	click(v.undo());
	await v.settle();
	assert.equal(v.input("Option 3: words").value, "Numb", "Undo put the words back into the row");
	await v.typeArea(v.area().value.replace(/^- \[ \] Numb$/m, "- [ ] Numbed"));
	assert.equal(v.input("Option 3: words").value, "Numbed", "the Markdown's change is read back into the row");
	// a move, then words typed in the row that moved: written, not held
	await v.press("Option 3: move up");
	await v.type("Option 2: words", "Numbed again");
	assert.match(v.disk.text, /- \[ \] Numbed again\n/);
	v.close();
});

test("typing in the first own option of a question that has a kept answer asks first, and Cancel puts the row back to what the note has (nothing is dropped without a word)", async () => {
	const note = NOTE(KEPT);
	const v = rig(note);
	v.go("How it went");
	v.open("question", "[!multi|morning");
	void v.row("Shared menu").components[0].change("");
	await later(20);
	await v.answer("Change");
	await v.settle();
	await v.add("Add an option");
	const w0 = v.disk.writes;
	const el = v.input("Option 1: words");
	typeInto(el, "Own thing");
	el.dispatchEvent(new w.Event("change", { bubbles: true }));
	await later(50);
	assert.ok(v.dialog(), "the question of the kept answer is asked about in the open");
	assert.equal(v.disk.writes, w0, "nothing is written while it asks");
	await v.answer("Cancel");
	assert.equal(v.disk.writes, w0);
	assert.equal(v.input("Option 1: words").value, "", "declined: the row is the note's again");
	typeInto(v.input("Option 1: words"), "Own thing");
	v.input("Option 1: words").dispatchEvent(new w.Event("change", { bubbles: true }));
	await later(50);
	await v.answer("Change");
	assert.equal(v.disk.writes, w0 + 1);
	assert.match(v.disk.text, /\[!multi\|morning\] This morning I went to…\n- \[ \] Own thing\n/);
	v.close();
});

test("Markdown typed with a line that starts another block is applied as typed, and the box then shows the block's own lines, not the typing (so a second typing is not laid over lines that are another block's now)", async () => {
	const v = rig(NOTE());
	v.go("How it went");
	v.open("question", "[!choice|where]");
	const was = v.area().value;
	// a line indented under an option, with no reply above it, is prose: the format ends the question there
	await v.typeArea(was.replace("- [ ] Calm\n", "- [ ] Calm\n    and more\n"));
	assert.equal(v.disk.writes, 1);
	assert.equal(v.area().value, "> [!choice|where] Where are you right now?\n- [ ] Calm", "the Markdown holds what the block is now");
	assert.match(v.disk.text, /- \[ \] Calm\n    and more\n  - That is the settling system at work\./);
	v.close();
});

test("a block whose rows are refused says to edit it in the Markdown below, and the Markdown section is open, so the words point at something that is there", () => {
	const v = rig(NOTE());
	v.go("How it went");
	v.open("question", "[!choice|odd]");
	assert.match(words(v.o?.el.querySelector(".booklet-design-rows-refused") ?? v.el.querySelector(".booklet-design-rows-refused")), /^The rows are not offered for this block, so it is edited in the Markdown below\./);
	assert.equal(v.editor().querySelector("details.booklet-design-edit-md").open, true);
	v.close();
	// and a block whose rows are offered keeps it closed
	const w = rig(NOTE());
	w.go("How it went");
	w.open("question", "[!choice|where]");
	assert.equal(w.editor().querySelector("details.booklet-design-edit-md").open, false);
	w.close();
});

test("a press on Add an option straight after typing: the drawing of the typing's write, held until the pointer is up, does not take the focus wish of the press (the new row ends with the focus)", async () => {
	const v = rig(NOTE());
	v.go("How it went");
	v.open("question", "[!choice|where]");
	const title = v.title();
	typeInto(title, "Where are you now?");
	const add = v.button("Add an option");
	// the pointer goes down on the button: the title is left (its change is handed over), and the drawing its write asks for waits for the pointer
	add.dispatchEvent(new w.MouseEvent("mousedown", { bubbles: true, cancelable: true }));
	title.dispatchEvent(new w.Event("change", { bubbles: true }));
	await later(30);
	assert.equal(v.disk.writes, 1, "the title was written at the press");
	// the pointer comes up and the click follows at once, before the held drawing's timer runs: the held drawing then comes while the press's
	// change is under way (a write takes time in Obsidian, so the stand-in vault is slow here too)
	const process = v.app.vault.process;
	v.app.vault.process = async (file, fn) => {
		await later(40);
		return process(file, fn);
	};
	add.dispatchEvent(new w.MouseEvent("mouseup", { bubbles: true, cancelable: true }));
	click(add);
	await v.settle();
	await later(30);
	assert.equal(v.disk.writes, 2);
	assert.equal(v.texts().filter((t) => t === "").length, 1, "a new empty row");
	assert.equal(doc.activeElement?.getAttribute("data-key"), "o3-text", "the focus is in the new row's words");
	v.close();
});
