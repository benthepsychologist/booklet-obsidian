/*
 * Rows that open, drawn (format 0.19; SPEC section 6, "Rows that open"), and data files read through the vault (SPEC section 7), over a
 * jsdom document: a table, a list and cards nest by `parent` and by a field that holds rows; a row opens to its other fields and then
 * its children, drawn when it opens; what the reader opens is kept through a sort, a search and a redraw, on the device only; Open
 * all, Close all; a print opens every closed row and folds back exactly those; a data block that names a file shows the file's rows,
 * or a quiet box that says why not, and is read again when the vault or the pane says so, keeping open rows and scroll; a question
 * asked for each row is drawn as its title and a line. Made-up garden and orchard rows only. Nothing is written to the note.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { openView, testApp, click, until, words, window as w } from "./dom.mjs";
import { core, fence, fm } from "./helpers.mjs";
import * as fixture from "./dashboard-fixture.mjs";

process.env.TZ = "UTC";
const { mountQuery } = await import("./.build/screens.mjs");

const FIELDS = { title: "Name", kind: "Kind", about: "What it says", projects: "Projects", items: "Work items", notes: "Notes" };
const DATA = {
	fields: FIELDS,
	rows: [
		{ id: "p1", title: "Garden", kind: "hub", about: "One.\n\nTwo.", projects: [{ id: "j1", title: "Beds", kind: "Project", about: "Dig", items: [{ id: "r1", title: "Order timber", kind: "Item" }, { id: "r2", title: "Cut boards", kind: "Item" }] }, { id: "j2", title: "Pond", kind: "Project" }] },
		{ id: "p2", title: "Orchard", kind: "hub" },
		{ id: "p3", title: "Shed", kind: "hub", about: "Only text", notes: [] },
	],
};

const data = (json, id) => "```booklet data\n" + (typeof json === "string" ? json : JSON.stringify(json)) + "\n```\n^" + id;
const note = (queries, blocks = [["d", DATA]], extra = "") =>
	`${fm}\n> [!activity|show] Show\n\n${queries.map(fence).join("\n\n")}\n\n${extra}> [!data] Data\n\n${blocks.map(([id, j]) => data(j, id)).join("\n\n")}\n`;

/** A pane on `text`, with the vault's files (`files`: path to text) behind the adapter, and the vault events the view asked for kept. */
function open(text, files = {}, path = "Note.booklet.md", hold = false) {
	const disk = { text, writes: 0 };
	/** With `hold`, a read takes the file as it is when it is asked for and returns it only when `gate.release()` is called. */
	const gate = { wait: null, release: () => {} };
	if (hold) gate.wait = new Promise((r) => (gate.release = r));
	const log = { reads: [], stats: 0 };
	const held = new Map(Object.entries(files).map(([p, t]) => [p, { text: t, mtime: 1 }]));
	const adapter = {
		read: async (p) => {
			log.reads.push(p);
			const f = held.get(p);
			if (!f) throw new Error("ENOENT");
			const text = f.text;
			await gate.wait;
			return text;
		},
		stat: async (p) => {
			log.stats++;
			const f = held.get(p);
			return f ? { size: f.text.length, mtime: f.mtime } : null;
		},
	};
	const events = new Map();
	const app = testApp(disk, { vault: { adapter, on: (name, fn) => (events.set(name, fn), {}) } });
	const v = openView(text, { path, disk, app, screen: "activity:/show" });
	return {
		...v,
		log,
		events,
		gate,
		/** Changes a file in the vault, as another program writes it. */
		write(p, t) {
			held.set(p, { text: t, mtime: (held.get(p)?.mtime ?? 0) + 1 });
		},
		remove: (p) => held.delete(p),
		queries: () => [...v.view.contentEl.querySelectorAll(".booklet-query")],
		/** Leave the screen and come back: drawn again from the state the pane keeps. */
		async away() {
			v.view.go({ screen: "home", tab: null, part: 0 });
			await v.settled();
			v.view.go({ screen: "activity:/show", tab: null, part: 0 });
			await v.settled();
		},
		/** The pane is back in view. */
		back() {
			const doc = v.view.contentEl.ownerDocument;
			doc.dispatchEvent(new w.Event("visibilitychange"));
		},
	};
}
/** A press on a disclosure, as a reader's click leaves it: open or shut, and the toggle event that follows. */
function press(d, on = !d.open) {
	d.open = on;
	d.dispatchEvent(new w.Event("toggle"));
}
const labels = (q) => [...q.querySelectorAll(".booklet-q-label")].map((x) => x.textContent);
const dts = (el) => [...el.querySelectorAll("dt")].map((x) => x.textContent);

/* ---- a nested list ---- */

test("a list over rows that hold rows: a row that opens is a details, shut, and holding only its summary until it opens", () => {
	const v = open(note(["from: d\nas: list\nlabel: title\nfields: kind"]));
	const q = v.queries()[0];
	const tree = q.querySelector(".booklet-q-tree");
	assert.equal(tree.children.length, 3, "three top rows");
	const ds = [...q.querySelectorAll("details")];
	assert.equal(ds.length, 2, "Garden (projects, text) and Shed (text) open; Orchard has nothing more");
	assert.ok(ds.every((d) => !d.open && d.children.length === 1 && d.firstElementChild.tagName === "SUMMARY"), "shut, with only its summary");
	assert.equal(tree.querySelectorAll(":scope > .booklet-q-row").length, 1, "a row with nothing more is a plain row");
	v.close();
});

