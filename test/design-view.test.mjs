/*
 * The Design view (stage B1), run in node over jsdom with the stand-in for Obsidian (test/obsidian-stub.mjs): the third mode and its
 * wiring; the tree drawn level by level; the strict "+ Add"; delete, move and insert written as the smallest replacement and nothing else;
 * the question before a change that detaches kept data; the view's own undo and redo. This says what the view does with the pieces
 * Obsidian is stood in for; how it looks and how Obsidian lays its header out is measured in the real app, which this is not.
 */
import { window as w, click, words, until, testApp } from "./dom.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { core, bookletAround, ROOT } from "./helpers.mjs";
import { HELD } from "./editor-fixture.mjs";
import { ALL, BARE, FULL, UNREAD, crlf, lineOf } from "./design-fixtures.mjs";
import { FileView, MarkdownView } from "./obsidian-stub.mjs";
import { openDesign, fakePane, EVERY_ICON } from "./design-harness.mjs";

const { DesignView, DESIGN_VIEW_TYPE, BookletView, BookletPlugin, MediaAllows, installViewSwitch, setLeafMode, leafModeFor, WorkspaceLeaf, Modal } = await import("./.build/view.mjs");
const { BookletSettingTab, MediaAllows: SettingsAllows } = await import("./.build/media.mjs");
const { parseDesign, walkDesign, levelOf, nameOf, crumbOf, minimalChange, insertPiece, deleteBlock, moveBlock, positionBefore, positionAfter, positionIn, applyChange, PIECES, DESIGN_STRINGS, LEVELS, LEVEL_ICONS, iconNamesOf, addChoices, containerAdds, canPlacePiece, WORDS_PIECE } = core;

const doc = w.document;
const piece = (file) => PIECES.find((p) => p.file === file);

const open = openDesign;

/** The dialog the view opened, if there is one. */
const dialog = () => doc.querySelector(".booklet-design-ask");
const press = (el, label) => {
	const b = [...el.querySelectorAll("button")].find((x) => words(x) === label);
	assert.ok(b, `no button reading ${label}`);
	click(b);
};

/** Every byte outside the change is what it was, the change is what the operation says, and the write was one `vault.process`. */
function assertMinimal(before, after, expected) {
	assert.equal(after, expected, "the note is exactly what the operation made");
	const c = minimalChange(before, after);
	assert.ok(c, "something changed");
	assert.equal(applyChange(before, c), after);
	assert.equal(after.slice(0, c.from), before.slice(0, c.from));
	assert.equal(after.slice(after.length - (before.length - c.to)), before.slice(c.to));
}

/* ======================================================================== the third mode ======================================================================== */

/** The view switch over a leaf class whose own setViewState records what reaches it. */
function switchRig({ opensIn = () => "booklet", booklet = true } = {}) {
	const seen = [];
	const proto = WorkspaceLeaf.prototype;
	const orig = proto.setViewState;
	proto.setViewState = async function (state) {
		seen.push({ leaf: this, type: state.type, file: state.state?.file });
	};
	const app = {
		vault: { getFileByPath: (p) => ({ path: p, extension: "md" }) },
		metadataCache: { getFileCache: () => ({ frontmatter: booklet ? { booklet: "0.20" } : {} }) },
	};
	const regs = [];
	installViewSwitch({ app, register: (f) => regs.push(f) }, { booklet: "booklet", design: "booklet-design" }, opensIn);
	return {
		seen,
		leaf: () => new WorkspaceLeaf(),
		off() {
			for (const f of regs) f();
			proto.setViewState = orig;
		},
	};
}

test("by default a booklet note opens in the Booklet view; the Design view is a choice", async () => {
	const rig = switchRig();
	try {
		const leaf = rig.leaf();
		await leaf.setViewState({ type: "markdown", state: { file: "A.md" } });
		assert.equal(rig.seen.at(-1).type, "booklet");
		// the settings object's own default is the Booklet view, and a data.json that never named one stays as it was
		const media = new MediaAllows(null, () => {});
		assert.equal(media.openIn(), "booklet");
		assert.equal("openIn" in media.toData(), false);
		assert.equal(new MediaAllows({ openIn: "elsewhere", keep: 1 }, () => {}).openIn(), "booklet", "a value that is no view is not a choice");
		assert.equal(new MediaAllows({ openIn: "elsewhere", keep: 1 }, () => {}).toData().openIn, "elsewhere", "and is kept as it was");
	} finally {
		rig.off();
	}
});

test("the setting 'Open booklets in' sends a note to the Design view, read at each opening", async () => {
	let opensIn = "design";
	const rig = switchRig({ opensIn: () => opensIn });
	try {
		await rig.leaf().setViewState({ type: "markdown", state: { file: "A.md" } });
		assert.equal(rig.seen.at(-1).type, DESIGN_VIEW_TYPE);
		assert.equal(DESIGN_VIEW_TYPE, "booklet-design");
		opensIn = "booklet";
		await rig.leaf().setViewState({ type: "markdown", state: { file: "A.md" } });
		assert.equal(rig.seen.at(-1).type, "booklet", "changed in the settings: the next opening follows at once");
	} finally {
		rig.off();
	}
});

test("a leaf keeps the mode a button gave it, for its note, in every one of the three", async () => {
	const rig = switchRig({ opensIn: () => "booklet" });
	try {
		const a = rig.leaf();
		const b = rig.leaf();
		setLeafMode(a, "A.md", "markdown");
		setLeafMode(b, "A.md", "design");
		await a.setViewState({ type: "markdown", state: { file: "A.md" } });
		await b.setViewState({ type: "markdown", state: { file: "A.md" } });
		assert.deepEqual(
			rig.seen.map((s) => s.type),
			["markdown", "booklet-design"],
			"Markdown stays Markdown; the Design view's leaf opens in the Design view though the settings say Booklet",
		);
		assert.equal(leafModeFor(a, "A.md"), "markdown");
		assert.equal(leafModeFor(b, "A.md"), "design");
		assert.equal(leafModeFor(b, "B.md"), null, "a record is for its note");
		// the Booklet view chosen on a leaf, with the settings on the Design view
		const c = rig.leaf();
		setLeafMode(c, "A.md", "booklet");
		rig.off();
		const rig2 = switchRig({ opensIn: () => "design" });
		try {
			await c.setViewState({ type: "markdown", state: { file: "A.md" } });
			assert.equal(rig2.seen.at(-1).type, "booklet", "a button's choice outranks the setting");
			// the leaf shows another note: its mode resets, and the setting rules again
			await c.setViewState({ type: "markdown", state: { file: "B.md" } });
			assert.equal(rig2.seen.at(-1).type, "booklet-design");
			assert.equal(leafModeFor(c, "A.md"), null);
		} finally {
			rig2.off();
		}
	} finally {
		try {
			rig.off();
		} catch {
			// already off
		}
	}
});

