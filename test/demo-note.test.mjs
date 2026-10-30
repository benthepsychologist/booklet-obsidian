/*
 * The made-up dashboard note (test/page-notes/Garden dashboards.booklet.md): every view of a query over both kinds of source, in the
 * view over a jsdom document. Reading it reports no problem, every query draws something (a chart, a table, a list, tiles, cards,
 * or its own words for no rows), drawing writes nothing, and each of the note's screens shows what its words say it shows. The
 * real-Obsidian checks 29 and up (e2e/dashboard-checks.js) open the same note.
 */
import { openView, testApp, words } from "./dom.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { core } from "./helpers.mjs";

process.env.TZ = "UTC";
const TEXT = readFileSync(new URL("./page-notes/Garden dashboards.booklet.md", import.meta.url), "utf8");

function screen(id) {
	const disk = { text: TEXT, writes: 0 };
	const v = openView(TEXT, { path: "Garden dashboards.booklet.md", disk, app: testApp(disk), screen: "activity:/" + id });
	return { ...v, queries: () => [...v.view.contentEl.querySelectorAll(".booklet-query")] };
}

test("the note reads with no problem, twelve kept days in the log and three in the shed, and three data blocks that queries read", () => {
	const b = core.parseBooklet(TEXT);
	assert.deepEqual(b.problems, []);
	assert.equal(b.records.entries[""].log.length, 12);
	assert.equal(b.records.entries[""].shed.length, 3);
	const sources = b.activities.flatMap((a) => a.segments).filter((x) => x.type === "query" && x.source?.kind === "data").map((x) => x.source.id);
	assert.deepEqual([...new Set(sources)], ["chores", "plan", "nothing"], "every data block is read and a query is linked to it");
});

const KINDS = {
	bars: ["bars", "bars", "bars"],
	lines: ["line", "line", "line"],
	kept: ["table", "list", "cards", "tiles"],
	data: ["list", "table", "cards", "tiles", "list", "tiles", "list"],
};

for (const [id, kinds] of Object.entries(KINDS)) {
	test(`the ${id} screen draws its ${kinds.length} queries, as ${[...new Set(kinds)].join(", ")}, and writes nothing`, async () => {
		const v = screen(id);
		const got = v.queries().map((q) => q.getAttribute("data-booklet-view"));
		assert.deepEqual(got, kinds);
		await v.settled();
		assert.equal(v.disk.writes, 0);
		assert.equal(v.disk.text, TEXT);
		v.close();
	});
}

test("the nothing-to-draw query says its own words, and a query over twelve kept days or twelve jobs is offered the sort and filter", () => {
	const d = screen("data");
	const last = d.queries().at(-1);
	assert.equal(words(last.querySelector(".booklet-q-empty")), "No rows in this block.");
	assert.equal(d.queries()[0].querySelectorAll(".booklet-qc").length, 1, "twelve jobs");
	d.close();
	const k = screen("kept");
	assert.equal(k.queries()[0].querySelectorAll(".booklet-qc").length, 1, "twelve kept days");
	assert.equal(k.queries()[1].querySelectorAll(".booklet-qc").length, 0, "five rows");
	k.close();
});

test("each-pick tiles and bars: one for each tool, the newest entry's answer", () => {
	const d = screen("data");
	const tiles = [...d.queries()[5].querySelectorAll(".booklet-q-tile")].map((t) => words(t));
	assert.equal(tiles.length, 3);
	assert.match(tiles[0], /Spade/);
	d.close();
	const b = screen("bars");
	assert.equal(b.queries()[2].querySelectorAll(".booklet-ch-row").length, 3);
	b.close();
});
