/*
 * The panel's scan (a port of the linter's reading of structure) and the plugin's reader (reader.ts) must find the same modules,
 * activities, questions and pages in every booklet of the corpus. The scan decides which ids a new piece may take, the reader decides
 * what a reader sees, so a difference between them is an id the panel could give out wrongly.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { core, corpusFiles, read } from "./helpers.mjs";

const { scan, parseBooklet, questionsOf } = core;

function summaryOfScan(text) {
	const s = scan(text);
	const mods = s.items.filter((i) => i.type === "module").map((i) => i.id);
	const acts = s.items.filter((i) => i.type === "activity").map((i) => `${i.mod ?? ""}/${i.id}`);
	const qs = s.items.filter((i) => i.type === "question").map((i) => `${i.mod ?? ""}/${i.act ?? ""}/${i.id}`);
	const pages = s.items.filter((i) => i.type === "page-named").map((i) => i.words.id ?? i.pageId);
	return { mods, acts, qs, pages };
}

function summaryOfReader(text) {
	const b = parseBooklet(text);
	const mods = b.modules.map((m) => m.id);
	const acts = b.activities.map((a) => `${a.scope}/${a.id}`);
	const qs = b.activities.flatMap((a) => questionsOf(a).map((q) => `${a.scope}/${a.id}/${q.id}`));
	const pages = b.activities.flatMap((a) => a.segments.filter((s) => s.type === "page").map((s) => s.id ?? ""));
	return { mods, acts, qs, pages };
}

const files = corpusFiles();

test("the corpus is there to compare against", () => {
	assert.ok(files.length > 0, "no booklet files");
});

for (const f of files) {
	const name = f.split("/").slice(-2).join("/");
	test(`the scan and the reader find the same structure: ${name}`, () => {
		const text = read(f);
		const b = parseBooklet(text);
		if (!b.ok) return; // refused: no structure to compare
		const s = scan(text);
		const a = summaryOfScan(text);
		const r = summaryOfReader(text);
		assert.deepEqual(a.mods, r.mods, "modules");
		assert.deepEqual(a.acts, r.acts, "activities");
		// the reader leaves out a question it could not draw (no id, no options); everything it has the scan has too, as a question or,
		// for one in a reading callout that holds it (which the linter does not read as a scope's), as an id new pieces keep away from
		for (const q of r.qs) assert.ok(a.qs.includes(q) || s.ids.reserved.has(q.split("/").pop()), `the reader has the question ${q}, the scan does not`);
		// a page the reader numbered or dropped (no id written, or in a place it cannot stand) is not compared by id
		for (const p of r.pages.filter(Boolean)) assert.ok(a.pages.includes(p), `the reader has the page ${p}, the scan does not`);
	});
}
