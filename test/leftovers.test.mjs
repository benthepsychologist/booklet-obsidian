/*
 * Plugin 0.7.0, stage C: the small leftovers of 0.6.0 and what pins them. A long table's numeric-column check made once for each
 * column; the tabs' panels and focus after a move for a keyboard reader; names for a screen reader without Markdown marks; a `- - -`
 * line under text read as a break; a press's default stopped; a closing code fence's rules. Every note is made up.
 */
import { click, words } from "./dom.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { SKETCH, core, norm } from "./helpers.mjs";
import { pane } from "./pane.mjs";

const { numericColumns } = await import("./.build/screens.mjs");


/* ---- a long table: the numeric columns are worked out once for each column ---- */

test("a table's numeric columns: the columns of numbers only, and each read a row at a time once, not once for every cell", () => {
	let reads = 0;
	const cell = (num) => ({ get num() { reads++; return num; } });
	const R = 200;
	const rows = Array.from({ length: R }, (_, i) => ({ cells: { n: cell(i), word: cell(undefined), mixed: i === 0 ? cell(undefined) : cell(i), none: undefined } }));
	const cols = ["n", "word", "mixed", "none"];
	assert.deepEqual([...numericColumns(rows, cols)], ["n"], "a column of numbers; a column of words, one with a word among numbers and one with no cell are not");
	assert.ok(reads <= 2 * R * cols.length, `each column is read at most twice over the rows (${reads} reads of ${R} rows)`);
	assert.deepEqual([...numericColumns([{ cells: { a: cell(1) } }, { cells: {} }], ["a"])], ["a"], "a row that has no cell in the column does not make it a column of words");
});

/* ---- tabs: a panel for each chosen tab, and focus after a move ---- */

test("module tabs: the chosen tab controls a panel, and the panel is named by that tab", async () => {
	const p = pane(SKETCH, { screen: "module:basics" });
	await p.settled();
	const tabs = p.all("[role=tab]");
	const panel = p.el.querySelector("[role=tabpanel]");
	assert.ok(panel, "a tab panel");
	const chosen = tabs.find((t) => t.getAttribute("aria-selected") === "true");
	assert.equal(chosen.getAttribute("aria-controls"), panel.id, "the chosen tab controls the panel");
	assert.equal(panel.getAttribute("aria-labelledby"), chosen.id, "the panel is named by its tab");
	assert.ok(tabs.every((t) => t.id) && new Set(tabs.map((t) => t.id)).size === tabs.length, "every tab has an id of its own");
	assert.ok(tabs.filter((t) => t !== chosen).every((t) => !t.hasAttribute("aria-controls")), "only the chosen tab has a panel on the page");
	assert.ok(panel.querySelector(".booklet-prose") && panel.querySelector(".booklet-cardrow"), "the tab's words and its cards are in the panel");
	assert.ok(!p.el.querySelector(".booklet-tabbar").contains(panel));
	await p.tab("Read first");
	const next = p.el.querySelector("[role=tabpanel]");
	assert.equal(next.getAttribute("aria-labelledby"), p.all("[role=tab]").find((t) => t.getAttribute("aria-selected") === "true").id, "after choosing another tab the panel is that tab's");
	assert.equal(p.all("[role=tabpanel]").length, 1);
	p.close();
});

test("activity tabs: the page body under a tab bar is the panel, and says which page it is; with no tab bar it is no panel", async () => {
	const p = pane(SKETCH, { screen: "activity:basics/shapes" });
	await p.settled();
	const panel = p.el.querySelector("[role=tabpanel]");
	assert.ok(panel?.classList.contains("booklet-pagebody"));
	assert.equal(panel.getAttribute("aria-labelledby"), p.all("[role=tab]").find((t) => t.getAttribute("aria-selected") === "true").id);
	assert.equal(panel.getAttribute("aria-description"), "Page 1 of 2", "the page count is its description, the name being its tab's");
	assert.equal(panel.getAttribute("aria-label"), "Page 1 of 2", "the page group's own label is kept; the panel is named by its tab, which aria-labelledby gives");
	await p.pageNext();
	assert.equal(p.el.querySelector("[role=tabpanel]").getAttribute("aria-description"), "Page 2 of 2");
	p.close();
	const plain = pane(SKETCH, { screen: "activity:basics/lines" });
	await plain.settled();
	assert.equal(plain.all("[role=tabpanel]").length, 0, "an activity with no tab bar has no tab panel");
	assert.equal(plain.el.querySelector(".booklet-pagebody").getAttribute("role"), "group", "its pages are still a group named by the page");
	plain.close();
});

test("focus after a move: a press that goes to another screen puts focus on its title, another page of the same screen on the page, and no press leaves it alone", async () => {
	const p = pane(SKETCH);
	await p.settled();
	const active = () => p.el.ownerDocument.activeElement;
	assert.notEqual(active()?.className, "booklet-screentitle", "a note opened takes no focus");
	await p.card("2.The basics");
	assert.equal(p.screen, "module:basics");
	assert.ok(active().classList.contains("booklet-screentitle"), "a card pressed: focus is on the new screen's title");
	assert.equal(active().getAttribute("tabindex"), "-1", "the title is a focus target, not a tab stop");
	assert.equal(words(active()), "The basics");
	await p.card("2.Boxes and cylinders");
	assert.equal(words(active()), "Boxes and cylinders", "and so for an activity");
	await p.pageNext();
	assert.ok(active().classList.contains("booklet-pagebody"), "another page of the same screen: focus is on the page");
	await p.tab("Cylinders");
	assert.ok(active().matches("[role=tab]"), "a tab chosen keeps focus on its tab, as before");
	// not a press: Obsidian's own Back puts focus where Obsidian puts it
	await p.back();
	await p.settled();
	assert.notEqual(active()?.className, "booklet-pagebody");
	p.close();
});

