/*
 * A query drawn as bars or as a line (SPEC section 6): the numbers a chart is made from (core/chart.ts: oldest to
 * newest, `limit` the newest N, always from zero, a gap for what is not a number, the states in words, the numbers behind
 * every chart) and the chart drawn in the view over a jsdom document (plain SVG, named by hidden text and aria-labelledby,
 * no style attribute, the readout line and the arrow keys). Made-up entries only.
 */
import { openView, testApp, press, click, window as w } from "./dom.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { core, DRAWN, fence, fm, keepDays } from "./helpers.mjs";

process.env.TZ = "UTC";

const NOTE = (queries, blocks = "") => `${fm}
> [!activity|log repeat] Log

> [!scale|mood] Mood

1. Low
2. Fair
3. High

> [!number|sleep] Hours slept

> [!number|focus] Hours of focused work

> [!choice|day] The day
- [ ] good
- [ ] warn
- [ ] bad

> [!text|where] Where

> [!activity|show] Show

${queries.map(fence).join("\n\n")}
${blocks}`;

const DAYS = [
	["2026-10-22T08:00:00Z", { mood: 1, sleep: 6, focus: 2, day: 3, where: "home" }],
	["2026-10-23T08:00:00Z", { mood: 2, sleep: 7.5, focus: 3, day: 2 }],
	["2026-10-24T08:00:00Z", { mood: 3, sleep: 6, day: 1 }],
	["2026-10-25T08:00:00Z", { mood: 2, sleep: 5, focus: 4, day: 2 }],
	["2026-10-27T08:00:00Z", { mood: 3, sleep: 8, focus: 1, day: 1 }],
];
const text = (queries, days = DAYS, blocks) => keepDays(NOTE(queries, blocks), "", "log", days);
const planOf = (t, i = 0) => {
	const b = core.parseBooklet(t);
	const seg = b.activities.find((a) => a.id === "show").segments.filter((s) => s.type === "query")[i];
	return core.planQuery(b, seg, { drawn: DRAWN, now: DRAWN });
};
const chartOf = (queries, days, blocks) => {
	const p = planOf(text(queries, days, blocks));
	return { p, c: core.buildChart(p, p.groups.flatMap((g) => g.rows)) };
};

/* ---- the numbers ---- */

test("bars over kept entries run from the oldest day to the newest, labelled by the day without the year; a scale answer is plotted by its number", () => {
	const { c } = chartOf(["from: log\nas: bars\nlabel: date\nvalue: mood"]);
	assert.deepEqual(c.labels, ["Oct 22", "Oct 23", "Oct 24", "Oct 25", "Oct 27"]);
	assert.deepEqual(c.series, [{ name: "Mood", values: [1, 2, 3, 2, 3] }]);
	assert.equal(c.name, "Bar chart, 5 bars, from 1 to 3");
	assert.deepEqual([c.cannot, c.note], [null, null]);
});

test("limit takes the newest N entries, drawn oldest to newest, for a bar chart and for a line", () => {
	assert.deepEqual(chartOf(["from: log\nas: bars\nvalue: sleep\nlimit: 3"]).c.labels, ["Oct 24", "Oct 25", "Oct 27"]);
	assert.deepEqual(chartOf(["from: log\nas: line\nfields: sleep\nlimit: 2"]).c.labels, ["Oct 25", "Oct 27"]);
});

test("a single question named alone is the value; the label falls back to the date", () => {
	const { c } = chartOf(["from: sleep\nas: bars"]);
	assert.deepEqual(c.series[0], { name: "Hours slept", values: [6, 7.5, 6, 5, 8] });
	assert.equal(c.labels[0], "Oct 22");
});

test("a bar's tone is the row's tone field; a line has no tone", () => {
	const { c } = chartOf(["from: log\nas: bars\nvalue: sleep\ntone: day"]);
	assert.deepEqual(c.tones, ["bad", "warn", "good", "warn", "good"], "a choice whose options are the tone words colours its bar");
	const data = `\n> [!data] Data\n\n\`\`\`booklet data\n[{"w":"a","n":3,"t":"good"},{"w":"b","n":-2,"t":"bad"},{"w":"c","n":0,"t":"odd"}]\n\`\`\`\n^d\n`;
	const d = chartOf(["from: d\nas: bars\nlabel: w\nvalue: n\ntone: t"], [], data);
	assert.deepEqual(d.c.tones, ["good", "bad", null]);
	assert.deepEqual(d.c.series[0].values, [3, -2, 0], "a negative value is kept: it runs left of the zero line");
	assert.deepEqual(d.c.range, [-2, 3]);
});

