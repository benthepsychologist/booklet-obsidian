/*
 * Adding a row to a data block's JSON text, and taking one out (core/apply.ts applyAdd, applyDelete; json-edit.ts addRowEdit, removeRowEdit):
 * the new row is written in the layout of the row before it, at the end of a list of rows, at any depth; a removal takes the row, its comma
 * and its own line; and every other byte (the spacing, the key order, the line endings, a byte order mark) comes back as it was.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { core } from "./helpers.mjs";

const { applyAdd, applyDelete, sameJson } = core;

/** The part of `after` that is not in `before`, and the part of `before` that is not in `after`: the common start and end are cut off. */
function changed(before, after) {
	let a = 0;
	while (a < before.length && a < after.length && before[a] === after[a]) a++;
	let b = 0;
	while (b < before.length - a && b < after.length - a && before[before.length - 1 - b] === after[after.length - 1 - b]) b++;
	return { was: before.slice(a, before.length - b), now: after.slice(a, after.length - b) };
}

const MULTI = `{
  "plots": {
    "fields": { "title": "Name" },
    "rows": [
      {
        "id": "a",
        "title": "A"
      },
      {
        "id": "b",
        "title": "B",
        "jobs": [
          {
            "id": "b1",
            "title": "B one",
            "steps": [
              { "id": "b1s1", "title": "Step" }
            ]
          }
        ]
      }
    ]
  }
}
`;

test("a top row goes at the end of the list, in the layout of the row before it (an indented, multi-line row)", () => {
	const r = applyAdd(MULTI, "plots", "c", undefined, { title: "C", n: 3 });
	assert.equal(r.ok, true);
	assert.equal(
		r.text,
		MULTI.replace(
			`      }
    ]
  }
}
`,
			`      },
      {
        "id": "c",
        "title": "C",
        "n": 3
      }
    ]
  }
}
`,
		),
	);
	assert.deepEqual(JSON.parse(r.text).plots.rows.map((x) => x.id), ["a", "b", "c"]);
	assert.equal(r.text.startsWith(MULTI.slice(0, MULTI.indexOf('      }\n    ]'))), true, "every byte before the new row is as it was");
});

test("a row under a parent goes at the end of that parent's one list of rows, at depth two and at depth three", () => {
	const two = applyAdd(MULTI, "plots", "b2", "b", { title: "B two" });
	assert.equal(two.ok, true);
	assert.deepEqual(changed(MULTI, two.text), {
		was: "",
		now: `,
          {
            "id": "b2",
            "title": "B two"
          }`,
	});
	// the list of b1 is steps, whose rows are on one line each: the new row is on one line too, spaced as theirs
	const three = applyAdd(MULTI, "plots", "b1s2", "b1", { title: "Next step" });
	assert.equal(three.ok, true);
	assert.deepEqual(changed(MULTI, three.text), { was: "", now: `,\n              { "id": "b1s2", "title": "Next step" }` });
	assert.equal(JSON.parse(three.text).plots.rows[1].jobs[0].steps[1].title, "Next step");
});

test("a one-line layout stays on one line, with its spacing: compact, spaced after a colon, spaced inside braces", () => {
	const compact = `{"plots":{"rows":[{"id":"a","t":"x"},{"id":"b","t":"y"}]}}`;
	assert.equal(applyAdd(compact, "plots", "c", undefined, { t: "z", n: 1 }).text, `{"plots":{"rows":[{"id":"a","t":"x"},{"id":"b","t":"y"},{"id":"c","t":"z","n":1}]}}`);
	const spaced = `[ { "id" : "a", "t" : "x" }, { "id" : "b", "t" : "y" } ]`;
	assert.equal(applyAdd(spaced, "", "c", undefined, { t: "z" }).text, `[ { "id" : "a", "t" : "x" }, { "id" : "b", "t" : "y" }, { "id" : "c", "t" : "z" } ]`);
	const colons = `{"rows": [{"id": "a", "t": "x"}, {"id": "b", "t": "y"}]}`;
	assert.equal(applyAdd(colons, "", "c", undefined, { t: "z" }).text, `{"rows": [{"id": "a", "t": "x"}, {"id": "b", "t": "y"}, {"id": "c", "t": "z"}]}`);
	const lone = `{"rows":[{"id":"a"}]}`;
	assert.equal(applyAdd(lone, "", "c", undefined, {}).text, `{"rows":[{"id":"a"},{"id":"c"}]}`, "a row with only an id");
});

