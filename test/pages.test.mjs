/*
 * Page trees, the tree model (plugin 0.8.0, stage A; ahead of the format: format 0.17, not yet in SPEC; design/pages/proposal.md): the page
 * line `> [!page|id parent:x icon:name] Title`, the shape of a tab's tree (the proposal's shape (b)), parts (`***`), and what a page line
 * out of place does. Every note here is made up. That a note with no page line is exactly what it was is test/legacy.test.mjs's.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { core, norm } from "./helpers.mjs";

const head = (extra = "") => `---\nbooklet: "0.16"\ntitle: Harbour\n${extra}---\n`;
const ACT = "> [!activity|notes] Harbour notes\n";
const note = (body, act = ACT) => `${head()}\n${act}\n${body}`;
const build = (text) => {
	const book = core.parseBooklet(text);
	return { book, nav: core.buildNav(book, text) };
};
const tabOf = (text, n = 0, key = "/notes") => build(text).nav.byKey.get(key).tabs[n];
/** A tab's tree as indented lines: the id of a named page (its title for a page no page line made, in brackets), two spaces for each level. */
const outline = (tab) =>
	tab.tree.map((p) => {
		let d = 0;
		for (let x = p.parent; x; x = x.parent) d++;
		return `${"  ".repeat(d)}${p.named ? p.id : `(${p.title})`}`;
	});
const segs = (text) => core.parseBooklet(text).activities[0].segments;
const problems = (text) => {
	const { book, nav } = build(text);
	return [...book.problems, ...nav.problems].filter((p) => !/^This file says booklet/.test(p));
};

/* ---- the page line ---- */

test("a page line: an id first, parent: and icon:, or none; the title is inline Markdown; a page is a segment of its activity", () => {
	const t = note(
		[
			"> [!page] Plain",
			"> [!page|map] Mapped",
			"> [!page|map2 icon:footprints] With an icon",
			"> [!page|parent:map] Under map, no id written",
			"> [!page|kid parent:map icon:waves] **Bold** and [[#Plain]]",
		].join("\n\nWords.\n\n") + "\n",
	);
	const pages = segs(t).filter((s) => s.type === "page");
	assert.deepEqual(
		norm(pages.map((p) => [p.id, p.parent, p.icon, p.title])),
		[
			[null, null, null, "Plain"],
			["map", null, null, "Mapped"],
			["map2", null, "footprints", "With an icon"],
			[null, "map", null, "Under map, no id written"],
			["kid", "map", "waves", "**Bold** and [[#Plain]]"],
		],
	);
	assert.deepEqual(norm(pages.map((p) => p.line)), [8, 12, 16, 20, 24], "each carries its line, from 1");
	assert.deepEqual(problems(t), [], "page is a kind the format will define: nothing is said of it");
});

test("a first word that holds a colon is a setting and the line has no written id; for every other kind the first word is still the id", () => {
	assert.equal(core.calloutWords("page", "parent:map").id, null);
	assert.equal(core.calloutWords("page", "parent:map").set["parent"], "map");
	assert.equal(core.calloutWords("page", "map parent:other").id, "map");
	assert.equal(core.calloutWords("page", "icon:waves parent:tides").set["icon"], "waves");
	// 0.16's reading of every other kind is not touched (a note with no page line is unchanged)
	assert.equal(core.calloutWords("activity", "repeat:x").id, "repeat:x");
	assert.equal(core.calloutWords("tab", "plan:x").id, "plan:x");
});

test("a page takes parent: and icon: only: hidden, status:, tab: and repeat are said and ignored", () => {
	const t = note("> [!page|p hidden status:off tab:x repeat parent:q icon:waves] Title\n\nWords.\n");
	const [p] = segs(t).filter((s) => s.type === "page");
	assert.equal(p.parent, "q");
	assert.equal(p.icon, "waves");
	const said = core.parseBooklet(t).problems.filter((x) => /page line takes no/.test(x));
	assert.equal(said.length, 4, said.join("\n"));
	for (const w of ["hidden", "status:", "tab:", "repeat"]) assert.ok(said.some((x) => x.includes(w)), `${w} is said`);
});

test("a fold marker on a page line is ignored with a note in the problems", () => {
	for (const mark of ["-", "+"]) {
		const t = note(`> [!page|p]${mark} Title\n\nWords.\n`);
		assert.equal(segs(t).filter((s) => s.type === "page").length, 1, "still a page");
		assert.deepEqual(problems(t), [`Line 8: a page is never folded, so the \`${mark}\` after its bracket was ignored.`]);
	}
});

