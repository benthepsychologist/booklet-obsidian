/*
 * The `copy` callout (format 0.19; plugin 1.2.0): `> [!copy|id of:a,b,c] Button label`, its `>` lines the author's lead-in words. One button
 * that puts the lead-in and then each id of `of:` on the clipboard, in the order written, as plain labelled lines. A question id gives
 * `Question:` and `My answer:` (`(no answer typed)` when there is none), `id/solution` gives `Model answer:`, `id/hint` gives `Hint:`, a
 * fenced block marked `^id` gives its id, a colon and the block's text. Nothing is written to the note, nothing is sent. Every note here is
 * made up.
 *
 * The first half is the data layer (reading the line, the folded callouts after a question, the blocks, the assembled text); the second is
 * the view (the button, the clipboard, the line that says "Copied", and that the note is not written to).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { click, typeInto, window as w, words } from "./dom.mjs";
import { core, sha } from "./helpers.mjs";
import { pane } from "./pane.mjs";

const HEAD = `---\nbooklet: "0.19"\nid: made/up\ntitle: Tides\nlang: en\n---\n\n`;
const note = (body, head = HEAD) => `${head}${body}`;

/** A long text question with its folded hint and solution, a choice, and a copy callout that names them. */
const ESSAY = `> [!activity|essay] Essay

> [!text|why long] Why do tides have two highs a day?

> [!hint]- Hint
> Think of the moon and the far side.

> [!solution]- Model answer
> The moon pulls the near water more and the far water less.
> So there are two bulges.

> [!choice|pick] Which pulls harder?
- [ ] The moon
- [ ] The *sun*

> [!copy|ask of:why,why/hint,why/solution,pick] Copy for my tutor
> Please score my answer from 0 to 5.
`;

const read = (body) => core.parseBooklet(note(body));
const copyOf = (book) => book.activities[0].segments.find((s) => s.type === "copy");
/** The text a copy callout makes, with answers by question id (a value, or nothing). */
const made = (body, answers = {}) => {
	const book = core.parseBooklet(note(body));
	const act = book.activities[0];
	return core.copyText(book, act, copyOf(book), { answerOf: (q) => answers[q.id] });
};

/* ---- the line ---- */

test("a copy line is read: its id, its button words, its ids in order, its lead-in words; it is no unread kind and no problem", () => {
	const b = read(ESSAY);
	assert.deepEqual(b.problems, []);
	assert.deepEqual(b.unread, []);
	const c = copyOf(b);
	assert.equal(c.id, "ask");
	assert.equal(c.label, "Copy for my tutor");
	assert.deepEqual(c.of, ["why", "why/hint", "why/solution", "pick"]);
	assert.equal(c.prompt, "Please score my answer from 0 to 5.");
	assert.equal(core.FORMAT_VERSION, "0.19");
});

test("a copy line needs no id of its own: `[!copy|of:a]` is read, and a lead-in of several lines keeps them", () => {
	const b = read("> [!activity|a] A\n\n> [!text|t] T\n\n> [!copy|of:t] Copy\n> Line one.\n>\n> Line two.\n");
	const c = copyOf(b);
	assert.equal(c.id, null);
	assert.deepEqual(c.of, ["t"]);
	assert.equal(c.prompt, "Line one.\n\nLine two.");
	assert.deepEqual(b.problems, []);
});

test("`of:` is split on commas with white space round each id, and empty items are dropped", () => {
	assert.deepEqual(copyOf(read("> [!activity|a] A\n\n> [!text|a] A\n\n> [!text|b] B\n\n> [!copy|of:a,,b,] Copy\n")).of, ["a", "b"]);
});

test("a copy line with no `of:` (or an empty one) is not drawn and is a problem with its line; the note still reads", () => {
	for (const line of ["> [!copy] Copy", "> [!copy|x] Copy", "> [!copy|of:] Copy"]) {
		const b = read(`> [!activity|a] A\n\n> [!text|t] T\n\n${line}\n`);
		assert.equal(copyOf(b), undefined, line);
		assert.equal(b.problems.length, 1, line);
		assert.match(b.problems[0], /^Line 12: a copy line has no `of:` ids/, line);
		assert.equal(b.activities[0].segments.filter((s) => s.type === "question").length, 1, `${line}: the question is read`);
	}
});

