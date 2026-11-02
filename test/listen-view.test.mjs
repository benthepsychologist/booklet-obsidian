/*
 * The `listen` question in the view (format 0.18): the box it draws, the tick, and how the view follows the media element: one set of
 * capture listeners, the position kept on the device while the media plays and written to the note on pause, end and leaving, the done
 * rule, resuming at `pos`, the device store's survive-or-drop rule, a drawing held back while media plays, and what is unsaved. The media is
 * test/helpers.mjs's `fakeMedia`; nothing plays and no time passes by itself. Every note is made up.
 */
import test from "node:test";
import assert from "node:assert/strict";
import esbuild from "esbuild";
import { click, openView, testApp, until, words } from "./dom.mjs";
import { assertOutsideUnchanged, core, fakeMedia, norm, ROOT } from "./helpers.mjs";
import { mediaRequests, useMediaRender } from "./obsidian-stub.mjs";
import { pane } from "./pane.mjs";

process.env.TZ = "UTC";

const HEAD = '---\nbooklet: "0.18"\nid: made/up\ntitle: Made up\nlang: en\n---\n';
const COURSE =
	HEAD +
	`
> [!activity|course] The course

> [!listen|e1] Episode 1: Foundations
> ![Episode 1](media/ep1.mp3)
> Listen to it all, or to within two minutes of the end.

> [!listen|e2 left:60] Episode 2
> [Watch the lecture](https://video.example.org/watch/2)
> A video service keeps its player to itself.

> [!text|q1] What stayed with you?

> [!activity|more] More

> [!listen|m1] A second episode
> ![A second episode](media/ep2.mp3)
`;
const KEY = "booklet-listen:Note.booklet.md";

/** An app with a device store as Obsidian's saveLocalStorage keeps one; `seed` puts entries in it before the view opens. */
function env(text, seed = {}) {
	const disk = { text, writes: 0 };
	const store = new Map(Object.entries(seed).map(([k, v]) => [k, JSON.stringify(v)]));
	const app = testApp(disk, {
		loadLocalStorage: (k) => (store.has(k) ? JSON.parse(store.get(k)) : null),
		saveLocalStorage: (k, d) => (d === null ? store.delete(k) : store.set(k, JSON.stringify(d))),
	});
	return { disk, store, app, kept: () => (store.has(KEY) ? JSON.parse(store.get(KEY)) : null) };
}

/** The course open on its activity, with a fake media element put in the first listen's box where the embed was drawn. */
function open(text = COURSE, { seed = {}, id = "e1", media = { duration: 600 }, scope = "/course" } = {}) {
	const e = env(text, seed);
	const v = openView(text, { app: e.app, disk: e.disk, screen: `activity:${scope}` });
	const box = () => v.view.contentEl.querySelector(`[data-booklet-listen="/${id}"]`);
	const m = media ? fakeMedia(media) : null;
	if (m) box().querySelector(".booklet-listen-media")?.appendChild(m);
	const answer = (key = id) => norm(core.parseBooklet(e.disk.text).records.answers[""]?.[key]);
	return { ...e, ...v, box, m, answer, tick: () => box().querySelector(".booklet-listen-tick"), where: () => words(box().querySelector(".booklet-listen-where")) };
}

test("a listen is drawn as a box: the prompt, the media where it was written, the help, and a row with the Done box", async () => {
	const restore = useMediaRender();
	try {
		mediaRequests.length = 0;
		const e = env(COURSE);
		const v = openView(COURSE, { app: e.app, disk: e.disk, screen: "activity:/course" });
		await v.settled();
		const box = v.view.contentEl.querySelector('[data-booklet-listen="/e1"]');
		assert.ok(box, "the box is there");
		assert.equal(box.getAttribute("data-booklet-q"), "e1");
		assert.deepEqual(
			[...box.children].filter((c) => !c.classList.contains("booklet-kept-note")).map((c) => c.className.split(" ")[0]),
			["booklet-prompt", "booklet-listen-media", "booklet-help", "booklet-listen-row"],
			"in order: prompt, media, help, controls",
		);
		assert.equal(words(box.querySelector(".booklet-prompt")), "Episode 1: Foundations");
		assert.equal(box.querySelector(".booklet-listen-media audio")?.getAttribute("src"), "media/ep1.mp3", "the embed is drawn in the media div");
		assert.match(words(box.querySelector(".booklet-help")), /^Listen to it all/);
		const tick = box.querySelector("button.booklet-listen-tick");
		assert.equal(words(tick), "Done");
		assert.equal(tick.getAttribute("aria-pressed"), "false");
		const prompt = box.querySelector(".booklet-prompt").id;
		assert.equal(tick.getAttribute("aria-labelledby"), `${prompt} ${tick.id}`, "named by the prompt and its own word");
		assert.equal(words(box.querySelector(".booklet-listen-where")), "", "nothing to say about a place before one is kept");
		v.close();
	} finally {
		restore();
	}
});

