/*
 * The navigation model (src/core/nav.ts): what a booklet opens on, the cards and their words, tabs and pages, the order
 * Next follows, where a heading link leads, and how a saved place is read back. Every note here is made up.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { SKETCH, core, norm } from "./helpers.mjs";

const head = (extra = "") => `---\nbooklet: "0.16"\ntitle: Learning to sketch\n${extra}---\n`;
const build = (text) => {
	const book = core.parseBooklet(text);
	return { book, nav: core.buildNav(book, text) };
};
const act = (nav, key) => nav.byKey.get(key);

/* ---- where a booklet opens (SPEC section 2, `start`) ---- */

test("start: one activity opens into it; one module with several activities opens on its screen; anything else opens on home", () => {
	const start = (text) => core.startPlace(build(text).nav);
	assert.equal(start(`${head()}\n> [!activity|only] Only one\n`).screen, "activity:/only");
	assert.equal(start(`${head()}\n> [!module|m] M\n\n> [!activity|a] A\n\n> [!activity|b] B\n\n> [!module|m end] End\n`).screen, "module:m");
	// a module of one activity is that activity
	assert.equal(start(`${head()}\n> [!module|m] M\n\n> [!activity|a] A\n\n> [!module|m end] End\n`).screen, "activity:m/a");
	// a module of several and a bare activity: two things to choose from
	assert.equal(start(`${head()}\n> [!activity|bare] Bare\n\n> [!module|m] M\n\n> [!activity|a] A\n\n> [!activity|b] B\n\n> [!module|m end] End\n`).screen, "home");
	assert.equal(start(`${head()}\n> [!activity|a] A\n\n> [!activity|b] B\n`).screen, "home");
	// two modules
	assert.equal(start(`${head()}\n> [!module|m] M\n\n> [!activity|a] A\n\n> [!module|m end] E\n\n> [!module|n] N\n\n> [!activity|b] B\n\n> [!module|n end] E\n`).screen, "home");
});

test("start: `start: home` keeps home; only activities that are offered count, hidden ones do not", () => {
	const note = (extra, body) => `${head(extra)}\n${body}`;
	const one = "> [!activity|only] Only one\n";
	assert.equal(core.startPlace(build(note("start: home\n", one)).nav).screen, "home");
	// an unknown value is ignored
	assert.equal(core.startPlace(build(note("start: nowhere\n", one)).nav).screen, "activity:/only");
	// one offered activity and one hidden: it opens into the offered one
	assert.equal(core.startPlace(build(note("", `${one}\n> [!activity|secret hidden] Hidden\n`)).nav).screen, "activity:/only");
	// a module of two with one of them hidden is a module of one activity
	const m = "> [!module|m] M\n\n> [!activity|a] A\n\n> [!activity|b hidden] B\n\n> [!module|m end] E\n";
	assert.equal(core.startPlace(build(note("", m)).nav).screen, "activity:m/a");
	assert.equal(core.hasScreen(build(note("", m)).nav.mods[0]), false);
});

/* ---- the made-up sampler ---- */

test("the sampler: one card for each module and each bare activity, in file order, a module of several activities with a screen", () => {
	const { nav } = build(SKETCH);
	assert.equal(core.startPlace(nav).screen, "home");
	assert.deepEqual(
		nav.cards.map((c) => (c.kind === "module" ? `module:${c.mod.id}` : `activity:${c.act.key}`)),
		["activity:/warm-up", "module:basics", "module:journal"],
	);
	const basics = nav.mods.find((m) => m.id === "basics");
	assert.deepEqual(norm(basics.tabs.map((t) => t.id)), ["practice", "read"]);
	assert.equal(basics.icon, "shapes");
	assert.equal(basics.blurb, "Lines, boxes and light, one at a time, at your own pace.");
	// its reading order: a parent, then its children, then the next sibling
	assert.deepEqual(norm(basics.order.map((a) => `${a.number}.${a.act.id}`)), ["1.lines", "2.shapes", "3.light", "4.shadow", "5.reflected"]);
	assert.deepEqual(norm(basics.top.map((a) => a.act.id)), ["lines", "shapes", "light"]);
});

