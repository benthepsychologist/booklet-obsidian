/*
 * Stage 4, step 3 of the Design view, the core (no view): a module's notice (design-notice.ts), the pictures of a prose block
 * (design-image.ts), the figures it places by reference (design-figure.ts) and its citations (design-citation.ts). Text in and text out:
 * every shape the SPEC allows is read and written back byte for byte, every shape it does not allow is refused with a reason in words,
 * and a change followed by its opposite gives the same bytes. Also the hint-and-solution edge that stage 4's first builder flagged as
 * untested (a hint added to a question whose solution stands right under its words).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { core, bookletAround } from "./helpers.mjs";

const {
	readNotice,
	writeNoticeField,
	noticeValueProblem,
	sourceIsLink,
	picturesOf,
	changePicture,
	addDefinition,
	pathWarning,
	defaultPicturePath,
	figuresIn,
	diagramsFor,
	changeFigure,
	citationsOf,
	changeCitation,
	addNote,
	NOT_IN_PATTERN,
	SEVERAL_LINES,
	sourceOfNote,
	addHelp,
	removeHelp,
	parseDesign,
	walkDesign,
	blockLines,
	changeLines,
	changeText,
	DesignHistory,
} = core;

/** Undo through the history's plan, as the view does: the note it would become (nothing is settled until it is written). */
const undone = (h, text) => {
	const p = h.planUndo(text);
	assert.equal(p.ok, true, "Undo is possible");
	h.settleUndo();
	return p.text;
};
const redone = (h, text) => {
	const p = h.planRedo(text);
	assert.equal(p.ok, true, "Redo is possible");
	h.settleRedo();
	return p.text;
};
const L = (s) => s.split("\n");
const J = (a) => a.join("\n");
const reason = (r) => {
	assert.equal(r.ok, false, "refused");
	assert.ok(r.reason.length > 20, `a reason in words: ${r.reason}`);
	return r.reason;
};
const proseAt = (text, needle) => {
	const n = walkDesign(parseDesign(text)).find((x) => x.kind === "prose" && blockLines(text, x).join("\n").includes(needle));
	assert.ok(n, `no prose block holding ${needle}`);
	return n;
};
const noticeLines = (text) => blockLines(text, walkDesign(parseDesign(text)).find((x) => x.kind === "notice"));

// ================================================================ a module's notice

const NOTICE = ["> [!notice]", "> license: Free to copy and share.", "> copyright: Example Press, 2026", "> source: https://example.org/check-in", "> version: 1.2"];

test("notice: the four keys are read as fields, in any order, any of them left out; an unknown or odd line is kept and listed, never a field", () => {
	const n = readNotice(NOTICE);
	assert.deepEqual(
		["license", "copyright", "source", "version"].map((k) => n.fields[k].value),
		["Free to copy and share.", "Example Press, 2026", "https://example.org/check-in", "1.2"],
	);
	assert.deepEqual(n.kept, []);
	assert.equal(n.end, 5);
	const some = readNotice(["> [!notice]", "> version: 2", "> license: MIT"]);
	assert.equal(some.fields.copyright, null);
	assert.equal(some.fields.source, null);
	assert.equal(some.fields.license.line, 2, "the field knows its line");
	const odd = readNotice(["> [!notice]", "> license: MIT", "> author: Me", "> just some words", ">", "> Version: 3"]);
	assert.deepEqual(
		odd.kept.map((k) => k.text),
		["author: Me", "just some words"],
		"kept as written",
	);
	assert.equal(odd.fields.version.value, "3", "a key in another case is the same key");
	assert.equal(odd.fields.version.written, "Version", "and is written as it was");
	const empty = readNotice(["> [!notice]"]);
	assert.equal(empty.fields.license, null);
	assert.equal(empty.end, 1);
	assert.equal(readNotice(["> [!notice]", "> license:"]).fields.license.value, "", "a key with nothing after it is an empty value");
});

test("notice: what the fields cannot show is refused in words and the lines are kept: a key said twice, a stray line under it, a closing line", () => {
	assert.match(reason({ ok: false, reason: readNotice(["> [!notice]", "> license: A", "> license: B"]).refused }), /more than once/);
	assert.match(readNotice(["> [!notice]", "> license: A", "A line under the notice"]).refused, /not part of it/);
	assert.match(readNotice(["> [!module|m]"]).refused, /not a notice/);
	assert.match(readNotice(["> > [!notice]"]).refused, /extra >|not a notice/);
	assert.match(readNotice(["> [!notice]", "> license: A\r"]).refused, /carriage return/);
	assert.match(reason(writeNoticeField(["> [!notice]", "> license: A", "> license: B"], "version", "1")), /more than once/);
});

test("notice: a value changed in place keeps the line's own marks and spacing; a cleared field takes its line out; a new one is added after the last line with words", () => {
	const set = writeNoticeField(NOTICE, "license", "Share alike.");
	assert.deepEqual(set.lines, ["> [!notice]", "> license: Share alike.", ...NOTICE.slice(2)]);
	assert.deepEqual(writeNoticeField(NOTICE, "copyright", "").lines, [NOTICE[0], NOTICE[1], NOTICE[3], NOTICE[4]], "cleared: the line goes, the others stay in order");
	// a line written without the space after `>` and with a capital key keeps its style
	const odd = ["> [!notice]", ">License:   MIT", ">", "> Source: x"];
	assert.deepEqual(writeNoticeField(odd, "license", "Apache").lines, ["> [!notice]", ">License:   Apache", ">", "> Source: x"]);
	// added after the last line that has words, before a blank `>` line, in the style of the lines there
	const gap = ["> [!notice]", ">license: MIT", ">"];
	assert.deepEqual(writeNoticeField(gap, "version", "1.0").lines, ["> [!notice]", ">license: MIT", ">version: 1.0", ">"]);
	assert.deepEqual(writeNoticeField(["> [!notice]"], "source", "Me").lines, ["> [!notice]", "> source: Me"], "an empty notice");
	// an unknown line stays where it is, whatever is written around it
	const withOdd = ["> [!notice]", "> license: A", "> author: Me", "> version: 1"];
	for (const [k, v] of [["license", "B"], ["version", ""], ["source", "http://x"], ["copyright", "Me 2026"]]) {
		const r = writeNoticeField(withOdd, k, v);
		assert.equal(r.ok, true, `${k} ${v}`);
		assert.ok(r.lines.includes("> author: Me"), `the unknown line is kept (${k})`);
		assert.equal(r.lines.indexOf("> author: Me") > r.lines.indexOf("> [!notice]"), true);
	}
	// no change is no change
	assert.deepEqual(writeNoticeField(NOTICE, "license", "Free to copy and share.").lines, NOTICE);
	assert.deepEqual(writeNoticeField(NOTICE, "license", "  Free to copy and share.  ").lines, NOTICE, "spaces round a value are not part of it");
	assert.deepEqual(writeNoticeField(["> [!notice]"], "license", "").lines, ["> [!notice]"], "clearing what is not there");
});

