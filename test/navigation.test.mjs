/*
 * The booklet view drawn one screen at a time (design: "The screens and the moves between them"), run in Node over a jsdom
 * document: the three screens, every move and whether it is a step in the pane's history, the tab and page the pane keeps,
 * Back and Forward, a restored pane, links inside a note, and the rule that no move writes anything into the note.
 * Every note is made up.
 */
import { window as w } from "./dom.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, core, norm } from "./helpers.mjs";

process.env.TZ = "UTC";

const { BookletView } = await import("./.build/view.mjs");
const SAMPLE = readFileSync(join(ROOT, "test-vault", "Learning to sketch.booklet.md"), "utf8");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha = (s) => createHash("sha256").update(s).digest("hex");

/**
 * A pane as Obsidian runs it, as far as the moves need: `setViewState` hands the state to the view and, when the view marks the
 * move a step, keeps the place left in a Back list; a second move asked for while one is under way is dropped (design 4.2);
 * Back and Forward hand a kept state to the view without adding a step.
 */
function pane(text, { path = "Note.booklet.md", screen, delay = 0, state = null } = {}) {
	const disk = { text, writes: 0 };
	const hist = { back: [], fwd: [] };
	const flight = { busy: false, dropped: 0, calls: 0 };
	const app = {
		vault: {
			process: async (_file, fn) => {
				disk.writes++;
				disk.text = fn(disk.text);
				return disk.text;
			},
		},
		workspace: { iterateAllLeaves() {}, on: () => ({}), openLinkText: async () => {}, requestSaveLayout() {}, getLeaf: () => leaf },
	};
	const leaf = {
		app,
		setViewState: async (vs) => {
			flight.calls++;
			if (flight.busy) {
				flight.dropped++;
				return;
			}
			flight.busy = true;
			try {
				if (delay) await sleep(delay);
				const before = view.getState();
				const result = {};
				await view.setState(vs.state, result);
				if (result.history) {
					hist.back.push(before);
					hist.fwd.length = 0;
				}
			} finally {
				flight.busy = false;
			}
		},
	};
	const view = new BookletView(leaf, { setMode: async () => {} });
	view.file = { path, basename: path.replace(/\.md$/, "") };
	view.load();
	void view.setState(state ?? (screen ? { version: 1, screen } : {}), {});
	view.setViewData(text, true);
	const el = view.contentEl;
	const all = (sel) => [...el.querySelectorAll(sel)];
	const words = (n) => (n.textContent ?? "").replace(/\s+/g, " ").trim();
	const p = {
		view,
		disk,
		hist,
		flight,
		leaf,
		el,
		all,
		words,
		get screen() {
			return el.querySelector(".booklet-page")?.getAttribute("data-booklet-screen");
		},
		trail: () => all(".booklet-trail > *:not(.booklet-trail-sep)").map(words),
		cards: () => all(".booklet-cardrow").map((r) => words(r.querySelector(".booklet-cardtitle"))),
		cardRows: () => all(".booklet-cardrow"),
		tabs: () => all(".booklet-tabbtn").map(words),
		tabOn: () => words(el.querySelector(".booklet-tabbtn.is-active") ?? { textContent: "" }),
		pager: () => ({ at: words(el.querySelector(".booklet-pager-at") ?? { textContent: "" }), buttons: all(".booklet-pager button").map(words) }),
		title: () => words(el.querySelector(".booklet-screentitle")),
		/** Presses a button or card by its words (the first whose words start with them). */
		async press(sel, label) {
			const hit = all(sel).find((b) => words(b).startsWith(label));
			assert.ok(hit, `no ${sel} reading "${label}" on ${p.screen}; there are: ${all(sel).map(words).join(" | ")}`);
			hit.dispatchEvent(new w.MouseEvent("click", { bubbles: true, cancelable: true }));
			await p.settled();
		},
		card: (label) => p.press(".booklet-cardrow", label),
		trailTo: (label) => p.press(".booklet-trail-link", label),
		tab: (label) => p.press(".booklet-tabbtn", label),
		pageNext: () => p.press(".booklet-pager button", "Next"),
		pageBack: () => p.press(".booklet-pager button", "Back"),
		settled: async () => {
			await sleep(delay + 12);
			await view.writes;
		},
		async back() {
			const s = hist.back.pop();
			assert.ok(s, "nothing to go back to");
			hist.fwd.push(view.getState());
			await view.setState(s, {});
		},
		async forward() {
			const s = hist.fwd.pop();
			assert.ok(s, "nothing to go forward to");
			hist.back.push(view.getState());
			await view.setState(s, {});
		},
		close() {
			view.unload();
			view.containerEl.remove();
		},
	};
	return p;
}