test("the lines directly under a page line, and a list directly under it, are the page's first prose and its card's blurb", () => {
	const t = note("> [!page|p] A page\n> The first words, in the quote lines.\n\n- one\n- two\n\nThen more.\n");
	const s = segs(t);
	assert.equal(s.length, 2);
	assert.equal(s[1].type, "prose");
	assert.equal(s[1].markdown, "The first words, in the quote lines.\n\n- one\n- two\n\nThen more.");
	const p = tabOf(t).tree[0];
	assert.equal(p.blurb, "The first words, in the quote lines.");
	assert.deepEqual(norm(p.parts), [[{ type: "prose", markdown: s[1].markdown, line: 9 }]]);
});

test("an id that is not letters, digits and dashes is said and the page's id is made from its title", () => {
	const t = note("> [!page|ma_p] Choosing a place\n\nWords.\n");
	assert.deepEqual(problems(t), ['Line 8: the page id "ma_p" is not letters, digits and dashes, so the page\'s id is made from its title.']);
	assert.deepEqual(outline(tabOf(t)), ["choosing-a-place"]);
});

/* ---- a page line out of place ---- */

test("a page line outside every activity, or in a module's opening, is ignored and said; its quote lines are text", () => {
	const t = `${head()}\n> [!page|early] Before anything\n> Hello.\n\n> [!module|m] M\n\n> [!page|inopening] In the module's opening\n\n> [!activity|a] A\n\nWords.\n\n> [!module|m end] E\n`;
	const { book, nav } = build(t);
	assert.deepEqual(book.problems, ["Line 6: a page line belongs in an activity, so it was ignored.", "Line 11: a page line belongs in an activity, so it was ignored."]);
	assert.deepEqual(norm(book.activities[0].segments.map((s) => s.type)), ["prose"], "no page in the activity");
	assert.ok(nav.byKey.get("m/a"));
	assert.equal(nav.mods[0].opening, "", "a page line is not drawn in a module's opening either");
});

test("in an activity with tabs, a page line before the first tab line is ignored and said, and what follows it is the opening", () => {
	const t = note("Opening words.\n\n> [!page|stray] Stray\n\nMore opening.\n\n> [!tab|one] One\n\n> [!page|p] Real\n\nIn the tab.\n");
	assert.deepEqual(problems(t), ["Line 10: a page line in the opening that every tab shows, before the activity's first tab line, belongs to no tab, so it was ignored."]);
	const a = build(t).nav.byKey.get("/notes");
	assert.deepEqual(norm(a.opening.map((s) => s.type === "prose" && s.markdown)), ["Opening words.", "More opening."]);
	assert.deepEqual(outline(a.tabs[0]), ["p"]);
});

test("a page line inside a row, in a data section and in a group is not a page; one after the row is", () => {
	const row = note("> [!row]\n\n## Cell\n\n> [!page|inrow] In the row\n\nWords.\n\n> [!row|end]\n\n> [!page|after] After the row\n\nMore.\n");
	assert.deepEqual(problems(row), ["Line 12: a page line inside a row, which cannot hold one, so it was ignored."]);
	assert.deepEqual(outline(tabOf(row)), ["(Harbour notes)", "after"], "the row's words are the tab's first page");
	// in a group the line is nested, so it is the group's text and not a line of its own
	const group = note("> [!group]\n> > [!page|inside] Inside a group\n\n> [!page|outside] Outside\n\nWords.\n");
	assert.deepEqual(problems(group).filter((x) => /page/.test(x)), []);
	assert.deepEqual(outline(tabOf(group)), ["(Harbour notes)", "outside"]);
	// in a data section only blocks are read
	const data = `${head()}\n${ACT}\n> [!page|p] Real\n\nWords.\n\n> [!data] Data\n\n> [!page|indata] In the data section\n`;
	assert.deepEqual(outline(tabOf(data)), ["p"]);
});

/* ---- the shape of a tab's tree (the proposal's shape (b)) ---- */

test("a tab with no page line is one page, its words in parts: exactly the pages 0.16 drew", () => {
	const t = note("> [!tab|a] A\n\nOne.\n\n***\n\nTwo.\n\n***\n\n***\n\nThree.\n");
	const tab = tabOf(t);
	assert.equal(tab.tree.length, 1);
	assert.equal(tab.tree[0].named, false);
	assert.equal(tab.tree[0].id, "");
	assert.equal(tab.tree[0].title, "A");
	assert.equal(tab.tree[0].parts.length, 3, "the empty stretch between two breaks is no part");
	assert.deepEqual(norm(tab.pages), norm(core.pagesOf(segs(t).filter((s) => s.type !== "tab"))));
	assert.deepEqual(norm(tab.tree[0].parts), norm(tab.pages));
});

