/*
 * A pop-out window that is closing. Obsidian 1.11 throws a bare "illegal access", uncaught, in the main window when a note is written
 * as a pop-out window closes (measured in the real app: a write that starts within about 30 ms of the close does it, one 100 ms after
 * does not). A view told by the workspace's `window-close` that its own window is closing holds its write until the window reports
 * closed and src/window-gone.ts's SETTLE has passed; a window that stays open does not hold a write back for good.
 */
import { openView, testApp, typeInto, window as w, until } from "./dom.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, core, sleep } from "./helpers.mjs";
const { windowGone } = await import("./.build/view.mjs");

const NOTE = readFileSync(join(ROOT, "test-vault", "Every kind.booklet.md"), "utf8");

/** A window as the main window sees another one: `closed` is false until the test closes it. */
const fakeWindow = () => {
	const win = { closed: false };
	return win;
};

test("windowGone: a window that is closed is waited for SETTLE ms more, and not before it is closed", async () => {
	const win = fakeWindow();
	let done = false;
	const p = windowGone(win).then(() => (done = true));
	await sleep(120);
	assert.equal(done, false, "it went on while the window was still open");
	const at = Date.now();
	win.closed = true;
	await p;
	// the settle is 200 ms: the test names its own floor, so a settle taken out cannot take the check with it
	assert.ok(Date.now() - at >= 150, `it went on ${Date.now() - at} ms after the close, less than the settle`);
});

test("windowGone: a window that never closes holds nothing back for good, and a missing window is already gone", async () => {
	const at = Date.now();
	// a limit that is not kept would wait for ever: the wait is raced against a time of the test's own
	const open = fakeWindow();
	await Promise.race([windowGone(open, 100, 10, 0), sleep(1500)]);
	const waited = Date.now() - at;
	open.closed = true; // ends a wait that was not given up, so a failure here is a failure and not a test that never ends
	assert.ok(waited >= 90 && waited < 1000, `a window that stays open held it ${waited} ms, not the 100 ms limit`);
	const gone = Date.now();
	await windowGone(null, 2000, 25, 20);
	assert.ok(Date.now() - gone < 500, "a null window was waited for as if it were open");
});

/** A view whose workspace hands out the `window-close` handlers, so a test can close its window. */
function open() {
	const handlers = [];
	const disk = { text: NOTE, writes: 0 };
	const app = testApp(disk, { workspace: { on: (name, fn) => (name === "window-close" ? (handlers.push(fn), {}) : {}) } });
	const v = openView(NOTE, { path: "Every kind.booklet.md", screen: "activity:/kinds", disk, app });
	// the window this view is in is `w`; the workspace says it is closing with a Window object of its own that has the same document
	const closing = () => handlers.forEach((h) => h({}, { document: w.document }));
	return { ...v, handlers, closing };
}

const typeAndLeave = (v) => {
	const t = v.view.contentEl.querySelector('[data-booklet-activity="/kinds"] .booklet-kind-text textarea');
	t.focus();
	typeInto(t, "Typed as the window closed");
	t.blur();
};
const written = (v) => !!core.parseBooklet(v.disk.text).records.answers[""]?.thoughts;

test("a view whose window is closing writes what was typed only once the window is closed and settled", async () => {
	const v = open();
	assert.ok(v.handlers.length > 0, "the view did not listen for the workspace's window-close");
	Object.defineProperty(w, "closed", { configurable: true, value: false });
	try {
		v.closing();
		typeAndLeave(v);
		await sleep(150);
		assert.equal(v.disk.writes, 0, "the note was written while the window was closing");
		Object.defineProperty(w, "closed", { configurable: true, value: true });
		await sleep(100);
		assert.equal(v.disk.writes, 0, "the note was written before the settle after the close had passed");
		await until(() => v.disk.writes > 0, "the write after the window closed");
		assert.ok(written(v), "what was typed was not the note's answer after the window closed");
	} finally {
		delete w.closed;
		v.close();
	}
});

test("a view whose window is not closing writes at once; another window's closing does not hold it", async () => {
	const v = open();
	Object.defineProperty(w, "closed", { configurable: true, value: false });
	try {
		// the other window has a document of its own
		v.handlers.forEach((h) => h({}, { document: {} }));
		typeAndLeave(v);
		// a window that is not this view's does not hold its write: it lands well inside the time a held write would wait for the window
		await sleep(300);
		assert.ok(v.disk.writes > 0, "another window's closing held back this view's write");
		assert.ok(written(v));
	} finally {
		delete w.closed;
		v.close();
	}
});
