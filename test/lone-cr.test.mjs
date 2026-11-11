/*
 * A line ends at a line feed, with or without the carriage return before it; a carriage return alone does not end a line. The browser reader
 * (renderer 0.20.2) reads front matter that way, and so does this plugin's reader (core/lines.ts splitLines, which reader.ts frontMatterOf and
 * parseBooklet read through): a note whose front matter is separated by lone CRs (`---\rbooklet: "0.20"\r...`) has no front matter for either, so
 * it is not a booklet, and neither writes into it. Shared apply case: "a lone CR as every line ending: no line is found, so no write".
 */
import test from "node:test";
import assert from "node:assert/strict";
import { core } from "./helpers.mjs";

const { splitLines, frontMatterOf, parseBooklet, applyInFence, applyAdd } = core;

const BODY = (eol) => ["---", 'booklet: "0.20"', "title: Orchard", "lang: en", "---", "", "> [!module|desk] Desk", "", "> [!activity|work repeat] Work", "", "```booklet data", '{"rows":[{"id":"a"}]}', "```", "^plots", "", "> [!module|desk end]", ""].join(eol);

test("a carriage return alone does not end a line; a line feed, with or without a carriage return, does", () => {
	assert.deepEqual(splitLines("a\rb\nc\r\nd"), [{ text: "a\rb", eol: "\n" }, { text: "c", eol: "\r\n" }, { text: "d", eol: "" }]);
});

test("front matter separated by lone carriage returns is no front matter: the note has no marker and is not a booklet", () => {
	const lone = BODY("\r");
	const lines = splitLines(lone).map((l) => l.text);
	assert.equal(lines.length, 1, "the whole note is one line");
	assert.deepEqual(frontMatterOf(lines), { head: null, bodyStart: 0 });
	const book = parseBooklet(lone);
	assert.equal(book.ok, false);
	assert.match(book.refusal, /no booklet: marker/);
});

test("the same note with line feeds, or with carriage return and line feed, is a booklet", () => {
	for (const eol of ["\n", "\r\n"]) {
		const book = parseBooklet(BODY(eol));
		assert.equal(book.ok, true, book.refusal);
		assert.equal(book.frontMatter["title"], "Orchard");
	}
});

test("a note of lone carriage returns has no data block to write into: nothing is written", () => {
	assert.deepEqual(applyInFence(BODY("\r"), "plots", "desk", (t) => applyAdd(t, "", "b", undefined, {})), { ok: false, why: "no write" });
});
