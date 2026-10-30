/*
 * Page trees, the fix round after the cold review (plugin 0.8.0): the documented 0.16 reading of a page line in a comment, a `<pre>` or a `$$`
 * block; what "Mentioned on" counts; Enter in an empty search box; a linear link lookup; ids that stay unique; the 0.17 note's rule; the
 * menu's focus, headings and labels; a very deep chain; and the gaps the review found in the earlier tests. Every note is made up.
 */
import "./fixed-date.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { WIKI, build, core, sha, wikiAt } from "./helpers.mjs";
import { window as w, click, press, typeInto } from "./dom.mjs";
import { pane, sleep } from "./pane.mjs";

const head = (marker = "0.17") => `---\nbooklet: "${marker}"\ntitle: Made up\n---\n\n`;
const menu = (p) => p.el.querySelector(".booklet-pagemenu");
const only = (nav) => [...nav.byKey.values()][0];

/* ---- S1: a page line inside a comment, a `<pre>` or a `$$` block; what "Mentioned on" counts ---- */

test("a 0.16 note's page line inside an HTML comment, a <pre> block or a $$ block is read as a page, as a tab line there already is (the documented exception)", () => {
	for (const [name, wrap] of [
		["comment", (x) => `<!--\n${x}\n-->`],
		["pre", (x) => `<pre>\n${x}\n</pre>`],
		["math", (x) => `$$\n${x}\n$$`],
	]) {
		const text = `${head("0.16")}> [!activity|a] A\n\nFirst words.\n\n${wrap("> [!page|hid] Hidden page")}\n\nMore.\n`;
		const { nav } = build(text);
		const tab = only(nav).tabs[0];
		assert.deepEqual(tab.tree.map((p) => p.title), ["A", "Hidden page"], `${name}: read as a page line`);
		const tabText = `${head("0.16")}> [!activity|a] A\n\nFirst words.\n\n${wrap("> [!tab|hid] Hidden tab")}\n\nMore.\n`;
		assert.equal(build(tabText).nav.byKey.get("/a").tabs.some((t) => t.id === "hid"), true, `${name}: and a tab line is read there at 0.6.0 too`);
	}
	// what is not a line start, or sits in a fence, stays text
	const text = `${head("0.16")}> [!activity|a] A\n\nFirst words.\n\nAn inline \`> [!page|x] T\` and text.\n\n\`\`\`\n> [!page|x] T\n\`\`\`\n`;
	assert.deepEqual(only(build(text).nav).tabs[0].tree.map((p) => p.named), [false]);
});

test("\"Mentioned on\" counts the links a reader sees: not those in an HTML comment, a <pre> or $$ block, an indented code block or code; a link after a comment on its line counts", () => {
	const none = [
		"<!-- [[#Hidden]] -->",
		"<!--\n[[#Hidden]]\n-->",
		"<!--\nsome words [[#Hidden]] and more words\n-->",
		"<pre>\n[[#Hidden]]\n</pre>",
		"$$\n[[#Hidden]]\n$$",
		"$$\n[[#Hidden]]\n[[#AlsoHidden]]\n$$",
		"Text.\n\n    [[#Hidden]]\n\nMore text.",
		"Text.\n\n\t[[#Hidden]]",
		"```\n[[#Hidden]]\n```",
		"`[[#Hidden]]`",
		"$$ x $$ and `[[#Hidden]]`",
	];
	for (const md of none) assert.deepEqual(core.headingLinksIn(md), [], JSON.stringify(md));
	assert.deepEqual(core.headingLinksIn("<!-- gone --> [[#Seen]]"), ["Seen"], "after a comment on the same line");
	assert.deepEqual(core.headingLinksIn("<!--\ngone\n--> [[#Seen]]"), ["Seen"], "after a comment that ends on its line");
	assert.deepEqual(core.headingLinksIn("[[#Before]] <!-- [[#Gone]] --> [[#After]]"), ["Before", "After"]);
	assert.deepEqual(core.headingLinksIn("- a list item\n\n    [[#Kept]] continues the item"), ["Kept"], "an indented paragraph of a list item is not code");
	assert.deepEqual(core.headingLinksIn("Words\n    [[#Kept]] (a lazy line, not code)"), ["Kept"]);
	assert.deepEqual(core.headingLinksIn("$$a$$ [[#Kept]]\n\n[[#Also]]"), ["Kept", "Also"]);
});

