/*
 * The fold of an activity's kept entries: its heading says how many are kept and opens and closes the list; the reader's choice
 * is kept for each activity while the pane is open, survives a redraw, and is never written into the note or into the saved place.
 * Every note is made up.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { core, norm, sha } from "./helpers.mjs";
import { pane } from "./pane.mjs";

const BASE = `---\nbooklet: "0.17"\ntitle: Two logs\n---\n\n> [!activity|log repeat] Log\n\n> [!text|what] What happened?\n\n> [!activity|mood repeat daily] Mood\n\n> [!text|how] How was it?\n`;

/** The note with `n` made-up kept entries for the activity `id` (its one question `q`). */
function withEntries(text, id, q, n) {
	for (let i = 0; i < n; i++) {
		text = core.setDraftAnswer(text, "", id, q, `Words ${i + 1}`);
		text = core.finalizeDraft(text, "", id, { ts: `2026-09-${String(i + 1).padStart(2, "0")}T09:00:00Z` }).text;
	}
	return text;
}

const fold = (p) => p.el.querySelector(".booklet-fold");
const list = (p) => p.el.querySelector(".booklet-entry-list");
const isOpen = (p) => !list(p).hidden && fold(p).getAttribute("aria-expanded") === "true";
const press = async (p, el) => {
	el.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
	await p.settled();
};

test("the heading of the kept entries says how many are kept, starts open, and folds and unfolds the list", async () => {
	const p = pane(withEntries(BASE, "log", "what", 4), { screen: "activity:/log" });
	await p.settled();
	assert.equal(fold(p).tagName, "BUTTON", "a real button");
	assert.equal(fold(p).textContent, "Kept entries (4)");
	assert.ok(isOpen(p), "open to begin with, as it was drawn before it could fold");
	assert.equal(p.all(".booklet-entry").length, 4);
	assert.ok(fold(p).querySelector("svg"), "Obsidian's own chevron");
	assert.equal(fold(p).querySelector("svg").getAttribute("data-icon"), "lucide-chevron-down");
	assert.equal(fold(p).getAttribute("aria-controls"), list(p).id);
	await press(p, fold(p));
	assert.equal(isOpen(p), false);
	assert.equal(list(p).hidden, true);
	assert.equal(fold(p).getAttribute("aria-expanded"), "false");
	assert.equal(fold(p).querySelector("svg").getAttribute("data-icon"), "lucide-chevron-right");
	assert.equal(fold(p).textContent, "Kept entries (4)", "the count stays when it is folded");
	assert.equal(p.all(".booklet-entry").length, 4, "the same entries are in the same DOM, only hidden");
	await press(p, fold(p));
	assert.ok(isOpen(p));
	p.close();
});

test("a repeat daily activity says Kept days; none kept says (0) and the list says so when open", async () => {
	const p = pane(BASE, { screen: "activity:/mood" });
	await p.settled();
	assert.equal(fold(p).textContent, "Kept days (0)");
	assert.match(list(p).textContent, /No entries kept yet\./);
	p.close();
	const one = pane(withEntries(BASE, "log", "what", 1), { screen: "activity:/log" });
	await one.settled();
	assert.equal(fold(one).textContent, "Kept entries (1)");
	one.close();
});

test("the choice survives a redraw (leaving the screen and coming back, an answer, Finalize) and each activity keeps its own", async () => {
	const p = pane(withEntries(withEntries(BASE, "log", "what", 3), "mood", "how", 2), { screen: "activity:/log" });
	await p.settled();
	await press(p, fold(p));
	assert.equal(isOpen(p), false);
	// to the other activity: its own list is open; fold it too, then go back
	await p.trailTo("Two logs");
	await p.card("2.Mood");
	assert.equal(fold(p).textContent, "Kept days (2)");
	assert.ok(isOpen(p), "another activity has its own choice");
	await p.trailTo("Two logs");
	await p.card("1.Log");
	assert.equal(isOpen(p), false, "coming back to the screen: still folded");
	// an answer typed and Finalize: the screen is drawn again, the fold stays shut and the count moves on
	const input = p.el.querySelector("input.booklet-text, textarea.booklet-text");
	input.value = "More words";
	input.dispatchEvent(new window.Event("input", { bubbles: true }));
	await p.settled();
	await press(p, p.el.querySelector(".booklet-finalize"));
	await p.settled();
	assert.equal(fold(p).textContent, "Kept entries (4)");
	assert.equal(isOpen(p), false, "Finalize leaves the fold as the reader had it");
	// a note changed elsewhere draws again with the same choice
	p.view.setViewData(withEntries(p.disk.text, "log", "what", 0) + "", false);
	await p.settled();
	assert.equal(isOpen(p), false);
	await press(p, fold(p));
	assert.ok(isOpen(p));
	assert.equal(p.all(".booklet-entry").length, 4);
	p.close();
});

