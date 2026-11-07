/*
 * Acts on the rows of a data block, drawn and kept (format 0.19; SPEC section 5, "A question asked for each row" and "Editing a field in
 * place", and section 6, `readonly`), over a jsdom document and the made-up orchard dashboard: a field marked `edit` is its value until it
 * is pressed, then a box of its kind; Enter or leaving keeps ONE act `{ pick, a, was }` in a new kept entry of the `repeat` activity and
 * nothing else in the note changes; Esc keeps nothing; in an activity that does not repeat the field is its value; the three display
 * states after the data is read again; a refused write gives the reader's words back; words typed in a box survive the rows being drawn
 * again; a question asked for each row is drawn in a column and in a row's open part, and a row's Finalize keeps its pairs as one
 * entry; `readonly` per view; the names a screen reader hears; and what prints.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { openView, testApp, click, until, words, typeInto, press, window as w } from "./dom.mjs";
import { core, norm, assertOutsideUnchanged, fm, fence } from "./helpers.mjs";

process.env.TZ = "UTC";

const here = (f) => new URL(`./dashboards/${f}`, import.meta.url);
const ORCHARD = readFileSync(here("orchard-dashboard.booklet.md"), "utf8");
const FILE = readFileSync(here("orchard-dashboard.json"), "utf8");
const PATH = "orchard-dashboard.json";

/** The orchard note open on its screen, with the data file behind the vault's adapter and a way to change it and to refuse a write. */
async function orchard({ text = ORCHARD, file = FILE, screen = "activity:desk/orchard", queries = 4 } = {}) {
	const disk = { text, writes: 0 };
	const held = { text: file, mtime: 1 };
	const refuse = { next: 0 };
	const adapter = { read: async () => held.text, stat: async () => ({ size: held.text.length, mtime: held.mtime }) };
	const events = new Map();
	const app = testApp(disk, {
		vault: {
			adapter,
			on: (name, fn) => (events.set(name, fn), {}),
			process: async (_f, fn) => {
				if (refuse.next > 0) {
					refuse.next--;
					throw new Error("refused");
				}
				disk.writes++;
				disk.text = fn(disk.text);
				return disk.text;
			},
		},
	});
	const v = openView(text, { path: "Orchard.booklet.md", disk, app, screen });
	await v.settled();
	await until(() => v.view.contentEl.querySelectorAll(".booklet-query").length === queries && ![...v.view.contentEl.querySelectorAll(".booklet-q-quiet")].length, "the queries");
	await v.settled();
	return {
		...v,
		refuse,
		queries: () => [...v.view.contentEl.querySelectorAll(".booklet-query")],
		/** The data file as another program writes it again (`edit` changes the parsed JSON), then the pane is looked at again. */
		async rewrite(edit) {
			const json = JSON.parse(held.text);
			edit(json);
			held.text = JSON.stringify(json);
			held.mtime++;
			v.view.contentEl.ownerDocument.dispatchEvent(new w.Event("visibilitychange"));
			await v.settled();
			await sleepTick();
		},
		/** The kept entries of the orchard activity, as the note holds them now. */
		kept: () => core.parseBooklet(disk.text).records.entries["desk"]?.orchard ?? [],
		cell(q, key, pick) {
			return q.querySelector(`[data-booklet-edit="${key}"][data-booklet-pick="${pick}"]`);
		},
	};
}
const sleepTick = () => new Promise((r) => setTimeout(r, 20));
/** Press a cell's value, give the box these words and keep them with Enter. */
function change(cell, to) {
	click(cell.querySelector("button.booklet-edit-open"));
	const box = cell.querySelector(".booklet-edit-box");
	if (box.tagName === "SELECT") {
		box.value = to;
		box.dispatchEvent(new w.Event("change", { bubbles: true }));
	} else typeInto(box, to);
	press(box, "Enter");
}

/* ---- editing a field in place ---- */