test("the words before a tab's first page line are its first page, named by the tab; with no tab line, by the activity", () => {
	const wiki = note("> [!tab|wiki] Learn\n\nHow it fits together.\n\n> [!page|map] The body map\n\nWords.\n\n> [!page|grid] The grid\n\nWords.\n");
	const tab = tabOf(wiki);
	assert.deepEqual(outline(tab), ["(Learn)", "map", "grid"]);
	assert.equal(tab.tree[0].named, false);
	assert.equal(tab.tree[0].id, "");
	assert.equal(tab.tree[0].blurb, "How it fits together.");
	const plain = note("Before the pages.\n\n> [!page|tides] Tides\n\nWords.\n");
	assert.deepEqual(outline(tabOf(plain)), ["(Harbour notes)", "tides"]);
	// a tab's first page has no id, so no page can name it as its parent: the page goes to the top
	const nameless = note("Before.\n\n> [!page|p parent:] Page\n");
	assert.deepEqual(outline(tabOf(nameless)), ["(Harbour notes)", "p"]);
});

test("with the words before the first page line empty (blank lines, a comment, a lone break), the first named page is the tab's first page", () => {
	for (const before of ["", "\n\n", "<!-- an editor's note -->\n\n", "***\n\n", "<!-- one -->\n\n<!-- two -->\n\n"]) {
		const t = note(`${before}> [!page|tides] Tides\n\nWords.\n\n> [!page|neap] Neap\n\nMore.\n`);
		assert.deepEqual(outline(tabOf(t)), ["tides", "neap"], JSON.stringify(before));
	}
	// words are words: a question before the first page line is the first page
	const q = note("> [!text|t1] A question\n\n> [!page|tides] Tides\n");
	assert.deepEqual(outline(tabOf(q)), ["(Harbour notes)", "tides"]);
});

test("pages with no parent: stand side by side in the file's order; parent: gives any named page children; the reading order is depth first", () => {
	const t = note(
		[
			"> [!page|a] A",
			"> [!page|b] B",
			"> [!page|b1 parent:b] B1",
			"> [!page|b2 parent:b] B2",
			"> [!page|b21 parent:b2] B21",
			"> [!page|c] C",
			"> [!page|a1 parent:a] A1, written after C",
		].join("\n\nWords.\n\n") + "\n\nWords.\n",
	);
	const tab = tabOf(t);
	assert.deepEqual(outline(tab), ["a", "  a1", "b", "  b1", "  b2", "    b21", "c"], "a1 is written after c and stands under a: depth first, not file order");
	assert.deepEqual(norm(tab.top.map((p) => p.id)), ["a", "b", "c"]);
	assert.deepEqual(norm(tab.tree.map((p) => p.parent && p.parent.id)), [null, "a", null, "b", "b", "b2", null]);
	assert.deepEqual(norm(tab.tree.find((p) => p.id === "b").children.map((p) => p.id)), ["b1", "b2"], "children keep the file's order");
	// `pages` lists every part in this reading order, and each page knows where its first part is
	assert.deepEqual(norm(tab.tree.map((p) => p.at)), [0, 1, 2, 3, 4, 5, 6]);
	assert.equal(tab.pages.length, 7);
});

test("a parent that is another tab's page, or no page, and a cycle: the page stands at the top and it is said", () => {
	const t = note(
		[
			"> [!tab|one] One\n\n> [!page|p1] P1\n\nWords.\n\n> [!page|lost parent:nowhere] Lost\n\nWords.\n",
			"> [!tab|two] Two\n\n> [!page|q1 parent:p1] Q1 (p1 is in tab One)\n\nWords.\n\n> [!page|x parent:y] X\n\nWords.\n\n> [!page|y parent:x] Y\n\nWords.\n\n> [!page|me parent:me] Me\n\nWords.\n",
		].join("\n"),
	);
	const { nav } = build(t);
	const a = nav.byKey.get("/notes");
	assert.deepEqual(outline(a.tabs[0]), ["p1", "lost"]);
	assert.deepEqual(outline(a.tabs[1]), ["q1", "x", "y", "me"], "x and y are each other's ancestor: both at the top, as activities are; me is its own parent");
	assert.deepEqual(norm(nav.problems), [
		'Line 14: the page "lost" names the parent "nowhere", which is no page of this tab (a parent is a page of the same tab), so it stands at the top of the tab.',
		'Line 20: the page "q1" names the parent "p1", which is no page of this tab (a parent is a page of the same tab), so it stands at the top of the tab.',
		'Line 24: the page "x" is its own ancestor (through "y"), so it stands at the top of the tab.',
		'Line 28: the page "y" is its own ancestor (through "x"), so it stands at the top of the tab.',
		'Line 32: the page "me" is its own parent, so it stands at the top of the tab.',
	]);
});

