/* Drafts and kept entries on made-up files: a repeating activity's draft, Finalize, and `repeat daily`. */
import test from "node:test";
import assert from "node:assert/strict";
import { assertOutsideUnchanged, core, lint, norm, pythonAvailable } from "./helpers.mjs";

const canLint = pythonAvailable();
const lintOk = (text) => {
	if (!canLint) return;
	const r = lint(text);
	assert.equal(r.status, 0, r.out);
};

const FM = '---\nbooklet: "0.15"\nid: test/drafts\ntitle: Drafts\nlang: en\n---\n';
const ACT = `${FM}
> [!activity|once] Answered once

> [!text|said] Said once

> [!activity|log repeat] A log

> [!choice|sky] The sky
- [ ] Clear
- [ ] Grey

> [!scale|busy] How busy

0. Calm
1. Some
2. Full

> [!lines|bits] Small things

> [!text|note] A note

> [!activity|day repeat daily] Each evening

> [!number|pages min:0] Pages read

> [!date|next] Next walk

> [!multi|tags open] Tags
- [ ] Home
- [ ] Out
`;
/** A fixed calendar, so the tests do not depend on the machine's time zone: the day is the ts's UTC date. */
const on = (today) => ({ today, dayOf: (ts) => String(ts).slice(0, 10) });
const DAY = on("2026-10-27");
const drafts = (t, act, scope = "") => norm(core.parseBooklet(t).records.drafts[scope]?.[act]);
const entries = (t, act, scope = "") => norm(core.parseBooklet(t).records.entries[scope]?.[act]) ?? [];
const blocksOf = (t, what) => core.parseBooklet(t).records.blocks.filter((b) => b.what === what);

test("a draft is one compact line, as the reference renderer writes it, and reads back", () => {
	let t = core.setDraftAnswer(ACT, "", "log", "sky", 2);
	t = core.setDraftAnswer(t, "", "log", "note", 'A "quoted" note');
	t = core.setDraftAnswer(t, "", "log", "bits", ["one", "two"]);
	assertOutsideUnchanged(ACT, t, "draft");
	assert.ok(t.endsWith(`\n%%\n${core.RECORDS_HEADER}\n\n\`\`\`booklet draft log\n{"sky":2,"note":"A \\"quoted\\" note","bits":["one","two"]}\n\`\`\`\n%%\n`), t.slice(ACT.length));
	assert.deepEqual(drafts(t, "log"), { sky: 2, note: 'A "quoted" note', bits: ["one", "two"] });
	lintOk(t);
	// a draft is not an answer: the activity answered once keeps its own block
	const both = core.setAnswer(t, "", "said", "once");
	assert.deepEqual(norm(core.parseBooklet(both).records.answers[""]), { said: "once" });
	assert.deepEqual(drafts(both, "log"), drafts(t, "log"));
});

test("clearing a draft answer removes it; clearing the last removes the block, and the file is as it was", () => {
	const base = core.setAnswer(ACT, "", "said", "kept");
	let t = core.setDraftAnswer(base, "", "log", "sky", 1);
	t = core.setDraftAnswer(t, "", "log", "busy", 0);
	const one = core.setDraftAnswer(t, "", "log", "sky", undefined);
	assert.deepEqual(drafts(one, "log"), { busy: 0 });
	assert.ok(one.includes('```booklet draft log\n{"busy":0}\n```'));
	const none = core.setDraftAnswer(one, "", "log", "busy", undefined);
	assert.equal(none, base, "a draft written and cleared leaves the file byte for byte as it was");
	// blank text and an empty list hold nothing: they clear
	assert.equal(core.setDraftAnswer(core.setDraftAnswer(base, "", "log", "note", "x"), "", "log", "note", "   "), base);
	assert.equal(core.setDraftAnswer(core.setDraftAnswer(base, "", "log", "bits", ["x"]), "", "log", "bits", []), base);
});