test("notice: every change has its opposite: set then set back, clear then fill again, add then clear all give the same lines", () => {
	for (const key of ["license", "copyright", "source", "version"]) {
		const old = readNotice(NOTICE).fields[key].value;
		const set = writeNoticeField(NOTICE, key, "Changed");
		assert.deepEqual(writeNoticeField(set.lines, key, old).lines, NOTICE, `${key}: set and set back`);
		const cleared = writeNoticeField(NOTICE, key, "");
		assert.equal(cleared.lines.length, NOTICE.length - 1);
		// filling it again puts it after the last line: the same lines when it was the last one
		if (key === "version") assert.deepEqual(writeNoticeField(cleared.lines, key, old).lines, NOTICE);
	}
	let lines = ["> [!notice]"];
	for (const [k, v] of [["license", "A"], ["copyright", "B"], ["source", "C"], ["version", "D"]]) lines = writeNoticeField(lines, k, v).lines;
	assert.deepEqual(lines, ["> [!notice]", "> license: A", "> copyright: B", "> source: C", "> version: D"]);
	for (const k of ["version", "source", "copyright", "license"]) lines = writeNoticeField(lines, k, "").lines;
	assert.deepEqual(lines, ["> [!notice]"], "adding all four and clearing all four gives the notice back");
});

test("notice: a value that would break the line is refused with the reason in words, and nothing is written", () => {
	assert.match(reason(writeNoticeField(NOTICE, "license", "two\nlines")), /one line/);
	assert.match(reason(writeNoticeField(NOTICE, "license", "a <!-- b")), /comment/);
	assert.match(reason(writeNoticeField(NOTICE, "license", '"quoted"')), /quotation marks/);
	assert.match(reason(writeNoticeField(NOTICE, "version", "'single'")), /quotation marks/);
	assert.equal(noticeValueProblem('He said "yes" twice'), null, "quotation marks inside are fine");
	assert.equal(noticeValueProblem("a: b: c"), null, "a colon inside is fine");
	const r = writeNoticeField(NOTICE, "source", "x: y");
	assert.equal(r.lines[3], "> source: x: y");
	assert.equal(readNotice(r.lines).fields.source.value, "x: y", "and it is read back the same");
});

test("notice: the reader links a source only when it starts http:// or https://", () => {
	assert.equal(sourceIsLink("https://example.org/a"), true);
	assert.equal(sourceIsLink("HTTP://example.org"), true);
	assert.equal(sourceIsLink("example.org/a"), false);
	assert.equal(sourceIsLink("ftp://example.org"), false);
	assert.equal(sourceIsLink(""), false);
});

test("notice: in a note, one change is one replacement of the notice's own lines, and the rest of the note keeps every byte", () => {
	const text = bookletAround(["> [!module|m] M", "", ...NOTICE, "", "> [!activity|a] A", "", "Words.  ", "", "> [!module|m end]", ""].join("\n"));
	const node = walkDesign(parseDesign(text)).find((x) => x.kind === "notice");
	const op = changeLines(text, node, writeNoticeField(blockLines(text, node), "license", "Other.").lines);
	assert.equal(op.ok, true);
	assert.equal(op.text, text.replace("license: Free to copy and share.", "license: Other."));
	const back = changeLines(op.text, walkDesign(parseDesign(op.text)).find((x) => x.kind === "notice"), noticeLines(op.text).map((l) => l));
	assert.equal(back.change, null, "writing the same lines changes nothing");
	// undo: the history gives the note back
	const h = new DesignHistory();
	h.record(text, op.text);
	assert.equal(undone(h, op.text), text, "one Undo gives the note back");
	assert.equal(h.canUndo, false);
});

// ================================================================ pictures

const NOTE_IMG = bookletAround(
	[
		"> [!module|m] M",
		"",
		"> [!activity|a] A",
		"",
		"![The harbour at low water][harbour]",
		"",
		"[harbour]: images/harbour.jpg",
		"",
		"> [!module|m end]",
		"",
	].join("\n"),
);

test("pictures: a reference-style picture is read with its definition, found by its id; changing the words touches only the picture's line, the place only the definition's", () => {
	const n = proseAt(NOTE_IMG, "harbour at low");
	const p = picturesOf(NOTE_IMG, n).pictures[0];
	assert.deepEqual([p.form, p.alt, p.id, p.path], ["reference", "The harbour at low water", "harbour", "images/harbour.jpg"]);
	assert.equal(p.definition.line, NOTE_IMG.split("\n").findIndex((l) => l.startsWith("[harbour]:")));
	const alt = changePicture(NOTE_IMG, n, 0, { alt: "Boats at rest" });
	assert.equal(alt.text, NOTE_IMG.replace("![The harbour at low water][harbour]", "![Boats at rest][harbour]"));
	const path = changePicture(NOTE_IMG, n, 0, { path: "images/boats.png" });
	assert.equal(path.text, NOTE_IMG.replace("[harbour]: images/harbour.jpg", "[harbour]: images/boats.png"));
	// both together are one text, with both lines changed
	const both = changePicture(NOTE_IMG, n, 0, { alt: "Boats", path: "images/boats.png" });
	assert.equal(both.text, NOTE_IMG.replace("The harbour at low water", "Boats").replace("images/harbour.jpg", "images/boats.png"));
	// and the opposite gives the bytes back
	assert.equal(changePicture(both.text, n, 0, { alt: "The harbour at low water", path: "images/harbour.jpg" }).text, NOTE_IMG);
	assert.equal(changePicture(alt.text, n, 0, { alt: "The harbour at low water" }).text, NOTE_IMG);
	assert.equal(changePicture(NOTE_IMG, n, 0, { alt: "The harbour at low water" }).text, NOTE_IMG, "no change is no change");
});

