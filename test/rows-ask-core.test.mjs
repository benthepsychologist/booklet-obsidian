/*
 * Acts on the rows of a data block, the core's part (format 0.19; SPEC section 5, "A question asked for each row" and "Editing a field
 * in place", section 6, `readonly` and a question placed in a column, section 8, "Writing records back"): which rows a question is asked
 * of, which fields can be edited and in what kind of box, which are locked by the query, what a question starts from, the display states,
 * and the writer that keeps one act as one new entry and changes no other byte. Made-up orchard rows only.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { core, DRAWN, fence, fm, norm, assertOutsideUnchanged } from "./helpers.mjs";

process.env.TZ = "UTC";

const FIELDS = { title: { label: "Name", edit: "text" }, stage: { label: "Stage", edit: "choice", options: ["planning", "growing"] }, due: { label: "Due", edit: "date" }, size: { label: "Size", edit: "number" }, about: { label: "Words", edit: "long" }, kind: "Kind", note: "Note", odd: { label: "Odd", edit: "choice" }, notes: "Notes" };
const DATA = {
	fields: FIELDS,
	rows: [
		{ id: "a", title: "Apples", stage: "growing", due: "2026-11-20", size: 3, kind: "tree", notes: ["old"] },
		{ id: "b", title: "Pears", stage: "planning", kind: "tree", notes: [] },
		{ title: "No id", stage: "planning" },
		{ id: "a", title: "Same id again", notes: [] },
	],
};
const data = (json, id) => "```booklet data\n" + JSON.stringify(json) + "\n```\n^" + id;
const note = (queries, extra = "", head = "repeat", blocks = [["d", DATA]]) =>
	`${fm}\n> [!activity|show ${head}] Show\n\n${queries.map(fence).join("\n\n")}\n\n${extra}> [!data] Data\n\n${blocks.map(([id, j]) => data(j, id)).join("\n\n")}\n`;
const plan = (text, opts = {}) => {
	const b = core.parseBooklet(text);
	const act = b.activities.find((a) => a.id === "show");
	const seg = act.segments.find((s) => s.type === "query");
	return { b, act, p: core.planQuery(b, seg, { drawn: DRAWN, now: DRAWN, activity: act, ...opts }) };
};
const ROWS = (p) => p.groups.flatMap((g) => g.rows);
const QS = "> [!text|reply each:d long] A word of reply\n\n> [!text|notes each:d] Notes\n\n";

/* ---- editing: which fields, what kind of box ---- */

test("a field with an edit mark is edited in a box of its kind; a choice with no options, an unknown kind, and a field with no mark are not", () => {
	const { p } = plan(note(["from: d\nas: table\nfields: title, stage, due, size, about, kind, odd"]));
	const r = ROWS(p)[0];
	const spec = (k) => p.ask.edit(r, k);
	assert.deepEqual(norm(spec("title")), { kind: "text", options: [] });
	assert.deepEqual(norm(spec("stage")), { kind: "choice", options: ["planning", "growing"] });
	assert.equal(spec("due").kind, "date");
	assert.equal(spec("size").kind, "number");
	assert.equal(spec("about").kind, "long");
	assert.equal(spec("kind"), null, "no mark");
	assert.equal(spec("odd"), null, "a choice that offers nothing is read-only");
	assert.equal(core.editSpecOf({ edit: "colour" }), null, "a kind that is not one of the five");
});

test("a row with no id has nothing to name it by, so its fields are read-only; a repeated id is the first row's", () => {
	const { p } = plan(note(["from: d\nas: table\nfields: title"]));
	const rows = ROWS(p);
	assert.equal(rows.length, 4);
	assert.equal(p.ask.edit(rows[2], "title"), null);
	assert.ok(p.ask.edit(rows[0], "title"));
	assert.equal(p.ask.edit(rows[3], "title"), null, "the second row to have id a is not edited: an act on `a` would name two rows");
});

test("readonly: bare locks every field and question; readonly: a, b locks those; the data is not changed by either", () => {
	const bare = plan(note(["from: d\nas: table\nfields: title, stage, reply\nreadonly"], QS)).p;
	for (const k of ["title", "stage", "reply", "anything"]) assert.equal(bare.ask.readonly(k), true, k);
	const some = plan(note(["from: d\nas: table\nfields: title, stage, reply\nreadonly: stage, reply"], QS)).p;
	assert.equal(some.ask.readonly("stage"), true);
	assert.equal(some.ask.readonly("reply"), true);
	assert.equal(some.ask.readonly("title"), false);
	assert.equal(plan(note(["from: d\nas: table\nfields: title"], QS)).p.ask.readonly("title"), false, "no readonly line: nothing is locked");
	assert.equal(core.isReadonly(undefined, "x"), false);
	assert.equal(core.isReadonly(["x"], "y"), false);
});

/* ---- a question asked for each row ---- */

