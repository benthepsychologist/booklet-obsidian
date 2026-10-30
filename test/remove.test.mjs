/*
 * Removing one kept entry (src/core/write.ts removeEntry), on made-up files. The rule the format gives the writer
 * (SPEC section 8): a kept entry is taken out as one item of its list, and every other member, item, block, records line
 * and blank line keeps its text. So each case here compares the whole note with the note as it would read had the
 * entry's own lines never been there, byte for byte, and the entries read back are the ones that were not removed.
 * The entry is named by its position among the activity's kept entries (never by `ts`, which two entries of one block
 * may share) and its `ts` is checked against that position, so a copy of the note that is out of date removes nothing.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { assertOutsideUnchanged, core, lint, norm, pythonAvailable } from "./helpers.mjs";

// removeEntry needs the entry's key as the card drew it; a test that is not about a stale pane takes it from the text it removes from
const rm = (text, scope, id, at, ts, expect) => {
	if (expect === undefined) {
		const e = core.parseBooklet(text).records.entries[scope]?.[id]?.[at];
		expect = e ? core.entryKey(e) : "";
	}
	return core.removeEntry(text, scope, id, at, ts, expect);
};

const canLint = pythonAvailable();
const lintOk = (text) => {
	if (!canLint) return;
	const r = lint(text);
	assert.equal(r.status, 0, r.out);
};

const FM = '---\nbooklet: "0.16"\nid: test/remove\ntitle: Remove\nlang: en\n---\n';
const ACT = `${FM}
> [!activity|log repeat] A log

> [!number|hours] Hours slept

> [!text|note] A note

> [!activity|day repeat daily] Each evening

> [!number|pages min:0] Pages read

> [!activity|once] Answered once

> [!text|said] Said once

Words after the activities, outside the records.
`;
const HEAD = `\n%%\n${core.RECORDS_HEADER}\n\n`;
const note = (records, tail = "%%\n") => `${ACT}${HEAD}${records}${tail}`;
const block = (name, lines, open = '{"items": [\n', close = "\n]}") => "```booklet entries " + name + "\n" + open + lines.join(",\n") + close + "\n```\n";
const E1 = '{"ts": "2026-10-25T08:00:00Z", "hours": 6, "note": "woke twice"}';
const E2 = '{"ts": "2026-10-26T08:10:00Z", "hours": 7.5, "note": ""}';
const E3 = '{"ts": "2026-10-27T06:55:00Z", "hours": 5, "note": "late coffee"}';
const entriesOf = (text, id = "log", scope = "") => (core.parseBooklet(text).records.entries[scope]?.[id] ?? []).map((e) => ({ ...e }));
const tsOf = (text, id = "log") => entriesOf(text, id).map((e) => e.ts);

/** The note with the given lines taken out of it, each with its line ending: what a removal must come to, byte for byte. */
const without = (text, ...lines) => {
	let t = text;
	for (const l of lines) {
		assert.ok(t.includes(l), `the note has the line ${l}`);
		t = t.replace(l, "");
	}
	return t;
};

test("each position of a three-entry list: that item and its comma go, and every other byte of the note is as it was", () => {
	const orig = note(block("log", [E1, E2, E3]) + "\n```booklet draft log\n{\"note\": \"typing\"}\n```\n");
	const want = [
		[0, E1 + ",\n", ["2026-10-26T08:10:00Z", "2026-10-27T06:55:00Z"]],
		[1, E2 + ",\n", ["2026-10-25T08:00:00Z", "2026-10-27T06:55:00Z"]],
		[2, ",\n" + E3, ["2026-10-25T08:00:00Z", "2026-10-26T08:10:00Z"]],
	];
	for (const [at, gone, left] of want) {
		const ts = JSON.parse(gone.replace(/^,\n|,\n$/g, "")).ts;
		const r = rm(orig, "", "log", at, ts);
		assert.equal(r.removed, 1);
		assert.equal(r.text, without(orig, gone), `position ${at}`);
		assert.deepEqual(tsOf(r.text), left);
		assertOutsideUnchanged(orig, r.text, `position ${at}`);
		lintOk(r.text);
	}
});

test("the draft, the answers and the text outside the records region are not touched by a removal", () => {
	const answers = '```booklet answers\n{"said": "hello"}\n```\n';
	const draft = '```booklet draft log\n{"hours": 8,   "note": "typing"}\n```\n';
	const orig = note(answers + "\n" + block("log", [E1, E2]) + "\n" + draft);
	const r = rm(orig, "", "log", 0, "2026-10-25T08:00:00Z");
	assert.ok(r.text.includes(answers) && r.text.includes(draft), "the answers and the draft, to the last space");
	assert.equal(r.text, without(orig, E1 + ",\n"));
	assert.deepEqual(norm(core.parseBooklet(r.text).records.drafts[""].log), { hours: 8, note: "typing" });
});

