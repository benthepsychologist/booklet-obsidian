/*
 * A data block's rows drawn in the view (SPEC sections 6 and 7), over a jsdom document: every view over a block (cards, a
 * table, a list, tiles; the two charts are test/charts.test.mjs's), with `group:`, badges (a list is several pills),
 * tones said in words, links that lead only where they can, icons by name, a nested list that the reader opens, and
 * `tiles` of a question asked for each pick. Drawing writes nothing. Made-up rows only.
 */
import { openView, testApp } from "./dom.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { keepDays } from "./helpers.mjs";

process.env.TZ = "UTC";

const fm = `---\nbooklet: "0.16"\ntitle: Garden\n---\n`;
const fence = (body) => "```booklet query\n" + body + "\n```";
const JOBS = {
	fields: { job: "Job", when: "When", state: "State", hrs: "Hours", tone: "Tone", go: "Where", pic: "Picture", what: "Detail" },
	rows: [
		{ job: "Spring beds", when: "March", state: ["open", "blocked"], hrs: 12, tone: "warn", go: "Dig plan.md", pic: "heart", what: "Needs compost" },
		{ job: "Dig bed 1", when: "March", state: "done", hrs: 3, tone: "good", go: "https://example.org/dig", pic: "sun", what: "" },
		{ job: "Dig bed 2", when: "April", state: "open", hrs: 4.5, tone: "bad", go: "javascript:alert(1)", pic: "not-an-icon" },
		{ job: "Mend fence", when: "April", state: "done", hrs: 2, tone: "good", go: "#A heading" },
		{ job: "Orphan row", when: "April", hrs: "n/a" },
	],
};
const note = (queries, blocks = { jobs: JOBS }) =>
	`${fm}\n> [!activity|show] Show\n\n${queries.map(fence).join("\n\n")}\n\n> [!data] Data\n\n${Object.entries(blocks)
		.map(([id, j]) => "```booklet data\n" + JSON.stringify(j) + "\n```\n^" + id)
		.join("\n\n")}\n`;

function open(text) {
	const disk = { text, writes: 0 };
	const opened = [];
	const v = openView(text, { path: "Note.booklet.md", disk, app: testApp(disk, { workspace: { openLinkText: async (to) => opened.push(to) } }), screen: "activity:/show" });
	return { ...v, opened, queries: () => [...v.view.contentEl.querySelectorAll(".booklet-query")] };
}
const words = (el) => [...el].map((x) => x.textContent);

test("a list over a data block: icon, pills (a list is several), label as the link, the extra field, value, tone in words, the note beneath; grouped under each value with a count", async () => {
	const text = note(["from: jobs\nas: list\nlabel: job\nvalue: hrs\nnote: what\nbadge: state\ntone: tone\nlink: go\nicon: pic\ngroup: when\nfields: when"]);
	const v = open(text);
	const [q] = v.queries();
	assert.equal(q.getAttribute("data-booklet-view"), "list");
	assert.deepEqual(words(q.querySelectorAll(".booklet-q-group")), ["March2 rows", "April3 rows"]);
	const rows = [...q.querySelectorAll(".booklet-q-row")];
	assert.equal(rows.length, 5);
	assert.deepEqual(words(rows[0].querySelectorAll(".booklet-q-pill")), ["open", "blocked"]);
	assert.ok(rows[0].querySelector(".booklet-q-pill.booklet-tone-warn"));
	assert.equal(rows[0].querySelector(".booklet-q-label").textContent, "Spring beds");
	assert.equal(rows[0].querySelector(".booklet-q-value").textContent, "12");
	assert.equal(rows[0].querySelector(".booklet-q-note").textContent, "Needs compost");
	assert.match(rows[0].querySelector(".booklet-q-extra").textContent, /When: March/, "the group field is shown on purpose because fields: names it");
	assert.match(rows[0].textContent, /\(Needs a look\)/);
	assert.ok(rows[0].querySelector('.booklet-q-icon svg[data-icon="heart"]'));
	rows[0].querySelector("a.internal-link").click();
	assert.deepEqual(v.opened, ["Dig plan.md"], "a link to a note opens that note");
	assert.equal(rows[1].querySelector("a.external-link").getAttribute("href"), "https://example.org/dig");
	assert.equal(rows[2].querySelector(".booklet-q-label a"), null, "a javascript: link is plain text");
	assert.equal(rows[2].querySelector(".booklet-q-icon"), null, "an icon that is not a name draws nothing");
	assert.equal(rows[3].querySelector(".booklet-q-label a"), null, "a heading target stays plain text here");
	assert.equal(rows[4].querySelector(".booklet-q-value").textContent, "n/a", "a value that is not a number is shown as it is");
	await v.settled();
	assert.equal(v.disk.writes, 0);
	assert.equal(v.disk.text, text);
	v.close();
});

test("a table over a data block: the declared labels are the headings, a column of numbers is set right, the badge column holds pills, the first column leads with icon and link, a group is a heading row", () => {
	const v = open(note(["from: jobs\nfields: job, state, hrs\nbadge: state\ntone: tone\nlink: go\nicon: pic\ngroup: when"]));
	const [q] = v.queries();
	assert.deepEqual(words(q.querySelectorAll("thead th")), ["Job", "State", "Hours"]);
	assert.deepEqual(words(q.querySelectorAll(".booklet-q-grouprow th")), ["March2 rows", "April3 rows"]);
	const first = q.querySelector("tbody tr:nth-child(2)");
	assert.deepEqual(words(first.querySelectorAll(".booklet-q-pill")), ["open", "blocked"]);
	assert.ok(first.querySelector("td a.internal-link"));
	assert.ok(first.querySelector("td .booklet-q-icon svg"));
	assert.equal(q.querySelectorAll("thead th.booklet-q-num").length, 0, "Hours has a word in it (n/a), so it is not a column of numbers");
	v.close();
});

