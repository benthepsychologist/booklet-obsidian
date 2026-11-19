/*
 * The Design view's form and the lines it rewrites (stage D, core): what a block's settings are (read from the model the side panel
 * already uses, not a list of its own), the one write each row makes (a block's opening line, and no other byte of the note), what is
 * refused with a reason and nothing written, and what is counted and asked about. Plain text in, text out; no DOM.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { core, bookletAround } from "./helpers.mjs";
import { HELD } from "./editor-fixture.mjs";
import { FULL, ALL, UNREAD, crlf, lineOf } from "./design-fixtures.mjs";

const { parseDesign, walkDesign, formOf, changeForm, changeLines, blockLines, settingsModel, parseLine, minimalChange, applyChange, needsAsking, whyUnchangeable, readerRefuses, setTitle } = core;

const nodeAt = (text, needle, kind) => {
	const start = lineOf(text, needle);
	const n = walkDesign(parseDesign(text)).find((x) => x.start === start && x.parent && (!kind || x.kind === kind));
	assert.ok(n, `no block at ${needle}`);
	return n;
};

/** The lines of two notes that differ (same number of lines, as a one-line change leaves). */
function differing(a, b) {
	const x = a.split("\n");
	const y = b.split("\n");
	assert.equal(x.length, y.length, "the same number of lines");
	return x.map((l, i) => (l === y[i] ? -1 : i)).filter((i) => i >= 0);
}

/** Whole-note byte check: only the node's first line differs; every byte before and after it is the same. */
function onlyTheOpeningLine(before, after, node) {
	assert.deepEqual(differing(before, after), [node.start], "only the opening line differs");
	const c = minimalChange(before, after);
	assert.ok(c, "something changed");
	const lineFrom = before.split("\n").slice(0, node.start).join("\n").length + (node.start ? 1 : 0);
	assert.ok(c.from >= lineFrom && c.to <= lineFrom + before.split("\n")[node.start].length, "the replaced bytes lie inside that line");
	assert.equal(applyChange(before, c), after);
}

/* ---------------------------------------------------------------- the rows come from the panel's settings model */

test("a block's form is its id, its title, then the switches and fields the settings model lists for its kind: nothing of its own", () => {
	let seen = 0;
	for (const [name, text] of Object.entries(ALL)) {
		const root = parseDesign(text);
		for (const n of walkDesign(root)) {
			const form = formOf(text, n);
			const first = n.parent ? (blockLines(text, n)[0] ?? "") : "";
			const parsed = parseLine(first);
			if (!form) {
				assert.ok(!parsed || whyUnchangeable(n), `${name}: ${n.kind} at ${n.start} has a Booklet line but no form`);
				continue;
			}
			seen++;
			const model = settingsModel(first);
			assert.deepEqual(
				form.fields.filter((f) => f.type === "flag").map((f) => [f.name, f.on]),
				model.flags.filter((f) => f.name !== "end").map((f) => [f.name, f.on]),
				`${name}: the switches of ${first}`,
			);
			assert.deepEqual(
				form.fields.filter((f) => f.type === "value").map((f) => [f.name, f.value]),
				model.values.map((v) => [v.name, v.value]),
				`${name}: the fields of ${first}`,
			);
			assert.equal(form.fields.some((f) => f.type === "id"), model.known && model.takesId, `${name}: an id row only where the kind takes one`);
			assert.equal(form.fields.find((f) => f.type === "title")?.value, parsed.title, `${name}: the title is the line's`);
			assert.deepEqual(form.stray, model.stray);
		}
	}
	assert.ok(seen > 40, `many blocks were checked (${seen})`);
});

