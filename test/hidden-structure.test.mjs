/*
 * The owner's ruling: nothing commented out appears. A Booklet line of any kind (and a heading or footnote definition) that starts inside a
 * closed HTML comment, Obsidian `%%` comment, `<pre>` block or `$$` block is text a reader does not see, so it is not read as structure. The same line right after the
 * closer is read; an opener with no closer hides nothing, so a line after it is read and nothing is lost. LF and CRLF read alike. The records
 * section is not covered here: it is the plugin's own data section and is read from the raw file (see the last test). Every note is made up.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { build, core, norm } from "./helpers.mjs";

const head = `---\nbooklet: "0.18"\ntitle: Made up\n---\n\n`;
const asCrlf = (t) => t.replace(/\n/g, "\r\n");
const only = (nav) => [...nav.byKey.values()][0];

/** The four regions, each wrapped round some lines (hidden), each closed by something else first (the piece comes after the closer), each left open. */
const REGIONS = [
	{ name: "comment", wrap: (x) => `<!--\n${x}\n-->`, filler: "<!--\nold words\n-->", open: (x) => `<!-- oops\n${x}` },
	// Obsidian's own comment, ruled in with the HTML one: "add %% comments to 1.0.0 as a comment too" (the owner)
	{ name: "percent comment", wrap: (x) => `%%\n${x}\n%%`, filler: "%%\nold words\n%%", open: (x) => `%% oops\n${x}` },
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
	test(`${kind.name}: not read inside a closed comment, %% comment, <pre> or $$ block; read after the closer; read after an opener that never closes (LF and CRLF)`, () => {
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
			assert.equal(readOf(`%% ${kind.piece.split("\n")[0]} %%`), false, `${kind.name} written inside a one-line %% comment (${eol}) is not read`);
			// a line in a fenced code block is no structure either, as before
			assert.equal(readOf(`\`\`\`\n${kind.piece}\n\`\`\``), false, `${kind.name} in a fenced block (${eol}) is not read`);
			// a %% in a fenced block is code: it opens nothing, so the line after it is read (and a %% pair round a fence hides the fence)
			assert.equal(readOf(`\`\`\`\n%%\n\`\`\`\n\n${kind.piece}`), true, `${kind.name} after a %% inside a fenced block (${eol}) is read`);
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
	["a %% opener, an answer holding %%", "Words %% (author aside)", "see %% here"],
	["a %% opener that starts its line, an answer holding %%", "%% an aside", "it was 50%% sure"],
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
			const saved = core.setAnswer(text, "", "q2", "a --> b </pre> $$ c %% d");
			assert.deepEqual(qIds(saved), ["q2"], `${r.name} (${eol}): and still after an answer holding every closer is saved`);
		}
	}
});

for (const [name, body] of [
	["input A, a lone $$ in prose and $$ in a fenced block", `Costs $$ here.\n\n${Q1}\n\n\`\`\`sh\necho $$\n\`\`\`\n\n${Q2}`],
	["input B, a stray <!-- in prose and a comment in a fenced block", `Use <!-- for comments.\n\n${Q1}\n\n\`\`\`html\n<!-- x -->\n\`\`\`\n\n${Q2}`],
	["a stray <pre> in prose and </pre> in a fenced block", `Use <pre> for code.\n\n${Q1}\n\n\`\`\`html\n</pre>\n\`\`\`\n\n${Q2}`],
	["a stray %% in prose and %% in a fenced block", `Said 50%% off.\n\n${Q1}\n\n\`\`\`\n%% x\n\`\`\`\n\n${Q2}`],
	["a %% opener inside a fenced block opens nothing", `\`\`\`\n%%\n\`\`\`\n\n${Q1}\n\n%% real %%\n\n${Q2}`],
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
		// the same four readings for a %% comment
		assert.deepEqual(qIds(f(act(`%%\n\`\`\`\n${Q1}\n%%\n\n${Q2}`))), ["q2"], `a fence line inside a block %% comment is part of it (${eol})`);
		assert.deepEqual(qIds(f(act(`  %% indented\n${Q1}\n\`\`\`\n%%\n\n${Q2}`))), ["q2"], `the %% comment closes at the first %% even where a fence would be (${eol})`);
		assert.deepEqual(qIds(f(act(`Text %%\n${Q1}\n\`\`\`\n%%\n\`\`\`\n\n${Q2}`))), ["q1", "q2"], `a fence line ends a %% that sits further along its line (${eol})`);
		assert.deepEqual(qIds(f(act(`Text %%\n${Q1}\n%%\n\n${Q2}`))), ["q2"], `a closer before any fence closes a %% too (${eol})`);
	}
});

// The owner ruled to leave this as it is: "leave $$ as it is. it's an obsidian problem" (Obsidian itself pairs the two marks).
test("two far-apart $$ marks in prose pair, and what lies between them is hidden; the owner ruled to leave it so (a known behaviour)", () => {
	const text = act(`Costs $$ here.\n\n${Q1}\n\nand $$ there.\n\n${Q2}`);
	assert.deepEqual(qIds(text), ["q2"], "q1 lies between the two marks");
});