test("two entries that share a ts are not confused: the one at the position goes, and the other keeps its bytes", () => {
	const A = '{"ts": "2026-10-27T07:00:00Z", "hours": 6}';
	const B = '{"ts": "2026-10-27T07:00:00Z", "hours": 9}';
	const orig = note(block("log", [A, B]));
	assert.equal(entriesOf(orig).length, 2, "two entries, as the reader stands");
	const second = rm(orig, "", "log", 1, "2026-10-27T07:00:00Z");
	assert.equal(second.text, without(orig, ",\n" + B));
	assert.deepEqual(entriesOf(second.text).map((e) => e.hours), [6]);
	const first = rm(orig, "", "log", 0, "2026-10-27T07:00:00Z");
	assert.equal(first.text, without(orig, A + ",\n"), "the survivor is not rewritten compactly");
	assert.ok(first.text.includes(B), "{\"ts\": ..., \"hours\": 9} with its spaces");
	assert.deepEqual(entriesOf(first.text).map((e) => e.hours), [9]);
});

test("an entry read from items in two blocks (the same ts) goes from both; the entry beside it stays", () => {
	const orig = note(block("log", [E1, E2]) + "\n" + block("log", ['{"ts": "2026-10-26T08:10:00Z", "extra": "more"}', E3]));
	assert.equal(entriesOf(orig).length, 3);
	const r = rm(orig, "", "log", 1, "2026-10-26T08:10:00Z");
	assert.equal(r.removed, 2);
	assert.equal(r.text, without(orig, ",\n" + E2, '{"ts": "2026-10-26T08:10:00Z", "extra": "more"},\n'));
	assert.deepEqual(tsOf(r.text), ["2026-10-25T08:00:00Z", "2026-10-27T06:55:00Z"]);
});

test("a block that loses its last entry stays as {\"items\": []}, and the blocks round it are unchanged", () => {
	const orig = note(block("log", [E1]) + "\n" + block("day", ['{"ts": "2026-10-26T20:00:00Z", "pages": 3}'], '{"items": [\n', "\n]}"));
	const r = rm(orig, "", "log", 0, "2026-10-25T08:00:00Z");
	assert.equal(r.text, orig.replace('{"items": [\n' + E1 + "\n]}", '{"items": []}'));
	assert.deepEqual(entriesOf(r.text), []);
	assert.deepEqual(tsOf(r.text, "day"), ["2026-10-26T20:00:00Z"], "another activity's entries are not touched");
	assertOutsideUnchanged(orig, r.text);
	lintOk(r.text);
});

test("hand layouts: all on one line, a hand indent, and CRLF, with no final newline", () => {
	const oneLine = note('```booklet entries log\n{"items":[' + [E1, E2, E3].join(", ") + "]}\n```\n");
	const a = rm(oneLine, "", "log", 1, "2026-10-26T08:10:00Z");
	assert.equal(a.text, oneLine.replace(", " + E2, ""));
	const indent = note(block("log", ["  " + E1, "  " + E2, "  " + E3]));
	const b = rm(indent, "", "log", 2, "2026-10-27T06:55:00Z");
	assert.equal(b.text, indent.replace(",\n  " + E3, ""));
	const crlf = note(block("log", [E1, E2, E3])).replace(/\n/g, "\r\n").replace(/\r\n$/, "");
	const c = rm(crlf, "", "log", 0, "2026-10-25T08:00:00Z");
	assert.equal(c.text, crlf.replace(E1 + ",\r\n", ""));
	assert.ok(!c.text.endsWith("\n"), "no final newline, as the file had none");
	assert.deepEqual(tsOf(c.text), ["2026-10-26T08:10:00Z", "2026-10-27T06:55:00Z"]);
});

test("blank lines between blocks, blank lines after the last, and a block with a trailing blank line keep their places", () => {
	const orig = note(block("log", [E1, E2]) + "\n\n\n" + block("day", ['{"ts": "2026-10-26T20:00:00Z", "pages": 3}']) + "\n\n", "%%\n\n\n");
	const r = rm(orig, "", "log", 1, "2026-10-26T08:10:00Z");
	assert.equal(r.text, without(orig, ",\n" + E2));
});

test("an entry that is not where it was is not removed: a stale position, a different ts, a position past the end; the text comes back as it was", () => {
	const orig = note(block("log", [E1, E2]));
	for (const [at, ts] of [[0, "2026-10-26T08:10:00Z"], [1, "2026-10-25T08:00:00Z"], [2, "2026-10-26T08:10:00Z"], [-1, "2026-10-25T08:00:00Z"], [0, "nope"]]) {
		const r = rm(orig, "", "log", at, ts);
		assert.deepEqual([r.removed, r.text === orig], [0, true], `${at} ${ts}`);
	}
});

test("a note with no entries, an activity that keeps none, and a block that cannot be read: nothing is removed, and the unreadable block is kept exactly", () => {
	assert.equal(rm(ACT, "", "log", 0, "x").removed, 0);
	assert.equal(rm(ACT, "", "once", 0, "x").removed, 0);
	const broken = "```booklet entries log\n{\"items\": [ {\"ts\": \"2026-10-25T08:00:00Z\"\n```\n";
	const orig = note(broken + "\n" + block("log", [E2]));
	assert.deepEqual(tsOf(orig), ["2026-10-26T08:10:00Z"], "the broken block is not read");
	const r = rm(orig, "", "log", 0, "2026-10-26T08:10:00Z");
	assert.ok(r.text.includes(broken), "kept as written");
	assert.equal(r.text, orig.replace('{"items": [\n' + E2 + "\n]}", '{"items": []}'));
});