test("a field marked edit is its value until pressed; pressing turns it into a box of its kind, and Enter keeps one act and no other byte changes", async () => {
	const v = await orchard();
	const [plots] = v.queries();
	const cell = v.cell(plots, "title", "p-orchard");
	assert.equal(cell.querySelector("button.booklet-edit-open").textContent.endsWith("Orchard"), true, "its value, on a button");
	assert.equal(cell.querySelector(".booklet-edit-box"), null, "no box yet");
	assert.equal(v.cell(plots, "stage", "p-orchard") !== null && v.cell(plots, "due", "p-orchard") !== null, true);
	assert.equal(plots.querySelector('[data-booklet-edit="kind"]'), null, "a field with no edit mark is only its value");
	click(cell.querySelector("button"));
	const box = cell.querySelector("input.booklet-edit-box");
	assert.equal(box.type, "text");
	assert.equal(box.value, "Orchard", "the box starts from the value");
	typeInto(box, "Old orchard");
	assert.equal(v.disk.writes, 0, "typing in the box writes nothing: it is not an act");
	press(box, "Enter");
	await v.settled();
	assert.equal(v.disk.writes, 1);
	const kept = v.kept();
	assert.equal(kept.length, 1, "one new entry");
	assert.deepEqual(Object.keys(kept[0]).sort(), ["title", "ts"]);
	assert.deepEqual(norm(kept[0].title), [{ pick: "p-orchard", a: "Old orchard", was: "Orchard" }], "one pair: the row, the new value, the value when the reader began");
	assertOutsideUnchanged(ORCHARD, v.disk.text, "kept");
	assert.equal(v.cell(plots, "title", "p-orchard").querySelector(".booklet-edit-box"), null, "the box is a value again");
	const card = words(v.view.contentEl.querySelector(".booklet-entry"));
	assert.match(card, /titlep-orchard: Old orchard \(was Orchard\)/, "the kept entry says the act in words: the field, the row, the new value and what it was");
	assert.doesNotMatch(card, /does not show yet/, "and does not call it a question this view does not show");
	assert.equal(words(v.cell(plots, "title", "p-orchard").querySelector(".booklet-edit-value")), "Old orchard");
	assert.equal(words(v.cell(plots, "title", "p-orchard").querySelector(".booklet-row-state")), "Sent, waiting to be applied.", "and says, in words, that it waits");
	v.close();
});

test("a second act on the same field is another entry; the first is not touched", async () => {
	const v = await orchard();
	const [plots] = v.queries();
	change(v.cell(plots, "title", "p-orchard"), "A");
	await v.settled();
	const first = v.disk.text;
	change(v.cell(v.queries()[0], "title", "p-orchard"), "B");
	await v.settled();
	const kept = v.kept();
	assert.equal(kept.length, 2);
	assert.deepEqual(norm(kept[1].title), [{ pick: "p-orchard", a: "B", was: "Orchard" }], "was is the data's value, which has not changed");
	// the records region before the second act is in the text after it, entry for entry
	assert.ok(v.disk.text.includes(first.slice(first.indexOf('{"items": [') + 11, first.indexOf("\n]}") )), "the first entry's bytes are kept");
	v.close();
});

test("Esc keeps nothing; leaving a box as it was found keeps nothing; leaving a changed box keeps it", async () => {
	const v = await orchard();
	const plots = v.queries()[0];
	let cell = v.cell(plots, "title", "p-orchard");
	click(cell.querySelector("button"));
	let box = cell.querySelector(".booklet-edit-box");
	typeInto(box, "Never kept");
	press(box, "Escape");
	await v.settled();
	assert.equal(v.disk.writes, 0, "Esc");
	assert.equal(words(cell).includes("Orchard"), true);
	assert.equal(cell.querySelector(".booklet-edit-box"), null);
	// Enter on the value it started from
	click(cell.querySelector("button"));
	press(cell.querySelector(".booklet-edit-box"), "Enter");
	await v.settled();
	assert.equal(v.disk.writes, 0, "the same words keep nothing");
	// leaving
	click(cell.querySelector("button"));
	box = cell.querySelector(".booklet-edit-box");
	typeInto(box, "Left changed");
	box.dispatchEvent(new w.FocusEvent("blur"));
	await v.settled();
	assert.equal(v.disk.writes, 1, "leaving the box keeps the change");
	assert.deepEqual(norm(v.kept()[0].title), [{ pick: "p-orchard", a: "Left changed", was: "Orchard" }]);
	v.close();
});