test("a source whose only link sits in a comment is not listed under the page it links to", () => {
	const text = `${head()}> [!activity|a] A\n\n> [!page|one] One\n\nWords. <!-- see [[#Two]] -->\n\n> [!page|two] Two\n\nWords.\n\n> [!page|three] Three\n\nSee [[#Two]].\n`;
	const { nav } = build(text);
	const na = only(nav);
	const tab = na.tabs[0];
	const two = tab.tree.find((p) => p.title === "Two");
	assert.deepEqual(core.mentionsOf(nav, na, tab, two).map((m) => m.title), ["Three"]);
});

/* ---- S2: Enter in an empty search box ---- */

test("Enter in a search box with no words does nothing: no move, no step in the history; with words it opens the first hit", async () => {
	const p = pane(WIKI, { state: wikiAt("wiki", 4) });
	await p.settled();
	const here = p.pageTitles();
	const steps = p.hist.back.length;
	const calls = p.flight.calls;
	const input = menu(p).querySelector("input");
	for (const typed of ["", "   ", " * "]) {
		typeInto(input, typed);
		press(input, "Enter");
		await p.settled();
		assert.deepEqual(p.pageTitles(), here, `"${typed}": the page on show is the same`);
		assert.equal(p.hist.back.length, steps, "no history step");
		assert.equal(p.flight.calls, calls, "no move asked for");
	}
	assert.equal(p.disk.writes, 0);
	typeInto(input, "axes");
	press(input, "Enter");
	await p.settled();
	assert.equal(p.hist.back.length, steps + 1);
	p.close();
});

/* ---- S3: the link lookup is linear ---- */

const timed = (fn) => {
	const t0 = performance.now();
	const out = fn();
	return { out, ms: performance.now() - t0 };
};

test("a booklet of 1,500 pages that each link to the next: the mentions of a page come in well under the bound (a lookup, not a walk of every page)", () => {
	const n = 1500;
	let text = `${head()}> [!activity|a] A\n\nStart.\n`;
	for (let i = 0; i < n; i++) text += `\n> [!page|p${i}] Page ${i}\n\nGo to [[#Page ${i + 1}]].\n`;
	const { ms, out } = timed(() => {
		const { nav } = build(text);
		const na = only(nav);
		const tab = na.tabs[0];
		return core.mentionsOf(nav, na, tab, tab.tree[700]).map((m) => m.title);
	});
	assert.deepEqual(out, ["Page 698"]);
	assert.ok(ms < 3000, `${Math.round(ms)} ms`);
});

test("600 pages with two links each, and 1,200 activities each linking to the next and to one common one: a lookup each", () => {
	let text = `${head()}> [!activity|a] A\n\nStart.\n`;
	for (let i = 0; i < 600; i++) text += `\n> [!page|p${i}] Page ${i}\n\nSee [[#Page ${i + 1}]] and [[#Page ${i + 2}]].\n`;
	const one = timed(() => {
		const { nav } = build(text);
		const na = only(nav);
		const tab = na.tabs[0];
		return core.mentionsOf(nav, na, tab, tab.tree[300]).map((m) => m.title);
	});
	assert.deepEqual(one.out, ["Page 297", "Page 298"]);
	assert.ok(one.ms < 3000, `${Math.round(one.ms)} ms`);
	let acts = head();
	for (let i = 0; i < 1200; i++) acts += `> [!activity|a${i}] Act ${i}\n\nSee [[#Act ${i + 1}]] and [[#Act 0]].\n\n`;
	const many = timed(() => {
		const { nav } = build(acts);
		const first = nav.byKey.get("/a0");
		return core.mentionsOf(nav, first, first.tabs[0], first.tabs[0].tree[0]).length;
	});
	assert.ok(many.out > 1000, `${many.out} mention the first activity`);
	assert.ok(many.ms < 3000, `${Math.round(many.ms)} ms`);
});

