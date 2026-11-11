/*
 * A pop-out window that is closing. Obsidian 1.11 throws a bare "illegal access", uncaught, in the main window when a note is written
 * as a pop-out window closes (measured in the real app: a write that starts within about 30 ms of the close does it, one 100 ms after
 * does not). A view told by the workspace's `window-close` that its own window is closing holds its write until THAT window (the one
 * the event gives, not one the view remembered when it opened: a view's first window is not always the pop-out it ends in) reports
 * closed and src/window-gone.ts's SETTLE has passed; a window that stays open does not hold a write back for good. The quit event's
 * task does the same for a view in a pop-out window, which the app closes as it quits.
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
const fakeWindow = (document = null) => ({ closed: false, document });

test("windowGone: a window that is closed is waited for the settle more, and not before it is closed", async () => {
	const win = fakeWindow();
	let done = false;
	const p = windowGone(win).then(() => (done = true));
	await sleep(120);
	assert.equal(done, false, "it went on while the window was still open");
	const at = Date.now();
	win.closed = true;
	await p;
	// the settle is 50 ms: the test names its own floor (the poll that sees the close is at most 25 ms behind), so a settle taken out cannot take the check with it
	assert.ok(Date.now() - at >= 40, `it went on ${Date.now() - at} ms after the close, less than the settle`);
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
	// The window the workspace says is closing is an object of its own (as Obsidian's is: the view's first window was not it), with the
	// view's document; `closed` is its to say.
	const popout = fakeWindow(w.document);
	return { ...v, handlers, popout, closing: () => handlers.forEach((h) => h({}, popout)) };
}

const field = (v) => v.view.contentEl.querySelector('[data-booklet-activity="/kinds"] .booklet-kind-text textarea');
const typeAndLeave = (v) => {
	const t = field(v);
	t.focus();
	typeInto(t, "Typed as the window closed");
	t.blur();
};
const written = (v) => !!core.parseBooklet(v.disk.text).records.answers[""]?.thoughts;

test("a view whose window is closing writes what was typed only once that window is closed, and then does", async () => {
	const v = open();
	assert.ok(v.handlers.length > 0, "the view did not listen for the workspace's window-close");
	try {
		v.closing();
		typeAndLeave(v);
		await sleep(150);
		assert.equal(v.disk.writes, 0, "the note was written while the window was closing");
		const at = Date.now();
		v.popout.closed = true;
		await until(() => v.disk.writes > 0, "the write after the window closed");
		// a wait on some other window (the one the view was first drawn in never closes) would give up only at the 2 s limit
		assert.ok(Date.now() - at < 700, `the write came ${Date.now() - at} ms after the window closed`);
		assert.ok(written(v), "what was typed was not the note's answer after the window closed");
	} finally {
		v.close();
	}
});

test("a view whose window is not closing writes at once; another window's closing does not hold it", async () => {
	const v = open();
	try {
		// the other window has a document of its own
		v.handlers.forEach((h) => h({}, fakeWindow({})));
		typeAndLeave(v);
		// a window that is not this view's does not hold its write: it lands well inside the time a held write would wait for the window
		await sleep(300);
		assert.ok(v.disk.writes > 0, "another window's closing held back this view's write");
		assert.ok(written(v));
	} finally {
		v.close();
	}
});

/** The view as if drawn in a pop-out window: its document's window is `win`, not the main window. */
const inPopout = (v, win) => Object.defineProperty(v.view.contentEl.ownerDocument, "defaultView", { configurable: true, value: win });

test("the quit task of a view in a pop-out window writes once that window has closed; the quit waits for it", async () => {
	const v = open();
	const win = fakeWindow(w.document);
	try {
		inPopout(v, win);
		typeInto(field(v), "Typed as the app quits");
		let done = false;
		const task = v.view.saveTypedAtQuit().then(() => (done = true));
		await sleep(150);
		assert.equal(v.disk.writes, 0, "the quit task wrote while the pop-out window was still open (the app closes it as it quits)");
		assert.equal(done, false);
		win.closed = true;
		await task;
		assert.ok(v.disk.writes > 0 && written(v), "the quit task finished without the words written");
	} finally {
		delete w.document.defaultView;
		v.close();
	}
});

test("the quit task of a view in the main window writes at once", async () => {
	const v = open();
	try {
		typeInto(field(v), "Typed in the main window as the app quits");
		await v.view.saveTypedAtQuit();
		assert.ok(v.disk.writes > 0 && written(v), "the quit task of a main-window view did not write the words");
	} finally {
		v.close();
	}
});