test("a note that is no booklet, and a view that is not Markdown, pass through; unloading the plugin takes the switch off", async () => {
	const rig = switchRig({ booklet: false, opensIn: () => "design" });
	await rig.leaf().setViewState({ type: "markdown", state: { file: "A.md" } });
	assert.equal(rig.seen.at(-1).type, "markdown", "not a booklet: Markdown");
	rig.off();
	const rig2 = switchRig({ opensIn: () => "design" });
	await rig2.leaf().setViewState({ type: "graph", state: {} });
	assert.equal(rig2.seen.at(-1).type, "graph");
	await rig2.leaf().setViewState({ type: "markdown", state: { file: "A.md" } });
	assert.equal(rig2.seen.at(-1).type, "booklet-design");
	rig2.off();
	const after = [];
	WorkspaceLeaf.prototype.setViewState = async (s) => void after.push(s.type);
	await new WorkspaceLeaf().setViewState({ type: "markdown", state: { file: "A.md" } });
	assert.deepEqual(after, ["markdown"], "off: nothing is switched");
});

test("setMode waits for a leaf Obsidian has not loaded yet before it looks at its view", async () => {
	const states = [];
	const plugin = new BookletPlugin({ workspace: {}, vault: {}, metadataCache: {} }, { version: "1" });
	const loaded = new FileView();
	loaded.file = { path: "A.md" };
	const order = [];
	const leaf = {
		view: { placeholder: true },
		loadIfDeferred: async () => {
			order.push("load");
			leaf.view = loaded;
		},
		getViewState: () => ({ type: "markdown", state: { scroll: 3 } }),
		setViewState: async (s) => {
			order.push("set");
			states.push(s);
		},
	};
	await plugin.setMode(leaf, "design");
	assert.deepEqual(order, ["load", "set"], "loaded first: a placeholder is no FileView");
	assert.equal(states[0].type, DESIGN_VIEW_TYPE);
	assert.equal(states[0].state.file, "A.md");
	assert.equal(leafModeFor(leaf, "A.md"), "design");
	leaf.view = { placeholder: true };
	await plugin.setMode(leaf, "booklet");
	assert.equal(states[1].type, "booklet");
	await plugin.setMode(leaf, "markdown");
	assert.equal(states[2].type, "markdown");
	// a pane that cannot be loaded into a view of a file does nothing
	const none = { view: {}, loadIfDeferred: async () => {}, getViewState: () => ({}), setViewState: async () => assert.fail("nothing to set") };
	await plugin.setMode(none, "design");
});

test("every mode has a header button for each of the other two, and Markdown is one of them in every view", async () => {
	globalThis.__bookletStubIcons = EVERY_ICON;
	try {
		// the Design view: Markdown and Booklet
		const d = open(BARE);
		assert.deepEqual(d.actions.map((a) => a.title), ["Show Markdown", "Open as booklet"]);
		d.actions[0].cb();
		d.actions[1].cb();
		assert.deepEqual(d.modes, ["markdown", "booklet"]);
		assert.equal(d.actions[0].icon, "file-text");
		d.close();
		// the Booklet view: Markdown, then (after the editor button, when the host has one) the Design view
		const disk = { text: BARE, writes: 0 };
		const modes = [];
		const bv = new BookletView({ app: testApp(disk) }, { setMode: async (_l, m) => void modes.push(m), manifest: { version: "9" }, media: new MediaAllows(null, () => {}) });
		const titles = [];
		bv.addAction = (icon, title, cb) => (titles.push({ icon, title, cb }), doc.createElement("div"));
		bv.load();
		assert.deepEqual(titles.map((t) => t.title), ["Show Markdown", "Open in Design view"]);
		assert.equal(titles[1].icon, "pencil-ruler");
		titles.forEach((t) => t.cb());
		assert.deepEqual(modes, ["markdown", "design"]);
		bv.unload();
		// Markdown: Booklet and Design, added when the note is a booklet and taken away when it is not
		const mv = new MarkdownView();
		mv.file = { path: "A.md", extension: "md" };
		const made = [];
		mv.addAction = (icon, title, cb) => {
			const el = doc.createElement("div");
			made.push({ icon, title, cb, el });
			doc.body.appendChild(el);
			return el;
		};
		let frontmatter = { booklet: "0.20" };
		const app = { workspace: { iterateAllLeaves: (fn) => fn({ view: mv }) }, vault: {}, metadataCache: { getFileCache: () => ({ frontmatter }) } };
		const plugin = new BookletPlugin(app, { version: "1" });
		const set = [];
		plugin.setMode = async (_l, m) => void set.push(m);
		plugin.refreshMarkdownActions();
		plugin.refreshMarkdownActions();
		assert.deepEqual(made.map((m) => m.title), ["Open as booklet", "Open in Design view"], "once each, however often it is looked at");
		made.forEach((m) => m.cb());
		assert.deepEqual(set, ["booklet", "design"]);
		frontmatter = {};
		plugin.refreshMarkdownActions();
		assert.ok(made.every((m) => !m.el.isConnected), "no longer a booklet: both buttons go");
	} finally {
		delete globalThis.__bookletStubIcons;
	}
});

test("an icon newer than the Obsidian a person runs is not a hole: the next name in its list, else the fallback", () => {
	// an Obsidian whose set has only the old names
	const old = new Set(["book-open", "file-text", "pencil", "square", "file", "layers", "list", "tag", "list-checks"]);
	const v = open(FULL, { icons: old });
	const icons = (level) => v.all(`.booklet-design-nav-row.is-level-${level} .booklet-design-nav-icon svg`).map((s) => s.getAttribute("data-icon"));
	assert.deepEqual(new Set(icons("module")), new Set(["layers"]));
	assert.deepEqual(new Set(icons("activity")), new Set(["list-checks"]));
	assert.deepEqual(new Set(icons("page")), new Set(["file-text"]));
	assert.deepEqual(v.actions.map((a) => a.icon), ["file-text", "book-open"]);
	assert.equal(v.view.getIcon(), "pencil", "the tab's icon falls back to one that has been there for years");
	// the bar's buttons fall back to their words when the set has none of their icons, and are still buttons
	click(v.block("callout", "[!tip]"));
	click(v.editor().querySelector(".booklet-design-cancel"));
	const bar = v.block("callout", "[!tip]").querySelector(".booklet-design-floatbar");
	for (const b of bar.querySelectorAll("button")) assert.ok(b.getAttribute("aria-label") && words(b).length > 0, "no hole: the words stand in for the missing icon");
	// a node with no icon of any of its names is drawn without one, and is still listed
	const none = open(BARE, { icons: new Set() });
	assert.ok(none.all(".booklet-design-nav-row").length >= 3);
	assert.equal(none.all(".booklet-design-nav-icon svg").length, 0);
	none.close();
	v.close();
});