test("a page turn in the view on 600 cross-linked pages takes well under the bound", async () => {
	let text = `${head()}> [!activity|a] A\n\nStart.\n`;
	for (let i = 0; i < 600; i++) text += `\n> [!page|p${i}] Page ${i}\n\nSee [[#Page ${i + 1}]] and [[#Page ${i + 2}]].\n`;
	const p = pane(text, { state: { version: 1, screen: "activity:/a", part: 300 } });
	await p.settled();
	const t0 = performance.now();
	await p.pageNext();
	const ms = performance.now() - t0;
	assert.deepEqual(p.pageTitles(), ["Page 300"]);
	assert.ok(ms < 3000, `${Math.round(ms)} ms`);
	p.close();
});

test("the link lookup answers as it always did: the first place in file order, titles before headings within an activity, a module's scope", () => {
	const text = `${head()}> [!module|m1] M1\n\n> [!activity|x] X\n\n## Shared words\n\n> [!activity|y] Y\n\n> [!page|py] Shared words\n\nPage.\n\n> [!module|m2] M2\n\n> [!activity|z] Z\n\n## Shared words\n`;
	const { nav } = build(text);
	assert.deepEqual(core.findHeading(nav, "Shared words", "m1").place, { screen: "activity:m1/x", tab: null, part: 0 }, "the first in the module");
	assert.deepEqual(core.findHeading(nav, "shared-words", "m2").place, { screen: "activity:m2/z", tab: null, part: 0 }, "by the slug, in its own module");
	assert.deepEqual(core.findHeading(nav, "Shared words", null).place.screen, "activity:m1/x", "no scope: the whole file, the first");
	assert.equal(core.findHeading(nav, "Nothing here", "m1"), null);
	const hit = core.findHeading(nav, "Shared words", "m1");
	hit.place.part = 99;
	assert.equal(core.findHeading(nav, "Shared words", "m1").place.part, 0, "a hit is a copy");
});

/* ---- S4: ids stay unique ---- */

test("page ids written g, g, g-2 are g, g-2, g-3, the same on every reading; a parent: of a shared id is the first page that wrote it", () => {
	const text = `${head()}> [!activity|a] A\n\n> [!page|g] First\n\nOne.\n\n> [!page|g] Second\n\nTwo.\n\n> [!page|g-2] Third\n\nThree.\n\n> [!page|kid parent:g] Kid\n\nFour.\n\n> [!page|kid3 parent:g-2] Kid of the third\n\nFive.\n`;
	const read = () => only(build(text).nav).tabs[0].tree.map((p) => [p.id, p.title, p.parent?.title ?? null]);
	assert.deepEqual(read(), [
		["g", "First", null],
		["kid", "Kid", "First"],
		["g-2", "Second", null],
		["g-3", "Third", null],
		["kid3", "Kid of the third", "Third"],
	]);
	assert.deepEqual(read(), read(), "stable");
	const said = build(text).nav.problems;
	assert.equal(said.length, 2);
	assert.match(said[0], /the page id "g" is used twice in this tab, so this page is "g-2"/);
	assert.match(said[1], /the page id "g-2" is used twice in this tab, so this page is "g-3"/);
});

test("a saved place for the third of g, g, g-2 reopens the third page, not the second", async () => {
	const text = `${head()}> [!activity|a] A\n\n> [!page|g] First\n\nOne.\n\n> [!page|g] Second\n\nTwo.\n\n> [!page|g-2] Third\n\nThree.\n`;
	const p = pane(text, { state: { version: 2, screen: "activity:/a", page: "g-3", part: 0 } });
	await p.settled();
	assert.deepEqual(p.pageTitles(), ["Third"]);
	assert.deepEqual(p.view.getState().page, "g-3");
	p.close();
});

/* ---- S5: the 0.17 note ---- */

const note17 = (body, marker = "0.17") => core.parseBooklet(`${head(marker)}> [!activity|a] A\n\n${body}`).problems;
const MAY_NOT_DRAW = /may not draw/;

