/*
 * Page trees, stage C (plugin 0.8.0): the tree's own surfaces (design/pages/proposal.md section 3, decision 6 calls F and K): the menu of a
 * tab's tree with its search ("Pages in this tab"), the pages under the one on show as cards, and "Mentioned on". Every note is made up.
 */
import "./fixed-date.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { core, norm, sha } from "./helpers.mjs";
import { window as w, typeInto } from "./dom.mjs";
import { pane } from "./pane.mjs";

const CHECKIN = readFileSync(new URL("./page-notes/Check-in with a wiki.booklet.md", import.meta.url), "utf8");
const SKETCH = readFileSync(new URL("../test-vault/Learning to sketch.booklet.md", import.meta.url), "utf8");
const SCREEN = "activity:calm/check-in";
const at = (tab, part) => ({ version: 1, screen: SCREEN, tab, part });
const build = (text) => {
	const book = core.parseBooklet(text);
	return { book, nav: core.buildNav(book, text) };
};
const wiki = () => build(CHECKIN).nav.byKey.get("calm/check-in").tabs.find((t) => t.id === "wiki");
const click = (el) => el.dispatchEvent(new w.MouseEvent("click", { bubbles: true, cancelable: true }));
const menu = (p) => p.el.querySelector(".booklet-pagemenu");
const menuTree = (p) => {
	const walk = (ul) => [...ul.children].map((li) => ({ t: p.words(li.querySelector(":scope > a")), kids: li.querySelector(":scope > ul") ? walk(li.querySelector(":scope > ul")) : [] }));
	return walk(menu(p).querySelector(".booklet-pagelist > ul"));
};
const hits = (p) => [...menu(p).querySelectorAll(".booklet-pagelist a")].map(p.words);
const search = (p, words) => {
	const input = menu(p).querySelector("input");
	input.value = words;
	input.dispatchEvent(new w.Event("input", { bubbles: true }));
};

/* ---- the search and the mentions, in the model ---- */

test("the search finds the pages whose title or words hold every word asked: titles first, then words, in reading order; no words is the whole tree", () => {
	const tab = wiki();
	const found = (q) => core.searchPages(tab, q).map((p) => p.title);
	assert.deepEqual(found(""), ["Learn", "The body map", "Choosing a place", "Words for what you notice", "The feelings grid", "The two axes", "More than one at once", "Thoughts as headlines"]);
	assert.deepEqual(found("  "), found(""));
	assert.equal(found("grid")[0], "The feelings grid", "a title that holds the word comes first");
	assert.ok(found("grid").includes("Learn"), "and a page whose words hold it follows (the first page links to the grid)");
	assert.deepEqual(found("HEADLINES"), ["Thoughts as headlines", "Learn"], "case does not matter; the link in the first page's words counts");
	assert.deepEqual(found("two axes"), ["The two axes"], "every word must be there");
	assert.deepEqual(found("energy"), ["The two axes"], "a word of the page's body");
	assert.deepEqual(found("energy sideways"), [], "no page has both");
});

test("heading links are found as the view follows them: [[#Words]], [[#Words|label]] and [label](#words), not in code, and a block link is none", () => {
	const md = "See [[#One]] and [[#Two|the second]] and [three](#three) and ![[#^embed]] and [[#^block]] and `[[#Code]]`.\n\n```\n[[#Fenced]]\n```\n\n[[Other.booklet]] and [web](https://x.test/#a)";
	assert.deepEqual(core.headingLinksIn(md), ["One", "Two", "three"]);
});

test("\"Mentioned on\": every page whose words hold a link that opens the page, from anywhere in the module; never the page itself", () => {
	const { nav } = build(CHECKIN);
	const na = nav.byKey.get("calm/check-in");
	const tab = na.tabs.find((t) => t.id === "wiki");
	const of = (title) => norm(core.mentionsOf(nav, na, tab, tab.tree.find((p) => p.title === title)).map((m) => [m.title, m.place.part]));
	assert.deepEqual(of("The body map"), [["Learn", 0]]);
	assert.deepEqual(of("Choosing a place"), [["The body map", 1]]);
	assert.deepEqual(of("The feelings grid"), [["Learn", 0]]);
	assert.deepEqual(of("Thoughts as headlines"), [["Learn", 0]]);
	assert.deepEqual(of("The two axes"), [], "nothing links to it");
	assert.deepEqual(of("Learn"), []);
});

const HARBOUR = `---
booklet: "0.17"
title: Harbour
---

> [!module|harbour] Harbour notes

> [!activity|tides] Tides

See [[#Neap tides]] from above every tab.

> [!tab|read] Read

> [!page|spring] Spring tides

Compare [[#Neap tides]], and the heading [[#Rules of thumb]] (below).

***

## Rules of thumb

Measure twice. Go back to [Spring tides](#spring-tides) any time.

> [!page|neap parent:spring] Neap tides

The narrowest range. Also [[#Boats]] and [[#Read]].

> [!tab|more] More

> [!page|extra] Extra

Words with [[#Neap tides]].

> [!activity|boats] Boats

Floating, with a look at [[#Neap tides]] and [[#Moon]].

> [!module|harbour end]
`;