test("Finalize keeps the draft as an entry with a ts, to the second, and empties the draft", () => {
	let t = core.setDraftAnswer(ACT, "", "log", "sky", 2);
	t = core.setDraftAnswer(t, "", "log", "bits", ["one", "", "two", ""]);
	const f = core.finalizeDraft(t, "", "log", { ts: "2026-10-27T18:30:12.345Z" });
	assert.equal(f.replaced, false);
	assert.deepEqual(norm(f.entry), { ts: "2026-10-27T18:30:12Z", sky: 2, bits: ["one", "two"] }, "lines left blank are not kept");
	assert.deepEqual(blocksOf(f.text, "draft"), [], "the draft is gone");
	// the new entries block takes the draft block's place, one entry to a line
	assert.ok(f.text.endsWith(`${core.RECORDS_HEADER}\n\n\`\`\`booklet entries log\n{"items": [\n{"ts":"2026-10-27T18:30:12Z","sky":2,"bits":["one","two"]}\n]}\n\`\`\`\n%%\n`), f.text.slice(ACT.length));
	assertOutsideUnchanged(ACT, f.text, "finalize");
	lintOk(f.text);

	// a second entry goes after the first, in the block's layout; the first is untouched
	const t2 = core.setDraftAnswer(f.text, "", "log", "note", "later");
	assert.ok(t2.indexOf("```booklet entries log") < t2.indexOf("```booklet draft log"), "a new draft goes after the activity's entries");
	const g = core.finalizeDraft(t2, "", "log", { ts: "2026-10-27T19:00:00Z" });
	assert.ok(g.text.includes('{"items": [\n{"ts":"2026-10-27T18:30:12Z","sky":2,"bits":["one","two"]},\n{"ts":"2026-10-27T19:00:00Z","note":"later"}\n]}'));
	assert.deepEqual(entries(g.text, "log").map((e) => e.ts), ["2026-10-27T18:30:12Z", "2026-10-27T19:00:00Z"]);
	lintOk(g.text);
});

test("Finalize refuses an empty draft and an activity that does not repeat; a taken ts moves on by a second", () => {
	assert.throws(() => core.finalizeDraft(ACT, "", "log", { ts: "2026-10-27T10:00:00Z" }), /Nothing to keep yet/);
	assert.throws(() => core.finalizeDraft(ACT, "", "once", { ts: "2026-10-27T10:00:00Z" }), core.RecordsWriteError);
	assert.throws(() => core.finalizeDraft(ACT, "", "nope", { ts: "2026-10-27T10:00:00Z" }), core.RecordsWriteError);
	const a = core.finalizeDraft(core.setDraftAnswer(ACT, "", "log", "sky", 1), "", "log", { ts: "2026-10-27T10:00:00.100Z" });
	const b = core.finalizeDraft(core.setDraftAnswer(a.text, "", "log", "sky", 2), "", "log", { ts: "2026-10-27T10:00:00.900Z" });
	assert.equal(b.entry.ts, "2026-10-27T10:00:01Z", "two entries never share a ts");
});

test("entries written by hand in another layout keep every byte; the new one follows their separator", () => {
	const kept = '```booklet entries log\n{"items": [\n  {"ts": "2026-10-01T08:00:00Z", "sky": 1, "note": "spaced"},\n  {"ts": "2026-09-30T08:00:00Z", "sky": 2}\n]}\n```';
	const orig = `${ACT}\n%%\n${core.RECORDS_HEADER}\n\n${kept}\n%%\n`;
	const f = core.finalizeDraft(core.setDraftAnswer(orig, "", "log", "busy", 2), "", "log", { ts: "2026-10-27T09:00:00Z" });
	assert.ok(f.text.includes('{"items": [\n  {"ts": "2026-10-01T08:00:00Z", "sky": 1, "note": "spaced"},\n  {"ts": "2026-09-30T08:00:00Z", "sky": 2},\n  {"ts":"2026-10-27T09:00:00Z","busy":2}\n]}'), f.text);
	assert.deepEqual(entries(f.text, "log").map((e) => e.ts), ["2026-10-01T08:00:00Z", "2026-09-30T08:00:00Z", "2026-10-27T09:00:00Z"], "entries are never re-sorted");
	assertOutsideUnchanged(orig, f.text, "hand layout");
});

