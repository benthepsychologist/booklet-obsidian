/*
 * Page trees with plugin 0.7.0 (lessons: groups, steps, rows): a page line inside a group or another callout's body is that body's text;
 * a page line inside an open row is ignored and said, and the row stays open; one step at a time works inside a named page, and Back and
 * Next move a step, then a part, then a page. Every note is made up.
 */
import "./fixed-date.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { core, norm } from "./helpers.mjs";
import { pane } from "./pane.mjs";

const head = 'booklet: "0.17"';
const note = (body) => `---\n${head}\n---\n\n> [!activity|a] A\n\n${body}\n`;
const only = (text) => {
	const book = core.parseBooklet(text);
	return { book, nav: core.buildNav(book, text), na: [...core.buildNav(book, text).byKey.values()][0] };
};

/* ---- a page line inside a callout body ---- */

test("a page line inside a group's body is the group's text, not a page: no page is made, nothing is said, the words stay in the group", () => {
	const text = note(`> [!group] Steps\n> Words.\n>\n> > [!page|x] Not a page\n> > Words of it.\n>\n> More words.\n\nAfter the group.`);
	const book = core.parseBooklet(text);
	assert.deepEqual(book.problems, []);
	assert.deepEqual(norm(book.activities[0].segments.map((s) => (s.type === "callout" ? `callout:${s.kind}` : s.type))), ["callout:group", "prose", "callout-end", "prose"]);
	const group = book.activities[0].segments[1];
	assert.match(group.markdown, /\[!page\|x\] Not a page/, "the line is in the group's words");
	const { na } = only(text);
	assert.deepEqual(na.tabs[0].tree.map((p) => p.named), [false], "one unnamed page, no page made by the line");
});

test("the same inside a tip that holds a question; and the page line after the group still starts a page", () => {
	const text = note(`> [!tip] Tip\n>\n> > [!choice|c] One?\n> - [ ] Yes\n> - [ ] No\n>\n> > [!page|x] Not a page\n\n> [!page|real] A real page\n\nIts words.`);
	const book = core.parseBooklet(text);
	assert.deepEqual(book.problems, []);
	const { na } = only(text);
	assert.deepEqual(na.tabs[0].tree.map((p) => [p.id, p.named]), [["", false], ["real", true]], "the tip's body made no page; the real page line did");
});

/* ---- a page line inside a row ---- */

test("a page line inside an open row is ignored and said, and the row stays open until its own end line; a tab line ends a row as it did", () => {
	const text = note(`> [!row]\n\n### One\n\nAlpha.\n\n> [!page|x] Inside\n\n### Two\n\nBeta.\n\n> [!row|end]\n\n> [!page|after] After the row\n\nWords.`);
	const book = core.parseBooklet(text);
	assert.deepEqual(book.problems, ["Line 13: a page line inside a row, which cannot hold one, so it was ignored."]);
	const { na } = only(text);
	assert.deepEqual(na.tabs[0].tree.map((p) => p.id), ["", "after"], "only the page after the row is a page");
	const tab = core.parseBooklet(note(`> [!row]\n\n### One\n\nAlpha.\n\n> [!tab|t] A tab\n\nWords.\n`));
	assert.ok(tab.problems.some((p) => /a row is still open when the tab line came/.test(p)));
	assert.ok(!tab.problems.some((p) => /page line/.test(p)));
});

/* ---- one step at a time inside named pages ---- */

const LESSON = `---\n${head}\n---\n\n> [!activity|a] A\n\n> [!page|one] One\n\n> [!group] A1\n> Words a1.\n\n> [!group] A2\n> Words a2.\n\n***\n\n> [!group] B1\n> Words b1.\n\n> [!group] B2\n> Words b2.\n\n> [!page|two] Two\n\nWords of page two.\n\n> [!activity|b] B\n\nThe next activity.\n`;

function store(one) {
	const m = new Map();
	if (one) m.set("booklet-steps:Note.booklet.md", JSON.stringify("one"));
	return { loadLocalStorage: (k) => (m.has(k) ? JSON.parse(m.get(k)) : null), saveLocalStorage: (k, d) => (d === null ? m.delete(k) : m.set(k, JSON.stringify(d))), m };
}
const open = (part) => pane(LESSON, { state: { version: 1, screen: "activity:/a", part }, appMore: store(true) });
const progress = (p) => (p.el.querySelector(".booklet-steps-progress")?.textContent ?? "").trim();
const counter = (p) => p.pager().at;

test("one at a time on a named page: Next moves a step, then a part, then a page, each arriving on its first step; no step is a step in Obsidian's Back", async () => {
	const p = open(0);
	await p.settled();
	assert.deepEqual([p.pageTitles(), counter(p), progress(p)], [["One"], "1 of 2", "Step 1 of 2"]);
	assert.deepEqual(p.pager().buttons, ["Back to the overview", "Next"]);
	await p.pageNext();
	assert.deepEqual([p.pageTitles(), counter(p), progress(p)], [["One"], "1 of 2", "Step 2 of 2"]);
	assert.equal(p.hist.back.length, 0, "a step is no step in the pane's history");
	assert.equal(p.flight.calls, 0, "and asks the pane for nothing");
	await p.pageNext();
	assert.deepEqual([p.pageTitles(), counter(p), progress(p)], [["One"], "2 of 2", "Step 1 of 2"], "the next part, on its first step");
	assert.equal(p.hist.back.length, 1);
	await p.pageNext();
	assert.deepEqual([counter(p), progress(p)], ["2 of 2", "Step 2 of 2"]);
	assert.deepEqual(p.pager().buttons.slice(-1), ["Next: Two"], "past the last step of the last part, Next names the next page");
	await p.pageNext();
	assert.deepEqual([p.pageTitles(), counter(p), progress(p)], [["Two"], "", ""], "page two has no steps");
	assert.equal(p.view.getState().page, "two");
	p.close();
});

test("one at a time: Back moves a step first; Back to the part before opens on its last step; Back to another page opens on its first", async () => {
	const p = open(1);
	await p.settled();
	assert.deepEqual([counter(p), progress(p)], ["2 of 2", "Step 1 of 2"]);
	await p.pageBack();
	assert.deepEqual([p.pageTitles(), counter(p), progress(p)], [["One"], "1 of 2", "Step 2 of 2"], "the part before, on its last step");
	await p.pageBack();
	assert.equal(progress(p), "Step 1 of 2", "then a step back inside it");
	assert.deepEqual(p.pager().buttons[0], "Back to the overview");
	// from page two, Back goes to the top page before it, on its first part and first step
	for (let i = 0; i < 4; i++) await p.pageNext();
	assert.deepEqual(p.pageTitles(), ["Two"]);
	await p.pageBack();
	assert.deepEqual([p.pageTitles(), counter(p), progress(p)], [["One"], "1 of 2", "Step 1 of 2"]);
	p.close();
});

test("without steps nothing about moving through the pages changes: Back on a later part goes to the part before", async () => {
	const p = pane(LESSON, { state: { version: 1, screen: "activity:/a", part: 1 }, appMore: store(false) });
	await p.settled();
	assert.equal(progress(p), "");
	await p.pageBack();
	assert.deepEqual([p.pageTitles(), counter(p)], [["One"], "1 of 2"]);
	p.close();
});
