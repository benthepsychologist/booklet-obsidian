/*
 * Plugin 0.7.0, stage A: right and wrong marked (SPEC section 5, "`[x]` marks a correct option"), a matrix question,
 * and a question of any kind asked for each pick. They run over the test vault's made-up study quiz, in the view
 * (test/dom.mjs), and over the core where the rule is one of reading or writing.
 *
 * Each rule has a test that fails without it; the last test of each group says which part of the code it pins.
 */
import { openView, typeInto, window as w } from "./dom.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, assertOutsideUnchanged, core, norm, sha, sleep } from "./helpers.mjs";
import { testApp } from "./dom.mjs";

const QUIZ = readFileSync(join(ROOT, "test-vault", "Study quiz.booklet.md"), "utf8");

/** The study quiz open on one activity's screen. */
function open(screen, text = QUIZ) {
	const v = openView(text, { path: "Study quiz.booklet.md", screen: `activity:/${screen}` });
	const q = (id) => v.view.contentEl.querySelector(`[data-booklet-q="${id}"]`);
	return {
		...v,
		q,
		/** The answers the vault holds now. */
		answers: () => norm(core.parseBooklet(v.disk.text).records.answers[""] ?? {}),
		/** The option button of a question with these words. */
		option: (id, words) => [...q(id).querySelectorAll(".booklet-choice")].find((b) => b.querySelector(".booklet-words")?.textContent.trim() === words),
	};
}

/** What an option shows as its mark: "Right", "Not quite", "The answer" or "". */
const markOf = (b) => b.querySelector(".booklet-mark")?.textContent.trim() ?? "";
const marks = (q) => [...q.querySelectorAll(".booklet-choices > .booklet-choice")].map((b) => markOf(b));
/** Typing in a field and leaving it, as the reader does. */
const type = (el, value) => {
	el.focus();
	typeInto(el, value);
	el.blur();
};
const live = (q) => q.querySelector(".booklet-live")?.textContent ?? "";
const replies = (q) => [...q.querySelectorAll(".booklet-reply")].map((r) => r.textContent.trim());

/* ---- right and wrong ---- */

test("marking: a choice marks the picked option right, or not quite with the answer beside it, and shows the picked option's reply; nothing is marked before a pick", async () => {
	const v = open("marked");
	const q = v.q("flyer");
	assert.deepEqual(marks(q), ["", "", ""], "before an answer nothing is marked");
	assert.equal(live(q), "");
	assert.equal(replies(q).length, 0);
	v.option("flyer", "A penguin").click();
	await v.settled();
	assert.deepEqual(marks(q), ["Not quite", "The answer", ""], "the picked option is not quite, and the right one is marked as the answer");
	assert.equal(live(q), "Not quite. The answer is A sparrow.");
	assert.deepEqual(replies(q), ["Penguins swim instead of flying."]);
	assert.ok(v.option("flyer", "A penguin").classList.contains("booklet-wrong"));
	assert.ok(v.option("flyer", "A sparrow").classList.contains("booklet-answer"));
	v.option("flyer", "A sparrow").click();
	await v.settled();
	assert.deepEqual(marks(q), ["", "Right", ""]);
	assert.equal(live(q), "Right.");
	assert.deepEqual(replies(q), ["A sparrow flies, like most small birds."]);
	assert.ok(v.option("flyer", "A sparrow").classList.contains("booklet-right"));
	// pressing the pick again clears it, and the marks go with it
	v.option("flyer", "A sparrow").click();
	await v.settled();
	assert.deepEqual(marks(q), ["", "", ""]);
	assert.equal(live(q), "");
	assert.equal(replies(q).length, 0);
	v.close();
});

test("marking is never written: the answer is the position, as for any choice, and nothing about right or wrong lands in the note", async () => {
	const v = open("marked");
	const before = sha(v.disk.text);
	v.option("flyer", "A penguin").click();
	await v.settled();
	assert.equal(v.answers().flyer, 1);
	assert.doesNotMatch(core.parseBooklet(v.disk.text).records.blocks.map((b) => b.raw).join("\n"), /right|wrong|correct|not quite|checked/i);
	v.option("flyer", "A penguin").click();
	await v.settled();
	assert.equal(v.answers().flyer, undefined);
	assertOutsideUnchanged(QUIZ, v.disk.text, "marking");
	assert.notEqual(sha(v.disk.text), before, "the answer itself was written");
	v.close();
});

