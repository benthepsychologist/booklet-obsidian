/*
 * A field left while the press under way began on something that is not a node (the window): leaving it adds the words typed
 * in it and nothing throws. Every note is made up.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { typeInto, until, window as w } from "./dom.mjs";
import { pane } from "./pane.mjs";

const BOOK = `---
booklet: "0.17"
title: Probe
---

> [!activity|a1] First

> [!multi|m1 open] Pick some. Add your own.
- [ ] Pencil
- [ ] Ruler
`;

test("a press that began on the window: leaving the field of Add your own adds its words, and nothing throws", async () => {
	const errors = [];
	const onError = (evt) => {
		evt.preventDefault();
		errors.push(String(evt.error ?? evt.message));
	};
	w.addEventListener("error", onError);
	const p = pane(BOOK, { screen: "activity:/a1" });
	await p.settled();
	const input = p.all("[data-booklet-q='m1'] input.booklet-text")[0];
	assert.ok(input, "the field is drawn");
	typeInto(input, "own-words-789");
	p.view.pressing = true;
	p.view.pressOn = w;
	input.dispatchEvent(new w.FocusEvent("blur"));
	p.view.pressing = false;
	p.view.pressOn = null;
	await until(() => p.disk.text.includes("own-words-789"), "the words added");
	w.removeEventListener("error", onError);
	assert.deepEqual(errors, [], "no error from leaving the field");
	p.close();
});
