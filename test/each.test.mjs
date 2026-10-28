/*
 * A question asked for each pick of another (`each:<id>`, src/core/each.ts and src/each-question.ts), as the approved
 * design for format 0.16 has it: the setting and its mistakes, the picks and their words, the pairs it stores (a pick
 * taken back keeps its pair, picking it again brings it back), the empty-draft rule, kept entries one line per pick,
 * the reader's own options offered under every pick and in later entries, and the reader's field and press kept safe
 * as copies come and go around them. The view runs over a jsdom document on the test vault's made-up check-in note.
 */
import { window as w } from "./dom.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, core, norm } from "./helpers.mjs";

const { BookletView } = await import("./.build/view.mjs");
const { Notice } = await import("./obsidian-stub.mjs");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CHECKIN = readFileSync(join(ROOT, "test-vault", "Check-in.booklet.md"), "utf8");

const GRID = { engine: "grid-select", cells: [{ id: "up", label: "Up", color: "green" }, { id: "down", label: "Down", color: "blue" }], items: [{ id: "glad", cell: "up", label: "Glad" }, { id: "low", cell: "down", label: "Low" }] };
const SPOTS = { engine: "svg-regions", regions: [{ id: "top", label: "Top" }, { id: "base", label: "Base" }], senses: [{ id: "feel", label: "Feel", words: [{ id: "warm", label: "Warm" }] }], chips: ["top", "base"] };

/** A made-up note with a question asked for each pick of every kind of source, and every mistake the setting can be. */
const NOTE = `---
booklet: "0.16"
id: test/each
title: Each
lang: en
---

> [!activity|log repeat] A log

> [!multi|tools open] Which tools?
- [ ] Pencil
- [ ] Ruler
- [ ] Scissors

> [!multi|why each:tools open] Why that one?
> Say why, for each tool.
- [ ] It was near
- [ ] It works

> [!choice|one] One of them
- [ ] First
- [ ] Second

> [!multi|about each:one] About it
- [ ] Good
- [ ] Bad

> [!widget|grid] A grid
> ![[#^made-up-grid]]

> [!multi|seen each:grid] Seen where?
- [ ] Here
- [ ] There

> [!widget|spots] Some places
> ![[#^made-up-spots]]

> [!multi|how each:spots] How?
- [ ] Well
- [ ] Badly

> [!text|note each:tools] A note for each tool

> [!text|plain] A plain text

> [!multi|lost each:missing] Names no question
- [ ] A

> [!multi|self each:self] Names itself
- [ ] A

> [!multi|kind each:plain] Names a text
- [ ] A

> [!multi|chain each:why] Names a question asked for each pick
- [ ] A

> [!activity|other repeat] Another

> [!multi|far each:tools] Names a question of another activity
- [ ] A

> [!data] Data

\`\`\`booklet widget
${JSON.stringify(GRID)}
\`\`\`
^made-up-grid

\`\`\`booklet widget
${JSON.stringify(SPOTS)}
\`\`\`
^made-up-spots
`;

const qOf = (book, id) => book.activities.flatMap((a) => a.segments).find((s) => s.id === id);

/* ---- the setting ---- */

test("each: a multi follows a choice, a multi or a widget in its activity; another kind is not yet supported; every mistake is said and ignored", () => {
	const book = core.parseBooklet(NOTE);
	assert.ok(book.ok);
	for (const [id, source] of [["why", "tools"], ["about", "one"], ["seen", "grid"], ["how", "spots"]]) {
		const q = qOf(book, id);
		assert.equal(q.type, "question");
		assert.equal(q.each, source, `${id} is asked for each pick of ${source}`);
	}
	const note = qOf(book, "note");
	assert.deepEqual([note.type, note.kind, note.of], ["unsupported", "each", "text"], "a text asked for each pick is not drawn yet");
	for (const id of ["lost", "self", "kind", "chain", "far"]) {
		const q = qOf(book, id);
		assert.equal(q.type, "question", `${id} is drawn as its kind`);
		assert.equal(q.each, null, `${id}: its each: is ignored`);
	}
	const said = book.problems.join("\n");
	assert.match(said, /"lost" is to be asked for each pick of "missing", which is no question or widget in its activity/);
	assert.match(said, /"self" is to be asked for each pick of itself/);
	assert.match(said, /"kind" is to be asked for each pick of "plain", a text: only a choice, a multi or a widget can be a source/);
	assert.match(said, /"chain" is to be asked for each pick of "why", which is itself asked for each pick of another \(one level only\)/);
	assert.match(said, /"far" is to be asked for each pick of "tools", which is no question or widget in its activity/);
	assert.equal(qOf(book, "why").each, "tools", "the question a chain names keeps its own each:");
	assert.equal(book.problems.filter((p) => /each:/.test(p)).length, 5, "one problem for each mistake, and none for the questions that hold");
});

