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

/** A document that keeps the listeners put on it. */
const doc = (name) => {
	const d = { name, listeners: [] };
	d.addEventListener = (type, fn, opts) => d.listeners.push({ type, fn, opts });
	d.removeEventListener = (type, fn) => {
		const i = d.listeners.findIndex((l) => l.type === type && l.fn === fn);
		if (i >= 0) d.listeners.splice(i, 1);
		else d.removedTwice = (d.removedTwice ?? 0) + 1;
	};
	return d;
};
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
	const unload = [];
	const plugin = {
		app: { workspace: ws, vault: { on: (name, fn) => ((vaultHandlers[name] ??= []).push(fn), { name }) } },
		registerView() {},
		registerEvent() {},
		register: (fn) => unload.push(fn),
		addCommand() {},
	};
	const emit = (name, ...args) => (handlers[name] ?? []).forEach((fn) => fn(...args));
	const add = (view) => {
		const leaf = { view };
		leaves.push(leaf);
		return leaf;
	};
	return { ws, plugin, emit, add, unload, vaultHandlers, main };
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
	forEachWindow({ registerEvent() {}, register() {} }, w.plugin.app, (d) => (heard.push(d.name), () => {}));
	assert.deepEqual(heard.sort(), ["main", "popout"]);
	w.emit("window-open", {}, { document: doc("later") });
	w.emit("window-open", {}, { document: popout });
	assert.deepEqual(heard.sort(), ["later", "main", "popout"], "the new window is heard, the known one is not heard twice");
});

test("[13] the drop's dragover listener is on every window's document", () => {
	const w = world();
	const popout = doc("popout");
	w.add(markdown("P.md", popout));
	const side = new EditorSide(w.plugin);
	side.install();
	for (const d of [w.main, popout]) {
		assert.deepEqual(d.listeners.map((l) => l.type), ["dragover"], `${d.name}: open when the plugin installed`);
		assert.equal(d.listeners[0].opts?.capture, true);
	}
	const later = doc("later");
	w.emit("window-open", {}, { document: later });
	assert.deepEqual(later.listeners.map((l) => l.type), ["dragover"], "a window that opens later");
});

test("[13] a window that closes lets go of the listeners on its document, and they are not touched again when the plugin unloads", () => {
	const w = world();
	const popout = doc("popout");
	w.add(markdown("P.md", popout));
	const side = new EditorSide(w.plugin);
	side.install();
	assert.equal(popout.listeners.length, 1);
	w.emit("window-close", {}, { document: popout });
	assert.equal(popout.listeners.length, 0, "taken off as the window closes");
	assert.equal(w.main.listeners.length, 1, "the main window keeps its own");
	w.emit("window-open", {}, { document: popout }); // a closed window is not heard again
	assert.equal(popout.listeners.length, 0);
	w.unload.forEach((fn) => fn());
	assert.equal(popout.removedTwice, undefined, "the closed window's document is not touched at unload");
	assert.equal(w.main.listeners.length, 0, "the windows still open are let go at unload");
});

test("[13] the panel's listener is let go with its window too: forEachWindow returns what `hear` returns to the close", () => {
	const w = world();
	const popout = doc("popout");
	w.add(markdown("P.md", popout));
	const released = [];
	forEachWindow({ registerEvent() {}, register() {} }, w.plugin.app, (d) => () => released.push(d.name));
	w.emit("window-close", {}, { document: popout });
	assert.deepEqual(released, ["popout"]);
	w.emit("window-close", {}, { document: popout });
	assert.deepEqual(released, ["popout"], "once");
});

// ---------------------------------------------------------------- second fix round, item E

test("[E] a pane that opens another note keeps its leaf: the panel follows the file-open", () => {
	const w = world();
	const side = new EditorSide(w.plugin);
	side.install();
	const a = markdown("A.md", w.main);
	const leaf = w.add(a);
	w.ws.recent = leaf;
	w.emit("active-leaf-change", leaf);
	assert.equal(side.markdownPath, "A.md");
	// the same leaf now shows B (a link was followed): no active-leaf-change is heard, only the file-open
	a.file = { path: "B.md" };
	w.emit("file-open", { path: "B.md" });
	assert.equal(side.markdownPath, "B.md");
	assert.equal(side.markdownView(), a);
});