test("the setting 'Open booklets in' is a row on the settings page, with the Booklet view chosen", () => {
	const media = new SettingsAllows(null, () => {});
	const tab = new BookletSettingTab({}, {}, media);
	doc.body.appendChild(tab.containerEl);
	tab.display();
	const row = tab.containerEl.querySelector(".booklet-openin-row");
	assert.ok(row, "the row is there");
	assert.equal(words(row.querySelector(".setting-item-name")), "Open booklets in");
	const select = row.querySelector("select");
	assert.deepEqual([...select.options].map((o) => [o.value, o.textContent]), [["booklet", "Booklet view"], ["design", "Design view"]]);
	assert.equal(select.value, "booklet");
	select.value = "design";
	select.dispatchEvent(new w.Event("input", { bubbles: true }));
	assert.equal(media.openIn(), "design");
	assert.equal(media.toData().openIn, "design", "kept in the plugin's data");
	const again = new SettingsAllows(media.toData(), () => {});
	assert.equal(again.openIn(), "design", "and read back");
	// on Obsidian 1.13 and later the row is one of the tab's definitions
	const defs = tab.getSettingDefinitions().filter((d) => d.render);
	assert.equal(defs.length, 2, "the look row and this one");
	tab.hide();
	tab.containerEl.remove();
});

/* ======================================================================== the canvas drawn ======================================================================== */

test("the navigator lists every part of the note once, nested as the tree is nested, each with its level's icon and its level's colour; the settings come first", () => {
	const v = open(FULL);
	const root = parseDesign(FULL);
	const entries = core.navEntries(root, { title: "A made-up booklet" });
	const rows = v.all(".booklet-design-nav-row");
	assert.equal(rows.length, entries.length, "nothing is left out");
	assert.equal(entries[0].kind, "settings", "the settings entry is first");
	entries.forEach((e, i) => {
		const row = rows[i];
		assert.ok(row.classList.contains(`is-level-${e.level}`), `${e.kind} carries the colour of its level`);
		assert.equal(row.getAttribute("aria-level"), String(e.depth + 1));
		const svg = row.querySelector(".booklet-design-nav-icon svg");
		assert.ok(svg, `${e.label} has an icon`);
		if (e.node) assert.equal(svg.getAttribute("data-icon"), iconNamesOf(e.node).find((x) => EVERY_ICON.has(x)));
	});
	// every level is on the navigator, and the style sheet gives each level a colour of its own
	const levels = new Set(rows.map((r) => [...r.classList].find((c) => c.startsWith("is-level-"))?.slice(9)));
	for (const l of LEVELS.filter((x) => x !== "block")) assert.ok(levels.has(l), `a ${l} is listed`);
	const css = readFileSync(`${ROOT}/styles.base.css`, "utf8");
	const colours = LEVELS.filter((l) => l !== "block").map((l) => new RegExp(`\\.booklet-design-nav-row\\.is-level-${l}[^{]*\\{\\s*--bd-level:\\s*([^;]+);`).exec(css)?.[1]);
	assert.ok(colours.every(Boolean), "a colour for each level");
	assert.equal(new Set(colours).size, colours.length, "no two levels share one");
	// the one that is drawn is marked
	assert.equal(v.all('.booklet-design-nav-row[aria-selected="true"]').length, 1);
	assert.ok(rows[1].classList.contains("is-current"), "the booklet's own page");
	v.close();
});

test("a press on a navigator entry draws that page, and only that page; the breadcrumb names every level down to it, and a click on a crumb draws that level", () => {
	const v = open(FULL);
	assert.deepEqual(v.crumb(), ["Booklet: A made-up booklet"], "nothing selected: the booklet");
	assert.equal(words(v.page().querySelector(".booklet-design-page-title")), "A made-up booklet");
	// the booklet's page holds its opening words and a card for each of its parts
	assert.deepEqual(
		v.all(".booklet-design-card").map((c) => c.getAttribute("data-kind")),
		["module", "activity", "data-section"],
	);
	assert.equal(v.all(".booklet-design-page").length, 1, "one page at a time");
	v.go("Doing");
	assert.equal(v.all(".booklet-design-page").length, 1);
	assert.equal(v.page().getAttribute("data-kind"), "activity-tab");
	assert.equal(words(v.page().querySelector(".booklet-design-page-title")), "Doing");
	assert.deepEqual(v.crumb(), ["Booklet: A made-up booklet", "Module: Money", "Activity: Why a budget helps", "Activity tab: Doing"]);
	assert.equal(v.all(".booklet-design-crumb-item").at(-1).getAttribute("aria-current"), "true");
	assert.equal(v.el.querySelector(".booklet-design-nav-row.is-current .booklet-design-nav-label").textContent, "Doing", "the navigator marks the page drawn");
	// a block of the page selected: the trail runs down to it
	click(v.block("question", "[!text|left]"));
	assert.deepEqual(v.crumb(), ["Booklet: A made-up booklet", "Module: Money", "Activity: Why a budget helps", "Activity tab: Doing", "Row", "Question: Left?"]);
	// back up to the module: its page, its cards
	click(v.all(".booklet-design-crumb-item")[1]);
	assert.deepEqual(v.crumb(), ["Booklet: A made-up booklet", "Module: Money"]);
	assert.equal(v.page().getAttribute("data-kind"), "module");
	assert.deepEqual(v.all(".booklet-design-card").map((c) => words(c.querySelector(".booklet-design-card-title"))), ["This month", "Learn", "Spending", "Why a budget helps"]);
	// the Open button of a card draws that part's page
	click(v.card("activity", "[!activity|why").querySelector(".booklet-design-card-open"));
	assert.equal(v.page().getAttribute("data-kind"), "activity");
	assert.equal(words(v.page().querySelector(".booklet-design-page-title")), "Why a budget helps");
	v.close();
});

test("only controls carry an aria-label (Obsidian shows one as a tooltip, which is noise on a region or a group): everything else is named through aria-labelledby, and every name resolves to words", () => {
	const v = open(FULL);
	v.go("Spending");
	v.select("question", "[!text|spent]");
	const check = (what) => {
		const controls = new Set(["BUTTON", "A", "INPUT", "TEXTAREA", "SELECT", "SUMMARY"]);
		for (const e of v.all("[aria-label]")) assert.ok(controls.has(e.tagName) || e.hasAttribute("aria-live"), `${what}: <${e.tagName.toLowerCase()} class="${e.className}"> carries an aria-label`);
		const named = v.all("[aria-labelledby]");
		assert.ok(named.length >= 5, `${what}: regions are named`);
		for (const e of named) {
			const target = v.el.querySelector("#" + e.getAttribute("aria-labelledby"));
			assert.ok(target && words(target).length > 0, `${what}: ${e.className} is named by an element with words`);
		}
	};
	check("the page and its editor");
	v.showAdd();
	check("the Add tab");
	v.go("Money");
	check("a page of cards");
	v.close();
});

