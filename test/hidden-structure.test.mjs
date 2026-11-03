/*
 * The owner's ruling: nothing commented out appears. A Booklet line of any kind (and a heading or footnote definition) that starts inside a
 * closed HTML comment, `<pre>` block or `$$` block is text a reader does not see, so it is not read as structure. The same line right after the
 * closer is read; an opener with no closer hides nothing, so a line after it is read and nothing is lost. LF and CRLF read alike. The records
 * section is not covered here: it is the plugin's own data section and is read from the raw file (see the last test). Every note is made up.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { build, core, norm } from "./helpers.mjs";

const head = `---\nbooklet: "0.18"\ntitle: Made up\n---\n\n`;
const asCrlf = (t) => t.replace(/\n/g, "\r\n");
const only = (nav) => [...nav.byKey.values()][0];

/** The three regions, each wrapped round some lines (hidden), each closed by something else first (the piece comes after the closer), each left open. */
const REGIONS = [
	{ name: "comment", wrap: (x) => `<!--\n${x}\n-->`, filler: "<!--\nold words\n-->", open: (x) => `<!-- oops\n${x}` },
	{ name: "pre", wrap: (x) => `<pre>\n${x}\n</pre>`, filler: "<pre>\nold words\n</pre>", open: (x) => `<pre>\n${x}` },
	{ name: "math", wrap: (x) => `$$\n${x}\n$$`, filler: "$$\nx\n$$", open: (x) => `$$ x\n${x}` },
];

const wordsOf = (book, id = "a") => (book.activities.find((a) => a.id === id)?.segments ?? []).filter((s) => s.type === "prose").map((s) => s.markdown).join("\n");

/** One kind of line: the note that holds `middle`, and whether the line was read from it. */
const KINDS = [
	{
		name: "activity line",
		piece: "> [!activity|hid] Hidden activity",
		note: (m) => `${head}> [!activity|a] A\n\nWords.\n\n${m}\n\nMore.\n`,
		read: ({ book }) => book.activities.some((a) => a.id === "hid"),
	},
	{
		name: "activity line in a file with no other (the file is then one activity)",
		piece: "> [!activity|hid] Hidden activity",
		note: (m) => `${head}Opening words.\n\n${m}\n\nMore.\n`,
		read: ({ book }) => book.activities.some((a) => a.id === "hid"),
	},
	{
		name: "module line",
		piece: "> [!module|hid] Hidden module",
		note: (m) => `${head}> [!activity|a] A\n\nWords.\n\n${m}\n\nMore.\n`,
		read: ({ book }) => book.modules.some((x) => x.id === "hid"),
	},
	{
		name: "tab line in an activity",
		piece: "> [!tab|hid] Hidden tab",
		note: (m) => `${head}> [!activity|a] A\n\nWords.\n\n${m}\n\nMore.\n`,
		read: ({ book, nav }) => book.activities[0].segments.some((s) => s.type === "tab") && only(nav).tabs.some((t) => t.id === "hid"),
	},
	{
		name: "tab line in a module's opening",
		piece: "> [!tab|hid] Hidden tab",
		note: (m) => `${head}> [!module|m] M\n\nOpening.\n\n${m}\n\nTab words.\n\n> [!activity|a] A\n\nWords.\n`,
		read: ({ nav }) => nav.mods[0].tabs.some((t) => t.id === "hid"),
	},
	{
		name: "notice line in a module's opening",
		piece: "> [!notice]\n> license: CC-BY-4.0",
		note: (m) => `${head}> [!module|m] M\n\nOpening.\n\n${m}\n\n> [!activity|a] A\n\nWords.\n`,
		read: ({ nav }) => nav.mods[0].notice.length > 0,
	},
	{
		name: "question line",
		piece: "> [!text|hid] Hidden question",
		note: (m) => `${head}> [!activity|a] A\n\nWords.\n\n${m}\n\nMore.\n`,
		read: ({ book }) => core.questionsOf(book.activities[0]).some((q) => q.id === "hid"),
	},
	{
		name: "row line",
		piece: "> [!row]",
		note: (m) => `${head}> [!activity|a] A\n\nWords.\n\n${m}\n\nMore.\n`,
		read: ({ book }) => book.activities[0].segments.some((s) => s.type === "row"),
	},
	{
		name: "group line (a container)",
		piece: "> [!group]\n> Inside.",
		note: (m) => `${head}> [!activity|a] A\n\nWords.\n\n${m}\n\nMore.\n`,
		read: ({ book }) => book.activities[0].segments.some((s) => s.type === "callout"),
	},
	{
		name: "data line (it ends the activity's prose)",
		piece: "> [!data]",
		note: (m) => `${head}> [!activity|a] A\n\nWords.\n\n${m}\n\nMore words after.\n`,
		read: ({ book }) => !wordsOf(book).includes("More words after."),
	},
	{
		name: "folded callout (counted as something to read)",
		piece: "> [!note]- Hidden fold\n> Folded words.",
		note: (m) => `${head}> [!activity|a] A\n\nWords.\n\n${m}\n\nMore.\n`,
		read: ({ nav }) => only(nav).reads > 0,
	},
	{
		name: "footnote definition",
		piece: "[^hid]: Hidden note words.",
		note: (m) => `${head}> [!activity|a] A\n\nWords[^hid].\n\n${m}\n\nMore.\n`,
		read: ({ book }) => book.notes.some((n) => n.id === "hid"),
	},
	{
		name: "heading as a link target",
		piece: "## Hidden heading",
		note: (m) => `${head}> [!activity|a] A\n\nWords.\n\n${m}\n\nMore.\n`,
		read: ({ nav }) => core.findHeading(nav, "Hidden heading", null) !== null,
	},
	{
		name: "callout title as a link target",
		piece: "> [!note] Hidden title",
		note: (m) => `${head}> [!activity|a] A\n\nWords.\n\n${m}\n\nMore.\n`,
		read: ({ nav }) => core.findHeading(nav, "Hidden title", null) !== null,
	},
];

