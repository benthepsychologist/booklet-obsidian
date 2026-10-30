/*
 * Deleting a kept entry from the Kept entries list under Finalize (SPEC section 8; core/write.ts removeEntry), over a jsdom
 * document: a Delete button on each card, which asks "Delete this entry?" in place, with Yes and No, and writes nothing
 * until Yes. The entry that goes is the one on the card, taken out as one item and nothing else touched. Queries do not
 * offer it. Made-up entries only.
 */
import { openView, testApp, click, words } from "./dom.mjs";
import { Notice } from "./obsidian-stub.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { core, keepDays } from "./helpers.mjs";

process.env.TZ = "UTC";

const fm = `---\nbooklet: "0.16"\ntitle: Garden\n---\n`;
const BASE = `${fm}
> [!activity|log repeat] Log

> [!number|hours] Hours slept

> [!text|note] A note

> [!activity|show] Show

\`\`\`booklet query
from: log
as: cards
\`\`\`
`;
const DAYS = [
	["2026-10-25T08:00:00Z", { hours: 6, note: "woke twice" }],
	["2026-10-26T08:10:00Z", { hours: 7.5 }],
	["2026-10-27T06:55:00Z", { hours: 5, note: "late coffee" }],
];
const text = () => keepDays(BASE, "", "log", DAYS);
const tsList = (t) => (core.parseBooklet(t).records.entries[""]?.log ?? []).map((e) => e.ts);

function open(t, screen = "activity:/log") {
	const disk = { text: t, writes: 0 };
	const v = openView(t, { disk, app: testApp(disk), screen });
	const cards = () => [...v.view.contentEl.querySelectorAll(".booklet-entry-list .booklet-entry")];
	return { ...v, cards };
}

test("each kept card has a Delete button; the card names nothing to confirm until it is pressed", () => {
	const v = open(text());
	assert.equal(v.cards().length, 3);
	for (const c of v.cards()) {
		const del = c.querySelector("button.booklet-entry-delete");
		assert.equal(words(del), "Delete");
		assert.equal(del.hidden, false);
		assert.equal(c.querySelector(".booklet-entry-ask").hidden, true);
	}
	v.close();
});

test("Delete asks 'Delete this entry?' in place, with 'Yes, delete' and 'No'; No puts it back and nothing is written", async () => {
	const t = text();
	const v = open(t);
	const card = v.cards()[0];
	click(card.querySelector(".booklet-entry-delete"));
	const ask = card.querySelector(".booklet-entry-ask");
	assert.equal(ask.hidden, false);
	assert.equal(card.querySelector(".booklet-entry-delete").hidden, true);
	assert.equal(words(ask.querySelector(".booklet-entry-ask-text")), "Delete this entry?");
	assert.deepEqual([...ask.querySelectorAll("button")].map(words), ["Yes, delete", "No"]);
	assert.equal(ask.getAttribute("aria-labelledby"), ask.querySelector(".booklet-entry-ask-text").id);
	assert.equal(v.disk.writes, 0, "nothing is written by asking");
	click(ask.querySelectorAll("button")[1]);
	assert.equal(ask.hidden, true);
	assert.equal(card.querySelector(".booklet-entry-delete").hidden, false);
	await v.settled();
	assert.equal(v.disk.writes, 0);
	assert.equal(v.disk.text, t);
	assert.equal(v.cards().length, 3);
	v.close();
});

test("Yes takes out exactly the entry on that card (the newest is first), and every other byte of the note is as it was", async () => {
	const t = text();
	const v = open(t);
	const cards = v.cards();
	assert.match(words(cards[1].querySelector(".booklet-entry-when")), /Oct 26/, "newest first: the second card is the 26th");
	click(cards[1].querySelector(".booklet-entry-delete"));
	click(cards[1].querySelector(".booklet-entry-ask button"));
	await v.settled();
	assert.equal(v.disk.writes, 1);
	assert.deepEqual(tsList(v.disk.text), ["2026-10-25T08:00:00Z", "2026-10-27T06:55:00Z"]);
	assert.equal(v.disk.text, core.removeEntry(t, "", "log", 1, "2026-10-26T08:10:00Z").text, "the same bytes the writer gives: only that entry's item is gone");
	assert.equal(v.cards().length, 2, "the list is drawn again without it");
	assert.equal(v.view.contentEl.querySelectorAll(".booklet-query .booklet-entry-delete").length, 0);
	v.close();
});

test("a query's cards, which show the same entries, offer no Delete", () => {
	const v = open(text(), "activity:/show");
	assert.equal(v.view.contentEl.querySelectorAll(".booklet-query .booklet-q-card").length, 3);
	assert.equal(v.view.contentEl.querySelectorAll("button.booklet-entry-delete").length, 0);
	v.close();
});

test("the last entry deleted leaves the list as it was written, empty: the block stays as {\"items\": []}", async () => {
	const t = keepDays(BASE, "", "log", [DAYS[0]]);
	const v = open(t);
	click(v.cards()[0].querySelector(".booklet-entry-delete"));
	click(v.cards()[0].querySelector(".booklet-entry-ask button"));
	await v.settled();
	assert.deepEqual(tsList(v.disk.text), []);
	assert.match(v.disk.text, /\{"items": \[\s*\]\}/);
	assert.match(words(v.view.contentEl.querySelector(".booklet-entry-list")), /No entries kept yet/);
	v.close();
});

test("an entry that is no longer where the pane thought it was is not deleted, and the reader is told", async () => {
	const t = text();
	const v = open(t);
	const before = Notice.said.length;
	// the file changes behind the pane's back (another box), its copy of the text is older
	v.disk.text = keepDays(BASE, "", "log", [["2026-10-20T08:00:00Z", { hours: 1 }], ...DAYS]);
	click(v.cards()[2].querySelector(".booklet-entry-delete"));
	click(v.cards()[2].querySelector(".booklet-entry-ask button"));
	await v.settled();
	assert.deepEqual(tsList(v.disk.text), ["2026-10-20T08:00:00Z", ...DAYS.map((d) => d[0])], "nothing was taken out");
	assert.match(Notice.said.slice(before).join("\n"), /no longer where it was/);
	v.close();
});

test("a draft the reader has begun is not cleared by a deletion: the note's draft is as it was, and the field still shows it", async () => {
	const t = core.setDraftAnswer(text(), "", "log", "note", "half written");
	const v = open(t);
	const field = () => [...v.view.contentEl.querySelectorAll("textarea, input")].find((x) => x.value === "half written");
	assert.ok(field(), "the draft is in its field");
	click(v.cards()[0].querySelector(".booklet-entry-delete"));
	click(v.cards()[0].querySelector(".booklet-entry-ask button"));
	await v.settled();
	assert.equal(tsList(v.disk.text).length, 2);
	assert.ok(field(), "and still is");
	assert.equal(v.disk.text, core.removeEntry(t, "", "log", 2, "2026-10-27T06:55:00Z").text);
	v.close();
});
