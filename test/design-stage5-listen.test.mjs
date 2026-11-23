/*
 * Stage 5 of the Design view, the second half: the canvas draws a `listen` question and a question asked for each pick of another, as a
 * reader sees them with nothing answered, nothing kept and nothing played, and none of it can change the note.
 * Run in node over jsdom with the stand-in for Obsidian: how they look is measured in the real app, which this is not. The drawings are
 * made by the reader's own code (listen-view.ts, each-question.ts); what these tests hold is what the canvas hands it, and what it keeps
 * out of the page: no player, no address that could be fetched, no timer, no observer, no write.
 */
import { window as w, click, words, typeInto } from "./dom.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { bookletAround, core } from "./helpers.mjs";
import { openDesign, observerCount, doc } from "./design-harness.mjs";

const { drawInertQuestion, drawnByLine } = await import("./.build/view.mjs");
const { PIECES } = core;

const GRID = PIECES.find((p) => p.file === "Q - widget (grid).md").text.replace(/new-/g, "w-").replace("[!widget|w-id]", "[!widget|w-id each:src]");

/** One activity: a local and a remote listen, a link, a listen with help, picks to ask for each of, and a question asked for each row of a data block. */
const NOTE = bookletAround(
	[
		"> [!activity|a] The activity",
		"",
		"> [!listen|ep1] Episode 1: Foundations",
		"> ![[ep1.mp3]]",
		"> Listen with headphones.",
		"",
		"> [!listen|ep2 left:60] Episode 2",
		"> ![Second episode](https://media.example.org/u01/e2.m4a)",
		"",
		"> [!listen|vid] The lecture",
		"> [Watch the lecture](https://video.example.org/watch/overview)",
		"",
		"> [!choice|src] Pick one",
		"- [ ] One",
		"- [ ] Two",
		"",
		"> [!text|why each:src] Why that one?",
		"> Say it in a few words.",
		"",
		"> [!scale|how each:src min:1 max:5] How much?",
		"",
		GRID,
		"",
		"> [!text|rowq each:jobs] Say more about the row",
		"",
		"> [!data] Data",
		"",
		"```booklet data",
		JSON.stringify({ fields: { job: "Job" }, rows: [{ job: "Job 1" }] }),
		"```",
		"^jobs",
		"",
		"%%",
		"> [!records]",
		"",
		"```booklet answers",
		JSON.stringify({ ep1: { pos: 754, done: true }, src: 2, why: [{ pick: 2, a: "kept words" }] }),
		"```",
		"%%",
		"",
	].join("\n"),
);

const questionBlock = (v, id) => v.all(`.booklet-design-block[data-kind="question"]`).find((b) => b.querySelector(`[data-booklet-q="${id}"]`));
const cardBlock = (v, id) => v.all(`.booklet-design-block[data-kind="question"]`).find((b) => b.querySelector(".booklet-design-friendly-detail")?.textContent.includes(id));
const open = () => {
	const v = openDesign(NOTE);
	v.go("The activity");
	return v;
};
const found = (id) => [...drawnByLine(NOTE).questions.values()].find((x) => x.question.id === id);

/** An App that lets nothing be read: any touch of the vault or the workspace is a failure. */
const noApp = () => {
	const refuse = (what) => new Proxy({}, { get: (_t, k) => assert.fail(`the drawing reached ${what}.${String(k)}`) });
	return { vault: refuse("vault"), workspace: refuse("workspace"), metadataCache: refuse("metadataCache") };
};

