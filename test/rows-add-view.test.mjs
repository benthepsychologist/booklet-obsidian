/*
 * Adding and removing rows, drawn and kept (SPEC section 5, "Adding and removing rows"), over a jsdom document: an Add button and the form it
 * opens, Add under a row, a Remove with its question, what is shown while the data has not followed the entry (sent, waiting / removing,
 * waiting / changed since), the reader's words when the data cannot take the act, the quiet line for a format that cannot be read, and the
 * places the controls are not offered (a locked view, a daily activity, a plain list). Both kinds of data are covered: rows in a block
 * written in the note, and rows in a file of the vault. Made-up garden rows only.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { openView, testApp, click, until, words, typeInto, press, window as w } from "./dom.mjs";
import { core, assertOutsideUnchanged } from "./helpers.mjs";

process.env.TZ = "UTC";

const DATA = {
	fields: { title: { label: "Name", edit: "text" }, stage: { label: "Stage", edit: "choice", options: ["planning", "growing"] }, size: { label: "Size", edit: "number" }, jobs: "Jobs" },
	idFormat: "j-{n}",
	rows: [
		{ id: "j-1", title: "Prune", stage: "growing", jobs: [{ id: "j-2", title: "Ladder" }, { id: "j-3", title: "Burn" }] },
		{ id: "j-4", title: "Stakes", stage: "planning" },
	],
};
const FRONT = ["---", 'booklet: "0.19"', "id: example/garden", "title: Garden", "lang: en", "---", "", "# Garden", "", "> [!module|desk] Desk", ""];
const note = ({ head = "repeat", query = "from: jobs\nas: table\nfields: title, stage\nadd\ndelete", data = DATA, file = false } = {}) =>
	[
		...FRONT,
		`> [!activity|work ${head}] Work`,
		"",
		"```booklet query",
		query,
		"```",
		"",
		...(file ? ["```booklet data garden.json", "```"] : ["```booklet data", JSON.stringify(data), "```"]),
		"^jobs",
		"",
		"> [!module|desk end]",
		"",
	].join("\n");

const said = () => globalThis.__bookletStubNotice.said;
const tick = () => new Promise((r) => setTimeout(r, 20));

/** The note open on its screen; with `file`, the rows are in a vault file behind the adapter, which a test can change or refuse. */
async function garden(text, { file = null } = {}) {
	const disk = { text, writes: 0 };
	const held = { text: file, mtime: 1 };
	const unwritable = { on: false };
	const adapter = {
		read: async () => held.text,
		stat: async () => ({ size: held.text.length, mtime: held.mtime }),
		process: async (_p, fn) => {
			if (unwritable.on) throw new Error("EACCES");
			held.text = fn(held.text);
			held.mtime++;
			return held.text;
		},
	};
	const app = testApp(disk, { vault: { adapter, on: () => ({}), process: async (_f, fn) => (disk.writes++, (disk.text = fn(disk.text))) } });
	const v = openView(text, { path: "Garden.booklet.md", disk, app, screen: "activity:desk/work" });
	await v.settled();
	await until(() => v.view.contentEl.querySelector(".booklet-query") && !v.view.contentEl.querySelector(".booklet-q-quiet"), "the query");
	await v.settled();
	said().length = 0;
	return {
		...v,
		unwritable,
		file: () => held.text,
		overwrite(text) {
			held.text = text;
			held.mtime++;
		},
		q: () => v.view.contentEl.querySelector(".booklet-query"),
		kept: () => core.parseBooklet(disk.text).records.entries["desk"]?.work ?? [],
		rows: () => JSON.parse(held.text ?? "null") ?? null,
		/** What the reader sees of the data, in words, row by row (the first cell of each row of the table). */
		names: () =>
			[...v.view.contentEl.querySelectorAll("tbody tr")].filter((tr) => !tr.matches(".booklet-q-trmore, .booklet-q-grouprow")).map((tr) => {
				const lead = tr.querySelector("td").cloneNode(true);
				lead.querySelectorAll(".booklet-sr").forEach((x) => x.remove());
				return words(lead);
			}),
		/** A row's disclosure opened, as the reader opens it. */
		openRow(id) {
			const d = v.view.contentEl.querySelector(`details[data-id="${id}"]`);
			d.open = true;
			d.dispatchEvent(new w.Event("toggle"));
		},
		async after() {
			await v.settled();
			await tick();
			await v.settled();
		},
	};
}
const open = (v, into) => click((into ?? v.q()).querySelector(".booklet-row-add-open"));
const box = (v, label) => [...v.q().querySelectorAll(".booklet-row-addfield")].find((f) => words(f.querySelector("label")) === label)?.querySelector("input, select, textarea");
const blockRows = (v) => core.parseBooklet(v.disk.text).data[0].rows;

