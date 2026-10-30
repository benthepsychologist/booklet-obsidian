/*
 * Page trees, stage B (plugin 0.8.0): moving through a tree (design/pages/proposal.md section 3). Back and Next between the parts of a page
 * and between pages, the counter, the trail, a page as a step in Obsidian's history and a tab as none, links by a page's title and by a heading,
 * and the saved place: version 2 with a page key, and a version 1 place (release 0.6.0 and 0.7.0) read as it was. Every note is made up.
 */
import "./fixed-date.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { SKETCH, WIKI, WIKI_SCREEN, build, core, norm, sha, wikiAt } from "./helpers.mjs";
import { click } from "./dom.mjs";
import { pane, sleep } from "./pane.mjs";

const buttons = (p) => p.pager().buttons;

/* ---- the moves, in the model ---- */

test("Back and Next as the proposal lays them out: the wiki tab, every part of it", () => {
	const { nav } = build(WIKI);
	const na = nav.byKey.get("calm/check-in");
	const tab = na.tabs.find((t) => t.id === "wiki");
	const place = (part) => ({ screen: WIKI_SCREEN, tab: "wiki", part });
	const say = (st) => (st ? `${st.kind}${st.page ? ":" + st.page.title : ""}${st.act ? ":" + st.act.key : ""}@${st.to.part}` : "-");
	const rows = [];
	for (let part = 0; part < tab.pages.length; part++) {
		const pg = core.pagerOf(na, tab, place(part));
		rows.push(`${part} ${say(pg.back)} | ${say(pg.next)} | ${pg.at + 1}/${pg.of}`);
	}
	assert.deepEqual(rows, [
		// the tab's first page: Back leaves the activity (to the module's screen, or home), Next names the next page
		"0 overview@0 | next-page:The body map@1 | 1/1",
		// a top page: Back goes to the top page before it; Next to its first child
		"1 before:Learn@0 | next-page:Choosing a place@2 | 1/1",
		// a child on its first part: Back goes up to the page above
		"2 up:The body map@1 | next-page:Words for what you notice@3 | 1/1",
		"3 up:The body map@1 | next-page:The feelings grid@4 | 1/1",
		"4 before:The body map@1 | next-page:The two axes@5 | 1/1",
		// a page in two parts: Next and Back move between its parts; the first part still goes up
		"5 up:The feelings grid@4 | part@6 | 1/2",
		"6 part@5 | next-page:More than one at once@7 | 2/2",
		"7 up:The feelings grid@4 | next-page:Thoughts as headlines@8 | 1/1",
		// the tab's last page: no activity follows it in this note, so Next is none
		"8 before:The feelings grid@4 | - | 1/1",
	]);
});

/* ---- the moves, in the view ---- */

test("Next and Back walk the wiki: pages named on Next and Up, parts counted \"1 of 2\", Back never leaves the tab", async () => {
	const p = pane(WIKI, { state: wikiAt("wiki", 0) });
	await p.settled();
	assert.deepEqual(buttons(p), ["Back to the overview", "Next: The body map"]);
	await p.pageNext();
	await p.pageNext();
	assert.deepEqual(p.pageTitles(), ["Choosing a place"]);
	assert.deepEqual(buttons(p), ["Up: The body map", "Next: Words for what you notice"]);
	await p.press(".booklet-pager button", "Up");
	assert.deepEqual(p.pageTitles(), ["The body map"], "Up goes to the parent, on its first part");
	await p.pageNext();
	await p.pageNext();
	await p.pageNext();
	assert.deepEqual(p.pageTitles(), ["The feelings grid"]);
	await p.pageNext();
	assert.deepEqual(p.pageTitles(), ["The two axes"]);
	assert.equal(p.pager().at, "1 of 2", "a page of two parts: the counter between Back and Next, without the word Page");
	assert.deepEqual(buttons(p), ["Up: The feelings grid", "Next"]);
	await p.pageNext();
	assert.equal(p.pager().at, "2 of 2");
	assert.deepEqual(buttons(p), ["Back", "Next: More than one at once"], "the last part of a page: Next names the next page");
	await p.pageBack();
	assert.equal(p.pager().at, "1 of 2", "Back on a later part goes to the part before");
	await p.pageNext();
	await p.pageNext();
	await p.pageNext();
	assert.deepEqual(p.pageTitles(), ["Thoughts as headlines"]);
	assert.deepEqual(buttons(p), ["Back"], "the tab's last page, and no activity follows");
	await p.pageBack();
	assert.deepEqual(p.pageTitles(), ["The feelings grid"], "Back from a top page goes to the top page before it, not to its last child");
	await p.pageBack();
	assert.deepEqual(p.pageTitles(), ["The body map"]);
	await p.pageBack();
	assert.deepEqual(p.pageTitles(), [], "the tab's own first page");
	assert.equal(p.tabOn(), "Learn");
	assert.equal(p.disk.writes, 0, "moving through a tree writes nothing");
	assert.equal(sha(p.disk.text), sha(WIKI));
	p.close();
});

