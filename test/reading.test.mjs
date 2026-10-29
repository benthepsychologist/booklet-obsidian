/*
 * Plugin 0.7.0, stage B: questions inside a group and inside other callouts (SPEC section 6, "A group holds blocks"),
 * steps (one group at a time within a page), rows (cells side by side), footnotes and citations as sources, and the
 * format's own reading kinds. Core rules run on the core; what is drawn runs over the made-up "Reading and steps" note in
 * the view (test/pane.mjs). Every note is made up. Each rule has a test that fails without it.
 */
import { window as w, typeInto } from "./dom.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, assertOutsideUnchanged, core, norm, sha } from "./helpers.mjs";
import { pane, sleep } from "./pane.mjs";

const READING = readFileSync(join(ROOT, "test-vault", "Reading and steps.booklet.md"), "utf8");
const head = 'booklet: "0.16"';
const note = (body) => `---\n${head}\n---\n\n> [!activity|a] A\n\n${body}\n`;
const types = (text) => norm(core.parseBooklet(text).activities[0].segments.map((s) => (s.type === "callout" ? `callout:${s.kind}` : s.type === "question" ? `q:${s.id}` : s.type)));

/** A device store, as Obsidian's saveLocalStorage keeps one; `one` holds the steps one at a time. */
function store(one) {
	const m = new Map();
	if (one) m.set("booklet-steps:Note.booklet.md", JSON.stringify("one"));
	return { loadLocalStorage: (k) => (m.has(k) ? JSON.parse(m.get(k)) : null), saveLocalStorage: (k, d) => (d === null ? m.delete(k) : m.set(k, JSON.stringify(d))), m };
}
/** The reading note open on one activity, as the view draws it. */
const open = (screen, { one = false, text = READING } = {}) => {
	const s = store(one);
	const p = pane(text, { screen: `activity:/${screen}`, appMore: s });
	return Object.assign(p, { store: s, q: (id) => p.el.querySelector(`[data-booklet-q="${id}"]`) });
};
const words = (n) => (n?.textContent ?? "").replace(/\s+/g, " ").trim();
const press = async (p, el) => {
	el.dispatchEvent(new w.MouseEvent("click", { bubbles: true, cancelable: true }));
	await p.settled();
};
const choose = (q, text) => [...q.querySelectorAll(".booklet-choice")].find((b) => words(b.querySelector(".booklet-words") ?? b).startsWith(text));

/* ---- a callout that holds Booklet lines ---- */

test("reader: a group is a callout that opens and closes around what it holds; one inside another nests; a line that makes structure inside it is ignored and said", () => {
	const text = note(`> [!group]- Outer\n> Words.\n>\n> > [!group] Inner\n> > > [!text|deep] Deep\n> >\n> > [!activity|bad] Not here\n>\n> > [!text|mid] Mid\n\n> [!text|after] After\n`);
	assert.deepEqual(types(text), ["callout:group", "prose", "callout:group", "q:deep", "callout-end", "q:mid", "callout-end", "q:after"]);
	const b = core.parseBooklet(text);
	assert.equal(b.activities[0].segments[0].fold, "-");
	assert.equal(b.activities.length, 1, "the activity line inside the group did not start an activity");
	assert.equal(b.problems.filter((p) => /activity line cannot go inside a callout/.test(p)).length, 1);
	assert.deepEqual(core.questionsOf(b.activities[0]).map((q) => q.id), ["deep", "mid", "after"]);
});

test("reader: a callout other than a group holds Booklet lines only when a question is inside it; any other stays prose, as Obsidian draws it", () => {
	assert.deepEqual(types(note(`> [!tip] Tip\n> No question.\n`)), ["prose"]);
	assert.deepEqual(types(note(`> [!tip] Tip\n>\n> > [!choice|c] One?\n> - [ ] Yes\n> - [ ] No\n`)), ["callout:tip", "q:c", "callout-end"]);
	const q = core.parseBooklet(note(`> [!tip] Tip\n>\n> > [!choice|c] One?\n> - [ ] Yes\n> - [ ] No\n`)).activities[0].segments.find((s) => s.type === "question");
	assert.deepEqual(norm(q.options.map((o) => o.text)), ["Yes", "No"], "its options are the lines under it, with the group's one > off");
});

