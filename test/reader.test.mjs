/* The reader: markers, modules and scopes, the seven common question kinds, and what it records as not supported. */
import test from "node:test";
import assert from "node:assert/strict";
import { core, corpusDirs, corpusFiles, norm, read } from "./helpers.mjs";

const fm = (marker) => `---\n${marker}\nid: test/r\ntitle: R\nlang: en\n---\n`;

test("the marker: none, or not 0.x, is refused; another 0.x opens with the notice first; unquoted is read as text", () => {
	const body = "\n> [!activity|a] A\n\n> [!text|t] T\n";
	assert.equal(core.parseBooklet(`---\ntitle: R\n---\n${body}`).ok, false);
	assert.equal(core.parseBooklet(body).ok, false);
	for (const m of ['booklet: "1.0"', "booklet: 2", "booklet: words", 'booklet: "0.16.1"'])
		assert.equal(core.parseBooklet(fm(m) + body).ok, false, m);
	assert.equal(core.FORMAT_VERSION, "0.16");
	const old = core.parseBooklet(fm('booklet: "0.9"') + body);
	assert.equal(old.ok, true);
	assert.match(old.problems[0], /^This file says booklet: 0\.9\. This view reads format 0\.16/);
	// a note of the format before this one opens as it is, with the notice first among its problems (SPEC section 2)
	for (const m of ['booklet: "0.15"', "booklet: 0.15", "booklet: '0.15'"]) {
		const prev = core.parseBooklet(fm(m) + body);
		assert.equal(prev.ok, true, m);
		assert.equal(prev.problems[0], "This file says booklet: 0.15. This view reads format 0.16 and has opened it as it is; some of it may not draw.", m);
		assert.equal(prev.activities[0].segments.filter((s) => s.type === "question").length, 1, `${m}: its question is read`);
	}
	// a later 0.x opens the same way
	assert.match(core.parseBooklet(fm('booklet: "0.17"') + body).problems[0], /^This file says booklet: 0\.17\. This view reads format 0\.16 and has opened it as it is/);
	assert.equal(core.parseBooklet(fm("booklet: 0.16") + body).problems.length, 0);
	assert.equal(core.parseBooklet(fm("booklet: '0.16'") + body).problems.length, 0);
	assert.equal(core.parseBooklet(fm('booklet: "0.10"') + body).ok, true, "0.10 is a 0.x version, not 0.1");
});

test("activities, modules and scopes; question kinds with their options, replies and anchors", () => {
	const text = `${fm('booklet: "0.16"')}
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
	assert.deepEqual(norm(b.openings), [{ module: "m", title: "Module M", markdown: "Opening prose of M, not drawn.", line: 29 }]);
});

test("the seven common kinds are questions; every other kind is recorded, with its title, as not yet supported; reading callouts stay prose", () => {
	const text = `${fm('booklet: "0.16"')}
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
	assert.deepEqual(qs.map((q) => [q.kind, q.id]), [["multi", "m"], ["number", "n"], ["date", "d"], ["lines", "l"], ["widget", "w"], ["multi", "from-menu"]]);
	assert.equal(qs[0].open, true);
	assert.deepEqual([qs[1].min, qs[1].max, qs[1].step], [0, 10, 0.5]);
	// a widget whose block the file does not carry is still a question: the view says what is missing
	assert.deepEqual([qs[4].embed, qs[4].widget, qs[4].help], ["data", null, ""]);
	assert.deepEqual(qs[5].options.map((o) => o.text), ["Home", "Away"]);
	assert.equal(qs[5].menu, "places");
	const un = segs.filter((s) => s.type === "unsupported").map((s) => s.kind);
	for (const k of ["mystery", "matrix"]) assert.ok(un.includes(k), `${k} is recorded as not supported: ${un.join(", ")}`);
	// a query is read (test/query.test.mjs): this one names an activity that keeps no entries, so it is reported and not drawn
	assert.ok(!segs.some((s) => s.type === "query"));
	assert.ok(b.problems.some((p) => /a query in "a" names "a", which keeps no entries/.test(p)), b.problems.join("; "));
	assert.ok(!un.includes("widget") && !un.includes("menu-list"), un.join(", "));
	assert.ok(segs.some((s) => s.type === "prose" && s.markdown.startsWith("> [!tip] A tip")));
	assert.ok(segs.some((s) => s.type === "tab" && s.title === "A tab"));
	assert.ok(b.problems.some((p) => /"mystery" is not a kind/.test(p)));
	assert.ok(!segs.some((s) => s.type === "prose" && /- \[ \] One/.test(s.markdown)), "a multi's options are its own, not prose");
	assert.deepEqual([...core.COMMON_KINDS], ["choice", "multi", "scale", "text", "lines", "number", "date"]);
});