test("a 0.17 file with a wordless unknown kind gets the note; Obsidian's own callouts and a plain file do not", () => {
	const lesson = note17("> [!lesson] Title\n> body\n");
	assert.match(lesson[0] ?? "", /This file says booklet: 0.17\. This view reads format 0\.16 and the page lines of 0\.17/);
	assert.match(lesson[0], MAY_NOT_DRAW);
	assert.deepEqual(note17("> [!note] Title\n> body\n\n> [!warning] Careful\n\n> [!TIP] Tip\n"), [], "an Obsidian callout is a callout");
	assert.deepEqual(note17("Plain words.\n"), []);
	assert.match(note17("> [!lesson|x] Title\n")[0], MAY_NOT_DRAW, "with an id, as before");
});

test("a page line with a setting it does not take says so on its own line and is not the view's failing: no \"may not draw\"", () => {
	const said = note17("> [!page|x hidden] T\n\nWords.\n");
	assert.deepEqual(said, ["Line 8: a page line takes no `hidden` setting, so it was ignored."]);
	const key = note17("> [!page|x shiny:1] T\n\nWords.\n");
	assert.deepEqual(key, ["Line 8: a page line takes no `shiny:` setting, so it was ignored."]);
	// another kind's refused setting still counts as unread in a 0.17 file
	assert.match(note17("> [!text|q shiny:1] Q\n")[0], MAY_NOT_DRAW);
});

test("every 0.x marker reads page lines: a 0.16 note with a page line draws its tree and says nothing of it", () => {
	const text = `${head("0.16")}> [!activity|a] A\n\n> [!page|p] P\n\nWords.\n`;
	const book = core.parseBooklet(text);
	assert.deepEqual(book.problems, []);
	assert.deepEqual(only(core.buildNav(book, text)).tabs[0].tree.map((x) => x.title), ["P"]);
});

/* ---- S8: a very deep chain, a page line in a data section ---- */

test("a chain of 20,000 pages, each under the one before, builds without overflowing the stack and reads in order", () => {
	let text = `${head()}> [!activity|a] A\n\n`;
	const n = 20000;
	for (let i = 0; i < n; i++) text += `> [!page|p${i}${i ? ` parent:p${i - 1}` : ""}] Page ${i}\n\nW.\n\n`;
	const { ms, out } = timed(() => build(text).nav);
	const tab = only(out).tabs[0];
	assert.equal(tab.tree.length, n);
	assert.equal(tab.tree[n - 1].title, `Page ${n - 1}`);
	assert.equal(tab.tree[n - 1].at, n - 1);
	assert.ok(ms < 3000, `${Math.round(ms)} ms`);
});

test("a cycle among pages, and a page whose parent chain leads into the cycle: the cycle stands at the top, the tail keeps its parent, and nothing loops", () => {
	const text = `${head()}> [!activity|a] A\n\n> [!page|a1 parent:b1] A1\n\nW.\n\n> [!page|b1 parent:c1] B1\n\nW.\n\n> [!page|c1 parent:a1] C1\n\nW.\n\n> [!page|t1 parent:a1] Tail\n\nW.\n\n> [!page|t2 parent:t1] Tail 2\n\nW.\n`;
	const { nav } = build(text);
	const tab = only(nav).tabs[0];
	assert.deepEqual(tab.tree.map((p) => [p.title, p.parent?.title ?? null]), [
		["A1", null],
		["Tail", "A1"],
		["Tail 2", "Tail"],
		["B1", null],
		["C1", null],
	]);
	assert.equal(nav.problems.filter((x) => /its own ancestor/.test(x)).length, 3);
});

test("a page line in a data section is said and ignored", () => {
	const text = `${head()}> [!activity|a] A\n\nWords.\n\n> [!data]\n\n> [!page|p] P\n\nMore.\n`;
	const book = core.parseBooklet(text);
	assert.ok(book.problems.some((x) => /a page line in a data section, where only blocks are read, so it was ignored/.test(x)), book.problems.join("|"));
	assert.deepEqual(only(core.buildNav(book, text)).tabs[0].tree.map((x) => x.named), [false]);
});

/* ---- S7: the menu, focus, headings, labels ---- */