test("a card's parts: the picture is the line's icon, else a leading emoji; the blurb is the first paragraph; the status is the file's lines or the worked-out words; status:off hides it", () => {
	const { book, nav } = build(SKETCH);
	const lines = act(nav, "basics/lines");
	assert.equal(lines.icon, "ruler");
	assert.equal(lines.blurb, "A line drawn fast comes out straighter than a line drawn slowly.");
	assert.deepEqual(norm(core.activityStatus(lines, book)), { text: "3 pages · about 10 minutes", md: true });
	// no lines under the activity line: worked out from what it holds
	assert.deepEqual(norm(core.activityStatus(act(nav, "basics/shapes"), book)), { text: "2 questions · Not started", md: false });
	// nothing to count: nothing
	assert.deepEqual(norm(core.activityStatus(act(nav, "basics/light"), book)), { text: "", md: false });
	assert.deepEqual(norm(core.activityStatus(act(nav, "basics/reflected"), book)), { text: "", md: false });
	const studies = act(nav, "journal/studies");
	assert.equal(studies.emoji, "🌳");
	assert.equal(studies.title, "Seven studies");
	assert.equal(act(nav, "basics/reflected").statusOff, true);
	assert.equal(core.moduleStatus(nav.mods.find((m) => m.id === "basics"), book), "Not started");
	assert.equal(core.moduleMeta(nav.mods.find((m) => m.id === "journal"), book), "2 activities");
});

test("status words follow the reference renderer: reads, questions, answered of, done, entries kept; a module counts what is started", () => {
	let text = `${head()}\n> [!module|m] M\n\n> [!activity|a] A\n\n> [!note]- A hint of a fold\n> Folded: a read.\n\n> [!hint]- A hint\n> Not a read.\n\n> [!choice|q1] One\n- [ ] Yes\n- [ ] No\n\n> [!text|q2] Two\n\n> [!activity|log repeat] Log\n\n> [!text|q3] Three\n\n> [!module|m end] E\n`;
	let { book, nav } = build(text);
	const a = act(nav, "m/a");
	assert.equal(a.reads, 1, "a folded callout that holds no question is a read; a hint is not");
	assert.equal(core.activityStatus(a, book).text, "1 read · 2 questions · Not started");
	assert.equal(core.activityStatus(act(nav, "m/log"), book).text, "1 question · Not started");
	assert.equal(core.moduleStatus(nav.mods[0], book), "Not started");
	text = core.setAnswer(text, "m", "q1", 1);
	({ book, nav } = build(text));
	assert.equal(core.activityStatus(act(nav, "m/a"), book).text, "1 read · 1 of 2 answered");
	assert.equal(core.moduleStatus(nav.mods[0], book), "1 of 2 started");
	text = core.setAnswer(text, "m", "q2", "words");
	({ book, nav } = build(text));
	assert.equal(core.activityStatus(act(nav, "m/a"), book).text, "1 read · 2 questions · Done");
	text = core.setDraftAnswer(text, "m", "log", "q3", "x");
	text = core.finalizeDraft(text, "m", "log", { ts: "2026-10-20T09:00:00Z" }).text;
	({ book, nav } = build(text));
	assert.equal(core.activityStatus(act(nav, "m/log"), book).text, "1 question · 1 kept");
	assert.equal(core.moduleStatus(nav.mods[0], book), "2 of 2 started");
	assert.equal(core.moduleMeta(nav.mods[0], book), "2 activities · 2 started");
});

test("status words: a folded callout written inside a fenced code block is code, not a read; one after the fence is", () => {
	const fenced = "```md\n> [!note]- Folded, but only an example\n> Words.\n```\n";
	const unclosed = "```\n> [!note]- Never closed\n";
	const of = (body) => act(build(`${head()}\n> [!activity|a] A\n\n${body}`).nav, "/a").reads;
	assert.equal(of(fenced), 0, "inside a fence");
	assert.equal(of(`${fenced}\n> [!note]- Folded for real\n> Words.\n`), 1, "after the fence closes");
	assert.equal(of("~~~\n> [!note]- Folded, but only an example\n~~~\n"), 0, "a tilde fence holds it too");
	assert.equal(of(unclosed), 0, "a fence that never closes runs to the end");
});