for (const kind of KINDS) {
	test(`${kind.name}: not read inside a closed comment, <pre> or $$ block; read after the closer; read after an opener that never closes (LF and CRLF)`, () => {
		for (const [eol, f] of [["LF", (t) => t], ["CRLF", asCrlf]]) {
			const readOf = (middle) => {
				const text = f(kind.note(middle));
				return kind.read(build(text));
			};
			for (const r of REGIONS) {
				assert.equal(readOf(r.wrap(kind.piece)), false, `${kind.name} inside a ${r.name} (${eol}) is not read`);
				assert.equal(readOf(`${r.filler}\n${kind.piece}`), true, `${kind.name} right after the ${r.name}'s closer (${eol}) is read`);
				assert.equal(readOf(r.open(kind.piece)), true, `${kind.name} after a ${r.name} that never closes (${eol}) is read`);
			}
			// a one-line comment: the line does not start inside it, and a line wholly inside it is not a line start
			assert.equal(readOf(`<!-- ${kind.piece.split("\n")[0]} -->`), false, `${kind.name} written inside a one-line comment (${eol}) is not read`);
			// a line in a fenced code block is no structure either, as before
			assert.equal(readOf(`\`\`\`\n${kind.piece}\n\`\`\``), false, `${kind.name} in a fenced block (${eol}) is not read`);
		}
	});
}

test("a hidden Booklet line says nothing among the note's problems (not 'starts like a Booklet line but cannot be read', not 'cannot go inside a callout')", () => {
	const pieces = ["> [!shiny|x] Hidden unknown", "> [!tab|hid] T", "> [!text] No id", "> [!module|hid end]"];
	for (const r of REGIONS) {
		for (const piece of pieces) {
			const text = `${head}> [!activity|a] A\n\nWords.\n\n> [!group]\n> ${r.wrap(piece).replace(/\n/g, "\n> ")}\n\n${r.wrap(piece)}\n`;
			const { book, nav } = build(text);
			const said = [...book.problems, ...nav.problems, ...book.unread.map((u) => u.why)].filter((p) => /Booklet line|cannot go inside|no id|not a kind/.test(p));
			assert.deepEqual(said, [], `${r.name}: ${piece}`);
		}
	}
});

test("a closed comment that holds a whole commented-out tab and its question does not split the visible words around it", () => {
	const text = `${head}> [!activity|a] A\n\nFirst words.\n\n<!--\n> [!tab|old] Old tab\n\n> [!text|oldq] Old question\n-->\n\nLast words.\n`;
	const { book, nav } = build(text);
	assert.deepEqual(only(nav).tabs.map((t) => t.id), [""]);
	assert.deepEqual(core.questionsOf(book.activities[0]), []);
	const prose = wordsOf(book);
	assert.ok(prose.includes("First words.") && prose.includes("Last words.") && prose.includes("Old tab"), "the comment stays in the prose, for Obsidian to hide");
});