test("the rows of the kinds the panel names: an activity, a question, a tab, a page, a number, a notice, a reading callout", () => {
	const rows = (needle, kind) => formOf(FULL, nodeAt(FULL, needle, kind)).fields.map((f) => (f.type === "flag" || f.type === "value" ? f.name : f.type));
	assert.deepEqual(rows("[!activity|spending"), ["id", "title", "repeat", "daily", "hidden", "icon", "status", "tab", "entries"]);
	assert.deepEqual(rows("[!text|spent]"), ["id", "title", "long", "each"]);
	assert.deepEqual(rows("[!tab|now]"), ["id", "title"]);
	assert.deepEqual(rows("[!page|map"), ["id", "title", "icon", "parent"]);
	assert.deepEqual(rows("[!number|n1]"), ["id", "title", "min", "max", "step", "each"]);
	assert.deepEqual(rows("[!choice|did]"), ["id", "title", "open", "menu", "each", "earlier"]);
	assert.deepEqual(rows("[!notice]"), ["title"], "a notice takes no id, no switch, no field: only the title every Booklet line has");
	assert.deepEqual(rows("[!tip] Start here"), ["title"], "a kind the linter does not know has a title and nothing else to set");
	// the switch that marks a closing line is not a row of an opening's form
	assert.deepEqual(rows("[!module|money] Money"), ["id", "title", "icon"]);
	assert.deepEqual(rows("[!row]"), ["title"]);
	// the numeric fields say so (the form types a number into them)
	const n = formOf(FULL, nodeAt(FULL, "[!number|n1]")).fields.filter((f) => f.type === "value");
	assert.deepEqual(n.map((f) => [f.name, f.numeric]), [["min", true], ["max", true], ["step", true], ["each", false]]);
	assert.equal(formOf(FULL, nodeAt(FULL, "[!activity|spending")).fields.find((f) => f.type === "value" && f.name === "icon").icon, true);
});

test("a block whose first line is not a Booklet line has no form: words, a page break, a code block, the front matter, the records; nor does the booklet", () => {
	const root = parseDesign(FULL);
	for (const kind of ["prose", "page-break", "fence", "front-matter", "records", "booklet"]) {
		const n = walkDesign(root).find((x) => x.kind === kind);
		assert.ok(n, kind);
		assert.equal(formOf(FULL, n), null, kind);
	}
});

/* ---------------------------------------------------------------- one row, one line */

test("a switch, a field, a title and an id each rewrite the block's opening line and no other byte of the note", () => {
	const cases = [
		["[!activity|spending", { what: "flag", name: "hidden", on: true }, "> [!activity|spending tab:now repeat hidden] Spending"],
		["[!activity|spending", { what: "flag", name: "repeat", on: false }, "> [!activity|spending tab:now] Spending"],
		["[!activity|spending", { what: "value", name: "icon", value: "book-open" }, "> [!activity|spending tab:now repeat icon:book-open] Spending"],
		["[!activity|spending", { what: "value", name: "tab", value: "" }, "> [!activity|spending repeat] Spending"],
		["[!activity|spending", { what: "title", value: "Money going out" }, "> [!activity|spending tab:now repeat] Money going out"],
		["[!activity|spending", { what: "id", value: "outgoings" }, "> [!activity|outgoings tab:now repeat] Spending"],
		["[!number|n1]", { what: "value", name: "min", value: "0" }, "> [!number|n1 min:0] How many?"],
		["[!text|spent]", { what: "flag", name: "long", on: true }, "> [!text|spent long] What did you spend?"],
		["[!tab|now]", { what: "title", value: "This week" }, "> [!tab|now] This week"],
		["[!tab|now]", { what: "title", value: "" }, "> [!tab|now]"],
		["[!tip] Start here", { what: "title", value: "Begin here" }, "> [!tip] Begin here"],
		["[!choice|did]", { what: "id", value: "did-it" }, "> [!choice|did-it] Did you?"],
	];
	for (const [needle, change, expected] of cases) {
		const n = nodeAt(FULL, needle);
		const op = changeForm(FULL, n, change);
		assert.ok(op.ok, `${needle}: ${op.reason}`);
		assert.equal(op.text.split("\n")[n.start], expected.replace(/^> /, n.parent.kind === "group" ? "> > " : "> "), needle);
		onlyTheOpeningLine(FULL, op.text, n);
	}
});