test("a row stays multi-line with the indent and the key spacing of the row before it (tabs, no space after the colon)", () => {
	const tabs = `{\n\t"rows": [\n\t\t{\n\t\t\t"id":"a",\n\t\t\t"t":"x"\n\t\t}\n\t]\n}`;
	assert.equal(applyAdd(tabs, "", "c", undefined, { t: "z" }).text, `{\n\t"rows": [\n\t\t{\n\t\t\t"id":"a",\n\t\t\t"t":"x"\n\t\t},\n\t\t{\n\t\t\t"id":"c",\n\t\t\t"t":"z"\n\t\t}\n\t]\n}`);
	// a list laid out one row to a line, with the first key on the brace's line
	const hung = `{"rows": [\n   { "id": "a",\n     "t": "x" },\n   { "id": "b",\n     "t": "y" }\n]}`;
	assert.equal(applyAdd(hung, "", "c", undefined, { t: "z" }).text, `{"rows": [\n   { "id": "a",\n     "t": "x" },\n   { "id": "b",\n     "t": "y" },\n   { "id": "c",\n     "t": "z" }\n]}`);
});

test("an empty list gets the plain layout: two spaces deeper than the line the list starts on, a key to a line", () => {
	assert.equal(
		applyAdd(`{\n  "plots": {\n    "rows": []\n  }\n}\n`, "plots", "c", undefined, { t: "z", n: 2 }).text,
		`{\n  "plots": {\n    "rows": [\n      {\n        "id": "c",\n        "t": "z",\n        "n": 2\n      }\n    ]\n  }\n}\n`,
	);
	assert.equal(applyAdd(`[]`, "", "c", undefined, { t: "z" }).text, `[\n  {\n    "id": "c",\n    "t": "z"\n  }\n]`);
	assert.equal(applyAdd(`{"rows": [\n]}`, "", "c", undefined, {}).text, `{"rows": [\n  {\n    "id": "c"\n  }\n]}`);
	assert.equal(applyAdd(`{"rows": []}`, "", "c", undefined, {}).text, `{"rows": [\n  {\n    "id": "c"\n  }\n]}`);
});

test("CRLF stays CRLF and a leading byte order mark stays where it is", () => {
	const crlf = MULTI.replace(/\n/g, "\r\n");
	const r = applyAdd(crlf, "plots", "c", undefined, { title: "C" });
	assert.equal(r.ok, true);
	assert.equal(r.text, applyAdd(MULTI, "plots", "c", undefined, { title: "C" }).text.replace(/\n/g, "\r\n"));
	assert.equal(/[^\r]\n/.test(r.text), false, "no bare LF came in");
	const bom = "﻿" + MULTI;
	const b = applyAdd(bom, "plots", "c", undefined, { title: "C" });
	assert.equal(b.text.charCodeAt(0), 0xfeff);
	assert.equal(b.text.slice(1), applyAdd(MULTI, "plots", "c", undefined, { title: "C" }).text);
	// an empty list written with CRLF is filled with CRLF
	const empty = applyAdd(`{\r\n  "rows": [\r\n  ]\r\n}\r\n`, "", "c", undefined, { t: "z" });
	assert.equal(empty.text, `{\r\n  "rows": [\r\n    {\r\n      "id": "c",\r\n      "t": "z"\r\n    }\r\n  ]\r\n}\r\n`);
	// and a removal leaves them alone
	const gone = applyDelete("﻿" + crlf, "plots", "a", { id: "a", title: "A" });
	assert.equal(gone.text.charCodeAt(0), 0xfeff);
	assert.equal(gone.text.includes("\r\n"), true);
	assert.equal(/[^\r]\n/.test(gone.text), false);
});

