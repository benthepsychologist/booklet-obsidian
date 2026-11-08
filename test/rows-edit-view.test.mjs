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
	const unwritable = { on: false };
	const written = { count: 0, reads: 0 };
	const adapter = {
		read: async () => (written.reads++, held.text),
		stat: async () => ({ size: held.text.length, mtime: held.mtime }),
		// the app's read-and-write step: a function that throws writes nothing; a file that cannot be written refuses
		process: async (_p, fn) => {
			if (unwritable.on) throw new Error("EACCES");
			const next = fn(held.text);
			held.text = next;
			held.mtime++;
			written.count++;
			return next;
		},
	};
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
		unwritable,
		written,
		/** The data file as it is on the disk now. */
		file: () => held.text,
		/** The data file changed by another program, byte for byte. */
		overwrite(text) {
			held.text = text;
			held.mtime++;
		},
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
	assert.equal(v.cell(plots, "title", "p-orchard").querySelector(".booklet-row-state"), null, "the plugin wrote the data file too, so the value stands alone (it said it was waiting before; see the apply tests below)");
	assert.equal(JSON.parse(v.file()).plots.rows[0].title, "Old orchard");
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
	assert.deepEqual(norm(kept[1].title), [{ pick: "p-orchard", a: "B", was: "A" }], "was is the data's value, which the first act wrote");
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

/* ---- the plugin writes the data file for an edit (docs/hosting.md, "Applying a reader's acts") ---- */

const said = () => globalThis.__bookletStubNotice.said;
const count = (text, word) => text.split(word).length - 1;

test("an edit is kept first and then written into the data file: the value's own text only, the read-only table follows, the cell shows the value alone", async () => {
	const v = await orchard();
	const before = v.file();
	const resting = count(words(v.queries()[1]), "resting");
	said().length = 0;
	const reads = v.written.reads;
	change(v.cell(v.queries()[0], "stage", "p-orchard"), "resting");
	await v.settled();
	await sleepTick();
	assert.deepEqual(norm(v.kept()[0].stage), [{ pick: "p-orchard", a: "resting", was: "growing" }], "the act is kept as before");
	assertOutsideUnchanged(ORCHARD, v.disk.text, "kept");
	const at = before.indexOf('"growing"', before.indexOf('"p-orchard"'));
	assert.equal(v.file(), before.slice(0, at) + '"resting"' + before.slice(at + '"growing"'.length), "every byte of the file is as it was, outside the value");
	assert.equal(v.written.count, 1, "one write");
	assert.equal(v.written.reads, reads, "and the file was not read again for it: the text written is the text the views draw");
	const cell = v.cell(v.queries()[0], "stage", "p-orchard");
	assert.equal(cell.querySelector(".booklet-row-state"), null, "no mark");
	assert.equal(words(cell.querySelector(".booklet-edit-value")), "resting");
	assert.equal(count(words(v.queries()[1]), "resting"), resting + 1, "the read-only roundup of the same rows shows the new value");
	assert.deepEqual(said(), ["Booklet: change kept and written to orchard-dashboard.json."]);
	v.close();
});

test("a number, an emptied number and a date are written as what they are", async () => {
	const file = JSON.parse(FILE);
	file.plots.fields.open = { label: "Open jobs", edit: "number" };
	const v = await orchard({ file: JSON.stringify(file) });
	change(v.cell(v.queries()[0], "open", "p-orchard"), "7");
	await v.settled();
	await sleepTick();
	assert.equal(JSON.parse(v.file()).plots.rows[0].open, 7);
	assert.ok(/"open":7,/.test(v.file()), "a JSON number, written where the 3 was");
	change(v.cell(v.queries()[0], "open", "p-orchard"), "");
	await v.settled();
	await sleepTick();
	assert.ok(/"open":null,/.test(v.file()), "an emptied number is null");
	assert.deepEqual(norm(v.kept()[1].open), [{ pick: "p-orchard", a: null, was: 7 }]);
	change(v.cell(v.queries()[0], "due", "p-orchard"), "2026-12-24");
	await v.settled();
	await sleepTick();
	assert.equal(JSON.parse(v.file()).plots.rows[0].due, "2026-12-24");
	v.close();
});

