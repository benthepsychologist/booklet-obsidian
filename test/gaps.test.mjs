/*
 * Four small fixes in 0.5.0, each with a test that fails without it:
 *   gap 2  words typed in Add your own or a widget's field, not yet added, are kept through a reload and added when
 *          the note is next drawn, and added before the app quits (the view's saveTyped, which main.ts runs);
 *   gap 3  a listed label that holds a comma ("Calm, settled"), typed in a grid cell's field, is that item, one word;
 *   gap 7  today is taken when the view is drawn: a check-in left open past midnight keeps writing to the day it shows;
 *   gap 4  (answers of the wrong shape counted once among the note's problems) is in test/query.test.mjs.
 * Made-up notes only.
 */
import { window as w } from "./dom.mjs";
import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, core, norm } from "./helpers.mjs";

process.env.TZ = "UTC";

const { BookletView } = await import("./.build/view.mjs");

const CHECKIN = readFileSync(join(ROOT, "test-vault", "Check-in.booklet.md"), "utf8");
const DAILY = readFileSync(join(ROOT, "test-vault", "Daily tracker.booklet.md"), "utf8");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** An app with a vault holding one note, and a device store as Obsidian's saveLocalStorage keeps one. */
function appWith(text) {
	const disk = { text };
	const store = new Map();
	const app = {
		vault: {
			process: async (_file, fn) => {
				disk.text = fn(disk.text);
				return disk.text;
			},
			getName: () => "Made-up vault",
		},
		workspace: { iterateAllLeaves() {}, on: () => ({}), openLinkText: async () => {}, requestSaveLayout() {} },
		loadLocalStorage: (k) => (store.has(k) ? JSON.parse(store.get(k)) : null),
		saveLocalStorage: (k, d) => (d === null ? store.delete(k) : store.set(k, JSON.stringify(d))),
	};
	return { app, disk, store };
}

function openOn(env, path) {
	const view = new BookletView({ app: env.app }, { setMode: async () => {} });
	view.file = { path, basename: path.replace(/\.md$/, "") };
	view.load();
	if (path.startsWith("Check-in")) void view.setState({ version: 1, screen: "activity:day-check/today" }, {});
	view.setViewData(env.disk.text, true);
	return {
		view,
		settled: async (ms = 0) => {
			await sleep(ms + 30);
			await view.writes;
			await sleep(5);
		},
		/** The view goes away as a reload takes it: no field is left, nothing is written. */
		dropped() {
			view.containerEl.remove();
		},
		close() {
			view.unload();
			view.containerEl.remove();
		},
	};
}

const typeInto = (el, value) => {
	el.value = value;
	el.dispatchEvent(new w.Event("input", { bubbles: true }));
};
const press = (el, key) => el.dispatchEvent(new w.KeyboardEvent("keydown", { key, bubbles: true }));
const draftOf = (text) => norm(core.parseBooklet(text).records.drafts["day-check"]?.today ?? {});

/* ---- gap 2 ---- */

test("gap 2: words typed in Add your own and not added survive a reload: kept on the device as typed, and added when the note is next drawn", async () => {
	const env = appWith(CHECKIN);
	const one = openOn(env, "Check-in.booklet.md");
	const field = one.view.contentEl.querySelector('[data-booklet-q="where"] [data-booklet-key$="#own"]');
	assert.ok(field, "the where question's Add your own field");
	typeInto(field, "The library");
	assert.ok([...env.store.values()].some((v) => v.includes("The library")), "kept on the device as it is typed");
	// the reload: the page goes, with no blur and no write
	one.dropped();
	await sleep(20);
	assert.deepEqual(draftOf(env.disk.text), {}, "nothing was written before the reload");
	const two = openOn(env, "Check-in.booklet.md");
	await two.settled();
	assert.deepEqual(draftOf(env.disk.text).where, ["The library"], "added when the note is drawn again, as leaving the field adds it");
	assert.equal(env.store.size, 0, "and taken off the device once added");
	two.close();
});