test("every other byte stays, whatever the line endings: a note in CRLF keeps every CR, a question inside a group keeps its marks, a note with no final newline stays without one", () => {
	const text = crlf(FULL);
	const n = nodeAt(text, "[!choice|did]");
	const op = changeForm(text, n, { what: "value", name: "each", value: "mood" });
	assert.ok(op.ok, op.reason);
	assert.equal(op.text.split("\n")[n.start], "> > [!choice|did each:mood] Did you?\r");
	assert.deepEqual(differing(text, op.text), [n.start]);
	assert.equal(op.text.split("\n").every((l, i, a) => i === a.length - 1 || l.endsWith("\r")), true);
	const bare = FULL.replace(/\n+$/, "");
	const last = nodeAt(bare, "[!number|n1]");
	const o2 = changeForm(bare, last, { what: "value", name: "max", value: "9" });
	assert.ok(o2.ok);
	assert.equal(o2.text.endsWith("\n"), false);
	onlyTheOpeningLine(bare, o2.text, last);
});

test("a change that leaves the line as it is changes nothing", () => {
	const n = nodeAt(FULL, "[!activity|spending");
	for (const c of [{ what: "id", value: "spending" }, { what: "title", value: "Spending" }, { what: "flag", name: "repeat", on: true }, { what: "value", name: "tab", value: "now" }]) {
		const op = changeForm(FULL, n, c);
		assert.ok(op.ok);
		assert.equal(op.change, null, JSON.stringify(c));
		assert.equal(op.text, FULL);
	}
});

test("a word the kind does not take can be removed from the line; nothing else changes", () => {
	const text = bookletAround("> [!activity|a] A\n\n> [!text|bad hidden mx:5] A setting the kind does not take\n");
	const n = nodeAt(text, "[!text|bad");
	const form = formOf(text, n);
	assert.deepEqual(form.stray.map((s) => s.text), ["hidden", "mx:5"]);
	const op = changeForm(text, n, { what: "stray", index: form.stray[0].index });
	assert.ok(op.ok, op.reason);
	assert.equal(op.text.split("\n")[n.start], "> [!text|bad mx:5] A setting the kind does not take");
	onlyTheOpeningLine(text, op.text, n);
});

/* ---------------------------------------------------------------- refused, with a reason, and nothing written */

test("a value the format cannot take is refused with a plain reason, and the result is not a change", () => {
	const act = nodeAt(FULL, "[!activity|spending");
	const bad = [
		[act, { what: "id", value: "two words" }, /letters, digits and dashes/],
		[act, { what: "id", value: "" }, /cannot be empty/],
		[act, { what: "id", value: "-leading" }, /starts with a letter or a digit/],
		[act, { what: "id", value: "why" }, /already used/],
		[act, { what: "value", name: "icon", value: "two words" }, /no spaces/],
		[act, { what: "value", name: "status", value: "a]b" }, /cannot hold `\]`/],
		[act, { what: "flag", name: "daily", on: true }, /already|needs `repeat`|^$/],
		[act, { what: "title", value: "one\ntwo" }, /one line/],
		[nodeAt(FULL, "[!tab|now]"), { what: "id", value: "learn" }, /already the id of another tab/],
	];
	for (const [n, change, why] of bad) {
		const op = changeForm(FULL, n, change);
		if (!op.ok) assert.match(op.reason, why, JSON.stringify(change));
		else assert.ok(change.what === "flag", `${JSON.stringify(change)} was not refused`); // `daily` is allowed when `repeat` is already on
	}
	const noRepeat = nodeAt(FULL, "[!activity|bare");
	const r = changeForm(FULL, noRepeat, { what: "flag", name: "daily", on: true });
	assert.equal(r.ok, false);
	assert.match(r.reason, /`daily` needs `repeat`/);
});

