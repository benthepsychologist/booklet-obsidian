/*
 * A piece dragged from the panel onto the editor (desktop): what the drop handler does with an editor and a drag event. The editor is
 * a fake that holds a text and a cursor and answers `cm.posAtCoords` as CodeMirror's view does; the real CodeMirror 6 view, in Obsidian
 * 1.14.5 and 1.11.7, is driven by e2e-tests/editor-checks.js.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { core, lint, pythonAvailable } from "./helpers.mjs";

const { PIECES, FORMAT_VERSION } = core;
const { dropPiece, allowDrop, carries, lineUnder, PIECE_MIME } = await import("./.build/view.mjs");
const { Notice } = await import("./obsidian-stub.mjs");

const FRONT = `---\nbooklet: "${FORMAT_VERSION}"\nid: local/made-up\ntitle: T\nlang: en\nversion: "0.1"\n---\n\n`;
const NOTE = FRONT + "> [!module|module-1] M\n\nFirst words.\n\n> [!activity|activity-1] An activity\n\nSome words.\n\n> [!text|text-1] First question\n\n> [!module|module-1 end]\n";
const piece = (file) => PIECES.find((p) => p.file === file);

/** An editor over a text: the line a pointer is over is given by `y` (a line's number times 10). */
function fakeEditor(text, { cm = true } = {}) {
	const e = {
		text,
		cursor: { line: 0, ch: 0 },
		selection: null,
		focused: false,
		getValue: () => e.text,
		getCursor: () => e.cursor,
		offsetToPos(off) {
			const before = e.text.slice(0, off).split("\n");
			return { line: before.length - 1, ch: before[before.length - 1].length };
		},
		replaceRange(insert, from) {
			const lines = e.text.split("\n");
			let off = 0;
			for (let k = 0; k < from.line; k++) off += lines[k].length + 1;
			off += from.ch;
			e.text = e.text.slice(0, off) + insert + e.text.slice(off);
		},
		setSelection(anchor, head) { e.selection = { anchor, head }; },
		scrollIntoView() {},
		focus() { e.focused = true; },
	};
	if (cm) e.cm = { posAtCoords: ({ y }) => text.split("\n").slice(0, Math.floor(y / 10)).join("\n").length + (y >= 10 ? 1 : 0) };
	return e;
}
const drag = (types, data = {}, y = 0) => {
	const e = {
		dataTransfer: { types, getData: (t) => data[t] ?? "", dropEffect: "none" },
		clientX: 5,
		clientY: y,
		defaultPrevented: false,
		preventDefault() { e.defaultPrevented = true; },
	};
	return e;
};
const lineOf = (text, needle) => text.split("\n").findIndex((l) => l.includes(needle));

test("a drag that carries a piece is told it may be dropped; any other drag is left alone", () => {
	const mine = drag([PIECE_MIME]);
	assert.equal(carries(mine), true);
	allowDrop(mine);
	assert.equal(mine.defaultPrevented, true);
	assert.equal(mine.dataTransfer.dropEffect, "copy");
	const other = drag(["text/plain", "Files"]);
	assert.equal(carries(other), false);
	allowDrop(other);
	assert.equal(other.defaultPrevented, false);
});

test("the line under the pointer is asked of the editor's view; without one, the cursor's line is used", () => {
	const ed = fakeEditor(NOTE);
	ed.cursor = { line: 4, ch: 0 };
	assert.equal(lineUnder(ed, drag([], {}, lineOf(NOTE, "First words.") * 10)), lineOf(NOTE, "First words."));
	const bare = fakeEditor(NOTE, { cm: false });
	bare.cursor = { line: 4, ch: 0 };
	assert.equal(lineUnder(bare, drag([], {}, 0)), 4);
});

