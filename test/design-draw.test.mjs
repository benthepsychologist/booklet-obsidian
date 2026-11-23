/*
 * The Design view draws a question as a reader sees it with nothing answered, and a reading callout as a callout, and neither can change
 * anything (stage C). Run in node over jsdom with the stand-in for Obsidian: how the drawings look, and how Obsidian lays them out, is
 * measured in the real app, which this is not. What it says is what the code does with the controls and the host it hands them.
 */
import { window as w, click, words, typeInto } from "./dom.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { bookletAround, ROOT } from "./helpers.mjs";
import { FULL } from "./design-fixtures.mjs";
import { openDesign, observerCount, doc } from "./design-harness.mjs";

const { drawInertQuestion, drawInertReading, questionOfPiece, drawnByLine } = await import("./.build/view.mjs");
const { PIECES, parseDesign, walkDesign } = (await import("./helpers.mjs")).core;

/** Every kind the drawing code draws, a menu, and the three kept as cards, in one activity. */
const KINDS = bookletAround(
	[
		"> [!activity|all] Every kind",
		"",
		"> [!choice|c] Pick one",
		"- [ ] Cats",
		"- [ ] Dogs",
		"",
		"> [!multi|m] Pick some",
		"- [ ] Red",
		"- [ ] Blue",
		"",
		"> [!matrix|mx] How was the week?",
		"",
		"- Sleep",
		"- Energy",
		"",
		"1. Poor",
		"2. Fine",
		"3. Good",
		"",
		"> [!lines|l] Three good things",
		"",
		"> [!text|t] Your words",
		"",
		"> [!text|tl long] Your long words",
		"",
		"> [!number|n min:0 max:24] How many hours?",
		"",
		"> [!scale|s] How much?",
		"",
		"0. None",
		"1. Lots",
		"",
		"> [!date|d] When?",
		"",
		"> [!menu|menu1]",
		"- Alpha",
		"- Beta",
		"",
		"> [!multi|fromMenu menu:menu1] From a menu",
		"",
		"> [!choice|own open] Add your own",
		"- [ ] One",
		"",
		"> [!listen|lst] A recording",
		"> ![The recording](https://media.example.org/r.m4a)",
		"",
		"> [!choice|source] Pick a source",
		"- [ ] Alpha",
		"- [ ] Beta",
		"",
		"> [!text|eachq each:source] Why this one?",
		"",
		"> [!tip] A tip",
		"> Some words in the tip.",
		"",
		"> [!hint]- Hint",
		"> A hint.",
		"",
		"> [!copy|cp of:t] Copy my words",
		"> Please read.",
		"",
	].join("\n"),
);

/** The block of the page drawn now that holds the inert drawing of question `id`. */
const inertOf = (v, id) => v.all(`.booklet-design-block[data-kind="question"]`).find((b) => b.querySelector(`[data-booklet-q="${id}"]`));
const controls = (el) => [...el.querySelectorAll("button, input, textarea, select")];