test("ids: written, else made from the title; a title that leaves nothing is page-N; of two with one id the second is numbered and the first is the parent", () => {
	const t = note(
		[
			"> [!page] Thoughts as headlines",
			"> [!page] Écrire ça",
			"> [!page] 日本語",
			"> [!page|grid] The grid",
			"> [!page|grid] The grid again",
			"> [!page|kid parent:grid] A child of the first grid",
			"> [!page|grid2 parent:grid-2] Under the second",
		].join("\n\nWords.\n\n") + "\n\nWords.\n",
	);
	const { nav } = build(t);
	const tab = nav.byKey.get("/notes").tabs[0];
	assert.deepEqual(outline(tab), ["thoughts-as-headlines", "ecrire-ca", "page-3", "grid", "  kid", "grid-2", "  grid2"]);
	assert.deepEqual(norm(nav.problems), ['Line 24: the page id "grid" is used twice in this tab, so this page is "grid-2" (a parent: of "grid" is the first page).']);
});

test("a page's id is its own: it may be a question's id, and two tabs may each have a page of one id", () => {
	const t = `${head()}\n> [!activity|notes] Notes\n\n> [!tab|one] One\n\n> [!page|tides] Tides, the page\n\n> [!text|tides] Tides, the question\n\n> [!tab|two] Two\n\n> [!page|tides] Tides again, in the other tab\n`;
	const { book, nav } = build(t);
	assert.equal(book.ok, true, book.refusal ?? "");
	assert.deepEqual(problems(t), []);
	assert.deepEqual(norm(nav.byKey.get("/notes").tabs.map((x) => x.tree.map((p) => p.id))), [["tides"], ["tides"]]);
});

/* ---- parts ---- */

test("a thematic break splits a page into parts; an empty stretch is no part; a page with no words has one empty part", () => {
	const t = note("> [!page|a] A\n\nOne.\n\n***\n\nTwo.\n\n---\n\nThree.\n\n***\n\n> [!page|b] B\n\n> [!page|c] C\n\nOnly.\n");
	const tab = tabOf(t);
	assert.deepEqual(norm(tab.tree.map((p) => [p.id, p.parts.length])), [["a", 3], ["b", 1], ["c", 1]]);
	assert.deepEqual(norm(tab.tree[1].parts), [[]], "a page with no words has one empty part, and is still a page");
	assert.deepEqual(norm(tab.tree.map((p) => p.at)), [0, 3, 4]);
	assert.equal(tab.pages.length, 5);
});

test("a page's parts end at the next page line: a break above a page line belongs to nothing, and a break in a group stays in the group", () => {
	const t = note("> [!page|a] A\n\nOne.\n\n> [!group]\n> ***\n> Inside.\n\n***\n\n> [!page|b] B\n\nTwo.\n");
	const tab = tabOf(t);
	assert.deepEqual(norm(tab.tree.map((p) => [p.id, p.parts.length])), [["a", 1], ["b", 1]]);
});

/* ---- the card ---- */

test("the activity's blurb may stand under its first page line; an empty first page is passed over; a question first leaves none", () => {
	assert.equal(build(note("> [!page|tides] Tides\n\nHow the water moves.\n\nMore.\n")).nav.byKey.get("/notes").blurb, "How the water moves.");
	assert.equal(build(note("> [!page|empty] Empty\n\n> [!page|tides] Tides\n\nSecond one's words.\n")).nav.byKey.get("/notes").blurb, "Second one's words.");
	assert.equal(build(note("> [!page|q] Q\n\n> [!text|t1] A question\n\nAfter.\n")).nav.byKey.get("/notes").blurb, "");
	assert.equal(build(note("Opening first.\n\n> [!page|tides] Tides\n\nWords.\n")).nav.byKey.get("/notes").blurb, "Opening first.");
});

test("a page's card: its title with a leading emoji taken out, icon:, and the first paragraph of its words", () => {
	const t = note("> [!page|w icon:waves] 🌊 Tides\n\n## A heading first\n\nThe words of the card.\n\nSecond.\n\n> [!page|n] Nothing under it\n");
	const [w, n] = tabOf(t).tree;
	assert.deepEqual(norm([w.title, w.emoji, w.written, w.icon, w.blurb]), ["Tides", "🌊", "🌊 Tides", "waves", "The words of the card."]);
	assert.deepEqual(norm([n.title, n.emoji, n.icon, n.blurb]), ["Nothing under it", null, null, ""]);
	assert.equal(core.buildNav(core.parseBooklet(note("> [!page] \n\nx\n")), note("> [!page] \n\nx\n")).byKey.get("/notes").tabs[0].tree[0].title, "page-1", "no words and no id: the id made of nothing");
});

