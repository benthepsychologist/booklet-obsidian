/*
 * A note with thousands of kept days (a tracker kept for eight years): what drawing and writing it cost, and the two things that
 * make a table of them slow (check 41 of e2e/plugin-check.js measures it in the real app): a date formatter built again for
 * every row, and Obsidian's Markdown renderer asked to render the same few option words for every row.
 */
import "./dom.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { core, norm } from "./helpers.mjs";

const { words } = await import("./.build/screens.mjs");
const { window: w } = await import("./dom.mjs");

const DAYS = 3000;
const day = (i) => new Date(Date.UTC(2026, 9, 30) - (DAYS - 1 - i) * 86400000).toISOString().slice(0, 10);
function bigNote() {
	const items = [];
	for (let i = 0; i < DAYS; i++) items.push(JSON.stringify({ ts: `${day(i)}T08:00:00Z`, sleep: 5 + ((i * 7) % 9), mood: 1 + ((i * 5) % 4), note: `Day ${i + 1}` }));
	return `---
booklet: "0.17"
id: test/big
title: Big
lang: en
---

> [!activity|log repeat daily] Daily log

> [!number|sleep] Hours slept

> [!scale|mood] Mood

1. Low
2. Okay
3. Good
4. Bright

> [!text|note] A line

%%
> [!records] App record — do not edit below this line

\`\`\`booklet entries log
{"items": [
${items.join(",\n")}
]}
\`\`\`
%%
`;
}

/** The moment and day labels in this time zone, from a copy of the core made fresh (its formatters are made at first use). */
async function labelsIn(tz, stamps) {
	const was = process.env.TZ;
	process.env.TZ = tz;
	try {
		const fresh = await import(`./.build/core.mjs?tz=${encodeURIComponent(tz)}`);
		return stamps.map((ts) => ({ when: fresh.whenText(ts), day: fresh.shortDay(ts) }));
	} finally {
		if (was === undefined) delete process.env.TZ;
		else process.env.TZ = was;
	}
}

const STAMPS = ["2026-01-01T00:00:00Z", "2026-03-29T01:30:00Z", "2026-07-04T12:00:00Z", "2026-10-25T00:59:59Z", "2026-12-31T23:59:59Z", "2018-08-14T08:00:00Z"];

for (const tz of ["UTC", "America/Toronto", "Asia/Kolkata", "Pacific/Auckland"])
	test(`the moment and day labels are the words toLocaleString gives, in the zone ${tz}`, async () => {
		const got = await labelsIn(tz, STAMPS);
		const was = process.env.TZ;
		process.env.TZ = tz;
		try {
			STAMPS.forEach((ts, i) => {
				const t = Date.parse(ts);
				assert.equal(got[i].when, new Date(t).toLocaleString(undefined, { weekday: "short", year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }));
				assert.equal(got[i].day, new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" }));
			});
		} finally {
			if (was === undefined) delete process.env.TZ;
			else process.env.TZ = was;
		}
	});

test("the zones give different words for the same moment, so the test above compares something", async () => {
	const [utc, auckland] = await Promise.all([labelsIn("UTC", ["2026-01-01T00:00:00Z"]), labelsIn("Pacific/Auckland", ["2026-01-01T00:00:00Z"])]);
	assert.notEqual(utc[0].when, auckland[0].when);
});

test("a table of many rows makes its date formatters once, not once per row", async () => {
	const Real = Intl.DateTimeFormat;
	let made = 0;
	Intl.DateTimeFormat = class extends Real {
		constructor(...a) {
			super(...a);
			made++;
		}
	};
	try {
		const fresh = await import("./.build/core.mjs?formatters-counted");
		for (let i = 0; i < DAYS; i++) {
			fresh.whenText(`${day(i)}T08:00:00Z`);
			fresh.shortDay(`${day(i)}T08:00:00Z`);
		}
	} finally {
		Intl.DateTimeFormat = Real;
	}
	assert.ok(made > 0, "the stand-in saw the formatters being made");
	assert.ok(made <= 2, `${made} formatters made for ${DAYS} rows`);
});

test("a moment that is not a time is shown as it was written", () => {
	assert.equal(core.whenText("not a time"), "not a time");
	assert.equal(core.shortDay("not a time"), "not a time");
});

test("words: plain option words are set as text without the renderer; anything Markdown reads goes to it", () => {
	const asked = [];
	const host = { md: (m, el) => (asked.push(m), (el.textContent = `rendered ${m}`)) };
	const into = w.document.createElement("td");
	words(host, into, [{ md: "Good" }, { md: "Not at all" }, { md: "Año 2" }, { md: "日本語" }]);
	assert.deepEqual(asked, [], "plain words never reach the renderer");
	assert.equal(into.textContent, "GoodNot at allAño 2日本語");
	assert.equal(into.querySelectorAll("span.booklet-inline.markdown-rendered").length, 4);
	const other = w.document.createElement("td");
	for (const md of ["**bold**", "[[link]]", "1. one", "- item", "two  spaces", " lead", "trail ", "a_b", "x:y", "100%", "<b>", "a\nb", "", "&amp;"]) words(host, other, [{ md }]);
	assert.equal(asked.length, 14, "every other string goes to the renderer: " + JSON.stringify(asked));
});

test(`a note of ${DAYS} kept days: read, answered and kept, the design and every earlier day exactly as they were`, () => {
	const orig = bigNote();
	const book = core.parseBooklet(orig);
	assert.equal(book.records.entries[""].log.length, DAYS);
	assert.equal(book.problems.length, 0);
	let text = core.setDraftAnswer(orig, "", "log", "note", "Typed on the last day", { today: "2026-11-01" });
	text = core.setDraftAnswer(text, "", "log", "mood", 3, { today: "2026-11-01" });
	const done = core.finalizeDraft(text, "", "log", { ts: "2026-11-01T08:00:00Z", rule: { today: "2026-11-01" } }).text;
	const before = orig.split("\n").filter((l) => l.startsWith('{"ts"'));
	const after = done.split("\n").filter((l) => l.startsWith('{"ts"'));
	assert.equal(after.length, DAYS + 1);
	assert.deepEqual(after.slice(0, DAYS - 1), before.slice(0, DAYS - 1));
	// the entry that was last gains a comma, nothing else of it changes
	assert.equal(after[DAYS - 1], before[DAYS - 1] + ",");
	assert.ok(done.startsWith(orig.slice(0, orig.indexOf("%%\n> [!records]"))));
	assert.deepEqual(norm(core.parseBooklet(done).records.entries[""].log.at(-1)), { ts: "2026-11-01T08:00:00Z", mood: 3, note: "Typed on the last day" });
});
