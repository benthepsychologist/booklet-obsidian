/*
 * A data block written in the note itself is changed by the same functions as a data file (core/apply.ts applyInFence): an edit of a field,
 * an added row, a removed row. The note changes only between the block's fences; the records, the prose, a hand-spaced entry, the fence's own
 * indentation, line endings, a byte order mark and trailing blank lines come back as they were.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { core } from "./helpers.mjs";

const { applyInFence, applyAct, applyAdd, applyDelete, parseBooklet, fenceInner } = core;

const ROWS = `{
  "fields": { "title": { "label": "Name", "edit": "text" } },
  "rows": [
    { "id": "a", "title": "A", "jobs": [
      { "id": "a1", "title": "A one" }
    ] },
    { "id": "b", "title": "B" }
  ]
}`;

/** A note with an inline data block, a hand-spaced entry and a records region. */
const note = (data = ROWS, before = "") =>
	`${before}---
booklet: "0.19"
title: Garden
---

# Garden

> [!module|desk] Desk

> [!activity|work repeat] Work

\`\`\`booklet query
from: plots
as: table
add
delete
\`\`\`

\`\`\`booklet data
${data}
\`\`\`
^plots

> [!module|desk end]

%%
\`\`\`booklet entries work
{ "items":[ {"ts":"2026-11-08T10:00:00Z" , "title":[{"pick":"a","a":"Old","was":"A"}]} ,
   {"ts":"2026-11-08T10:01:00Z","x":  1} ] }
\`\`\`
%%
`;

const edit = (n, f) => applyInFence(n, "plots", "desk", f);

test("the block is found again in the note's own text: its id, its module, and the lines between its fences", () => {
	const n = note();
	const book = parseBooklet(n);
	const b = book.data.find((x) => x.id === "plots");
	assert.equal(b.module, "desk");
	assert.ok(b.inner, "a block written in the note has its lines");
	const span = fenceInner(n, "plots", "desk");
	assert.equal(span.text, ROWS + "\n", "the text between the fences, with the last line's own line ending");
	assert.equal(n.slice(0, span.from).endsWith("```booklet data\n"), true);
	assert.equal(n.slice(span.to).startsWith("```\n^plots"), true);
	assert.equal(fenceInner(n, "plots", null), null, "another module's block is not this one");
	assert.equal(fenceInner(n, "nope", "desk"), null);
});

test("a block that names a file, and one inside a callout, are not written into the note", () => {
	const file = note().replace("```booklet data\n" + ROWS + "\n```", "```booklet data plots.json\n```");
	assert.equal(fenceInner(file, "plots", "desk"), null);
	assert.deepEqual(edit(file, (t) => applyAdd(t, "", "z", undefined, {})), { ok: false, why: "unreadable" });
	const inCallout = note().replace("```booklet data\n" + ROWS + "\n```\n^plots", "> [!tip] Hid\n> ```booklet data\n> { \"rows\": [ {\"id\": \"a\"} ] }\n> ```\n> ^plots");
	assert.equal(parseBooklet(inCallout).data.every((x) => !x.inner), true);
});

test("an edit of a field is written inside the fence, and only the value's own text changes", () => {
	const n = note();
	const r = edit(n, (t) => applyAct(t, "", "a1", "title", "A one", "Changed"));
	assert.equal(r.ok, true);
	assert.equal(r.text, n.replace('"title": "A one"', '"title": "Changed"'));
	// the same edit, with a stale `was`, writes nothing
	assert.deepEqual(edit(n, (t) => applyAct(t, "", "a1", "title", "Not it", "Changed")), { ok: false, why: "changed" });
});

test("an added row is written inside the fence; the whole note outside it is the bytes it was", () => {
	const n = note();
	const r = edit(n, (t) => applyAdd(t, "", "c", undefined, { title: "C" }));
	assert.equal(r.ok, true);
	assert.equal(r.text, n.replace(`    { "id": "b", "title": "B" }\n  ]`, `    { "id": "b", "title": "B" },\n    { "id": "c", "title": "C" }\n  ]`));
	const under = edit(n, (t) => applyAdd(t, "", "a2", "a", { title: "A two" }));
	assert.equal(under.text, n.replace(`      { "id": "a1", "title": "A one" }\n`, `      { "id": "a1", "title": "A one" },\n      { "id": "a2", "title": "A two" }\n`));
	// applied twice, once
	assert.equal(edit(r.text, (t) => applyAdd(t, "", "c", undefined, { title: "C" })).text, r.text);
});

test("a removed row is taken out of the fence with its comma and its own line", () => {
	const n = note();
	const r = edit(n, (t) => applyDelete(t, "", "b", { id: "b", title: "B" }));
	assert.equal(r.ok, true);
	assert.equal(r.text, n.replace(` ] },\n    { "id": "b", "title": "B" }\n  ]`, ` ] }\n  ]`));
	const stale = edit(n, (t) => applyDelete(t, "", "b", { id: "b", title: "Not B" }));
	assert.deepEqual(stale, { ok: false, why: "changed" });
});

