/*
 * Continue (SPEC section 12, format 0.18): from home or a module's screen, the first `listen` not done or question not answered that comes
 * after the reader's place. Her place is the furthest page she has reached on the device (the part number `pageIndexOf` gives), else the
 * last `listen` done or question answered in the booklet's order. Nothing before her place is offered, so a question she passed over
 * is never offered again and Continue never holds her back. Made-up text only.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { build, core } from "./helpers.mjs";

const HEAD = '---\nbooklet: "0.19"\nid: made/up\ntitle: Made up\nlang: en\n---\n';
const BREAK = "\n***\n";

/** A booklet of three bare activities. The course: two pages, each with a listen and a question. */
const COURSE = `${HEAD}
> [!activity|course] The course

> [!listen|l1] Episode 1
> ![Episode 1](media/ep1.mp3)

> [!text|q1] Question one
${BREAK}
> [!listen|l2] Episode 2
> ![Episode 2](media/ep2.mp3)

> [!choice|c2] Question two
- [ ] Yes
- [ ] No
${BREAK}
> [!text|q3] Question three

> [!activity|more] More

> [!text|m1] More one

> [!text|m2] More two
`;

const at = (text, furthest = null) => {
	const { book, nav } = build(text);
	return core.continueTarget(nav, book, { furthest });
};
const withAnswers = (text, answers) => Object.entries(answers).reduce((t, [k, v]) => core.setAnswer(t, "", k, v), text);
const ids = (t) => (t ? [t.question.id, t.place.screen, t.place.tab, t.place.part] : null);

test("with no place and nothing answered, Continue offers the first listen, at the part that holds it, with its prompt for go()", () => {
	const t = at(COURSE);
	assert.deepEqual(ids(t), ["l1", "activity:/course", null, 0]);
	assert.equal(t.heading, "Episode 1");
	assert.deepEqual(t.place, { screen: "activity:/course", tab: null, part: 0 });
});

test("a listen is done, so Continue moves to the question after it; a pos alone is not done, so the same listen is offered", () => {
	assert.deepEqual(ids(at(withAnswers(COURSE, { l1: { done: true } }))), ["q1", "activity:/course", null, 0]);
	assert.equal(at(withAnswers(COURSE, { l1: { pos: 300 } })).question.id, "l1", "a position kept is not an answer");
	assert.equal(at(withAnswers(COURSE, { l1: { pos: 300, done: false } })).question.id, "l1");
});

test("skip a question, read on, and Continue goes past it: it is never offered again", () => {
	// q1 skipped; she answered the choice on page 2: her place is that answer, and q1 is behind it
	const text = withAnswers(COURSE, { l1: { done: true }, c2: 2 });
	assert.deepEqual(ids(at(text)), ["q3", "activity:/course", null, 2]);
	// the same with the place the device keeps: she reached page 2 (part 1) and q1 was on part 0
	const { nav } = build(COURSE);
	const furthest = core.pageIndexOf(nav, { screen: "activity:/course", tab: null, part: 1 });
	assert.equal(furthest, 1);
	assert.equal(at(COURSE, furthest).question.id, "l2", "from the page she reached: its first thing to do");
	assert.equal(at(COURSE, 0).question.id, "l1", "on the first page she has done nothing");
});

test("the furthest page she reached still counts: what is on it is offered, what is before it is not", () => {
	const text = withAnswers(COURSE, { l1: { done: true } });
	assert.equal(at(text, 0).question.id, "q1");
	assert.equal(at(text, 1).question.id, "l2");
	assert.equal(at(withAnswers(text, { l2: { done: true } }), 1).question.id, "c2");
	assert.equal(at(withAnswers(text, { l2: { done: true }, c2: 1 }), 1).question.id, "q3");
	// she went home from page 3 with q3 unanswered: it is what Continue leads back to
	assert.equal(at(text, 2).question.id, "q3");
});

