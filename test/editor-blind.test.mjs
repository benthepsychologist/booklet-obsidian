/*
 * Second fix round, item D: on a booklet the reader refuses, `impactOf` finds nothing because it cannot look, and the old write said
 * nothing. A design change (an id, an option, a declared field) now asks, in words that say the panel cannot count, with Change and
 * Cancel; Cancel changes nothing. A change that is not one of those (a flag, a value, a placed piece) is not held up.
 */
import test from "node:test";
import assert from "node:assert/strict";
import "./dom.mjs";
import { core, sleep } from "./helpers.mjs";
import { HELD } from "./editor-fixture.mjs";

const { BLIND, readerRefuses, parseBooklet } = core;
const { writeNote } = await import("./.build/view.mjs");
const app = {};

/** The fixture with its module never closed: the reader refuses it. */
const REFUSED = HELD.replace("> [!module|mood end]\n", "");
const RENAMED = REFUSED.replace("[!choice|feeling]", "[!choice|zz]");

function fakeEditor(text) {
	const e = {
		text,
		getValue: () => e.text,
		offsetToPos(off) {
			const before = e.text.slice(0, off).split("\n");
			return { line: before.length - 1, ch: before[before.length - 1].length };
		},
		replaceRange(insert, from, to) {
			const at = (p) => e.text.split("\n").slice(0, p.line).reduce((n, l) => n + l.length + 1, 0) + p.ch;
			e.text = e.text.slice(0, at(from)) + insert + e.text.slice(to ? at(to) : at(from));
		},
	};
	return e;
}
const button = (name) => [...document.querySelectorAll(".booklet-blocks-ask button")].find((b) => b.textContent === name);

test("[D] the fixture is a booklet the reader refuses, and the sentence is the one asked for", () => {
	assert.equal(parseBooklet(REFUSED).ok, false);
	assert.equal(readerRefuses(REFUSED), true);
	assert.equal(readerRefuses(HELD), false);
	assert.equal(BLIND, "The reader can't open this booklet right now, so the panel can't count what this change touches. Change it anyway?");
});

test("[D] a design change on a refused booklet asks first, and Cancel changes nothing", async () => {
	const ed = fakeEditor(REFUSED);
	const done = writeNote(app, ed, REFUSED, RENAMED, true);
	await sleep(20);
	const ask = document.querySelector(".booklet-blocks-ask");
	assert.ok(ask, "the question is asked");
	assert.ok(ask.textContent.includes(BLIND));
	assert.deepEqual([...ask.querySelectorAll("button")].map((b) => b.textContent), ["Change", "Cancel"]);
	assert.equal(ed.text, REFUSED, "nothing is written while it is open");
	button("Cancel").click();
	assert.equal(await done, false);
	assert.equal(ed.text, REFUSED);
});

test("[D] Change on a refused booklet writes it", async () => {
	const ed = fakeEditor(REFUSED);
	const done = writeNote(app, ed, REFUSED, RENAMED, true);
	await sleep(20);
	button("Change").click();
	assert.equal(await done, true);
	assert.equal(ed.text, RENAMED);
});

test("[D] a change that is not a design change, on a refused booklet, is not held up", async () => {
	const ed = fakeEditor(REFUSED);
	assert.equal(await writeNote(app, ed, REFUSED, RENAMED), true);
	assert.equal(document.querySelector(".booklet-blocks-ask"), null);
	assert.equal(ed.text, RENAMED);
});

test("[D] a design change on a booklet the reader opens asks nothing when it detaches nothing", async () => {
	const good = HELD;
	const next = good.replace("> [!module|mood] Mood\n", "> [!module|mood] Mood!\n");
	const ed = fakeEditor(good);
	assert.equal(await writeNote(app, ed, good, next, true), true, "no question: a title is not something kept data points at");
	assert.equal(document.querySelector(".booklet-blocks-ask"), null);
});

test("[D] the settings impactOf counts are the ones that ask on a refused booklet: repeat, open, daily, each, menu", () => {
	const { isCountedSetting } = core;
	for (const name of ["repeat", "open", "daily", "each", "menu"]) assert.equal(isCountedSetting(name), true, name);
	for (const name of ["hidden", "icon", "min", "max", "step", "of", "required"]) assert.equal(isCountedSetting(name), false, name);
});