test("a question is asked only of rows that carry a field with its id, and of every row with an id when none does", () => {
	const { p } = plan(note(["from: d\nas: table\nfields: title"], QS));
	const [a, b, noId, again] = ROWS(p);
	const [reply, notes] = p.ask.questions;
	assert.equal(reply.id, "reply");
	// no row has a `reply` field: every row that has an id
	assert.equal(p.ask.asked(reply, a), true);
	assert.equal(p.ask.asked(reply, b), true);
	assert.equal(p.ask.asked(reply, noId), false, "a row with no id cannot be named by a pair");
	// `notes` is carried by rows a, b and the fourth
	assert.equal(p.ask.asked(notes, a), true);
	assert.equal(p.ask.asked(notes, noId), false);
	assert.equal(p.ask.asked(notes, again), false, "a repeated id is asked once");
});

test("a field a question also names is the question: a name in fields: that is a question's id puts the question in that column", () => {
	const { p } = plan(note(["from: d\nas: table\nfields: title, notes"], QS));
	assert.deepEqual([...p.ask.columns.keys()], ["notes"]);
	assert.deepEqual(p.cols, ["title", "notes"].filter((c) => p.cols.includes(c)));
	assert.equal(p.ask.edit(ROWS(p)[0], "notes"), null, "edit is not used for it");
	assert.deepEqual(p.ask.open(ROWS(p)[0]).map((q) => q.id), ["reply"], "the open part holds the questions not placed in a column");
});

test("an activity that does not repeat still asks the question of the rows; keeping an entry there is refused (below)", () => {
	const t = note(["from: d\nas: table\nfields: title"], QS, "");
	const { b, act, p } = plan(t);
	assert.deepEqual(b.problems, []);
	assert.equal(act.repeat, false);
	assert.equal(p.ask.questions.length, 2);
	assert.equal(p.ask.readonly("title"), false, "the query does not lock it; the view draws the field as its value, since the activity keeps no entries");
});

/* ---- what a question starts from, and the display states ---- */

test("an in-place question starts from the value: a choice from the option whose words match, ignoring case and spaces at the ends; an adding one starts empty", () => {
	const b = core.parseBooklet(note(["from: d"], "> [!choice|decision each:d]  Your call\n- [ ] Yes\n- [ ] No\n\n"));
	const q = b.activities[0].segments.find((s) => s.type === "question");
	assert.equal(core.startOf(q, " NO "), 2);
	assert.equal(core.startOf(q, "Maybe"), undefined, "none matches: nothing is picked");
	assert.equal(core.startOf(q, null), undefined);
	const row = core.readDataRows({ fields: {}, rows: [{ id: "x", decision: [], c: "v", d: ["i"] }] }).rows[0];
	assert.equal(core.heldOf(row, "decision").shape, "list", "an empty list is a list: the answer is added");
	assert.equal(core.heldOf(row, "c").shape, "value");
	assert.equal(core.heldOf(row, "nothing").shape, "none");
	assert.deepEqual(core.heldOf(row, "d"), { shape: "list", items: ["i"] });
});

test("the three display states: equal to what was sent is nothing marked, equal to was is waiting, anything else is the value with what was sent beneath", () => {
	const sent = { ts: "2026-11-07T10:00:00Z", a: "new", was: "old", hasWas: true };
	assert.equal(core.showsOf(null, undefined, "x").state, "none");
	assert.equal(core.showsOf(sent, "new", "new").state, "same");
	assert.equal(core.showsOf(sent, "new", "old").state, "waiting");
	assert.equal(core.showsOf(sent, "new", "third").state, "changed");
	assert.equal(core.showsOf(sent, "new", " new ").state, "same", "the spaces at either end do not make a difference");
	assert.equal(core.showsOf({ ...sent, a: 3, was: 2 }, 3, "3").state, "same", "a number is its digits");
	assert.equal(core.showsOf({ ...sent, was: null }, "new", "").state, "waiting", "nothing is nothing");
});

test("the newest act on a row is the entry with the latest ts; a later pair in the same entry wins; other rows' pairs are not read", () => {
	const entries = [
		{ ts: "2026-11-07T10:00:00Z", title: [{ pick: "a", a: "first", was: "x" }, { pick: "b", a: "other" }] },
		{ ts: "2026-11-07T12:00:00Z", title: [{ pick: "a", a: "third", was: "second" }, { pick: "a", a: "fourth", was: "second" }] },
		{ ts: "2026-11-07T11:00:00Z", title: [{ pick: "a", a: "second", was: "first" }] },
	];
	assert.equal(core.newestSent(entries, "title", "a").a, "fourth");
	assert.equal(core.newestSent(entries, "title", "b").a, "other");
	assert.equal(core.newestSent(entries, "title", "b").hasWas, false);
	assert.equal(core.newestSent(entries, "title", "zzz"), null);
	assert.deepEqual(core.keptAdds(entries, "title", "a").map((x) => x.a), ["fourth", "third", "second", "first"]);
});

