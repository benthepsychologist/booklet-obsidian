/*
 * The `listen` question in the data layer (SPEC section 5, "Listen"; format 0.18): how its line and its `>` lines are read, the
 * shape of its answer, how it is counted, the done rule and the answer a pause, the end, a tick and an untick make, and the writer
 * putting that answer in the note with every key it did not change and every other byte exactly as it was. Made-up text only.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { assertOutsideUnchanged, build, core, norm } from "./helpers.mjs";

const HEAD = '---\nbooklet: "0.20"\nid: made/up\ntitle: Made up\nlang: en\n---\n';
const note = (body) => `${HEAD}\n${body}`;
const EP1 = "> [!listen|e1] Episode 1: Foundations\n> ![Episode 1](https://media.example.org/u01/e1.m4a)\n";
const BASE = `> [!activity|course] A course\n\n${EP1}\n> [!listen|e2 left:60] Episode 2\n> ![[ep2.mp3]]\n\n> [!text|t] Thoughts\n`;
const questions = (text) => core.parseBooklet(text).activities.flatMap((a) => a.segments.filter((s) => s.type === "question"));
const q = (text, id) => questions(text).find((x) => x.id === id);

/* ---- reading the line ---- */

test("a listen is a question kind: read with its media and its left, and its embed is not in its help", () => {
	const b = core.parseBooklet(note(BASE));
	assert.ok(core.COMMON_KINDS.includes("listen"));
	assert.deepEqual(b.problems, []);
	assert.deepEqual(b.unread, []);
	const [e1, e2, t] = questions(note(BASE));
	assert.deepEqual([e1.kind, e1.id, e1.title, e1.media, e1.left, e1.help], ["listen", "e1", "Episode 1: Foundations", "![Episode 1](https://media.example.org/u01/e1.m4a)", 120, ""]);
	assert.deepEqual([e2.media, e2.left, e2.help], ["![[ep2.mp3]]", 60, ""]);
	assert.deepEqual([t.kind, t.media, t.left], ["text", null, 120], "every other kind has no media");
});

test("the one embed is the media whatever the form; the rest of the lines are help, in order", () => {
	const forms = {
		"inline with a title": '![Ep](media/e.mp3 "Week 1")',
		"reference": "![Ep][ep]",
		"reference, collapsed": "![ep][]",
		"reference, shortcut": "![ep]",
		"file embed": "![[e.mp3]]",
		"file embed with a size": "![[e.mp3|300]]",
	};
	for (const [name, embed] of Object.entries(forms)) {
		const l = q(note(`> [!activity|a] A\n\n> [!listen|l] L\n> Before.\n> ${embed}\n> After.\n`), "l");
		assert.equal(l.media, embed, name);
		assert.equal(l.help, "Before.\nAfter.", name);
	}
	// words on the embed's own line stay help; a line the embed leaves empty goes
	const same = q(note('> [!activity|a] A\n\n> [!listen|l] L\n> ![Ep](e.mp3) Press play.\n'), "l");
	assert.deepEqual([same.media, same.help], ["![Ep](e.mp3)", "Press play."]);
});

test("with no embed the first link is the media (a video service's page is a link); an embed wins over a link; a block embed is no media", () => {
	const link = (body) => q(note(`> [!activity|a] A\n\n> [!listen|l] L\n${body}`), "l");
	assert.deepEqual([link("> [Watch](https://video.example.org/watch/x)\n").media, link("> [Watch](https://video.example.org/watch/x)\n").help], ["[Watch](https://video.example.org/watch/x)", ""]);
	assert.equal(link("> <https://video.example.org/watch/x>\n").media, "<https://video.example.org/watch/x>");
	assert.equal(link("> https://video.example.org/watch/x\n").media, "https://video.example.org/watch/x");
	assert.equal(link("> [Watch][v]\n").media, "[Watch][v]");
	const both = link("> [A guide](https://example.org/guide)\n> ![Ep](e.mp3)\n");
	assert.deepEqual([both.media, both.help], ["![Ep](e.mp3)", "[A guide](https://example.org/guide)"], "the embed is the media, the link is help");
	assert.equal(link("> [Two](https://example.org/2)\n> [One](https://example.org/1)\n").media, "[Two](https://example.org/2)", "the first link in the lines");
	assert.equal(link("> See [[a note]] and [^1].\n").media, null, "a note link and a footnote mark are no media link");
	assert.equal(link("> ![[#^data]]\n").media, null, "a block embed is no media");
});

