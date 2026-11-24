/*
 * Stage 4, step 3 of the Design view's editor in place, run in node over jsdom with the stand-in for Obsidian: a module's notice as four
 * fields, a prose block's pictures (two fields each), its figures (a picker) and its citations (the fields of the source). Every change is
 * one write and one step of Undo through the same `changeLines` and kept-data guard as the rest, a change applies when its field is left,
 * and the note is the only truth: what is shown is read back from it. A shape the fields cannot show faithfully says why in words and
 * leaves the Markdown box as the way to edit. How it looks is measured in the real app, which this is not.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { window as w, click, words, typeInto } from "./dom.mjs";
import { core, bookletAround } from "./helpers.mjs";
import { openDesign } from "./design-harness.mjs";

const { Setting } = await import("./obsidian-stub.mjs");
const { DESIGN_STRINGS } = core;
const en = (k) => DESIGN_STRINGS[k].en;
const fill = (k, vars = {}) => en(k).replace(/\{(\w+)\}/g, (_, n) => String(vars[n]));

const NOTE = bookletAround(
	[
		"> [!module|m] Week",
		"",
		"> [!notice]",
		"> license: Free to copy and share.",
		"> copyright: Example Press, 2026",
		"> author: Kept as written",
		"> source: example.org/check-in",
		"",
		"> [!tab|learn] Learn",
		"",
		"> [!activity|alpha tab:learn] Alpha",
		"",
		"The harbour at low water:",
		"",
		"![The harbour at low water][harbour]",
		"",
		"![Boats](images/boats.png)",
		"",
		"![[picture.png]]",
		"",
		"![Gone][gone]",
		"",
		"[harbour]: images/harbour.jpg",
		"",
		"Here is the cycle: ![[#^own]] and a missing one ![[#^nowhere]].",
		"",
		"```mermaid",
		"graph LR; A --> B",
		"```",
		"^own",
		"",
		"Most harbours see two high tides.[^atlas] Plain.[^plain] Lost.[^lost]",
		"",
		'[^atlas]: *The Harbour Tide Atlas*, 2nd edition (2019), p. 12: "The tide rises and falls twice in each lunar day." Verified 2026-09-20.',
		"",
		"[^plain]: Just words, not in the pattern.",
		"",
		"> [!module|m end]",
		"",
		"> [!module|n] Other",
		"",
		"> [!activity|beta] Beta",
		"",
		"Their figure: ![[#^theirs]]",
		"",
		"```mermaid",
		"graph LR; X --> Y",
		"```",
		"^theirs",
		"",
		"> [!module|n end]",
		"",
		"> [!data] Shared",
		"",
		"```mermaid",
		"graph LR; S --> T",
		"```",
		"^shared",
		"",
	].join("\n"),
);

function rig(text) {
	Setting.reset();
	const o = openDesign(text);
	return {
		...o,
		ctl: (label) => {
			const hit = [...o.editor().querySelectorAll("input, button, select, textarea")].filter((e) => e.getAttribute("aria-label") === label);
			assert.equal(hit.length, 1, `one control labelled ${label} (${hit.length})`);
			return hit[0];
		},
		has: (label) => [...o.editor().querySelectorAll("input, button, select, textarea")].some((e) => e.getAttribute("aria-label") === label),
		key: (k) => o.editor().querySelector(`[data-key="${k}"]`),
		async type(el, value) {
			typeInto(el, value);
			el.dispatchEvent(new w.Event("change", { bubbles: true }));
			await o.settle();
		},
		async press(el) {
			click(el);
			await o.settle();
		},
		async choose(select, value) {
			select.value = value;
			// Obsidian's dropdown listens for change; the stand-in's for input: both are sent
			select.dispatchEvent(new w.Event("input", { bubbles: true }));
			select.dispatchEvent(new w.Event("change", { bubbles: true }));
			await o.settle();
		},
		refusal: () => words(o.el.querySelector(".booklet-design-edit-refusal")),
		md: () => o.area().value.split("\n"),
		async undoAll(n) {
			for (let i = 0; i < n; i++) {
				click(o.undo());
				await o.settle();
			}
		},
		async redoAll(n) {
			for (let i = 0; i < n; i++) {
				click(o.redo());
				await o.settle();
			}
		},
	};
}

/** A rig with the Alpha page open and its prose block that holds `needle` open in place. */
function onProse(needle, text = NOTE) {
	const v = rig(text);
	v.go("Alpha");
	v.select("prose", needle);
	return v;
}

