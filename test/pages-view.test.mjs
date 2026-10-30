/*
 * Page trees, stage A, in the view: what the view does with a tab of named pages. A note with page lines is drawn, searched and left
 * again without writing a byte of it; the page titles head their pages; what the tree could not read is listed with the reader's own
 * problems; typed words survive a move from one page to the next. Every note is made up.
 */
import "./fixed-date.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { typeInto } from "./dom.mjs";
import { WIKI, core, sha } from "./helpers.mjs";
import { pane, sleep } from "./pane.mjs";
import { placesOf } from "./legacy-structure.mjs";

const state = (screen, tab, part) => ({ version: 1, screen, ...(tab ? { tab } : {}), part });

test("every place of a note with page lines draws, and nothing is written to the note", async () => {
	const places = placesOf(WIKI);
	assert.ok(places.length >= 12, `${places.length} places: the three tabs, every part`);
	for (const [screen, tab, part] of places) {
		const p = pane(WIKI, { state: state(screen, tab, part) });
		await p.settled();
		assert.equal(p.screen, screen);
		assert.equal(p.disk.writes, 0, `${screen} ${tab} ${part}`);
		assert.equal(sha(p.disk.text), sha(WIKI), "the note's bytes are as they were");
		p.close();
	}
});

test("a named page's title heads each of its parts, and Next walks the wiki tab from its first page to its last", async () => {
	const p = pane(WIKI, { state: state("activity:calm/check-in", "wiki", 0) });
	await p.settled();
	assert.deepEqual(p.tabs(), ["Learn", "Check in", "Past check-ins"]);
	assert.deepEqual(p.pageTitles(), [], "the tab's own first page has no page line, so no page title");
	assert.equal(p.pager().at, "", "the first page is one part");
	const seen = [];
	for (let i = 0; i < 8; i++) {
		await p.pageNext();
		seen.push(p.pageTitles().join("|"));
		assert.equal(p.all("[data-booklet-q]").length, 0, "a page line is no question: nothing on the wiki tab asks anything");
	}
	// depth first: the body map, its two pages, the grid, its two pages (the first in two parts), the last page
	assert.deepEqual(seen, ["The body map", "Choosing a place", "Words for what you notice", "The feelings grid", "The two axes", "The two axes", "More than one at once", "Thoughts as headlines"]);
	assert.deepEqual(p.pager().buttons, ["Back"], "the last part of the last page: Back only, there is no activity after it");
	assert.equal(sha(p.disk.text), sha(WIKI));
	p.close();
});

test("the quiz tab has two named pages and nothing before them: it opens on the first, whose title heads it", async () => {
	const p = pane(WIKI, { state: state("activity:calm/check-in", "quiz", 0) });
	await p.settled();
	assert.deepEqual(p.pageTitles(), ["Your body"]);
	await p.pageNext();
	assert.deepEqual(p.pageTitles(), ["Your mind"]);
	p.close();
});

test("what the tree could not read is listed with the reader's own problems; a note with none lists none", async () => {
	const bad = `---\nbooklet: "0.16"\ntitle: Odd\n---\n\n> [!activity|a] A\n\n> [!page|p1 parent:nowhere] P1\n\nWords.\n\n> [!page|p2 parent:p2] P2\n\nWords.\n`;
	const p = pane(bad);
	await p.settled();
	const said = p.all(".booklet-problems li").map(p.words);
	assert.deepEqual(said, [
		'Line 8: the page "p1" names the parent "nowhere", which is no page of this tab (a parent is a page of the same tab), so it stands at the top of the tab.',
		'Line 12: the page "p2" is its own parent, so it stands at the top of the tab.',
	]);
	assert.equal(p.all(".booklet-problems summary").map(p.words)[0], "2 things in this note could not be read");
	p.close();
	const fine = pane(`---\nbooklet: "0.16"\ntitle: Fine\n---\n\n> [!activity|a] A\n\n> [!page|p1] P1\n\nWords.\n\n> [!page|p2 parent:p1] P2\n\nWords.\n`);
	await fine.settled();
	assert.equal(fine.all(".booklet-problems").length, 0);
	fine.close();
});

test("words typed on one page are written before the move to the next, and found again when the reader comes back", async () => {
	const p = pane(WIKI, { state: state("activity:calm/check-in", "quiz", 1) });
	await p.settled();
	assert.deepEqual(p.pageTitles(), ["Your mind"]);
	const field = p.all("[data-booklet-q='other'] input.booklet-text")[0] ?? p.all("[data-booklet-q='other'] textarea")[0];
	assert.ok(field, "the question on the second page is drawn");
	typeInto(field, "made-up words, typed and not yet written");
	assert.ok(!p.disk.text.includes("made-up words"), "not written yet");
	await p.pageBack();
	await sleep(40);
	await p.view.writes;
	assert.deepEqual(p.pageTitles(), ["Your body"]);
	assert.ok(p.disk.text.includes("made-up words, typed and not yet written"), "the move wrote them");
	assert.ok(core.parseBooklet(p.disk.text).records.drafts["calm"]?.["check-in"]?.other === "made-up words, typed and not yet written", "into the activity's draft");
	await p.pageNext();
	const again = p.all("[data-booklet-q='other'] input.booklet-text")[0] ?? p.all("[data-booklet-q='other'] textarea")[0];
	assert.equal(again.value, "made-up words, typed and not yet written");
	// only the draft was written: the design above the records is as it was
	const [before] = WIKI.split("%%");
	assert.ok(p.disk.text.startsWith(before.trimEnd()), "everything above the records is as it was");
	p.close();
});