test("code is never the media: an embed or a link in a code span or a fenced block stays in the help as the author wrote it", () => {
	const body = (lines) => lines.map((l) => `> ${l}`).join("\n") + "\n";
	const of = (lines) => q(note(`> [!activity|a] A\n\n> [!listen|l] L\n${body(lines)}`), "l");
	// the case that went wrong: the span comes first
	const span = of(["Use `![[x.mp3]]` to embed", "![[real.mp3]]"]);
	assert.deepEqual([span.media, span.help], ["![[real.mp3]]", "Use `![[x.mp3]]` to embed"]);
	// fenced, with the real one after it
	const fence = of(["```", "![[x.mp3]]", "```", "![[real.mp3]]"]);
	assert.deepEqual([fence.media, fence.help], ["![[real.mp3]]", "```\n![[x.mp3]]\n```"]);
	// an indented code block, and a tilde fence
	assert.equal(of(["Before:", "", "    ![[x.mp3]]", "", "![[real.mp3]]"]).media, "![[real.mp3]]");
	assert.equal(of(["~~~", "![a](x.mp3)", "~~~", "![[real.mp3]]"]).media, "![[real.mp3]]");
	// code only: there is no media, and the help is the lines untouched
	const only = of(["Use `![[x.mp3]]` to embed", "```", "![[y.mp3]]", "```"]);
	assert.deepEqual([only.media, only.help], [null, "Use `![[x.mp3]]` to embed\n```\n![[y.mp3]]\n```"]);
	// a link in code is no link; a real link after it is the media
	const link = of(["See `[docs](https://example.org/d)`.", "[Watch](https://video.example.org/watch/x)"]);
	assert.deepEqual([link.media, link.help], ["[Watch](https://video.example.org/watch/x)", "See `[docs](https://example.org/d)`."]);
	assert.equal(of(["```", "https://example.org/in-code", "```"]).media, null);
	// code embeds are not counted as embeds (the notice counts the ones the reader would see played)
	assert.deepEqual(core.parseBooklet(note(`> [!activity|a] A\n\n> [!listen|l] L\n${body(["Use `![[x.mp3]]`.", "![[a.mp3]]"])}`)).unread, []);
	assert.deepEqual(core.listenBody(["`![[x.mp3]]` and `![[y.mp3]]`", "![[real.mp3]]"]).embeds, 1);
});

test("a listen with no embed and no link, or a second embed, is listed in the notice and read as it can be", () => {
	const none = core.parseBooklet(note("> [!activity|a] A\n\n> [!listen|l] Nothing\n> Only words.\n"));
	assert.deepEqual(none.unread.map((u) => [u.line, u.why, u.newer]), [[10, "a `listen` holds no embed and no link, so there is nothing to play, and the tick is all it has", false]]);
	assert.equal(questions(note("> [!activity|a] A\n\n> [!listen|l] Nothing\n> Only words.\n"))[0].help, "Only words.");
	const two = core.parseBooklet(note("> [!activity|a] A\n\n> [!listen|l] Two\n> ![[a.mp3]]\n> ![[b.mp3]]\n"));
	assert.deepEqual(two.unread.map((u) => [u.line, u.why, u.newer]), [[10, "a `listen` holds 2 embeds, and only the first is the media that is played and tracked", false]]);
	const l = two.activities[0].segments[0];
	assert.deepEqual([l.media, l.help], ["![[a.mp3]]", "![[b.mp3]]"]);
});

