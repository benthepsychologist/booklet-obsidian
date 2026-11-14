/*
 * A Design view open on a note, for the Design view's jsdom tests (design-view, design-draw, design-add, design-editor): the rig made
 * once here. Not a test file (no `.test.mjs`), so `node --test` does not run it.
 *
 * The view is the canvas of core/design-canvas.ts: a left column of two tabs (Outline, Add) and ONE page of the booklet at a time. The
 * helpers below say what a test means in the canvas's words: a block of the page, a card, a slot, a tile, the floating bar of a selected
 * block, the editor in place.
 */
import { window as w, click, words, testApp } from "./dom.mjs";
import assert from "node:assert/strict";
import { core } from "./helpers.mjs";
import { lineOf, FULL } from "./design-fixtures.mjs";
import { MarkdownView } from "./obsidian-stub.mjs";

const { DesignView } = await import("./.build/view.mjs");
export const doc = w.document;

/** Every icon name the view may ask for: an Obsidian whose set has them all. */
export const EVERY_ICON = new Set([
	...Object.values(core.LEVEL_ICONS).flat(),
	...core.walkDesign(core.parseDesign(FULL)).flatMap((n) => [...core.iconNamesOf(n)]),
	"pencil-ruler",
	"file-text",
	"book-open",
]);