test("a change that would leave the reader unable to open a booklet it could open is refused; the reader's reason is in it", () => {
	// a second module named like the first: the reader refuses a booklet that uses a module id twice
	const text = bookletAround("> [!module|a] A\n\n> [!activity|one] One\n\n> [!module|a end]\n\n> [!module|b] B\n\n> [!activity|two] Two\n\n> [!module|b end]\n");
	assert.equal(readerRefuses(text), false);
	const mod = nodeAt(text, "[!module|b]");
	const op = changeForm(text, mod, { what: "id", value: "a" });
	assert.equal(op.ok, false);
	assert.match(op.reason, /already used/);
});

/* ---------------------------------------------------------------- an id that kept data hangs on is counted, never refused */

test("an id change that detaches kept entries, answers or rows carries the counts and asks; nothing is refused for it", () => {
	const act = nodeAt(HELD, "[!activity|log repeat]");
	const op = changeForm(HELD, act, { what: "id", value: "diary" });
	assert.ok(op.ok, op.reason);
	assert.ok(op.impact.length >= 1);
	assert.ok(op.impact.some((i) => i.entries === 12), "twelve kept entries");
	assert.equal(needsAsking(op), true);
	onlyTheOpeningLine(HELD, op.text, act);
	// a question whose answers are kept
	const q = nodeAt(HELD, "[!text|why]");
	const o2 = changeForm(HELD, q, { what: "id", value: "reason" });
	assert.ok(o2.ok);
	assert.equal(needsAsking(o2), true);
	// a title or an icon detaches nothing: no question
	const t = changeForm(HELD, act, { what: "title", value: "My mood log" });
	assert.ok(t.ok);
	assert.equal(needsAsking(t), false);
	// taking `repeat` off the activity that keeps entries is counted too
	const rep = changeForm(HELD, act, { what: "flag", name: "repeat", on: false });
	assert.ok(rep.ok);
	assert.equal(needsAsking(rep), true);
	assert.ok(rep.impact.some((i) => /keeps entries/.test(i.what) || /repeat/.test(i.what)));
});

test("on a booklet the reader already refuses, a change cannot be counted: the result says blind, and asks", () => {
	const refused = HELD.replace("> [!module|mood end]\n", "");
	const act = nodeAt(refused, "[!activity|log repeat]");
	const op = changeForm(refused, act, { what: "id", value: "diary" });
	assert.ok(op.ok, op.reason);
	assert.equal(op.blind, true);
	assert.equal(needsAsking(op), true);
});

/* ---------------------------------------------------------------- changeLines: only what differs is written */

test("changeLines keeps every line of the block that the new lines leave as it was, byte for byte: a trailing space, a bare `>`, a line ending of its own", () => {
	const text = bookletAround("> [!activity|a] A\n\n> [!text|q] First  \n> [!hint]- Help  \n> text   \n>\n> more\r\n\n> [!text|z] Z\n");
	const n = nodeAt(text, "[!text|q]");
	const lines = blockLines(text, n);
	assert.equal(lines.length, 5, JSON.stringify(lines));
	const op = changeLines(text, n, ["> [!text|q] Changed", ...lines.slice(1)]);
	assert.ok(op.ok, op.reason);
	assert.deepEqual(differing(text, op.text), [n.start], "one line differs");
	// the lines after the first are the bytes they were, trailing spaces and the carriage return of the last included
	assert.equal(op.text.split("\n").slice(n.start + 1).join("\n"), text.split("\n").slice(n.start + 1).join("\n"));
	assert.ok(op.text.includes("> more\r\n"));
	// a change in the middle keeps the lines around it
	const mid = changeLines(text, n, [lines[0], lines[1], "> text CHANGED", ...lines.slice(3)]);
	assert.ok(mid.ok);
	assert.deepEqual(differing(text, mid.text), [n.start + 2]);
	assert.equal(mid.text.split("\n")[n.start], "> [!text|q] First  ");
	// a change at the end keeps the lines before it, and a line added or taken out moves nothing else
	const longer = changeLines(text, n, [...lines, "> and another"]);
	assert.ok(longer.ok);
	assert.deepEqual(longer.text.split("\n").slice(n.start, n.start + 7), [...text.split("\n").slice(n.start, n.start + 5), "> and another", ""]);
	const shorter = changeLines(text, n, lines.slice(0, 3));
	assert.ok(shorter.ok);
	assert.equal(shorter.text.split("\n").length, text.split("\n").length - 2);
	assert.equal(shorter.text.split("\n")[n.start + 2], "> text   ");
});