test("a choice, a date, a number and a long text are boxes of their kinds; a number is kept as a number", async () => {
	const text = ORCHARD.replace("fields: title, kind, stage, open, due, notes", "fields: title, kind, stage, open, due, about");
	const file = JSON.parse(FILE);
	file.plots.fields.open = { label: "Open jobs", edit: "number" };
	const v = await orchard({ text, file: JSON.stringify(file) });
	const plots = v.queries()[0];
	click(v.cell(plots, "stage", "p-orchard").querySelector("button"));
	const sel = v.cell(plots, "stage", "p-orchard").querySelector("select.booklet-edit-box");
	assert.ok(sel, "a choice is a select");
	const options = [...sel.options].map((o) => o.value);
	assert.ok(options.length >= 2 && options.includes("growing"), `its options: ${options}`);
	assert.equal(sel.value, "growing", "starts from the value");
	press(sel, "Escape");
	click(v.cell(plots, "due", "p-orchard").querySelector("button"));
	assert.equal(v.cell(plots, "due", "p-orchard").querySelector(".booklet-edit-box").type, "date");
	press(v.cell(plots, "due", "p-orchard").querySelector(".booklet-edit-box"), "Escape");
	change(v.cell(plots, "open", "p-orchard"), "7");
	await v.settled();
	assert.deepEqual(norm(v.kept()[0].open), [{ pick: "p-orchard", a: 7, was: 3 }], "a number is a number, and was is the number it was");
	click(v.cell(v.queries()[0], "about", "p-orchard").querySelector("button"));
	const long = v.cell(v.queries()[0], "about", "p-orchard").querySelector("textarea.booklet-edit-box");
	assert.ok(long, "a long text is a textarea");
	assert.equal(long.value, "Eight apple trees and two pear trees.\n\nThe pears were planted last spring and still need stakes.");
	press(long, "Escape");
	v.close();
});

test("in an activity that does not repeat, a field marked edit is its value and nothing more", async () => {
	const text = ORCHARD.replace("orchard repeat", "orchard");
	const v = await orchard({ text });
	const plots = v.queries()[0];
	assert.equal(plots.querySelectorAll("button.booklet-edit-open").length, 0, "no button to press");
	assert.equal(plots.querySelectorAll(".booklet-edit-box").length, 0);
	assert.ok(words(plots.querySelector("tbody tr")).includes("growing"), "the value is there");
	v.close();
});

/* ---- the display states, a refused act, and words that survive ---- */

test("after the data is read again: the value now (nothing marked), what was sent (marked waiting), or the value now with what was sent beneath", async () => {
	const v = await orchard();
	change(v.cell(v.queries()[0], "title", "p-orchard"), "Sent name");
	await v.settled();
	const mark = () => v.cell(v.queries()[0], "title", "p-orchard").querySelector(".booklet-row-state");
	assert.equal(mark().getAttribute("data-state"), "waiting", "the data still holds Orchard (was): waiting");
	await v.rewrite((j) => (j.plots.rows[0].title = "Sent name"));
	assert.equal(mark(), null, "the data holds what was sent: nothing is marked");
	assert.equal(words(v.cell(v.queries()[0], "title", "p-orchard").querySelector(".booklet-edit-value")), "Sent name");
	await v.rewrite((j) => (j.plots.rows[0].title = "Somebody else's"));
	assert.equal(mark().getAttribute("data-state"), "changed");
	const now = v.cell(v.queries()[0], "title", "p-orchard");
	assert.equal(words(now.querySelector(".booklet-edit-value")), "Somebody else's", "the value now");
	assert.equal(words(mark()), "You sent “Sent name”, but the value has changed since.", "with what was sent beneath, in words");
	assert.equal(v.disk.writes, 1, "reading again writes nothing");
	v.close();
});

test("a refused write keeps the reader's words in the box, and nothing is in the note", async () => {
	const v = await orchard();
	const plots = v.queries()[0];
	const cell = v.cell(plots, "title", "p-orchard");
	v.refuse.next = 1;
	change(cell, "Kept in the box");
	await v.settled();
	await sleepTick();
	assert.equal(v.disk.writes, 0);
	assert.equal(v.disk.text, ORCHARD);
	const box = v.cell(v.queries()[0], "title", "p-orchard").querySelector(".booklet-edit-box");
	assert.ok(box, "the box is back");
	assert.equal(box.value, "Kept in the box", "with the reader's words");
	press(box, "Enter");
	await v.settled();
	assert.equal(v.kept().length, 1, "and keeping again works");
	v.close();
});

