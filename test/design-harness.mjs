/*
 * A Design view open on a note, for the tests of stage C (the inert drawings, the catalogue and the keys): the same rig as test/design-view.test.mjs
 * has, made once here. Not a test file (no `.test.mjs`), so `node --test` does not run it.
 */
import { window as w, click, words, testApp, testKeymap } from "./dom.mjs";
import assert from "node:assert/strict";
import { lineOf } from "./design-fixtures.mjs";

const { DesignView } = await import("./.build/view.mjs");
export const doc = w.document;

/** A Design view open on `text`, as a pane opens a note: loaded, then handed the text. `disk` is the note as the vault holds it. */
export function openDesign(text, { path = "Note.booklet.md" } = {}) {
	const disk = { text, writes: 0 };
	const app = testApp(disk, { workspace: { iterateAllLeaves: () => {} }, scope: { handlers: [], parent: null } });
	const view = new DesignView({ app }, { setMode: async () => {} });
	view.addAction = () => doc.createElement("div");
	view.file = { path, basename: path.replace(/\.md$/, "") };
	view.load();
	view.setViewData(text, true);
	const el = view.contentEl;
	const keymap = testKeymap();
	keymap.pushScope(view.scope);
	const all = (sel, from = el) => [...from.querySelectorAll(sel)];
	const o = {
		view,
		disk,
		el,
		app,
		all,
		box: (kind, needle) => {
			const start = String(lineOf(view.getViewData(), needle));
			const hit = all(`.booklet-design-node[data-kind="${kind}"]`).find((b) => b.getAttribute("data-start") === start);
			assert.ok(hit, `no ${kind} drawn at the line of ${needle}`);
			return hit;
		},
		status: () => words(el.querySelector(".booklet-design-status")),
		popup: () => el.querySelector(".booklet-design-popup"),
		/** The rows of the open popup: the letters, the words, and whether the row is off. */
		rows: () => all(".booklet-design-popup-row").map((b) => ({ keys: b.getAttribute("data-keys"), piece: b.getAttribute("data-piece"), label: words(b.querySelector(".booklet-design-popup-label")), off: b.disabled, current: b.getAttribute("aria-current") === "true", why: words(b.closest("li").querySelector(".booklet-design-popup-why")) })),
		/** A key into the view's scope, from the element that has the focus (the body by default), as a keydown a person makes. */
		key(k, { target = doc.body, ...mods } = {}) {
			const evt = new w.KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...mods });
			target.dispatchEvent(evt);
			return evt;
		},
		/** Several keys in a row (`"smEnter"` is not a thing: a list). */
		keys(...list) {
			for (const k of list) o.key(k);
		},
		async settle() {
			await view.whenIdle();
		},
		async press(button) {
			assert.ok(button && !button.disabled, "the button is there and on");
			click(button);
			await view.whenIdle();
		},
		close() {
			keymap.popScope(view.scope);
			view.unload();
			view.containerEl.remove();
		},
	};
	return o;
}

/** Counts the resize observers made and let go of, for a test of the leak (jsdom has none of its own). Gives `{ made, live, off }`; `off()` puts the global back. */
export function observerCount() {
	const had = Object.getOwnPropertyDescriptor(globalThis, "ResizeObserver");
	const c = { made: 0, disconnected: 0, get live() { return c.made - c.disconnected; }, off() { if (had) Object.defineProperty(globalThis, "ResizeObserver", had); else delete globalThis.ResizeObserver; } };
	globalThis.ResizeObserver = class {
		constructor() {
			c.made++;
			this.gone = false;
		}
		observe() {}
		unobserve() {}
		disconnect() {
			if (this.gone) return;
			this.gone = true;
			c.disconnected++;
		}
	};
	return c;
}
