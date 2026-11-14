/*
 * The Design view's editor in place, and the outline's lists, run in node over jsdom with the stand-in for Obsidian.
 *
 * A click on a block (or on a page's "Edit settings") opens that block's own lines in a box where it stands: a live preview of the
 * block as the reader sees it, the settings as native setting rows, and the Markdown. The rows and the Markdown are two views of ONE
 * draft; nothing reaches the note until Save, which is one `changeLines` through the same guard as every other change. What this says
 * is what the view does with the pieces Obsidian is stood in for. How it looks, and how a soft keyboard behaves, is measured in the
 * real app, which this is not.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { window as w, click, words, typeInto, press, testApp } from "./dom.mjs";
import { core, ROOT } from "./helpers.mjs";
import { readFileSync } from "node:fs";
import { HELD } from "./editor-fixture.mjs";
import { FULL, UNREAD, crlf, lineOf } from "./design-fixtures.mjs";
import { openDesign, doc } from "./design-harness.mjs";

const { Setting, MarkdownView } = await import("./obsidian-stub.mjs");
const { EditorPanel } = await import("./.build/view.mjs");
const { parseDesign, walkDesign, minimalChange, applyChange, blockLines, DESIGN_STRINGS, settingsModel } = core;

const en = (k) => DESIGN_STRINGS[k].en;
const later = (ms) => new Promise((r) => setTimeout(r, ms));

/** Opens a view and drives it. */
function rig(text) {
	Setting.reset();
	const o = openDesign(text);
	const m = {
		...o,
		/** Presses a block of the page: it is selected and opens in place. Gives the block as it is drawn after. */
		open: (kind, needle) => o.select(kind, needle),
		/** The page's own "Edit settings" button: the container's own lines open in the editor. */
		openPage: () => click(o.el.querySelector(".booklet-design-page-head .booklet-design-page-edit")),
		/** The form row (the Setting) of this name in the open editor. */
		row: (name) => {
			const hit = Setting.made.filter((s) => s.settingEl.isConnected && words(s.nameEl) === name);
			assert.equal(hit.length, 1, `one row named ${name} (${hit.length})`);
			return hit[0];
		},
		rowNames: () => Setting.made.filter((s) => s.settingEl.isConnected && s.settingEl.parentElement.classList.contains("booklet-design-settings")).map((s) => words(s.nameEl)),
		/** Types into a text row and leaves it (the box's `change`): the draft changes, the note does not. */
		type(name, value) {
			const c = m.row(name).components[0];
			c.inputEl.value = value;
			c.inputEl.dispatchEvent(new w.Event("change", { bubbles: true }));
		},
		async toggle(name, on) {
			await m.row(name).components[0].change(on);
		},
		/** What the editor refused in its settings, in words (empty when nothing). */
		refusal: () => words(o.el.querySelector(".booklet-design-edit-refusal")),
		editorState: () => words(o.el.querySelector(".booklet-design-editor-state")),
		mark: () => words(o.el.querySelector(".booklet-design-edit-mark")),
		button: (label, from = o.el) => [...from.querySelectorAll("button")].find((b) => words(b) === label),
		dialog: () => doc.querySelector(".booklet-design-ask"),
		async answer(label) {
			const b = [...m.dialog().querySelectorAll("button")].find((x) => words(x) === label);
			assert.ok(b, `no ${label} in the dialog`);
			click(b);
			await o.view.whenIdle();
		},
		/** Presses Save and waits for what it set going. */
		save: () => o.press(m.button("Save", o.editor())),
		/** The blocks selected now, as kind@line. */
		selected: () => o.all(".booklet-design-block.is-selected").map((b) => `${b.getAttribute("data-kind")}@${b.getAttribute("data-start")}`),
	};
	return m;
}

/** Every byte outside the one change is what it was; the change is within the lines the test names. */
function onlyLines(before, after, ...lines) {
	const x = before.split("\n");
	const y = after.split("\n");
	assert.equal(x.length, y.length, "the same number of lines");
	assert.deepEqual(x.map((l, i) => (l === y[i] ? -1 : i)).filter((i) => i >= 0), lines, "only these lines differ");
	const c = minimalChange(before, after);
	assert.ok(c, "something changed");
	assert.equal(applyChange(before, c), after);
}

/* ======================================================================== the box ======================================================================== */

test("a press on a block opens it in place: a header, the reader's view of it, its settings as setting rows, its Markdown, and Cancel and Save; the page's own button opens the container's lines the same way", () => {
	const v = rig(FULL);
	v.go("Spending");
	const block = v.open("question", "[!text|spent]");
	const box = v.editor();
	assert.equal(box.parentElement, block, "in the block, in place");
	assert.equal(words(box.querySelector(".booklet-design-edit-title")), "Editing: Question");
	assert.equal(v.mark(), "", "nothing changed: no Unsaved mark");
	// as the reader sees it: the question drawn, inert
	assert.equal(words(box.querySelector(".booklet-design-edit-section.is-preview .booklet-design-edit-label")), "As the reader sees it");
	assert.ok(box.querySelector(".booklet-design-edit-previewhost [inert]"), "an inert drawing");
	// the Markdown: just the block's own lines, spell-check off, labelled in words
	const q = walkDesign(parseDesign(FULL)).find((n) => n.kind === "question" && n.id === "spent");
	assert.equal(v.area().value, blockLines(FULL, q).join("\n"));
	assert.equal(v.area().spellcheck, false);
	assert.equal(v.area().getAttribute("spellcheck"), "false");
	assert.match(v.area().getAttribute("aria-label"), /^Markdown of Question$/);
	assert.equal(words(box.querySelector(".booklet-design-edit-section.is-markdown .booklet-design-edit-label")), "Markdown");
	// the settings
	assert.deepEqual(v.rowNames().slice(0, 4), ["Settings", "Id", "Title", "long"]);
	// the foot: the hint says what the keys do, and the two buttons are visible
	assert.equal(words(box.querySelector(".booklet-design-edit-hint")), "Ctrl+Enter saves. Esc twice discards.");
	assert.deepEqual([...box.querySelectorAll(".booklet-design-editor-buttons button")].map(words), ["Cancel", "Save"]);
	assert.equal(doc.activeElement, v.area(), "the box has the focus");
	assert.equal(block.querySelector(":scope > .booklet-design-floatbar"), null, "the bar waits while the block is open");
	assert.deepEqual(v.selected(), ["question@" + lineOf(FULL, "[!text|spent]")]);
	// the page's own button: the container's opening lines, and no preview (a container has no drawing of its own)
	click(v.button("Cancel", box));
	v.go("Spending");
	v.openPage();
	assert.equal(v.editor().parentElement, v.page(), "in the page, under its title");
	assert.equal(v.area().value, "> [!activity|spending tab:now repeat] Spending\n> half an hour");
	assert.equal(words(v.editor().querySelector(".booklet-design-edit-title")), "Editing: Activity");
	assert.equal(v.editor().querySelector(".is-preview"), null);
	v.close();
});

