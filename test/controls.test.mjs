/*
 * The reader's own sort and filter (SPEC section 6, "Sorting and filtering are the reader's"), over a jsdom document: a closed
 * "Sort and filter" button from nine rows (not at eight), a search, a "Sort by" menu with a direction button, a count line
 * and Clear; a table's headings sort too; a line chart has the search alone. What the reader sets is kept for as long as the
 * pane is open and is never saved and never written (the pane's saved state and the note stay as they were). Made-up rows only.
 */
import { openView, testApp, click, typeInto, press, words, window as w } from "./dom.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { core, keepDays } from "./helpers.mjs";

process.env.TZ = "UTC";

const fm = `---\nbooklet: "0.16"\ntitle: Garden\n---\n`;
const fence = (body) => "```booklet query\n" + body + "\n```";
const CROPS = ["Beet", "Kale", "Leek", "Pea", "Chard", "Dill", "Fennel", "Basil", "Mint", "Sage"];
const rowsOf = (n) => CROPS.slice(0, n).map((crop, i) => ({ crop, rows: (i * 7) % 5 + 1, bed: i % 2 ? "east" : "west", ...(i === 3 ? {} : { when: `2026-04-${String(10 + i)}` }) }));
const note = (queries, n = 10, tree = null) =>
	`${fm}\n> [!activity|show] Show\n\n${queries.map(fence).join("\n\n")}\n\n> [!data] Data\n\n\`\`\`booklet data\n${JSON.stringify(tree ?? { fields: { crop: "Crop", rows: "Rows", bed: "Bed", when: "Sown" }, rows: rowsOf(n) })}\n\`\`\`\n^plot\n`;

function open(text) {
	const disk = { text, writes: 0 };
	const v = openView(text, { path: "Note.booklet.md", disk, app: testApp(disk), screen: "activity:/show" });
	const q = () => v.view.contentEl.querySelector(".booklet-query");
	const labels = () => [...q().querySelectorAll(".booklet-q-label, .booklet-q-table tbody tr td:first-child, .booklet-q-card-title")].map((x) => words(x));
	return { ...v, q, labels };
}

test("the control is offered from nine rows and not at eight; closed at first, with the count and the way to open it", () => {
	const eight = open(note(["from: plot\nas: list\nlabel: crop"], 8));
	assert.equal(eight.q().querySelector(".booklet-qc"), null);
	eight.close();
	const nine = open(note(["from: plot\nas: list\nlabel: crop"], 9));
	const toggle = nine.q().querySelector(".booklet-qc-toggle");
	assert.equal(words(toggle), "Sort and filter");
	assert.equal(toggle.getAttribute("aria-expanded"), "false");
	assert.equal(nine.q().querySelector(".booklet-qc-bar").hidden, true);
	assert.equal(nine.q().getAttribute("data-booklet-view"), "list");
	assert.equal(nine.q().querySelectorAll(".booklet-q-row").length, 9);
	click(toggle);
	assert.equal(toggle.getAttribute("aria-expanded"), "true");
	assert.equal(nine.q().querySelector(".booklet-qc-bar").hidden, false);
	assert.equal(words(nine.q().querySelector(".booklet-qc-count")), "9 rows");
	nine.close();
});

test("a view with no rows has no control, and the query's own words show", () => {
	const v = open(note(["from: plot\nas: list\nlabel: crop\nempty: Nothing sown."], 0, { rows: [] }));
	assert.equal(v.q().querySelector(".booklet-qc"), null);
	assert.equal(words(v.q().querySelector(".booklet-q-empty")), "Nothing sown.");
	v.close();
});