test("the settings entry opens the booklet's front matter as a form, in place; the front matter is never a block of a page", () => {
	const v = open(FULL);
	assert.equal(v.all('.booklet-design-block[data-kind="front-matter"]').length, 0, "no page draws the front matter as a block");
	v.go("Settings");
	assert.ok(v.editor(), "the editor is open");
	// named by a hidden line, not an aria-label (Obsidian would show that as a tooltip)
	assert.equal(v.editor().getAttribute("aria-label"), null);
	assert.equal(words(v.el.querySelector("#" + v.editor().getAttribute("aria-labelledby"))), "Edit Front matter as Markdown");
	assert.ok(v.editor().querySelector('[data-field="marker"]'), "the booklet marker is a row of the form");
	assert.ok(v.all(".booklet-design-editbox .setting-item").length >= 3, "a row for each property");
	assert.equal(v.area().value.split("\n")[0], "---");
	v.close();
});

test("a press on a block that is not on one of its buttons selects it and opens it in place, the innermost block of those around the press", () => {
	const v = open(FULL);
	v.go("Doing");
	const q = v.block("question", "[!text|left]");
	click(q.querySelector(".booklet-drawn, .booklet-prompt, .booklet-question") ?? q.querySelector(".booklet-design-drawn"));
	const opened = v.all(".booklet-design-block.is-open");
	assert.equal(opened.length, 1, "one block is open");
	assert.equal(opened[0].getAttribute("data-kind"), "question", "the innermost, not the row or the group around it");
	assert.ok(opened[0].classList.contains("is-selected"));
	assert.equal(v.all(".booklet-design-block.is-selected").length, 1, "and none of the blocks around it");
	assert.ok(v.editor(), "the editor is in place");
	assert.equal(v.area().value, "> [!text|left] Left?");
	v.close();
});

test("words are drawn by Obsidian's renderer, and the renderer's Component is unloaded at each drawing", async () => {
	const v = open(FULL);
	const prose = v.all(".booklet-design-prose");
	assert.ok(prose.length >= 1);
	assert.ok(prose.some((p) => words(p) === "Welcome to the booklet."), "the booklet's opening words");
	assert.ok(prose.every((p) => p.classList.contains("markdown-rendered")));
	const before = v.made.filter((c) => !c.unloaded).length;
	assert.equal(before, 1, "one Component, the drawing's");
	const first = v.made.at(-1);
	// any change draws again
	await v.press(v.act(v.pick("callout", "[!tip]"), "delete"));
	assert.equal(first.unloaded, true, "the first drawing's Component is gone");
	assert.equal(v.made.filter((c) => !c.unloaded).length, 1);
	const last = v.made.filter((c) => !c.unloaded)[0];
	v.close();
	assert.equal(last.unloaded, true, "and the last goes with the view");
});

test("a block is drawn as a reader sees it, or is a friendly card, or is text exactly as written: never Markdown code made to look like a block", () => {
	const v = open(FULL);
	// the booklet's opening: words and a reading callout, drawn
	const tip = v.block("callout", "[!tip]");
	assert.ok(tip.querySelector(".booklet-design-drawn > .booklet-sample-reading"), "a reading callout is drawn by the reading drawer");
	assert.equal(tip.querySelector("pre"), null, "no Markdown under a drawing");
	// the module's notice and the data section's fence are cards of the picture, the kind in words and one line
	v.go("Money");
	const notice = v.block("notice", "[!notice]");
	const friendly = notice.querySelector(".booklet-design-friendly");
	assert.ok(friendly);
	assert.equal(words(friendly.querySelector(".booklet-design-friendly-kind")), "Notice");
	assert.ok(friendly.querySelector(".booklet-design-friendly-art svg"), "a picture");
	assert.equal(notice.querySelector("pre"), null, "never raw Markdown");
	// a question is drawn inert, with its controls off
	v.go("Spending");
	const q = v.block("question", "[!text|spent]");
	assert.ok(q.querySelector(".booklet-design-drawn .booklet-sample"), "the question is drawn as the reader sees it");
	assert.ok(q.querySelectorAll("button, input, textarea").length >= 0);
	for (const c of q.querySelectorAll(".booklet-sample input, .booklet-sample textarea, .booklet-sample button")) assert.ok(c.disabled || c.readOnly, "every control is off");
	// a group draws what it holds inside it
	v.go("Doing");
	const group = v.block("group", "[!group] Step one");
	assert.ok(group.querySelector(".booklet-design-block[data-kind='question']"), "the question inside the group is a block inside the group's block");
	assert.equal(words(group.querySelector(":scope > .booklet-design-group-head .booklet-design-group-name")), "Step one");
	// a row holds its cells side by side
	const row = v.block("row", "[!row]");
	assert.ok(row.querySelector(":scope > .booklet-design-group-body.is-row"));
	v.close();
});

test("the records are named and left alone; text the view cannot read is drawn exactly as written, never hidden", () => {
	const v = open(FULL);
	const rec = v.all('.booklet-design-block[data-kind="records"]')[0];
	assert.ok(rec, "the records are on the booklet's page, after its cards");
	assert.equal(words(rec.querySelector(".booklet-design-friendly-note")), DESIGN_STRINGS["card.records"].en);
	assert.equal(rec.querySelector(".booklet-design-floatbar"), null);
	click(rec);
	assert.equal(v.editor(), null, "the records never open");
	assert.equal(rec.querySelector(".booklet-design-floatbar"), null, "no delete and no move: the view never touches the records");
	assert.ok(v.status().length > 0, "and it says why");
	v.close();
	const u = open(UNREAD);
	const lines = UNREAD.split("\n");
	const written = walkDesign(parseDesign(UNREAD)).filter((n) => n.kind === "as-written");
	assert.ok(written.length >= 4, "the unreadable fixture has as-written nodes");
	// each as-written block is on the page of the part that holds it
	const seen = new Set();
	const visit = () => {
		for (const box of u.all('.booklet-design-block[data-kind="as-written"]')) {
			const n = written.find((x) => String(x.start) === box.getAttribute("data-start"));
			if (!n || seen.has(n)) continue;
			seen.add(n);
			const shown = box.querySelector(".booklet-design-lines").textContent;
			for (const line of lines.slice(n.start, n.end).filter((l) => l.trim())) assert.ok(shown.includes(line.replace(/\r$/, "")), `its line ${JSON.stringify(line)} is shown`);
			assert.match(words(box.querySelector(".booklet-design-what")), /exactly as it is in the note/);
		}
	};
	visit();
	for (const label of u.navLabels()) {
		u.go(label);
		visit();
	}
	assert.equal(seen.size, written.length, "every one is drawn on some page");
	u.close();
});

