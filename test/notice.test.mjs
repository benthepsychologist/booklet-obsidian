/*
 * The notice at the top of a note that holds something this view does not read (plugin 0.11.0; quieter in 1.0.0): a kind of line, a
 * setting, a query key or a block that is not read. A note's 0.x marker alone, earlier or later, makes no notice. Each case is a made-up note. The notice names each part by its line in the file (front matter
 * counted) and what is written there, says which version of the plugin is reading and which format it reads, and says how to update when
 * a newer plugin might read what is left out. The rest of the note still draws and still takes answers, and what is not read stays in the
 * file exactly as written.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { openView, click, typeInto } from "./dom.mjs";
import { core, corpusFiles, read } from "./helpers.mjs";

const PLUGIN = "0.11.0";
const UPDATE = "To update: Settings, Community plugins, Check for updates.";
const IS_PLUGIN = "This is Booklet plugin 0.11.0, which reads format 0.19.";

const front = (marker = "0.19") => `---\nbooklet: "${marker}"\nid: made/up\ntitle: Made up\nlang: en\n---\n`;
/** A note: its front matter is six lines, a blank line follows, and the body starts on line 8. */
const note = (body, marker = "0.19") => `${front(marker)}\n${body}`;
const BASE = "> [!activity|a] A\n\n> [!text|t] T\n";
/** The line (counting from 1, front matter included) of the first line of the file that holds `needle`. */
const lineOf = (text, needle) => text.split(/\r?\n/).findIndex((l) => l.includes(needle)) + 1;
const noticeOf = (text) => core.openingNotice(core.parseBooklet(text), PLUGIN);

test("the notice's counting: the front matter is six lines, so the body starts on line 8", () => {
	const t = note(BASE);
	assert.equal(lineOf(t, "[!activity"), 8);
	assert.equal(lineOf(t, "[!text"), 10);
});

test("a marker alone makes no notice: 0.9, 0.17, 0.18, 0.20 and 0.99 with nothing unread open quietly, and the note still reads", () => {
	for (const m of ["0.1", "0.9", "0.16", "0.17", "0.18", "0.19", "0.20", "0.99", "0.100"]) {
		const t = note(BASE, m);
		const b = core.parseBooklet(t);
		assert.equal(b.ok, true, m);
		assert.equal(b.activities[0].segments.filter((s) => s.type === "question").length, 1, `${m}: its question is read`);
		assert.equal(noticeOf(t), null, `${m}: no notice`);
	}
	// a marker that is not a 0.x version is not a note this view opens
	assert.equal(core.parseBooklet(note(BASE, "1.0")).ok, false);
});

test("a note of another 0.x marker with one unread line: the notice names that line, the plugin and its format, and says nothing of the marker", () => {
	for (const m of ["0.9", "0.99"]) {
		const t = note(`${BASE}\n> [!lesson|intro] The lesson\n> Some words.\n`, m);
		const n = noticeOf(t);
		assert.deepEqual(n?.entries, [`Line 12: > [!lesson|intro] The lesson ("lesson" is not a kind this view reads, so it is drawn as "not yet supported")`], m);
		assert.equal(n?.count, 1, `${m}: the marker is not counted`);
		assert.ok(n?.paragraphs.every((p) => !/This file says booklet|is newer than the format/.test(p)), `${m}: no marker sentence: ${JSON.stringify(n?.paragraphs)}`);
		assert.equal(n?.paragraphs[0], IS_PLUGIN, m);
	}
	// an earlier marker adds no update line of its own to a mistake; a later one keeps it (a newer plugin may read what a later format wrote)
	const early = noticeOf(note("> [!activity|a] A\n\n> [!number|n mx:5] N\n", "0.9"));
	assert.deepEqual(early?.paragraphs, [IS_PLUGIN, "This view does not read this part of the note. It stays in the file exactly as written, and the rest of the note works as usual:"]);
	const late = noticeOf(note("> [!activity|a] A\n\n> [!number|n mx:5] N\n", "0.99"));
	assert.equal(late?.paragraphs.at(-1), `A newer version of the plugin may read this note. ${UPDATE}`);
});