test("left: is a whole number of seconds in digits only; any other value is ignored, said, and 120 is used", () => {
	for (const [v, left] of [["60", 60], ["0", 0], ["012", 12], ["120", 120]]) assert.equal(q(note(`> [!activity|a] A\n\n> [!listen|l left:${v}] L\n> ![[a.mp3]]\n`), "l").left, left, v);
	for (const v of ["1.5", "-5", "ten", "60s", ""]) {
		const b = core.parseBooklet(note(`> [!activity|a] A\n\n> [!listen|l left:${v}] L\n> ![[a.mp3]]\n`));
		assert.equal(b.activities[0].segments[0].left, 120, v);
		assert.deepEqual(b.unread.map((u) => [u.why, u.newer]), [[`\`left:\` takes a whole number of seconds written in digits only, so \`left:${v}\` was ignored and 120 is used`, false]], v);
	}
	// a left: on any other kind, and an each: on a listen, are settings the kind does not take
	const other = core.parseBooklet(note("> [!activity|a] A\n\n> [!text|t left:30] T\n\n> [!listen|l each:t] L\n> ![[a.mp3]]\n"));
	assert.deepEqual(other.unread.map((u) => u.why), ["a text line takes no `left:` setting", "a listen line takes no `each:` setting"]);
	assert.equal(other.activities[0].segments.find((s) => s.id === "l").each, null);
});

test("a listen in a repeat activity is listed, kept as written, and still a question the view can draw as a plain one", () => {
	const b = core.parseBooklet(note("> [!activity|log repeat] A log\n\n> [!listen|l] L\n> ![[a.mp3]]\n"));
	assert.deepEqual(b.unread.map((u) => [u.line, u.why, u.newer]), [[10, "a `listen` is answered once and cannot be in a `repeat` activity, so it is kept as written and drawn without a tick", false]]);
	assert.equal(b.activities[0].segments[0].kind, "listen");
});

test("the notice for a listen's mistakes: each is one entry with its line, none says a newer plugin may read it", () => {
	const text = note("> [!activity|a] A\n\n> [!listen|none] None\n\n> [!listen|two left:x] Two\n> ![[a.mp3]]\n> ![[b.mp3]]\n");
	const n = core.openingNotice(core.parseBooklet(text), "0.12.0");
	assert.deepEqual(n.entries, [
		"Line 10: > [!listen|none] None (a `listen` holds no embed and no link, so there is nothing to play, and the tick is all it has)",
		"Line 12: > [!listen|two left:x] Two (`left:` takes a whole number of seconds written in digits only, so `left:x` was ignored and 120 is used)",
		"Line 12: > [!listen|two left:x] Two (a `listen` holds 2 embeds, and only the first is the media that is played and tracked)",
	]);
	assert.equal(n.paragraphs.some((p) => /newer version/.test(p)), false);
});

/* ---- the shape of the answer, and counting ---- */

test("a listen answer is an object: pos, if there, a whole number from 0, done, if there, a boolean; other keys are allowed", () => {
	const l = q(note(BASE), "e1");
	for (const ok of [{ pos: 754, done: true }, { done: true }, { pos: 0 }, { pos: 5, done: false, note: "other keys are kept" }, {}, null, "", []]) assert.equal(core.shapeIssue(l, ok), null, JSON.stringify(ok));
	for (const bad of [{ pos: 1.5 }, { pos: -1 }, { pos: "7" }, { done: "yes" }, { done: 1 }, 7, "done", [1], true]) assert.match(core.shapeIssue(l, bad) ?? "", /^a listen question keeps an object: pos, if there, a whole number of seconds from 0, and done, if there, true or false$/, JSON.stringify(bad));
});

test("a listen is answered only when done is true; a pos alone is not an answer; the writer still keeps a pos", () => {
	const l = q(note(BASE), "e1");
	assert.equal(core.answeredOf(l, { done: true }), true);
	assert.equal(core.answeredOf(l, { pos: 754, done: true }), true);
	for (const v of [{ pos: 754 }, { pos: 754, done: false }, { done: false }, {}, undefined, null, "done", ["x"]]) assert.equal(core.answeredOf(l, v), false, JSON.stringify(v));
	// every other kind: what it holds
	const t = q(note(BASE), "t");
	assert.deepEqual([core.answeredOf(t, "words"), core.answeredOf(t, ""), core.answeredOf(t, undefined)], [true, false, false]);
	// a pos is something the writer keeps (holdsSomething), so the position is not dropped as an empty answer
	assert.equal(core.holdsSomething({ pos: 754 }), true);
	assert.equal(core.holdsSomething({ pos: 0 }), true);
	assert.equal(core.holdsSomething({ done: false }), false);
	assert.equal(core.holdsSomething({}), false);
});