test("a drop places the piece after the block under the pointer, with a fresh id, and selects its title", () => {
	const ed = fakeEditor(NOTE);
	const e = drag([PIECE_MIME], { [PIECE_MIME]: "Q - choice.md" }, lineOf(NOTE, "Some words.") * 10);
	dropPiece(e, ed);
	assert.equal(e.defaultPrevented, true, "the event is said to be handled");
	const at = lineOf(ed.text, "[!choice|choice-1]");
	assert.ok(at > lineOf(ed.text, "Some words.") && at < lineOf(ed.text, "[!text|text-1]"), ed.text);
	assert.equal(ed.text.split("\n")[ed.selection.anchor.line].slice(ed.selection.anchor.ch, ed.selection.head.ch), "Your question here");
	assert.equal(ed.focused, true);
});

test("dropped on a Booklet line, the piece goes after what that line claims, never between them", () => {
	const note = FRONT + "> [!module|module-1] M\n\n> [!activity|activity-1] A\n\n> [!choice|choice-1] Pick one\n- [ ] A\n- [ ] B\n\n> [!module|module-1 end]\n";
	const ed = fakeEditor(note);
	dropPiece(drag([PIECE_MIME], { [PIECE_MIME]: "Q - text.md" }, lineOf(note, "- [ ] A") * 10), ed);
	const lines = ed.text.split("\n");
	assert.equal(lines[lineOf(ed.text, "- [ ] B") + 1], "");
	assert.ok(lineOf(ed.text, "[!text|text-1]") > lineOf(ed.text, "- [ ] B"), ed.text);
});

test("a drop that carries no piece of ours, or a piece that is not there, changes nothing", () => {
	const ed = fakeEditor(NOTE);
	const other = drag(["text/plain"], { "text/plain": "words" });
	dropPiece(other, ed);
	assert.equal(other.defaultPrevented, false, "another plugin's or Obsidian's own drop is not ours to handle");
	dropPiece(drag([PIECE_MIME], { [PIECE_MIME]: "Nothing - like this.md" }), ed);
	assert.equal(ed.text, NOTE);
	const done = drag([PIECE_MIME], { [PIECE_MIME]: "Q - text.md" });
	done.defaultPrevented = true;
	dropPiece(done, ed);
	assert.equal(ed.text, NOTE, "a drop already handled is left alone");
});

test("a drop on a note that is not a booklet places nothing and says so; the front matter piece may go in an empty note", () => {
	Notice.said.length = 0;
	const plain = fakeEditor("# Plain\n\nWords.\n");
	dropPiece(drag([PIECE_MIME], { [PIECE_MIME]: "Q - text.md" }), plain);
	assert.equal(plain.text, "# Plain\n\nWords.\n");
	assert.match(Notice.said.join("|"), /Blocks go into a booklet note/);
	const empty = fakeEditor("");
	dropPiece(drag([PIECE_MIME], { [PIECE_MIME]: "Structure - front matter.md" }), empty);
	assert.match(empty.text, /^---\nbooklet: "0\.20"/);
	const withProps = fakeEditor("---\ntags: a\n---\n\nWords.\n");
	dropPiece(drag([PIECE_MIME], { [PIECE_MIME]: "Structure - front matter.md" }), withProps);
	assert.equal(withProps.text, "---\ntags: a\n---\n\nWords.\n", "a note that has properties already is not given a second block");
});

test("every piece the panel offers can be dropped and lints clean", { skip: pythonAvailable() ? false : "the linter or python3 is not here" }, () => {
	const before = lint(NOTE);
	// the pieces that have a place of their own (a module, a data section, the notice, the theme, front matter) are placed in theirs by test/editor-pieces.test.mjs
	const own = new Set(["Structure - front matter.md", "Structure - module.md", "Structure - data section.md", "Structure - data section (module).md", "Structure - notice.md", "Structure - theme.md"]);
	for (const p of PIECES) {
		if (own.has(p.file)) continue;
		const ed = fakeEditor(NOTE);
		dropPiece(drag([PIECE_MIME], { [PIECE_MIME]: p.file }, lineOf(NOTE, "Some words.") * 10), ed);
		assert.notEqual(ed.text, NOTE, p.file);
		const after = lint(ed.text);
		const fresh = (k) => after.out.split("\n").filter((l) => l.startsWith(k)).length - before.out.split("\n").filter((l) => l.startsWith(k)).length;
		assert.ok(fresh("ERROR") <= 0, `${p.file}:\n${ed.text}\n${after.out}`);
	}
});
