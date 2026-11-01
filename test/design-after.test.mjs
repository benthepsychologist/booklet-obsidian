/*
 * Design written after the records region stays after it (SPEC 0.17 section 8). Everything after the region's closing `%%` is design
 * again: it is read as design (prose, an activity, a module, a data section) and a save leaves it exactly where it is, and every byte
 * the reader did not change is as it was. Every note here is made up.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { click, openView } from "./dom.mjs";
import { core, norm, assertOutsideUnchanged, lint, pythonAvailable } from "./helpers.mjs";

const HEAD = `---\nbooklet: "0.17"\ntitle: Garden notes\n---\n`;
const BEFORE =
	`${HEAD}\n> [!activity|bed] The bed\n\n> [!choice|soil] What is the soil?\n- [ ] Clay\n- [ ] Sand\n\n> [!text|note] A note about the bed\n\nWords before the records.\n\n`;
const REGION = `%%\n${core.RECORDS_HEADER}\n\n\`\`\`booklet answers\n{"soil": 1}\n\`\`\`\n%%\n`;
/** Design after the closing %%: prose, a bare activity with a question, a module with a repeat activity, and a data section. */
const AFTER =
	`\nWords placed after the records, with a trailing space. ` +
	`\n\n> [!activity|late] Written after the records\n\n> [!choice|water] Watered?\n- [ ] Yes\n- [ ] No\n\n> [!text|later] Anything later?\n\n` +
	`> [!module|m] A module after the records\n\n> [!activity|log repeat] Log\n\n> [!text|what] What happened?\n\n> [!module|m end]\n\n` +
	`> [!data] Data\n\n\`\`\`booklet menu places\n{"items": ["Front", "Back"]}\n\`\`\`\n\nClosing words, no newline at the end.`;
const NOTE = BEFORE + REGION + AFTER;

/** The text after the records region's closing `%%`, exactly. */
const tail = (text) => {
	const L = core.splitLines(text);
	const lines = L.map((l) => l.text);
	const r = core.findRegions(lines, core.frontMatterOf(lines).bodyStart)[0];
	return L
		.slice(r.end + 1)
		.map((l) => l.text + l.eol)
		.join("");
};
const answers = (text, scope = "") => norm(core.parseBooklet(text).records.answers[scope] ?? {});

test("the note reads as designed: the region is found before the design after it, and the design after it is read as design", () => {
	const book = core.parseBooklet(NOTE);
	assert.equal(book.records.regions.length, 1);
	assert.deepEqual(norm(book.activities.map((a) => a.id)), ["bed", "late", "log"], "the activities written after the records are read");
	assert.deepEqual(answers(NOTE), { soil: 1 });
	assert.equal(tail(NOTE), AFTER);
});

test("a save leaves the design after the region where it is, byte for byte, whatever it writes: answers, drafts, entries, a module's records", () => {
	let text = NOTE;
	const step = (what, next) => {
		assert.notEqual(next, text, `${what}: nothing was written`);
		assert.equal(tail(next), AFTER, `${what}: the design after the records moved or changed`);
		assertOutsideUnchanged(text, next, what);
		assert.equal(next.slice(0, next.indexOf("%%")), BEFORE, `${what}: the body before the region changed`);
		text = next;
	};
	// an answer to a question written before the records, and one written after them, new and changed
	step("answer, before", core.setAnswer(text, "", "note", "Heavy"));
	step("answer, after", core.setAnswer(text, "", "water", 2));
	step("answer changed", core.setAnswer(text, "", "soil", 2));
	assert.deepEqual(answers(text), { soil: 2, note: "Heavy", water: 2 });
	// a module declared after the region: its records line is made inside the region
	step("a module's draft", core.setDraftAnswer(text, "m", "log", "what", "Pruned the roses"));
	step("a module's entry", core.finalizeDraft(text, "m", "log", { ts: "2026-10-30T09:00:00Z" }).text);
	step("a second entry", core.finalizeDraft(core.setDraftAnswer(text, "m", "log", "what", "Mulched"), "m", "log", { ts: "2026-10-31T09:00:00Z" }).text);
	assert.equal(core.parseBooklet(text).records.entries["m"]["log"].length, 2);
	const first = core.parseBooklet(text).records.entries["m"]["log"][0];
	const dropped = core.removeEntry(text, "m", "log", 0, first.ts, core.entryKey(first));
	step("an entry removed", dropped.text);
	// clearing every answer
	step("answer cleared", core.setAnswer(text, "", "water", undefined));
	step("answer cleared", core.setAnswer(text, "", "note", undefined));
	assert.deepEqual(answers(text), { soil: 2 });
});

