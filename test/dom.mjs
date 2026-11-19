/*
 * A jsdom document with the element helpers Obsidian adds to the DOM (createEl, createDiv, setAttr, toggleClass,
 * empty, setText, instanceOf …), installed as globals, for running the Booklet view in Node (test/view.test.mjs).
 * Import this before the view's bundle. It also opens the view as the view tests open it (openView), and types and
 * presses keys in it.
 */
import { JSDOM } from "jsdom";
import { sleep } from "./helpers.mjs";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true });
const w = dom.window;

function apply(el, o) {
	const info = typeof o === "string" ? { cls: o } : o ?? {};
	if (info.cls) el.className = Array.isArray(info.cls) ? info.cls.join(" ") : info.cls;
	if (info.text !== undefined) el.textContent = String(info.text);
	if (info.type !== undefined) el.type = info.type;
	if (info.value !== undefined) el.value = info.value;
	if (info.placeholder !== undefined) el.setAttribute("placeholder", info.placeholder);
	if (info.title !== undefined) el.setAttribute("title", info.title);
	for (const [k, v] of Object.entries(info.attr ?? {})) if (v !== null && v !== undefined && v !== false) el.setAttribute(k, String(v));
	return el;
}

// on Element, not HTMLElement, as Obsidian has them: an svg element made by createSvg has them too
const P = w.Element.prototype;
P.createEl = function (tag, o, cb) {
	const el = apply(this.ownerDocument.createElement(tag), o);
	this.appendChild(el);
	cb?.(el);
	return el;
};
P.createDiv = function (o, cb) {
	return this.createEl("div", o, cb);
};
P.createSpan = function (o, cb) {
	return this.createEl("span", o, cb);
};
P.setAttr = function (k, v) {
	if (v === null || v === undefined) this.removeAttribute(k);
	else this.setAttribute(k, String(v));
};
P.addClass = function (...c) {
	this.classList.add(...c);
};
P.removeClass = function (...c) {
	this.classList.remove(...c);
};
P.toggleClass = function (c, on) {
	this.classList.toggle(c, on);
};
P.empty = function () {
	while (this.firstChild) this.removeChild(this.firstChild);
};
P.setText = function (t) {
	this.textContent = t;
};
P.appendText = function (t) {
	this.appendChild(this.ownerDocument.createTextNode(t));
};
/**
 * Obsidian's createSvg: an svg element made in the SVG namespace and put in this node. As in real Obsidian 1.14.5 a class
 * is one name or a list of names, and a string with a space in it throws (a list is how a second name is given): the fake
 * adds the classes with classList, which throws the same InvalidCharacterError, so a test cannot pass what Obsidian refuses.
 */
w.Node.prototype.createSvg = function (tag, o, cb) {
	const el = this.ownerDocument.createElementNS("http://www.w3.org/2000/svg", tag);
	const info = typeof o === "string" ? { cls: o } : (o ?? {});
	if (info.cls) el.classList.add(...(Array.isArray(info.cls) ? info.cls : [info.cls]));
	if (info.text !== undefined) el.textContent = String(info.text);
	for (const [k, v] of Object.entries(info.attr ?? {})) if (v !== null && v !== undefined && v !== false) el.setAttribute(k, String(v));
	this.appendChild(el);
	cb?.(el);
	return el;
};
w.Node.prototype.instanceOf = function (T) {
	return this instanceof T;
};
// the window a node is in (Obsidian's `node.win`); for a document, the window it is in
Object.defineProperty(w.Node.prototype, "win", {
	configurable: true,
	get() {
		return this.defaultView ?? this.ownerDocument?.defaultView ?? w;
	},
});
// Obsidian's helpers on a window (a pop-out window included): they make a loose element in that window's document, so that
// `doc.win.createEl(...)` is an element of `doc`. Not on a Document: there `createEl` appends to the node it is called on.
w.createEl = function (tag, o, cb) {
	const el = apply(this.document.createElement(tag), o);
	cb?.(el);
	return el;
};
w.createDiv = function (o, cb) {
	return this.createEl("div", o, cb);
};
w.createSpan = function (o, cb) {
	return this.createEl("span", o, cb);
};
w.createFragment = function (cb) {
	const el = this.document.createDocumentFragment();
	cb?.(el);
	return el;
};

for (const k of ["window", "document", "Node", "HTMLElement", "HTMLInputElement", "HTMLTextAreaElement", "HTMLButtonElement", "Event", "KeyboardEvent", "FocusEvent"])
	globalThis[k] = k === "window" ? w : w[k];
// Obsidian's globals for the window and document that are in front (the one the reader is in); here, the one window there is
globalThis.activeWindow = w;
globalThis.activeDocument = w.document;

export { w as window };

/** Typing in a field: its value set, and the input event a field sends. */
export const typeInto = (el, value) => {
	el.value = value;
	el.dispatchEvent(new w.Event("input", { bubbles: true }));
};
/** A key pressed in an element: cancelable, so a handler's `preventDefault` can be seen. */
export const press = (el, key) => el.dispatchEvent(new w.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));

// the view's bundle, once the globals above are in place
const { BookletView, MediaAllows } = await import("./.build/view.mjs");

/**
 * An app as the view tests stub it: a vault whose process() writes the note to `disk.text` and counts the writes in
 * `disk.writes`, and a workspace with no leaves. `more` adds to it: its `vault` and `workspace` to those, the rest
 * beside them (a device store, say).
 */