test("a line has a line for each field named, a gap where a row has no number, and a name for each", () => {
	const { c } = chartOf(["from: log\nas: line\nfields: sleep, focus"]);
	assert.deepEqual(c.series, [
		{ name: "Hours slept", values: [6, 7.5, 6, 5, 8] },
		{ name: "Hours of focused work", values: [2, 3, null, 4, 1] },
	]);
	assert.equal(c.name, "Line chart of Hours slept, Hours of focused work, 5 points, from 1 to 8");
});

test("a line without fields: plots the value field; the numbers table has the same rows as words, a dash for no number", () => {
	const { c } = chartOf(["from: log\nas: line\nvalue: focus\nfields: focus, sleep"]);
	assert.deepEqual(c.table.head, ["Date", "Hours of focused work", "Hours slept"]);
	assert.deepEqual(c.table.rows[2], ["Oct 24", "–", "6"]);
	assert.deepEqual(chartOf(["from: sleep\nas: line"]).c.series.map((s) => s.name), ["Hours slept"]);
});

test("no rows: the query's own words in place of the chart; the plan holds no chart to make", () => {
	const p = planOf(text(["from: log\nas: line\nfields: sleep\nempty: Nothing walked yet."], []));
	assert.equal(p.empty, "Nothing walked yet.");
	assert.equal(planOf(text(["from: log\nas: bars\nvalue: sleep"], [])).empty, "Nothing kept here yet.");
});

test("what cannot be drawn says why in one plain sentence: a field that is not a number, no field named, several fields", () => {
	const data = `\n> [!data] Data\n\n\`\`\`booklet data\n[{"w":"a","n":"many","m":"few"},{"w":"b","n":"lots"}]\n\`\`\`\n^d\n`;
	const a = chartOf(["from: d\nas: bars\nlabel: w\nvalue: n"], [], data);
	assert.equal(a.c.cannot, "Cannot draw as bars: n is not a number.");
	const b = chartOf(["from: d\nas: bars\nlabel: w"], [], data);
	assert.equal(b.c.cannot, "Cannot draw as bars: no field was named for the length of a bar (value:).");
	const c = chartOf(["from: d\nas: line\nlabel: w\nfields: n, m"], [], data);
	assert.equal(c.c.cannot, "Cannot draw as a line: n and m are not numbers.");
	const d = chartOf(["from: d\nas: line\nlabel: w"], [], data);
	assert.equal(d.c.cannot, "Cannot draw as a line: no field was named to plot (fields: or value:).");
	assert.deepEqual(a.c.table.rows, [["a", "–"], ["b", "–"]], "the numbers are still offered");
	assert.equal(chartOf(["from: log\nas: bars\nvalue: where"]).c.cannot, "Cannot draw as bars: Where is not a number.", "a text question is not a number");
});

test("the wrong-shape guard: a value that is not a number is not plotted; a number kept as a string is not a number", () => {
	const data = `\n> [!data] Data\n\n\`\`\`booklet data\n[{"w":"a","n":"high","m":4},{"w":"b","n":2,"m":"5"},{"w":"c","n":null,"m":[1,2]}]\n\`\`\`\n^d\n`;
	const { c } = chartOf(["from: d\nas: line\nlabel: w\nfields: n, m"], [], data);
	assert.deepEqual(c.series.map((s) => s.values), [[null, 2, null], [4, null, null]]);
});

test("a chart over a summary: bars of the counts of a question's values", () => {
	const p = planOf(text(["from: day\nas: bars\nsummary: on"]));
	const c = core.buildChart(p, p.groups.flatMap((g) => g.rows));
	assert.deepEqual(c.labels, ["good", "warn", "bad"]);
	assert.deepEqual(c.series[0].values, [2, 2, 1]);
});

test("the scale: round ends, zero for bars, a line starts at zero when zero is in reach", () => {
	assert.deepEqual(core.niceScale(0, 8).ticks, [0, 5, 10]);
	assert.deepEqual(core.niceScale(-2, 3).ticks.includes(0), true);
	assert.equal(core.lineDomain([6, 7.5, 5, 8]).min, 4, "5 to 8 is not far from the top, so the scale starts below the smallest");
	assert.equal(core.lineDomain([1, 8]).min, 0);
	assert.deepEqual(core.thinLabels(1, 100, 50), [0]);
	assert.deepEqual(core.thinLabels(12, 100, 50), [0, 11], "labels 50 wide on 9 a point: every 6th would not fit another before the last");
	assert.deepEqual(core.thinLabels(12, 100, 20), [0, 3, 6, 11], "the first, every step-th, the last");
});

/* ---- drawn in the view ---- */