test("each: the picks of each kind of source, in the order its answer holds them, each once, and their words", () => {
	const book = core.parseBooklet(NOTE);
	const [tools, one, grid, spots] = ["tools", "one", "grid", "spots"].map((id) => qOf(book, id));
	assert.deepEqual(core.sourcePicks(tools, [3, "Glue", 1, 3, "Glue"]), [3, "Glue", 1]);
	assert.deepEqual(core.sourcePicks(one, 2), [2]);
	assert.deepEqual(core.sourcePicks(one, "My own"), ["My own"]);
	assert.deepEqual(core.sourcePicks(grid, ["low", "x|up|happy", "glad"]), ["low", "x|up|happy", "glad"]);
	assert.deepEqual(core.sourcePicks(spots, [{ id: "base", s: ["warm"] }, { id: "top", s: [] }]), ["base", "top"]);
	// a source's answer of the wrong shape holds no picks
	assert.deepEqual(core.sourcePicks(tools, [{ pick: 1, a: [1] }]), []);
	assert.deepEqual(core.sourcePicks(grid, "low"), []);
	assert.deepEqual(norm(core.pickWords(tools, 1)), { md: "Pencil" });
	assert.deepEqual(norm(core.pickWords(tools, "Glue")), { text: "Glue" });
	assert.deepEqual(norm(core.pickWords(tools, 9)), { text: "#9" }, "a removed option, as kept entries show it");
	assert.deepEqual(norm(core.pickWords(grid, "low")), { text: "Low" });
	assert.deepEqual(norm(core.pickWords(grid, "x|up|happy")), { text: "happy" }, "a grid's x|cell|word: the word");
	assert.deepEqual(norm(core.pickWords(spots, "top")), { text: "Top" });
	assert.equal(core.pickKey(3) === core.pickKey("3"), false, "a position and an own option stay apart");
});

test("each: a pick's answer is set in its pair, in place; a new pair goes at the end; an empty answer takes the pair out; nothing else changes", () => {
	assert.deepEqual(norm(core.setPair(undefined, 1, [2])), [{ pick: 1, a: [2] }]);
	const v = [{ pick: 1, a: [2], note: "kept" }, "odd", { pick: "x|up|happy", a: [1] }];
	const next = core.setPair(v, 1, [1, 2]);
	assert.deepEqual(norm(next), [{ pick: 1, a: [1, 2], note: "kept" }, "odd", { pick: "x|up|happy", a: [1] }]);
	assert.deepEqual(Object.keys(next[0]), ["pick", "a", "note"], "its other keys, in their order");
	assert.equal(next[2], v[2], "another pair is the same object");
	assert.deepEqual(norm(core.setPair(v, "1", [1])).length, 4, "the own option \"1\" is not the position 1");
	assert.deepEqual(norm(core.setPair(v, 1, [])), ["odd", { pick: "x|up|happy", a: [1] }]);
	assert.equal(core.setPair(v, 5, []), v, "no pair and no answer: nothing changes");
});

test("each: a draft whose only answers are pairs for picks taken back counts as empty", () => {
	const book = core.parseBooklet(NOTE);
	const act = book.activities.find((a) => a.id === "log");
	assert.equal(core.recordFilled(act, {}), false);
	assert.equal(core.recordFilled(act, { why: [{ pick: 1, a: [1] }] }), false, "a pair for a pick the draft does not hold");
	assert.equal(core.recordFilled(act, { why: [{ pick: 1, a: [1] }], tools: [] }), false);
	assert.equal(core.recordFilled(act, { tools: [2], why: [{ pick: 1, a: [1] }] }), true);
	assert.equal(core.recordFilled(act, { why: [1, 2] }), true, "an answer of the wrong shape counts as an answer");
	assert.equal(core.recordFilled(act, { plain: "words" }), true);
});