/* ---- names for a screen reader carry no Markdown marks ---- */

test("the tab bar's name is the title's plain words, with no Markdown marks", async () => {
	const text = SKETCH.replace("> [!module|basics icon:shapes] The basics", "> [!module|basics icon:shapes] **The** *basics* with `code`").replace("> [!activity|shapes icon:box tab:practice] Boxes and cylinders", "> [!activity|shapes icon:box tab:practice] **Boxes** and [cylinders](https://example.org)");
	const m = pane(text, { screen: "module:basics" });
	await m.settled();
	assert.equal(m.el.querySelector("[role=tablist]").getAttribute("aria-label"), "The basics with code");
	m.close();
	const a = pane(text, { screen: "activity:basics/shapes" });
	await a.settled();
	assert.equal(a.el.querySelector("[role=tablist]").getAttribute("aria-label"), "Boxes and cylinders");
	a.close();
});

/* ---- a press's own action only ---- */

test("a press on a link of the trail, a pager button, a tab and a card has its default stopped, so nothing else of the page happens", async () => {
	const p = pane(SKETCH, { screen: "activity:basics/shapes" });
	await p.settled();
	const trail = p.el.querySelector("a.booklet-trail-link");
	assert.equal(trail.getAttribute("href"), "#");
	assert.equal(click(p.el.querySelector(".booklet-tabbtn:not(.is-active)")).defaultPrevented, true, "a tab");
	await p.settled();
	assert.equal(click(p.el.querySelector(".booklet-pager .booklet-pager-next, .booklet-pager button:last-of-type")).defaultPrevented, true, "a pager button");
	await p.settled();
	assert.equal(click(p.el.querySelector("a.booklet-trail-link")).defaultPrevented, true, "a link of the trail");
	p.close();
});

/* ---- `- - -` under a line of text ---- */

test("a run of hyphens under text underlines it; `- - -` is a break, as Markdown reads them", () => {
	const t = (line, above) => core.isThematicBreak(line, above);
	assert.equal(t("---", false), true, "a rule after a blank line");
	assert.equal(t("---", true), false, "hyphens under text underline it");
	assert.equal(t("-----   ", true), false);
	assert.equal(t("- - -", true), true, "spaces between the hyphens: a break, even under text");
	assert.equal(t("- - -", false), true);
	assert.equal(t("***", true), true, "stars and underscores break under text");
	assert.equal(t("___", true), true);
	assert.equal(t("--", false), false, "two are no break");
	assert.equal(t("    ---", false), false, "four spaces in: code");
});

test("pages: `- - -` straight under a line of text makes a new page, and `---` there does not", () => {
	const pages = (rule) => core.pagesOf(core.parseBooklet(`---\nbooklet: "0.16"\n---\n\n> [!activity|a] A\n\nA line of text\n${rule}\nMore text.\n`).activities[0].segments).length;
	assert.equal(pages("---"), 1, "a heading underline");
	assert.equal(pages("- - -"), 2, "a break");
	assert.equal(pages("***"), 2);
});

test("an opening: a `- - -` line under text is a break and is not drawn, a `---` there stays as the heading underline", () => {
	const opening = (rule) => core.parseBooklet(`---\nbooklet: "0.16"\n---\n\nA line of text\n${rule}\nMore.\n\n> [!activity|a] A\n`).openings[0].markdown;
	assert.ok(!/- - -/.test(opening("- - -")), "the break is dropped");
	assert.match(opening("---"), /A line of text\n---\nMore/, "the underline stays");
});

/* ---- a code fence's closing rules ---- */

test("a fence closes on a line of the same character, at least as long, with nothing after it but spaces, indented at most three", () => {
	const end = (lines, mark = "```") => core.fenceEnd(lines, 0, mark);
	assert.equal(end(["```", "x", "```"]), 2, "the plain case");
	assert.equal(end(["```", "x", "~~~", "y", "```"]), 4, "another character does not close it");
	assert.equal(end(["````", "x", "```", "y", "````"], "````"), 4, "a shorter fence does not close it");
	assert.equal(end(["```", "x", "`````"]), 2, "a longer one does");
	assert.equal(end(["```", "x", "``` js", "y", "```"]), 4, "a closing fence carries no words");
	assert.equal(end(["```", "x", "```   "]), 2, "spaces after it are fine");
	assert.equal(end(["```", "x", "   ```"]), 2, "three spaces in are fine");
	assert.equal(end(["```", "x", "    ```", "y", "```"]), 4, "four are code");
	assert.equal(end(["~~~", "x", "~~~"], "~~~"), 2);
	assert.equal(end(["```", "x", "y"]), 3, "never closed: it runs to the end");
	assert.deepEqual(norm(core.fencedLines(["a", "```", "b", "```", "c"])), [false, true, true, true, false]);
});

test("a card's blurb is the first paragraph up to a break under its text: `- - -` and `***` end it, a `---` underline makes the paragraph a heading, which is not a blurb", () => {
	const b = (md) => core.firstParagraph(md);
	assert.equal(b("A line of text\n- - -\nAfter the break."), "A line of text");
	assert.equal(b("A line of text\n***\nAfter the break."), "A line of text");
	assert.equal(b("A heading\n---\n\nThe words under it."), "The words under it.");
	assert.equal(b("Setext\n=====\n\nBody."), "Body.");
	assert.equal(b("Two lines\nof one paragraph.\n\nNext."), "Two lines of one paragraph.", "a paragraph's own line ends stay words");
});