test("a module of one activity is one card: the module's title first, else the booklet's, else its id", () => {
	const mod = (line) => `${head()}\n> [!module|day]${line}\n\n> [!activity|today] Today\n\n> [!module|day end] E\n`;
	let { nav } = build(mod(" A short check-in"));
	assert.equal(core.moduleTitle(nav, nav.mods[0]).title, "A short check-in");
	({ nav } = build(mod("")));
	assert.equal(core.moduleTitle(nav, nav.mods[0]).title, "Learning to sketch");
	({ nav } = build(mod("").replace("title: Learning to sketch\n", "")));
	assert.equal(core.moduleTitle(nav, nav.mods[0]).title, "day");
});

/* ---- tabs ---- */

test("an activity's tabs: ids as written or made from the name, the opening before the first tab, a repeated id numbered", () => {
	const text = `${head()}\n> [!activity|a] A\n\nOpening words.\n\n> [!tab] What to change\n\nOne.\n\n> [!tab|plan] Plan\n\nTwo.\n\n> [!tab|plan] Plan again\n\nThree.\n\n> [!tab] 日本語\n\nFour.\n`;
	const { nav } = build(text);
	const a = act(nav, "/a");
	assert.deepEqual(norm(a.tabs.map((t) => t.id)), ["what-to-change", "plan", "plan-2", "tab-4"]);
	assert.equal(a.opening.length, 1, "what is before the first tab line is the opening");
	assert.equal(core.barTabs(a).length, 4);
	assert.equal(core.tabIdOf("Écrire ça", 1), "ecrire-ca");
	assert.equal(core.tabIdOf("Ωmega", 1), "mega");
});

test("a module's tabs: lines in its opening; an activity joins one with tab:, else the first; its prose sits above that tab's cards; a notice is read", () => {
	const { nav } = build(SKETCH);
	const m = nav.mods.find((x) => x.id === "basics");
	assert.equal(m.opening, "Lines, boxes and light, one at a time, at your own pace.");
	assert.match(m.tabs[0].md, /^Do these with a pencil/);
	assert.equal(act(nav, "basics/light").modTab, "read");
	// the child sits in the tab of its top ancestor when it names none: the first
	assert.equal(act(nav, "basics/shadow").modTab, "practice");
	// the module's screen for the reader coming from an activity: on that activity's tab, or its top ancestor's
	assert.equal(core.modulePlaceFor(act(nav, "basics/light")).tab, "read");
	assert.equal(core.modulePlaceFor(act(nav, "basics/lines")).tab, "practice");
	assert.deepEqual(norm(m.notice.map((n) => n[0])), ["license", "copyright", "source", "version"]);
	const bad = `${head()}\n> [!module|m] M\n\n> [!tab] One\n\n> [!tab] Two\n\n> [!activity|a tab:nope] A\n\n> [!activity|b tab:two] B\n\n> [!module|m end] E\n`;
	const b = build(bad).nav;
	assert.equal(act(b, "m/a").modTab, "one", "a tab: that names no tab puts the activity in the first");
	assert.equal(act(b, "m/b").modTab, "two");
});

test("a module's notice: the callout, or the front matter's license, copyright and source when the file's one module has none", () => {
	const body = "\n> [!module|m] M\n\n> [!activity|a] A\n\n> [!activity|b] B\n\n> [!module|m end] E\n";
	const fm = `---\nbooklet: "0.16"\ntitle: T\nlicense: Free to copy\ncopyright: Example Press\nsource: https://example.org/m\nversion: 3\n---\n`;
	assert.deepEqual(norm(build(fm + body).nav.mods[0].notice), [["license", "Free to copy"], ["copyright", "Example Press"], ["source", "https://example.org/m"]]);
	const withCallout = fm + body.replace("> [!activity|a] A", "> [!notice]\n> license: Callout wins\n> version: 1.2\n\n> [!activity|a] A");
	assert.deepEqual(norm(build(withCallout).nav.mods[0].notice), [["license", "Callout wins"], ["version", "1.2"]]);
	// two modules: the front matter is no module's notice
	const two = fm + body + "\n> [!module|n] N\n\n> [!activity|c] C\n\n> [!module|n end] E\n";
	assert.deepEqual(norm(build(two).nav.mods[0].notice), []);
});

