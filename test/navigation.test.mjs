/*
 * The booklet view drawn one screen at a time (design: "The screens and the moves between them"), run in Node over a jsdom
 * document: the three screens, every move and whether it is a step in the pane's history, the tab and page the pane keeps,
 * Back and Forward, a restored pane, links inside a note, and the rule that no move writes anything into the note.
 * Every note is made up.
 */
import { click, quiet } from "./dom.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { SKETCH, core, norm, sha } from "./helpers.mjs";
import { BookletView, MediaAllows, pane } from "./pane.mjs";

/* ---- the three screens ---- */

test("home: one card for each module and each bare activity, in rows numbered by reading order, with no trail", async () => {
	const p = pane(SKETCH);
	await p.settled();
	assert.equal(p.screen, "home");
	assert.equal(p.title(), "Learning to sketch");
	assert.deepEqual(p.cards(), ["1.Warm up", "2.The basics", "3.A sketch a day"]);
	assert.equal(p.all(".booklet-trail").length, 0, "no trail on home");
	assert.equal(p.all(".booklet-pager").length, 0);
	// a picture for a name in Booklet's set, drawn by Obsidian from its Lucide id
	const icons = p.all(".booklet-cardrow .booklet-pic svg").map((s) => s.getAttribute("data-icon"));
	assert.deepEqual(icons, ["lucide-pencil", "lucide-shapes", "lucide-notebook-pen"]);
	// the status line: what a bare activity holds, and what a module has had done
	assert.deepEqual(p.all(".booklet-cardrow .booklet-status").map((n) => p.words(n)), ["Two minutes, before anything else", "Not started", "Not started"]);
	p.close();
});

test("a module's screen: its opening, its tab bar, the activities of the chosen tab as cards numbered by place in the module; the notice is a closed disclosure", async () => {
	const p = pane(SKETCH, { screen: "module:basics" });
	await p.settled();
	assert.equal(p.title(), "The basics");
	assert.deepEqual(p.trail(), ["Learning to sketch", "The basics"]);
	assert.deepEqual(p.tabs(), ["Practice", "Read first"]);
	assert.equal(p.tabOn(), "Practice");
	assert.deepEqual(p.cards(), ["1.Lines that hold", "2.Boxes and cylinders"]);
	await p.tab("Read first");
	assert.equal(p.tabOn(), "Read first");
	// the card is numbered by its place in the module
	assert.deepEqual(p.cards(), ["3.Where the light falls"], "its pages are its own, not cards of the module");
	const notice = p.el.querySelector("details.booklet-notice");
	assert.ok(notice);
	assert.equal(notice.hasAttribute("open"), false);
	assert.match(p.words(notice), /Licence.*Made up for testing; free to copy\..*Copyright.*Example Press, 2026.*Source.*https:\/\/example\.org\/sketching.*Version.*0\.3/);
	assert.equal(notice.querySelector("a")?.getAttribute("href"), "https://example.org/sketching");
	p.close();
});

test("an activity's screen: trail down to it, tab bar, one page at a time, and a pager at the foot with the counter", async () => {
	const p = pane(SKETCH, { screen: "activity:basics/lines" });
	await p.settled();
	assert.equal(p.title(), "Lines that hold");
	assert.deepEqual(p.trail(), ["Learning to sketch", "The basics", "Lines that hold"]);
	assert.deepEqual(p.pager(), { at: "Page 1 of 3", buttons: ["Back to the overview", "Next"] });
	assert.equal(p.all("[data-booklet-q]").length + p.all(".booklet-question").length, 0, "the question of page 2 is not drawn on page 1");
	await p.pageNext();
	assert.deepEqual(p.pager().at, "Page 2 of 3");
	assert.equal(p.all(".booklet-question").length, 1, "page 2 holds its one question");
	assert.deepEqual(p.pager().buttons, ["Back", "Next"]);
	await p.pageNext();
	assert.deepEqual(p.pager(), { at: "Page 3 of 3", buttons: ["Back", "Next: 2. Boxes and cylinders"] });
	p.close();
});