test("\"Mentioned on\" names a source by its page, with its tab and activity when they differ from the page's own; an opening counts as its activity; a source is listed once", () => {
	const { nav } = build(HARBOUR);
	const tides = nav.byKey.get("harbour/tides");
	const read = tides.tabs.find((t) => t.id === "read");
	const neap = read.tree.find((p) => p.id === "neap");
	const got = norm(core.mentionsOf(nav, tides, read, neap).map((m) => [m.title, m.place]));
	assert.deepEqual(
		got.map((x) => x[0]),
		["Tides", "Spring tides", "More › Extra", "Boats"],
		"the opening (the activity), the page that links twice, a page in another tab, another activity",
	);
	assert.deepEqual(got[1][1], { screen: "activity:harbour/tides", tab: "read", part: 0 });
	assert.deepEqual(got[2][1], { screen: "activity:harbour/tides", tab: "more", part: 0 }, "the place of the page that holds the link");
	// a link by a tab's name opens the tab on its first page; a link inside a page to its own heading is no mention of any other page
	const spring = read.tree.find((p) => p.id === "spring");
	assert.deepEqual(core.mentionsOf(nav, tides, read, spring).map((m) => m.title), ["Neap tides"], "[[#Read]] opens the tab on its first page, which is Spring tides; the page's own links to itself are none");
});

/* ---- the menu, the cards and "Mentioned on", in the view ---- */

test("a tab of pages has a closed menu \"Pages in this tab\" holding its tree, the page on show marked; a 0.16 tab and a tab of one page have none", async () => {
	const p = pane(CHECKIN, { state: at("wiki", 3) });
	await p.settled();
	const m = menu(p);
	assert.ok(m, "the menu is drawn");
	assert.equal(m.open, false, "closed to begin with");
	assert.equal(p.words(m.querySelector("summary")), "Pages in this tab");
	assert.deepEqual(menuTree(p), [
		{ t: "Learn", kids: [] },
		{ t: "The body map", kids: [{ t: "Choosing a place", kids: [] }, { t: "Words for what you notice", kids: [] }] },
		{ t: "The feelings grid", kids: [{ t: "The two axes", kids: [] }, { t: "More than one at once", kids: [] }] },
		{ t: "Thoughts as headlines", kids: [] },
	]);
	assert.deepEqual([...m.querySelectorAll("a.is-active")].map(p.words), ["Words for what you notice"]);
	assert.equal(m.querySelector("a.is-active").getAttribute("aria-current"), "page");
	p.close();
	// the quiz tab holds two pages and no tree below them: a menu of two is drawn all the same, as the rule is the same for every tab of pages
	const quiz = pane(CHECKIN, { state: at("quiz", 0) });
	await quiz.settled();
	assert.deepEqual(menuTree(quiz).map((x) => x.t), ["Your body", "Your mind"]);
	quiz.close();
	// the dashboard tab has one page and no page line; a 0.16 note has no menu at all
	const dash = pane(CHECKIN, { state: at("dashboard", 0) });
	await dash.settled();
	assert.equal(menu(dash), null);
	dash.close();
	const old = pane(SKETCH, { screen: "activity:basics/lines" });
	await old.settled();
	assert.equal(menu(old), null);
	assert.equal(old.all(".booklet-pagemenu, .booklet-mentioned").length, 0);
	old.close();
});

test("a press on a page in the menu opens it as a step; the menu stays open for the pane, and the words in its search box with it", async () => {
	const p = pane(CHECKIN, { state: at("wiki", 0) });
	await p.settled();
	menu(p).open = true;
	menu(p).dispatchEvent(new w.Event("toggle"));
	search(p, "grid");
	const before = p.hist.back.length;
	const link = [...menu(p).querySelectorAll(".booklet-pagelist a")].find((a) => p.words(a) === "The feelings grid");
	click(link);
	await p.settled();
	assert.deepEqual(p.all(".booklet-pagetitle").map(p.words), ["The feelings grid"]);
	assert.equal(p.hist.back.length, before + 1, "a step");
	assert.equal(menu(p).open, true, "still open on the next page");
	assert.equal(menu(p).querySelector("input").value, "grid", "with its words");
	assert.equal(p.disk.writes, 0);
	assert.equal(sha(p.disk.text), sha(CHECKIN));
	// a pane closed and a note opened again starts with the menu closed
	p.close();
	const q = pane(CHECKIN, { state: at("wiki", 4) });
	await q.settled();
	assert.equal(menu(q).open, false);
	q.close();
});

