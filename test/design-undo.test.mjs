/*
 * The Design view's own undo and redo (core/design-undo.ts): a step is the smallest replacement turned both ways, replayed only on the exact
 * text it left behind, and never forced. Plain text in and out, no view.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { core } from "./helpers.mjs";
import { ALL, BARE, FULL, crlf, lineOf } from "./design-fixtures.mjs";

const { DesignHistory, fingerprint, deleteBlock, moveBlock, insertPiece, parseDesign, walkDesign, positionBefore, PIECES } = core;

const node = (text, id) => walkDesign(parseDesign(text)).find((n) => n.id === id);

/** What a view does for one change: the op's text becomes the note, and the history hears of it. */
function step(h, before, after) {
	h.record(before, after);
	return after;
}

test("an undo gives back the exact bytes, and a redo the change again", () => {
	const h = new DesignHistory();
	const a = FULL;
	const d = deleteBlock(a, node(a, "bare"));
	assert.equal(d.ok, true);
	const b = step(h, a, d.text);
	assert.notEqual(a, b);
	const u = h.planUndo(b);
	assert.equal(u.ok, true);
	assert.equal(u.text, a, "the note as it was, byte for byte");
	assert.equal(core.applyChange(b, u.change), a, "and the replacement it hands the shell makes it");
	h.settleUndo();
	const r = h.planRedo(a);
	assert.equal(r.ok, true);
	assert.equal(r.text, b);
	h.settleRedo();
	assert.deepEqual(h.depth, { undo: 1, redo: 0 });
});

test("nothing moves until the shell says the write landed", () => {
	const h = new DesignHistory();
	const b = step(h, BARE, deleteBlock(BARE, node(BARE, "two")).text);
	h.planUndo(b);
	h.planUndo(b);
	assert.deepEqual(h.depth, { undo: 1, redo: 0 }, "planning an undo twice changes nothing");
	h.settleUndo();
	assert.deepEqual(h.depth, { undo: 0, redo: 1 });
});

test("a chain of changes undoes one at a time, in order, and redoes the same way", () => {
	const h = new DesignHistory();
	const t0 = BARE;
	const t1 = step(h, t0, insertPiece(t0, core.positionIn(parseDesign(t0)), PIECES.find((p) => p.file === "Structure - activity.md") ?? PIECES.find((p) => p.label === "activity")).text);
	const t2 = step(h, t1, deleteBlock(t1, node(t1, "one")).text);
	const two = node(t2, "two");
	const t3 = step(h, t2, moveBlock(t2, two, positionBefore(two)).text);
	assert.equal(t3, t2, "a move to the block's own place changes nothing, so it is not a step");
	assert.deepEqual(h.depth, { undo: 2, redo: 0 });
	let cur = t2;
	for (const want of [t1, t0]) {
		const u = h.planUndo(cur);
		assert.equal(u.ok, true);
		assert.equal(u.text, want);
		cur = u.text;
		h.settleUndo();
	}
	assert.equal(h.canUndo, false);
	for (const want of [t1, t2]) {
		const r = h.planRedo(cur);
		assert.equal(r.ok, true);
		assert.equal(r.text, want);
		cur = r.text;
		h.settleRedo();
	}
	assert.equal(h.canRedo, false);
});

test("a new change ends the redo line", () => {
	const h = new DesignHistory();
	const b = step(h, BARE, deleteBlock(BARE, node(BARE, "two")).text);
	const u = h.planUndo(b);
	h.settleUndo();
	assert.equal(h.canRedo, true);
	step(h, u.text, deleteBlock(u.text, node(u.text, "one")).text);
	assert.equal(h.canRedo, false);
});

test("nothing to undo or redo is said, and a note changed outside is refused, never forced", () => {
	const h = new DesignHistory();
	assert.deepEqual(h.planUndo(BARE), { ok: false, reason: "empty" });
	assert.deepEqual(h.planRedo(BARE), { ok: false, reason: "empty" });
	const b = step(h, BARE, deleteBlock(BARE, node(BARE, "two")).text);
	// a word typed in a Markdown pane since: the note is not what the step left
	const typed = b.replace("A made-up booklet", "A made-up booklet, edited");
	assert.deepEqual(h.planUndo(typed), { ok: false, reason: "changed" });
	assert.deepEqual(h.depth, { undo: 1, redo: 0 }, "a refusal keeps the history");
	// the note at the same length but other words is refused too
	assert.equal(h.planUndo(b.replace("One", "Won")).ok, false);
	// the same note brings it back
	assert.equal(h.planUndo(b).ok, true);
});

test("an edit outside the view between two steps cuts the older steps off, so an undo never lands on text it was not made for", () => {
	const h = new DesignHistory();
	const t1 = step(h, BARE, deleteBlock(BARE, node(BARE, "two")).text);
	const typed = t1 + "\nSomething typed elsewhere.\n";
	const t2 = step(h, typed, deleteBlock(typed, node(typed, "one")).text);
	assert.deepEqual(h.depth, { undo: 1, redo: 0 }, "only the step made on the changed note is kept");
	const u = h.planUndo(t2);
	assert.equal(u.ok, true);
	assert.equal(u.text, typed);
});

test("every byte is kept: a note with Windows line endings and one with no final newline come back as they were", () => {
	for (const [name, text] of [["crlf", crlf(FULL)], ["no final newline", ALL.NO_EOL], ["crlf, no final newline", crlf(ALL.NO_EOL)]]) {
		const h = new DesignHistory();
		const root = parseDesign(text);
		const target = walkDesign(root).find((n) => n.kind === "activity" && n.id && !n.implicit);
		const d = deleteBlock(text, target);
		assert.equal(d.ok, true, name);
		const b = step(h, text, d.text);
		const u = h.planUndo(b);
		assert.equal(u.text, text, `${name}: undo`);
		h.settleUndo();
		assert.equal(h.planRedo(text).text, b, `${name}: redo`);
	}
});

test("a step that changes nothing is not a step; clear forgets all; listeners hear changes", () => {
	const h = new DesignHistory();
	const heard = [];
	const stop = h.onChange(() => heard.push(h.depth.undo));
	h.record(BARE, BARE);
	assert.equal(h.canUndo, false);
	assert.deepEqual(heard, []);
	const b = step(h, BARE, deleteBlock(BARE, node(BARE, "two")).text);
	assert.deepEqual(heard, [1]);
	h.clear();
	assert.equal(h.canUndo, false);
	assert.deepEqual(heard, [1, 0]);
	h.clear();
	assert.deepEqual(heard, [1, 0], "clearing an empty history says nothing");
	stop();
	step(h, b, BARE);
	assert.deepEqual(heard, [1, 0]);
});

test("the fingerprint tells notes apart by length and by content", () => {
	assert.equal(fingerprint("abc"), fingerprint("abc"));
	assert.notEqual(fingerprint("abc"), fingerprint("abd"));
	assert.notEqual(fingerprint("abc"), fingerprint("abcd"));
	assert.notEqual(fingerprint(""), fingerprint("\n"));
	void lineOf;
});