test("it opens to its other fields first, each under its label with line breaks kept, then its children under a heading by the field; drawn once", () => {
	const v = open(note(["from: d\nas: list\nlabel: title\nfields: kind"]));
	const q = v.queries()[0];
	const d0 = q.querySelector("details");
	press(d0);
	const more = d0.querySelector(":scope > dl.booklet-q-more");
	assert.deepEqual(dts(more), ["What it says"]);
	assert.equal(more.querySelector("dd").textContent, "One.\n\nTwo.");
	assert.ok(more.querySelector("dd").classList.contains("booklet-q-text"), "plain text: nothing in it is read as Markdown or HTML");
	assert.deepEqual([...d0.children].map((c) => c.tagName + (c.className ? "." + c.className.split(" ")[0] : "")), ["SUMMARY.booklet-q-row", "DL.booklet-q-more", "DIV.booklet-q-ghead", "UL.booklet-q-list"]);
	assert.equal(d0.querySelector(".booklet-q-ghead").textContent, "Projects");
	assert.equal(d0.querySelector(".booklet-q-ghead").getAttribute("role"), "heading");
	const n = d0.children.length;
	press(d0, true);
	assert.equal(d0.children.length, n, "a second toggle adds nothing");
	const j1 = d0.querySelectorAll("details")[0];
	press(j1);
	assert.equal(j1.querySelector(".booklet-q-ghead").textContent, "Work items");
	assert.deepEqual(labels(j1.querySelector("ul")), ["Order timber", "Cut boards"]);
	v.close();
});

test("what the reader opens is kept by the row's id for the visit, in the pane's state, and the rows are drawn open again with their children", async () => {
	const text = note(["from: d\nas: list\nlabel: title\nfields: kind"]);
	const v = open(text);
	press(v.queries()[0].querySelector("details"));
	press(v.queries()[0].querySelectorAll("details")[1]);
	await v.away();
	const again = v.queries()[0];
	const open_ = [...again.querySelectorAll("details")].filter((d) => d.open).map((d) => d.getAttribute("data-id"));
	assert.deepEqual(open_, ["p1", "j1"]);
	assert.deepEqual(labels(again.querySelectorAll("details")[1].querySelector("ul")), ["Order timber", "Cut boards"], "the children of a row kept open are drawn at once");
	assert.equal(v.disk.writes, 0, "nothing is written to the note");
	assert.equal(v.disk.text, text);
	assert.ok(!JSON.stringify(v.view.getState()).includes("p1"), "and nothing of it is in the state Obsidian saves with the pane");
	v.close();
});

test("rows nested by `parent` draw the same way: one group with no heading", () => {
	const rows = [{ id: "a", title: "A", parent: "" }, { id: "a1", title: "A1", parent: "a" }, { id: "b", title: "B" }];
	const v = open(note(["from: d\nas: list\nlabel: title"], [["d", { rows }]]));
	const q = v.queries()[0];
	assert.equal(q.querySelectorAll("details").length, 1);
	press(q.querySelector("details"));
	assert.equal(q.querySelectorAll(".booklet-q-ghead").length, 0);
	assert.deepEqual(labels(q.querySelector("details ul")), ["A1"]);
	v.close();
});

/* ---- a nested table ---- */

test("a table stays a real table: column headings in the head, a row of cells in the same columns for each row, the first column holds the disclosure", () => {
	const v = open(note(["from: d\nas: table\nfields: title, kind"]));
	const q = v.queries()[0];
	const t = q.querySelector("table");
	assert.deepEqual([...t.querySelectorAll("thead th")].map((x) => [x.textContent, x.getAttribute("scope")]), [["Name", "col"], ["Kind", "col"]]);
	assert.equal(t.querySelectorAll("tbody").length, 1);
	const trs = [...t.querySelectorAll("tbody tr")];
	assert.equal(trs.length, 3, "the top rows only while all are shut");
	assert.ok(trs.every((tr) => tr.getAttribute("data-depth") === "0" && tr.children.length === 2 && [...tr.children].every((c) => c.tagName === "TD")));
	assert.equal(t.querySelectorAll("details").length, 2);
	assert.equal(trs[1].querySelector("details"), null, "a row that does not open has no disclosure");
	assert.ok(trs[0].children[0].querySelector("details > summary"), "the disclosure is in the lead cell");
	assert.equal(trs[0].children[1].querySelector("details"), null);
	v.close();
});

test("a table row opens to rows after it, in order: its open part, the heading, its children one step in; shutting takes them away", () => {
	const v = open(note(["from: d\nas: table\nfields: title, kind"]));
	const q = v.queries()[0];
	const body = q.querySelector("tbody");
	const kinds = () => [...body.children].map((r) => (r.classList.contains("booklet-q-trow") ? "row" : r.classList.contains("booklet-q-trmore") ? "more" : "head") + r.getAttribute("data-depth"));
	press(q.querySelector("details"));
	assert.deepEqual(kinds(), ["row0", "more1", "head1", "row1", "row1", "row0", "row0"]);
	assert.equal(body.querySelector(".booklet-q-trmore td").getAttribute("colspan"), "2", "the open part spans every column");
	assert.equal(body.querySelector(".booklet-q-grouprow th").getAttribute("scope"), "rowgroup");
	const beds = [...body.querySelectorAll("tr")].find((r) => r.textContent.startsWith("Beds"));
	assert.equal(beds.querySelectorAll(".booklet-q-ind").length, 1, "one step in");
	press(beds.querySelector("details"));
	assert.deepEqual(kinds(), ["row0", "more1", "head1", "row1", "more2", "head2", "row2", "row2", "row1", "row0", "row0"]);
	press(q.querySelector("details"), false);
	assert.deepEqual(kinds(), ["row0", "row0", "row0"], "shut: everything it drew goes");
	press(q.querySelector("details"), true);
	assert.equal(body.children.length, 11, "opened again, its kept children come back open");
	v.close();
});

test("a table keeps its sort headings and sorts the rows within each set of siblings", () => {
	const rows = Array.from({ length: 10 }, (_, i) => ({ id: "r" + i, title: "Row " + "JIHGFEDCBA"[i], n: i, kids: [{ id: "k" + i, title: "Kid of " + i, n: 5 - i }] }));
	const v = open(note(["from: d\nas: table\nfields: title, n"], [["d", { rows }]]));
	const q = v.queries()[0];
	const heads = [...q.querySelectorAll("thead th button.booklet-q-sort")];
	assert.equal(heads.length, 2, "both headings sort");
	click(heads[0]);
	assert.equal(q.querySelectorAll("thead th")[0].getAttribute("aria-sort"), "ascending");
	assert.equal(q.querySelector("tbody tr").textContent.startsWith("Row A"), true);
	press(q.querySelector("details"));
	assert.equal(q.querySelectorAll("tbody tr")[1].getAttribute("data-depth"), "1", "a child stays under its parent");
	v.close();
});