test("a copy line outside every activity is a problem and draws nothing; a setting it does not take is listed as unread", () => {
	const b = read("> [!copy|of:t] Copy\n\n> [!activity|a] A\n\n> [!text|t] T\n");
	assert.equal(copyOf(b), undefined);
	assert.match(b.problems.join("\n"), /a copy line belongs in an activity/);
	const c = read("> [!activity|a] A\n\n> [!text|t] T\n\n> [!copy|of:t long] Copy\n");
	assert.equal(copyOf(c).of[0], "t");
	assert.equal(c.unread.length, 1);
	assert.match(c.unread[0].why, /a copy line takes no `long` setting/);
});

test("a copy line inside a group is read where it stands, and copies the activity's questions", () => {
	const t = note("> [!activity|a] A\n\n> [!text|t] T\n\n> [!group]\n> > [!copy|of:t] Copy\n> > Lead-in.\n");
	const b = core.parseBooklet(t);
	assert.equal(copyOf(b).prompt, "Lead-in.");
	assert.equal(core.copyText(b, b.activities[0], copyOf(b), { answerOf: () => "x" }).text, "Lead-in.\n\nQuestion: T\n\nMy answer: x");
});

test("a copy line in a records section or a comment is not read", () => {
	const b = read("> [!activity|a] A\n\n> [!text|t] T\n\n<!--\n> [!copy|of:t] Copy\n-->\n");
	assert.equal(copyOf(b), undefined);
	assert.deepEqual(b.problems, []);
});

/* ---- the folded callouts after a question ---- */

test("a folded hint and a folded solution straight after a question are its own, the first of each; a callout that is not folded, a second one, or one after other words is not", () => {
	const b = read(
		[
			"> [!activity|a] A",
			"",
			"> [!text|q1] One",
			"",
			"> [!hint]- First hint",
			"> H1.",
			"",
			"> [!hint]- Second hint",
			"> H2.",
			"",
			"> [!solution] Open solution",
			"> Not folded.",
			"",
			"> [!text|q2] Two",
			"",
			"Some words in between.",
			"",
			"> [!solution]- Late",
			"> After words.",
			"",
			"> [!text|q3] Three",
			"",
			"> [!solution]- Why",
			"> S3.",
			"",
		].join("\n"),
	);
	const q = Object.fromEntries(b.activities[0].segments.filter((s) => s.type === "question").map((s) => [s.id, s]));
	assert.deepEqual([q.q1.hint, q.q1.solution], ["H1.", null]);
	assert.deepEqual([q.q2.hint, q.q2.solution], [null, null]);
	assert.deepEqual([q.q3.hint, q.q3.solution], [null, "S3."]);
});

test("a hint and a solution inside a group belong to the question above them in it; the callouts still draw as before", () => {
	const b = read("> [!activity|a] A\n\n> [!group]\n> > [!text|t] T\n>\n> > [!solution]- S\n> > Inside.\n");
	assert.equal(b.activities[0].segments.find((s) => s.type === "question").solution, "Inside.");
});

/* ---- the assembled text ---- */

test("a typed answer: the lead-in, the question, the answer, the hint and the model answer, in the order of `of:`, a blank line between", () => {
	const r = made(ESSAY, { why: "  Two bulges.  ", pick: 2 });
	assert.equal(
		r.text,
		[
			"Please score my answer from 0 to 5.",
			"Question: Why do tides have two highs a day?",
			"My answer: Two bulges.",
			"Hint: Think of the moon and the far side.",
			"Model answer: The moon pulls the near water more and the far water less.\nSo there are two bulges.",
			"Question: Which pulls harder?",
			"My answer: The *sun*",
		].join("\n\n"),
	);
	assert.deepEqual(r.missing, []);
});

test("Ben's example, exactly: the lead-in, then Question, My answer, Model answer", () => {
	const r = made("> [!activity|a] A\n\n> [!text|q long] Explain tides.\n\n> [!solution]- S\n> Two bulges.\n\n> [!copy|c of:q,q/solution] Copy\n> Score this.\n", { q: "Because of the moon." });
	assert.equal(r.text, "Score this.\n\nQuestion: Explain tides.\n\nMy answer: Because of the moon.\n\nModel answer: Two bulges.");
});

