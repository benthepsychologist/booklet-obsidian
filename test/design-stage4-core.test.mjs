/*
 * Stage 4 of the Design view, the core (no view): the fold mark of a callout (design-fold.ts), the hint and the solution under a question
 * (design-helps.ts), and the pickers' sources and edits (design-structure.ts): an activity's tab, a page's parent, a copy button's `of:`
 * and the kept entries' `entries:folded`. Lines in, lines out: every shape the format allows is read and written back byte for byte, and
 * every shape it does not is refused with a reason in words.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { core, bookletAround } from "./helpers.mjs";

const {
	foldOfLine,
	setFoldLine,
	setFold,
	readHelps,
	helpOf,
	writeHelpWords,
	writeHelpTitle,
	writeHelpFold,
	addHelp,
	removeHelp,
	tabChoices,
	tabProblem,
	parentChoices,
	parentProblem,
	makesLoop,
	copyChoices,
	copyItems,
	editCopyOf,
	entriesState,
	parseDesign,
	walkDesign,
	blockLines,
	changeLines,
} = core;

const L = (s) => s.split("\n");
const J = (a) => a.join("\n");
const reason = (r) => {
	assert.equal(r.ok, false, "refused");
	assert.ok(r.reason.length > 20, `a reason in words: ${r.reason}`);
	return r.reason;
};

// ================================================================ the fold mark

test("fold: the three shapes the format knows are read as written", () => {
	assert.deepEqual(foldOfLine("> [!hint]- Hint"), { ok: true, mark: "-" });
	assert.deepEqual(foldOfLine("> [!hint]+ Hint"), { ok: true, mark: "+" });
	assert.deepEqual(foldOfLine("> [!hint] Hint"), { ok: true, mark: "" });
	assert.deepEqual(foldOfLine("> [!tip|x y]- Tip"), { ok: true, mark: "-" }, "after a bar of settings");
	assert.deepEqual(foldOfLine("> [!group]-"), { ok: true, mark: "-" }, "no title");
	assert.deepEqual(foldOfLine("> [!note] - not a mark"), { ok: true, mark: "" }, "a dash after a space is the title");
	for (const k of ["note", "tip", "example", "warning", "quote", "diff", "law", "opinion", "solution", "group", "mything"]) assert.equal(foldOfLine(`> [!${k}]- T`).ok, true, `${k} folds`);
});

test("fold: a line with no fold in the format is refused with the reason (a page, a question, a copy button, structure, a closing line, extra > marks)", () => {
	assert.match(reason(foldOfLine("> [!page|p]- Page")), /page is never folded/);
	for (const l of ["> [!choice|c]- Q", "> [!text|t]- Q", "> [!activity|a]- A", "> [!module|m]- M", "> [!tab]- T", "> [!copy|c of:a]- Go", "> [!notice]- N", "> [!menu|m]- M", "> [!row]-"]) assert.match(reason(foldOfLine(l)), /no fold in the format/, l);
	assert.match(reason(foldOfLine("> [!module|m end]")), /no fold|closing/);
	assert.match(reason(foldOfLine("> > [!hint]- x")), /extra > marks/);
	assert.match(reason(foldOfLine("just words")), /not a Booklet line/);
});

test("fold: the switch writes only the one character, and on then off (or off then on) is the same line", () => {
	const lines = [
		"> [!hint]- Hint",
		"> [!hint] Hint",
		"> [!hint]-",
		"> [!hint]",
		"> [!solution|x y]- Model answer",
		"> [!group]- Title  ",
		"> [!note] - a title that starts with a dash",
		">[!tip]- no space after the >",
		"> [!Diff]- Mixed case",
	];
	for (const l of lines) {
		const on = setFoldLine(l, true);
		assert.equal(on.ok, true, l);
		const off = setFoldLine(on.text, false);
		assert.equal(off.ok, true, l);
		const folded = l.includes("]-") || /^>[ \t]?\[![^\]]*\]-/.test(l);
		assert.equal(off.text, folded ? setFoldLine(l, false).text : l, `${l}: off then the original`);
		// the line differs by at most the one character
		assert.ok(Math.abs(on.text.length - l.length) <= 1 && Math.abs(off.text.length - l.length) <= 1, l);
	}
	assert.equal(setFoldLine("> [!hint] Hint", true).text, "> [!hint]- Hint");
	assert.equal(setFoldLine("> [!hint]- Hint", false).text, "> [!hint] Hint");
	assert.equal(setFoldLine("> [!hint]", true).text, "> [!hint]-");
	assert.equal(setFoldLine("> [!hint]-", false).text, "> [!hint]");
	assert.equal(setFoldLine("> [!hint|x]- Hint", false).text, "> [!hint|x] Hint");
	// already as asked: the same line
	assert.equal(setFoldLine("> [!hint]- Hint", true).text, "> [!hint]- Hint");
	assert.equal(setFoldLine("> [!hint] Hint", false).text, "> [!hint] Hint");
});

test("fold: a `+` is kept as written until the switch is turned on, which writes `-` in its place; off again gives no mark", () => {
	assert.equal(setFoldLine("> [!note]+ Open", false).text, "> [!note]+ Open", "off on a + changes nothing");
	assert.equal(setFoldLine("> [!note]+ Open", true).text, "> [!note]- Open");
	assert.equal(setFoldLine("> [!note]- Open", false).text, "> [!note] Open");
});

test("fold: taking the mark off a title that starts with + or - is refused (it would become the mark)", () => {
	assert.match(reason(setFoldLine("> [!hint]-- Title", false)), /title begins with \+ or -/);
	assert.match(reason(setFoldLine("> [!hint]-+ Title", false)), /title begins with \+ or -/);
	// putting it on a line whose title starts with a dash after a space is fine and comes back
	assert.equal(setFoldLine("> [!hint] - Title", true).text, "> [!hint]- - Title");
	assert.equal(setFoldLine("> [!hint]- - Title", false).text, "> [!hint] - Title");
});

test("fold: a block's lines are changed on the first line only, and the rest of the block is the same lines", () => {
	const lines = ["> [!note]- Title", "> body", "> more"];
	const r = setFold(lines, false);
	assert.deepEqual(r.lines, ["> [!note] Title", "> body", "> more"]);
	assert.deepEqual(setFold(r.lines, true).lines, lines);
	reason(setFold(["> [!page|p]- P"], false));
});

test("fold: through the note, a callout inside a group (one > deeper) writes one character and every other byte stays", () => {
	const text = bookletAround(["> [!module|m] M", "", "> [!activity|a] A", "", "> [!group]- Steps", "> > [!note]- Inside", "> > words", "", "> [!module|m end]", ""].join("\n"));
	const root = parseDesign(text);
	const note = walkDesign(root).find((n) => n.kind === "callout" && n.detail === "note");
	assert.ok(note, "the nested callout is a block");
	const lines = blockLines(text, note);
	assert.equal(lines[0], "> [!note]- Inside");
	const off = setFold(lines, false);
	const op = changeLines(text, note, off.lines);
	assert.equal(op.ok, true);
	assert.equal(op.text.length, text.length - 1);
	assert.equal(op.text, text.replace("> > [!note]- Inside", "> > [!note] Inside"));
	// and back
	const root2 = parseDesign(op.text);
	const note2 = walkDesign(root2).find((n) => n.kind === "callout" && n.detail === "note");
	assert.equal(changeLines(op.text, note2, setFold(blockLines(op.text, note2), true).lines).text, text);
});

// ================================================================ hint and solution under a question

const CHOICE = ["> [!choice|biggest] When?", "- [ ] A", "- [x] B", "", "> [!hint]- Hint", "> Think.", "", "> [!solution]- Solution", "> Because.", "> More."];
const TEXT = ["> [!text|why long] Why?", "> some help", "", "> [!hint]- A hint", "> One word."];

test("helps: the hint and the solution are carved out of a question's own lines, with title, words and fold", () => {
	const h = readHelps(CHOICE);
	assert.ok(!("refused" in h), h.refused);
	assert.equal(h.at, 3, "the list ends at line 3 (the claim of the question)");
	assert.deepEqual(
		h.parts.map((p) => [p.kind, p.from, p.to, p.fold, p.title, p.text, p.words]),
		[
			["hint", 4, 6, "-", "Hint", "Think.", true],
			["solution", 7, 10, "-", "Solution", "Because.\nMore.", true],
		],
	);
	const t = readHelps(TEXT);
	assert.equal(t.parts.length, 1);
	assert.equal(t.parts[0].text, "One word.");
	// a question with none
	assert.deepEqual(readHelps(["> [!text|q] Q"]).parts, []);
	assert.equal(helpOf(CHOICE, "solution").text, "Because.\nMore.");
	assert.equal(helpOf(TEXT, "solution"), null);
});

test("helps: writing the same words back is the same lines; changed words rewrite only the lines they must", () => {
	for (const lines of [CHOICE, TEXT]) for (const kind of ["hint", "solution"]) {
		const p = helpOf(lines, kind);
		if (!p) continue;
		const same = writeHelpWords(lines, kind, p.text);
		assert.equal(same.ok, true);
		assert.deepEqual(same.lines, lines, `${kind}: unchanged`);
	}
	// the first line of two is changed: the second line keeps its bytes
	const r = writeHelpWords(CHOICE, "solution", "Because it is.\nMore.");
	assert.deepEqual(r.lines.slice(7), ["> [!solution]- Solution", "> Because it is.", "> More."]);
	assert.deepEqual(r.lines.slice(0, 7), CHOICE.slice(0, 7), "everything above is the same");
	// a paragraph break and a line removed
	const r2 = writeHelpWords(CHOICE, "solution", "A\n\nB");
	assert.deepEqual(r2.lines.slice(7), ["> [!solution]- Solution", "> A", ">", "> B"]);
	// the words emptied: the callout stays with its line and no body
	const r3 = writeHelpWords(CHOICE, "hint", "");
	assert.deepEqual(r3.lines.slice(3, 7), ["", "> [!hint]- Hint", "", "> [!solution]- Solution"]);
	// and typed back, the same lines as before
	assert.deepEqual(writeHelpWords(r3.lines, "hint", "Think.").lines, CHOICE);
	// the style of the body's first words is kept (`>words`)
	const tight = ["> [!text|q] Q", "", "> [!hint]- H", ">tight", ">more"];
	assert.deepEqual(writeHelpWords(tight, "hint", "tight\nmore\nnew").lines.slice(3), [">tight", ">more", ">new"]);
});

test("helps: words that the format would read as something else are refused, and nothing is changed", () => {
	for (const bad of ["- a list", "1. numbered", "> quoted", "> [!note] second callout", "```js", "| a | b |", "# heading", "---", "    indented code", "[!hint]- another"]) {
		const r = writeHelpWords(CHOICE, "hint", `fine\n${bad}`);
		assert.equal(r.ok, false, `refused: ${bad}`);
		assert.ok(r.reason.length > 20);
	}
});

test("helps: a hint that holds a list, a second callout or a fenced block stays in the Markdown, with the reason; its title and fold mark still have controls", () => {
	const cases = [
		[["> [!text|q] Q", "", "> [!hint]- H", "> - one", "> - two"], /a list/],
		[["> [!text|q] Q", "", "> [!hint]- H", "> words", "> > [!note] inner", "> > x"], /second callout/],
		[["> [!text|q] Q", "", "> [!hint]- H", "> ```js", "> code", "> ```"], /fenced block/],
		[["> [!text|q] Q", "", "> [!hint]- H", "> 1. first"], /a list/],
	];
	for (const [lines, re] of cases) {
		const h = readHelps(lines);
		assert.ok(!("refused" in h));
		const p = h.parts[0];
		assert.equal(p.words, false);
		assert.match(p.why, re);
		assert.match(reason(writeHelpWords(lines, "hint", "x")), re);
		assert.match(reason(removeHelp(lines, "hint")), re);
		// the first line's own things still work
		assert.equal(writeHelpFold(lines, "hint", false).lines[2], "> [!hint] H");
		assert.equal(writeHelpTitle(lines, "hint", "New").lines[2], "> [!hint]- New");
	}
});

test("helps: the fold switch and the title change only the callout's first line", () => {
	const off = writeHelpFold(CHOICE, "hint", false);
	assert.equal(off.lines[4], "> [!hint] Hint");
	assert.deepEqual(off.lines.slice(0, 4), CHOICE.slice(0, 4));
	assert.deepEqual(off.lines.slice(5), CHOICE.slice(5));
	assert.deepEqual(writeHelpFold(off.lines, "hint", true).lines, CHOICE, "on again gives the lines back");
	assert.equal(writeHelpFold(CHOICE, "solution", false).lines[7], "> [!solution] Solution");
	const t = writeHelpTitle(CHOICE, "solution", "Model answer");
	assert.equal(t.lines[7], "> [!solution]- Model answer");
	assert.deepEqual(writeHelpTitle(t.lines, "solution", "Solution").lines, CHOICE);
	assert.equal(writeHelpTitle(CHOICE, "hint", "").lines[4], "> [!hint]-", "no title");
	const two = writeHelpTitle(CHOICE, "hint", "a\nb");
	assert.equal(two.ok, false);
	assert.match(two.reason, /one line/);
	assert.match(reason(writeHelpFold(TEXT, "solution", true)), /no solution/);
});

test("helps: add and remove give back the same lines, a hint goes before a solution and a solution at the end", () => {
	const q = ["> [!choice|c] Q?", "- [ ] A", "- [ ] B"];
	const withHint = addHelp(q, "hint");
	assert.deepEqual(withHint.lines, [...q, "", "> [!hint]- Hint"]);
	const both = addHelp(withHint.lines, "solution");
	assert.deepEqual(both.lines, [...q, "", "> [!hint]- Hint", "", "> [!solution]- Solution"]);
	assert.deepEqual(removeHelp(both.lines, "solution").lines, withHint.lines);
	assert.deepEqual(removeHelp(withHint.lines, "hint").lines, q);
	// a solution first, then a hint: the hint goes above it
	const sol = addHelp(q, "solution");
	const hint = addHelp(sol.lines, "hint");
	assert.deepEqual(hint.lines, [...q, "", "> [!hint]- Hint", "", "> [!solution]- Solution"]);
	assert.deepEqual(removeHelp(hint.lines, "hint").lines, sol.lines);
	// with words: the callout and its body go, and what is left is as it was
	const full = writeHelpWords(withHint.lines, "hint", "Look at the moon.\nAgain.");
	assert.deepEqual(removeHelp(full.lines, "hint").lines, q);
	// every question kind: a text question with help lines, and a scale
	for (const lines of [["> [!text|t long] Why?", "> help"], ["> [!scale|s] How?", "", "0. low", "1. high"], ["> [!number|n] Count"]]) {
		for (const kind of ["hint", "solution"]) {
			const a = addHelp(lines, kind);
			assert.equal(a.ok, true, kind);
			assert.deepEqual(removeHelp(a.lines, kind).lines, lines, `${lines[0]} ${kind}`);
		}
	}
	assert.match(reason(addHelp(CHOICE, "hint")), /already/);
	assert.match(reason(removeHelp(q, "hint")), /no hint/);
});

test("helps: a question with two hints, or a line after the callouts that is neither, is shown as Markdown only, and nothing is added", () => {
	const two = [...CHOICE, "", "> [!hint]- Another", "> Second."];
	const r = readHelps(two);
	assert.match(r.refused, /more than one hint/);
	assert.match(reason(addHelp(two, "solution")), /more than one hint/);
	assert.match(reason(writeHelpWords(two, "hint", "x")), /more than one hint/);
	const stray = ["> [!text|q] Q", "", "> [!hint]- H", "> w", "", "a paragraph that is not a callout"];
	assert.match(readHelps(stray).refused, /neither a hint nor a solution/);
	assert.match(readHelps(["> > [!text|q] Q"]).refused, /extra > marks/);
	assert.match(readHelps(["words"]).refused, /not a Booklet line/);
	assert.match(readHelps(["> [!text|q] Q", "", "> [!hint]- H", "> a\rb"]).refused, /carriage return/);
});

test("helps: a hint that is not folded, or folded with +, is read as it is and the switch handles it", () => {
	const open = ["> [!text|q] Q", "", "> [!hint] H", "> w"];
	assert.equal(helpOf(open, "hint").fold, "");
	assert.equal(writeHelpFold(open, "hint", true).lines[2], "> [!hint]- H");
	const plus = ["> [!text|q] Q", "", "> [!hint]+ H", "> w"];
	assert.equal(helpOf(plus, "hint").fold, "+");
	assert.deepEqual(writeHelpFold(plus, "hint", false).lines, plus, "off on a + changes nothing");
	assert.equal(writeHelpFold(plus, "hint", true).lines[2], "> [!hint]- H");
});

test("helps: through the note, in a group (one > deeper) the nested hint is the same case: read, written and removed with the group's marks kept", () => {
	const text = bookletAround(
		["> [!module|m] M", "", "> [!activity|a] A", "", "> [!group] Step", "> Setup words.", ">", "> > [!choice|c1] Pick?", "> - [ ] A", "> - [ ] B", ">", "> > [!hint]-", "> > Words that help.", "", "> [!module|m end]", ""].join("\n"),
	);
	const root = parseDesign(text);
	const q = walkDesign(root).find((n) => n.kind === "question");
	const lines = blockLines(text, q);
	assert.deepEqual(lines.slice(3), ["", "> [!hint]-", "> Words that help."], lines.join("|"));
	const h = helpOf(lines, "hint");
	assert.deepEqual([h.fold, h.title, h.text], ["-", "", "Words that help."]);
	const w = writeHelpWords(lines, "hint", "Other words.");
	const op = changeLines(text, q, w.lines);
	assert.equal(op.ok, true);
	assert.equal(op.text, text.replace("> > Words that help.", "> > Other words."));
	const f = writeHelpFold(lines, "hint", false);
	assert.equal(changeLines(text, q, f.lines).text, text.replace("> > [!hint]-", "> > [!hint]"));
	// removed, then added back (the title is the format's word)
	const gone = removeHelp(lines, "hint");
	const opGone = changeLines(text, q, gone.lines);
	assert.equal(opGone.ok, true);
	assert.ok(!opGone.text.includes("[!hint]"));
	const back = addHelp(gone.lines, "hint");
	assert.equal(back.lines.at(-1), "> [!hint]- Hint");
});

test("helps: every question of the test fixtures reads into fields or is refused in words, and writing back what was read is the same note", async () => {
	const { fixtureFiles } = await import("./fixtures.mjs");
	let seen = 0;
	for (const f of fixtureFiles()) {
		const root = parseDesign(f.text);
		for (const n of walkDesign(root)) {
			if (n.kind !== "question") continue;
			const lines = blockLines(f.text, n);
			const h = readHelps(lines);
			if ("refused" in h) continue;
			for (const p of h.parts) {
				seen++;
				assert.deepEqual(writeHelpFold(lines, p.kind, p.fold === "-").lines, lines, "fold as it is");
				if (p.words) assert.deepEqual(writeHelpWords(lines, p.kind, p.text).lines, lines, `${f.name}: ${p.kind} as it is`);
				assert.deepEqual(writeHelpTitle(lines, p.kind, p.title).lines, lines, "title as it is");
			}
		}
	}
	assert.ok(seen >= 2, `the fixtures hold hints or solutions under questions (${seen})`);
});

// ================================================================ the tab picker

const MODULE = bookletAround(
	[
		"> [!module|m] Week",
		"",
		"> [!tab|learn] Learn",
		"",
		"> [!tab] This month",
		"",
		"> [!activity|a tab:learn] Alpha",
		"",
		"> [!activity|b tab:gone] Beta",
		"",
		"> [!activity|c] Gamma",
		"",
		"> [!module|m end]",
		"",
		"> [!activity|bare] Bare",
		"",
	].join("\n"),
);
const nodeOf = (text, kind, id) => walkDesign(parseDesign(text)).find((n) => n.kind === kind && n.id === id);

test("tab picker: the module's tabs in order (written ids and ids made from the title), nothing outside a module", () => {
	const a = nodeOf(MODULE, "activity", "a");
	assert.deepEqual(tabChoices(a), [
		{ value: "learn", title: "Learn" },
		{ value: "this-month", title: "This month" },
	]);
	assert.deepEqual(tabChoices(nodeOf(MODULE, "activity", "bare")), []);
	assert.equal(tabProblem(a, "learn"), null);
	assert.equal(tabProblem(a, "this-month"), null);
	assert.equal(tabProblem(a, ""), null, "nothing takes the setting off");
	assert.match(tabProblem(a, "gone"), /not a tab of this module/);
	assert.match(tabProblem(nodeOf(MODULE, "activity", "bare"), "learn"), /not a tab of this module/);
});

test("tab picker: choosing writes only the tab: word (added, replaced or taken off), and a tab that is gone stays as written until another is chosen", () => {
	const form = core.applyFormChange;
	const lines = (id) => blockLines(MODULE, nodeOf(MODULE, "activity", id));
	assert.deepEqual(form(lines("c"), { what: "value", name: "tab", value: "learn" }).lines, ["> [!activity|c tab:learn] Gamma"]);
	assert.deepEqual(form(lines("a"), { what: "value", name: "tab", value: "this-month" }).lines, ["> [!activity|a tab:this-month] Alpha"]);
	assert.deepEqual(form(lines("a"), { what: "value", name: "tab", value: "" }).lines, ["> [!activity|a] Alpha"]);
	// the missing one is not touched by anything else on the line
	assert.deepEqual(form(lines("b"), { what: "flag", name: "repeat", on: true }).lines, ["> [!activity|b tab:gone repeat] Beta"]);
});

// ================================================================ the parent picker

const PAGES = bookletAround(
	[
		"> [!module|m] Week",
		"",
		"> [!activity|a] Alpha",
		"",
		"> [!tab|t1] One",
		"",
		"> [!page|p1] First",
		"",
		"> [!page|p2 parent:p1] Second",
		"",
		"> [!page|p3 parent:p2] Third",
		"",
		"> [!page|p4] Fourth",
		"",
		"> [!page|p5 parent:ghost] Fifth",
		"",
		"> [!tab|t2] Two",
		"",
		"> [!page|q1] Other tab page",
		"",
		"> [!module|m end]",
		"",
	].join("\n"),
);
const page = (id) => nodeOf(PAGES, "page", id);

test("parent picker: the other pages of the same tab, never itself or one of its own sub-pages, never a page of another tab", () => {
	const ids = (id) => parentChoices(page(id)).map((c) => c.value);
	assert.deepEqual(ids("p1"), ["p4", "p5"], "p1 is the top of a tree: not itself, not p2 (its child), not p3 (its grandchild)");
	assert.deepEqual(ids("p2"), ["p1", "p4", "p5"], "p3 is p2's child");
	assert.deepEqual(ids("p3"), ["p1", "p2", "p4", "p5"]);
	assert.deepEqual(ids("p4"), ["p1", "p2", "p3", "p5"]);
	assert.ok(!ids("p4").includes("q1"), "another tab's page is never offered");
	assert.deepEqual(ids("q1"), [], "the only page of its tab");
	assert.deepEqual(parentChoices(page("p1"))[0], { value: "p4", title: "Fourth" });
});

test("parent picker: a loop is refused with the reason, a page that is not in the tab is refused, and nothing takes the setting off but ''", () => {
	assert.equal(makesLoop(page("p1"), "p1"), true, "itself");
	assert.equal(makesLoop(page("p1"), "p2"), true, "its child");
	assert.equal(makesLoop(page("p1"), "p3"), true, "its grandchild");
	assert.equal(makesLoop(page("p1"), "p4"), false);
	assert.equal(makesLoop(page("p3"), "p1"), false, "an ancestor is a fine parent");
	assert.match(parentProblem(page("p1"), "p1"), /loop/);
	assert.match(parentProblem(page("p1"), "p3"), /loop/);
	assert.match(parentProblem(page("p1"), "q1"), /not a page of this tab/);
	assert.match(parentProblem(page("p1"), "ghost"), /not a page of this tab/);
	assert.equal(parentProblem(page("p1"), "p4"), null);
	assert.equal(parentProblem(page("p1"), ""), null);
	assert.equal(parentProblem(page("p3"), "p1"), null);
});

test("parent picker: a loop that the note already holds is not offered and not rewritten; the value written stays as written", () => {
	const looped = PAGES.replace("> [!page|p1] First", "> [!page|p1 parent:p3] First");
	const p1 = nodeOf(looped, "page", "p1");
	assert.equal(p1.set.parent, "p3");
	assert.ok(!parentChoices(p1).some((c) => c.value === "p3"), "p3 is a loop for p1, so it is not offered");
	const gone = nodeOf(PAGES, "page", "p5");
	assert.equal(gone.set.parent, "ghost");
	assert.ok(!parentChoices(gone).some((c) => c.value === "ghost"), "ghost is not a page");
	// moving another word of the line leaves it
	assert.deepEqual(core.applyFormChange(blockLines(PAGES, gone), { what: "value", name: "icon", value: "star" }).lines, ["> [!page|p5 parent:ghost icon:star] Fifth"]);
	assert.deepEqual(core.applyFormChange(blockLines(PAGES, gone), { what: "value", name: "parent", value: "p1" }).lines, ["> [!page|p5 parent:p1] Fifth"]);
	assert.deepEqual(core.applyFormChange(blockLines(PAGES, gone), { what: "value", name: "parent", value: "" }).lines, ["> [!page|p5] Fifth"]);
});

test("parent picker: two pages with one id offer it once (the first is the parent)", () => {
	const dup = bookletAround(["> [!activity|a] A", "", "> [!page|x] One", "", "> [!page|x] Two", "", "> [!page|y] Three", ""].join("\n"));
	const y = nodeOf(dup, "page", "y");
	assert.deepEqual(parentChoices(y).map((c) => c.value), ["x"]);
	const x2 = walkDesign(parseDesign(dup)).filter((n) => n.kind === "page" && n.id === "x")[1];
	assert.ok(parentChoices(x2).some((c) => c.value === "x"), "the second x may sit under x: the format reads that as the first one");
});

// ================================================================ the copy picker

const COPYNOTE = bookletAround(
	[
		"> [!module|m] Week",
		"",
		"> [!activity|a] Alpha",
		"",
		"> [!text|why long] Why?",
		"",
		"> [!solution]- Model answer",
		"> Because.",
		"",
		"> [!choice|pick] Which?",
		"- [ ] One",
		"- [ ] Two",
		"",
		"> [!hint]- Hint",
		"> Look.",
		"",
		"> [!choice|later] Later?",
		"- [ ] x",
		"- [ ] y",
		"",
		"> [!hint] A hint that is not folded",
		"> Not the question's own.",
		"",
		"> [!matrix|grid] Matrix",
		"",
		"> [!listen|ep] Episode",
		"",
		"> [!number|n each:pick] Per pick",
		"",
		"> [!group] Steps",
		"> > [!date|when] When?",
		"",
		"> [!copy|go of:why,why/solution,pick/hint,^block,gone] Copy for my tutor",
		"> Please mark.",
		"",
		"> [!module|m end]",
		"",
		"> [!activity|other] Other",
		"",
		"> [!text|elsewhere] Elsewhere",
		"",
	].join("\n"),
);

test("copy picker: the questions of the copy button's own activity that a copy can take, in file order, with their folded hint and solution", () => {
	const copy = walkDesign(parseDesign(COPYNOTE)).find((n) => n.kind === "callout" && n.detail === "copy");
	assert.ok(copy);
	const c = copyChoices(COPYNOTE, copy);
	assert.deepEqual(
		c.map((x) => x.value),
		["why", "why/solution", "pick", "pick/hint", "later", "when"],
		"a matrix, a listen, a question asked for each pick, another activity's question: none; a hint not folded is not the question's own",
	);
	assert.deepEqual(c[0], { value: "why", what: "question", kind: "text", title: "Why?" });
	assert.equal(c[1].what, "solution");
});

test("copy picker: items are chosen, added, moved and removed in the order the person picks; every item not named stays exactly as written", () => {
	const v = "why,why/solution,pick/hint,^block,gone";
	assert.deepEqual(copyItems(v), ["why", "why/solution", "pick/hint", "^block", "gone"]);
	assert.deepEqual(copyItems(""), []);
	const ok = (r) => (assert.equal(r.ok, true, r.reason), r.value);
	assert.equal(ok(editCopyOf(v, { op: "add", value: "pick" })), `${v},pick`);
	assert.equal(ok(editCopyOf("a", { op: "add", value: "b" })), "a,b");
	assert.equal(ok(editCopyOf(v, { op: "set", index: 0, value: "pick" })), "pick,why/solution,pick/hint,^block,gone");
	assert.equal(ok(editCopyOf(v, { op: "move", index: 2, by: -1 })), "why,pick/hint,why/solution,^block,gone");
	assert.equal(ok(editCopyOf(v, { op: "move", index: 0, by: 1 })), "why/solution,why,pick/hint,^block,gone");
	assert.equal(ok(editCopyOf(v, { op: "remove", index: 1 })), "why,pick/hint,^block,gone");
	// the item a picker cannot offer rides along untouched through every other change
	for (const edit of [
		{ op: "set", index: 0, value: "x" },
		{ op: "add", value: "x" },
		{ op: "move", index: 0, by: 1 },
		{ op: "remove", index: 0 },
	]) assert.ok(ok(editCopyOf(v, edit)).split(",").includes("^block"), JSON.stringify(edit));
	assert.ok(ok(editCopyOf(v, { op: "remove", index: 0 })).split(",").includes("gone"));
	// an empty place between commas is kept, too
	assert.equal(ok(editCopyOf("a,,b", { op: "add", value: "c" })), "a,,b,c");
	assert.equal(ok(editCopyOf("a,,b", { op: "move", index: 0, by: 1 })), ",a,b");
	// moving and moving back
	assert.equal(ok(editCopyOf(ok(editCopyOf(v, { op: "move", index: 3, by: 1 })), { op: "move", index: 4, by: -1 })), v);
});

test("copy picker: refusals say why (the last item, past the ends, a word `of:` cannot hold)", () => {
	assert.match(reason(editCopyOf("a", { op: "remove", index: 0 })), /last item stays/);
	assert.match(reason(editCopyOf("a,b", { op: "move", index: 0, by: -1 })), /already at the end/);
	assert.match(reason(editCopyOf("a,b", { op: "move", index: 1, by: 1 })), /already at the end/);
	assert.match(reason(editCopyOf("a,b", { op: "set", index: 5, value: "c" })), /no such item/);
	for (const bad of ["a b", "a,b", "", "a/other", "-x", "a/"]) {
		assert.match(reason(editCopyOf("a", { op: "add", value: bad })), /id, or an id with/, bad);
		assert.match(reason(editCopyOf("a", { op: "set", index: 0, value: bad })), /id, or an id with/, bad);
	}
});

test("copy picker: the value is written to the line's of: word only, and the other words stay", () => {
	const line = ["> [!copy|go of:why,^block icon:star] Copy for my tutor", "> Please mark."];
	const r = core.applyFormChange(line, { what: "value", name: "of", value: "^block,why" });
	assert.deepEqual(r.lines, ["> [!copy|go of:^block,why icon:star] Copy for my tutor", "> Please mark."]);
	assert.deepEqual(core.applyFormChange(r.lines, { what: "value", name: "of", value: "why,^block" }).lines, line, "back again");
});

// ================================================================ entries:folded

test("entries: it applies only to a repeat activity; the switch writes entries:folded and takes it off again, other values are kept as written", () => {
	assert.deepEqual(entriesState("> [!activity|a repeat] A"), { applies: true, folded: false, other: null });
	assert.deepEqual(entriesState("> [!activity|a repeat daily entries:folded] A"), { applies: true, folded: true, other: null });
	assert.deepEqual(entriesState("> [!activity|a] A"), { applies: false, folded: false, other: null });
	assert.deepEqual(entriesState("> [!activity|a entries:folded] A"), { applies: false, folded: true, other: null }, "it does nothing here, and the linter warns");
	assert.deepEqual(entriesState("> [!activity|a repeat entries:open] A"), { applies: true, folded: false, other: "open" });
	assert.equal(entriesState("> [!page|p] P"), null);
	const on = core.applyFormChange(["> [!activity|a repeat] A"], { what: "value", name: "entries", value: "folded" });
	assert.deepEqual(on.lines, ["> [!activity|a repeat entries:folded] A"]);
	const off = core.applyFormChange(on.lines, { what: "value", name: "entries", value: "" });
	assert.deepEqual(off.lines, ["> [!activity|a repeat] A"]);
	// another value is replaced only when the person turns the switch on, and the line is otherwise the same
	assert.deepEqual(core.applyFormChange(["> [!activity|a repeat entries:open icon:x] A"], { what: "value", name: "entries", value: "folded" }).lines, ["> [!activity|a repeat entries:folded icon:x] A"]);
});
