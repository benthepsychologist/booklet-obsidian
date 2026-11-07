/*
 * Playback that outlives its page (plan point 12, lane P): the now-playing bar (src/now-playing.ts) and the writer that puts her place
 * in the note when no Booklet view can (src/listen-writer.ts). The media is test/helpers.mjs's `fakeMedia`; nothing plays and no time
 * passes by itself, so the one thing a test cannot see is a gap that pauses a real element: it asserts that the very same element is
 * connected after every step and that no `pause` was fired on the way. Real Obsidian is checked by lane E. Every note is made up.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import esbuild from "esbuild";
import { click, quiet, testApp, until, window as w, words } from "./dom.mjs";
import { assertOutsideUnchanged, core, fakeMedia, norm, ROOT } from "./helpers.mjs";
import { Notice, useMediaRender } from "./obsidian-stub.mjs";

process.env.TZ = "UTC";

const { BookletView, MediaAllows } = await import("./.build/view.mjs");
const bundle = await esbuild.build({
	stdin: { contents: 'export { NowPlaying } from "./src/now-playing"; export { ListenWriter } from "./src/listen-writer"; export { createPlayer, drawMedia } from "./src/media-view";', resolveDir: ROOT, loader: "ts" },
	bundle: true,
	format: "esm",
	platform: "neutral",
	write: false,
	alias: { obsidian: `${ROOT}/test/obsidian-stub.mjs` },
	logLevel: "silent",
});
const { NowPlaying, ListenWriter, drawMedia, createPlayer } = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64"));

const HEAD = '---\nbooklet: "0.19"\nid: made/up\ntitle: Made up\nlang: en\n---\n';
const COURSE =
	HEAD +
	`
> [!activity|course] The course

> [!listen|e1] Episode 1: Foundations
> ![Episode 1](media/ep1.mp3)
> Listen to it all.

> [!listen|e2] Episode 2
> ![Episode 2](media/ep2.mp3)

> [!activity|more] More

> [!text|q1] What stayed with you?
`;
const PATH = "Note.booklet.md";
const STORE = `booklet-listen:${PATH}`;
const BAR = ".booklet-nowplaying";

/** An app with a device store and a vault of one note; `views` lists the Booklet views open on it. */
function rig(text = COURSE, seed = {}) {
	// a test that failed half way leaves its bar in the window
	w.document.querySelectorAll(`${BAR}, .booklet-nowplaying-live`).forEach((b) => b.remove());
	w.document.body.classList.remove("booklet-has-nowplaying");
	const disk = { text, writes: 0 };
	const store = new Map(Object.entries(seed).map(([k, v]) => [k, JSON.stringify(v)]));
	const app = testApp(disk, {
		vault: { getFileByPath: (p) => (p === (disk.path ?? PATH) ? { path: p } : null), cachedRead: async () => disk.text },
		loadLocalStorage: (k) => (store.has(k) ? JSON.parse(store.get(k)) : null),
		saveLocalStorage: (k, d) => (d === null ? store.delete(k) : store.set(k, JSON.stringify(d))),
	});
	const views = [];
	const used = { view: 0 };
	const writer = new ListenWriter({
		app,
		viewListen: (path, key) => {
			const v = views.find((x) => x.view.file.path === path);
			const l = v?.view.listenOf(key) ?? null;
			if (!l) return null;
			return { ...l, write: (value, written, failed) => (used.view++, l.write(value, written, failed)) };
		},
	});
	const shown = [];
	const np = new NowPlaying({ app, writer, showPage: (p, s) => shown.push([p, s]) });
	const r = {
		disk,
		store,
		app,
		np,
		shown,
		used,
		views,
		writer,
		kept: () => (store.has(STORE) ? JSON.parse(store.get(STORE)) : null),
		answer: (key = "e1") => norm(core.parseBooklet(disk.text).records.answers[""]?.[key]),
		/** A Booklet view of the note, on `screen`. */
		open(screen = "activity:/course", path = PATH) {
			const leaf = { app, setViewState: async (vs) => view.setState(vs.state, {}) };
			const view = new BookletView(leaf, { setMode: async () => {}, manifest: { version: "9.8.7" }, media: new MediaAllows(null, () => {}), nowPlaying: np });
			view.file = { path, basename: path.replace(/\.md$/, "") };
			view.load();
			void view.setState({ version: 2, screen }, {});
			view.setViewData(disk.text, true);
			const v = {
				view,
				settled: () => quiet(view),
				box: (id = "e1") => view.contentEl.querySelector(`[data-booklet-listen="/${id}"]`),
				/** A fake player where the embed was drawn in a listen's box. */
				media(id = "e1", opts = { duration: 600, src: `app://vault/media/${id === "e1" ? "ep1" : "ep2"}.mp3?1700000000000` }) {
					const m = fakeMedia(opts);
					const slot = v.box(id).querySelector(".booklet-listen-media");
					slot.querySelectorAll("audio").forEach((a) => a.remove());
					slot.appendChild(m);
					return m;
				},
				go: async (screen) => {
					await view.setState({ version: 2, screen, part: 0 }, {});
					await quiet(view);
				},
				/** The note closed in its pane, as Obsidian does it. */
				async close() {
					await view.onUnloadFile(view.file);
					view.clear();
					view.unload();
					view.containerEl.remove();
					views.splice(views.indexOf(v), 1);
				},
			};
			views.push(v);
			return v;
		},
	};
	return r;
}