test("the settings of an activity are the rows the settings model gives it, with the line's own values", () => {
	const v = rig(FULL);
	v.go("Spending");
	v.openPage();
	assert.deepEqual(v.rowNames(), ["Settings", "Id", "Title", "repeat", "daily", "hidden", "Icon", "status", "tab", "entries"]);
	assert.equal(v.row("Id").components[0].inputEl.value, "spending");
	assert.equal(v.row("Title").components[0].inputEl.value, "Spending");
	assert.equal(v.row("repeat").components[0].value, true);
	assert.equal(v.row("hidden").components[0].value, false);
	assert.equal(v.row("tab").components[0].inputEl.value, "now");
	const model = settingsModel("> [!activity|spending tab:now repeat] Spending");
	for (const f of model.flags) assert.ok(v.rowNames().includes(f.name), f.name);
	for (const f of model.values) assert.ok(v.rowNames().includes(f.name === "icon" ? "Icon" : f.name), f.name);
	v.close();
});

test("one block is open at a time: pressing another while the first is unchanged moves the editor; with a draft in the first it says so and does nothing", () => {
	const v = rig(FULL);
	v.go("Doing");
	const a = v.open("question", "[!choice|did]");
	assert.ok(a.querySelector(":scope > .booklet-design-editbox"));
	const b = v.open("question", "[!text|left]");
	assert.equal(v.all(".booklet-design-editbox").length, 1, "one editor");
	assert.equal(v.block("question", "[!choice|did]").querySelector(".booklet-design-editbox"), null, "the first closed: nothing was changed in it");
	assert.ok(b.isConnected);
	assert.deepEqual(v.selected(), ["question@" + lineOf(FULL, "[!text|left]")]);
	// with a draft in the second
	typeInto(v.area(), "> [!text|left] Left side?");
	click(v.block("question", "[!choice|did]"));
	assert.equal(v.status(), en("editor.busy"));
	assert.equal(v.all(".booklet-design-editbox").length, 1);
	assert.equal(v.area().value, "> [!text|left] Left side?", "the draft is where it was");
	assert.deepEqual(v.selected(), ["question@" + lineOf(FULL, "[!text|left]")], "and the selection did not move");
	// a press on the editor's own labels does not select the block around it, nor close it
	click(v.editor().querySelector(".setting-item-name"));
	assert.ok(v.editor());
	v.close();
});

test("a block with no settings has an editor with its Markdown and no rows; the records, which the view never changes, open nothing and say why", () => {
	const v = rig(FULL);
	v.go("Money");
	v.open("prose", "Words in the module's opening.");
	assert.ok(v.area());
	assert.equal(v.area().value, "Words in the module's opening.");
	assert.deepEqual(v.rowNames(), [], "no rows");
	assert.ok(v.editor().querySelector(".is-form").classList.contains("is-empty"), "an empty form takes no room");
	click(v.button("Cancel"));
	v.go("A made-up booklet");
	const rec = v.all(".booklet-design-block[data-kind='records']")[0];
	click(rec);
	assert.equal(v.editor(), null, "nothing opens");
	assert.match(v.status(), /records section holds kept data/);
	assert.equal(rec.querySelector(":scope > .booklet-design-floatbar"), null, "and no bar of buttons");
	v.close();
});

test("the bar's Edit as Markdown button opens the editor of a selected block, as a press on it does", () => {
	const v = rig(FULL);
	v.go("Spending");
	const block = v.pick("question", "[!text|spent]");
	assert.equal(v.editor(), null);
	click(v.act(block, "edit"));
	assert.ok(v.area());
	assert.equal(v.editor().parentElement, v.block("question", "[!text|spent]"));
	v.close();
});

test("Enter that is a button's own press does not open the editor: on the Delete button, Enter is Delete's; on the selected block itself it opens", () => {
	const v = rig(FULL);
	v.go("Spending");
	const block = v.pick("question", "[!text|spent]");
	const evt = v.key("Enter", { target: v.act(block, "delete") });
	assert.equal(evt.defaultPrevented, false, "the key was left to the button");
	assert.equal(v.area(), null);
	v.key("Enter", { target: block });
	assert.ok(v.area());
	v.close();
});

/* ======================================================================== the settings are the draft's ======================================================================== */

