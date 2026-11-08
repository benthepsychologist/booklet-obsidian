/*
 * Adding and removing rows, the core's part: the query keys `add` and `delete` (bare, locked by a bare `readonly`, noted when they do
 * nothing), the data block's `idFormat` and `idPattern` beside `fields` (the fence over the file), the two entry keys `$add` and `$delete`
 * (kept byte for byte by the records writer, a moment of their own for a daily Finalize), and what is drawn while the data has not
 * followed an entry yet (pending adds at the end of their parent's rows, pending removals marked). Made-up orchard rows only.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { core, DRAWN, fence, fm, norm, assertOutsideUnchanged } from "./helpers.mjs";

process.env.TZ = "UTC";

const FIELDS = { title: { label: "Name", edit: "text" }, stage: { label: "Stage", edit: "choice", options: ["planning", "growing"] }, size: { label: "Size", edit: "number" }, kind: "Kind", jobs: "Jobs" };
const DATA = {
	fields: FIELDS,
	idFormat: "j-{n}",
	rows: [
		{ id: "j-1", title: "Prune", stage: "growing", kind: "Job", jobs: [{ id: "j-2", title: "Ladder", stage: "planning" }, { id: "j-3", title: "Burn", stage: "planning" }] },
		{ id: "j-4", title: "Stakes", stage: "planning", kind: "Job" },
	],
};
const data = (json, id) => "```booklet data\n" + JSON.stringify(json) + "\n```\n^" + id;
const note = (query, head = "repeat", blocks = [["d", DATA]], records = "") =>
	`${fm}\n> [!activity|show ${head}] Show\n\n${fence(query)}\n\n> [!data] Data\n\n${blocks.map(([id, j]) => data(j, id)).join("\n\n")}\n${records}`;
const plan = (text) => {
	const b = core.parseBooklet(text);
	const act = b.activities.find((a) => a.id === "show");
	const seg = act.segments.find((s) => s.type === "query");
	return { b, act, seg, p: core.planQuery(b, seg, { drawn: DRAWN, now: DRAWN, activity: act }) };
};
const entries = (items) => `\n%%\n> [!records] App record\n\n\`\`\`booklet entries show\n{"items":[\n${items.map((i) => JSON.stringify(i)).join(",\n")}\n]}\n\`\`\`\n%%\n`;
const flat = (p) => p.set.all;
const byId = (p, id) => flat(p).find((r) => r.id === id);

/* ---- the query keys ---- */

test("`add` and `delete` are read bare, or with a colon and nothing after it; words after the key are ignored and said", () => {
	const q = (body) => plan(note(body)).seg.query;
	assert.equal(q("from: d\nas: table").add, false);
	assert.equal(q("from: d\nas: table").delete, false);
	assert.equal(q("from: d\nas: table\nadd").add, true);
	assert.equal(q("from: d\nas: table\nadd:").add, true);
	assert.equal(q("from: d\nas: table\ndelete").delete, true);
	assert.equal(q("from: d\nas: table\nADD\nDelete").add, true, "the key's case does not matter, as a bare readonly's does not");
	const said = plan(note("from: d\nas: table\nadd: yes\ndelete: now"));
	assert.equal(said.seg.query.add, true);
	assert.equal(said.seg.query.delete, true);
	assert.ok(said.b.problems.some((p) => /`add: yes` has words after the key/.test(p)));
	assert.ok(said.b.problems.some((p) => /`delete: now` has words after the key/.test(p)));
	assert.deepEqual(plan(note("from: d\nas: table\nadd\ndelete")).b.unread, [], "neither is an unknown setting");
});

test("a query that says `add` or `delete` offers the controls on a table, a list and cards, and says nothing of them elsewhere", () => {
	for (const as of ["table", "list", "cards"]) {
		const { p, b } = plan(note(`from: d\nas: ${as}\nadd\ndelete`));
		assert.deepEqual({ add: p.acts.add, remove: p.acts.remove }, { add: true, remove: true }, as);
		assert.deepEqual(b.problems, [], as);
	}
	assert.equal(plan(note("from: d\nas: table")).p.acts, undefined, "a query without the keys offers nothing");
	assert.deepEqual({ ...plan(note("from: d\nas: table\nadd")).p.acts, fields: 0 }.remove, false);
	for (const as of ["tiles", "bars", "line"]) {
		const { p, b } = plan(note(`from: d\nas: ${as}\nlabel: title\nvalue: size\nadd`));
		assert.equal(p.acts, undefined, as);
		assert.ok(b.problems.some((x) => new RegExp(`\`add\` does nothing on ${as}`).test(x)), `${as} is told it does nothing`);
	}
});

