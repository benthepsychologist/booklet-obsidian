/*
 * The Design view's editor box applies every change the moment it is made (stage 2b): there is no draft, no Save, no Cancel and no
 * armed Esc. What these say is what the view does with the pieces Obsidian is stood in for, over jsdom: that a change is one write
 * and one step of Undo; that nothing typed is lost to a close, a switch, another block, Undo or a change of the note, and that text
 * which cannot be applied stays visible and is said in words; that a commit never runs twice for one change and a drawing never
 * runs inside another; that a drawing waits for a press that is under way; and that Undo and Redo never throw. How focus and a
 * real pointer behave is measured in the real app (the e2e checks), which this is not.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { window as w, click, words, typeInto, press } from "./dom.mjs";
import { core, ROOT } from "./helpers.mjs";
import { HELD } from "./editor-fixture.mjs";
import { FULL, lineOf } from "./design-fixtures.mjs";
import { openDesign, doc } from "./design-harness.mjs";

const { Setting } = await import("./obsidian-stub.mjs");
const { installViewSwitch, WorkspaceLeaf } = await import("./.build/view.mjs");
const { DESIGN_STRINGS, walkDesign, parseDesign } = core;

const en = (k) => DESIGN_STRINGS[k].en;
const later = (ms) => new Promise((r) => setTimeout(r, ms));
const changeOf = (el) => el.dispatchEvent(new w.Event("change", { bubbles: true }));

/** Opens a view on `text`, goes to a page and opens a block in place. */
function rig(text, page, kind, needle) {
	Setting.reset();
	const v = openDesign(text);
	v.go(page);
	v.select(kind, needle);
	return v;
}
/** Types into the Markdown and leaves it, and waits for the write. */
const typeArea = async (v, text) => {
	typeInto(v.area(), text);
	changeOf(v.area());
	await v.settle();
};
const spent = () => rig(FULL, "Spending", "question", "[!text|spent]");
const TYPED = "> [!text|spent] Spent so far?";

/* ======================================================================== one change, one write, one step ======================================================================== */

test("a change made in the box is one write and one step of Undo; a change that is no change writes and records nothing", async () => {
	const v = spent();
	const before = v.disk.text;
	typeInto(v.area(), TYPED);
	assert.equal(v.disk.writes, 0, "typing writes nothing: the change is applied when the box is left");
	changeOf(v.area());
	await v.settle();
	assert.equal(v.disk.writes, 1);
	assert.match(v.disk.text, /\[!text\|spent\] Spent so far\?/);
	assert.equal(v.undo().disabled, false);
	// the same words handed over again, and a text put back to what it was: nothing happens
	changeOf(v.area());
	await v.settle();
	assert.equal(v.disk.writes, 1, "a box left with nothing new in it writes nothing");
	await v.press(v.undo());
	assert.equal(v.disk.text, before, "one step of Undo is the whole change");
	assert.equal(v.undo().disabled, true, "and it was the only step");
	typeInto(v.area(), v.area().value);
	changeOf(v.area());
	await v.settle();
	assert.equal(v.disk.writes, 2, "no new write for text that is the note's own");
	assert.equal(v.undo().disabled, true, "and no step");
	v.close();
});

test("a change is never committed twice: a field left twice, and Enter with Ctrl straight after, are one write", async () => {
	const v = spent();
	typeInto(v.area(), TYPED);
	changeOf(v.area());
	changeOf(v.area());
	v.area().dispatchEvent(new w.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true, ctrlKey: true }));
	await v.settle();
	assert.equal(v.disk.writes, 1);
	assert.equal(v.editor(), null, "and the block closed");
	// the same through a form row: leave it, press Esc at once
	const w2 = rig(FULL, "Spending", "question", "[!text|spent]");
	const title = Setting.made.filter((s) => s.settingEl.isConnected && words(s.nameEl) === "long")[0];
	assert.ok(title);
	await title.components[0].change(true);
	press(w2.area(), "Escape");
	press(w2.area(), "Escape");
	await w2.settle();
	assert.equal(w2.disk.writes, 1);
	v.close();
	w2.close();
});

/* ======================================================================== flush: what is typed is never lost ======================================================================== */