test("a switch, a field, a title and an id each change the draft and nothing else: the note is not written until Save, and Save writes the opening line as one write", async () => {
	const v = rig(FULL);
	v.go("Spending");
	const act = lineOf(FULL, "[!activity|spending");
	v.openPage();
	const before = v.disk.text;
	await v.toggle("hidden", true);
	assert.equal(v.area().value.split("\n")[0], "> [!activity|spending tab:now repeat hidden] Spending", "the Markdown follows the row at once");
	assert.equal(v.disk.writes, 0, "the note is not written");
	assert.equal(v.mark(), "Unsaved changes");
	assert.match(v.editorState(), /^Unsaved\./);
	assert.equal(v.row("hidden").components[0].value, true, "and the row shows the draft");
	v.type("Icon", "book-open");
	assert.equal(v.area().value.split("\n")[0], "> [!activity|spending tab:now repeat hidden icon:book-open] Spending");
	v.type("Title", "Money going out");
	v.type("Id", "outgoings");
	assert.equal(v.area().value, "> [!activity|outgoings tab:now repeat hidden icon:book-open] Money going out\n> half an hour", "the second line of the block is as it was");
	assert.equal(v.disk.writes, 0);
	await v.save();
	assert.equal(v.disk.writes, 1, "one write");
	assert.equal(v.disk.text.split("\n")[act], "> [!activity|outgoings tab:now repeat hidden icon:book-open] Money going out");
	onlyLines(before, v.disk.text, act);
	assert.match(v.status(), /^Changed Activity: Spending\./);
	assert.equal(v.editor(), null, "the editor closes");
	v.close();
});

test("the markdown and the rows are in step: a row changes the box at once; typing in the box changes the rows (about 150 ms later); both are one draft", async () => {
	const v = rig(FULL);
	v.go("Spending");
	v.openPage();
	assert.equal(v.row("daily").components[0].value, false);
	typeInto(v.area(), "> [!activity|spending tab:now repeat daily] Spending\n> half an hour");
	assert.equal(v.row("daily").components[0].value, false, "not at once: the rows wait a moment for the typing to stop");
	await later(250);
	assert.equal(v.row("daily").components[0].value, true, "then they read the draft");
	await v.toggle("daily", false);
	assert.equal(v.area().value, "> [!activity|spending tab:now repeat] Spending\n> half an hour");
	assert.equal(v.mark(), "", "back to the opening text: nothing is unsaved");
	v.close();
});

test("the preview follows the draft about 150 ms after a change, in the same drawing as the page, inert", async () => {
	const v = rig(FULL);
	v.go("Spending");
	v.open("question", "[!text|spent]");
	const host = () => v.editor().querySelector(".booklet-design-edit-previewhost");
	assert.match(words(host()), /What did you spend\?/);
	typeInto(v.area(), "> [!text|spent] Money out this week?");
	await later(250);
	assert.match(words(host()), /Money out this week\?/);
	assert.ok(host().querySelector("[inert]"));
	assert.equal(v.disk.writes, 0, "a preview writes nothing");
	v.close();
});

test("the whole-note byte check, on a note with CRLF endings and a question inside a group: only the opening line's bytes change", async () => {
	const text = crlf(FULL);
	const v = rig(text);
	v.go("Doing");
	const q = lineOf(text, "[!choice|did]");
	v.open("question", "[!choice|did]");
	await v.toggle("open", true);
	await v.save();
	assert.equal(v.disk.text.split("\n")[q], "> > [!choice|did open] Did you?\r");
	onlyLines(text, v.disk.text, q);
	assert.equal(v.disk.text.split("\n").every((l, i, a) => i === a.length - 1 || l.endsWith("\r")), true);
	v.close();
});

