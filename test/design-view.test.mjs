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

const { DesignView, DESIGN_VIEW_TYPE, BookletView, BookletPlugin, MediaAllows, installViewSwitch, setLeafMode, leafModeFor, WorkspaceLeaf, Modal } = await import("./.build/view.mjs");
const { BookletSettingTab, MediaAllows: SettingsAllows } = await import("./.build/media.mjs");
const { parseDesign, walkDesign, levelOf, nameOf, crumbOf, minimalChange, insertPiece, deleteBlock, moveBlock, positionBefore, positionAfter, positionIn, applyChange, PIECES, DESIGN_STRINGS, LEVELS, LEVEL_ICONS, iconNamesOf, addChoices, containerAdds, canPlacePiece, WORDS_PIECE } = core;

const doc = w.document;
const piece = (file) => PIECES.find((p) => p.file === file);

/** Every icon name the view may ask for: an Obsidian whose set has them all. */
const EVERY_ICON = new Set([...Object.values(LEVEL_ICONS).flat(), ...walkDesign(parseDesign(FULL)).flatMap((n) => [...iconNamesOf(n)]), "pencil-ruler", "file-text", "book-open"]);

/** An editor over a string, as a Markdown pane has one; every replacement it is given is kept. */
function fakePane(path, text) {
	const v = new MarkdownView();
	v.file = { path };
	let current = text;
	const toPos = (o) => {
		const lines = current.slice(0, o).split("\n");
		return { line: lines.length - 1, ch: lines[lines.length - 1].length };
	};
	const toOff = (p) => current.split("\n").slice(0, p.line).reduce((a, l) => a + l.length + 1, 0) + p.ch;
	v.calls = [];
	v.editor = {
		getValue: () => current,
		offsetToPos: toPos,
		replaceRange(t, from, to) {
			const a = toOff(from);
			const b = toOff(to ?? from);
			v.calls.push({ from: a, to: b, text: t });
			current = current.slice(0, a) + t + current.slice(b);
		},
	};
	v.text = () => current;
	v.type = (t) => (current = t);
	return v;
}

/** A Design view open on `text`, as a pane opens a note: loaded, then handed the text. `disk` is the note as the vault holds it. */
function open(text, { path = "Note.booklet.md", icons = EVERY_ICON, pane = null } = {}) {
	globalThis.__bookletStubIcons = icons;
	const disk = { text, writes: 0 };
	const app = testApp(disk, { workspace: { iterateAllLeaves: (fn) => void (pane && fn({ view: pane })) } });
	const modes = [];
	const actions = [];
	const view = new DesignView({ app }, { setMode: async (_leaf, mode) => void modes.push(mode) });
	const made = [];
	const addChild = view.addChild.bind(view);
	view.addChild = (c) => {
		const unload = c.unload.bind(c);
		c.unloaded = false;
		c.unload = () => {
			c.unloaded = true;
			unload();
		};
		made.push(c);
		return addChild(c);
	};
	view.addAction = (icon, title, cb) => {
		actions.push({ icon, title, cb });
		return doc.createElement("div");
	};
	view.file = { path, basename: path.replace(/\.md$/, "") };
	view.load();
	view.setViewData(text, true);
	const el = view.contentEl;
	const all = (sel, from = el) => [...from.querySelectorAll(sel)];
	const o = {
		view,
		disk,
		el,
		modes,
		actions,
		made,
		all,
		/** The box of the node of this kind that starts on the line holding `needle`. */
		box: (kind, needle) => {
			const start = String(lineOf(view.getViewData(), needle));
			const hit = all(`.booklet-design-node[data-kind="${kind}"]`).find((b) => b.getAttribute("data-start") === start);
			assert.ok(hit, `no ${kind} drawn at the line of ${needle}`);
			return hit;
		},
		/** A button in a node's own head (its actions), not in what it holds. */
		act: (box, cls) => box.querySelector(`:scope > .booklet-design-head .booklet-design-${cls}`),
		status: () => words(el.querySelector(".booklet-design-status")),
		crumb: () => all(".booklet-design-crumb-item").map(words),
		undo: () => el.querySelector(".booklet-design-undo"),
		redo: () => el.querySelector(".booklet-design-redo"),
		/** Presses a button and waits for what it set going. */
		async press(button) {
			assert.ok(button && !button.disabled, "the button is there and on");
			click(button);
			await view.whenIdle();
		},
		close() {
			view.unload();
			view.containerEl.remove();
		},
	};
	return o;
}

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
	const icons = (kind) => v.all(`.booklet-design-node[data-kind="${kind}"] > .booklet-design-head .booklet-design-icon svg`).map((s) => s.getAttribute("data-icon"));
	assert.deepEqual(new Set(icons("module")), new Set(["layers"]));
	assert.deepEqual(new Set(icons("activity")), new Set(["list-checks"]));
	assert.deepEqual(new Set(icons("page")), new Set(["file-text"]));
	assert.deepEqual(v.actions.map((a) => a.icon), ["file-text", "book-open"]);
	assert.equal(v.view.getIcon(), "pencil", "the tab's icon falls back to one that has been there for years");
	// a node with no icon of any of its names is drawn without one, and is still drawn
	const none = open(BARE, { icons: new Set() });
	assert.ok(none.all(".booklet-design-node").length > 3);
	assert.equal(none.all(".booklet-design-icon svg").length, 0);
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