/* ---- the writer ---- */

const ORCHARD = readFileSync(new URL("./dashboards/orchard-dashboard.booklet.md", import.meta.url), "utf8");

test("keeping an act adds one entry to the activity and changes no other byte; the first entry makes the block, the second goes into it", () => {
	const one = core.keepEntry(ORCHARD, "desk", "orchard", { title: [{ pick: "p-orchard", a: "Old orchard", was: "Orchard" }] }, { ts: "2026-11-07T10:00:00Z" });
	assertOutsideUnchanged(ORCHARD, one.text, "first");
	assert.deepEqual(norm(core.parseBooklet(one.text).records.entries.desk.orchard), [{ ts: "2026-11-07T10:00:00Z", title: [{ pick: "p-orchard", a: "Old orchard", was: "Orchard" }] }]);
	const two = core.keepEntry(one.text, "desk", "orchard", { stage: [{ pick: "p-orchard", a: "resting", was: "growing" }] }, { ts: "2026-11-07T10:00:00Z" });
	assertOutsideUnchanged(ORCHARD, two.text, "second");
	const back = core.parseBooklet(two.text).records.entries.desk.orchard;
	assert.equal(back.length, 2);
	assert.equal(back[1].ts, "2026-11-07T10:00:01Z", "the same second is moved to the next free one");
	// every byte of the first entry's line is in the text after the second
	const line = one.text.split("\n").find((l) => l.startsWith('{"ts":"2026-11-07T10:00:00Z"'));
	assert.ok(two.text.includes(line));
});

test("the writer keeps any other key of a pair and any other entry or answer in the records, byte for byte", () => {
	const t = ORCHARD.replace(/\s*$/, "\n") + '\n%%\n> [!records] App record — do not edit below this line\n> [!records|desk] Orchard and garden desk\n```booklet entries orchard\n{"items": [\n{"ts":"2026-11-01T08:00:00Z","title":[{"pick":"p-orchard","a":"Earlier","was":"Orchard","by":"somebody"}],"future":{"x":1}}\n]}\n```\n%%\n';
	const b = core.parseBooklet(t);
	assert.deepEqual(b.problems, []);
	const next = core.keepEntry(t, "desk", "orchard", { due: [{ pick: "p-orchard", a: "2026-12-01", was: "2026-11-20" }] }, { ts: "2026-11-07T10:00:00Z" });
	const kept = core.parseBooklet(next.text).records.entries.desk.orchard;
	assert.equal(kept.length, 2);
	assert.deepEqual(norm(kept[0]), norm(b.records.entries.desk.orchard[0]), "the old entry reads back the same, with its own key in the pair and its own member");
	assert.ok(next.text.includes('{"ts":"2026-11-01T08:00:00Z","title":[{"pick":"p-orchard","a":"Earlier","was":"Orchard","by":"somebody"}],"future":{"x":1}}'), "and is the same bytes");
});

test("keeping in an activity that does not repeat, or an empty entry, or a field called ts, is refused", () => {
	const text = ORCHARD.replace("orchard repeat", "orchard");
	assert.throws(() => core.keepEntry(text, "desk", "orchard", { title: [{ pick: "p", a: "x" }] }, { ts: "2026-11-07T10:00:00Z" }), /does not repeat/);
	assert.throws(() => core.keepEntry(ORCHARD, "desk", "orchard", {}, { ts: "2026-11-07T10:00:00Z" }), /Nothing to keep/);
	assert.throws(() => core.keepEntry(ORCHARD, "desk", "orchard", { ts: [] }, { ts: "2026-11-07T10:00:00Z" }), /ts/);
});

test("a row's Finalize keeps that row's pairs as one entry and leaves the others in the draft", () => {
	let t = ORCHARD;
	t = core.setDraftAnswer(t, "desk", "orchard", "decision", [{ pick: "b-ladder", a: 1 }, { pick: "b-hens", a: 2 }]);
	t = core.setDraftAnswer(t, "desk", "orchard", "reply", [{ pick: "b-ladder", a: "Hire one" }]);
	const out = core.keepRowDraft(t, "desk", "orchard", ["decision", "reply"], "b-ladder", { ts: "2026-11-07T10:00:00Z" });
	const b = core.parseBooklet(out.text);
	assert.deepEqual(norm(b.records.entries.desk.orchard), [{ ts: "2026-11-07T10:00:00Z", decision: [{ pick: "b-ladder", a: 1 }], reply: [{ pick: "b-ladder", a: "Hire one" }] }]);
	assert.deepEqual(norm(b.records.drafts.desk.orchard.decision), [{ pick: "b-hens", a: 2 }], "the other row's answer waits");
	assert.equal(b.records.drafts.desk.orchard.reply, undefined);
	assert.throws(() => core.keepRowDraft(out.text, "desk", "orchard", ["decision", "reply"], "b-ladder", { ts: "2026-11-07T10:00:00Z" }), /no answer/);
});