test("marking: a question with no [x] shows nothing marked, and its replies show as they did", async () => {
	const v = open("marked");
	const q = v.q("drink");
	v.option("drink", "Tea").click();
	await v.settled();
	assert.equal(q.querySelector(".booklet-mark"), null, "no mark element at all on a question that marks nothing");
	assert.equal(q.querySelector(".booklet-live"), null);
	assert.equal(q.querySelector(".booklet-acts"), null, "and no Check");
	assert.deepEqual(replies(q), ["A fine choice."]);
	v.close();
});

test("marking: a multi marks only when Check is pressed (right, not quite, and right and missed), shows its replies then, and marks go when the picks change", async () => {
	const v = open("marked");
	const q = v.q("primaries");
	const check = () => q.querySelector(".booklet-acts button");
	assert.ok(check().classList.contains("booklet-none") || check().parentElement.classList.contains("booklet-none"), "no Check before a pick");
	v.option("primaries", "Red").click();
	v.option("primaries", "Green").click();
	await v.settled();
	assert.deepEqual(marks(q), ["", "", "", "", ""], "picks alone mark nothing");
	assert.equal(replies(q).length, 0, "and show no reply, which would give the answer away");
	assert.equal(live(q), "");
	check().click();
	assert.deepEqual(marks(q), ["Right", "Not quite", "", "", ""].map((m, i) => (i === 2 ? "The answer" : i === 3 ? "The answer" : m)), "red right, green not quite, blue and yellow right and missed");
	assert.equal(live(q), "Not quite. The answer is Red, Blue, Yellow.");
	assert.deepEqual(replies(q), ["Red is one of the three.", "Green is made by mixing yellow and blue."], "the replies of the picked options, in the options' order");
	// the picks change: the marks go until Check is pressed again
	v.option("primaries", "Green").click();
	await v.settled();
	assert.deepEqual(marks(q), ["", "", "", "", ""]);
	assert.equal(live(q), "");
	assert.equal(replies(q).length, 0);
	v.option("primaries", "Blue").click();
	v.option("primaries", "Yellow").click();
	await v.settled();
	check().click();
	assert.deepEqual(marks(q), ["Right", "", "Right", "Right", ""]);
	assert.equal(live(q), "Right.");
	assert.deepEqual(v.answers().primaries, [1, 3, 4], "the answer is the picks, in the order picked");
	v.close();
});

test("marking: an option of the reader's own is neither right nor wrong", async () => {
	const text = QUIZ.replace("> [!choice|flyer] Which of these can fly?", "> [!choice|flyer open] Which of these can fly?");
	const v = open("marked", text);
	typeInto(v.q("flyer").querySelector("input.booklet-text"), "A kite");
	v.q("flyer").querySelector(".booklet-add").click();
	await v.settled();
	assert.equal(v.answers().flyer, "A kite");
	assert.deepEqual(marks(v.q("flyer")).slice(0, 3), ["", "", ""], "the right option is not given away by an answer of the reader's own");
	assert.equal(live(v.q("flyer")), "");
	v.close();
});

test("marking: a choice with two [x] has the first as its answer (the reference renderer's rule)", async () => {
	const text = QUIZ.replace("- [ ] An ostrich", "- [x] An ostrich");
	const v = open("marked", text);
	v.option("flyer", "An ostrich").click();
	await v.settled();
	assert.deepEqual(marks(v.q("flyer")), ["", "The answer", "Not quite"], "the sparrow, the first [x], is the answer; the ostrich, picked, is not quite");
	assert.equal(live(v.q("flyer")), "Not quite. The answer is A sparrow.");
	v.close();
});

test("marking: an option from a shared menu has no [x] and nothing is marked", async () => {
	const text = QUIZ.replace("> [!choice|drink] Which would you rather have? Nothing here is marked.", "> [!menu|drinks]\n- Tea\n- Coffee\n\n> [!choice|drink menu:drinks] Which would you rather have?").replace(/- \[ \] Tea\n {2}- A fine choice\.\n- \[ \] Coffee\n/, "");
	const v = open("marked", text);
	v.option("drink", "Tea").click();
	await v.settled();
	assert.equal(v.q("drink").querySelector(".booklet-mark"), null);
	v.close();
});

test("marking: the reader (core) takes [x] as the correct options; a reply goes with its option", () => {
	const book = core.parseBooklet(QUIZ);
	const qs = Object.fromEntries(book.activities.flatMap((a) => a.segments).filter((s) => s.type === "question").map((s) => [s.id, s]));
	assert.deepEqual(qs.flyer.options.map((o) => o.correct), [false, true, false]);
	assert.deepEqual(qs.primaries.options.map((o) => o.correct), [true, false, true, true, false]);
	assert.deepEqual(qs.flyer.options.map((o) => o.reply), [["Penguins swim instead of flying."], ["A sparrow flies, like most small birds."], ["An ostrich runs."]]);
});

