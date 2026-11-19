/*
 * The settings page on Obsidian 1.13 and later: BookletSettingTab.getSettingDefinitions() gives ONE navigable entry (a `page`
 * definition) so that the settings search finds it, and the page it opens is drawn with the same code as display() (src/settings.ts,
 * AllowPage) into a container of its own. Before 1.13 nothing calls getSettingDefinitions and display() draws the page. These tests
 * draw the page both ways over the stub (test/obsidian-stub.mjs) and look for the same DOM and the same behaviour. They cannot say
 * how Obsidian lays the entry and the page out, or what its search looks in: that is measured in the real app
 * (e2e-tests/settings-search-103.js, and checks 50 and 58 of plugin-check.js). The first design here drew three `render` rows and put
 * the list, the error line and the status message beside them as sibling divs; Obsidian 1.14.5 drops such siblings, and the stub
 * (which cannot) had let it pass. Besides that entry the tab gives the Booklet look row (a `render` definition, tested in test/look.test.mjs);
 * `entries` below leaves it out, so these tests read as they did.
 */
import { window as w, click, words, typeInto, press } from "./dom.mjs";
import test from "node:test";
import assert from "node:assert/strict";

const { BookletSettingTab, MediaAllows } = await import("./.build/media.mjs");
const { Notice, Setting, PluginSettingTab } = await import("./obsidian-stub.mjs");

const doc = w.document;
/** The entries the tab gives besides the look row: the one navigable entry, whose page is the allow list. */
const entries = (t) => t.getSettingDefinitions().filter((d) => !d.render);
const btn = (el, text) => Array.from(el.querySelectorAll("button")).find((b) => words(b) === text);
const liveOf = (el) => el.querySelector('[role="status"][aria-live="polite"]');
const remove = (el, host) => el.querySelector(`button[aria-label="Remove ${host}"]`);

/**
 * The page drawn as the app does it: by display() ("old", Obsidian before 1.13), or as the entry's page ("new", 1.13 and later: the
 * app calls the definition's `page()` for each time the entry is opened, then display() on what it gave, and hide() when it leaves).
 */
function page(how, raw = null) {
	const media = new MediaAllows(raw, () => {});
	const t = new BookletSettingTab({}, {}, media);
	doc.body.appendChild(t.containerEl);
	if (how === "old") {
		t.display();
		// the Booklet look row and the "Open booklets in" row sit above the allow list's rows; these tests are about the list (the look row has test/look.test.mjs, the other test/design-view.test.mjs)
		t.containerEl.querySelector(".booklet-look-row")?.remove();
		t.containerEl.querySelector(".booklet-openin-row")?.remove();
		return { media, t, el: t.containerEl, done: () => (t.hide(), t.containerEl.remove()) };
	}
	const defs = entries(t);
	assert.equal(defs.length, 1, "one entry");
	assert.equal(defs[0].type, "page");
	const p = defs[0].page();
	p.display();
	return { media, t, el: p.containerEl, p, def: defs[0], done: () => (p.hide(), p.rootEl.remove(), t.hide(), t.containerEl.remove()) };
}

/** The same reader, the same steps, on a page: adds, a duplicate, an error, removes, the suggestions. Gives what she could see and hear after each. */
function walk(s) {
	const out = [];
	doc.activeElement?.blur?.();
	const see = (what) => out.push({ what, html: s.el.innerHTML, active: doc.activeElement?.getAttribute?.("aria-label") ?? doc.activeElement?.tagName, list: s.media.vaultList() });
	const input = s.el.querySelector('input[type="text"]');
	see("start");
	typeInto(input, "d.example.org");
	press(input, "Enter");
	see("added with Enter");
	typeInto(input, "D.example.org");
	click(btn(s.el, "Add"));
	see("duplicate");
	typeInto(input, "http://nope.example.org");
	press(input, "Enter");
	see("error");
	typeInto(input, "");
	click(remove(s.el, "b.example.org"));
	see("removed the middle");
	click(remove(s.el, "d.example.org"));
	see("removed the last");
	click(remove(s.el, "c.example.org"));
	click(remove(s.el, "a.example.org"));
	see("removed all");
	click(btn(s.el, "Add suggested services"));
	see("suggested");
	click(btn(s.el, "Add suggested services"));
	see("suggested again");
	return out;
}

