/*
 * The settings page on Obsidian 1.13 and later: BookletSettingTab.getSettingDefinitions() declares the rows so that the settings
 * search finds them, and each row's `render` draws it with the same code as display() (src/settings.ts, AllowPage). Before 1.13
 * nothing calls getSettingDefinitions and display() draws the page. These tests draw the page both ways over the stub (test/obsidian-stub.mjs)
 * and look for the same DOM and the same behaviour. They cannot say how Obsidian 1.13 lays the declared rows out: that is measured in the real app.
 */
import { window as w, click, words, typeInto, press } from "./dom.mjs";
import test from "node:test";
import assert from "node:assert/strict";

const { BookletSettingTab, MediaAllows } = await import("./.build/media.mjs");
const { Notice, Setting, PluginSettingTab } = await import("./obsidian-stub.mjs");

const doc = w.document;
const btn = (el, text) => Array.from(el.querySelectorAll("button")).find((b) => words(b) === text);
const liveOf = (el) => el.querySelector('[role="status"][aria-live="polite"]');
const remove = (el, host) => el.querySelector(`button[aria-label="Remove ${host}"]`);

/** The page drawn as the app does it: by display() ("old", Obsidian before 1.13), or by each definition's render ("new", 1.13 and later). */
function page(how, raw = null) {
	const media = new MediaAllows(raw, () => {});
	const t = new BookletSettingTab({}, {}, media);
	doc.body.appendChild(t.containerEl);
	const cleanups = [];
	if (how === "old") t.display();
	else {
		// what Obsidian does with the definitions: a row for each, handed to its render
		t.containerEl.classList.add("booklet-settings");
		for (const d of t.getSettingDefinitions()) {
			assert.equal(typeof d.render, "function", `${d.name} is drawn by render`);
			const c = d.render(new Setting(t.containerEl), { listEl: t.containerEl });
			if (typeof c === "function") cleanups.push(c);
		}
	}
	return { media, t, el: t.containerEl, cleanups, done: () => (t.hide(), t.containerEl.remove()) };
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

test("getSettingDefinitions gives the declared rows, and their search text has the words a reader would look for", () => {
	const { t, done } = page("old");
	const defs = t.getSettingDefinitions();
	assert.deepEqual(defs.map((d) => d.name), ["Allowed sites", "Add a site", "Suggested services"]);
	const text = (d) => [d.name, typeof d.desc === "string" ? d.desc : "", ...(d.aliases ?? [])].join(" ").toLowerCase();
	for (const word of ["allowed sites", "add a site", "add suggested services", "allow", "media", "hosts", "youtube.com", "remove", "audio", "video"])
		assert.ok(defs.some((d) => text(d).includes(word)), `a row can be found by "${word}"`);
	assert.match(text(defs[0]), /a note can never allow a site for you/, "the explanation is in the search text");
	for (const d of defs) {
		assert.equal(d.searchable, undefined, "none is hidden from search");
		assert.equal(d.visible, undefined, "none is hidden from the page");
	}
	done();
});

test("the rows drawn by render are the same DOM as display() draws, for an empty list and for a list", () => {
	for (const raw of [null, { allowedMediaHosts: ["youtube.com", "a-long-host-name.media.example.org"] }]) {
		const a = page("old", raw);
		const b = page("new", raw);
		assert.equal(b.el.innerHTML, a.el.innerHTML);
		assert.equal(b.el.className, a.el.className);
		assert.match(words(b.el), /A note can never allow a site for you/);
		assert.deepEqual(Array.from(b.el.querySelectorAll("button")).map(words), Array.from(a.el.querySelectorAll("button")).map(words));
		a.done();
		b.done();
	}
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

test("on the declared path: the words said, the focus, the error line and the label of each Remove are what the accessibility pass measured", () => {
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

test("a change made elsewhere redraws only the list on the declared path, and a row's cleanup and hide() stop it listening", () => {
	const s = page("new", { allowedMediaHosts: ["a.example.org"] });
	const input = s.el.querySelector('input[type="text"]');
	input.focus();
	s.media.addVault("b.example.org");
	assert.equal(s.el.querySelector('input[type="text"]'), input);
	assert.equal(doc.activeElement, input);
	assert.ok(remove(s.el, "b.example.org"));
	// the cleanups the rows gave back take their parts away
	for (const c of s.cleanups) c();
	assert.equal(s.el.querySelector('[role="alert"]'), null);
	assert.equal(remove(s.el, "a.example.org"), null, "the list is gone with its row's cleanup");
	const before = s.el.innerHTML;
	s.media.addVault("c.example.org");
	assert.equal(s.el.innerHTML, before, "and it no longer listens");
	// hide() alone does the same, and twice does no harm
	const h = page("new", { allowedMediaHosts: ["a.example.org"] });
	h.t.hide();
	const was = h.el.innerHTML;
	h.media.addVault("z.example.org");
	assert.equal(h.el.innerHTML, was);
	h.t.hide();
	s.done();
	h.done();
});

test("a call made only to index the search draws nothing and listens to nothing", () => {
	const media = new MediaAllows(null, () => {});
	const t = new BookletSettingTab({}, {}, media);
	const before = t.containerEl.innerHTML;
	t.getSettingDefinitions();
	t.getSettingDefinitions();
	media.addVault("youtube.com");
	assert.equal(t.containerEl.innerHTML, before);
	t.containerEl.remove();
});

test("before 1.13 the tab is display() alone: the definitions are empty, nothing calls them, and the page is the same as ever", () => {
	assert.equal(PluginSettingTab.prototype.getSettingDefinitions, undefined, "the stub, like Obsidian 1.11.7, has no such method");
	assert.equal(Object.getPrototypeOf(BookletSettingTab.prototype).getSettingDefinitions, undefined, "so the tab's own is the only one");
	const a = page("old", { allowedMediaHosts: ["youtube.com"] });
	globalThis.__bookletStubApiVersion = "1.11.7";
	try {
		assert.deepEqual(a.t.getSettingDefinitions(), [], "asked on an older app it gives nothing, so display() is the page");
		const b = page("old", { allowedMediaHosts: ["youtube.com"] });
		assert.equal(b.el.innerHTML, a.el.innerHTML);
		b.done();
		globalThis.__bookletStubApiVersion = "1.13.0";
		assert.equal(a.t.getSettingDefinitions().length, 3, "1.13.0 is the first that has them");
	} finally {
		delete globalThis.__bookletStubApiVersion;
	}
	a.done();
});
