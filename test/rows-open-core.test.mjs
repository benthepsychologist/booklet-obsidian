/*
 * Rows that open and data files, the core's part (format 0.19; SPEC sections 5, 6 and 7): a data row that holds a list of rows, or one
 * row, has children; `parent:` nests flat rows; both make one tree by one rule. What a row opens to (its other fields, per row). The
 * fence that names a file and its key path, and what a file holds at a key path. The `readonly` key (read, kept, ignored), and an
 * `each:` that names a data block (read clean, drawn by the view as its title and a line). Made-up garden rows only.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { core, DRAWN, fence, fm, rowsOf } from "./helpers.mjs";

process.env.TZ = "UTC";

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
const planOf = (text, opts = {}) => {
	const b = core.parseBooklet(text);
	const seg = b.activities.find((a) => a.id === "show").segments.find((s) => s.type === "query");
	return { b, seg, p: core.planQuery(b, seg, { drawn: DRAWN, now: DRAWN, ...opts }) };
};
const ids = (rows, k = "id") => rows.map((r) => r.cells[k]?.text);

/* ---- reading the rows ---- */

test("a data row that holds a list of rows, or one row, reads clean; a list that mixes values and rows is refused, at any depth", () => {
	const ok = core.parseBooklet(note(["from: d\nas: table"]));
	assert.deepEqual(ok.problems, []);
	assert.deepEqual(core.parseBooklet(note(["from: d"], [["d", [{ id: "a", one: { id: "b" } }]]])).problems, [], "a field that holds one row (an object) is a child too");
	const bad = (rows) => core.parseBooklet(note(["from: d"], [["d", rows]])).problems.join("\n");
	assert.match(bad([{ x: [1, { id: "b" }] }]), /mixes values and rows/);
	assert.match(bad([{ x: [{ y: [1, { z: 1 }] }] }]), /mixes values and rows/, "at the second depth too");
	assert.match(bad([{ x: [{ id: "b" }, 3] }]), /mixes values and rows/);
	assert.match(bad([{ x: [{ id: "b" }, [1]] }]), /mixes values and rows/);
});

test("a field's label in `fields` is a string, or an object with a label, an edit kind and options: read and kept, not acted on", () => {
	const ok = core.readDataRows({ fields: { a: "A", b: { label: "B", edit: "choice", options: ["x", "y"] }, c: { edit: "text" } }, rows: [{ a: 1, b: "x", c: "t" }] });
	assert.equal(ok.bad, undefined);
	assert.deepEqual({ ...ok.fields }, { a: "A", b: "B", c: "c" }, "an object without a label is labelled by its key");
	assert.deepEqual(JSON.parse(JSON.stringify(ok.edits)), { b: { edit: "choice", options: ["x", "y"] }, c: { edit: "text" } });
	assert.match(core.readDataRows({ fields: { a: { label: 3 } }, rows: [] }).bad, /`fields` that is not an object of labels/);
	assert.match(core.readDataRows({ fields: { a: 3 }, rows: [] }).bad, /`fields` that is not an object of labels/);
});

test("a chain 4000 rows deep is read and walked without a stack overflow, and draws its top row", () => {
	let chain = '{"id":"end"}';
	for (let i = 3999; i >= 0; i--) chain = `{"id":"x${i}","kids":[${chain}]}`;
	const { b, p } = planOf(note(["from: d\nas: list\nlabel: id"], [["d", `[${chain}]`]]));
	assert.deepEqual(b.problems, []);
	assert.equal(p.set.all.length, 4001);
	assert.equal(p.tree.roots.length, 1);
	assert.equal(p.tree.flat.length, 4001);
});

test("every row at every depth is in `all`, in the file's order, and a field that holds rows is never a column or a line", () => {
	const { p } = planOf(note(["from: d\nas: list\nlabel: title"]));
	assert.equal(ids(p.set.all).join(), "p1,j1,r1,r2,j2,p2,p3");
	assert.equal(p.set.own.join(), "title,kind,about,notes");
	assert.deepEqual([...p.set.kidKeys].sort(), ["items", "projects"]);
});