export function testApp(disk, more = {}) {
	const { vault, workspace, ...rest } = more;
	return {
		scope: {},
		keymap: testKeymap(),
		vault: {
			process: async (_file, fn) => {
				disk.writes++;
				disk.text = fn(disk.text);
				return disk.text;
			},
			on: () => ({}),
			...vault,
		},
		workspace: { iterateAllLeaves() {}, on: () => ({}), openLinkText: async () => {}, requestSaveLayout() {}, ...workspace },
		...rest,
	};
}

/**
 * The app's key scopes as Obsidian keeps them: a stack, and a key goes to the topmost scope (or up through its parents) and to no scope
 * below it; a handler that returns false takes the key. `scopes` is the stack, for a test that puts a modal's scope over a card's.
 */
export function testKeymap(win = w) {
	const scopes = [];
	// a handler's modifiers as the app reads them: null is any, [] none, "Mod" is Ctrl or Cmd, "Ctrl", "Meta", "Alt" and "Shift" themselves
	const matches = (h, evt) => {
		if (h.key !== evt.key) return false;
		if (h.modifiers === null) return true;
		const have = new Set([...(evt.ctrlKey ? ["Ctrl"] : []), ...(evt.metaKey ? ["Meta"] : []), ...(evt.altKey ? ["Alt"] : []), ...(evt.shiftKey ? ["Shift"] : [])]);
		const want = new Set(h.modifiers.map((m) => (m === "Mod" ? (have.has("Meta") ? "Meta" : "Ctrl") : m)));
		return want.size === have.size && [...want].every((m) => have.has(m));
	};
	win.addEventListener(
		"keydown",
		(evt) => {
			for (let s = scopes.at(-1); s; s = s.parent) {
				const h = s.handlers.find((x) => matches(x, evt));
				if (h && h.func(evt, {}) === false) {
					evt.preventDefault();
					evt.stopPropagation();
					return;
				}
			}
			// the end of the chain is the app's root scope, whose catch-all runs the user's and the default hotkeys. Ctrl or Cmd with Enter is
			// "open link in new tab", which the app takes whatever has the focus (seen in the real app): the page never hears that chord
			if (evt.key === "Enter" && (evt.ctrlKey || evt.metaKey) && !evt.altKey && !evt.shiftKey) {
				evt.preventDefault();
				evt.stopPropagation();
			}
		},
		true,
	);
	return {
		scopes,
		pushScope: (s) => void (scopes.at(-1) !== s && scopes.push(s)),
		popScope: (s) => void (scopes.includes(s) && scopes.splice(scopes.indexOf(s), 1)),
	};
}

/** A press: the click a pointer sends to `el`. Gives back the event, to see whether a handler stopped its default. */
export const click = (el) => {
	const evt = new w.MouseEvent("click", { bubbles: true, cancelable: true });
	el.dispatchEvent(evt);
	return evt;
};
/** The words an element shows, white space collapsed. */
export const words = (n) => (n?.textContent ?? "").replace(/\s+/g, " ").trim();

/** Waits for a state a test names (polling, 5 ms apart, for at most 5 s), in place of sleeping a time the state is hoped to be there by. */
export async function until(cond, what = "the state the test waits for") {
	for (let n = 0; n < 1000; n++) {
		let ok = false;
		try {
			ok = !!cond();
		} catch {
			ok = false;
		}
		if (ok) return;
		await sleep(5);
	}
	throw new Error("timed out waiting for " + what);
}

/**
 * Waits until the view has nothing under way: no move, every piece of Markdown rendered, every write landed. It polls the
 * view's own state (every 2 ms for at most 5 s, then it fails loudly) in place of sleeping a guessed time;
 * `ms` is only for a test that must let a timer of the view's own run (a debounce), and says so by asking for it.
 */
export async function quiet(view, ms = 0) {
	// it reads the view's own fields: if one is renamed it must fail, not return at once as if all were quiet
	for (const k of ["writes", "moving", "afterMove", "rendering"]) if (!(k in view)) throw new Error(`quiet reads the view's "${k}", which the view no longer has`);
	if (ms) await sleep(ms);
	for (let turn = 0; ; turn++) {
		await new Promise((r) => setTimeout(r, turn ? 2 : 0));
		const writes = view.writes;
		await writes;
		if (view.writes === writes && !view.moving && !view.afterMove && !view.rendering) return;
		if (turn > 2500) throw new Error("the view did not settle: moving " + view.moving + ", rendering " + view.rendering);
	}
}

/**
 * A Booklet view open on `text` at `path`, loaded and handed the text as a pane opens a note. `disk` is the note as the
 * vault holds it, and `app` the app the view is in (testApp(disk) unless a test brings its own). Each test file adds
 * its own finders to what this returns.
 */
export function openView(text, { path = "Note.booklet.md", disk = { text, writes: 0 }, app = testApp(disk), screen = null, media = new MediaAllows(null, () => {}) } = {}) {
	// the pane: a move through it comes back as the view's own setState, as Obsidian does it
	const leaf = { app, setViewState: async (vs) => view.setState(vs.state, {}) };
	const view = new BookletView(leaf, { setMode: async () => {}, manifest: { version: "9.8.7" }, media });
	view.file = { path, basename: path.replace(/\.md$/, "") };
	view.load();
	// the screen the pane is on (a saved place), when a test works on one activity's screen
	if (screen) void view.setState({ version: 2, screen }, {});
	view.setViewData(text, true);
	return {
		view,
		disk,
		/** The note changed elsewhere: the vault holds the new text, and the view is handed it. */
		changed(edit) {
			disk.text = edit(disk.text);
			view.setViewData(disk.text, false);
		},
		/** The view has nothing under way and every write has landed (`ms`: a timer of the view's own to let run first). */
		settled: (ms = 0) => quiet(view, ms),
		close() {
			view.unload();
			view.containerEl.remove();
		},
	};
}