const bar = () => w.document.querySelector(BAR);
/** The window's one live region (outside the bar). */
const live = () => w.document.querySelector(".booklet-nowplaying-live");
const items = () => [...w.document.querySelectorAll(`${BAR} .booklet-nowplaying-item`)];
const tidy = (r) => {
	r.np.dispose();
	for (const v of [...r.views]) {
		v.view.unload();
		v.view.containerEl.remove();
	}
	w.document.body.querySelectorAll(BAR).forEach((b) => b.remove());
};

test("a press lifts the element into the bar in the same task: connected throughout, a placeholder where it was, no pause on the way", async () => {
	const r = rig();
	const v = r.open();
	await v.settled();
	const m = v.media();
	const box = v.box();
	m.fire("loadedmetadata");
	m.fire("play");
	assert.ok(bar(), "the bar is in the window");
	assert.equal(bar().parentElement, w.document.body);
	assert.equal(bar().getAttribute("role"), "region");
	assert.equal(bar().getAttribute("aria-label"), "Now playing");
	assert.ok(items()[0].contains(m), "the very same element is in the bar, native controls and all");
	assert.ok(m.isConnected);
	assert.ok(!box.contains(m));
	assert.match(words(box.querySelector(".booklet-nowplaying-here")), /player is in the bar/);
	assert.ok(!m.log.includes("pause"), "it never paused");
	assert.ok(w.document.body.classList.contains("booklet-has-nowplaying"));
	assert.equal(r.np.holds(m), true);
	await v.close();
	tidy(r);
});

test("the bar is named: its prompt, a polite live line, two real buttons of 44 px classes and the right words", async () => {
	const r = rig();
	const v = r.open();
	await v.settled();
	const m = v.media();
	m.fire("play");
	const item = items()[0];
	assert.equal(item.getAttribute("role"), "group");
	assert.equal(words(item.querySelector(".booklet-nowplaying-label")), "Episode 1: Foundations");
	assert.equal(item.getAttribute("aria-labelledby"), item.querySelector(".booklet-nowplaying-label").id);
	assert.equal(bar().querySelector("[aria-live]"), null, "the live region is not in the bar: a bar that goes would take it");
	assert.equal(words(live()), "", "and it is empty until a tick after the press");
	await until(() => words(live()) === "Playing Episode 1: Foundations", "the press said");
	const back = item.querySelector("button.booklet-nowplaying-back");
	const close = item.querySelector("button.booklet-nowplaying-close");
	assert.equal(words(back), "Back to the page");
	assert.equal(words(close), "Close");
	for (const b of [back, close]) {
		assert.equal(b.getAttribute("type"), "button");
		assert.notEqual(b.getAttribute("tabindex"), "-1", "reachable by keyboard");
		assert.equal(b.getAttribute("aria-describedby"), item.getAttribute("aria-labelledby"), "described by the label");
	}
	// the label of media outside a listen: the words of its embed, else its file
	const other = fakeMedia({ src: "app://vault/media/some%20talk.mp3?170" });
	v.view.contentEl.appendChild(other);
	other.fire("play");
	assert.equal(words(items()[1].querySelector(".booklet-nowplaying-label")), "some talk.mp3");
	await until(() => words(live()) === "Playing some talk.mp3", "the second press said");
	await v.close();
	tidy(r);
});

test("focus: an element that held it keeps it in the bar", async () => {
	const r = rig();
	const v = r.open();
	await v.settled();
	const m = v.media();
	m.tabIndex = 0;
	m.focus();
	assert.equal(w.document.activeElement, m);
	m.fire("play");
	assert.equal(w.document.activeElement, m, "focus went with it");
	await v.close();
	tidy(r);
});

test("it plays on through a page move and through the note closing: the same element, connected, never paused", async () => {
	const r = rig();
	const v = r.open();
	await v.settled();
	const m = v.media();
	m.fire("loadedmetadata");
	m.fire("play");
	m.tick(3);
	await v.go("activity:/more");
	assert.ok(m.isConnected && items()[0].contains(m), "still in the bar after a page move");
	assert.equal(v.box(), null, "the page is gone");
	m.tick(2);
	await v.close();
	assert.ok(m.isConnected && items()[0].contains(m), "and after the note closed");
	assert.ok(!m.log.includes("pause"));
	assert.equal(m.paused, false);
	m.tick(1);
	assert.equal(r.kept()["/e1"].pos, 6, "the device store keeps the second with no view");
	tidy(r);
});

test("put it back: a paused element takes the new slot's place and the bar goes; a playing one leaves a placeholder", async () => {
	const restore = useMediaRender();
	try {
		const r = rig();
		const v = r.open();
		await v.settled();
		// Obsidian's own element for the embed carries the address with its mtime; the one a later drawing makes does not matter to the key
		const rendered = v.box().querySelector("audio");
		assert.ok(rendered, "the drawing made an element for the embed");
		const m = fakeMedia({ duration: 600, src: "media/ep1.mp3?1700000000000" });
		rendered.replaceWith(m);
		m.fire("loadedmetadata");
		m.fire("play");
		m.tick(4);
		// away and back while it plays: the new slot shows the placeholder, the bar keeps the player
		await v.go("activity:/more");
		await v.go("activity:/course");
		const now = v.box();
		assert.ok(now.querySelector(".booklet-nowplaying-here"), "a placeholder where the new element was");
		assert.equal(now.querySelector("audio"), null, "no second player for the same media");
		assert.ok(items()[0].contains(m));
		// pause in the bar (she is on the page: the placeholder stays, spec: the element stays in the bar)
		m.fire("pause");
		assert.ok(items()[0].contains(m));
		await v.go("activity:/more");
		await v.go("activity:/course");
		const slot = v.box().querySelector(".booklet-listen-media");
		assert.ok(slot.contains(m), "the paused element is in the new page's slot, the same element");
		assert.equal(bar(), null, "the bar goes when it is empty");
		assert.equal(r.np.holds(m), false);
		// pressing play again lifts it again
		m.fire("play");
		assert.ok(items()[0].contains(m));
		await v.close();
		tidy(r);
	} finally {
		restore();
	}
});