/* ---- the writer, on the check-in note ---- */

const RULE = { today: "2026-10-27", dayOf: (ts) => String(ts).slice(0, 10) };
const S = "day-check";
const A = "today";
const draftBody = (text) => {
	const m = /```booklet draft today\n([^\n]*)\n```/.exec(text);
	return m ? m[1] : null;
};
const entriesBody = (text) => {
	const m = /```booklet entries today\n([\s\S]*?)\n```/.exec(text);
	return m ? m[1] : null;
};
const felt = (text, value) => core.setDraftAnswer(text, S, A, "felt", value, RULE);
const feelings = (text, value) => core.setDraftAnswer(text, S, A, "feelings", value, RULE);
const draftOf = (text) => norm(core.parseBooklet(text).records.drafts[S]?.[A] ?? {});

test("each: pairs through a draft, a pick taken back and made again, and Finalize; the JSON as stored", () => {
	let t = feelings(CHECKIN, ["tense", "lively"]);
	t = felt(t, core.setPair(draftOf(t).felt, "tense", [5]));
	t = felt(t, core.setPair(draftOf(t).felt, "lively", [1, "Throat"]));
	assert.equal(draftBody(t), '{"feelings":["tense","lively"],"felt":[{"pick":"tense","a":[5]},{"pick":"lively","a":[1,"Throat"]}]}');
	// Tense taken back: its pair is kept, not shown
	const picked = t;
	t = feelings(t, ["lively"]);
	assert.equal(draftBody(t), '{"feelings":["lively"],"felt":[{"pick":"tense","a":[5]},{"pick":"lively","a":[1,"Throat"]}]}');
	assert.ok(draftBody(t).endsWith(draftBody(picked).slice(draftBody(picked).indexOf(',"felt"'))), "the pairs' bytes are as they were");
	const book = core.parseBooklet(t);
	const act = book.activities.find((a) => a.id === A);
	const q = act.segments.find((s) => s.id === "felt");
	assert.deepEqual(norm(core.shownPairs(qOf(book, "feelings"), draftOf(t), q).map((x) => x.pick)), ["lively"]);
	// Tense picked again: its pair comes back, after Lively, in the grid's order
	t = feelings(t, ["lively", "tense"]);
	assert.deepEqual(norm(core.shownPairs(qOf(book, "feelings"), draftOf(t), q)), [
		{ pick: "lively", pair: { pick: "lively", a: [1, "Throat"] } },
		{ pick: "tense", pair: { pick: "tense", a: [5] } },
	]);
	// a pick with no answer has no pair
	t = feelings(t, ["lively", "tense", "tired"]);
	assert.equal(draftOf(t).felt.length, 2);
	const f = core.finalizeDraft(t, S, A, { ts: "2026-10-27T09:00:00Z", rule: RULE });
	assert.equal(entriesBody(f.text), '{"items": [\n{"ts":"2026-10-27T09:00:00Z","feelings":["lively","tense","tired"],"felt":[{"pick":"tense","a":[5]},{"pick":"lively","a":[1,"Throat"]}]}\n]}');
	assert.equal(draftBody(f.text), null, "the draft is emptied");
	// Tense taken back from today's entry, and kept again: the entry keeps the pair
	let g = core.setDraftAnswer(f.text, S, A, "feelings", ["lively", "tired"], RULE);
	assert.equal(draftBody(g), '{"feelings":["lively","tired"],"felt":[{"pick":"tense","a":[5]},{"pick":"lively","a":[1,"Throat"]}]}', "the first change copies today's entry, pairs and all");
	g = core.finalizeDraft(g, S, A, { ts: "2026-10-27T10:00:00Z", rule: RULE }).text;
	assert.equal(entriesBody(g), '{"items": [\n{"ts":"2026-10-27T10:00:00Z","feelings":["lively","tired"],"felt":[{"pick":"tense","a":[5]},{"pick":"lively","a":[1,"Throat"]}]}\n]}', "today's entry replaced, its pairs kept");
	// outside the records, nothing changed: the note is the check-in note, then its records
	assert.ok(g.startsWith(CHECKIN), "the note's text is unchanged, with the records after it");
});