test("the trail names the pages above: the activity, the tab when there is a tab bar, each page above as a link, then the page itself", async () => {
	const p = pane(WIKI, { state: wikiAt("wiki", 5) });
	await p.settled();
	assert.deepEqual(p.trail(), ["A calm check-in", "A calm check-in", "Learn", "The feelings grid", "The two axes"]);
	assert.deepEqual(p.all(".booklet-trail-link").map(p.words), ["A calm check-in", "A calm check-in", "Learn", "The feelings grid"], "the last is the screen itself, not a link");
	await p.trailTo("The feelings grid");
	assert.deepEqual(p.pageTitles(), ["The feelings grid"]);
	assert.deepEqual(p.trail(), ["A calm check-in", "A calm check-in"], "a top page has no page above it: the trail ends at the activity as it did");
	// the tab's link opens that tab on its first page
	const q = pane(WIKI, { state: wikiAt("wiki", 2) });
	await q.settled();
	await q.trailTo("Learn");
	assert.deepEqual(q.pageTitles(), []);
	assert.equal(q.pager().buttons[0], "Back to the overview");
	p.close();
	q.close();
});

test("a move to another page is a step in Obsidian's history, and Back undoes it; choosing a tab is not a step", async () => {
	const p = pane(WIKI, { state: wikiAt("wiki", 0) });
	await p.settled();
	const steps = () => p.hist.back.length;
	assert.equal(steps(), 0);
	await p.pageNext();
	await p.pageNext();
	assert.equal(steps(), 2, "each page is a step");
	await p.tab("Check in");
	assert.equal(steps(), 2, "a tab is not");
	await p.tab("Learn");
	assert.equal(steps(), 2);
	assert.deepEqual(p.pageTitles(), ["Choosing a place"], "the tab comes back on the page last seen there");
	await p.back();
	assert.deepEqual(p.pageTitles(), ["The body map"], "Obsidian's Back returns to the page before");
	await p.forward();
	assert.deepEqual(p.pageTitles(), ["Choosing a place"]);
	assert.equal(p.disk.writes, 0);
	p.close();
});

test("a part of a page is a step too: Next from \"1 of 2\" to \"2 of 2\"", async () => {
	const p = pane(WIKI, { state: wikiAt("wiki", 5) });
	await p.settled();
	await p.pageNext();
	assert.equal(p.hist.back.length, 1);
	await p.back();
	assert.equal(p.pager().at, "1 of 2");
	p.close();
});

/* ---- the saved place ---- */

test("the view saves version 2 with the page's id and the part within it; a restored pane opens on the same page and part", async () => {
	const p = pane(WIKI, { state: wikiAt("wiki", 5) });
	await p.settled();
	await p.pageNext();
	const saved = norm(p.view.getState());
	assert.deepEqual(saved, { file: "Note.booklet.md", version: 2, screen: WIKI_SCREEN, tab: "wiki", page: "the-two-axes", part: 1 });
	p.close();
	const q = pane(WIKI, { state: saved });
	await q.settled();
	assert.deepEqual(q.pageTitles(), ["The two axes"]);
	assert.equal(q.pager().at, "2 of 2");
	assert.deepEqual(norm(q.view.getState()), saved);
	q.close();
});

test("a version 1 place, as releases 0.6.0 and 0.7.0 save it, opens where it was: its part counts every part of the tab", async () => {
	const want = ["", "The body map", "Choosing a place", "Words for what you notice", "The feelings grid", "The two axes", "The two axes", "More than one at once", "Thoughts as headlines"];
	for (let part = 0; part < want.length; part++) {
		const p = pane(WIKI, { state: wikiAt("wiki", part) });
		await p.settled();
		assert.deepEqual(p.pageTitles(), want[part] ? [want[part]] : [], `part ${part}`);
		assert.equal(p.pager().at, part === 5 ? "1 of 2" : part === 6 ? "2 of 2" : "");
		p.close();
	}
	// a part past the end is the last, as in 0.6.0
	const far = pane(WIKI, { state: wikiAt("wiki", 99) });
	await far.settled();
	assert.deepEqual(far.pageTitles(), ["Thoughts as headlines"]);
	far.close();
	// the same place read by the model
	const { nav } = build(WIKI);
	assert.deepEqual(norm(core.resolvePlace(nav, core.placeFrom(wikiAt("wiki", 6)))), { screen: WIKI_SCREEN, tab: "wiki", part: 6 });
});

