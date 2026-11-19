/*
 * Fresh ids: valid and unique where the format asks them to be unique, and the ids the plugin's reader finds are the ids the panel made.
 * The rule is the personal editor's, brought to format 0.20 (copy lines, pages, ids a tab and a page make from their names).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { core, bookletAround } from "./helpers.mjs";

const { planInsert, applyPlan, PIECES, parseBooklet, scan, ID_PATTERN } = core;
const piece = (file) => PIECES.find((p) => p.file === file);
const at = (doc, needle) => doc.split("\n").findIndex((l) => l.includes(needle));
const place = (doc, needle, file, times = 1) => {
	let text = doc;
	const plans = [];
	for (let k = 0; k < times; k++) {
		const plan = planInsert(text, { line: at(text, needle), ch: 0 }, piece(file).text);
		text = applyPlan(text, plan);
		plans.push(plan);
	}
	return { text, plans };
};
const ids = (plans) => plans.map((p) => Object.values(p.assigned));

const ACT = bookletAround("> [!module|module-1] M\n\n> [!activity|activity-1] An activity\n\nSome words.\n\n> [!text|text-1] First\n\n> [!module|module-1 end]\n");

test("each placing takes the next number, in the module it lands in", () => {
	assert.deepEqual(ids(place(ACT, "[!text|text-1]", "Q - choice.md", 3).plans), [["choice-1"], ["choice-2"], ["choice-3"]]);
	assert.deepEqual(ids(place(ACT, "module-1 end", "Structure - module.md", 2).plans), [["module-2", "activity-1", "text-1"], ["module-3", "activity-1", "text-1"]]);
});

test("a question id is the next free number of its kind in its module, not the file", () => {
	const two = bookletAround("> [!module|a] A\n\n> [!activity|x] X\n\n> [!text|text-1] One\n\n> [!text|text-2] Two\n\n> [!module|a end]\n\n> [!module|b] B\n\n> [!activity|y] Y\n\n> [!text|q] One\n\n> [!module|b end]\n");
	assert.deepEqual(ids(place(two, "[!text|q]", "Q - text.md").plans), [["text-1"]], "module b has no text-1");
	assert.deepEqual(ids(place(two, "[!text|text-2]", "Q - text.md").plans), [["text-3"]], "module a has text-1 and text-2");
});

test("an id the records still hold answers under is never given to a new question or activity", () => {
	const doc = bookletAround(
		"> [!module|module-1] M\n\n> [!activity|activity-1] A\n\n> [!text|text-1] One\n\n> [!module|module-1 end]\n\n%%\n> [!records] App record — do not edit below this line\n\n> [!records|module-1] M\n\n" +
			'```booklet answers\n{ "text-1": "kept", "text-2": "from a deleted question" }\n```\n\n```booklet entries activity-2\n{"items": []}\n```\n%%\n',
	);
	assert.deepEqual(ids(place(doc, "[!text|text-1]", "Q - text.md").plans), [["text-3"]]);
	assert.deepEqual(ids(place(doc, "[!text|text-1]", "Structure - activity.md").plans), [["activity-3"]]);
});

test("a data block's id is never also a question's or an activity's of its module", () => {
	const doc = bookletAround("> [!module|m] M\n\n> [!activity|activity-1] A\n\n> [!text|data-1] A question that took the data block's number\n\n> [!module|m end]\n");
	assert.deepEqual(ids(place(doc, "[!text|data-1]", "Data - rows.md").plans), [["data-2"]]);
});

test("a block, a footnote, a reference label: unique in the file, across modules", () => {
	const doc = bookletAround("> [!module|a] A\n\n> [!activity|x] X\n\nA claim.[^source-1]\n\n[^source-1]: *Title*, p. 1: \"words\"\n\n```booklet data\n{\"rows\": []}\n```\n^data-1\n\n> [!module|a end]\n\n> [!module|b] B\n\n> [!activity|y] Y\n\n> [!text|q] One\n\n> [!module|b end]\n");
	assert.deepEqual(ids(place(doc, "[!text|q]", "Reading - citation.md").plans), [["source-2"]]);
	assert.deepEqual(ids(place(doc, "[!text|q]", "Data - rows.md").plans), [["data-2"]]);
});

test("a page id is unique in the file, and the plugin's reader finds the id the panel wrote", () => {
	const { text, plans } = place(ACT, "[!text|text-1]", "Structure - page.md", 2);
	assert.deepEqual(ids(plans), [["page-1"], ["page-2"]]);
	const withTab = bookletAround("> [!module|module-1] M\n\n> [!activity|activity-1] An activity\n\n> [!tab|tab-a] Tab\n\n> [!page|page-1] One\n\nWords.\n\n> [!text|text-1] First\n\n> [!module|module-1 end]\n");
	const r = place(withTab, "[!text|text-1]", "Structure - page.md");
	assert.deepEqual(ids(r.plans), [["page-2"]]);
	const pages = parseBooklet(text).activities[0].segments.filter((s) => s.type === "page").map((s) => s.id);
	// both were put right after the question, so the second stands above the first
	assert.deepEqual(pages, ["page-2", "page-1"]);
});

test("a second tab with the name of the first is given an id of its own", () => {
	const { text, plans } = place(ACT, "[!text|text-1]", "Structure - tab.md", 3);
	assert.deepEqual(plans.map((p) => Object.values(p.assigned)), [[], ["tab-1"], ["tab-2"]]);
	assert.match(text, /> \[!tab\|tab-1\] Name of the tab/);
	const tabs = scan(text).items.filter((i) => i.type === "tab").map((i) => i.tabId);
	assert.equal(new Set(tabs).size, 3, "three tabs, three ids: " + tabs);
});

test("a copy line and the question it copies get ids that are valid and are the ones the reader sees", () => {
	const { text, plans } = place(ACT, "[!text|text-1]", "Reading - copy button.md", 2);
	const act = parseBooklet(text).activities[0];
	const copies = act.segments.filter((s) => s.type === "copy");
	assert.equal(copies.length, 2);
	// each copy line names the question put with it, whichever stands first
	assert.deepEqual(copies.map((c) => c.of), [["text-3"], ["text-2"]]);
	assert.deepEqual(copies.map((c) => c.id), ["copy-2", "copy-1"]);
	for (const p of plans) for (const id of Object.values(p.assigned)) assert.match(id, ID_PATTERN);
});

test("a data section placed after a module names that module", () => {
	const { text, plans } = place(ACT, "module-1 end", "Structure - data section (module).md");
	assert.deepEqual(plans[0].left, []);
	assert.match(text, /\n> \[!data\|module-1\] Data for this module\n/);
});

test("every id the panel makes is valid, and names a thing the reader reads", () => {
	for (const p of PIECES) {
		const plan = planInsert(ACT, { line: at(ACT, "[!text|text-1]"), ch: 0 }, p.text);
		for (const id of Object.values(plan.assigned)) assert.match(id, ID_PATTERN, `${p.file}: ${id}`);
	}
});