test("Show all works inside the open fold; a long list is the same list", async () => {
	const p = pane(withEntries(BASE, "log", "what", 25), { screen: "activity:/log" });
	await p.settled();
	assert.equal(fold(p).textContent, "Kept entries (25)");
	const more = p.el.querySelector(".booklet-more");
	assert.ok(more && /Show all 25 entries/.test(more.textContent));
	const shown = p.all(".booklet-entry").length;
	assert.ok(shown < 25);
	await press(p, more);
	assert.equal(p.all(".booklet-entry").length, 25);
	assert.ok(isOpen(p));
	await press(p, fold(p));
	await press(p, fold(p));
	assert.equal(p.all(".booklet-entry").length, 25, "the choice to show all outlives a fold");
	p.close();
});

test("the choice is no part of the note or of the saved place: nothing is written, the state is the same", async () => {
	const text = withEntries(BASE, "log", "what", 3);
	const p = pane(text, { screen: "activity:/log" });
	await p.settled();
	const state = JSON.stringify(norm(p.view.getState()));
	const hash = sha(p.disk.text);
	await press(p, fold(p));
	await press(p, fold(p));
	await press(p, fold(p));
	assert.equal(sha(p.disk.text), hash);
	assert.equal(p.disk.writes, 0);
	assert.equal(JSON.stringify(norm(p.view.getState())), state, "the saved place holds no fold");
	p.close();
});

/* ---- entries:folded (SPEC section 3, "Kept entries, folded") ---- */

/** The problems that name a line (the version notice, whatever its words, is not one). */
const lineProblems = (text) => norm(core.parseBooklet(text).problems.filter((x) => /^Line \d+:/.test(x)));

const MARKED = `---\nbooklet: "0.17"\ntitle: Two logs\n---\n\n> [!activity|log repeat entries:folded] Log\n\n> [!text|what] What happened?\n\n> [!activity|mood repeat daily entries:folded] Mood\n\n> [!text|how] How was it?\n\n> [!activity|plain repeat] Plain\n\n> [!text|p] Anything?\n`;

test("entries:folded: the list of kept entries starts folded, on a repeat and on a repeat daily activity, and a note without the mark is unchanged", async () => {
	const p = pane(withEntries(MARKED, "log", "what", 3), { screen: "activity:/log" });
	await p.settled();
	assert.equal(isOpen(p), false, "the mark folds the list");
	assert.equal(list(p).hidden, true);
	assert.equal(fold(p).getAttribute("aria-expanded"), "false");
	assert.equal(fold(p).querySelector("svg").getAttribute("data-icon"), "lucide-chevron-right");
	assert.equal(fold(p).textContent, "Kept entries (3)", "the count is still there");
	assert.equal(p.all(".booklet-entry").length, 3, "the entries are drawn, only hidden");
	await press(p, fold(p));
	assert.ok(isOpen(p), "the reader may open it");
	p.close();
	const daily = pane(withEntries(MARKED, "mood", "how", 2), { screen: "activity:/mood" });
	await daily.settled();
	assert.equal(fold(daily).textContent, "Kept days (2)");
	assert.equal(isOpen(daily), false);
	daily.close();
	// an activity of the same note without the mark, and the same activity in a note without it, start open
	const plain = pane(withEntries(MARKED, "plain", "p", 2), { screen: "activity:/plain" });
	await plain.settled();
	assert.ok(isOpen(plain));
	plain.close();
	const none = pane(withEntries(MARKED.replace(" entries:folded", ""), "log", "what", 2), { screen: "activity:/log" });
	await none.settled();
	assert.ok(isOpen(none));
	none.close();
});