test("a kind of line this view does not read: its line, its words, and how to update", () => {
	const t = note(`${BASE}\n> [!lesson|intro] The lesson\n> Some words.\n`);
	const want = lineOf(t, "[!lesson");
	assert.equal(want, 12);
	assert.deepEqual(noticeOf(t), {
		paragraphs: [
			IS_PLUGIN,
			"This view does not read this part of the note. It stays in the file exactly as written, and the rest of the note works as usual:",
			`A newer version of the plugin may read this. ${UPDATE}`,
		],
		entries: [`Line 12: > [!lesson|intro] The lesson ("lesson" is not a kind this view reads, so it is drawn as "not yet supported")`],
		entriesAfter: 1,
		count: 1,
	});
	// a line of an unknown kind with no words after its bar is drawn as the callout it looks like
	const bare = noticeOf(note(`${BASE}\n> [!lesson] The lesson\n`));
	assert.deepEqual(bare?.entries, [`Line 12: > [!lesson] The lesson ("lesson" is not a kind this view reads, so it is drawn as an ordinary callout)`]);
	// the same before the first activity, listed once, with the activity line that follows it not listed
	const first = noticeOf(note("> [!lesson|l1] Intro\n\n> [!activity|a] A\n\n> [!text|t] T\n"));
	assert.deepEqual(first?.entries, [`Line 8: > [!lesson|l1] Intro ("lesson" is not a kind this view reads, so it is drawn as "not yet supported")`]);
	assert.equal(first?.count, 1);
	// Obsidian's own callouts and the format's own kinds are read
	assert.equal(noticeOf(note(`${BASE}\n> [!tip] A tip\n\n> [!warning] A warning\n\n> [!hint]- A hint\n> Words.\n`)), null);
});

test("a setting a known kind does not take: a name nobody has might be a newer plugin's; a mistyped one is for the author", () => {
	// `shiny:` is no setting of any kind: a newer plugin might read it
	const shiny = noticeOf(note("> [!activity|a] A\n\n> [!text|t shiny:1] T\n"));
	assert.deepEqual(shiny?.entries, ["Line 10: > [!text|t shiny:1] T (a text line takes no `shiny:` setting)"]);
	assert.equal(shiny?.paragraphs.at(-1), `A newer version of the plugin may read this. ${UPDATE}`);
	// `mx:` is `max:` mistyped, `lng` is `long`, and `hidden` is a setting of another kind: each is a mistake, so no update is suggested
	for (const [line, entry] of [
		["> [!number|n mx:5] N", "Line 10: > [!number|n mx:5] N (a number line takes no `mx:` setting)"],
		["> [!text|t lng] T", "Line 10: > [!text|t lng] T (a text line takes no `lng` setting)"],
		["> [!text|t hidden] T", "Line 10: > [!text|t hidden] T (a text line takes no `hidden` setting)"],
	]) {
		const n = noticeOf(note(`> [!activity|a] A\n\n${line}\n`));
		assert.deepEqual(n?.entries, [entry]);
		assert.ok(!n?.paragraphs.some((p) => p.includes(UPDATE)), `${line}: no update hint for a mistake`);
		assert.deepEqual(n?.paragraphs, [IS_PLUGIN, "This view does not read this part of the note. It stays in the file exactly as written, and the rest of the note works as usual:"]);
	}
});

test("a query key this view does not read: the line of the key itself", () => {
	const q = (keys) => note(`> [!activity|a repeat] A\n\n> [!text|t] T\n\n\`\`\`booklet query\nfrom: a\n${keys}\n\`\`\`\n`);
	const t = q("shading: soft\nas: list");
	assert.equal(lineOf(t, "shading"), 14, "the fence is on line 12 and `from:` on 13");
	const n = noticeOf(t);
	assert.deepEqual(n?.entries, ['Line 14: shading: soft (a query has no setting "shading", so it was ignored)']);
	assert.equal(n?.paragraphs.at(-1), `A newer version of the plugin may read this. ${UPDATE}`);
	// a mistyped key (`lmit` for `limit`) is a mistake
	const typo = noticeOf(q("lmit: 3"));
	assert.deepEqual(typo?.entries, ['Line 14: lmit: 3 (a query has no setting "lmit", so it was ignored)']);
	assert.ok(!typo?.paragraphs.some((p) => p.includes(UPDATE)));
	// a value this view cannot use is for the author: it stays among the other problems
	const bad = core.parseBooklet(q("limit: week"));
	assert.deepEqual(bad.unread, []);
	assert.ok(bad.problems.some((p) => /`limit: week` is not a positive whole number/.test(p)));
});

