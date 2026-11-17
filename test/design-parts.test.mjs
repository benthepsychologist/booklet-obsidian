/*
 * The title and the description of a block that the Design view edits where they are drawn (core/design-parts.ts). No view: lines in,
 * lines out. The fields are offered only for a block they can write back byte for byte, so the round trip is held against every question,
 * callout and prose block of the test fixtures, and the odd shapes (blank `>` lines, trailing spaces, a list first, no description, CRLF)
 * are each held by hand.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { core } from "./helpers.mjs";
import { fixtureFiles } from "./fixtures.mjs";

const { parseDesign, walkDesign, blockLines, readParts, writeDescription, changeLines } = core;

const L = (s) => s.split("\n");
const parts = (text, kind) => {
	const r = readParts(L(text), kind);
	assert.ok(!("refused" in r), `offered: ${r.refused}`);
	return r;
};
const refusal = (text, kind) => {
	const r = readParts(L(text), kind);
	assert.ok("refused" in r, `refused: ${text}`);
	assert.ok(r.refused.length > 20, "a reason in words");
	return r.refused;
};
/** The lines after writing a description (the write must be allowed). */
const written = (text, kind, description) => {
	const r = writeDescription(L(text), kind, description);
	assert.equal(r.ok, true, r.reason);
	return r.lines.join("\n");
};
const kindOf = (n) => (n.kind === "question" ? "question" : n.kind === "callout" ? "callout" : n.kind === "prose" ? "prose" : null);

// ---------------------------------------------------------------- the round trip over everything the fixtures hold

test("every question, callout and prose block of the fixtures: the parts read and write back byte for byte, or are refused in words", () => {
	const seen = { question: 0, callout: 0, prose: 0 };
	let described = 0;
	const refused = [];
	for (const f of fixtureFiles()) {
		if (!f.path.endsWith(".md")) continue;
		let root;
		try {
			root = parseDesign(f.text, { lenient: true });
		} catch {
			continue;
		}
		for (const n of walkDesign(root)) {
			const kind = kindOf(n);
			if (!kind) continue;
			const lines = blockLines(f.text, n);
			const r = readParts(lines, kind);
			const where = `${f.path}:${n.start + 1}`;
			if ("refused" in r) {
				assert.ok(r.refused.length > 20, "a reason in words");
				refused.push(`${where}: ${r.refused}`);
				continue;
			}
			seen[kind]++;
			if (!r.described) {
				assert.equal(writeDescription(lines, kind, "x").ok, false, `${where}: nothing to write to`);
				continue;
			}
			described++;
			// writing the description as it was read changes nothing, to the byte
			const same = writeDescription(lines, kind, r.description);
			assert.equal(same.ok, true, `${where}: ${same.reason}`);
			assert.deepEqual(same.lines, lines, `${where} writes back as it was read`);
			// and so does the same text with the line endings of another system
			const crlf = writeDescription(lines, kind, r.description.replace(/\n/g, "\r\n"));
			assert.equal(crlf.ok, true, where);
			assert.deepEqual(crlf.lines, lines, `${where}: CRLF typed in a field is the same text`);
			// an edit changes only the description's lines: the first line, the rest and the lines around are as they were
			if (kind !== "prose") {
				const edit = writeDescription(lines, kind, `${r.description}\nAnd one more line.`.replace(/^\n/, ""));
				assert.equal(edit.ok, true, `${where}: ${edit.reason}`);
				assert.equal(edit.lines[0], lines[0], "the first line is the same");
				assert.deepEqual(edit.lines.slice(edit.lines.length - r.rest.length), r.rest, "the lines after are the same");
				const back = readParts(edit.lines, kind);
				assert.ok(!("refused" in back));
				assert.equal(back.description.endsWith("And one more line."), true);
				assert.equal(back.title, r.title);
			}
		}
	}
	assert.ok(seen.question > 10 && seen.callout > 0 && seen.prose > 0, JSON.stringify(seen));
	assert.ok(described > 20, `${described} blocks with a description`);
	// what is refused is rare, and each refusal is a shape the fields cannot show without changing what is written
	assert.ok(refused.length <= 6, `${refused.length} refused:\n${refused.join("\n")}`);
});

