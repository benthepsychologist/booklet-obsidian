/*
 * Second fix round, item C: renames the reader does not refuse but the linter does (lint-booklet.py). A question, activity or menu
 * cannot take the id of a `booklet data` block of its module (a query could not tell them apart); a tab cannot take the id of another
 * tab of its activity or of its module's opening; a page cannot take the id of another page of its tab. Each is refused with a reason
 * and the note is left as it was; the same id in another module, another activity's tabs or another tab's pages is allowed.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { core } from "./helpers.mjs";

const { renameId } = core;
const FM = `---\nbooklet: "0.20"\nid: local/x\ntitle: T\nlang: en\nversion: "0.1"\n---\n\n`;
const BLOCK = (id) => "```booklet data\n" + `{"fields":{"a":"text"},"rows":[]}\n` + "```\n^" + id + "\n";
const lineOf = (text, needle) => text.split("\n").findIndex((l) => l.includes(needle));

test("[C] a question cannot take the id of a data block in its module, and the note is left as it was", () => {
	const doc = FM + "> [!activity|a] A\n\n> [!text|q] Q\n\n" + BLOCK("things");
	const r = renameId(doc, lineOf(doc, "[!text|q]"), "things");
	assert.match(r.error ?? "", /already the id of a data block in the activities outside every module/);
	assert.equal(renameId(doc, lineOf(doc, "[!text|q]"), "other").text, doc.replace("[!text|q]", "[!text|other]"));
});

test("[C] an activity and a menu are held to the same rule", () => {
	const doc = FM + "> [!activity|a] A\n\n> [!text|q] Q\n\n" + BLOCK("things");
	assert.match(renameId(doc, lineOf(doc, "[!activity|a]"), "things").error ?? "", /data block/);
	const m = FM + "> [!module|m1] M\n\n> [!activity|a] A\n\n> [!choice|c|menu:colors] Pick\n\n> [!menu|colors] Colors\n> - red\n\n" + BLOCK("things") + "\n> [!module|m1 end]\n";
	assert.match(renameId(m, lineOf(m, "[!menu|colors]"), "things").error ?? "", /data block in the module "m1"/);
});

test("[C] the same id in another module is allowed", () => {
	const doc = FM + "> [!module|m1] One\n\n> [!activity|a] A\n\n" + BLOCK("things") + "\n> [!module|m1 end]\n\n> [!module|m2] Two\n\n> [!activity|b] B\n\n> [!text|q] Q\n\n> [!module|m2 end]\n";
	const r = renameId(doc, lineOf(doc, "[!text|q]"), "things");
	assert.equal("error" in r, false, "a block of module m1 is no clash for a question of m2");
});

test("[C] a tab cannot take the id of another tab of its activity; another activity's tabs are free", () => {
	const doc = FM + "> [!activity|a] A\n\n> [!tab|one] One\n\n> [!tab|two] Two\n\n> [!activity|b] B\n\n> [!tab|three] Three\n";
	assert.match(renameId(doc, lineOf(doc, "[!tab|two]"), "one").error ?? "", /already the id of another tab in this activity/);
	assert.equal("error" in renameId(doc, lineOf(doc, "[!tab|three]"), "one"), false, "the tab of another activity");
	assert.equal(renameId(doc, lineOf(doc, "[!tab|two]"), "other").text, doc.replace("[!tab|two]", "[!tab|other]"));
});

test("[C] a tab in a module's opening cannot take the id of another tab there", () => {
	const doc = FM + "> [!module|m1] M\n\n> [!tab|one] One\n\n> [!tab|two] Two\n\n> [!activity|a] A\n\n> [!tab|one] One\n\n> [!module|m1 end]\n";
	assert.match(renameId(doc, lineOf(doc, "[!tab|two]"), "one").error ?? "", /another tab in this module's opening/);
});

test("[C] a page cannot take the id of another page of its tab; the pages of another tab are free", () => {
	const doc = FM + "> [!activity|a] A\n\n> [!tab|one] One\n\n> [!page|p1] P1\n\n> [!page|p2] P2\n\n> [!tab|two] Two\n\n> [!page|p3] P3\n";
	assert.match(renameId(doc, lineOf(doc, "[!page|p2]"), "p1").error ?? "", /already the id of another page in this tab/);
	assert.equal("error" in renameId(doc, lineOf(doc, "[!page|p3]"), "p1"), false, "the page of the next tab");
});

test("[C] a page named only by its title takes that title's id: a page cannot take it either", () => {
	const doc = FM + "> [!activity|a] A\n\n> [!page] Plain title\n\n> [!page|p2] P2\n";
	assert.match(renameId(doc, lineOf(doc, "[!page|p2]"), "plain-title").error ?? "", /another page/);
});