test("a card's status: 3 of 4 done for an activity of listens only; a mixed one says answered", () => {
	const four = (extra = "") => note(`> [!activity|c] Course\n\n${["a", "b", "c", "d"].map((i) => `> [!listen|${i}] Ep ${i}\n> ![[${i}.mp3]]\n`).join("\n")}${extra}`);
	const status = (text, answers) => {
		let t = text;
		for (const [k, v] of Object.entries(answers)) t = core.setAnswer(t, "", k, v);
		const { book, nav } = build(t);
		return core.workedOutStatus(nav.byKey.get("/c"), book);
	};
	assert.equal(status(four(), {}), "4 questions · Not started");
	assert.equal(status(four(), { a: { done: true }, b: { done: true }, c: { done: true } }), "3 of 4 done");
	assert.equal(status(four(), { a: { pos: 300 }, b: { pos: 10, done: false } }), "4 questions · Not started", "a place kept is no answer");
	assert.equal(status(four(), { a: { done: true }, b: { done: true }, c: { done: true }, d: { done: true } }), "4 questions · Done");
	const mixed = four("\n> [!text|t] Thoughts\n");
	assert.equal(status(mixed, { a: { done: true }, t: "words" }), "2 of 5 answered");
});

/* ---- the done rule, the clock, and the answer each event makes ---- */

test("after: done at the end, or within left seconds of it and past half way; a length not known only counts the end", () => {
	// a 30 minute episode, left 120
	assert.equal(core.after(1800, 1800, 120), true, "at the end");
	assert.equal(core.after(1680, 1800, 120), true, "exactly left seconds from the end");
	assert.equal(core.after(1679, 1800, 120), false, "one second before that");
	assert.equal(core.after(1679.9, 1800, 120), false, "whole seconds: 1679.9 is 1679");
	assert.equal(core.after(1680.9, 1800, 120), true);
	// a short clip is within left seconds of its end from the first second: a pause at its start is not done, past half it is
	assert.equal(core.after(0, 90, 120), false);
	assert.equal(core.after(44, 90, 120), false, "not yet half");
	assert.equal(core.after(45, 90, 120), true, "half");
	assert.equal(core.after(10, 90, 0), false, "left 0: only the very end");
	assert.equal(core.after(90, 90, 0), true);
	// a length not known (an unready element, a stream) counts only the end
	for (const d of [NaN, Infinity, 0, -1]) {
		assert.equal(core.after(5000, d, 120), false, `duration ${d}`);
		assert.equal(core.after(5000, d, 120, true), true, `duration ${d}, ended`);
	}
	assert.equal(core.after(NaN, 100, 120), false);
	assert.equal(core.after(0, 100, 120, true), true, "ended");
});

test("clock: whole seconds as 12:34, and 1:02:03 from an hour", () => {
	assert.deepEqual([0, 5, 59, 60, 754, 3599, 3600, 3723, 754.9].map(core.clock), ["0:00", "0:05", "0:59", "1:00", "12:34", "59:59", "1:00:00", "1:02:03", "12:34"]);
	assert.deepEqual([NaN, -3, Infinity].map(core.clock), ["0:00", "0:00", "0:00"]);
});