test("search keeps the rows that contain the words in a field the view shows, says how many, and says when none match; Clear and Escape put them back", () => {
	const v = open(note(["from: plot\nas: list\nlabel: crop\nfields: bed"]));
	const input = v.q().querySelector(".booklet-qc-search input");
	input.focus?.();
	typeInto(input, "le");
	assert.deepEqual(v.labels(), ["Kale", "Leek"]);
	assert.equal(words(v.q().querySelector(".booklet-qc-count")), "2 of 10 shown");
	assert.equal(v.q().querySelector(".booklet-qc-search input"), input, "the field is the one the reader is typing in: it is not drawn again");
	typeInto(input, "EAST");
	assert.equal(v.q().querySelectorAll(".booklet-q-row").length, 5, "a field shown by fields: is searched, whatever the case");
	typeInto(input, "zzz");
	assert.equal(words(v.q().querySelector(".booklet-qc-count")), "Nothing matches.");
	assert.equal(v.q().querySelectorAll(".booklet-q-row").length, 0);
	press(input, "Escape");
	assert.equal(input.value, "");
	assert.equal(v.q().querySelectorAll(".booklet-q-row").length, 10);
	typeInto(input, "kale");
	click(v.q().querySelector(".booklet-qc-clear"));
	assert.equal(input.value, "");
	assert.equal(v.q().querySelectorAll(".booklet-q-row").length, 10);
	assert.equal(v.q().querySelector(".booklet-qc-clear").hidden, true);
	v.close();
});

test("a field the view does not show is not searched", () => {
	const v = open(note(["from: plot\nas: list\nlabel: crop\nfields: rows"]));
	typeInto(v.q().querySelector(".booklet-qc-search input"), "east");
	assert.equal(words(v.q().querySelector(".booklet-qc-count")), "Nothing matches.");
	v.close();
});

test("the menu sorts by a field: numbers as numbers, words in order, rows with no value last whichever way; the direction button reverses; Original order restores", () => {
	const v = open(note(["from: plot\nas: list\nlabel: crop\nfields: rows, when"]));
	const sel = v.q().querySelector(".booklet-qc-sort select");
	assert.deepEqual([...sel.options].map((o) => o.textContent), ["Original order", "Sort by Crop", "Sort by Rows", "Sort by Sown"]);
	const pick = (value) => {
		sel.value = value;
		sel.dispatchEvent(new w.Event("change", { bubbles: true }));
	};
	const dir = v.q().querySelector(".booklet-qc-dir");
	assert.equal(dir.disabled, true, "nothing to reverse yet");
	pick("crop");
	assert.deepEqual(v.labels().slice(0, 3), ["Basil", "Beet", "Chard"]);
	click(dir);
	assert.deepEqual(v.labels().slice(0, 3), ["Sage", "Pea", "Mint"]);
	assert.equal(dir.getAttribute("aria-label"), "Descending");
	pick("when");
	click(dir);
	assert.equal(v.labels().at(-1), "Pea", "the row with no date is last, ascending or descending");
	click(dir);
	assert.equal(v.labels().at(-1), "Pea");
	pick("");
	assert.deepEqual(v.labels(), CROPS);
	v.close();
});

test("sorting and searching together: the matches, in the reader's order; Clear undoes both", () => {
	const v = open(note(["from: plot\nas: list\nlabel: crop\nfields: rows"]));
	const sel = v.q().querySelector(".booklet-qc-sort select");
	sel.value = "crop";
	sel.dispatchEvent(new w.Event("change", { bubbles: true }));
	typeInto(v.q().querySelector(".booklet-qc-search input"), "e");
	assert.deepEqual(v.labels(), ["Beet", "Fennel", "Kale", "Leek", "Pea", "Sage"]);
	click(v.q().querySelector(".booklet-qc-clear"));
	assert.deepEqual(v.labels(), CROPS);
	assert.equal(sel.value, "");
	v.close();
});

test("a table: the headings that can be sorted are buttons, ascending then descending then the original order, with aria-sort", () => {
	const v = open(note(["from: plot\nas: table\nfields: crop, rows, bed"]));
	const head = () => [...v.q().querySelectorAll("th")];
	assert.equal(head().length, 3);
	assert.equal(head()[0].querySelector("button.booklet-q-sort").textContent.trim(), "Crop");
	click(head()[0].querySelector("button"));
	assert.equal(head()[0].getAttribute("aria-sort"), "ascending");
	assert.deepEqual(v.labels().slice(0, 2), ["Basil", "Beet"]);
	assert.equal(v.q().querySelector(".booklet-qc-sort select").value, "crop", "the menu follows the heading");
	click(head()[0].querySelector("button"));
	assert.equal(head()[0].getAttribute("aria-sort"), "descending");
	assert.deepEqual(v.labels().slice(0, 2), ["Sage", "Pea"]);
	click(head()[0].querySelector("button"));
	assert.equal(head()[0].getAttribute("aria-sort"), null);
	assert.deepEqual(v.labels(), CROPS);
	click(head()[1].querySelector("button"));
	const rowsCol = () => [...v.q().querySelectorAll("tbody tr")].map((tr) => Number(tr.children[1].textContent));
	assert.deepEqual(rowsCol(), [...rowsCol()].sort((a, b) => a - b), "sorted by the number in the column, as numbers");
	assert.equal(head()[1].getAttribute("aria-sort"), "ascending");
	v.close();
});