test("typed text is applied before the page changes under it: another page, another block, Undo, a mode switch and the view closing each flush it", async () => {
	// another block
	let v = rig(FULL, "Doing", "question", "[!text|left]");
	typeInto(v.area(), "> [!text|left] Left typed?");
	click(v.block("question", "[!choice|did]"));
	await v.settle();
	assert.match(v.disk.text, /Left typed\?/);
	assert.equal(v.disk.writes, 1);
	v.close();
	// Undo: the typed text is applied first, so the step undone is the typing's own
	v = spent();
	const before = v.disk.text;
	typeInto(v.area(), TYPED);
	await v.view.stepBack("undo");
	assert.equal(v.disk.writes, 2, "applied, then undone");
	assert.equal(v.disk.text, before, "the step undone was the typed text's");
	assert.equal(v.status().startsWith("Undone"), true);
	v.close();
	// the pane closing
	v = spent();
	typeInto(v.area(), TYPED);
	assert.equal(v.view.hasPending(), true, "typing is pending");
	const done = v.view.onUnloadFile({ path: "Note.booklet.md" });
	await done;
	assert.match(v.disk.text, /Spent so far\?/);
	assert.equal(v.view.hasPending(), false);
	v.close();
	// the view unloading, with no one waiting
	v = spent();
	typeInto(v.area(), TYPED);
	v.view.unload();
	await later(30);
	assert.match(v.disk.text, /Spent so far\?/, "queued at unload, and written");
	v.view.containerEl.remove();
});

test("a switch to the Booklet or Markdown view waits for typed text to be applied", async () => {
	const v = spent();
	typeInto(v.area(), TYPED);
	const proto = WorkspaceLeaf.prototype;
	const orig = proto.setViewState;
	const seen = [];
	proto.setViewState = async function (state) {
		seen.push({ type: state.type, written: v.disk.text.includes("Spent so far?") });
	};
	const regs = [];
	installViewSwitch(
		{ app: { vault: { getFileByPath: (p) => ({ path: p, extension: "md" }) }, metadataCache: { getFileCache: () => ({ frontmatter: { booklet: "0.20" } }) } }, register: (f) => regs.push(f) },
		{ booklet: "booklet", design: "booklet-design" },
	);
	try {
		const leaf = new WorkspaceLeaf();
		leaf.view = v.view;
		await leaf.setViewState({ type: "markdown", state: { file: "Note.booklet.md" } });
		assert.deepEqual(seen, [{ type: "booklet", written: true }], "the typed text was in the note before the view was replaced");
	} finally {
		for (const f of regs) f();
		proto.setViewState = orig;
		v.close();
	}
});

test("the note changing under an open block (a Markdown pane typed in) applies what is typed to the note as it is now, when the block's own lines are as they were", async () => {
	const v = spent();
	typeInto(v.area(), TYPED);
	// a line elsewhere in the note changes: the block's own lines are as they were
	const elsewhere = v.disk.text.replace("Welcome to the booklet.", "Welcome to this booklet.");
	v.disk.text = elsewhere;
	v.view.setViewData(elsewhere, false);
	await v.settle();
	assert.match(v.disk.text, /Welcome to this booklet\./, "the other change is kept");
	assert.match(v.disk.text, /Spent so far\?/, "and so is the typed text");
	assert.equal(v.disk.writes, 1);
	v.close();
});

test("text that cannot be applied is never dropped: it stays in the box, says why in words, a first Esc keeps the block open and the next closes it", async () => {
	const v = spent();
	typeInto(v.area(), "> [!text|spent] Mine");
	const typed = v.disk.text.replace("What did you spend?", "What did you spend today?");
	v.disk.text = typed;
	v.view.setViewData(typed, false);
	await v.settle();
	assert.equal(v.area().value, "> [!text|spent] Mine");
	assert.match(words(v.el.querySelector(".booklet-design-editor-state")), /The note changed while you were typing here, so this was not applied/);
	assert.equal(v.disk.writes, 0);
	press(v.area(), "Escape");
	await v.settle();
	assert.ok(v.area(), "the first Esc says so and does not close");
	assert.equal(v.status(), en("editor.busy"));
	// another block is pressed: it says so and does not move the box
	click(v.block("prose", "What you spent."));
	await v.settle();
	assert.ok(v.area());
	assert.equal(v.area().value, "> [!text|spent] Mine");
	// typing in it again is the person's own settling of it: the box is applied the usual way
	press(v.area(), "Escape");
	await v.settle();
	assert.equal(v.area(), null, "the next Esc closes it");
	assert.equal(v.disk.text, typed, "and nothing was written over the note");
	v.close();
});

/* ======================================================================== the stash ======================================================================== */

test("the stash of the options a shared menu replaced is the open block's, documented in the box's source and kept only while the block is open", () => {
	const src = readFileSync(`${ROOT}/src/design-edit.ts`, "utf8");
	assert.match(src, /stash/);
	assert.match(src, /view-level state of the OPEN block/);
	assert.match(src, /It goes when the block is closed/, "the decision is written where the state is held");
});

/* ======================================================================== re-entrancy ======================================================================== */