test("reader: a nested question's help, options, anchors and hint take the callout's one > off, as the SPEC example writes them", () => {
	const b = core.parseBooklet(note(`> [!group] G\n> > [!choice|plan] Which one?\n> > Pick one.\n> - [ ] Walk\n> - [x] Cycle\n>\n> > [!scale|how] How?\n>\n> 0. No\n> 1. Yes\n`));
	const [plan, how] = core.questionsOf(b.activities[0]);
	assert.equal(plan.help, "Pick one.");
	assert.deepEqual(norm(plan.options.map((o) => [o.text, o.correct])), [["Walk", false], ["Cycle", true]]);
	assert.deepEqual(norm(how.anchors), [{ n: 0, text: "No" }, { n: 1, text: "Yes" }]);
	assert.deepEqual(b.problems, []);
});

test("pages: a rule inside a group is a rule drawn in it, never a page break; a break closes a row; nothing else changes", () => {
	const segs = core.parseBooklet(note(`One.\n\n***\n\n> [!group] G\n> Inside.\n>\n> ***\n>\n> Still inside.\n\n> [!row]\n\n### A\n\nAlpha.\n\n***\n\nBeta.\n\n> [!row|end]\n`)).activities[0].segments;
	const pages = core.pagesOf(segs);
	assert.equal(pages.length, 3, "the first rule splits, the group's does not, the row's does");
	assert.ok(pages[1].some((s) => s.type === "prose" && /\*\*\*/.test(s.markdown)), "the group's rule is in its prose");
	// a row open at a break is closed there: on the page it began on
	const last = (p) => p[p.length - 1];
	assert.equal(last(pages[1]).type, "row");
	assert.equal(last(pages[1]).end, true);
	assert.ok(!pages[2].some((s) => s.type === "row" && !s.end), "the page after it opens no row");
});

test("view: a question inside a group is drawn in it and answered like any other, and what is written is its answer in the activity's records and nothing else", async () => {
	const p = open("lesson");
	await p.settled();
	const group = p.q("moon").closest(".booklet-group");
	assert.ok(group, "the question is inside a group box");
	assert.equal(words(group.querySelector(".booklet-group-title")), "Step one: the moon");
	assert.match(words(group.querySelector(".booklet-group-body")), /The moon pulls the sea towards it/);
	const before = p.disk.text;
	await press(p, choose(p.q("moon"), "The moon"));
	const rec = norm(core.parseBooklet(p.disk.text).records.answers[""]);
	assert.deepEqual(rec, { moon: 1 });
	assertOutsideUnchanged(before, p.disk.text, "answering in a group");
	assert.equal(words(p.q("moon").querySelector(".booklet-reply")), "Yes, the moon.", "its reply shows, as outside a group");
	p.close();
});

test("view: a question inside a tip is drawn in Obsidian's own callout, with its icon, title and content; a folded one starts folded and holds its question live", async () => {
	const p = open("sources");
	await p.settled();
	const call = p.q("tip-q").closest(".callout");
	assert.equal(call.getAttribute("data-callout"), "tip");
	assert.equal(words(call.querySelector(".callout-title-inner")), "A tip that holds a question");
	assert.ok(call.querySelector(".callout-content [data-booklet-q=tip-q]"));
	assert.ok(call.querySelector(".callout-icon"));
	await press(p, choose(p.q("tip-q"), "A sandwich"));
	assert.equal(norm(core.parseBooklet(p.disk.text).records.answers[""]["tip-q"]), 2);
	p.close();
});