test("an empty answer is copied anyway, with `(no answer typed)`: nothing typed, only spaces, a choice not picked, a multi with nothing", () => {
	for (const empty of [undefined, "", "   ", null]) {
		assert.match(made(ESSAY, { why: empty }).text, /Question: Why do tides have two highs a day\?\n\nMy answer: \(no answer typed\)\n\nHint: /);
	}
	assert.match(made(ESSAY, {}).text, /Question: Which pulls harder\?\n\nMy answer: \(no answer typed\)$/);
	const m = made("> [!activity|a] A\n\n> [!multi|m] Which?\n- [ ] A\n- [ ] B\n\n> [!copy|of:m] Copy\n", { m: [] });
	assert.equal(m.text, "Question: Which?\n\nMy answer: (no answer typed)");
	assert.equal(core.NO_ANSWER, "(no answer typed)");
});

test("a choice, a multi (a pick on each line), a scale and a number show their words as the file writes them", () => {
	const body = "> [!activity|a] A\n\n> [!choice|c] C\n- [ ] One\n- [ ] Two\n\n> [!multi|m] M\n- [ ] Red\n- [ ] Green\n- [ ] Blue\n\n> [!scale|s] S\n1. Low\n5. High\n\n> [!number|n] N\n\n> [!copy|of:c,m,s,n] Copy\n";
	const r = made(body, { c: 1, m: [1, 3, "Teal"], s: 5, n: 7 });
	assert.equal(r.text, ["Question: C", "My answer: One", "Question: M", "My answer: Red\nBlue\nTeal", "Question: S", "My answer: High", "Question: N", "My answer: 7"].join("\n\n"));
});

test("a lines answer is a line each, a blank line left out, carrying on under its label", () => {
	const r = made("> [!activity|a] A\n\n> [!lines|l] List three\n\n> [!copy|of:l] Copy\n", { l: ["tea", " ", "milk"] });
	assert.equal(r.text, "Question: List three\n\nMy answer: tea\nmilk");
});

test("a position or an anchor the question does not list is copied as its number; an answer of the wrong shape as the JSON the file holds", () => {
	const body = "> [!activity|a] A\n\n> [!choice|c] C\n- [ ] One\n\n> [!scale|s] S\n1. Low\n5. High\n\n> [!text|t] T\n\n> [!copy|of:c,s,t] Copy\n";
	assert.equal(made(body, { c: 4, s: 3, t: { odd: true } }).text, ["Question: C", "My answer: 4", "Question: S", "My answer: 3", "Question: T", 'My answer: {"odd":true}'].join("\n\n"));
});

test("a reader's own option on an `open` choice or multi is copied as they typed it", () => {
	const body = "> [!activity|a] A\n\n> [!choice|c open] C\n- [ ] One\n\n> [!multi|m open] M\n- [ ] A\n\n> [!copy|of:c,m] Copy\n";
	assert.equal(made(body, { c: "Mine", m: [1, "Own"] }).text, ["Question: C", "My answer: Mine", "Question: M", "My answer: A\nOwn"].join("\n\n"));
});

test("a question that cannot be copied is left out and said: asked for each pick, a matrix, a widget, a listen", () => {
	const body = "> [!activity|a] A\n\n> [!multi|tools] Tools\n- [ ] Saw\n\n> [!text|why each:tools] Why?\n\n> [!matrix|mx] M\n- Sleep\n\n1. Low\n2. High\n\n> [!listen|ln] L\n> ![[x.mp3]]\n\n> [!copy|of:why,mx,ln,tools] Copy\n";
	const b = read(body);
	const r = core.copyText(b, b.activities[0], copyOf(b), { answerOf: (q) => (q.id === "tools" ? [1] : undefined) });
	assert.equal(r.text, "Question: Tools\n\nMy answer: Saw");
	assert.deepEqual(r.missing, ["why", "mx", "ln"]);
	assert.equal(b.problems.filter((p) => p.includes("is left out of what is copied")).length, 3);
});

test("the order is the order of `of:`, a repeated id is copied again, and a question may come before or after the callout", () => {
	const body = "> [!activity|a] A\n\n> [!copy|of:b,a,b] Copy\n\n> [!text|a] First\n\n> [!text|b] Second\n";
	assert.equal(made(body, { a: "1", b: "2" }).text, ["Question: Second", "My answer: 2", "Question: First", "My answer: 1", "Question: Second", "My answer: 2"].join("\n\n"));
});

test("no lead-in: the copy starts at the first piece", () => {
	assert.equal(made("> [!activity|a] A\n\n> [!text|t] T\n\n> [!copy|of:t] Copy\n", { t: "x" }).text, "Question: T\n\nMy answer: x");
});