test("the id is the row's first key, a number id is written as a number, and a `row` that carries an id does not replace it", () => {
	const r = applyAdd(`{"rows":[{"id":1,"t":"x"}]}`, "", 2, undefined, { id: "evil", t: "z" });
	assert.equal(r.text, `{"rows":[{"id":1,"t":"x"},{"id":2,"t":"z"}]}`);
	assert.deepEqual(applyAdd(`{"rows":[{"id":"a"}]}`, "", "", undefined, {}), { ok: false, why: "unreadable" }, "an empty id is no id");
	assert.deepEqual(applyAdd(`{"rows":[{"id":"a"}]}`, "", null, undefined, {}), { ok: false, why: "unreadable" });
	// values keep their type: text with quotes, a number, null
	const v = applyAdd(`{"rows":[{"id":"a"}]}`, "", "c", undefined, { s: 'He said "hi"\n', n: 7.5, z: null });
	assert.deepEqual(JSON.parse(v.text).rows[1], { id: "c", s: 'He said "hi"\n', n: 7.5, z: null });
});

test("a key path two levels deep finds the list, and a path that is not there writes nothing", () => {
	const t = `{ "a": { "b": { "rows": [ {"id": "r"} ] } }, "rows": [ {"id": "x"} ] }`;
	assert.equal(applyAdd(t, "a.b", "c", undefined, {}).text, `{ "a": { "b": { "rows": [ {"id": "r"}, {"id": "c"} ] } }, "rows": [ {"id": "x"} ] }`);
	assert.deepEqual(applyAdd(t, "a.c", "c", undefined, {}), { ok: false, why: "no row" });
	assert.deepEqual(applyAdd(t, "a", "c", undefined, {}), { ok: false, why: "no row" }, "an object at the path with no rows");
	assert.deepEqual(applyAdd("not json", "", "c", undefined, {}), { ok: false, why: "unreadable" });
});

test("applying an add twice adds once: a row with that id already there is the same", () => {
	const once = applyAdd(MULTI, "plots", "c", undefined, { title: "C" });
	const twice = applyAdd(once.text, "plots", "c", undefined, { title: "C" });
	assert.equal(twice.ok, true);
	assert.equal(twice.text, once.text);
	// at any depth: the id exists under another parent
	assert.equal(applyAdd(MULTI, "plots", "b1", undefined, { title: "B one" }).text, MULTI);
	assert.equal(applyAdd(MULTI, "plots", "b1s1", "a", { title: "Step" }).text, MULTI, "the pick exists, wherever the parent is");
});

test("the parent: none is gone, more than one is ambiguous, and a parent needs exactly one list of rows", () => {
	assert.deepEqual(applyAdd(MULTI, "plots", "c", "nobody", {}), { ok: false, why: "no row" });
	const twin = `{"rows":[{"id":"p","k":[{"id":"x"}]},{"id":"p","k":[{"id":"y"}]}]}`;
	assert.deepEqual(applyAdd(twin, "", "c", "p", {}), { ok: false, why: "ambiguous" });
	// no list of rows: a plain row cannot take a first child
	assert.deepEqual(applyAdd(MULTI, "plots", "c", "a", {}), { ok: false, why: "no place" });
	// an empty list is not a list of rows
	assert.deepEqual(applyAdd(`{"rows":[{"id":"p","k":[]}]}`, "", "c", "p", {}), { ok: false, why: "no place" });
	// two lists of rows: it cannot tell
	assert.deepEqual(applyAdd(`{"rows":[{"id":"p","k":[{"id":"x"}],"m":[{"id":"y"}]}]}`, "", "c", "p", {}), { ok: false, why: "no place" });
	// lists of plain values beside the one list of rows do not count
	const mixed = applyAdd(`{"rows":[{"id":"p","notes":["a","b"],"empty":[],"k":[{"id":"x"}]}]}`, "", "c", "p", { t: "z" });
	assert.equal(mixed.text, `{"rows":[{"id":"p","notes":["a","b"],"empty":[],"k":[{"id":"x"},{"id":"c","t":"z"}]}]}`);
	// a refusal writes nothing: it returns no text
	assert.equal("text" in applyAdd(MULTI, "plots", "c", "a", {}), false);
});