test("pictures: an empty alt is a decorative picture and is written as one; a definition keeps its title, its <angle brackets>, its spaces and its group's > marks", () => {
	const n = proseAt(NOTE_IMG, "harbour at low");
	const empty = changePicture(NOTE_IMG, n, 0, { alt: "" });
	assert.equal(empty.text, NOTE_IMG.replace("![The harbour at low water][harbour]", "![][harbour]"));
	assert.equal(picturesOf(empty.text, n).pictures[0].alt, "");
	const titled = NOTE_IMG.replace("[harbour]: images/harbour.jpg", '[Harbour]:   images/harbour.jpg   "The harbour"');
	const t = changePicture(titled, n, 0, { path: "images/port.svg" });
	assert.equal(t.text, titled.replace("images/harbour.jpg", "images/port.svg"), "the label's case, the spaces and the title stay");
	const angled = NOTE_IMG.replace("[harbour]: images/harbour.jpg", "[harbour]: <images/harbour.jpg>");
	assert.equal(changePicture(angled, n, 0, { path: "images/port.svg" }).text, angled.replace("images/harbour.jpg", "images/port.svg"));
	assert.match(reason(changePicture(angled, n, 0, { path: "images/a>b.svg" })), /no < or >/);
	// a definition on the line after a text, in a quote
	const crlf = NOTE_IMG.replace(/\n/g, "\r\n");
	const c = changePicture(crlf, proseAt(crlf, "harbour at low"), 0, { alt: "Boats", path: "images/b.png" });
	assert.equal(c.text, crlf.replace("The harbour at low water", "Boats").replace("images/harbour.jpg", "images/b.png"), "line endings stay");
});

test("pictures: the inline form and Obsidian's file embed are read; the address changes in the line, with the title, the size suffix and the angle brackets kept", () => {
	const text = bookletAround(["> [!activity|a] A", "", "![Boats](images/boats.png)", "", '![Port](<images/port.png> "A title")', "", "![[picture.png]]", "", "![[picture.png|300]]", "", "A line ![in the middle](x.gif) of words.", ""].join("\n"));
	const read = (needle) => picturesOf(text, proseAt(text, needle)).pictures[0];
	assert.deepEqual([read("Boats").form, read("Boats").alt, read("Boats").path], ["inline", "Boats", "images/boats.png"]);
	assert.deepEqual([read("Port").angle, read("Port").path], [true, "images/port.png"]);
	assert.deepEqual([read("![[picture.png]]").form, read("![[picture.png]]").alt, read("![[picture.png]]").path], ["file", null, "picture.png"]);
	assert.equal(read("300").path, "picture.png", "the size suffix is not part of the name");
	assert.equal(read("middle").path, "x.gif", "a picture in a sentence is a picture too");
	const at = (n, change) => changePicture(text, proseAt(text, n), 0, change).text;
	assert.equal(at("Boats", { path: "images/a.webp", alt: "Skiffs" }), text.replace("![Boats](images/boats.png)", "![Skiffs](images/a.webp)"));
	assert.equal(at("Port", { path: "images/q.png" }), text.replace('<images/port.png> "A title"', '<images/q.png> "A title"'), "title and angle brackets stay");
	assert.equal(at("![[picture.png]]", { path: "images/p.png" }), text.replace("![[picture.png]]", "![[images/p.png]]"));
	assert.equal(at("300", { path: "p2.png" }), text.replace("![[picture.png|300]]", "![[p2.png|300]]"), "the size suffix stays");
	assert.equal(at("middle", { alt: "mid" }), text.replace("![in the middle](x.gif)", "![mid](x.gif)"));
	assert.match(reason(changePicture(text, proseAt(text, "![[picture.png]]"), 0, { alt: "Words" })), /no words of its own/);
	// the opposite gives the bytes back
	const there = changePicture(text, proseAt(text, "Boats"), 0, { path: "images/a.webp", alt: "Skiffs" }).text;
	assert.equal(changePicture(there, proseAt(there, "Skiffs"), 0, { path: "images/boats.png", alt: "Boats" }).text, text);
});

