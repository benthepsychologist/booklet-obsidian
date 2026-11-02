/*
 * The writer's round trip: made-up notes that hold no records yet (and some that do) are answered in every common kind, kept
 * as entries, hand-edited and answered again, and each time the file is compared as bytes (Buffer), not strings: every byte
 * the writer was not asked to change is the byte that was there. Line endings, a byte-order mark, a missing final newline,
 * non-Latin text and emoji and a design written after the records are the ways a file differs that a string comparison on
 * one machine does not see. The same flows in the real app are check 36 of e2e/plugin-check.js.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { assertOutsideUnchanged, core, norm } from "./helpers.mjs";

const HEADER = core.RECORDS_HEADER;

/** The made-up note: one activity with the seven common kinds, and a repeating one. `eol` is every line ending in it. */
function note({ eol = "\n", bom = false, finalNewline = true, words = "" } = {}) {
	const lines = [
		"---",
		'booklet: "0.18"',
		"id: test/round-trip",
		`title: Round trip ${words}`.trimEnd(),
		"lang: en",
		"---",
		"",
		"> [!activity|kinds] Every kind",
		"",
		`Made-up words ${words}`.trimEnd() + ".",
		"",
		"> [!choice|fruit] Which fruit?",
		"- [ ] Apple",
		"- [ ] Pear",
		"- [ ] Plum",
		"",
		"> [!multi|tools open] Which tools?",
		"- [ ] Pencil",
		"- [ ] Ruler",
		"- [ ] Scissors",
		"",
		"> [!scale|sure] How sure?",
		"",
		"1. Not sure",
		"2. Fairly sure",
		"3. Certain",
		"",
		"> [!text|thoughts long] Anything else?",
		"",
		"> [!lines|steps] The steps",
		"",
		"> [!number|boxes min:0 max:20] How many boxes?",
		"",
		"> [!date|day] Which day?",
		"",
		"> [!activity|log repeat] A log",
		"",
		"> [!text|line] A line for today",
	];
	const text = lines.join(eol) + (finalNewline ? eol : "");
	return (bom ? "﻿" : "") + text;
}

const ANSWERS = [
	["fruit", 2],
	["tools", [1, 3, "Own tape"]],
	["sure", 2],
	["thoughts", "Köszönöm 🙂 ありがとう\nSecond line, with “quotes”"],
	["steps", ["fold", "crease", "日本語"]],
	["boxes", 7],
	["day", "2026-11-02"],
];

const bytes = (s) => Buffer.from(s, "utf8");
const isCRLF = (s) => !/[^\r]\n/.test(s) && !/^\n/.test(s) && !/\r(?!\n)/.test(s);
const isLF = (s) => !s.includes("\r");

/** The whole file's line endings are one kind: every \n has its \r (CRLF), or no \r anywhere (LF). */
function assertOneEnding(s, eol, what) {
	assert.ok(eol === "\r\n" ? isCRLF(s) : isLF(s), `${what}: mixed line endings`);
}

const VARIANTS = {
	"LF": {},
	"CRLF": { eol: "\r\n" },
	"no final newline": { finalNewline: false },
	"CRLF, no final newline": { eol: "\r\n", finalNewline: false },
	"byte-order mark": { bom: true },
	"byte-order mark, CRLF, no final newline": { bom: true, eol: "\r\n", finalNewline: false },
	"non-Latin text and emoji in the design": { words: "Спасибо 🌊 感謝" },
};