/* ---- a matrix ---- */

test("matrix: the reader takes the items, then the anchors; a matrix with no items or no anchors is said, and still a question", () => {
	const book = core.parseBooklet(QUIZ);
	const m = book.activities.flatMap((a) => a.segments).find((s) => s.id === "topics");
	assert.equal(m.type, "question");
	assert.equal(m.kind, "matrix");
	assert.deepEqual(m.items, ["Spring tides", "Neap tides", "Tidal range"]);
	assert.deepEqual(m.anchors.map((a) => [a.n, a.text]), [[0, "Not yet"], [1, "Getting there"], [2, "Sure"]], "an anchor's number is as written: it is the stored answer");
	assert.equal(book.problems.length, 0, book.problems.join("; "));
	const noItems = core.parseBooklet(QUIZ.replace("- Spring tides\n- Neap tides\n- Tidal range\n\n", ""));
	assert.ok(noItems.problems.some((p) => /the matrix "topics" has no items under it \(a bulleted list\)/.test(p)), noItems.problems.join("; "));
	const noAnchors = core.parseBooklet(QUIZ.replace("0. Not yet\n1. Getting there\n2. Sure\n", ""));
	assert.ok(noAnchors.problems.some((p) => /the matrix "topics" has no anchors under its items \(a numbered list\)/.test(p)), noAnchors.problems.join("; "));
});

test("matrix: one row of anchors for each item; a press stores one anchor number per item by position, null for an item not answered; pressing it again clears the item", async () => {
	const v = open("grid-quiz");
	const q = v.q("topics");
	const rows = [...q.querySelectorAll(".booklet-mxitem")];
	assert.equal(rows.length, 3);
	assert.deepEqual(rows.map((r) => r.querySelector(".booklet-mxwords").textContent), ["Spring tides", "Neap tides", "Tidal range"]);
	assert.deepEqual([...rows[0].querySelectorAll("button")].map((b) => b.textContent), ["Not yet", "Getting there", "Sure"]);
	const press = (item, anchor) => [...rows[item].querySelectorAll("button")][anchor].click();
	press(1, 2);
	await v.settled();
	assert.deepEqual(v.answers().topics, [null, 2, null]);
	press(0, 0);
	press(2, 1);
	await v.settled();
	assert.deepEqual(v.answers().topics, [0, 2, 1], "an anchor numbered 0 is an answer");
	assert.deepEqual([...rows[0].querySelectorAll("button")].map((b) => b.getAttribute("aria-pressed")), ["true", "false", "false"]);
	press(1, 2);
	await v.settled();
	assert.deepEqual(v.answers().topics, [0, null, 1], "the item is cleared and the others stay");
	press(0, 0);
	press(2, 1);
	await v.settled();
	assert.equal(v.answers().topics, undefined, "an answer with every item cleared is no answer");
	v.close();
});

test("matrix: the same list shows again in a new view, and a list kept shorter than the items is padded with null when one is pressed", async () => {
	const kept = core.setAnswer(QUIZ, "", "topics", [2]);
	const v = open("grid-quiz", kept);
	const rows = [...v.q("topics").querySelectorAll(".booklet-mxitem")];
	assert.deepEqual([...rows[0].querySelectorAll("button")].map((b) => b.getAttribute("aria-pressed")), ["false", "false", "true"]);
	[...rows[2].querySelectorAll("button")][0].click();
	await v.settled();
	assert.deepEqual(v.answers().topics, [2, null, 0]);
	v.close();
});

