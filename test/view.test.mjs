/*
 * The Booklet view itself, run in Node over a jsdom document (test/dom.mjs), with the few parts of Obsidian's API it
 * uses stubbed (test/obsidian-stub.mjs). These tests are about one rule: a field the reader is editing (it has focus,
 * or holds typing not yet written) is never overwritten or replaced by a change to the note that arrives meanwhile,
 * from a Markdown pane of the same note, from Sync, or from another plugin. The field is brought up to date when the
 * reader leaves it, and where the change touched the same question, what the reader typed wins: it is the newer change.
 * A change that arrives is fed to the view as Obsidian does when the file changes: setViewData(text, false).
 */
import { window as w } from "./dom.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, core, norm } from "./helpers.mjs";

const { BookletView } = await import("./.build/view.mjs");

const NOTE = readFileSync(join(ROOT, "test-vault", "Every kind.booklet.md"), "utf8");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** A view open on a copy of the every-kind note; `disk` is the note as the vault holds it. */
function open(text = NOTE) {
	const disk = { text };
	const app = {
		vault: {
			process: async (_file, fn) => {
				disk.text = fn(disk.text);
				return disk.text;
			},
		},
		workspace: { iterateAllLeaves() {}, on() {}, requestSaveLayout() {} },
	};
	const view = new BookletView({ app }, { setMode: async () => {} });
	view.file = { path: "Every kind.booklet.md", basename: "Every kind.booklet" };
	view.load();
	void view.setState({ version: 1, screen: "activity:/kinds" }, {});
	view.setViewData(text, true);
	const q = (kind) => view.contentEl.querySelector(`[data-booklet-activity="/kinds"] .booklet-kind-${kind}`);
	return {
		view,
		disk,
		q,
		/** The note changed elsewhere: the vault holds the new text, and the view is handed it. */
		changed(edit) {
			disk.text = edit(disk.text);
			view.setViewData(disk.text, false);
		},
		/** The answers the vault holds now. */
		answers: () => norm(core.parseBooklet(disk.text).records.answers[""] ?? {}),
		/** Timers run and every write has landed. */
		settled: async (ms = 0) => {
			await sleep(ms + 30);
			await view.writes;
			await sleep(5);
		},
		/** Is the view's drawing still the one it was (same card element)? */
		card: () => view.contentEl.querySelector('[data-booklet-activity="/kinds"]'),
		close() {
			view.unload();
			view.containerEl.remove();
		},
	};
}

/** The design changes: words added to the note's prose, as typed in a Markdown pane. */
const prose = (word) => (t) => t.replace("any answer will do.", `any answer will do. ${word}`);
/** The same question's answer changes in the records, as another device or a hand edit would. */
const stored = (id, value) => (t) => core.setAnswer(t, "", id, value);
const both = (...edits) => (t) => edits.reduce((x, e) => e(x), t);
const typeInto = (el, value) => {
	el.value = value;
	el.dispatchEvent(new w.Event("input", { bubbles: true }));
};
const press = (el, key) => el.dispatchEvent(new w.KeyboardEvent("keydown", { key, bubbles: true }));

/** Answers the number question with 7 and waits for it to be written. */
async function sevenBoxes(v) {
	const n = v.q("number").querySelector("input");
	n.focus();
	typeInto(n, "7");
	n.blur();
	await v.settled();
	assert.equal(v.answers().boxes, 7);
	return n;
}

test("a change to the design while a text field has focus and typing: the same field keeps its words and caret; drawn again when the reader leaves", async () => {
	const v = open();
	const t = v.q("text").querySelector("textarea");
	t.focus();
	typeInto(t, "Half typed");
	t.setSelectionRange(4, 4);
	const card = v.card();
	v.changed(both(prose("MARK-ONE"), stored("thoughts", "Changed elsewhere")));
	assert.ok(t.isConnected, "the field the reader is in was replaced by a drawing");
	assert.equal(w.document.activeElement, t, "focus moved");
	assert.equal(t.value, "Half typed");
	assert.deepEqual([t.selectionStart, t.selectionEnd], [4, 4], "the caret moved");
	assert.equal(v.card(), card, "the view was drawn again while the reader was in a field");
	t.blur();
	await v.settled();
	assert.equal(v.answers().thoughts, "Half typed", "the reader's typing is the newer change, and wins");
	assert.ok(v.view.contentEl.textContent.includes("MARK-ONE"), "after the reader left the field, the view shows the new design");
	v.close();
});

