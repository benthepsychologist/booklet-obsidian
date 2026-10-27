/* The reader: markers, modules and scopes, the seven common question kinds, and what it records as not supported. */
import test from "node:test";
import assert from "node:assert/strict";
import { core, corpusDirs, corpusFiles, norm, read } from "./helpers.mjs";

const fm = (marker) => `---\n${marker}\nid: test/r\ntitle: R\nlang: en\n---\n`;

test("the marker: none, or not 0.x, is refused; another 0.x opens with the notice first; unquoted is read as text", () => {
	const body = "\n> [!activity|a] A\n\n> [!text|t] T\n";
	assert.equal(core.parseBooklet(`---\ntitle: R\n---\n${body}`).ok, false);
	assert.equal(core.parseBooklet(body).ok, false);
	for (const m of ['booklet: "1.0"', "booklet: 2", "booklet: words", 'booklet: "0.15.1"'])
		assert.equal(core.parseBooklet(fm(m) + body).ok, false, m);
	const old = core.parseBooklet(fm('booklet: "0.9"') + body);
	assert.equal(old.ok, true);
	assert.match(old.problems[0], /^This file says booklet: 0\.9\. This view reads format 0\.15/);
	assert.equal(core.parseBooklet(fm("booklet: 0.15") + body).problems.length, 0);
	assert.equal(core.parseBooklet(fm("booklet: '0.15'") + body).ok, true);
	assert.equal(core.parseBooklet(fm('booklet: "0.10"') + body).ok, true, "0.10 is a 0.x version, not 0.1");
});

test("activities, modules and scopes; question kinds with their options, replies and anchors", () => {
	const text = `${fm('booklet: "0.15"')}
> [!activity|bare] Bare one
> A status line, drawn nowhere else

Some prose with **bold**.

> [!choice|pick] Which one?
> Help for the choice.
- [ ] First
  - a reply, which is not an option
- [x] Second, marked correct

> [!scale|how] How much?

0. None
1. Some
2. Lots

> [!text|say long] Say it

> [!module|m] Module M

Opening prose of M, not drawn.

> [!activity|in-m repeat] In M

> [!scale|s] Starts at one
1. One
2. Two

> [!module|m end] End of M
`;
	const b = core.parseBooklet(text);
	assert.ok(b.ok, b.refusal);
	assert.deepEqual(b.modules.map((m) => [m.id, m.title]), [["m", "Module M"]]);
	assert.deepEqual(b.activities.map((a) => [a.id, a.scope, a.repeat]), [["bare", "", false], ["in-m", "m", true]]);
	const segs = b.activities[0].segments;
	assert.equal(segs[0].type, "prose");
	assert.equal(segs[0].markdown, "Some prose with **bold**.");
	const [choice, scale, text1] = segs.filter((s) => s.type === "question");
	assert.equal(choice.kind, "choice");
	assert.equal(choice.help, "Help for the choice.");
	assert.deepEqual(norm(choice.options), [
		{ text: "First", correct: false, reply: ["a reply, which is not an option"] },
		{ text: "Second, marked correct", correct: true, reply: [] },
	]);
	assert.deepEqual(scale.anchors.map((a) => a.n), [0, 1, 2]);
	assert.equal(text1.long, true);
	assert.deepEqual(b.activities[1].segments.find((s) => s.type === "question").anchors.map((a) => a.n), [1, 2]);
	assert.ok(!JSON.stringify(b.activities).includes("status line"), "an activity's status line is not prose");
	assert.ok(!JSON.stringify(b.activities).includes("Opening prose of M"), "a module's opening is not an activity's");
});

test("the seven common kinds are questions; every other kind is recorded, with its title, as not yet supported; reading callouts stay prose", () => {
	const text = `${fm('booklet: "0.15"')}
> [!activity|a] A

> [!multi|m open] Pick any
- [ ] One
- [ ] Two

> [!number|n min:0 max:10 step:0.5] A number

> [!date|d] A date

> [!lines|l] Some lines

> [!widget|w] A widget
> ![[#^data]]

> [!mystery|z] A kind nobody defined

> [!matrix|grid] A grid
- Row one
- Row two

1. Low
2. High

> [!menu|places] Places
- Home
- Away

> [!multi|from-menu menu:places] From a menu

> [!tip] A tip
> Shown as Obsidian shows a callout.

> [!tab|t] A tab

\`\`\`booklet query
from: a
\`\`\`
`;
	const b = core.parseBooklet(text);
	const segs = b.activities[0].segments;
	const qs = segs.filter((s) => s.type === "question");
	assert.deepEqual(qs.map((q) => [q.kind, q.id]), [["multi", "m"], ["number", "n"], ["date", "d"], ["lines", "l"]]);
	assert.equal(qs[0].open, true);
	assert.deepEqual([qs[1].min, qs[1].max, qs[1].step], [0, 10, 0.5]);
	const un = segs.filter((s) => s.type === "unsupported").map((s) => s.kind);
	for (const k of ["widget", "mystery", "matrix", "menu-list", "query"]) assert.ok(un.includes(k), `${k} is recorded as not supported: ${un.join(", ")}`);
	assert.ok(segs.some((s) => s.type === "unsupported" && s.kind === "widget" && s.title === "A widget"));
	assert.ok(segs.some((s) => s.type === "prose" && s.markdown.startsWith("> [!tip] A tip")));
	assert.ok(segs.some((s) => s.type === "tab" && s.title === "A tab"));
	assert.ok(b.problems.some((p) => /"mystery" is not a kind/.test(p)));
	assert.ok(!segs.some((s) => s.type === "prose" && /- \[ \] One/.test(s.markdown)), "a multi's options are its own, not prose");
	assert.deepEqual([...core.COMMON_KINDS], ["choice", "multi", "scale", "text", "lines", "number", "date"]);
});