test("a drawing never runs inside another, and a commit never runs inside a drawing: a burst of typing, closing and Undo draws one at a time", async () => {
	const v = spent();
	let depth = 0;
	let deepest = 0;
	let draws = 0;
	const paint = v.view.paint.bind(v.view);
	v.view.paint = function () {
		depth++;
		draws++;
		deepest = Math.max(deepest, depth);
		try {
			return paint();
		} finally {
			depth--;
		}
	};
	let writing = 0;
	const process = v.app.vault.process;
	v.app.vault.process = async (file, fn) => {
		assert.equal(depth, 0, "no write starts inside a drawing");
		writing++;
		assert.equal(writing, 1, "never two writes at once");
		try {
			return await process(file, fn);
		} finally {
			writing--;
		}
	};
	for (let i = 0; i < 3; i++) {
		typeInto(v.area(), `> [!text|spent] Round ${i}?`);
		changeOf(v.area());
	}
	void v.view.stepBack("undo");
	void v.view.stepBack("undo");
	press(v.area(), "Escape");
	await v.settle();
	await later(20);
	assert.equal(deepest, 1, "no drawing started inside another");
	assert.ok(draws >= 1);
	assert.equal(v.view.hasPending(), false);
	v.close();
});

test("a press on the box's own button is not undone by a drawing: while the pointer is down the drawing waits, and the button that is pressed is the one that is clicked", async () => {
	const v = rig(FULL, "Doing", "question", "[!choice|did]");
	const option = () => [...v.editor().querySelectorAll("input")].find((e) => e.getAttribute("aria-label") === "Option 1: words");
	const down = [...v.editor().querySelectorAll("button")].find((b) => b.getAttribute("aria-label") === "Option 2: move up");
	assert.ok(down);
	// the person types in a field and then presses a button: the pointer goes down before the field's change is heard
	typeInto(option(), "Yes indeed");
	down.dispatchEvent(new w.MouseEvent("mousedown", { bubbles: true, cancelable: true }));
	changeOf(option());
	await v.settle();
	assert.match(v.disk.text, /- \[ \] Yes indeed/, "the typed words were applied");
	assert.equal(down.isConnected, true, "the button under the pointer was not drawn again");
	// the click that follows reaches that very button
	const writes = v.disk.writes;
	click(down);
	down.dispatchEvent(new w.MouseEvent("mouseup", { bubbles: true, cancelable: true }));
	await v.settle();
	await later(10);
	assert.equal(v.disk.writes, writes + 1, "and does what it says: one move");
	const lines = v.disk.text.split("\n");
	const at = lineOf(v.disk.text, "[!choice|did]");
	assert.equal(lines[at + 1], "> - [ ] No", "the second option went up");
	v.close();
});

/* ======================================================================== Undo and Redo never throw ======================================================================== */

test("Undo and Redo with nothing to do say so in words and write nothing", async () => {
	const v = spent();
	await v.view.stepBack("undo");
	assert.equal(v.status(), en("status.nothingUndo"));
	await v.view.stepBack("redo");
	assert.equal(v.status(), en("status.nothingRedo"));
	assert.equal(v.disk.writes, 0);
	v.close();
});

test("a step that cannot be replayed (the note changed outside) is refused in words, stays on the stack, and is undone once the note is as the step left it", async () => {
	const v = spent();
	typeInto(v.area(), TYPED);
	changeOf(v.area());
	await v.settle();
	const after = v.disk.text;
	const outside = after.replace("Welcome to the booklet.", "Welcome to a booklet.");
	v.disk.text = outside;
	v.view.setViewData(outside, false);
	await v.press(v.undo());
	assert.equal(v.status(), en("status.undoChanged"));
	assert.equal(v.disk.text, outside, "nothing was undone over the outside change");
	// the step is still there: put the note back as the step left it and it can be undone
	v.disk.text = after;
	v.view.setViewData(after, false);
	await v.press(v.undo());
	assert.doesNotMatch(v.disk.text, /Spent so far\?/);
	v.close();
});

test("an error thrown while a step is made is a line in the status bar, not an exception, and the page is drawn from the note as it is", async () => {
	const v = spent();
	typeInto(v.area(), TYPED);
	changeOf(v.area());
	await v.settle();
	const commit = v.view.commit;
	v.view.commit = async () => {
		throw new Error("disk is full");
	};
	await assert.doesNotReject(v.view.stepBack("undo"));
	assert.match(v.status(), /Could not undo: .*disk is full/);
	v.view.commit = commit;
	assert.ok(v.page(), "the page is drawn");
	await v.press(v.undo());
	assert.doesNotMatch(v.disk.text, /Spent so far\?/, "and the step was still on the stack");
	v.close();
});

