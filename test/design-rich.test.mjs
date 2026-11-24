/*
 * The rich-text helper of the Design view's fields (core/design-rich.ts): Bold, Italic, Link and Bullets as Markdown markers put into, or
 * taken out of, a field's own text. Plain strings in and out; run in node. The helper must change nothing but the markers, give back the
 * exact text when a format is applied and taken off, never let a marker cross a line or split a character, and never leave a line as
 * another kind of line (a rule, a heading, a list, a quote, a callout opening).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { core, BOOKLET } from "./helpers.mjs";

const { richFormat, richTakes, graphemeBreaks, parseLine } = core;

/** The text, with | for a caret or « » round the selection, as the helper is given it (the brackets are Markdown's, so they are not used). */
const mark = (s) => {
	const open = s.indexOf("\u00ab");
	const close = s.indexOf("\u00bb", open + 1);
	if (open >= 0 && close > open) return { text: s.slice(0, open) + s.slice(open + 1, close) + s.slice(close + 1), a: open, b: close - 1 };
	const bar = s.indexOf("|");
	return { text: s.replace("|", ""), a: bar, b: bar };
};
/** A result drawn the same way. */
const draw = (r) => (r.ok ? (r.start === r.end ? r.text.slice(0, r.start) + "|" + r.text.slice(r.start) : r.text.slice(0, r.start) + "\u00ab" + r.text.slice(r.start, r.end) + "\u00bb" + r.text.slice(r.end)) : `refused:${r.code}`);
const run = (marked, action, where = "prose") => {
	const m = mark(marked);
	return draw(richFormat(m.text, m.a, m.b, action, where));
};

/** A small seeded random source, so a failure can be reproduced. */
const rng = (seed) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);

test("bold and italic wrap the selection, leaving it selected, and a second press takes them off", () => {
	assert.equal(run("say «hello» there", "bold"), "say **«hello»** there");
	assert.equal(run("say **«hello»** there", "bold"), "say «hello» there");
	assert.equal(run("say «hello» there", "italic"), "say *«hello»* there");
	assert.equal(run("say *«hello»* there", "italic"), "say «hello» there");
	assert.equal(run("«hello»", "bold", "title"), "**«hello»**");
	assert.equal(run("«hello»", "bold", "help"), "**«hello»**");
});

test("markers at the very ends of the selection are taken off too", () => {
	assert.equal(run("say «**hello**» there", "bold"), "say «hello» there");
	assert.equal(run("say «*hello*» there", "italic"), "say «hello» there");
	assert.equal(run("«***x***»", "bold"), "*«x»*");
	assert.equal(run("«***x***»", "italic"), "**«x»**");
});

test("bold and italic nest as three asterisks, and either comes off alone", () => {
	assert.equal(run("**«x»**", "italic"), "***«x»***");
	assert.equal(run("*«x»*", "bold"), "***«x»***");
	assert.equal(run("***«x»***", "bold"), "*«x»*");
	assert.equal(run("***«x»***", "italic"), "**«x»**");
	assert.equal(run("**«x»**", "bold"), "«x»");
});

test("with no selection the word at the caret is formatted and the caret stays where it was", () => {
	assert.equal(run("say hel|lo there", "bold"), "say **hel|lo** there");
	assert.equal(run("say **hel|lo** there", "bold"), "say hel|lo there");
	assert.equal(run("say hello| there", "italic"), "say *hello|* there");
	assert.equal(run("say |hello there", "italic"), "say *|hello* there");
	assert.equal(run("it's don't|", "bold"), "it's **don't|**");
	assert.equal(run("naïve caf|é", "bold"), "naïve **caf|é**");
	// the caret in a line's own mark takes the word after it, and stays where it was
	assert.equal(run("-| item", "bold"), "- **|item**");
	assert.equal(run("- |item", "bold"), "- **|item**");
});