test("the page title is a heading a move lands on: a press on the menu or on Next focuses it; the first drawing and a drawing from history do not; the menu stays open", async () => {
	const p = pane(WIKI, { state: wikiAt("wiki", 1) });
	await p.settled();
	const h = p.el.querySelector(".booklet-pagetitle");
	assert.equal(h.tagName, "H2");
	assert.equal(h.getAttribute("tabindex"), "-1");
	assert.notEqual(w.document.activeElement, h, "not on the first drawing");
	menu(p).open = true;
	menu(p).dispatchEvent(new w.Event("toggle"));
	click([...menu(p).querySelectorAll(".booklet-pagelist a")].find((a) => p.words(a) === "The feelings grid"));
	await p.settled();
	const now = p.el.querySelector(".booklet-pagetitle");
	assert.equal(p.words(now), "The feelings grid");
	assert.equal(w.document.activeElement, now, "after a menu press");
	assert.equal(menu(p).open, true, "the menu stays open");
	w.document.activeElement.blur();
	await p.pageNext();
	assert.equal(w.document.activeElement, p.el.querySelector(".booklet-pagetitle"), "after Next");
	w.document.activeElement.blur();
	await p.back();
	await p.settled();
	assert.notEqual(w.document.activeElement, p.el.querySelector(".booklet-pagetitle"), "not after Obsidian's Back");
	p.close();
});

test("exactly one aria-current=page on a screen with a menu: the menu's; the trail's last step is plain words", async () => {
	for (const [tab, part] of [["wiki", 0], ["wiki", 1], ["wiki", 4], ["quiz", 0]]) {
		const p = pane(WIKI, { state: wikiAt(tab, part) });
		await p.settled();
		const current = p.all("[aria-current='page']");
		assert.equal(current.length, 1, `${tab} ${part}: ${current.map(p.words).join("|")}`);
		assert.ok(menu(p).contains(current[0]), "it is the menu's");
		p.close();
	}
	// with no menu (a tab of one named page) the trail keeps its mark: still one
	const one = `${head()}> [!activity|a] A\n\n> [!page|p] Only\n\nWords.\n`;
	const q = pane(one, { state: { version: 1, screen: "activity:/a", part: 0 } });
	await q.settled();
	assert.equal(menu(q), null);
	assert.equal(q.all("[aria-current='page']").length, 1);
	q.close();
	// a tab with no page line is drawn as in 0.6.0
	const old = pane(`${head("0.16")}> [!activity|a] A\n\nWords.\n`, { state: { version: 1, screen: "activity:/a", part: 0 } });
	await old.settled();
	assert.equal(old.all("[aria-current='page']").length, 1);
	old.close();
});

test("a page group's label keeps the page's own name with the count; a tab of no page line keeps \"Page 2 of 3\"", async () => {
	const p = pane(WIKI, { state: wikiAt("wiki", 5) });
	await p.settled();
	assert.equal(p.pager().at, "1 of 2");
	assert.equal(p.el.querySelector(".booklet-pagebody").getAttribute("aria-label"), "The two axes, 1 of 2");
	p.close();
	const text = `${head("0.16")}> [!activity|a] A\n\nOne.\n\n***\n\nTwo.\n\n***\n\nThree.\n`;
	const q = pane(text, { state: { version: 1, screen: "activity:/a", part: 1 } });
	await q.settled();
	assert.equal(q.el.querySelector(".booklet-pagebody").getAttribute("aria-label"), "Page 2 of 3");
	q.close();
});

test("a deep tree scrolls inside its menu: the list has an overflow rule", () => {
	const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
	const rule = /\.booklet-pagelist \{[^}]*\}/.exec(css)?.[0] ?? "";
	assert.match(rule, /max-height:/);
	assert.match(rule, /overflow:\s*auto/);
	assert.match(css, /\.booklet-treelabel \{[^}]*margin-top:\s*var\(--size-4-/);
});

/* ---- the gaps the review found ---- */

test("Back from \"3 of 3\" goes to part 2, and from \"2 of 3\" to part 1", async () => {
	const text = `${head()}> [!activity|a] A\n\n> [!page|p] Long\n\nOne.\n\n***\n\nTwo.\n\n***\n\nThree.\n`;
	const p = pane(text, { state: { version: 2, screen: "activity:/a", page: "p", part: 2 } });
	await p.settled();
	assert.equal(p.pager().at, "3 of 3");
	await p.pageBack();
	assert.equal(p.pager().at, "2 of 3");
	await p.pageBack();
	assert.equal(p.pager().at, "1 of 3");
	p.close();
});

