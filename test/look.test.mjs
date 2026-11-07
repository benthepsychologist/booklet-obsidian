/*
 * Which look a booklet view is drawn in (src/look.ts): Paper and petrol in the variant that matches Obsidian's mode until the reader
 * chooses; her choice in the settings after that; and the view menu's choice for one view alone on top of both. Then the settings
 * row that makes the choice, over the stub, on both paths the settings page supports, and the attribute a view puts on its root.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { window as w } from "./dom.mjs";

const { resolveLook, flipViewLook, isLook, LOOKS, LOOK_LABELS } = await import("./.build/look.mjs");
const { BookletSettingTab, MediaAllows } = await import("./.build/media.mjs");
const { BookletView } = await import("./.build/view.mjs");

test("until the reader chooses, the default is Paper and petrol in the variant that matches Obsidian's mode", () => {
	assert.equal(resolveLook(undefined, false), "paper-light");
	assert.equal(resolveLook(undefined, true), "paper-dark");
	for (const bad of [null, "", "paper", "Obsidian", 3, {}]) assert.equal(resolveLook(bad, true), "paper-dark", `${String(bad)} is not a choice`);
});

test("a look chosen in the settings is used, in either mode", () => {
	for (const look of LOOKS) for (const dark of [false, true]) assert.equal(resolveLook(look, dark), look);
});

test("the view's own choice wins for that view, and nothing leaves the view with the settings' look", () => {
	assert.equal(resolveLook(undefined, false, "obsidian"), "obsidian");
	assert.equal(resolveLook("paper-dark", false, "obsidian"), "obsidian");
	assert.equal(resolveLook("obsidian", true, "paper"), "paper-dark", "the Booklet look for a view whose settings say Obsidian: the one that matches the mode");
	assert.equal(resolveLook("obsidian", false, "paper"), "paper-light");
	assert.equal(resolveLook("paper-light", true, "paper"), "paper-light", "a paper look chosen in the settings is the paper look of the view");
	assert.equal(resolveLook("paper-dark", false, undefined), "paper-dark");
});

test("the menu item flips this view and back, and a view that is back where the settings put it follows them again", () => {
	// themes on by default
	let v = flipViewLook(undefined, false, undefined);
	assert.equal(v, "obsidian");
	assert.equal(resolveLook(undefined, false, v), "obsidian");
	v = flipViewLook(undefined, false, v);
	assert.equal(v, undefined, "toggled back: no choice is kept");
	assert.equal(resolveLook(undefined, false, v), "paper-light");
	// the settings say Obsidian
	v = flipViewLook("obsidian", true, undefined);
	assert.equal(v, "paper");
	assert.equal(resolveLook("obsidian", true, v), "paper-dark");
	assert.equal(flipViewLook("obsidian", true, v), undefined);
	// a view put on Obsidian that follows the default: the mode changing while it is open keeps it on Obsidian
	assert.equal(resolveLook(undefined, true, "obsidian"), "obsidian");
});

test("the three looks have a label each, and only they are looks", () => {
	assert.deepEqual(
		LOOKS.map((l) => LOOK_LABELS[l]),
		["Paper and petrol: light", "Paper and petrol: dark", "Obsidian"],
	);
	assert.ok(LOOKS.every(isLook));
	assert.ok(!isLook("paper") && !isLook(undefined));
});

test("the look is kept in the plugin's data beside the lists, and a value that is not a look is neither used nor lost", () => {
	const saved = [];
	const m = new MediaAllows({ allowedMediaHosts: ["youtube.com"], other: 1 }, (d) => saved.push(d));
	assert.equal(m.look(), undefined);
	assert.equal("look" in m.toData(), false, "no choice, no key");
	let told = 0;
	m.onLookChange(() => told++);
	m.setLook("paper-dark");
	m.setLook("paper-dark");
	assert.equal(told, 1, "told once, and not for a choice that is the same");
	assert.equal(m.toData().look, "paper-dark");
	assert.deepEqual(m.vaultList(), ["youtube.com"]);
	assert.equal(m.toData().other, 1);
	assert.equal(new MediaAllows(m.toData(), () => {}).look(), "paper-dark", "and it is read back");
	const odd = new MediaAllows({ look: "sepia" }, () => {});
	assert.equal(odd.look(), undefined);
	assert.equal(odd.toData().look, "sepia", "written back as it was");
});

const { Setting } = await import("./obsidian-stub.mjs");
const doc = w.document;
const lookRow = (el) => el.querySelector(".booklet-look-row");

/** The settings page as Obsidian before 1.13 draws it (display()), and the look row as 1.13 and later draw it (the definition's render). */
function rows(how, raw = null) {
	const media = new MediaAllows(raw, () => {});
	const t = new BookletSettingTab({}, {}, media);
	doc.body.appendChild(t.containerEl);
	if (how === "old") {
		t.display();
		return { media, row: lookRow(t.containerEl), done: () => (t.hide(), t.containerEl.remove()) };
	}
	const def = t.getSettingDefinitions().find((d) => d.render);
	assert.ok(def, "the look is a definition of its own");
	assert.equal(def.name, "Booklet look");
	assert.match(def.desc, /Paper and petrol/);
	const host = doc.createElement("div");
	doc.body.appendChild(host);
	const setting = new Setting(host);
	def.render(setting, {});
	return { media, row: lookRow(host), done: () => (t.hide(), t.containerEl.remove(), host.remove()) };
}