test("on another page the bar stays: a paused element waits for its page", async () => {
	const restore = useMediaRender();
	try {
		const r = rig();
		const v = r.open();
		await v.settled();
		const m = fakeMedia({ duration: 600, src: "media/ep1.mp3" });
		v.box().querySelector("audio").replaceWith(m);
		m.fire("play");
		await v.go("activity:/more");
		m.fire("pause");
		assert.ok(bar() && items()[0].contains(m), "still in the bar, paused");
		await v.go("activity:/course");
		assert.ok(v.box().contains(m), "back on the page it returns");
		assert.equal(bar(), null);
		await v.close();
		tidy(r);
	} finally {
		restore();
	}
});

test("Close pauses, writes her place, removes the row and the bar; the element returns to a page that is showing", async () => {
	const r = rig();
	const v = r.open();
	await v.settled();
	const m = v.media();
	m.tabIndex = 0;
	m.fire("loadedmetadata");
	m.fire("play");
	m.tick(100);
	click(items()[0].querySelector(".booklet-nowplaying-close"));
	await v.settled();
	assert.equal(m.paused, true);
	assert.deepEqual(r.answer(), { pos: 100, done: false });
	assert.equal(bar(), null);
	assert.ok(v.box().contains(m), "back where it was");
	assert.equal(r.np.holds(m), false);
	assert.equal(w.document.activeElement, m);
	assert.equal(r.disk.writes, 1, "one write: the native pause that follows is not heard");
	await v.close();
	tidy(r);

	// the page is gone: the element goes with the row
	const q = rig();
	const u = q.open();
	await u.settled();
	const n = u.media();
	n.fire("play");
	n.tick(30);
	await u.close();
	click(items()[0].querySelector(".booklet-nowplaying-close"));
	await new Promise((res) => setTimeout(res, 20));
	assert.equal(bar(), null);
	assert.equal(n.isConnected, false);
	assert.deepEqual(q.answer(), { pos: 30, done: false }, "written with no view open");
	tidy(q);
});

test("Back to the page: paused with the page showing it returns; playing it shows the placeholder; with the page gone it opens the note at the place", async () => {
	const r = rig();
	const v = r.open();
	await v.settled();
	const m = v.media();
	m.fire("play");
	const back = () => items()[0]?.querySelector(".booklet-nowplaying-back");
	click(back());
	assert.deepEqual(r.shown, [], "playing, the page showing: nothing to open");
	assert.ok(items()[0].contains(m));
	m.fire("pause");
	click(back());
	assert.ok(v.box().contains(m), "paused, it returns to the page");
	assert.equal(bar(), null);
	m.fire("play");
	await v.go("activity:/more");
	click(back());
	assert.equal(r.shown.length, 1);
	assert.equal(r.shown[0][0], PATH);
	assert.equal(r.shown[0][1].screen, "activity:/course", "the page it was started on is the place at the press");
	await v.close();
	tidy(r);
});

test("Back to the page with the note open in a hidden tab: its tab is revealed and made the active one", async () => {
	const { BookletPlugin } = await import("./.build/view.mjs");
	const { FileView } = await import("./obsidian-stub.mjs");
	const calls = [];
	// main.ts reads `leaf.view instanceof FileView` and `leaf.view.file`
	const view = (path) => Object.assign(new (class extends FileView {})(), { file: { path } });
	const mine = { view: view(PATH), setViewState: async (vs, opts) => calls.push(["setViewState", vs.state.file, !!opts?.focus]) };
	const other = { view: view("Other.md"), setViewState: async () => assert.fail("another note's tab is left alone") };
	const app = {
		workspace: {
			on: () => ({}),
			onLayoutReady() {},
			getLeavesOfType: () => [],
			iterateAllLeaves: (cb) => [other, mine].forEach(cb),
			getLeaf: () => assert.fail("the note is open already: no new tab"),
			revealLeaf: async (l) => calls.push(["revealLeaf", l === mine]),
			setActiveLeaf: (l, o) => calls.push(["setActiveLeaf", l === mine, !!o?.focus]),
		},
		metadataCache: { on: () => ({}) },
		vault: { on: () => ({}) },
		loadLocalStorage: () => null,
		saveLocalStorage() {},
	};
	const plugin = new BookletPlugin(app, {});
	await plugin.onload();
	await plugin.showPage(PATH, { screen: "activity:/course" });
	assert.deepEqual(calls.map((c) => c[0]), ["setViewState", "revealLeaf", "setActiveLeaf"], "it is revealed, then made active");
	assert.deepEqual(calls[2], ["setActiveLeaf", true, true], "the note's own leaf, with focus");
	plugin.unload();
});