test("a bare `readonly` locks both; `readonly: a, b` (a list of fields) does not", () => {
	const locked = plan(note("from: d\nas: table\nadd\ndelete\nreadonly")).p;
	assert.equal(locked.acts, undefined, "neither is offered");
	const listed = plan(note("from: d\nas: table\nadd\ndelete\nreadonly: title, stage")).p.acts;
	assert.deepEqual({ add: listed.add, remove: listed.remove }, { add: true, remove: true });
	assert.deepEqual(listed.fields.map((f) => f.key), ["size"], "a field the query locks is not asked for in the form");
});

test("the keys need an activity that keeps entries (repeat, not repeat daily) and a data block: the linter-style notes say so", () => {
	assert.ok(plan(note("from: d\nas: table\nadd", "")).b.problems.some((x) => /needs its activity to keep entries/.test(x)));
	assert.ok(plan(note("from: d\nas: table\ndelete", "repeat daily")).b.problems.some((x) => /needs its activity to keep entries/.test(x)));
	assert.deepEqual(plan(note("from: d\nas: table\nadd", "repeat")).b.problems, []);
	const onAnswers = `${fm}\n> [!activity|show repeat] Show\n\n> [!text|t] T\n\n${fence("from: show\nadd")}\n`;
	assert.ok(core.parseBooklet(onAnswers).problems.some((x) => /changes the rows of a data block, and this query reads kept entries/.test(x)));
});

/* ---- the data block's id format ---- */

test("the form asks for each field the block marks edit, in the block's declared order, and for the id only when there is no format", () => {
	const { p } = plan(note("from: d\nas: table\nadd"));
	assert.deepEqual(p.acts.fields.map((f) => [f.key, f.label, f.spec.kind]), [["title", "Name", "text"], ["stage", "Stage", "choice"], ["size", "Size", "number"]]);
	assert.equal(p.acts.idFormat, "j-{n}");
	assert.equal(p.acts.idProblem, null);
	const none = plan(note("from: d\nas: table\nadd", "repeat", [["d", { ...DATA, idFormat: undefined, idPattern: "^[a-z-]+$" }]])).p.acts;
	assert.equal(none.idFormat, undefined);
	assert.equal(none.idPattern, "^[a-z-]+$");
});

test("an id format that cannot be read is said in words and offers no Add; a bad pattern too, when there is no format", () => {
	for (const bad of ["{nope}", "", "a{", 7, null]) {
		const acts = plan(note("from: d\nas: table\nadd", "repeat", [["d", { ...DATA, idFormat: bad }]])).p.acts;
		assert.equal(acts.idProblem, core.ID_WORDS.formatBad, JSON.stringify(bad));
	}
	const pat = plan(note("from: d\nas: table\nadd", "repeat", [["d", { ...DATA, idFormat: undefined, idPattern: "(" }]])).p.acts;
	assert.equal(pat.idProblem, core.ID_WORDS.patternBad);
	// a pattern is not used when a format is declared
	assert.equal(plan(note("from: d\nas: table\nadd", "repeat", [["d", { ...DATA, idPattern: "(" }]])).p.acts.idProblem, null);
});

test("the fence's idFormat and idPattern win over the file's, as `fields` do; a plain-list file can hold them only in the fence", () => {
	const file = { d: { fields: { t: "T" }, rows: [{ id: "a" }], idFormat: "f-{n}", idPattern: "^f" } };
	const book = core.parseBooklet(`${fm}\n> [!activity|show repeat] Show\n\n${fence("from: d\nas: table\nadd")}\n\n\`\`\`booklet data f.json d\n{"idFormat":"fence-{n}"}\n\`\`\`\n^d\n`);
	const block = book.data[0];
	assert.equal(block.idFormat, "fence-{n}");
	assert.equal(block.idPattern, undefined);
	const got = core.dataMerge(core.dataRead(block.file, file), { fields: block.fields, edits: block.edits, idFormat: block.idFormat, idPattern: block.idPattern });
	assert.equal(got.data.idFormat, "fence-{n}", "the fence's value");
	assert.equal(got.data.idPattern, "^f", "the file's, where the fence is silent");
	const plain = core.dataMerge(core.dataRead({ name: "f.json", path: "", bad: false }, [{ id: "a" }]), { fields: null, edits: {}, idFormat: "x-{n}" });
	assert.equal(plain.data.idFormat, "x-{n}");
	const noFence = core.dataMerge(core.dataRead(block.file, file), null);
	assert.equal(noFence.data.idFormat, "f-{n}");
});

