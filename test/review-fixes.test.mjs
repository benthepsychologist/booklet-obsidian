/*
 * What the cold review of the first 0.9.0 draft found, as tests: a data block whose id clashes with an activity's, a question's or
 * another block's is said among the note's problems (and which one a query reads is not changed); a null and a number too big to be
 * one in a data row; a query that throws says so in its own place and the screen still draws; a nested list thousands deep and a chart
 * of hundreds of thousands of numbers do not overflow the stack; the sort and filter control's state is each query's own, is rebuilt when
 * the fields change, and Escape in its search stays in it; a tiny non-zero bar is still seen; a line is drawn again when its box
 * changes width. Made-up data only.
 */
import { openView, testApp, typeInto, press, click, words, window as w } from "./dom.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { core } from "./helpers.mjs";

process.env.TZ = "UTC";
const { mountQuery } = await import("./.build/screens.mjs");

const fm = `---\nbooklet: "0.16"\ntitle: T\n---\n`;
const fence = (body) => "```booklet query\n" + body + "\n```";
const data = (rows, id) => "```booklet data\n" + (typeof rows === "string" ? rows : JSON.stringify(rows)) + "\n```\n^" + id + "\n";
const note = (queries, blocks, extra = "") => `${fm}\n${extra}> [!activity|show] Show\n\n${queries.map(fence).join("\n\n")}\n\n> [!data] Data\n\n${blocks}`;
const planOf = (t, i = 0) => {
	const b = core.parseBooklet(t);
	const seg = b.activities.find((a) => a.id === "show").segments.filter((s) => s.type === "query")[i];
	return core.planQuery(b, seg, { drawn: new Date("2026-10-28T12:00:00Z") });
};
const open = (t) => {
	const disk = { text: t, writes: 0 };
	const v = openView(t, { disk, app: testApp(disk), screen: "activity:/show" });
	return { ...v, queries: () => [...v.view.contentEl.querySelectorAll(".booklet-query")] };
};

/* ---- the data block's own reading ---- */

test("a null in a data row is no cell at all, and a number too big to be one (1e999) is words, not a number", () => {
	const t = note(["from: d\nas: table\nfields: w, n"], data('[{"w":"a","n":null},{"w":"b","n":1e999},{"w":"c","n":"","m":null},{"w":"d","n":3}]', "d"));
	const rows = planOf(t).groups[0].rows;
	assert.equal(rows[0].cells.n, undefined, "null: nothing there, not the word null");
	assert.equal(rows[1].cells.n.num, undefined, "Infinity is not a number");
	assert.equal(rows[2].cells.n, undefined, "an empty string is nothing there either");
	assert.equal(rows[3].cells.n.num, 3);
});

test("a data block that has the id of an activity, of a question or of another block is said among the problems; which one a query reads is not changed", () => {
	const act = note(["from: log\nas: table"], data([{ w: "a" }], "log"), "> [!activity|log repeat] Log\n\n> [!number|hours] Hours\n\n");
	const b1 = core.parseBooklet(act);
	assert.ok(b1.problems.some((p) => /the data block "log" has the same id as an activity/.test(p)), b1.problems.join("\n"));
	assert.equal(b1.activities.find((a) => a.id === "show").segments.find((s) => s.type === "query").source.kind, "activity", "the activity still wins");
	const q = note(["from: hours\nas: table"], data([{ w: "a" }], "hours"), "> [!activity|log repeat] Log\n\n> [!number|hours] Hours\n\n");
	const b2 = core.parseBooklet(q);
	assert.ok(b2.problems.some((p) => /the data block "hours" has the same id as a question/.test(p)), b2.problems.join("\n"));
	assert.equal(b2.activities.find((a) => a.id === "show").segments.find((s) => s.type === "query").source.kind, "question");
	const two = note(["from: d\nas: table"], data([{ w: "first" }], "d") + "\n" + data([{ w: "second" }], "d"));
	const b3 = core.parseBooklet(two);
	assert.ok(b3.problems.some((p) => /a second data block has the id "d", so a query that names it reads the first one/.test(p)), b3.problems.join("\n"));
	assert.equal(planOf(two).groups[0].rows[0].cells.w.text, "first");
	const fine = core.parseBooklet(note(["from: d\nas: table"], data([{ w: "a" }], "d")));
	assert.deepEqual(fine.problems, []);
});

