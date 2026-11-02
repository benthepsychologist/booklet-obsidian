/*
 * The names this plugin promises to keep (README, "What stays put"): the command id `toggle-view`, the view type `booklet` and the plugin's id
 * `booklet`; a saved pane read tolerantly, so that a pane saved by another release, by hand or with garbage in it opens the home screen and
 * never throws; the custom CSS properties the plugin defines; and a setting, when one is added, never changes what is written to a note.
 * A user's hotkeys bind a command id, and Obsidian's saved layout holds a view type, so a rename here breaks a reader's workspace.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, sleep } from "./helpers.mjs";
import { pane } from "./pane.mjs";

const manifest = JSON.parse(readFileSync(join(ROOT, "manifest.json"), "utf8"));

/** The plugin as the release build is, run over a stand-in for Obsidian that records what the plugin registers. */
async function loadPlugin() {
	const code = readFileSync(join(ROOT, "test/.build/main.js"), "utf8");
	const seen = { commands: [], views: [], settingTabs: [] };
	class Stub {
		constructor() {}
	}
	class Plugin {
		constructor(app, mf) {
			this.app = app;
			this.manifest = mf;
		}
		addCommand(c) {
			seen.commands.push(c);
			return c;
		}
		registerView(type, make) {
			seen.views.push({ type, make });
		}
		registerEvent() {}
		register() {}
		async loadData() {
			return null;
		}
		async saveData() {}
		addSettingTab(t) {
			seen.settingTabs.push(t);
		}
		addRibbonIcon() {
			return { remove() {} };
		}
	}
	class WorkspaceLeaf {
		setViewState() {}
	}
	// any other name the bundle takes from Obsidian is a class with nothing in it: the plugin builds views only when Obsidian asks
	const obsidian = new Proxy({ Plugin, WorkspaceLeaf }, { get: (o, k) => (k in o ? o[k] : (o[k] = class extends Stub {})) });
	const m = { exports: {} };
	new Function("module", "exports", "require", code)(m, m.exports, (name) => {
		assert.equal(name, "obsidian", "the release build asks for no module but obsidian");
		return obsidian;
	});
	const Main = m.exports.default ?? m.exports;
	const app = {
		workspace: { on: () => ({}), onLayoutReady() {}, getLeavesOfType: () => [], iterateAllLeaves() {} },
		vault: { on: () => ({}), getFileByPath: () => null },
		metadataCache: { on: () => ({}), getFileCache: () => null },
	};
	const plugin = new Main(app, manifest);
	await plugin.onload();
	return { plugin, seen };
}

test("the plugin's id, its command id and its view type are the ones the README says it keeps", async () => {
	assert.equal(manifest.id, "booklet", "the plugin's id names its folder in every vault and is the prefix of its command ids");
	const { seen } = await loadPlugin();
	assert.deepEqual(
		seen.commands.map((c) => c.id),
		["toggle-view"],
		"the commands: a new one may be added (then this list grows), but `toggle-view` stays as it is",
	);
	assert.deepEqual(
		seen.views.map((v) => v.type),
		["booklet"],
		"the view types",
	);
	assert.ok(seen.commands.every((c) => typeof c.name === "string" && c.name), "every command has a name");
	assert.equal(seen.settingTabs.length, 1, "the plugin has one settings tab (the sites media may load from); a setting changes how the view looks or which sites media loads from, and never what is written to a note");
});

test("the README lists the names that stay put", () => {
	const readme = readFileSync(join(ROOT, "README.md"), "utf8");
	const at = readme.indexOf("## What stays put");
	assert.ok(at >= 0, "the README has a section 'What stays put'");
	const section = readme.slice(at, readme.indexOf("\n## ", at + 5) < 0 ? undefined : readme.indexOf("\n## ", at + 5));
	for (const name of ["`toggle-view`", "`booklet`", "New commands may be added", "never what is written to a note", "not an API"]) assert.ok(section.includes(name), `the section names ${name}`);
	// the two custom properties promised are the ones listed, and the stylesheet defines both; the others are internal and not named
	const css = readFileSync(join(ROOT, "styles.css"), "utf8");
	const defined = new Set([...css.matchAll(/^\s*(--booklet[a-z0-9-]*)\s*:/gm)].map((x) => x[1]));
	const listed = [...new Set([...section.matchAll(/`(--booklet-[a-z0-9]+(?:-[a-z0-9]+)*)`/g)].map((x) => x[1]))].sort();
	assert.deepEqual(listed, ["--booklet-ch-bar", "--booklet-mx-text"]);
	for (const p of listed) assert.ok(defined.has(p), `${p} is listed but the stylesheet does not define it`);
	assert.ok(section.includes("other `--booklet-*` properties are internal"), "the section says the others are internal");
});

/* ---- a saved pane is read tolerantly ---- */

const TWO = `---\nbooklet: "0.18"\ntitle: Two\n---\n\n> [!activity|a] A\n\n> [!tab|t1] One\n\n> [!page|p1] First\n\nWords.\n\n***\n\nMore.\n\n> [!page|p2] Second\n\nOther words.\n\n> [!tab|t2] Two\n\nTwo words.\n\n> [!activity|b] B\n\nB words.\n`;