test("pictures: an address that cannot be written in the line is refused with the reason, and one that breaks the format's rules is kept and warned about, not refused", () => {
	const text = bookletAround(["> [!activity|a] A", "", "![Boats](images/boats.png)", "", "![[picture.png]]", ""].join("\n"));
	const inl = proseAt(text, "Boats");
	assert.match(reason(changePicture(text, inl, 0, { path: "images/a b.png" })), /no space/);
	assert.match(reason(changePicture(text, inl, 0, { path: "a(1).png" })), /parenthesis/);
	assert.match(reason(changePicture(text, inl, 0, { path: "" })), /needs a place/);
	assert.match(reason(changePicture(text, inl, 0, { alt: "a [b]" })), /square bracket/);
	assert.match(reason(changePicture(text, inl, 0, { alt: "a\nb" })), /line break/);
	assert.match(reason(changePicture(text, proseAt(text, "![[picture.png]]"), 0, { path: "a]b.png" })), /bracket/);
	assert.match(reason(changePicture(text, inl, 0, { path: "sounds/a.mp3" })), /audio/);
	assert.match(reason(changePicture(text, inl, 0, { path: "clips/a.mp4" })), /video/);
	// a remote address and a path against the rules are written as typed
	for (const path of ["https://example.org/a.png", "../up/a.png", "/abs/a.png", "images/.hidden/a.png", "images/a.txt", "images/é.png", "data:image/png;base64,AAAA"]) {
		const r = changePicture(text, inl, 0, { path });
		if (!r.ok) {
			// only a shape problem may refuse (the data: address holds characters a line cannot carry), never a rule of the format
			assert.match(r.reason, /no space|parenthesis|quotation/, path);
			continue;
		}
		assert.equal(picturesOf(r.text, inl).pictures[0].path, path, `kept as typed: ${path}`);
		assert.ok(pathWarning(path), `warned: ${path}`);
	}
	assert.equal(pathWarning("images/boats.png"), null);
	assert.equal(pathWarning("a/b-c_d.2.JPEG"), null, "any case of an image extension");
	assert.match(pathWarning("https://example.org/a.png"), /remote address.*never requests it unasked/);
	assert.match(pathWarning("//cdn.example/a.png"), /remote address/);
	assert.match(pathWarning("data:image/png;base64,AAAA"), /scheme data:/);
	assert.match(pathWarning("file:///a.png"), /scheme file:/);
	assert.match(pathWarning("/a.png"), /starts with a \//);
	assert.match(pathWarning("../a.png"), /empty part or a part that begins with a dot/);
	assert.match(pathWarning("a/.b/c.png"), /begins with a dot/);
	assert.match(pathWarning("a b.png"), /other than letters, digits/);
	assert.match(pathWarning("a%20b.png"), /other than letters, digits/);
	assert.match(pathWarning(`${"a".repeat(200)}.png`), /longer than 200/);
	assert.match(pathWarning("a/b.txt"), /does not end in \.svg/);
	assert.match(pathWarning("a/b"), /does not end in \.svg/);
	assert.equal(pathWarning(`${"a".repeat(196)}.png`), null, "200 characters exactly");
});

test("pictures: the definition is found as the reader finds it: its own place, then its module's data section, then the shared one, never another module's", () => {
	const text = bookletAround(
		[
			"> [!module|m] M",
			"",
			"> [!activity|a] A",
			"",
			"![One][pic]",
			"",
			"![Two][only-shared]",
			"",
			"![Three][other]",
			"",
			"![Four][nowhere]",
			"",
			"[pic]: images/own.png",
			"",
			"> [!module|m end]",
			"",
			"> [!module|n] N",
			"",
			"> [!activity|b] B",
			"",
			"![Five][pic]",
			"",
			"> [!module|n end]",
			"",
			"> [!data|n] Data for n",
			"",
			"[pic]: images/n-data.png",
			"[other]: images/n-other.png",
			"",
			"> [!data] Shared",
			"",
			"[pic]: images/shared.png",
			"[only-shared]: images/only-shared.png",
			"",
		].join("\n"),
	);
	const path = (needle) => picturesOf(text, proseAt(text, needle)).pictures[0].path;
	assert.equal(path("One"), "images/own.png", "its own place first");
	assert.equal(path("Two"), "images/only-shared.png", "the shared section");
	assert.equal(path("Three"), null, "another module's data section is not seen");
	assert.equal(path("Four"), null, "no definition at all");
	assert.equal(path("Five"), "images/n-data.png", "the module's own data section before the shared one");
	const four = picturesOf(text, proseAt(text, "Four")).pictures[0];
	assert.equal(four.definition, null);
	assert.match(reason(changePicture(text, proseAt(text, "Four"), 0, { path: "images/a.png" })), /Add it first/);
	// the words can be changed with no definition
	assert.equal(changePicture(text, proseAt(text, "Four"), 0, { alt: "Fourth" }).ok, true);
});

test("pictures: a missing definition is offered, not made: adding it writes a blank line and `[id]: images/id.jpg` after the block, and taking it away again gives the note back", () => {
	const text = bookletAround(["> [!activity|a] A", "", "![Words][new-one]", "", "Next.", ""].join("\n"));
	const n = proseAt(text, "new-one");
	const add = addDefinition(text, n, 0);
	assert.equal(add.ok, true);
	assert.equal(add.text, text.replace("![Words][new-one]\n\nNext.", "![Words][new-one]\n\n[new-one]: images/new-one.jpg\n\nNext."));
	const after = picturesOf(add.text, n).pictures[0];
	assert.equal(after.path, "images/new-one.jpg");
	assert.match(reason(addDefinition(add.text, n, 0)), /already/);
	assert.equal(add.text.replace("[new-one]: images/new-one.jpg\n\n", ""), text, "taking its two lines away gives the note back");
	assert.equal(defaultPicturePath("My Pic!"), "images/My-Pic.jpg");
	// no blank line after the block: one is added so the next line does not run into the definition
	const tight = bookletAround(["> [!activity|a] A", "", "![Words][t]", "> [!note] N", "> body", ""].join("\n"));
	assert.equal(addDefinition(tight, proseAt(tight, "[t]"), 0).text.includes("[t]: images/t.jpg\n\n> [!note] N"), true);
	assert.match(reason(addDefinition(bookletAround(["> [!activity|a] A", "", "![x](a.png)", ""].join("\n")), proseAt(bookletAround(["> [!activity|a] A", "", "![x](a.png)", ""].join("\n")), "![x]"), 0)), /reference style/);
	// at the end of a file with no final newline
	const noEnd = bookletAround(["> [!activity|a] A", "", "![Words][t]"].join("\n"));
	assert.equal(addDefinition(noEnd, proseAt(noEnd, "[t]"), 0).text.endsWith("![Words][t]\n\n[t]: images/t.jpg"), true);
});

test("pictures: audio and video are media and no picture here; code is not a picture; a shape the fields do not read is counted and left as written", () => {
	const text = bookletAround(
		[
			"> [!activity|a] A",
			"",
			"![Lecture](media/lecture.mp3)",
			"",
			"![[clip.mp4]]",
			"",
			"![Lecture][lec]",
			"",
			"[lec]: media/lecture.mp3",
			"",
			"`![in code](a.png)` and ![a [nested] one](b.png) and ![[#^fig]] and ![[file#^fig]]",
			"",
			"```",
			"![in a fence](a.png)",
			"```",
			"",
		].join("\n"),
	);
	assert.deepEqual(picturesOf(text, proseAt(text, "Lecture](media")).pictures, []);
	assert.deepEqual(picturesOf(text, proseAt(text, "clip.mp4")).pictures, []);
	assert.deepEqual(picturesOf(text, proseAt(text, "![Lecture][lec]")).pictures, [], "a reference to an audio file is media");
	const odd = picturesOf(text, proseAt(text, "nested"));
	assert.deepEqual(odd.pictures, []);
	assert.equal(odd.other, 1, "the nested bracket is a shape the fields do not read");
	assert.equal(walkDesign(parseDesign(text)).some((x) => x.kind === "prose" && picturesOf(text, x).pictures.some((p) => p.alt === "in a fence")), false, "a fence is code, not a picture");
});

test("pictures: two pictures in a block are told apart, and two that share a definition both show the new place", () => {
	const text = bookletAround(["> [!activity|a] A", "", "![One][p]", "![Two][p]", "![Three](c.png)", "", "[p]: images/p.png", ""].join("\n"));
	const n = proseAt(text, "One");
	const all = picturesOf(text, n).pictures;
	assert.deepEqual(all.map((p) => [p.index, p.alt, p.path]), [[0, "One", "images/p.png"], [1, "Two", "images/p.png"], [2, "Three", "c.png"]]);
	const r = changePicture(text, n, 1, { path: "images/q.png", alt: "Deux" });
	assert.equal(r.text, text.replace("![Two][p]", "![Deux][p]").replace("[p]: images/p.png", "[p]: images/q.png"));
	assert.deepEqual(picturesOf(r.text, n).pictures.map((p) => [p.alt, p.path]), [["One", "images/q.png"], ["Deux", "images/q.png"], ["Three", "c.png"]]);
	assert.equal(changePicture(text, n, 2, { path: "d.png" }).text, text.replace("(c.png)", "(d.png)"));
	assert.match(reason(changePicture(text, n, 9, { path: "d.png" })), /no such picture/);
});

// ================================================================ figures

const NOTE_FIG = bookletAround(
	[
		"> [!module|m] M",
		"",
		"> [!activity|a] A",
		"",
		"Here is the cycle:",
		"",
		"![[#^own]]",
		"",
		"![[#^shared]]",
		"",
		"![[#^gone]]",
		"",
		"```mermaid",
		"graph LR; A --> B",
		"```",
		"^own",
		"",
		"```booklet widget",
		'{"engine":"x"}',
		"```",
		"^a-widget",
		"",
		"> [!module|m end]",
		"",
		"> [!module|n] N",
		"",
		"> [!activity|b] B",
		"",
		"![[#^other]]",
		"",
		"> [!module|n end]",
		"",
		"> [!data|n] Data for n",
		"",
		"```mermaid",
		"graph LR; X --> Y",
		"```",
		"^other",
		"",
		"> [!data|m] Data for m",
		"",
		"```mermaid",
		"graph LR; M --> D",
		"```",
		"^in-data",
		"",
		"> [!data] Shared",
		"",
		"```mermaid",
		"graph LR; S --> T",
		"```",
		"^shared",
		"",
		"```mermaid",
		"graph LR; S --> U",
		"```",
		"^shared-two",
		"",
	].join("\n"),
);

test("figures: the embed `![[#^id]]` is read with its place in the line; other block embeds are counted and left alone", () => {
	const n = proseAt(NOTE_FIG, "![[#^own]]");
	assert.deepEqual(figuresIn(blockLines(NOTE_FIG, n)).embeds.map((e) => [e.id, e.from, e.to]), [["own", 0, 10]]);
	const lines = ["Text ![[#^a]] and ![[#^b-2]].", "![[file#^c]] ![[#^d extra]] `![[#^code]]`", "```", "![[#^fenced]]", "```"];
	const f = figuresIn(lines);
	assert.deepEqual(f.embeds.map((e) => [e.index, e.line, e.id]), [[0, 0, "a"], [1, 0, "b-2"]]);
	assert.equal(f.other, 2, "a file's block and an id with more after it stay as written");
});

test("figures: the picker offers the diagrams the page can see: its module's own (fence and data section), then the shared ones, never another module's, and only mermaid fences", () => {
	const ids = (needle) => diagramsFor(NOTE_FIG, proseAt(NOTE_FIG, needle)).map((d) => d.id);
	assert.deepEqual(ids("![[#^own]]"), ["own", "in-data", "shared", "shared-two"], "own first, then the module's data section, then the shared ones; a widget's fence is no figure");
	assert.deepEqual(ids("![[#^other]]"), ["other", "shared", "shared-two"], "module n sees its own data section and the shared one, not m's");
	assert.equal(ids("![[#^own]]").includes("other"), false, "another module's diagram is not offered");
	assert.equal(ids("![[#^own]]").includes("a-widget"), false);
	assert.equal(ids("Here is the cycle").length, 4);
});

test("figures: choosing a diagram rewrites the id in the embed and nothing else; a diagram that is not in reach is refused; a missing id is kept until something else is chosen", () => {
	const n = proseAt(NOTE_FIG, "![[#^own]]");
	const r = changeFigure(NOTE_FIG, n, 0, "in-data");
	assert.equal(r.text, NOTE_FIG.replace("![[#^own]]", "![[#^in-data]]"));
	assert.equal(changeFigure(r.text, n, 0, "own").text, NOTE_FIG, "and back");
	assert.equal(changeFigure(NOTE_FIG, n, 0, "own").text, NOTE_FIG, "the same choice is no change");
	assert.match(reason(changeFigure(NOTE_FIG, n, 0, "other")), /not a diagram this page can see/);
	assert.match(reason(changeFigure(NOTE_FIG, n, 0, "a-widget")), /not a diagram this page can see/);
	assert.match(reason(changeFigure(NOTE_FIG, n, 0, "nothing-here")), /not a diagram/);
	const gone = proseAt(NOTE_FIG, "![[#^gone]]");
	assert.deepEqual(figuresIn(blockLines(NOTE_FIG, gone)).embeds.map((e) => e.id), ["gone"], "a missing id is read as written");
	assert.equal(diagramsFor(NOTE_FIG, gone).some((d) => d.id === "gone"), false, "and is not among the diagrams");
	assert.equal(changeFigure(NOTE_FIG, gone, 0, "gone").text, NOTE_FIG, "keeping it is no change");
	assert.equal(changeFigure(NOTE_FIG, gone, 0, "shared").text, NOTE_FIG.replace("![[#^gone]]", "![[#^shared]]"));
	// two embeds in a sentence
	const two = bookletAround(["> [!activity|a] A", "", "See ![[#^x]] then ![[#^y]].", "", "```mermaid", "g", "```", "^x", "", "```mermaid", "h", "```", "^y", ""].join("\n"));
	const t = proseAt(two, "See");
	assert.equal(changeFigure(two, t, 1, "x").text, two.replace("![[#^y]].", "![[#^x]]."));
	assert.match(reason(changeFigure(two, t, 5, "x")), /no such figure/);
});

// ================================================================ citations

const NOTE_CITE = bookletAround(
	[
		"> [!module|m] M",
		"",
		"> [!activity|a] A",
		"",
		"Most harbours see two high tides.[^atlas-12]",
		"",
		"No source here.[^lost]",
		"",
		"Plain note.[^plain] Several lines.[^long] Shared.[^shared] Another module.[^theirs]",
		"",
		'[^atlas-12]: *The Harbour Tide Atlas*, 2nd edition (2019), p. 12: "The tide rises and falls twice in each lunar day." Verified 2026-09-20.',
		"",
		"[^plain]: Just a reference, as words.",
		"",
		'[^long]: *Long*, p. 1:',
		'    "The quote on the next line." Verified 2026-01-01.',
		"",
		"> [!module|m end]",
		"",
		"> [!module|n] N",
		"",
		"> [!activity|b] B",
		"",
		"Hers.[^theirs]",
		"",
		'[^theirs]: *Hers*: "Not for module m."',
		"",
		"> [!module|n end]",
		"",
		"> [!data] Shared",
		"",
		'[^shared]: *Shared Source*, 3rd ed.: "From the shared section."',
		"",
	].join("\n"),
);

test("citation: every mark of the block is read with the definition the reader would use: the module's own, else the plain data section, never another module's", () => {
	const c = citationsOf(NOTE_CITE, proseAt(NOTE_CITE, "Most harbours"));
	assert.deepEqual(c.map((x) => x.id), ["atlas-12"]);
	assert.deepEqual(c[0].note.fields, { title: "The Harbour Tide Atlas", detail: "2nd edition (2019)", page: "p. 12", quote: "The tide rises and falls twice in each lunar day.", verified: "2026-09-20" });
	assert.equal(c[0].note.line, NOTE_CITE.split("\n").findIndex((l) => l.startsWith("[^atlas-12]")));
	const many = citationsOf(NOTE_CITE, proseAt(NOTE_CITE, "Plain note"));
	assert.deepEqual(many.map((x) => x.id), ["plain", "long", "shared", "theirs"]);
	assert.equal(many[0].note.fields, null);
	assert.equal(many[0].note.why, NOT_IN_PATTERN);
	assert.equal(NOT_IN_PATTERN, "This note is not in the source pattern, so it is edited as words below.");
	assert.equal(many[1].note.why, SEVERAL_LINES, "a note over several lines is not offered as fields");
	assert.deepEqual(many[2].note.fields, { title: "Shared Source", detail: "3rd ed.", page: "", quote: "From the shared section.", verified: "" }, "the plain data section is used when the module has none");
	assert.equal(many[3].note, null, "another module's note is not seen");
	assert.equal(citationsOf(NOTE_CITE, proseAt(NOTE_CITE, "No source here"))[0].note, null, "a mark with no definition");
	assert.deepEqual(citationsOf(NOTE_CITE, proseAt(NOTE_CITE, "Hers"))[0].note.fields.title, "Hers", "module n's own note");
	// the reader's own pattern and the fields agree on every note read
	for (const x of [...c, many[2]]) {
		const n = x.note.fields;
		const words = NOTE_CITE.split("\n")[x.note.line].replace(/^\[\^[^\]]+\]:\s*/, "");
		assert.deepEqual(sourceOfNote(words), n);
	}
});