/** Every event a script could make at an element. */
const EVENTS = ["pointerenter", "pointerover", "mouseover", "click", "dblclick", "pointerdown", "mousedown", "pointerup", "mouseup", "input", "change", "keydown", "keyup", "focusin", "focusout", "blur", "focus", "submit", "paste", "drop", "play", "pause", "ended", "timeupdate", "seeked", "loadedmetadata"];
function fire(el) {
	el.click?.();
	click(el);
	for (const type of EVENTS) el.dispatchEvent(new w.Event(type, { bubbles: true, cancelable: true }));
	for (const key of ["Enter", " ", "ArrowRight"]) el.dispatchEvent(new w.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
}

/* ---------------------------------------------------------------- a listen */

test("a listen is drawn as the reader draws it: the prompt, its media as words, the help, a Done box that is off, and nothing left off", () => {
	const v = open();
	const box = questionBlock(v, "ep1");
	assert.ok(box, "drawn as a question");
	const wrap = box.querySelector(":scope > .booklet-design-drawn > .booklet-sample.booklet-sample-question");
	assert.ok(wrap && wrap.hasAttribute("inert"), "inside the inert wrapper");
	assert.equal(box.querySelector(".booklet-design-friendly, pre"), null, "no card, no Markdown");
	assert.equal(words(box.querySelector(".booklet-prompt")), "Episode 1: Foundations");
	assert.equal(words(box.querySelector(".booklet-listen-media")), "ep1.mp3");
	assert.equal(words(box.querySelector(".booklet-help")), "Listen with headphones.");
	const tick = box.querySelector("button.booklet-listen-tick");
	assert.ok(tick && tick.disabled, "the Done box is drawn, and off");
	assert.equal(tick.getAttribute("aria-pressed"), "false", "not shown done, though the note holds a done for it");
	assert.equal(words(box.querySelector(".booklet-listen-where")), "", "the reader's empty line: no position, though the note holds one");
	assert.ok(!words(v.page()).includes("Left off"), "no kept position is shown");
	assert.ok([...wrap.querySelectorAll("button, input")].every((c) => c.disabled), "every control is off");
	assert.doesNotMatch(words(box), /later beta/);
	v.close();
});

test("a remote embed is shown as its words and address, a link likewise, and a listen in a repeating activity as the reader draws it: no Done box", () => {
	const v = open();
	assert.equal(words(questionBlock(v, "ep2").querySelector(".booklet-listen-media")), "Second episode (https://media.example.org/u01/e2.m4a)");
	assert.equal(words(questionBlock(v, "vid").querySelector(".booklet-listen-media")), "Watch the lecture (https://video.example.org/watch/overview)");
	v.close();
	const rep = openDesign(bookletAround(["> [!activity|r repeat] Each time", "", "> [!listen|rl] Recording", "> ![[rec.mp3]]", ""].join("\n")));
	rep.go("Each time");
	const box = questionBlock(rep, "rl");
	assert.ok(box?.querySelector(".booklet-sample"), "drawn");
	assert.equal(box.querySelector("button"), null, "a listen of a repeating activity has no box of its own to tick");
	assert.equal(words(box.querySelector(".booklet-listen-media")), "rec.mp3");
	rep.close();
});

test("a listen's media is never played, loaded or read: no player, no element with an address, no call to the renderer for it, no vault read, no network request", () => {
	const asked = [];
	let requests = 0;
	const was = { fetch: globalThis.fetch, xhr: w.XMLHttpRequest, image: w.Image, beacon: w.navigator.sendBeacon };
	globalThis.fetch = () => void requests++;
	w.XMLHttpRequest = function () {
		requests++;
	};
	w.Image = function () {
		requests++;
	};
	globalThis.__bookletStubRender = (markdown, el) => {
		asked.push(markdown);
		el.appendText(markdown);
	};
	try {
		// the note's view: nothing under the listens that could be loaded
		const v = open();
		for (const id of ["ep1", "ep2", "vid"]) {
			const box = questionBlock(v, id);
			assert.equal(box.querySelector("audio, video, iframe, img, source, embed, object, track, picture, svg"), null, `${id}: no player, no picture`);
			assert.equal(box.querySelector("a, [src], [href], [srcset], [data], [poster]"), null, `${id}: no link, no address in an attribute`);
			assert.equal(box.querySelector(".booklet-media-slot, .booklet-allow-btn, .internal-link, .external-link"), null, `${id}: no Play slot, no allow card, no link`);
		}
		assert.equal(v.all("audio, video, iframe, img").length, 0, "none anywhere on the page");
		v.close();
		// the drawing alone, with an App that fails at any touch of the vault
		const into = doc.body.createDiv();
		for (const id of ["ep1", "ep2", "vid"]) {
			const x = found(id);
			assert.ok(drawInertQuestion({ app: noApp(), owner: { register() {} }, sourcePath: "Note.booklet.md", into }, x.activity, x.question), `${id} is drawn`);
		}
		assert.equal(into.querySelectorAll("audio, video, iframe, img, source, [src], a").length, 0);
		into.remove();
		assert.ok(!asked.some((m) => /ep1\.mp3|e2\.m4a|overview|!\[/.test(m)), `the renderer was never given the media: ${JSON.stringify(asked)}`);
		assert.equal(requests, 0, "no network request");
	} finally {
		globalThis.fetch = was.fetch;
		w.XMLHttpRequest = was.xhr;
		w.Image = was.image;
		delete globalThis.__bookletStubRender;
	}
});

test("a listen drawn on the canvas is inert: presses and events at the Done box, its row and its media record, play and schedule nothing, and the stand-in keeps nothing", () => {
	const into = doc.body.createDiv();
	const x = found("ep1");
	const drawn = drawInertQuestion({ app: noApp(), owner: { register() {} }, sourcePath: "", into }, x.activity, x.question);
	assert.ok(drawn);
	const before = drawn.card.innerHTML;
	for (const c of drawn.card.querySelectorAll("*")) fire(c);
	assert.equal(drawn.card.innerHTML, before, "the drawing is as it was");
	assert.deepEqual(drawn.writes.filter((e) => e.method !== "keepOwn"), [], "nothing was answered, typed or held");
	assert.equal(drawn.host.listens.unsaved(), false, "no position is waiting to be written");
	assert.equal(drawn.host.listens.playing(), false, "nothing plays");
	assert.equal(drawn.host.listens.onMedia(new w.Event("timeupdate")), false, "a media event is followed by no state");
	// a handler taken off the page and called straight: recorded and discarded
	const t = { scope: x.activity.scope, activity: x.activity };
	drawn.host.answer(t, x.question, { done: true });
	assert.deepEqual(drawn.writes.map((e) => e.method), ["answer"], "recorded");
	assert.equal(drawn.host.answerOf(t, x.question), undefined, "and shows nothing kept");
	into.remove();
});

test("a listen starts no timer and no observer, however often the page is drawn again or the drawing is pressed, and lets go of what it made when the view is gone", () => {
	/** What the page asks of the app (timers, frames, observers) while it is drawn 21 times and every drawn piece is pressed, for a note with these two pieces. */
	const asks = (pieces) => {
		const obs = observerCount();
		const seen = {};
		const restore = [];
		const count = (k) => (seen[k] = (seen[k] ?? 0) + 1);
		for (const g of [globalThis, w])
			for (const k of ["setTimeout", "setInterval", "requestAnimationFrame", "requestIdleCallback"]) {
				const orig = g[k];
				if (typeof orig !== "function") continue;
				restore.push([g, k, orig]);
				g[k] = (...a) => (count(k), orig.apply(g, a));
			}
		for (const k of ["MutationObserver", "IntersectionObserver", "PerformanceObserver"]) {
			const Orig = globalThis[k];
			if (typeof Orig !== "function") continue;
			restore.push([globalThis, k, Orig]);
			globalThis[k] = class extends Orig {
				constructor(...a) {
					super(...a);
					count(k);
				}
			};
		}
		try {
			const v = openDesign(bookletAround(["> [!activity|a] The activity", "", ...pieces, ""].join("\n")));
			v.go("The activity");
			for (let i = 0; i < 20; i++) v.go("The activity");
			for (const el of v.all(".booklet-sample, .booklet-sample *")) fire(el);
			const out = { ...seen, resizeMade: obs.made, resizeLive: obs.live };
			v.close();
			return { out, liveAfter: obs.live };
		} finally {
			for (const [g, k, orig] of restore.reverse()) g[k] = orig;
			obs.off();
		}
	};
	const listens = asks(["> [!listen|ep1] Episode", "> ![[ep1.mp3]]", "", "> [!listen|ep2] Two", "> ![](https://media.example.org/x.m4a)", "", "> [!listen|ep3] Three", "> [Watch](https://video.example.org/w)"]);
	const texts = asks(["> [!text|t1] Episode", "", "> [!text|t2] Two", "", "> [!text|t3] Three"]);
	assert.deepEqual(listens.out, texts.out, "three listens ask the app for no more than three text questions do: no timer, no frame, no observer");
	assert.equal(listens.out.setInterval ?? 0, 0, "no interval");
	assert.equal(listens.liveAfter, 0, "no observer is left when the view is gone");
});

test("what the reader's follower holds for a drawn listen is let go of with the drawing's owner", () => {
	const disposers = [];
	const into = doc.body.createDiv();
	const x = found("ep1");
	const drawn = drawInertQuestion({ app: noApp(), owner: { register: (fn) => void disposers.push(fn) }, sourcePath: "", into }, x.activity, x.question);
	const box = drawn.card.querySelector("[data-booklet-listen]");
	assert.ok(drawn.host.listens.about(box), "followed while it is drawn");
	for (const fn of disposers) fn();
	assert.equal(drawn.host.listens.about(box), null, "followed no longer once the owner is unloaded");
	into.remove();
});

test("even if a media element were put in a drawn listen and told to play, pause and end, no position is kept on the device and nothing reaches the note", () => {
	const into = doc.body.createDiv();
	const x = found("ep1");
	// an App that fails at any touch of the vault and counts every touch of its local storage, which is the device store (listen-store.ts)
	const store = [];
	const app = { ...noApp(), loadLocalStorage: (k) => void store.push(["load", k]), saveLocalStorage: (k) => void store.push(["save", k]) };
	const drawn = drawInertQuestion({ app, owner: { register() {} }, sourcePath: "", into }, x.activity, x.question);
	const box = drawn.card.querySelector("[data-booklet-listen]");
	const audio = box.querySelector(".booklet-listen-media").appendChild(doc.createElement("audio"));
	let at = 42;
	Object.defineProperty(audio, "currentTime", { get: () => at, set: (n) => void (at = n), configurable: true });
	Object.defineProperty(audio, "duration", { value: 100, configurable: true });
	// the reader's view hands each media event to the follower from a capture listener; here the test does
	for (const type of ["loadedmetadata", "play", "timeupdate", "pause", "ended"]) box.addEventListener(type, (evt) => void drawn.host.listens.onMedia(evt), true);
	for (const type of ["loadedmetadata", "play", "timeupdate", "pause", "ended"]) audio.dispatchEvent(new w.Event(type));
	drawn.host.listens.flush();
	assert.ok(drawn.writes.length > 0, "what the follower would have written is on the stand-in's list");
	assert.ok(drawn.writes.every((e) => e.method === "answer"), "and only as attempts, which the stand-in discards");
	assert.equal(drawn.host.answerOf({ scope: x.activity.scope, activity: x.activity }, x.question), undefined, "none kept");
	assert.equal(drawn.host.listens.unsaved(), false);
	assert.deepEqual(store, [], "the device's store was never read or written");
	into.remove();
});

/* ---------------------------------------------------------------- a question asked for each pick */

test("a question asked for each pick of another is drawn once, as the reader draws one copy of it: its words, its controls off, no pick's heading, and nothing a reader kept", () => {
	const v = open();
	for (const id of ["why", "how", "w-id"]) {
		const box = questionBlock(v, id);
		assert.ok(box?.querySelector(":scope > .booklet-design-drawn > .booklet-sample[inert]"), `${id}: drawn`);
		assert.equal(box.querySelector(".booklet-design-friendly, pre"), null, `${id}: no card, no Markdown`);
		assert.equal(box.querySelector(".booklet-each, .booklet-each-none, .booklet-copies, .booklet-copy, .booklet-pick-head"), null, `${id}: drawn whole, not as the reader draws it before a pick (hidden)`);
		assert.ok([...box.querySelectorAll("button, input, textarea")].every((c) => c.disabled), `${id}: every control is off`);
		assert.doesNotMatch(words(box), /later beta/);
	}
	const why = questionBlock(v, "why");
	assert.equal(words(why.querySelector(".booklet-prompt")), "Why that one?");
	assert.equal(words(why.querySelector(".booklet-help")), "Say it in a few words.");
	assert.equal(why.querySelector("input.booklet-text").value, "", "the note holds an answer for pick 2: it is not shown");
	assert.ok(!words(v.page()).includes("kept words"));
	assert.ok(questionBlock(v, "how").querySelector(".booklet-scale, input[type=range], button, input"), "a scale's controls");
	assert.ok(questionBlock(v, "w-id").querySelector("button.booklet-item"), "a widget's items");
	// the source is drawn as it always was, with nothing picked though the note holds a pick
	assert.ok([...questionBlock(v, "src").querySelectorAll("button.booklet-choice")].every((b) => b.getAttribute("aria-pressed") === "false"));
	v.close();
});

test("drawing a question asked for each pick leaves the parsed question as it was, and it keeps nothing when pressed", () => {
	const x = found("why");
	assert.equal(x.question.each, "src");
	const into = doc.body.createDiv();
	const drawn = drawInertQuestion({ app: noApp(), owner: { register() {} }, sourcePath: "", into }, x.activity, x.question);
	assert.ok(drawn);
	assert.equal(x.question.each, "src", "still asked for each pick");
	for (const c of drawn.card.querySelectorAll("*")) fire(c);
	typeInto(drawn.card.querySelector("input.booklet-text"), "typed by a script");
	assert.deepEqual(drawn.writes.filter((e) => e.method !== "keepOwn"), []);
	into.remove();
});

test("a question asked for each row of a data block stays a card, and says why in the reader's terms: a view of the block asks it in its rows", () => {
	const v = open();
	const box = cardBlock(v, "rowq");
	assert.ok(box, "a card");
	assert.equal(box.querySelector(".booklet-sample"), null, "nothing drawn");
	const note = words(box.querySelector(".booklet-design-friendly-note"));
	assert.equal(note, "This question is asked in the rows of a view of its data block, so it is not drawn here.");
	assert.doesNotMatch(note, /later beta/);
	assert.equal(box.querySelector("pre"), null);
	v.close();
});

/* ---------------------------------------------------------------- the file */

test("opening a note that holds listens and questions asked for each pick and selecting each piece leaves the file byte for byte as it was, with no write; a selected one has its bar", async () => {
	const v = open();
	const before = v.disk.text;
	const blocks = v.all(".booklet-design-block").map((b) => [b.getAttribute("data-kind"), b.getAttribute("data-start")]);
	assert.ok(blocks.filter(([k]) => k === "question").length >= 8, "every listen and each question is on the page");
	for (const [kind, start] of blocks) {
		v.select(kind, Number(start));
		assert.ok(v.editor(), `${kind} at ${start} opens in place`);
		await v.view.whenIdle();
		const box = v.pick(kind, Number(start));
		assert.ok(box.classList.contains("is-selected"), `${kind} at ${start} stands selected`);
		assert.ok(box.querySelector(":scope > .booklet-design-floatbar"), `${kind} at ${start} has its bar`);
		await v.view.whenIdle();
		assert.equal(v.disk.writes, 0, `${kind} at ${start}: no write`);
		assert.equal(v.disk.text, before, `${kind} at ${start}: byte for byte`);
	}
	// pressing a drawn listen and a drawn each question changes nothing either
	for (const id of ["ep1", "ep2", "vid", "why", "how", "w-id"]) {
		const b = questionBlock(v, id);
		for (const el of b.querySelectorAll(".booklet-sample, .booklet-sample *")) fire(el);
	}
	await v.view.whenIdle();
	assert.equal(v.disk.writes, 0);
	assert.equal(v.disk.text, before);
	assert.equal(v.view.getViewData(), before);
	v.close();
});
