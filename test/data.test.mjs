/*
 * A `booklet data` block as a query's source (SPEC section 7, "Data: rows a generator wrote", and section 6): the block
 * read from its JSON (an object with `rows` and optional `fields`, or the list itself), what a bad block costs (the block
 * only: it is reported and no query can name it), where a block lives and which queries can see it, the rows and fields
 * a plan works out, `group:`, a nested list (`parent:`), and that a data block is never written. Made-up rows only.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { assertOutsideUnchanged, core, DRAWN, fence, fm, keepDays, rowsOf } from "./helpers.mjs";

// removeEntry needs the entry's key as the card drew it; a test that is not about a stale pane takes it from the text it removes from
const rm = (text, scope, id, at, ts, expect) => {
	if (expect === undefined) {
		const e = core.parseBooklet(text).records.entries[scope]?.[id]?.[at];
		expect = e ? core.entryKey(e) : "";
	}
	return core.removeEntry(text, scope, id, at, ts, expect);
};

process.env.TZ = "UTC";

const data = (json, id) => "```booklet data\n" + (typeof json === "string" ? json : JSON.stringify(json)) + "\n```\n^" + id;

const JOBS = {
	fields: { job: "Job", when: "When", state: "State", hrs: "Hours", tone: "Tone", go: "Where", pic: "Picture", what: "Detail" },
	rows: [
		{ job: "Spring beds", when: "March", state: ["open", "blocked"], hrs: 12, tone: "warn", go: "#Spring", pic: "compass", what: "Needs compost" },
		{ job: "Dig bed 1", when: "March", state: "done", hrs: 3, tone: "good", go: "https://example.org/dig", pic: "notebook-pen", what: "" },
		{ job: "Dig bed 2", when: "April", state: "open", hrs: 4.5, tone: "bad", go: "javascript:alert(1)", pic: "not-an-icon", what: null },
		{ job: "Mend fence", when: "April", state: "done", hrs: 2, tone: "good" },
		{ job: "Orphan row", when: "April", hrs: "n/a" },
	],
};

/** A made-up note: one activity "show" with these queries, and the shared data section holding `blocks` (id, json). */
const note = (queries, blocks = [["jobs", JOBS]]) =>
	`${fm}\n> [!activity|show] Show\n\n${queries.map(fence).join("\n\n")}\n\n> [!data] Data\n\n${blocks.map(([id, j]) => data(j, id)).join("\n\n")}\n`;

const planOf = (text, i = 0) => {
	const b = core.parseBooklet(text);
	const seg = b.activities.find((a) => a.id === "show").segments.filter((s) => s.type === "query")[i];
	return { b, seg, p: seg ? core.planQuery(b, seg, { drawn: DRAWN, now: DRAWN }) : null };
};
const textsOf = (p, k) => rowsOf(p).map((r) => r.cells[k]?.text);

/* ---- reading a block ---- */

test("readDataRows: an object with rows and fields, or the list itself; a value is flat or a flat list", () => {
	const a = core.readDataRows({ fields: { x: "X" }, rows: [{ x: 1, y: [true, null, "z"] }] });
	assert.deepEqual(a, { rows: [{ x: 1, y: [true, null, "z"] }], fields: { x: "X" } });
	assert.deepEqual(core.readDataRows([{ x: "a" }]), { rows: [{ x: "a" }], fields: null });
	assert.deepEqual(core.readDataRows({ rows: [] }), { rows: [], fields: null });
});

test("readDataRows: what is not a block says why, in the reference renderer's words", () => {
	const bad = (v) => core.readDataRows(v).bad;
	assert.match(bad({ nope: 1 }), /holds no list of rows/);
	assert.match(bad("text"), /holds no list of rows/);
	assert.match(bad([1]), /a row that is not an object/);
	assert.match(bad([[{ a: 1 }]]), /a row that is not an object/);
	assert.match(bad([{ a: { deep: 1 } }]), /nests deeper than a list/);
	assert.match(bad([{ a: [[1]] }]), /nests deeper than a list/);
	assert.match(bad({ rows: [], fields: [] }), /`fields` that is not an object of labels/);
	assert.match(bad({ rows: [], fields: { a: 1 } }), /`fields` that is not an object of labels/);
});

test("a block that cannot be read is reported and no query can name it; the note still opens and every other block is read", () => {
	const text = note(["from: broken", "from: nested", "from: jobs\nas: list"], [
		["broken", "{ not json"],
		["nested", { rows: [{ a: { b: 1 } }] }],
		["jobs", JOBS],
	]);
	const b = core.parseBooklet(text);
	assert.equal(b.ok, true);
	const said = b.problems.join("\n");
	assert.match(said, /the data block "broken" is not JSON, so no query can draw it/);
	assert.match(said, /the data block "nested" has a value that nests deeper than a list, so no query can draw it/);
	assert.match(said, /names "broken", which is nothing in this module/);
	assert.equal(b.activities.find((a) => a.id === "show").segments.filter((s) => s.type === "query").length, 1, "only the query of the good block stays");
});