test("gap 2: a widget field's words, typed and not added, survive a reload too", async () => {
	const env = appWith(CHECKIN);
	const one = openOn(env, "Check-in.booklet.md");
	const grid = one.view.contentEl.querySelectorAll('[data-booklet-activity="day-check/today"] .booklet-kind-widget')[1];
	const field = grid.querySelector('[data-booklet-key$="#own:soothing"]');
	assert.ok(field, "the soothing cell's Add your own field");
	typeInto(field, "Unhurried");
	one.dropped();
	const two = openOn(env, "Check-in.booklet.md");
	await two.settled();
	assert.deepEqual(draftOf(env.disk.text).feelings, ["x|soothing|Unhurried"]);
	two.close();
});

test("gap 2: before the app quits, saveTyped writes what was typed and adds the words not added yet", async () => {
	const env = appWith(CHECKIN);
	const v = openOn(env, "Check-in.booklet.md");
	typeInto(v.view.contentEl.querySelector('[data-booklet-q="where"] [data-booklet-key$="#own"]'), "A café");
	const lines = v.view.contentEl.querySelector('[data-booklet-q="thoughts"] input');
	typeInto(lines, "A made-up thought");
	await v.view.saveTyped();
	const d = draftOf(env.disk.text);
	// a lines question's draft holds the next, empty line as the field shows it (Finalize leaves blank lines out)
	assert.deepEqual([d.where, d.thoughts[0]], [["A café"], "A made-up thought"]);
	assert.equal(env.store.size, 0);
	v.close();
});

test("gap 2: words for a field the note no longer has stay on the device, and nothing is written", async () => {
	const env = appWith(CHECKIN);
	const one = openOn(env, "Check-in.booklet.md");
	typeInto(one.view.contentEl.querySelector('[data-booklet-q="where"] [data-booklet-key$="#own"]'), "Kept for later");
	one.dropped();
	const before = env.disk.text.replace("> [!multi|where open menu:spots] Where were you today?\n\n", "");
	env.disk.text = before;
	const two = openOn(env, "Check-in.booklet.md");
	await two.settled();
	assert.equal(env.disk.text, before, "nothing written");
	assert.equal(env.store.size, 1, "the words are still kept");
	two.close();
});

/* ---- gap 3 ---- */

test("gap 3: a listed label that holds a comma, typed whole in a grid cell's field, is that item, one word", () => {
	const g = core.gridOf({
		engine: "grid-select",
		cells: [{ id: "soothing", label: "Soothing" }],
		items: [
			{ id: "calm", cell: "soothing", label: "Calm, settled" },
			{ id: "content", cell: "soothing", label: "Content" },
		],
	});
	assert.deepEqual(core.gridAddOwn(g, [], "soothing", "Calm, settled"), ["calm"]);
	assert.deepEqual(core.gridAddOwn(g, [], "soothing", "calm,settled, Unhurried"), ["calm", "x|soothing|Unhurried"]);
	assert.deepEqual(core.gridAddOwn(g, [], "soothing", "Calm, Content"), ["x|soothing|Calm", "content"], "words that are not the label whole are split");
	assert.deepEqual(core.splitWords("Warm, tender, Sore", ["Warm, tender"]), ["Warm, tender", "Sore"]);
	assert.deepEqual(core.splitWords("a, b"), ["a", "b"]);
	const rg = core.regionsOf({ engine: "svg-regions", regions: [{ id: "chest", label: "Chest" }], senses: [{ id: "feel", words: [{ id: "warm-tender", label: "Warm, tender" }] }] });
	assert.deepEqual(norm(core.regionAddOwn(rg, [], "chest", "Warm, tender")), [{ id: "chest", s: ["warm-tender"] }]);
});

