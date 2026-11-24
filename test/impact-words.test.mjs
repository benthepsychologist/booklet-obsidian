/*
 * The sentence the "Change this question?" box says for each thing a change touches (core/editor-guard.ts, impactWords). Beta.1 said
 * "The options of `sunny` touches 1 saved answer.": the backticks showed as themselves in the dialog, and a plural subject had a singular
 * verb. A name is now between quotation marks, the verb agrees with its subject, and the counts say 1 as singular and the rest as plural.
 * Every sentence below is the exact one; a few more are made from real notes, so the words and the data they are made from stay together.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { core } from "./helpers.mjs";
import { HELD } from "./editor-fixture.mjs";

const { impactWords, impactOf } = core;

const said = (what, counts, plural) => impactWords({ kind: "id", what, entries: 0, answers: 0, rows: 0, ...counts, ...(plural ? { plural: true } : {}) });

test("a singular subject takes touches, a plural subject takes touch, for every subject there is", () => {
	const one = { answers: 1 };
	const many = { entries: 12, answers: 3 };
	const subjects = [
		["The module id `mood`", false, "The module id “mood” touches 1 saved answer.", "The module id “mood” touches 12 kept entries and 3 saved answers."],
		["The activity id `log`", false, "The activity id “log” touches 1 saved answer.", "The activity id “log” touches 12 kept entries and 3 saved answers."],
		["The question id `sunny`", false, "The question id “sunny” touches 1 saved answer.", "The question id “sunny” touches 12 kept entries and 3 saved answers."],
		["The options of `sunny`", true, "The options of “sunny” touch 1 saved answer.", "The options of “sunny” touch 12 kept entries and 3 saved answers."],
		["The items and anchors of `topics`", true, "The items and anchors of “topics” touch 1 saved answer.", "The items and anchors of “topics” touch 12 kept entries and 3 saved answers."],
		["The reader's own options of `where` (no longer `open`)", true, "The reader's own options of “where” (no longer “open”) touch 1 saved answer.", "The reader's own options of “where” (no longer “open”) touch 12 kept entries and 3 saved answers."],
		["The way `why` is asked (`each:` changed)", false, "The way “why” is asked (“each:” changed) touches 1 saved answer.", "The way “why” is asked (“each:” changed) touches 12 kept entries and 3 saved answers."],
		["The activity `log` as one that keeps entries (`repeat` off)", false, "The activity “log” as one that keeps entries (“repeat” off) touches 1 saved answer.", "The activity “log” as one that keeps entries (“repeat” off) touches 12 kept entries and 3 saved answers."],
		["The data block `things`", false, "The data block “things” touches 1 saved answer.", "The data block “things” touches 12 kept entries and 3 saved answers."],
		["The field `done` of `things`", false, "The field “done” of “things” touches 1 saved answer.", "The field “done” of “things” touches 12 kept entries and 3 saved answers."],
	];
	for (const [what, plural, singleSaid, manySaid] of subjects) {
		assert.equal(said(what, one, plural), singleSaid);
		assert.equal(said(what, many, plural), manySaid);
	}
});

test("the counts: one is singular, any other number plural, and the parts are joined with commas and one and", () => {
	const t = "The options of `sunny`";
	assert.equal(said(t, { entries: 1 }, true), "The options of “sunny” touch 1 kept entry.");
	assert.equal(said(t, { entries: 2 }, true), "The options of “sunny” touch 2 kept entries.");
	assert.equal(said(t, { answers: 1 }, true), "The options of “sunny” touch 1 saved answer.");
	assert.equal(said(t, { answers: 2 }, true), "The options of “sunny” touch 2 saved answers.");
	assert.equal(said(t, { rows: 1 }, true), "The options of “sunny” touch 1 row.");
	assert.equal(said(t, { rows: 5 }, true), "The options of “sunny” touch 5 rows.");
	assert.equal(said(t, { entries: 1, answers: 1 }, true), "The options of “sunny” touch 1 kept entry and 1 saved answer.");
	assert.equal(said(t, { entries: 3, answers: 1 }, true), "The options of “sunny” touch 3 kept entries and 1 saved answer.");
	assert.equal(said(t, { entries: 1, answers: 2 }, true), "The options of “sunny” touch 1 kept entry and 2 saved answers.");
	assert.equal(said(t, { entries: 1, answers: 1, rows: 1 }, true), "The options of “sunny” touch 1 kept entry, 1 saved answer and 1 row.");
	assert.equal(said(t, { entries: 4, answers: 2, rows: 5 }, true), "The options of “sunny” touch 4 kept entries, 2 saved answers and 5 rows.");
	const f = "The field `done` of `things`";
	assert.equal(said(f, { rows: 5, views: 1 }, false), "The field “done” of “things” touches 5 rows and 1 view that shows this field.");
	assert.equal(said(f, { rows: 5, views: 2 }, false), "The field “done” of “things” touches 5 rows and 2 views that show this field.");
	assert.equal(said(f, { rows: 0, views: 1 }, false), "The field “done” of “things” touches 1 view that shows this field.");
	assert.equal(said(f, { entries: 2, answers: 1, rows: 1, views: 3 }, false), "The field “done” of “things” touches 2 kept entries, 1 saved answer, 1 row and 3 views that show this field.");
	assert.equal(said(f, {}, false), "The field “done” of “things” touches nothing.");
	assert.equal(said(t, {}, true), "The options of “sunny” touch nothing.");
});

test("no sentence a real change makes holds a backtick, and the three plural subjects are the ones that say touch", () => {
	const swap = (text, from, to) => {
		assert.ok(text.includes(from), `the fixture has ${from}`);
		return text.replace(from, to);
	};
	const changes = [
		swap(HELD, "- [ ] Tense\n", ""),
		swap(HELD, "2. Lots", "2. A great deal"),
		swap(HELD, "> [!activity|log repeat]", "> [!activity|log]"),
		swap(HELD, "> [!text|why] Why?", "> [!text|why each:feeling] Why?"),
		swap(HELD, "> [!activity|log repeat]", "> [!activity|diary repeat]"),
		swap(HELD, "> [!text|why] Why?", "> [!text|whyever] Why?"),
	];
	const made = changes.flatMap((after) => impactOf(HELD, after));
	assert.ok(made.length >= 5, `real changes made ${made.length} sentences`);
	for (const i of made) {
		const w = impactWords(i);
		assert.ok(!w.includes("`"), `no backtick in: ${w}`);
		const options = /^The (options|items and anchors|reader's own options) of /.test(i.what);
		assert.equal(i.plural === true, options, `${i.what}: plural only for the options`);
		assert.match(w, options ? / touch \d/ : / touches \d/, w);
	}
	assert.equal(impactWords(impactOf(HELD, changes[0]).find((i) => i.kind === "option")), "The options of “feeling” touch 8 kept entries.");
	assert.equal(impactWords(impactOf(HELD, changes[1]).find((i) => i.kind === "option")), "The options of “energy” touch 1 saved answer.");
});