test("a table under nine rows has plain headings", () => {
	const v = open(note(["from: plot\nas: table\nlabel: crop"], 5));
	assert.equal(v.q().querySelector("th button"), null);
	assert.equal(v.q().querySelector(".booklet-qc"), null);
	v.close();
});

test("bars and tiles and cards are sorted and searched too; a bar chart is drawn from the rows left", () => {
	const v = open(note(["from: plot\nas: bars\nlabel: crop\nvalue: rows"]));
	assert.equal(v.q().querySelectorAll(".booklet-ch-row").length, 10);
	typeInto(v.q().querySelector(".booklet-qc-search input"), "ee");
	assert.deepEqual([...v.q().querySelectorAll(".booklet-ch-l")].map(words), ["Beet", "Leek"]);
	assert.match(v.q().querySelector(".booklet-ch-bars").getAttribute("aria-labelledby"), /./);
	const sel = v.q().querySelector(".booklet-qc-sort select");
	sel.value = "rows";
	sel.dispatchEvent(new w.Event("change", { bubbles: true }));
	click(v.q().querySelector(".booklet-qc-dir"));
	assert.deepEqual([...v.q().querySelectorAll(".booklet-ch-l")].map(words).length, 2);
	v.close();
	const t = open(note(["from: plot\nas: tiles\nlabel: crop\nvalue: rows"]));
	typeInto(t.q().querySelector(".booklet-qc-search input"), "mint");
	assert.equal(t.q().querySelectorAll(".booklet-q-tile").length, 1);
	t.close();
	const c = open(note(["from: plot\nas: cards\nlabel: crop"]));
	typeInto(c.q().querySelector(".booklet-qc-search input"), "dill");
	assert.equal(c.q().querySelectorAll(".booklet-q-card").length, 1);
	c.close();
});

test("a line chart keeps its order and has the search alone: no menu, no direction; the chart is drawn from the rows left", () => {
	const v = open(note(["from: plot\nas: line\nlabel: crop\nfields: rows"]));
	assert.ok(v.q().querySelector(".booklet-qc-search input"));
	assert.equal(v.q().querySelector(".booklet-qc-sort"), null);
	assert.equal(v.q().querySelector("select"), null);
	assert.equal(v.q().querySelectorAll(".booklet-ch-hit").length, 10);
	typeInto(v.q().querySelector(".booklet-qc-search input"), "e");
	assert.equal(v.q().querySelectorAll(".booklet-ch-hit").length, 6, "the points of the matching rows, still in the original order");
	v.close();
});

test("group: the rows of each group are sorted and searched inside it, and a group with no match goes", () => {
	const v = open(note(["from: plot\nas: list\nlabel: crop\ngroup: bed"]));
	typeInto(v.q().querySelector(".booklet-qc-search input"), "pea");
	assert.deepEqual([...v.q().querySelectorAll(".booklet-q-group")].map((x) => words(x)), ["east1 row"]);
	v.close();
});

const TREE = {
	rows: [
		{ id: "p", job: "Spring beds" },
		{ id: "a", job: "Dig bed 1", parent: "p" },
		{ id: "b", job: "Dig bed 2", parent: "p" },
		{ id: "c", job: "Mend fence" },
		{ id: "d", job: "Sow peas", parent: "c" },
		{ id: "e", job: "Sow beans", parent: "c" },
		{ id: "f", job: "Prune", parent: "zzz" },
		{ id: "g", job: "Water" },
		{ id: "h", job: "Mulch", parent: "g" },
	],
};