test("the title search needs every word: a title with one of two words is not a title hit", () => {
	const text = `${head()}> [!activity|a] A\n\n> [!page|s] Soil care\n\nDigging.\n\n> [!page|w] Water care\n\nPouring.\n\n> [!page|o] Other\n\nSoil and water care in one place.\n`;
	const tab = only(build(text).nav).tabs[0];
	assert.deepEqual(core.searchPages(tab, "soil care").map((p) => p.title), ["Soil care", "Other"], "Water care has one of the two words and is not a hit at all");
});

test("the menu is not drawn for a tab of one page", async () => {
	const text = `${head()}> [!activity|a] A\n\n> [!page|p] Only\n\nWords.\n`;
	const p = pane(text, { state: { version: 1, screen: "activity:/a", part: 0 } });
	await p.settled();
	assert.equal(menu(p), null);
	assert.equal(p.all(".booklet-pagetitle").length, 1, "its title is still drawn");
	p.close();
});

test("the menu's open state is kept by the toggle event, and dropped when a different note loads", async () => {
	const p = pane(WIKI, { state: wikiAt("wiki", 1) });
	await p.settled();
	menu(p).open = true;
	menu(p).dispatchEvent(new w.Event("toggle"));
	await p.pageNext();
	assert.equal(menu(p).open, true, "kept across a move, by the toggle alone (nothing typed)");
	assert.equal(menu(p).querySelector("input").value, "");
	p.view.setViewData(WIKI, true);
	await p.settled();
	p.view.go(wikiAt("wiki", 1));
	await p.settled();
	assert.equal(menu(p).open, false, "a note loaded again starts with the menu closed");
	p.close();
});

test("moving off a named page leaves no page in the saved place: it reads as version 1 and nothing more", async () => {
	const text = `${head()}> [!activity|a] A\n\n> [!page|p] Only\n\nWords.\n\n> [!activity|b] B\n\nPlain words.\n`;
	const p = pane(text, { state: { version: 2, screen: "activity:/a", page: "p", part: 0 } });
	await p.settled();
	assert.equal(p.view.getState().version, 2);
	assert.equal(p.view.getState().page, "p");
	await p.pageNext();
	assert.equal(p.screen, "activity:/b");
	const s = p.view.getState();
	assert.equal(s.page, undefined);
	assert.equal(s.version, 1);
	assert.equal(sha(p.disk.text), sha(text));
	p.close();
});

/* ---- lines the mutation run showed no test could break (the 0.8.0 trim) ---- */

test("\"Mentioned on\" counts a link after a closed <pre>, $$ or comment block, after a fence, and after an indented block, wherever the text starts", () => {
	const blocks = ["<pre>\n[[#Hidden]]\n</pre>", "$$\n[[#Hidden]]\n$$", "<!--\n[[#Hidden]]\n-->", "```\n[[#Hidden]]\n```", "Text.\n\n    [[#Hidden]]"];
	for (const block of blocks) assert.deepEqual(core.headingLinksIn(`${block}\n[[#Seen]]`), ["Seen"], `after ${JSON.stringify(block)}`);
	assert.deepEqual(core.headingLinksIn(`[[#Before]]\n\`\`\`\n[[#Hidden]]\n\`\`\`\n[[#After]]`), ["Before", "After"], "a fence in the middle");
	assert.deepEqual(core.headingLinksIn("Text.\n\n    [[#Hidden]]\n\n[[#Seen]]"), ["Seen"], "after an indented block and a blank line");
	assert.deepEqual(core.headingLinksIn("    [[#Hidden]]\n\n[[#Seen]]"), ["Seen"], "an indented block that opens the text is code");
	assert.deepEqual(core.headingLinksIn("Text.\n\n    [[#Hidden]]\nA plain line\n    [[#Seen]]"), ["Seen"], "an indented line after a plain line is its paragraph's, not code");
});

