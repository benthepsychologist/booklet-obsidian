/*
 * An answer of the wrong shape (src/core/shape.ts): the rule format 0.16 adds to SPEC section 8. An answer whose shape
 * is not its kind's is kept as written, and its question is drawn read-only with a notice. A corpus of such answers,
 * one or more for every kind and widget the plugin draws, is put in a once-answered activity's answers, in a repeat
 * activity's draft and in its kept entries; opening the note, answering another question, Finalize and a change made
 * elsewhere must leave every one of them as written.
 */
import { openView, typeInto, window as w } from "./dom.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { core, norm } from "./helpers.mjs";

const { Notice } = await import("./obsidian-stub.mjs");

const GRID = { engine: "grid-select", cells: [{ id: "up", label: "Up", color: "green" }, { id: "down", label: "Down", color: "slate" }], items: [{ id: "glad", cell: "up", label: "Glad" }, { id: "low", cell: "down", label: "Low" }] };
const SPOTS = { engine: "svg-regions", regions: [{ id: "top", label: "Top" }, { id: "base", label: "Base" }], senses: [{ id: "feel", label: "Feel", words: [{ id: "warm", label: "Warm" }] }], chips: ["top", "base"] };

/** Every kind the plugin draws, twice: in an activity answered once, and in one that repeats. */
const questions = (p) => `> [!text|${p}text] A text

> [!lines|${p}lines] Some lines

> [!choice|${p}choice] One of them
- [ ] First
- [ ] Second

> [!multi|${p}multi open] Any of them
- [ ] First
- [ ] Second

> [!scale|${p}scale] How much

0. None
1. Some

> [!number|${p}number] How many

> [!date|${p}date] When

> [!widget|${p}grid] A grid
> ![[#^made-up-grid]]

> [!widget|${p}spots] Some places
> ![[#^made-up-spots]]

> [!text|${p}fine] One answered as it should be
`;
const DESIGN = `---
booklet: "0.16"
id: test/shapes
title: Shapes
lang: en
---

> [!activity|once] Answered once

${questions("o-")}
> [!activity|log repeat] Kept as entries

${questions("r-")}
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

/** Answers of the wrong shape, by kind, each with what the plugin itself would store for that kind (right). */
const WRONG = {
	text: [{ a: 1 }, 3, ["x"], true],
	lines: ["one line", [1, 2], [{ a: "x" }]],
	choice: [[1], 0, 1.5, { pick: 1 }, true],
	multi: [[{ pick: "glad", a: [1] }], 2, "Second", [0], [1.5], [[1]], { a: 1 }],
	scale: [[1, 0], "1", 0.5, -1, { n: 1 }],
	number: ["7", [7], { n: 7 }],
	date: [20261027, ["2026-10-27"], { d: "2026-10-27" }],
	grid: [[1], [{ id: "glad" }], "glad", { glad: true }],
	spots: [["top"], [{ id: "top" }], [{ id: "top", s: "warm" }], [{ id: 3, s: [] }], [{ id: "top", s: [1] }], "top"],
};
const RIGHT = {
	text: ["", "words", null],
	lines: [["a", ""], []],
	choice: [1, 7, "my own"],
	multi: [[2, 1, "my own"], []],
	scale: [0, 1, 4],
	number: [7, -2.5, 0],
	date: ["2026-10-27", "written another way"],
	grid: [["glad", "x|up|my own"], []],
	spots: [[{ id: "top", s: ["warm", "my own"] }], [{ id: "base", s: [], extra: 1 }]],
};

function questionOf(kind) {
	const book = core.parseBooklet(DESIGN);
	return book.activities[0].segments.find((s) => s.type === "question" && s.id === `o-${kind}`);
}

test("shapeIssue: each kind's own shape is no issue; another shape is, in words; an answer holding nothing is no answer", () => {
	for (const [kind, list] of Object.entries(RIGHT)) for (const v of list) assert.equal(core.shapeIssue(questionOf(kind), v), null, `${kind} ${JSON.stringify(v)}`);
	for (const [kind, list] of Object.entries(WRONG))
		for (const v of list) {
			const issue = core.shapeIssue(questionOf(kind), v);
			assert.ok(issue && /keeps/.test(issue), `${kind} ${JSON.stringify(v)} is of the wrong shape: ${issue}`);
		}
	for (const v of [undefined, null, "", "  ", [], {}, [""], { a: "" }]) assert.equal(core.shapeIssue(questionOf("scale"), v), null, `${JSON.stringify(v)} holds nothing`);
});

/** One wrong-shape answer for every question of a prefix: the kind's first wrong value. */
const wrongAnswers = (p, n = 0) => Object.fromEntries(Object.entries(WRONG).map(([k, list]) => [`${p}${k}`, list[n % list.length]]));

/** The design with wrong-shape answers in the answers, the draft and two kept entries, written as a hand edit would. */
function noteWithWrong(n = 0) {
	const answers = wrongAnswers("o-", n);
	const draft = wrongAnswers("r-", n);
	const e1 = { ts: "2026-10-20T09:00:00Z", ...wrongAnswers("r-", n + 1) };
	const e2 = { ts: "2026-10-21T09:00:00Z", ...wrongAnswers("r-", n + 2), "r-fine": "kept fine" };
	return `${DESIGN}