/* ---- the control ---- */

const rows = Array.from({ length: 10 }, (_, i) => ({ n: "crop" + String.fromCharCode(97 + i), v: i, g: i % 2 ? "x" : "y" }));
const listNote = (fields) => note([`from: d\nas: list\nlabel: n\nfields: ${fields}`], data(rows, "d"));
const hostOf = { md: (m, el) => (el.textContent = m), openNote: () => {} };
const mount = () => {
	const box = w.document.createElement("div");
	w.document.body.appendChild(box);
	return { box, st: core.newViewState() };
};

test("the control is built again when the fields the menu offers change; a query with no rows is offered none", () => {
	const { box, st } = mount();
	const draw = mountQuery(hostOf, box, st);
	draw(() => planOf(listNote("v")));
	assert.deepEqual([...box.querySelectorAll("select option")].map((o) => o.textContent), ["Original order", "Sort by n", "Sort by v"]);
	draw(() => planOf(listNote("v, g")));
	assert.deepEqual([...box.querySelectorAll("select option")].map((o) => o.textContent), ["Original order", "Sort by n", "Sort by v", "Sort by g"]);
	assert.equal(core.wantsControls({ kind: "rows", empty: "No rows.", groups: [{ name: null, rows: Array.from({ length: 12 }, () => ({})) }] }), false);
	assert.equal(core.wantsControls({ kind: "rows", empty: null, groups: [{ name: null, rows: Array.from({ length: 9 }, () => ({})) }] }), true);
	box.remove();
});

test("Escape in the search clears it and goes no further (Obsidian's own Escape is not also pressed)", () => {
	const { box, st } = mount();
	const draw = mountQuery(hostOf, box, st);
	draw(() => planOf(listNote("v")));
	let reached = 0;
	w.document.body.addEventListener("keydown", () => reached++);
	const input = box.querySelector(".booklet-qc-search input");
	typeInto(input, "crop");
	assert.equal(press(input, "Escape"), false);
	assert.equal(input.value, "");
	assert.equal(reached, 0, "the key stopped at the field");
	box.remove();
});

test("a query that throws says so in its own place; the next drawing of it is fine", () => {
	const { box, st } = mount();
	const draw = mountQuery(hostOf, box, st);
	draw(() => planOf(listNote("v")));
	assert.ok(box.querySelector(".booklet-qc"));
	draw(() => {
		throw new Error("boom");
	});
	assert.equal(words(box), "This query could not be drawn: boom");
	assert.equal(box.getAttribute("data-booklet-view"), null);
	draw(() => planOf(listNote("v")));
	assert.equal(box.querySelectorAll(".booklet-q-row").length, 10);
	assert.ok(box.querySelector(".booklet-qc"), "the control comes back");
	box.remove();
});

test("each query has the sort and filter state of its own, kept when the screen is left and come back to", async () => {
	const v = open(note(["from: d\nas: list\nlabel: n", "from: d\nas: tiles\nlabel: n"], data(rows, "d")));
	const [a, b] = v.queries();
	typeInto(a.querySelector(".booklet-qc-search input"), "cropc");
	assert.equal(a.querySelectorAll(".booklet-q-row").length, 1);
	v.view.go({ screen: "home", tab: null, part: 0 });
	await v.settled();
	v.view.go({ screen: "activity:/show", tab: null, part: 0 });
	await v.settled();
	const [a2, b2] = v.queries();
	assert.equal(a2.querySelector(".booklet-qc-search input").value, "cropc", "the first query kept its search");
	assert.equal(a2.querySelectorAll(".booklet-q-row").length, 1);
	assert.equal(b2.querySelector(".booklet-qc-search input").value, "", "the second has none");
	assert.equal(b2.querySelectorAll(".booklet-q-tile").length, 10);
	v.close();
});