// ================================================================ the notice

test("notice: its four fields are read from the note; an unknown line is listed as kept; a source that is no link gets a quiet note, not a refusal", () => {
	const v = rig(NOTE);
	v.go("Week");
	v.select("notice", "[!notice]");
	assert.equal(v.key("notice-license").value, "Free to copy and share.");
	assert.equal(v.key("notice-copyright").value, "Example Press, 2026");
	assert.equal(v.key("notice-source").value, "example.org/check-in");
	assert.equal(v.key("notice-version").value, "", "a key left out is an empty field");
	for (const k of ["license", "copyright", "source", "version"]) assert.ok(v.key(`notice-${k}`).getAttribute("aria-label"), `${k} is labelled`);
	assert.match(words(v.editor().querySelector('[data-notice="kept"]')), /author: Kept as written/, "kept as written, listed");
	const note = v.editor().querySelector('[data-notice="not-a-link"]');
	assert.equal(note.hidden, false, "a source that does not start http:// or https:// is told so");
	assert.equal(words(note), en("notice.sourceNotLink"));
	typeInto(v.key("notice-source"), "https://example.org/a");
	assert.equal(note.hidden, true, "the note goes as it is typed");
	v.close();
});

test("notice: a field applies when it is left, as one write and one step of Undo; the unknown line and the order stay; Undo and Redo give the same bytes", async () => {
	const v = rig(NOTE);
	v.go("Week");
	v.select("notice", "[!notice]");
	const before = v.disk.text;
	await v.type(v.key("notice-license"), "Share alike.");
	assert.equal(v.disk.writes, 1);
	assert.equal(v.disk.text, before.replace("license: Free to copy and share.", "license: Share alike."));
	await v.type(v.key("notice-version"), "1.2");
	assert.equal(v.disk.writes, 2);
	assert.equal(v.disk.text, before.replace("license: Free to copy and share.", "license: Share alike.").replace("source: example.org/check-in", "source: example.org/check-in\n> version: 1.2"), "a new key goes after the last line of the notice");
	assert.ok(v.disk.text.includes("> author: Kept as written"), "the unknown line is still there");
	const done = v.disk.text;
	await v.undoAll(2);
	assert.equal(v.disk.text, before);
	assert.equal(v.key("notice-license").value, "Free to copy and share.", "the fields follow the note");
	await v.redoAll(2);
	assert.equal(v.disk.text, done);
	v.close();
});

test("notice: clearing a field takes its line out and clearing it again changes nothing; fill then clear gives the same bytes", async () => {
	const v = rig(NOTE);
	v.go("Week");
	v.select("notice", "[!notice]");
	const before = v.disk.text;
	await v.type(v.key("notice-copyright"), "");
	assert.equal(v.disk.text, before.replace("> copyright: Example Press, 2026\n", ""));
	const w1 = v.disk.writes;
	await v.type(v.key("notice-copyright"), "");
	assert.equal(v.disk.writes, w1, "nothing to clear is nothing written");
	await v.type(v.key("notice-version"), "3");
	await v.type(v.key("notice-version"), "");
	assert.equal(v.disk.text, before.replace("> copyright: Example Press, 2026\n", ""), "added then cleared: the same bytes");
	v.close();
});

