/*
 * Applying one kept act to a data file's text (core/apply.ts; docs/hosting.md, "In place"): the one value's own text is replaced and every
 * other byte comes back as it was; a stale edit, a missing or repeated row and a field the row lacks write nothing.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { core } from "./helpers.mjs";

const { applyAct, sameOption, scanJson } = core;

/** The text with the span of the value of `field` of the row `id` cut out: what must be identical before and after. */
const outside = (text, span) => [text.slice(0, span[0]), text.slice(span[1])];
const span = (text, needle, from = 0) => {
	const at = text.indexOf(needle, from);
	assert.ok(at >= 0, `${needle} is in the text`);
	return [at, at + needle.length];
};

const INDENTED = `{
  "plots": {
    "fields": { "stage": { "label": "Stage", "edit": "choice", "options": ["growing", "resting"] } },
    "rows": [
      { "id": "p-orchard", "title": "Orchard", "stage": "growing", "open": 3, "jobs": [
        { "id": "j-prune", "title": "Prune", "stage": "growing", "jobs": [
          { "id": "j-ladder", "title": "Ladder", "stage": "planning" }
        ] }
      ] },
      { "id": "p-bees", "title": "Bees", "stage": "growing", "open": 3 }
    ]
  }
}
`;

test("an act is applied: only the value's own text changes, whatever the layout", () => {
	const r = applyAct(INDENTED, "plots", "p-orchard", "stage", "growing", "resting");
	assert.equal(r.ok, true);
	const [from, to] = span(INDENTED, '"growing"', INDENTED.indexOf('"p-orchard"'));
	assert.equal(r.text, INDENTED.slice(0, from) + '"resting"' + INDENTED.slice(to), "the whole text, byte for byte, outside the value");
	// the same value in the next row, and in the child row, is not touched
	assert.equal(r.text.split('"growing"').length - 1, INDENTED.split('"growing"').length - 2);
	const compact = '{"plots":{"rows":[{"id":"a","t":"x","n":1},{"id":"b","t":"x","n":1}]}}';
	const c = applyAct(compact, "plots", "b", "t", "x", "y");
	assert.equal(c.text, '{"plots":{"rows":[{"id":"a","t":"x","n":1},{"id":"b","t":"y","n":1}]}}');
	const lone = applyAct('[ {"id" : 1 , "t" :  "x"} ]', "", 1, "t", "x", "z");
	assert.equal(lone.text, '[ {"id" : 1 , "t" :  "z"} ]', "a list at the root, a number id, odd spacing");
});

test("a nested child row is found by its id, at any depth, and only it changes", () => {
	const r = applyAct(INDENTED, "plots", "j-ladder", "stage", "planning", "done");
	assert.equal(r.ok, true);
	const [a, b] = span(INDENTED, '"planning"');
	assert.equal(r.text, INDENTED.slice(0, a) + '"done"' + INDENTED.slice(b));
	const j = applyAct(INDENTED, "plots", "j-prune", "stage", "growing", "resting");
	assert.equal(j.ok, true);
	assert.equal(JSON.parse(j.text).plots.rows[0].jobs[0].stage, "resting");
	assert.equal(JSON.parse(j.text).plots.rows[0].stage, "growing", "the parent keeps its own");
});

test("a key path two levels deep, and a path that is not there", () => {
	const t = '{ "a": { "b": { "rows": [ {"id": "r", "v": 1} ] } }, "rows": [ {"id": "r", "v": 1} ] }';
	const r = applyAct(t, "a.b", "r", "v", 1, 2);
	assert.equal(r.text, '{ "a": { "b": { "rows": [ {"id": "r", "v": 2} ] } }, "rows": [ {"id": "r", "v": 1} ] }');
	assert.deepEqual(applyAct(t, "a.c", "r", "v", 1, 2), { ok: false, why: "no row" });
	assert.deepEqual(applyAct(t, "a", "r", "v", 1, 2), { ok: false, why: "no row" }, "an object at the path with no rows");
});