test("with no selection and no word the marker pair is put in with the caret between, and a second press takes it away", () => {
	assert.equal(run("a | b", "italic"), "a *|* b");
	assert.equal(run("a *|* b", "italic"), "a | b");
	assert.equal(run("a | b", "bold"), "a **|** b");
	assert.equal(run("a **|** b", "bold"), "a | b");
	assert.equal(run("|", "italic"), "*|*");
	assert.equal(run("one\n|\ntwo", "italic"), "one\n*|*\ntwo");
});

test("a pair of bold marks alone on a line, or a lone asterisk made bold, would be a rule, so it is refused", () => {
	assert.equal(run("|", "bold"), "refused:rule");
	assert.equal(run("one\n|\ntwo", "bold"), "refused:rule");
	assert.equal(run("«*»", "bold"), "refused:nothing");
	// in a title it is not at a line's start, so it is only words
	assert.equal(run("|", "bold", "title"), "**|**");
});

test("a selection over several lines is marked line by line, and blank lines, spaces and each line's own mark are left outside", () => {
	assert.equal(run("«one\ntwo\n\nthree»", "bold"), "**«one**\n**two**\n\n**three»**");
	assert.equal(run("«**one**\n**two**\n\n**three**»", "bold"), "«one\ntwo\n\nthree»");
	// the selection keeps its own edges; the spaces are outside the marks
	assert.equal(run("«  one  \ntwo  »", "italic"), "  *«one*  \n*two»*  ");
	assert.equal(run("«- one\n- two»", "bold"), "- **«one**\n- **two»**");
	assert.equal(run("«1. one\n> two\n# three»", "bold"), "1. **«one**\n> **two**\n# **three»**");
	// a selection that ends at the start of a line leaves that line alone
	assert.equal(run("«one\n»two", "bold"), "**«one»**\ntwo");
});

test("some lines already formatted: the rest get it (and it is flagged as partial)", () => {
	const m = mark("«**one**\ntwo»");
	const r = richFormat(m.text, m.a, m.b, "bold", "prose");
	assert.equal(r.ok && r.text, "**one**\n**two**");
	assert.equal(r.partial, true);
});

test("a line's own syntax is never broken", () => {
	// a list or heading mark stays outside the markers
	assert.equal(run("- «item»", "bold"), "- **«item»**");
	assert.equal(run("* «item»", "italic"), "* *«item»*");
	assert.equal(run("# «Heading»", "bold"), "# **«Heading»**");
	// a selection of the mark itself, or of spaces, marks nothing
	assert.equal(run("«- »item", "bold"), "refused:nothing");
	assert.equal(run("«   »", "bold"), "refused:nothing");
	// a link at a line's start is not a callout opening
	assert.equal(run("«!note»", "link"), "refused:block");
	assert.equal(run("«!note» is here", "link"), "refused:block");
	assert.equal(run("is «!note» here", "link"), "is [!note](«https://») here");
});

test("a link made at a line's start from words that begin with ! is refused in a body and fine in a title", () => {
	const r = richFormat("!note is here", 0, 5, "link", "prose");
	assert.equal(r.ok, false);
	assert.equal(r.code, "block");
	const h = richFormat("!note is here", 0, 5, "link", "help");
	assert.equal(h.code, "block");
	// the same words in a title are not at a line's start
	const t = richFormat("!note is here", 0, 5, "link", "title");
	assert.equal(t.ok && t.text, "[!note](https://) is here");
});

test("asterisks already in the text", () => {
	assert.equal(run("a * «b» * c", "bold"), "a * **«b»** * c");
	// a stretch of only asterisks has no words in it
	assert.equal(run("a «*» b", "bold"), "refused:nothing");
	assert.equal(run("a «**» b", "italic"), "refused:nothing");
	assert.equal(run("2 * «3» * 4", "italic"), "2 * *«3»* * 4");
	// two bold phrases side by side: the one between is its own
	assert.equal(run("**a****«b»**", "bold"), "**a**«b»");
	// four or more each side: too many to tell
	assert.equal(run("****«x»****", "bold"), "refused:crowded");
	assert.equal(run("****«x»****", "italic"), "refused:crowded");
	assert.equal(run("«****x****»", "bold"), "refused:crowded");
});