test("every question kind the drawing code has is drawn on its page as a reader sees it, inside an inert wrapper, with every control off", () => {
	const v = openDesign(KINDS);
	v.go("Every kind");
	for (const id of ["c", "m", "mx", "l", "t", "tl", "n", "s", "d", "fromMenu", "own"]) {
		const box = inertOf(v, id);
		assert.ok(box, `${id} is drawn`);
		const wrap = box.querySelector(":scope > .booklet-design-drawn > .booklet-sample");
		assert.ok(wrap, `${id}: in an inert wrapper`);
		assert.ok(wrap.hasAttribute("inert"), `${id}: with the inert attribute`);
		assert.ok(wrap.classList.contains("booklet-sample-question"));
		assert.ok(controls(wrap).length > 0, `${id}: has controls`);
		assert.ok(controls(wrap).every((c) => c.disabled), `${id}: every control is off`);
		// a drawing is the whole of the block: no head, no card, and no Markdown under it
		assert.equal(box.querySelector("pre, .booklet-design-friendly, .booklet-design-lines"), null, `${id}: no card, a drawing`);
	}
	// what each draws: the options, the anchors, the items
	assert.deepEqual([...inertOf(v, "c").querySelectorAll("button.booklet-choice")].map(words), ["Cats", "Dogs"]);
	assert.deepEqual([...inertOf(v, "m").querySelectorAll("button.booklet-choice")].map(words), ["Red", "Blue"]);
	assert.deepEqual([...inertOf(v, "mx").querySelectorAll(".booklet-mxwords")].map(words), ["Sleep", "Energy"]);
	assert.ok(inertOf(v, "l").querySelector("input.booklet-line"));
	assert.ok(inertOf(v, "t").querySelector("input.booklet-text"));
	assert.ok(inertOf(v, "tl").querySelector("textarea.booklet-long"));
	assert.equal(inertOf(v, "n").querySelector("input[type=number]").getAttribute("max"), "24");
	assert.ok(inertOf(v, "d").querySelector("input[type=date]"));
	assert.deepEqual([...inertOf(v, "fromMenu").querySelectorAll("button.booklet-choice")].map(words), ["Alpha", "Beta"], "a shared menu's options are found");
	v.close();
});

test("a listen and a question asked for each pick are drawn, as a reader sees them, and say nothing of a later beta (stage 5; test/design-stage5-listen.test.mjs holds the rest)", () => {
	const v = openDesign(KINDS);
	v.go("Every kind");
	for (const id of ["lst", "eachq"]) {
		const box = inertOf(v, id);
		assert.ok(box?.querySelector(":scope > .booklet-design-drawn > .booklet-sample[inert]"), `${id}: drawn inside the inert wrapper`);
		assert.equal(box.querySelector(".booklet-design-friendly, pre"), null, `${id}: no card, never Markdown`);
		assert.doesNotMatch(words(box), /later beta/);
		assert.ok(controls(box).every((c) => c.disabled), `${id}: every control is off`);
	}
	assert.equal(words(inertOf(v, "lst").querySelector(".booklet-listen-media")), "The recording (https://media.example.org/r.m4a)", "the media is its words and address, never a player");
	assert.equal(inertOf(v, "lst").querySelector("audio, video, iframe, img, a"), null);
	v.close();
});

test("reading callouts are rendered as callouts; a copy button, a menu and a data block stay friendly cards", () => {
	const seen = [];
	globalThis.__bookletStubRender = (markdown, el) => {
		seen.push(markdown);
		el.appendText(markdown);
	};
	try {
		const v = openDesign(KINDS);
		v.go("Every kind");
		const tip = v.block("callout", "[!tip] A tip");
		const wrap = tip.querySelector(":scope > .booklet-design-drawn > .booklet-sample-reading");
		assert.ok(wrap, "the tip is drawn");
		assert.ok(wrap.hasAttribute("inert"));
		assert.ok(seen.includes("> [!tip] A tip\n> Some words in the tip."), "through MarkdownRenderer.render, from the block's own lines");
		assert.equal(words(wrap), "> [!tip] A tip > Some words in the tip.");
		const copy = v.block("callout", "[!copy|cp");
		assert.equal(copy.querySelector(".booklet-sample"), null);
		assert.equal(words(copy.querySelector(".booklet-design-friendly-kind")), "Copy button");
		assert.equal(copy.querySelector("pre"), null, "the copy button is a card");
		const menu = v.block("menu", "[!menu|menu1]");
		assert.equal(words(menu.querySelector(".booklet-design-friendly-kind")), "Menu");
		assert.equal(menu.querySelector("pre"), null);
		v.close();
		// views and data stay cards
		const full = openDesign(FULL);
		full.go("Data for Money");
		const fences = full.all('.booklet-design-block[data-kind="fence"], .booklet-design-block[data-kind="query"]');
		assert.ok(fences.length >= 1);
		for (const n of fences) {
			assert.ok(n.querySelector(".booklet-design-friendly"));
			assert.equal(n.querySelector("pre"), null);
		}
		full.close();
	} finally {
		delete globalThis.__bookletStubRender;
	}
});