for (const how of ["old", "new"]) {
	test(`settings, ${how === "old" ? "display() before 1.13" : "getSettingDefinitions() from 1.13"}: a dropdown of the three looks that shows the look in force and keeps a choice`, () => {
		const s = rows(how);
		assert.ok(s.row, "the row is drawn");
		assert.equal(s.row.querySelector(".setting-item-name").textContent, "Booklet look");
		assert.match(s.row.querySelector(".setting-item-description").textContent, /Obsidian uses your Obsidian theme, as before\./);
		const select = s.row.querySelector("select");
		assert.equal(select.getAttribute("aria-label"), "Booklet look");
		assert.equal(select.value, "paper-light", "the default, in a light Obsidian");
		select.value = "obsidian";
		select.dispatchEvent(new w.Event("input"));
		assert.equal(s.media.look(), "obsidian", "the choice is kept");
		s.done();
	});
}

test("settings: with Obsidian dark and no choice, the dropdown shows the dark look", () => {
	doc.body.classList.add("theme-dark");
	try {
		const s = rows("old");
		assert.equal(s.row.querySelector("select").value, "paper-dark");
		s.done();
	} finally {
		doc.body.classList.remove("theme-dark");
	}
});

test("a view puts the look on its root, follows the settings at once, and its menu item flips this view alone", () => {
	const media = new MediaAllows(null, () => {});
	const mk = (m = media) => {
		const events = new Map();
		const app = { workspace: { on: (name, fn) => (events.set(name, fn), { name }), trigger: () => {} }, vault: { on: () => ({}) }, metadataCache: {} };
		const leaf = { app };
		const view = new BookletView(leaf, { setMode: async () => {}, manifest: { version: "9.8.7" }, media: m });
		return { view, events };
	};
	const item = (view) => {
		const items = [];
		const menu = { addItem: (cb) => { const it = { title: "", setTitle(t) { this.title = t; return this; }, setIcon() { return this; }, setSection() { return this; }, onClick(f) { this.f = f; return this; } }; cb(it); items.push(it); } };
		view.onPaneMenu(menu, "tab-header");
		return items[1];
	};
	const a = mk();
	const b = mk();
	a.view.load();
	b.view.load();
	a.view.applyLook();
	b.view.applyLook();
	assert.equal(a.view.contentEl.getAttribute("data-booklet-look"), "paper-light", "on by default");
	assert.equal(item(a.view).title, "Use Obsidian's look in this view");
	item(a.view).f();
	assert.equal(a.view.contentEl.getAttribute("data-booklet-look"), "obsidian");
	assert.equal(b.view.contentEl.getAttribute("data-booklet-look"), "paper-light", "the other view is not touched");
	assert.equal(item(a.view).title, "Use the Booklet look in this view");
	media.setLook("paper-dark");
	a.view.applyLook();
	b.view.applyLook();
	assert.equal(a.view.contentEl.getAttribute("data-booklet-look"), "obsidian", "a view put on Obsidian stays there");
	assert.equal(b.view.contentEl.getAttribute("data-booklet-look"), "paper-dark");
	item(a.view).f();
	assert.equal(a.view.contentEl.getAttribute("data-booklet-look"), "paper-dark", "and back");
	// Obsidian's mode changes and the reader has not chosen: the css-change event brings the matching look
	const fresh = new MediaAllows(null, () => {});
	const c = mk(fresh);
	c.view.load();
	c.view.applyLook();
	assert.equal(c.view.contentEl.getAttribute("data-booklet-look"), "paper-light");
	doc.body.classList.add("theme-dark");
	try {
		c.events.get("css-change")();
		assert.equal(c.view.contentEl.getAttribute("data-booklet-look"), "paper-dark");
	} finally {
		doc.body.classList.remove("theme-dark");
	}
});