test("a selection whose edges are inside markers", () => {
	// asterisks at the selection's edges are marks, whether it took them in or not: the words are what is formatted
	assert.equal(run("*«*x*»*", "italic"), "***«x»***");
	assert.equal(run("«*x**»", "bold"), "***«x»****");
	assert.equal(run("**«x*»*", "bold"), "«x»");
	// and a second press on any of these gives the first text back
	for (const t of ["*«*x*»*", "«*x**»", "**«x*»*", "*«x**»", "**«*x»*"]) {
		for (const action of ["bold", "italic"]) {
			const m = mark(t);
			const once = richFormat(m.text, m.a, m.b, action, "prose");
			if (!once.ok || once.partial) continue;
			const twice = richFormat(once.text, once.start, once.end, action, "prose");
			if (once.did === "wrap") assert.equal(twice.text, m.text, `${t} ${action}`);
		}
	}
});

test("an underscore emphasis is text to this: it is not toggled, and the asterisks go round it", () => {
	assert.equal(run("«_x_»", "italic"), "*«_x_»*");
});

test("a selection never splits a character: an edge inside a surrogate pair, an accent or an emoji sequence is moved out", () => {
	const smile = "\u{1F600}";
	const cases = ["a" + smile + "b", "e\u0301x", "\u{1F469}\u200d\u{1F4BB}!", "\u{1F1E8}\u{1F1E6}x", "\u{1F44D}\u{1F3FD}y"];
	for (const t of cases) {
		for (let i = 0; i <= t.length; i++) {
			for (let j = i; j <= t.length; j++) {
				for (const act of ["bold", "italic", "link"]) {
					const r = richFormat(t, i, j, act, "prose");
					if (!r.ok) continue;
					assert.equal(noBroken(r.text), true, `${JSON.stringify(t)} ${i},${j} ${act} -> ${JSON.stringify(r.text)}`);
					assert.equal(noBroken(r.text.slice(0, r.start)), true);
				}
			}
		}
	}
	// the exact cases: a caret inside the pair is in the word; an edge inside it is moved out to the whole emoji
	assert.equal(richFormat("a" + smile + "b", 2, 2, "bold", "prose").text, "**a**" + smile + "b");
	assert.equal(richFormat("a" + smile + "b", 1, 2, "bold", "prose").text, "a**" + smile + "**b");
	assert.equal(richFormat("a" + smile + "b", 2, 4, "bold", "prose").text, "a**" + smile + "b**");
	assert.equal(richFormat("e\u0301x", 1, 2, "bold", "prose").text, "**e\u0301**x");
});

/** No lone surrogate, and no combining mark or joiner left at the start of the text or straight after a marker. */
function noBroken(s) {
	if (/[\ud800-\udbff](?![\udc00-\udfff])/.test(s) || /(?<![\ud800-\udbff])[\udc00-\udfff]/.test(s)) return false;
	if (/(?:^|\*|\]|\()[\u0300-\u036f\u200d\ufe0f]/.test(s)) return false;
	return true;
}

test("the grapheme breaks are the same with and without the platform's segmenter for what a field holds", () => {
	for (const t of ["abc", "e\u0301x", "a\u{1F600}b", "\u{1F469}\u200d\u{1F4BB}!", "\u{1F1E8}\u{1F1E6}x", "\u{1F44D}\u{1F3FD}y"]) {
		assert.deepEqual([...graphemeBreaks(t, true)].sort((x, y) => x - y), [...graphemeBreaks(t)].sort((x, y) => x - y), JSON.stringify(t));
	}
});

test("a stray carriage return is a line break and no marker goes after it", () => {
	assert.equal(run("«one\r\ntwo»", "bold"), "**«one**\r\n**two»**");
	assert.equal(run("«one\rtwo»", "bold"), "**«one**\r**two»**");
});

test("the link: the words are bracketed and the address is selected for typing", () => {
	assert.equal(run("go to «the page» now", "link"), "go to [the page](«https://») now");
	// no selection: the word, or an empty link with the caret in its words
	assert.equal(run("go to pa|ge now", "link"), "go to [page](«https://») now");
	assert.equal(run("go | now", "link"), "go [|](https://) now");
});