%%
${core.RECORDS_HEADER}

\`\`\`booklet answers
${JSON.stringify(answers, null, 1)}
\`\`\`

\`\`\`booklet entries log
{"items": [
${JSON.stringify(e1)},
${JSON.stringify(e2)}
]}
\`\`\`

\`\`\`booklet draft log
${JSON.stringify(draft)}
\`\`\`
%%
`;
}

test("the writer: an answer of the wrong shape the note holds is not replaced or cleared, in answers, in a draft, or in today's entry a daily draft shows", () => {
	for (let n = 0; n < 7; n++) {
		const text = noteWithWrong(n);
		for (const kind of Object.keys(WRONG)) {
			assert.throws(() => core.setAnswer(text, "", `o-${kind}`, RIGHT[kind][1] ?? RIGHT[kind][0]), core.RecordsWriteError, `answers ${kind}`);
			assert.throws(() => core.setAnswer(text, "", `o-${kind}`, undefined), core.RecordsWriteError, `answers ${kind}, cleared`);
			assert.throws(() => core.setDraftAnswer(text, "", "log", `r-${kind}`, RIGHT[kind][0] || RIGHT[kind][1]), core.RecordsWriteError, `draft ${kind}`);
		}
		// every other answer is still written, and the wrong ones keep their bytes
		const next = core.setDraftAnswer(core.setAnswer(text, "", "o-fine", "fine"), "", "log", "r-fine", "fine too");
		const b = core.parseBooklet(next).records;
		assert.deepEqual(norm(b.answers[""]), { ...norm(wrongAnswers("o-", n)), "o-fine": "fine" });
		assert.deepEqual(norm(b.drafts[""].log), { ...norm(wrongAnswers("r-", n)), "r-fine": "fine too" });
		for (const line of JSON.stringify(wrongAnswers("o-", n), null, 1).split("\n").slice(1, -1)) assert.ok(next.includes(line.replace(/,$/, "")), `the answers block keeps ${line}`);
	}
	// a repeat daily activity showing today's entry, which holds an answer of the wrong shape
	const daily = DESIGN.replace("[!activity|log repeat]", "[!activity|log repeat daily]");
	const rule = { today: "2026-10-27", dayOf: (ts) => String(ts).slice(0, 10) };
	const kept = `${daily}\n%%\n${core.RECORDS_HEADER}\n\n\`\`\`booklet entries log\n{"items": [\n${JSON.stringify({ ts: "2026-10-27T08:00:00Z", "r-scale": [1, 0], "r-fine": "x" })}\n]}\n\`\`\`\n%%\n`;
	assert.throws(() => core.setDraftAnswer(kept, "", "log", "r-scale", 1, rule), core.RecordsWriteError);
	const changed = core.setDraftAnswer(kept, "", "log", "r-fine", "y", rule);
	assert.deepEqual(norm(core.parseBooklet(changed).records.drafts[""].log), { "r-scale": [1, 0], "r-fine": "y" }, "the first change copies today's entry, the wrong answer as written");
});

