/*
 * Stage 5 of the Design view, the first half: the canvas draws a `widget` question and the six kinds of view (`table`, `list`, `cards`,
 * `tiles`, `bars`, `line`) as a reader sees them, with nothing answered and nothing kept, and none of it can change the note.
 * Run in node over jsdom with the stand-in for Obsidian: how they look is measured in the real app, which this is not. Every drawing
 * here is made by the reader's own code (engines.ts, query-view.ts, charts.ts); what these tests hold is what the canvas hands it.
 */
import { window as w, click, words, typeInto } from "./dom.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { bookletAround, core } from "./helpers.mjs";
import { openDesign, observerCount, doc } from "./design-harness.mjs";

const { drawInertQuestion, drawInertQuery, drawnByLine } = await import("./.build/view.mjs");
const { PIECES } = core;

const GRID = PIECES.find((p) => p.file === "Q - widget (grid).md").text.replace(/new-/g, "w-");
const ROWS = Array.from({ length: 12 }, (_, i) => ({ job: `Job ${i + 1}`, hrs: i + 1, go: i === 0 ? "Dig plan.md" : "", pic: "heart" }));
const DATA = { fields: { job: "Job", hrs: "Hours", go: "Where" }, rows: ROWS };

/** The regions widget: a figure the reader does not draw yet, two places and their words. */
const REGIONS = [
	"> [!widget|map] Where do you feel it?",
	"> ![[#^map-data]]",
	"",
	"```booklet widget",
	JSON.stringify({
		engine: "svg-regions",
		figures: [{ id: "front", label: "Front", svg: '<svg viewBox="0 0 10 10"><circle class="rg" data-r="head" cx="5" cy="5" r="3"/></svg>', regions: ["head", "chest"] }],
		regions: [{ id: "head", label: "Head" }, { id: "chest", label: "Chest" }],
		chips: ["head", "chest"],
		senses: [{ id: "felt", label: "What it is like", words: [{ id: "felt:0", label: "tight" }] }],
		copy: { h: "Body", p: "Tap where you notice something." },
	}),
	"```",
	"^map-data",
].join("\n");

const view = (as, extra = "") => ["```booklet query", "from: jobs", `as: ${as}`, ...(extra ? [extra] : []), "```"].join("\n");

/** One activity that holds a widget, a regions widget, a widget with no block, every view and the data they read. */
const NOTE = bookletAround(
	[
		"> [!activity|a repeat] The activity",
		"",
		"> [!text|t] Words",
		"",
		GRID,
		"",
		REGIONS,
		"",
		"> [!widget|lost] A widget with no block",
		"> ![[#^nothing-here]]",
		"",
		view("table", "add\ndelete"),
		"",
		view("list", "label: job\nvalue: hrs\nlink: go\nadd\ndelete"),
		"",
		view("cards", "add\ndelete"),
		"",
		view("tiles"),
		"",
		view("bars", "value: hrs"),
		"",
		view("line", "value: hrs"),
		"",
		"```booklet query",
		"from: a",
		"as: list",
		"```",
		"",
		"```booklet query",
		"from: gone",
		"as: list",
		"```",
		"",
		"```booklet query",
		"from: filed",
		"as: table",
		"```",
		"",
		"> [!data] Data",
		"",
		"```booklet data",
		JSON.stringify(DATA),
		"```",
		"^jobs",
		"",
		"```booklet data rows.json",
		"```",
		"^filed",
		"",
		"%%",
		"> [!records]",
		"",
		"```booklet entries a",
		'{"items": [{ "ts": "2026-11-01T09:00:00Z", "t": "kept words" }]}',
		"```",
		"%%",
		"",
	].join("\n"),
);

const questionBlock = (v, id) => v.all(`.booklet-design-block[data-kind="question"]`).find((b) => b.querySelector(`[data-booklet-q="${id}"]`));
const queryBlocks = (v) => v.all('.booklet-design-block[data-kind="query"]');
const open = () => {
	const v = openDesign(NOTE);
	v.go("The activity");
	return v;
};

/* ---------------------------------------------------------------- widgets */

