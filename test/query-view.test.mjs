/*
 * Queries drawn in the view, run in Node over a jsdom document (test/dom.mjs): the check-in's roll-up from made-up
 * entries, the four views and their roles, the lines that say what is not drawn yet, a query that cannot be drawn
 * reported while the note still opens, and the rule that drawing writes nothing.
 */
import { window as w } from "./dom.mjs";
import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, core } from "./helpers.mjs";

process.env.TZ = "UTC";

const { BookletView } = await import("./.build/view.mjs");
const CHECKIN = readFileSync(join(ROOT, "test-vault", "Check-in.booklet.md"), "utf8");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function open(text, path = "Note.booklet.md") {
	const disk = { text, writes: 0 };
	const opened = [];
	const app = {
		vault: {
			process: async (_file, fn) => {
				disk.writes++;
				disk.text = fn(disk.text);
				return disk.text;
			},
		},
		workspace: { iterateAllLeaves() {}, on: () => ({}), openLinkText: async (to) => opened.push(to) },
	};
	const view = new BookletView({ app }, { setMode: async () => {} });
	view.file = { path, basename: path.replace(/\.md$/, "") };
	view.load();
	view.setViewData(text, true);
	return {
		view,
		disk,
		opened,
		queries: () => [...view.contentEl.querySelectorAll(".booklet-query")],
		settled: async () => {
			await sleep(30);
			await view.writes;
		},
		close() {
			view.unload();
			view.containerEl.remove();
		},
	};
}

const DAYS = [
	["2026-10-22T09:00:00Z", { feelings: ["tense", "tired"], felt: [{ pick: "tense", a: [5] }, { pick: "tired", a: [1] }], thoughts: ["A walk at lunch"] }],
	["2026-10-23T09:00:00Z", { feelings: ["tense"], felt: [{ pick: "tense", a: [5, 8] }], thoughts: ["Too many emails", "Call a friend"] }],
	["2026-10-27T20:00:00Z", { feelings: ["tense", "content"], felt: [{ pick: "tense", a: [8] }] }],
	["2026-10-28T08:00:00Z", { feelings: ["tired"], thoughts: ["Early night"] }],
];
function withEntries(text = CHECKIN) {
	for (const [ts, ans] of DAYS) {
		for (const [k, v] of Object.entries(ans)) text = core.setDraftAnswer(text, "day-check", "today", k, v);
		text = core.finalizeDraft(text, "day-check", "today", { ts }).text;
	}
	return text;
}

test("the check-in's roll-up is drawn from made-up entries: a table of the feelings and where each is felt, then the week's thoughts as cards; nothing is written", async () => {
	mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-10-28T12:00:00Z") });
	try {
		const text = withEntries();
		const v = open(text, "Check-in.booklet.md");
		const [sum, thoughts] = v.queries();
		assert.equal(sum.getAttribute("data-booklet-view"), "table");
		const heads = [...sum.querySelectorAll("thead th")].map((x) => x.textContent);
		assert.deepEqual(heads, ["Question", "Count", "Most", "Note"]);
		const rows = [...sum.querySelectorAll("tbody tr")].map((tr) => [...tr.querySelectorAll("td")].map((td) => td.textContent));
		assert.deepEqual(rows, [
			["How do you feel?", "4", "Tense", "Tense 3 · Tired 2 · Content 1"],
			["Where do you feel it? · Tense", "3", "Chest", "Chest 2 · Stomach 2"],
			["Where do you feel it? · Tired", "1", "Head", "Head 1"],
			["Where do you feel it? · Content", "0", "", ""],
		]);
		assert.ok(sum.querySelector("td.booklet-q-num"), "a count is set to the right");
		assert.equal(thoughts.getAttribute("data-booklet-view"), "cards");
		const cards = [...thoughts.querySelectorAll(".booklet-entry")];
		assert.equal(cards.length, 3, "the entry with no thoughts is not shown");
		assert.deepEqual(
			[...cards[1].querySelectorAll("dd li")].map((x) => x.textContent),
			["Too many emails", "Call a friend"],
		);
		await v.settled();
		assert.equal(v.disk.writes, 0, "drawing a query writes nothing");
		assert.equal(v.disk.text, text, "the file is the same, byte for byte");
		v.close();
	} finally {
		mock.timers.reset();
	}
});