test("notice: a value that would break the line is refused with the reason in words and nothing is written; a value in quotation marks is too", async () => {
	const v = rig(NOTE);
	v.go("Week");
	v.select("notice", "[!notice]");
	const before = v.disk.text;
	// (a line break cannot be typed into a one-line box; the core test refuses it, and a comment mark here is refused the same way)
	await v.type(v.key("notice-license"), "a <!-- b");
	assert.equal(v.disk.text, before);
	assert.match(v.refusal(), /comment/);
	await v.type(v.key("notice-license"), '"quoted"');
	assert.equal(v.disk.text, before);
	assert.match(v.refusal(), /quotation marks/);
	v.close();
});

test("notice: a notice the fields cannot show (a key said twice) says why and leaves the Markdown open as the way to edit; nothing is changed", () => {
	const text = NOTE.replace("> copyright: Example Press, 2026", "> license: Twice");
	const v = rig(text);
	v.go("Week");
	v.select("notice", "[!notice]");
	assert.equal(v.has(en("notice.license")), false, "no fields");
	assert.match(words(v.editor()), /more than once/);
	assert.equal(v.disk.writes, 0);
	assert.equal(v.md()[0], "> [!notice]");
	v.close();
});

test("notice: a change made by something else while a field is open is not overwritten (the field says the note changed)", async () => {
	const v = rig(NOTE);
	v.go("Week");
	v.select("notice", "[!notice]");
	const field = v.key("notice-license");
	typeInto(field, "Mine");
	v.disk.text = v.disk.text.replace("license: Free to copy and share.", "license: Theirs");
	field.dispatchEvent(new w.Event("change", { bubbles: true }));
	await v.settle();
	assert.ok(!v.disk.text.includes("Mine"), "typing over a value that moved is not written");
	assert.ok(v.disk.text.includes("license: Theirs"));
	v.close();
});

// ================================================================ pictures

test("pictures: each picture has a description and a place; the reference style's place is its definition's address, and the line that says where is named", () => {
	const v = onProse("![The harbour at low water][harbour]");
	assert.equal(v.key("picture-0-alt").value, "The harbour at low water");
	assert.equal(v.key("picture-0-path").value, "images/harbour.jpg");
	assert.match(words(v.editor()), /The place is written on line \d+, as \[harbour\]/);
	assert.ok(v.key("picture-0-alt").getAttribute("aria-label"));
	assert.ok(v.key("picture-0-path").getAttribute("aria-label"));
	v.close();
});

test("pictures: the description and the place apply when left; a reference picture's place changes the definition's line and nothing else, as one write and one Undo", async () => {
	const v = onProse("![The harbour at low water][harbour]");
	const before = v.disk.text;
	await v.type(v.key("picture-0-alt"), "Boats at rest");
	assert.equal(v.disk.text, before.replace("![The harbour at low water][harbour]", "![Boats at rest][harbour]"));
	assert.equal(v.disk.writes, 1);
	await v.type(v.key("picture-0-path"), "images/boats.png");
	assert.equal(v.disk.text, before.replace("![The harbour at low water][harbour]", "![Boats at rest][harbour]").replace("[harbour]: images/harbour.jpg", "[harbour]: images/boats.png"), "the definition line only");
	assert.equal(v.disk.writes, 2);
	await v.undoAll(1);
	assert.equal(v.disk.text, before.replace("![The harbour at low water][harbour]", "![Boats at rest][harbour]"), "one Undo takes back the definition's line");
	assert.equal(v.key("picture-0-path").value, "images/harbour.jpg", "the field follows the note after an Undo of a line outside the block");
	await v.undoAll(1);
	assert.equal(v.disk.text, before);
	await v.redoAll(2);
	assert.ok(v.disk.text.includes("[harbour]: images/boats.png"));
	v.close();
});

test("pictures: an empty description is said in words to be a decorative picture, and is written as one", async () => {
	const v = onProse("![Boats](images/boats.png)");
	const idx = 0;
	const empty = () => v.editor().querySelector(`[data-reading="picture-${idx}"] [data-reading="alt-empty"]`);
	assert.equal(empty().hidden, true, "with words there is no such note");
	await v.type(v.key(`picture-${idx}-alt`), "");
	assert.ok(v.disk.text.includes("![](images/boats.png)"));
	assert.equal(empty().hidden, false);
	assert.equal(words(empty()), en("image.alt.empty"));
	v.close();
});