test("a listen that holds only a link is the prompt, the link and the tick: no player is looked for, and no place is told", async () => {
	const v = open(COURSE, { id: "e2", media: null });
	await v.settled();
	const box = v.box();
	assert.match(words(box.querySelector(".booklet-listen-media")), /Watch the lecture/);
	assert.equal(box.querySelector("audio, video"), null);
	assert.ok(box.querySelector("button.booklet-listen-tick"));
	// a position never comes of it: with no media element there is nothing to follow
	assert.equal(v.where(), "");
	v.close();
});

test("ticking Done writes at once, keeps every other key and byte, and unticking leaves no mark", async () => {
	const seeded = core.setAnswer(COURSE, "", "e1", { pos: 40, extra: "kept" });
	const v = open(seeded);
	await v.settled();
	const orig = v.disk.text;
	click(v.tick());
	await v.settled();
	assert.deepEqual(v.answer(), { pos: 40, extra: "kept", done: true });
	assert.equal(v.tick().getAttribute("aria-pressed"), "true");
	assertOutsideUnchanged(orig, v.disk.text, "ticked");
	assert.equal(words(v.box().querySelector('[aria-live="polite"]')), "Marked done");
	click(v.tick());
	await v.settled();
	assert.deepEqual(v.answer(), { pos: 40, extra: "kept", done: false }, "the key stays where it stands; pos is a place kept, so the answer remains");
	assert.equal(v.tick().getAttribute("aria-pressed"), "false");
	v.close();

	// never ticked or played: ticked and unticked leaves nothing behind
	const w = open(COURSE);
	await w.settled();
	click(w.tick());
	await w.settled();
	click(w.tick());
	await w.settled();
	assert.equal(w.answer(), undefined);
	assert.equal(core.parseBooklet(w.disk.text).records.answers[""]?.e1, undefined);
	w.close();
});

test("the done rule through events: the end, a pause within left: seconds of the end and past half, an early pause, a short clip", async () => {
	// the end: done, pos gone
	let v = open(core.setAnswer(COURSE, "", "e1", { pos: 300 }));
	await v.settled();
	v.m.fire("loadedmetadata");
	v.m.fire("play");
	v.m.tick(299);
	v.m.fire("ended");
	await v.settled();
	assert.deepEqual(v.answer(), { done: true }, "pos is taken out on the end");
	assert.equal(v.kept(), null, "the device store is empty once the note holds it");
	v.close();

	// a pause within left (120 by default) of the end and past half: done, with pos
	v = open(COURSE);
	await v.settled();
	v.m.fire("play");
	v.m.tick(500);
	v.m.fire("pause");
	await v.settled();
	assert.deepEqual(v.answer(), { pos: 500, done: true });
	v.close();

	// a pause early: a place kept, not done
	v = open(COURSE);
	await v.settled();
	v.m.fire("play");
	v.m.tick(100);
	v.m.fire("pause");
	await v.settled();
	assert.deepEqual(v.answer(), { pos: 100, done: false });
	assert.equal(v.where(), "Left off at 1:40");
	v.close();

	// left: on the line (60): 530 of 600 is not within it, 545 is
	v = open(COURSE, { id: "e2", media: { duration: 600 } });
	await v.settled();
	// e2 holds a link only in the note; the test puts a media element in its box all the same, as a slot's player would be
	v.m.fire("play");
	v.m.tick(530);
	v.m.fire("pause");
	await v.settled();
	assert.deepEqual(v.answer("e2"), { pos: 530, done: false });
	v.m.fire("play");
	v.m.tick(15);
	v.m.fire("pause");
	await v.settled();
	assert.deepEqual(v.answer("e2"), { pos: 545, done: true });
	v.close();

	// a short clip is within left: of its end from the first second: a pause at its start is not done
	v = open(COURSE, { media: { duration: 30 } });
	await v.settled();
	v.m.fire("play");
	v.m.tick(2);
	v.m.fire("pause");
	await v.settled();
	assert.deepEqual(v.answer(), { pos: 2, done: false });
	v.close();
});