test("changeLines says why when the note could be opened and cannot be after: `breaks` carries the reader's reason, and it still gives the text", () => {
	const act = nodeAt(HELD, "[!activity|once]");
	const dup = changeLines(HELD, act, ["> [!activity|log] Said once"]);
	assert.ok(dup.ok);
	assert.equal(typeof dup.breaks, "string");
	assert.match(dup.breaks, /used twice/);
	assert.equal(dup.readable, false);
	assert.equal(needsAsking(dup), true);
	assert.ok(dup.notes.some((x) => /cannot open the booklet/.test(x)));
	const fine = changeLines(HELD, act, ["> [!activity|once] Said it once"]);
	assert.ok(fine.ok);
	assert.equal(fine.breaks, undefined);
});

test("a block the view does not rewrite says so: the booklet, the records, the activity that is the whole note", () => {
	const root = parseDesign(FULL);
	assert.match(whyUnchangeable(root), /booklet itself/);
	assert.match(whyUnchangeable(walkDesign(root).find((n) => n.kind === "records")), /records section/);
	const implicit = bookletAround("Some words.\n\n> [!text|q1] A question\n");
	const act = walkDesign(parseDesign(implicit)).find((n) => n.kind === "activity" && n.implicit);
	assert.match(whyUnchangeable(act), /whole note/);
	assert.equal(whyUnchangeable(walkDesign(root).find((n) => n.kind === "question")), null);
	assert.equal(changeLines(FULL, root, ["x"]).ok, false);
});

/* ---------------------------------------------------------------- the title edit */

test("a title is changed where it stands: the fold marker and the spacing stay, a title that starts with + or - is not read as the fold, none gains one", () => {
	const t = (line, title) => setTitle(parseLine(line), title).text;
	assert.equal(t("> [!hint]- Think", "Start"), "> [!hint]- Start");
	assert.equal(t("> [!tab|x]   Wide", "Narrow"), "> [!tab|x]   Narrow");
	assert.equal(t("> [!tab|x]", "New"), "> [!tab|x] New");
	assert.equal(t("> [!tab|x] Old", ""), "> [!tab|x]");
	assert.equal(t("> [!tab|x]Old", "-dash"), "> [!tab|x] -dash");
	assert.equal(t("> [!tab|x]   ", "Title"), "> [!tab|x] Title");
	assert.deepEqual(setTitle(parseLine("> [!tab|x] A"), "a\nb"), { error: "A title is one line." });
});

/* ---------------------------------------------------------------- an unreadable note still has forms where the lines are Booklet lines */

test("a block drawn as written has no form (its Markdown is how it is edited); the lines it holds are not Booklet lines the view reads", () => {
	const root = parseDesign(UNREAD);
	const written = walkDesign(root).filter((x) => x.kind === "as-written");
	assert.ok(written.length >= 3, "the fixture has text the view cannot read");
	for (const n of written) {
		const first = blockLines(UNREAD, n)[0] ?? "";
		const form = formOf(UNREAD, n);
		// an as-written node whose first line is a Booklet line still has the form of that line: the view writes only that line
		assert.equal(form === null, parseLine(first) === null, `as-written at ${n.start}: ${first}`);
	}
});