test("repeat and daily: daily needs repeat; a repeating activity with no id is said", () => {
	const head = fm('booklet: "0.16"');
	const b = core.parseBooklet(`${head}\n> [!activity|log repeat daily] Log\n\n> [!text|q] Q\n\n> [!activity|other daily] Other\n\n> [!text|r] R\n`);
	assert.deepEqual(b.activities.map((a) => [a.id, a.repeat, a.daily]), [["log", true, true], ["other", false, false]]);
	assert.ok(b.problems.some((p) => /`daily` needs `repeat`/.test(p)), b.problems.join("; "));
});

test("a question inside a group is not drawn as a question yet; the group's words stay", () => {
	const b = core.parseBooklet(`${fm('booklet: "0.16"')}\n> [!activity|a] A\n\n> [!group] A group\n> > [!text|inside] Inside\n\n> [!text|outside] Outside\n`);
	const segs = b.activities[0].segments;
	assert.deepEqual(segs.filter((s) => s.type === "question").map((q) => q.id), ["outside"]);
	assert.ok(segs.some((s) => s.type === "unsupported" && s.kind === "group"), JSON.stringify(segs.map((s) => s.type + ":" + (s.kind ?? ""))));
});

test("refused: a module opened and not closed, closed and not opened, overlapping; an id used twice in a module", () => {
	const head = fm('booklet: "0.16"');
	assert.equal(core.parseBooklet(`${head}\n> [!module|m] M\n\n> [!activity|a] A\n`).ok, false);
	assert.equal(core.parseBooklet(`${head}\n> [!activity|a] A\n\n> [!module|m end] End\n`).ok, false);
	assert.equal(core.parseBooklet(`${head}\n> [!module|m] M\n\n> [!module|n] N\n\n> [!module|n end] E\n\n> [!module|m end] E\n`).ok, false);
	assert.equal(core.parseBooklet(`${head}\n> [!activity|a] A\n\n> [!text|q] Q\n\n> [!text|q] Q again\n`).ok, false);
	// the same id in two modules is fine
	const two = `${head}\n> [!module|m] M\n\n> [!activity|a] A\n\n> [!text|q] Q\n\n> [!module|m end] E\n\n> [!module|n] N\n\n> [!activity|a] A\n\n> [!text|q] Q\n\n> [!module|n end] E\n`;
	assert.equal(core.parseBooklet(two).ok, true);
});

