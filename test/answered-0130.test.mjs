/*
 * An answered question says so (0.13.0): the code puts `booklet-answered-right` or `booklet-answered-wrong` on the question's own element when
 * its options are marked, and takes it off when the marks go, so the stylesheet draws the sheet's edge from a class and not from `:has()`.
 * A question that marks no correct option never carries either. Every note is made up.
 */
import { click, words } from "./dom.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { pane } from "./pane.mjs";

const note = (body) => `---\nbooklet: "0.20"\n---\n\n> [!activity|a] A\n\n${body}\n`;
const open = (text) => {
	const p = pane(text, { screen: "activity:/a" });
	return Object.assign(p, { q: (id) => p.el.querySelector(`[data-booklet-q="${id}"]`) });
};
const choice = (q, text) => [...q.querySelectorAll(".booklet-choice")].find((b) => words(b).startsWith(text));
const press = async (p, el) => {
	click(el);
	await p.settled();
};
const check = (q) => [...q.querySelectorAll(".booklet-acts button")].find((b) => words(b) === "Check");
/** Which of the two classes the question carries: "right", "wrong", "both" or "none". */
const state = (q) => {
	const r = q.classList.contains("booklet-answered-right");
	const w = q.classList.contains("booklet-answered-wrong");
	return r && w ? "both" : r ? "right" : w ? "wrong" : "none";
};

const FLYER = `> [!choice|flyer] Which one flies?\n- [ ] A penguin\n- [ ] An ostrich\n- [x] A sparrow\n`;

test("answered: a choice carries the class for its pick, and loses it when the pick is taken back", async () => {
	const p = open(note(FLYER));
	await p.settled();
	const q = p.q("flyer");
	assert.equal(state(q), "none", "nothing before an answer");
	await press(p, choice(q, "A penguin"));
	assert.equal(state(q), "wrong");
	await press(p, choice(q, "A sparrow"));
	assert.equal(state(q), "right", "the wrong class is taken off as the right one is put on");
	await press(p, choice(q, "A sparrow"));
	assert.equal(state(q), "none", "a pick taken back takes the class with it");
	p.close();
});

test("answered: the class is on the question's own element, the one the sheet is drawn on", async () => {
	const p = open(note(FLYER));
	await p.settled();
	await press(p, choice(p.q("flyer"), "A penguin"));
	assert.ok(p.q("flyer").classList.contains("booklet-question"), "the element that carries it is the question's sheet");
	assert.equal(p.el.querySelectorAll(".booklet-answered-wrong").length, 1);
	assert.equal(p.el.querySelectorAll(".booklet-answered-right").length, 0);
	p.close();
});

test("answered: a question that marks no correct option never carries either class", async () => {
	const p = open(note(`> [!choice|any] Which?\n- [ ] One\n- [ ] Two\n\n> [!multi|many] Which?\n- [ ] A\n- [ ] B\n`));
	await p.settled();
	await press(p, choice(p.q("any"), "One"));
	assert.equal(state(p.q("any")), "none");
	await press(p, choice(p.q("many"), "A"));
	assert.equal(state(p.q("many")), "none");
	p.close();
});

test("answered: a multi has the class only after Check, not quite when any pick is wrong or a right one is left out, and a change of picks takes it away", async () => {
	const p = open(note(`> [!multi|m] Which are fruit?\n- [x] Apple\n- [ ] Rock\n- [x] Pear\n`));
	await p.settled();
	const q = p.q("m");
	await press(p, choice(q, "Apple"));
	await press(p, choice(q, "Pear"));
	assert.equal(state(q), "none", "picks alone are not marked");
	await press(p, check(q));
	assert.equal(state(q), "right");
	await press(p, choice(q, "Pear"));
	assert.equal(state(q), "none", "a change of the picks takes the marks, and the class");
	await press(p, check(q));
	assert.equal(state(q), "wrong", "Apple alone is not all of it");
	await press(p, choice(q, "Pear"));
	await press(p, choice(q, "Rock"));
	await press(p, check(q));
	assert.equal(state(q), "wrong", "an extra pick among the right ones: wrong wins over right");
	p.close();
});

test("answered: a question in a group carries it on its own element; a note opened with the answer recorded draws it at once", async () => {
	const text = note(`> [!group] G\n> > [!choice|flyer] Which one flies?\n> - [ ] A penguin\n> - [x] A sparrow\n`);
	const p = open(text);
	await p.settled();
	await press(p, choice(p.q("flyer"), "A sparrow"));
	assert.equal(state(p.q("flyer")), "right");
	const saved = p.disk.text;
	p.close();
	const again = open(saved);
	await again.settled();
	assert.equal(state(again.q("flyer")), "right", "drawn from the record, with no press");
	again.close();
});
