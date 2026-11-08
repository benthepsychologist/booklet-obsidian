/*
 * No :has() in the stylesheets (1.1.1): Obsidian's directory review warns that :has() invalidates broadly. The count pill's colour and a
 * done step's check were drawn from it; the code now puts `data-booklet-at` (the step on show, counted from 1) on the steps' holder and
 * `is-done` on each step's own box, and the stylesheet reads those. Every note is made up.
 */
import { click, words } from "./dom.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./helpers.mjs";
import { pane } from "./pane.mjs";

const read = (f) => readFileSync(join(ROOT, f), "utf8");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "");

test("no stylesheet, source part or built, has :has(", () => {
	for (const f of ["themes/structure.css", "styles.base.css", "styles.css"]) {
		const css = strip(read(f));
		assert.ok(css.length > 1000, `${f} was read`);
		assert.ok(!/:has\(/i.test(css), `${f} has a :has( selector`);
	}
});

test("the stylesheet reads the marks the code sets: data-booklet-at for the count, is-done on the step for the check", () => {
	const css = strip(read("themes/structure.css"));
	const pill = [...css.matchAll(/\.booklet-steps\[data-booklet-at="(\d+)"\] \.booklet-steps-progress/g)].map((m) => Number(m[1]));
	assert.deepEqual([...new Set(pill)].sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], "a colour for each of the ten steps");
	assert.match(css, /\.booklet-step\.is-done \.booklet-group-title::after \{/);
});

const note = (n) =>
	`---\nbooklet: "0.20"\n---\n\n> [!activity|a] A\n\n` +
	Array.from({ length: n }, (_, i) => `> [!group] Step ${i + 1}\n> > [!choice|q${i + 1}] Pick ${i + 1}\n> - [ ] Yes\n> - [ ] No\n`).join("\n") +
	"\n";
const open = (n) => {
	const m = new Map([["booklet-steps:Note.booklet.md", JSON.stringify("one")]]);
	const s = { loadLocalStorage: (k) => (m.has(k) ? JSON.parse(m.get(k)) : null), saveLocalStorage: (k, d) => (d === null ? m.delete(k) : m.set(k, JSON.stringify(d))) };
	const p = pane(note(n), { screen: "activity:/a", appMore: s });
	return Object.assign(p, { q: (id) => p.el.querySelector(`[data-booklet-q="${id}"]`) });
};
const holder = (p) => p.el.querySelector(".booklet-steps");
const doneBoxes = (p) => [...p.el.querySelectorAll(".booklet-step")].map((b) => b.classList.contains("is-done"));
const doneDots = (p) => [...p.el.querySelectorAll(".booklet-steps-dot")].map((d) => d.classList.contains("is-done"));

test("steps: data-booklet-at names the step on show, from 1, and follows Next and Back", async () => {
	const p = open(3);
	await p.settled();
	const shown = () => [...p.el.querySelectorAll(".booklet-step")].findIndex((s) => !s.hidden) + 1;
	assert.equal(holder(p).getAttribute("data-booklet-at"), "1");
	await p.pageNext();
	assert.equal(shown(), 2);
	assert.equal(holder(p).getAttribute("data-booklet-at"), "2");
	await p.pageNext();
	assert.equal(holder(p).getAttribute("data-booklet-at"), "3");
	assert.equal(holder(p).getAttribute("data-booklet-at"), String(shown()), "the mark and the step not hidden agree");
	await p.pageBack();
	assert.equal(holder(p).getAttribute("data-booklet-at"), "2");
	assert.equal(words(p.el.querySelector(".booklet-steps-progress")), "Step 2 of 3");
	p.close();
});

test("steps: a step's box carries is-done exactly when its dot does, as answers are given and taken back", async () => {
	const p = open(3);
	await p.settled();
	assert.deepEqual(doneBoxes(p), [false, false, false]);
	await (async () => {
		click([...p.q("q1").querySelectorAll(".booklet-choice")][0]);
		await p.settled();
	})();
	assert.deepEqual(doneBoxes(p), [true, false, false], "step one holds its answer");
	assert.deepEqual(doneBoxes(p), doneDots(p), "the box follows the dot");
	// an answer in a step that is not on show still marks its box
	click([...p.q("q3").querySelectorAll(".booklet-choice")][0]);
	await p.settled();
	assert.deepEqual(doneBoxes(p), [true, false, true]);
	assert.deepEqual(doneBoxes(p), doneDots(p));
	// taking the pick back takes the mark
	click([...p.q("q1").querySelectorAll(".booklet-choice")][0]);
	await p.settled();
	assert.deepEqual(doneBoxes(p), [false, false, true], "a pick taken back takes the mark with it");
	assert.deepEqual(doneBoxes(p), doneDots(p));
	p.close();
});