/* ---- pages ---- */

test("pages: a thematic break splits by Markdown's own rules; `---` needs a blank line above, a fence and a group hold no break; an empty page is no page", () => {
	const text = `${head()}\n> [!activity|a] A\n\nOne.\n***\nTwo.\n\n---\n\nThree\n---\n\n\`\`\`\n***\n\`\`\`\n\n> [!group]\n> inside\n> ***\n> still inside\n\n___\n\n***\n\nLast.\n\n***\n`;
	const { nav } = build(text);
	const pages = act(nav, "/a").tabs[0].pages;
	const words = pages.map((p) => p.filter((s) => s.type === "prose").map((s) => s.markdown.replace(/\s+/g, " ").trim()));
	// "Three\n---" is a heading (the break needs a blank line above); the fence and the group keep their lines
	assert.equal(pages.length, 4, JSON.stringify(words));
	assert.equal(words[0][0], "One.");
	assert.equal(words[1][0], "Two.");
	assert.match(words[2][0], /^Three --- /);
	assert.equal(words[2][1], "inside *** still inside", "the group is read with one `>` less, and its rule stays in it");
	assert.equal(words[3][0], "Last.");
	// an activity with no rule is one page
	assert.equal(core.pagesOf([{ type: "prose", markdown: "Just words.", line: 1 }]).length, 1);
	assert.equal(core.pagesOf([]).length, 1, "nothing is still one page");
});

test("pages: each tab has its own pages; the opening before the first tab is not paged; a question stays on its page", () => {
	const { nav } = build(SKETCH);
	const shapes = act(nav, "basics/shapes");
	assert.deepEqual(norm(shapes.tabs.map((t) => t.pages.length)), [2, 1]);
	assert.equal(shapes.opening.length, 1);
	assert.equal(act(nav, "basics/lines").tabs[0].pages.length, 3);
	const q = (page) => page.filter((s) => s.type === "question").map((s) => s.id);
	assert.deepEqual(norm(act(nav, "basics/lines").tabs[0].pages.map(q)), [[], ["steady"], ["lines-note"]]);
});

/* ---- parent: and the order Next follows ---- */

test("parent: places an activity under another; Next goes to the first child, then the next sibling, then back up; a bare activity may use it", () => {
	const text = `${head()}\n> [!module|w] Wiki\n\n> [!activity|a] A\n\n> [!activity|a1 parent:a] A1\n\n> [!activity|a1x parent:a1] A1x\n\n> [!activity|a2 parent:a] A2\n\n> [!activity|b] B\n\n> [!module|w end] E\n`;
	const { nav } = build(text);
	const order = nav.mods[0].order.map((a) => a.act.id);
	assert.deepEqual(norm(order), ["a", "a1", "a1x", "a2", "b"]);
	let a = act(nav, "w/a");
	const walked = [a.act.id];
	while ((a = core.nextOf(a))) walked.push(a.act.id);
	assert.deepEqual(norm(walked), order);
	assert.deepEqual(norm(nav.mods[0].top.map((x) => x.act.id)), ["a", "b"]);
	assert.equal(act(nav, "w/a1x").parent.act.id, "a1");
	// bare activities, among themselves
	const bare = `${head()}\n> [!activity|x] X\n\n> [!activity|y parent:x] Y\n\n> [!activity|z] Z\n`;
	const b = build(bare).nav;
	assert.deepEqual(norm(b.cards.map((c) => c.act.act.id)), ["x", "z"], "only the top ones are cards on home");
	assert.equal(core.nextOf(act(b, "/x")).act.id, "y");
	assert.equal(core.nextOf(act(b, "/y")).act.id, "z", "Next between bare activities, in reading order");
	assert.equal(core.nextOf(act(b, "/z")), null);
});

