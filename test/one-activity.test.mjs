/*
 * A file with no activity line and no module line is one activity, named by the front matter title (SPEC 0.17 section 3): its prose, its
 * tab lines, its page lines and its questions are that activity's, and a one-page worksheet needs no structure at all. Every note is made up.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { click } from "./dom.mjs";
import { build, core, norm } from "./helpers.mjs";
import { pane } from "./pane.mjs";

const head = (extra = "") => `---\nbooklet: "0.19"\ntitle: A worksheet\nlang: en\n${extra}---\n`;
const WORKSHEET = `${head()}\nThe first words of the worksheet.\n\n> [!choice|mood] How is the day?\n- [ ] Calm\n- [ ] Busy\n\n> [!text|why] Why?\n`;
const PAGES = `${head()}\nThe tab's words, which are its first page.\n\n> [!page|map icon:footprints] The garden map\n\nWhere each bed is.\n\n> [!page|parent:map] Choosing a place\n\nPick one.\n\n> [!page] Thoughts as headlines\n\n> [!text|t] What do you think?\n`;

test("a file with no activity line is one activity named by the title: its prose and its questions are its own, and nothing says a question belongs to no activity", () => {
	const { book, nav } = build(WORKSHEET);
	assert.deepEqual(norm(book.activities.map((a) => [a.id, a.title, a.scope, a.repeat])), [["", "A worksheet", "", false]]);
	assert.deepEqual(norm(book.activities[0].segments.map((s) => s.type === "question" ? s.id : s.type)), ["prose", "mood", "why"]);
	assert.deepEqual(norm(book.problems), []);
	assert.deepEqual(norm(book.openings), [], "the activity's prose is not an opening");
	assert.deepEqual(norm(core.startPlace(nav)), { screen: "activity:/", tab: null, part: 0 }, "a booklet of one activity opens straight into it");
});

test("page lines in a file with no activity line are the activity's pages, and tab lines its tabs", () => {
	const { book, nav } = build(PAGES);
	assert.deepEqual(norm(book.problems), []);
	const a = nav.byKey.get("/");
	assert.deepEqual(norm(a.tabs[0].tree.map((p) => [p.id, p.named, p.title, p.parent?.id ?? null])), [
		["", false, "A worksheet", null],
		["map", true, "The garden map", null],
		["choosing-a-place", true, "Choosing a place", "map"],
		["thoughts-as-headlines", true, "Thoughts as headlines", null],
	]);
	const tabs = build(`${head()}\nAbove every tab.\n\n> [!tab] One\n\nFirst.\n\n> [!tab] Two\n\n> [!page|p] A page of tab two\n\nWords.\n`);
	assert.deepEqual(norm(tabs.book.problems), []);
	assert.deepEqual(norm(tabs.nav.byKey.get("/").tabs.map((t) => [t.id, t.tree.map((p) => p.id)])), [["one", [""]], ["two", ["p"]]]);
});

test("it needs neither an activity nor a module line, and only then: a file with either keeps its own structure, and a body of nothing draws nothing", () => {
	assert.equal(core.parseBooklet(`${head()}\n> [!activity|a] A\n\nWords.\n`).activities.length, 1);
	assert.deepEqual(norm(core.parseBooklet(`${head()}\n> [!activity|a] A\n\nWords.\n`).activities.map((a) => a.id)), ["a"], "no second, made-up activity");
	// a module line alone is a file with structure, however few activities it has
	assert.equal(core.parseBooklet(`${head()}\n> [!module|m] M\n\n> [!module|m end]\n`).activities.length, 0);
	// a line that looks like one inside a code fence is words, so the file has none
	const fenced = core.parseBooklet(`${head()}\nExample:\n\n\`\`\`\n> [!activity|a] A\n\`\`\`\n`);
	assert.equal(fenced.activities.length, 1);
	assert.equal(fenced.activities[0].id, "");
	// nothing in the body (or only records): nothing to draw
	assert.equal(core.parseBooklet(head()).activities.length, 0);
	assert.equal(core.parseBooklet(`${head()}\n`).activities.length, 0);
	const withRecords = `${head()}\n%%\n${core.RECORDS_HEADER}\n\n\`\`\`booklet answers\n{"x": 1}\n\`\`\`\n%%\n`;
	assert.equal(core.parseBooklet(withRecords).activities.length, 0);
});

test("an answer to a question of such a file is kept under the bare activities' records, and is read back", () => {
	const answered = core.setAnswer(WORKSHEET, "", "mood", 2);
	assert.deepEqual(norm(core.parseBooklet(answered).records.answers[""]), { mood: 2 });
	assert.ok(answered.startsWith(WORKSHEET), "the worksheet's own words are untouched");
	const more = core.setAnswer(answered, "", "why", "A long list of jobs");
	assert.deepEqual(norm(core.parseBooklet(more).records.answers[""]), { mood: 2, why: "A long list of jobs" });
});

test("the view draws it: the activity's screen with its title, its questions, and the page tree's pager; a press writes the answer", async () => {
	const p = pane(WORKSHEET);
	await p.settled();
	assert.equal(p.screen, "activity:/");
	assert.equal(p.title(), "A worksheet");
	assert.equal(p.all(".booklet-question").length, 2);
	const calm = p.all("button.booklet-choice").find((b) => b.textContent.includes("Calm"));
	click(calm);
	await p.settled();
	assert.deepEqual(norm(core.parseBooklet(p.disk.text).records.answers[""]), { mood: 1 });
	assert.ok(p.disk.text.startsWith(WORKSHEET));
	p.close();
	const q = pane(PAGES);
	await q.settled();
	assert.equal(q.screen, "activity:/");
	assert.deepEqual(q.pager().buttons, ["Back to the overview", "Next: The garden map"]);
	await q.pageNext();
	assert.deepEqual(q.pageTitles(), ["The garden map"]);
	assert.deepEqual(q.cards(), ["1.Choosing a place"]);
	q.close();
	const empty = pane(head());
	await empty.settled();
	assert.match(empty.el.textContent, /This note has nothing to draw\./);
	empty.close();
});
