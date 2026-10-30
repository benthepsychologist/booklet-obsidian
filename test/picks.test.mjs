/*
 * Rows carry what a date sort, a chart and removal need (a kept entry's time, a scale answer's chart number), and a
 * question asked for each pick, named alone in `from:`, draws as tiles, bars or a line with one row for each pick
 * (SPEC section 6 says "one row per pick and value" and not what the row holds: the plugin leads the format here).
 * Made-up entries only.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { core, keepDays } from "./helpers.mjs";

process.env.TZ = "UTC";

const DRAWN = new Date("2026-10-28T12:00:00Z");
const fm = `---\nbooklet: "0.16"\ntitle: Tools\n---\n`;
const fence = (body) => "```booklet query\n" + body + "\n```";

const NOTE = (queries) => `${fm}
> [!activity|log repeat] Log

> [!multi|tools open] Which tools?
- [ ] Pencil
- [ ] Ruler
- [ ] Scissors

> [!number|uses each:tools] Times used

> [!scale|grip each:tools] How well it grips

1. Slack
2. Fine
3. Firm

> [!scale|mood] Mood

1. Low
2. Fair
3. High

> [!number|hours] Hours slept

> [!activity|show] Show

${queries.map(fence).join("\n\n")}
`;

const DAYS = [
	["2026-10-26T09:00:00Z", { tools: [1, 2], uses: [{ pick: 1, a: 3 }, { pick: 2, a: 1 }], grip: [{ pick: 1, a: 2 }], mood: 1, hours: 6 }],
	["2026-10-27T09:00:00Z", { tools: [1, 3], uses: [{ pick: 1, a: 5 }, { pick: 3, a: 2 }], grip: [{ pick: 3, a: 3 }], mood: 3, hours: 7.5 }],
];

const planOf = (queries, days = DAYS, i = 0) => {
	const text = keepDays(NOTE(queries), "", "log", days);
	const b = core.parseBooklet(text);
	const seg = b.activities.find((a) => a.id === "show").segments.filter((s) => s.type === "query")[i];
	return core.planQuery(b, seg, { drawn: DRAWN, now: DRAWN });
};
const rowsOf = (p) => p.groups.flatMap((g) => g.rows);

test("a row carries its entry's time; a scale answer carries its chart number and not a table's number; a number answer carries both", () => {
	const p = planOf(["from: log\nfields: mood, hours"]);
	const rows = rowsOf(p);
	assert.deepEqual(rows.map((r) => r.ts), ["2026-10-27T09:00:00Z", "2026-10-26T09:00:00Z"], "newest first, as the entries are");
	assert.deepEqual([rows[0].cells.mood.text, rows[0].cells.mood.plot, rows[0].cells.mood.num], ["High", 3, undefined]);
	assert.deepEqual([rows[0].cells.hours.num, rows[0].cells.hours.plot], [7.5, undefined]);
	assert.deepEqual([core.numberOf(rows[0].cells.mood), core.numberOf(rows[0].cells.hours), core.numberOf(rows[0].cells.date)], [3, 7.5, undefined]);
});

test("a summary row or a distribution row has no time", () => {
	const p = planOf(["from: log\nsummary: on\nlimit: 30 days"]);
	assert.ok(rowsOf(p).length > 0);
	assert.ok(rowsOf(p).every((r) => r.ts === undefined));
});

test("a question of an activity that does not repeat is read from its answers, and its row has no time", () => {
	let text = `${fm}\n> [!activity|once] Once\n\n> [!scale|mood] Mood\n\n1. Low\n2. High\n\n> [!activity|show] Show\n\n${fence("from: mood")}\n`;
	text = core.setAnswer(text, "", "mood", 2);
	const b = core.parseBooklet(text);
	const seg = b.activities.find((a) => a.id === "show").segments.find((s) => s.type === "query");
	const p = core.planQuery(b, seg, { drawn: DRAWN, now: DRAWN });
	assert.equal(p.kind, "rows");
	assert.deepEqual(rowsOf(p).map((r) => [r.ts, r.cells.mood.plot]), [[undefined, 2]]);
});

test("tiles of a question asked for each pick: one tile for each pick the source holds, its words the label and its answer the value, in the source's order", () => {
	const p = planOf(["from: uses\nas: tiles"]);
	assert.equal(p.kind, "rows");
	assert.equal(p.view, "tiles");
	assert.deepEqual(
		rowsOf(p).map((r) => [r.cells[p.roles.label].text, r.cells[p.roles.value].text]),
		[
			["Pencil", "5"],
			["Ruler", "1"],
			["Scissors", "2"],
		],
		"Pencil's answer is the newest entry's, 5, not the earlier 3",
	);
});

test("tiles of an each-pick scale show the anchor's words; a pick nobody answered has no tile; the time is the entry the answer came from", () => {
	const p = planOf(["from: grip\nas: tiles"]);
	assert.deepEqual(
		rowsOf(p).map((r) => [r.cells.label.text, r.cells.value.text, r.ts]),
		[
			["Pencil", "Fine", "2026-10-26T09:00:00Z"],
			["Scissors", "Firm", "2026-10-27T09:00:00Z"],
		],
	);
	assert.equal(rowsOf(p)[0].cells.value.plot, 2);
});

test("tiles of an each-pick: limit takes the first N picks; a span of days reads only those days' entries; tone and the other roles still apply", () => {
	assert.deepEqual(rowsOf(planOf(["from: uses\nas: tiles\nlimit: 2"])).map((r) => r.cells.label.text), ["Pencil", "Ruler"]);
	assert.deepEqual(rowsOf(planOf(["from: uses\nas: tiles\nlimit: 2 days"])).map((r) => [r.cells.label.text, r.cells.value.text]), [
		["Pencil", "5"],
		["Scissors", "2"],
	]);
});

test("tiles of an each-pick over no entries say the query's empty words", () => {
	const p = planOf(["from: uses\nas: tiles\nempty: Nothing used yet."], []);
	assert.equal(p.empty, "Nothing used yet.");
});

test("a table, a list or cards of an each-pick still give a row for each entry with a field for each pick", () => {
	const p = planOf(["from: uses"]);
	assert.equal(p.set.kind, "entries");
	assert.equal(rowsOf(p).length, 2);
	assert.deepEqual(p.set.own.slice(0, 1), ["date"]);
});

test("bars and a line of an each-pick are drawn from the same rows: a bar for each pick", () => {
	const bars = planOf(["from: uses\nas: bars"]);
	assert.deepEqual(rowsOf(bars).map((r) => r.cells.label.text), ["Pencil", "Ruler", "Scissors"], "in the source's order, not turned round as entries are");
	assert.deepEqual([bars.chart.kind, bars.chart.keys], ["bars", ["value"]]);
});

test("the wrong-shape guard: an each-pick answer of the wrong shape, a scale answer that is a word, and a pair for a pick the entry does not hold give no tile, no bar number and no row value", () => {
	const wrong = planOf(["from: uses\nas: tiles"], [["2026-10-27T09:00:00Z", { tools: [1], uses: [{ pick: 1, a: "many" }] }]]);
	assert.deepEqual(rowsOf(wrong), [], "a pair whose answer is not a number is kept in the note and drawn nowhere");
	assert.equal(wrong.empty, "Nothing kept here yet.");
	const notPairs = planOf(["from: uses\nas: tiles"], [["2026-10-27T09:00:00Z", { tools: [1], uses: "five" }]]);
	assert.deepEqual(rowsOf(notPairs), []);
	const held = planOf(["from: uses\nas: tiles"], [["2026-10-27T09:00:00Z", { tools: [1], uses: [{ pick: 1, a: 2 }, { pick: 3, a: 9 }] }]]);
	assert.deepEqual(rowsOf(held).map((r) => r.cells.label.text), ["Pencil"], "Scissors was not picked in this entry, so its pair is not read");
	const word = planOf(["from: log\nfields: mood"], [["2026-10-27T09:00:00Z", { mood: "high", hours: 5 }]]);
	assert.equal(core.numberOf(rowsOf(word)[0]?.cells.mood), undefined, "a scale answer of the wrong shape has no cell and no number");
});
