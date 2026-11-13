/*
 * What the cold review of the first editing panel build found, each as a test that fails without its fix (the number is the item on the
 * fix list): the records section is never a place for a piece or a line to edit; a blank line inside a fence, a comment, or between a
 * fence and its `^id`, or between a question and its list, is part of that block; an id rename that would make a duplicate is refused;
 * the front matter piece goes at the top and only once; the panel is built from one reading of the note; a booklet the reader refuses
 * says so; and the note's own line endings and byte-order mark are kept.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { core, bookletAround } from "./helpers.mjs";
import { HELD } from "./editor-fixture.mjs";

const { planInsert, applyPlan, scan, PIECES, IN_RECORDS, HAS_FRONT, settingsAt, changeLine, renameId, setId, renameOption, removeOption, renameField, removeField, isBookletText, parseBooklet } = core;

const piece = (file) => PIECES.find((p) => p.file === file);
const TEXT = piece("Q - text.md");
const NOTE = piece("Reading - note.md");
const put = (doc, line, p = NOTE) => {
	const plan = planInsert(doc, { line, ch: 0 }, p.text);
	return { plan, text: applyPlan(doc, plan) };
};
const swap = (text, from, to) => {
	assert.ok(text.includes(from), `the fixture has ${JSON.stringify(from)}`);
	return text.replace(from, to);
};
const lineOf = (text, needle) => text.split("\n").findIndex((l) => l.includes(needle));
const REGION = scan(HELD).regions[0];
const recordsOf = (text) => text.slice(text.indexOf("\n%%\n> [!records]"));

// ---------------------------------------------------------------- 1. the records section

test("[1] a piece is never placed in the records section: every line of it refuses, and the note stays as it was", () => {
	assert.ok(REGION && REGION.start === 40 && REGION.end === 69, "the fixture's records section is lines 41 to 70");
	for (const p of [TEXT, NOTE, piece("Q - choice.md")]) {
		for (let line = REGION.start; line <= REGION.end; line++) {
			const { plan, text } = put(HELD, line, p);
			assert.equal(plan.refused, IN_RECORDS, `${p.file} at line ${line + 1}`);
			assert.equal(text, HELD);
		}
	}
	assert.match(IN_RECORDS, /records section holds kept data, so blocks can't go there\. Put the cursor above it\./);
});

test("[1] a piece placed above the records section stops at its first line, and the section is not touched", () => {
	const tight = swap(HELD, "> [!module|mood end]\n\n%%", "> [!module|mood end]\n\nTail words.\n%%");
	const at = lineOf(tight, "Tail words.");
	const { plan, text } = put(tight, at);
	assert.equal(plan.refused, undefined);
	assert.ok(lineOf(text, "[!note]") < lineOf(text, "[!records]"), "the piece is above the records section");
	assert.equal(recordsOf(text), recordsOf(tight), "the records section is byte for byte as it was");
	assert.equal(text.split("\n")[lineOf(text, "[!records]") - 1], "%%");
	assert.equal(text.split("\n")[lineOf(text, "[!records]") - 2], "", "a blank line between the piece and the section");
});

test("[1] the line above the records section places as it always did", () => {
	const { plan, text } = put(HELD, 39); // the blank line before `%%`
	assert.equal(plan.refused, undefined);
	assert.equal(recordsOf(text), recordsOf(HELD));
});

// ---------------------------------------------------------------- 2 and 3. a line something holds has no settings

test("[2] a Booklet line in the records section offers no settings, and is not changed", () => {
	for (const line of [40, 41, 43]) {
		const v = settingsAt(HELD, line);
		assert.equal(v.model, null, `line ${line + 1} has no settings`);
		assert.equal(v.held, "records");
		assert.match(v.why, /records section\. That section is kept data, and the panel doesn't change it\./);
		const r = changeLine(HELD, line, (p) => setId(p, "renamed"));
		assert.match(r.error, /kept data/);
	}
	assert.match(renameId(HELD, 43, "renamed").error, /kept data/);
	// the same line text outside the records section has settings
	assert.equal(settingsAt(HELD, 12).model.id, "feeling");
});

test("[3] a Booklet-looking line inside a code fence, or a `%%` comment, has no settings", () => {
	const doc = bookletAround("> [!module|m] M\n\n> [!activity|a] A\n\n```md\n> [!choice|example] Example?\n- [ ] One\n```\n\n%%\nfirst paragraph\n\n> [!text|hidden] Hidden\n%%\n\n> [!module|m end]\n");
	const fenced = settingsAt(doc, lineOf(doc, "[!choice|example]"));
	assert.equal(fenced.model, null);
	assert.equal(fenced.held, "fence");
	assert.match(fenced.why, /inside a code block/);
	assert.equal(settingsAt(doc, lineOf(doc, "[!text|hidden]")).held, "comment");
	assert.ok(changeLine(doc, lineOf(doc, "[!choice|example]"), (p) => setId(p, "x")).error);
	assert.equal(settingsAt(doc, lineOf(doc, "[!activity|a]")).model.id, "a");
});

// ---------------------------------------------------------------- 3. blank lines inside a block

const LINES = (doc) => doc.split("\n");

test("[3] a blank line inside a code fence takes the piece after the fence, not into it", () => {
	const doc = bookletAround("> [!module|m] M\n\n> [!activity|a] A\n\nBefore.\n\n```js\nlet a = 1;\n\nlet b = 2;\n```\n\nAfter.\n\n> [!module|m end]\n");
	const blank = lineOf(doc, "let a = 1;") + 1;
	assert.equal(LINES(doc)[blank], "");
	const { text } = put(doc, blank);
	assert.ok(text.includes("```js\nlet a = 1;\n\nlet b = 2;\n```\n\n> [!note]"), text);
});

test("[3] a blank line inside a `booklet data` block takes the piece after the block and its id", () => {
	const doc = swap(HELD, '{ "fields"', "\n{ \"fields\"");
	const inside = lineOf(doc, "```booklet data") + 1;
	assert.equal(LINES(doc)[inside], "");
	const { text } = put(doc, inside);
	const fenceStart = lineOf(text, "```booklet data");
	assert.equal(LINES(text)[lineOf(text, "^things") + 2], "> [!note] Title of the note", "the piece follows the `^things` line");
	assert.ok(lineOf(text, "^things") > fenceStart);
	assert.equal(parseBooklet(text).data.length, 1, "the data block still reads");
});

test("[3] a blank line inside a multi-paragraph `%%` comment takes the piece after the comment", () => {
	const doc = bookletAround("> [!module|m] M\n\n> [!activity|a] A\n\n%%\nfirst paragraph\n\nsecond paragraph\n%%\n\nAfter.\n\n> [!module|m end]\n");
	const blank = lineOf(doc, "first paragraph") + 1;
	const { text } = put(doc, blank);
	assert.ok(text.includes("%%\nfirst paragraph\n\nsecond paragraph\n%%\n\n> [!note]"), text);
});

test("[3] a blank line between a fence and its `^id` keeps them together", () => {
	const doc = bookletAround("> [!module|m] M\n\n> [!activity|a] A\n\n```booklet data\n{ \"fields\": {\"t\": \"T\"}, \"rows\": [] }\n```\n\n^d\n\nAfter.\n\n> [!module|m end]\n");
	const gap = lineOf(doc, "```\n") === -1 ? lineOf(doc, "^d") - 1 : lineOf(doc, "^d") - 1;
	assert.equal(LINES(doc)[gap], "");
	const { text } = put(doc, gap);
	assert.ok(text.includes("```\n\n^d\n\n> [!note]"), text);
});

// ---------------------------------------------------------------- 4. a question and its list

test("[4] the blank line between a question and its list belongs to the question: the piece goes after the list", () => {
	const blank = lineOf(HELD, "> [!scale|energy]") + 1;
	assert.equal(LINES(HELD)[blank], "");
	const { text } = put(HELD, blank);
	const want = "> [!scale|energy] How much energy?\n\n0. None\n1. Some\n2. Lots\n\n> [!note] Title of the note";
	assert.ok(text.includes(want), text);
	const scale = parseBooklet(text).activities.flatMap((a) => core.questionsOf(a)).find((q) => q.id === "energy");
	assert.equal(scale.anchors.length, 3, "the scale keeps its three anchors");
});

test("[4] a blank line after a block, or between two blocks, still takes the piece there", () => {
	const { text } = put(HELD, lineOf(HELD, "> [!text|why]") + 1);
	assert.equal(LINES(text)[lineOf(text, "> [!text|why]") + 1], "");
	assert.equal(LINES(text)[lineOf(text, "> [!text|why]") + 2], "> [!note] Title of the note");
});

// ---------------------------------------------------------------- 5. a rename that would make a duplicate

test("[5] renaming an id to one already used in the same scope is refused, and says why", () => {
	const why = lineOf(HELD, "> [!text|why]");
	const r = renameId(HELD, why, "feeling");
	assert.equal(r.error, "`feeling` is already used in the module \"mood\".");
	assert.equal(renameId(HELD, lineOf(HELD, "[!activity|once]"), "log").error, "`log` is already used in the module \"mood\".");
	assert.equal(parseBooklet(renameId(HELD, why, "reason").text).ok, true, "an id nothing uses is written");
});

test("[5] the same id in another module is allowed, the same module id twice is not", () => {
	const doc = bookletAround("> [!module|a] A\n\n> [!activity|x] X\n\n> [!text|q1] One\n\n> [!module|a end]\n\n> [!module|b] B\n\n> [!activity|y] Y\n\n> [!text|q2] Two\n\n> [!module|b end]\n");
	assert.equal(parseBooklet(doc).ok, true);
	assert.equal(parseBooklet(renameId(doc, lineOf(doc, "[!text|q2]"), "q1").text).ok, true, "another module's question has its own ids");
	assert.equal(renameId(doc, lineOf(doc, "[!module|b]"), "a").error, "`a` is already used in this file.");
});

test("[5] a rename is refused only for the clash it would make: a booklet that already clashes can still be edited", () => {
	const clash = swap(HELD, "> [!text|why] Why?", "> [!text|feeling] Why?");
	assert.equal(parseBooklet(clash).ok, false);
	assert.equal(renameId(clash, lineOf(clash, "[!activity|once]"), "later").error, undefined);
	assert.ok(renameId(clash, lineOf(clash, "[!text|feeling]"), "why").text, "taking the clash away is allowed");
});

// ---------------------------------------------------------------- 6. the front matter piece

test("[6] the front matter piece goes at the very top, wherever the cursor is, and only into a note that has none", () => {
	const front = piece("Structure - front matter.md");
	const doc = "Hello\n\nWorld\n";
	for (const line of [0, 2]) {
		const { plan, text } = put(doc, line, front);
		assert.equal(plan.refused, undefined);
		assert.ok(text.startsWith("---\nbooklet: "), `cursor on line ${line + 1}: ${JSON.stringify(text)}`);
		assert.ok(text.endsWith("Hello\n\nWorld\n"));
		assert.equal(isBookletText(text), true);
	}
	const again = put(HELD, 12, front);
	assert.equal(again.plan.refused, HAS_FRONT);
	assert.equal(again.text, HELD);
	assert.match(HAS_FRONT, /properties already/);
});

test("[6] a cursor in the properties places a piece after them, never inside", () => {
	for (const line of [0, 1, 3, 6]) {
		const { text } = put(HELD, line);
		assert.ok(text.startsWith(HELD.split("\n").slice(0, 7).join("\n") + "\n"), `the properties are as they were (cursor on line ${line + 1})`);
		assert.equal(isBookletText(text), true);
	}
});

test("[6] with no blank line under the properties, a cursor in them still places the piece right after them", () => {
	const tight = swap(HELD, "---\n\n> [!module|mood] Mood", "---\n> [!module|mood] Mood");
	for (const line of [1, 4]) {
		const { text } = put(tight, line);
		const lines = text.split("\n");
		assert.deepEqual(lines.slice(0, 7), tight.split("\n").slice(0, 7), "the properties are as they were");
		assert.equal(lines[7], "");
		assert.equal(lines[8], "> [!note] Title of the note");
	}
});

// ---------------------------------------------------------------- 8. a booklet the reader refuses

test("[8] a booklet the reader refuses says so at the top, with the reader's reason, instead of 'detaches nothing'", () => {
	const refused = swap(HELD, "> [!module|mood end]\n", "");
	const book = parseBooklet(refused);
	assert.equal(book.ok, false);
	const line = core.holdingsLineOf(book);
	assert.match(line, /^The reader can't open this booklet yet: /);
	assert.ok(line.includes(book.refusal.replace(/\.$/, "")), line);
	assert.match(line, /The data warnings can't count entries until that's fixed\.$/);
	assert.doesNotMatch(line, /detaches nothing/);
	assert.match(core.holdingsLineOf(parseBooklet(HELD)), /holds 12 kept entries/);
});

// ---------------------------------------------------------------- 10. one reading of the note

test("[10] the panel's model is made from one reading: a reading handed in is the only one used", () => {
	const real = core.analyse(HELD);
	// a made-up reading that differs from the text in what it holds: if the model read the text again it would not show this
	const fakeBook = { ...real.book, ok: false, refusal: "A sentinel refusal." };
	const fakeScan = { ...real.scan, regions: [], holders: [], items: [], lines: real.scan.lines };
	const m = core.panelModel({ ...real, book: fakeBook, scan: fakeScan }, 43);
	assert.match(m.holds, /A sentinel refusal/, "the top line comes from the book it was given");
	// (the panel's problems list and outline were here: both are the Design view's now, and the same "one reading" check of them is in
	// test/design-outline.test.mjs; the panel's model no longer carries them)
	assert.equal("problems" in m || "outline" in m, false, "the panel's model has neither the problems nor the outline");
	assert.notEqual(m.line.held, "records", "the line holder comes from the scan it was given (no regions)");
	const honest = core.panelModel(real, 43);
	assert.equal(honest.line.held, "records");
	assert.equal(honest.options, null);
	assert.equal(core.panelModel(real, 22).options.kind, "scale");
	assert.equal(core.panelModel(real, 29).block.id, "things");
});

// ---------------------------------------------------------------- (a) the note's own line endings

const crlf = (t) => t.replace(/\n/g, "\r\n");
const CR = crlf(HELD);
const sameAsLf = (r, lf) => {
	assert.ok(r.text, JSON.stringify(r));
	assert.equal(r.text.split("\n").every((l, i, a) => i === a.length - 1 || l.endsWith("\r")), true, "every line break is still CRLF");
	assert.equal(r.text.replace(/\r\n/g, "\n"), lf.text);
};

test("(a) a note with Windows line endings keeps them through option, field and placing changes", () => {
	const opt = lineOf(HELD, "- [ ] Calm");
	sameAsLf(renameOption(CR, opt, opt, "Peaceful"), renameOption(HELD, opt, opt, "Peaceful"));
	sameAsLf(removeOption(CR, opt, opt), removeOption(HELD, opt, opt));
	const data = lineOf(HELD, "```booklet data") + 1;
	sameAsLf(renameField(CR, data, "kind", "group"), renameField(HELD, data, "kind", "group"));
	sameAsLf(removeField(CR, data, "done"), removeField(HELD, data, "done"));
	const plan = planInsert(CR, { line: lineOf(HELD, "> [!text|why]"), ch: 0 }, TEXT.text);
	assert.equal(plan.refused, undefined);
	const placed = applyPlan(CR, plan);
	assert.equal(placed.replace(/\r\n/g, "\n"), applyPlan(HELD, planInsert(HELD, { line: lineOf(HELD, "> [!text|why]"), ch: 0 }, TEXT.text)));
	assert.equal(placed.split("\n").every((l, i, a) => i === a.length - 1 || l.endsWith("\r")), true, "the piece's own lines end as the note's do");
	const line = lineOf(HELD, "[!activity|log repeat]");
	const flag = changeLine(CR, line, (p) => core.setFlag(p, "daily", true));
	assert.ok(flag.text.split("\n")[line].endsWith("\r"));
});

// ---------------------------------------------------------------- (b) the byte-order mark

test("(b) a note that starts with a byte-order mark is still a booklet, and is placed into as one", () => {
	const bom = "﻿" + HELD;
	assert.equal(isBookletText(bom), true);
	assert.equal(scan(bom).hasFrontMatter, true);
	assert.equal(planInsert(bom, { line: 12, ch: 0 }, TEXT.text).text, planInsert(HELD, { line: 12, ch: 0 }, TEXT.text).text);
	assert.equal(planInsert(bom, { line: 12, ch: 0 }, piece("Structure - front matter.md").text).refused, HAS_FRONT);
	assert.equal(isBookletText("﻿no properties here"), false);
});