/* ---- the controls ---- */

test("a view that says add and delete in a repeating activity draws an Add button, and a Remove on each row", async () => {
	const v = await garden(note());
	assert.equal(words(v.q().querySelector(".booklet-row-add-open")), "Add a row");
	assert.equal(v.q().querySelectorAll(".booklet-row-remove-open").length, 2, "one on each top row");
	assert.deepEqual([...v.q().querySelectorAll(".booklet-row-remove-open")].map((b) => words(b)), ["Remove Prune", "Remove Stakes"], "each is described by its row");
	assert.equal(v.q().querySelector("th.booklet-q-act") !== null, true, "the table has a column of its own for them");
	v.close();
});

test("no controls without the keys, under a bare readonly, in an activity that does not repeat, or in a daily one", async () => {
	for (const [what, text] of [
		["no keys", note({ query: "from: jobs\nas: table\nfields: title" })],
		["readonly", note({ query: "from: jobs\nas: table\nfields: title\nadd\ndelete\nreadonly" })],
		["not a repeat", note({ head: "" })],
		["daily", note({ head: "repeat daily" })],
	]) {
		const v = await garden(text);
		assert.equal(v.q().querySelector(".booklet-row-add, .booklet-row-remove, .booklet-q-act"), null, what);
		v.close();
	}
});

test("only add: no Remove column; only delete: no Add button", async () => {
	const a = await garden(note({ query: "from: jobs\nas: table\nfields: title\nadd" }));
	assert.equal(a.q().querySelector(".booklet-row-remove, th.booklet-q-act"), null);
	assert.notEqual(a.q().querySelector(".booklet-row-add-open"), null);
	a.close();
	const d = await garden(note({ query: "from: jobs\nas: table\nfields: title\ndelete" }));
	assert.equal(d.q().querySelector(".booklet-row-add"), null);
	assert.equal(d.q().querySelectorAll(".booklet-row-remove-open").length, 2);
	d.close();
});

test("a list and cards offer them too, in the row's own place", async () => {
	for (const as of ["list", "cards"]) {
		const v = await garden(note({ query: `from: jobs\nas: ${as}\nlabel: title\nadd\ndelete` }));
		assert.notEqual(v.q().querySelector(".booklet-row-add-open"), null, as);
		assert.ok(v.q().querySelectorAll(".booklet-row-remove-open").length >= 2, as);
		v.close();
	}
});

test("a format that cannot be read draws one quiet line instead of the Add button, and Remove stays", async () => {
	const v = await garden(note({ data: { ...DATA, idFormat: "j-{nope}" } }));
	assert.equal(v.q().querySelector(".booklet-row-add-open"), null);
	const quiet = v.q().querySelector(".booklet-row-add-quiet");
	assert.ok(quiet && words(quiet).length > 10, "a line that says why");
	assert.equal(v.q().querySelectorAll(".booklet-row-remove-open").length, 2);
	v.close();
});

/* ---- adding ---- */