test("the furthest page wins over the records: an answer behind it moves nothing, one ahead of it is already done", () => {
	// answered q3 (the last page) and nothing else, but the device says she only got as far as page 1: from there on, the first unfinished is l2
	const text = withAnswers(COURSE, { q3: "words" });
	assert.equal(at(text, 1).question.id, "l2");
	// with no device place, the records say she is at q3, so what is behind it is not offered: the next activity's question is
	assert.deepEqual(ids(at(text)), ["m1", "activity:/more", null, 0]);
});

test("nothing left after her place gives null", () => {
	const all = withAnswers(COURSE, { l1: { done: true }, q1: "a", l2: { done: true }, c2: 1, q3: "c", m1: "x", m2: "y" });
	assert.equal(at(all), null, "everything answered");
	assert.equal(at(withAnswers(COURSE, { m2: "last" })), null, "the last question answered and everything before it passed over");
	assert.equal(core.continueTarget(...(({ book, nav }) => [nav, book, { furthest: null }])(build(`${HEAD}\n> [!activity|a] Prose only\n\nJust words.\n`))), null, "nothing to answer");
});

test("a furthest page past the last one (the author took pages out since) is no place: the records say, and Continue is still offered", () => {
	const { nav } = build(COURSE);
	const pages = core.pageIndexOf(nav, { screen: "activity:/more", tab: null, part: 0 }) + 1;
	assert.equal(pages, 4, "the booklet has four parts");
	// the device kept 4 (and 99) when the booklet had more pages; with nothing answered the first thing to do is offered, as with no place at all
	for (const gone of [4, 99]) assert.equal(at(COURSE, gone).question.id, "l1", `furthest ${gone}`);
	// with the records saying she is past l1, it is the first unfinished after her last answer
	const text = withAnswers(COURSE, { l1: { done: true }, q1: "a" });
	for (const gone of [4, 99]) assert.equal(at(text, gone).question.id, "l2", `furthest ${gone} with answers`);
	// the last page that exists is still a place, and with everything on it answered nothing is left
	const all = withAnswers(COURSE, { l1: { done: true }, q1: "a", l2: { done: true }, c2: 1, q3: "c", m1: "x", m2: "y" });
	assert.equal(at(all, 3), null);
	assert.equal(at(all, 99), null, "everything answered, whatever the device says");
});

test("a hidden activity and a repeat activity are skipped, and a repeat activity's records are not a place", () => {
	const text = `${HEAD}
> [!activity|log repeat] A log

> [!text|entry] Today

> [!activity|secret hidden] Secret

> [!text|h1] Hidden question

> [!activity|real] Real

> [!listen|r1] Real listen
> ![[real.mp3]]
`;
	const t = at(text);
	assert.deepEqual(ids(t), ["r1", "activity:/real", null, 0]);
	// a draft of the repeat activity answers nothing for Continue
	assert.equal(at(core.setDraftAnswer(text, "", "log", "entry", "words")).question.id, "r1");
	// a listen inside a repeat activity is not offered either
	const rep = `${HEAD}\n> [!activity|log repeat] A log\n\n> [!listen|l] L\n> ![[a.mp3]]\n`;
	assert.equal(at(rep), null);
});

test("a question she cannot answer here is not offered, or Continue would hold her at it for good", () => {
	const text = `${HEAD}
> [!activity|a] A

> [!widget|w] A widget the file does not carry
> ![[#^missing]]

> [!text|odd] Held in the wrong shape

> [!text|ok] A question she can answer
`;
	// "odd" holds a number: the wrong shape for a text, kept as written and shown read-only
	const odd = core.setAnswer(core.setAnswer(text, "", "odd", 5), "", "ok", "x");
	assert.equal(core.parseBooklet(odd).records.answers[""].odd, 5);
	assert.equal(at(text).question.id, "odd", "the widget is skipped; the next question is offered");
	assert.equal(at(odd), null, "the widget and the wrong shape are skipped; nothing she can answer is left");
});

