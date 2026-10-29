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

const P = w.HTMLElement.prototype;
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
w.Node.prototype.instanceOf = function (T) {
	return this instanceof T;
};

for (const k of ["window", "document", "Node", "HTMLElement", "HTMLInputElement", "HTMLTextAreaElement", "HTMLButtonElement", "Event", "KeyboardEvent", "FocusEvent"])
	globalThis[k] = k === "window" ? w : w[k];

export { w as window };

/** Typing in a field: its value set, and the input event a field sends. */
export const typeInto = (el, value) => {
	el.value = value;
	el.dispatchEvent(new w.Event("input", { bubbles: true }));
};
/** A key pressed in an element. */
export const press = (el, key) => el.dispatchEvent(new w.KeyboardEvent("keydown", { key, bubbles: true }));

// the view's bundle, once the globals above are in place
const { BookletView } = await import("./.build/view.mjs");

/**
 * An app as the view tests stub it: a vault whose process() writes the note to `disk.text` and counts the writes in
 * `disk.writes`, and a workspace with no leaves. `more` adds to it: its `vault` and `workspace` to those, the rest
 * beside them (a device store, say).
 */
export function testApp(disk, more = {}) {
	const { vault, workspace, ...rest } = more;
	return {
		vault: {
			process: async (_file, fn) => {
				disk.writes++;
				disk.text = fn(disk.text);
				return disk.text;
			},
			...vault,
		},
		workspace: { iterateAllLeaves() {}, on: () => ({}), openLinkText: async () => {}, requestSaveLayout() {}, ...workspace },
		...rest,
	};
}

/**
 * A Booklet view open on `text` at `path`, loaded and handed the text as a pane opens a note. `disk` is the note as the
 * vault holds it, and `app` the app the view is in (testApp(disk) unless a test brings its own). Each test file adds
 * its own finders to what this returns.
 */
export function openView(text, { path = "Note.booklet.md", disk = { text, writes: 0 }, app = testApp(disk), screen = null } = {}) {
	// the pane: a move through it comes back as the view's own setState, as Obsidian does it
	const leaf = { app, setViewState: async (vs) => view.setState(vs.state, {}) };
	const view = new BookletView(leaf, { setMode: async () => {} });
	view.file = { path, basename: path.replace(/\.md$/, "") };
	view.load();
	// the screen the pane is on (a saved place), when a test works on one activity's screen
	if (screen) void view.setState({ version: 1, screen }, {});
	view.setViewData(text, true);
	return {
		view,
		disk,
		/** The note changed elsewhere: the vault holds the new text, and the view is handed it. */
		changed(edit) {
			disk.text = edit(disk.text);
			view.setViewData(disk.text, false);
		},
		/** Timers run and every write has landed. */
		settled: async (ms = 0) => {
			await sleep(ms + 30);
			await view.writes;
			await sleep(5);
		},
		close() {
			view.unload();
			view.containerEl.remove();
		},
	};
}