test("a field holds child rows in the rows that have them and is a plain value in a row that does not", () => {
	const MIX = { fields: { title: "Name", items: "Items", extra: "Extra" }, rows: [{ id: "a", title: "Has kids", items: [{ id: "a1", title: "Kid" }] }, { id: "b", title: "Plain note", items: "n/a for this one", extra: "x" }] };
	const { p } = planOf(note(["from: d\nas: list\nlabel: title\nfields: title"], [["d", MIX]]));
	const [a, b] = p.set.rows;
	assert.equal(p.tree.groups.get(a)[0].label[0].text, "Items", "row a's items are its children");
	assert.equal(p.tree.groups.has(b), false);
	assert.deepEqual(p.tree.more(b).map((f) => [f.label[0].text, f.text]), [["Extra", "x"], ["Items", "n/a for this one"]], "and a plain value in row b, shown in its open part (the source's own fields first, then the row's others)");
	assert.deepEqual(p.tree.more(a), [], "row a's items are children, not a value");
	assert.equal(p.set.own.includes("items"), false);
});

/* ---- the open part ---- */

test("what a row opens to: its other fields, own to the row, under their labels, as plain text with its line breaks kept; never the line's fields, roles, id, parent or group", () => {
	const rows = [
		{ id: "a", title: "A", n: 3, kind: "k", parent: "", hid: "h", note: "N" },
		{ id: "b", title: "B", late: "only in a later row", kids: [{ id: "c", title: "C", secret: "only in the child" }] },
	];
	const { p } = planOf(note(["from: d\nas: list\nlabel: title\nvalue: n\nnote: note\nfields: title"], [["d", rows]]));
	const [a, b] = p.set.rows;
	assert.deepEqual(p.tree.more(a).map((f) => f.key), ["kind", "hid"], "no id, no parent field, no role field (value n, note note, label title), and not the line's field");
	assert.deepEqual(p.tree.more(b).map((f) => f.key), ["late"], "a key the first row lacks");
	const c = p.tree.groups.get(b)[0].rows[0];
	assert.deepEqual(p.tree.more(c).map((f) => [f.key, f.text]), [["secret", "only in the child"]], "at every depth");
	assert.ok(core.opensRow(p.tree, a) && core.opensRow(p.tree, b) && core.opensRow(p.tree, c));
	const text = planOf(note(["from: d\nas: list\nlabel: title\nfields: title"], [["d", { rows: [{ id: "t", title: "T", about: "One.\n\nTwo." }] }]])).p;
	assert.equal(text.tree.more(text.set.rows[0])[0].text, "One.\n\nTwo.", "line breaks are kept");
});

test("a flat row with a field the line does not show opens too; with no `fields:` the line shows every plain field, so no row opens", () => {
	const flat = { fields: { title: "Name", kind: "Kind", about: "What it says" }, rows: [{ id: "a", title: "A", kind: "x", about: "Extra\n\nlines" }, { id: "b", title: "B" }] };
	for (const as of ["table", "list", "cards"]) {
		const { p } = planOf(note([`from: d\nas: ${as}\nlabel: title\nfields: title`], [["d", flat]]));
		assert.ok(p.tree, `${as}: a tree is made for rows that open`);
		assert.equal(p.tree.flat.length, 2);
		const [a, b] = p.set.rows;
		assert.equal(core.opensRow(p.tree, a), true, `${as}: row a opens`);
		assert.equal(core.opensRow(p.tree, b), false, `${as}: row b has nothing more`);
		assert.deepEqual(p.tree.more(a).map((f) => [f.label[0].text, f.text]), [["Kind", "x"], ["What it says", "Extra\n\nlines"]]);
		assert.equal(planOf(note([`from: d\nas: ${as}\nlabel: title`], [["d", flat]])).p.tree, undefined, `${as}: no row opens when the line shows every field`);
	}
});

test("a field named like a function on every object (constructor, toString) is read as the row's own value, or not at all", () => {
	const rows = [{ id: "a", title: "Plain" }, { id: "b", title: "Has it", constructor: "made by hand", toString: "also by hand" }];
	const { p } = planOf(note(["from: d\nas: list\nlabel: title\nfields: title"], [["d", { fields: { title: "Name", constructor: "Ctor", toString: "Text" }, rows }]]));
	const [a, b] = p.set.rows;
	assert.deepEqual(p.tree.more(a), [], "a row lacking them has no open part");
	assert.deepEqual(p.tree.more(b).map((f) => f.text), ["made by hand", "also by hand"]);
	assert.equal(p.tree.more(a).concat(p.tree.more(b)).some((f) => /native code|function/.test(f.text)), false);
});

/* ---- one tree, two ways to nest ---- */