test("an edit of a nested row is written to that row", async () => {
	const v = await orchard();
	const first = v.queries()[0].querySelector("details");
	first.open = true;
	first.dispatchEvent(new w.Event("toggle"));
	const job = v.queries()[0].querySelector('[data-booklet-edit="title"][data-booklet-pick="j-prune"]');
	assert.ok(job, "the job row's title is an edit cell once its plot is open");
	change(job, "Prune the pears");
	await v.settled();
	await sleepTick();
	const json = JSON.parse(v.file());
	assert.equal(json.plots.rows[0].jobs[0].title, "Prune the pears");
	assert.equal(json.plots.rows[0].title, "Orchard");
	v.close();
});

test("a stale edit is kept but not written: the data was changed after the page drew, and the cell shows the value now with what was sent", async () => {
	const v = await orchard();
	const changedOutside = v.file().replace('"stage": "growing"', '"stage": "done"');
	assert.notEqual(changedOutside, v.file());
	v.overwrite(changedOutside);
	said().length = 0;
	change(v.cell(v.queries()[0], "stage", "p-orchard"), "resting");
	await v.settled();
	await sleepTick();
	await sleepTick();
	assert.equal(v.file(), changedOutside, "nothing was written");
	assert.equal(v.written.count, 0);
	assert.equal(v.kept().length, 1, "the entry is kept");
	assert.deepEqual(said(), ["Booklet: change kept, but not written to orchard-dashboard.json, because the data holds a different value now."]);
	const cell = v.cell(v.queries()[0], "stage", "p-orchard");
	assert.equal(words(cell.querySelector(".booklet-edit-value")), "done", "the value now");
	assert.equal(words(cell.querySelector(".booklet-row-state")), "You sent: resting", "with what was sent beneath");
	v.close();
});

test("a row that has left the file, and a file that cannot be written: kept, not written, and said in words; the cell waits", async () => {
	const v = await orchard();
	const gone = JSON.parse(v.file());
	gone.plots.rows.splice(0, 1);
	const goneText = JSON.stringify(gone, null, 2);
	v.overwrite(goneText);
	said().length = 0;
	change(v.cell(v.queries()[0], "title", "p-orchard"), "Late edit");
	await v.settled();
	await sleepTick();
	assert.equal(v.file(), goneText);
	assert.deepEqual(said(), ["Booklet: change kept, but not written to orchard-dashboard.json, because the row is no longer there."]);
	v.close();

	const w2 = await orchard();
	w2.unwritable.on = true;
	said().length = 0;
	const before = w2.file();
	change(w2.cell(w2.queries()[0], "title", "p-orchard"), "Cannot write");
	await w2.settled();
	await sleepTick();
	assert.equal(w2.file(), before);
	assert.equal(w2.kept().length, 1, "the act is kept, so nothing the reader did is lost");
	assert.deepEqual(said(), ["Booklet: change kept, but not written to orchard-dashboard.json, because the file cannot be written."]);
	assert.equal(w2.cell(w2.queries()[0], "title", "p-orchard").querySelector(".booklet-row-state").getAttribute("data-state"), "waiting", "the cell says it is waiting");
	w2.close();
});

test("a row's Finalize and a question's answer are only kept: nothing is written to the data file", async () => {
	const v = await orchard();
	const before = v.file();
	const first = v.queries()[3].querySelector("details");
	first.open = true;
	first.dispatchEvent(new w.Event("toggle"));
	click(first.querySelector('[data-booklet-q="decision"] button.booklet-choice'));
	await v.settled();
	click(first.querySelector("button.booklet-row-finalize"));
	await v.settled();
	await sleepTick();
	assert.equal(v.kept().length, 1);
	assert.equal(v.file(), before);
	assert.equal(v.written.count, 0);
	v.close();
});