test("a version 2 place: the part is within its page and cannot spill into the next; a page the note no longer has opens the tab's first page; a version 1 place ignores a page key", () => {
	const { nav } = build(WIKI);
	const at = (state) => norm(core.resolvePlace(nav, core.placeFrom(state)));
	const v2 = (page, part, tab = "wiki") => ({ version: 2, screen: WIKI_SCREEN, tab, page, part });
	assert.deepEqual(at(v2("the-two-axes", 1)), { screen: WIKI_SCREEN, tab: "wiki", part: 6 });
	assert.deepEqual(at(v2("the-two-axes", 9)), { screen: WIKI_SCREEN, tab: "wiki", part: 6 }, "past the page's last part is its last part");
	assert.deepEqual(at(v2("grid", 1)), { screen: WIKI_SCREEN, tab: "wiki", part: 4 }, "a page of one part has only its part 0");
	assert.deepEqual(at(v2("vanished", 1)), { screen: WIKI_SCREEN, tab: "wiki", part: 0 });
	assert.deepEqual(at(v2("your-mind", 0, "quiz")), { screen: WIKI_SCREEN, tab: "quiz", part: 1 });
	assert.deepEqual(at(v2("your-mind", 0, "wiki")), { screen: WIKI_SCREEN, tab: "wiki", part: 0 }, "a page of another tab is not found");
	assert.deepEqual(at({ version: 1, screen: WIKI_SCREEN, tab: "wiki", page: "grid", part: 2 }), { screen: WIKI_SCREEN, tab: "wiki", part: 2 }, "no page key in version 1");
	// what is saved: the page's id only for a named page, and nothing but the version differs for a note with no page line
	assert.deepEqual(norm(core.placeState({ screen: WIKI_SCREEN, tab: "wiki", part: 0 }, nav)), { version: 1, screen: WIKI_SCREEN, tab: "wiki", part: 0 }, "the tab's own first page is no named page: version 1");
	assert.deepEqual(norm(core.placeState({ screen: WIKI_SCREEN, tab: "wiki", part: 7 }, nav)), { version: 2, screen: WIKI_SCREEN, tab: "wiki", page: "more-than-one-at-once", part: 0 });
	assert.deepEqual(norm(core.placeState({ screen: WIKI_SCREEN, tab: "wiki", part: 7 })), { version: 1, screen: WIKI_SCREEN, tab: "wiki", part: 7 }, "with no note to look in, the flat part");
	// round trip over every part of every tab
	for (const t of nav.byKey.get("calm/check-in").tabs)
		for (let part = 0; part < t.pages.length; part++) {
			const here = { screen: WIKI_SCREEN, tab: t.id, part };
			assert.deepEqual(norm(core.resolvePlace(nav, core.placeFrom(core.placeState(here, nav)))), here, `${t.id} ${part}`);
		}
});

test("a note with no page line saves exactly what 0.6.0 did: version 1, no page key", async () => {
	const p = pane(SKETCH);
	await p.settled();
	await p.card("2.The basics");
	await p.card("2.Boxes and cylinders");
	await p.pageNext();
	assert.deepEqual(norm(p.view.getState()), { file: "Note.booklet.md", version: 1, screen: "activity:basics/shapes", tab: "boxes", part: 1 });
	p.close();
});

/* ---- the end of a tab, and links ---- */

const HARBOUR = `---
booklet: "0.17"
title: Harbour
---

> [!module|harbour] Harbour notes

> [!activity|tides] Tides

Above every tab.

## Rules of thumb

Measure twice.

> [!tab|read] Read

> [!page|spring] Spring tides

The widest range. See [[#Rules of thumb]] and [[#Moon pull]].

***

Twice a month.

## Moon pull

The moon pulls the water.

> [!page|neap parent:spring] Neap tides

The narrowest range.

> [!page|moon parent:neap] The moon

Quarter moons.

> [!tab|more] More

Other words.

> [!activity|boats] Boats

Floating.

> [!module|harbour end]
`;
const H = "activity:harbour/tides";
const at = (tab, part) => ({ version: 1, screen: H, tab, part });

test("Next on the last page of a tab goes on to the next activity; Back on a tab's first page leaves the activity and never goes to another tab", async () => {
	const p = pane(HARBOUR, { state: at("read", 4) });
	await p.settled();
	assert.deepEqual(p.pageTitles(), ["The moon"]);
	assert.deepEqual(buttons(p), ["Up: Neap tides", "Next: 2. Boats"]);
	await p.pageNext();
	assert.equal(p.screen, "activity:harbour/boats");
	p.close();
	const q = pane(HARBOUR, { state: at("more", 0) });
	await q.settled();
	assert.deepEqual(buttons(q), ["Back to the overview", "Next: 2. Boats"], "the second tab: Back does not go to the first");
	q.close();
});