test("a note that is no booklet yet says so, and an empty one is drawn", () => {
	const v = open("Some words.\n");
	assert.match(words(v.el.querySelector(".booklet-design-banner")), /no booklet line/);
	assert.ok(v.page(), "a page is drawn");
	assert.equal(v.all(".booklet-design-slot").length >= 1, true, "and a place to add");
	v.close();
});

test("a view of data, a listen question and the reading aids with remote media are friendly cards that say a later beta draws them, and show no Markdown", () => {
	const v = open(FULL);
	v.go("Money");
	const queryBlock = v.all('.booklet-design-block[data-kind="query"]')[0];
	assert.equal(queryBlock, undefined, "a view of data sits in the data section's page, not the module's");
	v.go("Data for Money");
	const fence = v.all('.booklet-design-block[data-kind="fence"]')[0];
	assert.ok(fence, "the data block is on the data section's page");
	assert.equal(words(fence.querySelector(".booklet-design-friendly-kind")), "Data block");
	assert.equal(fence.querySelector("pre"), null);
	v.close();
});

/* ======================================================================== insert, delete, move ======================================================================== */

test("placing a piece writes exactly what the operation makes, as one write, and nothing else in the note moves; the new block is selected and its editor is not opened", async () => {
	const v = open(FULL);
	v.go("The map");
	const before = v.disk.text;
	const root = parseDesign(before);
	const page = walkDesign(root).find((n) => n.id === "map");
	const choice = piece("Q - choice.md");
	// the end of the page's blocks, by the slots the canvas has
	const slots = v.slots();
	const last = slots.at(-1);
	const slot = core.slotsOf(core.canvasOf(root, page, {})).at(-1);
	const expected = insertPiece(before, core.slotPositionFor(slot, choice), choice);
	assert.equal(expected.ok, true);
	click(v.tile(choice.file));
	assert.ok(last.classList.contains("is-lit"), "the places the piece may go are lit");
	await v.press(last);
	assert.equal(v.disk.writes, 1, "one vault.process write");
	assertMinimal(before, v.disk.text, expected.text);
	assert.equal(v.view.getViewData(), v.disk.text, "the view shows what it wrote");
	assert.match(v.status(), /^Added Choice\./);
	// the new block is drawn and selected, and nothing is open
	assert.equal(v.all(".booklet-design-block.is-selected").length, 1);
	assert.equal(v.editor(), null, "an add never opens the editor");
	const made = v.all(".booklet-design-block.is-selected")[0];
	assert.equal(made.getAttribute("data-kind"), "question");
	assert.equal(made.getAttribute("data-start"), String(expected.lines.start));
	v.close();
});

test("insert, delete and move in a note with Windows line endings and no final newline keep every line ending as it was", async () => {
	for (const [name, text] of [["crlf", crlf(FULL)], ["no final newline", ALL.NO_EOL], ["crlf, no final newline", crlf(ALL.NO_EOL)]]) {
		const v = open(text);
		const root = parseDesign(text);
		// an activity that holds nothing kept, so no question stands between the press and the write
		const first = walkDesign(root).find((n) => n.kind === "activity" && n.id && !n.implicit && deleteBlock(text, n).ok && !deleteBlock(text, n).impact.length && !deleteBlock(text, n).blind);
		assert.ok(first, `${name}: an activity to delete`);
		// draw the page that holds it as a card: the booklet's (the second entry of the navigator) or its module's
		if (first.parent.kind === "booklet") click(v.navItem(v.navLabels()[1]));
		else v.go(nameOf(first.parent));
		let before = v.disk.text;
		const del = deleteBlock(before, first);
		assert.equal(del.ok, true, name);
		await v.press(v.act(v.card("activity", first.start), "delete"));
		assertMinimal(before, v.disk.text, del.text);
		assert.equal(v.disk.text.includes("\r\n") || !text.includes("\r\n"), true, `${name}: no line ending was changed`);
		if (text.includes("\r\n")) assert.equal(v.disk.text.replace(/\r\n/g, "").includes("\n"), false, `${name}: no bare line feed came in`);
		// and put it back by the view's own undo
		await v.press(v.undo());
		assert.equal(v.disk.text, before, `${name}: undo gives the same bytes`);
		v.close();
	}
});

test("Delete takes a part out with what is in it and the blank lines after it, and nothing else; a block on the page goes the same way", async () => {
	const v = open(FULL);
	v.go("Money");
	const before = v.disk.text;
	const root = parseDesign(before);
	const target = walkDesign(root).find((n) => n.id === "why");
	const expected = deleteBlock(before, target);
	await v.press(v.act(v.card("activity", "[!activity|why"), "delete"));
	assertMinimal(before, v.disk.text, expected.text);
	assert.equal(v.disk.writes, 1);
	assert.match(v.status(), /^Deleted Activity: Why a budget helps\./);
	assert.equal(dialog(), null, "nothing kept, nothing to ask");
	assert.equal(v.page().getAttribute("data-kind"), "module", "the page it was on stays");
	// a block: select it, close its editor, and the bar is on it
	v.go("Spending");
	const mapBefore = v.disk.text;
	const prose = v.pick("prose", "What you spent.");
	const proseNode = walkDesign(parseDesign(mapBefore)).find((n) => n.kind === "prose" && n.start === Number(prose.getAttribute("data-start")));
	const want = deleteBlock(mapBefore, proseNode);
	await v.press(v.act(prose, "delete"));
	assertMinimal(mapBefore, v.disk.text, want.text);
	v.close();
});

test("Move up and Move down move a part one place among its siblings, with its lines and nothing else; the ends have only one", async () => {
	const v = open(BARE);
	click(v.navItem(v.navLabels()[1])); // the booklet's page: its two activities are cards
	const before = v.disk.text;
	const root = parseDesign(before);
	const [one, two] = walkDesign(root).filter((n) => n.kind === "activity");
	const cardOne = v.card("activity", "[!activity|one");
	const cardTwo = v.card("activity", "[!activity|two");
	assert.equal(v.act(cardOne, "up").disabled, true, "the first has no Move up");
	assert.equal(v.act(cardOne, "down").disabled, false);
	assert.equal(v.act(cardTwo, "down").disabled, true, "the last has no Move down");
	const expected = moveBlock(before, one, positionAfter(two));
	assert.equal(expected.ok, true);
	await v.press(v.act(cardOne, "down"));
	assertMinimal(before, v.disk.text, expected.text);
	assert.equal(v.disk.writes, 1);
	const order = walkDesign(parseDesign(v.disk.text)).filter((n) => n.kind === "activity").map((n) => n.id);
	assert.deepEqual(order, ["two", "one"]);
	assert.equal(v.page().getAttribute("data-kind"), "booklet", "the page stays; the cards are in their new order");
	assert.deepEqual(v.all(".booklet-design-card").map((c) => words(c.querySelector(".booklet-design-card-title"))), ["Two", "One"]);
	// and Move up puts it back, byte for byte
	await v.press(v.act(v.card("activity", "[!activity|one"), "up"));
	assert.equal(v.disk.text, before);
	v.close();
});

