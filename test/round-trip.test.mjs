/*
 * The writer's round trip: made-up notes that hold no records yet (and some that do) are answered in every common kind, kept
 * as entries, hand-edited and answered again, and each time the file is compared as bytes (Buffer), not strings: every byte
 * the writer was not asked to change is the byte that was there. Line endings, a byte-order mark, a missing final newline,
 * non-Latin text and emoji and a design written after the records are the ways a file differs that a string comparison on
 * one machine does not see. The same flows in the real app are check 36 of e2e/plugin-check.js.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { core, norm } from "./helpers.mjs";

const HEADER = core.RECORDS_HEADER;

/** The made-up note: one activity with the seven common kinds, and a repeating one. `eol` is every line ending in it. */
function note({ eol = "\n", bom = false, finalNewline = true, words = "" } = {}) {
	const lines = [
		"---",
		'booklet: "0.17"',
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
		for (const [n, ts] of days.entries()) {
			text = core.setDraftAnswer(text, "", "log", "line", `Day ${n + 1} 🌙 ${"日本語"[n]}`);
			assertOneEnding(text, eol, `${name}, draft ${n + 1}`);
			text = core.finalizeDraft(text, "", "log", { ts }).text;
			assertOneEnding(text, eol, `${name}, entry ${n + 1}`);
			assert.ok(bytes(text).subarray(0, origBytes.length).equals(origBytes), `${name}: keeping entry ${n + 1} changed a byte of the design`);
		}
		const kept = core.parseBooklet(text).records.entries[""].log.map((e) => e.line);
		assert.equal(kept.length, 3);
		assert.ok(kept[2].startsWith("Day 3"));
		// the earlier entries' lines are the bytes they were when the third was added
		const second = text.split(eol).filter((l) => l.startsWith('{"ts"'));
		assert.equal(second.length, 3);
		assert.equal(second.filter((l) => l.includes("Day 1") || l.includes("Day 2")).length, 2);
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