test("a booklet that offers one activity opens into it; a bare activity's pager labels the next one with no number", async () => {
	const text = `---\nbooklet: "0.18"\ntitle: Three notes\n---\n\n> [!activity|first] First\n\nOne.\n\n> [!activity|second] Second\n\nTwo.\n\n> [!activity|third hidden] Hidden\n\nNot offered.\n`;
	const p = pane(text);
	await p.settled();
	assert.equal(p.screen, "home", "two offered activities: home");
	await p.card("1.First");
	assert.equal(p.screen, "activity:/first");
	assert.deepEqual(p.trail(), ["Three notes", "First"]);
	assert.deepEqual(p.pager().buttons, ["Back to the overview", "Next: Second"]);
	p.close();
	const one = pane(`---\nbooklet: "0.18"\ntitle: One note\n---\n\n> [!activity|only] Only\n\nHi.\n`);
	await one.settled();
	assert.equal(one.screen, "activity:/only");
	assert.deepEqual(one.pager().buttons, ["Back to the overview"]);
	one.close();
});

/* ---- the moves, and which of them are steps ---- */

test("every move, and whether it is a step: into a module, into an activity, a tab, a page, up, out from page 1, next activity", async () => {
	const p = pane(SKETCH);
	await p.settled();
	const steps = () => p.hist.back.length;
	assert.equal(steps(), 0);

	await p.card("2.The basics"); // into a module: a step
	assert.equal(p.screen, "module:basics");
	assert.equal(steps(), 1);

	await p.card("2.Boxes and cylinders"); // into an activity: a step
	assert.equal(p.screen, "activity:basics/shapes");
	assert.equal(steps(), 2);
	assert.equal(p.tabOn(), "Boxes", "an activity opens on its first tab");

	await p.tab("Cylinders"); // another tab: never a step
	assert.equal(p.tabOn(), "Cylinders");
	assert.equal(steps(), 2);

	await p.tab("Boxes");
	await p.pageNext(); // another page: a step
	assert.equal(p.pager().at, "Page 2 of 2");
	assert.equal(steps(), 3);

	await p.pageNext(); // Next on the last page: the next activity in reading order
	assert.equal(p.screen, "activity:basics/light");
	assert.equal(steps(), 4);
	assert.deepEqual(p.trail(), ["Learning to sketch", "The basics", "Where the light falls"]);
	assert.deepEqual(p.pager().buttons, ["Back to the overview", "Next: Cast shadows"]);
	assert.equal(p.pager().at, "", "a page of one part counts nothing, and its Back is out");

	await p.pageNext(); // on to the next page of the tab (a page line): a step, and it stays in the activity
	assert.equal(p.screen, "activity:basics/light");
	assert.deepEqual(p.pageTitles(), ["Cast shadows"]);
	assert.deepEqual(p.pager().buttons, ["Back", "Next: Reflected light"]);
	assert.equal(steps(), 5);

	await p.pageNext(); // into the page under it: a step; the trail names the pages above
	assert.deepEqual(p.trail(), ["Learning to sketch", "The basics", "Where the light falls", "Cast shadows", "Reflected light"]);
	assert.deepEqual(p.pager().buttons, ["Up: Cast shadows"], "the last activity of its module: nothing follows");
	assert.equal(steps(), 6);

	await p.trailTo("The basics"); // up by the trail: a step
	assert.equal(p.screen, "module:basics");
	assert.equal(steps(), 7);
	assert.equal(p.tabOn(), "Read first", "the module's screen comes back on the tab that holds the activity left");

	await p.card("3.Where the light falls");
	await p.pageBack(); // out from page 1: a step, to the overview of the module
	assert.equal(p.screen, "module:basics");
	assert.equal(steps(), 9);

	await p.trailTo("Learning to sketch");
	assert.equal(p.screen, "home");
	assert.equal(steps(), 10);
	p.close();
});

test("Back and Forward take the pane through the same places, and leave the tab chosen and the page where they were", async () => {
	const p = pane(SKETCH);
	await p.settled();
	await p.card("2.The basics");
	await p.card("2.Boxes and cylinders");
	await p.tab("Cylinders");
	await p.trailTo("The basics");
	assert.equal(p.screen, "module:basics");
	await p.back();
	assert.equal(p.screen, "activity:basics/shapes");
	assert.equal(p.tabOn(), "Cylinders", "the tab on show when it was left");
	await p.back();
	assert.equal(p.screen, "module:basics");
	await p.back();
	assert.equal(p.screen, "home");
	await p.forward();
	await p.forward();
	assert.equal(p.screen, "activity:basics/shapes");
	assert.equal(p.tabOn(), "Cylinders");
	p.close();
});

