/*
 * The reader's sort and filter worked out from a plan (core/view-state.ts), with no document: the order it gives (numbers as
 * numbers, a missing value last whichever way, rows that tie in the order they came), what a search reads, and what a
 * sort of a field the view does not offer does (nothing).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { core } from "./helpers.mjs";

const fm = `---\nbooklet: "0.16"\ntitle: T\n---\n`;
const rows = [
	{ n: "b", v: 10, g: "x" },
	{ n: "a", v: 2, g: "y" },
	{ n: "c", g: "x" },
	{ n: "d", v: 2, g: "y" },
	{ n: "e", v: 7, g: "x" },
];
const plan = (q) => {
	const t = `${fm}\n> [!activity|show] S\n\n\`\`\`booklet query\n${q}\n\`\`\`\n\n> [!data] D\n\n\`\`\`booklet data\n${JSON.stringify(rows)}\n\`\`\`\n^d\n`;
	const b = core.parseBooklet(t);
	return core.planQuery(b, b.activities.find((a) => a.id === "show").segments.find((s) => s.type === "query"), { drawn: new Date("2026-10-28T12:00:00Z") });
};
const names = (p) => p.groups.flatMap((g) => g.rows).map((r) => r.cells.n.text);

test("a sort by a field the view does not offer is dropped; with no state the rows are as the plan has them", () => {
	const p = plan("from: d\nas: list\nlabel: n\nfields: v");
	const st = core.newViewState();
	assert.deepEqual(names(core.applyViewState(p, st).plan), ["b", "a", "c", "d", "e"]);
	st.key = "nope";
	st.dir = -1;
	const s = core.applyViewState(p, st);
	assert.deepEqual(names(s.plan), ["b", "a", "c", "d", "e"]);
	assert.deepEqual([st.key, st.dir], [null, 1]);
});

