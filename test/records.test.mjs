/* The records writer on made-up files, one case at a time. */
import test from "node:test";
import assert from "node:assert/strict";
import { assertOutsideUnchanged, core, lint, norm, pythonAvailable } from "./helpers.mjs";

const canLint = pythonAvailable();
const FM = '---\nbooklet: "0.15"\nid: test/synthetic\ntitle: Synthetic\nlang: en\n---\n';
const BODY = `${FM}
> [!activity|act] An activity

> [!text|a] First

> [!text|b] Second

> [!text|c] Third
`;
const MOD = `${FM}
> [!activity|act] An activity

> [!text|a] First

> [!module|m] A module

> [!activity|inner] Inside

> [!text|q] Question in the module

> [!module|m end] End of A module
`;
const answers = (text, scope = "") => norm(core.parseBooklet(text).records.answers[scope]) ?? {};
const lintOk = (text) => {
	if (!canLint) return;
	const r = lint(text);
	assert.equal(r.status, 0, r.out);
};

test("no region at all: one is added after the body, which is left exactly as it is", () => {
	const next = core.setAnswer(BODY, "", "a", "hello");
	assertOutsideUnchanged(BODY, next, "no region");
	assert.equal(next, `${BODY}\n%%\n${core.RECORDS_HEADER}\n\n\`\`\`booklet answers\n{\n "a": "hello"\n}\n\`\`\`\n%%\n`);
	assert.deepEqual(answers(next), { a: "hello" });
	lintOk(next);
});

test("no region, and the body ends in blank lines and spaces: nothing is stripped", () => {
	const body = `${BODY}\n   \n\n`;
	const next = core.setAnswer(body, "", "a", "x");
	assert.ok(next.startsWith(body));
	assert.equal(next.slice(body.length, body.length + 3), "%%\n");
	lintOk(next);
});

test("a file with no trailing newline", () => {
	const body = BODY.replace(/\n$/, "");
	const next = core.setAnswer(body, "", "a", "x");
	assertOutsideUnchanged(body, next, "no trailing newline");
	assert.equal(next.slice(body.length, body.length + 4), "\n\n%%");
	lintOk(next);
	// a region whose closing %% is the file's last line, with no newline after it: still none after the write
	const closed = `${BODY}\n%%\n${core.RECORDS_HEADER}\n\n\`\`\`booklet answers\n{"a": "x"}\n\`\`\`\n%%`;
	const again = core.setAnswer(closed, "", "b", "y");
	assertOutsideUnchanged(closed, again, "region at the very end");
	assert.ok(again.endsWith("\n%%"));
	assert.deepEqual(answers(again), { a: "x", b: "y" });
	const m = core.setAnswer(`${MOD}\n%%\n${core.RECORDS_HEADER}\n%%`, "m", "q", 1);
	assert.ok(m.endsWith("```\n%%"), JSON.stringify(m.slice(-40)));
	assert.deepEqual(answers(m, "m"), { q: 1 });
});

test("a region with no %% before its records line", () => {
	const orig = `${BODY}\n${core.RECORDS_HEADER}\n\n\`\`\`booklet answers\n{"a": "old"}\n\`\`\`\n`;
	assert.equal(outsideCount(orig), 1);
	const next = core.setAnswer(orig, "", "b", "new");
	assertOutsideUnchanged(orig, next, "no opening %%");
	assert.deepEqual(answers(next), { a: "old", b: "new" });
	// the bare scope's line is the region's first line: a module's records go after it
	const mod = core.setAnswer(`${MOD}\n${core.RECORDS_HEADER}\n`, "m", "q", 2);
	assertOutsideUnchanged(`${MOD}\n${core.RECORDS_HEADER}\n`, mod, "module under a region with no %%");
	assert.deepEqual(answers(mod, "m"), { q: 2 });
});

const outsideCount = (t) => core.parseBooklet(t).records.regions.length;

test("a region with no closing %%: it runs to the end of the file", () => {
	const orig = `${MOD}\n%%\n${core.RECORDS_HEADER}\n\n\`\`\`booklet answers\n{"a": "kept"}\n\`\`\`\n`;
	const r = core.parseBooklet(orig).records.regions[0];
	assert.equal(r.closed, false);
	const next = core.setAnswer(orig, "", "a", "changed");
	assertOutsideUnchanged(orig, next, "unclosed");
	assert.deepEqual(answers(next), { a: "changed" });
	const mod = core.setAnswer(orig, "m", "q", 3);
	assertOutsideUnchanged(orig, mod, "unclosed, module scope");
	assert.match(mod, /\n> \[!records\|m\] A module\n\n```booklet answers\n\{\n "q": 3\n\}\n```\n$/);
	assert.deepEqual(answers(mod, "m"), { q: 3 });
});