test("the number field the reader has selected is not replaced by a change to the design; what they type then is the answer", async () => {
	// the failure seen in the real Obsidian: the field was drawn again holding the stored 15, the selection was gone,
	// and the 20 typed next was appended to it: 1520
	const v = open();
	const n = await sevenBoxes(v);
	n.focus();
	n.select();
	v.changed(both(prose("MARK-TWO"), stored("boxes", 9)));
	assert.ok(n.isConnected && w.document.activeElement === n, "the selected number field was replaced by a drawing");
	assert.equal(n.value, "7", "the field the reader is in was overwritten by the file");
	typeInto(n, "12");
	n.blur();
	await v.settled();
	assert.equal(v.answers().boxes, 12);
	v.close();
});

test("a field left without typing is brought up to date when the reader leaves it, and nothing is written over the file", async () => {
	const v = open();
	const n = await sevenBoxes(v);
	n.focus();
	v.changed(stored("boxes", 3));
	assert.equal(n.value, "7", "the field the reader is in was overwritten while it had focus");
	const before = v.disk.text;
	n.blur();
	await v.settled();
	assert.equal(n.value, "3", "after the reader left it, the field shows the note's answer");
	assert.equal(v.disk.text, before, "leaving the field wrote something");
	v.close();
});

test("words typed in Add your own survive a change to the note, and Enter adds them to the answer the note now holds", async () => {
	const v = open();
	const own = v.q("multi").querySelector(".booklet-own-row input");
	own.focus();
	typeInto(own, "Twine");
	v.changed(both(prose("MARK-THREE"), stored("tools", [2])));
	assert.ok(own.isConnected && w.document.activeElement === own, "the Add your own field was replaced by a drawing");
	assert.equal(own.value, "Twine", "the words typed in Add your own were lost");
	press(own, "Enter");
	await v.settled();
	assert.deepEqual(v.answers().tools, [2, "Twine"]);
	v.close();
});

test("words left in Add your own are added when the field is left (SPEC section 5), and the view drawn again shows them as an option of the reader's own", async () => {
	const v = open();
	const own = v.q("multi").querySelector(".booklet-own-row input");
	own.focus();
	typeInto(own, "Glue");
	own.blur();
	await v.settled();
	assert.deepEqual(v.answers().tools, ["Glue"]);
	assert.equal(own.value, "", "the field is emptied");
	const card = v.card();
	v.changed(prose("MARK-NINE"));
	assert.notEqual(v.card(), card, "with no field in use, the view is drawn again");
	assert.equal(v.q("multi").querySelector(".booklet-own-row input").value, "");
	assert.deepEqual([...v.q("multi").querySelectorAll("button.booklet-own[aria-pressed=true]")].map((b) => b.textContent.trim()), ["Glue"]);
	v.close();
});

test("a lines field being typed in keeps its field, and the reader's lines win over the change", async () => {
	const v = open();
	const first = v.q("lines").querySelector("input");
	first.focus();
	typeInto(first, "Half a line");
	v.changed(both(prose("MARK-FOUR"), stored("steps", ["Elsewhere"])));
	assert.ok(first.isConnected && w.document.activeElement === first, "the line the reader is in was replaced by a drawing");
	assert.equal(first.value, "Half a line");
	first.blur();
	await v.settled();
	assert.deepEqual(v.answers().steps, ["Half a line", ""]);
	v.close();
});

test("a date field being set keeps its field, and the reader's date wins over the change", async () => {
	const v = open();
	const d = v.q("date").querySelector("input");
	d.focus();
	typeInto(d, "2026-12-01");
	v.changed(both(prose("MARK-FIVE"), stored("fold-day", "2026-01-02")));
	assert.ok(d.isConnected && w.document.activeElement === d, "the date field was replaced by a drawing");
	assert.equal(d.value, "2026-12-01");
	d.blur();
	await v.settled();
	assert.equal(v.answers()["fold-day"], "2026-12-01");
	v.close();
});