test("repeat daily: finishing again the same day replaces that day's entry where it stands", () => {
	const older = '```booklet entries day\n{"items": [\n{"ts": "2026-10-26T20:00:00Z", "pages": 3},\n{"ts": "2026-10-27T07:00:00Z", "pages": 1, "next": "2026-10-30"},\n{"ts": "2026-10-25T20:00:00Z", "pages": 9}\n]}\n```';
	const orig = `${ACT}\n%%\n${core.RECORDS_HEADER}\n\n${older}\n%%\n`;
	// the draft shows today's entry, so finishing again changes it rather than starting blank
	const shown = core.shownDraft(core.parseBooklet(orig), "", { id: "day", daily: true }, DAY);
	assert.deepEqual(norm(shown.values), { pages: 1, next: "2026-10-30" });
	assert.equal(shown.seededFrom.ts, "2026-10-27T07:00:00Z");
	assert.throws(() => core.finalizeDraft(orig, "", "day", { ts: "2026-10-27T21:00:00Z", rule: DAY }), /already kept/);
	// one change writes the shown entry's answers and the change into the draft
	const t = core.setDraftAnswer(orig, "", "day", "pages", 4, DAY);
	assert.deepEqual(drafts(t, "day"), { pages: 4, next: "2026-10-30" });
	const f = core.finalizeDraft(t, "", "day", { ts: "2026-10-27T21:00:00Z", rule: DAY });
	assert.equal(f.replaced, true);
	assert.ok(
		f.text.includes('{"items": [\n{"ts": "2026-10-26T20:00:00Z", "pages": 3},\n{"ts":"2026-10-27T21:00:00Z","pages":4,"next":"2026-10-30"},\n{"ts": "2026-10-25T20:00:00Z", "pages": 9}\n]}'),
		f.text.slice(ACT.length),
	);
	assert.deepEqual(blocksOf(f.text, "draft"), []);
	assertOutsideUnchanged(orig, f.text, "daily replace");
	lintOk(f.text);
	// twice more the same day: still one entry for the day
	const g = core.finalizeDraft(core.setDraftAnswer(f.text, "", "day", "tags", [2, "Garden"], DAY), "", "day", { ts: "2026-10-27T22:00:00Z", rule: DAY });
	assert.equal(entries(g.text, "day").filter((e) => e.ts.startsWith("2026-10-27")).length, 1);
	assert.deepEqual(entries(g.text, "day").find((e) => e.ts.startsWith("2026-10-27")), { ts: "2026-10-27T22:00:00Z", pages: 4, next: "2026-10-30", tags: [2, "Garden"] });
	// the next day is a new entry, and its draft starts blank
	const next = on("2026-10-28");
	assert.deepEqual(norm(core.shownDraft(core.parseBooklet(g.text), "", { id: "day", daily: true }, next).values), {});
	const h = core.finalizeDraft(core.setDraftAnswer(g.text, "", "day", "pages", 2, next), "", "day", { ts: "2026-10-28T20:00:00Z", rule: next });
	assert.equal(h.replaced, false);
	assert.equal(entries(h.text, "day").length, 4);
});

test("repeat daily: the same entry repeated in a later block (same ts) is replaced once, not left behind", () => {
	const a = '```booklet entries day\n{"items": [\n{"ts": "2026-10-27T07:00:00Z", "pages": 1}\n]}\n```';
	const b = '```booklet entries day\n{"items": [\n{"ts": "2026-10-20T07:00:00Z", "pages": 5},\n{"ts": "2026-10-27T07:00:00Z", "next": "2026-11-02"}\n]}\n```';
	const orig = `${ACT}\n%%\n${core.RECORDS_HEADER}\n\n${a}\n\n${b}\n%%\n`;
	assert.deepEqual(entries(orig, "day").find((e) => e.ts === "2026-10-27T07:00:00Z"), { ts: "2026-10-27T07:00:00Z", pages: 1, next: "2026-11-02" }, "merged by ts");
	const f = core.finalizeDraft(core.setDraftAnswer(orig, "", "day", "pages", 6, DAY), "", "day", { ts: "2026-10-27T21:00:00Z", rule: DAY });
	assert.deepEqual(entries(f.text, "day").map((e) => e.ts), ["2026-10-27T21:00:00Z", "2026-10-20T07:00:00Z"]);
	assert.ok(f.text.includes('{"items": [\n{"ts": "2026-10-20T07:00:00Z", "pages": 5}\n]}'), "the later block keeps its other entry exactly");
	lintOk(f.text);
});

test("a module's draft and entries sit under the module's records line", () => {
	const mod = `${FM}
> [!activity|bare] Bare

> [!text|a] A

> [!module|walks] Walks

> [!activity|walk-log repeat] Walk log

> [!text|where] Where

> [!module|walks end] End of Walks
`;
	const t = core.setDraftAnswer(core.setAnswer(mod, "", "a", "bare one"), "walks", "walk-log", "where", "The hill");
	assert.match(t, /\n> \[!records\|walks\] Walks\n\n```booklet draft walk-log\n\{"where":"The hill"\}\n```\n%%\n$/);
	const f = core.finalizeDraft(t, "walks", "walk-log", { ts: "2026-10-27T12:00:00Z" });
	assert.match(f.text, /\n> \[!records\|walks\] Walks\n\n```booklet entries walk-log\n\{"items": \[\n\{"ts":"2026-10-27T12:00:00Z","where":"The hill"\}\n\]\}\n```\n%%\n$/);
	assert.deepEqual(norm(core.parseBooklet(f.text).records.answers[""]), { a: "bare one" });
	lintOk(f.text);
});

