/*
 * The reader-work rule in the guard: deleting an activity, a module or a page must count the answers it detaches, so the shell can ask
 * first, and must count each thing once. Before, an activity that went took its questions' once-given answers with it unreported
 * ("said with the activity"), while deleting the question alone did report them.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { core, bookletAround } from "./helpers.mjs";
import { HELD } from "./editor-fixture.mjs";

const { parseDesign, walkDesign, deleteBlock, impactOf } = core;

const note = (text) => {
	const root = parseDesign(text);
	return { node: (id) => walkDesign(root).find((x) => x.id === id) };
};
const rows = (impacts) => impacts.map((i) => [i.what, i.entries, i.answers, i.rows]);

const records = (body) => ["", "%%", "> [!records] App record — do not edit below this line", "", body, "%%", ""].join("\n");
const fence = (kind, json) => `\`\`\`booklet ${kind}\n${json}\n\`\`\``;

/** A module of two activities (one repeating, with entries and a draft) and a bare activity, each with questions that hold answers. */
const BOOK = bookletAround(
	[
		"> [!module|m] M",
		"",
		"> [!activity|log repeat] A log",
		"",
		"> [!text|why] Why?",
		"",
		"> [!activity|once] Said once",
		"",
		"> [!tab|t1] Tab",
		"",
		"> [!page|p1] Page one",
		"",
		"> [!scale|energy] How much energy?",
		"",
		"0. None",
		"1. Lots",
		"",
		"> [!page|p2] Page two",
		"",
		"> [!text|note] A note",
		"",
		"> [!number|age] Age?",
		"",
		"> [!module|m end]",
		"",
		"> [!activity|bare] Bare",
		"",
		"> [!text|loose] Loose?",
		records(
			[
				"> [!records|m] M",
				"",
				fence("answers", '{ "energy": 1, "note": "kept", "age": 40 }'),
				"",
				fence("entries log", '{"items": [{"ts": "2026-10-01T09:00:00Z", "why": "a"}, {"ts": "2026-10-02T09:00:00Z", "why": "b"}]}'),
				"",
				fence("draft log", '{ "why": "half" }'),
			].join("\n"),
		),
	].join("\n"),
);
/** The same with nothing kept. */
const EMPTY = BOOK.slice(0, BOOK.indexOf("\n%%\n")) + "\n";

test("deleting an activity counts the answers kept once for its questions, with its entries and drafts", () => {
	const d = note(BOOK);
	// `once` holds `energy` (on page one), `note` (page two) and `age`: three answers
	assert.deepEqual(rows(deleteBlock(BOOK, d.node("once")).impact), [["The activity id `once`", 0, 3, 0]]);
	// `log` holds a draft and two entries, and no kept answer
	assert.deepEqual(rows(deleteBlock(BOOK, d.node("log")).impact), [["The activity id `log`", 2, 1, 0]]);
});

test("the same answers are counted whichever way the question goes: with its activity, or alone", () => {
	const d = note(BOOK);
	assert.deepEqual(rows(deleteBlock(BOOK, d.node("energy")).impact), [["The question id `energy`", 0, 1, 0]]);
	assert.deepEqual(rows(deleteBlock(BOOK, d.node("age")).impact), [["The question id `age`", 0, 1, 0]]);
});

test("deleting a module counts every entry, draft and answer under it, once", () => {
	const d = note(BOOK);
	assert.deepEqual(rows(deleteBlock(BOOK, d.node("m")).impact), [["The module id `m`", 2, 4, 0]], "3 answers and 1 draft; 2 entries");
});

test("deleting a page, or a tab with its pages, counts the answers of the questions on it, per question", () => {
	const d = note(BOOK);
	assert.deepEqual(rows(deleteBlock(BOOK, d.node("p1")).impact), [["The question id `energy`", 0, 1, 0]]);
	assert.deepEqual(rows(deleteBlock(BOOK, d.node("p2")).impact).map((r) => r[0]).sort(), ["The question id `age`", "The question id `note`"], "page two runs to the module's end");
	assert.deepEqual(rows(deleteBlock(BOOK, d.node("t1")).impact).map((r) => r[0]).sort(), ["The question id `age`", "The question id `energy`", "The question id `note`"]);
});

test("nothing is counted when nothing is held", () => {
	const d = note(EMPTY);
	for (const id of ["once", "log", "m", "p1", "energy"]) assert.deepEqual(deleteBlock(EMPTY, d.node(id)).impact, [], id);
	// an activity with no kept answer of its own: the bare one holds none
	assert.deepEqual(deleteBlock(BOOK, note(BOOK).node("bare")).impact, []);
});

test("an activity that is renamed keeps its once-given answers: they are kept under the question id, so none is counted", () => {
	const after = BOOK.replace("> [!activity|once]", "> [!activity|twice]");
	assert.deepEqual(impactOf(BOOK, after), []);
});

test("an activity line that goes while its questions stay in the module counts nothing for them", () => {
	// without the `once` line its questions read as part of `log`: every question id still stands, so no answer is detached
	const after = BOOK.replace("> [!activity|once] Said once\n\n", "");
	assert.deepEqual(rows(impactOf(BOOK, after)), []);
});

test("HELD: deleting `once` reports its one kept answer and the five rows, each once", () => {
	const d = note(HELD);
	assert.deepEqual(rows(deleteBlock(HELD, d.node("once")).impact), [
		["The activity id `once`", 0, 1, 0],
		["The data block `things`", 0, 0, 5],
	]);
	assert.deepEqual(rows(deleteBlock(HELD, d.node("energy")).impact), [["The question id `energy`", 0, 1, 0]]);
});

test("the module's own row is not added to by the activities that go with it", () => {
	const gone = impactOf(HELD, HELD.replace(/> \[!module\|mood\][^]*> \[!module\|mood end\]\n/, ""));
	assert.deepEqual(gone.filter((i) => i.what.startsWith("The activity")), [], "said with the module");
	assert.equal(gone.filter((i) => i.what.startsWith("The module id")).length, 1);
});