test("each: Finalize refuses a draft whose only answers are pairs for picks taken back, and the draft is kept as it is", () => {
	let t = feelings(CHECKIN, ["tense"]);
	t = felt(t, [{ pick: "tense", a: [5] }]);
	t = feelings(t, undefined);
	assert.equal(draftBody(t), '{"felt":[{"pick":"tense","a":[5]}]}');
	assert.throws(() => core.finalizeDraft(t, S, A, { ts: "2026-10-27T09:00:00Z", rule: RULE }), /Nothing to keep yet: the entry is empty/);
	// on a day already kept, such a draft shows today's entry, with the draft's pairs over the entry's, pick by pick
	let k = feelings(CHECKIN, ["lively", "tense"]);
	k = felt(k, [{ pick: "lively", a: [1] }, { pick: "tense", a: [2] }]);
	k = core.finalizeDraft(k, S, A, { ts: "2026-10-27T08:00:00Z", rule: RULE }).text;
	// a draft holding only a pair for Tense (taken back), written elsewhere
	const raw = k.replace("```booklet entries today", '```booklet draft today\n{"felt":[{"pick":"tense","a":[5]}]}\n```\n\n```booklet entries today');
	const book = core.parseBooklet(raw);
	const act = book.activities.find((a) => a.id === A);
	const shown = core.shownDraft(book, S, act, RULE);
	assert.equal(shown.seededFrom?.ts, "2026-10-27T08:00:00Z");
	assert.deepEqual(norm(shown.values.felt), [{ pick: "tense", a: [5] }, { pick: "lively", a: [1] }], "the draft's pair for Tense, and the entry's for Lively");
	assert.deepEqual(norm(shown.values.feelings), ["lively", "tense"]);
});

test("each: a kept entry, one line for each pick its source holds, in the source's order, \"<title> · <pick's words>\"", () => {
	const book = core.parseBooklet(CHECKIN);
	const act = book.activities.find((a) => a.id === A);
	const q = act.segments.find((s) => s.id === "felt");
	const entry = { ts: "2026-10-27T09:00:00Z", feelings: ["tense", "x|agitating|wired", "lively"], felt: [{ pick: "lively", a: [1, "Throat"] }, { pick: "tired", a: [2] }, { pick: "tense", a: [5] }, { pick: "x|agitating|wired", a: [] }] };
	assert.deepEqual(norm(core.eachWords(act, q, entry)), [
		{ pick: { text: "Tense" }, words: { parts: [{ md: "Chest" }] } },
		{ pick: { text: "Lively" }, words: { parts: [{ md: "Head" }, { text: ", " }, { text: "Throat" }] } },
	]);
	assert.equal(core.answerWords(q, entry.felt), null, "not put in words as a plain multi");
	assert.deepEqual(norm(core.eachWords(act, q, { ts: "x", felt: [1, 2] })), { kept: "[1,2]", issue: "a question asked for each pick keeps a list of pairs, each a pick and its answer" });
});

/* ---- the view ---- */

function open(text = CHECKIN) {
	const disk = { text };
	const app = {
		vault: {
			process: async (_file, fn) => {
				disk.text = fn(disk.text);
				return disk.text;
			},
		},
		workspace: { iterateAllLeaves() {}, on() {} },
	};
	const view = new BookletView({ app }, { setMode: async () => {} });
	view.file = { path: "Check-in.booklet.md", basename: "Check-in.booklet" };
	view.load();
	view.setViewData(text, true);
	const card = () => view.contentEl.querySelector('[data-booklet-activity="day-check/today"]');
	const q = (id) => view.contentEl.querySelector(`[data-booklet-q="${id}"]`);
	return {
		view,
		disk,
		q,
		card,
		felt: () => q("felt"),
		copies: () => [...q("felt").querySelectorAll(".booklet-copy")],
		copy: (pick) => q("felt").querySelector(`.booklet-copy[data-booklet-pick="${pick}"]`),
		heads: () => [...q("felt").querySelectorAll(".booklet-pick-head")].map((x) => x.textContent),
		item: (cell, words) => button(q("feelings").querySelector(`[data-booklet-cell="${cell}"]`), words),
		changed(edit) {
			disk.text = edit(disk.text);
			view.setViewData(disk.text, false);
		},
		draft: () => draftOf(disk.text),
		settled: async (ms = 0) => {
			await sleep(ms + 30);
			await view.writes;
			await sleep(5);
		},
		close() {
			view.unload();
			view.containerEl.remove();
		},
	};
}
const typeInto = (el, value) => {
	el.value = value;
	el.dispatchEvent(new w.Event("input", { bubbles: true }));
};
const enter = (el) => el.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
const button = (root, words) => {
	const b = [...root.querySelectorAll("button")].find((x) => x.textContent.trim() === words);
	assert.ok(b, `a button "${words}"`);
	return b;
};
const pressed = (root) => [...root.querySelectorAll("button[aria-pressed=true]")].map((b) => b.textContent.trim());
const offered = (root) => [...root.querySelectorAll("button.booklet-own[aria-pressed=false]")].map((b) => b.textContent.trim());
const ownField = (copy) => copy.querySelector(".booklet-own-row input");
const today = () => ({ today: core.localDay(new Date()) });
const stored = (id, value) => (t) => core.setDraftAnswer(t, S, A, id, value, today());