/* ---- the entries ---- */

const ADD = { $add: [{ pick: "j-5", under: "j-1", row: { title: "Weed", stage: "planning" } }], ts: "2026-11-08T10:42:00Z" };
const DEL = { $delete: [{ pick: "j-4", was: { id: "j-4", title: "Stakes", stage: "planning", kind: "Job" } }], ts: "2026-11-08T10:43:10Z" };

test("an entry with `$add` or `$delete` is read as it is written and is a moment of its own", () => {
	const b = core.parseBooklet(note("from: d\nas: table\nadd\ndelete", "repeat", [["d", DATA]], entries([ADD, DEL])));
	const kept = b.records.entries[""].show;
	assert.deepEqual(norm(kept), [ADD, DEL]);
	assert.deepEqual(norm(core.addPairs(kept[0])), [{ pick: "j-5", under: "j-1", row: { title: "Weed", stage: "planning" } }]);
	assert.deepEqual(norm(core.deletePairs(kept[1])), [{ pick: "j-4", was: DEL.$delete[0].was }]);
	assert.equal(core.isRowActEntry(kept[0]), true);
	assert.equal(core.isActEntry(b.activities[0], kept[0]), true);
	assert.equal(core.isActEntry(b.activities[0], kept[1]), true);
	assert.equal(core.isRowActEntry({ ts: "x", other: 1 }), false);
});

test("pairs that are not pairs are not read: no pick, a pick that is empty, an under that is not a pick, a was that is no object", () => {
	assert.deepEqual(core.addPairs({ ts: "x", $add: [{ row: {} }, { pick: "" }, { pick: "a", under: {} }, 5, null, { pick: 3, row: { id: "no", n: 1, bad: {}, ok: null } }] }), [{ pick: 3, row: { n: 1, ok: null } }]);
	assert.deepEqual(core.deletePairs({ ts: "x", $delete: [{ pick: "a" }, { pick: "a", was: [] }, { pick: "a", was: 1 }, { pick: "b", was: { id: "b" } }] }), [{ pick: "b", was: { id: "b" } }]);
	assert.deepEqual(core.addPairs({ ts: "x" }), []);
	assert.deepEqual(core.addPairs({ ts: "x", $add: "no" }), []);
});

test("the records writer keeps `$add` and `$delete` entries byte for byte, hand spacing included, when it keeps another entry", () => {
	const hand = `\n%%\n> [!records] App record\n\n\`\`\`booklet entries show\n{ "items":[ {"ts":"2026-11-08T10:42:00Z" ,"$add":[ {"pick":"j-5" ,"under":"j-1","row":{"title":"Weed"}} ]} ,\n  {"ts":"2026-11-08T10:43:10Z","$delete":[{"pick":"j-4","was":{"id":"j-4","title":"Stakes"}}]  } ] }\n\`\`\`\n%%\n`;
	const text = note("from: d\nas: table\nadd", "repeat", [["d", DATA]], hand);
	const kept = core.keepEntry(text, "", "show", { title: [{ pick: "j-1", a: "New", was: "Prune" }] }, { ts: "2026-11-08T11:00:00Z" });
	assertOutsideUnchanged(text, kept.text, "kept");
	assert.equal(kept.text.includes(`{"ts":"2026-11-08T10:42:00Z" ,"$add":[ {"pick":"j-5" ,"under":"j-1","row":{"title":"Weed"}} ]} ,\n  {"ts":"2026-11-08T10:43:10Z","$delete":[{"pick":"j-4","was":{"id":"j-4","title":"Stakes"}}]  } `), true, "the two entries as written");
	// an add and a delete are kept as new entries, the key as is
	const A = { ...ADD, ts: "2026-11-08T10:50:00Z" };
	const D = { ...DEL, ts: "2026-11-08T10:51:00Z" };
	const add = core.keepEntry(text, "", "show", { $add: A.$add }, { ts: A.ts });
	assert.deepEqual(norm(core.parseBooklet(add.text).records.entries[""].show.at(-1)), A);
	assertOutsideUnchanged(text, add.text, "an add");
	const del = core.keepEntry(add.text, "", "show", { $delete: D.$delete }, { ts: D.ts });
	assert.deepEqual(norm(core.parseBooklet(del.text).records.entries[""].show.slice(-2)), [A, D]);
	assert.equal(del.text.includes(`{"ts":"2026-11-08T10:42:00Z" ,"$add":[ {"pick":"j-5" ,"under":"j-1","row":{"title":"Weed"}} ]} ,`), true, "the hand-spaced entries are still as written");
	// two kept in the same second: the later one moves to the next free second
	const again = core.keepEntry(del.text, "", "show", { $add: [{ pick: "j-6", row: {} }] }, { ts: A.ts });
	assert.equal(again.entry.ts, "2026-11-08T10:50:01Z");
});