test("a block's floating bar has Move up, Move down, Edit as Markdown and Delete, each labelled; it stands on the selected block only, and not on one the view never changes", () => {
	const v = open(FULL);
	assert.equal(v.all(".booklet-design-floatbar").length, 0, "nothing selected, no bar");
	const tip = v.block("callout", "[!tip]");
	click(tip);
	assert.equal(v.all(".booklet-design-floatbar").length, 0, "while the block is open in the editor the bar is not drawn over it");
	click(v.editor().querySelector(".booklet-design-cancel"));
	const bar = v.block("callout", "[!tip]").querySelector(":scope > .booklet-design-floatbar");
	assert.ok(bar, "the selected block has its bar");
	assert.equal(bar.getAttribute("role"), "toolbar");
	assert.deepEqual([...bar.querySelectorAll("button")].map((b) => b.getAttribute("aria-label")), ["Move up", "Move down", "Edit as Markdown", "Delete"]);
	assert.equal(v.all(".booklet-design-floatbar").length, 1, "one bar");
	// the records never get one
	click(v.all('.booklet-design-block[data-kind="records"]')[0]);
	assert.equal(v.all(".booklet-design-floatbar").length, 0);
	v.close();
});

test("a part the format will not put there has no button, and if it is asked for anyway it is refused in the format's words and nothing is written", async () => {
	// an activity does not go above its module's tab
	const text = bookletAround("> [!module|m] M\n\n> [!tab|t] T\n\n> [!activity|a] A\n\n> [!activity|b] B\n\n> [!module|m end]\n");
	const v = open(text);
	v.go("M");
	const before = v.disk.text;
	const box = v.card("activity", "[!activity|a]");
	assert.equal(v.act(box, "up").disabled, true, "no Move up: the tab stands above it");
	assert.equal(v.act(v.card("activity", "[!activity|b]"), "up").disabled, false);
	// asked for anyway (the way a key or a menu would): the operation's own reason
	const root = v.view.root;
	const a = walkDesign(root).find((n) => n.id === "a");
	const tab = walkDesign(root).find((n) => n.kind === "module-tab");
	const direct = moveBlock(text, a, positionBefore(tab));
	assert.equal(direct.ok, false);
	await v.view.move(a, positionBefore(tab));
	assert.equal(v.disk.text, before, "nothing written");
	assert.equal(v.disk.writes, 0);
	assert.equal(v.status(), direct.reason, "the reason is said, in the format's words");
	assert.match(v.status(), /declared in its opening, before its first activity/);
	v.close();
});

test("a change made to the note after the view drew it is not written over: the view says so and draws the note as it is", async () => {
	const v = open(BARE);
	click(v.navItem(v.navLabels()[1]));
	const before = v.disk.text;
	const del = v.act(v.card("activity", "[!activity|one"), "delete");
	// the note is changed under the view (a sync, another plugin): the vault holds new text, the view has not heard
	v.disk.text = before.replace("One", "Uno");
	await v.press(del);
	assert.equal(v.disk.text, before.replace("One", "Uno"), "the newer note is left exactly as it is");
	assert.match(v.status(), /The note changed after this view drew it/);
	assert.equal(v.view.getViewData(), v.disk.text, "and the view now shows it");
	assert.equal(v.undo().disabled, true, "nothing was done, so nothing can be undone");
	v.close();
});