test("each in the view: nothing is drawn while nothing is picked; then one copy for each pick, in the grid's order, under its words; the title and help once", async () => {
	const v = open();
	assert.ok(v.felt().classList.contains("booklet-each-none"), "nothing is drawn while nothing is picked");
	assert.equal(v.copies().length, 0);
	v.item("agitating", "Tense").click();
	v.item("invigorating", "Lively").click();
	await v.settled();
	assert.ok(!v.felt().classList.contains("booklet-each-none"));
	assert.deepEqual(v.heads(), ["Tense", "Lively"]);
	assert.equal(v.felt().querySelectorAll(".booklet-prompt").length, 1, "the title once");
	assert.equal(v.felt().querySelector(".booklet-prompt").textContent, "Where do you feel it?");
	assert.equal(v.felt().querySelectorAll(".booklet-help").length, 1, "the help once");
	for (const c of v.copies()) {
		assert.deepEqual([...c.querySelectorAll(".booklet-choices > button")].map((b) => b.textContent), ["Head", "Jaw", "Neck", "Shoulders", "Chest", "Arms", "Hands", "Stomach", "Back", "Legs", "Feet"], "the shared list's places");
		assert.ok(ownField(c), "open: a field to add one's own");
		assert.ok(ownField(c).getAttribute("aria-labelledby").split(" ").length === 2, "named by the question and the pick");
	}
	assert.equal(v.draft().felt, undefined, "a pick with no answer has no pair");
	v.close();
});

test("each in the view: a word written in the first feeling's cell goes at the end of the grid's answer, the order as picked (SPEC section 8), and no copy moves; the field keeps focus; an order changed elsewhere moves no copy until the next drawing", async () => {
	const v = open();
	v.item("agitating", "Tense").click();
	v.item("invigorating", "Lively").click();
	await v.settled();
	assert.deepEqual(v.heads(), ["Tense", "Lively"]);
	const tense = v.copy("s:tense");
	// a word of the reader's own in Tense's cell goes at the end; Tense and Lively keep their places (booklet.html gridSelect)
	const f = v.q("feelings").querySelector('[data-booklet-cell="agitating"] .booklet-own-row input');
	f.focus();
	typeInto(f, "wired");
	enter(f);
	await v.settled();
	assert.deepEqual(v.draft().feelings, ["tense", "lively", "x|agitating|wired"]);
	assert.deepEqual(v.heads(), ["Tense", "Lively", "wired"], "the copies keep their order; the new pick's copy is at the end");
	assert.equal(v.copy("s:tense"), tense, "the same copy");
	assert.equal(w.document.activeElement, f, "the cell's field keeps focus");
	assert.equal(draftBody(v.disk.text), '{"feelings":["tense","lively","x|agitating|wired"]}');
	// a fresh drawing (the note opened again) shows the same order
	const same = open(v.disk.text);
	assert.deepEqual(same.heads(), ["Tense", "Lively", "wired"]);
	same.close();
	// an order changed elsewhere (a hand edit): the copies on screen do not move; a fresh drawing takes the answer's order,
	// as nothing about the order on screen is stored
	f.blur();
	v.changed(stored("feelings", ["lively", "tense", "x|agitating|wired"]));
	await v.settled();
	assert.deepEqual(v.heads(), ["Tense", "Lively", "wired"]);
	assert.equal(v.copy("s:tense"), tense, "the same copy");
	const again = open(v.disk.text);
	assert.deepEqual(again.heads(), ["Lively", "Tense", "wired"]);
	again.close();
	v.close();
});