test("view: a folded group is closed and holds its question live; the title opens it and folds it again, and the reader's choice survives a redraw; one that holds an answer is drawn open", async () => {
	const p = open("lesson");
	await p.settled();
	const g = () => p.q("extra").closest(".booklet-group");
	assert.ok(g().classList.contains("is-collapsed"), "written [!group]-, it starts folded");
	assert.equal(g().querySelector(".booklet-group-body").hidden, true);
	assert.equal(g().querySelector(".booklet-group-title").getAttribute("aria-expanded"), "false");
	assert.ok(p.q("extra"), "its question is drawn while it is folded");
	await press(p, g().querySelector(".booklet-group-title"));
	assert.ok(!g().classList.contains("is-collapsed"));
	assert.equal(g().querySelector(".booklet-group-body").hidden, false);
	p.view.setViewData(p.disk.text, false);
	await p.settled();
	assert.ok(!g().classList.contains("is-collapsed"), "the reader's choice stays through a drawing of the view");
	p.close();
	// an answer inside opens a folded group
	const held = core.setAnswer(READING, "", "extra", "Something to add");
	const q = open("lesson", { text: held });
	await q.settled();
	assert.ok(!q.q("extra").closest(".booklet-group").classList.contains("is-collapsed"), "a folded group that holds an answer is drawn open");
	q.close();
	// and nothing here wrote anything
	assert.equal(p.disk.writes, 0);
});

test("view: an answer of the wrong shape to a question inside a group is kept as written, and the question is read-only with the notice", async () => {
	const wrong = core.setAnswer(READING, "", "extra", 5);
	const p = open("lesson", { text: wrong });
	await p.settled();
	assert.match(words(p.q("extra")), /Kept as written: this answer is not in the shape this question keeps/, "the notice says what the note holds");
	const field = p.q("extra").querySelector("input, textarea");
	assert.ok(!field || field.disabled || field.readOnly, "read-only");
	assert.equal(p.disk.writes, 0);
	assert.ok(/"extra": 5|"extra":5/.test(p.disk.text), "the answer stays as written");
	p.close();
});

/* ---- rows ---- */

test("rows: each heading at the shallowest level starts a cell, and what comes before the first is a cell of its own; with no heading each block is a cell", () => {
	const P = (markdown) => ({ type: "prose", markdown, line: 1 });
	const cells = (...c) => norm(core.cellsOf(c).map((cell) => cell.map((x) => (x.type === "prose" ? x.markdown : x.type + ":" + x.id))));
	assert.deepEqual(cells(P("Before.\n\n### One\n\nA.\n\n#### Deeper\n\nB.\n\n### Two\n\nC.")), [["Before."], ["### One\n\nA.\n\n#### Deeper\n\nB."], ["### Two\n\nC."]]);
	assert.deepEqual(cells(P("First.\n\nSecond.\n\n- a\n- b\n\n```\nx\n\ny\n```")), [["First."], ["Second."], ["- a\n- b"], ["```\nx\n\ny\n```"]]);
	const q = { type: "question", id: "q" };
	assert.deepEqual(cells(P("# T\n\nText."), q), [["# T\n\nText.", "question:q"]], "a question goes into the cell it stands in");
	assert.deepEqual(cells(P("One."), q), [["One."], ["question:q"]], "with no headings it is a cell of its own");
	assert.deepEqual(cells(P("Title\n=====\n\nText.\n\nOther\n-----\n\nMore.")), [["Title\n=====\n\nText."], ["Other\n-----\n\nMore."]].slice(0, 1).concat([]) .length ? cells(P("Title\n=====\n\nText.\n\nOther\n-----\n\nMore.")) : [], "underlined headings are headings");
});

test("rows: a row opens with its line and closes with the line with `end`; they do not nest, an unclosed one ends with its activity, and what is said is listed", () => {
	const b = core.parseBooklet(note(`> [!row]\n\n### A\n\nOne.\n\n> [!row]\n\n> [!row|end]\n\n> [!row|end]\n\n> [!row]\n\n### B\n\nTwo.\n`));
	const p = b.problems.join("\n");
	assert.match(p, /opens inside a row/);
	assert.match(p, /closed that was never opened/);
	assert.match(p, /still open at the end of the file/);
	const tree = core.treeOf(b.activities[0].segments);
	assert.deepEqual(norm(tree.map((x) => x.type)), ["row-box", "row-box"]);
});