test("entries:folded: the reader's own choice wins while the pane is open, through a redraw and a visit to another screen, and a fold with none kept starts folded too", async () => {
	const p = pane(withEntries(MARKED, "log", "what", 3), { screen: "activity:/log" });
	await p.settled();
	await press(p, fold(p));
	assert.ok(isOpen(p));
	// a redraw from a change made elsewhere (a fourth entry kept): the reader had opened it, so it stays open
	const fourth = core.setDraftAnswer(p.disk.text, "", "log", "what", "Words 4");
	p.view.setViewData(core.finalizeDraft(fourth, "", "log", { ts: "2026-09-04T09:00:00Z" }).text, false);
	await p.settled();
	assert.equal(p.all(".booklet-entry").length, 4, "the note's new text was drawn");
	assert.ok(isOpen(p), "a redraw does not fold it again");
	await p.trailTo("Two logs");
	await p.card("3.Plain");
	await p.trailTo("Two logs");
	await p.card("1.Log");
	assert.ok(isOpen(p), "coming back to the screen: still the reader's choice");
	// the reader folds it again, and it stays folded through Finalize
	await press(p, fold(p));
	assert.equal(isOpen(p), false);
	p.close();
	const empty = pane(MARKED, { screen: "activity:/log" });
	await empty.settled();
	assert.equal(fold(empty).textContent, "Kept entries (0)");
	assert.equal(isOpen(empty), false);
	empty.close();
});

test("entries:folded: nothing is written, not by drawing it nor by opening and shutting it, and the saved place holds no fold", async () => {
	const text = withEntries(MARKED, "log", "what", 3);
	const p = pane(text, { screen: "activity:/log" });
	await p.settled();
	const state = JSON.stringify(norm(p.view.getState()));
	await press(p, fold(p));
	await press(p, fold(p));
	await press(p, fold(p));
	assert.equal(p.disk.text, text, "the note is byte for byte what it was");
	assert.equal(p.disk.writes, 0);
	assert.equal(JSON.stringify(norm(p.view.getState())), state);
	p.close();
});

test("entries:folded is read from the activity's own line; a value other than folded is reported and ignored, and the list starts open", async () => {
	const book = core.parseBooklet(MARKED);
	assert.deepEqual(norm(book.activities.map((a) => [a.id, a.entriesFolded])), [["log", true], ["mood", true], ["plain", false]]);
	assert.deepEqual(lineProblems(MARKED), []);
	const bad = MARKED.replace("entries:folded] Log", "entries:shut] Log");
	const b = core.parseBooklet(bad);
	assert.equal(b.activities[0].entriesFolded, false);
	assert.deepEqual(lineProblems(bad), ["Line 6: `entries:shut` is not a setting an activity line takes (only `entries:folded`, which starts the kept-entries list folded), so it was ignored."]);
	// on a question line the mark is a setting the kind does not take, as any other
	const onQuestion = MARKED.replace("> [!text|what] What", "> [!text|what entries:folded] What");
	assert.deepEqual(core.parseBooklet(onQuestion).unread.map((u) => `Line ${u.line}: ${u.why}`), ["Line 8: a text line takes no `entries:` setting"]);
	const p = pane(withEntries(bad, "log", "what", 2), { screen: "activity:/log" });
	await p.settled();
	assert.ok(isOpen(p));
	p.close();
	// on an activity that keeps no entries it does nothing (no list is drawn), and nothing is reported
	const noRepeat = MARKED.replace("[!activity|plain repeat]", "[!activity|plain entries:folded]");
	assert.deepEqual(lineProblems(noRepeat), []);
	const q = pane(noRepeat, { screen: "activity:/plain" });
	await q.settled();
	assert.equal(q.all(".booklet-entry-list").length, 0);
	q.close();
});