test("listenNext: a pause writes pos in whole seconds, first as { pos, done } with pos first", () => {
	const at = (pos, duration = 1800) => ({ pos, duration });
	assert.deepEqual(core.listenNext(undefined, "pause", at(754.9), 120), { pos: 754, done: false });
	assert.deepEqual(Object.keys(core.listenNext(undefined, "pause", at(754), 120)), ["pos", "done"], "pos first");
	assert.deepEqual(core.listenNext(undefined, "pause", at(1700), 120), { pos: 1700, done: true }, "within left of the end and past half");
	assert.deepEqual(core.listenNext(undefined, "pause", at(1700, NaN), 120), { pos: 1700, done: false }, "a length not known: only the end counts");
	assert.equal(core.listenNext(undefined, "pause", at(0.4), 120), null, "a first pause at the very start makes no answer");
	assert.equal(core.listenNext(undefined, "pause", at(NaN), 120), null);
	assert.equal(core.listenNext(undefined, "pause", at(-3), 120), null);
	assert.equal(core.listenNext(undefined, "pause", {}, 120), null);
	assert.equal(core.listenNext({ pos: 754, done: false }, "pause", at(754.2), 120), null, "the same second again changes nothing");
	assert.equal(core.listenNext({}, "pause", at(0), 120), null);
});

test("listenNext: a pause keeps every other key and their order, adds done only when it becomes true, and never clears it", () => {
	const at = (pos) => ({ pos, duration: 1800 });
	const was = { note: "kept", pos: 10, extra: [1, 2], done: false };
	const next = core.listenNext(was, "pause", at(400), 120);
	assert.deepEqual(Object.entries(next), [["note", "kept"], ["pos", 400], ["extra", [1, 2]], ["done", false]], "pos replaced where it stands");
	assert.deepEqual(was, { note: "kept", pos: 10, extra: [1, 2], done: false }, "the answer given is not changed");
	assert.deepEqual(core.listenNext({ pos: 10 }, "pause", at(400), 120), { pos: 400 }, "no done key is added by a pause that is not done");
	assert.deepEqual(core.listenNext({ pos: 10, other: 1 }, "pause", at(1750), 120), { pos: 1750, other: 1, done: true }, "done is added last when it becomes true");
	assert.deepEqual(core.listenNext({ pos: 10, done: false }, "pause", at(1750), 120), { pos: 1750, done: true }, "an existing done is set where it stands");
	assert.deepEqual(core.listenNext({ pos: 1750, done: true }, "pause", at(30), 120), { pos: 30, done: true }, "playing again from the start never clears done");
	assert.deepEqual(core.listenNext({ done: true }, "pause", at(30), 120), { done: true, pos: 30 }, "a done with no pos gets a pos, after it");
	assert.equal(core.listenNext({ done: true }, "pause", at(0), 120), null, "a pause at the start of a done episode changes nothing");
	assert.deepEqual(core.listenNext({ pos: 90, done: true }, "pause", at(0), 120), { pos: 0, done: true }, "back at the start is written as 0");
});

test("listenNext: the end takes pos out and sets done; a tick sets done; an untick clears it and a listen left with nothing holds nothing", () => {
	assert.deepEqual(core.listenNext(undefined, "end", {}, 120), { done: true });
	assert.deepEqual(core.listenNext({ pos: 1790, done: false, note: "k" }, "end", {}, 120), { done: true, note: "k" }, "pos out, done where it stood, other keys kept");
	assert.deepEqual(Object.entries(core.listenNext({ pos: 5, note: "k" }, "end", {}, 120)), [["note", "k"], ["done", true]]);
	assert.equal(core.listenNext({ done: true }, "end", {}, 120), null, "already ended");
	assert.deepEqual(core.listenNext(undefined, "tick", {}, 120), { done: true });
	assert.deepEqual(core.listenNext({ pos: 30 }, "tick", {}, 120), { pos: 30, done: true }, "a tick keeps the place");
	assert.deepEqual(core.listenNext({ pos: 30, done: false }, "tick", {}, 120), { pos: 30, done: true });
	assert.equal(core.listenNext({ pos: 30, done: true }, "tick", {}, 120), null);
	assert.deepEqual(core.listenNext({ pos: 30, done: true }, "untick", {}, 120), { pos: 30, done: false });
	assert.deepEqual(core.listenNext({ done: true }, "untick", {}, 120), { done: false }, "holds nothing: the writer takes the answer out");
	assert.equal(core.holdsSomething(core.listenNext({ done: true }, "untick", {}, 120)), false);
	assert.equal(core.listenNext({ pos: 30 }, "untick", {}, 120), null, "nothing to clear");
	assert.equal(core.listenNext(undefined, "untick", {}, 120), null);
	assert.deepEqual(core.listenNext({ done: true, note: "k" }, "untick", {}, 120), { done: false, note: "k" }, "a listen that keeps another key keeps its answer");
});