test("rows nested by `parent` and rows nested as data are one tree: the same groups, the child by `parent` has no heading", () => {
	const rows = [{ id: "a", title: "A", parent: "", n: 1 }, { id: "a1", title: "A1", parent: "a", n: 2 }, { id: "b", title: "B", n: 3 }];
	const { p } = planOf(note(["from: d\nas: list\nlabel: title"], [["d", { rows }]]));
	const [a, a1, b] = p.set.rows;
	assert.deepEqual(p.tree.roots, [a, b]);
	assert.deepEqual(p.tree.groups.get(a).map((g) => [g.key, g.rows]), [[null, [a1]]], "one group with no heading");
	assert.deepEqual(p.tree.tops.map((g) => g.name), [null]);
	assert.equal(p.tree.keyOf.get(a1), "a1", "a row is kept open by its id");
	const { p: q } = planOf(note(["from: d\nas: list\nlabel: title"]));
	assert.deepEqual(q.tree.groups.get(q.set.rows[0]).map((g) => g.key), ["projects"], "a field that holds rows heads its group by the field");
	assert.deepEqual(q.tree.groups.get(q.set.rows[0])[0].label.map((x) => x.text), ["Projects"]);
});

test("`limit` counts top rows, and `group` is not drawn on rows that nest", () => {
	assert.equal(planOf(note(["from: d\nas: list\nlabel: title\nlimit: 2"])).p.tree.roots.length, 2);
	const { p } = planOf(note(["from: d\nas: table\ngroup: kind\nfields: title, kind"]));
	assert.deepEqual(p.tree.tops.map((g) => g.name), [null]);
});

test("a nest view's key for a row that has no id (or a repeated id) is its place, and a row can be opened by it", () => {
	const rows = [{ title: "A", kids: [{ title: "A1", x: "y" }] }, { id: "d", title: "D1", more: "m" }, { id: "d", title: "D2", more: "m" }];
	const { p } = planOf(note(["from: d\nas: list\nlabel: title\nfields: title"], [["d", rows]]));
	const keys = p.tree.flat.map((r) => p.tree.keyOf.get(r));
	assert.equal(new Set(keys).size, keys.length, "no two rows share a key");
	assert.equal(keys.includes("d"), true);
});

/* ---- the reader's filter, sort and Open all on a tree ---- */

test("a search keeps a match with its parents, which stand open while it is on; a sort reorders each set of siblings", () => {
	const many = { fields: FIELDS, rows: [{ id: "r1", title: "Root one", n: 2, items: [1, 2, 3, 4, 5, 6, 7, 8].map((i) => ({ id: "c" + i, title: "Child " + "ABCDEFGH"[i - 1], n: 9 - i })) }, { id: "r2", title: "Root two", n: 1 }] };
	const { p } = planOf(note(["from: d\nas: list\nlabel: title\nfields: n"], [["d", many]]));
	const st = core.newViewState();
	st.q = "child c";
	const s = core.applyViewState(p, st);
	assert.equal(s.shown, 1);
	assert.deepEqual(s.plan.tree.flat.map((r) => r.cells.title.text), ["Root one", "Child C"]);
	assert.deepEqual([...s.force].map((r) => r.cells.title.text), ["Root one"]);
	assert.equal(st.opens.size, 0, "a search never opens a row for the reader");
	st.q = "";
	st.key = "n";
	const t = core.applyViewState(p, st);
	assert.deepEqual(t.plan.tree.roots.map((r) => r.cells.title.text), ["Root two", "Root one"]);
	assert.deepEqual(t.plan.tree.groups.get(p.set.rows[0])[0].rows.map((r) => r.cells.title.text), ["Child H", "Child G", "Child F", "Child E", "Child D", "Child C", "Child B", "Child A"]);
});

test("Open all opens every row that opens, not only the ones a search keeps; the plan's rows are every row of the tree", () => {
	const { p } = planOf(note(["from: d\nas: list\nlabel: title"]));
	const st = core.newViewState();
	st.q = "zzz-nothing";
	core.openAllRows(p, st);
	assert.deepEqual([...st.opens].sort(), ["j1", "p1"], "the two rows that hold rows (the line shows every plain field, so no other row opens)");
	assert.equal(rowsOf(p).length, 7);
});

/* ---- a data file's name and key path ---- */

const fenceNote = (info, body = "") =>
	`${fm}\n> [!activity|show] Show\n\n${fence("from: d")}\n\n\`\`\`booklet data ${info}\n${body}\n\`\`\`\n^d\n`;
const fileOf = (info, body) => {
	const b = core.parseBooklet(fenceNote(info, body));
	return { b, block: b.activities.find((a) => a.id === "show").segments.find((s) => s.type === "query")?.source?.block ?? null };
};