test("design text after the closing %% is left where it is", () => {
	const orig = `${BODY}\n%%\n${core.RECORDS_HEADER}\n\n\`\`\`booklet answers\n{"a": "x"}\n\`\`\`\n%%\n\nSome design text after the records, kept.\n\n> [!activity|late] A late activity\n`;
	const next = core.setAnswer(orig, "", "b", "y");
	assertOutsideUnchanged(orig, next, "text after");
	assert.ok(next.endsWith("%%\n\nSome design text after the records, kept.\n\n> [!activity|late] A late activity\n"));
	const book = core.parseBooklet(next);
	assert.ok(book.problems.some((p) => /after the records section/.test(p)));
	assert.deepEqual(answers(next), { a: "x", b: "y" });
});

test("two answers blocks in one scope: later wins on read, a set lands in the last, a clear removes from both", () => {
	const orig = `${BODY}\n%%\n${core.RECORDS_HEADER}\n\n\`\`\`booklet answers\n{"a": "first", "b": "only here"}\n\`\`\`\n\n\`\`\`booklet answers\n{"a": "second"}\n\`\`\`\n%%\n`;
	assert.deepEqual(answers(orig), { a: "second", b: "only here" });
	const set = core.setAnswer(orig, "", "c", "new");
	const blocks = core.parseBooklet(set).records.blocks.filter((b) => b.what === "answers");
	assert.deepEqual(norm(blocks[0].value), { a: "first", b: "only here" });
	assert.equal(blocks[0].raw, '```booklet answers\n{"a": "first", "b": "only here"}\n```', "the first block is untouched, spacing and all");
	assert.deepEqual(norm(blocks[1].value), { a: "second", c: "new" });
	const a = core.setAnswer(set, "", "a", "third");
	assert.deepEqual(answers(a), { a: "third", b: "only here", c: "new" });
	const cleared = core.setAnswer(a, "", "a", undefined);
	assertOutsideUnchanged(orig, cleared, "clear from both");
	assert.deepEqual(answers(cleared), { b: "only here", c: "new" });
	for (const b of core.parseBooklet(cleared).records.blocks) assert.ok(!("a" in (b.value ?? {})));
	const b = core.setAnswer(cleared, "", "b", undefined);
	assert.deepEqual(answers(b), { c: "new" });
	lintOk(b);
});

test("an unparseable answers block is kept exactly as written and never written into", () => {
	const broken = '```booklet answers\n{"a": "x",}\n```';
	const orig = `${BODY}\n%%\n${core.RECORDS_HEADER}\n\n${broken}\n%%\n`;
	const book = core.parseBooklet(orig);
	assert.ok(book.problems.some((p) => /could not be read/.test(p)));
	const next = core.setAnswer(orig, "", "b", "y");
	assertOutsideUnchanged(orig, next, "broken block");
	assert.ok(next.includes(`\n${broken}\n`), "the broken block is still there, byte for byte");
	assert.deepEqual(answers(next), { b: "y" });
	assert.ok(next.indexOf(broken) < next.indexOf('"b": "y"'), "the new block comes after it");
	// with a good block before the broken one, the set goes into the good one
	const two = `${BODY}\n%%\n${core.RECORDS_HEADER}\n\n\`\`\`booklet answers\n{"a": "ok"}\n\`\`\`\n\n${broken}\n%%\n`;
	const t = core.setAnswer(two, "", "c", "z");
	assert.ok(t.includes(`\n${broken}\n`));
	assert.deepEqual(answers(t), { a: "ok", c: "z" });
	assert.equal(core.setAnswer(t, "", "a", undefined).includes(broken), true);
});