/* ---- nested cards ---- */

test("cards nest: a card that opens is a fold card (its title and note stay in sight), the other an ordinary card; its body is drawn when it opens", () => {
	const v = open(note(["from: d\nas: cards\nlabel: title\nfields: kind"]));
	const q = v.queries()[0];
	const folds = [...q.querySelectorAll(".booklet-q-fold")];
	assert.equal(folds.length, 2);
	assert.equal(q.querySelectorAll(".booklet-q-cards > .booklet-q-card:not(.booklet-q-fold)").length, 1);
	assert.ok(folds.every((f) => f.querySelector("details:not([open]) > summary") && !f.querySelector(".booklet-q-fold-body")), "shut, and the body is not drawn");
	const d = folds[0].querySelector("details");
	press(d);
	const body = d.querySelector(".booklet-q-fold-body");
	assert.deepEqual([...body.children].map((c) => c.className.split(" ").filter((x) => /^booklet-q-(more|ghead|cards|sub)$/.test(x)).join(".")), ["booklet-q-more", "booklet-q-ghead", "booklet-q-cards.booklet-q-sub"]);
	assert.equal(body.querySelector(".booklet-q-ghead").textContent, "Projects");
	assert.equal(body.querySelectorAll(".booklet-q-sub > .booklet-q-card").length, 2);
	v.close();
});

/* ---- flat rows that open ---- */

test("a flat row with more to show than its line opens too, in a table, a list and cards; the row with none is plain", () => {
	const flat = { fields: { title: "Name", kind: "Kind", about: "What it says" }, rows: [{ id: "a", title: "A", kind: "x", about: "Extra\n\nlines" }, { id: "b", title: "B" }] };
	for (const as of ["table", "list", "cards"]) {
		const v = open(note([`from: d\nas: ${as}\nlabel: title\nfields: title`], [["d", flat]]));
		const q = v.queries()[0];
		assert.equal(q.querySelectorAll("details").length, 1, `${as}: one disclosure`);
		press(q.querySelector("details"));
		const more = q.querySelector(".booklet-q-more");
		assert.deepEqual(dts(more), ["Kind", "What it says"], as);
		assert.deepEqual([...more.querySelectorAll("dd")].map((x) => x.textContent), ["x", "Extra\n\nlines"], `${as}: text kept as written`);
		assert.equal(q.querySelectorAll(".booklet-q-ghead").length, 0, `${as}: no children, no heading`);
		v.close();
		const none = open(note([`from: d\nas: ${as}\nlabel: title`], [["d", flat]]));
		assert.equal(none.queries()[0].querySelectorAll("details").length, 0, `${as}: with no fields: the line shows every plain field, so nothing opens`);
		none.close();
	}
});

test("flat rows that open may still be grouped: each group headed once, and the group field not shown again", () => {
	const flat = { fields: { title: "Name", kind: "Kind", about: "What it says" }, rows: [{ id: "a", title: "A", kind: "x", about: "Extra" }, { id: "b", title: "B", kind: "y" }] };
	const v = open(note(["from: d\nas: list\nlabel: title\nfields: title\ngroup: kind"], [["d", flat]]));
	const q = v.queries()[0];
	assert.deepEqual([...q.querySelectorAll(".booklet-q-group")].map((x) => x.textContent), ["x1 row", "y1 row"]);
	press(q.querySelector("details"));
	assert.deepEqual(dts(q), ["What it says"]);
	v.close();
	const t = open(note(["from: d\nas: table\nfields: title\ngroup: kind"], [["d", flat]]));
	assert.deepEqual([...t.queries()[0].querySelectorAll("tr.booklet-q-grouprow")].map((x) => x.textContent), ["x1 row", "y1 row"]);
	t.close();
});

test("a field named like a member every object has (constructor, toString) is the row's own: no open part for a row without it, no function's text anywhere", () => {
	const rows = [{ id: "a", title: "Plain" }, { id: "b", title: "Has it", constructor: "made by hand", toString: "also by hand" }];
	const v = open(note(["from: d\nas: list\nlabel: title\nfields: title"], [["d", { fields: { title: "Name", constructor: "Ctor", toString: "Text" }, rows }]]));
	const q = v.queries()[0];
	assert.deepEqual([...q.querySelectorAll("details")].map((d) => d.getAttribute("data-id")), ["b"]);
	press(q.querySelector("details"));
	assert.match(q.querySelector(".booklet-q-more").textContent, /made by hand.*also by hand|also by hand.*made by hand/);
	assert.ok(!/native code|function/.test(q.textContent));
	v.close();
});

/* ---- the reader's control on a tree ---- */

const MANY = { fields: FIELDS, rows: [{ id: "r1", title: "Root one", n: 2, items: [1, 2, 3, 4, 5, 6, 7, 8].map((i) => ({ id: "c" + i, title: "Child " + "ABCDEFGH"[i - 1], n: 9 - i })) }, { id: "r2", title: "Root two", n: 1 }] };

test("a search keeps a match with its parents, open while it is on; what it opens is not the reader's; Clear shuts them again", () => {
	const v = open(note(["from: d\nas: list\nlabel: title\nfields: n"], [["d", MANY]]));
	const q = v.queries()[0];
	const input = q.querySelector(".booklet-qc-search input");
	input.value = "child c";
	input.dispatchEvent(new w.Event("input", { bubbles: true }));
	assert.deepEqual(labels(q), ["Root one", "Child C"]);
	const d = q.querySelector("details");
	assert.equal(d.open, true, "the parent stands open so the match shows");
	press(d, false);
	press(d, true);
	input.value = "";
	input.dispatchEvent(new w.Event("input", { bubbles: true }));
	assert.equal(q.querySelector("details").open, false, "opened by the search, not by the reader: shut again, though it was toggled while the search was on");
	v.close();
});

