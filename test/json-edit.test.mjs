/* The JSON edits made inside one record block, and an answer in words from the file's own lists. */
import test from "node:test";
import assert from "node:assert/strict";
import { core, norm } from "./helpers.mjs";

test("scanJson finds every member and element where it is written, and refuses what is not JSON", () => {
	const s = '{ "a": 1, "b": [true, "x\\"y"], "c": {"d": null} }';
	const n = core.scanJson(s);
	assert.equal(n.kind, "object");
	assert.deepEqual(n.members.map((m) => m.key), ["a", "b", "c"]);
	assert.equal(s.slice(n.members[1].value.start, n.members[1].value.end), '[true, "x\\"y"]');
	assert.equal(s.slice(n.members[1].keyStart, n.members[1].keyEnd), '"b"');
	for (const bad of ['{"a": 1,}', "{a: 1}", '{"a": 1} x', "", "[1, 2"]) assert.equal(core.scanJson(bad), null, bad);
});

test("setMember: in place, appended in the layout, or a fresh object; the same value changes nothing", () => {
	const fresh = (o) => JSON.stringify(o, null, 1);
	assert.equal(core.setMember('{"a": 1, "b": 2}', "b", 3, fresh), '{"a": 1, "b": 3}');
	assert.equal(core.setMember('{"a":1,"b":2}', "c", "x", fresh), '{"a":1,"b":2,"c":"x"}');
	assert.equal(core.setMember('{"a": 1}', "c", [1, 2], fresh), '{"a": 1, "c": [1, 2]}');
	assert.equal(core.setMember("{}", "a", 1, fresh), '{\n "a": 1\n}');
	assert.equal(core.setMember('{\n  "a": 1\n}', "b", { x: [1] }, fresh), '{\n  "a": 1,\n  "b": {\n    "x": [\n      1\n    ]\n  }\n}');
	const same = '{ "a" : 1 }';
	assert.equal(core.setMember(same, "a", 1, fresh), same);
	assert.equal(core.setMember("[1]", "a", 1, fresh), null);
	// a key written twice is read as its last: that is the one set
	assert.equal(core.setMember('{"a": 1, "a": 2}', "a", 3, fresh), '{"a": 1, "a": 3}');
});

test("removeMember: the first, a middle one, the last, the only one; a key written twice goes entirely", () => {
	assert.equal(core.removeMember('{"a": 1, "b": 2, "c": 3}', "a"), '{"b": 2, "c": 3}');
	assert.equal(core.removeMember('{"a": 1, "b": 2, "c": 3}', "b"), '{"a": 1, "c": 3}');
	assert.equal(core.removeMember('{"a": 1, "b": 2, "c": 3}', "c"), '{"a": 1, "b": 2}');
	assert.equal(core.removeMember('{\n "a": 1,\n "b": 2\n}', "a"), '{\n "b": 2\n}');
	assert.equal(core.removeMember('{"a": 1}', "a"), "{}");
	assert.equal(core.removeMember('{"a": 1, "b": 2, "a": 3}', "a"), '{"b": 2}');
	assert.equal(core.removeMember('{"a": 1}', "z"), '{"a": 1}');
});

test("entries items: append in the list's layout, replace one, remove one", () => {
	const one = '{"items": [\n{"ts": "1"}\n]}';
	assert.equal(core.appendItem(one, '{"ts":"2"}'), '{"items": [\n{"ts": "1"},\n{"ts":"2"}\n]}');
	assert.equal(core.appendItem('{"items": []}', '{"ts":"2"}'), '{"items": [\n{"ts":"2"}\n]}');
	assert.equal(core.appendItem('{"items":[{"ts":"1"},{"ts":"2"}]}', '{"ts":"3"}'), '{"items":[{"ts":"1"},{"ts":"2"},{"ts":"3"}]}');
	const three = '{"items": [\n  {"ts": "1"},\n  {"ts": "2"},\n  {"ts": "3"}\n]}';
	assert.equal(core.replaceItem(three, 1, '{"ts":"x"}'), '{"items": [\n  {"ts": "1"},\n  {"ts":"x"},\n  {"ts": "3"}\n]}');
	assert.equal(core.removeItem(three, 0), '{"items": [\n  {"ts": "2"},\n  {"ts": "3"}\n]}');
	assert.equal(core.removeItem(three, 2), '{"items": [\n  {"ts": "1"},\n  {"ts": "2"}\n]}');
	assert.equal(core.removeItem(one, 0), '{"items": []}');
	assert.deepEqual(core.itemSpans(three).map((s) => three.slice(s.start, s.end)), ['{"ts": "1"}', '{"ts": "2"}', '{"ts": "3"}']);
	assert.equal(core.appendItem('{"other": []}', "{}"), null);
});

test("an answer in words, from the file's own lists", () => {
	const q = (kind, extra = {}) => ({ type: "question", kind, id: "q", title: "Q", help: "", long: false, open: false, min: null, max: null, step: null, options: [], anchors: [], ...extra });
	const choice = q("choice", { options: [{ text: "Clear **sky**", correct: false, reply: [] }, { text: "Grey", correct: false, reply: [] }] });
	assert.deepEqual(norm(core.answerWords(choice, 1)), { parts: [{ md: "Clear **sky**" }] });
	assert.deepEqual(norm(core.answerWords(choice, "My own")), { parts: [{ text: "My own" }] });
	assert.deepEqual(norm(core.answerWords(choice, 9)), { parts: [{ text: "#9" }] });
	assert.deepEqual(norm(core.answerWords({ ...choice, kind: "multi" }, [2, "Mine", 1])), { parts: [{ md: "Grey" }, { text: ", " }, { text: "Mine" }, { text: ", " }, { md: "Clear **sky**" }] });
	assert.equal(core.answerWords({ ...choice, kind: "multi" }, []), null);
	const scale = q("scale", { anchors: [{ n: 0, text: "Calm" }, { n: 1, text: "Full" }] });
	assert.deepEqual(norm(core.answerWords(scale, 0)), { parts: [{ md: "Calm" }] });
	assert.deepEqual(norm(core.answerWords(scale, 7)), { parts: [{ text: "7" }] });
	assert.deepEqual(norm(core.answerWords(q("lines"), ["a", " ", "b"])), { list: ["a", "b"] });
	assert.deepEqual(norm(core.answerWords(q("text"), "  said  ")), { parts: [{ text: "said" }] });
	assert.equal(core.answerWords(q("text"), "  "), null);
	assert.deepEqual(norm(core.answerWords(q("number"), 0)), { parts: [{ text: "0" }] });
	assert.deepEqual(norm(core.answerWords(q("date"), "2026-10-27")), { parts: [{ text: "2026-10-27" }] });
	assert.equal(core.answerWords(q("date"), undefined), null);
});