test("each in the view: answers are pairs; a pick taken back keeps its pair, picking it again brings it back; Finalize keeps them; the kept entry has one line per pick", async () => {
	const v = open();
	v.item("agitating", "Tense").click();
	v.item("invigorating", "Lively").click();
	await v.settled();
	button(v.copy("s:tense"), "Chest").click();
	button(v.copy("s:lively"), "Head").click();
	const f = ownField(v.copy("s:lively"));
	typeInto(f, "Throat");
	enter(f);
	await v.settled();
	assert.equal(draftBody(v.disk.text), '{"feelings":["tense","lively"],"felt":[{"pick":"tense","a":[5]},{"pick":"lively","a":[1,"Throat"]}]}');
	assert.deepEqual(offered(v.copy("s:tense")), ["Throat"], "an own option added under one pick is offered under every pick");
	assert.deepEqual(offered(v.copy("s:lively")), []);
	// Tense taken back
	v.item("agitating", "Tense").click();
	await v.settled();
	assert.deepEqual(v.heads(), ["Lively"]);
	assert.equal(draftBody(v.disk.text), '{"feelings":["lively"],"felt":[{"pick":"tense","a":[5]},{"pick":"lively","a":[1,"Throat"]}]}', "the pair for Tense is kept, not drawn");
	// and picked again: its pair comes back, after Lively
	v.item("agitating", "Tense").click();
	await v.settled();
	assert.deepEqual(v.heads(), ["Lively", "Tense"]);
	assert.deepEqual(pressed(v.copy("s:tense")), ["Chest"]);
	assert.deepEqual(pressed(v.copy("s:lively")), ["Head", "Throat"]);
	assert.equal(draftBody(v.disk.text), '{"feelings":["lively","tense"],"felt":[{"pick":"tense","a":[5]},{"pick":"lively","a":[1,"Throat"]}]}');
	// Tense taken back again, then Finalize: the entry keeps the pair, and shows only Lively's line
	v.item("agitating", "Tense").click();
	await v.settled();
	v.card().querySelector(".booklet-finalize").click();
	await v.settled();
	const e = norm(core.parseBooklet(v.disk.text).records.entries[S][A][0]);
	assert.deepEqual(e.felt, [{ pick: "tense", a: [5] }, { pick: "lively", a: [1, "Throat"] }]);
	assert.deepEqual(e.feelings, ["lively"]);
	const dts = [...v.card().querySelectorAll(".booklet-entry dt")].map((x) => x.textContent);
	const dds = [...v.card().querySelectorAll(".booklet-entry dd")].map((x) => x.textContent);
	const at = dts.indexOf("Where do you feel it? · Lively");
	assert.ok(at >= 0, `the line for Lively: ${dts.join(" | ")}`);
	assert.equal(dds[at], "Head, Throat");
	assert.ok(!dts.some((x) => x.includes("· Tense")), "no line for Tense, which this entry's grid does not hold");
	v.close();
});

test("each in the view: Finalize with a draft whose only answers are pairs for picks taken back keeps nothing and changes nothing", async () => {
	const v = open();
	v.item("agitating", "Tense").click();
	await v.settled();
	button(v.copy("s:tense"), "Chest").click();
	v.item("agitating", "Tense").click();
	await v.settled();
	assert.equal(draftBody(v.disk.text), '{"felt":[{"pick":"tense","a":[5]}]}');
	const before = v.disk.text;
	Notice.said.length = 0;
	v.card().querySelector(".booklet-finalize").click();
	await v.settled();
	assert.equal(v.disk.text, before);
	assert.ok(Notice.said.some((s) => /Nothing to keep yet/.test(s)), Notice.said.join(" | "));
	assert.ok(v.felt().classList.contains("booklet-each-none"));
	v.close();
});

/** The check-in note with entries kept on earlier days, made by the core as the view makes them. */
function withEntries(list) {
	let t = CHECKIN;
	list.forEach((answers, i) => {
		const day = `2026-10-${String(10 + i).padStart(2, "0")}`;
		const rule = { today: day, dayOf: (ts) => String(ts).slice(0, 10) };
		for (const [k, value] of Object.entries(answers)) t = core.setDraftAnswer(t, S, A, k, value, rule);
		t = core.finalizeDraft(t, S, A, { ts: `${day}T09:00:00Z`, rule }).text;
	});
	return t;
}