test("listenNext leaves an answer of the wrong shape alone", () => {
	for (const bad of [7, "x", [1], true]) for (const ev of ["end", "pause", "tick", "untick"]) assert.equal(core.listenNext(bad, ev, { pos: 5, duration: 10 }, 120), null, `${JSON.stringify(bad)} ${ev}`);
});

/* ---- the writer ---- */

const block = (text) => text.slice(text.indexOf("```booklet answers"), text.indexOf("```", text.indexOf("```booklet answers") + 3) + 3);

test("a first answer is written in the reference renderer's shape, pos first, and the design is not touched", () => {
	const orig = note(BASE);
	const next = core.setAnswer(orig, "", "e1", core.listenNext(undefined, "pause", { pos: 754.8, duration: 1800 }, 120));
	assert.equal(block(next), '```booklet answers\n{\n "e1": {\n  "pos": 754,\n  "done": false\n }\n}\n```');
	assertOutsideUnchanged(orig, next, "first listen answer");
	assert.deepEqual(norm(core.parseBooklet(next).records.answers[""]), { e1: { pos: 754, done: false } });
	assert.equal(core.parseBooklet(next).problems.length, 0);
	// the same answer again changes nothing
	assert.equal(core.setAnswer(next, "", "e1", { pos: 754, done: false }), next);
});

test("a pause, the end and a tick change only pos and done: unknown keys, their order and every other byte stay as written", () => {
	const records = '```booklet answers\n{"e1":{"pos":10,"note":"keep  me",  "done":false,"x":[1,  2]},\n  "t": "words",   "zz": 7}\n```';
	const orig = note(`${BASE}\n%%\n${core.RECORDS_HEADER}\n\n${records}\n%%\n`);
	let text = "";
	const read = () => norm(core.parseBooklet(text).records.answers[""].e1);
	text = core.setAnswer(orig, "", "e1", core.listenNext(core.parseBooklet(orig).records.answers[""].e1, "pause", { pos: 400.7, duration: 1800 }, 120));
	assert.equal(block(text), records.replace('"pos":10', '"pos":400'), "only the pos value changed");
	assertOutsideUnchanged(orig, text, "pause");
	// the end: pos out with its comma, done set where it stands
	text = core.setAnswer(text, "", "e1", core.listenNext(core.parseBooklet(text).records.answers[""].e1, "end", {}, 120));
	assert.equal(block(text), records.replace('"pos":10,', "").replace('"done":false', '"done":true'));
	assert.deepEqual(read(), { note: "keep  me", done: true, x: [1, 2] });
	// untick, then tick: done flips in place
	text = core.setAnswer(text, "", "e1", core.listenNext(core.parseBooklet(text).records.answers[""].e1, "untick", {}, 120));
	assert.equal(block(text), records.replace('"pos":10,', ""));
	text = core.setAnswer(text, "", "e1", core.listenNext(core.parseBooklet(text).records.answers[""].e1, "tick", {}, 120));
	assert.equal(block(text), records.replace('"pos":10,', "").replace('"done":false', '"done":true'));
	assertOutsideUnchanged(orig, text, "end, untick, tick");
	// the other answers are the bytes they were
	assert.ok(text.includes('"t": "words",   "zz": 7}'));
});

