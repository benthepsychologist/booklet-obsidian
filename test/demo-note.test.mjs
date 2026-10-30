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