test("an activity or a module the note does not have, and a note that ends inside a fence, are refused", () => {
	assert.throws(() => rm(note(block("log", [E1])), "", "nope", 0, "x"), core.RecordsWriteError);
	assert.throws(() => rm(note(block("log", [E1])), "ghost", "log", 0, "x"), core.RecordsWriteError);
	assert.throws(() => rm(note(block("log", [E1])) + "\n```booklet draft log\n{", "", "log", 0, "x"), /never closed/);
});

test("an entry holding answers of the wrong shape is removed whole like any other, and nothing about its shape is rewritten", () => {
	const odd = '{"ts": "2026-10-27T06:55:00Z", "hours": "five", "note": 7, "other": {"deep": [1]}}';
	const orig = note(block("log", [E1, odd, E3]));
	const r = rm(orig, "", "log", 1, "2026-10-27T06:55:00Z");
	assert.equal(r.text, without(orig, odd + ",\n"));
});

test("a daily activity: removing today's entry leaves a draft the reader typed", () => {
	const draft = '```booklet draft day\n{"pages": 12}\n```\n';
	const orig = note(block("day", ['{"ts": "2026-10-27T07:00:00Z", "pages": 3}', '{"ts": "2026-10-26T20:00:00Z", "pages": 9}']) + "\n" + draft);
	const r = rm(orig, "", "day", 0, "2026-10-27T07:00:00Z");
	assert.equal(r.text, without(orig, '{"ts": "2026-10-27T07:00:00Z", "pages": 3},\n'));
	assert.deepEqual(norm(core.parseBooklet(r.text).records.drafts[""].day), { pages: 12 });
});

test("a module's entries are removed by the same positions inside the module, and another module's are not touched", () => {
	const text = `${FM}
> [!module|north] North

> [!activity|log repeat] Log

> [!number|hours] Hours

> [!module|north end]

> [!module|south] South

> [!activity|log repeat] Log

> [!number|hours] Hours

> [!module|south end]

%%
> [!records|north] North

${block("log", [E1, E2])}
> [!records|south] South

${block("log", [E1, E3])}%%
`;
	const b = core.parseBooklet(text);
	assert.equal(b.records.entries.north.log.length, 2);
	assert.equal(b.records.entries.south.log.length, 2);
	const r = rm(text, "north", "log", 0, "2026-10-25T08:00:00Z");
	assert.equal(r.text, text.replace(E1 + ",\n", ""), "the first occurrence, which is north's");
	const after = core.parseBooklet(r.text).records.entries;
	assert.deepEqual([after.north.log.length, after.south.log.length], [1, 2]);
});

test("removing every entry one by one, newest position first, ends with an empty list and the note otherwise as it began", () => {
	const orig = note(block("log", [E1, E2, E3]));
	let t = orig;
	for (let at = 2; at >= 0; at--) {
		const e = entriesOf(t)[at];
		t = rm(t, "", "log", at, e.ts).text;
	}
	assert.deepEqual(entriesOf(t), []);
	assert.equal(t, orig.replace('{"items": [\n' + [E1, E2, E3].join(",\n") + "\n]}", '{"items": []}'));
});

test("with `expect`, the entry now at the position must read as it did when its card was drawn: a stale pane does not remove the other entry that has the same ts", () => {
	const A = '{"ts": "2026-10-27T07:00:00Z", "hours": 6}';
	const B = '{"ts": "2026-10-27T07:00:00Z", "hours": 9}';
	const was = note(block("log", [A, B]));
	const keyA = core.entryKey(entriesOf(was)[0]);
	const keyB = core.entryKey(entriesOf(was)[1]);
	assert.notEqual(keyA, keyB);
	// as the pane drew it: both are there, and each is removed by its own key
	assert.equal(rm(was, "", "log", 1, "2026-10-27T07:00:00Z", keyB).removed, 1);
	// the file has since lost A: the entry at position 0 is B, with A's ts
	const now = rm(was, "", "log", 0, "2026-10-27T07:00:00Z", keyA).text;
	const stale = rm(now, "", "log", 0, "2026-10-27T07:00:00Z", keyA);
	assert.deepEqual([stale.removed, stale.text], [0, now], "A is gone: nothing is removed, the text comes back as it was");
	assert.deepEqual(entriesOf(now).map((e) => e.hours), [9]);
	// the key is not optional: a key that is not the entry's own removes nothing
	assert.equal(core.removeEntry(now, "", "log", 0, "2026-10-27T07:00:00Z", "").removed, 0);
	assert.equal(rm(now, "", "log", 0, "2026-10-27T07:00:00Z").removed, 1);
	// two entries that read the same (the same ts and answers) are one and the same to the reader: either may go
	const twin = note(block("log", [A, A]));
	assert.equal(rm(twin, "", "log", 1, "2026-10-27T07:00:00Z", core.entryKey(entriesOf(twin)[0])).removed, 1);
});