test("citation: each field changes only its own piece and keeps the punctuation the line has; a piece that is not there is added the way the pattern writes it", () => {
	const n = proseAt(NOTE_CITE, "Most harbours");
	const line = '[^atlas-12]: *The Harbour Tide Atlas*, 2nd edition (2019), p. 12: "The tide rises and falls twice in each lunar day." Verified 2026-09-20.';
	const at = (change) => changeCitation(NOTE_CITE, n, "atlas-12", change);
	assert.equal(at({ title: "Atlas" }).text, NOTE_CITE.replace("*The Harbour Tide Atlas*", "*Atlas*"));
	assert.equal(at({ detail: "3rd edition" }).text, NOTE_CITE.replace("2nd edition (2019)", "3rd edition"));
	assert.equal(at({ page: "pp. 12-14" }).text, NOTE_CITE.replace("p. 12:", "pp. 12-14:"));
	assert.equal(at({ quote: "Twice." }).text, NOTE_CITE.replace("The tide rises and falls twice in each lunar day.", "Twice."));
	assert.equal(at({ verified: "2026-10-01" }).text, NOTE_CITE.replace("2026-09-20", "2026-10-01"));
	// pieces taken away: the page, the detail, both, the date
	assert.equal(at({ page: "" }).text, NOTE_CITE.replace(", p. 12:", ":"));
	assert.equal(at({ detail: "" }).text, NOTE_CITE.replace("2nd edition (2019), p. 12", "p. 12"));
	assert.equal(at({ detail: "", page: "" }).text, NOTE_CITE.replace(", 2nd edition (2019), p. 12:", ":"));
	assert.equal(at({ verified: "" }).text, NOTE_CITE.replace(' Verified 2026-09-20.', ""));
	// pieces added to a note with none
	const bare = NOTE_CITE.replace(line, '[^atlas-12]: *Atlas*: "Quote."');
	const add = (change) => changeCitation(bare, n, "atlas-12", change).text;
	assert.equal(add({ page: "p. 3" }), bare.replace('*Atlas*: "Quote."', '*Atlas*, p. 3: "Quote."'));
	assert.equal(add({ detail: "2nd ed." }), bare.replace('*Atlas*: "Quote."', '*Atlas*, 2nd ed.: "Quote."'));
	assert.equal(add({ verified: "2026-01-02" }), bare.replace('"Quote."', '"Quote." Verified 2026-01-02.'));
	assert.equal(changeCitation(bare, n, "atlas-12", { detail: "D", page: "art. 14" }).text, bare.replace('*Atlas*: "Quote."', '*Atlas*, D, art. 14: "Quote."'));
	// a detail and a page each added to a note that has the other
	const justPage = NOTE_CITE.replace(line, '[^atlas-12]: *Atlas*, p. 9: "Quote."');
	assert.equal(changeCitation(justPage, n, "atlas-12", { detail: "2nd ed." }).text, justPage.replace("*Atlas*, p. 9:", "*Atlas*, 2nd ed., p. 9:"));
	const justDetail = NOTE_CITE.replace(line, '[^atlas-12]: *Atlas*, 2nd ed.: "Quote."');
	assert.equal(changeCitation(justDetail, n, "atlas-12", { page: "p. 9" }).text, justDetail.replace("*Atlas*, 2nd ed.:", "*Atlas*, 2nd ed., p. 9:"));
});