test("Add opens a form with a box for each editable field, in the query's order; Esc and Cancel close it and write nothing", async () => {
	const v = await garden(note({ query: "from: jobs\nas: table\nfields: title, stage, size\nadd" }));
	open(v);
	const form = v.q().querySelector(".booklet-row-addform");
	assert.equal(form.getAttribute("role"), "group");
	assert.deepEqual([...form.querySelectorAll("label")].map((l) => words(l)), ["Name", "Stage", "Size"]);
	assert.equal(form.querySelector('input[type="number"]') !== null, true, "a number is a number box");
	assert.equal(form.querySelector("select") !== null, true, "a choice is a select");
	assert.equal(form.querySelector(".booklet-row-addmsg").getAttribute("role"), "alert");
	typeInto(box(v, "Name"), "typed");
	press(form, "Escape");
	assert.equal(v.q().querySelector(".booklet-row-addform"), null, "Esc closes it");
	open(v);
	assert.equal(box(v, "Name").value, "", "and what was typed is gone");
	click(v.q().querySelector(".booklet-row-add-cancel"));
	assert.equal(v.q().querySelector(".booklet-row-addform"), null, "Cancel closes it");
	assert.equal(v.disk.writes, 0);
	assert.equal(v.kept().length, 0);
	v.close();
});

test("Add keeps one $add entry, then the row is in the block between its fences; a success says nothing beyond the redraw", async () => {
	const text = note();
	const v = await garden(text);
	open(v);
	typeInto(box(v, "Name"), "Mulch");
	box(v, "Stage").value = "planning";
	box(v, "Stage").dispatchEvent(new w.Event("change", { bubbles: true }));
	click(v.q().querySelector(".booklet-row-add-go"));
	await v.after();
	const kept = v.kept();
	assert.equal(kept.length, 1);
	assert.deepEqual(Object.keys(kept[0]).sort(), ["$add", "ts"]);
	assert.deepEqual(JSON.parse(JSON.stringify(kept[0]["$add"])), [{ pick: "j-5", row: { title: "Mulch", stage: "planning" } }], "the id comes after the highest j- number, at every depth");
	const rows = blockRows(v);
	assert.deepEqual(rows.map((r) => r.id), ["j-1", "j-4", "j-5"]);
	assert.deepEqual({ ...rows[2] }, { id: "j-5", title: "Mulch", stage: "planning" });
	assert.equal(v.disk.text.split("\n%%\n")[0].includes('{"id":"j-5","title":"Mulch","stage":"planning"}') || /"id": ?"j-5"/.test(v.disk.text), true);
	assert.deepEqual(said(), [], "no notice for a success");
	assert.deepEqual(v.names(), ["Prune", "Stakes", "Mulch"]);
	assert.equal(v.q().querySelector(".booklet-row-addform"), null, "the form is closed");
	assert.equal(v.q().querySelector(".booklet-row-state"), null, "and the new row does not wait");
	// outside the data fence and the records, the note is what it was
	assert.equal(v.disk.text.slice(0, text.indexOf("```booklet data")), text.slice(0, text.indexOf("```booklet data")));
	v.close();
});

test("a second add straight after the first counts past it: the ids are j-5 and j-6", async () => {
	const v = await garden(note());
	for (const name of ["One", "Two"]) {
		open(v);
		typeInto(box(v, "Name"), name);
		click(v.q().querySelector(".booklet-row-add-go"));
	}
	await v.after();
	assert.deepEqual(blockRows(v).map((r) => r.id), ["j-1", "j-4", "j-5", "j-6"]);
	assert.equal(v.kept().length, 2);
	v.close();
});

test("Add under a row puts the new row at the end of that row's own list of rows", async () => {
	const v = await garden(note());
	v.openRow("j-1");
	const under = v.q().querySelector(".booklet-row-add-under");
	assert.ok(under, "an Add under this row, in the row's open part");
	assert.equal(under.getAttribute("data-booklet-add"), "j-1");
	assert.match(words(under.querySelector("button")), /^Add under this row/);
	open(v, under);
	typeInto(box(v, "Name"), "Sharpen saw");
	click(under.querySelector(".booklet-row-add-go"));
	await v.after();
	assert.deepEqual(blockRows(v)[0].jobs.map((r) => r.id), ["j-2", "j-3", "j-5"]);
	assert.deepEqual(JSON.parse(JSON.stringify(v.kept()[0]["$add"])), [{ pick: "j-5", under: "j-1", row: { title: "Sharpen saw" } }]);
	v.close();
});

test("a row that holds no list of rows cannot take a child here: no Add under it", async () => {
	const v = await garden(note());
	assert.equal(v.q().querySelector('[data-booklet-add="j-4"]'), null);
	v.close();
});