test("Undo with a question open does nothing to the note until the question is answered, and two presses are one", async () => {
	const v = openDesign(HELD);
	v.go("Mood");
	const target = walkDesign(parseDesign(HELD)).find((n) => n.id === "once");
	click(v.act(v.card("activity", "[!activity|once"), "delete"));
	await later(20);
	assert.ok(doc.querySelector(".booklet-design-ask"), "asked");
	const writes = v.disk.writes;
	void v.view.stepBack("undo");
	void v.view.stepBack("undo");
	assert.equal(v.disk.writes, writes, "nothing is written while the question is open");
	const no = [...doc.querySelectorAll(".booklet-design-ask button")].find((b) => words(b) === "Cancel");
	click(no);
	await v.settle();
	assert.equal(v.disk.text, HELD);
	assert.ok(target);
	v.close();
});

test("Undo after the view is closed does not throw and writes nothing", async () => {
	const v = spent();
	typeInto(v.area(), TYPED);
	changeOf(v.area());
	await v.settle();
	const writes = v.disk.writes;
	v.view.unload();
	await assert.doesNotReject(v.view.stepBack("undo"));
	assert.equal(v.disk.writes, writes);
});

/* ======================================================================== a press on a page that has moved on ======================================================================== */

test("a press on a block of the page as it was drawn finds that block after a change above it, even when the page was drawn again in between: the block pressed, not its neighbour", async () => {
	const v = rig(FULL, "Doing", "question", "[!choice|did]");
	const old = walkDesign(v.view.root).find((n) => n.kind === "question" && n.id === "left");
	assert.ok(old);
	const oldStart = old.start;
	// a line is added to the block open above it: every line below moves by one, and the page is drawn again from the note
	await typeArea(v, v.area().value + "\n> A new line.");
	assert.notEqual(v.view.root, undefined);
	const now = lineOf(v.disk.text, "[!text|left]");
	assert.equal(now, oldStart + 1, "the block moved down by one line");
	const live = v.view.live(old);
	assert.ok(live, "found");
	assert.equal(live.start, now);
	assert.equal(live.kind, "question");
	assert.equal(live.id, "left");
	// a second change above, and the page drawn again once more: still the same block
	await typeArea(v, v.area().value + "\n> And another.");
	const live2 = v.view.live(old);
	assert.equal(live2.start, lineOf(v.disk.text, "[!text|left]"));
	assert.equal(live2.id, "left");
	// pressing it, as a click that was made before the writes finished would, opens that block and no other
	click(v.block("question", "[!text|left]"));
	await v.settle();
	assert.equal(words(v.editor().querySelector(".booklet-design-edit-title")), "Editing: Question");
	assert.match(v.area().value, /^> \[!text\|left\]/);
	v.close();
});

/* ======================================================================== the words ======================================================================== */

test("the words of the draft model are gone from the table and from the sources, and every key the editor says has Spanish and French", () => {
	const dead = ["editor.save", "editor.save.title", "editor.cancel", "editor.cancel.title", "editor.unsaved", "editor.armed", "editor.discarded", "editor.stale", "edit.mark", "edit.hint"];
	const state = JSON.parse(readFileSync(`${ROOT}/.localize-state.json`, "utf8"));
	const kept = JSON.stringify(state);
	const src = ["design-edit.ts", "design-view.ts", "design-rows.ts"].map((f) => readFileSync(`${ROOT}/src/${f}`, "utf8")).join("\n");
	for (const k of dead) {
		assert.equal(Object.hasOwn(DESIGN_STRINGS, k), false, `${k} is gone from the table`);
		assert.equal(kept.includes(`"${k}"`), false, `${k} is gone from the localize record`);
		assert.equal(src.includes(`"${k}"`), false, `${k} is not asked for by the source`);
	}
	for (const k of ["edit.keys", "edit.changed", "edit.lost", "editor.busy", "editor.moved", "editor.elsewhere", "status.failedWhy", "status.undoFailed", "status.redoFailed"]) {
		const e = DESIGN_STRINGS[k];
		assert.ok(e && e.en && e.es && e.fr, `${k} has all three`);
		for (const slot of ["es", "fr"]) for (const name of e.en.match(/\{\w+\}/g) ?? []) assert.ok(e[slot].includes(name), `${k} ${slot} keeps ${name}`);
	}
	// nothing the person reads says Save, Cancel or Unsaved for the box any more
	for (const k of ["edit.keys", "editor.busy", "editor.moved", "editor.elsewhere", "edit.changed"]) assert.doesNotMatch(DESIGN_STRINGS[k].en, /\b(Save|Cancel|Unsaved|draft)\b/i, k);
});