/* ---- links ---- */

test("a link by words reaches a page by its title, on its first part; a heading by its words, in the part that holds it", () => {
	const t = note("> [!page|a] The first page\n\nOne.\n\n***\n\n## A heading on part two\n\nTwo.\n\n> [!page|b parent:a] A child page\n\nThree.\n\n> [!page|c] 🌊 Last page\n\nFour.\n");
	const { nav } = build(t);
	const at = (words) => norm(core.findHeading(nav, words, ""));
	assert.deepEqual(at("A child page"), { place: { screen: "activity:/notes", tab: null, part: 2 }, heading: null, keepTab: false });
	assert.equal(at("the first page").place.part, 0, "any case");
	assert.equal(at("A heading on part two").place.part, 1);
	assert.equal(at("Last page").place.part, 3, "by the title without its emoji");
	assert.equal(at("🌊 Last page").place.part, 3, "and with it");
	assert.equal(at("No such page"), null);
});

/* ---- the worked examples (proposal 5.1 and 5.2), with made-up words ---- */

test("the check-in as one activity with a wiki tab (5.1): three tabs, the wiki's tree in three levels, the quiz tab opening on its first named page", () => {
	const src = readFileSync(new URL("./page-notes/Check-in with a wiki.booklet.md", import.meta.url), "utf8");
	const { book, nav } = build(src);
	assert.deepEqual(book.problems, ['This file says booklet: 0.17. This view reads format 0.16 and has opened it as it is; some of it may not draw.']);
	assert.deepEqual(nav.problems, []);
	const a = nav.byKey.get("calm/check-in");
	assert.deepEqual(norm(a.tabs.map((t) => t.id)), ["wiki", "quiz", "dashboard"]);
	assert.deepEqual(outline(a.tabs[0]), ["(Learn)", "map", "  choosing-a-place", "  words-for-what-you-notice", "grid", "  the-two-axes", "  more-than-one-at-once", "thoughts-as-headlines"]);
	assert.equal(a.tabs[0].tree.find((p) => p.id === "the-two-axes").parts.length, 2, "a break inside The two axes: two parts");
	assert.equal(a.tabs[0].pages.length, 9);
	assert.deepEqual(outline(a.tabs[1]), ["your-body", "your-mind"], "nothing before the page lines: the tab opens on the first named page");
	assert.deepEqual(outline(a.tabs[2]), ["(Past check-ins)"], "no page line: one page");
	assert.equal(a.opening.length, 1, "the activity's opening is above the tabs, on every page");
	assert.equal(a.blurb, "Notice, name, keep. Nothing here needs fixing.");
	assert.deepEqual(norm(core.startPlace(nav)), { screen: "activity:calm/check-in", tab: "wiki", part: 0 });
});

test("a wiki as pages (5.2): nothing before the first page line, so the activity opens on Tides with two pages under it", () => {
	const { book, nav } = build(readFileSync(new URL("./page-notes/Harbour notes.booklet.md", import.meta.url), "utf8"));
	assert.equal(book.problems.length, 1);
	const a = nav.byKey.get("harbour/notes");
	assert.deepEqual(outline(a.tabs[0]), ["tides", "  spring", "  neap"]);
	assert.equal(a.blurb, "How the water moves. The two ranges are in Spring tides.");
	assert.deepEqual(norm(core.startPlace(nav)), { screen: "activity:harbour/notes", tab: null, part: 0 });
});

test("a wiki written with parent: on activities still draws as an activity tree, beside page lines in another activity", () => {
	const t = `${head()}\n> [!module|m] M\n\n> [!activity|tides] Tides\n\nA.\n\n> [!activity|spring parent:tides] Spring\n\nB.\n\n> [!activity|pages] Pages\n\n> [!page|p1] P1\n\nC.\n\n> [!page|p2 parent:p1] P2\n\nD.\n\n> [!module|m end] E\n`;
	const { nav } = build(t);
	const m = nav.mods[0];
	assert.deepEqual(norm(m.order.map((x) => x.act.id)), ["tides", "spring", "pages"]);
	assert.equal(nav.byKey.get("m/spring").parent.act.id, "tides");
	assert.deepEqual(outline(nav.byKey.get("m/pages").tabs[0]), ["p1", "  p2"]);
});
