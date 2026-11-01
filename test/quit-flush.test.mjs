/*
 * What a hard stop loses (a crash, a kill, a power cut), and what a normal close saves. Words typed in a text field are written
 * TYPING_PAUSE_MS (700 ms) after the first key not yet written, whether or not the reader keeps typing: so a stop loses at most
 * the last 700 ms, never a whole paragraph typed without a pause. Closing the pane, opening another note in it and the app's
 * quit event write what is waiting at once. The same flows with a real process killed are check 38 of e2e/plugin-check.js.
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
		// at any moment, what the note holds is everything typed more than 700 ms (and a little for the write) ago
		const age = Date.now() - 1000;
		const mustHold = typedAt.filter((x) => x <= age).length;
		const held = (v.answers().thoughts ?? "").length;
		assert.ok(held >= mustHold, `after ${Date.now() - start} ms the note holds ${held} of the ${typedAt.length} characters; the ${mustHold} typed over a second ago must be there`);
	}
	assert.ok(v.disk.writes >= 3, `${v.disk.writes} writes in 3 s of typing`);
	v.close();
});

test("a pause of 700 ms from the first key still writes once, and the reader's later keys start a new wait", async () => {
	const v = open();
	const t = v.field();
	t.focus();
	typeInto(t, "first");
	assert.equal(v.disk.writes, 0, "nothing is written before the wait is up");
	await until(() => v.answers().thoughts === "first", "the first words written");
	typeInto(t, "first second");
	await until(() => v.answers().thoughts === "first second", "the next words written");
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