test("the records section is still read from the raw file: a closer in a saved answer cannot hide it, and an opener in the body cannot be closed by it", () => {
	// an opener before the records section, and a '-->' inside a saved answer: the opener has no closer in the body, so it hides nothing, the
	// question is read, and the records are still found
	const rec = (answer) =>
		`${head}> [!activity|a] A\n\nWords. <!-- a stray opener\n\n> [!text|q1] Question\n\n%%\n> [!records] App record — do not edit below this line\n\n\`\`\`booklet answers\n{"q1": ${JSON.stringify(answer)}}\n\`\`\`\n%%\n`;
	const book = core.parseBooklet(rec("see --> here"));
	assert.equal(book.records.regions.length, 1, "the records region is found");
	assert.deepEqual(norm(book.records.answers[""]), { q1: "see --> here" }, "and its answer is read");
	assert.deepEqual(core.questionsOf(book.activities[0]).map((q) => q.id), ["q1"], "the question is read: the comment 'closes' only inside the saved answer, which is not looked into");
	// writing an answer to a note whose records line follows a closed comment still lands in the one region
	const text = `${head}> [!activity|a] A\n\n<!--\nold\n-->\n> [!text|q1] Question\n\n%%\n> [!records] App record — do not edit below this line\n\n\`\`\`booklet answers\n{"q1": "x"}\n\`\`\`\n%%\n`;
	const out = core.setAnswer(text, "", "q1", "y");
	assert.ok(out.includes('"q1": "y"') || out.includes('"q1":"y"'), out);
	assert.equal(out.split("[!records").length, 2, "one records line");
});

/** The ids of the questions of the first activity of a note, in order. */
const qIds = (text) => core.questionsOf(core.parseBooklet(text).activities[0]).map((q) => q.id);
const act = (body) => `${head}> [!activity|a] A\n\n${body}\n`;
const Q1 = "> [!text|q1] Question one";
const Q2 = "> [!text|q2] Question two";

for (const [name, opener, answer] of [
	["a comment opener, an answer holding -->", "Words <!-- (author aside)", "see --> here"],
	["a lone $$, an answer holding $$", "Costs $$ here.", "it costs $$"],
	["a <pre> opener, an answer holding </pre>", "Use <pre> for code.", "a </pre> tag"],
]) {
	test(`defect A: ${name}: the reader's saved answer does not make the questions vanish (LF and CRLF)`, () => {
		for (const [eol, f] of [["LF", (t) => t], ["CRLF", asCrlf]]) {
			const text = f(act(`${opener}\n\n${Q1}\n\n${Q2}`));
			assert.deepEqual(qIds(text), ["q1", "q2"], `(${eol}): both questions are read before any answer`);
			const saved = core.setAnswer(text, "", "q1", answer);
			assert.ok(saved.includes("[!records"), "the answer was written to the records section");
			assert.deepEqual(qIds(saved), ["q1", "q2"], `(${eol}): both questions are still read after the answer is saved`);
			assert.equal(core.parseBooklet(saved).records.answers[""]?.q1, answer, `(${eol}): the answer is read back, not orphaned`);
		}
	});
}

test("defect A: a body opener that really closes in the body still hides what it should, with records full of closers below it (LF and CRLF)", () => {
	for (const [eol, f] of [["LF", (t) => t], ["CRLF", asCrlf]]) {
		for (const r of REGIONS) {
			const text = f(act(`${r.wrap(Q1)}\n\n${Q2}`));
			assert.deepEqual(qIds(text), ["q2"], `${r.name} (${eol}): the question inside is hidden`);
			const saved = core.setAnswer(text, "", "q2", "a --> b </pre> $$ c");
			assert.deepEqual(qIds(saved), ["q2"], `${r.name} (${eol}): and still after an answer holding every closer is saved`);
		}
	}
});

for (const [name, body] of [
	["input A, a lone $$ in prose and $$ in a fenced block", `Costs $$ here.\n\n${Q1}\n\n\`\`\`sh\necho $$\n\`\`\`\n\n${Q2}`],
	["input B, a stray <!-- in prose and a comment in a fenced block", `Use <!-- for comments.\n\n${Q1}\n\n\`\`\`html\n<!-- x -->\n\`\`\`\n\n${Q2}`],
	["a stray <pre> in prose and </pre> in a fenced block", `Use <pre> for code.\n\n${Q1}\n\n\`\`\`html\n</pre>\n\`\`\`\n\n${Q2}`],
	["an opener inside a fenced block opens nothing", `\`\`\`html\n<!--\n\`\`\`\n\n${Q1}\n\n<!-- real -->\n\n${Q2}`],
]) {
	test(`defect B: ${name}: text in a fenced code block is code, so it neither opens nor closes anything (LF and CRLF)`, () => {
		for (const [eol, f] of [["LF", (t) => t], ["CRLF", asCrlf]]) assert.deepEqual(qIds(f(act(body))), ["q1", "q2"], eol);
	});
}