/* ---- removing ---- */

test("a removal takes the row with its comma and its own line, first, middle and last; nothing else changes", () => {
	const three = `{
  "rows": [
    { "id": "a", "t": 1 },
    { "id": "b", "t": 2 },
    { "id": "c", "t": 3 }
  ]
}
`;
	const gone = (id, t) => applyDelete(three, "", id, { id, t });
	assert.equal(gone("a", 1).text, three.replace(`    { "id": "a", "t": 1 },\n`, ""));
	assert.equal(gone("b", 2).text, three.replace(`    { "id": "b", "t": 2 },\n`, ""));
	assert.equal(gone("c", 3).text, three.replace(`,\n    { "id": "c", "t": 3 }`, ""));
	assert.equal(changed(three, gone("b", 2).text).now, "", "only text went, none came in");
	// one line
	const one = `{"rows":[{"id":"a"},{"id":"b"},{"id":"c"}]}`;
	assert.equal(applyDelete(one, "", "b", { id: "b" }).text, `{"rows":[{"id":"a"},{"id":"c"}]}`);
	assert.equal(applyDelete(one, "", "a", { id: "a" }).text, `{"rows":[{"id":"b"},{"id":"c"}]}`);
	assert.equal(applyDelete(one, "", "c", { id: "c" }).text, `{"rows":[{"id":"a"},{"id":"b"}]}`);
});

test("a removal takes the rows under the row with it, at any depth, and the parent's list keeps its other rows", () => {
	const r = applyDelete(MULTI, "plots", "b", { id: "b", title: "B", jobs: [{ id: "b1", title: "B one", steps: [{ id: "b1s1", title: "Step" }] }] });
	assert.equal(r.ok, true);
	assert.equal(
		r.text,
		`{
  "plots": {
    "fields": { "title": "Name" },
    "rows": [
      {
        "id": "a",
        "title": "A"
      }
    ]
  }
}
`,
	);
	const deep = applyDelete(MULTI, "plots", "b1s1", { id: "b1s1", title: "Step" });
	assert.equal(deep.ok, true);
	assert.equal(JSON.parse(deep.text).plots.rows[1].jobs[0].steps.length, 0, "the only row of a list leaves an empty list");
	assert.equal(deep.text.includes('"steps": []'), true);
});

test("the only row of the block's list leaves `[]`", () => {
	assert.equal(applyDelete(`{"rows":[{"id":"a"}]}`, "", "a", { id: "a" }).text, `{"rows":[]}`);
	assert.equal(applyDelete(`{\n  "rows": [\n    { "id": "a" }\n  ]\n}\n`, "", "a", { id: "a" }).text, `{\n  "rows": []\n}\n`);
});

test("a removal is checked against what the reader saw: the whole row, key order ignored, types strict; a change since refuses", () => {
	const t = `{"rows":[{"id":"a","t":"x","n":1,"k":[{"id":"k1","u":true}]}]}`;
	const was = { k: [{ u: true, id: "k1" }], n: 1, t: "x", id: "a" };
	assert.equal(applyDelete(t, "", "a", was).text, `{"rows":[]}`, "the same row with its keys in another order");
	for (const stale of [{ ...was, t: "y" }, { ...was, n: "1" }, { ...was, extra: 1 }, { id: "a", t: "x", n: 1 }, { ...was, k: [{ id: "k1", u: false }] }, { ...was, k: [] }]) {
		assert.deepEqual(applyDelete(t, "", "a", stale), { ok: false, why: "changed" }, JSON.stringify(stale));
	}
	assert.equal(sameJson({ a: [1, { b: null }] }, { a: [1, { b: null }] }), true);
	assert.equal(sameJson([1, 2], [2, 1]), false, "a list's order matters");
	assert.equal(sameJson(0, false), false);
	assert.equal(sameJson(null, {}), false);
});