for (const [name, opts] of Object.entries(VARIANTS)) {
	test(`${name}: no records yet, every common kind answered one by one: the bytes before the region never change, one ending`, () => {
		const eol = opts.eol ?? "\n";
		const orig = note(opts);
		const origBytes = bytes(orig);
		let text = orig;
		const want = {};
		ANSWERS.forEach(([id, value], n) => {
			text = core.setAnswer(text, "", id, value);
			want[id] = value;
			assert.ok(bytes(text).subarray(0, origBytes.length).equals(origBytes), `${name}: answer ${n + 1} changed a byte of the design`);
			assert.deepEqual(norm(core.parseBooklet(text).records.answers[""]), want);
			assertOneEnding(text, eol, `${name}, answer ${n + 1}`);
		});
		// every answer cleared again: no answer is left, and the design is still the bytes it was
		for (const [id] of ANSWERS) text = core.setAnswer(text, "", id, undefined);
		assert.ok(bytes(text).subarray(0, origBytes.length).equals(origBytes), `${name}: clearing changed a byte of the design`);
		assert.deepEqual(norm(core.parseBooklet(text).records.answers[""] ?? {}), {});
		assertOneEnding(text, eol, `${name}, cleared`);
		// the same answer written twice changes nothing
		const once = core.setAnswer(orig, "", "fruit", 2);
		assert.equal(core.setAnswer(once, "", "fruit", 2), once);
	});

	test(`${name}: a repeating activity kept three times: drafts, entries, a replaced day; the endings stay one`, () => {
		const eol = opts.eol ?? "\n";
		const orig = note(opts);
		const origBytes = bytes(orig);
		let text = orig;
		const days = ["2026-10-01T08:00:00Z", "2026-10-02T08:00:00Z", "2026-10-03T08:00:00Z"];
		const entryLines = (t) => t.split(eol).filter((l) => l.startsWith('{"ts"'));
		// the comma that joins an entry to the next one is the only byte an earlier line gains
		const bare = (l) => l.replace(/,$/, "");
		let before = [];
		for (const [n, ts] of days.entries()) {
			text = core.setDraftAnswer(text, "", "log", "line", `Day ${n + 1} 🌙 ${"日本語"[n]}`);
			assertOneEnding(text, eol, `${name}, draft ${n + 1}`);
			text = core.finalizeDraft(text, "", "log", { ts }).text;
			assertOneEnding(text, eol, `${name}, entry ${n + 1}`);
			assert.ok(bytes(text).subarray(0, origBytes.length).equals(origBytes), `${name}: keeping entry ${n + 1} changed a byte of the design`);
			const lines = entryLines(text);
			assert.equal(lines.length, n + 1);
			// the earlier entries' lines are the bytes they were before this one was added
			before.forEach((l, i) => assert.ok(bytes(bare(lines[i])).equals(bytes(bare(l))), `${name}: keeping entry ${n + 1} changed the line of entry ${i + 1}`));
			assert.ok(lines[n].includes(`Day ${n + 1}`));
			before = lines;
		}
		const kept = core.parseBooklet(text).records.entries[""].log.map((e) => e.line);
		assert.equal(kept.length, 3);
		assert.ok(kept[2].startsWith("Day 3"));
	});
}

test("the first write to a note with no records, byte for byte, in each ending (built here, not by the writer)", () => {
	for (const eol of ["\n", "\r\n"]) {
		for (const finalNewline of [true, false]) {
			const orig = note({ eol, finalNewline });
			const next = core.setAnswer(orig, "", "boxes", 12);
			const region = ["%%", HEADER, "", "```booklet answers", "{", ' "boxes": 12', "}", "```", "%%"].join(eol) + eol;
			const sep = finalNewline ? eol : eol + eol;
			assert.equal(bytes(next).toString("hex"), bytes(orig + sep + region).toString("hex"), `${JSON.stringify({ eol, finalNewline })}`);
		}
	}
});

test("design written after the records stays where it is, byte for byte, through every write", () => {
	for (const eol of ["\n", "\r\n"]) {
		const head = note({ eol });
		const after = ["", "Some design written after the records, kept.", "", "> [!activity|late] A late activity", "", "> [!text|late-q] A late question", ""].join(eol);
		const orig = `${head}${eol}%%${eol}${HEADER}${eol}${eol}\`\`\`booklet answers${eol}{"fruit": 1}${eol}\`\`\`${eol}%%${eol}${after}`;
		const tailAt = orig.indexOf("Some design written after");
		const tail = bytes(orig.slice(tailAt));
		let text = orig;
		for (const [id, value] of ANSWERS) {
			text = core.setAnswer(text, "", id, value);
			assert.ok(bytes(text).subarray(bytes(text).length - tail.length).equals(tail), `${JSON.stringify(eol)}: ${id} moved or changed the design after the records`);
			assert.ok(bytes(text).subarray(0, bytes(head).length).equals(bytes(head)));
			assertOneEnding(text, eol, id);
		}
		text = core.setAnswer(text, "", "late-q", "late answer");
		assert.ok(bytes(text).subarray(bytes(text).length - tail.length).equals(tail));
		for (const [id] of ANSWERS) text = core.setAnswer(text, "", id, undefined);
		assert.ok(bytes(text).subarray(bytes(text).length - tail.length).equals(tail), "cleared");
	}
});

