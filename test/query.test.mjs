/*
 * Queries over kept entries (SPEC section 6, "Queries: showing kept entries and data" and "A span of days, and
 * summaries"): what the reader takes from a query block and reports, the rows a query works out, a span of days on a
 * faked clock and in more than one time zone, and the summary rules (ties, the reader's own options, zeros, rounding,
 * locale, empty). Made-up entries only.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, core, norm } from "./helpers.mjs";

process.env.TZ = "UTC";

const fm = (extra = "") => `---\nbooklet: "0.16"\ntitle: Tracker\n${extra}---\n`;
const fence = (body) => "```booklet query\n" + body + "\n```";

const TRACKER = `> [!activity|evening repeat] Evening

> [!choice|feel open] How did today feel?
- [ ] Rough
- [ ] Mixed
- [ ] Good

> [!scale|energy] Energy

1. Low
2. Some
3. Middling
4. High

> [!number|minutes] Minutes outside

> [!multi|did open] What did you do?
- [ ] Walked
- [ ] Read
- [ ] Cooked

> [!text|else] Anything else?

> [!lines|notes] Notes
`;

/** A made-up tracker with these queries in a second activity, and these kept entries (and, if given, a draft). */
function tracker(queries, items = [], draft = null) {
	let text = `${fm()}\n${TRACKER}\n> [!activity|week] This week\n\n${queries.map(fence).join("\n\n")}\n`;
	if (items.length || draft) {
		text += "\n%%\n> [!records] App record — do not edit below this line\n";
		if (items.length) text += "\n```booklet entries evening\n" + `{"items": [\n${items.map((e) => JSON.stringify(e)).join(",\n")}\n]}` + "\n```\n";
		if (draft) text += "\n```booklet draft evening\n" + JSON.stringify(draft) + "\n```\n";
		text += "%%\n";
	}
	return text;
}

const DRAWN = new Date("2026-10-28T12:00:00Z");

/** The plan of the `i`th query of the "week" activity. */
function plan(text, i = 0, opts = {}) {
	const b = core.parseBooklet(text);
	const act = b.activities.find((a) => a.id === "week");
	const segs = act.segments.filter((s) => s.type === "query");
	return { b, p: core.planQuery(b, segs[i], { drawn: DRAWN, now: DRAWN, ...opts }), segs };
}
const rowsOf = (p) => p.groups.flatMap((g) => g.rows);
const texts = (p) => rowsOf(p).map((r) => Object.fromEntries(Object.entries(r.cells).map(([k, c]) => [k.replace("\u0001", "|"), c.text])));
/** Each row's label, value and note, as the roles read them. */
const lvn = (p) => rowsOf(p).map((r) => [r.cells[p.roles.label]?.text, p.roles.value ? r.cells[p.roles.value]?.text : undefined, p.roles.note ? r.cells[p.roles.note]?.text : undefined]);

/** Five made-up evenings in the week before 28 October 2026 (SPEC section 6's example: Rough 1 · Mixed 1 · Good 3; energy 2.6). */
const WEEK = [
	{ ts: "2026-10-28T08:00:00Z", feel: 3, energy: 4, else: "A good day." },
	{ ts: "2026-10-27T20:00:00Z", feel: 3, energy: 3, else: "Quiet." },
	{ ts: "2026-10-25T20:00:00Z", feel: 1, energy: 1, else: "Rain." },
	{ ts: "2026-10-24T20:00:00Z", feel: 2, energy: 2 },
	{ ts: "2026-10-22T20:00:00Z", feel: 3, energy: 3, else: "A walk." },
];

/* ---- reading a query block (gap 6, and what cannot be drawn) ---- */

test("a query block is read with its keys; a key a query does not have, `limit: week` and `summary: yes` are ignored and reported", () => {
	const { b, segs } = plan(tracker(["from: evening\nlimit: week\nsummary: yes\ncolour: blue\nas: list\nempty: None yet."]));
	assert.equal(b.ok, true);
	assert.equal(segs.length, 1);
	const q = segs[0].query;
	assert.deepEqual([q.from, q.as, q.limit, q.days, q.summary, q.empty], ["evening", "list", null, null, false, "None yet."]);
	assert.ok(b.problems.some((p) => /has no setting "colour", so it was ignored/.test(p)), b.problems.join("\n"));
	assert.ok(b.problems.some((p) => /`limit: week` is not a positive whole number or a number of days/.test(p)), b.problems.join("\n"));
	assert.ok(b.problems.some((p) => /`summary: yes` is not `on`, so it was ignored/.test(p)), b.problems.join("\n"));
});