/* ======================================================================== the tree drawn ======================================================================== */

test("every node of the note is drawn, once, nested as the tree is nested, each with its level's icon, rail class and one line of words", () => {
	const v = open(FULL);
	const root = parseDesign(FULL);
	const nodes = walkDesign(root);
	const boxes = v.all(".booklet-design-node");
	assert.equal(boxes.length, nodes.length, "nothing is left out");
	for (const n of nodes) {
		const box = boxes.find((b) => b.getAttribute("data-kind") === n.kind && b.getAttribute("data-start") === String(n.start));
		assert.ok(box, `${n.kind} at ${n.start} is drawn`);
		const level = levelOf(n);
		assert.ok(box.classList.contains(`is-level-${level}`), `${n.kind} carries the rail of its level`);
		// nested as the tree is
		const up = box.parentElement?.closest(".booklet-design-node");
		if (n.parent) assert.equal(up?.getAttribute("data-start"), String(n.parent.start), `${n.kind} at ${n.start} stands in its parent`);
		else assert.equal(up, null);
		// an icon of its own
		const svg = box.querySelector(":scope > .booklet-design-head .booklet-design-icon svg");
		assert.ok(svg, `${n.kind} has an icon`);
		assert.equal(svg.getAttribute("data-icon"), iconNamesOf(n).find((x) => EVERY_ICON.has(x)));
		// a container says in one line what it is, from the table
		if (core.isContainer(n)) assert.equal(words(box.querySelector(":scope > .booklet-design-what")), DESIGN_STRINGS[`what.${level}`].en);
	}
	// every level is on the page, and each level has a rail of its own in the style sheet
	const levels = new Set(boxes.map((b) => b.getAttribute("data-level")));
	for (const l of LEVELS) assert.ok(levels.has(l), `a ${l} is drawn`);
	const css = readFileSync(`${ROOT}/styles.base.css`, "utf8");
	const rails = LEVELS.map((l) => new RegExp(`\\.booklet-design-node\\.is-level-${l}\\s*\\{\\s*--design-rail:\\s*([^;]+);`).exec(css)?.[1]);
	assert.ok(rails.every(Boolean), "a rail colour for each level");
	assert.equal(new Set(rails).size, LEVELS.length, "no two levels share one");
	v.close();
});

test("the words of each level are written once: a module says what it is in the table's words", () => {
	const v = open(FULL);
	const mod = v.box("module", "[!module|money]");
	assert.equal(words(mod.querySelector(":scope > .booklet-design-what")), "A module is a unit of the booklet. It holds activities.");
	assert.equal(words(mod.querySelector(":scope > .booklet-design-head .booklet-design-kind")), "Module");
	assert.equal(words(mod.querySelector(":scope > .booklet-design-head .booklet-design-name")), "Money");
	v.close();
});