test("a data fence that names a file reads clean with an empty body; the block carries the name and key path, and no rows", () => {
	const { b, block } = fileOf("dash.json programmes");
	assert.deepEqual(b.problems, []);
	assert.equal(b.unread.length, 0);
	assert.deepEqual(block.file, { name: "dash.json", path: "programmes", bad: false });
	assert.equal(block.rows.length, 0);
});

test("its body may hold only `fields`, which label the file's keys, and `rows` in the body are said and not read", () => {
	const { block } = fileOf("dash.json", '{"fields":{"t":{"label":"Name","edit":"text"}}}');
	assert.equal(block.fields.t, "Name");
	assert.deepEqual(JSON.parse(JSON.stringify(block.edits)), { t: { edit: "text" } });
	const r = fileOf("dash.json", '{"rows":[{"a":1}]}');
	assert.ok(r.b.problems.some((p) => /its rows were not read/.test(p)));
	assert.equal(r.block.rows.length, 0);
	assert.ok(fileOf("dash.json", "[1]").b.problems.some((p) => /may hold only/.test(p)));
});

test("a name that is not a plain relative .json name is said and never read; the block keeps its place, marked", () => {
	for (const bad of ["../x.json", "/x.json", "a//b.json", ".hidden.json", "x.txt", "a:b.json", "x.json?q=1", "a\\b.json", "https://x.org/a.json", "a/../b.json", "a/./b.json"]) {
		const { b, block } = fileOf(bad);
		assert.ok(b.problems.some((p) => /never read/.test(p)), `${bad}: said`);
		assert.equal(block.file.bad, true, `${bad}: marked`);
	}
	assert.ok(fileOf("a".repeat(196) + ".json").b.problems.some((p) => /never read/.test(p)), "201 characters is refused");
	assert.equal(fileOf("a".repeat(195) + ".json").block.file.bad, false, "200 characters is read");
	for (const ok of ["dash.json", "sub/dash.json", "a-b_c.d.json"]) assert.equal(fileOf(ok).block.file.bad, false, ok);
});

test("a key path of keys of letters, digits, _ and - joined by dots is read; any other is said and never read", () => {
	for (const ok of ["a", "a.b", "plots_1.in-box.Requests2"]) assert.equal(fileOf("dash.json " + ok).block.file.bad, false, ok);
	for (const bad of ["a..b", "a$b.c", "a+b", "a:b", "a/b", "a.", "é.x"]) {
		const { b, block } = fileOf("dash.json " + bad);
		assert.ok(b.problems.some((p) => /not keys of letters, digits, _ and -/.test(p)), `${bad}: said`);
		assert.equal(block.file.bad, true, `${bad}: marked`);
	}
});

test("the vault path of a file name is the note's own folder, then the name; a name that is never read has none", () => {
	assert.equal(core.dataVaultPath("Notes/Garden.booklet.md", "dash.json"), "Notes/dash.json");
	assert.equal(core.dataVaultPath("Garden.booklet.md", "sub/dash.json"), "sub/dash.json");
	assert.equal(core.dataVaultPath("Notes/Garden.booklet.md", "../x.json"), null);
	assert.equal(core.dataFilePath("x.json"), "x.json");
	assert.equal(core.dataFilePath(7), null);
});

test("a key path walks object members only: through a list it finds nothing; it reads the list, or the object with `rows`, at its end", () => {
	const json = { a: [{ id: "x" }, { id: "y" }], o: { rows: [{ id: "r" }] } };
	const at = (path) => core.dataRead({ name: "d.json", path, bad: false }, json);
	assert.ok(at("a.1").note, "through a list: nothing");
	assert.ok(at("a.0.id").note);
	assert.match(at("zz").note, /has nothing at “zz”/);
	assert.equal(at("a").d.rows.length, 2);
	assert.equal(at("o").d.rows[0].id, "r");
	assert.match(core.dataRead({ name: "d.json", path: "", bad: false }, { nope: 1 }).note, /holds no list of rows/);
	assert.match(core.dataRead({ name: "d.json", path: "a", bad: false }, { a: [{ x: [1, { y: 1 }] }] }).note, /mixes values and rows/);
	const walk = (p) => core.dataRead({ name: "d.json", path: p, bad: false }, { constructor: [{ id: "x" }] });
	assert.ok(walk("toString").note, "an inherited member is not a key");
});