test("a note edited by hand between two saves: the hand edit is kept, byte for byte, by the next save", () => {
	for (const eol of ["\n", "\r\n"]) {
		let text = core.setAnswer(note({ eol }), "", "fruit", 2);
		text = core.setAnswer(text, "", "sure", 3);
		// by hand: the design's words changed, trailing spaces added, a tab, the answers block laid out in a style of its own, a blank line more
		let hand = text.replace("Made-up words.", "Made-up words, edited by hand.  \t");
		hand = hand.replace(/```booklet answers[\s\S]*?```/, ["```booklet answers", '{"fruit":   2,', '   "sure": 3,   ', '"zzz-note":"a key no question has"}', "```"].join(eol));
		hand = hand.replace(`${eol}%%${eol}`, `${eol}${eol}${eol}%%${eol}`);
		const next = core.setAnswer(hand, "", "boxes", 9);
		assertOneEnding(next, eol, "after the hand edit");
		const a = bytes(hand), b = bytes(next);
		const prefix = a.indexOf('"zzz-note":"a key no question has"}');
		assert.ok(b.subarray(0, prefix).equals(a.subarray(0, prefix)), "everything before the answers block's last member is as edited");
		assert.ok(next.includes('"zzz-note":"a key no question has"'), "the key no question has is kept");
		assert.deepEqual(norm(core.parseBooklet(next).records.answers[""]), { fruit: 2, sure: 3, "zzz-note": "a key no question has", boxes: 9 });
		// and the rest of the file, after the block, is as edited
		const closeAt = hand.indexOf("```", hand.indexOf("```booklet answers") + 3);
		assert.ok(next.endsWith(hand.slice(closeAt)), "everything after the answers block is as edited");
	}
});

test("CRLF: a block written into a note with CRLF endings, in every part, has CRLF endings; no line gets a bare LF", () => {
	const eol = "\r\n";
	let text = note({ eol });
	for (const [id, value] of ANSWERS) text = core.setAnswer(text, "", id, value);
	text = core.setDraftAnswer(text, "", "log", "line", "A line");
	text = core.finalizeDraft(text, "", "log", { ts: "2026-10-01T08:00:00Z" }).text;
	text = core.setDraftAnswer(text, "", "log", "line", "Another");
	text = core.finalizeDraft(text, "", "log", { ts: "2026-10-02T08:00:00Z" }).text;
	assert.ok(isCRLF(text), JSON.stringify(text.slice(text.indexOf("%%"))));
	// a multi-line text answer is one JSON string with an escaped newline, never a raw one
	assert.ok(text.includes("\\n"));
});

/* ---- a listen (format 0.18) ---- */

/**
 * A made-up course note: a `media-from` YAML list in the front matter, an activity of listens (a remote embed, a local one, a link) each
 * with a transcript callout after it, and a text question. `eol` is every line ending in it.
 */
function course({ eol = "\n", records = "" } = {}) {
	const lines = [
		"---",
		'booklet: "0.18"',
		"id: test/course",
		"title: A made-up course",
		"lang: en",
		"media-from:",
		"  - https://media.example.org",
		"  - https://cdn.example.net:8443",
		"---",
		"",
		"> [!activity|course] The course",
		"",
		"> [!listen|e1] Episode 1: Foundations",
		"> ![Episode 1](https://media.example.org/u01/e1.m4a)",
		"",
		"> [!note]- Transcript",
		"> Made-up words said in the episode, with “quotes” and 日本語.",
		"",
		"> [!listen|e2 left:60] Episode 2",
		"> ![[ep2.mp3]]",
		"",
		"> [!note]- Transcript",
		"> More made-up words.",
		"",
		"> [!listen|v1] Lecture video",
		"> [Watch the lecture](https://video.example.org/watch/overview)",
		"",
		"> [!text|t] Thoughts",
		"",
	];
	return lines.join(eol) + records;
}

const LISTEN_STEPS = [
	["e1", "pause", { pos: 754.6, duration: 1800 }],
	["e1", "pause", { pos: 1700, duration: 1800 }],
	["e2", "tick", {}],
	["v1", "tick", {}],
	["e1", "end", {}],
	["e2", "untick", {}],
	["e1", "untick", {}],
];