test("a paused element Back put in the page, then the page closed and Obsidian emptied its src: the next drawing of that media is not handed the dead element", async () => {
	const restore = useMediaRender();
	try {
		const r = rig();
		const v = r.open();
		await v.settled();
		const rendered = v.box().querySelector("audio");
		const m = fakeMedia({ duration: 600, src: "media/ep1.mp3?1700000000000" });
		rendered.replaceWith(m);
		m.fire("loadedmetadata");
		m.fire("play");
		m.fire("pause");
		click(items()[0].querySelector(".booklet-nowplaying-back"));
		assert.ok(v.box().contains(m), "Back put the paused element in the page");
		await v.close();
		// Obsidian's teardown of the closed page
		m.removeAttribute("src");
		assert.equal(m.isConnected, false);
		const again = r.open();
		await again.settled();
		const fresh = again.box().querySelector("audio");
		assert.ok(fresh, "the page has a player");
		assert.notEqual(fresh, m, "not the dead element");
		assert.ok(fresh.getAttribute("src"), "and it has a source");
		assert.equal(r.np.holds(m), false);
		// pressing Play on the fresh element lifts it as a first press does
		fresh.dispatchEvent(new w.Event("play", { bubbles: false }));
		await again.close();
		tidy(r);
	} finally {
		restore();
	}
});

test("Back to the page when the page is in a tab behind the active one: the note's tab is asked for first, then the element returns", async () => {
	const r = rig();
	const v = r.open();
	await v.settled();
	const m = v.media();
	m.fire("play");
	m.fire("pause");
	// Obsidian hides the tabs behind the active one with display: none
	v.view.containerEl.style.display = "none";
	click(items()[0].querySelector(".booklet-nowplaying-back"));
	assert.equal(r.shown.length, 1, "the page's tab is asked for");
	assert.equal(r.shown[0][0], PATH);
	assert.ok(v.box().contains(m), "and a paused element goes back into the page");
	m.fire("play");
	click(items()[0].querySelector(".booklet-nowplaying-back"));
	assert.equal(r.shown.length, 2, "playing, it asks again and stays in the bar");
	assert.ok(items()[0].contains(m));
	v.view.containerEl.style.display = "";
	click(items()[0].querySelector(".booklet-nowplaying-back"));
	assert.equal(r.shown.length, 2, "the page showing: nothing to open");
	await v.close();
	tidy(r);
});

test("the end writes once, takes pos out, and lets the element go", async () => {
	const r = rig(core.setAnswer(COURSE, "", "e1", { pos: 300 }));
	const v = r.open();
	await v.settled();
	const m = v.media();
	m.fire("loadedmetadata");
	m.fire("play");
	m.tick(299);
	m.fire("ended");
	m.fire("pause");
	await v.settled();
	assert.deepEqual(r.answer(), { done: true });
	assert.equal(r.disk.writes, 1);
	assert.equal(bar(), null);
	assert.ok(v.box().contains(m), "the page that is showing gets its player back");
	await v.close();
	tidy(r);

	// the same with no view open: written by the plugin-level writer, once
	const q = rig(core.setAnswer(COURSE, "", "e1", { pos: 300 }));
	const u = q.open();
	await u.settled();
	const n = u.media();
	n.fire("play");
	n.tick(10);
	await u.close();
	n.fire("ended");
	await new Promise((res) => setTimeout(res, 20));
	assert.deepEqual(q.answer(), { done: true });
	assert.equal(bar(), null);
	assert.equal(n.isConnected, false);
	assert.equal(q.kept(), null);
	tidy(q);
});

test("a pause writes her place and the element stays in the bar; with the note closed the writer does it, byte-faithful", async () => {
	const base = core.setAnswer(COURSE, "", "q1", "kept words");
	const withListen = core.setAnswer(base, "", "e2", { pos: 5, extra: "kept" });
	const r = rig(withListen);
	const v = r.open();
	await v.settled();
	const m = v.media();
	m.fire("loadedmetadata");
	m.fire("play");
	m.tick(40);
	await v.close();
	const before = r.disk.text;
	m.tick(20);
	m.fire("pause");
	await new Promise((res) => setTimeout(res, 20));
	assert.ok(items()[0].contains(m), "stays in the bar");
	assert.deepEqual(r.answer(), { pos: 60, done: false });
	assert.deepEqual(r.answer("e2"), { pos: 5, extra: "kept" }, "another answer is as it was");
	assert.equal(r.answer("q1"), "kept words");
	assertOutsideUnchanged(before, r.disk.text, "pause with no view");
	assert.equal(r.used.view, 0, "no view showed the note: the writer wrote it");
	assert.equal(r.kept(), null, "the device store is emptied once the note holds it");
	// every byte outside the answer's own line is as it was
	const lines = (t) => t.split("\n");
	const changed = lines(r.disk.text).filter((l, i) => l !== lines(before)[i]);
	assert.equal(changed.length, 1, "one line of the records changed");
	tidy(r);
});

test("the one writer: while a view shows the note, even on another page, a place goes through the view's own write path", async () => {
	const r = rig();
	const v = r.open();
	await v.settled();
	const m = v.media();
	m.fire("loadedmetadata");
	m.fire("play");
	m.tick(25);
	await v.go("activity:/more");
	m.tick(5);
	m.fire("pause");
	await v.settled();
	assert.equal(r.used.view >= 1, true, "written through the view");
	assert.deepEqual(r.answer(), { pos: 30, done: false });
	await v.close();
	tidy(r);
});