test("the view never writes the whole file: TextFileView's own save and its debounced request do nothing", async () => {
	const v = open(BARE);
	v.view.requestSave();
	await v.view.save();
	await v.view.save(true);
	assert.equal(v.disk.writes, 0);
	assert.equal(v.view.getViewData(), BARE);
	for (const f of ["design-view", "design-edit", "design-canvas-draw", "design-nav", "design-palette"]) {
		const src = readFileSync(`${ROOT}/src/${f}.ts`, "utf8");
		assert.doesNotMatch(src, /vault\.(modify|create|append)\b|\.write\(/, `${f}: the only write is through note-view.ts`);
	}
	v.close();
});

test("with the note also open as Markdown, a change goes into that pane's editor as the smallest edit, and not into the file", async () => {
	const pane = fakePane("Note.booklet.md", FULL);
	const v = open(FULL, { pane });
	v.go("Money");
	const before = pane.text();
	const root = parseDesign(before);
	const target = walkDesign(root).find((n) => n.id === "why");
	const expected = deleteBlock(before, target);
	await v.press(v.act(v.card("activity", "[!activity|why"), "delete"));
	assert.equal(v.disk.writes, 0, "the vault was not written: the pane holds the note and saves it");
	assert.equal(pane.calls.length, 1, "one replacement");
	assertMinimal(before, pane.text(), expected.text);
	const c = minimalChange(before, expected.text);
	assert.deepEqual(pane.calls[0], { from: c.from, to: c.to, text: c.text }, "exactly the bytes that differ");
	// words typed in that pane and not saved are the note: the view takes them
	pane.type(pane.text().replace("A made-up booklet", "A made-up booklet, typed"));
	v.view.setViewData(v.disk.text, false);
	assert.match(v.view.getViewData(), /typed/, "the editor's text is the newest");
	// undo goes through the editor too
	await v.press(v.undo());
	assert.equal(v.status(), DESIGN_STRINGS["status.undoChanged"].en, "the note was typed in since: undo will not force it");
	v.close();
});

/* ======================================================================== kept data: say, count, ask ======================================================================== */

/** The Delete button of the activity card `needle` on the page of the module `module` (HELD's "once" is a card of Mood). */
const deleteCard = (v, needle, module = "Mood") => {
	v.go(module);
	return v.act(v.card("activity", needle), "delete");
};

test("a delete that would detach kept answers says what will go, with counts, and waits for a yes", async () => {
	const v = open(HELD);
	const before = v.disk.text;
	const target = walkDesign(parseDesign(before)).find((n) => n.id === "once");
	const expected = deleteBlock(before, target);
	assert.ok(expected.impact.length >= 2);
	click(deleteCard(v, "[!activity|once"));
	const ask = dialog();
	assert.ok(ask, "a question is open");
	assert.equal(v.disk.writes, 0, "nothing is written while it is open");
	const text = words(ask);
	assert.match(text, /1 saved answer/, "the count of answers");
	assert.match(text, /5 rows/, "and of rows");
	assert.match(text, /Said once/, "it names what goes");
	assert.match(text, /\d+ lines?\)/, "and how many lines of the note go");
	assert.match(text, /stay in the note's records as they are/, "the kept data is not deleted");
	assert.match(text, /Undo in this view brings the note back as it was/);
	assert.match(text, /the Markdown view's own undo is not affected/);
	assert.deepEqual([...ask.querySelectorAll("button")].map(words), ["Delete", "Cancel"]);
	// yes
	press(ask, "Delete");
	await v.view.whenIdle();
	assert.equal(dialog(), null);
	assert.equal(v.disk.writes, 1);
	assertMinimal(before, v.disk.text, expected.text);
	assert.match(v.status(), /^Deleted/);
	// it can be undone, and the kept data was never touched
	await v.press(v.undo());
	assert.equal(v.disk.text, before);
	v.close();
});

/** Gives the dialogs the view opens, so a test can close one as Escape does. */
function watchDialogs() {
	const opened = [];
	const open = Modal.prototype.open;
	Modal.prototype.open = function () {
		opened.push(this);
		return open.call(this);
	};
	return { opened, stop: () => void (Modal.prototype.open = open) };
}

test("a no does nothing: Cancel, Escape and a click outside leave the note untouched, with no write and nothing in the history", async () => {
	for (const how of ["Cancel", "Escape"]) {
		const watch = watchDialogs();
		const v = open(HELD);
		const before = v.disk.text;
		click(deleteCard(v, "[!activity|once"));
		const ask = dialog();
		assert.ok(ask);
		if (how === "Cancel") press(ask, "Cancel");
		else watch.opened.at(-1).close(); // what Obsidian does on Escape or a click outside
		await v.view.whenIdle();
		watch.stop();
		assert.equal(v.disk.writes, 0, how);
		assert.equal(v.disk.text, before, how);
		assert.equal(v.undo().disabled, true, `${how}: nothing to undo`);
		assert.equal(v.status(), "Nothing was changed.", how);
		assert.ok(v.card("activity", "[!activity|once"), `${how}: it is still drawn`);
		assert.equal(dialog(), null);
		v.close();
	}
});

test("a blind note (the reader cannot open it) is asked about too, in words that say nothing could be counted; yes still deletes", async () => {
	const refused = HELD.replace("> [!module|mood end]\n", "");
	assert.equal(core.readerRefuses(refused), true);
	const v = open(refused);
	const target = walkDesign(parseDesign(refused)).find((n) => n.id === "once");
	const expected = deleteBlock(refused, target);
	assert.equal(expected.blind, true);
	click(deleteCard(v, "[!activity|once"));
	const ask = dialog();
	assert.ok(ask, "asked");
	assert.match(words(ask), /cannot open this booklet as it is, so this view cannot count what this change touches/);
	assert.doesNotMatch(words(ask), /saved answer/, "it does not pretend to have counted");
	press(ask, "Delete");
	await v.view.whenIdle();
	assert.equal(v.disk.text, expected.text);
	v.close();
});

/* ======================================================================== undo and redo ======================================================================== */

test("Undo and Redo put back the exact bytes, in order, and are on only when there is something to do", async () => {
	const v = open(BARE);
	click(v.navItem(v.navLabels()[1]));
	const t0 = v.disk.text;
	assert.equal(v.undo().disabled, true);
	assert.equal(v.redo().disabled, true);
	await v.press(v.act(v.card("activity", "[!activity|two"), "delete"));
	const t1 = v.disk.text;
	assert.notEqual(t1, t0);
	// add an activity at the end of the booklet: pick its tile, then the lit place
	const choice = piece("Structure - activity.md");
	click(v.tile(choice.file));
	const lit = v.slots().filter((s) => s.classList.contains("is-lit"));
	assert.ok(lit.length >= 1, "a place is lit");
	await v.press(lit.at(-1));
	const t2 = v.disk.text;
	assert.notEqual(t2, t1);
	assert.equal(v.undo().disabled, false);
	await v.press(v.undo());
	assert.equal(v.disk.text, t1);
	assert.equal(v.status(), "Undone.");
	assert.equal(v.redo().disabled, false);
	await v.press(v.undo());
	assert.equal(v.disk.text, t0);
	assert.equal(v.undo().disabled, true);
	await v.press(v.redo());
	assert.equal(v.disk.text, t1);
	await v.press(v.redo());
	assert.equal(v.disk.text, t2);
	assert.equal(v.status(), "Redone.");
	assert.equal(v.redo().disabled, true);
	assert.equal(v.view.getViewData(), t2);
	v.close();
});

test("a note changed outside the view since the step is not undone over: the view says so and changes nothing", async () => {
	const v = open(BARE);
	click(v.navItem(v.navLabels()[1]));
	await v.press(v.act(v.card("activity", "[!activity|two"), "delete"));
	const after = v.disk.text;
	const typed = after + "\nTyped elsewhere.\n";
	v.disk.text = typed;
	v.view.setViewData(typed, false);
	await v.press(v.undo());
	assert.equal(v.disk.text, typed);
	assert.equal(v.status(), DESIGN_STRINGS["status.undoChanged"].en);
	v.close();
});

test("mod+z and mod+shift+z undo and redo when no field has the focus, and are left to the field when one has", async () => {
	const v = open(BARE);
	click(v.navItem(v.navLabels()[1]));
	await v.press(v.act(v.card("activity", "[!activity|two"), "delete"));
	const t1 = v.disk.text;
	const handler = (mods, key) => v.view.scope.handlers.find((h) => h.key === key && JSON.stringify(h.modifiers) === JSON.stringify(mods))?.func;
	const undo = handler(["Mod"], "z");
	const redo = handler(["Mod", "Shift"], "z");
	assert.ok(undo && redo, "both keys are on the view's scope");
	const evt = () => new w.KeyboardEvent("keydown", { key: "z", cancelable: true });
	// a field has the focus: the key is the field's
	const field = v.el.appendChild(doc.createElement("textarea"));
	field.focus();
	const typing = evt();
	assert.equal(undo(typing), undefined, "not handled");
	assert.equal(typing.defaultPrevented, false);
	await v.view.whenIdle();
	assert.equal(v.disk.text, t1, "nothing undone");
	field.remove();
	doc.activeElement?.blur?.();
	const e1 = evt();
	assert.equal(undo(e1), false, "handled");
	assert.equal(e1.defaultPrevented, true);
	await v.view.whenIdle();
	assert.equal(v.disk.text, BARE);
	assert.equal(redo(evt()), false);
	await v.view.whenIdle();
	assert.equal(v.disk.text, t1);
	v.close();
});

test("a second press while a change is under way waits for it: two clicks make one change, not two", async () => {
	const v = open(HELD);
	const del = deleteCard(v, "[!activity|once");
	click(del);
	click(del);
	assert.equal(w.document.querySelectorAll(".booklet-design-ask").length, 1, "one question");
	press(dialog(), "Cancel");
	await v.view.whenIdle();
	v.close();
});

test("the confirm dialog's title wraps and keeps clear of the close button on a phone (a long Spanish or French title is never cut or hidden)", () => {
	const v = open(HELD);
	click(deleteCard(v, "[!activity|once"));
	assert.ok(dialog().closest(".booklet-design-ask-card"), "the dialog's own card carries the class its title rules hang on");
	press(dialog(), "Cancel");
	v.close();
	const css = readFileSync(`${ROOT}/styles.base.css`, "utf8");
	assert.match(css, /\.booklet-design-ask-card \.modal-title\s*\{[^}]*white-space:\s*normal[^}]*\}/, "the title wraps");
	assert.match(css, /\.booklet-design-ask-card \.modal-title\s*\{[^}]*text-overflow:\s*clip/, "and is not ended with an ellipsis");
	assert.match(css, /\.is-mobile \.booklet-design-ask-card \.modal-title\s*\{[^}]*padding-inline:/, "and on a phone keeps clear of the close button");
});

