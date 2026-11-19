/*
 * The Design view's writes: insert a piece, delete a block, move a block, change a block's own lines. Each returns the new text and the
 * smallest replacement that makes it, and leaves every other byte alone: no line endings changed, no blank lines tidied, no final newline
 * added or taken away. A delete or a move says what it would leave not matching, with counts; it never asks.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { core, bookletAround } from "./helpers.mjs";
import { HELD } from "./editor-fixture.mjs";
import { ALL, BARE, FULL, IMPLICIT, NO_EOL, UNREAD, crlf, lineOf } from "./design-fixtures.mjs";

const { parseDesign, walkDesign, checkDesign, reassemble, insertPiece, deleteBlock, moveBlock, changeLines, blockLines, applyChange, readerRefuses } = core;
const {
	positionAfter,
	positionAtLine,
	positionAtStart,
	positionBefore,
	positionIn,
	positionLine,
	canPlacePiece,
	PIECES,
} = core;

const piece = (file) => PIECES.find((p) => p.file === file);
const CHOICE = piece("Q - choice.md");
const NOTE = piece("Reading - note.md");

/** A note read, with a way to find a node by its id. */
function note(text) {
	const root = parseDesign(text);
	const node = (id, kind) => {
		const n = walkDesign(root).find((x) => x.id === id && (!kind || x.kind === kind));
		assert.ok(n, `the note has ${id}`);
		return n;
	};
	return { root, text, node, first: (kind) => walkDesign(root).find((x) => x.kind === kind) };
}

/** What the change did, with the bytes either side of it checked against the note as it was. */
function outside(before, r) {
	assert.equal(r.ok, true, r.reason);
	if (r.change === null) return assert.equal(r.text, before);
	assert.equal(applyChange(before, r.change), r.text, "the change makes the new text");
	assert.equal(r.text.slice(0, r.change.from), before.slice(0, r.change.from), "every byte before the change is as it was");
	assert.equal(r.text.slice(r.text.length - (before.length - r.change.to)), before.slice(r.change.to), "every byte after it is as it was");
}

/** The non-blank lines of a note, without their `>` marks, in order. */
const words = (t) =>
	t
		.split("\n")
		.map((l) => l.replace(/\r$/, "").replace(/^(?:>[ \t]?)+/, ""))
		.filter((l) => l.trim());

const body = (t) => bookletAround(t);

// ---------------------------------------------------------------- insert

test("a piece goes in at a position, with a blank line either side, and its ids made", () => {
	const d = note(BARE);
	const r = insertPiece(BARE, positionAfter(d.node("a")), CHOICE);
	outside(BARE, r);
	assert.equal(
		r.text,
		body("> [!activity|one] One\n\n> [!text|a] A\n\n> [!choice|choice-1] Your question here\n- [ ] First option\n- [ ] Second option\n- [ ] Third option\n\n> [!activity|two repeat] Two\n\n> [!scale|s] How much?\n\n0. None\n1. Lots\n"),
	);
	assert.deepEqual(r.assigned, { "new-id": "choice-1" });
	assert.deepEqual(r.impact, []);
	assert.equal(r.readable, true);
	assert.deepEqual(r.lines, { start: 12, end: 16 });
	assert.equal(r.text.split("\n").slice(r.lines.start, r.lines.end)[0], "> [!choice|choice-1] Your question here");
});

test("a piece placed between lines that are not blank gets a blank line on that side", () => {
	const text = body("> [!activity|a] A\n> [!text|q] Q\n");
	const r = insertPiece(text, positionAtLine(parseDesign(text), 9), NOTE);
	outside(text, r);
	assert.equal(r.text, body("> [!activity|a] A\n\n> [!note] Title of the note\n> The words of the note.\n\n> [!text|q] Q\n"));
});

test("a piece at the very end keeps the note's blank lines and its final newline; with no final newline it adds none", () => {
	const three = BARE + "\n\n";
	const r = insertPiece(three, positionIn(parseDesign(three)), CHOICE);
	outside(three, r);
	assert.equal(r.change.from, three.length, "inserted after every blank line the note ended with");
	assert.ok(r.text.startsWith(three) && r.text.endsWith("- [ ] Third option\n"));
	const e = insertPiece(NO_EOL, positionIn(parseDesign(NO_EOL)), CHOICE);
	outside(NO_EOL, e);
	assert.ok(!e.text.endsWith("\n"), "no newline added at the end");
	assert.ok(e.text.startsWith(NO_EOL + "\n\n> [!choice|"));
});

