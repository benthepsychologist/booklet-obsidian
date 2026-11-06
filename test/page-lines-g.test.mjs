/*
 * Lane G: a page line is hidden only by a region that really closes later in the note. An opener inside an inline code span is not an
 * opener; an opener with no closer (`<!--` with no `-->`, `<pre>` with no `</pre>`, a lone or odd `$$`) hides nothing; a "```" line
 * inside a closed comment is part of the comment, not a fence. Every note is made up.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { build, core } from "./helpers.mjs";

const head = `---\nbooklet: "0.19"\ntitle: Made up\n---\n\n`;
const note = (middle, tail = "> [!page|two] Two\n\nWords two.\n") => `${head}> [!activity|a] A\n\n> [!page|one] One\n\nWords one.\n\n${middle}\n\n${tail}`;
const titles = (text) => [...build(text).nav.byKey.values()][0].tabs[0].tree.map((p) => p.title);
const pageSegs = (text) => core.parseBooklet(text).activities[0].segments.filter((s) => s.type === "page").map((s) => s.title);
const asCrlf = (t) => t.replace(/\n/g, "\r\n");

/** Inputs that must hide nothing: the page after them is read. */
const NOT_OPENERS = [
	["inline code holding <!--", "An HTML comment opens with `<!--`."],
	["inline code holding <pre>", "A block of preformatted text opens with `<pre>`."],
	["inline code holding $$", "A math block opens with `$$`."],
	["double-backtick code holding <!--", "Write ``<!-- a`b`` to open one."],
	["a price line", "Price: $$$"],
	["a lone $$ in prose", "It costs $$ and that is all."],
	["a comment that never closes", "<!-- oops"],
	["a pre that never closes", "<pre>\nraw words"],
	["a $$ block that never closes", "$$ x\nmore math"],
];

test("an opener with no closer, or inside an inline code span, hides nothing: every later page is read", () => {
	for (const [why, middle] of NOT_OPENERS) {
		for (const [eol, f] of [["LF", (t) => t], ["CRLF", asCrlf]]) {
			const text = f(note(middle));
			assert.ok(titles(text).includes("Two"), `${why} (${eol}): page Two is read, got ${JSON.stringify(titles(text))}`);
			assert.ok(pageSegs(text).includes("Two"), `${why} (${eol}): page segment Two`);
		}
	}
});

test("a real <!-- with no --> keeps both later pages, and the page reader and the tab reader agree", () => {
	const text = note("<!-- oops", "> [!page|two] Two\n\nWords two.\n\n> [!page|three] Three\n\nWords three.\n");
	assert.deepEqual(pageSegs(text), ["One", "Two", "Three"]);
	assert.ok(titles(text).includes("Two") && titles(text).includes("Three"));
	const tabs = `${head}> [!activity|a] A\n\n> [!tab|t1] First\n\nWords.\n\n<!-- oops\n\n> [!tab|t2] Second\n\nWords.\n`;
	assert.deepEqual([...build(tabs).nav.byKey.values()][0].tabs.map((t) => t.id), ["t1", "t2"]);
});

test("an unclosed opener followed by two pages keeps both pages (each kind of opener)", () => {
	for (const middle of ["<!-- oops", "<pre>", "$$ x", "$$"]) {
		const text = note(middle, "> [!page|two] Two\n\nWords.\n\n> [!page|three] Three\n\nWords.\n");
		assert.deepEqual(pageSegs(text), ["One", "Two", "Three"], middle);
	}
});

test("a closed comment, <pre> block or $$ block still hides a page line; a page line right after the closer is read", () => {
	const hide = [
		["comment", "<!--\n> [!page|hid] Hidden\n-->"],
		["one-line comment", "<!-- > [!page|hid] Hidden -->"],
		["pre", "<pre>\n> [!page|hid] Hidden\n</pre>"],
		["math", "$$\n> [!page|hid] Hidden\n$$"],
		["comment after prose with code", "Use `<!--` here <!--\n> [!page|hid] Hidden\n-->"],
	];
	for (const [why, middle] of hide) {
		for (const f of [(t) => t, asCrlf]) {
			const text = f(note(middle, "> [!page|two] Two\n\nWords.\n"));
			assert.deepEqual(pageSegs(text), ["One", "Two"], why);
		}
	}
	for (const closed of ["<!--\nold\n-->", "<pre>\nx\n</pre>", "$$\nx\n$$"]) {
		for (const f of [(t) => t, asCrlf]) {
			const text = f(`${head}> [!activity|a] A\n\n${closed}\n> [!page|seen] Seen\n\nWords.\n`);
			assert.deepEqual(pageSegs(text), ["Seen"], JSON.stringify(closed));
		}
	}
});

test("a ``` line inside a closed comment is part of the comment, not a fence that swallows the next page", () => {
	const text = note("<!--\n```\nold\n-->", "> [!page|two] Two\n\nWords.\n");
	assert.deepEqual(pageSegs(text), ["One", "Two"]);
	assert.deepEqual(pageSegs(note("<!--\n```\n> [!page|hid] Hidden\n-->", "> [!page|two] Two\n\nWords.\n")), ["One", "Two"]);
	// a fenced code block still keeps a page line inside it from being read
	assert.deepEqual(pageSegs(note("```\n> [!page|hid] Hidden\n```")), ["One", "Two"]);
	// and a fence is still a fence when no region encloses it
	assert.deepEqual(pageSegs(note("```\n<!--\n```")), ["One", "Two"]);
});

test("visibleLines: only a region that closes hides lines; code spans and unpaired marks hide nothing", () => {
	const v = (ls) => core.visibleLines(ls);
	assert.deepEqual(v(["a <!-- b", "c", "d --> e", "f"]).hidden, [false, true, true, false]);
	assert.deepEqual(v(["a <!-- b", "c", "d"]).hidden, [false, false, false]);
	assert.deepEqual(v(["a <!-- b", "c", "d"]).text, ["a <!-- b", "c", "d"]);
	assert.deepEqual(v(["`<!--`", "x"]).hidden, [false, false]);
	assert.deepEqual(v(["Price: $$$", "x"]).hidden, [false, false]);
	assert.deepEqual(v(["$$", "x", "$$", "y"]).hidden, [false, true, true, false]);
	assert.deepEqual(v(["<pre>", "x", "</PRE>", "y"]).hidden, [false, true, true, false]);
	assert.deepEqual(v(["<pre>x</pre>", "y"]).text, ["<pre>x</pre>", "y"]);
	assert.deepEqual(v(["a <!-- b --> c $$ d $$ e"]).text, ["a  c  e"]);
});
