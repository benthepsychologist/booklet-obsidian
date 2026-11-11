/*
 * Editor mode's side of the plugin (src/editor-side.ts), with a workspace made up of leaves. Two things from the review:
 *   - nothing here keeps a view of Obsidian's: the note the panel writes to is a path, and the view is found in the workspace when it is
 *     wanted (the directory's checklist has "no stored references to custom views"), so a panel restored from the saved layout finds
 *     its note before any pane has been switched to, and a pane that was closed is not held on to;
 *   - the listeners that must hear the editor are on the document of every window, a popout's included, the ones open now and the ones
 *     that open later.
 */
import test from "node:test";
import assert from "node:assert/strict";

const { EditorSide, forEachWindow, BookletView } = await import("./.build/view.mjs");
const { MarkdownView } = await import("./obsidian-stub.mjs");

const doc = (name) => ({ name });
const markdown = (path, ownerDocument) => {
	const v = Object.create(MarkdownView.prototype);
	v.file = { path };
	v.editor = { path };
	v.containerEl = { ownerDocument };
	return v;
};
const reading = (path, ownerDocument) => {
	const v = Object.create(BookletView.prototype);
	Object.defineProperty(v, "file", { value: { path } });
	v.containerEl = { ownerDocument };
	return v;
};

/** A workspace of leaves; `emit` calls the handlers registered for an event. */
function world(main = doc("main")) {
	globalThis.activeDocument = main; // the main window's document, as Obsidian's global names it
	const leaves = [];
	const handlers = {};
	const vaultHandlers = {};
	const ws = {
		leaves,
		recent: null,
		active: null,
		on: (name, fn) => ((handlers[name] ??= []).push(fn), { name }),
		onLayoutReady: (fn) => fn(),
		iterateAllLeaves: (fn) => leaves.forEach(fn),
		getLeavesOfType: (type) => leaves.filter((l) => (type === "booklet" ? l.view instanceof BookletView : false)),
		getMostRecentLeaf: () => ws.recent,
		getActiveViewOfType: (cls) => (ws.active instanceof cls ? ws.active : null),
	};
	const dom = [];
	const plugin = {
		app: { workspace: ws, vault: { on: (name, fn) => ((vaultHandlers[name] ??= []).push(fn), { name }) } },
		registerView() {},
		registerEvent() {},
		registerDomEvent: (d, type, fn, opts) => dom.push({ doc: d, type, opts }),
		addCommand() {},
	};
	const emit = (name, ...args) => (handlers[name] ?? []).forEach((fn) => fn(...args));
	const add = (view) => {
		const leaf = { view };
		leaves.push(leaf);
		return leaf;
	};
	return { ws, plugin, emit, add, dom, vaultHandlers, main };
}

test("[7] editor mode keeps paths, never views: the note last in focus is a path, and the view is found again each time", () => {
	const w = world();
	const side = new EditorSide(w.plugin);
	side.install();
	const a = markdown("A.md", w.main);
	const la = w.add(a);
	w.add(reading("B.booklet.md", w.main));
	w.emit("active-leaf-change", la);
	assert.equal(side.markdownPath, "A.md");
	for (const [k, v] of Object.entries(side)) assert.ok(!(v instanceof MarkdownView) && !(v instanceof BookletView), `${k} holds a view`);
	assert.equal(side.markdownView(), a, "found in the workspace");
	// the pane is closed: nothing is held on to
	w.ws.leaves.length = 0;
	assert.equal(side.markdownView(), null);
	// the same note open again in another pane is found
	const again = markdown("A.md", w.main);
	w.add(again);
	assert.equal(side.markdownView(), again);
});

test("[7] a panel restored with the saved layout finds its note before any pane has been switched to", () => {
	const w = world();
	const side = new EditorSide(w.plugin);
	side.install(); // no active-leaf-change has been heard
	assert.equal(side.markdownPath, null);
	const open = markdown("Restored.md", w.main);
	w.add(open);
	w.ws.active = open;
	w.ws.recent = w.ws.leaves[0];
	assert.equal(side.markdownView(), open, "the active Markdown pane");
	w.ws.active = null;
	assert.equal(side.markdownView(), open, "the most recently used pane, when it is Markdown");
});

test("[7] the pane of the note named is preferred when several are open, and a rename keeps the path", () => {
	const w = world();
	const side = new EditorSide(w.plugin);
	side.install();
	const one = markdown("One.md", w.main);
	const two = markdown("Two.md", w.main);
	const l1 = w.add(one);
	const l2 = w.add(two);
	w.emit("active-leaf-change", l1);
	w.ws.recent = l2;
	assert.equal(side.markdownView(), one, "the one named, not the most recent");
	w.vaultHandlers.rename.forEach((fn) => fn({ path: "Renamed.md" }, "One.md"));
	assert.equal(side.markdownPath, "Renamed.md");
	one.file.path = "Renamed.md";
	assert.equal(side.markdownView(), one);
});

test("[7] the reading page is remembered by path too, and offered only while it is open", () => {
	const w = world();
	const side = new EditorSide(w.plugin);
	side.install();
	const page = reading("B.booklet.md", w.main);
	// a leaf of the booklet type
	const leaf = w.add(page);
	w.emit("active-leaf-change", leaf);
	assert.equal(side.bookletPath, "B.booklet.md");
	assert.equal(side.bookletOpen().path, "B.booklet.md");
	w.ws.leaves.length = 0;
	assert.equal(side.bookletOpen(), null);
});

test("[13] a listener is put on the document of the main window, of each popout already open, and of each one that opens later, once", () => {
	const w = world();
	const popout = doc("popout");
	w.add(markdown("P.md", popout));
	const heard = [];
	forEachWindow({ registerEvent() {} }, w.plugin.app, (d) => heard.push(d.name));
	assert.deepEqual(heard.sort(), ["main", "popout"]);
	w.emit("window-open", {}, { document: doc("later") });
	w.emit("window-open", {}, { document: popout });
	assert.deepEqual(heard.sort(), ["later", "main", "popout"], "the new window is heard, the known one is not heard twice");
});

test("[13] the drop's dragover listener is on every window's document", () => {
	const w = world();
	w.add(markdown("P.md", doc("popout")));
	const side = new EditorSide(w.plugin);
	side.install();
	w.emit("window-open", {}, { document: doc("later") });
	const on = w.dom.filter((d) => d.type === "dragover").map((d) => d.doc.name).sort();
	assert.deepEqual(on, ["later", "main", "popout"]);
	assert.ok(w.dom.every((d) => d.opts?.capture === true));
});