test("a row already gone is the same, and a repeated id refuses", () => {
	const t = `{"rows":[{"id":"a"}]}`;
	const gone = applyDelete(t, "", "zzz", { id: "zzz" });
	assert.deepEqual(gone, { ok: true, text: t }, "nothing to remove, no error");
	const once = applyDelete(t, "", "a", { id: "a" });
	assert.equal(applyDelete(once.text, "", "a", { id: "a" }).text, once.text, "applied twice, removed once");
	assert.deepEqual(applyDelete(`{"rows":[{"id":"a"},{"id":"a"}]}`, "", "a", { id: "a" }), { ok: false, why: "ambiguous" });
	assert.deepEqual(applyDelete("nope", "", "a", {}), { ok: false, why: "unreadable" });
	assert.deepEqual(applyDelete(t, "x", "a", {}), { ok: false, why: "no row" }, "the key path is not there");
});

test("a row held as a field's one object has no list to leave: refused", () => {
	const t = `{"rows":[{"id":"p","kid":{"id":"k","t":"x"}}]}`;
	assert.deepEqual(applyDelete(t, "", "k", { id: "k", t: "x" }), { ok: false, why: "no place" });
});

test("an add then a delete of the same row returns the text it started from when the add was in the layout of its neighbour", () => {
	const added = applyAdd(MULTI, "plots", "c", undefined, { title: "C" });
	const back = applyDelete(added.text, "plots", "c", { id: "c", title: "C" });
	assert.equal(back.text, MULTI);
	const under = applyAdd(MULTI, "plots", "b2", "b", { title: "B two" });
	assert.equal(applyDelete(under.text, "plots", "b2", { id: "b2", title: "B two" }).text, MULTI);
});

test("a chain of rows is looked through; one nested too deep for the reader to scan is refused in words (unreadable), never a crash", () => {
	const chain = (n) => {
		let t = `{"id":"leaf"}`;
		for (let i = 0; i < n; i++) t = `{"id":"n${i}","k":[${t}]}`;
		return `{"rows":[${t}]}`;
	};
	const shallow = chain(150);
	assert.equal(applyAdd(shallow, "", "new", "leaf", {}).ok, false, "the leaf holds no list of rows");
	const r = applyAdd(shallow, "", "new", "n0", { t: "z" });
	assert.equal(r.ok, true);
	assert.equal(applyDelete(shallow, "", "leaf", { id: "leaf" }).ok, true);
	assert.deepEqual(applyAdd(chain(20000), "", "new", "n0", {}), { ok: false, why: "unreadable" });
});

/* ---- the cold review's fix round (contract section 8) ---- */

/** The reviewer's file: a byte order mark, CRLF, tabs, and a Latin-1 byte that the decoder made U+FFFD. */
const LATIN1 = `﻿{"beds":{"fields":{"title":"Name"},"rows":[\r\n\t{"id":"b-1","title":"Caf�"},\r\n\t{"id":"b-2","title":"Two"}\r\n]}}\r\n`;

test("text with a replacement character (a byte that was not UTF-8) is refused by an edit, an add and a delete: nothing is written", () => {
	assert.deepEqual(applyAdd(LATIN1, "beds", "b-3", undefined, { title: "Three" }), { ok: false, why: "not utf8" });
	assert.deepEqual(applyDelete(LATIN1, "beds", "b-2", { id: "b-2", title: "Two" }), { ok: false, why: "not utf8" });
	assert.deepEqual(core.applyAct(LATIN1, "beds", "b-2", "title", "Two", "2"), { ok: false, why: "not utf8" });
	// the same text without the damage is written as before (the byte order mark, CRLF and tabs stay)
	const clean = LATIN1.replace("�", "é");
	const r = applyAdd(clean, "beds", "b-3", undefined, { title: "Three" });
	assert.equal(r.ok, true);
	assert.equal(r.text.startsWith("﻿"), true);
	assert.equal(r.text.includes("Café"), true);
});

