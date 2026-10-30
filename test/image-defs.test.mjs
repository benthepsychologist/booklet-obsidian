/*
 * Image definitions for one piece of prose (src/core/image-defs.ts): a piece drawn on its own is given the
 * file's link reference definitions for the images it uses, so `![alt][name]` resolves in the booklet view.
 * The reference forms, labels as CommonMark matches them, code that holds an image or a definition, the
 * first definition winning, and a piece with nothing to add left exactly as it was. Made-up content only.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { core } from "./helpers.mjs";

const defs = (...lines) => lines.join("\n");

test("image definitions: the reference form appends the file's definition line after a blank line", () => {
	const piece = "The harbour, as a made-up picture: ![The harbour][harbour]";
	const file = defs("[harbour]: images/harbour.png");
	assert.equal(core.appendImageDefs(piece, file), `${piece}\n\n[harbour]: images/harbour.png`);
});

test("image definitions: the collapsed form takes its label from the alt words", () => {
	const piece = "![The harbour][]";
	const file = defs("[the harbour]: images/harbour.png");
	assert.equal(core.appendImageDefs(piece, file), `${piece}\n\n[the harbour]: images/harbour.png`);
});

test("image definitions: the shortcut form appends its definition, but an inline image is not a reference", () => {
	const file = defs("[The harbour]: images/harbour.png");
	assert.equal(core.appendImageDefs("![The harbour]", file), "![The harbour]\n\n[The harbour]: images/harbour.png");
	assert.equal(core.appendImageDefs("![The harbour](images/inline.png)", file), "![The harbour](images/inline.png)");
});

test("image definitions: labels match without case and with runs of white space read as one space", () => {
	const piece = "![A][THE   Harbour] and ![B][the\nharbour]";
	const file = defs("[The Harbour]: images/harbour.png");
	assert.equal(core.appendImageDefs(piece, file), `${piece}\n\n[The Harbour]: images/harbour.png`);
});

test("image definitions: a definition with angle brackets and a title is appended exactly as written", () => {
	const piece = "![The shape][shape]";
	const file = defs('[shape]: <images/shape one.svg> "A made-up title"');
	assert.equal(core.appendImageDefs(piece, file), `${piece}\n\n[shape]: <images/shape one.svg> "A made-up title"`);
});

test("image definitions: an image whose label has no definition leaves the piece unchanged", () => {
	const piece = "![Nothing here][missing]";
	assert.equal(core.appendImageDefs(piece, defs("[other]: images/other.png")), piece);
});

test("image definitions: a footnote definition is never appended", () => {
	const piece = "![A note][^note]";
	assert.equal(core.appendImageDefs(piece, defs("[^note]: A made-up footnote.")), piece);
});

test("image definitions: an image inside a code span or a fenced block is ignored", () => {
	const file = defs("[a]: images/a.png", "[b]: images/b.png", "[c]: images/c.png");
	assert.equal(core.appendImageDefs("A `![A][a]` in code.", file), "A `![A][a]` in code.");
	assert.equal(core.appendImageDefs("```\n![B][b]\n```", file), "```\n![B][b]\n```");
	const piece = "![A][a] and `![B][b]` and\n\n```\n![C][c]\n```";
	assert.equal(core.appendImageDefs(piece, file), `${piece}\n\n[a]: images/a.png`);
});

test("image definitions: a definition inside a fenced block of the file is ignored", () => {
	const file = defs("```", "[harbour]: images/in-a-fence.png", "```", "[harbour]: images/harbour.png");
	assert.equal(core.appendImageDefs("![The harbour][harbour]", file), "![The harbour][harbour]\n\n[harbour]: images/harbour.png");
	assert.equal(core.appendImageDefs("![The harbour][harbour]", defs("~~~", "[harbour]: images/in-a-fence.png", "~~~")), "![The harbour][harbour]");
});

test("image definitions: the first definition for a label wins", () => {
	const file = defs("[harbour]: images/first.png", "[harbour]: images/second.png");
	assert.equal(core.appendImageDefs("![The harbour][harbour]", file), "![The harbour][harbour]\n\n[harbour]: images/first.png");
});

test("image definitions: a piece with no image is returned exactly as it was, line breaks and all", () => {
	const piece = "Words only.\n\nAnd a second paragraph.\n";
	assert.equal(core.appendImageDefs(piece, defs("[harbour]: images/harbour.png")), piece);
});

test("image definitions: two images append both definitions, in the order the piece uses them", () => {
	const piece = "![First][first] then ![Second][second]";
	const file = defs("[second]: images/second.png", "[first]: images/first.png");
	assert.equal(core.appendImageDefs(piece, file), `${piece}\n\n[first]: images/first.png\n[second]: images/second.png`);
});

test("image definitions: the same image twice appends its definition once", () => {
	const piece = "![The harbour][harbour] and again ![The harbour][harbour]";
	const file = defs("[harbour]: images/harbour.png");
	assert.equal(core.appendImageDefs(piece, file), `${piece}\n\n[harbour]: images/harbour.png`);
});