test("a position is whole seconds, and a pause at the very start of a fresh listen makes no answer", async () => {
	let v = open(COURSE);
	await v.settled();
	v.m.fire("play");
	v.m.tick(7.9);
	v.m.fire("pause");
	await v.settled();
	assert.deepEqual(v.answer(), { pos: 7, done: false });
	v.close();

	v = open(COURSE);
	await v.settled();
	v.m.fire("play");
	v.m.fire("pause");
	await v.settled();
	assert.equal(v.answer(), undefined);
	assert.equal(v.disk.writes, 0, "nothing was written");
	v.close();
});

test("a pause caused by the end is left to the ended event: one write, not two", async () => {
	const v = open(COURSE);
	await v.settled();
	v.m.fire("play");
	v.m.tick(600);
	v.m.fire("ended"); // a player pauses at its end, then says ended; the element's `ended` is true for both
	v.m.fire("pause");
	await v.settled();
	assert.equal(v.disk.writes, 1);
	assert.deepEqual(v.answer(), { done: true });
	v.close();
});

test("while media plays each second goes to the device store and nothing to the note; the pause writes and empties the store", async () => {
	const v = open(COURSE);
	await v.settled();
	v.m.fire("loadedmetadata");
	v.m.fire("play");
	v.m.tick(1);
	v.m.fire("timeupdate"); // the same second again: not a new entry
	assert.deepEqual(v.kept(), { "/e1": { pos: 1, base: 0 } });
	v.m.tick(1);
	v.m.tick(1);
	assert.deepEqual(v.kept(), { "/e1": { pos: 3, base: 0 } }, "the newest second, from the position the note held when the session began");
	assert.equal(v.disk.writes, 0, "nothing is written while it plays");
	assert.equal(v.where(), "", "while it plays the place is not told");
	v.m.fire("pause");
	await v.settled();
	assert.deepEqual(v.answer(), { pos: 3, done: false });
	assert.equal(v.kept(), null);
	assert.equal(v.where(), "Left off at 0:03");
	v.close();
});

test("never a seek while playing; a place that reaches the note from elsewhere moves a paused element, never one with a position of her own", async () => {
	const v = open(core.setAnswer(COURSE, "", "e1", { pos: 300 }));
	await v.settled();
	v.m.fire("loadedmetadata");
	assert.deepEqual(v.m.seeks, [300], "it starts where the note says she left off");
	v.m.fire("play");
	v.m.tick(2);
	v.changed((t) => core.setAnswer(t, "", "e1", { pos: 50 }));
	await v.settled();
	assert.deepEqual(v.m.seeks, [300], "a change from elsewhere does not move playback that is under way");
	v.m.fire("pause");
	await v.settled();
	assert.deepEqual(v.answer(), { pos: 302 }, "a pause early keeps a place, and adds no done to an answer that had none");

	// paused and clean: the note's new place is taken
	v.changed((t) => core.setAnswer(t, "", "e1", { pos: 120 }));
	await v.settled();
	assert.deepEqual(v.m.seeks, [300, 120]);
	assert.equal(v.where(), "Left off at 2:00");

	// paused, scrubbed, nothing written yet: hers; the change does not move it
	v.m.tick(30); // 150
	assert.deepEqual(v.kept(), { "/e1": { pos: 150, base: 120 } });
	v.changed((t) => core.setAnswer(t, "", "e1", { pos: 10 }));
	await v.settled();
	assert.deepEqual(v.m.seeks, [300, 120], "not moved");
	assert.equal(v.m.currentTime, 150);
	v.close();
});

test("a place at or past the end starts at the beginning", async () => {
	const v = open(core.setAnswer(COURSE, "", "e1", { pos: 700 }), { media: { duration: 600, currentTime: 9 } });
	await v.settled();
	v.m.fire("loadedmetadata");
	assert.deepEqual(v.m.seeks, [0]);
	v.close();
});