test("an empty box for a field the id is made from asks for it in words and writes nothing", async () => {
	const v = await garden(note({ data: { ...DATA, idFormat: "ID-{field:title}" } }));
	open(v);
	click(v.q().querySelector(".booklet-row-add-go"));
	assert.equal(words(v.q().querySelector(".booklet-row-addmsg")), "Give it a name first.");
	assert.equal(v.kept().length, 0);
	assert.equal(v.disk.writes, 0);
	typeInto(box(v, "Name"), "Weed the beds");
	assert.equal(words(v.q().querySelector(".booklet-row-addmsg")), "", "typing clears the message");
	click(v.q().querySelector(".booklet-row-add-go"));
	await v.after();
	assert.deepEqual(blockRows(v).map((r) => r.id), ["j-1", "j-4", "ID-weed-the-beds"]);
	v.close();
});

test("a number box with no number in it keeps nothing and says so", async () => {
	const v = await garden(note({ query: "from: jobs\nas: table\nfields: title, size\nadd" }));
	open(v);
	typeInto(box(v, "Size"), "abc");
	// a browser keeps the letters out of a number box and says so in `validity`; jsdom has no such state, so it is said here
	Object.defineProperty(box(v, "Size"), "validity", { value: { badInput: true } });
	click(v.q().querySelector(".booklet-row-add-go"));
	assert.match(words(v.q().querySelector(".booklet-row-addmsg")), /Size: that is not a number/);
	assert.equal(v.kept().length, 0);
	v.close();
});

test("with no idFormat, the reader types the id: it must be new and fit the idPattern", async () => {
	const { idFormat, ...bare } = DATA;
	const v = await garden(note({ data: { ...bare, idPattern: "^j-[0-9]+$" } }));
	open(v);
	assert.ok(box(v, "Id"), "an Id box");
	typeInto(box(v, "Id"), "x1");
	click(v.q().querySelector(".booklet-row-add-go"));
	assert.ok(words(v.q().querySelector(".booklet-row-addmsg")).length > 5, "the pattern is said");
	assert.equal(v.kept().length, 0);
	typeInto(box(v, "Id"), "j-4");
	click(v.q().querySelector(".booklet-row-add-go"));
	assert.ok(words(v.q().querySelector(".booklet-row-addmsg")).length > 5, "an id already there is said");
	assert.equal(v.kept().length, 0);
	typeInto(box(v, "Id"), "j-9");
	click(v.q().querySelector(".booklet-row-add-go"));
	await v.after();
	assert.deepEqual(blockRows(v).map((r) => r.id), ["j-1", "j-4", "j-9"]);
	v.close();
});

test("the kept entries say an added row and a removed row in words, with the id and what it was given", async () => {
	const text = note().replace("```booklet query", "> [!text|memo] Memo\n\n```booklet query");
	const v = await garden(text);
	open(v);
	typeInto(box(v, "Name"), "Mulch");
	click(v.q().querySelector(".booklet-row-add-go"));
	await v.after();
	click(v.q().querySelector('[data-booklet-remove="j-1"] .booklet-row-remove-open'));
	click(v.q().querySelector(".booklet-row-remove-yes"));
	await v.after();
	const cards = [...v.view.contentEl.querySelectorAll(".booklet-entry")].map((c) => words(c));
	assert.equal(cards.length, 2);
	assert.ok(cards.some((c) => /Added a rowj-5 \(title: Mulch\)/.test(c)), cards.join(" | "));
	assert.ok(cards.some((c) => /Removed a rowj-1 and the 2 rows under it/.test(c)), cards.join(" | "));
	assert.ok(cards.every((c) => !/does not show yet/.test(c)), "neither is called a question the view does not show");
	v.close();
});

/* ---- removing ---- */