test("the view's own write, carrying a change it had not seen, does not replace the field the reader is typing in", async () => {
	// with a Markdown pane open, a write goes through that pane's editor, which may hold words typed there and not
	// yet saved: the text the write returns then has a new design
	const v = open();
	const t = v.q("text").querySelector("textarea");
	t.focus();
	v.disk.text = prose("MARK-SIX")(v.disk.text);
	typeInto(t, "Typed on");
	await v.settled(800);   // past the typing pause: the answer is written while the field still has focus
	assert.equal(v.answers().thoughts, "Typed on");
	assert.ok(t.isConnected && w.document.activeElement === t, "the view's own write drew the field again under the reader");
	t.blur();
	await v.settled();
	assert.ok(v.view.contentEl.textContent.includes("MARK-SIX"), "after the reader left the field, the view shows the new design");
	v.close();
});

test("a press that begins while the view waits to be drawn again lands on its button, then the view is drawn", async () => {
	const v = open();
	const t = v.q("text").querySelector("textarea");
	t.focus();
	typeInto(t, "Before the press");
	v.changed(prose("MARK-SEVEN"));
	const pear = [...v.q("choice").querySelectorAll("button.booklet-choice")].find((b) => b.textContent.includes("Pear"));
	// a pointer press moves focus out of the text field to the button before the click
	pear.dispatchEvent(new w.Event("pointerdown", { bubbles: true }));
	pear.focus();
	await sleep(40);
	assert.ok(pear.isConnected, "the button under the pointer was replaced before the press ended");
	w.document.dispatchEvent(new w.Event("pointerup", { bubbles: true }));
	pear.click();
	await v.settled(400);
	assert.equal(v.answers().fruit, 2, "the press was lost");
	assert.equal(v.answers().thoughts, "Before the press");
	assert.ok(!pear.isConnected && v.view.contentEl.textContent.includes("MARK-SEVEN"), "the view was not drawn again after the press");
	v.close();
});

test("with no field in use, a change to the design draws the view again at once", async () => {
	const v = open();
	const card = v.card();
	v.changed(prose("MARK-EIGHT"));
	assert.notEqual(v.card(), card);
	assert.ok(v.view.contentEl.textContent.includes("MARK-EIGHT"));
	v.close();
});

/* ---- Add your own adds its words when it is left (SPEC section 5, format 0.16) ---- */

/** A press on `target` that leaves `field`: the pointer goes down, the field loses focus, the pointer comes up, the click. */
function pressFrom(field, target) {
	target.dispatchEvent(new w.Event("pointerdown", { bubbles: true }));
	field.blur();
	w.document.dispatchEvent(new w.Event("pointerup", { bubbles: true }));
	target.click();
}
const ownOf = (v, kind) => v.q(kind).querySelector(".booklet-own-row input");
const optionOf = (v, kind, words) => [...v.q(kind).querySelectorAll(".booklet-choices > button")].find((b) => b.textContent.trim() === words);
/** The every-kind note with `open` on its choice, so that it takes an option of the reader's own. */
const OPEN_CHOICE = NOTE.replace("> [!choice|fruit] Which fruit", "> [!choice|fruit open] Which fruit");

test("Add your own: leaving the field adds the words typed, as Enter would; empty or white space adds nothing", async () => {
	const v = open();
	const own = ownOf(v, "multi");
	own.focus();
	typeInto(own, "Twine");
	assert.equal(v.answers().tools, undefined, "typing alone adds nothing");
	own.blur();
	await v.settled();
	assert.deepEqual(v.answers().tools, ["Twine"]);
	assert.equal(own.value, "");
	// white space, or nothing, left in the field writes nothing
	const before = v.disk.text;
	own.focus();
	typeInto(own, "   ");
	own.blur();
	own.focus();
	own.blur();
	await v.settled();
	assert.equal(v.disk.text, before);
	// words equal to a listed option, in another case: leaving the field presses it, as Enter does
	own.focus();
	typeInto(own, " scissors ");
	own.blur();
	await v.settled();
	assert.deepEqual(v.answers().tools, ["Twine", 3]);
	v.close();
});

test("Add your own on a choice: the words left in the field replace the pick", async () => {
	const v = open(OPEN_CHOICE);
	optionOf(v, "choice", "Apple").click();
	await v.settled();
	assert.equal(v.answers().fruit, 1);
	const own = ownOf(v, "choice");
	own.focus();
	typeInto(own, "Mango");
	own.blur();
	await v.settled();
	assert.equal(v.answers().fruit, "Mango");
	assert.equal(optionOf(v, "choice", "Apple").getAttribute("aria-pressed"), "false");
	// a listed option's words replace it with that option
	own.focus();
	typeInto(own, "PEAR");
	own.blur();
	await v.settled();
	assert.equal(v.answers().fruit, 2);
	v.close();
});