test("rows written in the note itself are not a vault file: an edit is kept, nothing else is written, and the cell waits", async () => {
	const text = [
		"---",
		'booklet: "0.19"',
		"id: example/inline",
		"title: Inline",
		"lang: en",
		"---",
		"",
		"# Inline",
		"",
		"> [!module|desk] Desk",
		"",
		"> [!activity|orchard repeat] The desk",
		"",
		"```booklet query",
		"from: plots",
		"as: table",
		"fields: title",
		"```",
		"",
		"```booklet data",
		JSON.stringify({ fields: { title: { label: "Name", edit: "text" } }, rows: [{ id: "a", title: "One" }] }),
		"```",
		"^plots",
		"",
		"> [!module|desk end]",
		"",
	].join("\n");
	const v = await orchard({ text, queries: 1 });
	said().length = 0;
	change(v.cell(v.queries()[0], "title", "a"), "Two");
	await v.settled();
	await sleepTick();
	assert.equal(v.kept().length, 1);
	assert.equal(v.written.count, 0);
	assert.deepEqual(said(), ["Booklet: change kept."]);
	assert.equal(v.cell(v.queries()[0], "title", "a").querySelector(".booklet-row-state").getAttribute("data-state"), "waiting");
	v.close();
});

/* ---- the display states, a refused act, and words that survive ---- */