test("Open all opens every row that opens and Close all shuts them; a redraw keeps them", () => {
	const v = open(note(["from: d\nas: list\nlabel: title\nfields: n"], [["d", MANY]]));
	const q = v.queries()[0];
	const all = q.querySelector(".booklet-qc-openall");
	const none = q.querySelector(".booklet-qc-closeall");
	assert.equal(all.textContent, "Open all");
	assert.equal(none.textContent, "Close all");
	click(all);
	assert.ok([...q.querySelectorAll("details")].every((d) => d.open));
	assert.equal(labels(q).length, 10, "every row is drawn");
	click(none);
	assert.ok([...q.querySelectorAll("details")].every((d) => !d.open));
	assert.equal(labels(q).length, 2);
	v.close();
});

test("a view with no row that opens offers no Open all", () => {
	const rows = Array.from({ length: 10 }, (_, i) => ({ id: "r" + i, title: "Row " + i }));
	const v = open(note(["from: d\nas: list\nlabel: title"], [["d", { rows }]]));
	assert.equal(v.queries()[0].querySelector(".booklet-qc-openall"), null);
	v.close();
});

/* ---- a print ---- */

const hostOf = { md: (m, el) => (el.textContent = m), openNote: () => {} };
function mounted(as = "list", fields = "kind", blocks = [["d", DATA]]) {
	const box = w.document.createElement("div");
	w.document.body.appendChild(box);
	const st = core.newViewState();
	const draw = mountQuery(hostOf, box, st);
	const b = core.parseBooklet(note([`from: d\nas: ${as}\nlabel: title\nfields: ${fields}`], blocks));
	const seg = b.activities.find((a) => a.id === "show").segments.find((s) => s.type === "query");
	draw(() => core.planQuery(b, seg, { drawn: new Date("2026-10-28T12:00:00Z") }));
	return { box, st, draw, again: () => draw(() => core.planQuery(b, seg, { drawn: new Date("2026-10-28T12:00:00Z") }), true) };
}

test("a print opens every closed row, drawing what it opens to at once (before any toggle event), and folds back exactly those, leaving the reader's own rows", () => {
	const { box, st, draw } = mounted();
	press(box.querySelector("details"));
	assert.deepEqual([...st.opens], ["p1"]);
	draw.printRows(true);
	const ds = [...box.querySelectorAll("details")];
	assert.equal(ds.length, 3, "Garden, Beds (a child) and Shed");
	assert.ok(ds.every((d) => d.open), "all open, the children of the children too");
	assert.ok(box.textContent.includes("Order timber") && box.textContent.includes("Only text"), "drawn synchronously, with no toggle event yet");
	for (const d of ds) d.dispatchEvent(new w.Event("toggle"));
	assert.deepEqual([...st.opens], ["p1"], "the print's own toggle events are not the reader's");
	draw.printRows(false);
	assert.deepEqual([...box.querySelectorAll("details")].filter((d) => d.open).map((d) => d.getAttribute("data-id")), ["p1"], "only the reader's row stays open");
	for (const d of box.querySelectorAll("details")) d.dispatchEvent(new w.Event("toggle"));
	assert.deepEqual([...st.opens], ["p1"]);
	box.remove();
});

test("a print that never sends afterprint does not swallow the reader's next toggle, and the next print starts from the reader's own rows", () => {
	const { box, st, draw } = mounted();
	draw.printRows(true);
	for (const d of box.querySelectorAll("details")) d.dispatchEvent(new w.Event("toggle"));
	assert.equal(st.opens.size, 0);
	const d = box.querySelector("details");
	press(d, false);
	assert.equal(st.opens.has("p3") || st.opens.has("p1"), false, "the reader shutting a row: nothing is remembered open");
	press(d, true);
	assert.deepEqual([...st.opens], [d.getAttribute("data-id")], "the reader opening it again is remembered");
	draw.printRows(true);
	draw.printRows(false);
	assert.equal(d.open, true, "a row the reader took over stays open when a print folds back");
	assert.deepEqual([...st.opens], [d.getAttribute("data-id")]);
	box.remove();
});

test("a nested table's print opens its rows and takes them away again after", () => {
	const { box, draw } = mounted("table", "title");
	const rows = () => box.querySelectorAll("tbody tr").length;
	assert.equal(rows(), 3);
	draw.printRows(true);
	assert.ok(rows() > 10, "every row is a row of the table");
	draw.printRows(false);
	assert.equal(rows(), 3);
	box.remove();
});

test("the page's own print events reach every query: beforeprint opens, afterprint folds", () => {
	const v = open(note(["from: d\nas: list\nlabel: title\nfields: kind"]));
	const q = v.queries()[0];
	const win = v.view.contentEl.ownerDocument.defaultView;
	win.dispatchEvent(new w.Event("beforeprint"));
	assert.ok([...q.querySelectorAll("details")].every((d) => d.open));
	win.dispatchEvent(new w.Event("afterprint"));
	assert.ok([...q.querySelectorAll("details")].every((d) => !d.open));
	v.close();
});

/* ---- keeping place when the rows are drawn again over what the reader sees ---- */