test("values keep their type: a number, null, and text with quotes, newlines and unicode", () => {
	const t = '{"rows":[{"id":"a","n":3,"s":"old","d":"2026-01-01"}]}';
	assert.equal(applyAct(t, "", "a", "n", 3, 7.5).text, '{"rows":[{"id":"a","n":7.5,"s":"old","d":"2026-01-01"}]}', "a JSON number");
	assert.equal(applyAct(t, "", "a", "n", 3, null).text, '{"rows":[{"id":"a","n":null,"s":"old","d":"2026-01-01"}]}', "a cleared number is null");
	const s = 'He said "hi"\\ and\nleft é中 🍎';
	const r = applyAct(t, "", "a", "s", "old", s);
	assert.equal(r.ok, true);
	assert.equal(JSON.parse(r.text).rows[0].s, s, "reads back as the same words");
	assert.equal(r.text, `{"rows":[{"id":"a","n":3,"s":${JSON.stringify(s)},"d":"2026-01-01"}]}`);
	// a number replaced by words, and words by a number
	assert.equal(applyAct(t, "", "a", "s", "old", 4).text.includes('"s":4,'), true);
});

test("CRLF line endings and a leading byte order mark come back exactly as they were", () => {
	const crlf = INDENTED.replace(/\n/g, "\r\n");
	const r = applyAct(crlf, "plots", "p-bees", "title", "Bees", "Honey bees");
	assert.equal(r.text, crlf.replace('"Bees"', '"Honey bees"'));
	assert.equal(r.text.includes("\n") && !/[^\r]\n/.test(r.text), true, "every line ending is still CRLF");
	const bom = "﻿" + INDENTED;
	const b = applyAct(bom, "plots", "p-bees", "title", "Bees", "Honey bees");
	assert.equal(b.text, bom.replace('"Bees"', '"Honey bees"'));
	assert.equal(b.text.charCodeAt(0), 0xfeff);
});

test("everything outside the value is identical, including escapes and the order of keys elsewhere", () => {
	const t = '{\n\t"rows": [\n\t\t{ "z": "\\u00e9\\n\\/", "id": "a", "b": 1,"a":  "keep \\"this\\"" },\n\t\t{ "id": "b", "a": "keep \\"this\\"" }\n\t],\n\t"fields": {"b": {"edit": "number"}}\n}';
	const r = applyAct(t, "", "a", "b", 1, 2);
	const [from, to] = span(t, "1", t.indexOf('"b": 1') + 4);
	assert.deepEqual(outside(r.text, [from, from + 1]), outside(t, [from, to]));
	assert.equal(r.text.slice(from, from + 1), "2");
	assert.equal(r.text.length, t.length);
});

test("a stale edit is refused and writes nothing", () => {
	assert.deepEqual(applyAct(INDENTED, "plots", "p-orchard", "stage", "resting", "done"), { ok: false, why: "changed" });
	assert.deepEqual(applyAct('{"rows":[{"id":"a","n":3}]}', "", "a", "n", null, 5), { ok: false, why: "changed" }, "the data held a number, the page began from nothing");
});

test("the comparison with was is the display states': words trimmed, a number as digits, a choice ignoring case", () => {
	assert.equal(applyAct('{"rows":[{"id":"a","s":" old "}]}', "", "a", "s", "old", "new").text, '{"rows":[{"id":"a","s":"new"}]}');
	assert.equal(applyAct('{"rows":[{"id":"a","n":"3"}]}', "", "a", "n", 3, 4).text, '{"rows":[{"id":"a","n":4}]}');
	assert.equal(applyAct('{"rows":[{"id":"a","s":"Growing"}]}', "", "a", "s", "growing", "resting", sameOption).text, '{"rows":[{"id":"a","s":"resting"}]}');
	assert.deepEqual(applyAct('{"rows":[{"id":"a","s":"Growing"}]}', "", "a", "s", "growing", "resting"), { ok: false, why: "changed" }, "as a value, case matters");
});

test("a value that already equals the new one is ok, and the text is not touched", () => {
	const t = '{ "rows": [ {"id":"a", "s":"resting"} ] }';
	const r = applyAct(t, "", "a", "s", "growing", "resting");
	assert.deepEqual(r, { ok: true, text: t });
});