test("a value that is refused says why, inline, in words, and changes nothing: the draft is as it was and the row goes back to what the draft has", () => {
	const v = rig(FULL);
	v.go("Spending");
	v.openPage();
	const draft = v.area().value;
	for (const [name, value, why] of [
		["Id", "two words", /Not changed\. An id has letters, digits and dashes only/],
		["Id", "why", /Not changed\. `why` is already used/],
		["Id", "", /Not changed\. An id cannot be empty/],
		["Icon", "a b", /Not changed\. A setting's value has no spaces/],
		["status", "a]b", /Not changed\. A setting's value cannot hold `\]`/],
	]) {
		v.type(name, value);
		assert.match(v.refusal(), why, name + " " + JSON.stringify(value));
		assert.equal(v.area().value, draft, "the draft is as it was");
		assert.equal(v.mark(), "", "nothing is unsaved");
		assert.equal(v.disk.writes, 0, "nothing was written");
		assert.equal(v.undo().disabled, true, "nothing to undo");
	}
	assert.equal(v.row("Id").components[0].inputEl.value, "spending", "the row shows the draft's own id again");
	// the next good change takes the refusal away
	v.type("Title", "Money out");
	assert.equal(v.refusal(), "");
	v.close();
});

test("a switch that needs another is refused with its reason: `daily` without `repeat`", async () => {
	const v = rig(FULL);
	v.go("A bare activity");
	v.openPage();
	const draft = v.area().value;
	await v.toggle("daily", true);
	assert.match(v.refusal(), /Not changed\. `daily` needs `repeat`/);
	assert.equal(v.area().value, draft);
	assert.equal(v.disk.writes, 0);
	v.close();
});

test("an id change that would detach kept entries is asked about when it is SAVED: nothing is written while it is open, no keeps the draft, yes writes it, and Undo brings it back byte for byte", async () => {
	const v = rig(HELD);
	v.go("A mood log");
	const act = lineOf(HELD, "[!activity|log repeat]");
	v.openPage();
	const before = v.disk.text;
	v.type("Id", "diary");
	assert.equal(v.dialog(), null, "a row only changes the draft: no question yet");
	click(v.button("Save"));
	assert.ok(v.dialog(), "a question is open");
	assert.equal(v.disk.writes, 0, "nothing is written while it is open");
	const ask = words(v.dialog());
	assert.match(ask, /12 kept entries/);
	assert.match(ask, /activity id `log`/);
	assert.match(ask, /stay in the note's records as they are/);
	assert.deepEqual([...v.dialog().querySelectorAll("button")].map(words), ["Change", "Cancel"]);
	assert.match(words(doc.querySelector(".booklet-design-ask p")), /will be changed in the note\. Only its own lines are rewritten\./);
	// no: the note is as it was and the draft is still in the box
	await v.answer("Cancel");
	assert.equal(v.disk.writes, 0);
	assert.equal(v.disk.text, before);
	assert.equal(v.undo().disabled, true);
	assert.equal(v.status(), "Nothing was changed.");
	assert.ok(v.editor(), "the editor stays open");
	assert.equal(v.area().value.split("\n")[0], "> [!activity|diary repeat] A mood log", "with the draft");
	// yes
	click(v.button("Save"));
	await v.answer("Change");
	assert.equal(v.dialog(), null);
	assert.equal(v.disk.writes, 1);
	assert.equal(v.disk.text.split("\n")[act], "> [!activity|diary repeat] A mood log");
	onlyLines(before, v.disk.text, act);
	assert.match(v.status(), /^Changed Activity: A mood log\./);
	// the kept entries were never touched: the records are the bytes they were
	assert.equal(v.disk.text.slice(v.disk.text.indexOf("%%")), before.slice(before.indexOf("%%")));
	// and the kept data that now matches nothing is listed
	assert.match(words(v.el.querySelector(".booklet-design-leftovers")), /12 kept entries for the activity `log`/);
	await v.press(v.undo());
	assert.equal(v.disk.text, before, "Undo restores every byte");
	await v.press(v.redo());
	assert.equal(v.disk.text.split("\n")[act], "> [!activity|diary repeat] A mood log");
	v.close();
});

test("taking `repeat` off an activity that keeps entries is counted and asked about when saved; an icon or a title, which detach nothing, are not", async () => {
	const v = rig(HELD);
	v.go("A mood log");
	v.openPage();
	await v.toggle("repeat", false);
	click(v.button("Save"));
	assert.ok(v.dialog());
	assert.match(words(v.dialog()), /12 kept entries/);
	await v.answer("Cancel");
	await v.toggle("repeat", true);
	assert.equal(v.mark(), "", "back as it was");
	v.type("Title", "My mood log");
	await v.save();
	assert.equal(v.dialog(), null, "a title detaches nothing: no question");
	assert.equal(v.disk.writes, 1);
	v.close();
});

test("on a booklet the reader cannot open, a change cannot be counted: the question says so, and yes still writes it", async () => {
	const refused = HELD.replace("> [!module|mood end]\n", "");
	const v = rig(refused);
	v.go("A mood log");
	v.openPage();
	v.type("Id", "diary");
	click(v.button("Save"));
	assert.match(words(v.dialog()), /cannot open this booklet as it is, so this view cannot count what this change touches/);
	await v.answer("Change");
	assert.equal(v.disk.writes, 1);
	v.close();
});

test("undo and redo of a saved form change restore the exact bytes, on a note with CRLF endings too", async () => {
	for (const text of [FULL, crlf(FULL)]) {
		const v = rig(text);
		v.go("A bare activity");
		v.open("question", "[!number|n1]");
		v.type("min", "0");
		await v.save();
		const after = v.disk.text;
		assert.notEqual(after, text);
		await v.press(v.undo());
		assert.equal(v.disk.text, text, "undo: every byte");
		await v.press(v.redo());
		assert.equal(v.disk.text, after, "redo: every byte");
		v.close();
	}
});

test("the settings entry opens the front matter as rows in the same editor; a row edits the draft, Save changes only that line, and no block of the page is the front matter", async () => {
	const v = rig(FULL);
	v.go("Settings");
	assert.ok(v.editor(), "the editor is open on the front matter");
	assert.equal(v.editor().querySelector(".is-preview"), null, "front matter has no drawing");
	assert.ok(v.rowNames().includes("title"));
	assert.ok(v.rowNames().includes("booklet"), "the marker is shown, not editable");
	assert.equal(v.all(".booklet-design-block[data-kind='front-matter']").length, 0);
	const before = v.disk.text;
	v.type("title", "A renamed booklet");
	assert.equal(v.disk.writes, 0);
	assert.match(v.area().value, /^title: A renamed booklet$/m);
	await v.save();
	assert.equal(v.disk.writes, 1);
	const line = lineOf(before, "title: A made-up booklet");
	onlyLines(before, v.disk.text, line);
	assert.equal(v.disk.text.split("\n")[line], "title: A renamed booklet");
	v.close();
});

/* ======================================================================== the small Markdown editor ======================================================================== */

test("Save rewrites only those lines: a changed line of the block's Markdown goes in, every other byte of the note stays, and the editor closes with the block still selected", async () => {
	const v = rig(FULL);
	v.go("Spending");
	v.open("question", "[!text|spent]");
	const before = v.disk.text;
	const q = lineOf(FULL, "[!text|spent]");
	const own = v.area().value.split("\n");
	assert.ok(own.length >= 3, "the block's own lines include the hint that stands under the question: " + JSON.stringify(own));
	typeInto(v.area(), ["> [!text|spent long] What did you spend this week?", ...own.slice(1)].join("\n"));
	assert.match(v.editorState(), /^Unsaved\./);
	assert.equal(v.mark(), "Unsaved changes");
	await v.save();
	assert.equal(v.disk.writes, 1);
	assert.equal(v.area(), null, "closed");
	assert.equal(v.disk.text.split("\n")[q], "> [!text|spent long] What did you spend this week?");
	onlyLines(before, v.disk.text, q);
	assert.match(v.status(), /^Changed Question: What did you spend\?(?!\.)/, "names the block as it was drawn when the change was made");
	assert.deepEqual(v.selected(), ["question@" + q], "the block stays selected");
	// a line added to the block's Markdown: the note grows by that line and nothing else moves
	v.open("question", "[!text|spent");
	const mid = v.disk.text;
	typeInto(v.area(), v.area().value + "\n> And one more line.");
	await v.save();
	const grown = v.disk.text.split("\n");
	assert.equal(grown.length, mid.split("\n").length + 1);
	assert.equal(grown.slice(0, q + own.length).join("\n"), mid.split("\n").slice(0, q + own.length).join("\n"), "every line above is as it was");
	assert.equal(grown[q + own.length], "> And one more line.");
	assert.equal(grown.slice(q + own.length + 1).join("\n"), mid.split("\n").slice(q + own.length).join("\n"), "and every line below");
	v.close();
});

test("Ctrl+Enter and Cmd+Enter in the box save, as the Save button does", async () => {
	for (const mods of [{ ctrlKey: true }, { metaKey: true }]) {
		const v = rig(FULL);
		v.go("Spending");
		v.open("question", "[!text|spent]");
		typeInto(v.area(), "> [!text|spent] Spent so far?");
		const evt = new w.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true, ...mods });
		v.area().dispatchEvent(evt);
		await v.view.whenIdle();
		assert.equal(evt.defaultPrevented, true);
		assert.equal(v.disk.writes, 1);
		assert.match(v.disk.text, /\[!text\|spent\] Spent so far\?/);
		assert.equal(v.area(), null);
		v.close();
	}
});

test("the Ctrl/Cmd+Enter scope is on the app's key stack only while the box has the focus, and is gone when the box blurs, is drawn again or the view closes", async () => {
	const v = rig(FULL);
	const stack = v.app.keymap.scopes;
	const base = stack.length;
	v.go("Spending");
	v.open("question", "[!text|spent]");
	assert.equal(w.document.activeElement, v.area(), "the box has the focus");
	assert.equal(stack.length, base + 1, "one scope is added over the view's");
	// the focus leaves the box: Mod+Enter is the app's again (the page hears nothing of it, as in the real app)
	v.area().blur();
	assert.equal(stack.length, base, "taken off at blur");
	v.area().focus();
	assert.equal(stack.length, base + 1, "and put back when the focus returns");
	v.area().focus();
	assert.equal(stack.length, base + 1, "never twice");
	click(v.button("Cancel"));
	assert.equal(stack.length, base, "gone when the editor closes");
	v.open("question", "[!text|spent]");
	assert.equal(stack.length, base + 1);
	v.close();
	assert.equal(stack.length, 0, "and nothing is left on the stack when the view closes");
});

test("Cancel throws the changes away, says so, and writes nothing; the editor closes and the block stays selected", () => {
	const v = rig(FULL);
	v.go("Spending");
	v.open("question", "[!text|spent]");
	typeInto(v.area(), "something else entirely");
	click(v.button("Cancel"));
	assert.equal(v.area(), null);
	assert.equal(v.disk.writes, 0);
	assert.equal(v.disk.text, FULL);
	assert.equal(v.status(), en("editor.discarded"));
	assert.deepEqual(v.selected(), ["question@" + lineOf(FULL, "[!text|spent]")]);
	v.close();
});

test("Esc with nothing changed closes the editor at once, keeping the block selected; Esc with changes keeps them as Unsaved, and a second Esc throws them away", () => {
	const v = rig(FULL);
	v.go("Spending");
	v.open("question", "[!text|spent]");
	press(v.area(), "Escape");
	assert.equal(v.area(), null, "nothing changed: closed");
	assert.equal(v.status(), "");
	assert.equal(v.selected().length, 1, "and still selected");
	v.open("question", "[!text|spent]");
	const draft = "> [!text|spent] My draft";
	typeInto(v.area(), draft);
	const first = press(v.area(), "Escape");
	assert.equal(first, false, "the key was the editor's");
	assert.ok(v.area(), "still open");
	assert.equal(v.area().value, draft, "the draft is kept, visible");
	assert.match(v.editorState(), /^Unsaved\. Esc again throws your changes away; Save writes them\./);
	assert.equal(v.disk.writes, 0);
	// typing again puts it back to plain Unsaved (more changes are on the way)
	typeInto(v.area(), draft + "!");
	assert.match(v.editorState(), /^Unsaved\. Your changes are kept here until you save or cancel\./);
	press(v.area(), "Escape");
	press(v.area(), "Escape");
	assert.equal(v.area(), null, "the second Esc throws it away");
	assert.equal(v.disk.text, FULL);
	assert.equal(v.disk.writes, 0);
	assert.equal(v.status(), en("editor.discarded"));
	assert.equal(v.selected().length, 1);
	v.close();
});

test("a draft is never lost to a drawing, to another page or to pressing another block: it stays in its block with its text and caret, and above the page it came from when that page is not drawn", () => {
	const v = rig(FULL);
	v.go("Doing");
	const lineLeft = lineOf(FULL, "[!text|left]");
	v.open("question", "[!text|left]");
	typeInto(v.area(), "> [!text|left] Half written");
	v.area().setSelectionRange(5, 9);
	// something else makes the view draw again (the Add tab opens, a group is opened)
	v.showAdd();
	click(v.el.querySelector(".booklet-design-pal-head"));
	assert.equal(v.area().value, "> [!text|left] Half written");
	assert.equal(v.area().selectionStart, 5, "the caret is where it was");
	// another block is pressed: it says so, and the draft stays where it was
	click(v.block("question", "[!choice|did]"));
	assert.equal(v.status(), en("editor.busy"));
	assert.equal(v.all(".booklet-design-textarea").length, 1);
	assert.equal(v.area().value, "> [!text|left] Half written");
	// another page is drawn: the draft stays on the screen above it, with the reason, and its Save and Cancel
	v.go("Reading");
	const away = v.el.querySelector(".booklet-design-editbox.is-detached");
	assert.ok(away, "above the page");
	assert.match(words(away), /This block is on another page\. Your draft stays here until you save or cancel\./);
	assert.equal(v.area().value, "> [!text|left] Half written");
	assert.equal(v.button("Save", away).disabled, false, "it can still be saved: its block is in the note");
	// and the page it came from takes it back
	v.go("Doing");
	assert.equal(v.el.querySelector(".booklet-design-editbox.is-detached"), null);
	assert.equal(v.block("question", lineLeft).querySelector(".booklet-design-editbox") !== null, true, "in its block again");
	assert.equal(v.area().value, "> [!text|left] Half written");
	v.close();
});

test("a stale save is refused and says so, and the user's text stays in the box: the vault changed after the view drew, and the view's own copy changed under the editor", async () => {
	// the file changed behind the view's back
	const v = rig(FULL);
	v.go("Spending");
	v.open("question", "[!text|spent]");
	typeInto(v.area(), "> [!text|spent] My careful words");
	const elsewhere = FULL.replace("What did you spend?", "What did you spend today?");
	v.disk.text = elsewhere;
	await v.save();
	assert.equal(v.disk.text, elsewhere, "nothing was written over it");
	assert.match(v.status(), /Your text is still in the box\./);
	assert.equal(v.area().value, "> [!text|spent] My careful words", "the text is where it was typed");
	v.close();
	// the view's own copy changed under the editor (a word typed in a Markdown pane of the same note)
	const w2 = rig(FULL);
	w2.go("Spending");
	w2.open("question", "[!text|spent]");
	typeInto(w2.area(), "> [!text|spent] Mine");
	const typed = FULL.replace("What did you spend?", "What did you spend today?");
	w2.disk.text = typed;
	w2.view.setViewData(typed, false);
	await w2.save();
	assert.equal(w2.disk.writes, 0, "nothing was written");
	assert.equal(w2.disk.text, typed);
	assert.match(w2.status(), /The note changed since this editor opened, so nothing was written\. Your text is still in the box\./);
	assert.equal(w2.area().value, "> [!text|spent] Mine");
	w2.close();
});

test("an editor whose block has gone from where it was keeps its text on the screen, with the reason, and cannot save over something else", () => {
	const v = rig(FULL);
	v.go("Spending");
	v.open("question", "[!text|spent]");
	typeInto(v.area(), "> [!text|spent] Kept");
	// the note is changed so that no question stands where it did
	const moved = FULL.replace("> [!text|spent] What did you spend?\n", "Words instead.\n");
	v.disk.text = moved;
	v.view.setViewData(moved, false);
	assert.equal(v.area().value, "> [!text|spent] Kept", "the text is still there");
	const host = v.el.querySelector(".booklet-design-editbox.is-detached");
	assert.ok(host);
	assert.match(words(host), /no longer where it was in the note/);
	assert.equal(v.button("Save", host).disabled, true);
	click(v.button("Cancel", host));
	assert.equal(v.area(), null);
	v.close();
});

test("a Markdown change that renames an id kept entries hang on counts them and asks; no keeps the text in the box and writes nothing; yes writes only the lines", async () => {
	const v = rig(HELD);
	v.go("A mood log");
	const act = lineOf(HELD, "[!activity|log repeat]");
	v.openPage();
	typeInto(v.area(), "> [!activity|diary repeat] A mood log");
	click(v.button("Save"));
	assert.ok(v.dialog());
	assert.match(words(v.dialog()), /12 kept entries/);
	assert.equal(v.disk.writes, 0);
	await v.answer("Cancel");
	assert.equal(v.disk.writes, 0);
	assert.equal(v.area().value, "> [!activity|diary repeat] A mood log", "the text stays in the box");
	click(v.button("Save"));
	await v.answer("Change");
	assert.equal(v.disk.writes, 1);
	assert.equal(v.area(), null);
	onlyLines(HELD, v.disk.text, act);
	v.close();
});

test("a Markdown change that leaves the reader unable to open the booklet is asked about with the reader's reason, never refused: it is the user's own text", async () => {
	const v = rig(HELD);
	const act = lineOf(HELD, "[!activity|once]");
	v.go("Said once");
	v.openPage();
	typeInto(v.area(), "> [!activity|log] Said once");
	click(v.button("Save"));
	assert.ok(v.dialog(), "asked");
	assert.match(words(v.dialog()), /After this change the reader cannot open the booklet: .*used twice/);
	assert.equal(v.disk.writes, 0);
	await v.answer("Change");
	assert.equal(v.disk.writes, 1);
	assert.equal(v.disk.text.split("\n")[act], "> [!activity|log] Said once");
	// and it can be undone
	await v.press(v.undo());
	assert.equal(v.disk.text, HELD);
	v.close();
});

test("an empty box is refused with the reason, and the note is unchanged; the editor stays", async () => {
	const v = rig(FULL);
	v.go("Spending");
	v.open("question", "[!text|spent]");
	typeInto(v.area(), "\n\n");
	await v.save();
	assert.match(v.status(), /Not changed\. A block with no lines is a deleted block: delete it instead\./);
	assert.equal(v.disk.writes, 0);
	assert.ok(v.area(), "the box stays");
	v.close();
});

test("the whole-note byte check for an editor save: a note with CRLF endings keeps every CR, and the lines the user did not touch keep their bytes", async () => {
	const text = crlf(FULL);
	const v = rig(text);
	v.go("Spending");
	const q = lineOf(text, "[!text|spent]");
	v.open("question", "[!text|spent]");
	const own = v.area().value.split("\n");
	assert.ok(own.every((l) => !l.includes("\r")), "the box shows the lines without their line ends");
	typeInto(v.area(), ["> [!text|spent long] Changed", ...own.slice(1)].join("\n"));
	await v.save();
	assert.equal(v.disk.text.split("\n")[q], "> [!text|spent long] Changed\r");
	onlyLines(text, v.disk.text, q);
	assert.equal(v.disk.text.split("\n").every((l, i, a) => i === a.length - 1 || l.endsWith("\r")), true);
	// undo and redo
	const after = v.disk.text;
	await v.press(v.undo());
	assert.equal(v.disk.text, text);
	await v.press(v.redo());
	assert.equal(v.disk.text, after);
	v.close();
});

/* ======================================================================== the keys are the field's while a field has the focus ======================================================================== */

test("the view's hotkeys are silent while the textarea has the focus: a letter typed into it marks no group and is not taken; Mod+Z is the box's", () => {
	const v = rig(FULL);
	v.go("Spending");
	v.open("question", "[!text|spent]");
	const area = v.area();
	area.focus();
	assert.equal(doc.activeElement, area);
	for (const k of ["s", "q", "r", "v", "d", "Backspace", "ArrowDown", "1"]) {
		const evt = v.key(k, { target: area });
		assert.equal(evt.defaultPrevented, false, `${k} is left to the box`);
		assert.equal(v.el.querySelector(".is-keyed"), null, `${k} marked nothing`);
		assert.equal(v.tab("outline").getAttribute("aria-selected"), "true", `${k} did not change tab`);
	}
	const undo = v.key("z", { target: area, ctrlKey: true });
	assert.equal(undo.defaultPrevented, false, "undo in the box is the box's own");
	// with the focus elsewhere the same letter is the view's
	area.blur();
	v.key("s", { target: doc.body });
	assert.ok(v.el.querySelector(".booklet-design-pal-group.is-keyed"), "outside a field it marks the Structure group");
	v.close();
});

test("the hotkeys are silent while a form row's box has the focus, too", () => {
	const v = rig(FULL);
	v.go("Spending");
	v.openPage();
	const input = v.row("Title").components[0].inputEl;
	input.focus();
	const evt = v.key("q", { target: input });
	assert.equal(evt.defaultPrevented, false);
	assert.equal(v.el.querySelector(".is-keyed"), null);
	// Enter in a form row is the row's own (it commits the field): it does not open another editor, nor close this one
	v.key("Enter", { target: input });
	assert.equal(v.all(".booklet-design-editbox").length, 1);
	v.close();
});

/* ======================================================================== the outline and the lines the reader cannot read ======================================================================== */

test("every outline entry is a button that draws its page and the crumb follows; the first one is the settings", () => {
	const v = rig(FULL);
	const entries = v.all(".booklet-design-nav-item");
	assert.ok(entries.length >= 13);
	assert.equal(words(entries[0]), "Settings");
	for (const b of entries.slice(1)) {
		click(v.tab("outline"));
		click(v.all(".booklet-design-nav-item").find((x) => x.getAttribute("data-start") === b.getAttribute("data-start") && x.getAttribute("data-kind") === b.getAttribute("data-kind")));
		const start = b.getAttribute("data-start");
		assert.ok(v.page(), `${words(b)} draws a page`);
		assert.equal(v.page().getAttribute("data-start"), start, `${words(b)} draws the page that starts at line ${start}`);
		assert.match(words(v.el.querySelector(".booklet-design-crumb-item[aria-current='true']")), /./, "the crumb follows");
	}
	v.close();
});

test("the outline lists pages under the page their `parent:` names", () => {
	const v = rig(FULL);
	const items = v.all(".booklet-design-nav-row").map((li) => [words(li.querySelector(".booklet-design-nav-item")), li.className]);
	const map = items.findIndex(([t]) => t === "The map");
	const choosing = items.findIndex(([t]) => t === "Choosing");
	assert.ok(map >= 0 && choosing > map);
	const depth = (i) => Number(/is-depth-(\d)/.exec(items[i][1])[1]);
	assert.equal(depth(choosing), depth(map) + 1);
	v.close();
});

test("the list of lines the reader cannot read is at the foot of the outline: each entry says why in words, and a press draws the page of its block and selects the block", () => {
	const v = rig(UNREAD);
	const det = v.el.querySelector(".booklet-design-problems");
	const count = Number(det.getAttribute("data-count"));
	assert.ok(count >= 3);
	assert.match(words(det.querySelector("summary")), new RegExp(`^Lines the reader cannot read \\(${count}\\)$`));
	const buttons = v.all(".booklet-design-trouble-list button", det);
	assert.ok(buttons.length >= 3);
	const core2 = core.problemsOf(UNREAD);
	const tree = walkDesign(parseDesign(UNREAD));
	for (const b of buttons) {
		const why = words(b.querySelector(".booklet-design-trouble-why"));
		assert.match(why, /^Line \d+: .+/, "the line and the reason");
		assert.ok(core2.some((p) => `Line ${p.line + 1}: ${p.why}` === why), why);
		click(b);
		const line = Number(/Line (\d+)/.exec(why)[1]) - 1;
		assert.ok(v.page(), "a page is drawn");
		assert.ok(Number(v.page().getAttribute("data-start")) <= line, "a page that starts before the line");
		const sel = v.selected();
		if (sel.length) {
			const node = tree.find((n) => n.parent && `${n.kind}@${n.start}` === sel[0]);
			assert.ok(node.start <= line && line < node.end, `${sel[0]} holds the line`);
			assert.equal(node.start, Number(b.getAttribute("data-start")));
		}
	}
	v.close();
});

test("a booklet the reader reads cleanly says so; kept data that matches nothing is a list of its own, apart from the unreadable lines", () => {
	const v = rig(HELD);
	assert.match(words(v.el.querySelector(".booklet-design-problems")), /The reader can read every line\./);
	assert.match(words(v.el.querySelector(".booklet-design-leftovers")), /All kept data matches the booklet\./);
	v.close();
	const renamed = rig(HELD.replace("[!activity|log repeat]", "[!activity|diary repeat]"));
	assert.match(words(renamed.el.querySelector(".booklet-design-leftovers summary")), /^Kept data that matches nothing now \(\d+\)$/);
	assert.match(words(renamed.el.querySelector(".booklet-design-leftovers")), /12 kept entries for the activity `log`/);
	assert.match(words(renamed.el.querySelector(".booklet-design-problems")), /The reader can read every line\./, "the entries are not a line the reader cannot read");
	click(renamed.el.querySelector(".booklet-design-leftovers button"));
	assert.ok(renamed.page(), "its page is drawn");
	renamed.close();
});

test("a note that is not a booklet has no problems to list (only a booklet is read by the reader), and the view says it is not one", () => {
	const v = rig("Just some notes.\n");
	assert.equal(v.el.querySelector(".booklet-design-problems").getAttribute("data-count"), "0");
	assert.ok(v.el.querySelector(".booklet-design-banner"));
	v.close();
});

/* ======================================================================== a phone ======================================================================== */

test("the editor has visible buttons for everything (Cancel, Save), each at least 44 px high on a phone by the sheet, the textarea is monospace and sizes to its content, and the narrow rules stack the rows", () => {
	const css = readFileSync(`${ROOT}/styles.base.css`, "utf8");
	assert.match(css, /\.is-mobile \.booklet-design button,\s*\n\.is-mobile \.booklet-design summary,\s*\n\.booklet-design\.is-phone button,\s*\n\.booklet-design\.is-phone summary \{\s*\n\s*min-width: 44px;\s*\n\s*min-height: 44px;/);
	assert.match(css, /\.booklet-design-textarea \{[^}]*field-sizing: content;[^}]*font-family: var\(--font-monospace\);/);
	const v = rig(FULL);
	v.go("Spending");
	v.open("question", "[!text|spent]");
	assert.deepEqual([...v.el.querySelectorAll(".booklet-design-editor-buttons button")].map(words), ["Cancel", "Save"]);
	v.close();
	const phone = openDesign(FULL, { phone: true });
	assert.ok(phone.el.classList.contains("is-phone"));
	click(phone.el.querySelector(".booklet-design-menubutton"));
	phone.go("Spending");
	click(phone.block("question", "[!text|spent]"));
	assert.ok(phone.editor(), "the editor opens on a phone, and the menu panel is shut");
	assert.equal(phone.el.querySelector(".booklet-design-left").hidden, true);
	phone.close();
});

/* ======================================================================== the side panel after the move ======================================================================== */

function panelOn(text, cursorLine) {
	const view = new MarkdownView();
	view.file = { path: "Held.booklet.md", basename: "Held.booklet" };
	view.editor = { getValue: () => text, getCursor: () => ({ line: cursorLine, ch: 0 }), replaceRange() {}, offsetToPos: () => ({ line: 0, ch: 0 }) };
	const side = { markdownView: () => view, bookletOpen: () => null, openMarkdownOf: async () => {} };
	const disk = { text, writes: 0 };
	const app = testApp(disk, { workspace: { onLayoutReady: (fn) => fn(), iterateAllLeaves() {} } });
	const panel = new EditorPanel({ app }, side);
	void panel.onOpen();
	return { panel, el: panel.contentEl, close: () => (panel.contentEl.empty(), panel.containerEl.remove()) };
}

test("the side panel after the move carries the piece picker, the settings of the Booklet line under the cursor, the options of a choice, and the declared fields of a data block: no outline, no problems", () => {
	const names = (el) => [...el.querySelectorAll(":scope > details.booklet-blocks-section > summary")].map(words);
	const at = (needle) => lineOf(HELD, needle);
	// on an activity line
	const a = panelOn(HELD, at("[!activity|log repeat]"));
	assert.deepEqual(names(a.el), ["Add a block", "This line", "Options", "Data fields"], "the four sections the panel keeps, and no others");
	assert.equal(a.el.querySelector(".booklet-blocks-outline"), null);
	assert.equal(a.el.querySelector(".booklet-blocks-problems"), null);
	assert.equal(a.el.querySelector(".booklet-blocks-jump"), null);
	const shown = (el, cls) => !el.querySelector(`.${cls}`).classList.contains("booklet-blocks-hidden");
	assert.equal(shown(a.el, "booklet-blocks-add"), true, "the piece picker");
	assert.equal(shown(a.el, "booklet-blocks-line"), true, "the settings of the line");
	assert.equal(shown(a.el, "booklet-blocks-options"), false);
	assert.equal(shown(a.el, "booklet-blocks-fields"), false);
	assert.ok(a.el.querySelector("[data-key='id-" + at("[!activity|log repeat]") + "']"), "its id row");
	assert.ok(a.el.querySelector("[data-key='flag-repeat']"), "its switches");
	assert.match(words(a.el.querySelector(".booklet-blocks-holds")), /12 kept entries/, "what the booklet holds, at the top, stays");
	a.close();
	// on a choice: its options
	const c = panelOn(HELD, at("- [ ] Tense"));
	assert.equal(shown(c.el, "booklet-blocks-options"), true);
	assert.match(words(c.el.querySelector(".booklet-blocks-options")), /Options of choice feeling/);
	c.close();
	// in a data block: its declared fields
	const d = panelOn(HELD, at("```booklet data") + 1);
	assert.equal(shown(d.el, "booklet-blocks-fields"), true);
	assert.match(words(d.el.querySelector(".booklet-blocks-fields")), /Fields of the data block/);
	d.close();
	// the panel's own source has neither section any more
	const src = readFileSync(`${ROOT}/src/editor-view.ts`, "utf8");
	assert.doesNotMatch(src, /drawOutline|drawProblems|"Outline"|"Problems"/);
});