// ---------------------------------------------------------------- reading

test("a question: the title is the words after the bracket, the description is the `>` lines straight under it, and what follows is the rest", () => {
	const r = parts("> [!choice|q] Which fruit?\n> Pick one.\n> Or two.\n- [ ] Apple\n- [ ] Pear", "question");
	assert.equal(r.title, "Which fruit?");
	assert.equal(r.described, true);
	assert.equal(r.description, "Pick one.\nOr two.");
	assert.deepEqual([r.from, r.to], [1, 3]);
	assert.deepEqual(r.rest, ["- [ ] Apple", "- [ ] Pear"]);
});

test("a question with no description has an empty one, placed where one would go", () => {
	const r = parts("> [!text|q] Why?", "question");
	assert.equal(r.description, "");
	assert.equal(r.described, true);
	assert.deepEqual([r.from, r.to], [1, 1]);
	const list = parts("> [!choice|q] Which?\n- [ ] A\n- [ ] B", "question");
	assert.equal(list.description, "", "a list first: no description");
	assert.deepEqual(list.rest, ["- [ ] A", "- [ ] B"]);
});

test("a callout under the question (a hint, a solution) ends the description: it is the rest", () => {
	const r = parts("> [!text|q] Why?\n> Say it.\n\n> [!hint]- A hint\n> Think.", "question");
	assert.equal(r.description, "Say it.");
	assert.deepEqual(r.rest, ["", "> [!hint]- A hint", "> Think."]);
	const direct = parts("> [!text|q] Why?\n> [!hint]- A hint\n> Think.", "question");
	assert.equal(direct.description, "", "a callout straight under is not a description");
});

test("a reading callout: the body is the description; a prose block: all its lines are", () => {
	const c = parts("> [!note] A note\n> Line one.\n>\n> Line three.", "callout");
	assert.equal(c.title, "A note");
	assert.equal(c.description, "Line one.\n\nLine three.");
	const p = parts("Some words.\n\nMore words.", "prose");
	assert.equal(p.title, null);
	assert.equal(p.description, "Some words.\n\nMore words.");
	assert.deepEqual(p.rest, []);
});

test("kinds of question the view does not draw with words under them have a title and no description", () => {
	const r = parts("> [!widget|w] A widget\n> setting: yes", "question");
	assert.equal(r.described, false);
	assert.equal(r.description, "");
	assert.equal(r.title, "A widget");
	assert.deepEqual(r.rest, ["> setting: yes"]);
	assert.equal(writeDescription(L("> [!widget|w] A widget"), "question", "x").ok, false);
});

// ---------------------------------------------------------------- shapes that are refused

test("a shape the fields could only show by changing what is written is refused, in words", () => {
	assert.match(refusal("This is not a Booklet line\n> text", "question"), /not a Booklet line/);
	assert.match(refusal("> > [!text|q] Nested?", "question"), /extra > marks/);
	assert.match(refusal("> [!module|m end]", "question"), /closing line/);
	assert.match(refusal("> [!text|q] Why?\r\n> a\rb", "question"), /carriage return/);
	assert.match(refusal("> [!note] A note\n> body\nnot a body line", "callout"), /not part of them/);
	assert.match(refusal("> [!note] A note", "table"), /no title and description/);
	const none = readParts([], "question");
	assert.ok("refused" in none);
});

// ---------------------------------------------------------------- writing: only the lines that change

test("a description edited in the middle keeps every line either side byte for byte, trailing spaces and all", () => {
	const text = "> [!text|q] Why?  \n> one  \n> two\n> three \n> [!hint]- H\n> h";
	const out = written(text, "question", "one  \nTWO\nthree ");
	assert.equal(out, "> [!text|q] Why?  \n> one  \n> TWO\n> three \n> [!hint]- H\n> h");
});