test("each tab keeps the page last seen while the pane is open", async () => {
	const text = `---\nbooklet: "0.18"\ntitle: Tabs and pages\n---\n\n> [!activity|a] A\n\n> [!tab] One\n\nOne p1\n***\nOne p2\n***\nOne p3\n\n> [!tab] Two\n\nTwo p1\n***\nTwo p2\n`;
	const p = pane(text);
	await p.settled();
	assert.equal(p.screen, "activity:/a");
	await p.pageNext();
	await p.pageNext();
	assert.equal(p.pager().at, "Page 3 of 3");
	await p.tab("Two");
	assert.equal(p.pager().at, "Page 1 of 2");
	await p.pageNext();
	assert.equal(p.pager().at, "Page 2 of 2");
	await p.tab("One");
	assert.equal(p.pager().at, "Page 3 of 3", "tab One is on the page it was left on");
	await p.tab("Two");
	assert.equal(p.pager().at, "Page 2 of 2");
	p.close();
});

test("a tab chosen while a page is turning ends on that tab; a double press on Next turns one page", async () => {
	const text = `---\nbooklet: "0.18"\ntitle: Quick hands\n---\n\n> [!activity|a] A\n\n> [!tab] One\n\nOne p1\n***\nOne p2\n***\nOne p3\n\n> [!tab] Two\n\nTwo p1\n***\nTwo p2\n`;
	const p = pane(text, { delay: 40 });
	await p.settled();
	const press = (sel, label) => click(p.all(sel).find((b) => p.words(b).startsWith(label)));
	// the turn is under way (its state not yet landed) when the tab is chosen
	press(".booklet-pager button", "Next");
	press(".booklet-tabbtn", "Two");
	await p.settled();
	assert.equal(p.tabOn(), "Two", "the last thing asked for is where the reader ends");
	assert.equal(p.pager().at, "Page 1 of 2");
	// the page turn itself landed first: tab One is on page 2
	await p.tab("One");
	assert.equal(p.pager().at, "Page 2 of 3");
	// a double press on Next turns one page
	const callsBefore = p.flight.calls;
	press(".booklet-pager button", "Next");
	press(".booklet-pager button", "Next");
	await p.settled();
	assert.equal(p.pager().at, "Page 3 of 3");
	assert.equal(p.flight.calls - callsBefore, 1, "the second press made no second move");
	p.close();
});

/* ---- an activity's pages, drawn as a tree inside it ---- */

test("an activity of pages: the page under a page is a card on it, the trail names the pages above, and the pager's left button leads up; no activity has a tree of activities", async () => {
	const p = pane(SKETCH, { screen: "activity:basics/light" });
	await p.settled();
	assert.deepEqual(p.cards(), [], "the activity's own words are its first page, which has no pages under it");
	assert.equal(p.el.textContent.includes("Under this one"), false, "the card list of an activity's children is gone");
	await p.pageNext();
	assert.deepEqual(p.pageTitles(), ["Cast shadows"]);
	assert.deepEqual(p.cards(), ["1.Reflected light"]);
	await p.card("1.Reflected light");
	assert.equal(p.screen, "activity:basics/light", "a page is in the activity, not another screen");
	assert.deepEqual(p.pageTitles(), ["Reflected light"]);
	assert.deepEqual(p.pager().buttons, ["Up: Cast shadows"]);
	await p.press(".booklet-pager button", "Up: Cast shadows");
	assert.deepEqual(p.pageTitles(), ["Cast shadows"]);
	p.close();
});

