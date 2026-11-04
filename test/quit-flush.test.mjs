/*
 * What a hard stop loses (a crash, a kill, a power cut), and what a normal close saves. Words typed in a text field are written
 * TYPING_PAUSE_MS (700 ms) after the first key not yet written, whether or not the reader keeps typing: so a stop loses at most
 * the last 700 ms, never a whole paragraph typed without a pause. Closing the pane, opening another note in it and the app's
 * quit event write what is waiting at once. The same flows with a real process killed are check 38 of e2e-tests/plugin-check.js.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { openView, typeInto, window as w, until } from "./dom.mjs";
import { ROOT, core, norm, sleep } from "./helpers.mjs";

const NOTE = readFileSync(join(ROOT, "test-vault", "Every kind.booklet.md"), "utf8");
const open = () => {
	const v = openView(NOTE, { path: "Every kind.booklet.md", screen: "activity:/kinds" });
	return { ...v, field: () => v.view.contentEl.querySelector('[data-booklet-activity="/kinds"] .booklet-kind-text textarea'), answers: () => norm(core.parseBooklet(v.disk.text).records.answers[""] ?? {}) };
};

test("words typed without a pause are written every 700 ms, so a hard stop loses no more than that", async () => {
	const v = open();
	const t = v.field();
	t.focus();
	const typedAt = [];
	const start = Date.now();
	let n = 0;
	// a key every 120 ms for 3 seconds: no pause anywhere near 700 ms
	while (Date.now() - start < 3000) {
		n++;
		typeInto(t, "k".repeat(n));
		typedAt.push(Date.now());
		await sleep(120);
		// at any moment, what the note holds is everything typed more than 700 ms (and some time for the write) ago
		const age = Date.now() - 1300;
		const mustHold = typedAt.filter((x) => x <= age).length;
		const held = (v.answers().thoughts ?? "").length;
		assert.ok(held >= mustHold, `after ${Date.now() - start} ms the note holds ${held} of the ${typedAt.length} characters; the ${mustHold} typed over 1.3 s ago must be there`);
	}
	assert.ok(v.disk.writes >= 3, `${v.disk.writes} writes in 3 s of typing`);
	v.close();
});

test("a key typed while the wait runs does not move its end, and the first key after the write starts a new wait", async () => {
	const v = open();
	const t = v.field();
	t.focus();
	typeInto(t, "a");
	assert.equal(v.disk.writes, 0, "nothing is written before the wait is up");
	await sleep(300);
	typeInto(t, "ab");
	await sleep(500);
	// 800 ms from the first key: the wait that began at it has ended, though a key came at 300 ms
	assert.equal(v.disk.writes, 1, "one write at 700 ms from the first key");
	assert.equal(v.answers().thoughts, "ab");
	typeInto(t, "abc");
	await sleep(400);
	assert.equal(v.disk.writes, 1, "the key after the write began a new wait of its own, not yet up");
	await until(() => v.answers().thoughts === "abc", "the next words written");
	assert.equal(v.disk.writes, 2);
	v.close();
});

test("the pane letting go of the note (closed, or another note opened in it) writes what is waiting at once", async () => {
	const v = open();
	const t = v.field();
	t.focus();
	typeInto(t, "Typed a moment ago");
	assert.equal(v.answers().thoughts, undefined);
	await v.view.onUnloadFile(v.view.file);
	assert.equal(v.answers().thoughts, "Typed a moment ago");
	v.close();
});

test("saveTyped, which the app's quit event runs, writes what is waiting at once and returns after the write", async () => {
	const v = open();
	const t = v.field();
	t.focus();
	typeInto(t, "Typed just before the quit");
	await v.view.saveTyped();
	assert.equal(v.answers().thoughts, "Typed just before the quit");
	v.close();
});