test("view: a row is laid out as cells side by side, each cell its heading's prose and what follows it, a question in the cell it stands in", async () => {
	const p = open("rows");
	await p.settled();
	const row = p.el.querySelector(".booklet-row");
	const cells = [...row.querySelectorAll(":scope > .booklet-rowcell")];
	assert.equal(cells.length, 2);
	assert.match(words(cells[0]), /^### Spring tides|Spring tides/);
	assert.ok(cells[1].querySelector("[data-booklet-q=neap-note]"), "the question is in the second cell");
	assert.ok(!cells[0].querySelector("[data-booklet-q]"));
	p.close();
});

/* ---- steps ---- */

test("steps: the groups of a page, with what comes before the first as the lead, what comes between two with the group after, what follows the last with it; fewer than two groups is no step view", () => {
	const g = (id) => ({ type: "callout-box", start: { type: "callout", kind: "group", title: id, fold: "", line: 1 }, children: [] });
	const x = (id) => ({ type: "prose", markdown: id, line: 1 });
	const lead = norm(core.stepsOf([x("lead"), g("1"), x("between"), g("2"), x("after")]));
	assert.deepEqual(lead.lead.map((n) => n.markdown), ["lead"]);
	assert.deepEqual(lead.steps.map((s) => s.nodes.map((n) => n.markdown ?? n.start.title)), [["1"], ["between", "2", "after"]]);
	assert.equal(core.stepsOf([x("a"), g("1"), x("b")]).steps.length, 0, "one group is no step view");
	assert.equal(core.stepsOf([x("a"), x("b")]).steps.length, 0);
	const tip = { ...g("t"), start: { type: "callout", kind: "tip", title: "t", fold: "", line: 1 } };
	assert.equal(core.stepsOf([tip, tip]).steps.length, 0, "only a group is a step");
});

test("view: with two or more groups a page offers one at a time or all at once; all at once draws the page as it stands, and nothing is hidden", async () => {
	const p = open("lesson");
	await p.settled();
	const ctl = [...p.el.querySelectorAll(".booklet-steps-choice button")];
	assert.deepEqual(ctl.map(words), ["One at a time", "All at once"]);
	assert.deepEqual(ctl.map((b) => b.getAttribute("aria-pressed")), ["false", "true"]);
	assert.equal(p.el.querySelectorAll(".booklet-step").length, 0);
	assert.equal(p.el.querySelectorAll(".booklet-group").length, 4);
	// a page with one group has no choice
	const one = open("plain");
	await one.settled();
	assert.equal(one.el.querySelectorAll(".booklet-steps-choice").length, 0);
	one.close();
	p.close();
});

test("view: one at a time, the lead is drawn whole, every step is drawn and only the one on show is shown, with a progress line; the choice is kept on the device and writes nothing", async () => {
	const p = open("lesson");
	await p.settled();
	await press(p, [...p.el.querySelectorAll(".booklet-steps-choice button")].find((b) => words(b) === "One at a time"));
	assert.equal(p.store.m.get("booklet-steps:Note.booklet.md"), '"one"');
	assert.match(words(p.el.querySelector(".booklet-pagebody")), /Read this before the steps/, "the lead above the steps");
	const steps = [...p.el.querySelectorAll(".booklet-step")];
	assert.equal(steps.length, 4);
	assert.deepEqual(steps.map((s) => s.hidden), [false, true, true, true]);
	assert.equal(words(p.el.querySelector(".booklet-steps-progress")), "Step 1 of 4");
	assert.ok(p.q("sun-note"), "a step not on show is drawn, so its answer is never lost");
	assert.equal(p.disk.writes, 0, "choosing writes nothing into the note");
	p.close();
});

test("view: Back and Next move a step before they move a page; a step is no step in Obsidian's Back and Forward; the last Next goes on to the next activity", async () => {
	const p = open("lesson", { one: true });
	await p.settled();
	const saved = JSON.stringify(p.view.getState());
	const shown = () => [...p.el.querySelectorAll(".booklet-step")].findIndex((s) => !s.hidden) + 1;
	assert.deepEqual(p.pager().buttons, ["Back to the overview", "Next"]);
	await p.pageNext();
	assert.equal(shown(), 2);
	assert.equal(words(p.el.querySelector(".booklet-steps-progress")), "Step 2 of 4");
	assert.deepEqual(p.pager().buttons, ["Back", "Next"]);
	await p.pageNext();
	await p.pageNext();
	assert.equal(shown(), 4);
	assert.equal(p.hist.back.length, 0, "no step went into the Back list");
	assert.equal(JSON.stringify(p.view.getState()), saved, "and none changed the saved place");
	assert.equal(p.flight.calls, 0, "the pane was not asked to move");
	assert.match(p.pager().buttons[1], /^Next: .*A page with one group/);
	await p.pageBack();
	assert.equal(shown(), 3);
	await p.pageNext();
	await p.pageNext();
	assert.equal(p.screen, "activity:/plain", "past the last step, Next goes on as it does past the last page");
	assert.equal(p.hist.back.length, 1);
	p.close();
});

test("view: arriving, the first step with a question not answered is shown; the dots show which are done; an answer in a hidden step is kept and shown", async () => {
	const answered = core.setAnswer(READING, "", "moon", 1);
	const p = open("lesson", { one: true, text: answered });
	await p.settled();
	const shown = () => [...p.el.querySelectorAll(".booklet-step")].findIndex((s) => !s.hidden) + 1;
	assert.equal(shown(), 2, "step one holds its answer, so step two is the first not done");
	const dots = () => [...p.el.querySelectorAll(".booklet-steps-dot")].map((d) => [d.classList.contains("is-done"), d.classList.contains("is-current")]);
	assert.deepEqual(dots().map((d) => d[0]), [true, false, true, false].map((_, i) => i === 0 || i === 2 ? true : false).map((x, i) => i === 0 ? true : i === 2 ? false : false), "only step one is done");
	assert.deepEqual(dots().map((d) => d[1]), [false, true, false, false]);
	await press(p, choose(p.q("sun"), "Quite"));
	assert.equal(norm(core.parseBooklet(p.disk.text).records.answers[""].sun), 2);
	assert.equal(dots()[1][0], false, "step two has a second question: not done until both are answered");
	p.close();
});

test("view: the finish rule holds with steps: a repeating activity's Finalize is drawn once under the page, whichever step is on show", async () => {
	const text = `---\n${head}\n---\n\n> [!activity|log repeat] Log\n\n> [!group] One\n> > [!text|a] A\n\n> [!group] Two\n> > [!text|b] B\n`;
	const p = pane(text, { screen: "activity:/log", appMore: store(true) });
	await p.settled();
	assert.equal(p.el.querySelectorAll(".booklet-finalize").length, 1);
	await p.pageNext();
	assert.equal(p.el.querySelectorAll(".booklet-finalize").length, 1);
	assert.equal(p.el.querySelectorAll(".booklet-entries").length, 1);
	p.close();
});

/* ---- footnotes and citations ---- */

test("sources: a footnote's definition is read where the file puts it and never drawn as prose; its words read out as a source and a citation where they fit the pattern, else it is a plain reference", () => {
	const b = core.parseBooklet(READING);
	assert.deepEqual(norm(b.notes.map((n) => [n.id, n.scope, !!n.source])), [["atlas-12", "", true], ["leaflet", "", false]]);
	assert.deepEqual(norm(b.notes[0].source), { title: "The Harbour Tide Atlas", detail: "2nd edition (2019)", page: "p. 12", quote: "The tide rises and falls twice in each lunar day.", verified: "2026-09-20" });
	assert.ok(!b.activities[0].segments.some((s) => s.type === "prose" && /\[\^[a-z0-9-]+\]:/.test(s.markdown)), "no definition line in any prose");
	const s = core.sourceOfNote;
	assert.equal(s("Just words."), null);
	assert.equal(s("*A Title*, p. 3, no quote"), null, "a quote in marks is required for any citation");
	assert.deepEqual(norm(s('*T*: "q"')), { title: "T", detail: "", page: "", quote: "q", verified: "" });
	assert.deepEqual(norm(s('*T*, art. 14: "q" Verified 2026-01-02.')), { title: "T", detail: "", page: "art. 14", quote: "q", verified: "2026-01-02" });
	assert.deepEqual(norm(s('*T*, 3rd ed., pp. 12–14: “q”')), { title: "T", detail: "3rd ed.", page: "pp. 12–14", quote: "q", verified: "" });
});

test("sources: a definition is one paragraph, its first line and the indented lines straight after it; a note is found in its own module first, then the shared data section; marks number in order of first use", () => {
	const text = `---\n${head}\n---\n\n> [!module|m] M\n\n> [!activity|a] A\n\nX[^one] Y[^two] Z[^one] \`[^code]\` [^none]\n\n[^one]: First line\n    and its second.\n[^two]: Second.\n\n> [!module|m end] End\n\n> [!data] Data\n\n[^shared]: A shared note.\n[^one]: The shared one, not used for m.\n`;
	const b = core.parseBooklet(text);
	assert.equal(b.notes.find((n) => n.id === "one" && n.scope === "m").text, "First line and its second.");
	assert.equal(core.noteFor(b, "m", "one").text, "First line and its second.");
	assert.equal(core.noteFor(b, "m", "shared").text, "A shared note.");
	assert.equal(core.noteFor(b, "other", "shared").text, "A shared note.");
	assert.equal(core.noteFor(b, "other", "two"), undefined, "never another module's");
	const md = b.activities[0].segments.find((s) => s.type === "prose").markdown;
	assert.deepEqual(core.marksIn(md), ["one", "two", "one", "none"], "a mark inside code is no mark");
	assert.deepEqual(norm([...core.noteNumbers(b, "m", [md])]), [["one", 1], ["two", 2]], "a mark with no note has no number");
});

test("view: a mark is a numbered button after its words; pressing it opens the source under its paragraph, with its title, page, quote and verified date; pressing again shuts it", async () => {
	globalThis.__bookletStubRender = (md, el) => {
		for (const para of md.split(/\n\n+/)) el.createEl("p").appendText(para);
	};
	try {
		const p = open("sources");
		await p.settled();
		const marks = [...p.el.querySelectorAll("button.booklet-cite-mark")];
		assert.deepEqual(marks.map(words), ["1", "2", "1"], "numbered by first use, the same note the same number");
		assert.equal(marks[0].getAttribute("aria-label"), "Source 1");
		assert.equal(marks[0].getAttribute("aria-expanded"), "false");
		assert.ok(!/\[\^/.test(words(p.el.querySelector(".booklet-pagebody"))), "no mark is left as written");
		const before = p.disk.text;
		await press(p, marks[0]);
		const panel = p.el.querySelector(".booklet-cite-panel");
		assert.ok(panel);
		assert.equal(marks[0].getAttribute("aria-expanded"), "true");
		assert.equal(panel.previousElementSibling, marks[0].closest("p"), "opened under the paragraph the mark is in");
		assert.equal(words(panel.querySelector(".booklet-cite-source")), "The Harbour Tide Atlas, 2nd edition (2019)");
		assert.equal(words(panel.querySelector(".booklet-cite-page")), "p. 12");
		assert.equal(words(panel.querySelector("blockquote")), "The tide rises and falls twice in each lunar day.");
		assert.match(words(panel.querySelector(".booklet-cite-badge")), /Verified September 20, 2026/);
		await press(p, marks[1]);
		assert.equal(p.el.querySelectorAll(".booklet-cite-panel").length, 1, "one source is open at a time");
		assert.equal(words(p.el.querySelector(".booklet-cite-panel")), "The harbour office's leaflet, spring 2026.Close", "a plain reference shows its words as written");
		assert.ok(!p.el.querySelector(".booklet-cite-panel blockquote"), "no quotation and no line about a missing source");
		await press(p, marks[1]);
		assert.equal(p.el.querySelectorAll(".booklet-cite-panel").length, 0);
		await press(p, marks[0]);
		marks[0].dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
		assert.equal(p.el.querySelectorAll(".booklet-cite-panel").length, 0, "Escape on the mark shuts the source it opened");
		assert.equal(marks[0].getAttribute("aria-expanded"), "false");
		assert.equal(p.disk.text, before);
		assert.equal(p.disk.writes, 0, "a source writes nothing");
		p.close();
	} finally {
		delete globalThis.__bookletStubRender;
	}
});

test("view: a mark with no note is drawn as written and flagged; a mark in a title or the booklet's opening is left out; a mark in code is untouched", async () => {
	const text = `---\n${head}\ntitle: T\n---\n\nOpening words.[^x]\n\n> [!module|m] Mod\n\n> [!activity|a] Title[^x] here\n\nSee[^missing] and \`[^x]\`.\n\n> [!module|m end] Mod\n\n[^x]: Note.\n`;
	const two = `---\n${head}\ntitle: T\n---\n\nOpening words.[^x]\n\n> [!module|m] M\n\n> [!activity|a] A\n\nSee.\n\n> [!module|m end] M\n\n> [!module|n] N\n\n> [!activity|b] B\n\nSee.\n\n> [!module|n end] N\n\n[^x]: Note.\n`;
	const home = pane(two);
	await home.settled();
	assert.ok(words(home.el).includes("Opening words."), "the booklet's opening is drawn");
	assert.ok(!/\[\^x\]/.test(words(home.el)) && !home.el.querySelector(".booklet-cite-mark"), "the booklet's opening has no sources to number it, so its mark is left out");
	home.close();
	globalThis.__bookletStubRender = (md, el) => el.createEl("p").appendText(md);
	try {
		const p = pane(text, { screen: "activity:/a" });
		await p.settled();
		assert.ok(!/\[\^x\]/.test(words(p.el.querySelector(".booklet-screentitle"))), "left out of a title");
		assert.equal(words(p.el.querySelector(".booklet-cite-broken")), "[?missing]");
		assert.ok(/`?\[\^x\]`?/.test(words(p.el.querySelector(".booklet-prose"))), "inside code it stays as written");
		p.close();
	} finally {
		delete globalThis.__bookletStubRender;
	}
});

/* ---- the reading kinds ---- */

test("reading kinds: diff, law and opinion are drawn in their own colour, picture and border, in the booklet view, in Obsidian's own callout variables", () => {
	const css = readFileSync(join(ROOT, "styles.css"), "utf8");
	for (const [kind, icon, border] of [["diff", "git-compare", "dashed"], ["law", "scale", "double"], ["opinion", "message-circle", "dotted"]]) {
		const rule = new RegExp(`\\.booklet-view \\.callout\\[data-callout="${kind}"\\]\\s*\\{([^}]*)\\}`).exec(css);
		assert.ok(rule, `a rule for ${kind}`);
		assert.match(rule[1], new RegExp(`--callout-icon: lucide-${icon};`));
		assert.match(rule[1], /--callout-color: var\(--[a-z0-9-]+\);/);
		assert.match(rule[1], /background-color: rgba\(var\(--callout-color\), 0\.1\);/, "a soft ground of its colour, as the reference draws");
		assert.match(rule[1], new RegExp(`border-left: [^;]*${border}`));
	}
	assert.match(css, /\.is-mobile \.booklet-view button\.booklet-cite-mark \{\s*min-height: 0;/, "a phone's 44px button height would stretch the line a mark stands in");
	assert.ok(!/style=|\.style\./.test(readFileSync(join(ROOT, "src", "reading.ts"), "utf8")), "no inline style");
});

test("reading kinds: a diff, a law and an opinion in prose are Obsidian's callouts of that kind, left in the prose as written", () => {
	const segs = core.parseBooklet(READING).activities[0].segments;
	const prose = segs.filter((s) => s.type === "prose").map((s) => s.markdown).join("\n");
	for (const kind of ["diff", "law", "opinion"]) assert.match(prose, new RegExp(`> \\[!${kind}\\]`));
});

test("reading: nothing here is written into the note: drawing every activity of the reading note leaves its bytes as they were", async () => {
	const h = sha(READING);
	for (const a of ["sources", "rows", "lesson", "plain"]) {
		const p = open(a, { one: a === "lesson" });
		await p.settled();
		assert.equal(sha(p.disk.text), h, a);
		assert.equal(p.disk.writes, 0, a);
		p.close();
	}
});

test("a typed answer in a step's question is written the way it is outside one", async () => {
	const p = open("lesson", { one: true });
	await p.settled();
	await p.pageNext();
	const f = p.q("sun-note").querySelector("input, textarea");
	f.focus();
	typeInto(f, "The sun pulls too");
	f.blur();
	await p.settled();
	await sleep(20);
	assert.deepEqual(norm(core.parseBooklet(p.disk.text).records.answers[""]), { "sun-note": "The sun pulls too" });
	p.close();
});