test("the media of a followed box only: another listen's element, an element that is not the box's first, and a repeating activity's are ignored", async () => {
	const v = open(COURSE);
	await v.settled();
	// a second element after the first in the same box is not the box's media
	const second = fakeMedia({ duration: 600 });
	v.box().querySelector(".booklet-listen-media").appendChild(second);
	second.fire("play");
	second.tick(50);
	second.fire("pause");
	await v.settled();
	assert.equal(v.answer(), undefined);
	assert.equal(v.kept(), null);
	// an element outside any box is nothing to the view
	const loose = fakeMedia({ duration: 60 });
	v.view.contentEl.appendChild(loose);
	loose.fire("play");
	loose.tick(30);
	loose.fire("pause");
	assert.equal(v.disk.writes, 0);
	v.close();
});

test("a listen in a repeating activity is drawn as prompt, media and help with no tick, and its media is not followed", async () => {
	const text = `${HEAD}\n> [!activity|daily repeat daily] Daily\n\n> [!listen|r1] A repeated one\n> ![Repeated](media/r.mp3)\n> Some help.\n\n> [!text|t1] Notes\n`;
	const e = env(text);
	const v = openView(text, { app: e.app, disk: e.disk, screen: "activity:/daily" });
	await v.settled();
	const box = v.view.contentEl.querySelector('[data-booklet-q="r1"]');
	assert.ok(box?.classList.contains("booklet-listen"));
	assert.equal(box.querySelector("button"), null, "no tick");
	assert.equal(box.getAttribute("data-booklet-listen"), "", "marked, and followed by nothing");
	assert.match(words(box.querySelector(".booklet-help")), /Some help/);
	const m = fakeMedia({ duration: 60 });
	box.querySelector(".booklet-listen-media").appendChild(m);
	m.fire("play");
	m.tick(20);
	m.fire("pause");
	await v.settled();
	assert.equal(e.disk.writes, 0);
	assert.equal(e.kept(), null);
	assert.equal(v.view.hasUnsaved(), false);
	v.close();
});

test("a drawing that a change would cause waits while media plays, and is made when it stops", async () => {
	const v = open(COURSE);
	await v.settled();
	const before = v.box();
	v.m.fire("play");
	v.m.tick(3);
	// the design changes elsewhere (a title): the box and the element in it must not be replaced under her
	v.changed((t) => t.replace("Episode 1: Foundations", "Episode 1: The basics"));
	await v.settled();
	assert.equal(v.box(), before, "the same box is on the page");
	assert.equal(words(before.querySelector(".booklet-prompt")), "Episode 1: Foundations");
	v.m.fire("pause");
	await until(() => v.box() !== before, "the held drawing to be made once playback stopped");
	assert.equal(words(v.box().querySelector(".booklet-prompt")), "Episode 1: The basics");
	await v.settled();
	assert.deepEqual(v.answer(), { pos: 3, done: false }, "and the position was written on the way");
	v.close();
});

test("hasUnsaved is true while a position is playing or noted and not written, so the quit hook waits; saveTyped writes it", async () => {
	const v = open(COURSE);
	await v.settled();
	assert.equal(v.view.hasUnsaved(), false);
	v.m.fire("play");
	assert.equal(v.view.hasUnsaved(), true, "playing");
	v.m.tick(12);
	await v.view.saveTyped();
	assert.deepEqual(v.answer(), { pos: 12, done: false }, "read from the element at quit");
	v.m.fire("pause"); // the player stops with the app
	await v.settled();
	assert.equal(v.view.hasUnsaved(), false);

	// scrubbed while paused: noted, not written, unsaved
	v.m.tick(10);
	assert.equal(v.view.hasUnsaved(), true);
	await v.view.saveTyped();
	assert.deepEqual(v.answer(), { pos: 22, done: false });
	assert.equal(v.kept(), null);
	assert.equal(v.view.hasUnsaved(), false);
	v.close();
});

