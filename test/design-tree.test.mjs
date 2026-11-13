/*
 * The Design view's tree: a note read into nested blocks, each with its start line, end line, parent and depth. The property every test
 * leans on: the own lines of all the nodes, in file order, give the note back byte for byte, for every fixture, every piece, every note
 * in the repository's folders and the notes the format repository's examples hold.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { core, EXAMPLES, ROOT } from "./helpers.mjs";
import { ALL, BARE, FULL, IMPLICIT, ONE_ACTIVITY, PAGES_ONLY, UNREAD, lineOf } from "./design-fixtures.mjs";

const { parseDesign, walkDesign, checkDesign, reassemble, designOutline, moduleTabOf, pageTree, ownRanges, scan, PIECES } = core;

const find = (root, pred) => walkDesign(root).find(pred);
const byId = (root, id) => find(root, (n) => n.id === id);
const lineCount = (t) => t.split("\n").length;

test("a note with every nesting level reads into its tree, each node with its lines", () => {
	assert.deepEqual(designOutline(parseDesign(FULL)), [
		"booklet - 0-92",
		"  front-matter - 0-8",
		"  prose - 8-10",
		"  callout:tip - 10-13",
		"  module money 13-73",
		"    prose - 15-17",
		"    notice - 17-20",
		"    module-tab now 20-24",
		"      prose - 22-24",
		"    module-tab learn 24-26",
		"    activity spending 26-36",
		"      prose - 29-31",
		"      question:text spent 31-36",
		"    activity why 36-71",
		"      activity-tab read 38-50",
		"        page map 40-48",
		"          prose - 42-44",
		"          page-break - 44-46",
		"          prose - 46-48",
		"        page choosing 48-50",
		"      activity-tab do 50-71",
		"        group - 52-59",
		"          prose - 53-55",
		"          question:choice did 55-58",
		"        row - 59-71",
		"          prose - 61-63",
		"          question:text left 63-65",
		"          prose - 65-67",
		"          prose - 67-69",
		"  activity bare 73-77",
		"    question:number n1 75-77",
		"  data-section money 77-84",
		"    fence rows 79-84",
		"  records - 84-92",
	]);
});

test("every node has its start, end, parent and depth, and its children fill it with no gap", () => {
	for (const [name, text] of Object.entries(ALL)) {
		const root = parseDesign(text);
		assert.equal(checkDesign(root, lineCount(text)), null, name);
		assert.equal(root.parent, null);
		assert.equal(root.depth, 0);
		for (const n of walkDesign(root)) {
			assert.ok(n.start <= n.headEnd && n.headEnd <= n.tailStart && n.tailStart <= n.end, `${name}: ${n.kind} at ${n.start} has its parts in order`);
			for (const c of n.children) {
				assert.equal(c.parent, n, `${name}: a child knows its parent`);
				assert.equal(c.depth, n.depth + 1, `${name}: depth is the parent's plus one`);
				assert.ok(c.start >= n.start && c.end <= n.end, `${name}: a child is inside its parent`);
			}
		}
	}
});

test("a node carries the id its line writes, or the one made from its title", () => {
	const root = parseDesign(FULL);
	const ids = (kind) => walkDesign(root).filter((n) => n.kind === kind).map((n) => n.id);
	assert.deepEqual(ids("module"), ["money"]);
	assert.deepEqual(ids("module-tab"), ["now", "learn"]);
	assert.deepEqual(ids("activity"), ["spending", "why", "bare"]);
	assert.deepEqual(ids("activity-tab"), ["read", "do"]);
	assert.deepEqual(ids("page"), ["map", "choosing"]); // `choosing` is made from the title
	assert.deepEqual(ids("question"), ["spent", "did", "left", "n1"]);
	assert.equal(find(root, (n) => n.kind === "fence").id, "rows"); // the `^rows` line after the fence
	assert.equal(find(root, (n) => n.kind === "data-section").id, "money");
	assert.equal(byId(root, "spending").set.tab, "now");
	assert.deepEqual(byId(root, "spending").flags, ["repeat"]);
	assert.equal(byId(root, "map").set.icon, "footprints");
	assert.equal(byId(root, "choosing").set.parent, "map");
});

test("a module owns its closing line as its tail; a group owns the blank lines after its body", () => {
	const root = parseDesign(FULL);
	const money = byId(root, "money");
	assert.equal(money.tailStart, lineOf(FULL, "[!module|money end]"));
	assert.equal(money.closed, true);
	assert.deepEqual(ownRanges(money), [[13, 15], [71, 73]]);
	const row = find(root, (n) => n.kind === "row");
	assert.equal(row.tailStart, lineOf(FULL, "[!row|end]"));
	const group = find(root, (n) => n.kind === "group");
	assert.equal(group.tailStart, lineOf(FULL, "> - [ ] No") + 1);
	assert.equal(group.end, group.tailStart + 1); // the one blank line after the group
});

test("the module's tabs sit in its opening; an activity joins one with tab:, none means the first", () => {
	const root = parseDesign(FULL);
	assert.equal(moduleTabOf(byId(root, "spending")).id, "now");
	assert.equal(moduleTabOf(byId(root, "why")).id, "learn");
	assert.equal(moduleTabOf(byId(root, "bare")), null); // a bare activity has no module
	const unnamed = parseDesign(FULL.replace(" tab:now", ""));
	assert.equal(moduleTabOf(byId(unnamed, "spending")).id, "now", "no tab: is the first tab");
	const wrong = parseDesign(FULL.replace("tab:learn", "tab:nope"));
	assert.equal(moduleTabOf(byId(wrong, "why")).id, "now", "a tab: that names no tab is the first (the linter reports it)");
	const solo = parseDesign(ONE_ACTIVITY);
	assert.equal(find(solo, (n) => n.kind === "module-tab").id, "only");
	assert.equal(solo.children[1].children.filter((c) => c.kind === "activity").length, 1);
});

test("a module with one activity, a bare activity, and a note that is one activity", () => {
	assert.deepEqual(designOutline(parseDesign(ONE_ACTIVITY)).slice(2), ["  module solo 8-18", "    module-tab only 10-12", "    activity a 12-16", "      question:text q 14-16"]);
	assert.deepEqual(designOutline(parseDesign(BARE)).slice(2), ["  activity one 8-12", "    question:text a 10-12", "  activity two 12-19", "    question:scale s 14-19"]);
	const one = parseDesign(IMPLICIT);
	const act = find(one, (n) => n.kind === "activity");
	assert.equal(act.implicit, true, "no activity line: the note is one activity");
	assert.equal(act.start, 8);
	assert.deepEqual(designOutline(one).slice(2), ["  activity - 8-18", "    prose - 8-10", "    question:text q1 10-12", "    activity-tab b 12-18", "      page p1 14-18", "        prose - 16-18"]);
});

test("pages stand side by side in the file; pageTree draws the tree by parent:", () => {
	const root = parseDesign(FULL);
	const shape = (entries) => entries.map((e) => [e.page ? e.page.id : null, shape(e.children)]);
	assert.deepEqual(shape(pageTree(byId(root, "read"))), [["map", [["choosing", []]]]], "a tab that opens on a page line has no first page of words");
	const wiki = parseDesign(PAGES_ONLY);
	assert.deepEqual(shape(pageTree(byId(wiki, "a"))), [[null, []], ["home", [["child", []]]]], "the words before the first page line are the first page");
	assert.deepEqual(byId(wiki, "child").parent.children.map((n) => n.id), [null, "home", "child"], "in the file the pages are siblings");
	assert.deepEqual(shape(pageTree(byId(root, "do"))), [[null, []]], "a tab with no page line is one page");
	const loop = parseDesign(PAGES_ONLY.replace("> [!page|home] Home", "> [!page|home parent:child] Home"));
	assert.deepEqual(shape(pageTree(byId(loop, "a"))).length, 3, "pages that are each other's parent are each drawn once, at the top, and never loop");
	const lost = parseDesign(PAGES_ONLY.replace("parent:home", "parent:gone"));
	assert.deepEqual(shape(pageTree(byId(lost, "a"))), [[null, []], ["home", []], ["child", []]], "a parent that is not there puts the page at the top");
});

test("a hint or solution straight under a question is the question's own lines", () => {
	const q = byId(parseDesign(FULL), "spent");
	assert.deepEqual(q.parts, ["hint"]);
	assert.equal(q.end, 36, "its range runs through the hint and the blank line after it");
	assert.equal(q.children.length, 0);
});

test("a group holds blocks, read with one > less; a question in it is the activity's", () => {
	const root = parseDesign(FULL);
	const g = find(root, (n) => n.kind === "group");
	assert.deepEqual(g.children.map((c) => c.kind), ["prose", "question"]);
	assert.equal(byId(root, "did").depth, g.depth + 1);
	assert.equal(byId(root, "did").detail, "choice");
	// a group inside a group
	const nested = FULL.replace("> > [!choice|did]", "> > [!group] Inner\n> > Words\n> >\n> > > [!choice|did]").replace("> - [ ] Yes\n> - [ ] No", "> > - [ ] Yes\n> > - [ ] No");
	const n = parseDesign(nested);
	assert.equal(checkDesign(n, lineCount(nested)), null);
	assert.equal(byId(n, "did").depth, find(n, (x) => x.kind === "group").depth + 2);
});

test("a row holds blocks and is closed by its own line", () => {
	const root = parseDesign(FULL);
	const row = find(root, (n) => n.kind === "row");
	assert.equal(row.parent.id, "do");
	assert.equal(row.closed, true);
	assert.ok(row.children.some((c) => c.id === "left"));
});

test("the records section is a node of its own and ends what is above it", () => {
	const root = parseDesign(FULL);
	const rec = find(root, (n) => n.kind === "records");
	assert.equal(rec.parent, root, "at the top, not inside the data section or the last activity");
	assert.equal(rec.closed, true, "a records section written in %% marks");
	assert.equal(rec.end, lineCount(FULL));
	const open = FULL.replace(/%%\n/g, "");
	const o = parseDesign(open);
	assert.equal(find(o, (n) => n.kind === "records").closed, false, "one with no closing mark runs to the end of the note");
});

test("text the view cannot read, or that stands where it does no work, is drawn as written, with the reason", () => {
	const root = parseDesign(UNREAD);
	const written = walkDesign(root).filter((n) => n.kind === "as-written").map((n) => [n.start, n.end]);
	assert.deepEqual(written, [[10, 12], [12, 14], [16, 19], [19, 21], [23, 25], [27, 30], [30, 32], [36, 38], [39, 40], [41, 43], [45, 47]]);
	const why = (line) => find(root, (n) => n.kind === "as-written" && n.start === line).detail;
	assert.match(why(10), /question belongs inside an activity, not before the file's first module/, "a question before any activity");
	assert.match(why(12), /tab line belongs inside an activity/, "a tab outside everything");
	assert.match(why(16), /question belongs inside an activity.*module's opening/, "Ben's ruling: a question in a module's opening is read as written");
	assert.match(why(19), /page line belongs inside an activity/, "a page in a module's opening");
	assert.match(why(23), /above an activity's first tab line/, "a page in an activity's opening");
	assert.match(why(27), /notice sits inside a module's fence before its first activity/, "a notice after the first activity");
	assert.match(why(30), /never closed/, "a row that never closes");
	assert.match(why(36), /starts `> \[!` but cannot be read/, "an unreadable Booklet line");
	assert.match(why(39), /group can hold no structure line/, "structure in a group");
	assert.match(why(41), /closed that was never opened/, "a row end with no row");
	assert.match(why(45), /module is closed that was never opened/, "a module closed twice");
	// what it carries is its lines, untouched
	assert.equal(find(root, (n) => n.kind === "as-written" && n.start === 16).label, "> [!choice|opening] A question in the module's opening");
});

test("a comment is not read: a Booklet-looking line inside it is no question", () => {
	const root = parseDesign(ALL.comment);
	assert.deepEqual(designOutline(root).slice(2), ["  activity a 8-18", "    comment - 10-16", "    question:text q 16-18"]);
});

test("every fixture comes back byte for byte from the own lines of its nodes", () => {
	for (const [name, text] of Object.entries(ALL)) {
		const root = parseDesign(text);
		assert.equal(reassemble(root, text), text, name);
	}
});

test("every piece, read on its own and in a note, comes back byte for byte", () => {
	assert.equal(PIECES.length, 56);
	for (const p of PIECES) {
		for (const lenient of [false, true]) {
			const root = parseDesign(p.text, { lenient });
			assert.equal(checkDesign(root, lineCount(p.text)), null, p.file);
			assert.equal(reassemble(root, p.text), p.text, p.file);
		}
		const text = FULL.replace("A second part.", "A second part.\n\n" + p.text.replace(/\n+$/, ""));
		assert.equal(reassemble(parseDesign(text), text), text, `${p.file} in a note`);
	}
});

/** Every `.md` under a folder. */
function notesIn(dir, out = []) {
	if (!existsSync(dir)) return out;
	for (const f of readdirSync(dir)) {
		if (f === "node_modules" || f === ".git" || f === ".build") continue;
		const p = join(dir, f);
		if (statSync(p).isDirectory()) notesIn(p, out);
		else if (f.endsWith(".md")) out.push(p);
	}
	return out;
}