test("a word that names nothing is left out and returned, and nothing throws: an unknown id, an id/solution with no solution, an id/hint of an unknown question, a word that is not an id", () => {
	const body = "> [!activity|a] A\n\n> [!text|t] T\n\n> [!copy|of:gone,t,t/solution,nobody/hint,t/hint,/solution,a/b/c] Copy\n> Lead.\n";
	const r = made(body, { t: "x" });
	assert.equal(r.text, "Lead.\n\nQuestion: T\n\nMy answer: x");
	assert.deepEqual(r.missing, ["gone", "t/solution", "nobody/hint", "t/hint", "/solution", "a/b/c"]);
	const b = read(body);
	assert.equal(b.problems.length, 6, b.problems.join("\n"));
	assert.match(b.problems[0], /^Line 12: the copy line's `gone` names no question of this activity and no block of this module, so it is left out of what is copied\.$/);
});

test("a copy line with nothing left to copy is said and not drawn", () => {
	const b = read("> [!activity|a] A\n\n> [!text|t] T\n\n> [!copy|of:gone,t/hint] Copy\n> Lead.\n");
	assert.equal(copyOf(b), undefined);
	assert.equal(b.problems.at(-1), "Line 12: a copy line with nothing left to copy is not drawn.");
	assert.equal(b.activities[0].segments.filter((s) => s.type === "question").length, 1);
});

test("a copy line copies from its own activity: a question of another activity (even of the same module) is left out", () => {
	const body = "> [!module|m1] One\n\n> [!activity|a1] A1\n\n> [!text|t] First\n\n> [!copy|of:t,u] Copy\n\n> [!activity|a2] A2\n\n> [!text|u] Second\n\n> [!module|m1 end]\n";
	const t = note(body);
	const book = core.parseBooklet(t);
	const act = book.activities.find((a) => a.id === "a1");
	const r = core.copyText(book, act, act.segments.find((s) => s.type === "copy"), { answerOf: (q) => `typed ${q.id}` });
	assert.equal(r.text, "Question: First\n\nMy answer: typed t");
	assert.deepEqual(r.missing, ["u"]);
});

test("a copy line's own id is an ordinary id: used twice in a module, the note is refused as for any id", () => {
	const b = read("> [!activity|a] A\n\n> [!text|t] T\n\n> [!copy|t of:t] Copy\n");
	assert.equal(b.ok, false);
	assert.match(b.refusal ?? "", /the id "t" is used twice/);
});

/* ---- blocks with a ^id ---- */

const BLOCKS = `> [!activity|a] A

> [!text|t] T

> [!copy|of:rubric,t,notes] Copy
> Mark it.

\`\`\`text
Five points for the two bulges.

One more line.

\`\`\`
^rubric

\`\`\`json
{ "k": 1 }
\`\`\`

^notes
`;

test("a fenced block with a ^id is copied as its id, a colon, a line break and its text, the blank lines at its end off; the language does not matter", () => {
	const r = made(BLOCKS, { t: "x" });
	assert.equal(r.text, ["Mark it.", "rubric:\nFive points for the two bulges.\n\nOne more line.", "Question: T", "My answer: x", 'notes:\n{ "k": 1 }'].join("\n\n"));
	assert.deepEqual(r.missing, []);
});

test("only a fenced block is a block: a paragraph or a list marked ^id names nothing, so the line has nothing to copy and is not drawn", () => {
	const b = read("> [!activity|a] A\n\n> [!copy|of:para,list] Copy\n> Lead.\n\nWords. ^para\n\n- one\n\n^list\n");
	assert.equal(copyOf(b), undefined);
	assert.equal(b.blocks.length, 0);
	assert.equal(b.problems.length, 3);
});

test("a block in the module's own fence or data section is found first, then one in the shared data section; another module's block is not seen", () => {
	const fenced = (id, text) => `\`\`\`text\n${text}\n\`\`\`\n^${id}\n`;
	const body = [
		"> [!module|m1] One",
		"",
		"> [!activity|a1] A1",
		"",
		"> [!copy|of:r,shared,other,indata] Copy",
		"",
		fenced("r", "Own rubric."),
		"> [!data|m1] Data",
		"",
		fenced("indata", "In the module's data section."),
		"> [!module|m1 end]",
		"",
		"> [!module|m2] Two",
		"",
		"> [!activity|a2] A2",
		"",
		fenced("other", "Other module's."),
		"> [!module|m2 end]",
		"",
		"> [!data] Data",
		"",
		fenced("r", "Shared rubric."),
		fenced("shared", "Shared words."),
	].join("\n");
	const t = note(body);
	const book = core.parseBooklet(t);
	assert.deepEqual(book.problems.filter((p) => !p.includes("left out")), []);
	const act = book.activities[0];
	const r = core.copyText(book, act, act.segments.find((s) => s.type === "copy"), { answerOf: () => undefined });
	assert.equal(r.text, "r:\nOwn rubric.\n\nshared:\nShared words.\n\nindata:\nIn the module's data section.");
	assert.deepEqual(r.missing, ["other"]);
	assert.deepEqual(
		book.blocks.map((b) => [b.id, b.module]),
		[["r", "m1"], ["indata", "m1"], ["other", "m2"], ["r", null], ["shared", null]],
	);
});

test("a bare activity sees the shared blocks only", () => {
	const t = note("> [!activity|a] A\n\n> [!copy|of:s,m] Copy\n\n```text\nShared.\n```\n^s\n\n> [!module|m1] One\n\n```text\nIn a module.\n```\n^m\n\n> [!module|m1 end]\n");
	const book = core.parseBooklet(t);
	const r = core.copyText(book, book.activities[0], book.activities[0].segments.find((s) => s.type === "copy"), { answerOf: () => undefined });
	assert.equal(r.text, "s:\nShared.");
	assert.deepEqual(r.missing, ["m"]);
});

test("blocks in a comment or in the records section are not blocks", () => {
	const body = "> [!activity|a] A\n\n> [!copy|of:c1,s1] Copy\n\n<!--\n```text\nHidden.\n```\n^c1\n-->\n\n```text\nShown.\n```\n^s1\n";
	const book = core.parseBooklet(note(body));
	assert.deepEqual(
		book.blocks.map((b) => b.id),
		["s1"],
	);
});

/* ---- a note without it is untouched ---- */

test("a note that does not use it reads as it did: no copy segment, the same questions, and `hint`/`solution` null", () => {
	const b = read("> [!activity|a] A\n\n> [!text|t] T\n\n> [!choice|c] C\n- [ ] x\n");
	assert.equal(b.activities[0].segments.filter((s) => s.type === "copy").length, 0);
	assert.deepEqual(
		b.activities[0].segments.map((s) => [s.type, s.hint, s.solution]),
		[
			["question", null, null],
			["question", null, null],
		],
	);
});

test("a kind of 0.19 the plugin does not draw yet is still listed as unread (a kind it does not know)", () => {
	const b = read("> [!activity|a] A\n\n> [!dashboard|d] D\n");
	assert.equal(b.unread.length, 1);
	assert.match(b.unread[0].why, /"dashboard" is not a kind this view reads/);
});

/* ---- the view ---- */

/** A clipboard for the jsdom window: what was written, in order, or a refusal. */
function clipboard({ refuse = false } = {}) {
	const written = [];
	Object.defineProperty(w.navigator, "clipboard", {
		configurable: true,
		value: { writeText: (t) => (refuse ? Promise.reject(new Error("refused")) : (written.push(t), Promise.resolve())) },
	});
	return written;
}
const noClipboard = () => Object.defineProperty(w.navigator, "clipboard", { configurable: true, value: undefined });

const open = async (body = ESSAY) => {
	const p = pane(note(body), { screen: "activity:essay" });
	await p.settled();
	return Object.assign(p, {
		button: () => p.el.querySelector(".booklet-clip-button"),
		said: () => p.el.querySelector(".booklet-clip-said"),
		box: (kind) => p.el.querySelector(`[data-booklet-q="${kind}"] textarea`),
	});
};
const until = async (cond, what) => {
	for (let n = 0; n < 400; n++) {
		if (cond()) return;
		await new Promise((r) => setTimeout(r, 5));
	}
	throw new Error(`timed out waiting for ${what}`);
};

test("the view draws one real button with the callout's words, and a live region beside it that starts empty", async () => {
	const p = await open();
	const buttons = p.all(".booklet-clip-button");
	assert.equal(buttons.length, 1);
	assert.equal(buttons[0].tagName, "BUTTON");
	assert.equal(buttons[0].getAttribute("type"), "button");
	assert.equal(words(buttons[0]), "Copy for my tutor");
	const said = p.said();
	assert.equal(said.getAttribute("role"), "status");
	assert.equal(said.getAttribute("aria-live"), "polite");
	assert.equal(said.textContent, "");
	assert.ok(!p.el.textContent.includes("Please score my answer"), "the lead-in is for the clipboard, not drawn");
	assert.equal(p.view.getViewData(), p.disk.text);
});

test("a button with no words says Copy; Markdown marks in the words are not shown", async () => {
	const p = await open("> [!activity|essay] E\n\n> [!text|t] T\n\n> [!copy|c of:t] **Copy** my _words_\n\n> [!copy|d of:t]\n");
	assert.deepEqual(p.all(".booklet-clip-button").map(words), ["Copy my words", "Copy"]);
});

test("pressing it puts the text on the clipboard and says Copied in the live region; the note is not written to and nothing else is sent", async () => {
	const written = clipboard();
	const p = await open();
	const before = p.disk.text;
	const writes = p.disk.writes;
	click(p.button());
	await until(() => p.said().textContent === "Copied", "the Copied line");
	assert.equal(written.length, 1);
	assert.equal(written[0], made(ESSAY, {}).text);
	assert.equal(p.disk.text, before, "the note on disk is the note it was");
	assert.equal(p.disk.writes, writes, "nothing was written");
	assert.equal(p.view.getViewData(), before);
});

test("it copies what the reader typed even before the typed words are written, and writes nothing to do so", async () => {
	const written = clipboard();
	const p = await open();
	const box = p.box("why");
	assert.ok(box, "the text box");
	box.focus();
	typeInto(box, "Two bulges, near and far.");
	const writes = p.disk.writes;
	click(p.button());
	await until(() => written.length === 1, "the copy");
	assert.match(written[0], /My answer: Two bulges, near and far\.\n\nHint: /);
	assert.equal(p.disk.writes, writes, "pressing copy wrote nothing (the typed words are written by their own pause, not by this)");
});

test("an answer already in the note is copied; a choice is copied as the option's words", async () => {
	const written = clipboard();
	const text = core.setAnswer(core.setAnswer(note(ESSAY), "", "why", "Because."), "", "pick", 1);
	const p = pane(text, { screen: "activity:essay" });
	await p.settled();
	click(p.el.querySelector(".booklet-clip-button"));
	await until(() => written.length === 1, "the copy");
	assert.match(written[0], /My answer: Because\./);
	assert.match(written[0], /Question: Which pulls harder\?\n\nMy answer: The moon$/);
});

test("a word that names nothing is said in the line, and the copy goes without it", async () => {
	const written = clipboard();
	const p = await open("> [!activity|essay] E\n\n> [!text|t] T\n\n> [!copy|c of:t,nope] Copy\n");
	click(p.button());
	await until(() => p.said().textContent !== "", "the line");
	assert.equal(p.said().textContent, "Copied. Left out because nothing can be copied under this word: nope.");
	assert.equal(written[0], "Question: T\n\nMy answer: (no answer typed)");
});

test("after the press the same button is still there, and the line beside it holds its words", async () => {
	clipboard();
	const p = await open();
	const button = p.button();
	click(button);
	await until(() => p.said().textContent === "Copied", "the Copied line");
	assert.equal(p.button(), button, "the same button");
	assert.equal(p.said().matches(":empty"), false, "the line is not empty");
});

test("if the clipboard refuses, or there is none, the line says so and the text is shown in a read-only field, selected, for the reader to copy by hand", async () => {
	for (const set of [() => clipboard({ refuse: true }), noClipboard]) {
		set();
		const p = await open();
		click(p.button());
		await until(() => p.el.querySelector(".booklet-clip-text"), "the field");
		const field = p.el.querySelector(".booklet-clip-text");
		assert.equal(field.tagName, "TEXTAREA");
		assert.ok(field.hasAttribute("readonly"));
		assert.equal(field.getAttribute("aria-label"), "The text to copy");
		assert.equal(field.value, made(ESSAY, {}).text);
		assert.match(p.said().textContent, /^Could not copy automatically\. The text is below/);
		// a second press that works takes the field away
		clipboard();
		click(p.button());
		await until(() => p.said().textContent === "Copied", "Copied");
		assert.equal(p.el.querySelector(".booklet-clip-text"), null);
	}
});

test("a press makes no change to the note's text on disk for any of the paths", async () => {
	clipboard();
	const p = await open();
	const h = sha(p.disk.text);
	click(p.button());
	await p.settled();
	assert.equal(sha(p.disk.text), h);
});
