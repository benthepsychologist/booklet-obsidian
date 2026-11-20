/*
 * The Design view's editor in place, and the outline's lists, run in node over jsdom with the stand-in for Obsidian.
 *
 * A click on a block (or on a page's "Edit settings") opens that block where it stands: its title and its description are fields drawn
 * in its own type, its other settings are a strip under them (its id, switches and values), and its Markdown waits in a section that is
 * closed until it is opened. There is no draft, no preview and no Save: every change is written as it is made, through `changeLines` and
 * the same guard as every other change. What this says is what the view does with the pieces Obsidian is stood in for. How it looks,
 * and how a soft keyboard behaves, is measured in the real app, which this is not.
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
		/** The form row (the Setting) of this name in the open editor: the front matter's rows are Settings. */
		row: (name) => {
			const hit = Setting.made.filter((s) => s.settingEl.isConnected && words(s.nameEl) === name);
			assert.equal(hit.length, 1, `one row named ${name} (${hit.length})`);
			return hit[0];
		},
		/** The text control of a block's title ("Title"), description ("Description") or strip value ("Id", "Icon", a setting's name). */
		control: (name) => {
			const box = o.el.querySelector(".booklet-design-editbox");
			if (!box) return null;
			if (name === "Title") return box.querySelector(".booklet-design-field.is-title");
			if (name === "Description") return box.querySelector(".booklet-design-field.is-desc");
			const key = name === "Id" ? "id" : name === "Icon" ? "icon" : name;
			return box.querySelector(`.booklet-design-strip-item[data-field="${key}"] :is(input, select)`);
		},
		/** The switch of the strip with this name. */
		sw: (name) => o.el.querySelector(`.booklet-design-editbox .booklet-design-strip-item[data-field="${name}"] button[role="switch"]`),
		/** The names of the controls of the box: the title, then the strip's items in order (the front matter's rows are Settings). */
		rowNames: () => [
			...(o.el.querySelector(".booklet-design-editbox .booklet-design-field.is-title") ? ["Title"] : []),
			...o.all(".booklet-design-editbox .booklet-design-strip-item").map((e) => e.getAttribute("data-field")),
			...Setting.made.filter((s) => s.settingEl.isConnected && s.settingEl.parentElement.classList.contains("booklet-design-settings")).map((s) => words(s.nameEl)),
		],
		/** Types into a text control and leaves it (the box's `change`): the change is applied to the note, and this waits for the write. */
		async type(name, value) {
			const el = m.control(name);
			if (el) {
				el.value = value;
				el.dispatchEvent(new w.Event("change", { bubbles: true }));
			} else {
				const c = m.row(name).components[0];
				c.inputEl.value = value;
				c.inputEl.dispatchEvent(new w.Event("change", { bubbles: true }));
			}
			await o.settle();
		},
		/** Presses a switch of the strip so it is `on` (nothing when it is already). */
		async toggle(name, on) {
			const b = m.sw(name);
			assert.ok(b, `a switch named ${name}`);
			if (b.getAttribute("aria-checked") !== String(on)) click(b);
			await o.settle();
		},
		/** What the editor refused in its settings, in words (empty when nothing). */
		refusal: () => words(o.el.querySelector(".booklet-design-edit-refusal")),
		editorState: () => words(o.el.querySelector(".booklet-design-editor-state")),
		button: (label, from = o.el) => [...from.querySelectorAll("button")].find((b) => words(b) === label),
		dialog: () => doc.querySelector(".booklet-design-ask"),
		async answer(label) {
			const b = [...m.dialog().querySelectorAll("button")].find((x) => words(x) === label);
			assert.ok(b, `no ${label} in the dialog`);
			click(b);
			await o.view.whenIdle();
		},
		/** Ctrl+Enter in the box: what is typed is applied and the block closes. Waits for it. */
		async leave(target = o.editor()) {
			const evt = new w.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true, ctrlKey: true });
			target.dispatchEvent(evt);
			await o.settle();
			return evt;
		},
		/** Like `type`, for a change that is asked about: it does not wait for the question to be answered. */
		async typeAsk(name, value) {
			const el = m.control(name);
			el.value = value;
			el.dispatchEvent(new w.Event("change", { bubbles: true }));
			await new Promise((r) => setTimeout(r, 20));
		},
		/** Types into the Markdown box and leaves it (its `change`): applied, and this waits for the write. */
		async typeArea(text) {
			typeInto(o.area(), text);
			o.area().dispatchEvent(new w.Event("change", { bubbles: true }));
			await o.settle();
		},
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

test("a press on a block opens it in place: its title and description are fields in its own type, its settings a strip, its Markdown a closed section, and a hint that says every change applies as it is made; no preview, no Save, no Cancel; the page's own button opens the container's lines the same way", () => {
	const v = rig(FULL);
	v.go("Spending");
	const block = v.open("question", "[!text|spent]");
	const box = v.editor();
	assert.equal(box.parentElement, block, "in the block, in place");
	assert.match(words(box.querySelector(":scope > .booklet-design-sr")), /^Editing Question/, "named for a screen reader");
	// the words are fields where they are drawn: the title, then the description
	const q = walkDesign(parseDesign(FULL)).find((n) => n.kind === "question" && n.id === "spent");
	assert.equal(v.control("Title").value, "What did you spend?");
	assert.equal(v.control("Title").getAttribute("aria-label"), "Title");
	assert.ok(v.control("Description"), "a description field");
	assert.equal(doc.activeElement, v.control("Title"), "the title has the focus");
	// no preview of the block, no heading, no section labels
	assert.equal(box.querySelector(".booklet-design-edit-previewhost"), null, "no preview");
	assert.equal(box.querySelector(".booklet-design-edit-title"), null, "no heading");
	assert.equal(box.querySelector(".is-preview"), null);
	// the strip holds the id and the flags, in a toolbar with the block's own move and delete
	assert.deepEqual(v.rowNames().slice(0, 3), ["Title", "id", "long"]);
	assert.equal(v.control("Id").value, "spent");
	assert.ok(v.sw("long"), "a flag is a switch");
	assert.equal(v.sw("long").getAttribute("aria-checked"), "false");
	// the Markdown: a closed section at the foot with the block's own lines, spell-check off, labelled in words
	const md = box.querySelector("details.booklet-design-edit-md");
	assert.ok(md && !md.open, "closed");
	assert.equal(v.area().value, blockLines(FULL, q).join("\n"));
	assert.equal(v.area().spellcheck, false);
	assert.equal(v.area().getAttribute("spellcheck"), "false");
	assert.match(v.area().getAttribute("aria-label"), /^Markdown of Question$/);
	assert.equal(words(md.querySelector("summary")), "Markdown");
	// the foot: the hint says what the keys do. There is no draft, so nothing to save or cancel, and nothing says "Unsaved"
	assert.equal(words(box.querySelector(".booklet-design-edit-hint")), en("edit.keys"));
	assert.match(en("edit.keys"), /applied when you leave the field/);
	assert.equal(box.querySelector(".booklet-design-editor-buttons"), null, "no Save and no Cancel");
	assert.deepEqual([...box.querySelectorAll("button")].filter((b) => /^(Save|Cancel)$/.test(words(b))), []);
	assert.equal(box.querySelector(".booklet-design-edit-mark"), null, "no Unsaved mark");
	assert.equal(block.querySelector(":scope > .booklet-design-floatbar"), null, "the bar waits while the block is open");
	assert.deepEqual(v.selected(), ["question@" + lineOf(FULL, "[!text|spent]")]);
	// the page's own button: the container's opening lines, with a title and a strip, and no preview (a container has no drawing of its own)
	press(v.control("Title"), "Escape");
	assert.equal(v.editor(), null, "Esc closes it");
	v.go("Spending");
	v.openPage();
	assert.equal(v.editor().parentElement, v.page(), "in the page, under its title");
	assert.equal(v.area().value, "> [!activity|spending tab:now repeat] Spending\n> half an hour");
	assert.match(words(v.editor().querySelector(":scope > .booklet-design-sr")), /^Editing Activity/);
	assert.equal(v.control("Title").value, "Spending");
	assert.equal(v.editor().querySelector(".is-preview"), null);
	v.close();
});

