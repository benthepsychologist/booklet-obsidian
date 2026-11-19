/*
 * Editor mode is the panel's own on and off, as state: off to begin with, toggled, set, and heard once for each change.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { core } from "./helpers.mjs";

const { EditorMode } = core;

test("editor mode starts off", () => {
	assert.equal(new EditorMode().on, false);
});

test("it toggles, and says what it became", () => {
	const m = new EditorMode();
	assert.equal(m.toggle(), true);
	assert.equal(m.on, true);
	assert.equal(m.toggle(), false);
	assert.equal(m.on, false);
});

test("setting it to what it is changes nothing and is not heard", () => {
	const m = new EditorMode();
	const heard = [];
	m.onChange((on) => heard.push(on));
	assert.equal(m.set(false), false);
	assert.equal(m.set(true), true);
	assert.equal(m.set(true), false);
	assert.equal(m.set(false), true);
	assert.deepEqual(heard, [true, false]);
});

test("a listener that stopped listening hears no more", () => {
	const m = new EditorMode();
	const heard = [];
	const stop = m.onChange((on) => heard.push(on));
	m.set(true);
	stop();
	m.set(false);
	assert.deepEqual(heard, [true]);
});

test("it is not a setting: the plugin's saved data has no key for it", async () => {
	const { readFileSync } = await import("node:fs");
	const { ROOT } = await import("./helpers.mjs");
	const settings = readFileSync(`${ROOT}/src/settings.ts`, "utf8");
	assert.doesNotMatch(settings, /editor ?mode/i, "no settings-tab option hides or shows the panel");
});