test("a mark that starts its line opens a block that a fence line inside it does not end; a mark further along a line is cut off by a fence line (LF and CRLF)", () => {
	for (const [eol, f] of [["LF", (t) => t], ["CRLF", asCrlf]]) {
		// a comment that starts its line holds the fence line, even one that never closes, and closes at its own -->
		assert.deepEqual(qIds(f(act(`<!--\n\`\`\`\n${Q1}\n-->\n\n${Q2}`))), ["q2"], `a fence line inside a block comment is part of it (${eol})`);
		assert.deepEqual(qIds(f(act(`  <!-- indented\n${Q1}\n\`\`\`\n-->\n\n${Q2}`))), ["q2"], `the comment closes at the first --> even where a fence would be (${eol})`);
		// the same words after other text on their line: the fence line cuts the paragraph, and the comment never closes
		assert.deepEqual(qIds(f(act(`Text <!--\n${Q1}\n\`\`\`\n-->\n\`\`\`\n\n${Q2}`))), ["q1", "q2"], `a fence line ends a mark that sits further along its line (${eol})`);
		// ... but a closer before any fence still closes it
		assert.deepEqual(qIds(f(act(`Text <!--\n${Q1}\n-->\n\n${Q2}`))), ["q2"], `a closer before any fence closes it (${eol})`);
	}
});

test("the owner has not ruled on two far-apart $$ marks in prose: they pair, and what lies between them is hidden (documents today's behaviour)", () => {
	const text = act(`Costs $$ here.\n\n${Q1}\n\nand $$ there.\n\n${Q2}`);
	assert.deepEqual(qIds(text), ["q2"], "q1 lies between the two marks");
});

test("known gap: a `> [!records` line inside a comment still starts the records section, as the raw scan finds it (documents today's behaviour)", () => {
	const text = act(`<!--\n> [!records]\n\n\`\`\`booklet answers\n{"q1": "x"}\n\`\`\`\n-->\n\n${Q1}`);
	const book = core.parseBooklet(text);
	assert.equal(book.records.regions.length, 1, "the commented-out records line starts a region");
	assert.deepEqual(core.questionsOf(book.activities[0]).map((q) => q.id), [], "so q1, which lies inside that region, is not a question");
});

/*
 * The checks that read the hidden lines in the parser and the navigation model, one test each (each fails when its check is taken out).
 */

test("a callout whose only question line is commented out is no container: it stays prose and holds no question", () => {
	for (const f of [(t) => t, asCrlf]) {
		const { book } = build(f(`${head}> [!activity|a] A\n\n> [!note]- Callout\n> <!--\n> > [!text|hid] Hidden question\n> -->\n> Visible words.\n\nMore.\n`));
		assert.deepEqual(book.activities[0].segments.map((s) => s.type), ["prose"], "no callout container, no question inside it");
		assert.deepEqual(core.questionsOf(book.activities[0]), []);
	}
});

test("a folded callout whose only question line is commented out still counts as something to read", () => {
	for (const f of [(t) => t, asCrlf]) {
		const { nav } = build(f(`${head}> [!activity|a] A\n\n> [!note]- Callout\n> <!--\n> > [!text|hid] Hidden question\n> -->\n> Visible words.\n\nMore.\n`));
		assert.equal(only(nav).reads, 1);
	}
});

test("a note whose only activity line is commented out is no structure file: its words are the one activity named by the title", () => {
	for (const f of [(t) => t, asCrlf]) {
		const { book } = build(f(`${head}Words.\n\n<!--\n> [!activity|hid] Hidden activity\n-->\n\nMore.\n`));
		assert.deepEqual(book.activities.map((a) => [a.id, a.title]), [["", "Made up"]]);
	}
});

test("a note whose only module line is commented out is no structure file either", () => {
	const { book } = build(`${head}Words.\n\n<pre>\n> [!module|hid] Hidden module\n</pre>\n\nMore.\n`);
	assert.deepEqual(book.modules, []);
	assert.deepEqual(book.activities.map((a) => a.id), [""]);
});

test("a fence line inside a comment in a module's opening opens nothing: the tab line after the comment is still read (LF and CRLF)", () => {
	for (const f of [(t) => t, asCrlf]) {
		const { nav } = build(f(`${head}> [!module|m] M\n\nOpening.\n\n<!--\n\`\`\`\n-->\n\n> [!tab|t] Tab\n\nTab words.\n\n> [!activity|a] A\n\nWords.\n`));
		assert.deepEqual(nav.mods[0].tabs.map((t) => t.id), ["t"]);
	}
});