test("a data block with no block id is dropped without a word, as before", () => {
	const text = `${fm}\n> [!activity|show] Show\n\n${fence("from: x")}\n\n> [!data] Data\n\n\`\`\`booklet data\n[{"a": 1}]\n\`\`\`\n`;
	const b = core.parseBooklet(text);
	assert.ok(!b.problems.some((p) => /data block/.test(p)), b.problems.join("\n"));
});

/* ---- where a block lives ---- */

test("a block is seen from its own module and from the shared data section, never from another module", () => {
	const text = `${fm}
> [!module|north] North

> [!activity|show] Show

${fence("from: mine")}

${fence("from: shared")}

${fence("from: theirs")}

${data([{ a: "in the module's fence" }], "mine")}

> [!module|north end]

> [!module|south] South

> [!activity|other] Other

${data([{ a: "south's own" }], "theirs")}

> [!module|south end]

> [!data] Data

${data([{ a: "shared" }], "shared")}
`;
	const b = core.parseBooklet(text);
	const segs = b.activities.find((a) => a.id === "show").segments.filter((s) => s.type === "query");
	assert.deepEqual(
		segs.map((s) => [s.query.from, s.source.kind, s.source.block.rows[0].a]),
		[
			["mine", "data", "in the module's fence"],
			["shared", "data", "shared"],
		],
	);
	assert.match(b.problems.join("\n"), /names "theirs", which is in another module/);
});

test("a block in a module's own data section belongs to that module", () => {
	const text = `${fm}
> [!module|north] North

> [!activity|show] Show

${fence("from: board")}

> [!module|north end]

> [!data|north] North's data

${data([{ a: "north's" }], "board")}
`;
	const b = core.parseBooklet(text);
	const seg = b.activities.find((a) => a.id === "show").segments.find((s) => s.type === "query");
	assert.equal(seg.source.block.module, "north");
});

/* ---- the rows a plan works out ---- */

test("a data block draws as a table unless the query says another view; its declared fields are the columns, in their order", () => {
	const { p } = planOf(note(["from: jobs"]));
	assert.equal(p.kind, "rows");
	assert.equal(p.view, "table");
	assert.equal(p.set.kind, "data");
	assert.deepEqual(p.set.own, ["job", "when", "state", "hrs", "tone", "go", "pic", "what"]);
	assert.deepEqual(p.cols, p.set.own);
	assert.equal(rowsOf(p).length, 5);
	assert.deepEqual(p.set.label("hrs").map((x) => x.text), ["Hours"], "a field is named by its declared label");
});

test("without declared fields the first row's keys are the columns; a list value is comma-separated and keeps its members; a number keeps its number", () => {
	const { p } = planOf(note(["from: bare"], [["bare", [{ a: "x", n: 4.5, l: ["p", "q"] }, { a: "y", extra: 1 }]]]));
	assert.deepEqual(p.set.own, ["a", "n", "l"]);
	const r = rowsOf(p)[0].cells;
	assert.deepEqual([r.n.num, r.n.text, r.l.text, r.l.items], [4.5, "4.5", "p, q", ["p", "q"]]);
	assert.equal(rowsOf(p)[1].cells.n, undefined, "a missing value is no cell");
});

test("fields: picks and orders the columns; the roles read the fields of their own name unless the query points elsewhere", () => {
	const { p } = planOf(note(["from: jobs\nas: list\nlabel: job\nvalue: hrs\nnote: what\nbadge: state\ntone: tone\nlink: go\nicon: pic\ngroup: when\nfields: when"]));
	assert.deepEqual(p.roles, { label: "job", value: "hrs", note: "what", badge: "state", tone: "tone", link: "go", icon: "pic" });
	assert.deepEqual(p.cols, ["when"]);
	assert.deepEqual(
		p.groups.map((g) => [g.name, g.rows.length]),
		[
			["March", 2],
			["April", 3],
		],
		"groups in the order the values first appear",
	);
	assert.deepEqual(textsOf(p, "job").slice(0, 2), ["Spring beds", "Dig bed 1"]);
});

test("a list's extras are the fields that play no role, never the id, the group or the parent", () => {
	const { p } = planOf(note(["from: t\nas: list\nlabel: name\ngroup: area"], [["t", { fields: { id: "Id", name: "Name", area: "Area", parent: "Up", size: "Size" }, rows: [{ id: "a", name: "A", area: "N", size: 1 }] }]]));
	assert.deepEqual(p.cols, ["size"]);
});

test("cards over a data block: every field that plays no role is a line under the title", () => {
	const { p } = planOf(note(["from: jobs\nas: cards\nlabel: job\nvalue: hrs\nbadge: state\ntone: tone"]));
	assert.deepEqual(p.cols, ["when", "go", "pic", "what"]);
	const named = planOf(note(["from: jobs\nas: cards\nlabel: job\nfields: when, what"])).p;
	assert.deepEqual(named.cols, ["when", "what"], "fields: names the lines");
});