test("Remove asks first, with the number of rows under it; Cancel and Esc ask no more and write nothing", async () => {
	const v = await garden(note());
	const wrap = () => v.q().querySelector('[data-booklet-remove="j-1"]');
	click(wrap().querySelector(".booklet-row-remove-open"));
	assert.equal(words(wrap().querySelector(".booklet-row-remove-q")), "Remove this row and the 2 rows under it?");
	assert.equal(wrap().getAttribute("aria-live"), "polite");
	assert.deepEqual([...wrap().querySelectorAll("button")].map((b) => words(b)), ["Remove Prune", "Cancel"]);
	click(wrap().querySelector(".booklet-row-remove-no"));
	assert.equal(wrap().querySelector(".booklet-row-remove-q"), null);
	click(wrap().querySelector(".booklet-row-remove-open"));
	press(wrap(), "Escape");
	assert.equal(wrap().querySelector(".booklet-row-remove-q"), null, "Esc cancels");
	assert.equal(v.disk.writes, 0);
	// a row with nothing under it
	const four = v.q().querySelector('[data-booklet-remove="j-4"]');
	click(four.querySelector(".booklet-row-remove-open"));
	assert.equal(words(four.querySelector(".booklet-row-remove-q")), "Remove this row?");
	v.close();
});

test("a confirmed Remove keeps one $delete entry carrying the row as it was, then the row and the rows under it leave the block", async () => {
	const v = await garden(note());
	click(v.q().querySelector('[data-booklet-remove="j-1"] .booklet-row-remove-open'));
	click(v.q().querySelector(".booklet-row-remove-yes"));
	await v.after();
	const kept = v.kept();
	assert.equal(kept.length, 1);
	assert.deepEqual(Object.keys(kept[0]).sort(), ["$delete", "ts"]);
	assert.deepEqual(JSON.parse(JSON.stringify(kept[0]["$delete"])), [{ pick: "j-1", was: DATA.rows[0] }]);
	assert.deepEqual(blockRows(v).map((r) => r.id), ["j-4"]);
	assert.deepEqual(said(), []);
	assert.deepEqual(v.names(), ["Stakes"]);
	v.close();
});

/* ---- while the data has not followed ---- */

test("rows in a vault file: the add and the remove are written into the file, and its other bytes stay", async () => {
	const FILE = JSON.stringify(DATA, null, 2) + "\n";
	const text = note({ file: true });
	const v = await garden(text, { file: FILE });
	open(v);
	typeInto(box(v, "Name"), "Mulch");
	click(v.q().querySelector(".booklet-row-add-go"));
	await v.after();
	const rows = JSON.parse(v.file()).rows;
	assert.deepEqual(rows.map((r) => r.id), ["j-1", "j-4", "j-5"]);
	const added = JSON.stringify(DATA, null, 2).replace(/\n  \]\n\}$/, ',\n    {\n      "id": "j-5",\n      "title": "Mulch"\n    }\n  ]\n}') + "\n";
	assert.equal(v.file(), added, "the new row is written in the layout of the one before it, and every other byte is as it was");
	assertOutsideUnchanged(text, v.disk.text, "the note");
	click(v.q().querySelector('[data-booklet-remove="j-4"] .booklet-row-remove-open'));
	click(v.q().querySelector(".booklet-row-remove-yes"));
	await v.after();
	assert.deepEqual(JSON.parse(v.file()).rows.map((r) => r.id), ["j-1", "j-5"]);
	assert.deepEqual(said(), []);
	v.close();
});

test("a file that cannot be written: the entry is kept, a notice says why, and the row shows as waiting", async () => {
	const FILE = JSON.stringify(DATA, null, 2) + "\n";
	const v = await garden(note({ file: true }), { file: FILE });
	v.unwritable.on = true;
	open(v);
	typeInto(box(v, "Name"), "Mulch");
	click(v.q().querySelector(".booklet-row-add-go"));
	await v.after();
	assert.equal(v.file(), FILE, "the file is as it was");
	assert.equal(v.kept().length, 1, "the entry is kept, so nothing the reader did is lost");
	assert.equal(said().length, 1);
	assert.match(said()[0], /^Booklet: the row was kept but not added to garden\.json/);
	assert.deepEqual(v.names().slice(-1), ["Mulch · sent, waiting"], "the row is drawn at the end, waiting");
	assert.equal(v.q().querySelector('.booklet-row-state[data-state="waiting"]') !== null, true);
	click(v.q().querySelector('[data-booklet-remove="j-4"] .booklet-row-remove-open'));
	click(v.q().querySelector(".booklet-row-remove-yes"));
	await v.after();
	assert.match(v.names().join("|"), /Stakes · removing, waiting/);
	assert.equal(v.q().querySelector('[data-booklet-remove="j-4"]'), null, "a row being removed offers no second Remove");
	v.close();
});