/* ======================================================================== phone, and a user who never opens it ======================================================================== */

test("every action is a visible button with its words: no hover, and a press, a key or a drag each reach the same places", () => {
	const v = open(FULL);
	// (the buttons inside an inert drawing are the reader's, drawn switched off: they are no action of this view)
	v.go("Spending");
	const drawn = v.all(".booklet-sample button");
	for (const b of drawn) assert.ok(b.disabled, "a drawn question's buttons are all off");
	for (const label of ["Money", "Doing"]) {
		v.go(label);
		click(v.all(".booklet-design-block")[0] ?? v.page());
	}
	v.openGroups();
	const buttons = v.all("button").filter((b) => !b.closest(".booklet-sample"));
	assert.ok(buttons.length > 40);
	for (const b of buttons) {
		assert.equal(b.getAttribute("type"), "button");
		assert.ok(words(b).length > 0 || b.getAttribute("aria-label"), "a button has its words");
	}
	// a "+" is a real button, and so is everything else a person presses; nothing is reachable only by hover
	for (const f of ["design-view", "design-canvas-draw", "design-nav", "design-edit"]) {
		const src = readFileSync(`${ROOT}/src/${f}.ts`, "utf8");
		assert.doesNotMatch(src, /mouseover|:hover/, `${f}: nothing is reachable only by hover`);
	}
	const css = readFileSync(`${ROOT}/styles.base.css`, "utf8");
	assert.match(css, /\.is-mobile \.booklet-design button[^{]*\{[^}]*min-height:\s*44px/, "a phone gets 44 px targets");
	assert.doesNotMatch(css.slice(css.indexOf("The Design view (design-view.ts)")), /(?:^|[^-])width:\s*\d+px/m, "no fixed width that would not fit 400 px");
	v.close();
});

test("someone who never opens the Design view sees no change: the Booklet view is the default, its own header and menu keep their order, and the data file is as it was", () => {
	// the pane menu: Show Markdown, then the look, then the new item last
	const disk = { text: BARE, writes: 0 };
	const bv = new BookletView({ app: testApp(disk) }, { setMode: async () => {}, manifest: { version: "9" }, media: new MediaAllows(null, () => {}) });
	bv.load();
	const items = [];
	const menu = { addItem: (cb) => { const it = { title: "", setTitle(t) { this.title = t; return this; }, setIcon() { return this; }, setSection() { return this; }, onClick(f) { this.f = f; return this; } }; cb(it); items.push(it); } };
	bv.onPaneMenu(menu, "tab-header");
	assert.deepEqual(items.map((i) => i.title), ["Show Markdown", "Use Obsidian's look in this view", "Open in Design view"]);
	bv.unload();
	const media = new MediaAllows({ allowedMediaHosts: ["example.org"], look: "paper-dark" }, () => {});
	assert.deepEqual(media.toData(), { look: "paper-dark", allowedMediaHosts: ["example.org"], noteAllows: {} }, "no key is added to the saved data until a choice is made");
	assert.equal(media.openIn(), "booklet");
});

test("the plugin registers the Design view beside the others, and the command ids and view types that were there stay", async () => {
	const registered = [];
	const plugin = new BookletPlugin({ workspace: { on: () => ({}), onLayoutReady() {}, getLeavesOfType: () => [], iterateAllLeaves() {} }, vault: { on: () => ({}), getFileByPath: () => null }, metadataCache: { on: () => ({}), getFileCache: () => null } }, { version: "1" });
	plugin.registerView = (type, make) => void registered.push({ type, make });
	const cmds = [];
	plugin.addCommand = (c) => void cmds.push(c.id);
	plugin.registerEvent = () => {};
	plugin.addSettingTab = () => {};
	await plugin.onload();
	assert.deepEqual(registered.map((r) => r.type), ["booklet", "booklet-design", "booklet-blocks"]);
	assert.deepEqual(cmds, ["editor-mode", "toggle-view", "design-add-piece", "design-add-structure", "design-add-questions", "design-add-reading", "design-add-views", "design-add-data"]);
	plugin.onunload();
});

test("no member of the Design view or the Booklet view is named after one the real TextFileView puts on every instance (found in the real app: a method `dirty` was hidden by the base class's boolean, and the editor never opened)", () => {
	// the instance fields of the real TextFileView, read in Obsidian 1.14.5 and 1.11.7 (check 64); the stub holds the ones this view could meet
	const real = ["_loaded", "_events", "_children", "icon", "navigation", "app", "leaf", "containerEl", "canDropAnywhere", "leftSidebarToggleEl", "headerEl", "contentEl", "backButtonEl", "forwardButtonEl", "titleParentEl", "titleEl", "titleContainerEl", "actionsEl", "moreOptionsButtonEl", "allowNoFile", "fileBeingRenamed", "lastSavedData", "saving", "saveAgain", "isPlaintext", "data", "dirty", "requestSave"];
	const overrides = new Set(["constructor", "onload", "getDisplayText", "getIcon", "onPaneMenu", "getViewType", "getViewData", "setViewData", "clear", "save", "onunload", "onOpen", "onClose", "getState", "setState", "getEphemeralState", "setEphemeralState", "onLoadFile", "onUnloadFile", "onResize"]);
	for (const View of [DesignView, BookletView]) {
		const own = Object.getOwnPropertyNames(View.prototype).filter((n) => !overrides.has(n));
		assert.deepEqual(own.filter((n) => real.includes(n)), [], `${View.name} has a method named like an instance field of TextFileView`);
	}
	// the stub carries the real fields, so a view that reads one of its own fields of that name sees the base's value, as in the app
	const probe = new DesignView({ app: testApp({ text: BARE, writes: 0 }) }, { setMode: async () => {} });
	for (const k of ["dirty", "saving", "saveAgain", "isPlaintext", "lastSavedData"]) assert.ok(k in probe, `the stub's TextFileView has ${k}`);
});