test("citation: odd spacing and curly quotes are kept as written, and only the piece asked for changes", () => {
	const odd = NOTE_CITE.replace(
		'[^atlas-12]: *The Harbour Tide Atlas*, 2nd edition (2019), p. 12: "The tide rises and falls twice in each lunar day." Verified 2026-09-20.',
		'[^atlas-12]:   *The Harbour Tide Atlas* ,2nd edition,p. 12 :  “The tide.”   Verified   2026-09-20   ',
	);
	const n = proseAt(odd, "Most harbours");
	const c = citationsOf(odd, n)[0].note.fields;
	assert.deepEqual(c, { title: "The Harbour Tide Atlas", detail: "2nd edition", page: "p. 12", quote: "The tide.", verified: "2026-09-20" });
	const q = changeCitation(odd, n, "atlas-12", { quote: "Twice." });
	assert.equal(q.text, odd.replace("The tide.", "Twice."), "the spaces, the curly quotes and the rest stay");
	const t = changeCitation(odd, n, "atlas-12", { title: "Atlas" });
	assert.equal(t.text, odd.replace("The Harbour Tide Atlas", "Atlas"));
	const p = changeCitation(odd, n, "atlas-12", { page: "pp. 1-2" });
	assert.equal(p.text, odd.replace("p. 12 :", "pp. 1-2 :"));
	const d = changeCitation(odd, n, "atlas-12", { verified: "2026-02-03" });
	assert.equal(d.text, odd.replace("2026-09-20", "2026-02-03"));
	// the opposite gives the bytes back
	for (const [change, inverse] of [
		[{ title: "X" }, { title: "The Harbour Tide Atlas" }],
		[{ quote: "Y" }, { quote: "The tide." }],
		[{ page: "p. 1" }, { page: "p. 12" }],
		[{ detail: "Z" }, { detail: "2nd edition" }],
		[{ verified: "2020-01-01" }, { verified: "2026-09-20" }],
	]) {
		const there = changeCitation(odd, n, "atlas-12", change).text;
		assert.equal(changeCitation(there, n, "atlas-12", inverse).text, odd, JSON.stringify(change));
	}
});