test("parent: a missing parent leaves the activity at the top; one that is its own ancestor is drawn at the top; a hidden parent is passed over", () => {
	const text = `${head()}\n> [!module|m] M\n\n> [!activity|a parent:ghost] A\n\n> [!activity|b parent:c] B\n\n> [!activity|c parent:b] C\n\n> [!activity|h hidden] H\n\n> [!activity|k parent:h] K\n\n> [!activity|me parent:me] Me\n\n> [!module|m end] E\n`;
	const { nav } = build(text);
	assert.deepEqual(norm(nav.mods[0].top.map((a) => a.act.id)), ["a", "b", "c", "k", "me"]);
	assert.equal(act(nav, "m/h"), undefined, "a hidden activity is not offered");
});

/* ---- heading links (SPEC section 3, "Links between activities") ---- */

test("a heading link opens the first place in file order whose heading or title reads those words: a module's tab, an activity's title, a tab, a heading, a prompt, a callout's title", () => {
	const { nav } = build(SKETCH);
	const hit = (words, scope = "basics") => norm(core.findHeading(nav, words, scope));
	// a heading on the third part of "Lines that hold"
	assert.deepEqual(hit("Ten in a row"), { place: { screen: "activity:basics/lines", tab: null, part: 2 }, heading: "Ten in a row", keepTab: false });
	// by its slug, the other way a link is written
	assert.equal(hit("hold-the-pencil-loosely").place.part, 1);
	// an activity's title opens the activity on its first tab and part
	assert.deepEqual(hit("Cast shadows").place, { screen: "activity:basics/shadow", tab: null, part: 0 });
	// a tab's name opens that tab (a bar's tab: its id); a module's tab opens the module's screen on it
	assert.deepEqual(hit("Cylinders").place, { screen: "activity:basics/shapes", tab: "cylinders", part: 0 });
	assert.deepEqual(hit("Read first").place, { screen: "module:basics", tab: "read", part: 0 });
	// a question's prompt
	assert.equal(hit("How steady were your lines?").place.part, 1);
	// words nothing in the module has
	assert.equal(hit("A sketch a day"), null, "the title of another module's screen is not in this module");
	assert.equal(hit("Seven studies"), null, "words only another module has are plain text");
	// from the booklet's opening: only the bare activities
	assert.equal(norm(core.findHeading(nav, "Warm up", "")).place.screen, "activity:/warm-up");
	assert.equal(core.findHeading(nav, "Cast shadows", ""), null);
	// from another note (no module): the whole file, first in file order
	assert.equal(norm(core.findHeading(nav, "Seven studies", null)).place.screen, "activity:journal/studies");
});

test("a heading link: in the opening of an activity with tabs the tab on show stays; code fences hold no heading; a callout's title is a place; a stray % does not throw", () => {
	const text = `${head()}\n> [!activity|a] A\n\n## In the opening\n\n> [!tab] One\n\n\`\`\`\n# Not a heading\n\`\`\`\n\n> [!tab] Two\n\n> [!tip]- A folded tip\n> inside\n\n## Deep\n`;
	const { nav } = build(text);
	const f = (w) => norm(core.findHeading(nav, w, ""));
	assert.equal(f("In the opening").keepTab, true);
	assert.equal(f("Not a heading"), null);
	assert.deepEqual(f("A folded tip").place, { screen: "activity:/a", tab: "two", part: 0 });
	assert.deepEqual(f("Deep").place.tab, "two");
	assert.equal(f("100% done"), null);
	assert.equal(core.findHeading(nav, "%E0%A4%A", ""), null, "an undecodable target is read as written");
});

test("a link to a whole module: the name before .booklet, any # part dropped; the module only when the booklet holds it", () => {
	const { nav } = build(SKETCH);
	assert.equal(core.moduleLinkName("week-2.booklet"), "week-2");
	assert.equal(core.moduleLinkName("week-2.booklet.md"), "week-2");
	assert.equal(core.moduleLinkName("folder/Week%202.booklet#Check yourself"), "Week 2");
	assert.equal(core.moduleLinkName(".booklet"), null);
	assert.equal(core.moduleLinkName("Ordinary note"), null);
	assert.equal(core.moduleNamed(nav, "basics").id, "basics");
	assert.equal(core.moduleNamed(nav, "week-2"), null);
	assert.deepEqual(norm(core.entryPlace(core.moduleNamed(nav, "basics"))), { screen: "module:basics", tab: "practice", part: 0 });
});