test("with no view, the device store keeps each second as it plays, from the position the note held, and the pause empties it", async () => {
	const r = rig(core.setAnswer(COURSE, "", "e1", { pos: 10 }));
	const v = r.open();
	await v.settled();
	const m = v.media();
	m.fire("loadedmetadata");
	m.fire("play");
	await v.close();
	m.tick(1);
	await new Promise((res) => setTimeout(res, 20));
	m.tick(1);
	assert.deepEqual(r.kept(), { "/e1": { pos: 12, base: 10 } });
	m.fire("pause");
	await new Promise((res) => setTimeout(res, 20));
	assert.equal(r.kept(), null);
	assert.deepEqual(r.answer(), { pos: 12 }, "the answer the note held keeps its shape: no done was added");
	tidy(r);
});

test("reopened later, a new element is put at the place the closed note was left at", async () => {
	const r = rig();
	const v = r.open();
	await v.settled();
	const m = v.media();
	m.fire("play");
	m.tick(77);
	await v.close();
	m.fire("pause");
	await new Promise((res) => setTimeout(res, 20));
	click(items()[0].querySelector(".booklet-nowplaying-close"));
	const u = r.open();
	await u.settled();
	const n = u.media();
	n.fire("loadedmetadata");
	assert.deepEqual(n.seeks, [77]);
	await u.close();
	tidy(r);
});

test("a reopened note draws a placeholder for media that still plays, and follows it with the new view", async () => {
	const restore = useMediaRender();
	try {
		const r = rig();
		const v = r.open();
		await v.settled();
		const m = fakeMedia({ duration: 600, src: "media/ep1.mp3" });
		v.box().querySelector("audio").replaceWith(m);
		m.fire("loadedmetadata");
		m.fire("play");
		m.tick(10);
		await v.close();
		const u = r.open();
		await u.settled();
		assert.ok(u.box().querySelector(".booklet-nowplaying-here"));
		assert.equal(u.box().querySelector("audio"), null);
		m.tick(2);
		assert.equal(u.view.listens.unsaved(), true, "the new view follows it");
		m.fire("pause");
		await u.settled();
		assert.deepEqual(r.answer(), { pos: 12, done: false });
		assert.match(words(u.box().querySelector(".booklet-listen-where")), /Left off at 0:12/);
		await u.close();
		tidy(r);
	} finally {
		restore();
	}
});

test("the plugin unloading pauses what plays, writes its place and removes the bar", async () => {
	const r = rig();
	const v = r.open();
	await v.settled();
	const m = v.media();
	m.fire("play");
	m.tick(15);
	await v.close();
	r.np.dispose();
	await new Promise((res) => setTimeout(res, 20));
	assert.equal(m.paused, true);
	assert.equal(bar(), null);
	assert.equal(w.document.body.classList.contains("booklet-has-nowplaying"), false);
	assert.deepEqual(r.answer(), { pos: 15, done: false });
	// nothing more is lifted once it is gone
	const u = r.open();
	await u.settled();
	u.media("e2").fire("play");
	assert.equal(bar(), null);
	await u.close();
	tidy(r);
});

test("the quit hook: playing from the bar counts as unsaved, and flush writes the place and waits for it", async () => {
	const r = rig();
	const v = r.open();
	await v.settled();
	const m = v.media();
	m.fire("loadedmetadata");
	m.fire("play");
	m.tick(20);
	await v.close();
	assert.equal(r.np.unsaved(), true);
	await r.np.flush();
	assert.deepEqual(r.answer(), { pos: 20, done: false });
	m.fire("pause");
	await new Promise((res) => setTimeout(res, 20));
	assert.equal(r.np.unsaved(), false);
	tidy(r);
});

test("a framed player is never lifted: there is no media element to lift, and a stray play on a frame does nothing", async () => {
	const r = rig();
	const v = r.open();
	await v.settled();
	const frame = w.document.createElement("iframe");
	v.view.contentEl.appendChild(frame);
	frame.dispatchEvent(new w.Event("play"));
	assert.equal(bar(), null);
	assert.equal(r.np.holds(frame), false);
	await v.close();
	tidy(r);
});

test("a media element that is not in a listen is lifted too, and labelled by its embed's words", async () => {
	const r = rig();
	const v = r.open("home");
	await v.settled();
	const span = w.document.createElement("span");
	span.className = "internal-embed";
	span.setAttribute("alt", "A talk");
	const m = fakeMedia({ src: "app://vault/media/talk.mp3?1" });
	span.appendChild(m);
	v.view.contentEl.appendChild(span);
	m.fire("play");
	assert.equal(words(items()[0].querySelector(".booklet-nowplaying-label")), "A talk");
	assert.ok(span.querySelector(".booklet-nowplaying-here"));
	m.tick(3);
	assert.equal(r.kept(), null, "no listen: no position kept");
	m.fire("pause");
	await new Promise((res) => setTimeout(res, 10));
	assert.equal(r.disk.writes, 0, "and nothing written");
	tidy(r);
});