test("drawn again over rows the reader looks at (the file changed): the page's scroll, a wide table's scroll and the focused heading stay", () => {
	const scroller = w.document.createElement("div");
	w.document.body.appendChild(scroller);
	const box = w.document.createElement("div");
	scroller.appendChild(box);
	const st = core.newViewState();
	const draw = mountQuery(hostOf, box, st);
	const rows = Array.from({ length: 10 }, (_, i) => ({ id: "r" + i, title: "Row " + i, n: i, more: "m" + i }));
	const b = core.parseBooklet(note(["from: d\nas: table\nfields: title, n"], [["d", { rows }]]));
	const seg = b.activities.find((a) => a.id === "show").segments.find((s) => s.type === "query");
	const plan = () => core.planQuery(b, seg, { drawn: new Date("2026-10-28T12:00:00Z") });
	draw(plan);
	let top = 0;
	Object.defineProperty(scroller, "scrollTop", { get: () => top, set: (x) => (top = x), configurable: true });
	// as a browser does when the rows are taken out: a scroll position that the content can no longer hold goes
	const empty = w.Element.prototype.empty;
	w.Element.prototype.empty = function () {
		if (scroller.contains(this)) top = 0;
		return empty.call(this);
	};
	try {
		top = 240;
		box.querySelector(".booklet-q-wrap").scrollLeft = 77;
		const heads = box.querySelectorAll("button.booklet-q-sort");
		heads[1].focus();
		press(box.querySelector("details"));
		draw(plan, true);
		assert.equal(top, 240, "the page stays where it was");
		assert.equal(box.querySelector(".booklet-q-wrap").scrollLeft, 77, "and so does a wide table");
		assert.equal(w.document.activeElement, box.querySelectorAll("button.booklet-q-sort")[1], "and the focused heading is focused again");
		assert.equal(box.querySelector("details").open, true, "and the row the reader opened is open");
		top = 240;
		draw(plan);
		assert.equal(top, 0, "a plain draw does not hold the place (the pane's own scroll rules)");
	} finally {
		w.Element.prototype.empty = empty;
		scroller.remove();
	}
});

/* ---- data files ---- */

const PLOTS = JSON.stringify({ plots: DATA.rows, other: { rows: [{ id: "z", title: "Zed" }] } });
const fileNote = (info = "dash.json plots", query = "from: d\nas: list\nlabel: title\nfields: kind", body = "") =>
	`${fm}\n> [!activity|show] Show\n\n${fence(query)}\n\n\`\`\`booklet data ${info}\n${body}\n\`\`\`\n^d\n`;
const quiet = (q) => q.querySelector(".booklet-q-quiet")?.textContent;

test("a data block that names a file: loading, then the file's rows; read through the vault, beside the note, and nothing is written", async () => {
	const text = fileNote();
	const v = open(text, { "dash.json": PLOTS });
	const q = v.queries()[0];
	assert.equal(quiet(q), "Loading dash.json…");
	await until(() => v.queries()[0].querySelector("details"), "the rows");
	assert.deepEqual(labels(v.queries()[0]), ["Garden", "Orchard", "Shed"]);
	assert.deepEqual(v.log.reads, ["dash.json"]);
	assert.equal(v.queries()[0].querySelector(".booklet-q-quiet"), null);
	assert.equal(v.disk.writes, 0);
	assert.equal(v.disk.text, text);
	v.close();
});

test("the file is looked for in the note's own folder, and below it, never above or elsewhere", async () => {
	const v = open(fileNote("sub/dash.json plots"), { "Folder/sub/dash.json": PLOTS, "sub/dash.json": "[]" }, "Folder/Note.booklet.md");
	await until(() => v.queries()[0].querySelector("details"), "the rows");
	assert.deepEqual(v.log.reads, ["Folder/sub/dash.json"]);
	v.close();
	const up = open(fileNote("../dash.json plots"), { "dash.json": PLOTS }, "Folder/Note.booklet.md");
	assert.match(quiet(up.queries()[0]), /is not a name this plugin reads/);
	await up.settled();
	assert.deepEqual(up.log.reads, [], "a refused name is never read");
	up.close();
});

test("a file that cannot be read gives the quiet box, with no control and no rows, saying which way it failed", async () => {
	const cases = [
		[fileNote("gone.json plots"), {}, /the file gone\.json was not found/],
		[fileNote(), { "dash.json": "{ not json" }, /the file dash\.json is not JSON/],
		[fileNote("dash.json nowhere"), { "dash.json": PLOTS }, /has nothing at “nowhere”/],
		[fileNote("dash.json plots.0"), { "dash.json": PLOTS }, /has nothing at “plots\.0”/],
		[fileNote("dash.json plots"), { "dash.json": JSON.stringify({ plots: 5 }) }, /holds no list of rows/],
		[fileNote("dash.json plots"), { "dash.json": JSON.stringify({ plots: [{ a: [1, { b: 1 }] }] }) }, /mixes values and rows/],
	];
	for (const [text, files, want] of cases) {
		const v = open(text, files);
		await until(() => !/Loading/.test(quiet(v.queries()[0]) ?? ""), "the read to land");
		const q = v.queries()[0];
		assert.match(quiet(q), want);
		assert.match(quiet(q), /^Data not shown: /);
		assert.equal(q.querySelector(".booklet-qc"), null, "no control");
		assert.equal(q.querySelector("details, li, tr"), null, "no rows");
		v.close();
	}
});

test("a file over 5 MB is not read into memory: the quiet box says it is too big", async () => {
	const v = open(fileNote(), { "dash.json": "x".repeat(5 * 1024 * 1024 + 1) });
	await until(() => v.queries()[0].querySelector(".booklet-q-quiet") && !/Loading/.test(quiet(v.queries()[0])), "the read to land");
	assert.match(quiet(v.queries()[0]), /is too big \(the limit is 5 MB\)/);
	assert.deepEqual(v.log.reads, [], "the size is known before the file is read");
	v.close();
});

test("a fence that names a file with rows in it: the note's problems say so, and the file's rows are drawn", async () => {
	const text = fileNote("dash.json plots", undefined, '{"rows":[{"id":"fenced","title":"Fenced"}]}');
	assert.ok(core.parseBooklet(text).problems.some((p) => /its rows were not read/.test(p)));
	const v = open(text, { "dash.json": PLOTS });
	await until(() => v.queries()[0].querySelector("details"), "the rows");
	assert.deepEqual(labels(v.queries()[0]), ["Garden", "Orchard", "Shed"]);
	v.close();
});