test("a block's own fence labels are laid over the file's, block by block, and its edit marks too", () => {
	const found = core.dataRead({ name: "d.json", path: "", bad: false }, { fields: { a: "A", b: { label: "B", edit: "text" } }, rows: [{ a: 1, b: 2 }] });
	const merged = core.dataMerge(found, { fields: { b: "Bee", c: "C" }, edits: { c: { edit: "date" } } });
	assert.deepEqual({ ...merged.data.fields }, { a: "A", b: "Bee", c: "C" });
	assert.deepEqual(JSON.parse(JSON.stringify(merged.data.edits)), { b: { edit: "text" }, c: { edit: "date" } });
	assert.equal(core.dataMerge(core.dataRead({ name: "d.json", path: "", bad: false }, [{ a: 1 }]), null).data.fields, null);
	assert.deepEqual(core.dataMerge({ note: "why" }, null), { note: "why" });
});

test("planQuery over a file block: the rows the view read, or the quiet box; a refused name is the refused box, with no read", () => {
	const text = `${fm}\n> [!activity|show] Show\n\n${fence("from: d\nas: table")}\n\n\`\`\`booklet data dash.json plots\n{"fields":{"title":"Name"}}\n\`\`\`\n^d\n`;
	const got = planOf(text, { fileRows: () => ({ note: "Loading dash.json…" }) }).p;
	assert.equal(got.empty, "Loading dash.json…");
	assert.equal(got.quiet, true);
	assert.deepEqual(got.groups, []);
	const none = planOf(text).p;
	assert.match(none.empty, /could not be read/, "a view that gave no reader says it could not be read");
	const ok = planOf(text, { fileRows: (block) => core.dataMerge(core.dataRead(block.file, { plots: [{ id: "a", title: "A" }] }), { fields: block.fields, edits: block.edits }) }).p;
	assert.equal(ok.empty, null);
	assert.equal(ok.set.label("title")[0].text, "Name", "the fence's label is over the file's");
	assert.equal(rowsOf(ok).length, 1);
	const refused = planOf(`${fm}\n> [!activity|show] Show\n\n${fence("from: d")}\n\n\`\`\`booklet data ../x.json\n\`\`\`\n^d\n`, { fileRows: () => assert.fail("a refused name is never read") }).p;
	assert.match(refused.empty, /is not a name this plugin reads/);
});

/* ---- readonly, and each: over a data block ---- */

test("`readonly` is the sixteenth key, then `add` and `delete`; bare, or with names, it is read and kept", () => {
	assert.equal(core.QUERY_KEYS.length, 18);
	assert.deepEqual(core.QUERY_KEYS.slice(-3), ["readonly", "add", "delete"]);
	// every view reads `readonly`; only the views of rows that open read `add` and `delete`
	assert.ok(Object.values(core.VIEW_DRAWS).every((l) => l.includes("readonly")));
	for (const v of ["table", "list", "cards"]) assert.deepEqual(core.VIEW_DRAWS[v].slice(-3), ["readonly", "add", "delete"], v);
	for (const v of ["tiles", "bars", "line"]) assert.equal(core.VIEW_DRAWS[v].at(-1), "readonly", v);
	const q = (line) => core.parseBooklet(note([`from: d\n${line}`])).activities[0].segments.find((s) => s.type === "query").query;
	assert.equal(q("readonly").readonly, true);
	assert.deepEqual(q("readonly: title, due").readonly, ["title", "due"]);
	assert.equal(q("as: table").readonly, null);
	assert.equal(core.parseBooklet(note(["from: d\nreadonly"])).unread.length, 0, "no 'no such setting' for it");
});

test("`parent` is drawn by table, list and cards, and by no other view", () => {
	for (const v of ["table", "list", "cards"]) assert.ok(core.VIEW_DRAWS[v].includes("parent"), v);
	for (const v of ["tiles", "bars", "line"]) assert.equal(core.VIEW_DRAWS[v].includes("parent"), false, v);
});

test("an each: over a data block in reach reads clean and keeps its each; one that names nothing is said and taken off", () => {
	const mk = (each) => core.parseBooklet(note(["from: d\nas: list"], [["d", DATA]], `> [!text|reply each:${each} long] A word of reply\n\n`));
	const ok = mk("d");
	assert.deepEqual(ok.problems, []);
	const q = ok.activities[0].segments.find((s) => s.type === "question");
	assert.equal(q.each, "d");
	assert.deepEqual(ok.unread, [], "nothing is left unread: a question asked for each row is drawn (format 0.19, slice 2)");
	const bad = mk("nowhere");
	assert.ok(bad.problems.some((p) => /no question or widget in its activity and no data block in reach/.test(p)));
	assert.equal(bad.activities[0].segments.find((s) => s.type === "question").each, null);
});