test("a kept entry finalized in the view shows in the roll-up at once, without drawing the page again", async () => {
	mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-10-28T12:00:00Z") });
	try {
		const v = open(CHECKIN, "Check-in.booklet.md");
		const [sum] = v.queries();
		assert.equal(sum.querySelector(".booklet-q-empty").textContent, "Nothing kept here yet.");
		const card = v.view.contentEl.querySelector('[data-booklet-activity="day-check/today"]');
		const grid = card.querySelectorAll(".booklet-kind-widget")[1];
		[...grid.querySelectorAll("button")].find((b) => b.textContent.trim() === "Tense").click();
		await v.settled();
		assert.ok(v.queries()[0].querySelector(".booklet-q-empty"), "a draft is never read");
		card.querySelector(".booklet-finalize").click();
		await v.settled();
		const first = v.queries()[0].querySelector("tbody tr");
		assert.deepEqual([...first.querySelectorAll("td")].map((x) => x.textContent).slice(0, 3), ["How do you feel?", "1", "Tense"]);
		v.close();
	} finally {
		mock.timers.reset();
	}
});

const fm = `---\nbooklet: "0.16"\ntitle: Views\n---\n`;
const VIEWS = (queries, items) => `${fm}
> [!activity|log repeat] Log

> [!choice|status] Status
- [ ] good
- [ ] warn
- [ ] bad

> [!text|where] Where to
> The link a row leads to.

> [!text|pic] Icon

> [!number|n] A number

> [!multi|tags] Tags
- [ ] Home
- [ ] Out

> [!activity|show] Show

${queries.map((q) => "```booklet query\n" + q + "\n```").join("\n\n")}

%%
> [!records] App record — do not edit below this line

\`\`\`booklet entries log
{"items": [
${items.map((e) => JSON.stringify(e)).join(",\n")}
]}
\`\`\`
%%
`;
const ITEMS = [
	{ ts: "2026-10-28T08:00:00Z", status: 1, where: "https://example.org/made-up", pic: "heart", n: 3, tags: [1, 2] },
	{ ts: "2026-10-27T08:00:00Z", status: 3, where: "Other note.md", pic: "not-an-icon", n: 1.5 },
	{ ts: "2026-10-26T08:00:00Z", status: 2, where: "#A heading", n: 7 },
];

test("a list: label, the other fields, value, the note beneath; tone said in words; a link leads where it says, a heading target stays text; an icon is drawn by name", () => {
	const v = open(VIEWS(["from: log\nas: list\nlabel: where\nvalue: n\ntone: status\nlink: where\nicon: pic\nbadge: tags\nfields: date"], ITEMS));
	const [q] = v.queries();
	const rows = [...q.querySelectorAll(".booklet-q-row")];
	assert.equal(rows.length, 3);
	const a = rows[0].querySelector(".booklet-q-label a.external-link");
	assert.equal(a.getAttribute("href"), "https://example.org/made-up");
	assert.equal(rows[0].querySelector(".booklet-q-value").textContent, "3");
	assert.ok(rows[0].querySelector(".booklet-q-value.booklet-tone-good") === null, "with a badge, the tone colours the badge");
	assert.deepEqual([...rows[0].querySelectorAll(".booklet-q-pill")].map((x) => x.textContent), ["Home", "Out"]);
	assert.ok(rows[0].querySelector(".booklet-q-pill.booklet-tone-good"));
	assert.match(rows[0].textContent, /\(Good\)/, "the tone is said in words");
	assert.ok(rows[0].querySelector('.booklet-q-icon svg[data-icon="heart"]'));
	assert.equal(rows[1].querySelector(".booklet-q-icon"), null, "a name that is not an icon draws nothing");
	const note = rows[1].querySelector("a.internal-link");
	note.click();
	assert.deepEqual(v.opened, ["Other note.md"]);
	assert.equal(rows[2].querySelector(".booklet-q-label a"), null, "a heading target is plain text here");
	assert.equal(rows[2].querySelector(".booklet-q-label").textContent, "#A heading");
	assert.match(rows[2].textContent, /\(Needs a look\)/);
	v.close();
});