test("after the data is read again: the value now (nothing marked), what was sent (marked waiting), or the value now with what was sent beneath", async () => {
	const v = await orchard();
	// a file that cannot be written: the act is only kept, as when the data is somebody else's
	v.unwritable.on = true;
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
	assert.equal(words(mark()), "You sent: Sent name", "with what was sent beneath, in words");
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
	assert.equal(plots.querySelector('[data-booklet-q="notes"]'), null, "a locked question with no answer draws nothing: no title, no empty control");
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

test("an editable value is drawn as its value: the Paper look's pill leaves it out, the base reset names it, and a table counts a word, not a letter, as its least width", () => {
	const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
	const pill = css.split("\n").filter((l) => /data-booklet-look\^="paper"\] button[^{]*:where\(:not\(/.test(l));
	assert.ok(pill.length >= 4, "the Paper look's button rules are there");
	for (const l of pill) assert.match(l, /\.booklet-edit-open/, "each leaves the edit button out: " + l);
	const rule = css.slice(css.indexOf(".booklet-edit-open,\nbutton.booklet-edit-open"), css.indexOf(".booklet-edit-open:hover"));
	assert.match(rule, /border:\s*0;/);
	assert.match(rule, /min-height:\s*0;/);
	assert.match(rule, /overflow-wrap:\s*break-word;/, "not `anywhere`, which makes a table's cell as narrow as one letter");
	assert.doesNotMatch(rule, /overflow-wrap:\s*anywhere/);
	assert.match(rule, /background:\s*var\(--background-modifier-hover\)/, "a faint tint, not a pill");
	assert.match(css, /data-booklet-look\^="paper"\] \.booklet-edit-open \{[^}]*background:\s*color-mix\(in srgb, var\(--bk-brand-wash\)/, "the Paper look tints it with its own wash");
});

test("a table's lead cell keeps room for the disclosure triangle, so a top-level row's triangle is not clipped by the table's scroll box", () => {
	const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
	const rule = css.slice(css.indexOf(".booklet-q-lead {"), css.indexOf("}", css.indexOf(".booklet-q-lead {")));
	assert.match(rule, /padding-inline-start:\s*var\(--size-4-4\)/);
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

/* ---- the fix round: a half-typed number, a daily activity, a list value, the waiting mark, a row that goes, print ---- */

const Notice = globalThis.__bookletStubNotice;

/** A number box whose browser says the text typed is not a number (Chrome gives value "" and validity.badInput for "3e"). */
function badNumber(box, text) {
	Object.defineProperty(box, "validity", { configurable: true, value: { badInput: true } });
	Object.defineProperty(box, "value", { configurable: true, get: () => "", set: () => {} });
	box.__typed = text;
}
const numberOrchard = async (extra = {}) => {
	const file = JSON.parse(FILE);
	file.plots.fields.open = { label: "Open jobs", edit: "number" };
	return orchard({ file: JSON.stringify(file), ...extra });
};

test("a number box that holds text that is no number keeps nothing, stays open with a word, and only an empty box keeps null", async () => {
	const v = await numberOrchard();
	const cell = v.cell(v.queries()[0], "open", "p-orchard");
	click(cell.querySelector("button"));
	const box = cell.querySelector("input.booklet-edit-box");
	assert.equal(box.type, "number");
	badNumber(box, "3e");
	press(box, "Enter");
	await v.settled();
	assert.equal(v.disk.writes, 0, "nothing is kept for text that is not a number");
	const again = v.cell(v.queries()[0], "open", "p-orchard");
	assert.ok(again.querySelector("input.booklet-edit-box"), "the box stays open, with the reader's text in it");
	assert.match(words(again.querySelector(".booklet-row-state")), /not a number/i, "and says so in words");
	assert.equal(again.querySelector(".booklet-row-state").getAttribute("role"), "alert");
	v.close();
});

test("leaving the screen with number text that cannot be read keeps nothing, says so, and leaves nothing hanging", async () => {
	const v = await numberOrchard();
	const cell = v.cell(v.queries()[0], "open", "p-orchard");
	click(cell.querySelector("button"));
	badNumber(cell.querySelector("input.booklet-edit-box"), "1e999");
	Notice.said.length = 0;
	v.view.go({ screen: "home", tab: null, part: 0 });
	await v.settled();
	assert.equal(v.disk.writes, 0);
	assert.ok(Notice.said.some((x) => /not a number/.test(x)), JSON.stringify(Notice.said));
	assert.equal(v.view.sessions.size, 0);
	v.close();
});

test("an empty number box keeps null", async () => {
	const v = await numberOrchard();
	const cell = v.cell(v.queries()[0], "open", "p-orchard");
	click(cell.querySelector("button"));
	typeInto(cell.querySelector("input"), "");
	press(cell.querySelector("input"), "Enter");
	await v.settled();
	assert.deepEqual(norm(v.kept()[0].open), [{ pick: "p-orchard", a: null, was: 3 }], "an emptied box is an emptied value");
	v.close();
});

test("in a daily activity a field marked edit is its value only, and a question asked for each row is a draft with no was and no row Finalize", async () => {
	const text = ORCHARD.replace("orchard repeat", "orchard repeat daily");
	const v = await orchard({ text });
	const plots = v.queries()[0];
	assert.equal(plots.querySelectorAll("button.booklet-edit-open").length, 0, "no edit button");
	assert.ok(words(plots.querySelector("tbody tr")).includes("growing"), "the value is drawn");
	const t = plots.querySelector("[data-booklet-q='notes'][data-booklet-pick='p-orchard'] textarea");
	typeInto(t, "A daily note");
	t.dispatchEvent(new w.FocusEvent("blur"));
	await v.settled(400);
	assert.equal(v.kept().length, 0);
	assert.deepEqual(norm(core.parseBooklet(v.disk.text).records.drafts.desk.orchard.notes), [{ pick: "p-orchard", a: "A daily note" }]);
	const requests = v.queries()[3];
	const d0 = requests.querySelector("details");
	d0.open = true;
	d0.dispatchEvent(new w.Event("toggle"));
	assert.equal(d0.querySelector("button.booklet-row-finalize"), null, "a daily activity keeps one entry a day: no row Finalize");
	v.close();
});

test("a field marked edit whose value is a list is drawn as a list of words and is read-only", async () => {
	const file = JSON.parse(FILE);
	file.plots.fields.kind = { label: "Kind", edit: "text" };
	file.plots.rows[0].kind = ["Orchard", "Old"];
	const v = await orchard({ file: JSON.stringify(file) });
	const plots = v.queries()[0];
	assert.equal(plots.querySelector("[data-booklet-edit='kind'][data-booklet-pick='p-orchard']"), null, "no edit cell");
	assert.ok(words(plots.querySelector("tbody tr")).includes("Orchard") && words(plots.querySelector("tbody tr")).includes("Old"), "both words are drawn");
	v.close();
});

test("the waiting mark is tied to the edit button (described by it), and a kept edit is announced", async () => {
	const v = await orchard();
	v.unwritable.on = true;
	Notice.said.length = 0;
	change(v.cell(v.queries()[0], "title", "p-orchard"), "Described");
	await v.settled();
	assert.ok(Notice.said.some((x) => /change kept/i.test(x)), `announced: ${JSON.stringify(Notice.said)}`);
	const cell = v.cell(v.queries()[0], "title", "p-orchard");
	const b = cell.querySelector("button");
	const mark = cell.querySelector(".booklet-row-state");
	assert.ok(mark.id && b.getAttribute("aria-describedby") === mark.id, "the button is described by the mark");
	assert.equal(words(mark), "· sent, waiting");
	v.close();
});

test("a row taken out of the data while its box is open keeps the reader's words as an act at once and leaves nothing hanging", async () => {
	const v = await orchard();
	const cell = v.cell(v.queries()[0], "title", "p-orchard");
	click(cell.querySelector("button"));
	typeInto(cell.querySelector(".booklet-edit-box"), "Words of a row that went");
	await v.rewrite((j) => j.plots.rows.splice(0, 1));
	await v.settled();
	await sleepTick();
	const kept = v.kept();
	assert.equal(kept.length, 1, "kept at once");
	assert.deepEqual(norm(kept[0].title), [{ pick: "p-orchard", a: "Words of a row that went", was: "Orchard" }]);
	assert.equal(v.view.hasUnsaved(), false, "and nothing is left to write");
	assert.equal(v.view.sessions.size, 0);
	v.close();
});

test("an edit box open at print time prints its value as plain text, and the style sheet hides the box", async () => {
	const v = await orchard();
	const cell = v.cell(v.queries()[0], "title", "p-orchard");
	click(cell.querySelector("button"));
	typeInto(cell.querySelector(".booklet-edit-box"), "Typed and not kept");
	const printed = cell.querySelector(".booklet-edit-print");
	assert.ok(printed, "a plain copy of the box's words is there");
	assert.equal(printed.textContent, "Typed and not kept");
	const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
	const print = css.slice(css.indexOf("@media print"));
	assert.match(print, /\.booklet-edit-box[^{]*\{[^}]*display:\s*none/);
	assert.match(print, /\.booklet-edit-print[^{]*\{[^}]*display:\s*(inline|block)/);
	press(cell.querySelector(".booklet-edit-box"), "Escape");
	v.close();
});

test("a locked question that has an answer shows it as plain words, with no control; the adding history lists time then words, with no waiting words", async () => {
	const text = ORCHARD.replace("fields: asked, decision\n```", "fields: asked, decision\nreadonly: decision\n```");
	assert.notEqual(text, ORCHARD);
	const file = JSON.parse(FILE);
	file.inbox.requests[0].decision = "Yes";
	const v = await orchard({ text, file: JSON.stringify(file) });
	const requests = v.queries()[3];
	const locked = requests.querySelector("[data-booklet-q='decision'][data-booklet-pick='b-ladder']");
	assert.ok(locked, "the answered row draws it");
	assert.equal(locked.querySelectorAll("button, input, textarea, select").length, 0, "no control");
	assert.equal(words(locked.querySelector(".booklet-row-roval")), "Yes");
	assert.equal(requests.querySelector("[data-booklet-q='decision'][data-booklet-pick='b-hens']"), null, "a row with no answer draws nothing");
	v.close();
});

test("the history under an adding question reads time then words; the data's list items come first; nothing says waiting", async () => {
	const file = JSON.parse(FILE);
	file.inbox.requests[0].reply = ["An old reply"];
	const v = await orchard({ file: JSON.stringify(file) });
	const requests = v.queries()[3];
	const d0 = requests.querySelector("details");
	d0.open = true;
	d0.dispatchEvent(new w.Event("toggle"));
	const reply = d0.querySelector("[data-booklet-q='reply'] textarea");
	typeInto(reply, "A new reply");
	reply.dispatchEvent(new w.FocusEvent("blur"));
	await v.settled(400);
	click(d0.querySelector("button.booklet-row-finalize"));
	await v.settled();
	const items = [...v.queries()[3].querySelectorAll("[data-booklet-q='reply'][data-booklet-pick='b-ladder'] .booklet-row-history li")].map((x) => words(x));
	assert.equal(items.length, 2);
	assert.equal(items[0], "An old reply", "the data's own list first");
	assert.match(items[1], /^.+ · A new reply$/, "then the kept answer: its time, then its words");
	assert.ok(!items.join(" ").includes("waiting"));
	v.close();
});
