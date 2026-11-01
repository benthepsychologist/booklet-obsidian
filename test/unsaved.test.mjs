/*
 * The quit hook (main.ts) offers Obsidian a task only for a view that has something on its way. Obsidian's hook turns a
 * reload into a quit when it has any task (1.5.8 closes the window once the tasks are done), so a hook that always had
 * a task made "Reload app without saving" quit the app whenever a booklet was open.
 * Made-up notes only.
 */
import { openView, typeInto } from "./dom.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { CHECKIN } from "./helpers.mjs";

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

/** The plugin loaded over an app that records the callback given to workspace.on("quit"), with these leaves open as booklet leaves. */
async function quitHook(leaves) {
	const { BookletPlugin } = await import("./.build/view.mjs");
	const on = {};
	const app = {
		workspace: {
			on: (name, fn) => ((on[name] = fn), {}),
			getLeavesOfType: (type) => (type === "booklet" ? leaves : []),
			onLayoutReady() {},
		},
		metadataCache: { on: () => ({}) },
		vault: { on: () => ({}) },
	};
	await new BookletPlugin(app, {}).onload();
	return on.quit;
}
/** What Obsidian hands the hook: an object that takes the tasks it is to wait for before it quits. */
const tasksList = () => {
	const added = [];
	return { added, add: (fn) => void added.push(fn) };
};

test("the quit hook offers Obsidian no task for a booklet view with nothing unsaved", async () => {
	const v = open();
	await v.settled();
	const quit = await quitHook([{ view: v.view }, { view: {} }]);
	const tasks = tasksList();
	quit(tasks);
	assert.equal(tasks.added.length, 0);
	v.close();
});

test("the quit hook offers one task for a view with words typed, and it writes them before it resolves", async () => {
	const v = open();
	await v.settled();
	typeInto(v.view.contentEl.querySelector('[data-booklet-q="thoughts"] input'), "A made-up thought");
	const quit = await quitHook([{ view: v.view }, { view: {} }]);
	const tasks = tasksList();
	quit(tasks);
	assert.equal(tasks.added.length, 1);
	assert.equal(v.disk.writes, 0);
	await tasks.added[0]();
	assert.match(v.disk.text, /A made-up thought/);
	assert.equal(v.view.hasUnsaved(), false);
	v.close();
});