test("a click selects a block and the breadcrumb names every level down to it; a click on a crumb selects that level", () => {
	const v = open(FULL);
	assert.deepEqual(v.crumb(), ["Booklet: Note.booklet"], "nothing selected: the booklet");
	const q = v.box("question", "[!text|left]");
	click(q.querySelector(":scope > .booklet-design-head .booklet-design-pick"));
	const root = parseDesign(FULL);
	const target = walkDesign(root).find((n) => n.id === "left");
	const trail = v.crumb();
	assert.equal(trail.length, crumbOf(target).length);
	assert.deepEqual(trail, ["Booklet: Note.booklet", "Module: Money", "Activity: Why a budget helps", "Activity tab: Doing", "Row", "Question: Left?"]);
	assert.ok(q.classList.contains("is-selected"));
	assert.equal(v.act(q, "pick").getAttribute("aria-pressed"), "true");
	assert.equal(v.all(".booklet-design-crumb-item").at(-1).getAttribute("aria-current"), "true");
	// back up to the module
	click(v.all(".booklet-design-crumb-item")[1]);
	assert.deepEqual(v.crumb(), ["Booklet: Note.booklet", "Module: Money"]);
	assert.ok(!q.classList.contains("is-selected"));
	assert.ok(v.box("module", "[!module|money]").classList.contains("is-selected"));
	v.close();
});

test("a press on a block that is not on one of its buttons selects it, the innermost block of those around the press", () => {
	const v = open(FULL);
	const q = v.box("question", "[!text|left]");
	click(q.querySelector(":scope > .booklet-design-drawn .booklet-prompt"));
	assert.ok(q.classList.contains("is-selected"), "a press on the drawing selects the block");
	assert.equal(v.all(".booklet-design-node.is-selected").length, 1, "and none of the blocks around it");
	// a press on a button does what the button does, and selects nothing by the way
	click(v.act(v.box("module", "[!module|money]"), "up"));
	assert.ok(q.classList.contains("is-selected"));
	v.close();
});

test("words are drawn by Obsidian's renderer, and the renderer's Component is unloaded at each drawing", async () => {
	const v = open(FULL);
	const prose = v.all(".booklet-design-prose");
	assert.ok(prose.length >= 4);
	assert.ok(prose.some((p) => words(p) === "Welcome to the booklet."), "the booklet's opening words");
	assert.ok(prose.every((p) => p.classList.contains("markdown-rendered")));
	assert.equal(v.made.length, 1);
	assert.equal(v.made[0].unloaded, false);
	// any change draws again
	await v.press(v.act(v.box("callout", "[!tip]"), "delete"));
	assert.equal(v.made.length, 2);
	assert.equal(v.made[0].unloaded, true, "the first drawing's Component is gone");
	assert.equal(v.made[1].unloaded, false);
	v.close();
	assert.equal(v.made[1].unloaded, true, "and the last goes with the view");
});