function open(t) {
	const disk = { text: t, writes: 0 };
	const v = openView(t, { path: "Note.booklet.md", disk, app: testApp(disk), screen: "activity:/show" });
	return { ...v, queries: () => [...v.view.contentEl.querySelectorAll(".booklet-query")] };
}
const labelOf = (root, el) => root.querySelector("#" + el.getAttribute("aria-labelledby"))?.textContent;

test("a bar chart: a list of bars, each with its label and number; the chart named by hidden text; no aria-label, no style; the numbers under a closed fold", async () => {
	const t = text(["from: log\nas: bars\nvalue: sleep\nlimit: 3"]);
	const v = open(t);
	const [q] = v.queries();
	assert.equal(q.getAttribute("data-booklet-view"), "bars");
	const chart = q.querySelector(".booklet-ch-bars");
	assert.equal(chart.getAttribute("role"), "group");
	assert.equal(labelOf(q, chart), "Bar chart, 3 bars, from 5 to 8");
	const rows = [...chart.querySelectorAll(".booklet-ch-row")];
	assert.deepEqual(rows.map((r) => [r.querySelector(".booklet-ch-l").textContent, r.querySelector(".booklet-ch-v").textContent]), [["Oct 24", "6"], ["Oct 25", "5"], ["Oct 27", "8"]]);
	assert.equal(rows[0].querySelector("svg").getAttribute("aria-hidden"), "true");
	assert.equal(q.querySelectorAll("svg[aria-label], [aria-label]").length, 0, "Obsidian turns an aria-label into a tooltip, and threw on an svg that had one");
	assert.equal(q.querySelectorAll("[style]").length, 0, "no inline style");
	const widths = rows.map((r) => Number(r.querySelector("rect").getAttribute("width")));
	assert.ok(widths[2] > widths[0] && widths[0] > widths[1], "a bar's length is its value, from zero");
	assert.equal(rows[0].querySelector("rect").getAttribute("x"), "0", "from zero");
	const fold = q.querySelector("details.booklet-ch-nums");
	assert.equal(fold.open, false);
	assert.equal(fold.querySelector("summary").textContent, "Show the numbers");
	assert.deepEqual([...fold.querySelectorAll("tbody tr")].map((tr) => [...tr.children].map((x) => x.textContent)), [["Oct 24", "6"], ["Oct 25", "5"], ["Oct 27", "8"]]);
	assert.equal(fold.querySelector("thead th").textContent, "Date");
	await v.settled();
	assert.equal(v.disk.writes, 0);
	assert.equal(v.disk.text, t);
	v.close();
});

test("bars: a tone colours the bar and is said in words; a bar of 0 or of no number has no rect; a negative bar runs left of a zero line", () => {
	const data = `\n> [!data] Data\n\n\`\`\`booklet data\n[{"w":"Up","n":3,"t":"good"},{"w":"Down","n":-2,"t":"bad"},{"w":"Flat","n":0},{"w":"None","n":"n/a"}]\n\`\`\`\n^d\n`;
	const v = open(text(["from: d\nas: bars\nlabel: w\nvalue: n\ntone: t"], [], data));
	const rows = [...v.queries()[0].querySelectorAll(".booklet-ch-row")];
	assert.ok(rows[0].querySelector("rect.booklet-ch-bar.booklet-tone-good"));
	assert.match(rows[0].textContent, /\(Good\)/);
	assert.ok(rows[1].querySelector("rect.booklet-tone-bad"));
	assert.ok(rows[1].querySelector("line.booklet-ch-zero"), "a negative value shows where zero is");
	assert.equal(rows[2].querySelector("rect"), null);
	assert.equal(rows[3].querySelector("rect"), null);
	assert.equal(rows[3].querySelector(".booklet-ch-v").textContent, "–");
	v.close();
});

test("bars with every value 0, with one row, and that cannot be drawn: each says so in words, with the numbers still under it", () => {
	const zero = open(text(["from: log\nas: bars\nvalue: focus"], [["2026-10-27T08:00:00Z", { focus: 0, sleep: 3 }], ["2026-10-26T08:00:00Z", { focus: 0, sleep: 3 }]]));
	assert.equal(zero.queries()[0].querySelector(".booklet-ch-note").textContent, "Every value is 0, so no bar is drawn.");
	assert.equal(zero.queries()[0].querySelectorAll("rect").length, 0);
	const one = open(text(["from: log\nas: bars\nvalue: sleep"], [DAYS[0]]));
	assert.equal(one.queries()[0].querySelector(".booklet-ch-note").textContent, "One reading so far.");
	const cannot = open(text(["from: log\nas: bars\nvalue: where"]));
	const q = cannot.queries()[0];
	assert.equal(q.querySelector(".booklet-ch-cannot").textContent, "Cannot draw as bars: Where is not a number.");
	assert.equal(q.querySelector("svg"), null);
	assert.ok(q.querySelector("details.booklet-ch-nums table"), "the numbers are still there");
	for (const x of [zero, one, cannot]) x.close();
});

