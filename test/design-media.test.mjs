/*
 * The media line of a `listen` and the data block's embed of a `widget` (core/design-media.ts), the description around them
 * (core/design-parts.ts), the settings whose values the format fixes (core/design-form.ts `settingProblem`) and what a question can name
 * on its line (core/design-sources.ts). No view: lines in, lines out. The controls are offered only for a line they can write back byte
 * for byte, so the round trip is held against every listen and widget of the format's spec, its examples and this repo's test booklets.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { core, bookletAround, BOOKLET } from "./helpers.mjs";
import { fixtureFiles } from "./fixtures.mjs";

const { parseDesign, walkDesign, blockLines, mediaIn, writeMedia, addMedia, holdsMedia, readParts, writeDescription, restOf, settingProblem, applyFormChange, eachSourcesFor, widgetBlocksFor, changeLines, needsAsking } = core;

const L = (s) => s.split("\n");

// ---------------------------------------------------------------- everything written down

function notesUnder(dir, out = []) {
	if (!existsSync(dir)) return out;
	for (const f of readdirSync(dir)) {
		if (f === "node_modules" || f === ".git" || f === ".build" || f.startsWith("__")) continue;
		const p = join(dir, f);
		if (statSync(p).isDirectory()) notesUnder(p, out);
		else if (/\.md$/.test(f) && f !== "SPEC.md") out.push(p);
	}
	return out;
}

function corpus() {
	const out = [];
	for (const f of fixtureFiles()) if (f.path.endsWith(".md")) out.push([`fixtures/${f.path}`, f.text]);
	for (const f of notesUnder(BOOKLET)) out.push([f, readFileSync(f, "utf8")]);
	const spec = join(BOOKLET, "SPEC.md");
	if (existsSync(spec)) {
		const text = readFileSync(spec, "utf8");
		[...text.matchAll(/^ *```+markdown\n([\s\S]*?)\n *```+/gm)].forEach((m, i) => out.push([`SPEC example ${i + 1}`, m[1].replace(/^ {2}/gm, "")]));
	}
	return out;
}

test("every listen and widget of the spec, the examples and the test booklets: the media line reads, writes back byte for byte, and the description around it round-trips", () => {
	const seen = { listen: 0, widget: 0, shown: { listen: 0, widget: 0 }, forms: new Set() };
	for (const [source, text] of corpus()) {
		let root;
		try {
			root = parseDesign(text, { lenient: true });
		} catch {
			continue;
		}
		for (const n of walkDesign(root)) {
			if (n.kind !== "question" || (n.detail !== "listen" && n.detail !== "widget")) continue;
			const lines = blockLines(text, n);
			const where = `${source}:${n.start + 1}`;
			seen[n.detail]++;
			const m = mediaIn(lines);
			if (m) {
				seen.shown[n.detail]++;
				seen.forms.add(m.form);
				assert.equal(writeMedia(lines, { target: m.target }).ok, true, where);
				assert.deepEqual(writeMedia(lines, { target: m.target, alt: m.alt }).lines, lines, `${where}: the same address and words are no change`);
				assert.deepEqual(writeMedia(lines, {}).lines, lines, where);
				// a real change touches the media line and no other
				if (m.form !== "block") {
					const ext = m.form === "link" ? "https://example.org/other" : "other.mp3";
					const made = writeMedia(lines, { target: ext });
					assert.equal(made.ok, true, `${where}: ${made.reason}`);
					made.lines.forEach((l, i) => i === m.index || assert.equal(l, lines[i], `${where}: line ${i} is as it was`));
					assert.equal(mediaIn(made.lines).target, ext, where);
					assert.equal(made.lines.length, lines.length);
				}
				// the description round trips around it
				const p = readParts(lines, "question");
				if (!("refused" in p) && p.described) {
					const same = writeDescription(lines, "question", p.description);
					assert.equal(same.ok, true, `${where}: ${same.reason}`);
					assert.deepEqual(same.lines, lines, `${where}: the description writes back as it was read`);
					const more = writeDescription(lines, "question", `${p.description}\nAnd more.`.replace(/^\n/, ""));
					assert.equal(more.ok, true, `${where}: ${more.reason}`);
					assert.equal(mediaIn(more.lines)?.target, m.target, `${where}: the media is still the media`);
					assert.equal(more.lines[m.index === 1 ? 1 : 0], lines[m.index === 1 ? 1 : 0]);
				}
			} else {
				assert.equal(writeMedia(lines, { target: "x" }).ok, false, where);
			}
		}
	}
	assert.ok(seen.listen >= 6 && seen.widget >= 4, `listens ${seen.listen}, widgets ${seen.widget}`);
	assert.ok(seen.shown.listen >= 4 && seen.shown.widget >= 3, `shown: ${JSON.stringify(seen.shown)}`);
	assert.ok(seen.forms.has("embed") && seen.forms.has("block"), `forms met: ${[...seen.forms]}`);
});

// ---------------------------------------------------------------- the shapes

test("a listen's media: an embed, a link and a file embed are read; a reference, a mid-sentence embed and an address with a space are not", () => {
	const at = (line, kind = "listen") => mediaIn([`> [!${kind}|q] Q`, line]);
	assert.deepEqual(at("> ![Episode 1](https://media.example.org/u01/e1.m4a)"), { index: 1, form: "embed", alt: "Episode 1", target: "https://media.example.org/u01/e1.m4a" });
	assert.deepEqual(at('> ![Ep](a/b.mp3 "Week 3")'), { index: 1, form: "embed", alt: "Ep", target: "a/b.mp3" });
	assert.deepEqual(at("> [Watch the lecture](https://video.example.org/watch/overview)"), { index: 1, form: "link", alt: "Watch the lecture", target: "https://video.example.org/watch/overview" });
	assert.deepEqual(at("> ![[lecture-3a.mp3]]"), { index: 1, form: "file", alt: null, target: "lecture-3a.mp3" });
	assert.deepEqual(at("> ![[lecture-3a.mp3|300]]"), { index: 1, form: "file", alt: null, target: "lecture-3a.mp3|300" });
	assert.deepEqual(at(">![x](a.mp3)"), { index: 1, form: "embed", alt: "x", target: "a.mp3" }, "no space after the >");
	assert.equal(at("> ![x][ref]"), null, "a reference-style embed");
	assert.equal(at("> Listen to ![x](a.mp3) now"), null, "an embed in a sentence");
	assert.equal(at("> ![x](a b.mp3)"), null, "an address with a space");
	assert.equal(at("> ![[#^some-block]]"), null, "a block embed is no media for a listen");
	assert.equal(at("> <https://example.org/x.mp3>"), null, "an autolink");
	assert.equal(mediaIn(["> [!text|q] Q", "> ![x](a.mp3)"]), null, "not a listen");
	assert.equal(mediaIn(["> [!listen|q] Q", "> An earlier embed ![y](b.mp3) in words", "> ![x](a.mp3)"]), null, "the reader's media is another line");
	assert.equal(mediaIn(["> [!listen|q end] Q", "> ![x](a.mp3)"]), null, "a closing line");
	assert.deepEqual(at("> ![[#^body-map]]", "widget"), { index: 1, form: "block", alt: null, target: "body-map" });
	assert.equal(at("> ![x](a.mp3)", "widget"), null);
	assert.equal(at("> A map ![[#^body-map]] here", "widget"), null);
});

test("a listen's address and name are changed in place and every other byte of the line stays: the title in quotes, the spaces at the end, the > without a space", () => {
	const lines = ['> [!listen|q left:60] Ep', '>![Old](a/b.mp3 "Week 3")  ', "> More words."];
	const a = writeMedia(lines, { target: "c/d.m4a" });
	assert.deepEqual(a.lines, ['> [!listen|q left:60] Ep', '>![Old](c/d.m4a "Week 3")  ', "> More words."]);
	const b = writeMedia(lines, { alt: "New name" });
	assert.deepEqual(b.lines, ['> [!listen|q left:60] Ep', '>![New name](a/b.mp3 "Week 3")  ', "> More words."]);
	const c = writeMedia(['> [!listen|q] Ep', "> [Watch](https://v.example.org/w)"], { target: "https://v.example.org/x" });
	assert.deepEqual(c.lines, ['> [!listen|q] Ep', "> [Watch](https://v.example.org/x)"]);
	const d = writeMedia(['> [!listen|q] Ep', "> ![[a.mp3]]"], { target: "b.ogg|200" });
	assert.deepEqual(d.lines, ['> [!listen|q] Ep', "> ![[b.ogg|200]]"]);
	// the line's old text is not the new: an embed's address must be a playable one, and none of it may break the line
	const bad = (change, re) => {
		const r = writeMedia(lines, change);
		assert.equal(r.ok, false, JSON.stringify(change));
		assert.match(r.reason, re, JSON.stringify(change));
	};
	bad({ target: "" }, /needs an address/);
	bad({ target: "a b.mp3" }, /no space/);
	bad({ target: "a(1).mp3" }, /no space, parenthesis/);
	bad({ target: "https://example.org/watch" }, /audio or video extension/);
	bad({ alt: "a]b" }, /no line break or bracket/);
	assert.equal(writeMedia(['> [!listen|q] Ep', "> ![[a.mp3]]"], { target: "#x" }).ok, false);
	// a link may name any address
	assert.equal(writeMedia(['> [!listen|q] Ep', "> [W](https://v.example.org/w)"], { target: "https://v.example.org/watch?v=1" }).ok, true);
	// and the widget's block id is letters, digits and dashes
	const w = ["> [!widget|w] W", "> ![[#^body-map]]"];
	assert.deepEqual(writeMedia(w, { target: "other-map" }).lines, ["> [!widget|w] W", "> ![[#^other-map]]"]);
	assert.equal(writeMedia(w, { target: "no good" }).ok, false);
	assert.equal(writeMedia(w, { target: "" }).ok, false);
});

test("a media line is added under the question's own line: an embed for a playable address, a link for any other, a block embed for a widget; never when the block holds one already", () => {
	const none = ["> [!listen|q] Episode 1", "> Some help."];
	assert.deepEqual(addMedia(none, "media/e1.mp3", "Episode 1").lines, ["> [!listen|q] Episode 1", "> ![Episode 1](media/e1.mp3)", "> Some help."]);
	assert.deepEqual(addMedia(none, "https://video.example.org/watch/x", "Episode 1").lines, ["> [!listen|q] Episode 1", "> [Episode 1](https://video.example.org/watch/x)", "> Some help."]);
	assert.deepEqual(addMedia(["> [!listen|q] Q"], "a.webm", "").lines, ["> [!listen|q] Q", "> ![](a.webm)"]);
	assert.deepEqual(addMedia(["> [!listen|q] Q"], "https://x.example.org/a", "").lines, ["> [!listen|q] Q", "> [https://x.example.org/a](https://x.example.org/a)"]);
	assert.deepEqual(addMedia(["> [!widget|w] W"], "body-map", "").lines, ["> [!widget|w] W", "> ![[#^body-map]]"]);
	assert.equal(mediaIn(addMedia(none, "a.mp3", "").lines).index, 1);
	assert.match(addMedia(["> [!listen|q] Q", "> ![x][ref]"], "a.mp3", "x").reason, /already has one/);
	assert.match(addMedia(["> [!listen|q] Q", "> ![x](a.mp3)"], "b.mp3", "x").reason, /already has one/);
	assert.match(addMedia(["> [!text|q] Q"], "a.mp3", "x").reason, /listen or a widget/);
	assert.equal(addMedia(none, "a b.mp3", "x").ok, false);
	assert.equal(addMedia(["> [!widget|w] W"], "no good", "").ok, false);
	// a name with a bracket in it is written without the bracket
	assert.equal(addMedia(none, "a.mp3", "Ep [1]").lines[1], "> ![Ep  1](a.mp3)");
	assert.equal(holdsMedia(["> [!listen|q] Q", "> ![x][ref]"]), true);
	assert.equal(holdsMedia(none), false);
});

// ---------------------------------------------------------------- the words around the media

test("a listen's or a widget's description is the words on the one side of the media line; media in the middle of the words offers no description", () => {
	const first = ["> [!listen|q] Ep", "> ![x](a.mp3)", "> Help one.", "> Help two."];
	const p1 = readParts(first, "question");
	assert.equal(p1.described, true);
	assert.equal(p1.description, "Help one.\nHelp two.");
	assert.deepEqual([p1.from, p1.to, p1.mediaAt], [2, 4, 1]);
	assert.deepEqual(writeDescription(first, "question", "Help one.\nHelp 2.").lines, ["> [!listen|q] Ep", "> ![x](a.mp3)", "> Help one.", "> Help 2."]);
	assert.deepEqual(writeDescription(first, "question", "").lines, ["> [!listen|q] Ep", "> ![x](a.mp3)"]);

	const last = ["> [!listen|q] Ep", "> Help one.", "> ![x](a.mp3)", "", "> [!hint]- A hint", "> Hm."];
	const p2 = readParts(last, "question");
	assert.equal(p2.description, "Help one.");
	assert.deepEqual([p2.from, p2.to, p2.mediaAt], [1, 2, 2]);
	assert.deepEqual(restOf(p2), ["", "> [!hint]- A hint", "> Hm."], "the media line is not among the lines no field shows");
	assert.deepEqual(writeDescription(last, "question", "Help one.\nAnd more.").lines, ["> [!listen|q] Ep", "> Help one.", "> And more.", "> ![x](a.mp3)", "", "> [!hint]- A hint", "> Hm."]);
	// clearing the words leaves the media where it is, now straight under the line
	assert.deepEqual(writeDescription(last, "question", "").lines, ["> [!listen|q] Ep", "> ![x](a.mp3)", "", "> [!hint]- A hint", "> Hm."]);

	const none = ["> [!listen|q] Ep", "> Only words."];
	const p3 = readParts(none, "question");
	assert.equal(p3.described, true);
	assert.equal(p3.mediaAt, null);
	assert.equal(p3.description, "Only words.");

	const middle = ["> [!listen|q] Ep", "> Before.", "> ![x](a.mp3)", "> After."];
	const p4 = readParts(middle, "question");
	assert.equal(p4.described, false);
	assert.equal(p4.mediaAt, 2);
	assert.deepEqual(restOf(p4), ["> Before.", "> After."], "the words either side are not shown by a field");
	assert.equal(writeDescription(middle, "question", "x").ok, false);
	// the media controls still work there
	assert.deepEqual(writeMedia(middle, { target: "b.mp3" }).lines, ["> [!listen|q] Ep", "> Before.", "> ![x](b.mp3)", "> After."]);

	const widget = ["> [!widget|body describe] Which muscles?", "> ![[#^body-map]]", "> Tap what you stretched."];
	const p5 = readParts(widget, "question");
	assert.equal(p5.description, "Tap what you stretched.");
	assert.deepEqual(writeDescription(widget, "question", "Tap them.").lines, ["> [!widget|body describe] Which muscles?", "> ![[#^body-map]]", "> Tap them."]);
	// a description that brings an embed of its own: the media line stays the media line the controls show
	assert.equal(mediaIn(writeDescription(first, "question", "Help one.\n![y](b.mp3)").lines)?.target, "a.mp3");
	// typed words that would put the embed first of a media-last block are refused, not mixed up
	assert.equal(writeDescription(last, "question", "![y](b.mp3)").ok, false);
});

// ---------------------------------------------------------------- settings whose value the format fixes

test("min, max and step take a number; earlier and left take digits; each takes an id; nothing else is judged", () => {
	for (const ok of ["0", "-3", "2.5", "100", "-0.25"]) for (const k of ["min", "max", "step"]) assert.equal(settingProblem(k, ok), null, `${k}:${ok}`);
	for (const bad of ["abc", "1.", ".5", "1e3", "1,5", "+2", "1 2"]) assert.match(settingProblem("max", bad), /takes a number/, bad);
	for (const ok of ["0", "12", "120"]) for (const k of ["earlier", "left"]) assert.equal(settingProblem(k, ok), null);
	for (const bad of ["-1", "1.5", "x", "1e2"]) {
		assert.match(settingProblem("earlier", bad), /whole number/, bad);
		assert.match(settingProblem("left", bad), /whole number of seconds/, bad);
	}
	assert.equal(settingProblem("each", "tools"), null);
	assert.match(settingProblem("each", "to ols"), /id/);
	// "" takes the setting off; other settings are the format's free text
	for (const k of ["min", "earlier", "left", "each"]) assert.equal(settingProblem(k, ""), null);
	assert.equal(settingProblem("icon", "anything at all"), null);
	assert.equal(settingProblem("status", "off"), null);
	// and the form's change refuses them with nothing changed, and takes them off with ""
	const line = ["> [!number|n min:0 max:24] Hours"];
	assert.match(applyFormChange(line, { what: "value", name: "max", value: "many" }).reason, /takes a number/);
	assert.deepEqual(applyFormChange(line, { what: "value", name: "max", value: "12.5" }).lines, ["> [!number|n min:0 max:12.5] Hours"]);
	assert.deepEqual(applyFormChange(line, { what: "value", name: "max", value: "" }).lines, ["> [!number|n min:0] Hours"]);
	assert.deepEqual(applyFormChange(line, { what: "value", name: "step", value: "0.5" }).lines, ["> [!number|n min:0 max:24 step:0.5] Hours"]);
	assert.deepEqual(applyFormChange(["> [!listen|q left:60] Ep"], { what: "value", name: "left", value: "90" }).lines, ["> [!listen|q left:90] Ep"]);
	assert.match(applyFormChange(["> [!listen|q] Ep"], { what: "value", name: "left", value: "1m" }).reason, /whole number of seconds/);
	assert.match(applyFormChange(["> [!lines|q] L"], { what: "value", name: "earlier", value: "-2" }).reason, /whole number/);
});

// ---------------------------------------------------------------- what a question can name

const EACH = bookletAround(
	[
		"> [!module|m] M",
		"",
		"> [!activity|a] A",
		"",
		"> [!choice|tools] Which tools?",
		"- [ ] Hammer",
		"- [ ] Saw",
		"",
		"> [!multi|where each:tools] Where?",
		"- [ ] Shed",
		"",
		"> [!choice|other] Other",
		"- [ ] One",
		"",
		"> [!text|note] Note",
		"",
		"> [!widget|body] Body",
		"> ![[#^body-map]]",
		"",
		"> [!activity|b] B",
		"",
		"> [!choice|elsewhere] Elsewhere",
		"- [ ] One",
		"",
		"> [!module|m end]",
		"",
		"> [!data|m] Data",
		"",
		"```booklet widget",
		'{ "engine": "svg-regions", "figures": [], "regions": [] }',
		"```",
		"^body-map",
		"",
		"```booklet data",
		'{ "rows": [ { "id": "r1", "title": "One" } ] }',
		"```",
		"^requests",
		"",
		"> [!module|n] N",
		"",
		"> [!activity|c] C",
		"",
		"> [!text|alone] Alone",
		"",
		"> [!module|n end]",
		"",
	].join("\n"),
);

test("an each: can name a choice, a multi or a widget of the same activity that has no each: of its own, or a data block in reach; never itself, never another activity's", () => {
	const at = (id) => walkDesign(parseDesign(EACH)).find((n) => n.id === id).start;
	const ids = (id) => eachSourcesFor(EACH, at(id)).map((s) => `${s.id}:${s.kind}`);
	assert.deepEqual(ids("note"), ["tools:choice", "other:choice", "body:widget", "requests:data"]);
	assert.deepEqual(ids("tools"), ["other:choice", "body:widget", "requests:data"], "not itself");
	assert.deepEqual(ids("where"), ["tools:choice", "other:choice", "body:widget", "requests:data"], "a question that has an each: of its own is not a source, and it may be asked again");
	assert.deepEqual(ids("elsewhere"), ["requests:data"], "another activity's questions are not in reach, the module's data block is");
	assert.deepEqual(ids("alone"), [], "another module's data block is not in reach");
	assert.deepEqual(eachSourcesFor(EACH, 0), []);
	assert.deepEqual(eachSourcesFor("not a booklet", 0), []);
});

test("a widget can embed the data blocks of its own module and the shared ones", () => {
	const at = (id) => walkDesign(parseDesign(EACH)).find((n) => n.id === id).start;
	const ref = widgetBlocksFor(EACH, at("body"));
	assert.deepEqual(ref.map((r) => [r.id, r.module, r.engine]), [["body-map", "m", "svg-regions"]]);
	assert.equal(EACH.split("\n")[ref[0].line].startsWith("```booklet widget"), true, "the line is the block's fence");
	assert.deepEqual(widgetBlocksFor(EACH, at("alone")), [], "another module's block is not in reach");
});