test("a player the plugin made that fails after the lift: the row and the placeholder go, the page keeps its own Play button", async () => {
	const r = rig();
	const v = r.open();
	await v.settled();
	const slot = { type: "media", media: "audio", addr: "https://media.example.org/e.mp3", alt: "A talk", host: "media.example.org", allowed: true, entry: "example.org" };
	const holder = w.document.createElement("div");
	holder.className = "booklet-listen-media";
	v.box().appendChild(holder);
	const player = createPlayer(w.document, slot);
	holder.appendChild(player);
	player.addEventListener("error", () => player.remove());
	Object.defineProperty(player, "paused", { value: false, configurable: true });
	player.dispatchEvent(new w.Event("play"));
	assert.ok(bar());
	player.dispatchEvent(new w.Event("error"));
	assert.equal(bar(), null);
	assert.equal(holder.querySelector(".booklet-nowplaying-here"), null);
	await v.close();
	tidy(r);
});

test("a press-to-load slot for media the bar holds shows what stands for it, not a second Play button", async () => {
	const r = rig();
	const v = r.open();
	await v.settled();
	const src = "https://media.example.org/e.mp3";
	const m = fakeMedia({ src, duration: 60 });
	v.box().querySelector(".booklet-listen-media").appendChild(m);
	m.fire("play");
	await v.go("activity:/more");
	const slot = { type: "media", media: "audio", addr: src, alt: "A talk", host: "media.example.org", allowed: true, entry: "example.org" };
	const owner = { register() {} };
	// a slot drawn into the media part of the same listen's box
	const t = core.SLOT_OPEN + "0" + core.SLOT_CLOSE;
	const piece = () => {
		const box = w.document.createElement("div");
		box.setAttribute("data-booklet-listen", "/e1");
		const part = w.document.createElement("div");
		part.className = "booklet-listen-media";
		part.textContent = t;
		box.appendChild(part);
		return part;
	};
	const source = () => ({ path: PATH, state: {}, about: () => ({ key: "/e1", left: 120 }), follow: () => false });
	const el = piece();
	drawMedia(el, [slot], { isPress: () => true, ask() {}, resume: (s) => r.np.take(s, source, el) }, owner);
	assert.equal(el.querySelector(".booklet-media-play"), null, "no Play button");
	assert.ok(el.querySelector(".booklet-nowplaying-here"), "it plays in the bar");
	m.fire("pause");
	const el2 = piece();
	drawMedia(el2, [slot], { isPress: () => true, ask() {}, resume: (s) => r.np.take(s, source, el2) }, owner);
	assert.ok(el2.contains(m), "paused, the very element is in the slot");
	assert.equal(bar(), null);
	await v.close();
	tidy(r);
});

test("keepAlive: the plugin's own players held in the bar are not torn down with their drawing", async () => {
	const r = rig();
	const v = r.open();
	await v.settled();
	const m = v.media();
	m.fire("play");
	assert.equal(r.np.holds(m), true);
	assert.equal(r.np.holds(w.document.createElement("div")), false);
	await v.close();
	tidy(r);
});