test("own options offered again: listed words and words in the answer are left out before the newest 12 are taken (booklet.html ownEarlier), for a plain multi and under every pick", async () => {
	const own = Array.from({ length: 14 }, (_, i) => `Made-up ${i + 1}`);
	const t = withEntries([
		{ where: ["at home", ...own.slice(0, 7), "OUTDOORS"], feelings: ["tired"], felt: [{ pick: "tired", a: ["head", ...own.slice(0, 7)] }] },
		{ where: own.slice(7), feelings: ["tense", "lively"], felt: [{ pick: "tense", a: own.slice(7, 10) }, { pick: "lively", a: ["Chest", ...own.slice(10)] }] },
	]);
	const v = open(t);
	// the newer entry first: Made-up 8 to 14, then the older: Made-up 1 to 7; "at home" and "OUTDOORS" are listed
	button(v.q("where"), "Made-up 9").click();
	await v.settled();
	const where = offered(v.q("where"));
	assert.equal(where.length, 12, `12 offered: ${where.join(", ")}`);
	assert.deepEqual(where, ["Made-up 8", "Made-up 10", "Made-up 11", "Made-up 12", "Made-up 13", "Made-up 14", "Made-up 1", "Made-up 2", "Made-up 3", "Made-up 4", "Made-up 5", "Made-up 6"]);
	// under a pick: the own options under the other picks now, then the entries', every pick's, newest first
	v.item("agitating", "Tense").click();
	v.item("invigorating", "Lively").click();
	await v.settled();
	const f = ownField(v.copy("s:lively"));
	typeInto(f, "Made-up new");
	enter(f);
	await v.settled();
	button(v.copy("s:tense"), "Made-up 9").click();
	await v.settled();
	const under = offered(v.copy("s:tense"));
	assert.equal(under.length, 12, `12 offered under Tense: ${under.join(", ")}`);
	assert.deepEqual(under, ["Made-up new", "Made-up 8", "Made-up 10", "Made-up 11", "Made-up 12", "Made-up 13", "Made-up 14", "Made-up 1", "Made-up 2", "Made-up 3", "Made-up 4", "Made-up 5"]);
	assert.ok(!under.includes("head") && !under.includes("Chest"), "words listed as an option are not offered");
	assert.deepEqual(offered(v.copy("s:lively")).slice(0, 2), ["Made-up 9", "Made-up 8"], "under Lively, Tense's own option first");
	v.close();
});

test("each in the view: the field the reader is in is kept while copies are added below it and taken away above and below it, or its own pick is taken back", async () => {
	const v = open();
	v.item("agitating", "Tense").click();
	v.item("invigorating", "Lively").click();
	await v.settled();
	const f = ownField(v.copy("s:lively"));
	f.focus();
	typeInto(f, "Sh");
	// a copy added, from a change made elsewhere that also puts the new pick first in the grid's answer: at the end
	v.changed(stored("feelings", ["tired", "tense", "lively"]));
	await v.settled();
	assert.deepEqual(v.heads(), ["Tense", "Lively", "Tired"]);
	assert.equal(ownField(v.copy("s:lively")), f, "the same field");
	assert.equal(w.document.activeElement, f, "still in it");
	assert.equal(f.value, "Sh");
	// the copies above and below taken away
	v.changed(stored("feelings", ["lively"]));
	await v.settled();
	assert.deepEqual(v.heads(), ["Lively"]);
	assert.equal(ownField(v.copy("s:lively")), f);
	assert.equal(w.document.activeElement, f);
	assert.equal(f.value, "Sh");
	// two copies added below, the answer's order changed around them: nothing on screen moves
	v.changed(stored("feelings", ["tired", "lively", "tense"]));
	await v.settled();
	assert.deepEqual(v.heads(), ["Lively", "Tired", "Tense"]);
	assert.equal(w.document.activeElement, f);
	// its own pick taken back: the copy stays where it is while the reader is in it, and goes when they leave it
	v.changed(stored("feelings", ["tired", "tense"]));
	await v.settled();
	assert.ok(v.copy("s:lively").classList.contains("booklet-copy-gone"));
	assert.deepEqual(v.heads(), ["Lively", "Tired", "Tense"]);
	assert.equal(w.document.activeElement, f);
	f.blur();
	await v.settled();
	assert.deepEqual(v.heads(), ["Tired", "Tense"]);
	// the words typed and not added come back with the pick, its copy at the end
	v.changed(stored("feelings", ["lively", "tired", "tense"]));
	await v.settled();
	assert.deepEqual(v.heads(), ["Tired", "Tense", "Lively"]);
	assert.equal(ownField(v.copy("s:lively")).value, "Sh");
	assert.equal(v.draft().felt, undefined, "words typed and not added are not an answer");
	v.close();
});