test("a reading callout that points at media on another site is a card, and nothing is fetched", () => {
	const text = bookletAround("> [!activity|a] A\n\n> [!note] A picture\n> ![alt](https://example.org/p.png)\n\nWords ![x](https://example.org/q.png) of prose.\n");
	const requests = [];
	const v = openDesign(text);
	v.go("A");
	const note = v.all('.booklet-design-block[data-kind="callout"]')[0];
	assert.equal(note.querySelector(".booklet-sample"), null, "not drawn");
	assert.match(words(note.querySelector(".booklet-design-friendly-note")), /nothing is fetched/);
	assert.equal(note.querySelector("pre"), null, "and it is a card, not Markdown");
	assert.equal(note.querySelector("img"), null);
	// the prose too is words, not a fetch
	assert.equal(v.all(".booklet-design-prose img").length, 0);
	assert.deepEqual(requests, []);
	v.close();
});

test("no live control writes: presses and events at every control change nothing, the note is byte-identical, and no write reaches the vault", () => {
	const v = openDesign(KINDS);
	v.go("Every kind");
	const before = v.disk.text;
	const wraps = v.all(".booklet-sample-question");
	assert.ok(wraps.length >= 11);
	for (const wrap of wraps)
		for (const c of controls(wrap)) {
			// a person's press (a disabled control gets none) and what a script can make: both leave the note as it was
			c.click();
			click(c);
			typeInto(c, "typed by a script");
			for (const type of ["input", "change", "keydown", "keyup", "blur", "focusin", "focusout", "pointerdown", "mousedown"]) c.dispatchEvent(new w.Event(type, { bubbles: true, cancelable: true }));
			c.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
		}
	assert.equal(v.disk.writes, 0, "no write reached the vault");
	assert.equal(v.disk.text, before, "the note is byte-identical");
	assert.equal(v.view.getViewData(), before);
	assert.equal(v.status(), "", "the view said nothing");
	v.close();
});

test("the stand-in host is the guard that holds when the others do not: a call straight into it is recorded and discarded, and shows nothing kept", () => {
	const app = { vault: {}, workspace: {} };
	const owner = { register() {} };
	const into = doc.body.createDiv();
	const q = questionOfPiece(PIECES.find((p) => p.file === "Q - choice.md").text);
	const drawn = drawInertQuestion({ app, owner, sourcePath: "", into }, q.activity, q.question);
	assert.ok(drawn);
	// a control's handler is reached on the host (not through the wrapper) as a script that took the handler off the page would
	drawn.host.answer({ scope: "", activity: q.activity }, q.question, 2);
	drawn.host.typed({ scope: "", activity: q.activity }, q.question, ["x"]);
	drawn.host.hold("k", "words");
	drawn.host.keepOwn("k", { scope: "", activity: q.activity }, () => {});
	assert.deepEqual(drawn.writes.map((x) => x.method), ["answer", "typed", "hold", "keepOwn"]);
	assert.equal(drawn.host.answerOf({ scope: "", activity: q.activity }, q.question), undefined, "it keeps nothing, so a kept answer is never shown");
	assert.equal(drawn.card.querySelector(".is-selected"), null);
	into.remove();
});

test("a reader's kept answers are never shown in a drawing: a note that holds answers and entries is drawn empty", () => {
	const v = openDesign(FULL);
	v.go("Spending");
	assert.match(FULL, /"spent": "a lot"/, "the note holds an answer");
	const spent = inertOf(v, "spent");
	assert.equal(spent.querySelector("input.booklet-text").value, "");
	assert.ok(!words(v.el.querySelector(".booklet-sample")).includes("a lot"));
	for (const sel of v.all(".booklet-sample .is-selected, .booklet-sample [aria-pressed=true]")) assert.fail("something is shown picked: " + sel.className);
	v.close();
});

test("the drawing code is found by the line each question is on, as the tree counts lines", () => {
	const byLine = drawnByLine(KINDS).questions;
	const tree = walkDesign(parseDesign(KINDS)).filter((n) => n.kind === "question");
	assert.ok(tree.length >= 14);
	for (const n of tree) assert.equal(byLine.get(n.start)?.question.id, n.id, `${n.id} at ${n.start}`);
	// a note that is no booklet draws no question
	assert.equal(drawnByLine("Some words.\n").questions.size, 0);
});