test("every other byte of a note stays, every line ending and every blank line, wherever the piece goes", () => {
	for (const text of [FULL, crlf(FULL), HELD, NO_EOL]) {
		const root = parseDesign(text);
		const n = text.split("\n").length;
		for (let line = 0; line <= n; line++) {
			const pos = positionAtLine(root, line);
			for (const p of [CHOICE, NOTE]) {
				if (!canPlacePiece(pos, p).ok) continue;
				const r = insertPiece(text, pos, p);
				outside(text, r);
				assert.equal(checkDesign(parseDesign(r.text), r.text.split("\n").length), null);
				assert.equal(r.readable, true, `line ${line}`);
				const block = r.text.split("\n").slice(r.lines.start, r.lines.end);
				const rest = r.text.split("\n").slice(0, r.lines.start).concat(r.text.split("\n").slice(r.lines.end));
				assert.deepEqual(words(rest.join("\n")), words(text), "nothing was lost and nothing else was added");
				assert.ok(words(block.join("\n")).length >= 2);
			}
		}
	}
});

test("a piece in a group is written with the group's > marks, and a bare > line either side", () => {
	const text = body("> [!activity|a] A\n\n> [!group] G\n> words\n>\n> > [!text|g1] In group\n\n> [!text|q] Q\n");
	const d = note(text);
	const g = d.first("group");
	const end = insertPiece(text, positionIn(g), CHOICE);
	outside(text, end);
	assert.equal(end.text, body("> [!activity|a] A\n\n> [!group] G\n> words\n>\n> > [!text|g1] In group\n>\n> > [!choice|choice-1] Your question here\n> - [ ] First option\n> - [ ] Second option\n> - [ ] Third option\n\n> [!text|q] Q\n"));
	const start = insertPiece(text, positionAtStart(g), piece("Q - date.md"));
	outside(text, start);
	assert.equal(start.text, body("> [!activity|a] A\n\n> [!group] G\n> > [!date|date-1] Your question here\n>\n> words\n>\n> > [!text|g1] In group\n\n> [!text|q] Q\n"));
	assert.equal(reassemble(parseDesign(end.text), end.text), end.text);
	assert.equal(note(end.text).node("choice-1").depth, note(end.text).first("group").depth + 1);
});

test("a note with Windows line endings gets Windows line endings, and only in the new lines", () => {
	const text = crlf(BARE);
	const r = insertPiece(text, positionAfter(note(text).node("a")), CHOICE);
	outside(text, r);
	assert.ok(!/[^\r]\n/.test(r.text) && !/\r[^\n]/.test(r.text), "every line break is CR LF");
	assert.equal(r.text.replace(/\r\n/g, "\n"), insertPiece(BARE, positionAfter(note(BARE).node("a")), CHOICE).text);
});

test("ids for what is placed are fresh: the same piece twice, in a module that has the first", () => {
	const d = note(FULL);
	const one = insertPiece(FULL, positionIn(d.node("spending")), CHOICE);
	const two = insertPiece(one.text, positionIn(note(one.text).node("spending")), CHOICE);
	assert.deepEqual(one.assigned, { "new-id": "choice-1" });
	assert.deepEqual(two.assigned, { "new-id": "choice-2" });
	assert.equal(two.readable, true);
	const mod = insertPiece(FULL, positionBefore(d.node("money")), piece("Structure - module.md"));
	outside(FULL, mod);
	assert.equal(mod.assigned["new-module-id"], "module-1");
	assert.equal(mod.readable, true);
	const again = insertPiece(mod.text, positionIn(note(mod.text).root), piece("Structure - module.md"));
	assert.equal(again.assigned["new-module-id"], "module-2");
});

