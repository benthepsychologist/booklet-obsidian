/*
 * The view's widgets, shared lists and openings, run in Node over a jsdom document (test/dom.mjs) on the test
 * vault's made-up check-in note, as view.test.mjs runs the other questions: presses and words go in through the
 * view's own buttons and fields, and what the note then holds is read back. A field for words of the reader's own
 * is never replaced by a change to the note while the reader is in it (the 0.1.0 rule), and keeps its words.
 */
import { window as w } from "./dom.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, core, norm } from "./helpers.mjs";

const { BookletView } = await import("./.build/view.mjs");

const NOTE = readFileSync(join(ROOT, "test-vault", "Check-in.booklet.md"), "utf8");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function open(text = NOTE) {
	const disk = { text };
	const app = {
		vault: {
			process: async (_file, fn) => {
				disk.text = fn(disk.text);
				return disk.text;
			},
		},
		workspace: { iterateAllLeaves() {}, on() {} },
	};
	const view = new BookletView({ app }, { setMode: async () => {} });
	view.file = { path: "Check-in.booklet.md", basename: "Check-in.booklet" };
	view.load();
	view.setViewData(text, true);
	const card = () => view.contentEl.querySelector('[data-booklet-activity="day-check/today"]');
	const widget = (n) => card().querySelectorAll(".booklet-kind-widget")[n];
	return {
		view,
		disk,
		card,
		grid: () => widget(1),
		places: () => widget(0),
		menu: () => card().querySelector(".booklet-kind-multi"),
		/** The note changed elsewhere: the vault holds the new text, and the view is handed it. */
		changed(edit) {
			disk.text = edit(disk.text);
			view.setViewData(disk.text, false);
		},
		/** The draft of today's check-in, as the vault holds it. */
		draft: () => norm(core.parseBooklet(disk.text).records.drafts["day-check"]?.today ?? {}),
		settled: async (ms = 0) => {
			await sleep(ms + 30);
			await view.writes;
			await sleep(5);
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
const button = (root, words) => {
	const b = [...root.querySelectorAll("button")].find((x) => x.textContent.trim() === words);
	assert.ok(b, `a button "${words}"`);
	return b;
};
const cell = (v, id) => v.grid().querySelector(`[data-booklet-cell="${id}"]`);
const prose = (word) => (t) => t.replace("There are no right answers here.", `There are no right answers here. ${word}`);
const storedDraft = (id, value) => (t) => core.setDraftAnswer(t, "day-check", "today", id, value, { today: core.localDay(new Date()) });

test("the grid: its cells in the widget's colours, its edge labels, and presses and words of the reader's own stored as booklet.html stores them", async () => {
	const v = open();
	const g = v.grid();
	assert.deepEqual([...g.querySelectorAll(".booklet-cell")].map((c) => [c.getAttribute("data-booklet-cell"), c.className]), [
		["stormy", "booklet-cell booklet-colour-warm"],
		["bright", "booklet-cell booklet-colour-green"],
		["overcast", "booklet-cell booklet-colour-slate"],
		["calm", "booklet-cell booklet-colour-teal"],
	]);
	assert.deepEqual([...g.querySelectorAll(".booklet-axis")].map((a) => a.textContent), ["more energy", "less pleasant", "more pleasant", "less energy"]);
	assert.equal(g.querySelector(".booklet-prompt").textContent, "What is the weather inside?");
	assert.equal(g.querySelector(".booklet-help").textContent, "Press the words that fit, in any of the four.");
	button(cell(v, "bright"), "Cheerful").click();
	button(cell(v, "stormy"), "Tense").click();
	button(cell(v, "bright"), "Lively").click();
	const field = cell(v, "bright").querySelector(".booklet-own-row input");
	field.focus();
	typeInto(field, "fizzy, cheerful");
	press(field, "Enter");
	await v.settled();
	// the cell's words are written again in the field's order (its items in the widget's order, then the reader's)
	assert.deepEqual(v.draft().weather, ["tense", "lively", "cheerful", "x|bright|fizzy"]);
	assert.equal(button(cell(v, "bright"), "Lively").getAttribute("aria-pressed"), "true");
	// the reader's own word is a pressed button in its cell; a press takes it out
	const own = cell(v, "bright").querySelector(".booklet-own");
	assert.equal(own.textContent, "fizzy");
	own.click();
	await v.settled();
	assert.deepEqual(v.draft().weather, ["tense", "lively", "cheerful"]);
	for (const x of ["Tense", "Lively", "Cheerful"]) button(v.grid(), x).click();
	await v.settled();
	assert.equal(v.draft().weather, undefined, "a grid with nothing pressed holds no answer");
	v.close();
});

test("the grid: a cell's field keeps its words while the note changes under it, and adds them to what the note then holds", async () => {
	const v = open();
	const field = cell(v, "calm").querySelector(".booklet-own-row input");
	field.focus();
	typeInto(field, "Unhurried");
	const before = v.card();
	v.changed((t) => storedDraft("weather", ["settled", "x|stormy|loud"])(prose("MARK-GRID")(t)));
	assert.ok(field.isConnected && w.document.activeElement === field, "the field the reader is in was replaced");
	assert.equal(field.value, "Unhurried");
	assert.equal(v.card(), before, "the view was drawn again while the reader was in a field");
	assert.equal(button(cell(v, "calm"), "Settled").getAttribute("aria-pressed"), "true", "the cell's buttons show the note's answer");
	press(field, "Enter");
	await v.settled();
	assert.deepEqual(v.draft().weather, ["x|stormy|loud", "settled", "x|calm|Unhurried"]);
	field.blur();
	await v.settled(50);
	assert.ok(v.view.contentEl.textContent.includes("MARK-GRID"), "after the reader left the field, the view is drawn again");
	v.close();
});

test("the places: no figure drawn; a place opened, its words pressed and added, the summary, and Clear", async () => {
	const v = open();
	const p = v.places();
	assert.ok(!p.querySelector("svg"), "no SVG is drawn");
	assert.deepEqual([...p.querySelectorAll(".booklet-place .booklet-words")].map((b) => b.textContent).slice(0, 4), ["Head", "Jaw", "Neck", "Shoulders"]);
	assert.equal(p.querySelector(".booklet-panel").textContent, "Press a place above to begin.");
	button(p, "Shoulders").click();
	assert.equal(p.querySelector(".booklet-panel-title").textContent, "Shoulders");
	button(p, "Tight").click();
	button(p, "Warm").click();
	const field = p.querySelector(".booklet-panel .booklet-own-row input");
	field.focus();
	typeInto(field, "achy, tight");
	press(field, "Enter");
	await v.settled();
	assert.deepEqual(v.draft().places, [{ id: "shoulders", s: ["tight", "warm", "achy"] }]);
	button(p, "Hands").click();
	const f2 = p.querySelector(".booklet-panel .booklet-own-row input");
	f2.focus();
	typeInto(f2, "Cool");
	press(f2, "Enter");
	await v.settled();
	assert.deepEqual(v.draft().places, [{ id: "shoulders", s: ["tight", "warm", "achy"] }, { id: "hands", s: ["cool"] }], "a sense word's label typed is stored as its id");
	assert.deepEqual([...p.querySelectorAll(".booklet-summary-row")].map((r) => r.textContent), ["Shoulders— Tight, Warm, achy", "Hands— Cool"]);
	// the reader's own word, as a pressed button in the panel: a press takes it out
	button(p, "Shoulders").click();
	p.querySelector(".booklet-own-words .booklet-own").click();
	await v.settled();
	assert.deepEqual(v.draft().places[0], { id: "shoulders", s: ["tight", "warm"] });
	button(p, "Clear this place").click();
	await v.settled();
	assert.deepEqual(v.draft().places, [{ id: "hands", s: ["cool"] }]);
	p.querySelector(".booklet-summary-x").click();
	await v.settled();
	assert.equal(v.draft().places, undefined);
	v.close();
});

test("the places: the field of the open place keeps its words while the note changes; leaving it adds them, and the view is drawn again with the place open", async () => {
	const v = open();
	button(v.places(), "Chest").click();
	const field = v.places().querySelector(".booklet-panel .booklet-own-row input");
	field.focus();
	typeInto(field, "Flutter");
	v.changed((t) => storedDraft("places", [{ id: "chest", s: ["heavy"] }])(prose("MARK-PLACES")(t)));
	assert.ok(field.isConnected && w.document.activeElement === field, "the field the reader is in was replaced");
	assert.equal(field.value, "Flutter");
	assert.equal(button(v.places(), "Heavy").getAttribute("aria-pressed"), "true", "the panel shows the note's answer");
	field.blur();
	await v.settled(50);
	assert.ok(v.view.contentEl.textContent.includes("MARK-PLACES"));
	// leaving the field added its words to what the note then held; drawn again, the same place is open
	assert.deepEqual(v.draft().places, [{ id: "chest", s: ["heavy", "Flutter"] }]);
	assert.equal(v.places().querySelector(".booklet-panel-title").textContent, "Chest");
	const again = v.places().querySelector(".booklet-panel .booklet-own-row input");
	assert.notEqual(again, field);
	assert.equal(again.value, "");
	assert.deepEqual([...v.places().querySelectorAll(".booklet-own-words .booklet-own")].map((b) => b.textContent), ["Flutter"]);
	v.close();
});

test("a shared list's options are drawn, and its answer is a position in the menu; the openings are drawn", async () => {
	const v = open();
	button(v.menu(), "Outdoors").click();
	button(v.menu(), "At home").click();
	await v.settled();
	assert.deepEqual(v.draft().where, [3, 1]);
	const text = v.view.contentEl.textContent;
	assert.ok(text.includes("A made-up check-in for testing the Booklet plugin."), "the booklet's opening");
	assert.ok(text.includes("Four short questions about the day"), "the module's opening");
	assert.ok(!text.includes("# Check-in"), "the heading that repeats the title is drawn once, as the title");
	assert.equal(v.view.contentEl.querySelector(".booklet-booklet-title").textContent, "Check-in");
	assert.ok(!/Not yet supported: the opening/.test(text));
	v.close();
});

test("Finalize keeps the widgets' answers, and the kept entry shows them in words", async () => {
	const v = open();
	button(cell(v, "overcast"), "Tired").click();
	button(v.places(), "Feet").click();
	button(v.places(), "Restless").click();
	await v.settled();
	button(v.card(), "Finalize").click();
	await v.settled();
	const e = core.parseBooklet(v.disk.text).records.entries["day-check"].today[0];
	assert.deepEqual(norm([e.weather, e.places]), [["tired"], [{ id: "feet", s: ["restless"] }]]);
	const shown = [...v.card().querySelectorAll(".booklet-entry dd")].map((d) => d.textContent);
	assert.deepEqual(shown, ["Feet — Restless", "Tired"]);
	v.close();
});

test("with the note open as Markdown, a saved text older than that pane's editor is not taken back, and a change the pane takes in later is followed", async () => {
	const { MarkdownView } = await import("./obsidian-stub.mjs");
	const file = { path: "Check-in.booklet.md", basename: "Check-in.booklet" };
	// the Markdown pane of the same note: the view writes into its editor
	let buffer = NOTE;
	const md = Object.assign(new MarkdownView(), {
		file,
		editor: {
			getValue: () => buffer,
			offsetToPos: (n) => n,
			replaceRange(text, from, to) {
				buffer = buffer.slice(0, from) + text + buffer.slice(to);
			},
		},
	});
	const listeners = [];
	const app = {
		vault: {
			process: async () => {
				throw new Error("with a Markdown pane open, the view writes into its editor");
			},
		},
		workspace: { iterateAllLeaves: (fn) => fn({ view: md }), on: (name, cb) => (listeners.push([name, cb]), {}) },
	};
	const view = new BookletView({ app }, { setMode: async () => {} });
	view.file = file;
	view.load();
	view.setViewData(NOTE, true);
	const grid = () => view.contentEl.querySelectorAll('[data-booklet-activity="day-check/today"] .booklet-kind-widget')[1];
	const cellOf = (id) => grid().querySelector(`[data-booklet-cell="${id}"]`);
	const weather = () => norm(core.parseBooklet(buffer).records.drafts["day-check"]?.today?.weather);
	button(cellOf("stormy"), "Tense").click();
	button(cellOf("bright"), "Cheerful").click();
	await view.writes;
	// the Markdown pane saves here (as it loses focus), and the press on Lively lands in its editor before the
	// saved text is handed to the view
	const saved = buffer;
	button(cellOf("bright"), "Lively").click();
	await view.writes;
	view.setViewData(saved, false);
	assert.equal(view.getViewData(), buffer, "the view took the saved text, older than the editor's");
	assert.equal(button(cellOf("bright"), "Lively").getAttribute("aria-pressed"), "true");
	const field = cellOf("bright").querySelector(".booklet-own-row input");
	field.focus();
	typeInto(field, "fizzy");
	press(field, "Enter");
	await view.writes;
	assert.deepEqual(weather(), ["tense", "lively", "cheerful", "x|bright|fizzy"], "the press on Lively was taken back");
	field.blur();
	// a change made to the file elsewhere is handed to the view before the Markdown pane takes it into its editor
	const changed = prose("MARK-ELSEWHERE")(buffer);
	view.setViewData(changed, false);
	assert.ok(!view.contentEl.textContent.includes("MARK-ELSEWHERE"));
	buffer = changed;
	for (const [name, cb] of listeners) if (name === "editor-change") cb(md.editor, md);
	await sleep(20);
	assert.equal(view.getViewData(), changed);
	assert.ok(view.contentEl.textContent.includes("MARK-ELSEWHERE"), "the change, once in the Markdown pane's editor, is drawn");
	view.unload();
	view.containerEl.remove();
});

test("readonly: a grid shows its words and the body widget names its places from `regions`, with nothing to press; describe lists the notes; a figure is a line saying it is not drawn", () => {
	const text = NOTE.replace("> [!widget|places] Where", "> [!widget|places readonly] Where")
		.replace("> [!widget|weather] What", "> [!widget|weather readonly describe] What")
		.replace('"chips": [', '"figures": [{ "id": "front", "svg": "<svg></svg>" }],\n  "chips": [');
	const v = open(text);
	v.changed((t) => storedDraft("weather", ["tired", "x|calm|Unhurried"])(t));
	const p = v.places(), g = v.grid();
	assert.equal(p.querySelectorAll("button").length, 0, "nothing to press in the places");
	assert.deepEqual([...p.querySelectorAll(".booklet-word")].map((x) => x.textContent), ["Head", "Jaw", "Neck", "Shoulders", "Chest", "Arms", "Hands", "Stomach", "Back", "Legs", "Feet"]);
	assert.ok(p.textContent.includes("Not yet supported: drawing the widget's figure."));
	assert.ok(!p.querySelector("svg"), "no figure is drawn");
	assert.equal(g.querySelectorAll("button, input").length, 0, "nothing to press or type in the grid");
	assert.deepEqual([...cell(v, "calm").querySelectorAll(".booklet-word")].map((x) => x.textContent), ["Settled", "Content", "Unhurried"]);
	assert.deepEqual([...g.querySelectorAll(".booklet-note")].map((x) => x.textContent), [
		"Stormy Lots of energy, and not pleasant.",
		"Bright Lots of energy, and pleasant.",
		"Overcast Little energy, and not pleasant.",
		"Calm Little energy, and pleasant.",
	]);
	v.close();
});

/* ---- words of the reader's own are added when the field is left, as booklet.html's tag field adds them ---- */

/** A press on `target` while the reader is in `field`: the pointer goes down, the field is left, the pointer comes up,
 * the click. Says whether the button pressed was still in the page for its click. */
function pressFrom(field, target) {
	target.dispatchEvent(new w.Event("pointerdown", { bubbles: true }));
	field.blur();
	w.document.dispatchEvent(new w.Event("pointerup", { bubbles: true }));
	const there = target.isConnected;
	target.click();
	return there;
}
const typeOnly = (field, words) => {
	field.focus();
	typeInto(field, words);
};

test("own words: leaving the field adds what was typed in it, in a grid cell and in a place", async () => {
	const v = open();
	const f = cell(v, "bright").querySelector(".booklet-own-row input");
	typeOnly(f, "fizzy, zingy");
	f.blur();
	await v.settled();
	assert.deepEqual(v.draft().weather, ["x|bright|fizzy", "x|bright|zingy"]);
	assert.equal(f.value, "", "the field is emptied");
	assert.notEqual(w.document.activeElement, f, "and not focused again");
	button(v.places(), "Neck").click();
	const pf = v.places().querySelector(".booklet-panel .booklet-own-row input");
	typeOnly(pf, "stiff");
	pf.blur();
	await v.settled();
	assert.deepEqual(v.draft().places, [{ id: "neck", s: ["stiff"] }]);
	// leaving an empty field adds nothing
	const before = v.disk.text;
	typeOnly(pf, "   ");
	pf.blur();
	await v.settled();
	assert.equal(v.disk.text, before);
	v.close();
});

test("own words: a press that leaves the field lands after the words are added, as in booklet.html", async () => {
	const v = open();
	// the grid: Tense, then fizzy typed in Bright, then Settled pressed in Calm
	button(cell(v, "stormy"), "Tense").click();
	const f = cell(v, "bright").querySelector(".booklet-own-row input");
	typeOnly(f, "fizzy");
	assert.ok(pressFrom(f, button(cell(v, "calm"), "Settled")));
	await v.settled();
	assert.deepEqual(v.draft().weather, ["tense", "x|bright|fizzy", "settled"]);
	// a place: Tight, then achy typed, then Warm pressed in the same panel
	button(v.places(), "Shoulders").click();
	button(v.places(), "Tight").click();
	let pf = v.places().querySelector(".booklet-panel .booklet-own-row input");
	typeOnly(pf, "achy");
	assert.ok(pressFrom(pf, button(v.places(), "Warm")));
	await v.settled();
	assert.deepEqual(v.draft().places, [{ id: "shoulders", s: ["tight", "achy", "warm"] }]);
	// another place: Cool, then numb typed, then Clear this place
	button(v.places(), "Hands").click();
	button(v.places(), "Cool").click();
	pf = v.places().querySelector(".booklet-panel .booklet-own-row input");
	typeOnly(pf, "numb");
	assert.ok(pressFrom(pf, button(v.places(), "Clear this place")));
	await v.settled();
	assert.deepEqual(v.draft().places, [{ id: "shoulders", s: ["tight", "achy", "warm"] }]);
	v.close();
});

test("own words: the button under a press is kept until its click, though leaving the field changed what it shows", async () => {
	const v = open();
	const f = cell(v, "bright").querySelector(".booklet-own-row input");
	typeOnly(f, "zest");
	press(f, "Enter");
	await v.settled();
	// typing in the field again, then pressing out the word already there: adding fizzy would draw the cell's own words
	// again, which waits for the click
	typeOnly(f, "fizzy");
	const zest = cell(v, "bright").querySelector(".booklet-own");
	assert.ok(pressFrom(f, zest), "the pressed word was taken out of the page before its click");
	await v.settled();
	assert.deepEqual(v.draft().weather, ["x|bright|fizzy"]);
	assert.deepEqual([...cell(v, "bright").querySelectorAll(".booklet-own")].map((b) => b.textContent), ["fizzy"]);
	// the same for the summary's x, after typing in the open place's field
	button(v.places(), "Hands").click();
	button(v.places(), "Cool").click();
	button(v.places(), "Shoulders").click();
	const pf = v.places().querySelector(".booklet-panel .booklet-own-row input");
	typeOnly(pf, "achy");
	const xHands = [...v.places().querySelectorAll(".booklet-summary-row")].find((r) => r.textContent.startsWith("Hands")).querySelector(".booklet-summary-x");
	assert.ok(pressFrom(pf, xHands), "the summary's x was taken out of the page before its click");
	await v.settled();
	assert.deepEqual(v.draft().places, [{ id: "shoulders", s: ["achy"] }]);
	v.close();
});

test("own words: Add after the field is left by its own press adds them once", async () => {
	const v = open();
	let writes = 0;
	const process = v.view.app.vault.process;
	v.view.app.vault.process = (file, fn) => {
		writes++;
		return process(file, fn);
	};
	const f = cell(v, "bright").querySelector(".booklet-own-row input");
	typeOnly(f, "fizzy");
	const add = cell(v, "bright").querySelector(".booklet-add");
	assert.ok(pressFrom(f, add));
	await v.settled();
	assert.deepEqual(v.draft().weather, ["x|bright|fizzy"]);
	assert.equal(writes, 1, "one write: leaving the field added the words, and Add found the field empty");
	assert.equal(w.document.activeElement, f, "Add puts the reader back in the field");
	v.close();
});

test("own words typed and not added: Finalize keeps them, and so does the view letting go of the note", async () => {
	const v = open();
	button(cell(v, "overcast"), "Tired").click();
	const f = cell(v, "overcast").querySelector(".booklet-own-row input");
	typeOnly(f, "drowsy");
	button(v.card(), "Finalize").click();
	await v.settled();
	const e = core.parseBooklet(v.disk.text).records.entries["day-check"].today[0];
	assert.deepEqual(norm(e.weather), ["tired", "x|overcast|drowsy"]);
	v.close();

	const u = open();
	button(u.places(), "Feet").click();
	const pf = u.places().querySelector(".booklet-panel .booklet-own-row input");
	typeOnly(pf, "sore");
	await u.view.onUnloadFile(u.view.file);
	assert.deepEqual(u.draft().places, [{ id: "feet", s: ["sore"] }]);
	// the field is emptied, so leaving it afterwards adds nothing more
	const before = u.disk.text;
	pf.blur();
	await u.settled();
	assert.equal(u.disk.text, before);
	u.close();
});