test("pictures: the inline form and the file embed change in their own line; a file embed has no description field", async () => {
	const v = onProse("![Boats](images/boats.png)");
	const before = v.disk.text;
	await v.type(v.key("picture-0-path"), "images/skiffs.webp");
	assert.equal(v.disk.text, before.replace("![Boats](images/boats.png)", "![Boats](images/skiffs.webp)"));
	v.select("prose", "![[picture.png]]");
	assert.equal(v.key("picture-0-alt"), null, "an Obsidian file embed has no words of its own");
	assert.ok(words(v.editor()).includes(en("image.alt.none")));
	await v.type(v.key("picture-0-path"), "images/p.png");
	assert.ok(v.disk.text.includes("![[images/p.png]]"));
	await v.undoAll(2);
	assert.equal(v.disk.text, before);
	v.close();
});

test("pictures: a place that breaks the format's rules is kept as typed and warned about in words, never refused; a remote address is kept; a shape that cannot be written is refused", async () => {
	const v = onProse("![Boats](images/boats.png)");
	const warn = () => words(v.editor().querySelector('[data-reading="picture-0"] [data-reading="path-warning"]'));
	assert.equal(warn(), "");
	await v.type(v.key("picture-0-path"), "https://example.org/boats.png");
	assert.ok(v.disk.text.includes("![Boats](https://example.org/boats.png)"), "kept as typed");
	assert.match(warn(), /remote address/);
	await v.type(v.key("picture-0-path"), "../up/boats.txt");
	assert.ok(v.disk.text.includes("![Boats](../up/boats.txt)"));
	assert.match(warn(), /empty part or a part that begins with a dot/);
	await v.type(v.key("picture-0-path"), "images/a b.png");
	assert.ok(v.disk.text.includes("(../up/boats.txt)"), "a space cannot be written in this form: refused, not written");
	assert.match(v.refusal(), /no space/);
	typeInto(v.key("picture-0-path"), "images/ok.png");
	assert.equal(words(v.editor().querySelector('[data-reading="picture-0"] [data-reading="path-warning"]')), "", "the warning goes as the place is typed");
	v.close();
});

test("pictures: a reference to a definition that is not there is said in words, and adding it is offered, one line and one Undo, never silent", async () => {
	const v = onProse("![Gone][gone]");
	const before = v.disk.text;
	assert.match(words(v.editor()), /gone/);
	assert.equal(v.key("picture-0-path"), null, "no place field while there is no line to hold it");
	assert.equal(v.disk.writes, 0, "nothing was written by showing it");
	await v.press(v.ctl(fill("image.missing.add.label", { id: "gone" })));
	assert.equal(v.disk.writes, 1);
	assert.ok(v.disk.text.includes("[gone]: images/gone.jpg"));
	assert.equal(v.key("picture-0-path").value, "images/gone.jpg", "the field is there now");
	await v.undoAll(1);
	assert.equal(v.disk.text, before);
	v.close();
});

test("pictures: a change made while a field is open that moved the picture's place is not written over", async () => {
	const v = onProse("![The harbour at low water][harbour]");
	const f = v.key("picture-0-path");
	typeInto(f, "images/mine.png");
	v.disk.text = v.disk.text.replace("[harbour]: images/harbour.jpg", "[harbour]: images/theirs.jpg");
	f.dispatchEvent(new w.Event("change", { bubbles: true }));
	await v.settle();
	assert.ok(v.disk.text.includes("images/theirs.jpg"));
	assert.ok(!v.disk.text.includes("images/mine.png"));
	v.close();
});

// ================================================================ figures

