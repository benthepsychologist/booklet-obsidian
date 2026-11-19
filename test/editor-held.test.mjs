/*
 * What holds a line, found as the reader finds it (second fix round, items A and B): the panel's "held" lines come from the reader's own
 * scan (`visibleLines`), so a `<!--` or `$$` block with a blank line in it, a `%%` inside an inline code span, a mark with no closer,
 * and a group written inside a fence or a comment are all read the way the reader reads them, by `placement` (every path of it, the
 * group path included) and by `settingsAt` / `changeLine`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { core } from "./helpers.mjs";
import { HELD } from "./editor-fixture.mjs";

const { planInsert, applyPlan, PIECES, settingsAt, changeLine, scan, parseBooklet, questionsOf } = core;
const NOTE = PIECES.find((p) => p.file === "Reading - note.md");
const GROUP = PIECES.find((p) => /group/i.test(p.file));
const FM = `---\nbooklet: "0.20"\nid: local/x\ntitle: T\nlang: en\nversion: "0.1"\n---\n\n`;
const put = (doc, line, p = NOTE) => {
	const plan = planInsert(doc, { line, ch: 0 }, p.text);
	return { plan, text: applyPlan(doc, plan), lines: applyPlan(doc, plan).split("\n") };
};
const idx = (text, needle) => text.split("\n").findIndex((l) => l === needle || l.includes(needle));
const readerIds = (text) => parseBooklet(text).activities.flatMap((a) => questionsOf(a)).map((q) => q.id);

/** Where the placed note lands, as its line index in the new text, and the index of a line that must come before it. */
const landed = (r) => idx(r.text, "> [!note] Title of the note");

test("[A] a `<!--` block with a blank line in it: the cursor on the line before the blank places after the `-->`", () => {
	const doc = FM + "> [!activity|a] A\n\n<!--\nold idea\n\n> [!text|zz] X\n-->\n\n> [!text|q] Q\n";
	const r = put(doc, idx(doc, "old idea"));
	assert.ok(landed(r) > idx(r.text, "-->"), "after the comment's closer");
	assert.deepEqual(readerIds(r.text), ["q"]);
	assert.equal(r.text.replace(/\n?> \[!note\] Title of the note\n> The words of the note\.\n?/, "\n").replace(/\n\n+/g, "\n"), doc.replace(/\n\n+/g, "\n"), "nothing else moved");
});

test("[A] a `<!--` block: every line of it, the opening line included, places after the `-->`", () => {
	const doc = FM + "> [!activity|a] A\n\n<!--\nold idea\n\n> [!text|zz] X\n-->\n\n> [!text|q] Q\n";
	const from = idx(doc, "<!--");
	const to = idx(doc, "-->");
	for (let line = from; line <= to; line++) {
		const r = put(doc, line);
		assert.ok(landed(r) > idx(r.text, "-->"), `line ${line}`);
	}
});

test("[A] a question written inside a `<!--` block with a blank line has no settings, and its line is not changed", () => {
	const doc = FM + "> [!activity|a] A\n\n<!--\nold idea\n\n> [!text|zz] X\n-->\n\n> [!text|q] Q\n";
	const line = idx(doc, "[!text|zz]");
	assert.equal(settingsAt(doc, line).model, null);
	assert.equal(settingsAt(doc, line).held, "comment");
	assert.ok(changeLine(doc, line, { id: "other" }).error);
	assert.ok(settingsAt(doc, idx(doc, "[!text|q]")).model, "the real question after the comment still has them");
});

test("[A] a `$$` block with a blank line in it places after its closing `$$`", () => {
	const doc = FM + "> [!activity|a] A\n\n$$\nx\n\ny\n$$\n\n> [!text|q] Q\n";
	const at = (t) => doc.split("\n").indexOf(t);
	for (const line of [at("$$"), at("x"), at("x") + 1, at("y")]) {
		const r = put(doc, line);
		assert.ok(r.lines.indexOf("> [!note] Title of the note") > r.lines.lastIndexOf("$$"), `line ${line}: after the closing $$`);
	}
});