test("tiles: a big value over a label; with no value anywhere, pills. Cards: dated, the questions as lines. A table: one column per field", () => {
	const v = open(VIEWS(["from: n\nas: tiles", "from: log\nas: tiles", "from: log\nfields: n, status\nlimit: 2", "from: log\nas: table\nfields: date, n"], ITEMS));
	const [big, pills, cards, table] = v.queries();
	assert.deepEqual(
		[...big.querySelectorAll(".booklet-q-big")].map((x) => x.textContent),
		["3", "1.5", "7"],
	);
	assert.ok(pills.querySelector(".booklet-q-pills"));
	assert.equal(pills.querySelector(".booklet-q-big"), null);
	const c = [...cards.querySelectorAll(".booklet-entry")];
	assert.equal(c.length, 2, "limit: 2, the newest two");
	assert.deepEqual(
		[...c[0].querySelectorAll("dt")].map((x) => x.textContent),
		["A number", "Status"],
	);
	assert.deepEqual(
		[...table.querySelectorAll("thead th")].map((x) => x.textContent),
		["Date", "A number"],
	);
	assert.ok(table.querySelector("thead th.booklet-q-num"), "a column of numbers is set to the right");
	v.close();
});

test("bars, line and a data block draw a line saying they are not yet supported, in place of the view", () => {
	const text = VIEWS(["from: log\nas: bars", "from: log\nas: line", "from: rows"], ITEMS).replace("%%\n> [!records]", "> [!data] Data\n\n```booklet data\n{ \"rows\": [ { \"label\": \"A\" } ] }\n```\n^rows\n\n%%\n> [!records]");
	const v = open(text);
	const said = v.queries().map((q) => q.textContent);
	assert.deepEqual(said, [
		"Not yet supported: a query drawn as bars (as: bars). It is in the Markdown.",
		"Not yet supported: a query drawn as a line chart (as: line). It is in the Markdown.",
		"Not yet supported: a query of a data block. It is in the Markdown.",
	]);
	v.close();
});

test("a query that cannot be drawn is listed with the note's problems, and the note still opens with everything else drawn", () => {
	const v = open(VIEWS(["from: nowhere", "from: log\nas: pie", "from: log\nas: list\nfields: n"], ITEMS));
	const problems = [...v.view.contentEl.querySelectorAll(".booklet-problems li")].map((x) => x.textContent);
	assert.ok(problems.some((p) => /names "nowhere", which is nothing in this module/.test(p)), problems.join("\n"));
	assert.ok(problems.some((p) => /`as: pie`/.test(p)), problems.join("\n"));
	assert.equal(v.queries().length, 1);
	assert.equal(v.queries()[0].querySelectorAll(".booklet-q-row").length, 3);
	v.close();
});

test("group: draws the rows under each value, in the order the values first appear, with a count", () => {
	const items = [...ITEMS, { ts: "2026-10-25T08:00:00Z", status: 1, n: 2 }];
	const v = open(VIEWS(["from: log\nas: list\ngroup: status\nfields: n"], items));
	const heads = [...v.queries()[0].querySelectorAll(".booklet-q-group")].map((x) => x.textContent);
	assert.deepEqual(heads, ["good2 rows", "bad1 row", "warn1 row"]);
	v.close();
});

test("a summary as tiles and as a list, by its roles: value and note default by kind, and value: and note: point them elsewhere", () => {
	const v = open(VIEWS(["from: log\nsummary: on\nas: tiles\nfields: date, n", "from: log\nsummary: on\nas: list\nfields: n\nvalue: total\nnote: highest"], ITEMS));
	const [tiles, list] = v.queries();
	assert.deepEqual(
		[...tiles.querySelectorAll(".booklet-q-tile")].map((t) => [t.querySelector(".booklet-q-big").textContent, t.querySelector(".booklet-q-label").textContent, t.querySelector(".booklet-q-note").textContent]),
		[
			["3", "Days logged", "3 entries"],
			["3.8", "A number", "lowest 1.5 · highest 7"],
		],
	);
	const row = list.querySelector(".booklet-q-row");
	assert.deepEqual([row.querySelector(".booklet-q-value").textContent, row.querySelector(".booklet-q-note").textContent], ["11.5", "7"]);
	assert.equal(row.querySelector(".booklet-q-extras"), null, "a summary row's other statistics are a table's columns, not a list's extras");
	v.close();
});