test("citation: whatever is changed, the reader's own pattern reads the note back with exactly the fields asked for; what it would not read back is refused, with nothing written", () => {
	const n = proseAt(NOTE_CITE, "Most harbours");
	const at = (change) => changeCitation(NOTE_CITE, n, "atlas-12", change);
	assert.match(reason(at({ title: "" })), /needs a title/);
	assert.match(reason(at({ title: "a *b* c" })), /cannot hold a \*/);
	assert.match(reason(at({ quote: "" })), /needs its quote/);
	assert.match(reason(at({ quote: "two\nlines" })), /one line/);
	assert.match(reason(at({ detail: "a: b" })), /colon/);
	assert.match(reason(at({ page: "p. 1: 2" })), /colon/);
	assert.match(reason(at({ page: "12" })), /begins p\., pp\., art\./);
	assert.match(reason(at({ page: "page 12" })), /begins p\./);
	assert.match(reason(at({ verified: "20 Sept 2026" })), /year-month-day/);
	assert.match(reason(at({ verified: "2026-02-30" })), /real date/);
	// a detail that the reader would take as the page, and a page with a comma in it: the pattern would not give the fields back
	assert.match(reason(changeCitation(NOTE_CITE.replace(", p. 12:", ":").replace("2nd edition (2019)", "2nd edition"), n, "atlas-12", { detail: "p. 3" })), /would not read that note back/);
	assert.match(reason(at({ page: "pp. 12, 14" })), /would not read that note back/);
	// a quote that holds quotation marks, and one that holds `Verified` words, come back the same
	for (const quote of ['He said "yes" twice.', "Verified 2020-01-01 is a date in the quote", "a “b” c"]) {
		const r = at({ quote });
		assert.equal(r.ok, true, quote);
		assert.equal(citationsOf(r.text, n)[0].note.fields.quote, quote, `read back: ${quote}`);
	}
	// everything the reader reads back is what was typed, whatever the combination
	const kinds = { title: ["T", "Ünïcode Title"], detail: ["", "ed. 2", "2nd, rev."], page: ["", "p. 1", "pp. 1-2", "art. 14", "§ 3", "sec. 2"], quote: ["Q", "Quote, with: colon"], verified: ["", "2026-01-31"] };
	let tried = 0;
	for (const title of kinds.title) for (const detail of kinds.detail) for (const page of kinds.page) for (const quote of kinds.quote) for (const verified of kinds.verified) {
		const r = at({ title, detail, page, quote, verified });
		assert.equal(r.ok, true, JSON.stringify({ title, detail, page, quote, verified }));
		assert.deepEqual(citationsOf(r.text, n)[0].note.fields, { title, detail, page, quote, verified });
		tried++;
	}
	assert.equal(tried, 2 * 3 * 6 * 2 * 2);
});

