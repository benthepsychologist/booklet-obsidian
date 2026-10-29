/*
 * Plugin 0.7.0, after the cold review of the draft: a row around a group or a callout that holds a question; a step's group
 * drawn open; ids that no two panes share; a live region set only when it changes; the marks a multi's Check puts up taken
 * away by a change of the picks; the one rule for a footnote's mark in code and maths; a source opened from a list item or a
 * table cell; and the places the first review found no test for. Every note is made up.
 *
 * Which tests fail without a fix: all but the ten whose title starts "[pin]". Those ten pin behaviour that was already right
 * (the places the reviews found a mutation that no test noticed), so there is no fix for them to fail without; each was
 * broken once by hand to show it fails when that behaviour is changed. Against the 0.7.0 draft's source (97e1086) the first
 * twenty tests of this file split 13 that fail and 7 that pass.
 */
import { click, openView, typeInto, window as w, until, quiet, words } from "./dom.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, SKETCH, assertOutsideUnchanged, core, norm } from "./helpers.mjs";
import { pane } from "./pane.mjs";

const { drawMarks, keepStepsOne, loadStepsOne, moveHeld, keepHeld, loadHeld } = await import("./.build/screens.mjs");

const READING = readFileSync(join(ROOT, "test-vault", "Reading and steps.booklet.md"), "utf8");
const head = 'booklet: "0.16"';
const note = (body) => `---\n${head}\n---\n\n> [!activity|a] A\n\n${body}\n`;
/** A device store, as Obsidian's saveLocalStorage keeps one; `one` holds the steps one at a time. */
function store(one) {
	const m = new Map();
	if (one) m.set("booklet-steps:Note.booklet.md", JSON.stringify("one"));
	return { loadLocalStorage: (k) => (m.has(k) ? JSON.parse(m.get(k)) : null), saveLocalStorage: (k, d) => (d === null ? m.delete(k) : m.set(k, JSON.stringify(d))), m };
}
/** A note open on one activity's screen. */
function open(text, screen = "a", { one = false } = {}) {
	const s = store(one);
	const p = pane(text, { screen: `activity:/${screen}`, appMore: s });
	return Object.assign(p, { store: s, q: (id) => p.el.querySelector(`[data-booklet-q="${id}"]`) });
}
const choice = (q, text) => [...q.querySelectorAll(".booklet-choice")].find((b) => words(b).startsWith(text));
const press = async (p, el) => {
	click(el);
	await p.settled();
};
const answers = (text) => norm(core.parseBooklet(text).records.answers[""] ?? {});

/* ---- a row around a group, or around a callout that holds a question ---- */

const inRow = (inner) => note(`> [!row]\n\n${inner}\n\n> [!row|end]\n`);