test("Finalize keeps every answer of the wrong shape as written; only a lines question's blank lines are left out", () => {
	for (let n = 0; n < 7; n++) {
		const f = core.finalizeDraft(noteWithWrong(n), "", "log", { ts: "2026-10-27T10:00:00Z" });
		const e = norm(f.entry);
		for (const [k, v] of Object.entries(wrongAnswers("r-", n))) assert.deepEqual(e[k], norm(v), `${k} kept as written`);
	}
	// a list of strings with a blank one, under a scale: of the wrong shape, so not cut down
	const t = `${DESIGN}\n%%\n${core.RECORDS_HEADER}\n\n\`\`\`booklet draft log\n{"r-scale":["a",""],"r-lines":["a","","b",""]}\n\`\`\`\n%%\n`;
	const e = norm(core.finalizeDraft(t, "", "log", { ts: "2026-10-27T10:00:00Z" }).entry);
	assert.deepEqual(e["r-scale"], ["a", ""]);
	assert.deepEqual(e["r-lines"], ["a", "b"]);
});

test("a kept entry says an answer of the wrong shape is kept as written, and shows it as written", () => {
	const q = questionOf("text");
	assert.deepEqual(norm(core.answerWords(q, { a: 1 })), { kept: '{"a":1}', issue: "a text question keeps a string" });
	assert.deepEqual(norm(core.answerWords(q, "words")), { parts: [{ text: "words" }] });
});

/* ---- in the view ---- */

function open(text, screen = "/log") {
	const v = openView(text, { path: "Shapes.booklet.md", screen: `activity:${screen}` });
	return {
		...v,
		q: (id) => v.view.contentEl.querySelector(`[data-booklet-q="${id}"]`),
		/** Shows another activity's screen. */
		on: (key) => v.view.setState({ version: 1, screen: `activity:${key}` }, {}),
	};
}
const controls = (box) => [...box.querySelectorAll("button, input, textarea")];

