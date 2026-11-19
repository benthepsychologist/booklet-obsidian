/*
 * The cases the Booklet repository shares with every writer and reader of rows, run against this plugin's own code. They were made by running
 * this plugin's core (`applyInFence` with `applyAdd`, `applyDelete` and `applyAct`; `withPending` and `rowIds`), and the browser reader
 * (renderer 0.20.2) runs the same files against its port, so the two cannot drift apart without a test failing.
 *
 * The files are copies of the Booklet repository's own `test/apply-vectors.json` and `test/pending-vectors.json` (and `test/id-vectors.json`,
 * run by id-vectors.test.mjs). A later copy replaces each whole, byte for byte, never edited here: see README.md, "Shared test cases".
 *
 * An apply case is a whole note, one act and the whole note after it (or the word of the refusal), so a pass shows that nothing outside the
 * block's fences moved. `@PAD@` in a case's text and act (and in its expected text) stands for `pad` letters x, to make a big block without a
 * big file; it is expanded exactly as the renderer's test (test/applyvectors.test.js) expands it.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { core } from "./helpers.mjs";

const { applyInFence, applyAdd, applyDelete, applyAct, sameValue, sameOption, DATA_FILE_MAX, withPending, rowIds } = core;

const file = (name) => new URL(`./${name}`, import.meta.url);
const apply = JSON.parse(readFileSync(file("apply-vectors.json"), "utf8"));
const pending = JSON.parse(readFileSync(file("pending-vectors.json"), "utf8"));

/** A case's `pad` stands for that many x in every `@PAD@` of a text, or of the strings inside an act. */
const fill = (c, v) => (c.pad ? (typeof v === "string" ? v.split("@PAD@").join("x".repeat(c.pad)) : JSON.parse(JSON.stringify(v).split("@PAD@").join("x".repeat(c.pad)))) : v);

const run = (note, a) =>
	applyInFence(note, a.in, a.module, (inner) =>
		a.kind === "add" ? applyAdd(inner, "", a.pick, a.under, a.row || {}) : a.kind === "delete" ? applyDelete(inner, "", a.pick, a.was) : applyAct(inner, "", a.pick, a.field, a.was, a.a, a.eq === "option" ? sameOption : sameValue),
	);

test("the apply vectors are the shape this test reads: the plugin's limit is the file's, and every kind of act is there", () => {
	assert.ok(apply.cases.length >= 100, `${apply.cases.length} cases`);
	assert.equal(apply.limit, 5 * 1024 * 1024);
	assert.equal(apply.limit, DATA_FILE_MAX, "the limit the cases name is the plugin's");
	assert.deepEqual([...new Set(apply.cases.map((c) => c.act.kind))].sort(), ["add", "delete", "edit"]);
});

test("the shared files stay small: no case holds a big block written out (the token stands for it), and neither file passes 1 MB", () => {
	for (const f of ["apply-vectors.json", "pending-vectors.json"]) assert.ok(statSync(file(f)).size < 1024 * 1024, `${f} is ${statSync(file(f)).size} bytes`);
});

for (const c of apply.cases) {
	test(`apply vector: ${c.name}`, () => {
		const note = fill(c, c.text);
		const got = run(note, fill(c, c.act));
		// `spec` is what SPEC.md says where the file's `expect` (made when the plugin had no limit on a block written in the note) says otherwise:
		// the plugin follows SPEC now, so a case that carries `spec` is held to it (a refusal, "too big"), not to what the plugin once wrote.
		const want = c.spec ?? c.expect;
		if (want.refused) {
			assert.equal(got.ok, false, "refused");
			assert.equal(got.why, want.refused);
			assert.equal(got.text, undefined, "a refusal gives no text to write");
		} else if (want.same) {
			assert.equal(got.ok, true);
			assert.equal(got.text, note, "the note comes back as it was");
		} else {
			assert.equal(got.ok, true, got.ok ? "" : got.why);
			assert.equal(got.text === fill(c, want.text), true, "the whole note after the act, byte for byte");
		}
	});
}

test("the cases that take the note past 5 MB carry `spec`, are refused as too big, and the two that tell the note from its block are there", () => {
	const big = apply.cases.filter((c) => (c.spec ?? {}).refused === "too big");
	assert.equal(big.length, 4);
	for (const c of big) assert.equal(run(fill(c, c.text), fill(c, c.act)).why, "too big", c.name);
	assert.ok(apply.cases.some((c) => /small block in a booklet that is nearly 5 MB/.test(c.name) && c.spec?.refused === "too big"));
	assert.ok(apply.cases.some((c) => /nearly 5 MB in a booklet that stays under/.test(c.name) && !c.spec && c.expect.text));
});

function rowsOf(c) {
	return JSON.parse(JSON.stringify(c.rows));
}

test("the pending vectors are the shape this test reads", () => {
	assert.ok(pending.cases.length >= 20, `${pending.cases.length} cases`);
});

for (const c of pending.cases) {
	test(`pending vector: ${c.name}`, () => {
		const J = (x) => JSON.parse(JSON.stringify(x));
		const rows = rowsOf(c);
		const before = JSON.stringify(rows);
		const p = withPending(rows, J(c.entries), c.block);
		const adding = [];
		const kids = (v) => (Array.isArray(v) ? (v.length && v[0] && typeof v[0] === "object" && !Array.isArray(v[0]) ? v : null) : v && typeof v === "object" ? [v] : null);
		const walk = (rs) => {
			for (const r of rs) {
				if (p.adding.has(r)) adding.push(String(r.id));
				for (const v of Object.values(r)) {
					const k = kids(v);
					if (k) walk(k);
				}
			}
		};
		walk(p.rows);
		const got = { rows: J(p.rows), adding, removing: Object.fromEntries([...p.removing]), ids: rowIds(J(c.rows), J(c.entries), c.block) };
		assert.deepEqual(got, c.expect);
		assert.equal(JSON.stringify(rows), before, "the rows given are not changed");
	});
}