test("the link toggles off when its address is only the placeholder, and selects a real address instead of throwing it away", () => {
	// the address selected (as a press leaves it), the words selected, a caret in the words, the whole link selected
	assert.equal(run("go to [the page](«https://») now", "link"), "go to «the page» now");
	assert.equal(run("go to [«the page»](https://) now", "link"), "go to «the page» now");
	assert.equal(run("go to [the pa|ge](https://) now", "link"), "go to the pa|ge now");
	assert.equal(run("go to «[the page](https://)» now", "link"), "go to «the page» now");
	assert.equal(run("a [|](https://) b", "link"), "a | b");
	// a real address: kept, and selected
	assert.equal(run("go [the page](https://example.org/a|) now", "link"), "go [the page](«https://example.org/a») now");
	const real = richFormat("go [the page](https://example.org/a) now", 6, 6, "link", "prose");
	assert.equal(real.changed, false);
	assert.equal(real.did, "select");
});

test("a link needs one line and words with no square bracket in them", () => {
	assert.equal(run("«one\ntwo»", "link"), "refused:link-lines");
	assert.equal(run("see «[[#Heading]]» now", "link"), "refused:link-brackets");
	assert.equal(run("«   »", "link"), "refused:nothing");
	// inside an image's alt text or on an image: refused
	assert.equal(run("![al|t](pic.png)", "link"), "refused:link-brackets");
	assert.equal(run("«![alt](pic.png)»", "link"), "refused:link-brackets");
});

test("bullets: every selected line gets `- `, toggled off when all have it, blank lines left alone", () => {
	assert.equal(run("«one\ntwo»", "bullets"), "- «one\n- two»");
	assert.equal(run("«- one\n- two»", "bullets"), "«one\ntwo»");
	assert.equal(run("«one\n\ntwo»", "bullets"), "- «one\n\n- two»");
	assert.equal(run("on|e", "bullets"), "- on|e");
	assert.equal(run("- on|e", "bullets"), "on|e");
	assert.equal(run("* one\n* «two»", "bullets"), "* one\n«two»");
	assert.equal(run("  one|", "bullets"), "  - one|");
	// a selection that ends at the start of a line does not take that line
	assert.equal(run("«one\n»two", "bullets"), "- «one\n»two");
	// some have it: the rest get it
	assert.equal(run("«- one\ntwo»", "bullets"), "«- one\n- two»");
	assert.equal(richFormat("- one\ntwo", 0, 9, "bullets", "prose").partial, true);
	// a task item loses only its bullet
	assert.equal(run("- [ ] a|", "bullets"), "[ ] a|");
});

test("bullets are for prose only, and refuse a line that is already another kind of line", () => {
	assert.equal(run("«one»", "bullets", "title"), "refused:no-bullets");
	assert.equal(run("«one»", "bullets", "help"), "refused:no-bullets");
	assert.equal(richTakes("title", "bullets"), false);
	assert.equal(richTakes("help", "bullets"), false);
	assert.equal(richTakes("prose", "bullets"), true);
	for (const a of ["bold", "italic", "link"]) for (const w of ["title", "help", "prose"]) assert.equal(richTakes(w, a), true);
	assert.equal(run("«# Heading»", "bullets"), "refused:bullet-kind");
	assert.equal(run("«1. one»", "bullets"), "refused:bullet-kind");
	assert.equal(run("«---»", "bullets"), "refused:bullet-kind");
	assert.equal(run("«> quote»", "bullets"), "refused:bullet-kind");
	assert.equal(run("«   »", "bullets"), "refused:nothing");
	assert.equal(run("«-»", "bullets"), "refused:bullet-kind");
});

test("a bullet list needs no blank line above it (a bullet list may interrupt a paragraph: SPEC section 4 names only a numbered list from 0), so none is added", () => {
	assert.equal(run("A paragraph.\n«one\ntwo»", "bullets"), "A paragraph.\n- «one\n- two»");
});