test("the view: every question holding an answer of the wrong shape is drawn read-only with a notice; opening, answering another question and Finalize leave every one as written", async () => {
	for (let n = 0; n < 7; n++) {
		const text = noteWithWrong(n);
		const v = open(text, "/once");
		for (const p of ["o-", "r-"]) {
			await v.on(p === "o-" ? "/once" : "/log");
			for (const kind of Object.keys(WRONG)) {
				const box = v.q(`${p}${kind}`);
				assert.ok(box, `${p}${kind} is drawn`);
				const note = box.querySelector(".booklet-kept-note");
				assert.ok(note && !note.classList.contains("booklet-none"), `${p}${kind}: the notice is shown`);
				assert.match(note.textContent, /Kept as written/);
				assert.equal(note.querySelector("code").textContent, JSON.stringify((p === "o-" ? wrongAnswers("o-", n) : wrongAnswers("r-", n))[`${p}${kind}`]));
				const cs = controls(box);
				assert.ok(cs.length && cs.every((c) => c.disabled), `${p}${kind}: every control is switched off`);
				// a press on a switched-off control does nothing
				for (const c of cs) if (c.tagName === "BUTTON") c.click();
				assert.ok(!box.querySelector('[aria-pressed="true"]'), `${p}${kind}: nothing is shown pressed`);
			}
		}
		await v.on("/once");
		assert.ok(v.q("o-fine").querySelector(".booklet-kept-note").classList.contains("booklet-none"), "a question answered as it should be has no notice");
		await v.settled();
		assert.equal(v.disk.text, text, "opening and pressing wrote nothing");
		// another question answered, in both activities
		for (const id of ["o-fine", "r-fine"]) {
			await v.on(id === "o-fine" ? "/once" : "/log");
			const f = v.q(id).querySelector("input");
			f.focus();
			typeInto(f, "an answer");
			f.blur();
		}
		await v.settled();
		let r = core.parseBooklet(v.disk.text).records;
		assert.deepEqual(norm(r.answers[""]), { ...norm(wrongAnswers("o-", n)), "o-fine": "an answer" });
		assert.deepEqual(norm(r.drafts[""].log), { ...norm(wrongAnswers("r-", n)), "r-fine": "an answer" });
		// Finalize
		v.view.contentEl.querySelector('[data-booklet-activity="/log"] button.booklet-finalize').click();
		await v.settled();
		r = core.parseBooklet(v.disk.text).records;
		const e = norm(r.entries[""].log.find((x) => !["2026-10-20T09:00:00Z", "2026-10-21T09:00:00Z"].includes(x.ts)));
		assert.deepEqual({ ...e, ts: undefined }, { ...norm(wrongAnswers("r-", n)), "r-fine": "an answer", ts: undefined }, "the entry keeps every answer as written");
		assert.equal(r.drafts[""]?.log, undefined, "the draft is emptied");
		// the kept entries say so, and show each as written
		const listed = [...v.view.contentEl.querySelectorAll('[data-booklet-activity="/log"] .booklet-entry dd')].map((d) => d.textContent);
		assert.ok(listed.filter((x) => /^Kept as written/.test(x)).length >= Object.keys(WRONG).length * 3, `the entries say kept as written: ${listed.length}`);
		v.close();
	}
});

test("the view: an answer that comes to be of the wrong shape from elsewhere switches its question off at once; one that stops being so is drawn again, answerable", async () => {
	const v = open(DESIGN, "/once");
	const box0 = v.q("o-scale");
	const anchors = () => controls(v.q("o-scale")).filter((c) => c.tagName === "BUTTON");
	anchors()[1].click();
	await v.settled();
	assert.equal(core.parseBooklet(v.disk.text).records.answers[""]["o-scale"], 1);
	v.changed((t) => t.replace('"o-scale": 1', '"o-scale": [1, 0]'));
	assert.ok(anchors().every((b) => b.disabled), "switched off at once");
	assert.ok(!v.q("o-scale").querySelector(".booklet-kept-note").classList.contains("booklet-none"));
	await v.settled();
	const before = v.disk.text;
	for (const b of anchors()) b.click();
	await v.settled();
	assert.equal(v.disk.text, before, "a press writes nothing");
	v.changed((t) => t.replace('"o-scale": [1, 0]', '"o-scale": 0'));
	await v.settled();
	assert.notEqual(v.q("o-scale"), box0, "drawn again");
	assert.ok(anchors().every((b) => !b.disabled), "answerable again");
	assert.equal(v.q("o-scale").querySelector('[aria-pressed="true"]').textContent.trim().startsWith("0"), true);
	v.close();
});

test("the view: typing in a field whose answer becomes of the wrong shape meanwhile is not written over it; the reader is told", async () => {
	const v = open(DESIGN, "/once");
	const f = v.q("o-text").querySelector("input");
	f.focus();
	typeInto(f, "half typed");
	Notice.said.length = 0;
	v.changed((t) => core.setAnswer(t, "", "o-fine", "x").replace('"o-fine": "x"', '"o-fine": "x",\n "o-text": {"a": 1}'));
	assert.ok(f.isConnected && w.document.activeElement === f && f.value === "half typed", "the field the reader is in is kept");
	f.blur();
	await v.settled();
	assert.deepEqual(norm(core.parseBooklet(v.disk.text).records.answers[""]["o-text"]), { a: 1 }, "kept as written");
	assert.ok(Notice.said.some((s) => /not saved/.test(s)), JSON.stringify(Notice.said));
	v.close();
});