test("getSettingDefinitions gives one entry, and the words a reader would search for are in its name (the search looks in the name only)", () => {
	const { t, done } = page("old");
	const defs = entries(t);
	assert.equal(defs.length, 1);
	const d = defs[0];
	assert.equal(d.type, "page");
	assert.equal(typeof d.page, "function", "the page is drawn by our SettingPage, not by nested definitions");
	assert.equal(d.items, undefined);
	for (const word of ["allow", "site", "suggested"]) assert.ok(d.name.toLowerCase().includes(word), `the name has "${word}"`);
	assert.equal(d.visible, undefined, "it is not hidden");
	assert.match(typeof d.desc === "string" ? d.desc : "", /youtube\.com/, "the description says what is on the page");
	done();
});

test("the entry says how many sites are allowed, read each time it is drawn", () => {
	const none = page("new");
	assert.equal(none.def.displayValue(), "None");
	none.media.addVault("a.example.org");
	assert.equal(none.def.displayValue(), "1 site");
	none.media.addVault("b.example.org");
	assert.equal(none.def.displayValue(), "2 sites");
	none.done();
});

test("the page the entry opens has the same DOM as display() draws, for an empty list and for a list, and has the page class on its container", () => {
	for (const raw of [null, { allowedMediaHosts: ["youtube.com", "a-long-host-name.media.example.org"] }]) {
		const a = page("old", raw);
		const b = page("new", raw);
		assert.equal(b.el.innerHTML, a.el.innerHTML);
		assert.ok(b.el.classList.contains("booklet-settings"), "styles.css rules (44 px targets, wrapping, placeholder contrast) hang on this class, so it is on the page's container");
		assert.ok(a.el.classList.contains("booklet-settings"));
		assert.equal(b.p.title, "Allow list");
		assert.match(words(b.el), /A note can never allow a site for you/);
		assert.deepEqual(Array.from(b.el.querySelectorAll("button")).map(words), Array.from(a.el.querySelectorAll("button")).map(words));
		a.done();
		b.done();
	}
});

test("every row of the page is inside the element that has the page class (the list, the error line and the status message among them)", () => {
	const b = page("new", { allowedMediaHosts: ["a.example.org"] });
	const holder = b.el.closest(".booklet-settings");
	assert.equal(holder, b.el);
	for (const sel of ['input[aria-label="Add a site"]', 'button[aria-label="Remove a.example.org"]', '[role="alert"]', '[role="status"][aria-live="polite"]'])
		assert.ok(holder.querySelector(sel), `${sel} is under the page class`);
	assert.equal(b.t.containerEl.querySelector("input"), null, "and nothing is drawn into the tab itself");
	b.done();
});

test("add, a duplicate, an error, Remove with the focus after it, and the suggestions behave the same on both paths", () => {
	Notice.said.length = 0;
	const raw = { allowedMediaHosts: ["a.example.org", "b.example.org", "c.example.org"] };
	const a = page("old", raw);
	const old = walk(a);
	const said = Notice.said.splice(0);
	const b = page("new", raw);
	const now = walk(b);
	assert.deepEqual(Notice.said.splice(0), said);
	assert.deepEqual(now, old);
	a.done();
	b.done();
});

test("on the page: the words said, the focus, the error line and the label of each Remove are what the accessibility pass measured", () => {
	const s = page("new", { allowedMediaHosts: ["a.example.org", "b.example.org", "c.example.org"] });
	const input = s.el.querySelector('input[type="text"]');
	const live = liveOf(s.el);
	const alert = s.el.querySelector('[role="alert"]');
	assert.ok(live && alert, "the live region and the alert line are on the page");
	assert.equal(input.getAttribute("aria-label"), "Add a site");
	assert.equal(remove(s.el, "b.example.org").textContent, "Remove");
	typeInto(input, "d.example.org");
	press(input, "Enter");
	assert.equal(words(live), "Added d.example.org");
	assert.equal(doc.activeElement, input);
	assert.equal(input.value, "");
	assert.equal(s.el.querySelector('input[type="text"]'), input, "the box is not drawn again");
	typeInto(input, "d.example.org");
	click(btn(s.el, "Add"));
	assert.equal(words(live), "d.example.org is already on the list");
	typeInto(input, "http://nope.example.org");
	press(input, "Enter");
	assert.equal(words(alert), "Only https sites can be allowed.");
	click(remove(s.el, "b.example.org"));
	assert.equal(doc.activeElement, remove(s.el, "c.example.org"), "focus goes to the next Remove");
	assert.equal(words(live), "Removed b.example.org");
	click(remove(s.el, "d.example.org"));
	assert.equal(doc.activeElement, remove(s.el, "c.example.org"), "the last one removed: the one before");
	click(remove(s.el, "c.example.org"));
	click(remove(s.el, "a.example.org"));
	assert.equal(doc.activeElement, input, "nothing left: the box");
	s.done();
});

