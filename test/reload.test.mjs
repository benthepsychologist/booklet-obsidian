/*
 * A reload adds every word held for "Add your own", whichever screen the pane reopens on. 0.5.0 drew every activity at once, so
 * the words held for any of them were added; the saved place can be the screen before the one the words were typed on (Obsidian
 * saves it after a pause), and the words must not wait for a visit. Every note is made up.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { typeInto, until } from "./dom.mjs";
import { pane } from "./pane.mjs";

const BOOK = `---
booklet: "0.16"
title: Probe
---

> [!activity|a1] First

> [!multi|m1 open] Pick some. Add your own.
- [ ] Pencil
- [ ] Ruler

> [!activity|a2] Second

> [!multi|m2 open] Pick others. Add your own.
- [ ] Pen
- [ ] Rule

> [!activity|a3] Third

> [!tab] One

Read this.

> [!tab] Two

First page of two.

***

> [!choice|c3 open] Pick one. Add your own.
- [ ] Yes
- [ ] No
`;

/** A device's local storage, shared by the panes of one test (what held-store.ts keeps the held words in). */
function device() {
	const store = new Map();
	const open = (opts) => {
		const p = pane(BOOK, { ...opts, drawLater: true });
		p.view.app.loadLocalStorage = (k) => (store.has(k) ? JSON.parse(store.get(k)) : null);
		p.view.app.saveLocalStorage = (k, d) => (d === null ? store.delete(k) : store.set(k, JSON.stringify(d)));
		p.draw();
		return p;
	};
	return { store, open };
}
const own = (p) => p.all("input.booklet-text").find((i) => i.getAttribute("data-booklet-key"));
const type = typeInto;
const held = (d) => [...d.store.values()].map((v) => JSON.parse(v)).flatMap((o) => Object.values(o));

test("a reload adds the words held for an activity that is not on the screen it reopens on", async () => {
	const d = device();
	let p = d.open({ screen: "activity:/a2" });
	await p.settled();
	type(own(p), "mine-a2");
	assert.deepEqual(held(d), ["mine-a2"]);
	// the reload: the view is gone with nothing added, the layout still says the first activity
	p.close();
	p = d.open({ state: { version: 1, screen: "activity:/a1", part: 0 } });
	await p.settled();
	assert.equal(p.screen, "activity:/a1");
	assert.ok(p.disk.text.includes("mine-a2"), "the second activity's held words are in the note: " + p.disk.text);
	assert.deepEqual(held(d), [], "and no longer held");
	p.close();
});

test("the words are added as the field's own leaving adds them: the same note, byte for byte", async () => {
	// reopened on the screen that holds the field, the words are added by the field's own commit
	const here = device();
	let p = here.open({ screen: "activity:/a2" });
	await p.settled();
	type(own(p), "mine-a2");
	p.close();
	p = here.open({ screen: "activity:/a2" });
	await p.settled();
	const onScreen = p.disk.text;
	p.close();
	// reopened on another screen, they are added through the same closure
	const away = device();
	p = away.open({ screen: "activity:/a2" });
	await p.settled();
	type(own(p), "mine-a2");
	p.close();
	p = away.open({ state: { version: 1, screen: "activity:/a1", part: 0 } });
	await p.settled();
	assert.ok(onScreen.includes("mine-a2"));
	assert.equal(p.disk.text, onScreen);
	p.close();
});

test("words held for a later page of a tab and for another activity are all added", async () => {
	// the words are typed on two screens, in two sessions that each end in a reload; their held words are put together
	const typedOn = async (state, words) => {
		const d = device();
		const p = d.open({ state });
		await p.settled();
		type(own(p), words);
		p.close();
		return JSON.parse([...d.store.values()][0]);
	};
	const late = await typedOn({ version: 1, screen: "activity:/a3", tab: "two", part: 1 }, "late-page");
	const second = await typedOn({ version: 1, screen: "activity:/a2", part: 0 }, "mine-a2");
	const d = device();
	d.store.set("booklet-held:Note.booklet.md", JSON.stringify({ ...late, ...second }));
	assert.equal(held(d).length, 2);
	const p = d.open({ state: { version: 1, screen: "activity:/a1", part: 0 } });
	await until(() => p.disk.text.includes("late-page") && p.disk.text.includes("mine-a2"), "the held words added to the note");
	await p.settled();
	assert.ok(p.disk.text.includes("late-page"), "the words held for the later page of a tab are in the note: " + p.disk.text);
	assert.ok(p.disk.text.includes("mine-a2"), "and those of another activity: " + p.disk.text);
	assert.deepEqual(held(d), []);
	p.close();
});