test("every note in the repository's folders and the format's examples comes back byte for byte", () => {
	const files = [...notesIn(join(ROOT, "test-vault")), ...notesIn(join(ROOT, "test")), ...notesIn(EXAMPLES)];
	assert.ok(files.length >= 20, "the notes were found");
	for (const f of files) {
		const text = readFileSync(f, "utf8");
		const root = parseDesign(text);
		assert.equal(checkDesign(root, lineCount(text)), null, f);
		assert.equal(reassemble(root, text), text, f);
	}
});

test("a note with lines cut, doubled or truncated at random still comes back byte for byte", () => {
	let seed = 20261113;
	const rnd = (n) => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) % n);
	const sources = [FULL, UNREAD, IMPLICIT, PAGES_ONLY, ...notesIn(join(ROOT, "test-vault")).map((f) => readFileSync(f, "utf8"))];
	for (const text of sources) {
		const lines = text.split("\n");
		for (let k = 0; k < 30; k++) {
			const l = lines.slice();
			const a = rnd(l.length);
			const b = rnd(l.length);
			if (k % 3 === 0) l.splice(a, 1);
			else if (k % 3 === 1) l.splice(a, 0, l[b]);
			else l.length = Math.max(1, a);
			const t = l.join("\n");
			const root = parseDesign(t);
			assert.equal(checkDesign(root, lineCount(t)), null);
			assert.equal(reassemble(root, t), t);
		}
	}
});

test("a tree that does not fit its note is found out", () => {
	const root = parseDesign(FULL);
	assert.equal(checkDesign(root, lineCount(FULL) + 1) !== null, true);
	const broken = parseDesign(FULL);
	find(broken, (n) => n.id === "spending").end += 1;
	assert.notEqual(checkDesign(broken, lineCount(FULL)), null);
});

test("the scan hands over the lines as the reader reads them, the same numbering as the note", () => {
	const s = scan(FULL);
	assert.equal(s.read.length, s.lines.length);
	const at = lineOf(FULL, "> > [!choice|did]");
	assert.equal(s.lines[at], "> > [!choice|did] Did you?");
	assert.equal(s.read[at], "> [!choice|did] Did you?", "one > off inside a group");
	assert.equal(s.read[lineOf(FULL, "[!tab|do]")], s.lines[lineOf(FULL, "[!tab|do]")], "outside a group, as written");
});
