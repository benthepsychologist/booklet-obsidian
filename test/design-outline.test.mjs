/*
 * The Design view's outline and its list of lines the reader cannot read (core/design-outline.ts). They moved here from the side panel,
 * so this file carries the panel's outline tests (test/editor-outline.test.mjs, removed with the panel's outline) over to the tree the
 * view draws, and the panel's "[10] one reading" test for the problems list.
 *
 * What changed in the port, and why each assertion still says what it said:
 *   - the rows name the tree's kinds (`module-tab`, `activity-tab`, `data-section`) where the panel's outline said `tab` and `data`;
 *   - a part of a tab or an activity cut by a page break was a "Page 1", "Page 2" row in the panel; the tree draws a page break as a
 *     block of its own and has no such pages, so those rows are not listed (the questions under them are, at the activity's depth);
 *   - a page under its `parent:` is listed under it, as it was.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { core, bookletAround } from "./helpers.mjs";
import { HELD } from "./editor-fixture.mjs";
import { FULL, UNREAD, lineOf } from "./design-fixtures.mjs";

const { parseDesign, walkDesign, outlineEntries, nodeAtLine, troublesOf, problemsOf, problemsOfBook, parseBooklet } = core;

// one row per listed node: indent, kind (a question's own kind), id, label, 1-based line
const rows = (text) =>
	outlineEntries(parseDesign(text)).map(({ node: n, depth }) => "  ".repeat(depth) + [n.kind === "question" || n.kind === "menu" ? n.detail || n.kind : n.kind, n.id || "-", n.label || "-", n.start + 1].join(" "));

test("a module with activities, tabs, a group and questions", () => {
	const text = bookletAround(
		[
			"> [!module|week-1] Week one", // 9
			"",
			"> [!tab|plan] The plan", // 11: a tab of the module's, in its opening
			"",
			"> [!activity|check] Check in", // 13
			"",
			"> [!text|noticed] What did you notice?", // 15
			"",
			"***", // 17: a page break
			"",
			"> [!scale|biggest] How big?", // 19
			"1. Small",
			"2. Big",
			"",
			"> [!tab] Second tab", // 23
			"",
			"> [!group] Step one", // 25
			"> Words.",
			">",
			"> > [!choice|pick] Pick", // 28
			"> - [ ] A",
			"",
			"> [!activity|later] Later", // 31
			"",
			"> [!date|when] When?", // 33
			"",
			"> [!module|week-1 end]",
			"",
			"> [!data|week-1] Data for week one", // 37
			"",
		].join("\n"),
	);
	assert.deepEqual(rows(text), [
		"module week-1 Week one 9",
		"  module-tab plan The plan 11",
		"  activity check Check in 13",
		"    text noticed What did you notice? 15",
		"    scale biggest How big? 19",
		"    activity-tab second-tab Second tab 23",
		"      group - Step one 25",
		"        choice pick Pick 28",
		"  activity later Later 31",
		"    date when When? 33",
		"data-section week-1 Data for week one 37",
	]);
});

test("named pages sit in their tab, a page under its parent: and a page break in a named page does not cut it", () => {
	const text = bookletAround(
		[
			"> [!activity|wiki] Wiki", // 9
			"",
			"> [!tab|learn] Learn", // 11
			"",
			"> [!page|map icon:book] The garden map", // 13
			"",
			"Where each bed is.",
			"",
			"> [!text|q1] A question on the map", // 17
			"",
			"> [!page|parent:map] Choosing a place", // 19
			"",
			"> [!page|grid] The grid", // 21
			"",
			"One.",
			"",
			"***",
			"",
			"Two.",
			"",
		].join("\n"),
	);
	assert.deepEqual(rows(text), [
		"activity wiki Wiki 9",
		"  activity-tab learn Learn 11",
		"    page map The garden map 13",
		"      text q1 A question on the map 17",
		"      page choosing-a-place Choosing a place 19",
		"    page grid The grid 21",
	]);
});

test("bare activities sit at the top; a file with no activity line is one activity", () => {
	assert.deepEqual(rows(bookletAround("> [!activity|a1] One\n\n> [!text|t1] T\n\n> [!activity|a2] Two\n")), ["activity a1 One 9", "  text t1 T 11", "activity a2 Two 13"]);
	// (the panel named the activity of a note with no activity line by its front matter title; the tree has it as the activity with no line of its own)
	assert.deepEqual(rows(bookletAround("Some words.\n\n> [!text|t1] T\n\n> [!lines|l1] L\n- a\n")), ["activity - - 9", "  text t1 T 11", "  lines l1 L 13"]);
	// `---` after a blank line is a page break; straight under prose it makes the prose a heading, and is not one
	assert.deepEqual(rows(bookletAround("Some words.\n\n> [!text|t1] T\n\n---\n\n> [!lines|l1] L\n- a\n")), ["activity - - 9", "  text t1 T 11", "  lines l1 L 15"]);
	assert.deepEqual(rows(bookletAround("Some words.\n---\n\n> [!text|t1] T\n")), ["activity - - 9", "  text t1 T 12"]);
});

test("records and a menu in a module's opening are listed; hints and reading callouts are not", () => {
	const text = bookletAround(
		"> [!module|m] M\n\n> [!menu|feelings] Feelings\n- calm\n- tense\n\n> [!activity|a] A\n\n> [!text|t] T\n\n> [!hint]-\n> help\n\n> [!note] A note\n\n> [!module|m end]\n\n%%\n> [!records] App record — do not edit below this line\n%%\n",
	);
	assert.deepEqual(rows(text), ["module m M 9", "  menu feelings Feelings 11", "  activity a A 15", "    text t T 17", "records - - 26"]);
});

test("every question kind in one note: one entry per question, ids as written, each on its own line", () => {
	const qs = ["text", "lines", "choice", "multi", "scale", "number", "date", "matrix", "listen"];
	const text = bookletAround("> [!activity|a] A\n\n" + qs.map((k) => `> [!${k}|${k}-1] A ${k}\n`).join("\n"));
	const found = outlineEntries(parseDesign(text)).map((x) => x.node).filter((n) => n.kind === "question");
	assert.deepEqual(found.map((n) => n.detail), qs);
	const lines = text.split("\n");
	for (const q of found) assert.ok(lines[q.start].includes(`[!${q.detail}|${q.id}`), lines[q.start]);
});

test("every entry is a node of the tree it was made from (so a press can select it), in file order, with the depth of the listed blocks around it", () => {
	const root = parseDesign(FULL);
	const entries = outlineEntries(root);
	const all = walkDesign(root);
	let last = -1;
	for (const e of entries) {
		assert.ok(all.includes(e.node));
		assert.ok(e.node.start >= last || e.node.kind === "page", "in file order (a page under its parent may come after its sibling)");
		last = Math.max(last, e.node.start);
	}
	assert.deepEqual(
		entries.map((e) => e.node.kind),
		["module", "module-tab", "module-tab", "activity", "question", "activity", "activity-tab", "page", "page", "activity-tab", "group", "question", "question", "activity", "question", "data-section", "records"],
	);
	assert.ok(entries.every((e) => e.depth >= 0));
});

/* ---------------------------------------------------------------- the lines the reader cannot read */