test("no animation or transition in the bar's style: nothing to turn off under reduced motion", () => {
	const css = fs.readFileSync(`${ROOT}/styles.base.css`, "utf8");
	const at = css.indexOf("Now playing (src/now-playing.ts)");
	assert.ok(at > 0);
	const block = css.slice(at);
	assert.doesNotMatch(block, /animation|transition|@keyframes/);
	assert.match(block, /min-height: max\(44px/);
	assert.match(block, /:focus-visible/);
	assert.match(block, /z-index: var\(--layer-popover/);
});

/* ---- the fix round (lane L): rename, delete, writes that fail, extra embeds, shared addresses, Close, speech and focus ---- */

const RENAMED = "Renamed.booklet.md";
const gone = (ms = 15) => new Promise((res) => setTimeout(res, ms));

test("rename while the bar holds the element: the next pause writes the NEW note, the device store follows, and the media of the renamed note is the bar's", async () => {
	const r = rig();
	const v = r.open();
	await v.settled();
	const m = v.media();
	m.fire("loadedmetadata");
	m.fire("play");
	m.tick(5);
	await v.close();
	// Obsidian renames the file; main.ts moves the device store and tells the bar
	r.disk.path = RENAMED;
	r.np.rename(PATH, RENAMED);
	m.tick(5);
	await gone();
	assert.equal(r.store.has(STORE), false, "nothing is kept under the old name");
	assert.deepEqual(JSON.parse(r.store.get(`booklet-listen:${RENAMED}`))["/e1"].pos, 10, "the seconds are kept under the new one");
	m.fire("pause");
	await gone();
	assert.deepEqual(r.answer(), { pos: 10, done: false }, "the renamed note holds the place");
	assert.equal(r.store.has(`booklet-listen:${RENAMED}`), false);
	assert.equal(r.store.has(STORE), false, "no orphan under the old name");
	// reopened under its new name, the media of its listen is the bar's: a slot drawn there gets the element, not a second one
	const piece = w.document.createElement("div");
	const box = w.document.createElement("div");
	box.setAttribute("data-booklet-listen", "/e1");
	piece.className = "booklet-listen-media";
	box.appendChild(piece);
	const node = r.np.take("app://vault/media/ep1.mp3", () => ({ path: RENAMED, state: {}, about: () => ({ key: "/e1", left: 120 }), follow: () => false }), piece);
	assert.equal(node, m, "paused, the very element takes the slot of the renamed note");
	tidy(r);
});

test("a note deleted while the bar holds its element: what plays stops and goes, nothing is written, and the device keeps nothing", async () => {
	const r = rig();
	const v = r.open();
	await v.settled();
	const m = v.media();
	m.fire("loadedmetadata");
	m.fire("play");
	m.tick(5);
	await v.close();
	m.tick(2);
	await gone();
	assert.ok(r.kept(), "the device keeps the second");
	r.store.set("booklet-place:" + PATH, "2");
	const writes = r.disk.writes;
	r.np.deleted(PATH);
	await gone();
	assert.equal(m.paused, true);
	assert.equal(m.isConnected, false);
	assert.equal(bar(), null);
	assert.equal(r.kept(), null);
	assert.equal(r.store.has("booklet-place:" + PATH), false);
	assert.equal(r.disk.writes, writes, "nothing was written");
	assert.equal(r.np.unsaved(), false);
	tidy(r);
});

test("a note whose records cannot be written: apply resolves false and the quit flush returns (through a view or not)", async () => {
	const stuck = COURSE + "\n```\nnever closed\n";
	const r = rig(stuck);
	const v = r.open();
	await v.settled();
	const m = v.media();
	m.fire("loadedmetadata");
	m.fire("play");
	m.tick(40);
	await v.go("activity:/more");
	const hang = (ms) => new Promise((res) => setTimeout(() => res("hung"), ms));
	// through the view that shows the note: the view's own write path refused the change
	assert.equal(await Promise.race([r.writer.apply(PATH, "/e1", "pause", { pos: 40, duration: 600 }, 120), hang(1500)]), false, "resolves false");
	assert.equal(await Promise.race([r.np.flush().then(() => "returned"), hang(1500)]), "returned", "the quit hook is not held");
	assert.equal(r.disk.text, stuck, "the note is as it was");
	assert.equal(r.np.unsaved(), true, "the place is still not in the note, and says so");
	assert.ok(r.kept(), "and the device still holds it");
	await v.close();
	// with no view
	assert.equal(await Promise.race([r.writer.apply(PATH, "/e1", "pause", { pos: 40, duration: 600 }, 120), hang(1500)]), false);
	assert.equal(await Promise.race([r.np.flush().then(() => "returned"), hang(1500)]), "returned");
	assert.equal(r.disk.text, stuck);
	tidy(r);
});

test("a writer that never answers does not hold the quit flush for more than its timeout", async () => {
	const r = rig();
	const v = r.open();
	await v.settled();
	const m = v.media();
	m.fire("loadedmetadata");
	m.fire("play");
	m.tick(3);
	await v.close();
	// no note to write, no answer ever: apply is made to hang
	r.writer.apply = () => new Promise(() => {});
	const t0 = Date.now();
	await r.np.flush();
	const took = Date.now() - t0;
	assert.ok(took >= 2500 && took < 6000, `returned after the 3 s limit (${took} ms)`);
	tidy(r);
});

test("another embed in a listen's help is lifted like any media but writes nothing into the listen, whichever is pressed first", async () => {
	const r = rig();
	const v = r.open();
	await v.settled();
	const first = v.media();
	const extra = fakeMedia({ duration: 600, src: "app://vault/media/extra.mp3?1700000000000" });
	v.box().querySelector(".booklet-help").appendChild(extra);
	// the help's embed is pressed first
	extra.fire("loadedmetadata");
	extra.fire("play");
	extra.tick(50);
	extra.fire("pause");
	await gone();
	assert.ok(items()[0].contains(extra), "lifted into the bar like any media");
	assert.equal(r.answer(), undefined, "no place written into the listen");
	assert.equal(r.kept(), null, "nor kept for it");
	assert.equal(r.np.unsaved(), false);
	// then the box's own, and then (with the box's own lifted out) the help's again
	first.fire("loadedmetadata");
	first.fire("play");
	first.tick(7);
	extra.fire("play");
	extra.tick(30);
	extra.fire("pause");
	first.fire("pause");
	await v.settled();
	await gone();
	assert.deepEqual(r.answer(), { pos: 7, done: false }, "only the box's own media wrote, and its own place");
	tidy(r);
	await v.close();
});

test("two listens on one file are two entries: a press on one never writes into the other, and each slot gets its own element back", async () => {
	const same = "app://vault/media/same.mp3?1700000000000";
	const text = HEAD + "\n> [!activity|course] The course\n\n> [!listen|e1] Part one\n> ![One](media/same.mp3)\n\n> [!listen|e2] Part two\n> ![Two](media/same.mp3)\n\n> [!activity|more] More\n\n> [!text|q1] What stayed with you?\n";
	const r = rig(text);
	const v = r.open();
	await v.settled();
	const m1 = v.media("e1", { duration: 600, src: same });
	const m2 = v.media("e2", { duration: 600, src: same });
	m1.fire("loadedmetadata");
	m2.fire("loadedmetadata");
	m1.fire("play");
	m1.tick(10);
	m2.fire("play");
	m2.tick(20);
	m2.fire("pause");
	await v.settled();
	assert.deepEqual([r.answer("e1"), r.answer("e2")], [undefined, { pos: 20, done: false }], "the press on the second wrote into the second");
	m1.fire("pause");
	await v.settled();
	assert.deepEqual(r.answer("e1"), { pos: 10, done: false });
	assert.deepEqual(r.answer("e2"), { pos: 20, done: false });
	// both leave a placeholder; the page is drawn again: each slot is given its own
	m1.fire("play");
	m1.tick(1);
	await v.go("activity:/more");
	await v.go("activity:/course");
	const boxOf = (id) => v.box(id).querySelector(".booklet-listen-media");
	const source = (id) => () => ({ path: PATH, state: {}, about: () => ({ key: `/${id}`, left: 120 }), follow: () => false });
	const piece = (id) => boxOf(id);
	assert.equal(r.np.take("app://vault/media/same.mp3", source("e2"), piece("e2")), m2, "the second slot gets the second element (paused)");
	assert.ok(r.np.take("app://vault/media/same.mp3", source("e1"), piece("e1"))?.classList.contains("booklet-nowplaying-here"), "the first slot is told the first still plays");
	await v.close();
	tidy(r);
});

test("Close on a paused element she scrubbed with no view open writes the place she moved to", async () => {
	const r = rig();
	const v = r.open();
	await v.settled();
	const m = v.media();
	m.fire("loadedmetadata");
	m.fire("play");
	m.tick(10);
	m.fire("pause");
	await v.settled();
	assert.deepEqual(r.answer(), { pos: 10, done: false });
	await v.close();
	// paused in the bar, no page: she drags the native scrubber
	m.currentTime = 77;
	m.fire("seeked");
	assert.equal(r.np.unsaved(), true, "the moved place is not in the note");
	click(items()[0].querySelector(".booklet-nowplaying-close"));
	await gone();
	assert.deepEqual(r.answer(), { pos: 77, done: false }, "written on Close");
	assert.equal(r.kept(), null);
	assert.equal(bar(), null);
	tidy(r);
});

test("one live region per window, outside the bar, empty until a tick after the news: it says Playing, Closed and finished, and the same words twice are two changes", async () => {
	const r = rig();
	const region = live();
	assert.ok(region && region.parentElement === w.document.body, "made with the plugin, in the body");
	assert.equal(region.getAttribute("aria-live"), "polite");
	assert.equal(words(region), "");
	const v = r.open();
	await v.settled();
	const m = v.media();
	m.fire("play");
	assert.equal(words(region), "", "not in the task of the press");
	await until(() => words(region) === "Playing Episode 1: Foundations", "Playing said");
	assert.equal(live(), region, "the one region, not remade with the bar");
	// Close says it, and the region outlives the bar
	click(items()[0].querySelector(".booklet-nowplaying-close"));
	assert.equal(bar(), null);
	await until(() => words(region) === "Closed Episode 1: Foundations", "Closed said");
	assert.ok(region.isConnected, "the bar going took nothing with it");
	// the same news again: emptied first, then the words, so a change is seen
	const seen = [];
	new w.MutationObserver(() => seen.push(words(region))).observe(region, { childList: true, characterData: true, subtree: true });
	m.fire("play");
	await until(() => words(region) === "Playing Episode 1: Foundations", "Playing said again");
	assert.ok(seen.includes(""), "it was emptied between the two");
	// the end
	m.fire("ended");
	await until(() => words(region) === "Episode 1: Foundations finished", "finished said");
	await v.close();
	tidy(r);
});

test("focus after a row goes: to the element in a page that is showing, else the next row's button, else where she was, else the note's leaf; a row that ended with focus elsewhere takes none", async () => {
	const r = rig();
	const v = r.open();
	await v.settled();
	const a = v.media("e1");
	const b = v.media("e2");
	const origin = w.document.createElement("button");
	origin.textContent = "Where she was";
	w.document.body.appendChild(origin);
	origin.focus();
	a.fire("play");
	b.fire("play");
	await v.go("activity:/more");
	// the page is gone: closing the first row hands focus to the second row's button
	click(items()[0].querySelector(".booklet-nowplaying-close"));
	assert.equal(items().length, 1);
	assert.equal(w.document.activeElement, items()[0].querySelector("button"), "the next row's first button");
	// the last row: focus goes back to where she was (the button she pressed from, still in the window)
	click(items()[0].querySelector(".booklet-nowplaying-close"));
	assert.equal(bar(), null);
	assert.equal(w.document.activeElement, origin);
	// where she was is gone too: the note's leaf is made the active one
	origin.remove();
	await v.go("activity:/course");
	const c = v.media("e1");
	c.fire("play");
	const called = [];
	r.app.workspace.getMostRecentLeaf = () => "leaf";
	r.app.workspace.setActiveLeaf = (leaf, o) => called.push([leaf, !!o?.focus]);
	await v.go("activity:/more");
	click(items()[0].querySelector(".booklet-nowplaying-close"));
	assert.deepEqual(called, [["leaf", true]]);
	// an end with focus in the page does not take it
	const other = w.document.createElement("button");
	w.document.body.appendChild(other);
	await v.go("activity:/course");
	const d = v.media("e2");
	d.fire("play");
	other.focus();
	d.fire("ended");
	assert.equal(w.document.activeElement, other, "focus was elsewhere, and stays");
	// an end with focus in the row moves it
	const e2 = v.media("e1");
	e2.tabIndex = 0;
	e2.fire("play");
	items()[0].querySelector("button").focus();
	e2.fire("ended");
	assert.equal(w.document.activeElement, e2, "focus went to the element, back in its page, not to the body");
	other.remove();
	await v.close();
	tidy(r);
});

test("no notice was shown by any of this", () => {
	assert.deepEqual(
		Notice.said.filter((s) => /place in the media/.test(s)),
		[],
	);
});