// The owner ruled: "leave the records oddity and note as a known gap". README lists it among the known limits.
test("known gap: a `> [!records` line inside a comment still starts the records section, as the raw scan finds it (documents today's behaviour; the owner ruled to leave it)", () => {
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

/*
 * Obsidian's `%%` comment: the same rules as `<!--`, in the places a `%%` can stand. The owner: "add %% comments to 1.0.0 as a comment too".
 */

test("a lone %% in prose (a percentage such as 50%% off) hides nothing, and neither does a %% run that cannot pair (LF and CRLF)", () => {
	for (const [eol, f] of [["LF", (t) => t], ["CRLF", asCrlf]]) {
		assert.deepEqual(qIds(f(act(`Half price: 50%% off.\n\n${Q1}\n\n${Q2}`))), ["q1", "q2"], `50%% off with no later %% (${eol})`);
		assert.deepEqual(qIds(f(act(`%%\n\n${Q1}\n\n${Q2}`))), ["q1", "q2"], `a %% line with no closer (${eol})`);
		// three signs: read left to right in pairs, so the odd one left over is text; one `%%%` alone has no closer
		assert.deepEqual(qIds(f(act(`%%%\n\n${Q1}\n\n${Q2}`))), ["q1", "q2"], `a line of %%% with no closer (${eol})`);
		assert.deepEqual(qIds(f(act(`%%%\n${Q1}\n%%%\n\n${Q2}`))), ["q2"], `a %%% line pairs with the next %%% line, as %% does (${eol})`);
		assert.deepEqual(qIds(f(act(`%%%%\n\n${Q1}\n\n${Q2}`))), ["q1", "q2"], `%%%% is an empty comment: it hides nothing after it (${eol})`);
	}
});

test("two %% in one paragraph hide what lies between them, as Obsidian does; the owner has not asked for more care than $$ gets (documents today's behaviour)", () => {
	const text = act(`Half price: 50%% off.\n\n${Q1}\n\nOr 20%% off.\n\n${Q2}`);
	assert.deepEqual(qIds(text), ["q2"], "q1 lies between the two marks");
});

test("a %% inside inline code opens and closes nothing (LF and CRLF)", () => {
	for (const [eol, f] of [["LF", (t) => t], ["CRLF", asCrlf]]) {
		assert.deepEqual(qIds(f(act(`Write \`%%\` to start a comment.\n\n${Q1}\n\nWrite \`%%\` again.\n\n${Q2}`))), ["q1", "q2"], `two code spans (${eol})`);
		assert.deepEqual(qIds(f(act(`Write \`\`a % b %% c\`\` here.\n\n${Q1}\n\n%% real %%\n\n${Q2}`))), ["q1", "q2"], `a double-backtick span, then a one-line comment (${eol})`);
		// only an opener is ignored in code: inside a comment the first %% is the closer, in a code span or not (as --> is), so this one-line comment ends there
		assert.deepEqual(qIds(f(act(`%% aside \`%%\`\n${Q1}\n%%\n\n${Q2}`))), ["q1", "q2"], `a %% in a code span inside a comment still closes it (${eol})`);
	}
});

test("a %% inside a callout line works as <!-- does there (LF and CRLF)", () => {
	for (const [eol, f] of [["LF", (t) => t], ["CRLF", asCrlf]]) {
		// a %% comment opened in a callout line runs to its closer, over lines
		assert.deepEqual(qIds(f(act(`> [!note] Aside %% start\n> more\n%%\n\n${Q1}`))), ["q1"], `a callout with a comment that closes after it (${eol})`);
		assert.deepEqual(qIds(f(act(`> [!note] Aside\n> %%\n> ${Q1.slice(2)}\n> %%\n\n${Q2}`))), ["q2"], `a question line inside a %% comment inside a callout is hidden (${eol})`);
		// the line after the closer is read, and an unclosed one hides nothing
		assert.deepEqual(qIds(f(act(`> [!note] Aside\n> %% x %%\n\n${Q1}`))), ["q1"], `a one-line comment in a callout (${eol})`);
		assert.deepEqual(qIds(f(act(`> [!note] Aside\n> %% never closes\n\n${Q1}\n\n${Q2}`))), ["q1", "q2"], `an unclosed %% in a callout (${eol})`);
	}
});

test("the %% that wrap the records section never pair with a %% written in the body (LF and CRLF)", () => {
	for (const [eol, f] of [["LF", (t) => t], ["CRLF", asCrlf]]) {
		const text = f(act(`Words %% stray\n\n${Q1}\n\n${Q2}`));
		const saved = core.setAnswer(text, "", "q1", "kept");
		assert.ok(saved.includes("[!records"), "records written");
		assert.deepEqual(qIds(saved), ["q1", "q2"], `(${eol}): a body %% with no body closer hides nothing, though the records are wrapped in %%`);
		assert.equal(core.parseBooklet(saved).records.answers[""]?.q1, "kept");
	}
});

test("a raw media tag inside a %% comment is not reported, and one after a %% that never closes is (LF and CRLF)", () => {
	const said = (t) => core.parseBooklet(t).problems.filter((p) => /raw `<iframe>`/.test(p)).length;
	for (const [eol, f] of [["LF", (t) => t], ["CRLF", asCrlf]]) {
		assert.equal(said(f(act(`%%\n<iframe src="x"></iframe>\n%%\n\nWords.`))), 0, `inside a block %% comment (${eol})`);
		assert.equal(said(f(act(`Words %% <iframe src="x"></iframe> %% more.`))), 0, `inside a one-line %% comment (${eol})`);
		assert.equal(said(f(act(`<!--\n<iframe src="x"></iframe>\n-->\n\nWords.`))), 0, `inside an HTML comment (${eol})`);
		assert.equal(said(f(act(`Words %% never closes\n\n<iframe src="x"></iframe>`))), 1, `after an unclosed %% (${eol})`);
		assert.equal(said(f(act(`<!-- never closes\n\n<iframe src="x"></iframe>`))), 1, `after an unclosed <!-- (${eol})`);
	}
});

test("a %% comment is taken out of the words of a heading, a first paragraph and a tab's opening", () => {
	assert.equal(core.plainText("Intro %% aside %% words"), "Intro words");
	assert.equal(core.firstParagraph("%% note %%\n\nReal words."), "Real words.");
});