test("leaving the page writes the position read from the element before the drawing takes it away", async () => {
	const e = env(COURSE);
	const p = pane(COURSE, { screen: "activity:/course", appMore: { loadLocalStorage: e.app.loadLocalStorage, saveLocalStorage: e.app.saveLocalStorage } });
	await p.settled();
	const m = fakeMedia({ duration: 600 });
	p.el.querySelector('[data-booklet-listen="/e1"] .booklet-listen-media').appendChild(m);
	m.fire("play");
	m.tick(31);
	await p.trailTo("Made up");
	await p.settled();
	assert.equal(p.screen, "home");
	assert.deepEqual(norm(core.parseBooklet(p.disk.text).records.answers[""]?.e1), { pos: 31, done: false });
	p.close();
});

test("the device store: a position left by a kill is added to the note at the next start when the note is as it was", async () => {
	const seed = { [KEY]: { "/e1": { pos: 200, base: 0 } } };
	const v = open(COURSE, { seed });
	await v.settled();
	assert.deepEqual(v.answer(), { pos: 200, done: false });
	assert.equal(v.kept(), null, "the entry is gone once the note holds it");
	assert.equal(v.where(), "Left off at 3:20");
	v.m.fire("loadedmetadata");
	assert.deepEqual(v.m.seeks, [200], "and playback resumes there");
	v.close();
});

test("the device store: when the note holds another place than the one the session began from, the note wins and the entry is dropped", async () => {
	const text = core.setAnswer(COURSE, "", "e1", { pos: 50 });
	const v = open(text, { seed: { [KEY]: { "/e1": { pos: 200, base: 0 } } } });
	await v.settled();
	assert.equal(v.disk.writes, 0, "nothing is written over what another device wrote");
	assert.deepEqual(v.answer(), { pos: 50 });
	assert.equal(v.kept(), null);
	v.m.fire("loadedmetadata");
	assert.deepEqual(v.m.seeks, [50]);
	v.close();

	// an entry for a question the note no longer has is dropped as well
	const w = open(COURSE, { seed: { [KEY]: { "/gone": { pos: 9, base: 0 } } } });
	await w.settled();
	assert.equal(w.kept(), null);
	assert.equal(w.disk.writes, 0);
	w.close();
});

test("the device store follows a rename, with the furthest page reached", async () => {
	const out = await esbuild.build({ entryPoints: [`${ROOT}/src/listen-store.ts`], bundle: true, format: "esm", platform: "neutral", write: false, alias: { obsidian: `${ROOT}/test/obsidian-stub.mjs` }, logLevel: "silent" });
	const store = await import("data:text/javascript;base64," + Buffer.from(out.outputFiles[0].text).toString("base64"));
	const m = new Map();
	const app = { loadLocalStorage: (k) => (m.has(k) ? JSON.parse(m.get(k)) : null), saveLocalStorage: (k, d) => (d === null ? m.delete(k) : m.set(k, JSON.stringify(d))) };
	store.keepListen(app, "A.booklet.md", "/e1", { pos: 9, base: 0 });
	store.keepFurthest(app, "A.booklet.md", 3);
	store.keepFurthest(app, "A.booklet.md", 1);
	assert.equal(store.loadFurthest(app, "A.booklet.md"), 3, "the furthest, not the latest");
	store.moveDevice(app, "A.booklet.md", "B.booklet.md");
	assert.deepEqual(norm(store.loadListens(app, "B.booklet.md")), { "/e1": { pos: 9, base: 0 } });
	assert.equal(store.loadFurthest(app, "B.booklet.md"), 3);
	assert.deepEqual([...m.keys()].sort(), ["booklet-listen:B.booklet.md", "booklet-place:B.booklet.md"]);
	// an entry that is not a pair of whole numbers is not one
	m.set("booklet-listen:C.booklet.md", JSON.stringify({ a: { pos: -1, base: 0 }, b: { pos: 1.5, base: 0 }, c: "x", d: { pos: 4, base: 2 } }));
	assert.deepEqual(norm(store.loadListens(app, "C.booklet.md")), { d: { pos: 4, base: 2 } });
});

test("a listen counts as answered only when it is done: a card's status says done, and a position alone is no answer", async () => {
	const text = core.setAnswer(core.setAnswer(COURSE, "", "e1", { pos: 30 }), "", "e2", { done: true });
	const p = pane(text);
	await p.settled();
	const row = (name) => p.all(".booklet-cardrow").find((r) => words(r).includes(name));
	assert.match(words(row("The course")), /1 of 3 answered/, "e2 is done; e1's position is no answer; q1 is a question");
	p.close();
});