test("the same under a view: pressing an answer in the pane writes inside the region only, and a later change made by hand to the design after it is kept", async () => {
	const v = openView(NOTE, { path: "Garden notes.booklet.md", screen: "activity:/late" });
	await v.settled();
	const yes = [...v.view.contentEl.querySelectorAll("button.booklet-choice")].find((b) => b.textContent.includes("Yes"));
	click(yes);
	await v.settled();
	assert.equal(v.disk.writes > 0, true, "the answer was written");
	assert.equal(tail(v.disk.text), AFTER, "the design after the records is where it was");
	assert.deepEqual(answers(v.disk.text), { soil: 1, water: 1 });
	// the author edits the design after the region by hand (as in a Markdown pane): the next press keeps that edit
	v.changed((t) => t.replace("Closing words, no newline at the end.", "Closing words, edited by hand."));
	await v.settled();
	const no = [...v.view.contentEl.querySelectorAll("button.booklet-choice")].find((b) => b.textContent.includes("No"));
	click(no);
	await v.settled();
	assert.ok(tail(v.disk.text).endsWith("Closing words, edited by hand."), "the hand edit after the region was kept");
	assert.equal(tail(v.disk.text), AFTER.replace("no newline at the end", "edited by hand"));
	assert.deepEqual(answers(v.disk.text), { soil: 1, water: 2 });
	v.close();
});

test("with Windows line endings and no newline at the end: the design after the region keeps its endings, and the lines a save adds take the file's", () => {
	const crlf = NOTE.replace(/\n/g, "\r\n");
	assert.ok(!/(^|[^\r])\n/.test(crlf));
	const a = core.setAnswer(crlf, "", "water", 1);
	assert.equal(tail(a), AFTER.replace(/\n/g, "\r\n"));
	const b = core.finalizeDraft(core.setDraftAnswer(a, "m", "log", "what", "Pruned"), "m", "log", { ts: "2026-10-30T09:00:00Z" }).text;
	assert.equal(tail(b), AFTER.replace(/\n/g, "\r\n"));
	assert.ok(!/(^|[^\r])\n/.test(b), "no bare line feed was written into a file that uses CRLF");
	assert.equal(b.slice(0, b.indexOf("%%")), BEFORE.replace(/\n/g, "\r\n"));
});

test("a byte order mark and non-Latin design after the region are kept", () => {
	const later = "\n日本語の言葉。 🌿 Ünïcödé after the records.\n";
	const text = "﻿" + BEFORE + REGION + later;
	const next = core.setAnswer(text, "", "note", "Écrit à la main 🌱");
	assert.ok(next.startsWith("﻿"), "the byte order mark is kept");
	assert.equal(tail(next), later);
	assert.deepEqual(answers(next), { soil: 1, note: "Écrit à la main 🌱" });
});

test("design after the region that ends inside a code fence never closed: a save still writes (SPEC 0.17 section 8), where the records are, and the fence is untouched", () => {
	const unclosed = "\nAfter the records.\n\n```js\nconst open = true;\n";
	const text = BEFORE + REGION + unclosed;
	const next = core.setAnswer(text, "", "note", "Wet");
	assert.equal(tail(next), unclosed, "the open fence is kept as written");
	assert.deepEqual(answers(next), { soil: 1, note: "Wet" });
	assert.deepEqual(answers(core.setAnswer(next, "", "note", undefined)), { soil: 1 });
	// adding a region after a body that ends in such a fence may still be refused (nothing to read it back)
	assert.throws(() => core.setAnswer(BEFORE + "```js\nopen\n", "", "note", "x"), /code fence/);
});

test("the reader says once that there is design after the records, and that it stays where it is when an answer is saved", () => {
	const problems = core.parseBooklet(NOTE).problems.filter((p) => /after the records section/.test(p));
	assert.deepEqual(problems, ["There is text after the records section. It is read as design and stays where it is, after the records, when an answer is saved."]);
	assert.deepEqual(core.parseBooklet(BEFORE + REGION).problems.filter((p) => /after the records section/.test(p)), [], "a file with nothing after its region says nothing");
	// what is said is true: the design stays after the region on the next save
	assert.equal(tail(core.setAnswer(NOTE, "", "note", "x")), AFTER);
});

test("the linter reads a note with design after the region and a save of it the same way", { skip: !pythonAvailable() && "python3 or the linter is not here" }, () => {
	const next = core.setAnswer(core.setAnswer(NOTE, "", "water", 2), "", "note", "Heavy");
	const before = lint(NOTE, "design-after.booklet.md");
	const after = lint(next, "design-after.booklet.md");
	const errors = (r) => r.out.split("\n").filter((l) => /^ERROR/.test(l)).map((l) => l.replace(/^ERROR \S+: /, ""));
	assert.deepEqual(errors(after), errors(before), "a save added no error the note did not have");
});