test("words in an open box survive the rows being drawn again by a data file read, and are kept when the box is left", async () => {
	const v = await orchard();
	const cell = v.cell(v.queries()[0], "title", "p-orchard");
	click(cell.querySelector("button"));
	typeInto(cell.querySelector(".booklet-edit-box"), "Half typed");
	await v.rewrite((j) => (j.plots.rows[0].badge = "new badge"));
	const again = v.cell(v.queries()[0], "title", "p-orchard").querySelector(".booklet-edit-box");
	assert.ok(again, "the box is still open");
	assert.equal(again.value, "Half typed");
	assert.equal(v.disk.writes, 0, "and still not an act");
	press(again, "Enter");
	await v.settled();
	assert.deepEqual(norm(v.kept()[0].title), [{ pick: "p-orchard", a: "Half typed", was: "Orchard" }]);
	v.close();
});

/* ---- readonly ---- */

test("readonly is a line of the query: the roundup's cards hold values only; the table of the same rows is edited", async () => {
	const v = await orchard();
	const [plots, roundup] = v.queries();
	assert.ok(plots.querySelectorAll("button.booklet-edit-open").length > 0);
	assert.equal(roundup.querySelectorAll(".booklet-edit").length, 0, "no edit cell in a read-only view");
	assert.ok(words(roundup).includes("growing") && words(roundup).includes("2026-11-20"), "the values are drawn");
	v.close();
});

test("readonly: a, b locks those fields in a view and leaves the rest editable; a question named in the list is locked too", async () => {
	const text = ORCHARD.replace("fields: title, kind, stage, open, due, notes\n```", "fields: title, kind, stage, open, due, notes\nreadonly: stage, notes\n```");
	assert.notEqual(text, ORCHARD);
	const v = await orchard({ text });
	const plots = v.queries()[0];
	assert.equal(plots.querySelectorAll('[data-booklet-edit="stage"]').length, 0, "stage is a value");
	assert.ok(plots.querySelectorAll('[data-booklet-edit="title"] button').length > 0, "title is still edited");
	assert.ok(plots.querySelectorAll('[data-booklet-edit="due"] button').length > 0);
	const note = plots.querySelector('[data-booklet-q="notes"] textarea');
	assert.ok(note.disabled || note.readOnly || note.hasAttribute("readonly") || note.hasAttribute("disabled"), "a question in a locked column cannot be typed in");
	v.close();
});

/* ---- a question asked for each row ---- */

test("a question named in fields: is drawn in its column, one control for each row, headed by its title", async () => {
	const v = await orchard();
	const plots = v.queries()[0];
	const heads = [...plots.querySelectorAll("thead th")].map((x) => x.textContent);
	assert.equal(heads.at(-1), "A note for the gardener", "a name in fields: that is a question's id is the question: its column is headed by the question's title, not the label the data block gives that name");
	const boxes = plots.querySelectorAll('tr.booklet-q-trow [data-booklet-q="notes"] textarea');
	assert.equal(boxes.length, plots.querySelectorAll("tr.booklet-q-trow").length, "a control in every row that is drawn");
	const t = boxes[0];
	assert.ok(t.getAttribute("aria-labelledby"), "named for a screen reader");
	const names = t.getAttribute("aria-labelledby").split(" ").map((id) => words(plots.ownerDocument.getElementById(id))).join(" ");
	assert.match(names, /A note for the gardener.*\(Orchard\)/, "by the question's words and the row's");
	v.close();
});

test("typing in a column question is a draft, not an act; no pair is kept until Finalize", async () => {
	const v = await orchard();
	const plots = v.queries()[0];
	const t = plots.querySelector('[data-booklet-q="notes"][data-booklet-pick="p-orchard"] textarea');
	typeInto(t, "Check the stakes");
	t.dispatchEvent(new w.FocusEvent("blur"));
	await v.settled(400);
	assert.equal(v.kept().length, 0, "nothing is kept");
	const b = core.parseBooklet(v.disk.text);
	assert.deepEqual(norm(b.records.drafts["desk"]?.orchard?.notes), [{ pick: "p-orchard", a: "Check the stakes" }], "the draft holds the pair, with no was: the field is a list, so the note is added");
	v.close();
});