test("a done with no pos, unticked, leaves { } or { done: false }, which hold nothing, so the answer is taken out and the rest stays", () => {
	const records = '```booklet answers\n{"e1": {"done": true}, "t": "words"}\n```';
	const orig = note(`${BASE}\n%%\n${core.RECORDS_HEADER}\n\n${records}\n%%\n`);
	const next = core.setAnswer(orig, "", "e1", core.listenNext({ done: true }, "untick", {}, 120));
	assert.equal(block(next), '```booklet answers\n{"t": "words"}\n```');
	assertOutsideUnchanged(orig, next, "untick");
	// the same with the only answer: the block is left holding nothing
	const only = note(`${BASE}\n%%\n${core.RECORDS_HEADER}\n\n\`\`\`booklet answers\n{"e1": {"done": true}}\n\`\`\`\n%%\n`);
	const none = core.setAnswer(only, "", "e1", core.listenNext({ done: true }, "untick", {}, 120));
	assert.deepEqual(norm(core.parseBooklet(none).records.answers[""] ?? {}), {});
	assertOutsideUnchanged(only, none, "untick the only answer");
	// a listen that keeps another key keeps its answer
	const kept = core.setAnswer(note(`${BASE}\n%%\n${core.RECORDS_HEADER}\n\n\`\`\`booklet answers\n{"e1": {"done": true, "note": "k"}}\n\`\`\`\n%%\n`), "", "e1", { done: false, note: "k" });
	assert.deepEqual(norm(core.parseBooklet(kept).records.answers[""]), { e1: { done: false, note: "k" } });
});

test("a pos is kept as an answer by the writer even though it does not count; an empty object is no answer", () => {
	const orig = note(BASE);
	const withPos = core.setAnswer(orig, "", "e1", { pos: 30 });
	assert.deepEqual(norm(core.parseBooklet(withPos).records.answers[""]), { e1: { pos: 30 } });
	assert.equal(core.setAnswer(orig, "", "e1", {}), orig, "nothing to write");
	assert.equal(core.setAnswer(orig, "", "e1", { done: false }), orig, "nothing to write");
});

test("an answer of the wrong shape is kept as written and the writer will not touch it; a value JSON cannot hold is refused", () => {
	const wrong = note(`${BASE}\n%%\n${core.RECORDS_HEADER}\n\n\`\`\`booklet answers\n{"e1": {"pos": 1.5}}\n\`\`\`\n%%\n`);
	assert.throws(() => core.setAnswer(wrong, "", "e1", { pos: 3 }), core.RecordsWriteError);
	assert.throws(() => core.setAnswer(note(BASE), "", "e1", { pos: Number.NaN }), core.RecordsWriteError);
	// the view's copy, with the question, says why
	const b = core.parseBooklet(wrong);
	assert.equal(b.problems.some((p) => /not in the shape their questions keep|not in the shape its question keeps/.test(p)), true, b.problems.join("; "));
});

test("two answers blocks: a listen held in an earlier block is written whole in the last one", () => {
	const orig = note(`${BASE}\n%%\n${core.RECORDS_HEADER}\n\n\`\`\`booklet answers\n{"e1": {"pos": 5, "note": "k"}}\n\`\`\`\n\n\`\`\`booklet answers\n{"t": "words"}\n\`\`\`\n%%\n`);
	const next = core.setAnswer(orig, "", "e1", { pos: 9, note: "k" });
	assert.deepEqual(norm(core.parseBooklet(next).records.answers[""]), { e1: { pos: 9, note: "k" }, t: "words" });
	assertOutsideUnchanged(orig, next, "two blocks");
});

test("smallestEdit keeps the common start and end and replaces only what lies between (one function for both writers)", () => {
	const apply = (a, b) => {
		const e = core.smallestEdit(a, b);
		assert.equal(a.slice(0, e.from) + e.text + a.slice(e.to), b, `${a} -> ${b}`);
		return [e.from, e.to, e.text];
	};
	assert.deepEqual(apply("abcdef", "abXYef"), [2, 4, "XY"]);
	assert.deepEqual(apply("abc", "abcdef"), [3, 3, "def"]);
	assert.deepEqual(apply("abcdef", "abc"), [3, 6, ""]);
	assert.deepEqual(apply("same", "same"), [4, 4, ""]);
	assert.deepEqual(apply("aaa", "aaaa"), [3, 3, "a"], "a repeated character is not counted twice");
	apply("", "new");
	apply("old", "");
});