test("matrix: laid out as a grid or as separate questions by the room it has, the same buttons either way, so a press and the answer are not lost when the pane changes width", async () => {
	const seen = [];
	const widths = { wrap: 700, probe: 400 };
	const RO = w.ResizeObserver;
	w.ResizeObserver = globalThis.ResizeObserver = class {
		constructor(cb) {
			seen.push(cb);
		}
		observe() {}
	};
	const cw = Object.getOwnPropertyDescriptor(w.HTMLElement.prototype, "clientWidth");
	const ow = Object.getOwnPropertyDescriptor(w.HTMLElement.prototype, "offsetWidth");
	Object.defineProperty(w.HTMLElement.prototype, "clientWidth", { configurable: true, get() { return this.classList.contains("booklet-mxwrap") ? widths.wrap : 0; } });
	Object.defineProperty(w.HTMLElement.prototype, "offsetWidth", { configurable: true, get() { return this.classList.contains("booklet-mxprobe") ? widths.probe : 0; } });
	try {
		const v = open("grid-quiz");
		const q = v.q("topics");
		const fit = () => seen.forEach((cb) => cb());
		fit();
		assert.ok(!q.classList.contains("booklet-mx-stacked"), "700 px holds a 400 px grid");
		[...q.querySelectorAll(".booklet-mxitem")][1].querySelectorAll("button")[1].click();
		await v.settled();
		widths.wrap = 300;
		fit();
		assert.ok(q.classList.contains("booklet-mx-stacked"), "300 px does not: each item is a question of its own, the matrix's words its stem");
		assert.ok(q.querySelector(".booklet-mxwrap").classList.contains("booklet-mx-stacked"));
		const stacked = [...q.querySelectorAll(".booklet-mxitem")][1].querySelectorAll("button")[1];
		assert.equal(stacked.getAttribute("aria-pressed"), "true", "the answer is the same list under the same key");
		widths.wrap = 700;
		fit();
		assert.ok(!q.classList.contains("booklet-mx-stacked"));
		assert.deepEqual(v.answers().topics, [null, 1, null], "nothing lost by the pane changing width");
		v.close();
	} finally {
		w.ResizeObserver = globalThis.ResizeObserver = RO;
		if (cw) Object.defineProperty(w.HTMLElement.prototype, "clientWidth", cw);
		else delete w.HTMLElement.prototype.clientWidth;
		if (ow) Object.defineProperty(w.HTMLElement.prototype, "offsetWidth", ow);
		else delete w.HTMLElement.prototype.offsetWidth;
	}
});