test("nothing is changed but the markers, and a no-op says so", () => {
	const t = "  keep this \u00a0 exactly\t\n\n";
	const r = richFormat(t, 2, 6, "bold", "prose");
	assert.equal(r.text, "  **keep** this \u00a0 exactly\t\n\n");
	const m = richFormat("x [y](https://example.org) z", 4, 4, "link", "prose");
	assert.equal(m.changed, false);
	assert.equal(m.text, "x [y](https://example.org) z");
});

test("out-of-range, reversed and non-numeric selections are clamped", () => {
	assert.equal(draw(richFormat("hello", 9, 99, "bold", "prose")), "**hello|**");
	assert.equal(draw(richFormat("hello", 5, 0, "bold", "prose")), "**«hello»**");
	assert.equal(draw(richFormat("hello", NaN, NaN, "bold", "prose")), "**|hello**");
	assert.equal(richFormat("", 0, 0, "bullets", "prose").code, "nothing");
	assert.equal(draw(richFormat("", 0, 0, "italic", "prose")), "*|*");
});

// ---------------------------------------------------------------------------------------------------- property loops

const ALPHABET = ["a", "b", "word", " ", "  ", "*", "**", "***", "\n", "\n\n", "- ", "# ", "> ", "1. ", "[", "]", "(", ")", "https://", "_", "\u{1F600}", "é", "é", "!"];
const randomText = (rand) => {
	let t = "";
	for (let n = Math.floor(rand() * 9); n > 0; n--) t += ALPHABET[Math.floor(rand() * ALPHABET.length)];
	return t;
};
const WHERES = ["title", "help", "prose"];

/** The text with the format's markers taken out, per action: what must be unchanged. */
const stripped = {
	bold: (t) => t.replace(/\*/g, ""),
	italic: (t) => t.replace(/\*/g, ""),
	link: (t) => t.replace(/\[\]\(https:\/\/\)/g, "").replace(/\]\(https:\/\/\)/g, "").replace(/\[/g, "").replace(/\]/g, "").replace(/https:\/\//g, ""),
	bullets: (t) => t.replace(/^([ \t]*)[-+*][ \t]/gm, "$1"),
};