test("a value the format does not allow for start, icon, status and tab: listed once at its line, and the allowed values list nothing", () => {
	const why = (text) => core.parseBooklet(text).unread.map((u) => [u.line, u.text, u.why, u.newer]);
	// `start:` takes `home` only
	const started = (value) => `---\nbooklet: "0.19"\nid: made/up\ntitle: Made up\nlang: en\nstart: ${value}\n---\n\n${BASE}`;
	assert.deepEqual(why(started("later")), [[6, "start: later", "`start:` takes only the value `home`, so it was ignored", false]]);
	assert.deepEqual(why(started("home")), []);
	// `icon:` on a module, an activity and a page: a name outside the set is listed; a near miss is a mistake, any other might be a later name
	const iconNote = note("> [!module|m icon:nowhere] M\n\n> [!activity|a icon:compas] A\n\n> [!page|p icon:compass] Fine\n\n> [!page|q icon:qqqqqqq] Odd\n\n> [!module|m end]\n");
	assert.deepEqual(why(iconNote), [
		[8, "> [!module|m icon:nowhere] M", "`icon:nowhere` names no icon in Booklet's set, so it was ignored", true],
		[10, "> [!activity|a icon:compas] A", "`icon:compas` names no icon in Booklet's set, so it was ignored", false],
		[14, "> [!page|q icon:qqqqqqq] Odd", "`icon:qqqqqqq` names no icon in Booklet's set, so it was ignored", true],
	]);
	assert.deepEqual(why(note("> [!activity|a icon:compass] A\n")), []);
	// `status:` takes `off` only, written in either case
	assert.deepEqual(why(note("> [!activity|a status:on] A\n")), [[8, "> [!activity|a status:on] A", "`status:` takes only the value `off`, so `status:on` was ignored", false]]);
	assert.deepEqual(why(note("> [!activity|a status:off] A\n\n> [!activity|b status:OFF] B\n")), []);
	// `tab:` names a tab of the activity's module, as written or as made from the tab's name
	const tabs = (a) => note(`> [!module|m] M\n\n> [!tab] Plan the week\n\n> [!tab|doing] Do it\n\n> [!activity|a ${a}] A\n\n> [!activity|b tab:plan-the-week] B\n\n> [!activity|c tab:doing] C\n\n> [!module|m end]\n`);
	assert.deepEqual(why(tabs("tab:nowhere")), [[14, "> [!activity|a tab:nowhere] A", "`tab:nowhere` names no tab of its module, so it was ignored", false]]);
	assert.deepEqual(why(tabs("")), []);
	// a module with no tabs, and an activity outside every module, have no tab to name
	assert.equal(why(note("> [!module|m] M\n\n> [!activity|a tab:x] A\n\n> [!module|m end]\n")).length, 1);
	assert.equal(why(note("> [!activity|a tab:x] A\n")).length, 1);
	// the notice lists the entry once, at its line
	assert.deepEqual(noticeOf(note("> [!activity|a status:on] A\n"))?.entries, ["Line 8: > [!activity|a status:on] A (`status:` takes only the value `off`, so `status:on` was ignored)"]);
});