/* ---- places ---- */

test("a place is saved as { version, screen, tab, part } and read back; one from another version, or no place at all, is none", () => {
	const p = { screen: "activity:basics/lines", tab: null, part: 2 };
	assert.deepEqual(norm(core.placeState(p)), { version: 1, screen: "activity:basics/lines", part: 2 });
	assert.deepEqual(norm(core.placeFrom(core.placeState(p))), p);
	assert.deepEqual(norm(core.placeFrom(core.placeState({ screen: "module:basics", tab: "read", part: 0 }))), { screen: "module:basics", tab: "read", part: 0 });
	assert.equal(core.placeFrom({ screen: "home" }), null, "no version");
	assert.equal(core.placeFrom({ version: 2, screen: "home", part: 0 }), null, "another version");
	assert.equal(core.placeFrom({ version: 1, screen: 7 }), null);
	assert.equal(core.placeFrom(null), null);
	assert.deepEqual(norm(core.placeFrom({ version: 1, screen: "home", part: -3, tab: "" })), { screen: "home", tab: null, part: 0 });
});

test("a saved place is checked against the note: an id it no longer has falls back to where the note opens; a part is kept within its tab's pages", () => {
	const { nav } = build(SKETCH);
	const r = (p) => norm(core.resolvePlace(nav, p));
	assert.deepEqual(r({ screen: "activity:basics/lines", tab: "ignored", part: 9 }), { screen: "activity:basics/lines", tab: null, part: 2 });
	assert.deepEqual(r({ screen: "activity:basics/gone", tab: null, part: 0 }), { screen: "home", tab: null, part: 0 });
	assert.deepEqual(r({ screen: "module:gone", tab: null, part: 0 }), { screen: "home", tab: null, part: 0 });
	assert.deepEqual(r({ screen: "module:basics", tab: "nope", part: 4 }), { screen: "module:basics", tab: "practice", part: 0 });
	assert.deepEqual(r({ screen: "activity:basics/shapes", tab: "nope", part: 5 }), { screen: "activity:basics/shapes", tab: "boxes", part: 1 });
	assert.deepEqual(r({ screen: "activity:basics/shapes", tab: "cylinders", part: 5 }), { screen: "activity:basics/shapes", tab: "cylinders", part: 0 });
	assert.deepEqual(r(null), { screen: "home", tab: null, part: 0 });
	// a module of one activity has no screen: its place is its activity's
	const one = build(`${head()}\n> [!module|m] M\n\n> [!activity|a] A\n\n> [!module|m end] E\n`).nav;
	assert.equal(core.resolvePlace(one, { screen: "module:m", tab: null, part: 0 }).screen, "activity:m/a");
});

test("which moves are history steps: another screen and another part of the same tab are; choosing a tab never is", () => {
	const at = (screen, tab, part) => ({ screen, tab, part });
	const a = (tab, part) => at("activity:basics/shapes", tab, part);
	assert.equal(core.isStep(null, a("boxes", 0)), true);
	assert.equal(core.isStep(at("home", null, 0), a("boxes", 0)), true, "into an activity");
	assert.equal(core.isStep(a("boxes", 0), a("boxes", 1)), true, "another page");
	assert.equal(core.isStep(a("boxes", 1), a("cylinders", 0)), false, "another tab");
	assert.equal(core.isStep(a("boxes", 0), a("cylinders", 1)), false, "a tab that opens on another page than the one left is still no step");
	assert.equal(core.isStep(a("boxes", 1), at("module:basics", "practice", 0)), true, "up");
	assert.equal(core.isStep(at("module:basics", "practice", 0), at("module:basics", "read", 0)), false, "a module's tab");
});

test("the model reads the note and never changes it", () => {
	const text = SKETCH;
	const before = text.length + ":" + text;
	build(text);
	assert.equal(text.length + ":" + text, before);
	const refused = build(`---\nbooklet: "2.0"\n---\n`);
	assert.equal(refused.book.ok, false);
	assert.deepEqual(norm(core.startPlace(refused.nav)), { screen: "home", tab: null, part: 0 });
});