test("repeat and daily: daily needs repeat; a repeating activity with no id is said", () => {
	const head = fm('booklet: "0.15"');
	const b = core.parseBooklet(`${head}\n> [!activity|log repeat daily] Log\n\n> [!text|q] Q\n\n> [!activity|other daily] Other\n\n> [!text|r] R\n`);
	assert.deepEqual(b.activities.map((a) => [a.id, a.repeat, a.daily]), [["log", true, true], ["other", false, false]]);
	assert.ok(b.problems.some((p) => /`daily` needs `repeat`/.test(p)), b.problems.join("; "));
});

test("a question inside a group is not drawn as a question yet; the group's words stay", () => {
	const b = core.parseBooklet(`${fm('booklet: "0.15"')}\n> [!activity|a] A\n\n> [!group] A group\n> > [!text|inside] Inside\n\n> [!text|outside] Outside\n`);
	const segs = b.activities[0].segments;
	assert.deepEqual(segs.filter((s) => s.type === "question").map((q) => q.id), ["outside"]);
	assert.ok(segs.some((s) => s.type === "unsupported" && s.kind === "group"), JSON.stringify(segs.map((s) => s.type + ":" + (s.kind ?? ""))));
});

test("refused: a module opened and not closed, closed and not opened, overlapping; an id used twice in a module", () => {
	const head = fm('booklet: "0.15"');
	assert.equal(core.parseBooklet(`${head}\n> [!module|m] M\n\n> [!activity|a] A\n`).ok, false);
	assert.equal(core.parseBooklet(`${head}\n> [!activity|a] A\n\n> [!module|m end] End\n`).ok, false);
	assert.equal(core.parseBooklet(`${head}\n> [!module|m] M\n\n> [!module|n] N\n\n> [!module|n end] E\n\n> [!module|m end] E\n`).ok, false);
	assert.equal(core.parseBooklet(`${head}\n> [!activity|a] A\n\n> [!text|q] Q\n\n> [!text|q] Q again\n`).ok, false);
	// the same id in two modules is fine
	const two = `${head}\n> [!module|m] M\n\n> [!activity|a] A\n\n> [!text|q] Q\n\n> [!module|m end] E\n\n> [!module|n] N\n\n> [!activity|a] A\n\n> [!text|q] Q\n\n> [!module|n end] E\n`;
	assert.equal(core.parseBooklet(two).ok, true);
});

test("records: blocks for one scope merge in file order, the later wins; a records line names its module", () => {
	const text = `${fm('booklet: "0.15"')}
> [!activity|a] A

> [!module|m] M

> [!activity|b] B

> [!module|m end] E

%%
> [!records] App record — do not edit below this line

\`\`\`booklet answers
{"x": 1, "y": 1}
\`\`\`

> [!records|m] M

\`\`\`booklet answers
{"x": "in m"}
\`\`\`

> [!records] App record

\`\`\`booklet answers
{"y": 2}
\`\`\`
%%
`;
	const r = core.parseBooklet(text).records;
	assert.deepEqual(norm(r.answers), { "": { x: 1, y: 2 }, m: { x: "in m" } });
	assert.deepEqual(r.recordsLines.map((l) => l.scope), ["", "m", ""]);
});

test("the reader never throws on the examples, the kit starters or the test vault", () => {
	const files = corpusFiles();
	const external = corpusDirs().filter((d) => d.external && d.present).length;
	assert.ok(files.length >= (external ? 8 : 2), `found only ${files.length} files`);
	for (const f of files) {
		const b = core.parseBooklet(read(f));
		assert.ok(b.ok, `${f}: ${b.refusal}`);
		assert.ok(b.activities.length > 0, f);
	}
});

test("designText leaves out exactly the records region", () => {
	const t = `${fm('booklet: "0.15"')}\n> [!activity|a] A\n\n> [!text|q] Q\n`;
	const w = core.setAnswer(t, "", "q", "x");
	assert.equal(core.designText(w), t + "\n");
	assert.equal(core.designText(core.setAnswer(w, "", "q", "y")), core.designText(w));
});