test("a module scope with no records line yet: the line is made, before the closing %%", () => {
	const orig = `${MOD}\n%%\n${core.RECORDS_HEADER}\n\n\`\`\`booklet answers\n{"a": "bare"}\n\`\`\`\n%%\n`;
	const next = core.setAnswer(orig, "m", "q", 2);
	assertOutsideUnchanged(orig, next, "module line");
	assert.match(next, /```\n\n> \[!records\|m\] A module\n\n```booklet answers\n\{\n "q": 2\n\}\n```\n%%\n$/);
	assert.deepEqual(answers(next), { a: "bare" });
	assert.deepEqual(answers(next, "m"), { q: 2 });
	lintOk(next);
	// and the bare scope, when the region holds only a module's records, goes first under a plain line
	const onlyMod = `${MOD}\n%%\n> [!records|m] A module\n\n\`\`\`booklet answers\n{"q": 1}\n\`\`\`\n%%\n`;
	const bare = core.setAnswer(onlyMod, "", "a", "x");
	assertOutsideUnchanged(onlyMod, bare, "bare scope first");
	assert.match(bare, /\n%%\n> \[!records\] App record — do not edit below this line\n\n```booklet answers\n\{\n "a": "x"\n\}\n```\n\n> \[!records\|m\] A module\n/);
	assert.deepEqual(answers(bare), { a: "x" });
	assert.deepEqual(answers(bare, "m"), { q: 1 });
	lintOk(bare);
});

test("records under a line naming no module are kept and not read; other blocks are left alone", () => {
	const orig = `${BODY}\n%%\n${core.RECORDS_HEADER}\n\n> [!records|gone] A module this file no longer has\n\n\`\`\`booklet answers\n{"a": "foreign"}\n\`\`\`\n\n\`\`\`booklet draft act\n{"a": "half typ"}\n\`\`\`\n%%\n`;
	assert.deepEqual(answers(orig), {});
	const next = core.setAnswer(orig, "", "a", "mine");
	assertOutsideUnchanged(orig, next, "foreign");
	assert.ok(next.includes('```booklet answers\n{"a": "foreign"}\n```'));
	assert.ok(next.includes('```booklet draft act\n{"a": "half typ"}\n```'));
	assert.deepEqual(answers(next), { a: "mine" });
	assert.ok(next.indexOf('"a": "mine"') < next.indexOf("[!records|gone]"), "the bare answer goes under the plain line, before the other line");
});

test("setting the value already there changes nothing; clearing what is not there changes nothing", () => {
	const once = core.setAnswer(BODY, "", "a", "same");
	assert.equal(core.setAnswer(once, "", "a", "same"), once);
	assert.equal(core.setAnswer(once, "", "b", undefined), once);
	assert.equal(core.setAnswer(BODY, "", "a", undefined), BODY);
});

test("an answers block is written in the reference renderer's shape, JSON.stringify(answers, null, 1)", () => {
	const v = { a: 'say "hi"\nthen go', b: 2, c: 0 };
	let t = BODY;
	for (const [k, x] of Object.entries(v)) t = core.setAnswer(t, "", k, x);
	assert.ok(t.includes("```booklet answers\n" + JSON.stringify(v, null, 1) + "\n```"));
});

test("a CRLF file keeps CRLF in what is added", () => {
	const crlf = BODY.replace(/\n/g, "\r\n");
	const next = core.setAnswer(crlf, "", "a", "x");
	assertOutsideUnchanged(crlf, next, "crlf");
	assert.ok(!/[^\r]\n/.test(next), "every line ends with CRLF");
	assert.deepEqual(answers(next), { a: "x" });
	const again = core.setAnswer(next, "", "b", "y");
	assert.ok(!/[^\r]\n/.test(again));
	assertOutsideUnchanged(crlf, again, "crlf again");
});

test("a %% or an answers block inside a design code fence is not a records region", () => {
	const inFence = `${BODY}\n\`\`\`\`text\n%%\n> [!records] Not records\n\`\`\`booklet answers\n{"a": "in a fence"}\n\`\`\`\n%%\n\`\`\`\`\n`;
	assert.equal(core.parseBooklet(inFence).records.regions.length, 0);
	assert.deepEqual(answers(inFence), {});
	const fenced = `${BODY}\n\`\`\`\`text\n%%\n> [!records] Not records\n\`\`\`\`\n`;
	assert.equal(core.parseBooklet(fenced).records.regions.length, 0);
	const next = core.setAnswer(fenced, "", "a", "x");
	assertOutsideUnchanged(fenced, next, "fenced %%");
	assert.deepEqual(answers(next), { a: "x" });
});

test("what cannot be written is refused, not guessed", () => {
	const open = `${BODY}\n\`\`\`text\nnever closed\n`;
	assert.throws(() => core.setAnswer(open, "", "a", "x"), core.RecordsWriteError);
	assert.throws(() => core.setAnswer(BODY, "nope", "a", "x"), core.RecordsWriteError);
	assert.throws(() => core.setAnswer(BODY, "", "not an id", "x"), core.RecordsWriteError);
	assert.throws(() => core.setAnswer(BODY, "", "a", { no: 1 }), core.RecordsWriteError);
});

test("two records regions (two files pasted together): read as one, and only regions change", () => {
	const orig = `${MOD}\n%%\n${core.RECORDS_HEADER}\n\n\`\`\`booklet answers\n{"a": "one"}\n\`\`\`\n%%\n\nBetween the two.\n\n%%\n> [!records|m] A module\n\n\`\`\`booklet answers\n{"q": 1}\n\`\`\`\n%%\n`;
	const book = core.parseBooklet(orig);
	assert.equal(book.records.regions.length, 2);
	assert.deepEqual(norm(book.records.answers), { "": { a: "one" }, m: { q: 1 } });
	const next = core.setAnswer(core.setAnswer(orig, "m", "q", 2), "", "a", "two");
	assertOutsideUnchanged(orig, next, "two regions");
	assert.deepEqual(norm(core.parseBooklet(next).records.answers), { "": { a: "two" }, m: { q: 2 } });
});