test("a line chart: an svg named by hidden text, a polyline for each unbroken run, a marker for each number, a legend for more than one line; no aria-label, no style", async () => {
	const t = text(["from: log\nas: line\nfields: sleep, focus"]);
	const v = open(t);
	const [q] = v.queries();
	const svg = q.querySelector("svg.booklet-ch-svg");
	assert.equal(svg.getAttribute("role"), "img");
	assert.equal(labelOf(q, svg), "Line chart of Hours slept, Hours of focused work, 5 points, from 1 to 8");
	assert.equal(q.querySelectorAll("[aria-label], [style]").length, 0);
	assert.equal(svg.querySelectorAll("polyline.booklet-ch-s0").length, 1, "sleep: one unbroken run");
	assert.equal(svg.querySelectorAll("polyline.booklet-ch-s1").length, 2, "focus: a gap splits it into two runs, one polyline each");
	assert.equal(svg.querySelectorAll(".booklet-ch-pt.booklet-ch-s0").length, 5);
	assert.equal(svg.querySelectorAll(".booklet-ch-pt.booklet-ch-s1").length, 4);
	assert.notEqual(svg.querySelector("circle.booklet-ch-s0")?.tagName, svg.querySelector(".booklet-ch-pt.booklet-ch-s1")?.tagName, "the two lines differ by marker shape as well as colour");
	assert.deepEqual([...q.querySelectorAll(".booklet-ch-legend li")].map((x) => x.textContent), ["Hours slept", "Hours of focused work"]);
	assert.ok(q.querySelector("details.booklet-ch-nums"));
	await v.settled();
	assert.equal(v.disk.text, t);
	v.close();
});

test("a line chart is read through a line of words under it: a point pressed, or the arrow keys along the points", () => {
	const v = open(text(["from: log\nas: line\nfields: sleep, focus"]));
	const [q] = v.queries();
	const readout = q.querySelector(".booklet-ch-readout");
	assert.equal(readout.getAttribute("aria-live"), "polite");
	assert.equal(readout.textContent, "Tap or hover a point to read it.");
	const hits = [...q.querySelectorAll(".booklet-ch-hit")];
	assert.equal(hits.length, 5, "a band for each point");
	click(hits[1]);
	assert.equal(readout.textContent, "Oct 23: Hours slept 7.5 · Hours of focused work 3");
	assert.ok(q.querySelector(".booklet-ch-guide:not(.is-off)"));
	assert.equal(q.querySelectorAll(".booklet-ch-pt.is-active").length, 2);
	const svg = q.querySelector("svg.booklet-ch-svg");
	assert.equal(svg.getAttribute("tabindex"), "0");
	press(svg, "ArrowRight");
	assert.equal(readout.textContent, "Oct 24: Hours slept 6 · Hours of focused work –");
	press(svg, "ArrowLeft");
	press(svg, "ArrowLeft");
	press(svg, "ArrowLeft");
	assert.match(readout.textContent, /^Oct 22: /, "it stops at the first point");
	press(svg, "End");
	assert.match(readout.textContent, /^Oct 27: /);
	const evt = press(svg, "ArrowRight");
	assert.match(readout.textContent, /^Oct 27: /, "and at the last");
	assert.equal(evt, false, "the key is taken: the page does not scroll");
	v.close();
});

test("a line of one row, and one that cannot be drawn: in words, the numbers still under it", () => {
	const one = open(text(["from: log\nas: line\nfields: sleep"], [DAYS[0]]));
	assert.equal(one.queries()[0].querySelector(".booklet-ch-note").textContent, "One reading so far.");
	assert.equal(one.queries()[0].querySelectorAll(".booklet-ch-pt").length, 1);
	const none = open(text(["from: log\nas: line\nfields: where"]));
	assert.equal(none.queries()[0].querySelector(".booklet-ch-cannot").textContent, "Cannot draw as a line: Where is not a number.");
	assert.equal(none.queries()[0].querySelector("svg"), null);
	assert.ok(none.queries()[0].querySelector(".booklet-ch-nums table"));
	one.close();
	none.close();
});

test("createSvg refuses a class string with a space, as real Obsidian does (the fake in test/dom.mjs is faithful to it)", () => {
	const d = w.document.createElement("div");
	assert.throws(() => d.createSvg("svg", { cls: "a b" }), /InvalidCharacterError|contains HTML space/i);
	assert.doesNotThrow(() => d.createSvg("svg", { cls: ["a", "b"] }));
});