for (const [name, eol] of [["LF", "\n"], ["CRLF", "\r\n"]]) {
	test(`${name}: a course with a listen, a media-from list and transcripts: pause, end, tick and untick change the answer and nothing before the region`, () => {
		const orig = course({ eol });
		const origBytes = bytes(orig);
		const back = core.parseBooklet(orig);
		assert.deepEqual(back.mediaFrom, ["https://media.example.org", "https://cdn.example.net:8443"]);
		assert.deepEqual(back.problems, []);
		assert.deepEqual(back.unread, []);
		// a transcript is an ordinary folded callout after the embed: prose to the reader, drawn by Obsidian, and kept as written
		assert.equal(back.activities[0].segments.filter((s) => s.type === "prose" && s.markdown.startsWith("> [!note]- Transcript")).length, 2);
		let text = orig;
		const want = {};
		for (const [id, ev, at] of LISTEN_STEPS) {
			const next = core.listenNext(want[id], ev, at, id === "e2" ? 60 : 120);
			if (next === null) continue;
			text = core.setAnswer(text, "", id, next);
			if (core.holdsSomething(next)) want[id] = next;
			else delete want[id];
			assert.ok(bytes(text).subarray(0, origBytes.length).equals(origBytes), `${name}: ${id} ${ev} changed a byte of the design`);
			assert.deepEqual(norm(core.parseBooklet(text).records.answers[""] ?? {}), want, `${id} ${ev}`);
			assertOneEnding(text, eol, `${name}, ${id} ${ev}`);
		}
		// e1 ended then unticked left { done: false }, which holds nothing; e2 ticked then unticked likewise; v1 is ticked
		assert.deepEqual(norm(core.parseBooklet(text).records.answers[""]), { v1: { done: true } });
		const kinds = new Set(core.parseBooklet(text).activities[0].segments.filter((s) => s.type === "question").map((s) => s.kind));
		assert.deepEqual([...kinds], ["listen", "text"]);
	});
}

test("a note that already holds listen answers: a listen answered, one unanswered, one with a pos and unknown keys; only the changed answer's bytes change", () => {
	const records =
		'%%\n' + core.RECORDS_HEADER + '\n\n```booklet answers\n{"e1": {"pos": 754, "done": false, "seen-on": "a made-up device", "tags": ["x",  "y"]},\n "v1":{"done":true},  "t": "words"}\n```\n%%\n';
	const orig = course({ records: "\n" + records });
	const book = core.parseBooklet(orig);
	assert.deepEqual(book.problems, []);
	assert.deepEqual(norm(book.records.answers[""]), { e1: { pos: 754, done: false, "seen-on": "a made-up device", tags: ["x", "y"] }, v1: { done: true }, t: "words" });
	// e2 is unanswered: a first pause writes it after the others, which keep their bytes
	const first = core.setAnswer(orig, "", "e2", core.listenNext(undefined, "pause", { pos: 30, duration: 600 }, 60));
	const at = first.indexOf("```booklet answers");
	assert.ok(first.slice(0, at) === orig.slice(0, at), "everything before the block is as it was");
	assert.ok(first.includes('{"e1": {"pos": 754, "done": false, "seen-on": "a made-up device", "tags": ["x",  "y"]},'), "the first answer keeps its bytes");
	assert.ok(first.includes(' "v1":{"done":true},  "t": "words"'), "so do the others");
	assert.deepEqual(norm(core.parseBooklet(first).records.answers[""].e2), { pos: 30, done: false });
	// e1 resumes and ends: its pos is taken out, its unknown keys and their spacing stay
	const ended = core.setAnswer(first, "", "e1", core.listenNext(core.parseBooklet(first).records.answers[""].e1, "end", {}, 120));
	assert.ok(ended.includes('{"e1": {"done": true, "seen-on": "a made-up device", "tags": ["x",  "y"]},'), ended);
	assert.deepEqual(Object.keys(core.parseBooklet(ended).records.answers[""].e1), ["done", "seen-on", "tags"]);
	// the design is the bytes it was, before the region and after it
	assertOutsideUnchanged(orig, ended, "ended");
	// v1 unticked is left { done: false }: holds nothing, so its member goes and the rest stays
	const unticked = core.setAnswer(ended, "", "v1", core.listenNext({ done: true }, "untick", {}, 120));
	assert.equal(core.parseBooklet(unticked).records.answers[""].v1, undefined);
	assert.ok(unticked.includes('"t": "words"'));
	assertOutsideUnchanged(orig, unticked, "unticked");
});