test("cards over a data block: the label is the title, the note beneath, pills, the value, then a line for every field that plays no role", () => {
	const v = open(note(["from: jobs\nas: cards\nlabel: job\nvalue: hrs\nnote: what\nbadge: state\ntone: tone\nicon: pic"]));
	const [q] = v.queries();
	const cards = [...q.querySelectorAll(".booklet-q-card")];
	assert.equal(cards.length, 5);
	assert.equal(cards[0].querySelector(".booklet-q-card-title").textContent, "Spring beds");
	assert.ok(cards[0].classList.contains("booklet-tone-warn"));
	assert.deepEqual(words(cards[0].querySelectorAll("dt")), ["When", "Where"]);
	assert.deepEqual(words(cards[0].querySelectorAll("dd")), ["March", "Dig plan.md"], "the link field is a line here: it is no role without link:");
	assert.equal(cards[4].querySelector("dl dt").textContent, "When");
	v.close();
});

test("tiles over a data block: a big value over the label; with no value anywhere, pills", () => {
	const v = open(note(["from: jobs\nas: tiles\nlabel: job\nvalue: hrs\ntone: tone\nicon: pic\nlink: go", "from: jobs\nas: tiles\nlabel: job"]));
	const [big, pills] = v.queries();
	const t = [...big.querySelectorAll(".booklet-q-tile")];
	assert.equal(t.length, 5);
	assert.deepEqual([t[0].querySelector(".booklet-q-big").textContent, t[0].querySelector(".booklet-q-label").textContent], ["12", "Spring beds"]);
	assert.ok(t[0].classList.contains("booklet-tone-warn"));
	assert.ok(pills.querySelector(".booklet-q-pills"));
	v.close();
});

test("no rows in a data block: the query's own words, in place of the view", () => {
	const v = open(note(["from: none\nempty: No harvest yet."], { none: [] }));
	assert.equal(v.queries()[0].querySelector(".booklet-q-empty").textContent, "No harvest yet.");
	v.close();
});

const TREE = {
	rows: [
		{ id: "p", job: "Spring beds", state: "open" },
		{ id: "a", job: "Dig bed 1", parent: "p" },
		{ id: "b", job: "Dig bed 2", parent: "p" },
		{ id: "c", job: "Mend fence" },
		{ id: "o", job: "Orphan job", parent: "zzz" },
	],
};

test("a nested list: a parent is a details that is shut until the reader opens it; what is opened stays open when the rows are drawn again", async () => {
	const v = open(note(["from: tree\nas: list\nlabel: job\nbadge: state"], { tree: TREE }));
	const [q] = v.queries();
	const details = q.querySelector("details");
	assert.equal(details.getAttribute("data-id"), "p");
	assert.equal(details.open, false);
	assert.equal(q.querySelector(".booklet-q-tree").children.length, 3, "the top rows: Spring beds (a parent), Mend fence, Orphan job (its parent is no row)");
	assert.deepEqual(words(details.querySelectorAll(":scope > ul .booklet-q-label")), ["Dig bed 1", "Dig bed 2"]);
	assert.deepEqual(words(details.querySelector("summary").querySelectorAll(".booklet-q-pill")), ["open"]);
	details.open = true;
	details.dispatchEvent(new details.ownerDocument.defaultView.Event("toggle"));
	// leave the screen and come back: it is drawn again from the state the view keeps
	v.view.go({ screen: "home", tab: null, part: 0 });
	await v.settled();
	v.view.go({ screen: "activity:/show", tab: null, part: 0 });
	await v.settled();
	assert.equal(v.queries()[0].querySelector("details").open, true, "kept for as long as the pane is open");
	v.close();
});

/* ---- tiles of a question asked for each pick ---- */

const TOOLS = `${fm}
> [!activity|log repeat] Log

> [!multi|tools open] Which tools?
- [ ] Pencil
- [ ] Ruler
- [ ] Scissors

> [!number|uses each:tools] Times used

> [!activity|show] Show

${fence("from: uses\nas: tiles")}
`;

test("tiles of a question asked for each pick: a tile for each pick, its words the label and its answer the big value", async () => {
	const text = keepDays(TOOLS, "", "log", [
		["2026-10-26T09:00:00Z", { tools: [1, 2], uses: [{ pick: 1, a: 3 }, { pick: 2, a: 1 }] }],
		["2026-10-27T09:00:00Z", { tools: [1, 3], uses: [{ pick: 1, a: 5 }, { pick: 3, a: 2 }] }],
	]);
	const v = open(text);
	const [q] = v.queries();
	assert.deepEqual(
		[...q.querySelectorAll(".booklet-q-tile")].map((t) => [t.querySelector(".booklet-q-label").textContent, t.querySelector(".booklet-q-big").textContent]),
		[
			["Pencil", "5"],
			["Ruler", "1"],
			["Scissors", "2"],
		],
	);
	assert.equal(q.textContent.includes("Not yet supported"), false);
	await v.settled();
	assert.equal(v.disk.writes, 0);
	v.close();
});