test("figures: the picker offers the diagrams the page can see (its own, then the shared), never another module's; a missing id is kept and shown as missing", () => {
	const v = onProse("Here is the cycle");
	const first = v.key("figure-0");
	assert.deepEqual([...first.options].map((o) => o.value), ["own", "shared"]);
	assert.equal(first.value, "own");
	const lost = v.key("figure-1");
	assert.deepEqual([...lost.options].map((o) => o.value), ["own", "shared", "nowhere"], "the missing id stays in the list, last");
	assert.equal(lost.value, "nowhere");
	assert.match(lost.options[2].textContent, /nowhere/);
	assert.match(lost.options[2].textContent, /not found/);
	assert.ok(words(v.editor()).includes(fill("figure.lost", { id: "nowhere" })));
	assert.equal([...first.options].some((o) => o.value === "theirs"), false, "another module's diagram is not offered");
	assert.ok(first.getAttribute("aria-label"));
	v.close();
});

test("figures: choosing a diagram rewrites the id in the embed as one write and one Undo, and the diagram's own text is not touched", async () => {
	const v = onProse("Here is the cycle");
	const before = v.disk.text;
	await v.choose(v.key("figure-0"), "shared");
	assert.equal(v.disk.text, before.replace("![[#^own]] and", "![[#^shared]] and"));
	assert.equal(v.disk.writes, 1);
	assert.ok(v.disk.text.includes("graph LR; A --> B"));
	await v.choose(v.key("figure-1"), "own");
	assert.equal(v.disk.text, before.replace("![[#^own]] and", "![[#^shared]] and").replace("![[#^nowhere]]", "![[#^own]]"));
	await v.undoAll(2);
	assert.equal(v.disk.text, before);
	assert.equal(v.key("figure-0").value, "own");
	await v.redoAll(2);
	assert.equal(v.key("figure-1").value, "own");
	v.close();
});

test("figures: in the other module the picker sees its own diagram and the shared one, not the first module's", () => {
	const v = rig(NOTE);
	v.go("Beta");
	v.select("prose", "Their figure");
	assert.deepEqual([...v.key("figure-0").options].map((o) => o.value), ["theirs", "shared"]);
	v.close();
});

// ================================================================ citations

test("citation: the fields appear in the box of the sentence that holds the mark, with the exact words, and say where the definition is", () => {
	const v = onProse("Most harbours");
	const f = (k) => v.key(`cite-atlas-${k}`).value;
	assert.equal(f("title"), "The Harbour Tide Atlas");
	assert.equal(f("detail"), "2nd edition (2019)");
	assert.equal(f("page"), "p. 12");
	assert.equal(f("quote"), "The tide rises and falls twice in each lunar day.");
	assert.equal(f("verified"), "2026-09-20");
	for (const k of ["title", "detail", "page", "quote", "verified"]) assert.ok(v.key(`cite-atlas-${k}`).getAttribute("aria-label"), k);
	assert.match(words(v.editor().querySelector('[data-reading="citation-atlas"]')), /line \d+/i);
	v.close();
});

test("citation: each field changes only its own piece, as one write and one Undo; a piece taken away takes its punctuation; the opposite gives the same bytes", async () => {
	const v = onProse("Most harbours");
	const before = v.disk.text;
	await v.type(v.key("cite-atlas-quote"), "Twice a day.");
	assert.equal(v.disk.text, before.replace("The tide rises and falls twice in each lunar day.", "Twice a day."));
	await v.type(v.key("cite-atlas-page"), "");
	assert.ok(v.disk.text.includes("(2019): \"Twice a day.\""), "the page and its comma go together");
	await v.type(v.key("cite-atlas-verified"), "");
	assert.ok(!v.disk.text.includes("Verified"));
	assert.equal(v.disk.writes, 3);
	await v.undoAll(3);
	assert.equal(v.disk.text, before);
	assert.equal(v.key("cite-atlas-page").value, "p. 12");
	await v.type(v.key("cite-atlas-title"), "Atlas");
	await v.type(v.key("cite-atlas-title"), "The Harbour Tide Atlas");
	assert.equal(v.disk.text, before, "set and set back");
	v.close();
});