test("a grid-select widget is drawn as the reader draws it: head and help, the four axes, a cell for each, its items as buttons that are off, and no card", () => {
	const v = open();
	const box = questionBlock(v, "w-id");
	assert.ok(box, "drawn as a question");
	const wrap = box.querySelector(":scope > .booklet-design-drawn > .booklet-sample.booklet-sample-question");
	assert.ok(wrap && wrap.hasAttribute("inert"), "inside the inert wrapper");
	assert.equal(box.querySelector(".booklet-design-friendly, pre"), null, "no card, no Markdown");
	assert.equal(words(box.querySelector(".booklet-prompt")), "Your question here");
	assert.equal(words(box.querySelector(".booklet-help")), "Select what fits.");
	assert.deepEqual([...box.querySelectorAll(".booklet-axis")].map((a) => [a.className.replace(/.*booklet-axis-(\w+).*/, "$1"), words(a)]), [["top", "more of one thing"], ["left", "less of another"], ["right", "more of it"], ["bottom", "less of it"]]);
	assert.deepEqual([...box.querySelectorAll(".booklet-cell-name")].map(words), ["First cell", "Second cell", "Third cell", "Fourth cell"]);
	assert.deepEqual([...box.querySelectorAll("button.booklet-item")].map(words), ["First item", "Second item", "Third item", "Fourth item"]);
	const controls = [...wrap.querySelectorAll("button, input")];
	assert.ok(controls.length >= 12, "items, the field for words of one's own and its Add, in every cell");
	assert.ok(controls.every((c) => c.disabled), "every control is off");
	assert.ok([...box.querySelectorAll("button.booklet-item")].every((b) => b.getAttribute("aria-pressed") === "false"), "nothing is shown picked");
	assert.doesNotMatch(words(box), /later beta/);
	v.close();
});