test("the settings of an activity are the strip the settings model gives it, with the line's own values", () => {
	const v = rig(FULL);
	v.go("Spending");
	v.openPage();
	assert.deepEqual(v.rowNames(), ["Title", "id", "repeat", "daily", "hidden", "icon", "status", "tab", "entries"]);
	assert.equal(v.control("Id").value, "spending");
	assert.equal(v.control("Title").value, "Spending");
	assert.equal(v.sw("repeat").getAttribute("aria-checked"), "true");
	assert.equal(v.sw("hidden").getAttribute("aria-checked"), "false");
	assert.equal(v.control("tab").value, "now");
	const model = settingsModel("> [!activity|spending tab:now repeat] Spending");
	for (const f of model.flags) assert.ok(v.rowNames().includes(f.name), f.name);
	for (const f of model.values) assert.ok(v.rowNames().includes(f.name), f.name);
	v.close();
});

test("one block is open at a time: pressing another moves the editor, and what was typed in the first is applied first; text that cannot be applied says so and the first stays", async () => {
	const v = rig(FULL);
	v.go("Doing");
	const a = v.open("question", "[!choice|did]");
	assert.ok(a.querySelector(":scope > .booklet-design-editbox"));
	const b = v.open("question", "[!text|left]");
	assert.equal(v.all(".booklet-design-editbox").length, 1, "one editor");
	assert.equal(v.block("question", "[!choice|did]").querySelector(".booklet-design-editbox"), null, "the first closed");
	assert.ok(b.isConnected);
	assert.deepEqual(v.selected(), ["question@" + lineOf(FULL, "[!text|left]")]);
	// typed in the second and not yet left: pressing the other block applies it, then moves
	typeInto(v.area(), "> [!text|left] Left side?");
	click(v.block("question", "[!choice|did]"));
	await v.view.whenIdle();
	assert.equal(v.disk.writes, 1, "what was typed is applied before the box moves");
	assert.match(v.disk.text, /\[!text\|left\] Left side\?/);
	assert.equal(v.all(".booklet-design-editbox").length, 1);
	assert.deepEqual(v.selected(), ["question@" + lineOf(v.disk.text, "[!choice|did]")], "the block pressed is open");
	// the second block's text was typed and the note changed under it: it cannot be applied, so the box stays and says so
	v.view.setViewData(v.disk.text.replace("Did you?", "Did you do it?"), false);
	typeInto(v.area(), "Did you, really?");
	v.disk.text = v.disk.text.replace("[!text|left] Left side?", "[!text|left] Left side changed?");
	v.view.setViewData(v.disk.text, false);
	await v.view.whenIdle();
	// a press on the editor's own labels does not select the block around it, nor close it
	click(v.editor().querySelector(".setting-item-name"));
	assert.ok(v.editor());
	v.close();
});

