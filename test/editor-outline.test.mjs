/*
 * The outline: modules, activities with their tabs, pages and groups, and questions with their ids, each with its line.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { core, bookletAround } from "./helpers.mjs";

const { outline, flatten } = core;

// one row per node: indent, type, id, label, 1-based line
const rows = (text) =>
	flatten(outline(text)).map(({ node: n, depth }) => "  ".repeat(depth) + [n.type === "question" || n.type === "menu" ? n.kind : n.type, n.id || "-", n.label || "-", n.line + 1].join(" "));

test("a module with activities, tabs, pages, a group and questions", () => {
	const text = bookletAround(
		[
			"> [!module|week-1] Week one", // 9
			"",
			"> [!tab|plan] The plan", // 11: a tab of the module's, in its opening
			"",
			"> [!activity|check] Check in", // 13
			"",
			"> [!text|noticed] What did you notice?", // 15
			"",
			"***", // 17: a page break
			"",
			"> [!scale|biggest] How big?", // 19
			"1. Small",
			"2. Big",
			"",
			"> [!tab] Second tab", // 23
			"",
			"> [!group] Step one", // 25
			"> Words.",
			">",
			"> > [!choice|pick] Pick", // 28
			"> - [ ] A",
			"",
			"> [!activity|later] Later", // 31
			"",
			"> [!date|when] When?", // 33
			"",
			"> [!module|week-1 end]",
			"",
			"> [!data|week-1] Data for week one", // 37
			"",
		].join("\n"),
	);
	assert.deepEqual(rows(text), [
		"module week-1 Week one 9",
		"  tab plan The plan 11",
		"  activity check Check in 13",
		"    page - Page 1 13",
		"      text noticed What did you notice? 15",
		"    page - Page 2 17",
		"      scale biggest How big? 19",
		"    tab second-tab Second tab 23",
		"      group - Step one 25",
		"        choice pick Pick 28",
		"  activity later Later 31",
		"    date when When? 33",
		"data week-1 Data for week one 37",
	]);
});

test("named pages sit in their tab, a page under its parent: and a page break in a named page does not cut it", () => {
	const text = bookletAround(
		[
			"> [!activity|wiki] Wiki", // 9
			"",
			"> [!tab|learn] Learn", // 11
			"",
			"> [!page|map icon:book] The garden map", // 13
			"",
			"Where each bed is.",
			"",
			"> [!text|q1] A question on the map", // 17
			"",
			"> [!page|parent:map] Choosing a place", // 19
			"",
			"> [!page|grid] The grid", // 21
			"",
			"One.",
			"",
			"***",
			"",
			"Two.",
			"",
		].join("\n"),
	);
	assert.deepEqual(rows(text), [
		"activity wiki Wiki 9",
		"  tab learn Learn 11",
		"    page map The garden map 13",
		"      text q1 A question on the map 17",
		"      page - Choosing a place 19",
		"    page grid The grid 21",
	]);
});

test("bare activities sit at the top; a file with no activity line is one activity named by its title", () => {
	assert.deepEqual(rows(bookletAround("> [!activity|a1] One\n\n> [!text|t1] T\n\n> [!activity|a2] Two\n")), ["activity a1 One 9", "  text t1 T 11", "activity a2 Two 13"]);
	assert.deepEqual(rows(bookletAround("Some words.\n\n> [!text|t1] T\n\n> [!lines|l1] L\n- a\n")), ["activity - A made-up booklet 8", "  text t1 T 11", "  lines l1 L 13"]);
	// `---` after a blank line is a page break; straight under prose it makes the prose a heading, and is not one
	assert.deepEqual(rows(bookletAround("Some words.\n\n> [!text|t1] T\n\n---\n\n> [!lines|l1] L\n- a\n")), [
		"activity - A made-up booklet 8",
		"  page - Page 1 8",
		"    text t1 T 11",
		"  page - Page 2 13",
		"    lines l1 L 15",
	]);
	assert.deepEqual(rows(bookletAround("Some words.\n---\n\n> [!text|t1] T\n")), ["activity - A made-up booklet 8", "  text t1 T 12"]);
});

test("records and a menu in a module's opening are shown; hints and reading callouts are not", () => {
	const text = bookletAround(
		"> [!module|m] M\n\n> [!menu|feelings] Feelings\n- calm\n- tense\n\n> [!activity|a] A\n\n> [!text|t] T\n\n> [!hint]-\n> help\n\n> [!note] A note\n\n> [!module|m end]\n\n%%\n> [!records] App record — do not edit below this line\n%%\n",
	);
	assert.deepEqual(rows(text), ["module m M 9", "  menu feelings Feelings 11", "  activity a A 15", "    text t T 17", "records - Records (answers; written by the app) 26"]);
});

test("every question kind in one note: one node per question, ids as written, each on its own line", () => {
	const qs = ["text", "lines", "choice", "multi", "scale", "number", "date", "matrix", "listen"];
	const text = bookletAround("> [!activity|a] A\n\n" + qs.map((k) => `> [!${k}|${k}-1] A ${k}\n`).join("\n"));
	const found = flatten(outline(text)).map((x) => x.node).filter((n) => n.type === "question");
	assert.deepEqual(found.map((n) => n.kind), qs);
	const lines = text.split("\n");
	for (const q of found) assert.ok(lines[q.line].includes(`[!${q.kind}|${q.id}`), lines[q.line]);
});
