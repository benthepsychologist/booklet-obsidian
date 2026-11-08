/*
 * Continue in the view (SPEC section 12, format 0.18): a button on the home screen and on a module's screen, named for where it leads,
 * that opens the first `listen` not done or question not answered after the reader's place. Her place is the furthest page she has reached
 * on this device (the store `booklet-place:<path>`), else what the records say. Nothing before her place is offered, so a question she
 * skipped is not offered again. Every note is made up.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { words } from "./dom.mjs";
import { core } from "./helpers.mjs";
import { pane } from "./pane.mjs";

process.env.TZ = "UTC";

const HEAD = '---\nbooklet: "0.20"\nid: made/up\ntitle: Made up\nlang: en\n---\n';
const BREAK = "\n***\n";

/** Two activities on the home screen; the first has two pages, each with a listen and a question. */
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

> [!activity|more] More

> [!text|m1] More one
`;

/** A device store, as Obsidian's saveLocalStorage keeps one. */
function store() {
	const m = new Map();
	return { m, loadLocalStorage: (k) => (m.has(k) ? JSON.parse(m.get(k)) : null), saveLocalStorage: (k, d) => (d === null ? m.delete(k) : m.set(k, JSON.stringify(d))) };
}

const button = (p) => p.el.querySelector(".booklet-continue-button");
const PLACE = "booklet-place:Note.booklet.md";

test("home has a Continue button named for where it leads, and a press opens that prompt with focus on it", async () => {
	const s = store();
	const p = pane(COURSE, { appMore: s });
	await p.settled();
	assert.equal(p.screen, "home");
	assert.equal(words(button(p)), "Continue: Episode 1", "the target is in the button's own words");
	await p.press(".booklet-continue-button", "Continue");
	assert.equal(p.screen, "activity:/course");
	const active = p.el.ownerDocument.activeElement;
	assert.ok(active.classList.contains("booklet-prompt"), `focus is on the prompt, not on ${active.className || active.localName}`);
	assert.equal(active.getAttribute("tabindex"), "-1");
	assert.equal(words(active), "Episode 1");
	p.close();
});

test("a question she skipped is not offered again: skip it, read on, and Continue goes past it", async () => {
	const s = store();
	const p = pane(COURSE, { appMore: s });
	await p.settled();
	await p.card("1.The course");
	assert.equal(s.m.get(PLACE), "0", "page 0 is the furthest so far");
	await p.pageNext();
	assert.equal(s.m.get(PLACE), "1", "the furthest page reached is kept on the device");
	await p.trailTo("Made up");
	assert.equal(p.screen, "home");
	// the listen and the question on page 0 are open; neither is offered, for she is past them
	assert.equal(words(button(p)), "Continue: Episode 2");
	// Back to page 0 does not move the furthest back
	await p.card("1.The course");
	await p.pageBack();
	assert.equal(s.m.get(PLACE), "1");
	p.close();
});

test("with no place on the device Continue works from the records: the first thing after the last one answered", async () => {
	const done = core.setAnswer(core.setAnswer(COURSE, "", "l1", { done: true }), "", "q1", "x");
	const p = pane(done, { appMore: store() });
	await p.settled();
	assert.equal(words(button(p)), "Continue: Episode 2");
	p.close();
	// a position alone is not done
	const pos = pane(core.setAnswer(COURSE, "", "l1", { pos: 30 }), { appMore: store() });
	await pos.settled();
	assert.equal(words(button(pos)), "Continue: Episode 1");
	pos.close();
});

test("there is no Continue when nothing is left, and the button follows a change made elsewhere", async () => {
	let text = COURSE;
	for (const [id, v] of [["l1", { done: true }], ["q1", "a"], ["l2", { done: true }], ["c2", 1]]) text = core.setAnswer(text, "", id, v);
	const p = pane(text, { appMore: store() });
	await p.settled();
	assert.equal(words(button(p)), "Continue: More one", "only the second activity's question is left");
	// the last question is answered somewhere else (Sync): the button goes
	p.disk.text = core.setAnswer(p.disk.text, "", "m1", "done");
	p.view.setViewData(p.disk.text, false);
	await p.settled();
	assert.equal(button(p), null);
	assert.equal(p.el.querySelector(".booklet-continue").children.length, 0);
	p.close();
});

test("a booklet that opens straight into one activity has no home and no Continue", async () => {
	const one = `${HEAD}\n> [!activity|course] The course\n\n> [!listen|l1] Episode 1\n> ![Episode 1](media/ep1.mp3)\n`;
	const p = pane(one, { appMore: store() });
	await p.settled();
	assert.equal(p.screen, "activity:/course");
	assert.equal(button(p), null);
	p.close();
});

test("a module's screen has a Continue too, and a press opens the first thing there", async () => {
	const mods = `${HEAD}
Welcome.

> [!module|u1] Unit 1

Some words about unit one.

> [!activity|a1] First

> [!listen|u1-e1] Episode 1
> ![Episode 1](media/ep1.mp3)

> [!activity|a1b] First b

> [!text|u1-q] A question

> [!module|u1 end] End of Unit 1

> [!module|u2] Unit 2

Words about unit two.

> [!activity|a2] Second

> [!listen|u2-e1] Episode 2
> ![Episode 2](media/ep2.mp3)

> [!activity|a2b] Second b

> [!text|u2-q] Another question

> [!module|u2 end] End of Unit 2
`;
	const p = pane(mods, { appMore: store() });
	await p.settled();
	await p.card("1.Unit 1");
	assert.equal(p.screen, "module:u1");
	assert.equal(words(button(p)), "Continue: Episode 1");
	await p.press(".booklet-continue-button", "Continue");
	assert.equal(p.screen, "activity:u1/a1");
	p.close();
});