test("gap 3 in the view: \"Calm, settled\" typed in the cell's field and added is stored as the item", async () => {
	const env = appWith(CHECKIN.replace('"label": "Settled"', '"label": "Calm, settled"'));
	const v = openOn(env, "Check-in.booklet.md");
	const grid = v.view.contentEl.querySelectorAll('[data-booklet-activity="day-check/today"] .booklet-kind-widget')[1];
	const field = grid.querySelector('[data-booklet-key$="#own:soothing"]');
	field.focus();
	typeInto(field, "Calm, settled");
	press(field, "Enter");
	await v.settled();
	assert.deepEqual(draftOf(env.disk.text).feelings, ["settled"]);
	v.close();
});

/* ---- gap 7 ---- */

const DAY_ACT = `---
booklet: "0.16"
title: Days
---

> [!activity|day repeat daily] Each evening

> [!number|pages min:0] Pages read
`;

test("gap 7 (core): a daily Finalize past the drawn day's last moment keeps the entry on that day, replacing its entry, again and again", () => {
	const rule = { today: "2026-10-27", until: Date.parse("2026-10-27T23:59:59Z") };
	let t = core.finalizeDraft(core.setDraftAnswer(DAY_ACT, "", "day", "pages", 3), "", "day", { ts: "2026-10-27T20:00:00Z", rule }).text;
	let f = core.finalizeDraft(core.setDraftAnswer(t, "", "day", "pages", 5, rule), "", "day", { ts: "2026-10-28T00:05:00Z", rule });
	assert.deepEqual([f.replaced, f.entry.ts], [true, "2026-10-27T23:59:59Z"]);
	t = f.text;
	f = core.finalizeDraft(core.setDraftAnswer(t, "", "day", "pages", 6, rule), "", "day", { ts: "2026-10-28T00:07:00Z", rule });
	assert.deepEqual([f.replaced, f.entry.ts], [true, "2026-10-27T23:59:59Z"], "the replaced entry gives up its time");
	assert.deepEqual(
		norm(core.parseBooklet(f.text).records.entries[""].day),
		[{ ts: "2026-10-27T23:59:59Z", pages: 6 }],
	);
	// with no until (the drawn day not given), the moment decides, as before
	const g = core.finalizeDraft(core.setDraftAnswer(t, "", "day", "pages", 7), "", "day", { ts: "2026-10-28T00:05:00Z", rule: { today: "2026-10-28" } });
	assert.deepEqual([g.replaced, g.entry.ts], [false, "2026-10-28T00:05:00Z"]);
});

test("gap 7 (view): a check-in drawn before midnight and finalized after it keeps writing to the day it shows; drawn again on the new day, today moves", async () => {
	mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-10-25T23:58:00Z") });
	try {
		const env = appWith(DAILY);
		const v = openOn(env, "Daily tracker.booklet.md");
		const card = () => v.view.contentEl.querySelector('[data-booklet-activity="/evening-log"]');
		const seed = () => card().querySelector(".booklet-seed").textContent;
		assert.match(seed(), /^Showing today's entry/, "the 25th's entry is today's, drawn at 23:58");
		mock.timers.setTime(Date.parse("2026-10-26T00:03:00Z"));
		const clear = [...card().querySelectorAll('[data-booklet-q="sky"] button.booklet-choice')].find((b) => b.textContent.trim() === "Clear");
		clear.click();
		await v.settled();
		card().querySelector(".booklet-finalize").click();
		await v.settled();
		const kept = norm(core.parseBooklet(env.disk.text).records.entries[""]["evening-log"]);
		assert.equal(kept.length, 2, "the 25th's entry is replaced, not a new one added");
		assert.deepEqual([kept[1].ts, kept[1].sky], ["2026-10-25T23:59:59Z", 1]);
		// the window shown again on the new day: drawn again, and today is the 26th, with nothing kept yet
		w.dispatchEvent(new w.Event("focus"));
		assert.equal(seed(), "");
		v.close();
	} finally {
		mock.timers.reset();
	}
});