test("a change made elsewhere redraws only the list on the page, and the page's hide() stops it listening", () => {
	const s = page("new", { allowedMediaHosts: ["a.example.org"] });
	const input = s.el.querySelector('input[type="text"]');
	input.focus();
	s.media.addVault("b.example.org");
	assert.equal(s.el.querySelector('input[type="text"]'), input);
	assert.equal(doc.activeElement, input);
	assert.ok(remove(s.el, "b.example.org"));
	s.p.hide();
	assert.equal(s.el.querySelector('[role="alert"]'), null, "the error line is taken away with the page");
	assert.equal(remove(s.el, "a.example.org"), null, "so is the list");
	const before = s.el.innerHTML;
	s.media.addVault("c.example.org");
	assert.equal(s.el.innerHTML, before, "and it no longer listens");
	// hide() twice does no harm; the tab's own hide() after the page's does none either
	s.p.hide();
	s.t.hide();
	s.done();
});

test("each time the entry is opened it is a new page, and the one left listens to nothing", () => {
	const media = new MediaAllows({ allowedMediaHosts: ["a.example.org"] }, () => {});
	const t = new BookletSettingTab({}, {}, media);
	const def = entries(t)[0];
	const one = def.page();
	one.display();
	one.hide();
	const two = def.page();
	assert.notEqual(one, two);
	two.display();
	const listening = media.listeners.size;
	assert.ok(listening > 0, "the open page listens to the list");
	two.hide();
	assert.equal(media.listeners.size, 0, "hide() takes every listener away (the list draws into a div that is gone, so the DOM cannot show a leak)");
	two.display();
	assert.equal(media.listeners.size, listening, "and a page drawn again listens as before");
	media.addVault("b.example.org");
	assert.equal(remove(one.containerEl, "b.example.org"), null, "the page that was left does not follow the list");
	assert.ok(remove(two.containerEl, "b.example.org"));
	two.hide();
	one.rootEl.remove();
	two.rootEl.remove();
	t.containerEl.remove();
});

test("a page drawn again without being hidden does not keep the first draw's listeners", () => {
	const media = new MediaAllows({ allowedMediaHosts: ["a.example.org"] }, () => {});
	const t = new BookletSettingTab({}, {}, media);
	const p = entries(t)[0].page();
	p.display();
	const once = media.listeners.size;
	p.display();
	p.display();
	assert.equal(media.listeners.size, once, "Obsidian calls display() again on a page that is already open");
	p.hide();
	assert.equal(media.listeners.size, 0);
	p.rootEl.remove();
	t.containerEl.remove();
});

test("a call made only to index the search draws nothing and listens to nothing", () => {
	const media = new MediaAllows(null, () => {});
	const t = new BookletSettingTab({}, {}, media);
	const before = t.containerEl.innerHTML;
	const pagesBefore = doc.querySelectorAll(".setting-page").length;
	t.getSettingDefinitions();
	t.getSettingDefinitions();
	media.addVault("youtube.com");
	assert.equal(t.containerEl.innerHTML, before);
	assert.equal(doc.querySelectorAll(".setting-page").length, pagesBefore, "no page is made until the entry is opened");
	t.containerEl.remove();
});

test("before 1.13 the tab is display() alone: the definitions are empty, nothing calls them, SettingPage is never made, and the page is the same as ever", () => {
	assert.equal(PluginSettingTab.prototype.getSettingDefinitions, undefined, "the stub, like Obsidian 1.11.7, has no such method");
	assert.equal(Object.getPrototypeOf(BookletSettingTab.prototype).getSettingDefinitions, undefined, "so the tab's own is the only one");
	const a = page("old", { allowedMediaHosts: ["youtube.com"] });
	globalThis.__bookletStubApiVersion = "1.11.7";
	try {
		assert.deepEqual(a.t.getSettingDefinitions(), [], "asked on an older app it gives nothing, so display() is the page");
		const b = page("old", { allowedMediaHosts: ["youtube.com"] });
		assert.equal(b.el.innerHTML, a.el.innerHTML);
		assert.ok(b.el.classList.contains("booklet-settings"));
		b.done();
		globalThis.__bookletStubApiVersion = "1.13.0";
		assert.equal(entries(a.t).length, 1, "1.13.0 is the first that has them");
	} finally {
		delete globalThis.__bookletStubApiVersion;
	}
	a.done();
});