test("limit: a count, or a number of days (`1 day`, `7 days`); 0 and -1 are not", () => {
	const qs = ["from: evening\nlimit: 3", "from: evening\nlimit: 7 days", "from: evening\nlimit: 1 day", "from: evening\nlimit: 0", "from: evening\nlimit: -1 days"];
	const { b, segs } = plan(tracker(qs));
	assert.deepEqual(
		segs.map((s) => [s.query.limit, s.query.days]),
		[
			[3, null],
			[null, 7],
			[null, 1],
			[null, null],
			[null, null],
		],
	);
	assert.equal(b.problems.filter((p) => /is not a positive whole number/.test(p)).length, 2, b.problems.join("\n"));
});

test("a query that cannot be drawn is reported with the note's problems and taken out, and the note still opens", () => {
	const text = `${fm()}
> [!module|m] One module

> [!activity|log repeat] Log

> [!text|said] Said

> [!activity|plain] Plain

> [!text|once] Once

> [!activity|show] Show

${fence("as: cards")}

${fence("from: nothing-here")}

${fence("from: elsewhere")}

${fence("from: log\nas: pie")}

${fence("from: plain")}

${fence("this is not a setting")}

${fence("from: log")}

> [!module|m end] End

> [!module|n] Another

> [!activity|elsewhere repeat] Elsewhere

> [!text|x] X

> [!module|n end] End
`;
	const b = core.parseBooklet(text);
	assert.equal(b.ok, true);
	const show = b.activities.find((a) => a.id === "show");
	const qs = show.segments.filter((s) => s.type === "query");
	assert.deepEqual(
		qs.map((s) => s.query.from),
		["log"],
		"only the query that can be drawn is left",
	);
	const said = b.problems.join("\n");
	assert.match(said, /a query in "show" has no from:/);
	assert.match(said, /names "nothing-here", which is nothing in this module/);
	assert.match(said, /names "elsewhere", which is in another module/);
	assert.match(said, /has `as: pie`, which is not cards, table, list, tiles, bars or line/);
	assert.match(said, /names "plain", which keeps no entries/);
	assert.match(said, /the query block has a line that is not `key: value`/);
});

test("gap 6: a span or a summary on a data block, or on a question whose activity keeps no entries, and group: on a summary, are ignored and reported", () => {
	const text = `${fm()}
> [!activity|plain] Plain

> [!text|once] Once

> [!activity|log repeat] Log

> [!choice|mood] Mood
- [ ] Low
- [ ] High

${fence("from: once\nlimit: 7 days\nsummary: on")}

${fence("from: once\nsummary: on")}

${fence("from: rows\nlimit: 1 day")}

${fence("from: log\nsummary: on\ngroup: mood")}

${fence("from: log\nlimit: 7 days\ngroup: mood")}

> [!data] Data

\`\`\`booklet data
{ "rows": [ { "label": "A" } ] }
\`\`\`
^rows
`;
	const b = core.parseBooklet(text);
	const qs = b.activities.find((a) => a.id === "log").segments.filter((s) => s.type === "query");
	assert.equal(qs.length, 5, "every one is still drawn, without what was ignored");
	assert.deepEqual(
		qs.map((s) => [s.query.days, s.query.summary, s.query.group]),
		[
			[null, false, null],
			[null, false, null],
			[null, false, null],
			[null, true, null],
			[7, false, "mood"],
		],
	);
	const said = b.problems.join("\n");
	assert.match(said, /`limit: 7 days` and `summary: on` read kept entries only, so they were ignored/);
	assert.match(said, /`summary: on` reads kept entries only, so it was ignored/);
	assert.match(said, /`limit: 1 day` reads kept entries only, so it was ignored/);
	assert.match(said, /`group: mood` is ignored: summary rows have nothing to group by/);
	// a query of a data block draws a line saying so, in place of the view
	const data = core.planQuery(b, qs[2], { drawn: DRAWN });
	assert.deepEqual([data.kind, /data block/.test(data.text)], ["not-yet", true]);
});