test("a regions widget is drawn without a figure, as the reader draws it: its words, the places as buttons that are off, and the reader's own line that says the figure is not drawn", () => {
	const v = open();
	const box = questionBlock(v, "map");
	assert.ok(box?.querySelector(".booklet-sample"), "drawn");
	assert.equal(box.querySelector("svg, img, .booklet-design-friendly"), null, "no figure, no picture, no card");
	assert.match(words(box), /Not yet supported: drawing the widget's figure\./);
	assert.deepEqual([...box.querySelectorAll("button.booklet-place")].map((b) => words(b).replace(/\d+$/, "")), ["Head", "Chest"]);
	assert.ok([...box.querySelectorAll("button, input")].every((c) => c.disabled), "every control is off");
	v.close();
});

test("a widget whose block the note does not carry draws the reader's own line, and a widget asked for each pick stays the card it was", () => {
	const v = open();
	const lost = questionBlock(v, "lost");
	assert.match(words(lost), /This widget needs a widget block the note does not carry \(\^nothing-here\)\./);
	assert.equal(lost.querySelector(".booklet-design-friendly"), null);
	v.close();
	const each = openDesign(bookletAround(["> [!activity|a] A", "", "> [!choice|src] Pick", "- [ ] One", "", GRID.replace("[!widget|w-id]", "[!widget|w-id each:src]"), ""].join("\n")));
	each.go("A");
	const box = each.all('.booklet-design-block[data-kind="question"]').find((b) => /w-id/.test(b.textContent));
	assert.equal(box.querySelector(".booklet-sample"), null, "not drawn");
	assert.match(words(box.querySelector(".booklet-design-friendly-note")), /later beta/, "a card that says so (the follow-up kind is drawn in a later stage)");
	each.close();
});

test("a widget block and a widget's data block stay the small card of a data block, and say nothing of a later beta", () => {
	const v = open();
	for (const b of v.all('.booklet-design-block[data-kind="fence"]')) {
		assert.ok(b.querySelector(".booklet-design-friendly"), "a card");
		assert.equal(words(b.querySelector(".booklet-design-friendly-kind")), "Data block");
		assert.doesNotMatch(words(b), /later beta/);
		assert.equal(b.querySelector("pre"), null);
	}
	assert.equal(v.all('.booklet-design-block[data-kind="fence"]').length, 2, "the grid's and the regions' widget blocks, on the activity's page");
	v.go("Data");
	const data = v.all('.booklet-design-block[data-kind="fence"]');
	assert.equal(data.length, 2, "the two data blocks, on the data section's page");
	for (const b of data) assert.equal(words(b.querySelector(".booklet-design-friendly-kind")), "Data block");
	v.close();
});

/* ---------------------------------------------------------------- views */

test("each of the six view kinds is drawn from its data block with its rows, the way the reader draws it", () => {
	const v = open();
	const [table, list, cards, tiles, bars, line] = queryBlocks(v);
	const viewOf = (b) => b.querySelector(".booklet-query")?.getAttribute("data-booklet-view");
	assert.deepEqual([table, list, cards, tiles, bars, line].map(viewOf), ["table", "list", "cards", "tiles", "bars", "line"]);
	assert.equal(table.querySelectorAll("tbody tr").length, 12);
	assert.deepEqual([...table.querySelectorAll("thead th")].map(words), ["Job", "Hours", "Where"]);
	assert.equal(words(table.querySelector("tbody tr td")), "Job 1");
	assert.equal(list.querySelectorAll(".booklet-q-row").length, 12);
	assert.equal(words(list.querySelector(".booklet-q-label")), "Job 1");
	assert.equal(cards.querySelectorAll(".booklet-q-card").length, 12);
	assert.ok(tiles.querySelectorAll(".booklet-q-tile").length >= 1, "tiles");
	assert.equal(bars.querySelectorAll(".booklet-ch-row").length, 12);
	assert.ok(line.querySelector(".booklet-ch-line svg.booklet-ch-svg"), "a line chart's picture");
	for (const b of [table, list, cards, tiles, bars, line]) {
		assert.ok(b.querySelector(":scope > .booklet-design-drawn > .booklet-sample.booklet-sample-query[inert]"), "inside the inert wrapper");
		assert.equal(b.querySelector(".booklet-design-friendly, pre"), null, "no card, no Markdown");
		assert.doesNotMatch(words(b), /later beta/);
	}
	v.close();
});

test("no sort or filter control and no row action is drawn, though twelve rows would have the control and the query asks to add and delete", () => {
	const v = open();
	for (const b of queryBlocks(v).slice(0, 6)) {
		assert.equal(b.querySelector(".booklet-qc-slot, .booklet-qc, input, select, textarea"), null, "no search, no sort menu");
		assert.equal(b.querySelector("button"), null, "no button: no sort, no Add a row, no Remove");
		assert.equal(b.querySelector("th button, th[aria-sort]"), null, "a heading does not sort");
	}
	v.close();
});

test("an activity with nothing kept draws the reader's own empty line, even when the note holds kept entries, and no sample row is made up", () => {
	const v = open();
	assert.match(NOTE, /kept words/, "the note holds a kept entry");
	// the control: planned over the note as it is, the reader's own plan has that entry as a row, so it is the emptying that keeps it off the canvas
	const book = core.parseBooklet(NOTE);
	const seg = book.activities[0].segments.find((s) => s.type === "query" && s.query.from === "a");
	const plan = core.planQuery(book, seg, { drawn: new Date("2026-11-23T12:00:00Z"), activity: book.activities[0] });
	assert.equal(plan.empty, null, "a reader would see rows");
	assert.ok(JSON.stringify(plan.groups).includes("kept words"));
	const [, , , , , , empty] = queryBlocks(v);
	assert.equal(empty.querySelector(".booklet-q-empty")?.textContent, "Nothing kept here yet.");
	assert.equal(empty.querySelector("table, li, .booklet-q-row, .booklet-q-card"), null);
	assert.ok(!words(v.page()).includes("kept words"), "a reader's kept entry is not shown");
	v.close();
});

test("a data block that names a file draws the reader's quiet line, as no file is read here", () => {
	const v = open();
	const filed = queryBlocks(v).at(-1);
	assert.equal(filed.querySelector(".booklet-q-quiet")?.textContent, "Data not shown: the file rows.json could not be read.");
	v.close();
});

test("a query whose source the note does not have stays a card, with no line about a later beta", () => {
	const v = open();
	const gone = queryBlocks(v).at(-2);
	assert.ok(gone.querySelector(".booklet-design-friendly"));
	assert.equal(words(gone.querySelector(".booklet-design-friendly-kind")), "View of data");
	assert.equal(gone.querySelector(".booklet-design-friendly-note"), null);
	v.close();
});

test("a note that is not a booklet, or is refused, finds no query to draw", () => {
	assert.equal(drawnByLine("Some words.\n").queries.size, 0);
	assert.equal(drawnByLine("Some words.\n").questions.size, 0);
	const found = drawnByLine(NOTE);
	const lines = [...found.queries.keys()];
	const tree = core.walkDesign(core.parseDesign(NOTE)).filter((n) => n.kind === "query");
	assert.equal(tree.length, 9);
	assert.deepEqual(lines, tree.filter((n) => !/from: gone/.test(NOTE.split("\n")[n.start + 1])).map((n) => n.start), "found by the line the tree counts, and the query with no source is not among them");
	for (const f of found.queries.values()) assert.deepEqual(f.book.records.entries, {}, "planned over the design, never over kept data");
});

/* ---------------------------------------------------------------- inert */

/** Every event a script could make at an element: what the inert wrapper must drop. */
const EVENTS = ["pointerenter", "pointerover", "mouseover", "click", "dblclick", "pointerdown", "mousedown", "pointerup", "mouseup", "input", "change", "keydown", "keyup", "focusin", "focusout", "blur", "focus", "submit", "paste", "drop"];
function fire(el) {
	el.click?.();
	click(el);
	if (/^(input|textarea)$/i.test(el.tagName)) typeInto(el, "typed by a script");
	for (const type of EVENTS) el.dispatchEvent(new w.Event(type, { bubbles: true, cancelable: true }));
	for (const key of ["Enter", " ", "ArrowRight", "ArrowLeft", "Home", "End"]) el.dispatchEvent(new w.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
}

test("a widget drawn on the canvas keeps nothing: every press and script event at every control reaches no handler, so the stand-in host is never asked to answer, type or hold", () => {
	const app = { vault: {}, workspace: {} };
	const owner = { register() {} };
	const into = doc.body.createDiv();
	const found = drawnByLine(NOTE).questions;
	for (const id of ["w-id", "map"]) {
		const q = [...found.values()].find((x) => x.question.id === id);
		const drawn = drawInertQuestion({ app, owner, sourcePath: "", into }, q.activity, q.question);
		assert.ok(drawn, `${id} is drawn`);
		const before = drawn.card.innerHTML;
		for (const c of drawn.card.querySelectorAll("button, input, .booklet-cell, .booklet-axis")) fire(c);
		// a call that only registers what to do when the note is left (keepOwn) is made at the drawing; a press, a typed word and a hold are what would keep something
		assert.deepEqual(drawn.writes.filter((x) => x.method !== "keepOwn"), [], `${id}: nothing was answered, typed or held`);
		assert.equal(drawn.card.innerHTML, before, `${id}: and the drawing is as it was`);
		assert.equal(drawn.host.answerOf({ scope: "", activity: q.activity }, q.question), undefined, "the stand-in keeps no answer");
	}
	into.remove();
});

test("a stand-in that is called straight (as a handler taken off the page would) records and discards: nothing a widget asks is kept", () => {
	const app = { vault: {}, workspace: {} };
	const into = doc.body.createDiv();
	const q = [...drawnByLine(NOTE).questions.values()].find((x) => x.question.id === "w-id");
	const drawn = drawInertQuestion({ app, owner: { register() {} }, sourcePath: "", into }, q.activity, q.question);
	const t = { scope: "", activity: q.activity };
	drawn.host.answer(t, q.question, ["item-a"]);
	drawn.host.hold("k", "words");
	assert.deepEqual(drawn.writes.filter((x) => x.method !== "keepOwn").map((x) => x.method), ["answer", "hold"], "recorded");
	assert.equal(drawn.host.answerOf(t, q.question), undefined, "and shows nothing kept");
	into.remove();
});

test("a drawn view keeps nothing and opens nothing: presses and events at its links, headings, summaries and chart leave it and the note as they were", () => {
	const v = open();
	const before = v.disk.text;
	const blocks = queryBlocks(v).slice(0, 6);
	const snapshot = blocks.map((b) => b.innerHTML);
	const open0 = (b) => [...b.querySelectorAll("details")].map((d) => d.open);
	for (const b of blocks)
		for (const el of b.querySelectorAll("a, summary, th, td, li, svg, rect, circle, [tabindex], button, input")) fire(el);
	assert.deepEqual(blocks.map((b) => b.innerHTML), snapshot, "every view is as it was");
	assert.ok(blocks.flatMap(open0).every((o) => o === false), "a folded list of numbers stays folded");
	assert.equal(v.disk.writes, 0, "no write reached the vault");
	assert.equal(v.disk.text, before, "the note is byte-identical");
	assert.equal(v.view.getViewData(), before);
	assert.equal(v.status(), "");
	v.close();
});

test("a link in a row opens no note: the stand-in lists what was asked and the wrapper drops the press before it", () => {
	const app = { vault: {}, workspace: {} };
	const into = doc.body.createDiv();
	const q = [...drawnByLine(NOTE).queries.values()].find((x) => x.segment.query.as === "list");
	const drawn = drawInertQuery({ app, owner: { register() {} }, sourcePath: "", into }, q);
	const link = drawn.card.querySelector("a.internal-link");
	assert.ok(link, "the first row links to a note");
	fire(link);
	assert.deepEqual(drawn.opened, [], "no press reached the host");
	assert.equal(drawn.card.querySelector("button"), null, "and no row has an act");
	into.remove();
});

test("opening a note that holds every piece and selecting each of them (it opens in place, then closes) leaves the file byte for byte as it was, with no write; a selected one has its bar", async () => {
	const v = open();
	const before = v.disk.text;
	const blocks = v.all(".booklet-design-block").map((b) => [b.getAttribute("data-kind"), b.getAttribute("data-start")]);
	assert.ok(blocks.filter(([k]) => k === "query").length === 9 && blocks.filter(([k]) => k === "question").length === 4, "every widget and view is on the page");
	for (const [kind, start] of blocks) {
		v.select(kind, Number(start));
		assert.ok(v.editor(), `${kind} at ${start} opens in place`);
		await v.view.whenIdle();
		const box = v.pick(kind, Number(start));
		assert.ok(box.classList.contains("is-selected"), `${kind} at ${start} stands selected`);
		const bar = box.querySelector(":scope > .booklet-design-floatbar");
		assert.ok(bar, `${kind} at ${start} has its bar`);
		assert.deepEqual([...bar.querySelectorAll("button")].map((b) => b.getAttribute("aria-label")).length, 4, "Move up, Move down, Edit as Markdown, Delete");
		await v.view.whenIdle();
		assert.equal(v.disk.writes, 0, `${kind} at ${start}: no write`);
		assert.equal(v.disk.text, before, `${kind} at ${start}: byte for byte`);
	}
	v.close();
});

/* ---------------------------------------------------------------- observers */

test("a line chart's observer is let go of with the drawing: made and live counts over many redraws of the page, and none when the view is gone", () => {
	const obs = observerCount();
	try {
		const v = openDesign(NOTE);
		assert.equal(obs.made, 1, "the pane's own observer");
		v.go("The activity");
		assert.equal(obs.made, 2, "one line chart, one observer");
		for (let i = 0; i < 20; i++) v.go("The activity");
		assert.equal(obs.made, 22, "a new one at each of the 21 drawings of that page");
		assert.equal(obs.live, 2, "only the last drawing's is connected, and the pane's");
		v.close();
		assert.equal(obs.live, 0, "none when the view is gone");
		assert.equal(obs.made, obs.disconnected);
	} finally {
		obs.off();
	}
});