test("citation: a note that does not fit the pattern, a note over several lines and a mark with no note get no fields; the note's lines are kept and nothing is written", () => {
	const plain = proseAt(NOTE_CITE, "Plain note");
	assert.match(reason(changeCitation(NOTE_CITE, plain, "plain", { quote: "x" })), /not in the source pattern/);
	assert.match(reason(changeCitation(NOTE_CITE, plain, "long", { quote: "x" })), /more than one line/);
	assert.match(reason(changeCitation(NOTE_CITE, proseAt(NOTE_CITE, "No source here"), "lost", { quote: "x" })), /no note to change/);
	assert.match(reason(changeCitation(NOTE_CITE, plain, "theirs", { quote: "x" })), /no note to change/);
	assert.match(reason(changeCitation(NOTE_CITE, plain, "never-marked", { quote: "x" })), /no such mark/);
	// notes that look alike but are not in the pattern
	for (const words of ['*Title* "no colon"', "*Title*: no quote marks", '*Title*, p. 1: ""', "Title without italics: \"q\"", '*Title*, p. 1: "q" Verified 2026-9-1.', '*Title*, p. 1: "q" and more after']) {
		const t = NOTE_CITE.replace('[^plain]: Just a reference, as words.', `[^plain]: ${words}`);
		const c = citationsOf(t, proseAt(t, "Plain note"))[0];
		assert.equal(c.note.fields, null, words);
		assert.equal(sourceOfNote(words), null, `the reader does not read it either: ${words}`);
	}
});

test("citation: a note is added for a mark that has none, as the Add panel's piece has it; a change then undone gives the note back", () => {
	const n = proseAt(NOTE_CITE, "No source here");
	const add = addNote(NOTE_CITE, n, "lost");
	assert.equal(add.ok, true);
	assert.equal(add.text, NOTE_CITE.replace("No source here.[^lost]\n\n", 'No source here.[^lost]\n\n[^lost]: *Title of the source*, p. 1: "The words, copied exactly from the source."\n\n'));
	assert.deepEqual(citationsOf(add.text, n)[0].note.fields, { title: "Title of the source", detail: "", page: "p. 1", quote: "The words, copied exactly from the source.", verified: "" });
	assert.match(reason(addNote(add.text, n, "lost")), /already/);
	assert.match(reason(addNote(NOTE_CITE, n, "other")), /no such mark/);
	assert.match(reason(addNote(NOTE_CITE, proseAt(NOTE_CITE, "Plain note"), "plain")), /already/, "a note that is not in the pattern is still a note");
});

test("citation: a mark inside code is no mark, a definition in the same block is found, and the block's own text is not changed by a change of its note", () => {
	const text = bookletAround(["> [!activity|a] A", "", "A `[^code]` and a real one.[^real]", '[^real]: *Same Block*: "Quote."', ""].join("\n"));
	const n = proseAt(text, "real one");
	assert.deepEqual(citationsOf(text, n).map((c) => c.id), ["real"]);
	const r = changeCitation(text, n, "real", { quote: "Other." });
	assert.equal(r.text, text.replace('"Quote."', '"Other."'));
	const op = changeText(text, r.text, n.start);
	assert.equal(op.ok, true);
	assert.equal(op.text, r.text);
});

test("citation and picture: one change on the note as a whole is one replacement, and the history takes it back with one Undo", () => {
	const n = proseAt(NOTE_IMG, "harbour at low");
	const made = changePicture(NOTE_IMG, n, 0, { alt: "A", path: "images/a.png" });
	const op = changeText(NOTE_IMG, made.text, n.start);
	assert.equal(op.ok, true);
	assert.equal(op.change.text.length > 0, true);
	const h = new DesignHistory();
	h.record(NOTE_IMG, op.text);
	const un = undone(h, op.text);
	assert.equal(un, NOTE_IMG, "one Undo gives both lines back");
	assert.equal(h.canUndo, false, "and it was one step");
	assert.equal(redone(h, un), op.text);
});

// ================================================================ the edge stage 4's first builder flagged

test("helps: a hint added to a question whose solution stands right under its words, with no blank line, goes back out to the same lines", () => {
	const cases = [
		["> [!text|q] Q?", "> desc", "> [!solution]- S", "> words"],
		["> [!text|q] Q?", "> [!solution]- S", "> words"],
		["> [!text|q] Q?", "> desc", "", "> [!solution]- S", "> words"],
		["> [!choice|c] Q?", "- [ ] A", "- [ ] B", "> [!solution]- S", "> words"],
	];
	for (const lines of cases) {
		const a = addHelp(lines, "hint");
		assert.equal(a.ok, true, J(lines));
		assert.deepEqual(removeHelp(a.lines, "hint").lines, lines, J(a.lines));
		// and in a note: the solution is still the question's own, and the whole note comes back
		const text = bookletAround(["> [!activity|a] A", "", ...lines, ""].join("\n"));
		const node = walkDesign(parseDesign(text)).find((x) => x.kind === "question");
		const op = changeLines(text, node, a.lines);
		assert.equal(op.ok, true);
		const node2 = walkDesign(parseDesign(op.text)).find((x) => x.kind === "question");
		assert.deepEqual(blockLines(op.text, node2), a.lines);
		const back = changeLines(op.text, node2, removeHelp(blockLines(op.text, node2), "hint").lines);
		assert.equal(back.text, text);
	}
});