test("a daily Finalize neither replaces an entry that adds or removes a row nor takes its time", () => {
	const daily = `${fm}\n> [!activity|show repeat daily] Show\n\n> [!text|t] T\n\n${entries([{ ts: "2026-11-08T10:42:00Z", ...ADD }])}`;
	const text = core.setDraftAnswer(daily.replace(/"ts":"[^"]*"/, '"ts":"2026-11-08T10:42:00Z"'), "", "show", "t", "words");
	const rule = { today: "2026-11-08", until: Date.parse("2026-11-08T23:59:59Z"), dayOf: (ts) => ts.slice(0, 10) };
	const done = core.finalizeDraft(text, "", "show", { ts: "2026-11-08T10:42:00Z", rule });
	assert.equal(done.replaced, false, "the add's entry was not the day's entry");
	const kept = core.parseBooklet(done.text).records.entries[""].show;
	assert.equal(kept.length, 2);
	assert.equal(kept.some((e) => core.isRowActEntry(e)), true);
});

/* ---- what is drawn while the data has not followed ---- */

test("an add whose pick the data does not hold is a row drawn at the end of its parent's rows, marked adding; once the data holds it, plain and once", () => {
	const text = note("from: d\nas: table\nadd\ndelete", "repeat", [["d", DATA]], entries([ADD]));
	const { p } = plan(text);
	const rows = flat(p);
	assert.deepEqual(rows.map((r) => r.id), ["j-1", "j-2", "j-3", "j-5", "j-4"], "after the parent's last child");
	assert.equal(byId(p, "j-5").act, "adding");
	assert.equal(byId(p, "j-5").cells.title.text, "Weed");
	assert.equal(byId(p, "j-5").cells.stage.text, "planning");
	assert.equal(p.tree.kids.get(byId(p, "j-1")).length, 3);
	assert.equal(rows.filter((r) => r.act).length, 1);
	// the data now holds the row: drawn from the data, not marked, and not twice
	const held = { ...DATA, rows: [{ ...DATA.rows[0], jobs: [...DATA.rows[0].jobs, { id: "j-5", title: "Weed", stage: "planning" }] }, DATA.rows[1]] };
	const after = plan(note("from: d\nas: table\nadd\ndelete", "repeat", [["d", held]], entries([ADD]))).p;
	assert.equal(flat(after).filter((r) => r.id === "j-5").length, 1);
	assert.equal(byId(after, "j-5").act, undefined);
});

test("a top add goes last among the top rows; a parent that is gone or holds no one list of rows draws nothing", () => {
	const top = { $add: [{ pick: "j-9", row: { title: "Top" } }], ts: "2026-11-08T10:50:00Z" };
	const p = plan(note("from: d\nas: table\nadd", "repeat", [["d", DATA]], entries([top]))).p;
	assert.deepEqual(p.tree.roots.map((r) => r.id), ["j-1", "j-4", "j-9"]);
	const lost = { $add: [{ pick: "j-9", under: "nobody", row: {} }], ts: "2026-11-08T10:50:00Z" };
	assert.deepEqual(flat(plan(note("from: d\nas: table\nadd", "repeat", [["d", DATA]], entries([lost]))).p).map((r) => r.id), ["j-1", "j-2", "j-3", "j-4"]);
	const noKids = { $add: [{ pick: "j-9", under: "j-4", row: {} }], ts: "2026-11-08T10:50:00Z" };
	assert.deepEqual(flat(plan(note("from: d\nas: table\nadd", "repeat", [["d", DATA]], entries([noKids]))).p).map((r) => r.id), ["j-1", "j-2", "j-3", "j-4"], "a parent with no children yet cannot take its first child");
});

test("the data given to the plan is never changed by drawing a pending add", () => {
	const text = note("from: d\nas: table\nadd", "repeat", [["d", DATA]], entries([ADD]));
	const b = core.parseBooklet(text);
	const before = JSON.stringify(b.data[0].rows);
	const act = b.activities[0];
	core.planQuery(b, act.segments.find((s) => s.type === "query"), { drawn: DRAWN, activity: act });
	assert.equal(JSON.stringify(b.data[0].rows), before);
});

test("a later act on the same pick wins: add, remove, add back", () => {
	const gone = { $delete: [{ pick: "j-5", was: { id: "j-5", title: "Weed", stage: "planning" } }], ts: "2026-11-08T10:44:00Z" };
	const back = { $add: [{ pick: "j-5", under: "j-1", row: { title: "Weed again" } }], ts: "2026-11-08T10:45:00Z" };
	assert.equal(byId(plan(note("from: d\nas: table\nadd", "repeat", [["d", DATA]], entries([ADD, gone]))).p, "j-5"), undefined, "added then removed: not drawn (the data never held it)");
	const p = plan(note("from: d\nas: table\nadd", "repeat", [["d", DATA]], entries([ADD, gone, back]))).p;
	assert.equal(byId(p, "j-5").cells.title.text, "Weed again");
	assert.equal(byId(p, "j-5").act, "adding");
});

test("a removal whose row the data still holds as the reader saw it is marked removing; one that changed since is marked refused; a gone row is gone", () => {
	const row = DATA.rows[1];
	const del = (was) => ({ $delete: [{ pick: "j-4", was }], ts: "2026-11-08T10:43:10Z" });
	const mk = (was, rows = DATA.rows) => plan(note("from: d\nas: table\ndelete", "repeat", [["d", { ...DATA, rows }]], entries([del(was)]))).p;
	assert.equal(byId(mk(row), "j-4").act, "removing");
	assert.equal(byId(mk({ ...row, title: "Other" }), "j-4").act, "refused", "the data changed since the reader drew it");
	assert.equal(byId(mk(row, [DATA.rows[0]]), "j-4"), undefined, "gone from the data: nothing to mark");
	const removed = mk(row, DATA.rows);
	assert.equal(flat(removed).filter((r) => r.act).length, 1);
	// key order does not matter for "as the reader saw it"
	assert.equal(byId(mk({ kind: "Job", stage: "planning", title: "Stakes", id: "j-4" }), "j-4").act, "removing");
});

test("pending acts are drawn only for an activity that keeps entries (not repeat daily, not a plain activity)", () => {
	const daily = plan(note("from: d\nas: table\nadd", "repeat daily", [["d", DATA]], entries([ADD]))).p;
	assert.equal(flat(daily).length, 4);
	const plain = plan(note("from: d\nas: table\nadd", "", [["d", DATA]], entries([ADD]))).p;
	assert.equal(flat(plain).length, 4);
});

test("rows under a row are counted at every depth (the confirmation says how many)", () => {
	assert.equal(core.rowsUnder(DATA.rows[0]), 2);
	assert.equal(core.rowsUnder(DATA.rows[1]), 0);
	assert.equal(core.rowsUnder({ id: "x", k: [{ id: "y", k: [{ id: "z" }, { id: "w", k: [{ id: "v" }] }] }] }), 4);
	assert.equal(core.rowsUnder({ id: "x", one: { id: "y" } }), 1);
});

test("the ids to make against are every id at every depth, as written, then the adds still waiting", () => {
	assert.deepEqual(core.rowIds(DATA.rows, [ADD]), ["j-1", "j-2", "j-3", "j-4", "j-5"], "the waiting add's id comes after the block's own");
	assert.deepEqual(core.rowIds(DATA.rows, []), ["j-1", "j-2", "j-3", "j-4"]);
	assert.deepEqual(core.rowIds(DATA.rows, [ADD, ADD]), ["j-1", "j-2", "j-3", "j-4", "j-5"], "an add kept twice is one id");
	assert.deepEqual(core.rowIds([...DATA.rows, { id: "j-5" }], [ADD]), ["j-1", "j-2", "j-3", "j-4", "j-5"], "an add the data already holds is not counted twice");
	assert.deepEqual(core.rowIds([{ id: "a" }, { id: "a" }, { id: 7 }, { title: "no id" }], []), ["a", "a", 7]);
});