test("rows: a group, or a tip that holds a question, in a row's cell stays a box in that cell; the row, its cells and the question are all there and nothing is listed", () => {
	const group = core.parseBooklet(inRow(`### A\n\ntext\n\n> [!group] G\n> > [!text|x] X\n\n### B\n\nmore`));
	assert.deepEqual(group.problems, [], "the row is not closed at the end of the group, nor its own end line refused");
	const tree = core.treeOf(group.activities[0].segments);
	assert.deepEqual(norm(tree.map((n) => n.type)), ["row-box"]);
	assert.equal(tree[0].cells.length, 2, "two headings, two cells");
	assert.deepEqual(norm(tree[0].cells[0].map((n) => n.type)), ["prose", "callout-box"], "the group is a box inside the first cell");
	assert.deepEqual(core.questionsIn(tree[0].cells[0][1].children).map((q) => q.id), ["x"], "and the question is the group's");
	assert.deepEqual(core.questionsIn(tree).map((q) => q.id), ["x"]);
	assert.match(tree[0].cells[1][0].markdown, /^### B/);
	const tip = core.parseBooklet(inRow(`### A\n\n> [!tip] T\n> > [!text|y] Y\n\n### B\n\nmore`));
	assert.deepEqual(tip.problems, []);
	const tt = core.treeOf(tip.activities[0].segments);
	assert.deepEqual(norm(tt.map((n) => n.type)), ["row-box"]);
	assert.deepEqual(norm(tt[0].cells[0].map((n) => n.type)), ["prose", "callout-box"], "a tip that holds a question, likewise");
	assert.deepEqual(core.questionsIn(tt).map((q) => q.id), ["y"]);
	// a second row after the first, and a group outside any row, are as before
	const two = core.parseBooklet(note(`> [!row]\n\n### A\n\n> [!group] G\n> > [!text|x] X\n\n> [!row|end]\n\n> [!group] H\n> > [!text|z] Z\n\n> [!row]\n\n### C\n\nc\n\n> [!row|end]\n`));
	assert.deepEqual(two.problems, []);
	assert.deepEqual(norm(core.treeOf(two.activities[0].segments).map((n) => n.type)), ["row-box", "callout-box", "row-box"]);
});

test("[pin] rows: a row line inside a callout cannot be, and is listed; nothing it was written around is lost", () => {
	const b = core.parseBooklet(note(`> [!group] G\n> > [!text|x] X\n>\n> > [!row]\n>\n> Words in the group.\n\n> [!row|end]\n`));
	const said = b.problems.join("\n");
	assert.match(said, /a row line cannot go inside a callout, so it was ignored/);
	assert.match(said, /a row is closed that was never opened/, "the end line outside has nothing to close");
	assert.doesNotMatch(said, /still open/, "and nothing is said of a row left open at the end of the callout");
	const tree = core.treeOf(b.activities[0].segments);
	assert.deepEqual(norm(tree.map((n) => n.type)), ["callout-box"]);
	assert.deepEqual(core.questionsIn(tree).map((q) => q.id), ["x"]);
});

test("rows: the tree of segments keeps a callout opened in a cell as a box in the cell, closes a row only where its own line ends it, and holds a row left open at the end", () => {
	const row = (end) => ({ type: "row", end, line: 1 });
	const call = { type: "callout", kind: "group", title: "", fold: "", line: 2 };
	const end = { type: "callout-end" };
	const q = { type: "question", id: "q" };
	const t1 = core.treeOf([row(false), call, q, end, row(true)]);
	assert.deepEqual(norm(t1.map((n) => n.type)), ["row-box"]);
	assert.deepEqual(norm(t1[0].cells), [[{ type: "callout-box", start: call, children: [q] }]]);
	// the row is still open after the callout ends: what follows is in the row
	const t2 = core.treeOf([row(false), call, end, q, row(true)]);
	assert.deepEqual(norm(t2[0].cells.map((c) => c.map((n) => n.type))), [["callout-box"], ["question"]]);
	// a row and a callout both left open at the end: the row is the outer, so it is the one in the tree's root
	const t3 = core.treeOf([row(false), call, q]);
	assert.deepEqual(norm(t3.map((n) => n.type)), ["row-box"]);
	assert.deepEqual(core.questionsIn(t3).map((x) => x.id), ["q"]);
	// a row end line inside an open callout does not end a row opened outside it
	const t4 = core.treeOf([row(false), call, row(true), q, end]);
	assert.deepEqual(core.questionsIn(t4).map((x) => x.id), ["q"]);
	assert.deepEqual(norm(t4.map((n) => n.type)), ["row-box"]);
});

test("view: a row around a group and around a tip with a question draws the row, both cells, and each question in its own box", async () => {
	const p = open(READING, "around");
	await p.settled();
	const row = p.el.querySelector(".booklet-row");
	assert.ok(row, "the row is drawn");
	const cells = [...row.querySelectorAll(":scope > .booklet-rowcell")];
	assert.equal(cells.length, 2);
	assert.match(words(cells[0]), /The group side/);
	assert.ok(cells[0].querySelector(".booklet-group [data-booklet-q=around-q]"), "the group, with its question, is in the first cell");
	assert.match(words(cells[1]), /The tip side/);
	assert.ok(cells[1].querySelector(".callout [data-booklet-q=around-tip]"), "the tip, with its question, is in the second cell");
	assert.equal(p.el.querySelectorAll(".booklet-problems li").length, 0, "nothing is listed");
	assert.match(words(p.el.querySelector(".booklet-pagebody")), /Words after the row\.$/, "and what follows the row follows it");
	const before = p.disk.text;
	await press(p, choice(p.q("around-q"), "Yes"));
	assert.equal(answers(p.disk.text)["around-q"], 1, "the question in the cell is answered like any other");
	assertOutsideUnchanged(before, p.disk.text, "answering in a cell");
	p.close();
});

/* ---- a step draws its group open ---- */

test("steps: a step draws its group open though the note wrote it folded; the reader's fold of it is kept while the view is open and written nowhere; a lone group is still folded", async () => {
	const p = open(READING, "lesson", { one: true });
	await p.settled();
	const g = () => p.q("extra").closest(".booklet-group");
	assert.ok(!g().classList.contains("is-collapsed"), "written [!group]-, as a step it is drawn open");
	assert.equal(g().querySelector(".booklet-group-body").hidden, false);
	assert.equal(g().querySelector(".booklet-group-title").getAttribute("aria-expanded"), "true");
	await press(p, g().querySelector(".booklet-group-title"));
	assert.ok(g().classList.contains("is-collapsed"), "the reader can fold it");
	p.view.setViewData(p.disk.text, false);
	await p.settled();
	assert.ok(g().classList.contains("is-collapsed"), "and it stays as they left it through a drawing");
	assert.equal(p.disk.writes, 0, "nothing is written for it");
	p.close();
	// all at once it is drawn as written: folded; and a group alone is no step
	const all = open(READING, "lesson");
	await all.settled();
	assert.ok(all.q("extra").closest(".booklet-group").classList.contains("is-collapsed"));
	all.close();
	const lone = open(READING, "plain", { one: true });
	await lone.settled();
	assert.ok(lone.q("alone").closest(".booklet-group").classList.contains("is-collapsed"), "a lone group is no step");
	lone.close();
});

/* ---- ids no two panes share ---- */

test("ids: two panes on one screen at once give every id once, and each pane's aria-controls and aria-labelledby resolve inside that pane", async () => {
	const a = pane(SKETCH, { screen: "module:basics" });
	const b = pane(SKETCH, { screen: "module:basics" });
	await a.settled();
	await b.settled();
	const ids = (p) => p.all("[id]").map((e) => e.id);
	const all = [...ids(a), ...ids(b)];
	assert.ok(all.length > 4);
	assert.equal(new Set(all).size, all.length, "no id is in both panes, or twice");
	for (const p of [a, b]) {
		const refs = p.all("[aria-controls], [aria-labelledby]");
		assert.ok(refs.length >= 2, "a tab and its panel point at each other");
		for (const e of refs) {
			for (const id of `${e.getAttribute("aria-controls") ?? ""} ${e.getAttribute("aria-labelledby") ?? ""}`.split(/\s+/).filter(Boolean)) {
				assert.ok(p.el.querySelector(`#${id}`), `${id} is in the pane that points at it`);
				assert.equal(w.document.querySelectorAll(`#${id}`).length <= 1, true, `${id} is the only one in the document`);
			}
		}
	}
	// a pane drawn again takes new ids and still keeps them apart
	await a.tab("Read first");
	const again = [...ids(a), ...ids(b)];
	assert.equal(new Set(again).size, again.length);
	a.close();
	b.close();
});

/* ---- a live region is set only when it changes ---- */

test("live regions: an answered question's line and the steps' status are not set again by an answer elsewhere", async () => {
	const text = note(`> [!choice|flyer] Which one flies?\n- [ ] A penguin\n- [x] A sparrow\n\n> [!choice|b] B\n- [ ] One\n- [ ] Two\n\n> [!choice|c] C\n- [ ] One\n- [ ] Two\n\n> [!choice|d] D\n- [ ] One\n- [ ] Two\n`);
	const p = open(text);
	await p.settled();
	await press(p, choice(p.q("flyer"), "A penguin"));
	const live = p.q("flyer").querySelector(".booklet-live");
	assert.equal(words(live), "Not quite. The answer is A sparrow.");
	let seen = 0;
	const watch = new w.MutationObserver((rs) => (seen += rs.length));
	watch.observe(live, { childList: true, characterData: true, subtree: true });
	for (const id of ["b", "c", "d"]) await press(p, choice(p.q(id), "One"));
	await new Promise((r) => setTimeout(r, 0));
	watch.disconnect();
	assert.equal(seen, 0, "three presses elsewhere did not write the line again");
	assert.equal(words(live), "Not quite. The answer is A sparrow.");
	// and the line does change when its own question's answer does
	await press(p, choice(p.q("flyer"), "A sparrow"));
	assert.equal(words(live), "Right.");
	p.close();
	const s = open(READING, "lesson", { one: true });
	await s.settled();
	const status = s.el.querySelector(".booklet-steps-progress");
	let moved = 0;
	const w2 = new w.MutationObserver((rs) => (moved += rs.length));
	w2.observe(status, { childList: true, characterData: true, subtree: true });
	await press(s, choice(s.q("moon"), "The moon"));
	await press(s, choice(s.q("moon"), "The wind"));
	await new Promise((r) => setTimeout(r, 0));
	assert.equal(moved, 0, "an answer in the step on show does not write the status again");
	await s.pageNext();
	await new Promise((r) => setTimeout(r, 0));
	assert.ok(moved > 0 && words(status) === "Step 2 of 4", "a move to another step does");
	w2.disconnect();
	s.close();
});

/* ---- a multi's marks go when the picks change ---- */

test("check: a change of the picks after Check takes the marks and the replies away for good, as the reference renderer does; picking back does not bring them back; Check again does", async () => {
	const text = note(`> [!multi|m] Which are fruit?\n- [x] Apple\n  - Right, an apple.\n- [ ] Rock\n- [x] Pear\n`);
	const p = open(text);
	await p.settled();
	const marks = () => [...p.q("m").querySelectorAll(".booklet-mark")].map(words);
	const live = () => words(p.q("m").querySelector(".booklet-live"));
	await press(p, choice(p.q("m"), "Apple"));
	await press(p, choice(p.q("m"), "Pear"));
	assert.deepEqual(marks(), ["", "", ""], "no marks before Check");
	await press(p, [...p.q("m").querySelectorAll(".booklet-acts button")].find((b) => words(b) === "Check"));
	assert.deepEqual(marks().map((x) => x.length > 0), [true, false, true], "the marks are up after Check");
	assert.equal(live(), "Right.");
	await press(p, choice(p.q("m"), "Pear"));
	assert.deepEqual(marks(), ["", "", ""], "a pick taken back takes the marks away");
	assert.equal(live(), "");
	await press(p, choice(p.q("m"), "Pear"));
	assert.deepEqual(marks(), ["", "", ""], "putting it back does not bring them back");
	assert.equal(live(), "");
	assert.equal(p.q("m").querySelectorAll(".booklet-reply").length, 0, "the replies stay away until Check");
	await press(p, [...p.q("m").querySelectorAll(".booklet-acts button")].find((b) => words(b) === "Check"));
	assert.equal(live(), "Right.", "Check again puts them up");
	assert.deepEqual(answers(p.disk.text).m, [1, 3]);
	p.close();
});

test("[pin] check: an extra wrong pick in a multi is not right, whatever the right ones are", async () => {
	const text = note(`> [!multi|m] Which are fruit?\n- [x] Apple\n- [ ] Rock\n- [x] Pear\n`);
	const p = open(text);
	await p.settled();
	for (const o of ["Apple", "Pear", "Rock"]) await press(p, choice(p.q("m"), o));
	await press(p, [...p.q("m").querySelectorAll(".booklet-acts button")].find((b) => words(b) === "Check"));
	assert.equal(words(p.q("m").querySelector(".booklet-live")), "Not quite. The answer is Apple, Pear.");
	assert.ok(choice(p.q("m"), "Rock").classList.contains("booklet-wrong"), "the extra pick is marked wrong");
	assert.ok(choice(p.q("m"), "Apple").classList.contains("booklet-right"));
	p.close();
});

/* ---- a footnote's mark: one rule for the numbers and the drawing ---- */

const ids = (md) => {
	const out = [];
	core.tokenise(md, out);
	return out;
};

test("marks: a footnote mark in indented code, in a fence at any indent, in a code span of any length, or in maths is no mark; the numbers and the drawing agree", () => {
	const O = core.MARK_OPEN;
	const C = core.MARK_CLOSE;
	assert.equal(core.tokenise("A[^a] b.", []), `A${O}0${C} b.`, "a mark is a mark");
	// indented code, after a blank line
	assert.equal(core.tokenise("Text.\n\n    [^1] in code\n\nAfter[^2]", []), `Text.\n\n    [^1] in code\n\nAfter${O}0${C}`);
	assert.deepEqual(ids("Text.\n\n    [^1] in code\n\n\t[^1] too\n\nAfter[^2]"), ["2"]);
	// four spaces right after a line of text are the text going on, and a list item's own indent is not code
	assert.deepEqual(ids("Text\n    [^3] goes on"), ["3"]);
	assert.deepEqual(ids("- item\n\n    more words[^4]"), ["4"], "in a list item it is a paragraph of the item");
	// a fence in a list item, indented
	assert.deepEqual(ids("- item\n\n    ```\n    [^5] in the fence\n    ```\n\n    after[^6]"), ["6"]);
	// a longer fence is not closed by a shorter fence line, nor a tilde fence by backticks
	assert.deepEqual(ids("````\n```\n[^7] still in\n````\n[^8]"), ["8"], "a shorter fence line does not close a longer fence");
	assert.deepEqual(ids("~~~\n```\n[^9] still in\n~~~\n[^10]"), ["10"], "nor a fence of the other mark");
	assert.deepEqual(ids("```\n[^11] in an unclosed fence"), [], "an unclosed fence runs to the end");
	// code spans: the run that opens one closes it
	assert.deepEqual(ids("``a`b [^12]`` then [^13]"), ["13"], "a span with a backtick in it");
	assert.deepEqual(ids("``[^14]``[^15]"), ["15"], "a double-backtick span with a mark in it");
	assert.deepEqual(ids("`[^16]` and `x [^17]`"), [], "single spans");
	assert.deepEqual(ids("a ` b [^18] c"), ["18"], "a backtick with no mate is only a backtick");
	// maths
	assert.deepEqual(ids("$x[^19]$ then [^20]"), ["20"]);
	assert.deepEqual(ids("$$\n[^21]\n$$\n[^22]"), ["22"]);
	assert.deepEqual(ids("It costs $5 and [^23] costs $6"), ["23"], "dollar signs that are not maths");
	// a definition's label is where a note is defined, not a mark
	assert.deepEqual(ids("[^24]: Words with [^25] in them."), ["25"]);
	// the numbers are the ids the drawing takes
	const md = "A[^a] ``[^c]`` B[^b]\n\n```\n[^z]\n```\n\n    [^y]\n\nC[^a]";
	assert.deepEqual(core.marksIn(md), ids(md));
	assert.deepEqual(core.marksIn(md), ["a", "b", "a"]);
});

/* ---- a source opened from a list item or a table cell ---- */

const cite = (...notes) => ({ scope: "", notes: { notes: notes.map((id) => ({ id, scope: "", text: `Words for ${id}.`, line: 1, source: null })) }, numbers: new Map(notes.map((id, i) => [id, i + 1])) });
const host = { md: (m, el) => el.appendText(m), uid: () => "u" };
const mark = (id, n) => `${core.MARK_OPEN}${n}${core.MARK_CLOSE}`;
function drawn(html, ids) {
	const el = w.document.createElement("div");
	w.document.body.appendChild(el);
	el.innerHTML = html;
	const panel = { open: null };
	drawMarks(host, el, ids, cite(...ids), panel);
	return { el, panel };
}

test("marks: a source opened from a tight list item goes inside the item, after its content, and shuts again; a table's goes in a row of its own across it", () => {
	const { el, panel } = drawn(`<ul><li>First item ${mark("a", 0)}</li><li>Second</li></ul>`, ["a"]);
	const btn = el.querySelector("button.booklet-cite-mark");
	click(btn);
	const li = el.querySelector("li");
	const src = el.querySelector(".booklet-cite-panel");
	assert.equal(src.parentElement, li, "the source is inside the item");
	assert.equal(li.lastElementChild, src, "after its content");
	assert.ok([...el.querySelector("ul").children].every((c) => c.tagName === "LI"), "the list holds only items");
	click(btn);
	assert.equal(el.querySelectorAll(".booklet-cite-panel").length, 0);
	assert.equal(panel.open, null);
	el.remove();
	const t = drawn(`<table><thead><tr><th>Head ${mark("a", 0)}</th><th>Two</th></tr></thead><tbody><tr><td>One</td><td>Cell ${mark("b", 1)}</td></tr><tr><td>Three</td><td>Four</td></tr></tbody></table>`, ["a", "b"]);
	const marks = [...t.el.querySelectorAll("button.booklet-cite-mark")];
	click(marks[1]);
	const body = t.el.querySelector("tbody");
	assert.deepEqual([...body.children].map((r) => r.className), ["", "booklet-cite-row", ""], "a row of its own under the cell's row");
	const row = body.children[1];
	assert.deepEqual([...row.children].map((c) => c.tagName), ["TD"]);
	assert.equal(row.firstElementChild.getAttribute("colspan"), "2", "across the whole table");
	assert.ok(row.querySelector(".booklet-cite-panel"));
	assert.ok([...t.el.querySelectorAll("tr")].every((r) => [...r.children].every((c) => c.tagName === "TD" || c.tagName === "TH")), "a row holds only cells");
	click(marks[0]);
	assert.equal(body.querySelectorAll(".booklet-cite-row").length, 0, "the first row is gone when another source opens");
	assert.equal(t.el.querySelectorAll(".booklet-cite-panel").length, 1);
	assert.deepEqual([...t.el.querySelector("thead").children].map((r) => r.className), ["", "booklet-cite-row"], "a header cell's source is a row under the header row");
	click(marks[0]);
	assert.equal(t.el.querySelectorAll(".booklet-cite-panel, .booklet-cite-row").length, 0);
	t.el.remove();
});

test("marks: a token in code or a pre block is left alone; one in text is a mark", () => {
	const { el } = drawn(`<p>Text ${mark("a", 0)}</p><p><code>${mark("a", 1)}</code></p><pre>${mark("a", 2)}</pre>`, ["a", "a", "a"]);
	assert.equal(el.querySelectorAll("button.booklet-cite-mark").length, 1, "only the one in the paragraph");
	assert.equal(el.querySelector("code").textContent.includes(core.MARK_OPEN), true, "the other two are left as they were");
	el.remove();
});

/* ---- a reader's fold of a callout ---- */

test("[pin] callouts: a reader's fold or open of any callout that holds a question is kept while the view is open, over a drawing, and never written", async () => {
	const text = note(`> [!tip]- A folded tip\n> Words.\n>\n> > [!text|t] In a tip\n\n> [!group]+ An open group\n> Words.\n>\n> > [!text|g] In a group\n`);
	const p = open(text);
	await p.settled();
	const tip = () => p.q("t").closest(".callout");
	const group = () => p.q("g").closest(".booklet-group");
	assert.ok(tip().classList.contains("is-collapsed"), "the tip starts folded as written");
	assert.ok(!group().classList.contains("is-collapsed"));
	await press(p, tip().querySelector(".callout-title"));
	await press(p, group().querySelector(".booklet-group-title"));
	assert.ok(!tip().classList.contains("is-collapsed") && group().classList.contains("is-collapsed"), "opened and folded");
	// the screen is left and drawn again: what the reader chose is what comes back
	await p.view.setState({ version: 1, screen: "home" }, {});
	await p.settled();
	assert.equal(p.q("t"), null, "the activity is not on screen");
	await p.view.setState({ version: 1, screen: "activity:/a" }, {});
	await p.settled();
	assert.ok(!tip().classList.contains("is-collapsed"), "the tip stays open through a drawing");
	assert.ok(group().classList.contains("is-collapsed"), "the group stays folded through a drawing");
	assert.equal(p.disk.writes, 0, "nothing was written");
	p.close();
});

/* ---- the pager and a page of steps ---- */

test("[pin] steps: Back from the first step of a page lands on the previous page's last step, as the reference renderer turns back; Next arrives on a page's first step not done", async () => {
	const g = (n, id) => `> [!group] Step ${n}\n> Words ${n}.\n>\n> > [!text|${id}] Q${n}\n`;
	const text = note(`${g(1, "a1")}\n${g(2, "a2")}\n${g(3, "a3")}\n***\n\n${g(4, "b1")}\n${g(5, "b2")}\n`);
	const p = open(text, "a", { one: true });
	await p.settled();
	const shown = () => [...p.el.querySelectorAll(".booklet-step")].findIndex((s) => !s.hidden) + 1;
	assert.equal(shown(), 1);
	await p.pageNext();
	await p.pageNext();
	assert.equal(shown(), 3);
	await p.pageNext();
	assert.match(p.pager().at, /2/, "the next page");
	assert.equal(p.el.querySelectorAll(".booklet-step").length, 2);
	assert.equal(shown(), 1, "arriving forward: its first step");
	await p.pageBack();
	assert.match(p.pager().at, /1/, "back on the first page");
	assert.equal(shown(), 3, "arriving back: its last step");
	assert.equal(words(p.el.querySelector(".booklet-steps-progress")), "Step 3 of 3");
	p.close();
});

/* ---- a matrix with every item cleared keeps no answer ---- */

test("[pin] matrix: pressing the picked anchor of the only answered item clears it and the whole answer is taken out; the other items' answers stay", async () => {
	const text = note(`> [!matrix|m] How was each?\n- Walk\n- Swim\n\n0. Bad\n1. Good\n`);
	const p = open(text);
	await p.settled();
	const anchors = (i) => [...p.q("m").querySelectorAll(".booklet-mxitem")[i].querySelectorAll("button")];
	await press(p, anchors(0)[1]);
	assert.deepEqual(answers(p.disk.text).m, [1, null]);
	await press(p, anchors(1)[0]);
	assert.deepEqual(answers(p.disk.text).m, [1, 0]);
	await press(p, anchors(0)[1]);
	assert.deepEqual(answers(p.disk.text).m, [null, 0], "one item cleared, the other stays");
	await press(p, anchors(1)[0]);
	assert.equal(answers(p.disk.text).m, undefined, "every item cleared: no answer at all, not a list of nulls");
	assert.ok(!/"m"/.test(p.disk.text.slice(p.disk.text.indexOf("%%"))), "and none on disk");
	p.close();
	// and a copy of it asked for a pick: clearing its one answer takes that pick's pair away
	const each = open(note(`> [!choice|src] Which?\n- [ ] One\n\n> [!matrix|mm each:src] How was each?\n- Walk\n- Swim\n\n0. Bad\n1. Good\n`));
	await each.settled();
	await press(each, choice(each.q("src"), "One"));
	const copyAnchor = () => each.q("mm").querySelector(".booklet-copy .booklet-mxitem button");
	await press(each, copyAnchor());
	assert.deepEqual(answers(each.disk.text).mm, [{ pick: 1, a: [0, null] }]);
	await press(each, each.q("mm").querySelector(".booklet-copy .booklet-mxitem .booklet-choice.mod-cta") ?? copyAnchor());
	assert.equal(answers(each.disk.text).mm, undefined, "the pick's only answer cleared: no pair is kept");
	each.close();
});

/* ---- words typed in two copies at once are both kept ---- */

test("[pin] each: words typed in the fields of two copies and not yet written are both kept, each to its own pick, when the view lets go", async () => {
	const text = note(`> [!multi|tools] Which tools?\n- [ ] Pencil\n- [ ] Ruler\n\n> [!text|why each:tools] Why that one?\n`);
	const v = openView(text, { screen: "activity:/a" });
	const root = v.view.contentEl;
	const click1 = (label) => click([...root.querySelectorAll('[data-booklet-q="tools"] .booklet-choice')].find((b) => words(b).startsWith(label)));
	click1("Pencil");
	click1("Ruler");
	await v.settled();
	const field = (pick) => root.querySelector(`.booklet-copy[data-booklet-pick="n:${pick}"] textarea, .booklet-copy[data-booklet-pick="n:${pick}"] input`);
	assert.ok(field(1) && field(2), "a copy under each pick");
	typeInto(field(1), "Because it rubs out");
	typeInto(field(2), "Because it is straight");
	// no blur and no pause: both are waiting in the view when it lets go of the note
	v.view.flushAll();
	await v.settled();
	assert.deepEqual(answers(v.disk.text).why, [{ pick: 1, a: "Because it rubs out" }, { pick: 2, a: "Because it is straight" }], "neither took the other's place");
	v.close();
});

/* ---- a failed move leaves no focus to take ---- */

test("focus: a step move the pane refuses does not leave the view ready to take focus on the next drawing; a move that lands does take it", async () => {
	const p = pane(SKETCH, { screen: "module:basics" });
	await p.settled();
	const input = w.document.createElement("input");
	w.document.body.appendChild(input);
	input.focus();
	const real = p.leaf.setViewState;
	p.leaf.setViewState = async () => {
		throw new Error("refused");
	};
	click(p.all(".booklet-cardrow")[0]);
	await p.settled();
	assert.equal(p.view.focusScreen, false, "the refused move cleared it");
	p.leaf.setViewState = real;
	// the pane then draws another screen on its own (Obsidian's Back, say): focus is left where it was
	await p.view.setState({ version: 1, screen: "home" }, {});
	await p.settled();
	assert.equal(w.document.activeElement, input, "focus was not taken");
	await p.card(p.cards()[0]);
	assert.notEqual(w.document.activeElement, input, "a press that moves does take it");
	input.remove();
	p.close();
});

/* ---- the choice of steps goes with a renamed note ---- */

test("held store: a renamed note takes its steps choice with it, and its held words; the old name is left with nothing", () => {
	const m = new Map();
	const app = { loadLocalStorage: (k) => (m.has(k) ? JSON.parse(m.get(k)) : null), saveLocalStorage: (k, d) => (d === null ? m.delete(k) : m.set(k, JSON.stringify(d))) };
	keepStepsOne(app, "Old.booklet.md", true);
	keepHeld(app, "Old.booklet.md", "a#own", "typed");
	moveHeld(app, "Old.booklet.md", "New.booklet.md");
	assert.equal(loadStepsOne(app, "New.booklet.md"), true);
	assert.equal(loadStepsOne(app, "Old.booklet.md"), false);
	assert.deepEqual({ ...loadHeld(app, "New.booklet.md") }, { "a#own": "typed" });
	assert.deepEqual([...m.keys()].sort(), ["booklet-held:New.booklet.md", "booklet-steps:New.booklet.md"]);
	// a note with only a steps choice moves it too, and one with nothing moves nothing
	keepStepsOne(app, "Solo.booklet.md", true);
	moveHeld(app, "Solo.booklet.md", "Solo2.booklet.md");
	moveHeld(app, "None.booklet.md", "None2.booklet.md");
	assert.equal(loadStepsOne(app, "Solo2.booklet.md"), true);
	assert.equal(loadStepsOne(app, "None2.booklet.md"), false);
});

/* ---- the test waits fail loudly ---- */

test("[pin] waits: quiet fails at once, saying which field, when the view lacks one it reads; until passes at once on a state that holds", async () => {
	await assert.rejects(quiet({ writes: Promise.resolve(), moving: false, rendering: 0 }), /afterMove/);
	await assert.rejects(quiet({}), /writes/);
	await until(() => true, "a state that holds");
});

/* ---- the footnote mark's touch area on the phone ---- */

test("styles: on the phone a footnote mark's touch area is a 44px square about the number and its line is not made taller", () => {
	const css = readFileSync(join(ROOT, "styles.css"), "utf8");
	assert.match(css, /\.is-mobile \.booklet-view button\.booklet-cite-mark \{\s*min-height: 0;/, "the line is not stretched");
	const rule = /\.is-mobile \.booklet-view button\.booklet-cite-mark::after \{([^}]*)\}/.exec(css);
	assert.ok(rule, "a phone rule for the touch area");
	assert.match(rule[1], /height:\s*44px/);
	assert.match(rule[1], /width:\s*max\(44px,/);
});

/* ---- the second review: a list item's later paragraphs, maths in a row, a long line, a repeated line, the survivors ---- */
/* (the [pin] tests below pin behaviour that was already right) */

test("marks: a list item goes on through its later paragraphs and nested items; an unindented line ends it, and indented code after a blank line outside a list is still code", () => {
	assert.deepEqual(ids("- item\n\n  second paragraph\n\n    - nested mark[^1]"), ["1"], "a nested item after the item's second paragraph");
	assert.deepEqual(ids("1. item\n\n   second paragraph\n\n     more[^2]"), ["2"], "a numbered item's, deeper still");
	assert.deepEqual(ids("- item\n\n  second paragraph\n\n      [^3] deep in the item"), ["3"], "an item's own paragraph that is indented past four is the item's, as before");
	assert.deepEqual(ids("- item\n\nA paragraph out of the list.\n\n    [^4] this is code"), [], "an unindented line ends the list; four spaces after it are code");
	assert.deepEqual(ids("Text.\n\n    [^5] in code\n\nAfter[^6]"), ["6"], "outside any list it is code");
	assert.deepEqual(ids("- item\n\n  second\n\nA paragraph.\n\n    [^7] code"), [], "after the list's later paragraph and then an unindented line, code");
});

test("[pin] marks: a closing fence with text after it does not close; a backtick fence with a backtick in its words is no fence; a dollar before a digit does not close maths, nor a dollar before a space open it", () => {
	assert.deepEqual(ids("```\n[^1] in\n``` js\n[^2] still in\n```\n[^3]"), ["3"], "``` js is not a closing fence");
	assert.deepEqual(ids("``` a`b [^4] c\n[^5]"), ["4", "5"], "a line that starts with three backticks and has another in its words is a code span, not a fence");
	assert.deepEqual(ids("It was US$5 [^6] and US$6 more"), ["6"], "$5 ... $6 is two prices, not maths");
	assert.deepEqual(ids("It is $ [^7] and x$ more"), ["7"], "a dollar followed by a space opens nothing");
	assert.deepEqual(ids("It was $x [^8]$ then [^9]"), ["9"], "and a pair that is maths still is");
});

test("marks: the cells of a row and the marks agree when a display-maths block holds a heading-like line; a heading in it starts no cell", async () => {
	const prose = "$$\n# x\n[^1] inside display maths\n$$";
	assert.deepEqual(ids(prose), [], "inside the maths it is no mark");
	const cells = core.cellsOf([{ type: "prose", markdown: prose, line: 1 }]);
	assert.equal(cells.length, 1, "one cell: the maths block is not cut at its heading-like line");
	assert.equal(cells[0][0].markdown, prose);
	// a heading outside maths still starts a cell, and a blank line inside maths does not end a block
	const two = core.cellsOf([{ type: "prose", markdown: "### A\n\n$$\n# x\n\n[^1]\n$$\n\n### B\n\nb", line: 1 }]);
	assert.equal(two.length, 2);
	assert.match(two[0][0].markdown, /^### A\n\n\$\$\n# x\n\n\[\^1\]\n\$\$$/);
	assert.equal(core.cellsOf([{ type: "prose", markdown: "$$\na\n\nb\n$$\n\nc", line: 1 }]).length, 2, "with no heading each block is a cell, the maths block whole");
	// drawn: no broken mark, and no mark
	const p = open(`---\n${head}\n---\n\n> [!activity|a] A\n\n> [!row]\n\n${prose}\n\n> [!row|end]\n\n[^1]: A note.\n`);
	await p.settled();
	assert.equal(p.el.querySelectorAll("button.booklet-cite-mark").length, 0, "no mark");
	assert.equal(p.el.querySelectorAll(".booklet-cite-broken, .booklet-cite-missing").length, 0, "and no [?1]");
	assert.doesNotMatch(words(p.el.querySelector(".booklet-pagebody")), /\[\?1\]/);
	p.close();
});

test("marks: a line of fifty thousand backticks and of single dollar signs is scanned in linear time", () => {
	const t0 = Date.now();
	core.tokenise("`a ".repeat(50000) + "[^1]", []);
	core.tokenise("`".repeat(100000) + "[^1]", []);
	core.tokenise(("`" + "``".repeat(1) + " ").repeat(30000) + "[^2]", []);
	core.tokenise("$a ".repeat(50000) + "[^3]", []);
	const ms = Date.now() - t0;
	assert.ok(ms < 1500, `took ${ms} ms`);
});

test("[pin] marks: Escape inside an open source shuts it and gives the focus back to the mark that opened it", () => {
	const { el, panel } = drawn(`<p>Words ${mark("a", 0)}</p>`, ["a"]);
	const btn = el.querySelector("button.booklet-cite-mark");
	click(btn);
	const src = el.querySelector(".booklet-cite-panel");
	assert.ok(src, "open");
	(src.querySelector("button") ?? src).focus();
	assert.notEqual(w.document.activeElement, btn);
	src.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
	assert.equal(el.querySelectorAll(".booklet-cite-panel").length, 0, "shut");
	assert.equal(panel.open, null);
	assert.equal(w.document.activeElement, btn, "the focus is back on the mark");
	el.remove();
});

test("[pin] steps: Next to a page already visited forgets the step it was left on and arrives on the first step not done", async () => {
	const g = (n, id) => `> [!group] Step ${n}\n> Words ${n}.\n>\n> > [!choice|${id}] Q${n}\n> - [ ] Yes\n> - [ ] No\n`;
	const text = note(`${g(1, "a1")}\n${g(2, "a2")}\n***\n\n${g(3, "b1")}\n${g(4, "b2")}\n${g(5, "b3")}\n`);
	const p = open(text, "a", { one: true });
	await p.settled();
	const shown = () => [...p.el.querySelectorAll(".booklet-step")].findIndex((s) => !s.hidden) + 1;
	await p.pageNext();
	await p.pageNext();
	assert.match(p.pager().at, /2/);
	assert.equal(shown(), 1);
	await press(p, choice(p.q("b1"), "Yes"));
	await p.pageNext();
	assert.equal(shown(), 2, "the second step of the page, the first not done");
	await p.pageNext();
	assert.equal(shown(), 3);
	await p.pageBack();
	await p.pageBack();
	assert.equal(shown(), 1, "walked back to the first step, which the page now remembers");
	await p.pageBack();
	assert.match(p.pager().at, /1/, "back on the first page");
	assert.equal(shown(), 2, "at its last step");
	await p.pageNext();
	assert.match(p.pager().at, /2/);
	assert.equal(shown(), 2, "arriving again, the first step not done, not the step it was left on");
	p.close();
});

test("live regions: a press says its result again, even when it is the line already there; a redraw never does", async () => {
	const text = note(`> [!choice|flyer] Which one flies?\n- [ ] A penguin\n- [ ] An ostrich\n- [x] A sparrow\n\n> [!multi|m] Fruit?\n- [x] Apple\n- [ ] Rock\n- [ ] Stone\n`);
	const p = open(text);
	await p.settled();
	const live = p.q("flyer").querySelector(".booklet-live");
	const log = [];
	const watch = new w.MutationObserver((rs) => log.push(...rs));
	const cleared = (rs) => rs.some((r) => r.removedNodes.length) && rs.some((r) => r.addedNodes.length);
	watch.observe(live, { childList: true, characterData: true, subtree: true });
	const settle = () => new Promise((r) => setTimeout(r, 0));
	await press(p, choice(p.q("flyer"), "A penguin"));
	await settle();
	assert.equal(words(live), "Not quite. The answer is A sparrow.");
	assert.ok(log.length > 0, "the first wrong pick is announced");
	log.length = 0;
	// a different wrong pick: the same line, said again
	await press(p, choice(p.q("flyer"), "An ostrich"));
	await settle();
	assert.equal(words(live), "Not quite. The answer is A sparrow.");
	assert.ok(cleared(log), "the text was cleared and set again, so it is read out again");
	// a redraw (an answer elsewhere) says nothing
	log.length = 0;
	await press(p, choice(p.q("m"), "Rock"));
	await settle();
	assert.equal(log.length, 0, "no mutation from an answer elsewhere");
	// a multi's Check pressed twice on the same picks
	const check = [...p.q("m").querySelectorAll("button")].find((b) => words(b) === "Check");
	const mlive = p.q("m").querySelector(".booklet-live");
	await press(p, check);
	const first = words(mlive);
	assert.match(first, /Not quite/);
	const mlog = [];
	const w3 = new w.MutationObserver((rs) => mlog.push(...rs));
	w3.observe(mlive, { childList: true, characterData: true, subtree: true });
	await press(p, check);
	await settle();
	w3.disconnect();
	watch.disconnect();
	assert.equal(words(mlive), first);
	assert.ok(cleared(mlog), "Check pressed again says it again");
	p.close();
});