test("the search lists the pages whose title or words hold the words typed, titles first; none says so; Enter opens the first; Escape clears", async () => {
	const p = pane(CHECKIN, { state: at("wiki", 0) });
	await p.settled();
	search(p, "grid");
	assert.deepEqual(hits(p), ["The feelings grid", "Learn", "The two axes"], "the title first, then the pages whose words hold it, in reading order");
	search(p, "zzz");
	assert.equal(p.words(menu(p).querySelector(".booklet-pagelist")), "No page has those words.");
	search(p, "axes");
	const input = menu(p).querySelector("input");
	input.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
	await p.settled();
	assert.deepEqual(p.all(".booklet-pagetitle").map(p.words), ["The two axes"]);
	menu(p).querySelector("input").dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
	assert.equal(menu(p).querySelector("input").value, "");
	assert.equal(menuTree(p).length, 4, "the tree again");
	assert.equal(p.disk.writes, 0);
	p.close();
});

test("under the last part of a page come the pages under it as cards, numbered, with their blurbs; a page with none has none, and a tab's first page has none", async () => {
	const p = pane(CHECKIN, { state: at("wiki", 1) });
	await p.settled();
	assert.deepEqual(p.cards(), ["1.Choosing a place", "2.Words for what you notice"]);
	assert.equal(p.words(p.el.querySelector(".booklet-cards .booklet-blurb")), "Tap the place that comes nearest. If nothing fits, write it in Something else on the Check in tab.");
	click(p.all(".booklet-cardrow")[1]);
	await p.settled();
	assert.deepEqual(p.all(".booklet-pagetitle").map(p.words), ["Words for what you notice"]);
	assert.deepEqual(p.cards(), []);
	assert.equal(p.hist.back.length, 1, "a card is a step");
	p.close();
	// a page of two parts shows its cards only after its last part
	const grid = pane(CHECKIN, { state: at("wiki", 4) });
	await grid.settled();
	assert.deepEqual(grid.cards(), ["1.The two axes", "2.More than one at once"]);
	grid.close();
	const parts = pane(CHECKIN, { state: at("wiki", 5) });
	await parts.settled();
	assert.deepEqual(parts.cards(), [], "the two axes has no page under it");
	parts.close();
	const first = pane(CHECKIN, { state: at("wiki", 0) });
	await first.settled();
	assert.deepEqual(first.cards(), [], "the tab's first page, made of the words before the first page line, has no pages under it");
	first.close();
});

test("a tab with an activity-level card list still shows its own: pages under a page do not replace the activities under an activity", async () => {
	const text = `---\nbooklet: "0.17"\ntitle: Both\n---\n\n> [!module|m] M\n\n> [!activity|top] Top\n\n> [!page|a] A\n\nWords.\n\n> [!page|b parent:a] B\n\nWords.\n\n> [!activity|kid parent:top] Kid\n\nWords.\n\n> [!module|m end]\n`;
	const p = pane(text, { state: { version: 1, screen: "activity:m/top", part: 0 } });
	await p.settled();
	assert.deepEqual(p.all(".booklet-meta").map(p.words), ["Pages under this one", "Under this one"]);
	p.close();
});

test("\"Mentioned on\" lists the pages that link to the page on show, each a link to the page that holds the link; it is shown under the cards, and writes nothing", async () => {
	const p = pane(CHECKIN, { state: at("wiki", 2) });
	await p.settled();
	assert.ok(p.el.querySelector(".booklet-meta + .booklet-mentioned"), "a heading, then the list");
	assert.equal(p.words(p.el.querySelector(".booklet-mentioned").previousElementSibling), "Mentioned on");
	assert.deepEqual(p.all(".booklet-mentioned a").map(p.words), ["The body map"]);
	click(p.all(".booklet-mentioned a")[0]);
	await p.settled();
	assert.deepEqual(p.all(".booklet-pagetitle").map(p.words), ["The body map"]);
	assert.equal(p.hist.back.length, 1);
	// a page nobody links to has none
	const q = pane(CHECKIN, { state: at("wiki", 5) });
	await q.settled();
	assert.equal(q.all(".booklet-mentioned").length, 0);
	assert.equal(q.disk.writes + p.disk.writes, 0);
	p.close();
	q.close();
});

test("typed words survive a move through the menu: they are written before the move", async () => {
	const p = pane(CHECKIN, { state: at("quiz", 1) });
	await p.settled();
	const field = p.all("[data-booklet-q='other'] input.booklet-text")[0] ?? p.all("[data-booklet-q='other'] textarea")[0];
	assert.ok(field);
	typeInto(field, "made-up words typed before using the menu");
	click([...menu(p).querySelectorAll(".booklet-pagelist a")].find((a) => p.words(a) === "Your body"));
	await p.settled();
	await p.view.writes;
	assert.ok(p.disk.text.includes("made-up words typed before using the menu"), "written before the move");
	p.close();
});