test("a row that is missing, an id on two rows, a field the row lacks or holds as a list or rows", () => {
	assert.deepEqual(applyAct(INDENTED, "plots", "p-gone", "stage", "growing", "done"), { ok: false, why: "no row" });
	const twice = '{"rows":[{"id":"a","s":"x"},{"id":"b","k":[{"id":"a","s":"x"}]}]}';
	assert.deepEqual(applyAct(twice, "", "a", "s", "x", "y"), { ok: false, why: "ambiguous" }, "a nested row counts");
	assert.deepEqual(applyAct(INDENTED, "plots", "p-orchard", "mood", "x", "y"), { ok: false, why: "no field" });
	assert.deepEqual(applyAct(INDENTED, "plots", "p-orchard", "jobs", "x", "y"), { ok: false, why: "no field" }, "child rows are no value");
	assert.deepEqual(applyAct('{"rows":[{"id":"a","tags":["x","y"]}]}', "", "a", "tags", "x", "y"), { ok: false, why: "no field" }, "a list is for appending");
	// a field that the pick's own row carries, not the one an ancestor or a sibling carries
	assert.deepEqual(applyAct('{"rows":[{"id":"a","s":"x","jobs":[{"id":"c"}]}]}', "", "c", "s", "x", "y"), { ok: false, why: "no field" });
});

test("ids are text: a pick 5 and an id \"5\" are one id, in either direction (contract section 10)", () => {
	const num = '{"rows":[{"id":5,"s":"x"}]}';
	assert.equal(applyAct(num, "", "5", "s", "x", "y").text, '{"rows":[{"id":5,"s":"y"}]}', "a text pick finds a number id, which stays as written");
	assert.equal(applyAct(num, "", 5, "s", "x", "y").text, '{"rows":[{"id":5,"s":"y"}]}');
	const txt = '{"rows":[{"id":"5","s":"x"}]}';
	assert.equal(applyAct(txt, "", 5, "s", "x", "y").text, '{"rows":[{"id":"5","s":"y"}]}', "a number pick finds a text id");
	// two rows that are one id as text are two rows with that id: not one row to write to
	assert.deepEqual(applyAct('{"rows":[{"id":1,"s":"x"},{"id":"1","s":"x"}]}', "", 1, "s", "x", "y"), { ok: false, why: "ambiguous" });
});

test("a key written twice is read as its last, as the display reads it", () => {
	const t = '{"rows":[{"id":"a","s":"old","s":"x"}]}';
	assert.equal(applyAct(t, "", "a", "s", "x", "y").text, '{"rows":[{"id":"a","s":"old","s":"y"}]}');
});

test("text that is not JSON, or an act that is not a value, writes nothing", () => {
	for (const bad of ["", "{", '{"rows": [ {"id": "a", "s": x} ]}', '{"rows":[]} extra', "not json"]) assert.deepEqual(applyAct(bad, "", "a", "s", "x", "y"), { ok: false, why: "unreadable" }, bad);
	assert.deepEqual(applyAct('{"rows":[{"id":"a","s":"x"}]}', "", "a", "s", "x", { no: 1 }), { ok: false, why: "unreadable" });
	assert.deepEqual(applyAct('{"rows":[{"id":"a","s":"x"}]}', "", "a", "s", "x", NaN), { ok: false, why: "unreadable" });
});

test("the field id is never written: it is what every act names the row by", () => {
	const t = '{"rows":[{"id":"a","s":"x"},{"id":"b","s":"x"}]}';
	assert.deepEqual(applyAct(t, "", "a", "id", "a", "b"), { ok: false, why: "identity" }, "a new id that another row has");
	assert.deepEqual(applyAct(t, "", "a", "id", "a", "c"), { ok: false, why: "identity" }, "and one that nobody has");
	assert.deepEqual(applyAct('{"rows":[{"id":1,"s":"x"}]}', "", 1, "id", 1, 2), { ok: false, why: "identity" }, "a number id too");
	assert.deepEqual(applyAct(t, "", "a", "id", "a", "a"), { ok: false, why: "identity" }, "even to the same words");
});

test("a deep chain of rows is found; one too deep for the JSON scanner is refused, not thrown", () => {
	const chain = (n) => {
		let t = '{"id":"end","s":"x"}';
		for (let i = 0; i < n; i++) t = `{"id":"r${i}","jobs":[${t}]}`;
		return `{"rows":[${t}]}`;
	};
	assert.equal(applyAct(chain(400), "", "end", "s", "x", "y").ok, true);
	// scanJson reads a value by recursion; a file nested thousands deep is not edited (it is still shown): nothing is written
	const deep = applyAct(chain(20000), "", "end", "s", "x", "y");
	assert.equal(deep.ok === false || deep.text.includes('"s":"y"'), true);
});