test("a blank `>` line, a `> ` with a trailing space and a `>text` with no space are each kept as written, and new lines follow the first words' style", () => {
	const text = "> [!text|q] Why?\n>one\n>\n> \n>four";
	assert.equal(parts(text, "question").description, "one\n\n\nfour");
	assert.equal(written(text, "question", "one\n\n\nfour"), text, "unchanged text is unchanged lines");
	assert.equal(written(text, "question", "one\n\n\nfour\nfive"), text + "\n>five", "a new line has no space, as the first words have none");
	const spaced = "> [!text|q] Why?\n> one";
	assert.equal(written(spaced, "question", "one\n\ntwo"), "> [!text|q] Why?\n> one\n>\n> two", "a blank line is a bare `>`");
});

test("a description added to a question with none goes straight under its first line, before the list; removed, it leaves the list", () => {
	const text = "> [!choice|q] Which?\n- [ ] A\n- [ ] B";
	const added = written(text, "question", "Pick one.");
	assert.equal(added, "> [!choice|q] Which?\n> Pick one.\n- [ ] A\n- [ ] B");
	assert.equal(written(added, "question", ""), text);
});

test("blank lines at the end of what is typed are left off, and a text that is the description as it stands is no change", () => {
	const text = "> [!text|q] Why?\n> one";
	assert.equal(written(text, "question", "one\n\n\n"), text);
	assert.equal(written(text, "question", "one\n\n\ntwo\n\n"), "> [!text|q] Why?\n> one\n>\n>\n> two");
	assert.equal(written(text, "question", ""), "> [!text|q] Why?");
});

test("CRLF typed into a field is the same text as LF, and a note with CRLF endings keeps its CRs through the guard", () => {
	const text = "> [!text|q] Why?\n> one";
	assert.equal(written(text, "question", "one\r\ntwo"), "> [!text|q] Why?\n> one\n> two");
	const note = ["---", "booklet: 1", "---", "", "> [!module|m] M", "", "> [!activity|a] A", "", "> [!text|q] Why?", "> one", "", "> [!module|m end]", ""].join("\r\n");
	const root = parseDesign(note);
	const q = walkDesign(root).find((n) => n.kind === "question");
	const lines = blockLines(note, q);
	assert.ok(lines.every((l) => !l.includes("\r")), "the block's lines come without their CRs");
	const out = writeDescription(lines, "question", "one\nand more");
	assert.equal(out.ok, true);
	const op = changeLines(note, q, out.lines);
	assert.equal(op.ok, true, op.reason);
	assert.equal(op.text.split("\n").every((l, i, a) => i === a.length - 1 || l.endsWith("\r")), true, "every line still ends with its CR");
	assert.equal(op.text.replace(/\r\n/g, "\n"), note.replace(/\r\n/g, "\n").replace("> one\n", "> one\n> and more\n"));
});

test("a prose block is written raw, and one left with no words is refused", () => {
	assert.equal(written("One.\n\nTwo.", "prose", "One.\n\nTwo changed."), "One.\n\nTwo changed.");
	assert.equal(written("One.", "prose", "One.\nTwo."), "One.\nTwo.");
	const r = writeDescription(["One."], "prose", "  \n");
	assert.equal(r.ok, false);
	assert.match(r.reason, /deleted block/);
});

test("a line the format would read as another part of the block is refused, and nothing is changed", () => {
	const text = "> [!text|q] Why?\n> one";
	for (const typed of ["one\n[!hint]- sneaky", "[!note] Opens a callout"]) {
		const r = writeDescription(L(text), "question", typed);
		assert.equal(r.ok, false, typed);
		assert.match(r.reason, /another part of the block/);
	}
	// the same words in a callout's body are only words
	const call = "> [!note] A note\n> one";
	const r = writeDescription(L(call), "callout", "one\nplain");
	assert.equal(r.ok, true);
});

test("a block the parts cannot be read from cannot be written either, with the reason", () => {
	const r = writeDescription(L("> > [!text|q] Nested?\n> > one"), "question", "two");
	assert.equal(r.ok, false);
	assert.match(r.reason, /extra > marks/);
	assert.equal(writeDescription(L("> [!note] N\n> body\nstray"), "callout", "x").ok, false);
});