/** An editor over a string, as a Markdown pane has one; every replacement it is given is kept. */
export function fakePane(path, text) {
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
export function openDesign(text, { path = "Note.booklet.md", icons = EVERY_ICON, pane = null, phone = false } = {}) {
	globalThis.__bookletStubIcons = icons;
	globalThis.__bookletStubPhone = phone;
	const disk = { text, writes: 0 };
	const app = testApp(disk, { workspace: { iterateAllLeaves: (fn) => void (pane && fn({ view: pane })) }, scope: { handlers: [], parent: null } });
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
	const keymap = app.keymap; // the app's own, so a scope the view pushes itself is on the same stack as the one pushed here
	keymap.pushScope(view.scope);
	const all = (sel, from = el) => [...from.querySelectorAll(sel)];
	const at = (n) => String(typeof n === "number" ? n : lineOf(view.getViewData(), n));
	const o = {
		view,
		disk,
		el,
		app,
		modes,
		actions,
		made,
		all,
		/** The page drawn now. */
		page: () => el.querySelector(".booklet-design-page"),
		/** The block of the page of this kind that starts on the line holding `needle` (or on that line number). */
		block: (kind, needle) => {
			const hit = all(`.booklet-design-block[data-kind="${kind}"]`).find((b) => b.getAttribute("data-start") === at(needle));
			assert.ok(hit, `no ${kind} block drawn at ${needle}`);
			return hit;
		},
		/** The card of the page of this kind that starts on the line holding `needle`. */
		card: (kind, needle) => {
			const hit = all(`.booklet-design-card[data-kind="${kind}"]`).find((b) => b.getAttribute("data-start") === at(needle));
			assert.ok(hit, `no ${kind} card drawn at ${needle}`);
			return hit;
		},
		/** The navigator's buttons, as their words. */
		navLabels: () => all(".booklet-design-nav-item").map(words),
		/** The navigator's button reading `label` (the first one when several do, or the `nth`). */
		navItem: (label, nth = 0) => {
			const hit = all(".booklet-design-nav-item").filter((b) => words(b) === label)[nth];
			assert.ok(hit, `no navigator entry reading ${label}`);
			return hit;
		},
		/** Draws the page of the navigator's entry reading `label`. */
		go: (label, nth = 0) => {
			if (o.tab("outline")?.getAttribute("aria-selected") !== "true") click(o.tab("outline"));
			click(o.navItem(label, nth));
		},
		/** The words the status line says. */
		status: () => words(el.querySelector(".booklet-design-status")),
		crumb: () => all(".booklet-design-crumb-item").map(words),
		undo: () => el.querySelector(".booklet-design-undo"),
		redo: () => el.querySelector(".booklet-design-redo"),
		/** The "+" slots of the page, in order. */
		slots: () => all(".booklet-design-slot"),
		/** The left column's tab button. */
		tab: (name) => el.querySelector(`.booklet-design-tab[data-tab="${name}"]`),
		/** Shows the Add tab (every group is opened by the test that wants its tiles). */
		showAdd: () => {
			if (o.tab("add")?.getAttribute("aria-selected") !== "true") click(o.tab("add"));
		},
		/** Opens every group of the palette. */
		openGroups: () => {
			o.showAdd();
			for (const h of all(".booklet-design-pal-head")) if (h.getAttribute("aria-expanded") === "false") click(h);
		},
		/** A tile of the palette (its group opened first) by the piece's file. */
		tile: (file) => {
			o.openGroups();
			const hit = el.querySelector(`.booklet-design-tile[data-piece="${file}"]`);
			assert.ok(hit, `no tile for ${file}`);
			return hit;
		},
		/** A chip of the Common row by the piece's file. */
		chip: (file) => {
			o.showAdd();
			const hit = el.querySelector(`.booklet-design-commonchip[data-piece="${file}"]`);
			assert.ok(hit, `no chip for ${file}`);
			return hit;
		},
		/** Presses a block: it is selected and opens in place. Gives the block as it is drawn after. */
		select: (kind, needle) => {
			click(o.block(kind, needle));
			return o.block(kind, needle);
		},
		/** Selects a block and closes its editor with Cancel, so the block stands selected with its bar. */
		pick: (kind, needle) => {
			o.select(kind, needle);
			click(o.editor().querySelector(".booklet-design-cancel"));
			return o.block(kind, needle);
		},
		/** A button of a selected block's floating bar, or of a card's bar: `up`, `down`, `edit` or `delete`. */
		act: (box, name) => box.querySelector(`:scope > .booklet-design-floatbar .booklet-design-${name}, :scope > .booklet-design-cardbar .booklet-design-${name}`),
		/** The editor box that is open, or null. */
		editor: () => el.querySelector(".booklet-design-editbox"),
		area: () => el.querySelector(".booklet-design-textarea"),
		/** A key into the view's scope, from the element that has the focus (the body by default), as a keydown a person makes. */
		key(k, { target = doc.body, ...mods } = {}) {
			const evt = new w.KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...mods });
			target.dispatchEvent(evt);
			return evt;
		},
		/** Several keys in a row. */
		keys(...list) {
			for (const k of list) o.key(k);
		},
		async settle() {
			await view.whenIdle();
		},
		/** Presses a button and waits for what it set going. */
		async press(button) {
			assert.ok(button && !button.disabled, "the button is there and on");
			click(button);
			await view.whenIdle();
		},
		close() {
			keymap.popScope(view.scope);
			view.unload();
			view.containerEl.remove();
			delete globalThis.__bookletStubPhone;
		},
	};
	return o;
}

/** Counts the resize observers made and let go of, for a test of the leak (jsdom has none of its own). Gives `{ made, live, off, fire }`; `off()` puts the global back. */
export function observerCount() {
	const had = Object.getOwnPropertyDescriptor(globalThis, "ResizeObserver");
	const c = {
		made: 0,
		disconnected: 0,
		callbacks: [],
		get live() {
			return c.made - c.disconnected;
		},
		/** Tells every live observer the pane is `width` wide. */
		fire(width) {
			for (const cb of c.callbacks) cb([{ contentRect: { width } }]);
		},
		off() {
			if (had) Object.defineProperty(globalThis, "ResizeObserver", had);
			else delete globalThis.ResizeObserver;
		},
	};
	globalThis.ResizeObserver = class {
		constructor(cb) {
			c.made++;
			this.gone = false;
			this.cb = cb;
			c.callbacks.push(cb);
		}
		observe() {}
		unobserve() {}
		disconnect() {
			if (this.gone) return;
			this.gone = true;
			c.disconnected++;
			c.callbacks = c.callbacks.filter((x) => x !== this.cb);
		}
	};
	return c;
}