test("a query belongs in an activity's prose: one outside every activity, or in the data section, is reported", () => {
	const text = `${fm()}
${fence("from: log")}

> [!activity|log repeat] Log

> [!text|said] Said

> [!data] Data

${fence("from: log")}
`;
	const b = core.parseBooklet(text);
	assert.ok(b.problems.some((p) => /a query belongs in an activity's prose, so it was refused/.test(p)), b.problems.join("\n"));
	assert.ok(b.problems.some((p) => /a query belongs in an activity's prose, not in the data section/.test(p)), b.problems.join("\n"));
});

/* ---- kept entries as rows ---- */

test("kept entries: newest first, never a draft, each with its date and answers in words; cards are the default view", () => {
	const { p } = plan(tracker(["from: evening"], WEEK.slice(0, 3), { feel: 1, else: "A draft, not kept." }));
	assert.equal(p.view, "cards");
	const t = texts(p);
	assert.deepEqual(
		t.map((r) => [r.feel, r.else]),
		[
			["Good", "A good day."],
			["Good", "Quiet."],
			["Rough", "Rain."],
		],
	);
	assert.ok(!JSON.stringify(t).includes("A draft"), "a draft in progress is never read");
	assert.ok(t.every((r) => r.date), "each row has its date");
	assert.deepEqual(p.cols, ["feel", "energy", "minutes", "did", "else", "notes"], "a card shows every question, in the activity's order");
});

test("fields: names the questions and their order; an entry that answers none of them is not shown; limit: N keeps the newest N", () => {
	const items = [
		{ ts: "2026-10-28T08:00:00Z", feel: 3 },
		{ ts: "2026-10-27T08:00:00Z", else: "Only words." },
		{ ts: "2026-10-26T08:00:00Z", feel: 1, else: "Both." },
		{ ts: "2026-10-25T08:00:00Z", else: "Older." },
	];
	const { p } = plan(tracker(["from: evening\nas: table\nfields: else, feel", "from: evening\nas: table\nfields: else\nlimit: 2"], items));
	assert.deepEqual(p.cols, ["else", "feel"]);
	assert.deepEqual(
		texts(p).map((r) => r.else ?? null),
		[null, "Only words.", "Both.", "Older."],
	);
	const two = plan(tracker(["from: evening\nas: table\nfields: else, feel", "from: evening\nas: table\nfields: else\nlimit: 2"], items), 1).p;
	assert.deepEqual(
		texts(two).map((r) => r.else),
		["Only words.", "Both."],
		"the entry with no words is left out before the limit is taken",
	);
});

test("an answer of the wrong shape is left out of its row, and the note says once how many there are (gap 4)", () => {
	const items = [
		{ ts: "2026-10-28T08:00:00Z", feel: "not", energy: "high", else: 7 },
		{ ts: "2026-10-27T08:00:00Z", feel: 2, notes: "one line, not a list" },
	];
	const text = tracker(["from: evening\nas: table"], items);
	const { b, p } = plan(text);
	const t = texts(p);
	// "not" is the reader's own option for a choice (a string): in shape; "high" for a scale and 7 for a text are not
	assert.deepEqual([t[0].feel, t[0].energy, t[0].else], ["not", undefined, undefined]);
	assert.deepEqual([t[1].feel, t[1].notes], ["Mixed", undefined]);
	const shapes = b.problems.filter((x) => /not in the shape/.test(x));
	assert.equal(shapes.length, 1, b.problems.join("\n"));
	assert.match(shapes[0], /^3 answers are not in the shape their questions keep/);
	const one = core.parseBooklet(tracker([], [{ ts: "2026-10-28T08:00:00Z", energy: "high" }]));
	const said = one.problems.filter((x) => /not in the shape/.test(x));
	assert.equal(said.length, 1);
	assert.match(said[0], /^One answer is not in the shape its question keeps, so it is kept as written/);
});

test("roles over kept entries: the label falls back to the date; a single question is the value; group: gathers rows under a field's value", () => {
	const items = WEEK.slice(0, 4);
	const text = tracker(["from: evening\nas: list\nfields: feel", "from: energy\nas: tiles", "from: evening\nas: list\ngroup: feel\nfields: else"], items);
	const list = plan(text, 0).p;
	assert.equal(list.roles.label, "date");
	assert.deepEqual(list.cols, ["feel"]);
	const tiles = plan(text, 1).p;
	assert.equal(tiles.roles.value, "energy", "from: a single question makes that question the value");
	assert.deepEqual(
		lvn(tiles).map((x) => x[1]),
		["High", "Middling", "Low", "Some"],
	);
	const grouped = plan(text, 2).p;
	assert.deepEqual(
		grouped.groups.map((g) => [g.name, g.rows.length]),
		[
			["Good", 2],
			["Rough", 1],
		],
	);
});

test("tiles with no value are pills; bars and line say they are not yet supported, in place of the view", () => {
	const text = tracker(["from: evening\nas: tiles", "from: evening\nas: bars", "from: evening\nas: line"], WEEK.slice(0, 2));
	const tiles = plan(text, 0).p;
	assert.equal(tiles.roles.value, null);
	for (const i of [1, 2]) {
		const p = plan(text, i).p;
		assert.equal(p.kind, "not-yet");
		assert.match(p.text, /^Not yet supported: a query drawn as/);
	}
});

test("empty: shows while nothing is kept, or nothing is in the span; else the renderer's own line", () => {
	const text = tracker(["from: evening\nempty: Nothing logged yet.", "from: evening", "from: evening\nlimit: 1 day\nsummary: on\nempty: Nothing this week."], [{ ts: "2026-10-20T08:00:00Z", feel: 1 }]);
	assert.equal(plan(tracker(["from: evening\nempty: Nothing logged yet."]), 0).p.empty, "Nothing logged yet.");
	assert.equal(plan(tracker(["from: evening"])).p.empty, "Nothing kept here yet.");
	assert.equal(plan(text, 0).p.empty, null);
	assert.equal(plan(text, 2).p.empty, "Nothing this week.");
});

/* ---- a span of days ---- */

test("a span of days: today and the N-1 dates before it, by the reader's own calendar, worked out when the page is drawn", () => {
	process.env.TZ = "America/Toronto";
	try {
		// drawn at 23:30 on 27 October in Toronto (03:30 on the 28th in UTC)
		const drawn = new Date("2026-10-28T03:30:00Z");
		const ents = [
			{ ts: "2026-10-21T03:59:00Z", n: "21 Oct 23:59 Toronto: before the span" },
			{ ts: "2026-10-21T04:00:00Z", n: "21 Oct 00:00 Toronto: the span's first moment" },
			{ ts: "2026-10-28T03:00:00Z", n: "27 Oct 23:00 Toronto: today" },
			{ ts: "2026-10-28T05:00:00Z", n: "28 Oct 01:00 Toronto: later than now" },
			{ ts: "not a time", n: "a ts that will not parse" },
		];
		const kept = core.inSpan(ents, 7, drawn, drawn).map((e) => e.n);
		assert.deepEqual(kept, ["21 Oct 00:00 Toronto: the span's first moment", "27 Oct 23:00 Toronto: today"]);
		// the same moments in Tokyo: the 28th there, so the span starts on the 22nd
		process.env.TZ = "Asia/Tokyo";
		assert.deepEqual(
			core.inSpan(ents, 7, drawn, drawn).map((e) => e.n),
			["27 Oct 23:00 Toronto: today"],
		);
		// one day: today only
		process.env.TZ = "America/Toronto";
		assert.deepEqual(
			core.inSpan(ents, 1, drawn, drawn).map((e) => e.n),
			["27 Oct 23:00 Toronto: today"],
		);
	} finally {
		process.env.TZ = "UTC";
	}
});

test("a span drawn before midnight and worked out after it: today is still the day drawn; an entry kept since then is in it, one for the next day is not", () => {
	process.env.TZ = "Europe/Paris";
	try {
		const drawn = new Date("2026-10-27T22:55:00Z"); // 23:55 in Paris on the 27th
		const now = new Date("2026-10-27T23:10:00Z"); // 00:10 on the 28th
		const ents = [
			{ ts: "2026-10-27T22:59:59Z", n: "kept at 23:59:59 on the 27th (a Finalize after midnight)" },
			{ ts: "2026-10-27T23:05:00Z", n: "00:05 on the 28th, kept elsewhere" },
			{ ts: "2026-10-27T21:00:00Z", n: "22:00 on the 27th" },
		];
		assert.deepEqual(
			core.inSpan(ents, 1, drawn, now).map((e) => e.n),
			["kept at 23:59:59 on the 27th (a Finalize after midnight)", "22:00 on the 27th"],
		);
	} finally {
		process.env.TZ = "UTC";
	}
});

test("a span across a change of clocks still counts dates, not 24-hour blocks", () => {
	process.env.TZ = "Europe/London";
	try {
		// the clocks go back on 25 October 2026 in London; drawn on the 26th, a 2-day span is the 25th and the 26th
		const drawn = new Date("2026-10-26T12:00:00Z");
		const ents = [
			{ ts: "2026-10-24T23:30:00Z", n: "00:30 on the 25th (summer time)" },
			{ ts: "2026-10-24T22:59:00Z", n: "23:59 on the 24th" },
		];
		assert.deepEqual(
			core.inSpan(ents, 2, drawn, drawn).map((e) => e.n),
			["00:30 on the 25th (summer time)"],
		);
	} finally {
		process.env.TZ = "UTC";
	}
});

/* ---- summaries ---- */

test("summary: on — SPEC section 6's example: Days logged 5 (5 entries); Good (Rough 1 · Mixed 1 · Good 3); Energy 2.6 (lowest 1 · highest 4); Anything else? 4 (answered)", () => {
	const { p } = plan(tracker(["from: evening\nlimit: 7 days\nsummary: on\nas: tiles\nfields: date, feel, energy, else"], WEEK));
	assert.equal(p.view, "tiles");
	assert.deepEqual(lvn(p), [
		["Days logged", "5", "5 entries"],
		["How did today feel?", "Good", "Rough 1 · Mixed 1 · Good 3"],
		["Energy", "2.6", "lowest 1 · highest 4"],
		["Anything else?", "4", "answered"],
	]);
});

test("a summary with no as: is a table of every field, one column each; fields: picks the rows, in the activity's order", () => {
	const { p } = plan(tracker(["from: evening\nsummary: on\nfields: energy, date"], WEEK));
	assert.equal(p.view, "table");
	assert.deepEqual(p.cols, ["label", "count", "days", "average", "lowest", "highest", "total", "note"]);
	assert.deepEqual(texts(p), [
		{ label: "Days logged", count: "5", days: "5", value: "5", note: "5 entries" },
		{ label: "Energy", count: "5", average: "2.6", lowest: "1", highest: "4", total: "13", value: "2.6", note: "lowest 1 · highest 4" },
	]);
	assert.deepEqual(
		p.cols.map((k) => p.set.label(k)[0].text),
		["Question", "Count", "Days", "Average", "Lowest", "Highest", "Total", "Note"],
	);
});

test("counting: over entries (a day with two entries counts twice; days says how many days); with no answers, no value and no note", () => {
	const items = [
		{ ts: "2026-10-28T08:00:00Z", energy: 4 },
		{ ts: "2026-10-28T07:00:00Z", energy: 2 },
		{ ts: "2026-10-27T08:00:00Z", feel: 1 },
	];
	const { p } = plan(tracker(["from: evening\nsummary: on\nas: list\nfields: date, energy, minutes"], items));
	assert.deepEqual(lvn(p), [
		["Days logged", "2", "3 entries"],
		["Energy", "3", "lowest 2 · highest 4"],
		["Minutes outside", undefined, undefined],
	]);
	assert.equal(texts(p)[2].count, "0");
	assert.equal(plan(tracker(["from: evening\nsummary: on\nas: list\nfields: date"], items.slice(0, 1))).p.groups[0].rows[0].cells.note.text, "1 entry");
});

test("rounding: one decimal, half away from zero, a whole number without one; totals stay exact", () => {
	assert.deepEqual([2.25, 2.65, -2.25, 2.05, 3, 1.04999].map(core.round1), [2.3, 2.7, -2.3, 2.1, 3, 1]);
	const items = [2, 2, 2, 3].map((energy, i) => ({ ts: `2026-10-2${i}T08:00:00Z`, energy }));
	assert.equal(lvn(plan(tracker(["from: evening\nsummary: on\nas: tiles\nfields: energy"], items)).p)[0][1], "2.3");
	const whole = [3, 3].map((energy, i) => ({ ts: `2026-10-2${i}T08:00:00Z`, energy }));
	assert.equal(lvn(plan(tracker(["from: evening\nsummary: on\nas: tiles\nfields: energy"], whole)).p)[0][1], "3");
	const mins = [0.1, 0.2, -2.5].map((minutes, i) => ({ ts: `2026-10-2${i}T08:00:00Z`, minutes }));
	const m = texts(plan(tracker(["from: evening\nsummary: on\nfields: minutes"], mins)).p)[0];
	assert.deepEqual([m.average, m.total, m.lowest, m.highest], ["-0.7", "-2.2", "-2.5", "0.2"]);
});

test("numbers in the renderer's locale: 2,6 in French", () => {
	const { p } = plan(tracker(["from: evening\nsummary: on\nas: tiles\nfields: energy, minutes"], [...WEEK, { ts: "2026-10-21T08:00:00Z", minutes: 1234.5 }]), 0, { locale: "fr" });
	const t = texts(p);
	assert.equal(t[0].average, "2,6");
	assert.match(t[1].total, /^1\s234,5$/);
});

test("options: list order, the reader's own after, as first seen and matched ignoring case and spaces; a tie for most goes to the earlier", () => {
	const items = [
		{ ts: "2026-10-28T08:00:00Z", feel: "Sunny ", did: [2, "baking"] },
		{ ts: "2026-10-27T08:00:00Z", feel: "sunny", did: ["Baking", 1] },
		{ ts: "2026-10-26T08:00:00Z", feel: 3, did: [] },
		{ ts: "2026-10-25T08:00:00Z", feel: " good", did: [2, 2] },
		{ ts: "2026-10-24T08:00:00Z", feel: "Grey", did: ["read"] },
	];
	const { p } = plan(tracker(["from: evening\nsummary: on\nas: list\nfields: feel, did"], items));
	assert.deepEqual(lvn(p), [
		// Good 2 (3, and " good", the listed option's words) ties Sunny 2: the listed one comes first, so it is most
		["How did today feel?", "Good", "Good 2 · Sunny 2 · Grey 1"],
		// Read 3 ("read" is the option's words; [2, 2] counts once), Baking 2 (own, first seen as "baking"), Walked 1; the empty list is not answered
		["What did you do?", "Read", "Walked 1 · Read 3 · baking 2"],
	]);
	assert.deepEqual([texts(p)[0].count, texts(p)[1].count], ["5", "4"]);
});

test("one question, one distribution: listed options, anchors or items in list order, with zeros; any other kind as its values first appear", () => {
	const text = tracker(["from: feel\nsummary: on\nas: table", "from: energy\nsummary: on", "from: minutes\nsummary: on", "from: notes\nsummary: on"], [
		{ ts: "2026-10-28T08:00:00Z", feel: 3, energy: 2, minutes: 20, notes: ["Tea", "Walk"] },
		{ ts: "2026-10-27T08:00:00Z", feel: "Calm", energy: 2, minutes: 5, notes: ["tea"] },
		{ ts: "2026-10-26T08:00:00Z", feel: 3, minutes: 20 },
	]);
	const pairs = (i) => texts(plan(text, i).p).map((r) => [r.label, r.value]);
	assert.deepEqual(pairs(0), [
		["Rough", "0"],
		["Mixed", "0"],
		["Good", "2"],
		["Calm", "1"],
	]);
	assert.deepEqual(pairs(1), [
		["Low", "0"],
		["Some", "2"],
		["Middling", "0"],
		["High", "0"],
	]);
	assert.deepEqual(pairs(2), [
		["20", "2"],
		["5", "1"],
	]);
	assert.deepEqual(pairs(3), [
		["Tea", "2"],
		["Walk", "1"],
	]);
	assert.equal(plan(text, 0).p.set.label("label")[0].text, "Answer");
});

test("a summary never reads a draft, and nothing is saved: the file is the same, byte for byte, after a query is worked out", () => {
	const text = tracker(["from: evening\nlimit: 7 days\nsummary: on"], WEEK, { feel: 1, energy: 1 });
	const copy = String(text);
	const { p } = plan(text);
	assert.equal(texts(p).find((r) => r.label === "Energy").count, "5");
	assert.equal(text, copy);
});

/* ---- the check-in: a grid-select and a question asked for each pick ---- */

const CHECKIN = readFileSync(join(ROOT, "test-vault", "Check-in.booklet.md"), "utf8");
const DAYS = [
	["2026-10-22T09:00:00Z", { feelings: ["tense", "tired"], felt: [{ pick: "tense", a: [5] }, { pick: "tired", a: [1, "Eyes"] }], thoughts: ["A walk at lunch"] }],
	["2026-10-23T09:00:00Z", { feelings: ["tense"], felt: [{ pick: "tense", a: [5, 8] }], thoughts: ["Too many emails", "Call a friend"] }],
	["2026-10-25T09:00:00Z", { feelings: ["settled", "x|soothing|Unhurried"], felt: [{ pick: "settled", a: [5] }] }],
	["2026-10-27T20:00:00Z", { feelings: ["tense", "content", "x|agitating|unhurried"], felt: [{ pick: "tense", a: [8] }] }],
	["2026-10-28T08:00:00Z", { feelings: ["tired"], thoughts: ["Early night"] }],
];
function checkin() {
	let text = CHECKIN;
	for (const [ts, ans] of DAYS) {
		for (const [k, v] of Object.entries(ans)) text = core.setDraftAnswer(text, "day-check", "today", k, v);
		text = core.finalizeDraft(text, "day-check", "today", { ts }).text;
	}
	return text;
}
function checkinPlan(text, i) {
	const b = core.parseBooklet(text);
	const s = b.activities.find((a) => a.id === "week").segments.filter((x) => x.type === "query")[i];
	return core.planQuery(b, s, { drawn: DRAWN, now: DRAWN });
}

test("the check-in's roll-up: a grid-select summarised like a multi, and where each feeling is felt, one row per pick", () => {
	const text = checkin();
	const p = checkinPlan(text, 0);
	assert.equal(p.view, "table");
	assert.deepEqual(p.cols, ["label", "count", "most", "note"]);
	assert.deepEqual(
		texts(p).map((r) => [r.label, r.count, r.most, r.note]),
		[
			// the widget's items in its order, then the reader's own words, counted by their words
			["How do you feel?", "5", "Tense", "Tense 3 · Tired 2 · Settled 1 · Content 1 · unhurried 2"],
			["Where do you feel it? · Tense", "3", "Chest", "Chest 2 · Stomach 2"],
			["Where do you feel it? · Tired", "1", "Head", "Head 1 · Eyes 1"],
			["Where do you feel it? · Settled", "1", "Chest", "Chest 1"],
			["Where do you feel it? · Content", "0", undefined, undefined],
			// a grid's own words are picks as stored: one in each cell is a pick of its own, newest first
			["Where do you feel it? · unhurried", "0", undefined, undefined],
			["Where do you feel it? · Unhurried", "0", undefined, undefined],
		],
	);
	assert.equal(text, checkin(), "drawing changes nothing");
});

test("the check-in's thoughts: the week's kept entries as cards, each with its thoughts; an entry without any is not shown", () => {
	const p = checkinPlan(checkin(), 1);
	assert.equal(p.view, "cards");
	assert.deepEqual(p.cols, ["thoughts"]);
	assert.deepEqual(
		rowsOf(p).map((r) => r.cells.thoughts.list),
		[["Early night"], ["Too many emails", "Call a friend"], ["A walk at lunch"]],
	);
});

test("a question asked for each pick: one field per pick, labelled \"<title> · <pick's words>\", in the source's order", () => {
	const text = checkin().replace("fields: thoughts\n", "fields: felt\nas: table\n");
	const p = checkinPlan(text, 1);
	const labels = p.cols.map((k) => p.set.label(k).map((x) => x.md ?? x.text).join(""));
	assert.deepEqual(labels, ["Where do you feel it? · Tense", "Where do you feel it? · Tired", "Where do you feel it? · Settled", "Where do you feel it? · Content", "Where do you feel it? · unhurried", "Where do you feel it? · Unhurried"]);
	assert.deepEqual(norm(texts(p).map((r) => r["felt|s:tense"] ?? null)), ["Stomach", null, "Chest, Stomach", "Chest"]);
});