test("records: blocks for one scope merge in file order, the later wins; a records line names its module", () => {
	const text = `${fm('booklet: "0.16"')}
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
	const t = `${fm('booklet: "0.16"')}\n> [!activity|a] A\n\n> [!text|q] Q\n`;
	const w = core.setAnswer(t, "", "q", "x");
	assert.equal(core.designText(w), t + "\n");
	assert.equal(core.designText(core.setAnswer(w, "", "q", "y")), core.designText(w));
});

test("the design key ignores the records region and the blank line a new region brings, so a first answer draws nothing again", () => {
	const t = `${fm('booklet: "0.16"')}\n> [!activity|a] A\n\n> [!text|q] Q\n`;
	for (const body of [t, t.replace(/\n$/, ""), `${t}\n\n  \n`]) {
		const w = core.setAnswer(body, "", "q", "x");
		assert.notEqual(w, body);
		assert.equal(core.designKey(w), core.designKey(body), JSON.stringify(body.slice(-8)));
	}
	// a change to the design is seen
	assert.notEqual(core.designKey(t.replace("> [!text|q] Q", "> [!text|q] Changed")), core.designKey(t));
});

const WIDGET = (engine, extra = "") => `\`\`\`booklet widget\n{ "engine": "${engine}"${extra} }\n\`\`\``;

test("widgets: a widget line embeds its block, found in its own module first, then among the shared ones, never in another module's", () => {
	const text = `${fm('booklet: "0.16"')}
> [!activity|bare] Bare

> [!widget|sees-shared] Sees the shared one
> ![[#^shared-w]]

> [!widget|not-theirs] Cannot see module m's
> ![[#^in-m]]

> [!module|m] M

> [!activity|a] A

> [!widget|own readonly describe] In the fence
> Some help for it.
> ![[#^in-m]]

${WIDGET("grid-select", ', "copy": { "h": "fenced" }')}
^in-m

> [!widget|from-data] From M's data section
> ![[Some note#^m-data|shown as]]

> [!widget|shared] The shared one
> ![[#^shared-w]]

> [!widget|no-embed] No embed

> [!module|m end] End

> [!module|n] N

> [!activity|b] B

> [!widget|other] Another module's block
> ![[#^m-data]]

> [!module|n end] End

> [!data|m] Data for M

${WIDGET("svg-regions")}
^m-data

> [!data] Data

${WIDGET("grid-select", ', "copy": { "h": "shared" }')}
^shared-w

${WIDGET("grid-select")}
`;
	const b = core.parseBooklet(text);
	assert.ok(b.ok, b.refusal);
	assert.deepEqual(norm(b.widgets.map((w) => [w.id, w.module])), [["in-m", "m"], ["m-data", "m"], ["shared-w", null]]);
	const q = (a, id) => b.activities.find((x) => x.id === a).segments.find((s) => s.id === id);
	assert.equal(q("bare", "sees-shared").widget.id, "shared-w");
	assert.equal(q("bare", "not-theirs").widget, null, "a bare activity sees no module's block");
	const own = q("a", "own");
	assert.deepEqual([own.widget.id, own.widget.module, own.readonly, own.describe, own.help], ["in-m", "m", true, true, "Some help for it."]);
	assert.equal(q("a", "from-data").widget.data.engine, "svg-regions");
	assert.equal(q("a", "shared").widget.data.copy.h, "shared");
	assert.equal(q("a", "no-embed"), undefined, "a widget line with no embed is not drawn");
	assert.ok(b.problems.some((p) => /the widget "no-embed" embeds no widget block/.test(p)), b.problems.join("; "));
	assert.ok(b.problems.some((p) => /a widget block with no block id/.test(p)), b.problems.join("; "));
	assert.equal(q("b", "other").widget, null, "module n does not see module m's data section");
});

test("widgets: a block that is not JSON, or not an object, is said and read as missing", () => {
	const text = `${fm('booklet: "0.16"')}\n> [!activity|a] A\n\n> [!widget|w] W\n> ![[#^bad]]\n\n\`\`\`booklet widget\n{ not json\n\`\`\`\n^bad\n\n> [!widget|v] V\n> ![[#^list]]\n\n\`\`\`booklet widget\n[1, 2]\n\`\`\`\n^list\n`;
	const b = core.parseBooklet(text);
	assert.ok(b.ok);
	assert.deepEqual(b.activities[0].segments.filter((s) => s.type === "question").map((s) => s.widget), [null, null]);
	assert.ok(b.problems.some((p) => /widget block that is not JSON/.test(p)));
	assert.ok(b.problems.some((p) => /not a JSON object/.test(p)));
});

test("shared menus: own options win; a menu is found in its own module, then among the shared; a missing one is said and not drawn", () => {
	const text = `${fm('booklet: "0.16"')}
> [!menu|colours]
- Red
- [ ] Blue

> [!activity|bare] Bare

> [!choice|c menu:colours] A colour

> [!multi|own menu:colours] Its own options win
- [ ] Mine

> [!multi|nowhere menu:sizes] No such menu

> [!module|m] M

> [!activity|a] A

> [!multi|fenced menu:colours open] From the fence
> Help.

> [!choice|from-data menu:sizes] From M's data section

> [!menu|colours]
- Green

> [!module|m end] End

> [!module|n] N

> [!activity|b] B

> [!choice|cannot menu:sizes] Module n cannot see M's sizes

> [!choice|shared menu:colours] The shared colours

> [!module|n end] End

> [!data|m] Data for M

> [!menu|sizes]
- Small
- *Large*

> [!data] Data

> [!menu|empty]
`;
	const b = core.parseBooklet(text);
	assert.ok(b.ok, b.refusal);
	assert.deepEqual(norm(b.menus.map((x) => [x.id, x.module, x.items])), [["colours", null, ["Red", "Blue"]], ["colours", "m", ["Green"]], ["sizes", "m", ["Small", "*Large*"]]]);
	const q = (a, id) => b.activities.find((x) => x.id === a).segments.find((s) => s.id === id);
	const opts = (s) => s.options.map((o) => o.text);
	assert.deepEqual([opts(q("bare", "c")), q("bare", "c").menu], [["Red", "Blue"], "colours"]);
	assert.deepEqual([opts(q("bare", "own")), q("bare", "own").menu], [["Mine"], null]);
	assert.equal(q("bare", "nowhere"), undefined);
	// the fence's menu comes after the question and is still its own module's, found first
	assert.deepEqual([opts(q("a", "fenced")), q("a", "fenced").open, q("a", "fenced").help], [["Green"], true, "Help."]);
	assert.deepEqual(opts(q("a", "from-data")), ["Small", "*Large*"]);
	assert.equal(q("b", "cannot"), undefined, "another module's menu is never used");
	assert.deepEqual(opts(q("b", "shared")), ["Red", "Blue"]);
	assert.ok(b.problems.some((p) => /"nowhere" takes its options from the menu "sizes", which the activities outside every module cannot see/.test(p)), b.problems.join("; "));
	assert.ok(b.problems.some((p) => /"cannot" takes its options from the menu "sizes", which the module "n" cannot see/.test(p)), b.problems.join("; "));
	// an id used twice among the shared menus is refused; a module's menu may share a shared one's id
	assert.equal(core.parseBooklet(`${fm('booklet: "0.16"')}\n> [!menu|x]\n- A\n\n> [!activity|a] A\n\n> [!data] Data\n\n> [!menu|x]\n- B\n`).ok, false);
	// a menu outside every fence is not in the bare activities' id scope
	assert.equal(core.parseBooklet(`${fm('booklet: "0.16"')}\n> [!menu|a]\n- A\n\n> [!activity|a] A\n`).ok, true);
});

test("openings: the booklet's before the first module or activity line, a module's before its first activity; a repeated title drawn once", () => {
	const text = `---
booklet: "0.16"
id: test/o
title: The *Booklet*
---

> [!manifest] The Booklet
> - module m: inline

# The Booklet

The booklet's first paragraph.

> [!tip] A reading callout in the opening
> It is part of it.

***

The rest of the opening.

> [!activity|bare] Bare

Bare prose.

> [!module|m] Module **M**

> [!notice]
> license: made up

## Module M

M's opening.

> [!activity|a] A

> [!module|m end] End

Text between modules, drawn nowhere.

> [!module|n] N

> [!activity|b] B

> [!module|n end] End
`;
	const b = core.parseBooklet(text);
	assert.ok(b.ok, b.refusal);
	assert.deepEqual(norm(b.openings), [
		{ module: null, title: "The *Booklet*", markdown: "The booklet's first paragraph.\n\n> [!tip] A reading callout in the opening\n> It is part of it.\n\n\nThe rest of the opening.", line: 10 },
		{ module: "m", title: "Module **M**", markdown: "M's opening.", line: 30 },
	]);
	assert.deepEqual(norm(b.unshown), [{ kind: "notice", scope: "m", line: 27 }]);
	assert.ok(!JSON.stringify(b).includes("drawn nowhere"));
	// a file with no module and no activity line is one activity: it has no opening
	assert.deepEqual(core.parseBooklet(`${fm('booklet: "0.16"')}\nJust prose.\n`).openings, []);
	// a heading that is not the title stays
	assert.equal(core.parseBooklet(`${fm('booklet: "0.16"')}\n# Another heading\n\nWords.\n\n> [!activity|a] A\n`).openings[0].markdown, "# Another heading\n\nWords.");
});

test("a data section names its module; one this file does not open is said, and its blocks are shared", () => {
	const text = `${fm('booklet: "0.16"')}\n> [!activity|a] A\n\n> [!widget|w] W\n> ![[#^g]]\n\n> [!data|nobody] Data\n\n${WIDGET("grid-select")}\n^g\n`;
	const b = core.parseBooklet(text);
	assert.ok(b.problems.some((p) => /data section for the module "nobody"/.test(p)), b.problems.join("; "));
	assert.equal(b.activities[0].segments.find((s) => s.id === "w").widget.module, null);
});