test("limit takes the first N rows of a data block, before grouping; a span of days or a summary is ignored and reported", () => {
	const { p, b } = planOf(note(["from: jobs\nlimit: 3\ngroup: when", "from: jobs\nlimit: 7 days\nsummary: on"]));
	assert.deepEqual(
		p.groups.map((g) => [g.name, g.rows.length]),
		[
			["March", 2],
			["April", 1],
		],
	);
	assert.match(b.problems.join("\n"), /`limit: 7 days` and `summary: on` read kept entries only, so they were ignored/);
	assert.equal(planOf(note(["from: jobs\nlimit: 3", "from: jobs\nlimit: 7 days\nsummary: on"]), 1).p.groups[0].rows.length, 5);
});

test("no rows: the query's own empty: words, else the renderer's own line", () => {
	const none = note(["from: none\nempty: No harvest yet.", "from: none"], [["none", []]]);
	assert.equal(planOf(none, 0).p.empty, "No harvest yet.");
	assert.equal(planOf(none, 1).p.empty, "Nothing kept here yet.");
});

/* ---- a nested list ---- */

const TREE = {
	rows: [
		{ id: "p", job: "Spring beds", parent: "" },
		{ id: "a", job: "Dig bed 1", parent: "p" },
		{ id: "b", job: "Dig bed 2", parent: "p" },
		{ id: "c", job: "Mend fence" },
		{ id: "o", job: "Orphan job", parent: "zzz" },
		{ id: "x", job: "Loop one", parent: "y" },
		{ id: "y", job: "Loop two", parent: "x" },
	],
};
const treeOf = (queries) => planOf(note(queries, [["tree", TREE]])).p;
const names = (p, rows) => rows.map((r) => r.cells.job.text);

test("rows with an id and a parent nest: a child under its parent, a row whose parent is no row at the top, a cycle cut at the first row met", () => {
	const p = treeOf(["from: tree\nas: list\nlabel: job"]);
	assert.deepEqual(names(p, p.tree.roots), ["Spring beds", "Mend fence", "Orphan job", "Loop one"]);
	const spring = p.tree.roots[0];
	assert.deepEqual(names(p, p.tree.kids.get(spring)), ["Dig bed 1", "Dig bed 2"]);
	const loop = p.tree.roots[3];
	assert.deepEqual(names(p, p.tree.kids.get(loop)), ["Loop two"], "the cycle is drawn once, from the first row met");
	assert.deepEqual(names(p, rowsOf(p)), ["Spring beds", "Dig bed 1", "Dig bed 2", "Mend fence", "Orphan job", "Loop one", "Loop two"], "the rows are in the order the tree is drawn");
});

test("a nested list: limit counts the top rows, and group: is not drawn", () => {
	const p = treeOf(["from: tree\nas: list\nlabel: job\nlimit: 1\ngroup: job"]);
	assert.deepEqual(names(p, rowsOf(p)), ["Spring beds", "Dig bed 1", "Dig bed 2"]);
	assert.equal(p.groups.length, 1);
	assert.equal(p.groups[0].name, null);
});

test("parent: names the field of the parent; two rows with one id, the first is the parent; only a list nests", () => {
	const t = { rows: [{ id: "k", job: "First k", up: "" }, { id: "k", job: "Second k", up: "" }, { id: "z", job: "Child", up: "k" }] };
	const p = planOf(note(["from: t\nas: list\nlabel: job\nparent: up", "from: t\nas: table"], [["t", t]])).p;
	assert.deepEqual(names(p, p.tree.roots), ["First k", "Second k"]);
	assert.deepEqual(names(p, p.tree.kids.get(p.tree.roots[0])), ["Child"]);
	assert.equal(planOf(note(["from: t\nas: list\nlabel: job\nparent: up", "from: t\nas: table"], [["t", t]]), 1).p.tree, undefined);
});

/* ---- a data block is never written ---- */

test("a data block is not a record: Finalize and the writer leave it, and the text round it, exactly as written", () => {
	const text =
		`${fm}\n> [!activity|log repeat] Log\n\n> [!number|n] A number\n\n> [!activity|show] Show\n\n${fence("from: jobs")}\n\n${data(JOBS, "jobs")}\n\n> [!data] Data\n\n${data({ rows: [{ a: "  spaced   out " }] }, "other")}\n`;
	const done = keepDays(text, "", "log", [["2026-10-27T09:00:00Z", { n: 3 }]]);
	assert.ok(done.includes(data(JOBS, "jobs")) && done.includes(data({ rows: [{ a: "  spaced   out " }] }, "other")));
	assertOutsideUnchanged(text, done, "keeping an entry");
	const removed = rm(done, "", "log", 0, "2026-10-27T09:00:00Z");
	assert.equal(removed.removed, 1);
	assertOutsideUnchanged(text, removed.text, "removing it");
});