test("[E] a file-open for a note that is not the pane in focus (an embed, a null file) leaves the panel on the pane in focus", () => {
	const w = world();
	const side = new EditorSide(w.plugin);
	side.install();
	const a = markdown("A.md", w.main);
	const leaf = w.add(a);
	w.ws.recent = leaf;
	w.emit("active-leaf-change", leaf);
	w.emit("file-open", { path: "Embedded.md" });
	w.emit("file-open", null);
	assert.equal(side.markdownPath, "A.md");
});

test("[E] a file-open on a booklet's reading page follows it as the reading page, and clears nothing else", () => {
	const w = world();
	const side = new EditorSide(w.plugin);
	side.install();
	const page = reading("C.booklet.md", w.main);
	const leaf = w.add(page);
	w.ws.recent = leaf;
	w.emit("file-open", { path: "C.booklet.md" });
	assert.equal(side.bookletPath, "C.booklet.md");
});

test("[E] a folder rename moves the paths under it, whether or not each note is announced after it", () => {
	const w = world();
	const side = new EditorSide(w.plugin);
	side.install();
	side.markdownPath = "Course/Week 1/Note.md";
	side.bookletPath = "Course/Week 1/Note.booklet.md";
	const renamed = (file, old) => w.vaultHandlers.rename.forEach((fn) => fn(file, old));
	renamed({ path: "Class/Week 1" }, "Course/Week 1"); // the folder only
	assert.equal(side.markdownPath, "Class/Week 1/Note.md");
	assert.equal(side.bookletPath, "Class/Week 1/Note.booklet.md");
	// each note announced as well, after the folder: its old path no longer matches, nothing moves twice
	renamed({ path: "Class/Week 1/Note.md" }, "Course/Week 1/Note.md");
	assert.equal(side.markdownPath, "Class/Week 1/Note.md");
	// a folder whose name only starts the same is not a parent
	renamed({ path: "Other" }, "Class/Week 1/No");
	assert.equal(side.markdownPath, "Class/Week 1/Note.md");
	// the whole top folder
	renamed({ path: "Classes" }, "Class");
	assert.equal(side.markdownPath, "Classes/Week 1/Note.md");
});

test("[4] a file-open in a pop-out window is followed: the leaf that shows the file, in whichever window, not only the main window's", () => {
	const pop = doc("pop");
	const w = world();
	const side = new EditorSide(w.plugin);
	side.install();
	const inMain = markdown("Main.md", w.main);
	const inPop = markdown("Pop.md", pop);
	const lMain = w.add(inMain);
	const lPop = w.add(inPop);
	inMain.leaf = lMain;
	inPop.leaf = lPop;
	w.ws.recent = lMain; // getMostRecentLeaf() looks in the main window only
	w.emit("active-leaf-change", lMain);
	assert.equal(side.markdownPath, "Main.md");
	// the pop-out's pane is the active one, and shows Pop.md
	w.ws.active = inPop;
	w.emit("file-open", { path: "Pop.md" });
	assert.equal(side.markdownPath, "Pop.md", "the active leaf, in the pop-out");
	// not active (another window has the focus), but still the one that shows the file
	w.ws.active = null;
	side.markdownPath = "Main.md";
	w.emit("file-open", { path: "Pop.md" });
	assert.equal(side.markdownPath, "Pop.md", "found by looking through every window's leaves");
	// a file no leaf shows (an embed) leaves it alone
	w.emit("file-open", { path: "Embedded.md" });
	assert.equal(side.markdownPath, "Pop.md");
});

test("[4] a note open as Markdown in one window and as a reading page in another: the file-open follows the active one", () => {
	const pop = doc("pop");
	const w = world();
	const side = new EditorSide(w.plugin);
	side.install();
	const md = markdown("Same.md", pop);
	const page = reading("Same.md", w.main);
	const lMd = w.add(md);
	const lPage = w.add(page);
	md.leaf = lMd;
	page.leaf = lPage;
	side.markdownPath = "Other.md";
	w.ws.recent = null;
	w.ws.active = page;
	w.emit("file-open", { path: "Same.md" });
	assert.equal(side.bookletPath, "Same.md", "the reading page was the active one");
	assert.equal(side.markdownPath, "Other.md", "the Markdown pane is not taken for it");
});
