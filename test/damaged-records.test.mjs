/*
 * Damaged and duplicated records (SPEC section 12: "parse each fenced record independently and skip, count and report any it cannot
 * read"). A record that is not JSON, not an object, or has the wrong shape is skipped, counted and kept as written; a record written
 * twice is read as the spec reads two blocks of one activity (merged in file order); and no write the plugin makes ever changes a
 * byte of either. The same notes, in the real app, are check 35 of e2e/plugin-check.js.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { openView, click, words, until } from "./dom.mjs";
import { core, norm } from "./helpers.mjs";

const HEAD = `---
booklet: "0.18"
id: test/damaged
title: Damaged
lang: en
---

> [!activity|mood] A mood

> [!choice|feel] How do you feel?
- [ ] Calm
- [ ] Tense

> [!text|why] Why?

> [!activity|diary repeat] A diary

> [!text|entry] Today
`;
const region = (...blocks) => `${HEAD}\n%%\n${core.RECORDS_HEADER}\n\n${blocks.join("\n\n")}\n%%\n`;
const entries = (...items) => `\`\`\`booklet entries diary\n{"items": [\n${items.map((i) => JSON.stringify(i)).join(",\n")}\n]}\n\`\`\``;
const ONE = { ts: "2026-10-01T08:00:00Z", entry: "One" };
const TWO = { ts: "2026-10-02T08:00:00Z", entry: "Two" };
const TWO_AGAIN = { ts: "2026-10-02T08:00:00Z", entry: "Two again" };
const THREE = { ts: "2026-10-03T08:00:00Z", entry: "Three" };

/** Damaged records, each as the text of the block, with what the reader is told about it. */
const DAMAGED = {
	"a draft that is not JSON": ['```booklet draft diary\n{"entry": "half written",}\n```', /draft block could not be read/],
	"an answers block that is not JSON": ['```booklet answers\n{"why": "x",}\n```', /answers block could not be read/],
	"an answers block that is a list": ['```booklet answers\n["why", "x"]\n```', /answers block could not be read/],
	"an entries block with no list of entries": ['```booklet entries diary\n{"items": "none"}\n```', /holds no list of entries/],
	"an entries block with an entry that has no ts": ['```booklet entries diary\n{"items": [{"entry": "no time"}]}\n```', /holds no list of entries/],
	"an entries block that names no activity": ['```booklet entries\n{"items": []}\n```', /names no activity/],
	"an empty block": ["```booklet draft diary\n```", /draft block could not be read/],
};

for (const [what, [block, said]] of Object.entries(DAMAGED)) {
	test(`${what}: reported once, kept as written through every kind of write, the rest read`, () => {
		const orig = region(entries(ONE, TWO), block);
		const book = core.parseBooklet(orig);
		const mine = book.problems.filter((p) => said.test(p));
		assert.equal(mine.length, 1, `${what}: ${JSON.stringify(book.problems)}`);
		assert.deepEqual(norm(book.records.entries[""]?.diary?.map((e) => e.entry)), ["One", "Two"], "the readable records are read");
		const steps = [
			core.setAnswer(orig, "", "feel", 2),
			core.setDraftAnswer(orig, "", "diary", "entry", "Typed"),
		];
		steps.push(core.finalizeDraft(steps[1], "", "diary", { ts: "2026-10-04T08:00:00Z" }).text);
		steps.push(core.setAnswer(steps[0], "", "feel", undefined));
		steps.push(core.setDraftAnswer(steps[1], "", "diary", "entry", undefined));
		for (const next of steps) {
			assert.equal(next.split(block).length - 1, 1, `${what}: the damaged block is not there once, byte for byte`);
			assert.ok(next.startsWith(HEAD), "the design is as written");
			assert.deepEqual(core.parseBooklet(next).problems.filter((p) => said.test(p)).length, 1, "and it is still reported once");
		}
		// the answer pressed is the only thing that changed besides the damaged block's neighbours
		assert.deepEqual(norm(core.parseBooklet(steps[0]).records.answers[""]?.feel), 2);
		assert.equal(core.parseBooklet(steps[2]).records.entries[""].diary.at(-1).entry, "Typed");
	});
}