const sleepFor = async (p) => {
	await sleep(15);
	await p.view.writes;
};

/* ---- the three screens ---- */

test("home: one card for each module and each bare activity, in rows numbered by reading order, with no trail", async () => {
	const p = pane(SAMPLE);
	await sleepFor(p);
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
	const p = pane(SAMPLE, { screen: "module:basics" });
	await sleepFor(p);
	assert.equal(p.title(), "The basics");
	assert.deepEqual(p.trail(), ["Learning to sketch", "The basics"]);
	assert.deepEqual(p.tabs(), ["Practice", "Read first"]);
	assert.equal(p.tabOn(), "Practice");
	assert.deepEqual(p.cards(), ["1.Lines that hold", "2.Boxes and cylinders"]);
	await p.tab("Read first");
	assert.equal(p.tabOn(), "Read first");
	// the card is numbered by its place in the module: the third and, under it, the fourth and fifth are not top cards
	assert.deepEqual(p.cards(), ["3.Where the light falls"]);
	const notice = p.el.querySelector("details.booklet-notice");
	assert.ok(notice);
	assert.equal(notice.hasAttribute("open"), false);
	assert.match(p.words(notice), /Licence.*Made up for testing; free to copy\..*Copyright.*Example Press, 2026.*Source.*https:\/\/example\.org\/sketching.*Version.*0\.3/);
	assert.equal(notice.querySelector("a")?.getAttribute("href"), "https://example.org/sketching");
	p.close();
});

test("an activity's screen: trail down to it, tab bar, one page at a time, and a pager at the foot with the counter", async () => {
	const p = pane(SAMPLE, { screen: "activity:basics/lines" });
	await sleepFor(p);
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
	const text = `---\nbooklet: "0.16"\ntitle: Three notes\n---\n\n> [!activity|first] First\n\nOne.\n\n> [!activity|second] Second\n\nTwo.\n\n> [!activity|third hidden] Hidden\n\nNot offered.\n`;
	const p = pane(text);
	await sleepFor(p);
	assert.equal(p.screen, "home", "two offered activities: home");
	await p.card("1.First");
	assert.equal(p.screen, "activity:/first");
	assert.deepEqual(p.trail(), ["Three notes", "First"]);
	assert.deepEqual(p.pager().buttons, ["Back to the overview", "Next: Second"]);
	p.close();
	const one = pane(`---\nbooklet: "0.16"\ntitle: One note\n---\n\n> [!activity|only] Only\n\nHi.\n`);
	await sleepFor(one);
	assert.equal(one.screen, "activity:/only");
	assert.deepEqual(one.pager().buttons, ["Back to the overview"]);
	one.close();
});

/* ---- the moves, and which of them are steps ---- */

test("every move, and whether it is a step: into a module, into an activity, a tab, a page, up, out from page 1, next activity", async () => {
	const p = pane(SAMPLE);
	await sleepFor(p);
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
	assert.deepEqual(p.pager().buttons, ["Back to the overview", "Next: 4. Cast shadows"]);

	await p.pageNext(); // into the child: a step; the trail names the ancestor
	assert.equal(p.screen, "activity:basics/shadow");
	assert.deepEqual(p.trail(), ["Learning to sketch", "The basics", "Where the light falls", "Cast shadows"]);
	assert.deepEqual(p.pager().buttons, ["Up: Where the light falls", "Next: 5. Reflected light"]);
	assert.equal(steps(), 5);

	await p.trailTo("The basics"); // up by the trail: a step
	assert.equal(p.screen, "module:basics");
	assert.equal(steps(), 6);
	assert.equal(p.tabOn(), "Read first", "the module's screen comes back on the tab that holds the activity left");

	await p.card("3.Where the light falls");
	await p.pageBack(); // out from page 1: a step, to the overview of the module
	assert.equal(p.screen, "module:basics");
	assert.equal(steps(), 8);

	await p.trailTo("Learning to sketch");
	assert.equal(p.screen, "home");
	assert.equal(steps(), 9);
	p.close();
});