test("a block with no settings has an editor with its words and its Markdown and no strip; the records, which the view never changes, open nothing and say why", () => {
	const v = rig(FULL);
	v.go("Money");
	v.open("prose", "Words in the module's opening.");
	assert.ok(v.area());
	assert.equal(v.area().value, "Words in the module's opening.");
	assert.equal(v.control("Title"), null, "prose has no title");
	assert.equal(v.control("Description").value, "Words in the module's opening.", "its words are the one field");
	assert.equal(v.control("Description").getAttribute("aria-label"), "Words");
	assert.deepEqual(v.rowNames(), [], "no strip");
	assert.equal(v.editor().querySelector(".booklet-design-strip-item"), null, "no id, no flag and no value to show");
	press(v.control("Description"), "Escape");
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
	assert.equal(v.editor().querySelector("details.booklet-design-edit-md").open, true, "the button says Markdown, so the Markdown section is open");
	assert.equal(doc.activeElement, v.area(), "with the focus in it");
	// a press on the block itself opens it with the section closed, as it is by default
	press(v.area(), "Escape");
	v.select("question", "[!text|spent]");
	assert.equal(v.editor().querySelector("details.booklet-design-edit-md").open, false);
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

test("a switch, a value, a title and an id each apply to the note the moment they are made: one write and one step of Undo each, the Markdown follows, and a second line of the block is as it was", async () => {
	const v = rig(FULL);
	v.go("Spending");
	const act = lineOf(FULL, "[!activity|spending");
	v.openPage();
	const before = v.disk.text;
	await v.toggle("hidden", true);
	assert.equal(v.disk.writes, 1, "the note is written at once, once");
	assert.equal(v.disk.text.split("\n")[act], "> [!activity|spending tab:now repeat hidden] Spending");
	assert.equal(v.area().value.split("\n")[0], "> [!activity|spending tab:now repeat hidden] Spending", "the Markdown follows the row");
	assert.equal(v.sw("hidden").getAttribute("aria-checked"), "true", "and the switch shows the note");
	assert.match(v.status(), /^Changed Activity: Spending\./);
	assert.ok(v.editor(), "the box stays open");
	assert.equal(v.undo().disabled, false, "one step in the history");
	await v.type("Icon", "book-open");
	assert.equal(v.disk.writes, 2);
	assert.equal(v.area().value.split("\n")[0], "> [!activity|spending tab:now repeat hidden icon:book-open] Spending");
	await v.type("Title", "Money going out");
	await v.type("Id", "outgoings");
	assert.equal(v.disk.writes, 4, "one write for each change");
	assert.equal(v.area().value, "> [!activity|outgoings tab:now repeat hidden icon:book-open] Money going out\n> half an hour", "the second line of the block is as it was");
	assert.equal(v.disk.text.split("\n")[act], "> [!activity|outgoings tab:now repeat hidden icon:book-open] Money going out");
	onlyLines(before, v.disk.text, act);
	// four changes, four steps: Undo four times is the note as it was
	for (let i = 0; i < 4; i++) await v.press(v.undo());
	assert.equal(v.disk.text, before, "four changes were four steps");
	assert.equal(v.undo().disabled, true);
	v.close();
});

test("the markdown and the strip are in step: a switch changes the note and the box at once; typing in the box applies when it is left, and the strip reads the note", async () => {
	const v = rig(FULL);
	v.go("Spending");
	v.openPage();
	assert.equal(v.sw("daily").getAttribute("aria-checked"), "false");
	typeInto(v.area(), "> [!activity|spending tab:now repeat daily] Spending\n> half an hour");
	assert.equal(v.disk.writes, 0, "typing alone writes nothing: the box is applied when it is left");
	assert.equal(v.sw("daily").getAttribute("aria-checked"), "false", "the strip still shows the note");
	v.area().dispatchEvent(new w.Event("change", { bubbles: true }));
	await v.view.whenIdle();
	assert.equal(v.disk.writes, 1);
	assert.equal(v.sw("daily").getAttribute("aria-checked"), "true", "now the strip reads the note");
	await v.toggle("daily", false);
	assert.equal(v.area().value, "> [!activity|spending tab:now repeat] Spending\n> half an hour");
	assert.equal(v.disk.writes, 2);
	v.close();
});

test("there is no preview: the open block is the block, its title field follows a change made in the Markdown as it lands, and nothing in the box is inert", async () => {
	const v = rig(FULL);
	v.go("Spending");
	v.open("question", "[!text|spent]");
	assert.equal(v.editor().querySelector(".booklet-design-edit-previewhost"), null);
	assert.equal(v.editor().querySelector("[inert]"), null);
	assert.equal(v.control("Title").value, "What did you spend?");
	await v.typeArea("> [!text|spent] Money out this week?");
	assert.equal(v.control("Title").value, "Money out this week?", "the field reads the note");
	assert.equal(v.disk.writes, 1);
	v.close();
});

test("the whole-note byte check, on a note with CRLF endings and a question inside a group: only the opening line's bytes change", async () => {
	const text = crlf(FULL);
	const v = rig(text);
	v.go("Doing");
	const q = lineOf(text, "[!choice|did]");
	v.open("question", "[!choice|did]");
	await v.toggle("open", true);
	assert.equal(v.disk.text.split("\n")[q], "> > [!choice|did open] Did you?\r");
	onlyLines(text, v.disk.text, q);
	assert.equal(v.disk.text.split("\n").every((l, i, a) => i === a.length - 1 || l.endsWith("\r")), true);
	v.close();
});

test("a value that is refused says why, inline, in words, and writes nothing: the row goes back to what the note has", async () => {
	const v = rig(FULL);
	v.go("Spending");
	v.openPage();
	const kept = v.area().value;
	for (const [name, value, why] of [
		["Id", "two words", /Not changed\. An id has letters, digits and dashes only/],
		["Id", "why", /Not changed\. `why` is already used/],
		["Id", "", /Not changed\. An id cannot be empty/],
		["Icon", "a b", /Not changed\. A setting's value has no spaces/],
		["status", "a]b", /Not changed\. A setting's value cannot hold `\]`/],
	]) {
		await v.type(name, value);
		assert.match(v.refusal(), why, name + " " + JSON.stringify(value));
		assert.equal(v.area().value, kept, "the Markdown is the note's");
		assert.equal(v.disk.writes, 0, "nothing was written");
		assert.equal(v.undo().disabled, true, "nothing to undo");
		assert.equal(v.control(name).value, name === "Id" ? "spending" : "", "the row shows the note's value again");
	}
	// the next good change takes the refusal away
	await v.type("Title", "Money out");
	assert.equal(v.refusal(), "");
	assert.equal(v.disk.writes, 1);
	v.close();
});

test("a switch that needs another is refused with its reason: `daily` without `repeat`", async () => {
	const v = rig(FULL);
	v.go("A bare activity");
	v.openPage();
	const kept = v.area().value;
	await v.toggle("daily", true);
	assert.match(v.refusal(), /Not changed\. `daily` needs `repeat`/);
	assert.equal(v.area().value, kept);
	assert.equal(v.sw("daily").getAttribute("aria-checked"), "false", "the switch is back where the note has it");
	assert.equal(v.disk.writes, 0);
	v.close();
});

test("an id change that would detach kept entries is asked about in the open, as the change is made: nothing is written while it is open, no writes nothing and puts the row back, yes writes it, and Undo brings it back byte for byte", async () => {
	const v = rig(HELD);
	v.go("A mood log");
	const act = lineOf(HELD, "[!activity|log repeat]");
	v.openPage();
	const before = v.disk.text;
	const typed = v.control("Id");
	typed.value = "diary";
	typed.dispatchEvent(new w.Event("change", { bubbles: true }));
	await later(20);
	assert.ok(v.dialog(), "a question is open");
	assert.equal(v.disk.writes, 0, "nothing is written while it is open");
	const ask = words(v.dialog());
	assert.match(ask, /12 kept entries/);
	assert.match(ask, /The activity id “log” touches 12 kept entries and 1 saved answer\./);
	assert.match(ask, /stay in the note's records as they are/);
	assert.deepEqual([...v.dialog().querySelectorAll("button")].map(words), ["Change", "Cancel"]);
	assert.match(words(doc.querySelector(".booklet-design-ask p")), /will be changed in the note\. Only its own lines are rewritten\./);
	// no: the note is as it was, and the row shows the note's id again
	await v.answer("Cancel");
	assert.equal(v.disk.writes, 0);
	assert.equal(v.disk.text, before);
	assert.equal(v.undo().disabled, true);
	assert.equal(v.status(), "Nothing was changed.");
	assert.ok(v.editor(), "the editor stays open");
	assert.equal(v.area().value.split("\n")[0], "> [!activity|log repeat] A mood log", "with the note's text");
	assert.equal(v.control("Id").value, "log", "the row is back at the note's value");
	// yes
	await v.typeAsk("Id", "diary");
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

test("taking `repeat` off an activity that keeps entries is counted and asked about as it is made; an icon or a title, which detach nothing, are not", async () => {
	const v = rig(HELD);
	v.go("A mood log");
	v.openPage();
	click(v.sw("repeat"));
	await later(20);
	assert.ok(v.dialog());
	assert.match(words(v.dialog()), /12 kept entries/);
	await v.answer("Cancel");
	assert.equal(v.disk.writes, 0);
	assert.equal(v.sw("repeat").getAttribute("aria-checked"), "true", "the switch is back as the note has it");
	await v.type("Title", "My mood log");
	assert.equal(v.dialog(), null, "a title detaches nothing: no question");
	assert.equal(v.disk.writes, 1);
	v.close();
});

test("on a booklet the reader cannot open, a change cannot be counted: the question says so, and yes still writes it", async () => {
	const refused = HELD.replace("> [!module|mood end]\n", "");
	const v = rig(refused);
	v.go("A mood log");
	v.openPage();
	const el = v.control("Id");
	el.value = "diary";
	el.dispatchEvent(new w.Event("change", { bubbles: true }));
	await later(20);
	assert.match(words(v.dialog()), /cannot open this booklet as it is, so this view cannot count what this change touches/);
	await v.answer("Change");
	assert.equal(v.disk.writes, 1);
	v.close();
});

test("undo and redo of a form change restore the exact bytes, on a note with CRLF endings too", async () => {
	for (const text of [FULL, crlf(FULL)]) {
		const v = rig(text);
		v.go("A bare activity");
		v.open("question", "[!number|n1]");
		await v.type("min", "0");
		const after = v.disk.text;
		assert.notEqual(after, text);
		await v.press(v.undo());
		assert.equal(v.disk.text, text, "undo: every byte");
		await v.press(v.redo());
		assert.equal(v.disk.text, after, "redo: every byte");
		v.close();
	}
});

test("the settings entry opens the front matter as rows in the same editor; a row changes only that line, and no block of the page is the front matter", async () => {
	const v = rig(FULL);
	v.go("Settings");
	assert.ok(v.editor(), "the editor is open on the front matter");
	assert.equal(v.editor().querySelector(".is-preview"), null, "front matter has no drawing");
	assert.ok(v.rowNames().includes("title"));
	assert.ok(v.rowNames().includes("booklet"), "the marker is shown, not editable");
	assert.equal(v.all(".booklet-design-block[data-kind='front-matter']").length, 0);
	const before = v.disk.text;
	await v.type("title", "A renamed booklet");
	assert.equal(v.disk.writes, 1);
	assert.match(v.area().value, /^title: A renamed booklet$/m);
	const line = lineOf(before, "title: A made-up booklet");
	onlyLines(before, v.disk.text, line);
	assert.equal(v.disk.text.split("\n")[line], "title: A renamed booklet");
	v.close();
});

/* ======================================================================== the small Markdown editor ======================================================================== */

test("leaving the Markdown rewrites only those lines: a changed line of the block's Markdown goes in, every other byte of the note stays, and the block stays open and selected", async () => {
	const v = rig(FULL);
	v.go("Spending");
	v.open("question", "[!text|spent]");
	const before = v.disk.text;
	const q = lineOf(FULL, "[!text|spent]");
	const own = v.area().value.split("\n");
	assert.ok(own.length >= 3, "the block's own lines include the hint that stands under the question: " + JSON.stringify(own));
	await v.typeArea(["> [!text|spent long] What did you spend this week?", ...own.slice(1)].join("\n"));
	assert.equal(v.disk.writes, 1);
	assert.ok(v.area(), "still open");
	assert.equal(v.disk.text.split("\n")[q], "> [!text|spent long] What did you spend this week?");
	onlyLines(before, v.disk.text, q);
	assert.match(v.status(), /^Changed Question: What did you spend\?(?!\.)/, "names the block as it was drawn when the change was made");
	assert.deepEqual(v.selected(), ["question@" + q], "the block stays selected");
	// a line added to the block's Markdown: the note grows by that line and nothing else moves
	const mid = v.disk.text;
	await v.typeArea(v.area().value + "\n> And one more line.");
	const grown = v.disk.text.split("\n");
	assert.equal(grown.length, mid.split("\n").length + 1);
	assert.equal(grown.slice(0, q + own.length).join("\n"), mid.split("\n").slice(0, q + own.length).join("\n"), "every line above is as it was");
	assert.equal(grown[q + own.length], "> And one more line.");
	assert.equal(grown.slice(q + own.length + 1).join("\n"), mid.split("\n").slice(q + own.length).join("\n"), "and every line below");
	assert.equal(v.disk.writes, 2);
	v.close();
});

/** Types into a field of the box without leaving it: the field has the typing, and the box has not been told (no `change` yet). */
const typeStaying = (v, name, value) => {
	const el = v.control(name);
	el.value = value;
	el.dispatchEvent(new w.Event("input", { bubbles: true }));
	return el;
};

test("typing in a settings row and pressing Ctrl or Cmd with Enter at once applies what was typed and closes the block: the row is read, not just the note", async () => {
	for (const mods of [{ ctrlKey: true }, { metaKey: true }]) {
		const v = rig(FULL);
		v.go("Spending");
		const act = lineOf(FULL, "[!activity|spending");
		v.openPage();
		typeStaying(v, "Title", "Money going out");
		assert.equal(v.disk.writes, 0, "typing alone writes nothing");
		const evt = new w.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true, ...mods });
		v.editor().dispatchEvent(evt);
		await v.view.whenIdle();
		assert.equal(v.disk.writes, 1, "written, not 'nothing was changed'");
		assert.equal(v.disk.text.split("\n")[act], "> [!activity|spending tab:now repeat] Money going out");
		assert.equal(v.editor(), null);
		v.close();
	}
});

test("a press on the page's button while a row still has typing in it applies the typing first, and the press still reaches its button", async () => {
	const v = rig(FULL);
	v.go("Spending");
	const act = lineOf(FULL, "[!activity|spending");
	v.openPage();
	const input = typeStaying(v, "Title", "Money going out");
	input.focus();
	// another block of the page is pressed: the leaving is what applies the typed title, before the box moves
	click(v.block("question", "[!text|spent]"));
	await v.view.whenIdle();
	assert.equal(v.disk.writes, 1);
	assert.equal(v.disk.text.split("\n")[act], "> [!activity|spending tab:now repeat] Money going out");
	assert.ok(v.editor().parentElement.getAttribute("data-kind") === "question", "and the pressed block is open");
	v.close();
});

test("Esc sees typing a row still holds: it is applied and the block closes; typing that cannot be applied stays in the box, is said in words, and the next Esc closes", async () => {
	const v = rig(FULL);
	v.go("Spending");
	const act = lineOf(FULL, "[!activity|spending");
	v.openPage();
	typeStaying(v, "Title", "Money going out");
	v.editor().dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
	await v.view.whenIdle();
	assert.equal(v.editor(), null, "applied, then closed");
	assert.equal(v.disk.writes, 1);
	assert.equal(v.disk.text.split("\n")[act], "> [!activity|spending tab:now repeat] Money going out");
	// the note changes under typing that is not yet applied: it cannot be applied, and says so
	v.go("Money going out");
	v.openPage();
	typeStaying(v, "Title", "Never lost");
	v.disk.text = v.disk.text.replace("half an hour", "an hour");
	v.view.setViewData(v.disk.text, false);
	await v.view.whenIdle();
	assert.ok(v.editor(), "the box stays");
	assert.equal(v.control("Title").value, "Never lost", "the typed text is still there");
	v.editor().dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
	await v.view.whenIdle();
	v.close();
});

test("Ctrl+Enter and Cmd+Enter in the box apply what was typed and close the block", async () => {
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
	assert.equal(w.document.activeElement, v.control("Title"), "the box has the focus");
	assert.equal(stack.length, base + 1, "one scope is added over the view's");
	// the focus leaves the box: Mod+Enter is the app's again (the page hears nothing of it, as in the real app)
	v.control("Title").blur();
	assert.equal(stack.length, base, "taken off at blur");
	v.control("Title").focus();
	assert.equal(stack.length, base + 1, "and put back when the focus returns");
	v.control("Title").focus();
	assert.equal(stack.length, base + 1, "never twice");
	press(v.control("Title"), "Escape");
	assert.equal(stack.length, base, "gone when the editor closes");
	v.open("question", "[!text|spent]");
	assert.equal(stack.length, base + 1);
	v.close();
	assert.equal(stack.length, 0, "and nothing is left on the stack when the view closes");
});

test("Esc after typing applies it, says what changed, and closes the block, which stays selected; nothing is thrown away", async () => {
	const v = rig(FULL);
	v.go("Spending");
	v.open("question", "[!text|spent]");
	typeInto(v.area(), "> [!text|spent] Something else entirely");
	press(v.area(), "Escape");
	await v.view.whenIdle();
	assert.equal(v.area(), null);
	assert.equal(v.disk.writes, 1);
	assert.match(v.disk.text, /Something else entirely/);
	assert.match(v.status(), /^Changed Question/);
	assert.deepEqual(v.selected(), ["question@" + lineOf(FULL, "[!text|spent]")]);
	v.close();
});

test("Esc with nothing typed closes the editor at once, keeping the block selected and writing nothing", () => {
	const v = rig(FULL);
	v.go("Spending");
	v.open("question", "[!text|spent]");
	press(v.area(), "Escape");
	assert.equal(v.area(), null, "closed");
	assert.equal(v.status(), "");
	assert.equal(v.selected().length, 1, "and still selected");
	assert.equal(v.disk.writes, 0);
	v.close();
});

test("typed text is never lost to a drawing, to another page or to pressing another block: it is applied in order, and stays in its block with its caret until then", async () => {
	const v = rig(FULL);
	v.go("Doing");
	v.open("question", "[!text|left]");
	typeInto(v.area(), "> [!text|left] Half written");
	v.area().setSelectionRange(5, 9);
	// something else makes the view draw again (the Add tab opens, a group is opened)
	v.showAdd();
	click(v.el.querySelector(".booklet-design-pal-head"));
	await v.view.whenIdle();
	assert.equal(v.area().value, "> [!text|left] Half written", "the typed text is where it was");
	assert.equal(v.area().selectionStart, 5, "the caret is where it was");
	// another page is drawn: the text is applied first (nothing is waiting any more, so the box has nothing to keep), then the page changes
	v.go("Reading");
	await v.view.whenIdle();
	assert.match(v.disk.text, /\[!text\|left\] Half written/, "applied, not lost");
	assert.equal(v.disk.writes, 1, "once");
	assert.equal(v.editor(), null, "the block is not on this page: the box is closed, with nothing in it that is not in the note");
	v.go("Doing");
	assert.match(words(v.block("question", "[!text|left]")), /Half written/, "and the page shows what was typed");
	v.close();
});

test("typing that cannot be applied because the note changed is not written over it, says so in words, and stays in the box: the vault changed after the view drew, and the view's own copy changed under the editor", async () => {
	// the file changed behind the view's back
	const v = rig(FULL);
	v.go("Spending");
	v.open("question", "[!text|spent]");
	typeInto(v.area(), "> [!text|spent] My careful words");
	const elsewhere = FULL.replace("What did you spend?", "What did you spend today?");
	v.disk.text = elsewhere;
	press(v.area(), "Escape");
	await v.view.whenIdle();
	assert.equal(v.disk.text, elsewhere, "nothing was written over it");
	assert.match(v.status(), /could not be applied, so the block stays open with your text in it/);
	assert.match(words(v.el.querySelector(".booklet-design-editor-state")), /The note changed while you were typing here, so this was not applied\. Your text stays in the box/);
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
	await w2.view.whenIdle();
	press(w2.area(), "Escape");
	await w2.view.whenIdle();
	assert.equal(w2.disk.writes, 0, "nothing was written");
	assert.equal(w2.disk.text, typed);
	assert.match(w2.status(), /could not be applied, so the block stays open with your text in it/);
	assert.equal(w2.area().value, "> [!text|spent] Mine");
	w2.close();
});

test("an editor whose block has gone from where it was keeps its text on the screen, with the reason, and applies nothing over something else", async () => {
	const v = rig(FULL);
	v.go("Spending");
	v.open("question", "[!text|spent]");
	typeInto(v.area(), "> [!text|spent] Kept");
	// the note is changed so that no question stands where it did
	const moved = FULL.replace("> [!text|spent] What did you spend?\n", "Words instead.\n");
	v.disk.text = moved;
	v.view.setViewData(moved, false);
	await v.view.whenIdle();
	assert.equal(v.area().value, "> [!text|spent] Kept", "the text is still there");
	const host = v.el.querySelector(".booklet-design-editbox.is-detached");
	assert.ok(host);
	assert.match(words(host), /no longer where it was in the note/);
	assert.equal(v.disk.text, moved, "nothing written over it");
	assert.equal(v.disk.writes, 0);
	press(v.area(), "Escape");
	await v.view.whenIdle();
	assert.ok(v.area(), "the first Esc says so and stays open");
	press(v.area(), "Escape");
	await v.view.whenIdle();
	assert.equal(v.area(), null, "the next closes it");
	v.close();
});

test("a Markdown change that renames an id kept entries hang on counts them and asks when the box is left; no writes nothing and the box shows the note; yes writes only the lines", async () => {
	const v = rig(HELD);
	v.go("A mood log");
	const act = lineOf(HELD, "[!activity|log repeat]");
	v.openPage();
	typeInto(v.area(), "> [!activity|diary repeat] A mood log");
	v.area().dispatchEvent(new w.Event("change", { bubbles: true }));
	await later(20);
	assert.ok(v.dialog());
	assert.match(words(v.dialog()), /12 kept entries/);
	assert.equal(v.disk.writes, 0);
	await v.answer("Cancel");
	assert.equal(v.disk.writes, 0);
	assert.equal(v.status(), "Nothing was changed.");
	assert.equal(v.area().value, "> [!activity|log repeat] A mood log", "the box shows the note again");
	typeInto(v.area(), "> [!activity|diary repeat] A mood log");
	v.area().dispatchEvent(new w.Event("change", { bubbles: true }));
	await later(20);
	await v.answer("Change");
	assert.equal(v.disk.writes, 1);
	assert.ok(v.area(), "the box stays open");
	onlyLines(HELD, v.disk.text, act);
	v.close();
});

test("a Markdown change that leaves the reader unable to open the booklet is asked about with the reader's reason, never refused: it is the user's own text", async () => {
	const v = rig(HELD);
	const act = lineOf(HELD, "[!activity|once]");
	v.go("Said once");
	v.openPage();
	typeInto(v.area(), "> [!activity|log] Said once");
	v.area().dispatchEvent(new w.Event("change", { bubbles: true }));
	await later(20);
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

test("an empty box is refused with the reason, and the note is unchanged; the editor stays and the box shows the note again", async () => {
	const v = rig(FULL);
	v.go("Spending");
	v.open("question", "[!text|spent]");
	const kept = v.area().value;
	await v.typeArea("\n\n");
	assert.match(v.status(), /Not changed\. A block with no lines is a deleted block: delete it instead\./);
	assert.equal(v.disk.writes, 0);
	assert.ok(v.area(), "the box stays");
	assert.equal(v.area().value, kept, "and shows what the note has");
	v.close();
});

test("the whole-note byte check for a Markdown change: a note with CRLF endings keeps every CR, and the lines the user did not touch keep their bytes", async () => {
	const text = crlf(FULL);
	const v = rig(text);
	v.go("Spending");
	const q = lineOf(text, "[!text|spent]");
	v.open("question", "[!text|spent]");
	const own = v.area().value.split("\n");
	assert.ok(own.every((l) => !l.includes("\r")), "the box shows the lines without their line ends");
	await v.typeArea(["> [!text|spent long] Changed", ...own.slice(1)].join("\n"));
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
	const input = v.control("Title");
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

test("the editor needs no buttons of its own, the page's buttons are at least 44 px high on a phone by the sheet, the textarea is monospace and sizes to its content, and the narrow rules stack the rows", () => {
	const css = readFileSync(`${ROOT}/styles.base.css`, "utf8");
	assert.match(css, /\.is-mobile \.booklet-design button,\s*\n\.is-mobile \.booklet-design summary,\s*\n\.booklet-design\.is-phone button,\s*\n\.booklet-design\.is-phone summary \{\s*\n\s*min-width: 44px;\s*\n\s*min-height: 44px;/);
	assert.match(css, /\.booklet-design-textarea \{[^}]*field-sizing: content;[^}]*font-family: var\(--font-monospace\);/);
	const v = rig(FULL);
	v.go("Spending");
	v.open("question", "[!text|spent]");
	assert.equal(v.el.querySelector(".booklet-design-editor-buttons"), null, "no Save or Cancel row");
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

/* ======================================================================== the words are fields: title, description, Markdown, strip, close ======================================================================== */

/** A press on the empty page: the pointer goes down and comes up on `el`, which then gets the click. */
const pressOn = (el) => {
	el.dispatchEvent(new w.MouseEvent("mousedown", { bubbles: true, cancelable: true }));
	el.dispatchEvent(new w.MouseEvent("mouseup", { bubbles: true, cancelable: true }));
	click(el);
};

test("the title field applies when it is left: one write, one step of Undo, only the first line changes, and the field is the same field after", async () => {
	const v = rig(FULL);
	v.go("Spending");
	v.open("question", "[!text|spent]");
	const before = v.disk.text;
	const q = lineOf(FULL, "[!text|spent]");
	const title = v.control("Title");
	title.focus();
	typeInto(title, "Money out this week?");
	assert.equal(v.disk.writes, 0, "typing alone writes nothing");
	title.dispatchEvent(new w.Event("change", { bubbles: true }));
	await v.settle();
	assert.equal(v.disk.writes, 1);
	assert.equal(v.disk.text.split("\n")[q], "> [!text|spent] Money out this week?");
	onlyLines(before, v.disk.text, q);
	assert.equal(v.control("Title"), title, "the field was not drawn again under the caret");
	assert.equal(doc.activeElement, title);
	assert.equal(v.area().value.split("\n")[0], "> [!text|spent] Money out this week?", "the Markdown follows");
	// a title is one line: a line break typed or pasted is a space, and the same words again are no change
	typeInto(title, "Money out\nthis week?");
	title.dispatchEvent(new w.Event("change", { bubbles: true }));
	await v.settle();
	assert.equal(v.disk.text.split("\n")[q], "> [!text|spent] Money out this week?");
	assert.equal(v.disk.writes, 1, "the same words: no write");
	await v.press(v.undo());
	assert.equal(v.disk.text, before, "one step of Undo is the whole change");
	v.close();
});

test("Enter in the title applies it and leaves the field in place; Enter in the description is a line break, and it applies when the field is left", async () => {
	const v = rig(FULL);
	v.go("Spending");
	v.open("question", "[!text|spent]");
	const title = v.control("Title");
	typeInto(title, "Out?");
	const evt = v.key("Enter", { target: title });
	assert.equal(evt.defaultPrevented, true, "Enter is the field's");
	await v.settle();
	assert.equal(v.disk.writes, 1);
	assert.match(v.disk.text, /\[!text\|spent\] Out\?/);
	assert.ok(v.editor(), "the box stays open");
	const desc = v.control("Description");
	typeInto(desc, "In the week.\nIn pounds.");
	const enter = v.key("Enter", { target: desc });
	assert.equal(enter.defaultPrevented, false, "Enter is left to the description: it makes a new line");
	assert.equal(v.disk.writes, 1);
	desc.dispatchEvent(new w.Event("change", { bubbles: true }));
	await v.settle();
	assert.equal(v.disk.writes, 2);
	assert.match(v.disk.text, /\[!text\|spent\] Out\?\n> In the week\.\n> In pounds\.\n/);
	v.close();
});

test("the description applies when it is left, keeps the question's other lines, and goes before a list; emptied, it leaves no lines behind", async () => {
	const v = rig(FULL);
	v.go("Doing");
	v.open("question", "[!choice|did]");
	const before = v.disk.text;
	const at = lineOf(FULL, "[!choice|did]");
	await v.type("Description", "Pick one.");
	assert.equal(v.disk.writes, 1);
	const lines = v.disk.text.split("\n");
	assert.equal(lines[at], "> > [!choice|did] Did you?", "the first line is as it was");
	assert.equal(lines[at + 1], "> > Pick one.", "the description is quoted as the block is, before the list");
	assert.equal(lines[at + 2], "> - [ ] Yes");
	assert.equal(v.area().value.split("\n")[1], "> Pick one.", "the Markdown follows (as the block's own lines, without the group's mark)");
	await v.type("Description", "");
	assert.equal(v.disk.text, before, "emptied: the note is as it was, byte for byte");
	assert.equal(v.disk.writes, 2);
	v.close();
});

test("a description changed under the field is not written over it: the note changed while it was being typed", async () => {
	const v = rig(FULL);
	v.go("Spending");
	v.open("question", "[!text|spent]");
	const desc = v.control("Description");
	// a description arrives in the note by another route (the Markdown), then the field, which was typed from nothing, is left
	typeInto(desc, "Typed here.");
	await v.typeArea("> [!text|spent] What did you spend?\n> Written in the Markdown.");
	assert.equal(v.disk.writes, 1);
	assert.match(v.disk.text, /Written in the Markdown\./);
	assert.doesNotMatch(v.disk.text, /Typed here\./, "what was typed in the field was not applied over it");
	v.close();
});

test("Ctrl+Enter in the title applies what is typed in every field and closes the block; Esc does the same, and neither is a second write", async () => {
	for (const how of ["ctrl", "esc"]) {
		const v = rig(FULL);
		v.go("Spending");
		v.open("question", "[!text|spent]");
		typeInto(v.control("Title"), "Out?");
		typeInto(v.control("Description"), "A week.");
		if (how === "ctrl") v.control("Title").dispatchEvent(new w.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true, ctrlKey: true }));
		else v.control("Description").dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
		await v.view.whenIdle();
		assert.equal(v.editor(), null, `${how}: closed`);
		assert.equal(v.disk.writes, 2, `${how}: one write for each field`);
		assert.match(v.disk.text, /\[!text\|spent\] Out\?\n> A week\.\n/);
		v.close();
	}
});

test("a press on the empty page closes the open block, with what is typed applied first; a press on a block, a control or the box does not, and neither does a drag that ends on the page", async () => {
	const v = rig(FULL);
	v.go("Spending");
	v.open("question", "[!text|spent]");
	typeInto(v.control("Title"), "Out?");
	// the page is drawn again now and then, so its surface is looked up each time it is pressed
	const page = () => v.el.querySelector(".booklet-design-scroll");
	assert.ok(page(), "the page's own surface");
	// inside the box, on the box's own controls, and on a block: not the background
	pressOn(v.editor());
	pressOn(v.control("Description"));
	pressOn(v.block("question", "[!text|spent]"));
	await v.settle();
	assert.ok(v.editor(), "still open");
	// a drag: the press began in the box and the click lands on the page
	v.editor().dispatchEvent(new w.MouseEvent("mousedown", { bubbles: true, cancelable: true }));
	click(page());
	await v.settle();
	assert.ok(v.editor(), "a drag that ends on the page does not close it");
	// the press on the page itself
	pressOn(page());
	await v.settle();
	assert.equal(v.editor(), null, "closed");
	assert.equal(v.disk.writes, 1, "what was typed was applied first");
	assert.match(v.disk.text, /\[!text\|spent\] Out\?/);
	assert.equal(v.selected().length, 1, "the block stays selected");
	// with nothing open, a press on the page is just a press
	pressOn(page());
	await v.settle();
	assert.equal(v.disk.writes, 1);
	v.close();
});

test("the Markdown is a closed section until it is opened by one press; a block with no title or description to edit, or whose parts cannot be shown, has it open", async () => {
	const v = rig(FULL);
	v.go("Spending");
	v.open("question", "[!text|spent]");
	const md = () => v.editor().querySelector("details.booklet-design-edit-md");
	assert.equal(md().open, false, "closed for a block with words");
	md().querySelector("summary").dispatchEvent(new w.MouseEvent("click", { bubbles: true, cancelable: true }));
	md().open = true;
	assert.equal(md().open, true);
	press(v.area(), "Escape");
	await v.settle();
	// a block of a kind with no words to edit in place
	v.go("The map");
	click(v.all(".booklet-design-block[data-kind='page-break']")[0]);
	await v.settle();
	assert.ok(v.editor());
	assert.equal(v.control("Title"), null, "no title field");
	assert.equal(v.control("Description"), null, "no description field");
	assert.equal(md().open, true, "its Markdown is open: it is all there is");
	v.close();
});

test("move up, move down and delete are small buttons at the end of the strip: each closes the block (what is typed applied first) and then acts as the page's bar does, as one step of Undo", async () => {
	const v = rig(FULL);
	v.go("Doing");
	v.open("question", "[!text|left]");
	const tb = () => v.editor().querySelector('.booklet-design-strip-actions[role="toolbar"]');
	assert.ok(tb(), "a toolbar");
	const btn = (what) => tb().querySelector(`.is-${what}`);
	assert.deepEqual([...tb().querySelectorAll("button")].map((b) => b.getAttribute("aria-label")), ["Move up", "Move down", "Delete"]);
	const before = v.disk.text;
	typeInto(v.control("Title"), "Left side?");
	click(btn("delete"));
	await v.settle();
	assert.equal(v.editor(), null, "the block closed");
	assert.doesNotMatch(v.disk.text, /\[!text\|left\]/, "and was deleted");
	assert.equal(v.disk.writes, 2, "the typing, then the delete");
	await v.press(v.undo());
	assert.match(v.disk.text, /\[!text\|left\] Left side\?/, "Undo brings the block back, with what was typed");
	await v.press(v.undo());
	assert.equal(v.disk.text, before);
	v.close();
});

test("the box's controls are named for a screen reader, and the strings of the in-place box exist in Spanish and French; the draft's strings and the preview's are gone", () => {
	for (const k of ["edit.desc", "edit.words", "edit.rest", "edit.markdownOnly", "edit.bar", "edit.keys", "editor.label"]) {
		assert.ok(DESIGN_STRINGS[k], k);
		for (const lang of ["en", "es", "fr"]) assert.ok(DESIGN_STRINGS[k][lang] && DESIGN_STRINGS[k][lang].length > 3, `${k} ${lang}`);
		assert.notEqual(DESIGN_STRINGS[k].es, DESIGN_STRINGS[k].en, `${k} is translated into Spanish`);
		assert.notEqual(DESIGN_STRINGS[k].fr, DESIGN_STRINGS[k].en, `${k} is translated into French`);
	}
	assert.match(DESIGN_STRINGS["edit.markdownOnly"].en, /\{reason\}/);
	for (const k of ["edit.heading", "edit.preview", "form.id.desc", "form.title.desc"]) assert.equal(Object.hasOwn(DESIGN_STRINGS, k), false, `${k} is gone`);
	const v = rig(FULL);
	v.go("Spending");
	v.open("question", "[!text|spent]");
	assert.equal(v.control("Description").getAttribute("aria-label"), en("edit.desc"));
	assert.equal(v.control("Description").getAttribute("placeholder"), en("edit.desc"));
	assert.ok(v.editor().querySelector('[role="toolbar"]'));
	v.close();
});

test("the in-place box has a look in the base sheet and in the paper themes, and on a phone every field and strip control is 44 px high and the strip's items take a line each", () => {
	const base = readFileSync(`${ROOT}/styles.base.css`, "utf8");
	const theme = readFileSync(`${ROOT}/themes/design.css`, "utf8");
	for (const sel of [".booklet-design-editbox", ".booklet-design-field", ".booklet-design-field.is-title", ".booklet-design-field.is-desc", ".booklet-design-strip", ".booklet-design-strip-switch", ".booklet-design-strip-actions", ".booklet-design-edit-md"]) {
		assert.ok(base.includes(sel), `${sel} is drawn by the base sheet (the Obsidian look)`);
		assert.ok(theme.includes(sel), `${sel} is drawn by the paper looks`);
	}
	// the open block is the block: no second border around it, and no preview or heading rules are left
	assert.match(base, /\.booklet-design-block\.is-open:not\(\.is-kind-group\):not\(\.is-kind-row\)\s*\{[^}]*border-color: transparent/);
	for (const dead of ["edit-previewhost", "booklet-design-edit-head", "booklet-design-edit-title"]) {
		assert.equal(base.includes(dead), false, `${dead} is gone from the base sheet`);
		assert.equal(theme.includes(dead), false, `${dead} is gone from the paper looks`);
	}
	// the phone rules
	assert.match(base, /\.booklet-design\.is-phone \.booklet-design-field,[\s\S]*?min-height: 44px/);
	assert.match(base, /\.booklet-design\.is-phone \.booklet-design-strip-input[\s\S]*?min-height: 44px/);
	assert.match(base, /\.booklet-design\.is-phone \.booklet-design-strip-item \{[^}]*flex: 1 1 100%/);
});

/* ============================================ the formatting bar: Markdown markers over a field's words ============================================ */

/** The bar of the open box, and a button of it by the word it is for. */
const bar = (v) => v.editor().querySelector(".booklet-design-richbar");
const rich = (v, what) => bar(v).querySelector(`[data-rich="${what}"]`);
const isOn = (b) => b.getAttribute("aria-disabled") === "false";
/** The field has the focus and this selection. */
const select = (el, a, b = a) => {
	el.focus();
	el.setSelectionRange(a, b);
};
/** A key as a person makes it in a field; gives the event. */
const chord = (el, key, mods = { ctrlKey: true }) => {
	const evt = new w.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...mods });
	el.dispatchEvent(evt);
	return evt;
};
/** Presses a button of the bar as a mouse does: the press that would move the focus is cancelled, then the click. */
const pressBar = (b) => {
	const down = new w.MouseEvent("mousedown", { bubbles: true, cancelable: true });
	b.dispatchEvent(down);
	const pointer = new w.Event("pointerdown", { bubbles: true, cancelable: true });
	b.dispatchEvent(pointer);
	click(b);
	return { down, pointer };
};

test("the bar is over the words of a question, a reading callout and a prose block, and not over the Markdown or a one-line settings field", () => {
	const v = rig(FULL);
	v.go("Spending");
	v.open("question", "[!text|spent]");
	assert.ok(bar(v), "a question has the bar");
	assert.equal(bar(v).hidden, false);
	assert.equal(bar(v).getAttribute("role"), "toolbar");
	assert.deepEqual([...bar(v).querySelectorAll("button")].map((b) => b.getAttribute("data-rich")), ["bold", "italic", "link", "bullets"]);
	for (const b of bar(v).querySelectorAll("button")) {
		assert.ok(b.getAttribute("aria-label"), "every button is named");
		assert.match(b.getAttribute("title"), /\(Ctrl\+/, "and says its key");
		assert.equal(b.getAttribute("tabindex"), "-1", "out of the Tab order: the keys are the keyboard's way in");
	}
	// the fields that take the keys are the title and the description, and (stage 4) the title and the words of the question's hint; nothing else of the box does
	assert.deepEqual([...v.editor().querySelectorAll("[data-rich]:not(button)")].map((e) => `${e.getAttribute("data-field")}:${e.getAttribute("data-rich")}`), ["title:title", "description:help", "hint-title:title", "hint-words:help"]);
	assert.equal(v.area().hasAttribute("data-rich"), false, "the Markdown textarea has no bar and no keys");
	assert.equal(v.editor().querySelector(".booklet-design-strip-item input").hasAttribute("data-rich"), false, "nor has an id field");
	// the Markdown textarea is not under a bar of its own
	assert.equal(v.editor().querySelectorAll(".booklet-design-richbar").length, 1);
	press(v.control("Title"), "Escape");
	v.go("Money");
	v.open("prose", "Words in the module's opening.");
	assert.equal(bar(v).hidden, false);
	assert.deepEqual([...v.editor().querySelectorAll("[data-rich]:not(button)")].map((e) => e.getAttribute("data-rich")), ["prose"]);
	press(v.control("Description"), "Escape");
	v.go("A made-up booklet");
	v.open("callout", "[!tip] Start here");
	assert.deepEqual([...v.editor().querySelectorAll("[data-rich]:not(button)")].map((e) => `${e.getAttribute("data-field")}:${e.getAttribute("data-rich")}`), ["title:title", "description:prose"]);
	v.close();
});

test("the buttons are on only while a field of words has the focus, bullets only in prose, and the bar is the same size either way", () => {
	const v = rich_open();
	function rich_open() {
		const x = rig(FULL);
		x.go("A made-up booklet");
		x.open("callout", "[!tip] Start here");
		return x;
	}
	doc.activeElement.blur();
	for (const what of ["bold", "italic", "link", "bullets"]) assert.equal(isOn(rich(v, what)), false, `${what} is quiet with nothing focused`);
	const title = v.control("Title");
	const desc = v.control("Description");
	title.focus();
	assert.deepEqual(["bold", "italic", "link", "bullets"].map((x) => isOn(rich(v, x))), [true, true, true, false], "in a title: no bullets");
	desc.focus();
	assert.deepEqual(["bold", "italic", "link", "bullets"].map((x) => isOn(rich(v, x))), [true, true, true, true], "in the words of a callout: all four");
	v.area().focus?.();
	const id = v.editor().querySelector("input");
	if (id) {
		id.focus();
		assert.deepEqual(["bold", "italic", "link", "bullets"].map((x) => isOn(rich(v, x))), [false, false, false, false], "an input of the strip: none");
	}
	// the bar is in the box's flow in one place whatever is focused: the same element, and its buttons are never added or taken away
	const buttons = [...bar(v).children];
	title.focus();
	assert.deepEqual([...bar(v).children], buttons);
	assert.equal(bar(v).hidden, false);
	v.close();
});

test("a press on a button wraps the selection in the field and keeps the focus and the selection; applied when the field is left, one write, one step of Undo, and only the markers differ", async () => {
	const v = rig(FULL);
	v.go("Spending");
	v.open("question", "[!text|spent]");
	const before = v.disk.text;
	const q = lineOf(FULL, "[!text|spent]");
	const title = v.control("Title");
	select(title, 13, 18); // "spend"
	const { down, pointer } = pressBar(rich(v, "bold"));
	assert.equal(down.defaultPrevented, true, "the press does not take the focus from the field");
	assert.equal(pointer.defaultPrevented, true);
	assert.equal(title.value, "What did you **spend**?");
	assert.equal(doc.activeElement, title, "the field keeps the focus");
	assert.deepEqual([title.selectionStart, title.selectionEnd], [15, 20], "and the words stay selected");
	assert.equal(v.disk.writes, 0, "nothing is written until the field is left");
	pressBar(rich(v, "bold"));
	assert.equal(title.value, "What did you spend?", "a second press takes it off");
	pressBar(rich(v, "italic"));
	assert.equal(title.value, "What did you *spend*?");
	title.dispatchEvent(new w.Event("change", { bubbles: true }));
	await v.settle();
	assert.equal(v.disk.writes, 1);
	assert.equal(v.disk.text.split("\n")[q], "> [!text|spent] What did you *spend*?");
	onlyLines(before, v.disk.text, q);
	assert.equal(v.disk.text.replace(/\*/g, ""), before.replace(/\*/g, ""), "only the markers changed");
	assert.equal(v.control("Title"), title, "the field was not drawn again");
	assert.equal(doc.activeElement, title);
	await v.press(v.undo());
	assert.equal(v.disk.text, before, "one step of Undo");
	v.close();
});

test("a format that changes nothing writes nothing; a link makes the address the selection, and the bytes differ by the brackets only", async () => {
	const v = rig(FULL);
	v.go("Spending");
	v.open("question", "[!text|spent]");
	const before = v.disk.text;
	const desc = v.control("Description");
	typeInto(desc, "half an hour");
	select(desc, 0, 4);
	pressBar(rich(v, "link"));
	assert.equal(desc.value, "[half](https://) an hour");
	assert.equal(desc.value.slice(desc.selectionStart, desc.selectionEnd), "https://", "the address is selected for typing");
	typeInto(desc, "[half](https://example.org/a) an hour");
	desc.setSelectionRange(8, 8);
	pressBar(rich(v, "link"));
	assert.equal(desc.value.slice(desc.selectionStart, desc.selectionEnd), "https://example.org/a", "a real address is not thrown away: it is selected");
	desc.dispatchEvent(new w.Event("change", { bubbles: true }));
	await v.settle();
	assert.equal(v.disk.writes, 1);
	assert.match(v.disk.text, /\n> \[half\]\(https:\/\/example\.org\/a\) an hour\n/);
	assert.equal(v.disk.text.split("\n").length, before.split("\n").length + 1, "the description's line is the only line added");
	v.close();
});

test("a format that is refused says why in the status line and changes nothing; bullets are refused in a title and in a question's help", () => {
	const v = rig(FULL);
	v.go("Spending");
	v.open("question", "[!text|spent]");
	const title = v.control("Title");
	select(title, 0, 0);
	title.value = "";
	select(title, 0, 0);
	pressBar(rich(v, "bullets"));
	assert.equal(title.value, "", "a title takes no bullets");
	// a bar button that is quiet does nothing
	const desc = v.control("Description");
	select(desc, 0, 0);
	desc.value = "one\ntwo";
	select(desc, 0, 7);
	pressBar(rich(v, "link"));
	assert.match(v.status(), /single line/);
	assert.equal(desc.value, "one\ntwo");
	assert.equal(chord(desc, "8", { ctrlKey: true, shiftKey: true, code: "Digit8" }).defaultPrevented, false, "no bullet key in a question's help");
	assert.equal(desc.value, "one\ntwo");
	v.close();
});

test("the keys: Ctrl+B, I and K in a field of words, Ctrl+Shift+8 in prose; no other field, and not the Markdown, hears them", async () => {
	const v = rig(FULL);
	v.go("Spending");
	v.open("question", "[!text|spent]");
	const title = v.control("Title");
	select(title, 0, 4);
	let heard = 0;
	doc.body.addEventListener("keydown", () => heard++);
	const b = chord(title, "b");
	assert.equal(b.defaultPrevented, true, "the key is the field's");
	assert.equal(heard, 0, "and goes no further");
	assert.equal(title.value, "**What** did you spend?");
	assert.equal(chord(title, "B").defaultPrevented, true);
	assert.equal(title.value, "What did you spend?", "upper case is the same key: it comes off");
	chord(title, "i");
	assert.equal(title.value, "*What* did you spend?");
	chord(title, "i");
	select(title, 0, 4);
	chord(title, "k");
	assert.equal(title.value, "[What](https://) did you spend?");
	assert.equal(chord(title, "8", { ctrlKey: true, shiftKey: true, code: "Digit8" }).defaultPrevented, false, "no bullets in a title");
	// keys with another modifier, or none, are not ours
	for (const mods of [{}, { metaKey: true }, { altKey: true, ctrlKey: true }, { ctrlKey: true, shiftKey: true }]) assert.equal(chord(title, "b", mods).defaultPrevented, false, JSON.stringify(mods));
	// the strip's fields and the Markdown do not hear them
	const idInput = v.editor().querySelector(".booklet-design-strip-item input");
	idInput.focus();
	const before = idInput.value;
	assert.equal(chord(idInput, "b").defaultPrevented, false);
	assert.equal(idInput.value, before);
	const area = v.area();
	area.focus();
	area.setSelectionRange(0, 3);
	const a = area.value;
	assert.equal(chord(area, "b").defaultPrevented, false, "the Markdown textarea has no keys");
	assert.equal(chord(area, "k").defaultPrevented, false);
	assert.equal(area.value, a);
	// prose takes the bullet key
	press(title, "Escape");
	await v.settle();
	v.go("Money");
	v.open("prose", "Words in the module's opening.");
	const words_ = v.control("Description");
	select(words_, 3, 3);
	assert.equal(chord(words_, "8", { ctrlKey: true, shiftKey: true, code: "Digit8" }).defaultPrevented, true);
	assert.equal(words_.value, "- Words in the module's opening.");
	v.close();
});

test("a format is applied to the note as typing is: leaving the field writes it once, a prose block's bullets add `- ` and nothing else", async () => {
	const v = rig(FULL);
	v.go("Money");
	v.open("prose", "Words in the module's opening.");
	const before = v.disk.text;
	const at = lineOf(FULL, "Words in the module's opening.");
	const field = v.control("Description");
	select(field, 0, field.value.length);
	pressBar(rich(v, "bullets"));
	assert.equal(field.value, "- Words in the module's opening.");
	assert.equal(v.disk.writes, 0);
	field.blur();
	await v.settle();
	assert.equal(v.disk.writes, 1, "left: one write (the blur is enough, as the bar's change raises no `change` event)");
	assert.equal(v.disk.text.split("\n")[at], "- Words in the module's opening.");
	onlyLines(before, v.disk.text, at);
	await v.press(v.undo());
	assert.equal(v.disk.text, before);
	v.close();
});

test("the field is changed by the editing command when the browser has one, over only the stretch that differs (the browser's own Undo then steps back one format); with none, by setRangeText and an input event", () => {
	const v = rig(FULL);
	v.go("Spending");
	v.open("question", "[!text|spent]");
	const title = v.control("Title");
	const calls = [];
	const seen = [];
	title.addEventListener("input", () => seen.push(title.value));
	const had = w.document.execCommand;
	w.document.execCommand = (cmd, _ui, text) => {
		calls.push([cmd, text, title.selectionStart, title.selectionEnd]);
		if (cmd === "insertText") title.setRangeText(text, title.selectionStart, title.selectionEnd, "end");
		else if (cmd === "delete") title.setRangeText("", title.selectionStart, title.selectionEnd, "end");
		title.dispatchEvent(new w.Event("input", { bubbles: true }));
		return true;
	};
	try {
		select(title, 13, 18);
		pressBar(rich(v, "bold"));
		assert.equal(title.value, "What did you **spend**?");
		// the stretch that differs is from the first mark to the last: "spend" became "**spend**"
		assert.deepEqual(calls[0], ["insertText", "**spend**", 13, 18]);
		pressBar(rich(v, "bold"));
		assert.deepEqual(calls[1], ["insertText", "spend", 13, 22]);
		assert.equal(title.value, "What did you spend?");
		title.value = "a  b";
		title.setSelectionRange(2, 2);
		pressBar(rich(v, "link"));
		assert.equal(title.value, "a [](https://) b");
		pressBar(rich(v, "link"));
		assert.equal(title.value, "a  b");
		assert.equal(calls[calls.length - 1][0], "delete", "taking a mark away with nothing in its place is the delete command");
	} finally {
		w.document.execCommand = had;
	}
	assert.ok(seen.length >= 4, "typing's input event is raised for each");
	// no command (jsdom has none): the same result
	title.value = "What did you spend?";
	select(title, 13, 18);
	pressBar(rich(v, "italic"));
	assert.equal(title.value, "What did you *spend*?");
	v.close();
});

test("the formatting bar and its refusals exist in Spanish and French", () => {
	for (const k of Object.keys(DESIGN_STRINGS).filter((x) => x.startsWith("rich."))) {
		assert.ok(DESIGN_STRINGS[k].es && DESIGN_STRINGS[k].fr, k);
		assert.notEqual(DESIGN_STRINGS[k].es, DESIGN_STRINGS[k].en, `${k} is not the English`);
	}
	assert.ok(Object.keys(DESIGN_STRINGS).filter((x) => x.startsWith("rich.")).length >= 14);
});