test("the search holds the prompts of a page's questions, as the README says", () => {
	const text = `${head()}> [!activity|a] A\n\n> [!page|one] One\n\nWords.\n\n> [!text|q1] Which zebra did you see?\n\n> [!page|two] Two\n\nOther words.\n`;
	const tab = only(build(text).nav).tabs[0];
	assert.deepEqual(core.searchPages(tab, "zebra").map((p) => p.title), ["One"]);
	assert.deepEqual(core.searchPages(tab, "zebra words").map((p) => p.title), ["One"], "with a word of its prose too");
});

test("a page whose title starts with an emoji is found by a link with or without it, and counted in \"Mentioned on\" for either; one with no letters is found by each form alone", () => {
	const text = `${head()}> [!activity|a] A\n\n> [!page|waves] 🌊 Big waves\n\nWords.\n\n> [!page|marks] 🌊 !!!\n\nMarks.\n\n> [!page|plain] Plain one\n\nSee [[#Big waves]] and [[#!!!]].\n\n> [!page|written] Written one\n\nSee [[#🌊 Big waves]] and [[#🌊 !!!]].\n\n> [!page|none] Unlinked\n\nNothing.\n`;
	const { nav } = build(text);
	const na = only(nav);
	const tab = na.tabs[0];
	const waves = tab.tree.find((p) => p.id === "waves");
	assert.equal(waves.title, "Big waves");
	for (const link of ["Big waves", "🌊 Big waves"]) assert.equal(core.findHeading(nav, link, null)?.place.part, waves.at, `a link to "${link}"`);
	assert.deepEqual(core.mentionsOf(nav, na, tab, waves).map((m) => m.title), ["Plain one", "Written one"]);
	// a title with no letters has no slug, so the plain form and the written form are each found only by their own entry in the index
	const marks = tab.tree.find((p) => p.id === "marks");
	assert.deepEqual([marks.title, marks.written], ["!!!", "🌊 !!!"]);
	for (const link of ["!!!", "🌊 !!!"]) assert.equal(core.findHeading(nav, link, null)?.place.part, marks.at, `a link to "${link}"`);
	assert.deepEqual(core.mentionsOf(nav, na, tab, marks).map((m) => m.title), ["Plain one", "Written one"]);
});

test("the menu's search box stops the keys it uses: Escape (with words) and Enter (with a hit) keep their default and go no further", async () => {
	const p = pane(WIKI, { state: wikiAt("wiki", 4) });
	await p.settled();
	let reached = 0;
	p.el.addEventListener("keydown", () => reached++);
	const input = menu(p).querySelector("input");
	typeInto(input, "axes");
	assert.equal(press(input, "Escape"), false, "Escape with words in the box: default prevented");
	assert.equal(reached, 0, "and not passed up (Obsidian would close a modal or the pane on it)");
	assert.equal(input.value, "", "and the words are cleared");
	assert.equal(press(input, "Escape"), true, "Escape in an empty box is left to the app");
	assert.equal(reached, 1);
	typeInto(input, "axes");
	assert.equal(press(input, "Enter"), false, "Enter with a hit: default prevented");
	await p.settled();
	assert.deepEqual(p.pageTitles(), ["The two axes"]);
	p.close();
});

test("a cycle is found when a chain read earlier has already been walked, and a page under the cycle stays under its page", () => {
	const text = `${head()}> [!activity|a] A\n\n> [!page|a1 parent:a2] A1\n\n> [!page|a2 parent:root] A2\n\n> [!page|root] Root\n\n> [!page|c parent:d] C\n\n> [!page|d parent:c] D\n\n> [!page|e parent:c] E\n`;
	const { nav } = build(text);
	const tab = only(nav).tabs[0];
	assert.deepEqual(tab.tree.map((p) => `${p.id}<${p.parent?.id ?? ""}`), ["root<", "a2<root", "a1<a2", "c<", "e<c", "d<"], "the chain under Root is read, then the cycle's two pages at the top, E under C");
	assert.deepEqual(nav.problems.map((x) => x.replace(/^Line \d+: /, "")), ['the page "c" is its own ancestor (through "d"), so it stands at the top of the tab.', 'the page "d" is its own ancestor (through "c"), so it stands at the top of the tab.']);
});