test("matrix: an answer of the wrong shape is kept as written, the question is read-only with the notice, and a press changes nothing", async () => {
	for (const bad of ['"high"', "[1, \"x\"]", "[-1, 2]", "[1.5]", '{"a": 1}']) {
		// written by hand into the records, as an answer of another shape would be
		const text = bad.startsWith("{") ? `${QUIZ}\n%%\n> [!records]\n\n\`\`\`booklet answers\n{ "topics": ${bad} }\n\`\`\`\n%%\n` : core.setAnswer(QUIZ, "", "topics", JSON.parse(bad));
		const v = open("grid-quiz", text);
		const q = v.q("topics");
		assert.match(q.querySelector(".booklet-kept-note").textContent, /Kept as written.*a matrix question keeps a list with an anchor's number for each item, or null/, bad);
		assert.ok([...q.querySelectorAll("button")].every((b) => b.disabled), `${bad}: nothing to press`);
		[...q.querySelectorAll("button")][0].click();
		await v.settled();
		assert.equal(v.disk.text, text, `${bad}: the bytes are as written`);
		v.close();
	}
});

test("matrix: shape (core) is a list of whole anchor numbers from 0 and null; holding nothing is no answer", () => {
	const m = core.parseBooklet(QUIZ).activities.flatMap((a) => a.segments).find((s) => s.id === "topics");
	for (const ok of [[0, 2, null], [null, null], [], null, "", [2], {}]) assert.equal(core.shapeIssue(m, ok), null, JSON.stringify(ok));
	for (const bad of ["a", 3, [1, "2"], [1, -1], [1.5], { a: 1 }, [[1]]]) assert.ok(core.shapeIssue(m, bad), JSON.stringify(bad));
});

test("matrix: Finalize keeps the list, a kept entry shows each item with its anchor's words, and a query's cards list them", () => {
	const text = `---
booklet: "0.16"
id: test/matrix
title: Matrix
lang: en
---

> [!activity|log repeat] A log

> [!matrix|topics] How sure?

- Spring tides
- Neap tides

0. Not yet
1. Sure

\`\`\`booklet query
from: log
\`\`\`
`;
	let t = core.setDraftAnswer(text, "", "log", "topics", [1, null]);
	t = core.finalizeDraft(t, "", "log", { ts: "2026-10-27T12:00:00Z" }).text;
	const book = core.parseBooklet(t);
	assert.deepEqual(norm(book.records.entries[""].log[0].topics), [1, null]);
	const q = book.activities[0].segments.find((s) => s.id === "topics");
	assert.deepEqual(norm(core.answerWords(q, [1, null])), { list: ["Spring tides: Sure", "Neap tides: –"] });
	assert.equal(core.answerWords(q, [null, null]), null, "nothing answered, nothing to show");
	const plan = core.planQuery(book, book.activities[0].segments.find((s) => s.type === "query"), { drawn: new Date("2026-10-27T13:00:00Z") });
	assert.equal(plan.kind, "rows");
	assert.deepEqual(norm(plan.groups[0].rows[0].cells.topics.list), ["Spring tides: Sure", "Neap tides: –"]);
});

/* ---- a query's summary of a matrix ---- */

const SUMMARY_NOTE = `---
booklet: "0.16"
id: test/matrix-summary
title: Matrix summary
lang: en
---

> [!activity|log repeat] A log

> [!matrix|topics] How sure?

- Spring tides
- Neap tides

0. Not yet
1. Getting there
2. Sure

> [!activity|summary] Summary

\`\`\`booklet query
from: log
summary: on
\`\`\`

\`\`\`booklet query
from: topics
summary: on
\`\`\`
`;

test("matrix: a summary gives one row for each item, summarised like a scale, and a query of the matrix alone gives each item's anchors in list order with zeros", () => {
	let t = SUMMARY_NOTE;
	for (const [day, v] of [["10", [2, 0]], ["11", [1, null]], ["12", [2, 2]]]) {
		t = core.setDraftAnswer(t, "", "log", "topics", v);
		t = core.finalizeDraft(t, "", "log", { ts: `2026-10-${day}T09:00:00Z` }).text;
	}
	const book = core.parseBooklet(t);
	const [all, one] = book.activities[1].segments.filter((s) => s.type === "query");
	const plain = (parts) => parts.map((p) => p.md ?? p.text).join("");
	const rowsOf = (seg) => core.planQuery(book, seg, { drawn: new Date("2026-10-20T12:00:00Z") }).groups[0].rows;
	const a = rowsOf(all).map((r) => [plain(r.cells.label.parts), r.cells.count?.text, r.cells.average?.text, r.cells.lowest?.text, r.cells.highest?.text, r.cells.note?.text]);
	assert.deepEqual(a[0], ["Days logged", "3", undefined, undefined, undefined, "3 entries"]);
	assert.deepEqual(a[1], ["How sure? · Spring tides", "3", "1.7", "1", "2", "lowest 1 · highest 2"]);
	assert.deepEqual(a[2], ["How sure? · Neap tides", "2", "1", "0", "2", "lowest 0 · highest 2"], "an item left unanswered in an entry counts for nothing");
	const b = rowsOf(one).map((r) => [plain(r.cells.label.parts), r.cells.count.text]);
	assert.deepEqual(b, [
		["Spring tides · Not yet", "0"], ["Spring tides · Getting there", "1"], ["Spring tides · Sure", "2"],
		["Neap tides · Not yet", "1"], ["Neap tides · Getting there", "0"], ["Neap tides · Sure", "1"],
	]);
});

/* ---- each: on every kind ---- */

/** The copy under a pick of a question asked for each pick. */
const copy = (v, id, pick) => v.q(id).querySelector(`.booklet-copy[data-booklet-pick="${pick}"]`);
const heads = (v, id) => [...v.q(id).querySelectorAll(".booklet-pick-head")].map((h) => h.textContent);

async function pickCrops(v, ...names) {
	for (const n of names) v.option("crops", n).click();
	await v.settled();
}

test("each: every kind of question is asked once for each pick, in the order picked, with the title once; nothing is drawn while nothing is picked", async () => {
	const v = open("each-quiz");
	for (const id of ["crop-where", "crop-rate", "crop-note", "crop-pests"]) assert.ok(v.q(id).classList.contains("booklet-each-none"), `${id}: nothing drawn while nothing is picked`);
	await pickCrops(v, "Potato", "Carrot");
	for (const id of ["crop-where", "crop-rate", "crop-note", "crop-pests"]) {
		assert.deepEqual(heads(v, id), ["Potato", "Carrot"], `${id}: a copy for each pick, in the order picked`);
		assert.equal(v.q(id).querySelectorAll(".booklet-prompt").length, 1, `${id}: the title once`);
		assert.ok(!v.q(id).classList.contains("booklet-each-none"));
	}
	assert.equal(copy(v, "crop-rate", "n:3").querySelectorAll(".booklet-choice").length, 3, "a scale's anchors under each pick");
	assert.equal(copy(v, "crop-note", "n:1").querySelectorAll("input.booklet-text").length, 1);
	assert.equal(copy(v, "crop-pests", "n:3").querySelectorAll(".booklet-mxitem").length, 2, "a matrix's items under each pick");
	v.close();
});

test("each: a pick's answer is its kind's, a pair holds it, and a pick taken back keeps its pair until it is picked again", async () => {
	const v = open("each-quiz");
	await pickCrops(v, "Carrot", "Potato");
	[...copy(v, "crop-rate", "n:1").querySelectorAll(".booklet-choice")][2].click(); // Well
	[...copy(v, "crop-rate", "n:3").querySelectorAll(".booklet-choice")][0].click(); // Badly: 0 is an answer
	await v.settled();
	assert.deepEqual(v.answers()["crop-rate"], [{ pick: 1, a: 2 }, { pick: 3, a: 0 }]);
	type(copy(v, "crop-note", "n:1").querySelector("input.booklet-text"), "Sweet");
	await v.settled();
	assert.deepEqual(v.answers()["crop-note"], [{ pick: 1, a: "Sweet" }]);
	[...copy(v, "crop-pests", "n:3").querySelectorAll(".booklet-mxitem")][1].querySelectorAll("button")[2].click();
	await v.settled();
	assert.deepEqual(v.answers()["crop-pests"], [{ pick: 3, a: [null, 2] }]);
	[...copy(v, "crop-where", "n:1").querySelectorAll(".booklet-choice")][0].click(); // Under the ground
	await v.settled();
	assert.deepEqual(v.answers()["crop-where"], [{ pick: 1, a: 1 }], "a choice's pair holds its position, not a list");
	// Carrot taken back: its pairs stay, its copies go; picked again, they come back
	v.option("crops", "Carrot").click();
	await v.settled();
	assert.deepEqual(heads(v, "crop-rate"), ["Potato"]);
	assert.deepEqual(v.answers()["crop-rate"], [{ pick: 1, a: 2 }, { pick: 3, a: 0 }], "the pair for the pick taken back is kept as written");
	v.option("crops", "Carrot").click();
	await v.settled();
	assert.deepEqual(heads(v, "crop-rate"), ["Potato", "Carrot"]);
	assert.equal(copy(v, "crop-rate", "n:1").querySelectorAll('.booklet-choice[aria-pressed="true"]').length, 1, "its answer is back with it");
	v.close();
});

test("each: a copy of a choice with [x] is marked on its own, with its own reply", async () => {
	const v = open("each-quiz");
	await pickCrops(v, "Carrot", "Beans");
	const where = (pick, i) => [...copy(v, "crop-where", pick).querySelectorAll(".booklet-choices > .booklet-choice")][i];
	where("n:1", 0).click(); // carrot, under the ground: not quite
	where("n:2", 1).click(); // beans, above the ground: right
	await v.settled();
	assert.deepEqual([copy(v, "crop-where", "n:1"), copy(v, "crop-where", "n:2")].map((c) => marks(c)), [["Not quite", "The answer"], ["", "Right"]]);
	assert.deepEqual([copy(v, "crop-where", "n:1"), copy(v, "crop-where", "n:2")].map((c) => live(c)), ["Not quite. The answer is Above the ground.", "Right."]);
	assert.deepEqual(replies(copy(v, "crop-where", "n:1")), ["The part you eat is under the ground."]);
	assert.deepEqual(v.answers()["crop-where"], [{ pick: 1, a: 1 }, { pick: 2, a: 2 }], "marks are not written");
	v.close();
});

test("each: a wrong-shape answer for any kind is kept as written, read-only, with the notice", async () => {
	const cases = {
		"crop-rate": [{ pick: 1, a: "high" }],
		"crop-note": [{ pick: 1, a: 5 }],
		"crop-pests": [{ pick: 1, a: "x" }],
		"crop-where": [{ pick: 1, a: [1] }],
		"crop-rate-plain": [1, 2],
	};
	for (const [id, bad] of Object.entries(cases)) {
		if (id === "crop-rate-plain") continue;
		let text = core.setAnswer(QUIZ, "", "crops", [1]);
		text = core.setAnswer(text, "", id, bad);
		const v = open("each-quiz", text);
		const q = v.q(id);
		assert.match(q.querySelector(".booklet-kept-note").textContent, /Kept as written.*a question asked for each pick keeps a list of pairs/, id);
		assert.ok([...q.querySelectorAll("button, input")].every((b) => b.disabled), `${id}: nothing to press or type in`);
		[...q.querySelectorAll("button")][0]?.click();
		await v.settled();
		assert.equal(v.disk.text, text, `${id}: the bytes are as written`);
		v.close();
	}
	// a plain list under a question asked for each pick is of the wrong shape too
	const text = core.setAnswer(core.setAnswer(QUIZ, "", "crops", [1]), "", "crop-rate", [1, 2]);
	const v = open("each-quiz", text);
	assert.match(v.q("crop-rate").querySelector(".booklet-kept-note").textContent, /keeps a list of pairs/);
	v.close();
});

test("each: shape (core) is a list of pairs whose answer is the kind's shape, or holds nothing", () => {
	const book = core.parseBooklet(QUIZ);
	const qs = Object.fromEntries(book.activities.flatMap((a) => a.segments).filter((s) => s.type === "question").map((s) => [s.id, s]));
	for (const id of ["crop-where", "crop-rate", "crop-note", "crop-pests"]) assert.equal(qs[id].each, "crops", `${id} is asked for each pick`);
	assert.equal(core.shapeIssue(qs["crop-rate"], [{ pick: 1, a: 2 }, { pick: "own", a: 0 }]), null);
	assert.equal(core.shapeIssue(qs["crop-rate"], [{ pick: 1, a: null }, { pick: 2, a: "" }]), null, "an answer that holds nothing is not of the wrong shape");
	assert.ok(core.shapeIssue(qs["crop-rate"], [{ pick: 1, a: 1.5 }]));
	assert.ok(core.shapeIssue(qs["crop-rate"], [2]));
	assert.ok(core.shapeIssue(qs["crop-note"], [{ pick: 1, a: 7 }]));
	assert.ok(core.shapeIssue(qs["crop-pests"], [{ pick: 1, a: ["x"] }]));
	assert.equal(core.shapeIssue(qs["crop-pests"], [{ pick: 1, a: [0, null] }]), null);
});

test("each: a lines copy and a widget copy are drawn, answer and keep their blank lines out of the entry", async () => {
	const text = `---
booklet: "0.16"
id: test/each-lines
title: Each lines
lang: en
---

> [!activity|log repeat] A log

> [!multi|tools] Which tools?
- [ ] Pencil
- [ ] Ruler

> [!lines|why each:tools earlier:5] Why that one?

> [!number|count each:tools min:0 max:9] How many?

> [!date|when each:tools] When?
`;
	const v = openView(text, { path: "Each lines.booklet.md", screen: "activity:/log" });
	const root = v.view.contentEl;
	[...root.querySelectorAll('[data-booklet-q="tools"] .booklet-choice')][0].click();
	await v.settled();
	const copyOf = (id) => root.querySelector(`[data-booklet-q="${id}"] .booklet-copy`);
	type(copyOf("why").querySelector("input.booklet-line"), "It was near");
	type(copyOf("count").querySelector("input"), "3");
	type(copyOf("when").querySelector("input"), "2026-10-27");
	await v.settled();
	const draft = (id) => norm(core.parseBooklet(v.disk.text).records.drafts[""].log[id]);
	assert.deepEqual(draft("why"), [{ pick: 1, a: ["It was near", ""] }], "a lines answer lists every field, the empty one at the end included");
	assert.deepEqual(draft("count"), [{ pick: 1, a: 3 }]);
	assert.deepEqual(draft("when"), [{ pick: 1, a: "2026-10-27" }]);
	root.querySelector(".booklet-finalize").click();
	await v.settled();
	const entry = norm(core.parseBooklet(v.disk.text).records.entries[""].log[0]);
	assert.deepEqual(entry.why, [{ pick: 1, a: ["It was near"] }], "the entry keeps a pick's lines without the blank one");
	assert.deepEqual([entry.count, entry.when], [[{ pick: 1, a: 3 }], [{ pick: 1, a: "2026-10-27" }]]);
	const dts = [...root.querySelectorAll(".booklet-entry dt")].map((x) => x.textContent);
	assert.deepEqual(dts, ["Which tools?", "Why that one? · Pencil", "How many? · Pencil", "When? · Pencil"]);
	// the lines question offers the earlier line again, on the next pick
	[...root.querySelectorAll('[data-booklet-q="tools"] .booklet-choice')][1].click();
	await v.settled();
	const earlier = [...copyOf("why").querySelectorAll(".booklet-earlier-word")].map((b) => b.textContent);
	assert.deepEqual(earlier, ["It was near"], "an earlier line of a lines question asked for each pick");
	v.close();
});

/* ---- the new kinds in the writer: unchanged bytes stay unchanged ---- */

test("no normalizing on write: answering a matrix, a marked question and a copy changes only that answer; every other byte, record and answer stays as written", async () => {
	const kept = [
		'%%',
		'> [!records]',
		'',
		'```booklet answers',
		'{ "flyer":   2,  "keep-me" : [1,   2],',
		'  "primaries": [ 2 ],',
		'  "topics": [ 1,null, 2 ],',
		'  "crops": [1, 3],',
		'  "crop-rate": [{"pick":3,"a":1}],',
		'  "crop-note": [{"pick":3,"a":"Fried"}] }',
		'```',
		'%%',
	].join("\n");
	const text = `${QUIZ.replace(/\n*$/, "\n")}\n${kept}\n`;
	for (const screen of ["marked", "grid-quiz", "each-quiz"]) {
		const v = open(screen, text);
		const press = {
			marked: () => v.option("primaries", "Red").click(),
			"grid-quiz": () => [...v.q("topics").querySelectorAll(".booklet-mxitem")][0].querySelectorAll("button")[0].click(),
			"each-quiz": () => [...copy(v, "crop-rate", "n:1").querySelectorAll(".booklet-choice")][1].click(),
		}[screen];
		press();
		await v.settled();
		assertOutsideUnchanged(text, v.disk.text, screen);
		const changed = { marked: "primaries", "grid-quiz": "topics", "each-quiz": "crop-rate" }[screen];
		// every line of the records the press did not touch is as written, byte for byte
		for (const line of kept.split("\n")) {
			if (line.includes(`"${changed}"`)) continue;
			assert.ok(v.disk.text.includes(line), `${screen}: the line ${JSON.stringify(line)} is no longer as written`);
		}
		assert.ok(v.disk.text.includes('{ "flyer":   2,  "keep-me" : [1,   2],'), `${screen}: an answer written by hand keeps its spacing`);
		if (screen === "each-quiz") assert.deepEqual(v.answers()["crop-rate"], [{ pick: 3, a: 1 }, { pick: 1, a: 1 }], "the pair of another pick is kept, the pick pressed is added");
		v.close();
	}
});

test("a reader's work is never cleared by marking or by Check: the picks stay after Check and the view shows them again", async () => {
	const v = open("marked");
	v.option("primaries", "Red").click();
	await v.settled();
	v.q("primaries").querySelector(".booklet-acts button").click();
	await v.settled();
	assert.deepEqual(v.answers().primaries, [1]);
	const again = open("marked", v.disk.text);
	assert.equal(again.option("primaries", "Red").getAttribute("aria-pressed"), "true", "the pick is there in a new view; the marks are not, since nothing about marking is kept");
	assert.deepEqual(marks(again.q("primaries")), ["", "", "", "", ""]);
	again.close();
	v.close();
});

/* ---- words held on the device for a copy's Add your own field ---- */

const OPEN_NOTE = `---
booklet: "0.16"
id: test/held
title: Held
lang: en
---

> [!activity|log] A log

> [!multi|tools open] Which tools?
- [ ] Pencil
- [ ] Ruler

> [!multi|why each:tools open] Why that one?
- [ ] It was near
`;

test("each: words held on the device for a copy's Add your own field are held under the key earlier versions used (<key>#own:<pick>), so a reload from an older version still finds them", async () => {
	const disk = { text: OPEN_NOTE, writes: 0 };
	const store = new Map();
	const app = testApp(disk, {
		vault: { getName: () => "Made-up vault" },
		loadLocalStorage: (k) => (store.has(k) ? JSON.parse(store.get(k)) : null),
		saveLocalStorage: (k, d) => (d === null ? store.delete(k) : store.set(k, JSON.stringify(d))),
	});
	const draw = () => openView(disk.text, { path: "Held.booklet.md", disk, app, screen: "activity:/log" });
	let v = draw();
	const field = (id, within = "") => v.view.contentEl.querySelector(`[data-booklet-q="${id}"] ${within} .booklet-own-row input`);
	const plain = field("tools").getAttribute("data-booklet-key");
	assert.match(plain, /tools#own$/);
	[...v.view.contentEl.querySelectorAll('[data-booklet-q="tools"] .booklet-choice')].find((b) => b.textContent.trim() === "Pencil").click();
	await v.settled();
	const copy = field("why", ".booklet-copy");
	assert.equal(copy.getAttribute("data-booklet-key"), plain.replace(/tools#own$/, "why#own:n:1"), "a copy's field is held under <question's key>#own:<pick's key>, as 0.5.0 held it");
	typeInto(copy, "Pencils are small");
	const [held] = [...store.entries()].filter(([k]) => k.startsWith("booklet-held:"));
	assert.ok(held[1].includes(plain.replace(/tools#own$/, "why#own:n:1")), "kept on the device under that key as it is typed");
	// the reload: the view goes away with no blur and no write; the next drawing adds the words to that pick's pair
	v.view.containerEl.remove();
	await sleep(20);
	v = draw();
	await v.settled();
	assert.deepEqual(norm(core.parseBooklet(disk.text).records.answers[""].why), [{ pick: 1, a: ["Pencils are small"] }], "added to Pencil's pair");
	assert.equal(store.size, 0, "and taken off the device once added");
	v.close();
});