test("[A] a `<pre>` block with a blank line in it places after `</pre>`", () => {
	const doc = FM + "> [!activity|a] A\n\n<pre>\none\n\ntwo\n</pre>\n\n> [!text|q] Q\n";
	const r = put(doc, idx(doc, "one"));
	assert.ok(r.lines.indexOf("> [!note] Title of the note") > r.lines.indexOf("</pre>"));
});

test("[A] a `%%` inside an inline code span is not a comment: the questions after it keep their settings and their place", () => {
	const doc = HELD.replace("> [!module|mood] Mood\n", "> [!module|mood] Mood\n\nRecords sit between `%%` marks.\n");
	const line = idx(doc, "[!choice|feeling]");
	assert.equal(settingsAt(doc, line).model.id, "feeling");
	assert.equal(scan(doc).holders.filter((h) => h.kind === "comment").length, 0, "no comment holder");
	const r = put(doc, line);
	const placed = idx(r.text, "> [!note] Title of the note");
	assert.ok(placed > line && placed < idx(r.text, "> [!records") - 1, "right after the question's own lines, above the records section");
	assert.ok(placed - line < 12, "close to the question, not at the end of the note");
});

test("[A] a `%%` with no closing mark hides nothing: the rest of the note is read, as the reader reads it", () => {
	const doc = FM + "> [!activity|a] A\n\nA lone mark 50%% here.\n\n> [!text|q] Q\n\n> [!text|r] R\n";
	assert.deepEqual(readerIds(doc), ["q", "r"], "the reader sees both");
	assert.equal(settingsAt(doc, idx(doc, "[!text|q]")).model.id, "q");
	assert.equal(settingsAt(doc, idx(doc, "[!text|r]")).model.id, "r");
	const r = put(doc, idx(doc, "[!text|q]"));
	assert.ok(landed(r) > idx(r.text, "[!text|q]") && landed(r) < idx(r.text, "[!text|r]"));
});

test("[B] a `> [!group]` written inside a code fence is code: the cursor there places the piece after the fence", () => {
	const doc = FM + "> [!activity|a] A\n\nA group looks like this:\n\n```md\n> [!group] Example\n> body one\n> body two\n```\n\nAfter.\n";
	for (const needle of ["> [!group] Example", "> body one", "> body two"]) {
		const r = put(doc, idx(doc, needle));
		const l = r.lines;
		assert.ok(l.indexOf("> [!note] Title of the note") > l.lastIndexOf("```"), `${needle}: after the fence`);
		assert.equal(l.slice(l.indexOf("```md"), l.lastIndexOf("```") + 1).join("\n"), "```md\n> [!group] Example\n> body one\n> body two\n```", "the fence is whole");
	}
});

test("[B] a `> [!group]` written inside a `%%` comment places the piece after the comment, not in its body", () => {
	const doc = FM + "> [!activity|a] A\n\n%%\n> [!group] G\n> one\n\n> two\n%%\n\nAfter.\n";
	for (const needle of ["> [!group] G", "> one", "> two"]) {
		const r = put(doc, idx(doc, needle));
		const l = r.lines;
		assert.ok(l.indexOf("> [!note] Title of the note") > l.lastIndexOf("%%"), `${needle}: after the closing mark`);
	}
	const inside = put(doc, idx(doc, "> one") + 1); // the blank line inside the comment
	assert.ok(inside.lines.indexOf("> [!note] Title of the note") > inside.lines.lastIndexOf("%%"), "the blank line inside it too");
});

test("[B] a real group still takes the piece inside it, one level deeper, and a group inside a fence does not confuse a real one", () => {
	const doc = FM + "> [!activity|a] A\n\n> [!group] Real\n> > [!text|q] Q\n>\n> > [!text|r] R\n\n```md\n> [!group] Example\n```\n";
	const r = put(doc, idx(doc, "> > [!text|q] Q"));
	const at = r.lines.indexOf("> > [!note] Title of the note");
	assert.ok(at > 0, "written one level in, with `> >`");
	assert.ok(at < r.lines.indexOf("> > [!text|r] R"));
});

