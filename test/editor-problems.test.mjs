/*
 * The problems list: the lines the plugin's reader cannot read, with why, and the leftovers (kept data that matches nothing now),
 * each with the line to jump to. It is the reader's own list, not a second opinion.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { core, bookletAround } from "./helpers.mjs";
import { HELD } from "./editor-fixture.mjs";

const { problemsOf, parseBooklet } = core;
const lineAt = (text, needle) => text.split("\n").findIndex((l) => l.includes(needle));

test("a clean booklet has no problems", () => {
	assert.deepEqual(problemsOf(HELD), []);
});

test("a line the reader cannot read is listed with its line, its text and why", () => {
	const text = bookletAround("> [!activity|a] A\n\n> [!text|t hidden] A question with a setting it does not take\n\n> [!my_kind] Not a Booklet line\n\n> [!frobnicate|x y] A kind nobody knows\n");
	const ps = problemsOf(text);
	assert.ok(ps.length >= 3, JSON.stringify(ps));
	const hidden = ps.find((p) => p.line === lineAt(text, "[!text|t hidden]"));
	assert.ok(hidden && hidden.kind === "unread" && /hidden/.test(hidden.why) && /A question with a setting/.test(hidden.text), JSON.stringify(hidden));
	const odd = ps.find((p) => p.line === lineAt(text, "[!my_kind]"));
	assert.ok(odd && /cannot be read/.test(odd.why), JSON.stringify(odd));
	const unknown = ps.find((p) => p.line === lineAt(text, "[!frobnicate"));
	assert.ok(unknown && unknown.kind === "unread", JSON.stringify(unknown));
	// in file order
	const lines = ps.map((p) => p.line);
	assert.deepEqual(lines, [...lines].sort((a, b) => a - b));
});

test("what the reader lists in the file's own words comes with its line", () => {
	const text = bookletAround("> [!activity|a] A\n\n> [!choice|c] No options here\n");
	const ps = problemsOf(text);
	const p = ps.find((x) => /no options/.test(x.why));
	assert.equal(p.line, lineAt(text, "[!choice|c]"));
	assert.equal(p.kind, "note");
});

test("leftovers are listed after any edit, by hand included, and jump to the kept block", () => {
	const gone = HELD.replace("> [!activity|log repeat]", "> [!activity|diary repeat]");
	const ps = problemsOf(gone);
	const lo = ps.filter((p) => p.kind === "leftover");
	assert.equal(lo.length, 2);
	assert.equal(lo[0].line, lineAt(gone, "```booklet entries log"));
	assert.match(lo[0].why, /12 kept entries for the activity `log`/);
	assert.equal(lo[1].line, lineAt(gone, "```booklet draft log"));
});

test("a booklet the reader refuses is one problem, for the whole note", () => {
	const ps = problemsOf("---\nbooklet: \"9.9\"\n---\n\n> [!activity|a] A\n");
	assert.equal(parseBooklet("---\nbooklet: \"9.9\"\n---\n\n> [!activity|a] A\n").ok, false);
	assert.ok(ps.length >= 1 && ps[0].line === null && ps[0].kind === "note");
});

test("the same line and the same words are listed once", () => {
	const ps = problemsOf(bookletAround("> [!activity|a] A\n\n> [!text|t hidden] Q\n"));
	const keys = ps.map((p) => `${p.line}|${p.why}`);
	assert.equal(new Set(keys).size, keys.length);
});