test("Back and Forward take the pane through the same places, and leave the tab chosen and the page where they were", async () => {
	const p = pane(SAMPLE);
	await sleepFor(p);
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
	const text = `---\nbooklet: "0.16"\ntitle: Tabs and pages\n---\n\n> [!activity|a] A\n\n> [!tab] One\n\nOne p1\n***\nOne p2\n***\nOne p3\n\n> [!tab] Two\n\nTwo p1\n***\nTwo p2\n`;
	const p = pane(text);
	await sleepFor(p);
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
	const text = `---\nbooklet: "0.16"\ntitle: Quick hands\n---\n\n> [!activity|a] A\n\n> [!tab] One\n\nOne p1\n***\nOne p2\n***\nOne p3\n\n> [!tab] Two\n\nTwo p1\n***\nTwo p2\n`;
	const p = pane(text, { delay: 40 });
	await sleep(60);
	const press = (sel, label) => p.all(sel).find((b) => p.words(b).startsWith(label)).dispatchEvent(new w.MouseEvent("click", { bubbles: true, cancelable: true }));
	// the turn is under way (its state not yet landed) when the tab is chosen
	press(".booklet-pager button", "Next");
	press(".booklet-tabbtn", "Two");
	await sleep(160);
	assert.equal(p.tabOn(), "Two", "the last thing asked for is where the reader ends");
	assert.equal(p.pager().at, "Page 1 of 2");
	// the page turn itself landed first: tab One is on page 2
	await p.tab("One");
	assert.equal(p.pager().at, "Page 2 of 3");
	// a double press on Next turns one page
	const callsBefore = p.flight.calls;
	press(".booklet-pager button", "Next");
	press(".booklet-pager button", "Next");
	await sleep(160);
	assert.equal(p.pager().at, "Page 3 of 3");
	assert.equal(p.flight.calls - callsBefore, 1, "the second press made no second move");
	p.close();
});

test("a booklet's pager counts nothing on a one-page activity, and its Back is out", async () => {
	const p = pane(SAMPLE, { screen: "activity:basics/light" });
	await sleepFor(p);
	assert.equal(p.pager().at, "");
	assert.deepEqual(p.pager().buttons, ["Back to the overview", "Next: 4. Cast shadows"]);
	p.close();
});

/* ---- parent: drawn plainly ---- */

test("parent: the child is a card under its parent, the trail names the ancestors, and the pager's left button leads up", async () => {
	const p = pane(SAMPLE, { screen: "activity:basics/light" });
	await sleepFor(p);
	assert.equal(p.el.querySelector(".booklet-meta + .booklet-cards, .booklet-meta")?.textContent.includes("Under this one"), true);
	assert.deepEqual(p.cards(), ["4.Cast shadows", "5.Reflected light"]);
	await p.card("4.Cast shadows");
	assert.equal(p.screen, "activity:basics/shadow");
	assert.deepEqual(p.pager().buttons, ["Up: Where the light falls", "Next: 5. Reflected light"]);
	await p.press(".booklet-pager button", "Up: Where");
	assert.equal(p.screen, "activity:basics/light");
	p.close();
});

/* ---- the saved place ---- */

test("the view's state is { version, screen, tab, part } beside the file, and a pane restored from it opens in the same place", async () => {
	const p = pane(SAMPLE);
	await sleepFor(p);
	await p.card("2.The basics");
	await p.card("2.Boxes and cylinders");
	await p.tab("Cylinders");
	const saved = norm(p.view.getState());
	assert.deepEqual(saved, { file: "Note.booklet.md", version: 1, screen: "activity:basics/shapes", tab: "cylinders", part: 0 });
	p.close();

	const q = pane(SAMPLE, { state: saved });
	await sleepFor(q);
	assert.equal(q.screen, "activity:basics/shapes");
	assert.equal(q.tabOn(), "Cylinders");
	assert.deepEqual(norm(q.view.getState()), saved);
	q.close();

	// a state from another version of the plugin, or one naming an activity the note no longer has, opens where the note opens
	const odd = pane(SAMPLE, { state: { file: "Note.booklet.md", version: 9, screen: "activity:basics/shapes", part: 1 } });
	await sleepFor(odd);
	assert.equal(odd.screen, "home");
	odd.close();
	const gone = pane(SAMPLE, { state: { file: "Note.booklet.md", version: 1, screen: "activity:basics/vanished", part: 0 } });
	await sleepFor(gone);
	assert.equal(gone.screen, "home");
	gone.close();
});