test("the front matter piece goes at the top of a note that has none, wherever the position is, and only then", () => {
	const text = "Some words.\n\n> [!text|q] Q\n";
	const r = insertPiece(text, positionIn(parseDesign(text)), piece("Structure - front matter.md"));
	outside(text, r);
	assert.ok(r.text.startsWith('---\nbooklet: "0.20"\nid: local/new-booklet\ntitle: Booklet title\nlang: en\nversion: "0.1"\n---\n\nSome words.'));
	const has = insertPiece(FULL, positionIn(parseDesign(FULL)), piece("Structure - front matter.md"));
	assert.equal(has.ok, false);
	assert.match(has.reason, /properties already/);
});

test("a piece that may not stand there is refused, with the reason, and nothing is written", () => {
	const d = note(FULL);
	const cases = [
		[positionIn(d.node("spending")), piece("Structure - module.md"), /top of the booklet/],
		[positionAtStart(d.node("money")), CHOICE, /not offered in a module's opening/],
		[positionAtStart(d.node("why")), piece("Structure - page.md"), /activity's opening/],
		[positionIn(d.first("group")), piece("Structure - tab.md"), /structure line/],
		[positionIn(d.first("row")), piece("Structure - row.md"), /does not nest/],
		[positionIn(d.first("group")), piece("Q - multi (from a menu).md"), /menu|group/],
		[positionAtLine(d.root, 0), NOTE, /front matter comes first/],
		[positionIn(d.first("data-section")), NOTE, /data section/],
	];
	for (const [pos, p, why] of cases) {
		const r = insertPiece(FULL, pos, p);
		assert.equal(r.ok, false, p.file);
		assert.match(r.reason, why, p.file);
		assert.equal(r.text, undefined);
		assert.equal(r.change, undefined);
	}
	const open = FULL.replace(/%%\n/g, "");
	assert.equal(insertPiece(open, positionIn(parseDesign(open)), NOTE).ok, false, "after a records section that runs to the end");
});

test("a position from another note's tree is refused", () => {
	const r = insertPiece(BARE + "\n", positionIn(parseDesign(BARE)), CHOICE);
	assert.equal(r.ok, false);
	assert.match(r.reason, /out of date/);
	assert.equal(deleteBlock(BARE + "\n", note(BARE).node("a")).ok, false);
	assert.equal(moveBlock(BARE + "\n", note(BARE).node("a"), positionIn(parseDesign(BARE + "\n"))).ok, false);
	assert.equal(changeLines(BARE + "\n", note(BARE).node("a"), ["x"]).ok, false);
});

// ---------------------------------------------------------------- delete

test("a block goes with its own lines and the blank lines after it, and nothing else moves", () => {
	const d = note(BARE);
	const r = deleteBlock(BARE, d.node("a"));
	outside(BARE, r);
	assert.equal(r.text, body("> [!activity|one] One\n\n> [!activity|two repeat] Two\n\n> [!scale|s] How much?\n\n0. None\n1. Lots\n"));
	assert.deepEqual(r.impact, []);
	assert.equal(r.blind, false);
});

test("every block of a note can be deleted: its lines go and every other line stays, byte for byte", () => {
	for (const text of [FULL, crlf(FULL), HELD, NO_EOL, IMPLICIT]) {
		const raw = text.split("\n");
		let count = 0;
		for (const n of walkDesign(parseDesign(text))) {
			const r = deleteBlock(text, n);
			if (!r.ok) {
				assert.ok(n.kind === "booklet" || n.kind === "front-matter" || n.kind === "records" || n.implicit === true, `${n.kind} at ${n.start} is refused only for those reasons: ${r.reason}`);
				continue;
			}
			count++;
			outside(text, r);
			assert.equal(r.text, raw.slice(0, n.start).concat(raw.slice(n.end)).join("\n"));
			assert.equal(checkDesign(parseDesign(r.text), r.text.split("\n").length), null);
		}
		assert.ok(count >= 3, `${count} blocks deleted`);
	}
	assert.ok(Object.keys(FULL).length);
});

test("a module goes with its closing line; a group with its body; a tab with its pages", () => {
	const d = note(FULL);
	const mod = deleteBlock(FULL, d.node("money"));
	assert.ok(!mod.text.includes("[!module|money end]") && !mod.text.includes("End of Money") && !mod.text.includes("Words in the module's opening") && mod.text.includes("[!activity|bare]"));
	const tab = deleteBlock(FULL, d.node("read"));
	assert.ok(!tab.text.includes("The map") && !tab.text.includes("Choosing") && tab.text.includes("[!tab|do]"));
	const group = deleteBlock(FULL, d.first("group"));
	assert.ok(!group.text.includes("Step one") && !group.text.includes("Did you?") && group.text.includes("[!row]"));
	assert.equal(deleteBlock(FULL, d.node("spent")).text.includes("Think of today"), false, "a question goes with the hint under it");
});

test("the records section, the front matter, the booklet and a note's only activity are never deleted", () => {
	const d = note(FULL);
	assert.match(deleteBlock(FULL, d.first("records")).reason, /records section holds kept data/);
	assert.match(deleteBlock(FULL, d.first("front-matter")).reason, /front matter/);
	assert.match(deleteBlock(FULL, d.root).reason, /booklet itself/);
	const one = note(IMPLICIT);
	assert.match(deleteBlock(IMPLICIT, one.first("activity")).reason, /whole note/);
	// a block that holds the records section: design follows it, so the activity runs through it
	const wrapped = bookletAround("> [!activity|a] A\n\n%%\n> [!records] R\n%%\n\n> [!text|q] Q\n");
	const w = note(wrapped);
	assert.ok(w.node("a").children.some((c) => c.kind === "records"));
	assert.match(deleteBlock(wrapped, w.node("a")).reason, /records section holds kept data/);
	assert.equal(deleteBlock(wrapped, w.node("q")).ok, true);
});

test("deleting reports what it would leave not matching, with counts, and does not ask", () => {
	const d = note(HELD);
	const log = deleteBlock(HELD, d.node("log"));
	outside(HELD, log);
	assert.deepEqual(log.impact.map((i) => [i.kind, i.what, i.entries, i.answers, i.rows]), [["id", "The activity id `log`", 12, 1, 0]]);
	assert.equal(log.blind, false);
	const q = deleteBlock(HELD, d.node("feeling"));
	assert.deepEqual(q.impact.map((i) => [i.what, i.entries, i.answers]), [["The question id `feeling`", 12, 0]]);
	const mod = deleteBlock(HELD, d.node("mood"));
	assert.equal(mod.impact[0].what, "The module id `mood`");
	assert.ok(mod.impact[0].entries >= 12);
	const once = deleteBlock(HELD, d.node("once"));
	// the activity's own kept entries and drafts (none here), the answer kept once for `energy`, which goes with it, and what the data block loses
	assert.deepEqual(once.impact.map((i) => [i.what, i.entries, i.answers, i.rows]), [
		["The activity id `once`", 0, 1, 0],
		["The data block `things`", 0, 0, 5],
	]);
	// what holds nothing detaches nothing
	assert.deepEqual(deleteBlock(HELD, d.node("why")).impact.map((i) => i.what), ["The question id `why`"], "a question that was answered");
	assert.deepEqual(deleteBlock(HELD, d.first("query")).impact, []);
	assert.deepEqual(deleteBlock(HELD, d.node("things")).impact.map((i) => i.rows), [5], "a data block's rows are counted by the guard");
	assert.deepEqual(deleteBlock(FULL, note(FULL).node("did")).impact, []);
});

test("a note the reader cannot open is deleted from blind: there was nothing to count", () => {
	const unclosed = bookletAround("> [!module|m] M\n\n> [!activity|a] A\n\n> [!text|q] Q\n");
	assert.equal(readerRefuses(unclosed), true);
	const r = deleteBlock(unclosed, note(unclosed).node("q"));
	assert.equal(r.ok, true);
	assert.equal(r.blind, true);
	assert.deepEqual(r.impact, []);
	assert.equal(r.readable, false);
});

test("deleting a page or a module tab says what it leaves dangling", () => {
	const d = note(FULL);
	const page = deleteBlock(FULL, d.node("map"));
	assert.match(page.notes[0], /A page names a deleted page as its `parent:`/);
	const tab = deleteBlock(FULL, d.node("learn"));
	assert.match(tab.notes[0], /An activity joins this module tab with `tab:learn`/);
	assert.deepEqual(deleteBlock(FULL, d.node("spent")).notes, []);
});

test("a delete in a note with Windows line endings, and the last block of a note with no final newline", () => {
	const text = crlf(BARE);
	const r = deleteBlock(text, note(text).node("a"));
	outside(text, r);
	assert.equal(r.text, crlf(body("> [!activity|one] One\n\n> [!activity|two repeat] Two\n\n> [!scale|s] How much?\n\n0. None\n1. Lots\n")));
	const last = deleteBlock(NO_EOL, note(NO_EOL).node("two"));
	outside(NO_EOL, last);
	assert.equal(last.text, body("> [!activity|one] One\n\n> [!text|a] A\n"), "the lines are taken out and the rest is joined as it was");
});

// ---------------------------------------------------------------- move

const DOC = body("> [!activity|a1] A1\n\n> [!text|q1] Q1\n\n> [!text|q2] Q2\n\n> [!activity|a2] A2\n\n> [!text|q3] Q3\n");

test("a block moves within its container and across containers, with its lines exactly as they were", () => {
	const d = note(DOC);
	const down = moveBlock(DOC, d.node("q1"), positionAfter(d.node("q2")));
	outside(DOC, down);
	assert.equal(down.text, body("> [!activity|a1] A1\n\n> [!text|q2] Q2\n\n> [!text|q1] Q1\n\n> [!activity|a2] A2\n\n> [!text|q3] Q3\n"));
	const across = moveBlock(DOC, d.node("q2"), positionAtStart(d.node("a2")));
	outside(DOC, across);
	assert.equal(across.text, body("> [!activity|a1] A1\n\n> [!text|q1] Q1\n\n> [!activity|a2] A2\n\n> [!text|q2] Q2\n\n> [!text|q3] Q3\n"));
	const whole = moveBlock(DOC, d.node("a2"), positionBefore(d.node("a1")));
	outside(DOC, whole);
	assert.equal(whole.text, body("> [!activity|a2] A2\n\n> [!text|q3] Q3\n\n> [!activity|a1] A1\n\n> [!text|q1] Q1\n\n> [!text|q2] Q2\n"));
	assert.equal(down.readable && across.readable && whole.readable, true);
	assert.deepEqual(down.lines, { start: 12, end: 13 });
});

test("a move to where the block already is changes nothing", () => {
	const d = note(DOC);
	for (const pos of [positionBefore(d.node("q1")), positionAfter(d.node("q1")), positionAtLine(d.root, d.node("q1").start + 1)]) {
		const r = moveBlock(DOC, d.node("q1"), pos);
		assert.equal(r.ok, true);
		assert.equal(r.change, null);
		assert.equal(r.text, DOC);
	}
});

test("a block cannot move into itself, and cannot move where it may not stand", () => {
	const d = note(FULL);
	assert.match(moveBlock(FULL, d.node("why"), positionIn(d.node("do"))).reason, /into itself/);
	assert.match(moveBlock(FULL, d.node("spent"), positionAtStart(d.node("money"))).reason, /not offered in a module's opening/);
	assert.match(moveBlock(FULL, d.node("spending"), positionAtStart(d.node("do"))).reason, /not inside another activity/);
	assert.match(moveBlock(FULL, d.node("money"), positionAtStart(d.node("bare"))).reason, /top of the booklet/);
	assert.match(moveBlock(FULL, d.node("map"), positionIn(d.first("group"))).reason, /structure line/);
	assert.match(moveBlock(FULL, d.node("learn"), positionIn(d.node("why"))).reason, /module's tabs|activity's own/);
	assert.match(moveBlock(FULL, d.first("records"), positionBefore(d.node("money"))).reason, /records section/);
	assert.match(moveBlock(FULL, d.first("front-matter"), positionIn(d.root)).reason, /front matter/);
});

test("a move into a group is quoted for the group, and out of one is unquoted", () => {
	const text = body("> [!activity|a1] A1\n\n> [!group] G\n> words\n>\n> > [!text|g1] In group\n\n> [!text|q1] Q1\n");
	const d = note(text);
	const into = moveBlock(text, d.node("q1"), positionIn(d.first("group")));
	outside(text, into);
	assert.equal(into.text, body("> [!activity|a1] A1\n\n> [!group] G\n> words\n>\n> > [!text|g1] In group\n>\n> > [!text|q1] Q1\n"));
	const out = moveBlock(text, d.node("g1"), positionBefore(d.first("group")));
	outside(text, out);
	assert.equal(out.text, body("> [!activity|a1] A1\n\n> [!text|g1] In group\n\n> [!group] G\n> words\n>\n\n> [!text|q1] Q1\n"));
	assert.equal(into.readable && out.readable, true);
});

test("a move that would leave the reader unable to open the booklet is refused: an id used twice in a module", () => {
	const text = body("> [!module|m1] M1\n\n> [!activity|a] A\n\n> [!text|q] Q\n\n> [!module|m1 end]\n\n> [!module|m2] M2\n\n> [!activity|b] B\n\n> [!text|q] Q\n\n> [!module|m2 end]\n");
	assert.equal(readerRefuses(text), false, "the same id in two modules is fine");
	const d = parseDesign(text);
	const q1 = walkDesign(d).find((n) => n.id === "q" && n.start < 20);
	const b = walkDesign(d).find((n) => n.id === "b");
	const r = moveBlock(text, q1, positionIn(b));
	assert.equal(r.ok, false);
	assert.match(r.reason, /unable to open the booklet/);
	// a note the reader already refuses is not blocked by that
	const unclosed = body("> [!module|m] M\n\n> [!activity|a] A\n\n> [!text|q] Q\n\n> [!activity|b] B\n");
	const u = note(unclosed);
	assert.equal(moveBlock(unclosed, u.node("q"), positionIn(u.node("b"))).ok, true);
	assert.equal(moveBlock(unclosed, u.node("q"), positionIn(u.node("b"))).blind, true);
});

test("a move across activities reports the kept entries it would detach", () => {
	const d = note(HELD);
	const r = moveBlock(HELD, d.node("why"), positionIn(d.node("once")));
	outside(HELD, r);
	assert.deepEqual(r.impact.map((i) => [i.what, i.entries]), [["The question id `why`", 12]]);
	const same = moveBlock(HELD, d.node("feeling"), positionAfter(d.node("why")));
	assert.deepEqual(same.impact, [], "within its own activity nothing is detached");
	const mod = moveBlock(HELD, d.first("query"), positionAfter(d.node("things")));
	assert.deepEqual(mod.impact, []);
});

test("every block moved to every place it may stand: every line kept, only the order and the blank lines differ", () => {
	for (const text of [FULL, crlf(FULL)]) {
		const root = parseDesign(text);
		const n = text.split("\n").length;
		const places = [];
		const seen = new Set();
		for (let line = 0; line <= n; line++) {
			const p = positionAtLine(root, line);
			const k = `${p.parent.kind}${p.parent.start}@${p.index}`;
			if (!seen.has(k)) {
				seen.add(k);
				places.push(p);
			}
		}
		let moved = 0;
		let refused = 0;
		for (const node of walkDesign(root)) {
			for (const pos of places) {
				const r = moveBlock(text, node, pos);
				if (!r.ok) {
					refused++;
					assert.equal(typeof r.reason, "string");
					continue;
				}
				if (r.change === null) continue;
				moved++;
				outside(text, r);
				assert.deepEqual(words(r.text).sort(), words(text).sort(), `${node.kind} at ${node.start} to ${pos.parent.kind}@${pos.index}: every line kept`);
				assert.equal(checkDesign(parseDesign(r.text), r.text.split("\n").length), null);
				assert.equal(r.readable, true);
				assert.equal(words(r.text.split("\n").slice(r.lines.start, r.lines.end).join("\n"))[0], words(text.split("\n").slice(node.start, node.end).join("\n"))[0], "the block is where `lines` says");
			}
		}
		assert.ok(moved > 100 && refused > 100, `${moved} moves made, ${refused} refused`);
	}
});

test("a module moves above another; a data section moves with its blocks", () => {
	const text = body("> [!module|m1] M1\n\n> [!activity|a] A\n\n> [!module|m1 end]\n\n> [!module|m2] M2\n\n> [!activity|b] B\n\n> [!module|m2 end]\n");
	const d = note(text);
	const r = moveBlock(text, d.node("m2"), positionBefore(d.node("m1")));
	outside(text, r);
	assert.equal(r.text, body("> [!module|m2] M2\n\n> [!activity|b] B\n\n> [!module|m2 end]\n\n> [!module|m1] M1\n\n> [!activity|a] A\n\n> [!module|m1 end]\n"));
	assert.equal(r.readable, true);
	const f = note(FULL);
	const data = moveBlock(FULL, f.first("data-section"), positionBefore(f.node("bare")));
	outside(FULL, data);
	assert.ok(data.text.indexOf("Data for Money") < data.text.indexOf("A bare activity"));
	assert.equal(data.readable, true);
});

// ---------------------------------------------------------------- change

test("a block's own lines are what a small editor shows: without the blank lines after it or the group's marks", () => {
	const d = note(FULL);
	assert.deepEqual(blockLines(FULL, d.node("spent")), ["> [!text|spent] What did you spend?", "", "> [!hint]- Think of today", "> Start with the biggest."]);
	assert.deepEqual(blockLines(FULL, d.node("did")), ["> [!choice|did] Did you?", "- [ ] Yes", "- [ ] No"], "a question inside a group, unquoted");
	assert.deepEqual(blockLines(FULL, d.node("spending")), ["> [!activity|spending tab:now repeat] Spending", "> half an hour"], "a container: its own opening lines, not what it holds");
	assert.deepEqual(blockLines(FULL, d.node("money")), ["> [!module|money] Money"]);
	assert.deepEqual(blockLines(FULL, d.first("group")), ["> [!group] Step one"]);
});

test("changing a block's lines replaces those lines and nothing else: the blank lines after it stay", () => {
	const text = body("> [!activity|a] A\n\n> [!text|q] Q\n\n\n\n> [!text|r] R\n");
	const d = note(text);
	const r = changeLines(text, d.node("q"), ["> [!text|q long] A longer question", "Some help."]);
	outside(text, r);
	assert.equal(r.text, body("> [!activity|a] A\n\n> [!text|q long] A longer question\nSome help.\n\n\n\n> [!text|r] R\n"));
	assert.deepEqual(r.lines, { start: 10, end: 12 });
	assert.equal(r.readable, true);
	const head = changeLines(text, d.node("a"), ["> [!activity|a repeat] A", "> a status line"]);
	assert.equal(head.text, body("> [!activity|a repeat] A\n> a status line\n\n> [!text|q] Q\n\n\n\n> [!text|r] R\n"));
});

test("changing the lines of a block in a group writes the group's marks; in a note with Windows line endings, its line endings", () => {
	const text = body("> [!activity|a] A\n\n> [!group] G\n> words\n>\n> > [!text|g1] In group\n");
	const g1 = note(text).node("g1");
	const r = changeLines(text, g1, ["> [!text|g1 long] Changed", "hello"]);
	outside(text, r);
	assert.equal(r.text, body("> [!activity|a] A\n\n> [!group] G\n> words\n>\n> > [!text|g1 long] Changed\n> hello\n"));
	const w = crlf(text);
	const c = changeLines(w, note(w).node("g1"), ["> [!text|g1] Other"]);
	outside(w, c);
	assert.ok(!/[^\r]\n/.test(c.text));
	assert.equal(c.text.replace(/\r\n/g, "\n"), body("> [!activity|a] A\n\n> [!group] G\n> words\n>\n> > [!text|g1] Other\n"));
});

test("changing a block's own lines to what they already are changes nothing, for every block of every fixture", () => {
	for (const [name, text] of Object.entries(ALL)) {
		for (const n of walkDesign(parseDesign(text))) {
			const r = changeLines(text, n, blockLines(text, n));
			if (!r.ok) {
				assert.ok(n.kind === "booklet" || n.kind === "records" || n.implicit === true, `${name}: ${n.kind} at ${n.start}: ${r.reason}`);
				continue;
			}
			assert.equal(r.change, null, `${name}: ${n.kind} at ${n.start}`);
			assert.equal(r.text, text);
		}
	}
});

test("renaming an id says what it would detach; an unrelated change says nothing", () => {
	const d = note(HELD);
	const r = changeLines(HELD, d.node("feeling"), ["> [!choice|mood-now] How do you feel?", "- [ ] Calm", "- [ ] Tense", "- [ ] Low"]);
	outside(HELD, r);
	assert.deepEqual(r.impact.map((i) => [i.what, i.entries]), [["The question id `feeling`", 12]]);
	assert.equal(r.blind, false);
	const t = changeLines(HELD, d.node("feeling"), ["> [!choice|feeling] How are you?", "- [ ] Calm", "- [ ] Tense", "- [ ] Low"]);
	assert.deepEqual(t.impact, []);
	const o = changeLines(HELD, d.node("feeling"), ["> [!choice|feeling] How do you feel?", "- [ ] Calm", "- [ ] Low"]);
	assert.ok(o.impact.some((i) => i.kind === "option"), "an option taken out");
});

test("a change that leaves the reader unable to open the note is made but says so", () => {
	const d = note(FULL);
	const r = changeLines(FULL, d.node("money"), ["> [!module|other] Money"]);
	assert.equal(r.ok, true);
	assert.equal(r.readable, false);
	assert.equal(r.blind, false);
});

test("the records section, the booklet and a note's only activity have no lines of their own to change; no lines is a delete", () => {
	const d = note(FULL);
	assert.match(changeLines(FULL, d.first("records"), ["x"]).reason, /never writes it/);
	assert.match(changeLines(FULL, d.root, ["x"]).reason, /no lines of its own/);
	assert.match(changeLines(FULL, d.node("spent"), []).reason, /delete it instead/);
	assert.match(changeLines(IMPLICIT, note(IMPLICIT).first("activity"), ["x"]).reason, /whole note/);
	// the front matter is lines like any other
	const fm = changeLines(FULL, d.first("front-matter"), blockLines(FULL, d.first("front-matter")).map((l) => l.replace("title: A made-up booklet", "title: Another")));
	assert.ok(fm.text.includes("title: Another"));
	outside(FULL, fm);
});

test("text the view cannot read can be changed and deleted like any block", () => {
	const d = note(UNREAD);
	const bad = d.root.children.find((n) => n.kind === "as-written");
	const r = changeLines(UNREAD, bad, ["> [!text|early] Now in a module"]);
	outside(UNREAD, r);
	assert.ok(r.text.includes("Now in a module"));
	assert.equal(deleteBlock(UNREAD, bad).ok, true);
});

test("an operation never touches a note's bytes outside what it says it changed, for any fixture", () => {
	for (const [name, text] of Object.entries(ALL)) {
		const root = parseDesign(text);
		for (const n of walkDesign(root)) {
			const del = deleteBlock(text, n);
			if (del.ok) outside(text, del);
		}
		assert.equal(reassemble(root, text), text, name);
	}
});

test("the lines of a block in the middle of the note sit where lines says, for insert, move and change alike", () => {
	const d = note(BARE);
	const ins = insertPiece(BARE, positionAfter(d.node("a")), NOTE);
	assert.equal(ins.text.split("\n")[ins.lines.start], "> [!note] Title of the note");
	assert.equal(positionLine(positionAfter(d.node("a"))), 12);
});

test("the lines of every fixture are unchanged by an insert and a delete of the same block", () => {
	const d = note(BARE);
	const ins = insertPiece(BARE, positionAfter(d.node("a")), NOTE);
	const after = note(ins.text);
	const added = walkDesign(after.root).find((n) => n.kind === "callout");
	const back = deleteBlock(ins.text, added);
	assert.equal(back.text, BARE, "the note is back as it was, byte for byte");
	assert.equal(lineOf(BARE, "Two"), lineOf(back.text, "Two"));
});

test("a container moved to the end of an empty container takes everything in it along", () => {
	// the first version cut a moved tab down to its own line when it landed in an empty tab: the prose under it was dropped
	const d = note(FULL);
	const r = moveBlock(FULL, d.node("now"), { parent: d.node("learn"), index: 0 });
	outside(FULL, r);
	assert.ok(r.text.includes("Shown above this month's activities."));
	assert.deepEqual(words(r.text).sort(), words(FULL).sort());
});

test("a module's tab stays a module's tab on a move, and an activity's tab an activity's", () => {
	const d = note(FULL);
	assert.match(moveBlock(FULL, d.node("learn"), positionIn(d.node("why"))).reason, /activity's own|first activity/);
	assert.match(moveBlock(FULL, d.node("do"), positionAtStart(d.node("money"))).reason, /module's tab|activity's tabs go/);
	assert.equal(moveBlock(FULL, d.node("learn"), positionBefore(d.node("now"))).ok, true);
});
