/*
 * A note with thousands of kept days (a tracker kept for eight years): what drawing and writing it cost, and the two things that
 * made a table of them slow, found by measuring it in the real app (check 41 of e2e/plugin-check.js): a date formatter built again for
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

test("the moment and day labels are the words toLocaleString gives, for any time of year and zone", () => {
	for (const ts of ["2026-01-01T00:00:00Z", "2026-03-29T01:30:00Z", "2026-07-04T12:00:00Z", "2026-10-25T00:59:59Z", "2026-12-31T23:59:59Z", "2018-08-14T08:00:00Z"]) {
		const t = Date.parse(ts);
		assert.equal(core.whenText(ts), new Date(t).toLocaleString(undefined, { weekday: "short", year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }));
		assert.equal(core.shortDay(ts), new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" }));
	}
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

test("the moment and day labels follow the time zone the machine is in now, not the one it was in when the first was drawn", () => {
	const zone = process.env.TZ;
	const realNow = Date.now;
	let clock = realNow();
	Date.now = () => clock;
	try {
		const ts = "2026-10-27T23:30:00Z", t = Date.parse(ts);
		const moment = { weekday: "short", year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" };
		const seen = [];
		for (const tz of ["UTC", "Asia/Tokyo", "America/Los_Angeles"]) {
			process.env.TZ = tz;
			clock += 5000;
			assert.equal(core.whenText(ts), new Date(t).toLocaleString(undefined, moment), tz);
			assert.equal(core.shortDay(ts), new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" }), tz);
			seen.push(core.whenText(ts));
		}
		assert.equal(new Set(seen).size, 3, "three zones, three different moments");
	} finally {
		Date.now = realNow;
		if (zone === undefined) delete process.env.TZ;
		else process.env.TZ = zone;
	}
});