test("the records, the hand-spaced entry, the prose and everything after the fence are not touched", () => {
	const n = note();
	const r = edit(n, (t) => applyAdd(t, "", "c", undefined, { title: "C" }));
	const span = fenceInner(n, "plots", "desk");
	assert.equal(r.text.slice(0, span.from), n.slice(0, span.from), "everything before the fence");
	assert.equal(r.text.endsWith(n.slice(span.to)), true, "everything after the fence, the records region included");
	assert.equal(r.text.includes(`{ "items":[ {"ts":"2026-11-08T10:00:00Z" , "title":[{"pick":"a","a":"Old","was":"A"}]} ,\n   {"ts":"2026-11-08T10:01:00Z","x":  1} ] }`), true);
});

test("CRLF, a leading byte order mark and trailing blank lines come back as they were", () => {
	const crlf = note().replace(/\n/g, "\r\n");
	const r = edit(crlf, (t) => applyAdd(t, "", "c", undefined, { title: "C" }));
	assert.equal(r.ok, true);
	assert.equal(/[^\r]\n/.test(r.text), false, "no bare LF came in");
	assert.equal(r.text, note().replace(`    { "id": "b", "title": "B" }\n  ]`, `    { "id": "b", "title": "B" },\n    { "id": "c", "title": "C" }\n  ]`).replace(/\n/g, "\r\n"));
	const bom = "﻿" + note();
	const b = edit(bom, (t) => applyAdd(t, "", "c", undefined, { title: "C" }));
	assert.equal(b.text.charCodeAt(0), 0xfeff);
	assert.equal(b.text.slice(1), edit(note(), (t) => applyAdd(t, "", "c", undefined, { title: "C" })).text);
	const tail = note() + "\n\n\n";
	const t = edit(tail, (x) => applyDelete(x, "", "b", { id: "b", title: "B" }));
	assert.equal(t.text.endsWith("%%\n\n\n\n"), true, "trailing blank lines kept");
});

test("a fence that is itself indented (inside a list item) keeps its indentation on the new row", () => {
	const data = `   { "rows": [\n      { "id": "a", "title": "A" },\n      { "id": "b", "title": "B" }\n   ] }`;
	const n = note(data);
	const r = edit(n, (t) => applyAdd(t, "", "c", undefined, { title: "C" }));
	assert.equal(r.text, n.replace(`      { "id": "b", "title": "B" }\n   ]`, `      { "id": "b", "title": "B" },\n      { "id": "c", "title": "C" }\n   ]`));
	// an empty list inside it: the indent of the line the list starts on, then two spaces
	const emptied = note(`   { "rows": [] }`);
	const e = edit(emptied, (t) => applyAdd(t, "", "c", undefined, { title: "C" }));
	assert.equal(e.text, emptied.replace(`   { "rows": [] }`, `   { "rows": [\n     {\n       "id": "c",\n       "title": "C"\n     }\n   ] }`));
	assert.equal(parseBooklet(e.text).data[0].rows.length, 1, "and the note reads back with the row");
});

test("a block that is not JSON, and an empty fence, are refused (unreadable) and the note is not touched", () => {
	const bad = note("{ not json");
	assert.deepEqual(edit(bad, (t) => applyAdd(t, "", "c", undefined, {})), { ok: false, why: "unreadable" });
	const none = note("");
	assert.deepEqual(edit(none, (t) => applyAdd(t, "", "c", undefined, {})), { ok: false, why: "unreadable" });
});

test("a refusal returns no text, and a no-op returns the note itself", () => {
	const n = note();
	const noop = edit(n, (t) => applyAdd(t, "", "a", undefined, {}));
	assert.equal(noop.ok, true);
	assert.equal(noop.text, n);
	assert.equal("text" in edit(n, (t) => applyAdd(t, "", "c", "nobody", {})), false);
});

test("a fence whose own lines are indented (three spaces, in a list) is found, and the new row sits at its indent", () => {
	const n = `---\nbooklet: "0.19"\ntitle: G\n---\n\n> [!activity|work repeat] Work\n\n   \`\`\`booklet data\n   { "rows": [\n      { "id": "a" }\n   ] }\n   \`\`\`\n   ^plots\n`;
	const r = applyInFence(n, "plots", null, (t) => applyAdd(t, "", "c", undefined, { t: "z" }));
	assert.equal(r.ok, true);
	assert.equal(r.text, n.replace(`      { "id": "a" }\n`, `      { "id": "a" },\n      { "id": "c", "t": "z" }\n`));
});