test("a nested list: a match is shown under its parents, which stand open while the search is on; what the reader opened is still kept after", () => {
	const v = open(note(["from: plot\nas: list\nlabel: job\nparent: parent"], 0, TREE));
	assert.ok(v.q().querySelector(".booklet-qc"), "nine rows, counting the children");
	const open1 = v.q().querySelector('details[data-id="c"]');
	open1.open = true;
	open1.dispatchEvent(new w.Event("toggle"));
	typeInto(v.q().querySelector(".booklet-qc-search input"), "dig bed 2");
	const shown = [...v.q().querySelectorAll(".booklet-q-label")].map(words);
	assert.deepEqual(shown, ["Spring beds", "Dig bed 2"]);
	assert.equal(v.q().querySelector('details[data-id="p"]').open, true, "its parent stands open so the match is seen");
	assert.equal(words(v.q().querySelector(".booklet-qc-count")), "1 of 9 shown");
	click(v.q().querySelector(".booklet-qc-clear"));
	assert.equal(v.q().querySelector('details[data-id="p"]').open, false, "opened by the search, not by the reader: shut again");
	assert.equal(v.q().querySelector('details[data-id="c"]').open, true, "opened by the reader: kept");
	v.close();
});

test("what the reader sets is not saved and not written: the pane's state and the note are as they were, and it is kept while the rows are drawn again", async () => {
	const v = open(note(["from: plot\nas: list\nlabel: crop\nfields: rows"]));
	const before = JSON.stringify(v.view.getState());
	click(v.q().querySelector(".booklet-qc-toggle"));
	typeInto(v.q().querySelector(".booklet-qc-search input"), "e");
	const sel = v.q().querySelector(".booklet-qc-sort select");
	sel.value = "crop";
	sel.dispatchEvent(new w.Event("change", { bubbles: true }));
	assert.equal(JSON.stringify(v.view.getState()), before);
	await v.settled();
	assert.equal(v.disk.writes, 0);
	// the note changes (an eleventh row): the rows are worked out again, the reader's choices stay
	const bigger = note(["from: plot\nas: list\nlabel: crop\nfields: rows"], 10).replace(/"rows":\[/, '"rows":[{"crop":"Anise","rows":1,"bed":"west"},');
	v.changed(() => bigger);
	await v.settled();
	assert.equal(v.q().querySelector(".booklet-qc-search input").value, "e");
	assert.equal(v.q().querySelector(".booklet-qc-toggle").getAttribute("aria-expanded"), "true");
	assert.equal(v.q().querySelector(".booklet-qc-sort select").value, "crop");
	assert.equal(words(v.q().querySelector(".booklet-qc-count")), "7 of 11 shown");
	assert.equal(v.q().querySelectorAll(".booklet-q-row")[0].textContent.includes("Anise"), true);
	assert.equal(v.disk.writes, 0);
	v.close();
});

test("another query of the note has a view of its own", () => {
	const v = open(note(["from: plot\nas: list\nlabel: crop", "from: plot\nas: tiles\nlabel: crop"]));
	const [a, b] = [...v.view.contentEl.querySelectorAll(".booklet-query")];
	typeInto(a.querySelector(".booklet-qc-search input"), "kale");
	assert.equal(a.querySelectorAll(".booklet-q-row").length, 1);
	assert.equal(b.querySelectorAll(".booklet-q-tile").length, 10);
	v.close();
});

test("a query over kept entries is sorted by its date, and the entries are not written", async () => {
	const days = Array.from({ length: 9 }, (_, i) => [`2026-10-${String(10 + i)}T08:00:00Z`, { h: i % 4 }]);
	const text = keepDays(`${fm}\n> [!activity|log repeat] Log\n\n> [!number|h] Hours\n\n> [!activity|show] Show\n\n${fence("from: log\nas: table")}\n`, "", "log", days);
	const disk = { text, writes: 0 };
	const v = openView(text, { disk, app: testApp(disk), screen: "activity:/show" });
	const q = () => v.view.contentEl.querySelector(".booklet-query");
	assert.ok(q().querySelector(".booklet-qc"));
	const sel = q().querySelector(".booklet-qc-sort select");
	assert.deepEqual([...sel.options].map((o) => o.textContent), ["Original order", "Sort by Date", "Sort by Hours"]);
	sel.value = "date";
	sel.dispatchEvent(new w.Event("change", { bubbles: true }));
	click(q().querySelector(".booklet-qc-dir"));
	assert.match(words(q().querySelector("tbody tr td")), /Oct 18|18/);
	await v.settled();
	assert.equal(disk.writes, 0);
	assert.equal(disk.text, text);
	v.close();
});