test("a record written twice: read as one list in file order, the later words win, and a write leaves both copies as written", () => {
	const a = entries(ONE, TWO);
	const b = entries(TWO_AGAIN, THREE);
	const orig = region(a, b);
	const book = core.parseBooklet(orig);
	assert.deepEqual(norm(book.records.entries[""].diary.map((e) => e.entry)), ["One", "Two again", "Three"]);
	assert.equal(book.problems.filter((p) => /block/.test(p)).length, 0, "readable twice is not damage: nothing is reported");
	for (const next of [core.setAnswer(orig, "", "feel", 1), core.setDraftAnswer(orig, "", "diary", "entry", "x")]) {
		assert.ok(next.includes(a) && next.includes(b), "both copies as written");
		assert.deepEqual(norm(core.parseBooklet(next).records.entries[""].diary), norm(book.records.entries[""].diary));
	}
	// Finalize writes the new entry after the last entry of the last block, and leaves the first block alone
	const draft = core.setDraftAnswer(orig, "", "diary", "entry", "Four");
	const done = core.finalizeDraft(draft, "", "diary", { ts: "2026-10-05T08:00:00Z" }).text;
	assert.ok(done.includes(a), "the first copy is as written");
	assert.deepEqual(norm(core.parseBooklet(done).records.entries[""].diary.map((e) => e.entry)), ["One", "Two again", "Three", "Four"]);
	// the same answers block twice: a set goes into the last (where it is read last), a clear goes from both; neither copy is rewritten otherwise
	const answers1 = '```booklet answers\n{"why": "first", "feel": 1}\n```';
	const answers2 = '```booklet answers\n{"why": "second"}\n```';
	const twice = region(answers1, answers2);
	const set = core.setAnswer(twice, "", "feel", 2);
	assert.ok(set.includes(answers1), "the first copy as written");
	assert.deepEqual(norm(core.parseBooklet(set).records.answers[""]), { why: "second", feel: 2 });
});

test("a block that never closes is the end of the file: it is kept as written and nothing is written into it", () => {
	const orig = `${HEAD}\n%%\n${core.RECORDS_HEADER}\n\n\`\`\`booklet answers\n{"why": "x"}\n`;
	const book = core.parseBooklet(orig);
	assert.ok(book.records.blocks.every((b) => !b.closed || !b.value));
	assert.throws(() => core.setAnswer(orig, "", "feel", 1), /never closed|fence/);
});

/* ---- the view says so ---- */

test("the view lists a damaged record at its top once, draws the rest, and takes an answer without touching either record", async () => {
	const bad = DAMAGED["a draft that is not JSON"][0];
	const a = entries(ONE, TWO);
	const b = entries(TWO_AGAIN, THREE);
	const orig = region('```booklet answers\n{"why": "A reason"}\n```', a, b, bad);
	const v = openView(orig, { path: "Damaged.booklet.md", screen: "activity:/mood" });
	await v.settled();
	const root = v.view.contentEl;
	assert.equal(words(root.querySelector(".booklet-problems summary")), "1 thing in this note could not be read");
	assert.match(words(root.querySelector(".booklet-problems li")), /^Line \d+: the booklet draft block could not be read, so it is kept exactly as written\.$/);
	assert.equal(root.querySelectorAll(".booklet-problems li").length, 1);
	assert.equal(root.querySelector(".booklet-kind-text input, .booklet-kind-text textarea").value, "A reason");
	const buttons = [...root.querySelectorAll(".booklet-kind-choice button.booklet-choice")];
	assert.equal(buttons.length, 2);
	click(buttons[1]);
	await until(() => v.disk.text.includes('"feel"'), "the press written");
	await v.settled();
	assert.ok(v.disk.text.includes(a) && v.disk.text.includes(b) && v.disk.text.includes(bad));
	assert.equal(root.querySelectorAll(".booklet-problems li").length, 1, "still listed once after the write");
	v.close();
});