test("two blocks that name one file read it once; each takes its own key path and keeps its own fence fields", async () => {
	const text = `${fm}\n> [!activity|show] Show\n\n${fence("from: a\nas: list\nlabel: title")}\n\n${fence("from: b\nas: list\nlabel: title")}\n\n\`\`\`booklet data dash.json plots\n{"fields":{"title":"Plot"}}\n\`\`\`\n^a\n\n\`\`\`booklet data dash.json other\n{"fields":{"title":"Other"}}\n\`\`\`\n^b\n`;
	const v = open(text, { "dash.json": PLOTS });
	await until(() => v.queries().every((q) => q.querySelector("li, details")), "both");
	assert.deepEqual(v.log.reads, ["dash.json"], "one read for two blocks");
	assert.deepEqual(labels(v.queries()[0]), ["Garden", "Orchard", "Shed"]);
	assert.deepEqual(labels(v.queries()[1]), ["Zed"]);
	v.close();
	const cols = `${fm}\n> [!activity|show] Show\n\n${fence("from: a\nas: table")}\n\n${fence("from: b\nas: table")}\n\n\`\`\`booklet data dash.json plots\n{"fields":{"title":"Plot","kind":"Kind"}}\n\`\`\`\n^a\n\n\`\`\`booklet data dash.json plots\n{"fields":{"title":"Other"}}\n\`\`\`\n^b\n`;
	const u = open(cols, { "dash.json": PLOTS });
	await until(() => u.queries().every((q) => q.querySelector("th")), "both");
	assert.deepEqual(u.queries().map((q) => [...q.querySelectorAll("thead th")].map((x) => x.textContent)), [["Plot", "Kind"], ["Other"]]);
	u.close();
});

test("the file is read again when the vault says it changed: the rows are drawn again, the rows the reader opened stay open and the page keeps its place", async () => {
	const v = open(fileNote(), { "dash.json": PLOTS });
	await until(() => v.queries()[0].querySelector("details"), "the rows");
	const scroller = v.view.contentEl;
	let top = 0;
	Object.defineProperty(scroller, "scrollTop", { get: () => top, set: (x) => (top = x), configurable: true });
	const empty = w.Element.prototype.empty;
	w.Element.prototype.empty = function () {
		if (scroller.contains(this)) top = 0;
		return empty.call(this);
	};
	try {
		press(v.queries()[0].querySelector("details"));
		top = 321;
		const changed = JSON.parse(PLOTS);
		changed.plots[0].title = "Garden (renamed)";
		changed.plots[0].projects.push({ id: "j3", title: "Hedge" });
		v.write("dash.json", JSON.stringify(changed));
		v.events.get("modify")({ path: "dash.json" });
		await until(() => labels(v.queries()[0])[0] === "Garden (renamed)", "the new rows");
		const q = v.queries()[0];
		assert.equal(q.querySelector("details").open, true, "the open row is open");
		assert.deepEqual(labels(q.querySelector("details ul")), ["Beds", "Pond", "Hedge"], "and its children are the new ones");
		assert.equal(top, 321, "scroll kept");
		assert.deepEqual(v.log.reads, ["dash.json", "dash.json"]);
	} finally {
		w.Element.prototype.empty = empty;
	}
	v.close();
});

test("the pane coming back into view looks at the file and reads it again only if its size or time changed", async () => {
	const v = open(fileNote(), { "dash.json": PLOTS });
	await until(() => v.queries()[0].querySelector("details"), "the rows");
	v.back();
	await until(() => v.log.stats >= 2, "a look at the file");
	await v.settled();
	assert.deepEqual(v.log.reads, ["dash.json"], "unchanged: not read again");
	v.write("dash.json", JSON.stringify({ plots: [{ id: "n", title: "New plot" }] }));
	v.back();
	await until(() => labels(v.queries()[0]).join() === "New plot", "the new rows");
	assert.equal(v.log.reads.length, 2);
	v.remove("dash.json");
	v.back();
	await until(() => v.log.stats >= 4, "a look at the gone file");
	await v.settled();
	assert.deepEqual(labels(v.queries()[0]), ["New plot"], "a file that is gone leaves the good rows on screen");
	assert.equal(quiet(v.queries()[0]), undefined);
	v.write("dash.json", PLOTS);
	v.back();
	await until(() => labels(v.queries()[0]).length === 3, "the rows come back");
	v.close();
});

test("a vault event for a file that is not a .json file is ignored", async () => {
	const v = open(fileNote(), { "dash.json": PLOTS });
	await until(() => v.queries()[0].querySelector("details"), "the rows");
	const stats = v.log.stats;
	v.events.get("modify")({ path: "Note.booklet.md" });
	await v.settled();
	assert.equal(v.log.stats, stats);
	v.close();
});

/* ---- the made-up orchard dashboard, and a large one ---- */

const here = (f) => new URL(`./dashboards/${f}`, import.meta.url);

test("the orchard example: four queries over three keys of one file, drawn as the example says", async () => {
	const text = readFileSync(here("orchard-dashboard.booklet.md"), "utf8");
	const file = readFileSync(here("orchard-dashboard.json"), "utf8");
	const json = JSON.parse(file);
	const b = core.parseBooklet(text);
	assert.deepEqual(b.problems, []);
	const v = open(text, { "orchard-dashboard.json": file }, "Orchard.booklet.md");
	v.view.go({ screen: "activity:desk/orchard", tab: null, part: 0 });
	await v.settled();
	await until(() => v.queries().length === 4 && v.queries().every((q) => !q.querySelector(".booklet-q-quiet")), "the four queries");
	const [plots, roundup, harvest, requests] = v.queries();
	// the plots: one table, three top rows; the rows that hold jobs open, and so does a row with text the line does not show
	assert.deepEqual([...plots.querySelectorAll("thead th")].map((x) => x.textContent), ["Name", "Kind", "Stage", "Open jobs", "Due", "A note for the gardener"]);
	assert.equal(plots.querySelectorAll("tbody tr").length, json.plots.rows.length);
	assert.equal(plots.querySelectorAll("tbody tr")[0].getAttribute("data-depth"), "0");
	press(plots.querySelector("details"));
	assert.ok(plots.querySelector(".booklet-q-trmore"), "the orchard opens to its text");
	assert.ok([...plots.querySelectorAll("tr.booklet-q-grouprow")].some((r) => r.textContent.trim() === "Jobs"), "and then its jobs, headed by the field");
	assert.ok(plots.textContent.includes("Eight apple trees and two pear trees."));
	// the read-only roundup: the same rows as cards
	assert.equal(roundup.getAttribute("data-booklet-view"), "cards");
	assert.equal(roundup.querySelectorAll(".booklet-q-cards > .booklet-q-card").length, json.plots.rows.length);
	// the harvest: a bar chart over the second key
	assert.equal(harvest.getAttribute("data-booklet-view"), "bars");
	assert.equal(harvest.querySelectorAll("li").length >= json.harvest.rows.length, true);
	// the requests: the third key reached through a dotted path
	assert.equal(requests.querySelectorAll(".booklet-q-row, summary").length >= json.inbox.requests.length, true);
	assert.equal(v.log.reads.length, 1, "one read of one file for four blocks");
	assert.equal(v.disk.writes, 0);
	v.close();
});