test("an add whose id is already there is the same only when every field of its row matches; otherwise it is a clash and nothing is written", () => {
	const t = `{"rows":[{"id":"j-5","title":"Mow","stage":"todo","extra":1}]}`;
	// same fields (the row may have more than the entry's): the same
	assert.deepEqual(applyAdd(t, "", "j-5", undefined, { title: "Mow", stage: "todo" }), { ok: true, text: t });
	assert.deepEqual(applyAdd(t, "", "j-5", undefined, {}), { ok: true, text: t }, "an entry with no fields matches any row of that id");
	// a different value, or a field the row lacks: a clash
	assert.deepEqual(applyAdd(t, "", "j-5", undefined, { title: "Water" }), { ok: false, why: "clash" });
	assert.deepEqual(applyAdd(t, "", "j-5", undefined, { title: "Mow", note: "x" }), { ok: false, why: "clash" });
	// types are strict: the number 1 is not the text "1"
	assert.deepEqual(applyAdd(t, "", "j-5", undefined, { extra: "1" }), { ok: false, why: "clash" });
	assert.deepEqual(applyAdd(t, "", "j-5", undefined, { extra: 1 }), { ok: true, text: t });
});

test("a removal of a row nested too deep to compare is refused in words (too deep), never a crash", () => {
	const deep = (n) => "[".repeat(n) + "]".repeat(n);
	const row = (n) => `{"id":"r","x":${deep(n)}}`;
	// shallow enough to compare: taken out; thousands deep (the reviewer's 5000-level chain): too deep to compare, refused in words
	assert.equal(applyDelete(`{"rows":[${row(500)}]}`, "", "r", JSON.parse(row(500))).ok, true);
	assert.deepEqual(applyDelete(`{"rows":[${row(4000)}]}`, "", "r", JSON.parse(row(4000))), { ok: false, why: "too deep" });
});

test("a number beyond JavaScript's exact range in a removed row: the rest of the file is the bytes it was", () => {
	const t = `{"rows":[\n  {"id":"a","big":12345678901234567890},\n  {"id":"b","big":98765432109876543210}\n]}`;
	const was = JSON.parse(`{"id":"a","big":12345678901234567890}`);
	const r = applyDelete(t, "", "a", was);
	assert.equal(r.ok, true);
	assert.equal(r.text, `{"rows":[\n  {"id":"b","big":98765432109876543210}\n]}`);
});

test("a row holding a very long run of spaces is laid out in milliseconds, not seconds (no quadratic pattern in the layout reading)", () => {
	const long = `{"rows":[{"id":"a","note":"${" ".repeat(60000)}x"}]}`;
	const t1 = Date.now();
	const added = applyAdd(long, "", "b", undefined, { title: "B" });
	assert.equal(added.ok, true);
	assert.ok(Date.now() - t1 < 500, `took ${Date.now() - t1} ms`);
	assert.equal(JSON.parse(added.text).rows.length, 2);
	// the same for the unwritten tail: spaces before the closing brace of a long one-line row
	const spaced = `{"rows":[{ "id":"a", "note":"${" ".repeat(60000)}" }]}`;
	const t0 = Date.now();
	const r = applyAdd(spaced, "", "b", undefined, { title: "B" });
	assert.ok(Date.now() - t0 < 500, `took ${Date.now() - t0} ms`);
	assert.equal(r.text.includes('{ "id":"b", "title":"B" }'), true, "and the layout is still read: the braces' padding comes from the row before");
});