test("the trail does not name the booklet twice: a module of one activity with no words, and an activity titled as its booklet, give one crumb", async () => {
	const book = (body) => `---\nbooklet: "0.18"\ntitle: Garden wiki\n---\n\n${body}`;
	// a module with no words of its own is called by the booklet's title, and so is its one activity's card and trail
	const noModule = pane(book("> [!module|g]\n\n> [!activity|beds] Beds\n\nWords.\n\n> [!module|g end] E\n"));
	await noModule.settled();
	assert.equal(noModule.screen, "activity:g/beds");
	assert.deepEqual(noModule.trail(), ["Garden wiki"], "one crumb, not 'Garden wiki / Garden wiki'");
	noModule.close();
	const same = pane(book("> [!activity|beds] Garden wiki\n\nWords.\n"));
	await same.settled();
	assert.deepEqual(same.trail(), ["Garden wiki"]);
	same.close();
	// on a page under the activity's first, the crumb that stays is the activity's, a link to its top; home is the pager's "Back to the overview"
	const pages = pane(book("> [!activity|beds] Garden wiki\n\nWords.\n\n> [!page|soil] Soil\n\nSoil words.\n\n> [!page|compost parent:soil] Compost\n\nCompost words.\n"));
	await pages.settled();
	await pages.pageNext();
	await pages.card("1.Compost");
	assert.deepEqual(pages.trail(), ["Garden wiki", "Soil", "Compost"], "the activity once, then the page above, then the page");
	const links = [...pages.el.querySelectorAll(".booklet-trail a")].map((a) => a.textContent.trim());
	assert.deepEqual(links, ["Garden wiki", "Soil"], "the first link is the activity, not home");
	await pages.trailTo("Garden wiki");
	assert.equal(pages.screen, "activity:/beds", "it leads to the activity's top page");
	assert.deepEqual(pages.trail(), ["Garden wiki"]);
	pages.close();
	// where the titles differ the trail is as it was: the booklet, then the activity
	const apart = pane(book("> [!activity|beds] Beds\n\nWords.\n\n> [!activity|paths] Paths\n\nMore.\n"));
	await apart.settled();
	await apart.card("1.Beds");
	assert.deepEqual(apart.trail(), ["Garden wiki", "Beds"]);
	apart.close();
});

/* ---- the saved place ---- */

test("the view's state is { version, screen, tab, part } beside the file, and a pane restored from it opens in the same place", async () => {
	const p = pane(SKETCH);
	await p.settled();
	await p.card("2.The basics");
	await p.card("2.Boxes and cylinders");
	await p.tab("Cylinders");
	const saved = norm(p.view.getState());
	assert.deepEqual(saved, { file: "Note.booklet.md", version: 2, screen: "activity:basics/shapes", tab: "cylinders", part: 0 });
	p.close();

	const q = pane(SKETCH, { state: saved });
	await q.settled();
	assert.equal(q.screen, "activity:basics/shapes");
	assert.equal(q.tabOn(), "Cylinders");
	assert.deepEqual(norm(q.view.getState()), saved);
	q.close();

	// a state from another version of the plugin, or one naming an activity the note no longer has, opens where the note opens
	const odd = pane(SKETCH, { state: { file: "Note.booklet.md", version: 9, screen: "activity:basics/shapes", part: 1 } });
	await odd.settled();
	assert.equal(odd.screen, "home");
	odd.close();
	const gone = pane(SKETCH, { state: { file: "Note.booklet.md", version: 2, screen: "activity:basics/vanished", part: 0 } });
	await gone.settled();
	assert.equal(gone.screen, "home");
	gone.close();
});

test("the place is kept when a pane toggles to Markdown and back: the leaf remembers it in memory only", async () => {
	const p = pane(SKETCH, { screen: "activity:basics/lines" });
	await p.settled();
	await p.pageNext();
	const leaf = p.leaf;
	p.view.unload();
	// the same leaf shows the note again, with no state handed over
	const view2 = new BookletView(leaf, { setMode: async () => {}, manifest: { version: "9.8.7" }, media: new MediaAllows(null, () => {}) });
	view2.file = { path: "Note.booklet.md", basename: "Note.booklet" };
	view2.load();
	view2.setViewData(SKETCH, true);
	await quiet(view2);
	assert.equal(view2.contentEl.querySelector(".booklet-page").getAttribute("data-booklet-screen"), "activity:basics/lines");
	assert.match(view2.contentEl.querySelector(".booklet-pager-at").textContent, /Page 2 of 3/);
	view2.unload();
});

/* ---- nothing about the place is written into the note ---- */