test("a dashboard of 462 rows at every depth: a table, a list and cards draw only the six top rows while shut, and every row when all are open", async () => {
	const d = fixture.make();
	assert.equal(fixture.count(d), 462);
	const v = open(fixture.bookletText(), { "garden.json": JSON.stringify(d) });
	v.view.go({ screen: "activity:/desk", tab: null, part: 0 });
	await v.settled();
	await until(() => v.queries().length === 3 && v.queries().every((q) => !q.querySelector(".booklet-q-quiet")), "the three queries");
	const [table, list, cards] = v.queries();
	assert.equal(table.querySelectorAll("tbody tr").length, 6);
	assert.equal(list.querySelector(".booklet-q-tree").children.length, 6);
	assert.equal(cards.querySelectorAll(".booklet-q-cards > .booklet-q-card").length, 6);
	for (const q of [table, list, cards]) {
		const t0 = Date.now();
		click(q.querySelector(".booklet-qc-openall"));
		const ms = Date.now() - t0;
		assert.ok(ms < 5000, `Open all took ${ms} ms`);
		console.log(`# info: Open all, ${q.getAttribute("data-booklet-view")}, 462 rows, jsdom: ${ms} ms`);
	}
	assert.equal(table.querySelectorAll("tbody tr.booklet-q-trow").length, 462);
	assert.equal(list.querySelectorAll("details").length, 462, "every row has fields the line does not show, so every row is a disclosure");
	assert.equal(list.querySelectorAll(".booklet-q-more").length, 462);
	v.close();
});

/* ---- accessibility ---- */

test("the disclosures are real: native details and summary with a name, no tabindex or role over them, spacers hidden from a screen reader", () => {
	for (const as of ["table", "list", "cards"]) {
		const v = open(note([`from: d\nas: ${as}\nlabel: title\nfields: title`]));
		const q = v.queries()[0];
		press(q.querySelector("details"));
		press(q.querySelectorAll("details")[1]);
		const ds = [...q.querySelectorAll("details")];
		assert.ok(ds.length >= 3, as);
		for (const d of ds) {
			const s = d.firstElementChild;
			assert.equal(s.tagName, "SUMMARY", `${as}: the first child of a details is its summary`);
			assert.ok(words(s).length > 0, `${as}: a summary has words to be read as its name`);
			assert.equal(s.getAttribute("tabindex"), null, `${as}: it is focusable as it is`);
			assert.equal(s.getAttribute("role"), null);
			assert.equal(d.getAttribute("role"), null);
		}
		for (const ind of q.querySelectorAll(".booklet-q-ind")) assert.equal(ind.getAttribute("aria-hidden"), "true");
		for (const h of q.querySelectorAll(".booklet-q-ghead")) assert.equal(h.getAttribute("role"), "heading");
		v.close();
	}
});

test("a row with no words on its line still has a name for a screen reader", () => {
	const rows = [{ id: "a", title: "", note2: "only this", kids: [{ id: "b", title: "B" }] }];
	for (const as of ["table", "list", "cards"]) {
		const v = open(note([`from: d\nas: ${as}\nlabel: title\nfields: title`], [["d", { rows }]]));
		const s = v.queries()[0].querySelector("details > summary");
		assert.equal(words(s), "Row", `${as}: named "Row"`);
		assert.ok(s.querySelector(".booklet-sr"), `${as}: in the screen-reader-only class`);
		v.close();
	}
});

test("the table's headings are real column headings, and the control's buttons are buttons with words", () => {
	const v = open(note(["from: d\nas: table\nfields: title, kind"], [["d", MANY]]));
	const q = v.queries()[0];
	assert.ok([...q.querySelectorAll("thead th")].every((th) => th.getAttribute("scope") === "col"));
	for (const b of q.querySelectorAll(".booklet-qc-openall, .booklet-qc-closeall")) {
		assert.equal(b.tagName, "BUTTON");
		assert.equal(b.getAttribute("type"), "button");
		assert.ok(words(b));
	}
	v.close();
});

/* ---- review fixes: a card's lines, a failed read, a BOM, an unchanged read, a change during the first read, retained boxes ---- */

test("a card that opens shows the query's fields: lines on its closed face, in the summary, and not again inside its body", () => {
	const v = open(note(["from: d\nas: cards\nlabel: title\nfields: kind"]));
	const q = v.queries()[0];
	const folds = [...q.querySelectorAll(".booklet-q-fold")];
	assert.equal(folds.length, 2);
	for (const f of folds) {
		const dl = f.querySelector("details > summary dl");
		assert.ok(dl, "the lines are on the closed card's face, inside its summary");
		assert.deepEqual(dts(dl), ["Kind"]);
	}
	assert.match(words(folds[0]), /Kind\s*hub/, "and the shut card says them in words");
	const d = folds[0].querySelector("details");
	press(d);
	assert.equal(d.querySelectorAll(":scope > summary dl").length, 1, "the lines stay in the summary, once");
	assert.deepEqual([...d.querySelectorAll(":scope > .booklet-q-fold-body > dl")].map((x) => x.className), ["booklet-q-more"], "and the body holds only the open part's own list");
	v.close();
});