test("a CRLF file keeps CRLF through drafts and Finalize", () => {
	const crlf = ACT.replace(/\n/g, "\r\n");
	const t = core.setDraftAnswer(crlf, "", "log", "sky", 1);
	const f = core.finalizeDraft(core.setDraftAnswer(t, "", "log", "note", "x"), "", "log", { ts: "2026-10-27T12:00:00Z" });
	for (const x of [t, f.text]) assert.ok(!/[^\r]\n/.test(x), "every line ends with CRLF");
	assertOutsideUnchanged(crlf, f.text, "crlf finalize");
	assert.deepEqual(entries(f.text, "log"), [{ ts: "2026-10-27T12:00:00Z", sky: 1, note: "x" }]);
});

test("a draft block that cannot be read is kept as written; the draft is written after it", () => {
	const broken = '```booklet draft log\n{"sky": 1,}\n```';
	const orig = `${ACT}\n%%\n${core.RECORDS_HEADER}\n\n${broken}\n%%\n`;
	const t = core.setDraftAnswer(orig, "", "log", "sky", 2);
	assert.ok(t.includes(`\n${broken}\n`));
	assert.deepEqual(drafts(t, "log"), { sky: 2 });
	const f = core.finalizeDraft(t, "", "log", { ts: "2026-10-27T12:00:00Z" });
	assert.ok(f.text.includes(`\n${broken}\n`), "the unreadable block is never removed");
	assert.deepEqual(entries(f.text, "log"), [{ ts: "2026-10-27T12:00:00Z", sky: 2 }]);
});

test("answers inside a block written by hand: only the one answer changes, the rest keep their bytes", () => {
	const hand = '```booklet answers\n{ "said": "How the range changes", "biggest": 2, "clarity": 3 }\n```';
	const orig = `${ACT}\n%%\n${core.RECORDS_HEADER}\n\n${hand}\n%%\n`;
	const t = core.setAnswer(orig, "", "biggest", 1);
	assert.ok(t.includes('```booklet answers\n{ "said": "How the range changes", "biggest": 1, "clarity": 3 }\n```'), t);
	const add = core.setAnswer(t, "", "extra", [2, "own"]);
	assert.ok(add.includes('{ "said": "How the range changes", "biggest": 1, "clarity": 3, "extra": [2, "own"] }'), add);
	const first = core.setAnswer(add, "", "said", undefined);
	assert.ok(first.includes('{ "biggest": 1, "clarity": 3, "extra": [2, "own"] }'), first);
	const mid = core.setAnswer(add, "", "clarity", undefined);
	assert.ok(mid.includes('{ "said": "How the range changes", "biggest": 1, "extra": [2, "own"] }'), mid);
	// the renderer's own layout, JSON.stringify(answers, null, 1): a new list is laid out the same way
	const r = `${ACT}\n%%\n${core.RECORDS_HEADER}\n\n\`\`\`booklet answers\n${JSON.stringify({ said: "x", n: 1 }, null, 1)}\n\`\`\`\n%%\n`;
	const r2 = core.setAnswer(r, "", "bits", ["a", "b"]);
	assert.ok(r2.includes("```booklet answers\n" + JSON.stringify({ said: "x", n: 1, bits: ["a", "b"] }, null, 1) + "\n```"), r2);
	// a tab-indented block keeps its tabs
	const tabbed = `${ACT}\n%%\n${core.RECORDS_HEADER}\n\n\`\`\`booklet answers\n{\n\t"said": "x",\n\t"n": 1\n}\n\`\`\`\n%%\n`;
	assert.ok(core.setAnswer(tabbed, "", "n", 5).includes('{\n\t"said": "x",\n\t"n": 5\n}'));
	assert.ok(core.setAnswer(tabbed, "", "m", 6).includes('{\n\t"said": "x",\n\t"n": 1,\n\t"m": 6\n}'));
});

test("a number is written as it reads back: 0, decimals and negatives; nothing is rounded", () => {
	let t = core.setDraftAnswer(ACT, "", "day", "pages", 0);
	assert.deepEqual(drafts(t, "day"), { pages: 0 }, "0 is an answer");
	t = core.setDraftAnswer(t, "", "day", "pages", 2.75);
	assert.deepEqual(drafts(t, "day"), { pages: 2.75 });
	t = core.setDraftAnswer(t, "", "day", "pages", -3);
	assert.deepEqual(drafts(t, "day"), { pages: -3 });
	assert.throws(() => core.setDraftAnswer(t, "", "day", "pages", Number.NaN), core.RecordsWriteError);
});