test("a link to a heading opens the page and the part that holds it; one to a page's title opens the page on its first part", async () => {
	const p = pane(HARBOUR, { state: at("read", 0) });
	await p.settled();
	p.view.setEphemeralState({ subpath: "#Moon pull" });
	await p.settled();
	assert.deepEqual(p.pageTitles(), ["Spring tides"]);
	assert.equal(p.pager().at, "2 of 2", "the heading is in the second part of the page");
	p.view.setEphemeralState({ subpath: "#The moon" });
	await p.settled();
	assert.deepEqual(p.pageTitles(), ["The moon"]);
	assert.equal(p.pager().at, "");
	p.close();
});

test("a link to a heading in the opening of an activity with tabs keeps the tab and the page on show", async () => {
	const p = pane(HARBOUR, { state: at("read", 2) });
	await p.settled();
	assert.deepEqual(p.pageTitles(), ["Neap tides"]);
	p.view.setEphemeralState({ subpath: "#Rules of thumb" });
	await p.settled();
	assert.equal(p.tabOn(), "Read");
	assert.deepEqual(p.pageTitles(), ["Neap tides"], "still on the page that was on show");
	const other = pane(HARBOUR, { state: at("more", 0) });
	await other.settled();
	other.view.setEphemeralState({ subpath: "#Rules of thumb" });
	await other.settled();
	assert.equal(other.tabOn(), "More", "the tab on show stays");
	p.close();
	other.close();
});

/** Stands in for Obsidian's renderer: [[#words]] becomes an internal link (as test/navigation.test.mjs does). */
function linkRender(markdown, el) {
	const re = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
	let at = 0;
	let m;
	while ((m = re.exec(markdown))) {
		if (m.index > at) el.appendText(markdown.slice(at, m.index));
		el.createEl("a", { cls: "internal-link", text: m[2] ?? m[1].replace(/^#/, ""), attr: { href: m[1], "data-href": m[1] } });
		at = re.lastIndex;
	}
	if (at < markdown.length) el.appendText(markdown.slice(at));
}

test("a link inside a page to a heading of the same page's other part, and to another page's title, moves as a step", async () => {
	globalThis.__bookletStubRender = linkRender;
	try {
		const p = pane(HARBOUR, { state: at("read", 0) });
		await p.settled();
		const links = p.all(".booklet-pagebody a").map((a) => a.getAttribute("data-href"));
		assert.deepEqual(links, ["#Rules of thumb", "#Moon pull"]);
		const before = p.hist.back.length;
		click(p.all(".booklet-pagebody a")[1]);
		await p.settled();
		assert.equal(p.pager().at, "2 of 2");
		assert.equal(p.hist.back.length, before + 1, "a step");
		assert.equal(p.disk.writes, 0);
		p.close();
	} finally {
		delete globalThis.__bookletStubRender;
	}
});

test("moving through the wiki writes nothing: the page on show is never written to the note (typed words are tested in pages-view.test.mjs and pages-surfaces.test.mjs)", async () => {
	const p = pane(WIKI, { state: wikiAt("wiki", 0) });
	await p.settled();
	for (let i = 0; i < 8; i++) await p.pageNext();
	await p.tab("Check in");
	await p.pageNext();
	await sleep(30);
	assert.equal(p.disk.writes, 0);
	assert.equal(sha(p.disk.text), sha(WIKI));
	p.close();
});

test("the pager and the trail name a page by its title without the leading emoji (the picture), as an activity's is; the page itself heads with the title as written", async () => {
	const text = `---\nbooklet: "0.17"\ntitle: Waves\n---\n\n> [!activity|w] Waves\n\n> [!page|a] 🌊 Big waves\n\nOne.\n\n> [!page|b parent:a] 🌀 Small waves\n\nTwo.\n\n> [!page|c parent:b] 🪨 Ripples\n\nThree.\n`;
	const p = pane(text, { state: { version: 1, screen: "activity:/w", part: 0 } });
	await p.settled();
	assert.deepEqual(p.pageTitles(), ["🌊 Big waves"]);
	assert.deepEqual(buttons(p), ["Back to the overview", "Next: Small waves"].map((x) => x));
	await p.pageNext();
	await p.pageNext();
	assert.deepEqual(p.trail().slice(-3), ["Big waves", "Small waves", "Ripples"]);
	assert.deepEqual(buttons(p), ["Up: Small waves"]);
	p.close();
});