test("a card that does not open and one that does show the same lines when shut", () => {
	const flat = { fields: { title: "Name", kind: "Kind" }, rows: [{ id: "a", title: "A", kind: "x" }] };
	const plain = open(note(["from: d\nas: cards\nlabel: title\nfields: kind"], [["d", flat]])).queries()[0];
	const fold = open(note(["from: d\nas: cards\nlabel: title\nfields: kind"])).queries()[0];
	assert.deepEqual(dts(plain), ["Kind"]);
	assert.deepEqual(dts(fold.querySelector(".booklet-q-fold")), ["Kind"], "shut, as a card with nothing to open");
});

test("a file that cannot be read again keeps the rows already on screen: half-written, not JSON, or gone", async () => {
	const v = open(fileNote(), { "dash.json": PLOTS });
	await until(() => v.queries()[0].querySelector("details"), "the rows");
	press(v.queries()[0].querySelector("details"));
	const shown = labels(v.queries()[0]);
	assert.deepEqual(shown, ["Garden", "Beds", "Pond", "Orchard", "Shed"]);
	const before = v.log.stats;
	for (const [what, text] of [["half written", '{"plots":[{"id":"r0","ti'], ["not JSON", "<html>oops</html>"]]) {
		v.write("dash.json", text);
		v.events.get("modify")({ path: "dash.json" });
		await until(() => v.log.reads.length >= (what === "half written" ? 2 : 3), `the ${what} file to be read`);
		await v.settled();
		const q = v.queries()[0];
		assert.equal(quiet(q), undefined, `${what}: no quiet box`);
		assert.deepEqual(labels(q), shown, `${what}: the rows stay`);
		assert.equal(q.querySelector("details").open, true, `${what}: and the row the reader opened`);
	}
	v.remove("dash.json");
	v.events.get("delete")({ path: "dash.json" });
	await until(() => v.log.stats > before + 2, "a look at the gone file");
	await v.settled();
	assert.equal(quiet(v.queries()[0]), undefined, "a file that is gone: the rows stay");
	assert.deepEqual(labels(v.queries()[0]), shown);
	const changed = JSON.parse(PLOTS);
	changed.plots[1].title = "Orchard (renamed)";
	v.write("dash.json", JSON.stringify(changed));
	v.events.get("create")({ path: "dash.json" });
	await until(() => labels(v.queries()[0])[3] === "Orchard (renamed)", "a good file to be drawn again");
	assert.equal(v.queries()[0].querySelector("details").open, true);
	v.close();
});

test("a file that was never read well still gets the quiet box, and is drawn when it reads", async () => {
	const v = open(fileNote(), { "dash.json": "{ not json" });
	await until(() => /is not JSON/.test(quiet(v.queries()[0]) ?? ""), "the quiet box");
	v.write("dash.json", PLOTS);
	v.back();
	await until(() => labels(v.queries()[0]).length === 3, "the rows");
	v.close();
});

test("a file with a UTF-8 byte order mark at its start is read as the file it is", async () => {
	const v = open(fileNote(), { "dash.json": "\uFEFF" + PLOTS });
	await until(() => v.queries()[0].querySelector("details") || /not JSON/.test(quiet(v.queries()[0]) ?? ""), "the read");
	assert.equal(quiet(v.queries()[0]), undefined);
	assert.deepEqual(labels(v.queries()[0]), ["Garden", "Orchard", "Shed"]);
	v.close();
});

test("a read that holds the same text as the last good one does not draw the query again; a different one does", async () => {
	const v = open(fileNote(), { "dash.json": PLOTS });
	await until(() => v.queries()[0].querySelector("details"), "the rows");
	const first = v.queries()[0].querySelector("details");
	const reads = v.log.reads.length;
	v.write("dash.json", PLOTS);
	v.events.get("modify")({ path: "dash.json" });
	await until(() => v.log.reads.length === reads + 1, "the file to be read again");
	await v.settled();
	assert.equal(v.queries()[0].querySelector("details"), first, "the same rows, not drawn again");
	v.write("dash.json", PLOTS.replace("Garden", "Gardens"));
	v.events.get("modify")({ path: "dash.json" });
	await until(() => labels(v.queries()[0])[0] === "Gardens", "the new rows");
	assert.notEqual(v.queries()[0].querySelector("details"), first);
	v.close();
});

test("the same error twice does not draw the quiet box again", async () => {
	const v = open(fileNote(), { "dash.json": "{ not json" });
	await until(() => /is not JSON/.test(quiet(v.queries()[0]) ?? ""), "the quiet box");
	const box = v.queries()[0].querySelector(".booklet-q-quiet");
	v.write("dash.json", "{ still not json");
	v.events.get("modify")({ path: "dash.json" });
	await until(() => v.log.reads.length === 2, "the second read");
	await v.settled();
	assert.equal(v.queries()[0].querySelector(".booklet-q-quiet"), box);
	v.close();
});

test("a change that lands while the first read is under way is picked up when that read ends", async () => {
	const v = open(fileNote(), { "dash.json": PLOTS }, "Note.booklet.md", true);
	await until(() => v.log.reads.length === 1, "the first read to begin");
	assert.match(quiet(v.queries()[0]), /Loading/);
	v.write("dash.json", PLOTS.replace("Garden", "Gardens"));
	v.events.get("modify")({ path: "dash.json" });
	await v.settled();
	v.gate.release();
	await until(() => labels(v.queries()[0])[0] === "Gardens", "the file as it is now");
	assert.equal(v.log.reads.length, 2, "read once more, not more");
	v.close();
});

test("a query drawn again does not leave its old box held for printing: one entry for each query on screen", async () => {
	const v = open(note(["from: d\nas: list\nlabel: title"]));
	assert.equal(v.view.printable.size, 1);
	for (let n = 0; n < 4; n++) await v.away();
	assert.equal(v.view.printable.size, 1, "the old boxes are let go");
	assert.ok([...v.view.printable.values()].every((q) => q.box.isConnected));
	v.view.go({ screen: "home", tab: null, part: 0 });
	await v.settled();
	assert.equal(v.view.printable.size, 0, "a screen with no query holds none");
	v.close();
});