test("each problem is matched to the innermost block that holds its line", () => {
	const root = parseDesign(UNREAD);
	const troubles = troublesOf(root, problemsOf(UNREAD));
	assert.ok(troubles.length >= 3, "the unreadable fixture has problems");
	for (const { problem, node } of troubles) {
		if (problem.line === null) {
			assert.equal(node, null);
			continue;
		}
		assert.ok(node, `a block for line ${problem.line}`);
		assert.ok(node.start <= problem.line && problem.line < node.end, `line ${problem.line} is in the ${node.kind} at ${node.start}`);
		assert.equal(node, nodeAtLine(root, problem.line));
		for (const c of node.children) assert.ok(!(c.start <= problem.line && problem.line < c.end), "no child of that block holds the line");
	}
	// a line in a question's own lines is the question's, not its activity's
	const text = bookletAround("> [!activity|a] A\n\n> [!text|bad hidden] A setting the kind does not take\n");
	const t = troublesOf(parseDesign(text), problemsOf(text));
	assert.equal(t.length >= 1, true);
	assert.equal(t[0].node.kind, "question");
	assert.equal(t[0].node.start, lineOf(text, "[!text|bad"));
});

test("the lists come from the reading they are given, as the panel's [10] required: a reading handed in is the only one used", () => {
	// (ported from the panel's model test: the problems of a made-up reading, not a second reading of the text)
	const lines = HELD.split("\n");
	const book = { ...parseBooklet(HELD), ok: false, refusal: "A sentinel refusal." };
	const ps = problemsOfBook(book, lines);
	assert.ok(ps.some((p) => p.why === "A sentinel refusal."), "the problems come from the book it was given");
	const t = troublesOf(parseDesign(HELD), ps);
	assert.ok(t.some((x) => x.problem.why === "A sentinel refusal." && x.node === null), "a problem of the whole note belongs to no block");
	assert.deepEqual(troublesOf(parseDesign(HELD), []), [], "no problems, no entries");
});

test("kept data that matches nothing is a problem of its own kind, so the view can list it apart from the lines the reader cannot read", () => {
	const renamed = HELD.replace("[!activity|log repeat]", "[!activity|diary repeat]");
	const t = troublesOf(parseDesign(renamed), problemsOf(renamed));
	const left = t.filter((x) => x.problem.kind === "leftover");
	assert.ok(left.length >= 1);
	assert.ok(left.some((x) => /12 kept entries for the activity `log`/.test(x.problem.why)), left.map((x) => x.problem.why).join(" | "));
	assert.ok(left.every((x) => x.node), "each is matched to a block");
	assert.equal(troublesOf(parseDesign(HELD), problemsOf(HELD)).filter((x) => x.problem.kind === "leftover").length, 0);
});
