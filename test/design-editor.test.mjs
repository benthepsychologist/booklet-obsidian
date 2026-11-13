/*
 * The Design view, stage D, run in node over jsdom with the stand-in for Obsidian: a selected block's form (native setting rows) and the
 * one write each row makes; the small Markdown editor in place (a plain textarea); the outline and the lines the reader cannot read,
 * now in the view; and the side panel after they moved out of it. What this says is what the view does with the pieces Obsidian is stood
 * in for. How it looks, and how a soft keyboard behaves, is measured in the real app, which this is not.
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

/** Opens a view and drives it. */
function rig(text) {
	Setting.reset();
	const o = openDesign(text);
	const pickOf = (box) => box.querySelector(":scope > .booklet-design-head .booklet-design-pick");
	const m = {
		...o,
		select: (kind, needle) => {
			const box = o.box(kind, needle);
			click(pickOf(box));
			return box;
		},
		/** The form row (the Setting) of this name in the open form. */
		row: (name) => {
			const hit = Setting.made.filter((s) => s.settingEl.isConnected && words(s.nameEl) === name);
			assert.equal(hit.length, 1, `one row named ${name} (${hit.length})`);
			return hit[0];
		},
		rowNames: () => Setting.made.filter((s) => s.settingEl.isConnected && s.settingEl.parentElement.classList.contains("booklet-design-settings")).map((s) => words(s.nameEl)),
		/** Types into a text row and leaves it (the box's `change`), then waits for the write. */
		async type(name, value, wait = true) {
			const c = m.row(name).components[0];
			c.inputEl.value = value;
			c.inputEl.dispatchEvent(new w.Event("change", { bubbles: true }));
			if (wait) await o.view.whenIdle();
		},
		async toggle(name, on, wait = true) {
			await m.row(name).components[0].change(on);
			if (wait) await o.view.whenIdle();
		},
		area: () => o.el.querySelector("textarea.booklet-design-textarea"),
		editorState: () => words(o.el.querySelector(".booklet-design-editor-state")),
		undo: () => o.el.querySelector(".booklet-design-undo"),
		redo: () => o.el.querySelector(".booklet-design-redo"),
		button: (label, from = o.el) => [...from.querySelectorAll("button")].find((b) => words(b) === label),
		dialog: () => doc.querySelector(".booklet-design-ask"),
		async answer(label) {
			const b = [...m.dialog().querySelectorAll("button")].find((x) => words(x) === label);
			assert.ok(b, `no ${label} in the dialog`);
			click(b);
			await o.view.whenIdle();
		},
		selected: () => o.all(".booklet-design-node.is-selected").map((b) => `${b.getAttribute("data-kind")}@${b.getAttribute("data-start")}`),
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

/* ======================================================================== the form ======================================================================== */

test("clicking a block selects it and shows its settings as setting rows: the id, the title, the switches and the fields of its kind, and a button to its Markdown", () => {
	const v = rig(FULL);
	const box = v.select("activity", "[!activity|spending");
	assert.deepEqual(v.all(".booklet-design-settings"), [box.querySelector(":scope > .booklet-design-settings")], "one form, in the selected block, under its head");
	assert.equal(box.querySelector(":scope > .booklet-design-head").nextElementSibling, box.querySelector(":scope > .booklet-design-settings"));
	// the rows are Obsidian's own setting rows
	assert.ok(box.querySelectorAll(":scope > .booklet-design-settings .setting-item").length >= 9);
	assert.deepEqual(v.rowNames(), ["Settings", "Id", "Title", "repeat", "daily", "hidden", "Icon", "status", "tab", "entries", ""], "the names the settings model gives an activity, in its order (the last row is the button)");
	// the values on the line
	assert.equal(v.row("Id").components[0].inputEl.value, "spending");
	assert.equal(v.row("Title").components[0].inputEl.value, "Spending");
	assert.equal(v.row("repeat").components[0].value, true);
	assert.equal(v.row("hidden").components[0].value, false);
	assert.equal(v.row("tab").components[0].inputEl.value, "now");
	assert.equal(v.button(en("form.editMarkdown"), box).tagName, "BUTTON");
	// the same model the panel reads
	const model = settingsModel("> [!activity|spending tab:now repeat] Spending");
	for (const f of model.flags) assert.ok(v.rowNames().includes(f.name), f.name);
	for (const f of model.values) assert.ok(v.rowNames().includes(f.name === "icon" ? "Icon" : f.name), f.name);
	v.close();
});

test("selecting another block takes the form away from the first and gives it to the second: one form at a time, and a press on the form itself does not change the selection", () => {
	const v = rig(FULL);
	const a = v.select("activity", "[!activity|spending");
	const q = v.select("question", "[!text|spent]");
	assert.equal(a.querySelector(":scope > .booklet-design-settings"), null);
	assert.ok(q.querySelector(":scope > .booklet-design-settings"));
	assert.deepEqual(v.rowNames().slice(0, 4), ["Settings", "Id", "Title", "long"]);
	assert.equal(v.all(".booklet-design-settings").length, 1);
	// a press on the form's own label leaves the selection where it is (it does not go up to the block around)
	click(q.querySelector(".booklet-design-settings .setting-item-name"));
	assert.deepEqual(v.selected(), ["question@" + lineOf(FULL, "[!text|spent]")]);
	v.close();
});

test("a block with no settings says so, and still offers its Markdown; the records and the booklet offer neither a form nor an editor", () => {
	const v = rig(FULL);
	const prose = v.select("prose", "Words in the module's opening.");
	const form = prose.querySelector(":scope > .booklet-design-settings");
	assert.match(words(form), /No settings; edit its Markdown\./);
	assert.ok(v.button(en("form.editMarkdown"), form));
	const rec = v.select("records", "%%");
	assert.match(words(rec.querySelector(":scope > .booklet-design-settings")), /records section holds kept data/);
	assert.equal(v.button(en("form.editMarkdown"), rec), undefined);
	v.close();
});

test("a switch, a field, a title and an id each write the block's opening line and nothing else, as one write, said in words", async () => {
	const v = rig(FULL);
	const act = lineOf(FULL, "[!activity|spending");
	v.select("activity", "[!activity|spending");
	let before = v.disk.text;
	await v.toggle("hidden", true);
	assert.equal(v.disk.writes, 1);
	onlyLines(before, v.disk.text, act);
	assert.equal(v.disk.text.split("\n")[act], "> [!activity|spending tab:now repeat hidden] Spending");
	assert.match(v.status(), /^Changed Activity: Spending\./);
	assert.deepEqual(v.selected(), ["activity@" + act], "the block stays selected, with its form");
	assert.equal(v.row("hidden").components[0].value, true, "and the form shows what is now on the line");
	before = v.disk.text;
	await v.type("Icon", "book-open");
	onlyLines(before, v.disk.text, act);
	assert.equal(v.disk.text.split("\n")[act], "> [!activity|spending tab:now repeat hidden icon:book-open] Spending");
	before = v.disk.text;
	await v.type("Title", "Money going out");
	assert.equal(v.disk.text.split("\n")[act], "> [!activity|spending tab:now repeat hidden icon:book-open] Money going out");
	onlyLines(before, v.disk.text, act);
	before = v.disk.text;
	await v.type("Id", "outgoings");
	assert.equal(v.disk.text.split("\n")[act], "> [!activity|outgoings tab:now repeat hidden icon:book-open] Money going out");
	onlyLines(before, v.disk.text, act);
	assert.equal(v.disk.writes, 4);
	v.close();
});

test("the whole-note byte check, on a note with CRLF endings and a question inside a group: only the opening line's bytes change", async () => {
	const text = crlf(FULL);
	const v = rig(text);
	const q = lineOf(text, "[!choice|did]");
	v.select("question", "[!choice|did]");
	await v.toggle("open", true);
	assert.equal(v.disk.text.split("\n")[q], "> > [!choice|did open] Did you?\r");
	onlyLines(text, v.disk.text, q);
	assert.equal(v.disk.text.split("\n").every((l, i, a) => i === a.length - 1 || l.endsWith("\r")), true);
	v.close();
});

test("a value that is refused says why in words and writes nothing; the row goes back to what the line has", async () => {
	const v = rig(FULL);
	v.select("activity", "[!activity|spending");
	const before = v.disk.text;
	for (const [name, value, why] of [
		["Id", "two words", /Not changed\. An id has letters, digits and dashes only/],
		["Id", "why", /Not changed\. `why` is already used/],
		["Id", "", /Not changed\. An id cannot be empty/],
		["Icon", "a b", /Not changed\. A setting's value has no spaces/],
		["status", "a]b", /Not changed\. A setting's value cannot hold `\]`/],
	]) {
		await v.type(name, value);
		assert.match(v.status(), why, name + " " + JSON.stringify(value));
		assert.equal(v.disk.text, before, "the note is as it was");
		assert.equal(v.disk.writes, 0, "nothing was written");
		assert.equal(v.undo().disabled, true, "nothing to undo");
	}
	assert.equal(v.row("Id").components[0].inputEl.value, "spending", "the row shows the line's own id again");
	v.close();
});

test("a switch that needs another is refused with its reason: `daily` without `repeat`", async () => {
	const v = rig(FULL);
	v.select("activity", "[!activity|bare");
	const before = v.disk.text;
	await v.toggle("daily", true);
	assert.match(v.status(), /Not changed\. `daily` needs `repeat`/);
	assert.equal(v.disk.writes, 0);
	assert.equal(v.disk.text, before);
	v.close();
});

test("an id change that would detach kept entries counts them and asks: nothing is written while it is open, no leaves the note as it was, yes writes it, and Undo brings it back byte for byte", async () => {
	const v = rig(HELD);
	const act = lineOf(HELD, "[!activity|log repeat]");
	v.select("activity", "[!activity|log repeat]");
	const before = v.disk.text;
	await v.type("Id", "diary", false);
	assert.ok(v.dialog(), "a question is open");
	assert.equal(v.disk.writes, 0, "nothing is written while it is open");
	const ask = words(v.dialog());
	assert.match(ask, /12 kept entries/);
	assert.match(ask, /activity id `log`/);
	assert.match(ask, /stay in the note's records as they are/);
	assert.deepEqual([...v.dialog().querySelectorAll("button")].map(words), ["Change", "Cancel"]);
	assert.match(words(doc.querySelector(".booklet-design-ask p")), /will be changed in the note\. Only its own lines are rewritten\./);
	// no
	await v.answer("Cancel");
	assert.equal(v.disk.writes, 0);
	assert.equal(v.disk.text, before);
	assert.equal(v.undo().disabled, true);
	assert.equal(v.status(), "Nothing was changed.");
	assert.equal(v.row("Id").components[0].inputEl.value, "log", "the row goes back to the line's id");
	// yes
	await v.type("Id", "diary", false);
	await v.answer("Change");
	assert.equal(v.dialog(), null);
	assert.equal(v.disk.writes, 1);
	assert.equal(v.disk.text.split("\n")[act], "> [!activity|diary repeat] A mood log");
	onlyLines(before, v.disk.text, act);
	assert.match(v.status(), /^Changed Activity: A mood log\./);
	// the kept entries were never touched: the records are the bytes they were
	assert.equal(v.disk.text.slice(v.disk.text.indexOf("%%")), before.slice(before.indexOf("%%")));
	// and the lines the reader cannot match are listed (the kept data that now matches nothing)
	assert.match(words(v.el.querySelector(".booklet-design-leftovers")), /12 kept entries for the activity `log`/);
	await v.press(v.undo());
	assert.equal(v.disk.text, before, "Undo restores every byte");
	await v.press(v.redo());
	assert.equal(v.disk.text.split("\n")[act], "> [!activity|diary repeat] A mood log");
	v.close();
});

test("taking `repeat` off an activity that keeps entries is counted and asked about too; an icon or a title, which detach nothing, are not", async () => {
	const v = rig(HELD);
	v.select("activity", "[!activity|log repeat]");
	await v.toggle("repeat", false, false);
	assert.ok(v.dialog());
	assert.match(words(v.dialog()), /12 kept entries/);
	await v.answer("Cancel");
	await v.type("Title", "My mood log");
	assert.equal(v.dialog(), null, "a title detaches nothing: no question");
	assert.equal(v.disk.writes, 1);
	v.close();
});

test("on a booklet the reader cannot open, a change cannot be counted: the question says so, and yes still writes it", async () => {
	const refused = HELD.replace("> [!module|mood end]\n", "");
	const v = rig(refused);
	v.select("activity", "[!activity|log repeat]");
	await v.type("Id", "diary", false);
	assert.match(words(v.dialog()), /cannot open this booklet as it is, so this view cannot count what this change touches/);
	await v.answer("Change");
	assert.equal(v.disk.writes, 1);
	v.close();
});

test("undo and redo of a form change restore the exact bytes, on a note with CRLF endings too", async () => {
	for (const text of [FULL, crlf(FULL)]) {
		const v = rig(text);
		v.select("question", "[!number|n1]");
		await v.type("min", "0");
		await v.toggle("each", false).catch(() => {});
		const after = v.disk.text;
		assert.notEqual(after, text);
		await v.press(v.undo());
		assert.equal(v.disk.text, text, "undo: every byte");
		await v.press(v.redo());
		assert.equal(v.disk.text, after, "redo: every byte");
		v.close();
	}
});

/* ======================================================================== the small Markdown editor ======================================================================== */

test("Enter on the selected block opens just that block's own lines in a textarea in place: monospace-ready, spell-check off, labelled in words, with Save and Cancel as visible buttons", () => {
	const v = rig(FULL);
	const box = v.select("question", "[!text|spent]");
	assert.equal(v.area(), null);
	const evt = v.key("Enter");
	assert.equal(evt.defaultPrevented, true, "the view took the key");
	const area = v.area();
	assert.ok(area, "the editor is open");
	const drawn = v.box("question", "[!text|spent]");
	assert.ok(drawn.querySelector(":scope > .booklet-design-settings.is-editor textarea"), "in the block, in place");
	assert.equal(drawn.querySelector(":scope > .booklet-design-settings.is-form"), null, "the form is replaced by the editor");
	assert.ok(box);
	const q = walkDesign(parseDesign(FULL)).find((n) => n.kind === "question" && n.id === "spent");
	assert.equal(area.value, blockLines(FULL, q).join("\n"), "just that block's own lines");
	assert.equal(area.spellcheck, false);
	assert.equal(area.getAttribute("spellcheck"), "false");
	assert.match(area.getAttribute("aria-label"), /^Markdown of Question: What did you spend\?$/);
	assert.deepEqual(["Save", "Cancel"].map((l) => !!v.button(l)), [true, true]);
	// the label says what Save, Cancel and Esc do
	const help = words(drawn.querySelector(".booklet-design-editor-help"));
	assert.match(help, /only this block's own lines/);
	assert.match(help, /Save writes them into the note and leaves every other line as it is/);
	assert.match(help, /Cancel throws your changes away/);
	assert.match(help, /Esc closes without saving: with changes it keeps them as Unsaved, and a second Esc throws them away/);
	assert.equal(doc.activeElement, area, "the box has the focus");
	v.close();
});

test("the form's `Edit as Markdown` button opens the same editor; a block that has no lines of its own opens nothing and says why", () => {
	const v = rig(FULL);
	const box = v.select("activity", "[!activity|spending");
	click(v.button(en("form.editMarkdown"), box));
	assert.ok(v.area());
	assert.equal(v.area().value, "> [!activity|spending tab:now repeat] Spending\n> half an hour".replace(/\n.*/s, (m) => m), "an activity's own opening lines");
	v.close();
	const w2 = rig(FULL);
	w2.select("records", "%%");
	w2.key("Enter");
	assert.equal(w2.area(), null);
	w2.close();
});

test("Enter that is a button's own press does not open the editor: on the Delete button, Enter is Delete's", () => {
	const v = rig(FULL);
	const box = v.select("question", "[!text|spent]");
	const del = box.querySelector(":scope > .booklet-design-head .booklet-design-delete");
	const evt = v.key("Enter", { target: del });
	assert.equal(evt.defaultPrevented, false, "the key was left to the button");
	assert.equal(v.area(), null);
	// on the selected block's own name it opens
	v.key("Enter", { target: box.querySelector(":scope > .booklet-design-head .booklet-design-pick") });
	assert.ok(v.area());
	v.close();
});

test("Save rewrites only those lines: a changed line of the block's Markdown goes in, every other byte of the note stays, and the editor closes", async () => {
	const v = rig(FULL);
	v.select("question", "[!text|spent]");
	v.key("Enter");
	const before = v.disk.text;
	const q = lineOf(FULL, "[!text|spent]");
	const own = v.area().value.split("\n");
	assert.ok(own.length >= 3, "the block's own lines include the hint that stands under the question: " + JSON.stringify(own));
	typeInto(v.area(), ["> [!text|spent long] What did you spend this week?", ...own.slice(1)].join("\n"));
	assert.match(v.editorState(), /^Unsaved\./);
	await v.press(v.button("Save"));
	assert.equal(v.disk.writes, 1);
	assert.equal(v.area(), null, "closed");
	assert.equal(v.disk.text.split("\n")[q], "> [!text|spent long] What did you spend this week?");
	onlyLines(before, v.disk.text, q);
	assert.match(v.status(), /^Changed Question: What did you spend\?\./, "names the block as it was drawn when the change was made");
	// a line added to the block's Markdown: the note grows by that line and nothing else moves
	v.select("question", "[!text|spent");
	v.key("Enter");
	const mid = v.disk.text;
	typeInto(v.area(), v.area().value + "\n> And one more line.");
	await v.press(v.button("Save"));
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
		v.select("question", "[!text|spent]");
		v.key("Enter");
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

test("Cancel throws the changes away, says so, and writes nothing; the editor closes", async () => {
	const v = rig(FULL);
	v.select("question", "[!text|spent]");
	v.key("Enter");
	typeInto(v.area(), "something else entirely");
	click(v.button("Cancel"));
	assert.equal(v.area(), null);
	assert.equal(v.disk.writes, 0);
	assert.equal(v.disk.text, FULL);
	assert.equal(v.status(), en("editor.discarded"));
	v.close();
});

test("Esc with nothing changed closes the editor at once; Esc with changes keeps them as Unsaved, and a second Esc throws them away", () => {
	const v = rig(FULL);
	v.select("question", "[!text|spent]");
	v.key("Enter");
	press(v.area(), "Escape");
	assert.equal(v.area(), null, "nothing changed: closed");
	assert.equal(v.status(), "");
	v.key("Enter");
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
	v.close();
});

test("a draft is never lost to a drawing or to selecting another block: it stays in its block, with its text and caret, until it is saved or cancelled", () => {
	const v = rig(FULL);
	const box = v.select("question", "[!text|spent]");
	v.key("Enter");
	typeInto(v.area(), "> [!text|spent] Half written");
	v.area().setSelectionRange(5, 9);
	// something else makes the view draw again (the catalogue opens)
	click(v.button(en("keys.addPiece")));
	assert.equal(v.area().value, "> [!text|spent] Half written");
	assert.equal(v.area().selectionStart, 5);
	// another block is selected: its form shows, and the draft stays where it was
	const other = v.select("question", "[!number|n1]");
	assert.ok(other.querySelector(":scope > .booklet-design-settings.is-form"));
	assert.equal(v.area().value, "> [!text|spent] Half written");
	assert.ok(v.box("question", "[!text|spent]").querySelector(":scope > .booklet-design-settings.is-editor"));
	// a second editor cannot be opened over a draft: it says so
	click(v.button(en("form.editMarkdown"), other));
	assert.equal(v.all("textarea.booklet-design-textarea").length, 1);
	assert.equal(v.status(), en("editor.busy"));
	assert.ok(box);
	v.close();
});

test("a stale save is refused and says so, and the user's text stays in the box: the vault changed after the view drew, and the view's own copy changed under the editor", async () => {
	// the file changed behind the view's back
	const v = rig(FULL);
	v.select("question", "[!text|spent]");
	v.key("Enter");
	typeInto(v.area(), "> [!text|spent] My careful words");
	const elsewhere = FULL.replace("What did you spend?", "What did you spend today?");
	v.disk.text = elsewhere;
	await v.press(v.button("Save"));
	assert.equal(v.disk.text, elsewhere, "nothing was written over it");
	assert.match(v.status(), /Your text is still in the box\./);
	assert.equal(v.area().value, "> [!text|spent] My careful words", "the text is where it was typed");
	v.close();
	// the view's own copy changed under the editor (a word typed in a Markdown pane of the same note)
	const w2 = rig(FULL);
	w2.select("question", "[!text|spent]");
	w2.key("Enter");
	typeInto(w2.area(), "> [!text|spent] Mine");
	const typed = FULL.replace("What did you spend?", "What did you spend today?");
	w2.disk.text = typed;
	w2.view.setViewData(typed, false);
	await w2.press(w2.button("Save"));
	assert.equal(w2.disk.writes, 0, "nothing was written");
	assert.equal(w2.disk.text, typed);
	assert.match(w2.status(), /The note changed since this editor opened, so nothing was written\. Your text is still in the box\./);
	assert.equal(w2.area().value, "> [!text|spent] Mine");
	w2.close();
});

test("an editor whose block has gone from where it was keeps its text on the screen, with the reason, and cannot save over something else", async () => {
	const v = rig(FULL);
	v.select("question", "[!text|spent]");
	v.key("Enter");
	typeInto(v.area(), "> [!text|spent] Kept");
	// the note is changed so that no question stands where it did
	const moved = FULL.replace("> [!text|spent] What did you spend?\n", "Words instead.\n");
	v.disk.text = moved;
	v.view.setViewData(moved, false);
	assert.equal(v.area().value, "> [!text|spent] Kept", "the text is still there");
	const host = v.el.querySelector(".booklet-design-settings.is-detached");
	assert.ok(host);
	assert.match(words(host), /no longer where it was in the note/);
	assert.equal(v.button("Save", host).disabled, true);
	click(v.button("Cancel", host));
	assert.equal(v.area(), null);
	v.close();
});

test("a Markdown change that renames an id kept entries hang on counts them and asks; no keeps the text in the box and writes nothing; yes writes only the lines", async () => {
	const v = rig(HELD);
	const act = lineOf(HELD, "[!activity|log repeat]");
	v.select("activity", "[!activity|log repeat]");
	v.key("Enter");
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
	v.select("activity", "[!activity|once]");
	v.key("Enter");
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

test("text that is not a block at all can be saved too (nothing is hidden or opaque): an empty box is refused with the reason, and the note is unchanged", async () => {
	const v = rig(FULL);
	v.select("question", "[!text|spent]");
	v.key("Enter");
	typeInto(v.area(), "\n\n");
	await v.press(v.button("Save"));
	assert.match(v.status(), /Not changed\. A block with no lines is a deleted block: delete it instead\./);
	assert.equal(v.disk.writes, 0);
	assert.ok(v.area(), "the box stays");
	v.close();
});

test("the whole-note byte check for an editor save: a note with CRLF endings keeps every CR, and the lines the user did not touch keep their bytes", async () => {
	const text = crlf(FULL);
	const v = rig(text);
	const q = lineOf(text, "[!text|spent]");
	v.select("question", "[!text|spent]");
	v.key("Enter");
	const own = v.area().value.split("\n");
	assert.ok(own.every((l) => !l.includes("\r")), "the box shows the lines without their line ends");
	typeInto(v.area(), ["> [!text|spent long] Changed", ...own.slice(1)].join("\n"));
	await v.press(v.button("Save"));
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

test("the view's hotkeys are silent while the textarea has the focus: a letter typed into it opens no popup and is not taken; Mod+Z is the box's", () => {
	const v = rig(FULL);
	v.select("question", "[!text|spent]");
	v.key("Enter");
	const area = v.area();
	area.focus();
	assert.equal(doc.activeElement, area);
	for (const k of ["s", "q", "r", "v", "d", "Backspace", "ArrowDown", "1"]) {
		const evt = v.key(k, { target: area });
		assert.equal(evt.defaultPrevented, false, `${k} is left to the box`);
		assert.equal(v.popup(), null, `${k} opened nothing`);
	}
	const undo = v.key("z", { target: area, ctrlKey: true });
	assert.equal(undo.defaultPrevented, false, "undo in the box is the box's own");
	// with the focus elsewhere the same letter is the view's
	area.blur();
	v.key("s", { target: doc.body });
	assert.ok(v.popup(), "outside a field it opens the structure popup");
	v.close();
});

test("the hotkeys are silent while a form row's box has the focus, too", () => {
	const v = rig(FULL);
	v.select("activity", "[!activity|spending");
	const input = v.row("Title").components[0].inputEl;
	input.focus();
	const evt = v.key("q", { target: input });
	assert.equal(evt.defaultPrevented, false);
	assert.equal(v.popup(), null);
	// Enter in a form row is the row's own (it commits the field): it does not open the editor
	v.key("Enter", { target: input });
	assert.equal(v.area(), null);
	v.close();
});

/* ======================================================================== the outline and the lines the reader cannot read, in the view ======================================================================== */

test("the outline is in the view: every entry is a button that selects its block and brings it into view", () => {
	const v = rig(FULL);
	const entries = v.all(".booklet-design-outline-list button");
	assert.ok(entries.length >= 15);
	assert.match(words(entries[0]), /^Module money: Money$/);
	assert.ok(entries.some((b) => /^Question text spent: What did you spend\?$|^text spent: What did you spend\?$/.test(words(b))));
	let scrolled = 0;
	const scroll = w.Element.prototype.scrollIntoView;
	w.Element.prototype.scrollIntoView = function () {
		scrolled++;
	};
	for (const b of entries) {
		click(b);
		const start = b.getAttribute("data-start");
		const sel = v.selected();
		assert.equal(sel.length, 1);
		assert.ok(sel[0].endsWith("@" + start), `${words(b)} selects the block at line ${start} (${sel[0]})`);
		assert.match(words(v.el.querySelector(".booklet-design-crumb-item[aria-current='true']")), /./, "the breadcrumb follows");
	}
	assert.equal(scrolled, entries.length, "each brings its block into view");
	w.Element.prototype.scrollIntoView = scroll;
	// the form is the selected block's
	assert.equal(v.all(".booklet-design-settings.is-form").length, 1);
	v.close();
});

test("the outline lists pages under the page their `parent:` names, as the panel's outline did", () => {
	const v = rig(FULL);
	const items = v.all(".booklet-design-outline-list li").map((li) => [words(li.querySelector("button")), li.className]);
	const map = items.findIndex(([t]) => /^Page map:/.test(t));
	const choosing = items.findIndex(([t]) => /^Page choosing:/.test(t));
	assert.ok(map >= 0 && choosing > map);
	const depth = (i) => Number(/depth-(\d)/.exec(items[i][1])[1]);
	assert.equal(depth(choosing), depth(map) + 1);
	v.close();
});

test("the list of lines the reader cannot read is in the view: each entry says why in words, and a press jumps to and selects its block", () => {
	const v = rig(UNREAD);
	const det = v.el.querySelector(".booklet-design-problems");
	const count = Number(det.getAttribute("data-count"));
	assert.ok(count >= 3);
	assert.match(words(det.querySelector("summary")), new RegExp(`^Lines the reader cannot read \\(${count}\\)$`));
	const buttons = v.all(".booklet-design-trouble-list button", det);
	assert.ok(buttons.length >= 3);
	const core2 = core.problemsOf(UNREAD);
	for (const b of buttons) {
		const why = words(b.querySelector(".booklet-design-trouble-why"));
		assert.match(why, /^Line \d+: .+/, "the line and the reason");
		assert.ok(core2.some((p) => `Line ${p.line + 1}: ${p.why}` === why), why);
		click(b);
		const start = Number(b.getAttribute("data-start"));
		const sel = v.selected();
		assert.equal(sel.length, 1);
		const node = walkDesign(parseDesign(UNREAD)).find((n) => n.parent && `${n.kind}@${n.start}` === sel[0]);
		assert.ok(node.start <= Number(/Line (\d+)/.exec(why)[1]) - 1 && Number(/Line (\d+)/.exec(why)[1]) - 1 < node.end, `${sel[0]} holds the line`);
		assert.equal(node.start, start);
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
	assert.equal(renamed.selected().length, 1);
	renamed.close();
});

test("the side stands above the tree and folds on a narrow pane, opens beside it on a wide one; a person's own opening of it is kept across a drawing", () => {
	const v = rig(FULL);
	const main = v.el.querySelector(".booklet-design-main");
	assert.deepEqual([...main.children].map((c) => c.className.split(" ")[0]), ["booklet-design-side", "booklet-design-tree"]);
	const outline = v.el.querySelector(".booklet-design-outline");
	assert.equal(outline.open, false, "folded where the pane is narrow");
	outline.open = true;
	outline.dispatchEvent(new w.Event("toggle"));
	v.select("question", "[!text|spent]");
	v.view.setViewData(FULL, true);
	assert.equal(v.el.querySelector(".booklet-design-outline").open, true, "kept open");
	v.close();
	// a wide pane opens it
	const wide = Object.getOwnPropertyDescriptor(w.HTMLElement.prototype, "clientWidth");
	Object.defineProperty(w.HTMLElement.prototype, "clientWidth", { configurable: true, get: () => 1200 });
	const v2 = rig(FULL);
	assert.equal(v2.el.querySelector(".booklet-design-outline").open, true);
	v2.close();
	Object.defineProperty(w.HTMLElement.prototype, "clientWidth", wide ?? { configurable: true, get: () => 0 });
});

test("a note that is not a booklet has no problems to list (only a booklet is read by the reader), and the view says it is not one", () => {
	const v = rig("Just some notes.\n");
	assert.equal(v.el.querySelector(".booklet-design-problems").getAttribute("data-count"), "0");
	assert.ok(v.el.querySelector(".booklet-design-banner"));
	v.close();
});

/* ======================================================================== a phone ======================================================================== */

test("the editor and the form have visible buttons for everything (Save, Cancel, Edit as Markdown), each at least 44 px high on a phone by the sheet, and the narrow rules stack the rows", () => {
	const css = readFileSync(`${ROOT}/styles.base.css`, "utf8");
	assert.match(css, /\.is-mobile \.booklet-design button,\s*\n\.is-mobile \.booklet-design summary \{\s*\n\s*min-height: 44px;/);
	assert.match(css, /@container \(max-width: 30em\) \{[\s\S]*\.booklet-design-settings \.setting-item-control \{\s*\n\s*justify-content: flex-start;/);
	assert.match(css, /\.booklet-design-textarea \{[^}]*field-sizing: content;[^}]*font-family: var\(--font-monospace\);/);
	const v = rig(FULL);
	v.select("question", "[!text|spent]");
	assert.ok(v.button(en("form.editMarkdown")));
	click(v.button(en("form.editMarkdown")));
	assert.deepEqual([...v.el.querySelectorAll(".booklet-design-editor-buttons button")].map(words), ["Save", "Cancel"]);
	v.close();
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