test("citation: what the reader's pattern would not read back is refused in words and nothing is written (a bare quote, a colon in the detail, a page that is not a page, a date that is not one)", async () => {
	const v = onProse("Most harbours");
	const before = v.disk.text;
	for (const [k, value, re] of [
		["quote", "", /needs its quote/],
		["title", "a *b*", /cannot hold a \*/],
		["detail", "a: b", /colon/],
		["page", "12", /begins p\./],
		["verified", "2026-02-30", /real date/],
	]) {
		await v.type(v.key(`cite-atlas-${k}`), value);
		assert.equal(v.disk.text, before, k);
		assert.match(v.refusal(), re, k);
	}
	assert.equal(v.disk.writes, 0);
	v.close();
});

test("citation: a note that is not in the source pattern shows the one sentence and its place and keeps its lines; a mark with no note says so and offers one, never silently", async () => {
	const v = onProse("Most harbours");
	const plain = v.editor().querySelector('[data-reading="citation-plain"]');
	assert.equal(words(plain.querySelector('[data-reading="citation-words"]')), "This note is not in the source pattern, so it is edited as words below.");
	assert.equal(plain.querySelector("input"), null, "no fields for it");
	assert.ok(v.disk.text.includes("[^plain]: Just words, not in the pattern."));
	const lost = v.editor().querySelector('[data-reading="citation-lost"]');
	assert.match(words(lost), /no footnote/i);
	assert.equal(v.disk.writes, 0, "showing it wrote nothing");
	const before = v.disk.text;
	await v.press(v.ctl(fill("citation.missing.add.label", { id: "lost" })));
	assert.equal(v.disk.writes, 1);
	assert.match(v.disk.text, /\[\^lost\]: \*Title of the source\*, p\. 1: "The words, copied exactly from the source\."/);
	assert.ok(v.key("cite-lost-quote"), "its fields are there now");
	await v.undoAll(1);
	assert.equal(v.disk.text, before);
	v.close();
});

test("citation: another module's note is not used for a mark here (the mark shows no note)", () => {
	const text = NOTE.replace("Their figure: ![[#^theirs]]", "Their words.[^atlas]");
	const v = rig(text);
	v.go("Beta");
	v.select("prose", "Their words");
	assert.match(words(v.editor().querySelector('[data-reading="citation-atlas"]')), /no footnote/i);
	assert.equal(v.key("cite-atlas-title"), null);
	v.close();
});

// ================================================================ the safe places

test("a change to prose that holds no kept data asks nothing and is written at once (the guard has nothing to ask about)", async () => {
	const text = bookletAround(
		[
			"> [!activity|a] A",
			"",
			"> [!text|why] Why?",
			"",
			"![Words][p]",
			"",
			"[p]: images/p.png",
			"",
		].join("\n"),
	);
	const v = rig(text);
	v.go("A");
	v.select("prose", "![Words][p]");
	await v.type(v.key("picture-0-alt"), "New words");
	assert.ok(v.disk.text.includes("![New words][p]"), "no kept data here: no question");
	v.close();
});

test("the hint added under a question with no blank line before the solution goes back out to the same lines in the view too", async () => {
	const text = bookletAround(["> [!activity|a] A", "", "> [!text|q long] Q?", "> desc", "> [!solution]- Model", "> words", ""].join("\n"));
	const v = rig(text);
	v.go("A");
	v.select("question", "[!text|q long]");
	const before = v.disk.text;
	await v.press(v.editor().querySelector('[data-help="hint"] button, button[data-help="hint"]') ?? [...v.editor().querySelectorAll("button")].find((b) => /hint/i.test(b.getAttribute("aria-label") ?? "") && /add/i.test(b.getAttribute("aria-label") ?? "")));
	assert.ok(v.disk.text.includes("[!hint]"), "the hint is there");
	await v.undoAll(1);
	assert.equal(v.disk.text, before);
	v.close();
});