test("requests: a row opens to its questions; a choice replaces a value and an adding long text is added; Finalize keeps that row's pairs as one entry", async () => {
	const v = await orchard();
	const requests = v.queries()[3];
	const first = requests.querySelector("details");
	first.open = true;
	first.dispatchEvent(new w.Event("toggle"));
	const pick = first.getAttribute("data-id");
	const dec = first.querySelector('[data-booklet-q="decision"] button.booklet-choice');
	assert.ok(dec, "the choice is drawn in the open part");
	const fin = first.querySelector("button.booklet-row-finalize");
	assert.ok(fin && fin.disabled, "Finalize waits for something to keep");
	click(dec);
	await v.settled();
	const reply = first.querySelector('[data-booklet-q="reply"] textarea');
	typeInto(reply, "Hire one, this time");
	reply.dispatchEvent(new w.FocusEvent("blur"));
	await v.settled(400);
	assert.equal(v.kept().length, 0);
	assert.equal(first.querySelector("button.booklet-row-finalize").disabled, false);
	click(first.querySelector("button.booklet-row-finalize"));
	await v.settled();
	const kept = v.kept();
	assert.equal(kept.length, 1, "one entry");
	assert.deepEqual(norm(kept[0].decision.map((p) => p.pick)), [pick]);
	assert.deepEqual(Object.keys(kept[0].decision[0]).sort(), ["a", "pick"], "the field is a list, so the answer is added and has no was");
	assert.deepEqual(norm(kept[0].reply), [{ pick, a: "Hire one, this time" }], "an added note has no was");
	assertOutsideUnchanged(ORCHARD, v.disk.text, "finalized");
	assert.equal(core.parseBooklet(v.disk.text).records.drafts["desk"]?.orchard?.reply, undefined, "and is out of the draft");
	v.close();
});

test("a question is asked only of rows that carry a field with its id; of every row when none does", async () => {
	const file = JSON.parse(FILE);
	delete file.inbox.requests[1].reply;
	const v = await orchard({ file: JSON.stringify(file) });
	const requests = v.queries()[3];
	const ids = [...requests.querySelectorAll('[data-booklet-q="reply"]')].map((x) => x.getAttribute("data-booklet-pick"));
	assert.equal(ids.includes(file.inbox.requests[1].id), false, "no reply question on a request without a reply field");
	for (const d of requests.querySelectorAll("details")) {
		d.open = true;
		d.dispatchEvent(new w.Event("toggle"));
	}
	const after = [...requests.querySelectorAll('[data-booklet-q="reply"]')].map((x) => x.getAttribute("data-booklet-pick"));
	assert.equal(after.length, file.inbox.requests.length - 1);
	assert.equal([...requests.querySelectorAll('[data-booklet-q="decision"]')].length, file.inbox.requests.length);
	v.close();
});

/* ---- print and names ---- */

test("an edit cell's button is named by the field and the row; a waiting mark is text", async () => {
	const v = await orchard();
	const b = v.cell(v.queries()[0], "stage", "p-orchard").querySelector("button");
	assert.match(b.textContent, /^Edit Stage, Orchard: growing$/);
	assert.equal(b.getAttribute("type"), "button");
	click(b);
	const box = v.cell(v.queries()[0], "stage", "p-orchard").querySelector(".booklet-edit-box");
	const label = box.getAttribute("aria-labelledby");
	assert.equal(words(w.document.getElementById(label)), "Stage, Orchard");
	v.close();
});

test("print shows values, not boxes: the sheet hides the controls and shows each question's words", () => {
	const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
	const print = css.slice(css.indexOf("@media print"));
	assert.match(print, /\.booklet-print-value\s*\{[^}]*display:\s*block/);
	assert.match(print, /\.booklet-row-controls[^{]*\{[^}]*display:\s*none/);
	assert.match(print, /\.booklet-edit-open[^{]*\{[^}]*(border|background)/, "the edit button prints as plain text");
});

test("a space typed in a box inside a row's summary is the box's own: the browser's Space for the summary is cancelled, and a button keeps its Space", async () => {
	const v = await orchard();
	const plots = v.queries()[0];
	const cell = v.cell(plots, "title", "p-orchard");
	assert.ok(cell.closest("summary"), "the title is on the row's line");
	const btn = cell.querySelector("button");
	const up = (el) => {
		const evt = new w.KeyboardEvent("keyup", { key: " ", bubbles: true, cancelable: true });
		el.dispatchEvent(evt);
		return evt.defaultPrevented;
	};
	assert.equal(up(btn), false, "a press on a button is not touched");
	click(btn);
	assert.equal(up(cell.querySelector(".booklet-edit-box")), true, "a space let go in the box");
	press(cell.querySelector(".booklet-edit-box"), "Escape");
	v.close();
});
