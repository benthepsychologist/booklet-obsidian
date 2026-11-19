/*
 * The data guards: what a booklet holds, and what a change would leave not matching, counted. Each is tried on a booklet that holds
 * twelve kept entries, an answer, a draft and five rows. Nothing here writes: the functions read two texts and say.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { core } from "./helpers.mjs";
import { HELD } from "./editor-fixture.mjs";

const { holdings, holdingsLine, holdingsWords, impactOf, impactWords, parseBooklet, leftoversOf, parseLine, setId, setValue, setFlag } = core;

const swap = (text, from, to) => {
	assert.ok(text.includes(from), `the fixture has ${from}`);
	return text.replace(from, to);
};
const one = (impacts, kind) => impacts.filter((i) => i.kind === kind);

test("what a note holds is counted: kept entries, saved answers (given once, or in a draft) and rows", () => {
	assert.deepEqual(holdings(HELD), { entries: 12, answers: 2, rows: 5 });
	assert.equal(holdingsWords(holdings(HELD)), "12 kept entries, 2 saved answers and 5 rows");
	assert.equal(holdingsLine(holdings(HELD)), "This booklet holds 12 kept entries, 2 saved answers and 5 rows. Changing an id, an option or a field can detach them.");
	assert.match(holdingsLine({ entries: 1, answers: 0, rows: 0 }), /^This booklet holds 1 kept entry\. Changing/);
	assert.match(holdingsLine({ entries: 0, answers: 0, rows: 1 }), /^This booklet holds 1 row\./);
	assert.match(holdingsLine({ entries: 0, answers: 0, rows: 0 }), /holds no kept entries, answers or rows yet/);
});

test("a note with no records and no data blocks holds nothing", () => {
	assert.deepEqual(holdings("---\nbooklet: \"0.20\"\n---\n\n> [!activity|a] A\n"), { entries: 0, answers: 0, rows: 0 });
});

test("rows that hold rows are counted with them", () => {
	const nested = swap(HELD, '"done":"no"}', '"done":"no","steps":[{"id":"a1","title":"Fill the can"},{"id":"a2","title":"Pour"}]}');
	assert.equal(holdings(nested).rows, 7);
});

test("a change that detaches nothing says nothing: a new title, an icon, a placed piece", () => {
	assert.deepEqual(impactOf(HELD, swap(HELD, "A mood log", "A better name")), []);
	assert.deepEqual(impactOf(HELD, swap(HELD, "> [!activity|log repeat]", "> [!activity|log repeat icon:book]")), []);
	assert.deepEqual(impactOf(HELD, swap(HELD, "> [!text|why] Why?", "> [!text|why] Why?\n\n> [!text|extra] More\n")), []);
});

test("renaming an activity's id touches its kept entries and its draft", () => {
	const p = parseLine("> [!activity|log repeat] A mood log");
	const after = swap(HELD, "> [!activity|log repeat] A mood log", setId(p, "diary").text);
	const imp = impactOf(HELD, after);
	assert.deepEqual(one(imp, "id").map((i) => [i.what, i.entries, i.answers, i.rows]), [["The activity id `log`", 12, 1, 0]]);
	assert.equal(impactWords(imp[0]), "The activity id `log` touches 12 kept entries and 1 saved answer.");
});

test("renaming a question's id touches the entries that answer it, and its draft; a once-given answer too", () => {
	const after = swap(HELD, "> [!choice|feeling]", "> [!choice|mood-now]");
	assert.deepEqual(one(impactOf(HELD, after), "id").map((i) => [i.what, i.entries, i.answers]), [["The question id `feeling`", 12, 0]]);
	const why = impactOf(HELD, swap(HELD, "> [!text|why]", "> [!text|reason]"));
	assert.deepEqual(why.map((i) => [i.what, i.entries, i.answers]), [["The question id `why`", 12, 1]]);
	const energy = impactOf(HELD, swap(HELD, "> [!scale|energy]", "> [!scale|power]"));
	assert.deepEqual(energy.map((i) => [i.what, i.entries, i.answers]), [["The question id `energy`", 0, 1]]);
});

test("renaming a module's id touches everything kept under it", () => {
	const after = HELD.replaceAll("> [!module|mood", "> [!module|feelings");
	const imp = impactOf(HELD, after);
	assert.deepEqual(imp.map((i) => [i.kind, i.what, i.entries, i.answers]), [["id", "The module id `mood`", 12, 2]], "the data block moves with its module and is not lost");
});

test("removing an option that entries picked touches them; the positions after it shift", () => {
	// Tense is position 2: picked by entries 2, 5, 8, 11 (feeling 2), and gone, so positions 2 and 3 now mean other words
	const after = swap(HELD, "- [ ] Tense\n", "");
	const imp = impactOf(HELD, after);
	assert.deepEqual(one(imp, "option").map((i) => [i.what, i.entries]), [["The options of `feeling`", 8]], "entries that picked position 2 or 3 (8 of 12)");
});

test("removing the last option touches only the entries that picked it", () => {
	const imp = impactOf(HELD, swap(HELD, "- [ ] Low\n", ""));
	assert.deepEqual(one(imp, "option").map((i) => i.entries), [4]);
});

test("renaming an option touches the entries that picked it, and no others", () => {
	const imp = impactOf(HELD, swap(HELD, "- [ ] Calm", "- [ ] Peaceful"));
	assert.deepEqual(one(imp, "option").map((i) => i.entries), [4]);
});

test("adding an option at the end touches nothing", () => {
	assert.deepEqual(impactOf(HELD, swap(HELD, "- [ ] Low\n", "- [ ] Low\n- [ ] Angry\n")), []);
});

test("a scale's anchor renamed touches the answers that picked it", () => {
	const imp = impactOf(HELD, swap(HELD, "2. Lots", "2. A great deal"));
	assert.deepEqual(one(imp, "option").map((i) => [i.what, i.entries, i.answers]), [["The options of `energy`", 0, 1]]);
});

test("turning `repeat` off touches the kept entries it keeps; turning it on touches nothing", () => {
	const off = impactOf(HELD, swap(HELD, "> [!activity|log repeat]", "> [!activity|log]"));
	assert.deepEqual(off.map((i) => [i.kind, i.entries, i.answers]), [["option", 12, 1]]);
	assert.match(off[0].what, /`repeat` off/);
	const on = impactOf(swap(HELD, "> [!activity|log repeat]", "> [!activity|log]"), HELD);
	assert.deepEqual(on, []);
});

test("changing the way a question is asked (`each:`) touches its stored answers", () => {
	const after = swap(HELD, "> [!text|why] Why?", "> [!text|why each:feeling] Why?");
	const imp = impactOf(HELD, after);
	assert.deepEqual(imp.map((i) => [i.kind, i.entries, i.answers]), [["option", 12, 1]]);
	assert.match(imp[0].what, /`why` is asked/);
});

test("taking `open` off a question touches the entries that hold a reader's own words", () => {
	const open = swap(HELD, "> [!choice|feeling]", "> [!choice|feeling open]");
	const withOwn = open.replace('"feeling": 1, "why": "Day 1"', '"feeling": ["my own words"], "why": "Day 1"');
	const imp = impactOf(withOwn, HELD);
	assert.deepEqual(one(imp, "option").map((i) => [i.entries, i.what.includes("own options")]), [[1, true]]);
});

test("renaming a declared field touches the rows that carry it; so does removing it", () => {
	const renamed = swap(HELD, '"kind": "Kind"', '"group": "Kind"');
	assert.deepEqual(impactOf(HELD, renamed).map((i) => [i.kind, i.what, i.rows, i.views]), [["field", "The field `kind` of `things`", 5, 1]], "the query that lists no fields shows it");
	const removed = swap(HELD, ', "done": "Done" }', " }");
	assert.deepEqual(impactOf(HELD, removed).map((i) => [i.kind, i.what, i.rows, i.views]), [["field", "The field `done` of `things`", 5, 1]]);
	assert.equal(impactWords(impactOf(HELD, removed)[0]), "The field `done` of `things` touches 5 rows and 1 view that shows this field.");
});

const QUERY = "```booklet query\nfrom: things\nas: table\n```";
const withQuery = (lines) => swap(HELD, QUERY, "```booklet query\n" + lines + "\n```");

test("a view that names a field counts when the field is renamed or removed, by whatever way it names it", () => {
	const gone = (text, field) => impactOf(text, swap(text, `"${field}": "${field[0].toUpperCase()}${field.slice(1)}"`, `"${field}2": "X"`));
	const views = (text, field) => gone(text, field).map((i) => i.views);
	// a view that lists the field, one that groups by it, one that gives it a role, one that locks it
	assert.deepEqual(views(withQuery("from: things\nfields: title, kind"), "kind"), [1]);
	assert.deepEqual(views(withQuery("from: things\nfields: title\ngroup: kind"), "kind"), [1]);
	assert.deepEqual(views(withQuery("from: things\nfields: title\nbadge: kind"), "kind"), [1]);
	assert.deepEqual(views(withQuery("from: things\nfields: title, done\nreadonly: kind"), "kind"), [1]);
	// a view that lists other fields, or reads another block, is not touched
	assert.deepEqual(views(withQuery("from: things\nfields: title, done"), "kind"), [0]);
	assert.deepEqual(views(withQuery("from: log\nfields: kind"), "kind"), [0]);
	// two views, counted together
	const two = swap(HELD, QUERY, "```booklet query\nfrom: things\nfields: kind\n```\n\n```booklet query\nfrom: things\nas: list\n```");
	assert.equal(impactWords(gone(two, "kind")[0]), "The field `kind` of `things` touches 5 rows and 2 views that show this field.");
});

test("a field no row carries touches nothing, unless a view names it", () => {
	const unused = swap(HELD, '"done": "Done" }', '"done": "Done", "spare": "Spare" }');
	assert.deepEqual(impactOf(unused, swap(unused, ', "spare": "Spare"', "")), [], "a view that lists no fields shows nothing for it");
	const named = swap(unused, QUERY, "```booklet query\nfrom: things\nfields: title, spare\n```");
	assert.deepEqual(impactOf(named, swap(named, ', "spare": "Spare"', "")).map((i) => [i.rows, i.views]), [[0, 1]]);
});

test("a field no row carries touches nothing (the old case, kept)", () => {
	const unused = swap(HELD, '"done": "Done" }', '"done": "Done", "spare": "Spare" }');
	assert.deepEqual(impactOf(unused, swap(unused, ', "spare": "Spare"', "")), []);
});

test("renaming a data block's id touches its rows, and the entries that changed it", () => {
	const imp = impactOf(HELD, swap(HELD, "^things", "^stuff"));
	assert.deepEqual(imp.map((i) => [i.kind, i.what, i.rows]), [["id", "The data block `things`", 5]]);
});

test("a note that is not a booklet, or a change that leaves the records alone, never throws", () => {
	assert.deepEqual(impactOf("just words", "other words"), []);
	assert.deepEqual(impactOf("", ""), []);
});

test("the panel's line edits are what the guards see: id, `repeat`, `menu:` and `open`", () => {
	const line = (t) => parseLine(t);
	const rename = setId(line("> [!choice|feeling] How do you feel?"), "mood");
	assert.ok(impactOf(HELD, swap(HELD, "> [!choice|feeling] How do you feel?", rename.text)).length > 0);
	const repeatOff = setFlag(line("> [!activity|log repeat] A mood log"), "repeat", false);
	assert.ok(impactOf(HELD, swap(HELD, "> [!activity|log repeat] A mood log", repeatOff.text)).length > 0);
	// `menu:` on a choice that has options of its own changes nothing the answers were kept for
	const menu = setValue(line("> [!choice|feeling] How do you feel?"), "menu", "nowhere");
	assert.deepEqual(impactOf(HELD, swap(HELD, "> [!choice|feeling] How do you feel?", menu.text)), []);
	// the same edit on a choice that takes its options from a shared menu leaves the 12 kept entries' picks with no option behind them
	const shared = swap(swap(HELD, "- [ ] Calm\n- [ ] Tense\n- [ ] Low\n", ""), "> [!choice|feeling] How do you feel?", "> [!choice|feeling menu:moods] How do you feel?");
	const withMenu = swap(shared, "> [!activity|once] Said once", "> [!menu|moods]\n- Calm\n- Tense\n- Low\n\n> [!activity|once] Said once");
	assert.deepEqual(impactOf(withMenu, swap(withMenu, "menu:moods", "menu:nowhere")).map((i) => [i.kind, i.what, i.entries, i.answers]), [["id", "The question id `feeling`", 12, 0]], "the reader does not draw a question whose menu is not there, so its 12 kept entries lose their question");
});

// ---- what no longer matches (the problems list)
const leftovers = (text) => leftoversOf(parseBooklet(text));

test("a booklet whose design matches its records has no leftovers", () => {
	assert.deepEqual(leftovers(HELD), []);
});

test("entries of an activity the booklet no longer has are leftovers, counted, with the line of their block", () => {
	const after = swap(HELD, "> [!activity|log repeat]", "> [!activity|diary repeat]");
	const l = leftovers(after);
	assert.deepEqual(l.map((x) => x.count), [12, 1], "the entries, then the draft");
	assert.match(l[0].why, /12 kept entries for the activity `log`/);
	assert.match(l[1].why, /1 saved answer in a draft for the activity `log`/);
	assert.equal(after.split("\n")[l[0].line], "```booklet entries log");
});

test("entries that answer a question or an option the activity no longer has are leftovers", () => {
	const noWhy = swap(HELD, "> [!text|why] Why?\n", "");
	assert.match(leftovers(noWhy).map((x) => x.why).join("\n"), /12 kept entries of `log` that answer a question or an option the activity no longer has/);
	const noLow = swap(HELD, "- [ ] Low\n", "");
	assert.match(leftovers(noLow).map((x) => x.why).join("\n"), /4 kept entries of `log` that answer/);
});

test("a saved answer for a question that is gone is a leftover; so is one for an anchor that is gone", () => {
	assert.match(leftovers(swap(HELD, "> [!scale|energy]", "> [!scale|power]")).map((x) => x.why).join("\n"), /1 saved answer in the module `mood` for a question or an option it no longer has/);
	assert.match(leftovers(swap(HELD, "2. Lots\n", "")).map((x) => x.why).join("\n"), /1 saved answer/);
});

test("records under a records line that names no module are reported once: by the reader, not again as a leftover", () => {
	const renamed = HELD.replaceAll("> [!module|mood", "> [!module|other");
	assert.deepEqual(leftovers(renamed).filter((x) => /records line that names no module/.test(x.why)), []);
	const says = core.problemsOf(renamed).filter((p) => /names "mood", which is no module of this file|no module of this file/.test(p.why));
	assert.equal(says.length, 1, JSON.stringify(says));
});

test("rows with a field the block does not declare are leftovers", () => {
	const l = leftovers(swap(HELD, ', "done": "Done" }', " }"));
	assert.deepEqual(l.map((x) => [x.count, /5 rows of `things` with a field the block does not declare \(`done`\)/.test(x.why)]), [[5, true]]);
});

test("an act on a data block the booklet no longer has is a leftover", () => {
	const act = '{"ts": "2026-10-20T09:00:00Z", "$add": [{"in": "gone", "pick": "z", "row": {"title": "x"}}]}';
	const text = swap(HELD, "]}\n```\n\n```booklet draft log", `,\n${act}\n]}\n\`\`\`\n\n\`\`\`booklet draft log`);
	assert.ok(leftovers(text).some((x) => /change a data block this booklet no longer has/.test(x.why)), JSON.stringify(leftovers(text)));
});