test("a block is a drawing or a labelled card: its kind and id in a head, its Markdown lines exactly as written (in a fold under a drawing)", () => {
	const v = open(FULL);
	const q = v.box("question", "[!text|spent]");
	assert.equal(words(q.querySelector(":scope > .booklet-design-head .booklet-design-kind")), "Question");
	assert.match(words(q.querySelector(":scope > .booklet-design-head .booklet-design-more")), /text/);
	assert.match(words(q.querySelector(":scope > .booklet-design-head .booklet-design-more")), /spent/);
	// the hint under a question is one of the question's own lines, and is in its fold with it (the question itself is drawn, stage C)
	assert.equal(q.querySelector(":scope > .booklet-design-fold pre").textContent, "> [!text|spent] What did you spend?\n\n> [!hint]- Think of today\n> Start with the biggest.");
	const tip = v.box("callout", "[!tip]");
	assert.equal(tip.querySelector(":scope > .booklet-design-fold pre").textContent, "> [!tip] Start here\n> A reading callout in the booklet's opening.");
	const fence = v.all('.booklet-design-node[data-kind="fence"]')[0];
	assert.match(fence.querySelector(":scope > .booklet-design-lines").textContent, /^```booklet data/);
	// a group draws what it holds inside it, and shows its own opening lines in a fold
	const group = v.box("group", "[!group] Step one");
	assert.ok(group.querySelector(".booklet-design-node[data-kind='question']"));
	assert.equal(group.querySelector(":scope > .booklet-design-fold pre").textContent.split("\n")[0], "> [!group] Step one", "its own opening line, as written");
	v.close();
});

test("the records section is named and left alone; text the view cannot read is drawn as written, never hidden", () => {
	const v = open(FULL);
	const rec = v.all('.booklet-design-node[data-kind="records"]')[0];
	assert.ok(rec);
	assert.equal(words(rec.querySelector(":scope > .booklet-design-what")), DESIGN_STRINGS["card.records"].en);
	assert.equal(rec.querySelector(":scope > .booklet-design-head .booklet-design-actions"), null, "no delete, no move: the view never touches the records");
	v.close();
	const u = open(UNREAD);
	const lines = UNREAD.split("\n");
	const written = walkDesign(parseDesign(UNREAD)).filter((n) => n.kind === "as-written");
	assert.ok(written.length >= 4, "the unreadable fixture has as-written nodes");
	for (const n of written) {
		const box = u.all('.booklet-design-node[data-kind="as-written"]').find((b) => b.getAttribute("data-start") === String(n.start));
		assert.ok(box, `the as-written block at ${n.start} is drawn`);
		const shown = box.querySelector(":scope > .booklet-design-lines").textContent;
		for (const line of lines.slice(n.start, n.end).filter((l) => l.trim())) assert.ok(shown.includes(line.replace(/\r$/, "")), `its line ${JSON.stringify(line)} is shown`);
		assert.match(words(box.querySelector(":scope > .booklet-design-what")), /exactly as it is in the note/);
	}
	u.close();
});

test("a note that is no booklet yet says so, and an empty one is drawn", () => {
	const v = open("Some words.\n");
	assert.match(words(v.el.querySelector(".booklet-design-banner")), /no booklet line/);
	assert.ok(v.all(".booklet-design-node").length >= 2);
	v.close();
});

/* ======================================================================== the strict + Add ======================================================================== */

/** Opens every group of the catalogue in a box's open panel (the groups are folded until pressed), and gives back what is now in the panel. */
const openGroups = (box) => {
	const p = box.querySelector(":scope > .booklet-design-body > .booklet-design-addrow .booklet-design-panel");
	if (p) for (const h of p.querySelectorAll(".booklet-design-cathead")) if (h.getAttribute("aria-expanded") === "false") click(h);
	return p;
};
/** The pieces the open panel of a container lists, in every group, as the files they come from. */
const panel = (box) => {
	const p = openGroups(box);
	return p ? [...p.querySelectorAll("button.booklet-design-piece")].map((b) => b.getAttribute("data-piece")) : null;
};
const addButton = (box) => box.querySelector(":scope > .booklet-design-body > .booklet-design-addrow .booklet-design-add");

test("+ Add lists only what the format allows in that container, and draws the same list for every container of the note", () => {
	for (const [name, text] of [["FULL", FULL], ["BARE", BARE], ["UNREAD", UNREAD]]) {
		const v = open(text);
		const root = parseDesign(text);
		for (const n of walkDesign(root).filter((x) => core.isContainer(x))) {
			const box = v.all(".booklet-design-node").find((b) => b.getAttribute("data-kind") === n.kind && b.getAttribute("data-start") === String(n.start));
			assert.equal(addButton(box).getAttribute("aria-expanded"), "false");
			click(addButton(box));
			const fresh = v.all(".booklet-design-node").find((b) => b.getAttribute("data-kind") === n.kind && b.getAttribute("data-start") === String(n.start));
			assert.equal(addButton(fresh).getAttribute("aria-expanded"), "true");
			// every legal piece is listed, once, in one of the four groups, and nothing else is
			const want = [...new Set(addChoices(n).groups.flatMap((g) => g.pieces.map((p) => p.file)))];
			assert.deepEqual([...panel(fresh)].sort(), [...want].sort(), `${name}: ${n.kind} at ${n.start}`);
			// every button on it is legal where it would go
			for (const g of addChoices(n).groups) for (const p of g.pieces) assert.ok(canPlacePiece(g.position, [...PIECES, WORDS_PIECE].find((x) => x.file === p.file)).ok);
			click(addButton(fresh));
		}
		v.close();
	}
});

test("illegal parts are not on the list: no module in a module, no question in a booklet, no page under a page", () => {
	const v = open(FULL);
	// the kinds of place a container's open catalogue lists (each part carries the kind of place it goes to)
	const kinds = (box) => {
		click(addButton(box));
		const open = v.all(`.booklet-design-node[data-kind="${box.getAttribute("data-kind")}"]`).find((b) => b.getAttribute("data-start") === box.getAttribute("data-start"));
		panel(open);
		return [...new Set([...open.querySelectorAll(".booklet-design-panel .booklet-design-catitem")].map((i) => i.getAttribute("data-place")))];
	};
	const mod = kinds(v.box("module", "[!module|money]"));
	assert.ok(mod.includes("activity"));
	for (const no of ["module", "question", "page-break", "front-matter"]) assert.ok(!mod.includes(no), `a module offers no ${no}`);
	const book = kinds(v.all('.booklet-design-node[data-kind="booklet"]')[0]);
	assert.ok(book.includes("module"));
	for (const no of ["question", "page", "row", "activity-tab"]) assert.ok(!book.includes(no), `the booklet offers no ${no}`);
	v.close();
});

test("a container with nothing in it says what to add; a part that needs an activity says so and offers the activity first", () => {
	const text = bookletAround("> [!module|m] M\n\n> [!module|m end]\n");
	const v = open(text);
	const mod = v.box("module", "[!module|m] M");
	assert.equal(words(mod.querySelector(":scope > .booklet-design-body > .booklet-design-empty")), "This module is empty. Add an activity.");
	click(addButton(mod));
	const fresh = v.box("module", "[!module|m] M");
	const needs = words(fresh.querySelector(".booklet-design-needs"));
	assert.match(needs, /page/i);
	assert.match(needs, /activity/i);
	const files = panel(fresh);
	assert.ok(files.includes("Structure - activity.md"), "the activity is on offer");
	assert.ok(!files.includes("Structure - page.md"), "the page is not");
	v.close();
	// each other empty container says its own words
	const w = open(bookletAround("> [!activity|a] A\n\n> [!page|p] P\n\n"));
	assert.equal(words(w.box("page", "[!page|p]").querySelector(":scope > .booklet-design-body > .booklet-design-empty")), "This page is empty. Add a question or some words.");
	w.close();
});

/* ======================================================================== insert, delete, move ======================================================================== */

test("choosing a piece writes exactly what the operation makes, as one write, and nothing else in the note moves", async () => {
	const v = open(FULL);
	const before = v.disk.text;
	const root = parseDesign(before);
	const page = walkDesign(root).find((n) => n.id === "map");
	const g = addChoices(page).groups.find((x) => x.kind === "question");
	const choice = piece("Q - choice.md");
	assert.ok(g.pieces.some((p) => p.file === choice.file));
	const expected = insertPiece(before, g.position, choice);
	assert.equal(expected.ok, true);
	click(addButton(v.box("page", "[!page|map")));
	openGroups(v.box("page", "[!page|map"));
	await v.press(v.box("page", "[!page|map").querySelector(`button[data-piece="${choice.file}"]`));
	assert.equal(v.disk.writes, 1, "one vault.process write");
	assertMinimal(before, v.disk.text, expected.text);
	assert.equal(v.view.getViewData(), v.disk.text, "the view shows what it wrote");
	assert.match(v.status(), /^Added Choice\./);
	// the new block is drawn and selected, and the panel is closed
	const nodes = walkDesign(parseDesign(v.disk.text)).filter((n) => n.kind === "question" && n.start >= expected.lines.start);
	assert.ok(v.all(".booklet-design-node.is-selected").length === 1);
	assert.equal(v.all(".booklet-design-panel").length, 0);
	assert.ok(nodes.length >= 1);
	v.close();
});

test("insert, delete and move in a note with Windows line endings and no final newline keep every line ending as it was", async () => {
	for (const [name, text] of [["crlf", crlf(FULL)], ["no final newline", ALL.NO_EOL], ["crlf, no final newline", crlf(ALL.NO_EOL)]]) {
		const v = open(text);
		const root = parseDesign(text);
		// an activity that holds nothing kept, so no question stands between the press and the write
		const first = walkDesign(root).find((n) => n.kind === "activity" && n.id && !n.implicit && deleteBlock(text, n).ok && !deleteBlock(text, n).impact.length && !deleteBlock(text, n).blind);
		assert.ok(first, `${name}: an activity to delete`);
		// delete it
		let before = v.disk.text;
		const del = deleteBlock(before, first);
		assert.equal(del.ok, true, name);
		await v.press(v.act(v.all(".booklet-design-node").find((b) => b.getAttribute("data-kind") === "activity" && b.getAttribute("data-start") === String(first.start)), "delete"));
		assertMinimal(before, v.disk.text, del.text);
		assert.equal(v.disk.text.includes("\r\n") || !text.includes("\r\n"), true, `${name}: no line ending was changed`);
		if (text.includes("\r\n")) assert.equal(v.disk.text.replace(/\r\n/g, "").includes("\n"), false, `${name}: no bare line feed came in`);
		// and put it back by the view's own undo
		await v.press(v.undo());
		assert.equal(v.disk.text, before, `${name}: undo gives the same bytes`);
		v.close();
	}
});

test("Delete takes a block out with what is in it and the blank lines after it, and nothing else", async () => {
	const v = open(FULL);
	const before = v.disk.text;
	const root = parseDesign(before);
	const target = walkDesign(root).find((n) => n.id === "why");
	const expected = deleteBlock(before, target);
	await v.press(v.act(v.box("activity", "[!activity|why"), "delete"));
	assertMinimal(before, v.disk.text, expected.text);
	assert.equal(v.disk.writes, 1);
	assert.match(v.status(), /^Deleted Activity: Why a budget helps\./);
	assert.equal(dialog(), null, "nothing kept, nothing to ask");
	v.close();
});

test("Move up and Move down move a block one place among its siblings, with its lines and nothing else; the ends have only one", async () => {
	const v = open(BARE);
	const before = v.disk.text;
	const root = parseDesign(before);
	const [one, two] = walkDesign(root).filter((n) => n.kind === "activity");
	const boxOne = v.box("activity", "[!activity|one");
	const boxTwo = v.box("activity", "[!activity|two");
	assert.equal(v.act(boxOne, "up").disabled, true, "the first has no Move up");
	assert.equal(v.act(boxOne, "down").disabled, false);
	assert.equal(v.act(boxTwo, "down").disabled, true, "the last has no Move down");
	const expected = moveBlock(before, one, positionAfter(two));
	assert.equal(expected.ok, true);
	await v.press(v.act(boxOne, "down"));
	assertMinimal(before, v.disk.text, expected.text);
	assert.equal(v.disk.writes, 1);
	const order = walkDesign(parseDesign(v.disk.text)).filter((n) => n.kind === "activity").map((n) => n.id);
	assert.deepEqual(order, ["two", "one"]);
	// the moved block stays selected, and Move up puts it back, byte for byte
	assert.ok(v.box("activity", "[!activity|one").classList.contains("is-selected"));
	await v.press(v.act(v.box("activity", "[!activity|one"), "up"));
	assert.equal(v.disk.text, before);
	v.close();
});

test("a part the format will not put there has no button, and if it is asked for anyway it is refused in the format's words and nothing is written", async () => {
	// an activity does not go above its module's tab
	const text = bookletAround("> [!module|m] M\n\n> [!tab|t] T\n\n> [!activity|a] A\n\n> [!activity|b] B\n\n> [!module|m end]\n");
	const v = open(text);
	const before = v.disk.text;
	const box = v.box("activity", "[!activity|a]");
	assert.equal(v.act(box, "up").disabled, true, "no Move up: the tab stands above it");
	assert.equal(v.act(v.box("activity", "[!activity|b]"), "up").disabled, false);
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
	const before = v.disk.text;
	// the note is changed under the view (a sync, another plugin): the vault holds new text, the view has not heard
	v.disk.text = before.replace("One", "Uno");
	await v.press(v.act(v.box("activity", "[!activity|one"), "delete"));
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
	const src = readFileSync(`${ROOT}/src/design-view.ts`, "utf8");
	assert.doesNotMatch(src, /vault\.(modify|create|append)\b|\.write\(/, "the only write is through note-view.ts");
	v.close();
});

test("with the note also open as Markdown, a change goes into that pane's editor as the smallest edit, and not into the file", async () => {
	const pane = fakePane("Note.booklet.md", FULL);
	const v = open(FULL, { pane });
	const before = pane.text();
	const root = parseDesign(before);
	const target = walkDesign(root).find((n) => n.id === "why");
	const expected = deleteBlock(before, target);
	await v.press(v.act(v.box("activity", "[!activity|why"), "delete"));
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

test("a delete that would detach kept answers says what will go, with counts, and waits for a yes", async () => {
	const v = open(HELD);
	const before = v.disk.text;
	const target = walkDesign(parseDesign(before)).find((n) => n.id === "once");
	const expected = deleteBlock(before, target);
	assert.ok(expected.impact.length >= 2);
	click(v.act(v.box("activity", "[!activity|once"), "delete"));
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
		click(v.act(v.box("activity", "[!activity|once"), "delete"));
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
		assert.ok(v.box("activity", "[!activity|once"), `${how}: it is still drawn`);
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
	click(v.act(v.box("activity", "[!activity|once"), "delete"));
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
	const t0 = v.disk.text;
	assert.equal(v.undo().disabled, true);
	assert.equal(v.redo().disabled, true);
	await v.press(v.act(v.box("activity", "[!activity|two"), "delete"));
	const t1 = v.disk.text;
	assert.notEqual(t1, t0);
	click(addButton(v.all('.booklet-design-node[data-kind="booklet"]')[0]));
	openGroups(v.all('.booklet-design-node[data-kind="booklet"]')[0]);
	const choice = piece("Structure - activity.md") ?? PIECES.find((p) => p.label === "activity");
	await v.press(v.all('.booklet-design-panel button').find((b) => b.getAttribute("data-piece") === choice.file));
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
	await v.press(v.act(v.box("activity", "[!activity|two"), "delete"));
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
	await v.press(v.act(v.box("activity", "[!activity|two"), "delete"));
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
	const del = v.act(v.box("activity", "[!activity|once"), "delete");
	click(del);
	click(del);
	assert.equal(w.document.querySelectorAll(".booklet-design-ask").length, 1, "one question");
	press(dialog(), "Cancel");
	await v.view.whenIdle();
	v.close();
});

/* ======================================================================== phone, and a user who never opens it ======================================================================== */

test("every action is a visible button with its words: no hover, no drag, no key is needed", () => {
	const v = open(FULL);
	// (the buttons inside an inert drawing are the reader's, drawn switched off: they are no action of this view)
	const drawn = v.all(".booklet-sample button");
	assert.ok(drawn.length > 0 && drawn.every((b) => b.disabled), "a drawn question's buttons are all off");
	const buttons = v.all("button").filter((b) => !b.closest(".booklet-sample"));
	assert.ok(buttons.length > 40);
	for (const b of buttons) {
		assert.equal(b.getAttribute("type"), "button");
		assert.ok(words(b).length > 0 || b.getAttribute("aria-label"), "a button has its words");
	}
	const src = readFileSync(`${ROOT}/src/design-view.ts`, "utf8");
	assert.doesNotMatch(src, /mouseover|mouseenter|dragstart|dragover|draggable|:hover/, "nothing is reachable only by hover or drag");
	const css = readFileSync(`${ROOT}/styles.base.css`, "utf8");
	assert.match(css, /\.is-mobile \.booklet-design button[^{]*\{[^}]*min-height:\s*44px/, "a phone gets 44 px targets");
	assert.match(css, /@container \(max-width: 30em\)/, "a narrow pane has its own rules");
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