/** [name, saved state, the screen the pane opens on]: a state this release did not write opens the home screen (the note has two activities). */
const BAD = [
	["nothing", undefined, "home"],
	["null", null, "home"],
	["a string", "activity:/a", "home"],
	["a number", 7, "home"],
	["true", true, "home"],
	["an empty list", [], "home"],
	["a list", [1, "activity:/a"], "home"],
	["an empty object", {}, "home"],
	["a function", () => 1, "home"],
	["no screen", { version: 2, part: 0 }, "home"],
	["a screen that is a number", { version: 2, screen: 7, part: 0 }, "home"],
	["a screen that is null", { version: 2, screen: null }, "home"],
	["an empty screen", { version: 2, screen: "", part: 0 }, "home"],
	["a screen of an object", { version: 2, screen: { id: "a" } }, "home"],
	["no version", { screen: "activity:/a", part: 0 }, "home"],
	["a version in text", { version: "1", screen: "activity:/a", part: 0 }, "home"],
	["a version from the future", { version: 3, screen: "activity:/a", part: 0 }, "home"],
	["version zero", { version: 0, screen: "activity:/a", part: 0 }, "home"],
	["a version of null", { version: null, screen: "activity:/a" }, "home"],
	["an activity the note no longer has", { version: 2, screen: "activity:/gone", part: 2 }, "home"],
	["a module the note no longer has", { version: 2, screen: "module:gone", page: "p1", part: 0 }, "home"],
	["a part in text", { version: 2, screen: "activity:/a", part: "3" }, "activity:/a"],
	["a part past the end", { version: 2, screen: "activity:/a", part: 9999 }, "activity:/a"],
	["a negative part", { version: 2, screen: "activity:/a", part: -5 }, "activity:/a"],
	["a part that is not whole", { version: 2, screen: "activity:/a", part: 1.5 }, "activity:/a"],
	["a part that is not a number", { version: 2, screen: "activity:/a", part: NaN }, "activity:/a"],
	["an infinite part", { version: 2, screen: "activity:/a", part: Infinity }, "activity:/a"],
	["a part of null", { version: 2, screen: "activity:/a", part: null }, "activity:/a"],
	["a tab that is an object and a page that is a list", { version: 2, screen: "activity:/a", tab: {}, page: [], part: 0 }, "activity:/a"],
	["a tab the note no longer has", { version: 2, screen: "activity:/a", tab: "gone", part: 1 }, "activity:/a"],
	["a page the note no longer has", { version: 2, screen: "activity:/a", tab: "t1", page: "gone", part: 0 }, "activity:/a"],
	["a page that is a number", { version: 2, screen: "activity:/a", page: 12, part: 0 }, "activity:/a"],
	["a version 1 place", { version: 1, screen: "activity:/a", tab: "t1", part: 2 }, "home"],
	["fields no release wrote, beside a good place", { version: 2, screen: "activity:/a", tab: "t1", page: "p1", part: 1, scroll: 4, future: { x: [1] }, "": 0 }, "activity:/a"],
	["fields of another view, no place", { type: "markdown", mode: "source", file: "Two.booklet.md" }, "home"],
	["a file that is not a path, beside a good place", { file: 12, version: 2, screen: "activity:/a", part: 0 }, "activity:/a"],
];

for (const [name, state, screen] of BAD) {
	test(`a saved pane that is ${name} opens ${screen === "home" ? "the home screen" : "its activity"} and throws nothing`, async () => {
		const p = pane(TWO, { path: "Two.booklet.md", drawLater: true });
		await p.view.setState(state, {});
		p.draw();
		await p.settled();
		assert.equal(p.screen, screen);
		// what the pane then saves is a place this release wrote, whatever it was handed
		const saved = p.view.getState();
		assert.ok(saved && typeof saved === "object" && !Array.isArray(saved));
		assert.equal(typeof saved.file, "string");
		assert.ok(!("future" in saved) && !("scroll" in saved), "a field no release wrote is not carried forward");
		if (saved.screen !== undefined) assert.ok(saved.version === 2 && typeof saved.screen === "string" && Number.isInteger(saved.part) && saved.part >= 0, JSON.stringify(saved));
		p.close();
	});
}

test("a saved pane of an older shape opens the home screen; one with no page key counts every part of the tab", async () => {
	// a place of version 1 (releases 0.6.0 and 0.7.0) is not read: the pane opens as a note with no saved place does
	const old = pane(TWO, { path: "Two.booklet.md", state: { version: 1, screen: "activity:/a", tab: "t1", part: 2 } });
	await old.settled();
	assert.equal(old.screen, "home");
	old.close();
	// version 2 with no page key: `part` counts the parts of the whole tab (First has two parts, Second one)
	for (const [part, want] of [[0, "First"], [1, "First"], [2, "Second"]]) {
		const p = pane(TWO, { path: "Two.booklet.md", state: { version: 2, screen: "activity:/a", tab: "t1", part } });
		await p.settled();
		assert.equal(p.screen, "activity:/a");
		assert.deepEqual(p.pageTitles(), [want], `part ${part}`);
		p.close();
	}
	// with a page key, `part` is within that page
	const q = pane(TWO, { path: "Two.booklet.md", state: { version: 2, screen: "activity:/a", tab: "t1", page: "p2", part: 0 } });
	await q.settled();
	assert.deepEqual(q.pageTitles(), ["Second"]);
	q.close();
});

test("a bad state handed to a pane that already shows a note changes nothing and adds no step to Back and Forward", async () => {
	const p = pane(TWO, { path: "Two.booklet.md", state: { version: 2, screen: "activity:/a", tab: "t1", part: 2 } });
	await p.settled();
	const result = {};
	for (const bad of [null, "x", 7, [], { version: 2, screen: 7 }, { version: 3, screen: "home" }]) {
		await p.view.setState(bad, result);
		await sleep(1);
		assert.equal(p.screen, "activity:/a", `a ${JSON.stringify(bad)} left the pane where it was`);
	}
	assert.equal(result.history, undefined, "no step was added to Back and Forward");
	p.close();
});