test("[B] a comment written wholly inside a group's body is a holder of the group: the piece stays in the group", () => {
	const doc = FM + "> [!activity|a] A\n\n> [!group] Real\n> %%\n> hidden\n>\n> more\n> %%\n> > [!text|q] Q\n\nAfter.\n";
	const r = put(doc, idx(doc, "> hidden"));
	const l = r.lines;
	const at = l.findIndex((x) => x.includes("[!note] Title of the note"));
	assert.ok(at > l.indexOf("> %%", l.indexOf("> %%") + 1), "after the comment's closing mark");
	assert.match(l[at] ?? "", /^> > /, "still inside the group");
	assert.ok(at < l.indexOf("After."));
});

test("[A] a piece placed above a comment stops at the comment's first line, not inside it", () => {
	const doc = FM + "> [!activity|a] A\n\nA paragraph\n<!--\nhidden\n\nmore\n-->\n\n> [!text|q] Q\n";
	const r = put(doc, idx(doc, "A paragraph"));
	assert.ok(landed(r) < idx(r.text, "<!--"), "above the `<!--`");
});

test("[A] a single-line comment holds nothing: the line after it places and edits as before", () => {
	const doc = FM + "> [!activity|a] A\n\n<!-- a note to self -->\n> [!text|q] Q\n";
	assert.equal(scan(doc).holders.length, 0);
	assert.equal(settingsAt(doc, idx(doc, "[!text|q]")).model.id, "q");
});

test("[F] a code block that never closes is refused for a click inside it, with the reason, and nothing is written", () => {
	const doc = FM + "> [!activity|a] A\n\nText.\n\n```md\n> [!text|zz] X\n\nmore\n";
	const { UNCLOSED } = core;
	assert.match(UNCLOSED, /never closed/);
	for (const line of [idx(doc, "```md"), idx(doc, "[!text|zz]"), idx(doc, "more")]) {
		const plan = planInsert(doc, { line, ch: 0 }, NOTE.text);
		assert.equal(plan.refused, UNCLOSED, `line ${line}`);
		assert.equal(applyPlan(doc, plan), doc);
	}
	// a click above it still places, and stops above the open fence
	const above = put(doc, idx(doc, "Text."));
	assert.equal(above.plan.refused, undefined);
	assert.ok(above.lines.indexOf("> [!note] Title of the note") < above.lines.indexOf("```md"));
});

test("[F] a closed code block is not refused, and a code block never closed inside a group is refused too", () => {
	const closed = FM + "> [!activity|a] A\n\n```md\nx\n```\n\nAfter.\n";
	assert.equal(planInsert(closed, { line: idx(closed, "x"), ch: 0 }, NOTE.text).refused, undefined);
	const inGroup = FM + "> [!activity|a] A\n\n> [!group] G\n> ```md\n> open\n> more\n";
	assert.equal(planInsert(inGroup, { line: idx(inGroup, "> open"), ch: 0 }, NOTE.text).refused, core.UNCLOSED);
});

test("[G] the panel names what holds a line: a code block, a comment, a math block, preformatted text", () => {
	const at = (text, needle) => settingsAt(text, text.split("\n").findIndex((l) => l === needle));
	const wrap = (body) => FM + "> [!activity|a] A\n\n" + body + "\n\n> [!text|q] Q\n";
	const fence = at(wrap("```md\n> [!text|zz] X\n```"), "> [!text|zz] X");
	const comment = at(wrap("<!--\nold\n\n> [!text|zz] X\n-->"), "> [!text|zz] X");
	const percent = at(wrap("%%\nold\n\n> [!text|zz] X\n%%"), "> [!text|zz] X");
	const math = at(wrap("$$\nx\n\n> [!text|zz] X\n$$"), "> [!text|zz] X");
	const pre = at(wrap("<pre>\nx\n\n> [!text|zz] X\n</pre>"), "> [!text|zz] X");
	assert.deepEqual([fence, comment, percent, math, pre].map((v) => v.held), ["fence", "comment", "comment", "math", "pre"]);
	assert.match(fence.why, /inside a code block/);
	assert.match(comment.why, /inside a comment/);
	assert.match(percent.why, /inside a comment/);
	assert.match(math.why, /inside a math block/);
	assert.match(pre.why, /inside preformatted text/);
	// a mark closed on the line before the open one: the open one names the region
	const mixed = at(wrap("<!-- a --> $$\nx\n\n> [!text|zz] X\n$$"), "> [!text|zz] X");
	assert.equal(mixed.held, "math");
});