test("no move writes anything into a note: three made-up notes are byte-for-byte the same after every move", async () => {
	const notes = {
		sampler: SKETCH,
		tabbed: `---\nbooklet: "0.18"\ntitle: Tabs and pages\n---\n\n> [!activity|a] A\n\n> [!tab] One\n\nOne p1\n***\nOne p2\n\n> [!tab] Two\n\nTwo p1\n\n> [!page|more] More\n\nTwo p2\n\n> [!activity|b] B\n\nAfter A.\n***\nAnd later.\n`,
		kept: (() => {
			let t = `---\nbooklet: "0.18"\ntitle: A daily note\n---\n\n> [!module|d] Day\n\n> [!activity|today repeat daily] Today\n\n> [!text|what] What happened?\n\n> [!activity|other] Other\n\nWords.\n\n> [!module|d end] E\n`;
			t = core.setDraftAnswer(t, "d", "today", "what", "A walk");
			return core.finalizeDraft(t, "d", "today", { ts: "2026-10-20T09:00:00Z" }).text;
		})(),
	};
	for (const [name, text] of Object.entries(notes)) {
		const p = pane(text);
		await p.settled();
		const before = sha(p.disk.text);
		// a run of every move the screen offers, for as long as there is a card, tab, page or link to press
		const seen = new Set();
		for (let i = 0; i < 40; i++) {
			const targets = [...p.all(".booklet-cardrow"), ...p.all(".booklet-tabbtn:not(.is-active)"), ...p.all(".booklet-pager button"), ...p.all(".booklet-trail-link")];
			const key = `${p.screen}|${p.tabOn()}|${p.pager().at}`;
			seen.add(key);
			const next = targets[i % Math.max(1, targets.length)];
			if (!next) break;
			click(next);
			await p.settled();
			if (p.hist.back.length > 3 && i % 5 === 4) await p.back();
		}
		await p.back().catch(() => {});
		await p.forward().catch(() => {});
		await p.settled();
		assert.ok(seen.size > 3, `${name}: the run visited ${seen.size} places: ${[...seen].join(" / ")}`);
		assert.equal(sha(p.disk.text), before, `${name}: the note changed`);
		assert.equal(p.disk.writes, 0, `${name}: the view wrote to the note`);
		p.close();
	}
});

/* ---- links inside a note ---- */

function linkRender(markdown, el) {
	// stands in for Obsidian's renderer: [[#words]] and [[name.booklet]] become internal links
	const re = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
	let at = 0;
	let m;
	while ((m = re.exec(markdown))) {
		if (m.index > at) el.appendText(markdown.slice(at, m.index));
		const a = el.createEl("a", { cls: "internal-link", text: m[2] ?? m[1].replace(/^#/, ""), attr: { href: m[1], "data-href": m[1] } });
		void a;
		at = re.lastIndex;
	}
	if (at < markdown.length) el.appendText(markdown.slice(at));
}

test("a heading link opens the place its words name, as a step; a dead one is plain words; a link to a module the booklet holds opens it, and to one it lacks is a chip", async () => {
	globalThis.__bookletStubRender = linkRender;
	try {
		const text = `---\nbooklet: "0.18"\ntitle: Links\n---\n\n> [!module|one] One\n\n> [!activity|a] Alpha\n\nSee [[#Beta]] and [[#Nowhere at all]] and [[two.booklet]] and [[three.booklet|the third]].\n\n> [!activity|b] Beta\n\nBeta words.\n\n> [!module|one end] E\n\n> [!module|two] Two\n\n> [!activity|c] Gamma\n\nGamma words.\n\n> [!activity|d] Delta\n\nMore.\n\n> [!module|two end] E\n`;
		const p = pane(text, { screen: "activity:one/a" });
		await p.settled();
		const links = p.all(".booklet-pagebody a");
		const kinds = links.map((a) => a.getAttribute("data-href"));
		assert.deepEqual(kinds, ["#Beta", "two.booklet"], "the dead heading link is plain words");
		assert.match(p.words(p.el.querySelector(".booklet-pagebody")), /and Nowhere at all and/);
		assert.match(p.words(p.el.querySelector(".booklet-module-chip")), /^the third · not in this booklet$/);
		// a heading link: the place its words name
		click(links[0]);
		await p.settled();
		assert.equal(p.screen, "activity:one/b");
		assert.equal(p.hist.back.length, 1, "a heading link that moves is a step");
		await p.back();
		assert.equal(p.screen, "activity:one/a");
		// a link to a module the booklet holds: its screen (a module of two activities has one)
		click(p.all(".booklet-pagebody a")[1]);
		await p.settled();
		assert.equal(p.screen, "module:two");
		assert.equal(p.disk.writes, 0);
		p.close();
	} finally {
		delete globalThis.__bookletStubRender;
	}
});