test("a row changed since the reader drew it: the removal is kept, nothing is removed, the row says so and the notice says why", async () => {
	const FILE = JSON.stringify(DATA, null, 2) + "\n";
	const v = await garden(note({ file: true }), { file: FILE });
	click(v.q().querySelector('[data-booklet-remove="j-4"] .booklet-row-remove-open'));
	// the file changes under the open view, between the question and the answer
	const other = JSON.parse(FILE);
	other.rows[1].title = "Changed elsewhere";
	const changed = JSON.stringify(other, null, 2) + "\n";
	v.overwrite(changed);
	click(v.q().querySelector(".booklet-row-remove-yes"));
	await v.after();
	assert.equal(v.file(), changed, "nothing was removed");
	assert.equal(v.kept().length, 1, "the removal is kept");
	assert.equal(said().length, 1);
	assert.match(said()[0], /Changed since you drew it\./);
	assert.match(v.names().join("|"), /Changed elsewhere · You asked to remove this; it changed since\./, "and says in words that it changed");
	assert.equal(v.q().querySelector('.booklet-row-state[data-state="changed"]') !== null, true);
	// the row is there as it is now, so the reader can ask again: the new entry's `was` is the row as it stands, and it is removed
	click(v.q().querySelector('[data-booklet-remove="j-4"] .booklet-row-remove-open'));
	click(v.q().querySelector(".booklet-row-remove-yes"));
	await v.after();
	assert.deepEqual(JSON.parse(v.file()).rows.map((r) => r.id), ["j-1"], "removed the second time");
	assert.equal(v.kept().length, 2);
	assert.deepEqual(JSON.parse(JSON.stringify(v.kept()[1]["$delete"][0].was)), other.rows[1]);
	v.close();
});

test("a row that has left the data: a removal of it is kept and nothing is written, the notice says the row is gone", async () => {
	const FILE = JSON.stringify(DATA, null, 2) + "\n";
	const v = await garden(note({ file: true }), { file: FILE });
	click(v.q().querySelector('[data-booklet-remove="j-4"] .booklet-row-remove-open'));
	const gone = JSON.parse(FILE);
	gone.rows.splice(1, 1);
	const goneText = JSON.stringify(gone, null, 2) + "\n";
	v.overwrite(goneText);
	click(v.q().querySelector(".booklet-row-remove-yes"));
	await v.after();
	assert.equal(v.file(), goneText, "a row that is already gone is not an error and writes nothing");
	assert.deepEqual(said(), [], "the data is what the reader asked for");
	v.close();
});

test("an add under a parent that is gone is refused in words, and the row waits", async () => {
	const FILE = JSON.stringify(DATA, null, 2) + "\n";
	const v = await garden(note({ file: true }), { file: FILE });
	v.openRow("j-1");
	const under = v.q().querySelector(".booklet-row-add-under");
	open(v, under);
	typeInto(box(v, "Name"), "Orphan");
	const gone = JSON.parse(FILE);
	gone.rows.shift();
	const goneText = JSON.stringify(gone, null, 2) + "\n";
	v.overwrite(goneText);
	click(under.querySelector(".booklet-row-add-go"));
	await v.after();
	assert.equal(v.file(), goneText);
	assert.equal(v.kept().length, 1);
	assert.match(said()[0], /That row is gone\./);
	v.close();
});

test("the same removal kept twice writes once: applying again is a no-op", async () => {
	const FILE = JSON.stringify(DATA, null, 2) + "\n";
	const v = await garden(note({ file: true }), { file: FILE });
	click(v.q().querySelector('[data-booklet-remove="j-4"] .booklet-row-remove-open'));
	click(v.q().querySelector(".booklet-row-remove-yes"));
	await v.after();
	const once = v.file();
	assert.deepEqual(JSON.parse(once).rows.map((r) => r.id), ["j-1"]);
	v.close();
});
