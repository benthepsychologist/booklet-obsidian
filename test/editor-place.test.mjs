/*
 * Where a click puts its piece: at the cursor, as a block of its own, never inside a line or between a Booklet line and what it
 * claims; inside a group, with the group's `>`. A drop on the editor is the same plan from the line it landed on. Carried over from the
 * personal editor's place tests, with the fresh-id cases for the panel's own pieces.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { core, bookletAround } from "./helpers.mjs";

const { planInsert, planDrop, applyPlan, fitsInGroup, PIECES } = core;

const NOTE = "> [!note] Note title\n> Words.\n";
const CHOICE = "> [!choice|new-id] Your question here\n- [ ] First option\n- [ ] Second option\n";
const piece = (file) => PIECES.find((p) => p.file === file);

function put(doc, line, tpl) {
	const plan = planInsert(doc, { line, ch: 0 }, tpl);
	return { plan, text: applyPlan(doc, plan) };
}

test("on a blank line: there, with a blank line kept on each side", () => {
	assert.equal(put("Para one.\n\nPara two.\n", 1, NOTE).text, "Para one.\n\n> [!note] Note title\n> Words.\n\nPara two.\n");
});

test("in a paragraph: after it", () => {
	assert.equal(put("Line one\nline two.\n\nNext.\n", 0, NOTE).text, "Line one\nline two.\n\n> [!note] Note title\n> Words.\n\nNext.\n");
});

test("on a question, or in its options: after the options it claims", () => {
	const doc = "> [!choice|choice-1] Pick\n- [ ] A\n- [ ] B\n\nAfter.\n";
	for (const line of [0, 1, 2]) {
		const { text, plan } = put(doc, line, CHOICE);
		assert.equal(text, "> [!choice|choice-1] Pick\n- [ ] A\n- [ ] B\n\n> [!choice|choice-2] Your question here\n- [ ] First option\n- [ ] Second option\n\nAfter.\n");
		assert.deepEqual(plan.assigned, { "new-id": "choice-2" });
	}
});

test("on a Booklet line with a `>` body, never between the line and its body", () => {
	const doc = "> [!text|t1] Question\n> Help text.\n> More help.\n\nAfter.\n";
	for (const line of [0, 1, 2]) assert.equal(put(doc, line, NOTE).text, "> [!text|t1] Question\n> Help text.\n> More help.\n\n> [!note] Note title\n> Words.\n\nAfter.\n");
});

test("in a fence, or on the ^id line after it: after the fence and its id", () => {
	const doc = '```booklet data\n{"a": 1}\n```\n^data-1\n\nAfter.\n';
	for (const line of [0, 1, 2, 3]) assert.equal(put(doc, line, NOTE).text, '```booklet data\n{"a": 1}\n```\n^data-1\n\n> [!note] Note title\n> Words.\n\nAfter.\n', `line ${line}`);
});

test("at the end of a note with no newline at the end", () => {
	assert.equal(put("Last words.", 0, NOTE).text, "Last words.\n\n> [!note] Note title\n> Words.");
});

test("in a group in a group: two `>` more on each line, blank lines as bare `>`", () => {
	const doc = "> [!group] Outer\n> Words.\n>\n> > [!group] Inner\n> > Inner words.\n\nAfter.\n";
	const { text, plan } = put(doc, 4, NOTE);
	assert.equal(plan.depth, 2);
	assert.equal(text, "> [!group] Outer\n> Words.\n>\n> > [!group] Inner\n> > Inner words.\n> >\n> > > [!note] Note title\n> > > Words.\n\nAfter.\n");
});

test("the selection is the title words; with none, the cursor goes after the piece", () => {
	const { plan, text } = put("Para.\n", 0, CHOICE);
	const lines = text.split("\n");
	assert.equal(lines[plan.anchor.line].slice(plan.anchor.ch, plan.head.ch), "Your question here");
	const brk = put("Para.\n", 0, "***\n");
	assert.deepEqual(brk.plan.anchor, brk.plan.head);
});

test("a piece marker selects the name of the piece", () => {
	const { plan, text } = put("Para.\n", 0, piece("Structure - piece marker.md").text);
	assert.equal(text.split("\n")[plan.anchor.line].slice(plan.anchor.ch, plan.head.ch), "Name of the piece");
});

test("what cannot go in a group", () => {
	assert.equal(fitsInGroup(NOTE), true);
	assert.equal(fitsInGroup(CHOICE), true);
	assert.equal(fitsInGroup("> [!activity|new-id] A\n"), false);
	assert.equal(fitsInGroup("> [!module|new-module-id] M\n\n> [!module|new-module-id end]\n"), false);
	assert.equal(fitsInGroup("> [!tab] T\n"), false);
	assert.equal(fitsInGroup("> [!page|new-page] P\n"), false);
	assert.equal(fitsInGroup("> [!row]\n\n### A\n\n> [!row|end]\n"), false);
	assert.equal(fitsInGroup("```booklet theme\nbase: paper\n```\n"), false);
	assert.equal(fitsInGroup('---\nbooklet: "0.20"\n---\n'), false);
});

test("a piece that cannot go in a group goes after the whole group", () => {
	const doc = bookletAround("> [!module|module-1] M\n\n> [!activity|activity-1] A\n\n> [!group] Step one\n> Words.\n>\n> > [!choice|choice-1] Pick\n> - [ ] A\n> - [ ] B\n\n> [!module|module-1 end]\n");
	const at = doc.split("\n").findIndex((l) => l.includes("> > [!choice|choice-1]"));
	const { text } = put(doc, at, piece("Structure - page.md").text);
	assert.match(text, /> - \[ \] B\n\n> \[!page\|page-1\] Page title\n\nWords for this page\.\n\n> \[!module\|module-1 end\]/);
});

test("a piece placed inside a group is written with the group's `>` on every line", () => {
	const doc = bookletAround("> [!module|module-1] M\n\n> [!activity|activity-1] A\n\n> [!group] Step one\n> Words.\n>\n> > [!choice|choice-1] Pick\n> - [ ] A\n> - [ ] B\n\n> [!module|module-1 end]\n");
	const at = doc.split("\n").findIndex((l) => l.includes("> > [!choice|choice-1]"));
	const { text } = put(doc, at, piece("Q - choice.md").text);
	assert.match(text, /\n> > \[!choice\|choice-2\] Your question here\n> - \[ \] First option\n/);
});

test("a drop is a click from the line the drop landed on", () => {
	const doc = "Para one.\n\nPara two.\nmore words.\n\nEnd.\n";
	for (const line of [0, 1, 2, 3, 4, 5]) {
		assert.deepEqual(planDrop(doc, line, NOTE), planInsert(doc, { line, ch: 0 }, NOTE), `line ${line}`);
	}
	// dropped inside a paragraph, the piece lands after the paragraph and never splits it
	assert.equal(applyPlan(doc, planDrop(doc, 3, NOTE)), "Para one.\n\nPara two.\nmore words.\n\n> [!note] Note title\n> Words.\n\nEnd.\n");
});

test("a drop past the last line, or on a line that is not there, lands at the end", () => {
	const doc = "Para one.\n";
	assert.equal(applyPlan(doc, planDrop(doc, 40, NOTE)), "Para one.\n\n> [!note] Note title\n> Words.\n");
	assert.equal(applyPlan(doc, planDrop(doc, -3, NOTE)).startsWith("Para one.\n\n> [!note]"), true);
});

test("a note with a blank last line takes the piece without a stray blank line", () => {
	assert.equal(put("Text.\n\n", 2, NOTE).text, "Text.\n\n> [!note] Note title\n> Words.\n");
	assert.equal(put("", 0, NOTE).text, "> [!note] Note title\n> Words.\n");
});