test("each in the view: a press lands while a copy above it is taken away by a change made meanwhile", async () => {
	const v = open();
	v.item("agitating", "Tense").click();
	v.item("invigorating", "Lively").click();
	await v.settled();
	const target = button(v.copy("s:lively"), "Head");
	target.dispatchEvent(new w.Event("pointerdown", { bubbles: true }));
	v.changed(stored("feelings", ["lively"]));
	assert.deepEqual(v.heads(), ["Tense", "Lively"], "nothing moves under a press");
	w.document.dispatchEvent(new w.Event("pointerup", { bubbles: true }));
	assert.ok(target.isConnected);
	target.click();
	await v.settled(350);
	assert.deepEqual(v.draft().felt, [{ pick: "lively", a: [1] }]);
	assert.deepEqual(v.draft().feelings, ["lively"]);
	assert.deepEqual(v.heads(), ["Lively"]);
	v.close();
});

test("each in the view: an answer of the wrong shape is kept as written, the question drawn read-only, and nothing rewrites it", async () => {
	const t = stored("felt", [5, 1])(stored("feelings", ["tense"])(CHECKIN));
	const v = open(t);
	const box = v.felt();
	assert.ok(!box.querySelector(".booklet-kept-note").classList.contains("booklet-none"), "the notice is shown");
	assert.match(box.querySelector(".booklet-kept-note").textContent, /Kept as written.*a question asked for each pick keeps a list of pairs.*\[5,1\]/);
	assert.ok([...box.querySelectorAll("button, input")].every((b) => b.disabled), "nothing to press or type");
	v.item("invigorating", "Lively").click();
	await v.settled();
	assert.deepEqual(v.draft().felt, [5, 1]);
	assert.ok([...box.querySelectorAll("button, input")].every((b) => b.disabled), "a copy drawn later is read-only too");
	v.card().querySelector(".booklet-finalize").click();
	await v.settled();
	const e = norm(core.parseBooklet(v.disk.text).records.entries[S][A][0]);
	assert.deepEqual(e.felt, [5, 1], "Finalize keeps it as written");
	assert.ok([...v.card().querySelectorAll(".booklet-entry dd")].some((x) => /Kept as written/.test(x.textContent)));
	v.close();
});

test("each in the view: a question of another kind asked for each pick is not yet supported, and the setting's mistakes are listed on screen", () => {
	const disk = { text: NOTE };
	const app = { vault: { process: async (_f, fn) => (disk.text = fn(disk.text)) }, workspace: { iterateAllLeaves() {}, on() {} } };
	const view = new BookletView({ app }, { setMode: async () => {} });
	view.file = { path: "Each.booklet.md", basename: "Each.booklet" };
	view.load();
	view.setViewData(NOTE, true);
	const un = view.contentEl.querySelector('[data-booklet-unsupported="each"]');
	assert.ok(un, "drawn as not yet supported");
	assert.match(un.textContent, /Not yet supported: a text question asked for each pick \(each:\)\. Its answers are kept\./);
	const problems = [...view.contentEl.querySelectorAll(".booklet-problems li")].map((x) => x.textContent).join("\n");
	for (const id of ["lost", "self", "kind", "chain", "far"]) assert.match(problems, new RegExp(`"${id}" is to be asked for each pick`));
	for (const id of ["lost", "self", "kind", "chain", "far"]) assert.ok(view.contentEl.querySelector(`[data-booklet-q="${id}"].booklet-kind-multi:not(.booklet-each)`), `${id} is drawn as a plain multi`);
	view.unload();
	view.containerEl.remove();
});
