/*
 * The panel's writes: a line changed in place, the declared fields of a data block renamed or taken out, and the smallest edit that
 * makes either. Every test shows the other bytes of the note come back exactly as they were, and that the records and the rows are
 * never written.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { core } from "./helpers.mjs";
import { HELD, ROWS } from "./editor-fixture.mjs";

const { minimalChange, applyChange, replaceLine, settingsModel, changeLine, setFlag, setValue, setId, fieldBlockAt, renameField, removeField, impactOf, parseBooklet } = core;

const lineOf = (text, needle) => text.split("\n").findIndex((l) => l.includes(needle));
const recordsOf = (text) => text.slice(text.indexOf("%%"));
const dataFence = (text) => /```booklet data\n([\s\S]*?)\n```/.exec(text)[1];

test("the smallest change that makes one text into another", () => {
	assert.equal(minimalChange("same", "same"), null);
	const c = minimalChange("abcXYZdef", "abcQdef");
	assert.deepEqual(c, { from: 3, to: 6, text: "Q" });
	assert.equal(applyChange("abcXYZdef", c), "abcQdef");
	// an insertion and a removal
	assert.deepEqual(minimalChange("ab", "aXb"), { from: 1, to: 1, text: "X" });
	assert.deepEqual(minimalChange("aXb", "ab"), { from: 1, to: 2, text: "" });
	// the prefix and the suffix never overlap
	const d = minimalChange("aaa", "aa");
	assert.equal(applyChange("aaa", d), "aa");
});

test("a Booklet line is changed in place and every other byte of the note stays", () => {
	const at = lineOf(HELD, "[!activity|log repeat]");
	const r = changeLine(HELD, at, (p) => setFlag(p, "hidden", true));
	assert.ok("text" in r);
	assert.equal(r.text.split("\n")[at], "> [!activity|log repeat hidden] A mood log");
	const before = HELD.split("\n");
	const after = r.text.split("\n");
	assert.equal(after.length, before.length);
	after.forEach((l, i) => i === at || assert.equal(l, before[i], `line ${i + 1} is as it was`));
	// the editor is told to change only the word
	const c = minimalChange(HELD, r.text);
	assert.equal(c.text, " hidden");
	assert.equal(applyChange(HELD, c), r.text);
});

test("an id, a field and a switch each change one line, and give back what they started from", () => {
	const at = lineOf(HELD, "[!activity|log repeat]");
	let doc = HELD;
	for (const edit of [(p) => setId(p, "diary"), (p) => setValue(p, "icon", "book"), (p) => setFlag(p, "daily", true)]) {
		const r = changeLine(doc, at, edit);
		assert.ok("text" in r);
		doc = r.text;
	}
	assert.equal(doc.split("\n")[at], "> [!activity|diary repeat daily icon:book] A mood log");
	for (const edit of [(p) => setFlag(p, "daily", false), (p) => setValue(p, "icon", ""), (p) => setId(p, "log")]) doc = changeLine(doc, at, edit).text;
	assert.equal(doc, HELD);
});

test("a line that is not a Booklet line, or an edit the line refuses, writes nothing", () => {
	assert.deepEqual(changeLine(HELD, lineOf(HELD, "- [ ] Calm"), (p) => setFlag(p, "x", true)), { error: "That line is not a Booklet line." });
	const bad = changeLine(HELD, lineOf(HELD, "[!text|why]"), (p) => setValue(p, "each", "two words"));
	assert.ok("error" in bad);
});

test("the panel shows every switch and field the kind takes, in the linter's order, with the line's values", () => {
	const m = settingsModel("> [!activity|log repeat icon:book zzz] A mood log");
	assert.equal(m.kind, "activity");
	assert.equal(m.id, "log");
	assert.deepEqual(m.flags.map((f) => [f.name, f.on]), [["repeat", true], ["daily", false], ["hidden", false]]);
	assert.deepEqual(m.values.map((v) => [v.name, v.value]), [["icon", "book"], ["status", ""], ["tab", ""], ["entries", ""]]);
	assert.deepEqual(m.stray, [{ index: 3, text: "zzz" }]);
	assert.equal(m.icon, true);
	// a kind with no id and no settings has nothing to show
	assert.equal(settingsModel("> [!hint] Think of a place").any, false);
	assert.equal(settingsModel("- [ ] Calm"), null);
});

test("the settings come from the linter's table: every kind the table lists is shown with exactly its words", () => {
	const t = core.LINTER_TABLES;
	for (const [kind, words] of t.KIND_SETTINGS) {
		const m = settingsModel(`> [!${kind}|x] T`);
		assert.deepEqual([...m.flags.map((f) => f.name), ...m.values.map((v) => v.name + ":")].sort(), [...words].sort(), kind);
	}
});

// ---------------------------------------------------------------- the declared fields of a data block

test("the declared fields of a data block are read with how many rows use each", () => {
	const at = lineOf(HELD, "```booklet data");
	const b = fieldBlockAt(HELD, at + 1);
	assert.deepEqual(b.keys, ["title", "kind", "done"]);
	assert.deepEqual(b.used, { title: 5, kind: 5, done: 5 });
	assert.equal(b.id, "things");
	// the id line below the fence is part of the block; a line outside it is not
	assert.ok(fieldBlockAt(HELD, lineOf(HELD, "^things")));
	assert.equal(fieldBlockAt(HELD, lineOf(HELD, "[!text|why]")), null);
});

test("renaming a field rewrites its declaration only: the rows, the records and every other byte stay", () => {
	const at = lineOf(HELD, "```booklet data") + 1;
	const r = renameField(HELD, at, "kind", "group");
	assert.ok("text" in r, JSON.stringify(r));
	const was = dataFence(HELD);
	const now = dataFence(r.text);
	assert.equal(now, was.replace('"kind": "Kind"', '"group": "Kind"'));
	// rows unchanged, records unchanged
	assert.deepEqual(JSON.parse(now).rows, ROWS);
	assert.equal(recordsOf(r.text), recordsOf(HELD));
	const c = minimalChange(HELD, r.text);
	assert.equal(c.text, "group");
	// the guard sees five rows use the old name
	const imp = impactOf(HELD, r.text);
	assert.deepEqual(imp.map((i) => [i.kind, i.rows]), [["field", 5]]);
});

test("removing a field takes its declaration out and nothing else, and the guard counts the rows that hold it", () => {
	const at = lineOf(HELD, "```booklet data") + 1;
	const r = removeField(HELD, at, "done");
	assert.ok("text" in r, JSON.stringify(r));
	assert.equal(dataFence(r.text), dataFence(HELD).replace(', "done": "Done"', ""));
	assert.deepEqual(JSON.parse(dataFence(r.text)).rows, ROWS);
	assert.equal(recordsOf(r.text), recordsOf(HELD));
	assert.deepEqual(impactOf(HELD, r.text).map((i) => [i.kind, i.rows]), [["field", 5]]);
	assert.ok(parseBooklet(r.text).ok);
});

test("a field that no row holds can go with no question", () => {
	const only = HELD.replace('"done": "Done" }', '"done": "Done", "spare": "Spare" }');
	const at = lineOf(only, "```booklet data") + 1;
	const r = removeField(only, at, "spare");
	assert.deepEqual(impactOf(only, r.text), []);
});

test("a rename or a removal that cannot be made says why and writes nothing", () => {
	const at = lineOf(HELD, "```booklet data") + 1;
	assert.match(renameField(HELD, at, "kind", "done").error, /already declares/);
	assert.match(renameField(HELD, at, "kind", " ").error, /cannot be empty/);
	assert.match(renameField(HELD, at, "nope", "x").error, /declares no field/);
	assert.match(removeField(HELD, at, "nope").error, /declares no field/);
	assert.match(renameField(HELD, lineOf(HELD, "[!text|why]"), "a", "b").error, /not a data block/);
	assert.equal(renameField(HELD, at, "kind", "kind").text, HELD);
	const fmt = HELD.replace('"rows"', '"idFormat": "{field:kind}-x", "rows"');
	assert.match(renameField(fmt, lineOf(fmt, "```booklet data") + 1, "kind", "group").error, /idFormat/);
	assert.match(removeField(fmt, lineOf(fmt, "```booklet data") + 1, "kind").error, /idFormat/);
});

test("a note's lines are replaced by number and the rest is left alone", () => {
	assert.equal(replaceLine("a\nb\nc", 1, "X"), "a\nX\nc");
	assert.equal(replaceLine("a\nb\nc", 9, "X"), "a\nb\nc");
});