/* ---- charts ---- */

test("a tiny bar beside a huge one is still drawn at least as wide as a sliver (0.6 of 100)", () => {
	const v = open(note(["from: d\nas: bars\nlabel: w\nvalue: n"], data([{ w: "big", n: 100000 }, { w: "tiny", n: 1 }], "d")));
	const widths = [...v.queries()[0].querySelectorAll("rect.booklet-ch-bar")].map((r) => Number(r.getAttribute("width")));
	assert.ok(widths[0] > 90 && widths[1] >= 0.6, widths.join());
	v.close();
});

test("a line is drawn again, to the new width, when its box changes width, and not before it changes by 4 px", () => {
	const RO = w.ResizeObserver;
	const seen = [];
	w.ResizeObserver = globalThis.ResizeObserver = class {
		constructor(cb) {
			seen.push(cb);
		}
		observe() {}
		disconnect() {}
	};
	try {
		const v = open(note(["from: d\nas: line\nlabel: w\nfields: n"], data([{ w: "a", n: 1 }, { w: "b", n: 3 }, { w: "c", n: 2 }], "d")));
		const box = v.queries()[0];
		const plot = box.querySelector(".booklet-ch-plot");
		const first = plot.querySelector("svg");
		assert.equal(first.getAttribute("viewBox").split(" ")[2], "640", "no width yet: the default");
		Object.defineProperty(plot, "clientWidth", { value: 500, configurable: true });
		seen.forEach((cb) => cb());
		const second = plot.querySelector("svg");
		assert.notEqual(second, first, "drawn again");
		assert.equal(second.getAttribute("viewBox").split(" ")[2], "500");
		Object.defineProperty(plot, "clientWidth", { value: 502, configurable: true });
		seen.forEach((cb) => cb());
		assert.equal(plot.querySelector("svg"), second, "2 px is not a change");
		v.close();
	} finally {
		w.ResizeObserver = globalThis.ResizeObserver = RO;
	}
});

test("a chart of hundreds of thousands of numbers has its scale worked out (no argument list that long)", () => {
	const big = Array.from({ length: 400000 }, (_, i) => (i % 97) - 10);
	assert.equal(core.minOf(big), -10);
	assert.equal(core.maxOf(big), 86);
	assert.deepEqual([core.minOf([]), core.maxOf([])], [Infinity, -Infinity]);
	const s = core.lineDomain(big);
	assert.ok(s.min <= -10 && s.max >= 86);
	assert.ok(core.niceScale(core.minOf(big), core.maxOf(big)).ticks.length >= 3);
});

test("a scale over numbers too small or too big to divide never holds NaN or Infinity", () => {
	for (const [lo, hi] of [[1e-12, 3e-12], [0, 1.7e308], [-1.7e308, 1.7e308], [5, 5], [NaN, 3]]) {
		const s = core.niceScale(lo, hi);
		for (const x of [s.min, s.max, s.step, ...s.ticks]) assert.ok(Number.isFinite(x), `${lo}..${hi}: ${JSON.stringify(s)}`);
		assert.ok(s.max > s.min || lo === hi, `${lo}..${hi}`);
	}
});

/* ---- a nested list thousands deep ---- */

test("a nested list 3000 levels deep draws every row, with no more than 200 levels inside one another", () => {
	const chain = Array.from({ length: 3000 }, (_, i) => ({ id: "n" + i, job: "job" + i, ...(i ? { parent: "n" + (i - 1) } : {}) }));
	const v = open(note(["from: d\nas: list\nlabel: job"], data(chain, "d")));
	const q = v.queries()[0];
	assert.equal(q.querySelectorAll(".booklet-q-label").length, 3000);
	let deepest = 0;
	for (const d of q.querySelectorAll("details")) {
		let n = 0;
		for (let e = d.parentElement; e && e !== q; e = e.parentElement) if (e.tagName === "DETAILS") n++;
		if (n > deepest) deepest = n;
	}
	assert.ok(deepest <= 200, "deepest " + deepest);
	v.close();
});