test("a question with `each:` is a question like any other", () => {
	const text = `${HEAD}
> [!activity|a] A

> [!choice|c] Pick
- [ ] One
- [ ] Two

> [!text|why each:c] Why

> [!text|after] After
`;
	assert.equal(at(text).question.id, "c");
	assert.equal(at(withAnswers(text, { c: 1 })).question.id, "why", "answered the choice; the pick's question is next");
});

test("in file order across the booklet: modules and bare activities as they stand in the file, not the cards'", () => {
	// a module first in the file, a bare activity after it: the cards put the bare activity first, but Continue reads the file's order
	const text = `${HEAD}
> [!module|m] Module

> [!activity|inside] Inside

> [!text|mq] In the module

> [!module|m end]

> [!activity|outside] Outside

> [!text|oq] Bare one
`;
	const { book, nav } = build(text);
	assert.equal(nav.mods[0].bare, true, "the cards have the bare activities first");
	assert.deepEqual(ids(core.continueTarget(nav, book, { furthest: null })), ["mq", "activity:m/inside", null, 0]);
	const done = core.setAnswer(text, "m", "mq", "words");
	const b = build(done);
	assert.deepEqual(ids(core.continueTarget(b.nav, b.book, { furthest: null })), ["oq", "activity:/outside", null, 0]);
});

test("tabs: a question on a later tab is reached after the earlier tab's, and its place names the tab", () => {
	const text = `${HEAD}
> [!activity|a] Tabbed

> [!tab|one] One

> [!text|q1] On tab one
${BREAK}
> [!text|q2] Still tab one

> [!tab|two] Two

> [!text|q3] On tab two
`;
	const { book, nav } = build(text);
	const order = core.readingOrder(nav).map((r) => [r.tab.id, r.part]);
	assert.deepEqual(order, [["one", 0], ["one", 1], ["two", 0]]);
	const get = (answers, furthest = null) => {
		const t = answers.reduce((s, [k, v]) => core.setAnswer(s, "", k, v), text);
		const b = build(t);
		return core.continueTarget(b.nav, b.book, { furthest });
	};
	assert.deepEqual(ids(get([["q1", "x"]])), ["q2", "activity:/a", "one", 1]);
	assert.deepEqual(ids(get([["q1", "x"], ["q2", "y"]])), ["q3", "activity:/a", "two", 0]);
	assert.equal(core.pageIndexOf(nav, { screen: "activity:/a", tab: "two", part: 0 }), 2);
	assert.equal(core.pageIndexOf(nav, { screen: "activity:/a", tab: "one", part: 1 }), 1);
	assert.equal(book.activities.length, 1);
});

test("an activity's opening, drawn above every tab, is read first", () => {
	const text = `${HEAD}
> [!activity|a] Tabbed

> [!text|top] Above the tabs

> [!tab|one] One

> [!text|q1] On tab one

> [!tab|two] Two

> [!text|q2] On tab two
`;
	const { book, nav } = build(text);
	assert.deepEqual(ids(core.continueTarget(nav, book, { furthest: null })), ["top", "activity:/a", "one", 0]);
});

test("pageIndexOf counts parts across the booklet in reading order; home, a module screen and a place the booklet lacks have none", () => {
	const { nav } = build(COURSE);
	assert.deepEqual(core.readingOrder(nav).map((r) => [r.act.act.id, r.part]), [["course", 0], ["course", 1], ["course", 2], ["more", 0]]);
	const idx = (screen, part = 0) => core.pageIndexOf(nav, { screen, tab: null, part });
	assert.deepEqual([idx("activity:/course", 0), idx("activity:/course", 2), idx("activity:/more", 0)], [0, 2, 3]);
	assert.equal(idx("activity:/course", 99), 2, "a part past the end is the last");
	assert.equal(idx("home"), null);
	assert.equal(idx("module:nope"), null);
	assert.equal(idx("activity:/nope"), null);
});