test("an observer made for a matrix is let go of with the drawing: made and live counts over many redraws of the tree", () => {
	const obs = observerCount();
	try {
		const v = openDesign(KINDS);
		// the view's own watcher of its pane's width is one observer, made once; the booklet's page draws no matrix
		assert.equal(obs.made, 1, "the pane's own observer");
		v.go("Every kind");
		assert.equal(obs.made, 2, "one matrix, one observer");
		for (let i = 0; i < 20; i++) v.go("Every kind");
		assert.equal(obs.made, 22, "a new one at each of the 21 drawings of that page");
		assert.equal(obs.live, 2, "only the last drawing's is connected, and the pane's");
		v.close();
		assert.equal(obs.live, 0, "none when the view is gone");
		assert.equal(obs.made, obs.disconnected);
	} finally {
		obs.off();
	}
});

test("a sample's matrix, drawn and taken away many times, leaves no observer: the count of connected and disconnected over 50 drawings", () => {
	const obs = observerCount();
	try {
		const app = { vault: {}, workspace: {} };
		const matrix = questionOfPiece(PIECES.find((p) => p.file === "Q - matrix.md").text);
		for (let i = 0; i < 50; i++) {
			const registered = [];
			const owner = { register: (f) => void registered.push(f) };
			const into = doc.body.createDiv();
			assert.ok(drawInertQuestion({ app, owner, sourcePath: "", into }, matrix.activity, matrix.question));
			assert.equal(obs.live, 1, "connected while drawn");
			for (const f of registered) f();
			into.remove();
			assert.equal(obs.live, 0, "disconnected when the drawing's owner is unloaded");
		}
		assert.equal(obs.made, 50);
		assert.equal(obs.disconnected, 50);
	} finally {
		obs.off();
	}
});

test("the inert wrapper drops every event aimed at a control before its handler: the wrapper's own class, attribute and listeners", () => {
	const app = { vault: {}, workspace: {} };
	const owner = { register() {} };
	const into = doc.body.createDiv();
	const q = questionOfPiece(PIECES.find((p) => p.file === "Q - text.md").text);
	const drawn = drawInertQuestion({ app, owner, sourcePath: "", into }, q.activity, q.question);
	const field = drawn.card.querySelector("input");
	typeInto(field, "x");
	field.dispatchEvent(new w.Event("blur", { bubbles: false }));
	assert.deepEqual(drawn.writes, [], "the script's events never reached the drawing's handlers");
	into.remove();
	// reading: the wrapper is inert too
	const rd = drawInertReading({ app, owner, sourcePath: "", into: doc.body.createDiv() }, "> [!tip] T\n> words");
	assert.ok(rd.hasAttribute("inert") && rd.classList.contains("booklet-sample"));
});

test("the styles that are scoped under .booklet-view apply to a drawing: the look variables, the dark field border, and every callout rule", () => {
	const css = readFileSync(`${ROOT}/styles.base.css`, "utf8");
	// every rule that names .booklet-view for the look of a card or a callout also names .booklet-sample (the focus ring, the touch size and the motion rules are for what a person presses, and a drawing is not pressed)
	for (const sel of [".booklet-view .callout", ".booklet-view .callout-title", '.booklet-view .callout[data-callout="diff"]', '.booklet-view .callout[data-callout="law"]', '.booklet-view .callout[data-callout="opinion"]', ".booklet-view.booklet-callout-triplet .callout", ".theme-dark .booklet-view .booklet-text"]) {
		const sample = sel.replace(".booklet-view", ".booklet-sample");
		assert.ok(css.includes(sample), `${sample} is a selector of the sheet`);
	}
	assert.match(css, /\.booklet-view,\n\.booklet-sample \{\n\t--booklet-card-bg/);
	assert.match(css, /\.booklet-sample \{\n\tpointer-events: none;/);
});