test("property: applied and then taken off, the text and the selection come back exactly; the text minus its markers never changes", () => {
	const rand = rng(20261119);
	let applied = 0;
	let removed = 0;
	for (let n = 0; n < 40000; n++) {
		const text = randomText(rand);
		const a = Math.floor(rand() * (text.length + 1));
		const b = rand() < 0.3 ? a : Math.floor(rand() * (text.length + 1));
		const action = ["bold", "italic", "link", "bullets"][Math.floor(rand() * 4)];
		const where = WHERES[Math.floor(rand() * 3)];
		const r = richFormat(text, a, b, action, where);
		if (!r.ok) continue;
		assert.ok(r.start <= r.end && r.start >= 0 && r.end <= r.text.length, `selection in range for ${JSON.stringify([text, a, b, action, where])}`);
		assert.equal(noBroken(r.text) || !noBroken(text), true, `no character split: ${JSON.stringify([text, a, b, action, where])}`);
		// the line breaks are what they were
		assert.equal(r.text.replace(/[^\r\n]/g, ""), text.replace(/[^\r\n]/g, ""), "the same line breaks");
		if (action !== "link" && action !== "bullets") assert.equal(stripped[action](r.text), stripped[action](text), `markers only: ${JSON.stringify([text, a, b, action, where])}`);
		if (action === "bullets" && r.did === "wrap") assert.equal(stripped.bullets(r.text).length, r.text.length - 2 * (r.text.split("\n").filter((l) => /^[ \t]*[-+*][ \t]/.test(l)).length) , "only bullets added");
		if (action === "link" && r.changed) assert.equal(r.text.includes("]("), true);
		if (!r.changed || r.partial) continue;
		// a field's text never holds a rule (not even after a line's own mark) or a line that opens a callout: such text is not what the
		// helper is for, and the round trip is not promised for it
		if (/(^|\n)[ \t]*\[!/.test(text) || /[\r\n]\[!/.test(text) || text.split(/\r\n|\n|\r/).some((l) => /^ {0,3}([*_-])([ \t]*\1){2,}[ \t]*$/.test(l.replace(/^[ \t]*(?:>[ \t]?)*(?:(?:[-+*]|\d{1,9}[.)])[ \t]+(?:\[[ xX]\][ \t]+)?|#{1,6}[ \t]+)?/, "")))) continue;
		// every line a format touched is still the kind of line it was (blocks: not a rule, a heading, a list, a quote, a callout opening)
		if (where !== "title" && action !== "bullets") assertLinesKept(text, r.text);
		// the same press again gives the original back
		const back = richFormat(r.text, r.start, r.end, action, where);
		// (what a format took away may leave nothing to format again: only a format that was put on has to come off)
		if (!back.ok && r.did === "unwrap") continue;
		assert.equal(back.ok, true, `second press works: ${JSON.stringify([text, a, b, action, where, r.text, r.start, r.end])}`);
		if (!back.ok) continue;
		if (r.did === "wrap" || r.did === "insert") {
			applied++;
			assert.equal(back.text, text, `back to the text: ${JSON.stringify([text, a, b, action, where, r.text, r.start, r.end])}`);
			if (action === "bold" || action === "italic") {
				// the same words are selected again: a caret is back where it was (when it was in a word's own text), and a selection is
				// its words with no space or line mark round them
				const bs = graphemeBreaks(text);
				const lineStart = text.lastIndexOf("\n", Math.min(a, b) - 1) + 1;
				const lineEnd = text.indexOf("\n", lineStart) < 0 ? text.length : text.indexOf("\n", lineStart);
				const pre = /^[ \t]*(?:>[ \t]?)*(?:(?:[-+*]|\d{1,9}[.)])[ \t]+(?:\[[ xX]\][ \t]+)?|#{1,6}[ \t]+)?/.exec(text.slice(lineStart, lineEnd))[0].length;
				const inMark = a - lineStart < pre;
				if (a === b && bs.has(a) && (where === "title" || !inMark)) assert.deepEqual([back.start, back.end], [a, a], `caret back: ${JSON.stringify([text, a, action, where])}`);
				if (a !== b) assert.equal(back.text.slice(back.start, back.end).replace(/\*/g, ""), r.text.slice(r.start, r.end).replace(/\*/g, ""), `the same words selected again: ${JSON.stringify([text, a, b, action, where, r.text, r.start, r.end, back.text, back.start, back.end])}`);
			}
		} else if (r.did === "unwrap") {
			removed++;
			// taking it off and putting it on again leaves the text, for the formats whose markers are all outside
			if (action === "bold" || action === "italic") {
				const again = richFormat(back.text, back.start, back.end, action, where);
				if (again.ok && !back.partial) assert.equal(again.text, r.text);
			}
		}
	}
	assert.ok(applied > 3000, `enough applied cases were tried (${applied})`);
	assert.ok(removed > 100, `enough removals were tried (${removed})`);
});

/** After a bold, italic or link format, no changed line has become a rule, heading, list, quote or callout opening it was not. */
function assertLinesKept(before, after) {
	const x = before.split(/\r\n|\n|\r/);
	const y = after.split(/\r\n|\n|\r/);
	assert.equal(x.length, y.length);
	const kind = (l) => (!l.trim() ? "blank" : /^ {0,3}([*_-])([ \t]*\1){2,}[ \t]*$/.test(l) ? "rule" : /^[ \t]*\[!/.test(l) ? "callout" : /^ {0,3}#{1,6}([ \t]|$)/.test(l) ? "heading" : /^ {0,3}>/.test(l) ? "quote" : /^ {0,3}[-+*]([ \t]|$)/.test(l) ? "bullet" : /^ {0,3}\d{1,9}[.)]([ \t]|$)/.test(l) ? "ordered" : "text");
	for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) assert.equal(kind(x[i]) === "blank" && kind(y[i]) === "text" ? "ok" : kind(y[i]) === "blank" ? "ok" : kind(y[i]), kind(x[i]) === "blank" && kind(y[i]) === "text" ? "ok" : kind(y[i]) === "blank" ? "ok" : kind(x[i]), `line kept: ${JSON.stringify([x[i], y[i]])}`);
}

test("property: bold and italic over every selection of every line of the SPEC's own text change only markers and give back the line", () => {
	const spec = `${BOOKLET}/SPEC.md`;
	if (!existsSync(spec)) return;
	const lines = readFileSync(spec, "utf8").split("\n").filter((l) => /\*/.test(l) && l.length < 400);
	assert.ok(lines.length > 20, "the SPEC has lines with asterisks");
	const rand = rng(7);
	let n = 0;
	for (const line of lines) {
		for (let k = 0; k < 12; k++) {
			const a = Math.floor(rand() * (line.length + 1));
			const b = k % 4 === 0 ? a : Math.floor(rand() * (line.length + 1));
			for (const action of ["bold", "italic"]) {
				const r = richFormat(line, a, b, action, "prose");
				if (!r.ok) continue;
				n++;
				assert.equal(r.text.replace(/\*/g, ""), line.replace(/\*/g, ""));
				if (r.did === "wrap" && !r.partial) {
					const back = richFormat(r.text, r.start, r.end, action, "prose");
					assert.equal(back.ok && back.text, line);
				}
			}
		}
	}
	assert.ok(n > 500, `${n} formats were checked`);
});

test("every emphasis the SPEC writes (`**strong**`, `*em*`) is seen as the format being on, and comes off and goes on again to the same bytes", () => {
	const spec = `${BOOKLET}/SPEC.md`;
	if (!existsSync(spec)) return;
	const src = readFileSync(spec, "utf8");
	let strong = 0;
	let em = 0;
	for (const line of src.split("\n")) {
		if (line.length > 600 || line.startsWith("|")) continue;
		for (const m of line.matchAll(/(?<![*\\])\*\*([^*\s][^*]*?[^*\s]|[^*\s])\*\*(?!\*)/g)) {
			const s = m.index + 2;
			const e = s + m[1].length;
			// skip a span that sits inside an inline code span or a larger run of marks
			if ((line.slice(0, m.index).match(/`/g) ?? []).length % 2) continue;
			const off = richFormat(line, s, e, "bold", "prose");
			assert.equal(off.ok, true, line);
			assert.equal(off.did, "unwrap", line.slice(m.index, m.index + 40));
			assert.equal(off.text, line.slice(0, m.index) + m[1] + line.slice(m.index + m[0].length));
			const on = richFormat(off.text, off.start, off.end, "bold", "prose");
			assert.equal(on.text, line);
			strong++;
		}
		for (const m of line.matchAll(/(?<![*\\\w])\*([^*\s][^*]*?[^*\s]|[^*\s])\*(?![*\w])/g)) {
			if ((line.slice(0, m.index).match(/`/g) ?? []).length % 2) continue;
			const s = m.index + 1;
			const e = s + m[1].length;
			const off = richFormat(line, s, e, "italic", "prose");
			assert.equal(off.ok, true, line);
			assert.equal(off.did, "unwrap", line.slice(m.index, m.index + 40));
			assert.equal(richFormat(off.text, off.start, off.end, "italic", "prose").text, line);
			em++;
		}
	}
	assert.ok(strong > 100, `${strong} strong spans`);
	assert.ok(em >= 3, `${em} em spans`);
});

test("the formats keep a callout title, a question's title and help, and a prose block readable by the format's own parsers", () => {
	// a title with the marks round a word is still the title of the same Booklet line (core's own line reader)
	const line = (title) => `> [!choice|q1 menu:places] ${title}`;
	const m = richFormat("Which tide is higher", 6, 10, "bold", "title");
	assert.equal(m.text, "Which **tide** is higher");
	const p = parseLine(line(m.text));
	assert.equal(p.title, "Which **tide** is higher");
	assert.equal(p.id, "q1");
	const l = richFormat("Which tide is higher", 6, 10, "link", "title");
	assert.equal(parseLine(line(l.text)).title, "Which [tide](https://) is higher");
});
