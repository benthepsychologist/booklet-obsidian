/*
 * The quit hook (main.ts) offers Obsidian a task only for a view that has something on its way. Obsidian's hook turns a
 * reload into a quit when it has any task (1.5.8 closes the window once the tasks are done), so a hook that always had
 * a task made "Reload app without saving" quit the app whenever a booklet was open.
 * Made-up notes only.
 */
import { openView, typeInto } from "./dom.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CHECKIN, ROOT } from "./helpers.mjs";

process.env.TZ = "UTC";

const open = () => {
	const disk = { text: CHECKIN, writes: 0 };
	return openView(disk.text, { path: "Check-in.booklet.md", disk, screen: "activity:day-check/today" });
};

test("a view with nothing typed and nothing being written has nothing unsaved", async () => {
	const v = open();
	await v.settled();
	assert.equal(v.view.hasUnsaved(), false);
	v.close();
});

test("words typed in Add your own and not added are unsaved, and are not once saveTyped has added them", async () => {
	const v = open();
	typeInto(v.view.contentEl.querySelector('[data-booklet-q="where"] [data-booklet-key$="#own"]'), "A café");
	assert.equal(v.view.hasUnsaved(), true);
	await v.view.saveTyped();
	await v.settled();
	assert.equal(v.view.hasUnsaved(), false);
	v.close();
});

test("text typed in a field and not yet written is unsaved", async () => {
	const v = open();
	typeInto(v.view.contentEl.querySelector('[data-booklet-q="thoughts"] input'), "A made-up thought");
	assert.equal(v.view.hasUnsaved(), true);
	await v.view.saveTyped();
	assert.equal(v.view.hasUnsaved(), false);
	v.close();
});

test("main.ts gives the quit hook a task only for a view with something unsaved", () => {
	const src = readFileSync(join(ROOT, "src", "main.ts"), "utf8");
	assert.match(src, /v instanceof BookletView && v\.hasUnsaved\(\)\) tasks\.add\(/);
});