test("Add your own: a press that leaves the field lands after the words are added, as in booklet.html", async () => {
	const v = open(OPEN_CHOICE);
	// a multi: the words, then the press
	let own = ownOf(v, "multi");
	own.focus();
	typeInto(own, "Twine");
	pressFrom(own, optionOf(v, "multi", "Ruler"));
	await v.settled();
	assert.deepEqual(v.answers().tools, ["Twine", 2]);
	// a choice: the words replace the pick, then the press replaces them
	own = ownOf(v, "choice");
	own.focus();
	typeInto(own, "Mango");
	pressFrom(own, optionOf(v, "choice", "Plum"));
	await v.settled();
	assert.equal(v.answers().fruit, 3);
	// Add, after the field is left by its own press: the words are added once, and the reader is back in the field
	let writes = 0;
	const process = v.view.app.vault.process;
	v.view.app.vault.process = (file, fn) => {
		writes++;
		return process(file, fn);
	};
	own = ownOf(v, "multi");
	own.focus();
	typeInto(own, "Glue");
	pressFrom(own, v.q("multi").querySelector(".booklet-add"));
	await v.settled();
	assert.deepEqual(v.answers().tools, ["Twine", 2, "Glue"]);
	assert.equal(writes, 1);
	assert.equal(w.document.activeElement, own);
	v.close();
});

test("Add your own: left for the very option its words name, the words press it and the press confirms it (booklet.html holdIn)", async () => {
	const v = open(OPEN_CHOICE);
	// by the pointer, with the focus staying in the field until the press (as on a touch screen)
	let own = ownOf(v, "multi");
	own.focus();
	typeInto(own, "ruler");
	pressFrom(own, optionOf(v, "multi", "Ruler"));
	await v.settled();
	assert.deepEqual(v.answers().tools, [2], "pressed once, not pressed and then taken back");
	assert.equal(optionOf(v, "multi", "Ruler").getAttribute("aria-pressed"), "true");
	// the focus moving to the option first (as a mouse press does on the desktop), then its click
	own = ownOf(v, "choice");
	own.focus();
	typeInto(own, "plum");
	optionOf(v, "choice", "Plum").focus();
	optionOf(v, "choice", "Plum").click();
	await v.settled();
	assert.equal(v.answers().fruit, 3);
	// the next press on it is a press again
	optionOf(v, "multi", "Ruler").dispatchEvent(new w.Event("pointerdown", { bubbles: true }));
	optionOf(v, "multi", "Ruler").click();
	await v.settled();
	assert.equal(v.answers().tools, undefined);
	// an option picked already, named and then pressed: the words add nothing, and the press takes it out
	optionOf(v, "multi", "Pencil").click();
	await v.settled();
	own = ownOf(v, "multi");
	own.focus();
	typeInto(own, "Pencil");
	pressFrom(own, optionOf(v, "multi", "Pencil"));
	await v.settled();
	assert.equal(v.answers().tools, undefined);
	v.close();
});

test("Add your own: words typed and not added are added when the view lets go of the note, and only once", async () => {
	const v = open(OPEN_CHOICE);
	const own = ownOf(v, "multi");
	own.focus();
	typeInto(own, "Twine");
	const choice = ownOf(v, "choice");
	typeInto(choice, "Fig");
	await v.view.onUnloadFile(v.view.file);
	assert.deepEqual(v.answers().tools, ["Twine"]);
	assert.equal(v.answers().fruit, "Fig");
	assert.equal(own.value, "");
	const before = v.disk.text;
	own.blur();
	await v.settled();
	assert.equal(v.disk.text, before, "leaving the field afterwards adds nothing more");
	v.close();
});

test("Add your own: while the question's answer is of the wrong shape, leaving the field adds nothing and the words stay", async () => {
	const v = open();
	const own = ownOf(v, "multi");
	own.focus();
	typeInto(own, "Twine");
	v.changed(stored("tools", [{ made: "elsewhere" }]));
	await v.settled();
	const before = v.disk.text;
	own.blur();
	await v.settled();
	assert.equal(v.disk.text, before, "the answer of the wrong shape is kept as written");
	assert.equal(own.value, "Twine", "the words typed are not thrown away");
	v.close();
});