test("a block this view does not define: its line, drawn as not yet supported where it stands, kept as written", () => {
	const t = note(`${BASE}\n\`\`\`booklet bookmarks\n{ "pages": [1, 2] }\n\`\`\`\n`);
	const b = core.parseBooklet(t);
	assert.deepEqual(
		b.unread.map((u) => [u.line, u.text, u.newer]),
		[[12, "```booklet bookmarks", true]],
	);
	assert.equal(b.unread[0].why, '"booklet bookmarks" is not a block this view reads, so it is drawn as "not yet supported"');
	assert.deepEqual(b.activities[0].segments.filter((s) => s.type === "unsupported").map((s) => [s.kind, s.block]), [["booklet bookmarks", true]]);
	// the three blocks it does define are read, and a code block that is not a booklet block is prose
	const known = note(`${BASE}\n\`\`\`js\nlet x;\n\`\`\`\n\n\`\`\`booklet widget\n{}\n\`\`\`\n^w\n`);
	assert.deepEqual(core.parseBooklet(known).unread, []);
});

test("several at once, in file order, with a later marker; a long line is cut; a file with Windows line endings counts the same lines", () => {
	const long = "> [!text|t shiny:1] " + "A very long question that goes on and on ".repeat(5);
	const body = `> [!activity|a] A\n\n${long}\n\n> [!lesson|x] L\n\n> [!group]\n> > [!number|n mx:5] N\n\n\`\`\`booklet bookmarks\n{}\n\`\`\`\n`;
	for (const eol of ["\n", "\r\n"]) {
		const t = note(body, "0.20").replace(/\n/g, eol);
		const n = noticeOf(t);
		assert.deepEqual(
			n?.entries.map((e) => e.slice(0, e.indexOf(":"))),
			["Line 10", "Line 12", "Line 15", "Line 17"],
			`${JSON.stringify(eol)}: the lines, counting the front matter`,
		);
		assert.equal(lineOf(t, "[!lesson"), 12);
		assert.equal(lineOf(t, "mx:5"), 15);
		assert.equal(lineOf(t, "booklet bookmarks"), 17);
		assert.ok(n?.entries[0]?.startsWith("Line 10: > [!text|t shiny:1] A very long question that goes on and on A very"), n?.entries[0]);
		assert.ok(/…\s\(/.test(n?.entries[0] ?? ""), "a long line is cut with an ellipsis before the reason");
		assert.ok(n.entries.every((e) => !e.includes("\r")), "no carriage return in the notice");
		assert.equal(n.count, 4, "the four parts; the marker is not counted");
		assert.equal(n.paragraphs.at(-1), `A newer version of the plugin may read this note. ${UPDATE}`);
		assert.equal(n.paragraphs[1], "This view does not read these 4 parts of the note. They stay in the file exactly as written, and the rest of the note works as usual:");
		assert.equal(n.entriesAfter, 1);
	}
	// a mistake among others: the hint says "some of these"
	const mixed = noticeOf(note("> [!activity|a] A\n\n> [!lesson|x] L\n\n> [!number|n mx:5] N\n"));
	assert.equal(mixed?.paragraphs.at(-1), `A newer version of the plugin may read some of these. ${UPDATE}`);
});

test("the view lists the notice first, with the plugin's own version from its manifest, and counts what it says", async () => {
	const t = note(`${BASE}\n> [!lesson|x] The lesson\n\n> [!text|u hidden] U\n`, "0.20");
	const v = openView(t, { path: "Made up.booklet.md" });
	await v.settled();
	const root = v.view.contentEl;
	const box = root.querySelector(".booklet-problems");
	assert.ok(box, "the problems list is drawn");
	assert.equal(box.querySelector("summary").textContent, "2 things in this note could not be read", "the two parts");
	const first = box.querySelector("ul > li");
	assert.ok(first.classList.contains("booklet-notice"), "the notice is the first item");
	assert.deepEqual([...first.querySelectorAll(":scope > p")].map((p) => p.textContent), [
		"This is Booklet plugin 9.8.7, which reads format 0.19.",
		"This view does not read these 2 parts of the note. They stay in the file exactly as written, and the rest of the note works as usual:",
		`A newer version of the plugin may read this note. ${UPDATE}`,
	]);
	assert.deepEqual([...first.querySelectorAll(":scope > ul > li")].map((l) => l.textContent), [
		'Line 12: > [!lesson|x] The lesson ("lesson" is not a kind this view reads, so it is drawn as "not yet supported")',
		"Line 14: > [!text|u hidden] U (a text line takes no `hidden` setting)",
	]);
	v.close();
	// a note this view reads fully has no list at all
	const clean = openView(note(BASE), { path: "Made up.booklet.md" });
	await clean.settled();
	assert.equal(clean.view.contentEl.querySelector(".booklet-problems"), null);
	clean.close();
});

test("the rest of the note still draws and takes answers; what is not read is byte for byte as written after a save", async () => {
	const odd = [
		"> [!lesson|x] The lesson  with  odd   spacing\t",
		"> keep this line, trailing space ",
		"",
		"```booklet bookmarks",
		'{ "pages": [1,2] }',
		"```",
		"",
		"> [!text|u hidden shiny:1] Another",
	];
	const t = note(`> [!activity|a] A\n\n> [!choice|c] Pick\n- [ ] One\n- [ ] Two\n\n> [!text|t] Say\n\n${odd.join("\n")}\n`, "0.20");
	const v = openView(t, { path: "Made up.booklet.md" });
	await v.settled();
	const root = v.view.contentEl;
	assert.ok(root.querySelector(".booklet-problems"), "the notice is there");
	// the unsupported kind and block are drawn as such, in place
	const said = [...root.querySelectorAll(".booklet-unsupported .booklet-muted")].map((e) => e.textContent);
	assert.deepEqual(said, ['Not yet supported: the kind "lesson".', 'Not yet supported: the block "booklet bookmarks".']);
	// an answer is taken: a press on an option and typing in the field
	const open = root.querySelector("[data-booklet-activity]") ?? root;
	const option = [...open.querySelectorAll("button")].find((b) => b.textContent.trim() === "Two");
	assert.ok(option, "the choice is drawn");
	click(option);
	await v.settled();
	const field = open.querySelector("textarea, input[type=text]");
	typeInto(field, "Hello there");
	field.blur();
	await v.settled(800);
	const after = v.disk.text;
	assert.ok(v.disk.writes >= 2, "two answers were written");
	const book = core.parseBooklet(after);
	assert.equal(JSON.stringify(book.records.answers[""]), JSON.stringify({ c: 2, t: "Hello there" }));
	// what is above the records is the note as it was, byte for byte, including the lines this view does not read
	const design = core.designText(after).replace(/\s+$/, "");
	assert.equal(design, core.designText(t).replace(/\s+$/, ""), "the design is unchanged");
	for (const line of odd) assert.ok(after.includes(line + "\n") || after.endsWith(line), `kept as written: ${JSON.stringify(line)}`);
	assert.ok(after.startsWith(front("0.20")), "the marker is the one the file came with");
	// and the notice is still there with the same entries after the redraw
	assert.equal(root.querySelector(".booklet-problems summary").textContent, "4 things in this note could not be read", "the lesson, the block and the two settings");
	v.close();
});

test("no note of the corpus or the test vault holds anything this view does not read, and none says anything of its marker", () => {
	for (const file of corpusFiles()) {
		const b = core.parseBooklet(read(file));
		// an activity line takes no `parent:` setting in format 0.18 (a note that still uses it is listed for that); a theme block
		// is a block the format defines and this view does not read yet (README: "themes")
		const left = b.unread.filter((u) => !/an activity line takes no `parent:` setting/.test(u.why) && u.text !== "```booklet theme");
		assert.deepEqual(left, [], file);
		assert.equal(core.openingNotice({ ...b, unread: left }, PLUGIN), null, file);
	}
});

test("a line shown in the notice is cut on a character boundary: an emoji at the cut is whole or gone, never half", () => {
	const lone = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;
	const cut = core.shortLine(`${"a".repeat(78)}😀 and more words after it`);
	assert.equal(cut, `${"a".repeat(78)}😀…`);
	assert.ok(!lone.test(cut), "no half of a pair");
	assert.equal(core.shortLine(`${"a".repeat(79)}😀 and more`), `${"a".repeat(79)}…`);
	assert.equal(core.shortLine("short  line "), "short line");
	assert.equal(core.shortLine("😀".repeat(80)), "😀".repeat(80), "eighty characters of two units each are not cut");
});