test("the place is kept when a pane toggles to Markdown and back: the leaf remembers it in memory only", async () => {
	const p = pane(SAMPLE, { screen: "activity:basics/lines" });
	await sleepFor(p);
	await p.pageNext();
	const leaf = p.leaf;
	p.view.unload();
	// the same leaf shows the note again, with no state handed over
	const view2 = new BookletView(leaf, { setMode: async () => {} });
	view2.file = { path: "Note.booklet.md", basename: "Note.booklet" };
	view2.load();
	view2.setViewData(SAMPLE, true);
	await sleep(15);
	assert.equal(view2.contentEl.querySelector(".booklet-page").getAttribute("data-booklet-screen"), "activity:basics/lines");
	assert.match(view2.contentEl.querySelector(".booklet-pager-at").textContent, /Page 2 of 3/);
	view2.unload();
});

/* ---- nothing about the place is written into the note ---- */

test("no move writes anything into a note: three made-up notes are byte-for-byte the same after every move", async () => {
	const notes = {
		sampler: SAMPLE,
		tabbed: `---\nbooklet: "0.16"\ntitle: Tabs and pages\n---\n\n> [!activity|a] A\n\n> [!tab] One\n\nOne p1\n***\nOne p2\n\n> [!tab] Two\n\nTwo p1\n\n> [!activity|b parent:a] B\n\nUnder A.\n`,
		kept: (() => {
			let t = `---\nbooklet: "0.16"\ntitle: A daily note\n---\n\n> [!module|d] Day\n\n> [!activity|today repeat daily] Today\n\n> [!text|what] What happened?\n\n> [!activity|other] Other\n\nWords.\n\n> [!module|d end] E\n`;
			t = core.setDraftAnswer(t, "d", "today", "what", "A walk");
			return core.finalizeDraft(t, "d", "today", { ts: "2026-10-20T09:00:00Z" }).text;
		})(),
	};
	for (const [name, text] of Object.entries(notes)) {
		const p = pane(text);
		await sleepFor(p);
		const before = sha(p.disk.text);
		// a run of every move the screen offers, for as long as there is a card, tab, page or link to press
		const seen = new Set();
		for (let i = 0; i < 40; i++) {
			const targets = [...p.all(".booklet-cardrow"), ...p.all(".booklet-tabbtn:not(.is-active)"), ...p.all(".booklet-pager button"), ...p.all(".booklet-trail-link")];
			const key = `${p.screen}|${p.tabOn()}|${p.pager().at}`;
			seen.add(key);
			const next = targets[i % Math.max(1, targets.length)];
			if (!next) break;
			next.dispatchEvent(new w.MouseEvent("click", { bubbles: true, cancelable: true }));
			await p.settled();
			if (p.hist.back.length > 3 && i % 5 === 4) await p.back();
		}
		await p.back().catch(() => {});
		await p.forward().catch(() => {});
		await p.settled();
		assert.ok(seen.size > 3, `${name}: the run visited ${seen.size} places`);
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
		const text = `---\nbooklet: "0.16"\ntitle: Links\n---\n\n> [!module|one] One\n\n> [!activity|a] Alpha\n\nSee [[#Beta]] and [[#Nowhere at all]] and [[two.booklet]] and [[three.booklet|the third]].\n\n> [!activity|b] Beta\n\nBeta words.\n\n> [!module|one end] E\n\n> [!module|two] Two\n\n> [!activity|c] Gamma\n\nGamma words.\n\n> [!activity|d] Delta\n\nMore.\n\n> [!module|two end] E\n`;
		const p = pane(text, { screen: "activity:one/a" });
		await sleepFor(p);
		const links = p.all(".booklet-pagebody a");
		const kinds = links.map((a) => a.getAttribute("data-href"));
		assert.deepEqual(kinds, ["#Beta", "two.booklet"], "the dead heading link is plain words");
		assert.match(p.words(p.el.querySelector(".booklet-pagebody")), /and Nowhere at all and/);
		assert.match(p.words(p.el.querySelector(".booklet-module-chip")), /^the third · not in this booklet$/);
		// a heading link: the place its words name
		links[0].dispatchEvent(new w.MouseEvent("click", { bubbles: true, cancelable: true }));
		await p.settled();
		assert.equal(p.screen, "activity:one/b");
		assert.equal(p.hist.back.length, 1, "a heading link that moves is a step");
		await p.back();
		assert.equal(p.screen, "activity:one/a");
		// a link to a module the booklet holds: its screen (a module of two activities has one)
		p.all(".booklet-pagebody a")[1].dispatchEvent(new w.MouseEvent("click", { bubbles: true, cancelable: true }));
		await p.settled();
		assert.equal(p.screen, "module:two");
		assert.equal(p.disk.writes, 0);
		p.close();
	} finally {
		delete globalThis.__bookletStubRender;
	}
});
