/*
 * Stage 5 of the Design view, the last part: the Add tab's hover sample of a widget, a listen and the eight views of data is drawn the way the
 * canvas draws the same piece of a note (the reader's own code, through design-sample.ts), inert, and nothing of it can load, run or write.
 * Run in node over jsdom with the stand-in for Obsidian: how a sample looks is measured in the real app (e2e-tests/design-checks.js, check 66).
 * What these hold is which pieces are drawn and which stay a picture, what the drawing is made of, and what it keeps out: no player, no
 * address, no request, no timer, no observer left, no write.
 */
import { window as w, click, words } from "./dom.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { core } from "./helpers.mjs";
import { FULL } from "./design-fixtures.mjs";
import { openDesign, observerCount, doc } from "./design-harness.mjs";

const { drawInertQuery, drawInertQuestion, queryOfPiece, questionOfPiece, shrinkToFit, SHRINK_CLASSES } = await import("./.build/view.mjs");
const { PIECES, WORDS_PIECE, hasRemoteMedia, sampleOf } = core;

const everyPiece = [...PIECES, WORDS_PIECE];
const piece = (file) => everyPiece.find((p) => p.file === file);
const VIEWS = PIECES.filter((p) => p.group === "views");
const tileOf = (v, file) => v.el.querySelector(`.booklet-design-tile[data-piece="${file}"]`);
const send = (el, type) => el.dispatchEvent(new w.Event(type));
const pop = (v) => v.el.querySelector(".booklet-design-samplepop");
/** Makes the moment a tile waits before its sample shows no time at all, for the length of a test. */
function quickSamples() {
	const set = w.setTimeout;
	w.setTimeout = (fn, ms, ...rest) => (ms === 400 ? (fn(), 1) : set.call(w, fn, ms, ...rest));
	return () => void (w.setTimeout = set);
}
/** Shows a tile's sample (the view's own hover) and gives the popover. */
const hover = (v, file) => {
	send(tileOf(v, file), "mouseenter");
	const p = pop(v);
	assert.ok(p, `${file}: a popover`);
	return p;
};
const leave = (v, file) => send(tileOf(v, file), "mouseleave");
/** Every event a script could make at an element. */
const EVENTS = ["pointerenter", "pointerover", "mouseover", "click", "dblclick", "pointerdown", "mousedown", "pointerup", "mouseup", "input", "change", "keydown", "keyup", "focusin", "focusout", "blur", "focus", "submit", "paste", "drop", "play", "pause", "ended", "timeupdate", "seeked", "loadedmetadata"];
/** What a media element says: not an event aimed at a control, and not one the wrapper drops (a drawn listen has no media element to say it). */
const MEDIA_EVENTS = new Set(["play", "pause", "ended", "timeupdate", "seeked", "loadedmetadata"]);
function fire(el) {
	el.click?.();
	click(el);
	for (const type of EVENTS) el.dispatchEvent(new w.Event(type, { bubbles: true, cancelable: true }));
}
/** What the view asks of the app while `fn` runs: timers, frames, observers (jsdom's own, and the resize observers counted by the harness). */
function asks(fn) {
	const obs = observerCount();
	const seen = {};
	const restore = [];
	const count = (k) => (seen[k] = (seen[k] ?? 0) + 1);
	for (const g of [globalThis, w])
		for (const k of ["setInterval", "requestAnimationFrame", "requestIdleCallback"]) {
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
		fn();
		return { ...seen, resizeLive: obs.live };
	} finally {
		for (const [g, k, orig] of restore.reverse()) g[k] = orig;
		obs.off();
	}
}

/* ---------------------------------------------------------------- which pieces are drawn */

test("what a sample is, after stage 5: a widget and a listen are drawn as questions, the eight views of data are drawn as views, and the rest keep their card or reading", () => {
	assert.equal(sampleOf(piece("Q - widget (grid).md")), "question");
	assert.equal(sampleOf(piece("Q - listen.md")), "question");
	assert.equal(VIEWS.length, 8, "the eight pieces of the Views group");
	for (const p of VIEWS) assert.equal(sampleOf(p), "view", p.file);
	// still a picture, and why: a lone menu is no question (the canvas draws it as a card); structure is the page's shape; a data block, a figure and a group
	// are what the canvas draws as a small card; an image or an embed would be fetched
	for (const f of ["Q - menu (shared list).md", "Data - rows.md", "Data - rows (the reader can edit).md", "Data - figure (diagram).md", "Reading - image.md", "Reading - figure (embed).md", "Reading - group (folded).md", "Reading - group (steps).md", "Reading - copy button.md"]) assert.equal(sampleOf(piece(f)), "card", f);
	for (const p of PIECES.filter((x) => x.group === "structure")) assert.equal(sampleOf(p), "card", p.file);
});

test("every piece of a view is found as a query with its source, with the notes records taken out; no other piece holds one the canvas could draw", () => {
	for (const p of VIEWS) {
		const found = queryOfPiece(p.text);
		assert.ok(found, `${p.file}: a query`);
		assert.ok(found.segment.source, `${p.file}: with its source`);
		assert.deepEqual(found.book.records.answers, {}, `${p.file}: no kept answer`);
	}
	for (const p of PIECES.filter((x) => x.group !== "views" && x.group !== "data")) if (p.kinds.length === 0 || !/booklet query/.test(p.text)) assert.equal(queryOfPiece(p.text), null, p.file);
	assert.equal(queryOfPiece(piece("Data - rows.md").text), null, "a data block alone has no query");
});

test("the widget piece carries its own data block and is read with it, and the listen piece's media is said as words", () => {
	const widget = questionOfPiece(piece("Q - widget (grid).md").text);
	assert.equal(widget.question.kind, "widget");
	assert.ok(widget.question.widget, "its block is found");
	const listen = questionOfPiece(piece("Q - listen.md").text);
	assert.equal(listen.question.kind, "listen");
});

/* ---------------------------------------------------------------- the hover samples */

test("a widget's hover sample is the reader's grid: its head, its four axes, its cells and items, every control off, and no picture and no card", () => {
	const restore = quickSamples();
	try {
		const v = openDesign(FULL);
		v.openGroups();
		const p = hover(v, "Q - widget (grid).md");
		const wrap = p.querySelector(".booklet-design-samplepop-body > .booklet-sample.booklet-sample-question[inert]");
		assert.ok(wrap, "inside the inert wrapper");
		assert.equal(p.querySelector(".booklet-design-samplepop-art, .booklet-design-friendly, pre"), null, "not its picture, not a card, not Markdown");
		assert.equal(words(p.querySelector(".booklet-prompt")), "Your question here");
		assert.equal(words(p.querySelector(".booklet-help")), "Select what fits.");
		assert.deepEqual([...p.querySelectorAll(".booklet-axis")].map(words), ["more of one thing", "less of another", "more of it", "less of it"]);
		assert.deepEqual([...p.querySelectorAll(".booklet-cell-name")].map(words), ["First cell", "Second cell", "Third cell", "Fourth cell"]);
		assert.deepEqual([...p.querySelectorAll("button.booklet-item")].map(words), ["First item", "Second item", "Third item", "Fourth item"]);
		assert.ok([...wrap.querySelectorAll("button, input")].every((c) => c.disabled), "every control is off");
		assert.ok([...p.querySelectorAll("button.booklet-item")].every((b) => b.getAttribute("aria-pressed") === "false"), "nothing shown picked");
		assert.equal(words(p.querySelector(".booklet-design-samplepop-name")), "Widget (grid)");
		v.close();
	} finally {
		restore();
	}
});

test("a listen's hover sample is the reader's listen: its title and its media as words, no player, no Play slot, no link and no address in an attribute", () => {
	const restore = quickSamples();
	try {
		const v = openDesign(FULL);
		v.openGroups();
		const p = hover(v, "Q - listen.md");
		assert.ok(p.querySelector(".booklet-design-samplepop-body > .booklet-sample.booklet-sample-question[inert]"), "inside the inert wrapper");
		assert.equal(p.querySelector(".booklet-design-samplepop-art"), null, "not its picture");
		assert.equal(words(p.querySelector(".booklet-prompt")), "Title of the recording");
		assert.equal(words(p.querySelector(".booklet-listen-media")), "Words describing the recording (https://media.example.org/recording.m4a)");
		assert.equal(p.querySelector("audio, video, iframe, img, source, embed, object, track, picture"), null, "no player, no picture");
		assert.equal(p.querySelector("a, [src], [href], [srcset], [data], [poster]"), null, "no link, no address in an attribute");
		assert.equal(p.querySelector(".booklet-media-slot, .booklet-allow-btn, .internal-link, .external-link"), null, "no Play slot, no allow card");
		assert.ok([...p.querySelectorAll("button, input")].every((c) => c.disabled), "every control is off");
		v.close();
	} finally {
		restore();
	}
});

test("each of the eight views of data has its hover sample drawn as the reader draws it, in an inert wrapper, from the piece's own data, and none is its picture", () => {
	const restore = quickSamples();
	try {
		const v = openDesign(FULL);
		v.openGroups();
		const viewOf = (p) => p.querySelector(".booklet-query")?.getAttribute("data-booklet-view");
		const got = {};
		for (const piece of VIEWS) {
			const p = hover(v, piece.file);
			assert.ok(p.querySelector(".booklet-design-samplepop-body > .booklet-sample.booklet-sample-query[inert]"), `${piece.file}: inside the inert wrapper`);
			assert.equal(p.querySelector(".booklet-design-samplepop-art, .booklet-design-friendly, pre"), null, `${piece.file}: not a picture, not Markdown`);
			assert.equal(p.querySelector(".booklet-qc-slot, .booklet-qc, input, select, textarea, button, th button, th[aria-sort]"), null, `${piece.file}: no sort, filter, search or row action`);
			got[piece.file] = [viewOf(p), words(p.querySelector(".booklet-query"))];
			leave(v, piece.file);
		}
		const row = "First row";
		assert.equal(got["View - table.md"][0], "table");
		assert.match(got["View - table.md"][1], /First row.*3.*A few words/);
		assert.equal(got["View - list.md"][0], "list");
		assert.equal(got["View - cards.md"][0], "cards");
		assert.equal(got["View - tiles.md"][0], "tiles");
		assert.equal(got["View - bars.md"][0], "bars");
		assert.equal(got["View - line.md"][0], "line");
		for (const f of ["View - list.md", "View - cards.md", "View - tiles.md", "View - bars.md"]) assert.ok(got[f][1].includes(row), f);
		// a log and its list has nothing kept, and says the piece's own empty line; a list the reader keeps says its own
		assert.equal(got["View - kept entries (a log and its list).md"][1], "Nothing kept yet.");
		assert.match(got["View - table (the reader adds and removes rows).md"][1], /Nothing here yet\. Add the first one\./);
		v.close();
	} finally {
		restore();
	}
});

test("the pieces that stay a picture in the Add tab still show their picture, larger, and never Markdown", () => {
	const restore = quickSamples();
	try {
		const v = openDesign(FULL);
		v.openGroups();
		for (const f of ["Q - menu (shared list).md", "Data - rows.md", "Reading - image.md", "Reading - figure (embed).md", "Structure - module.md", "Reading - copy button.md"]) {
			const p = hover(v, f);
			assert.ok(p.querySelector(".booklet-design-samplepop-art svg"), `${f}: its picture`);
			assert.equal(p.querySelector("pre, .booklet-sample"), null, `${f}: nothing drawn, no Markdown`);
			leave(v, f);
		}
		v.close();
	} finally {
		restore();
	}
});

/* ---------------------------------------------------------------- what a sample keeps out */

test("a widget's and a listen's sample reads no vault file and no workspace: drawn with an app that fails at any touch of either", () => {
	const refuse = (what) => new Proxy({}, { get: (_t, k) => assert.fail(`the drawing reached ${what}.${String(k)}`) });
	const app = { vault: refuse("vault"), workspace: refuse("workspace"), metadataCache: refuse("metadataCache") };
	for (const f of ["Q - widget (grid).md", "Q - listen.md"]) {
		const into = doc.body.createDiv();
		const x = questionOfPiece(piece(f).text);
		const drawn = drawInertQuestion({ app, owner: { register() {} }, sourcePath: "", into }, x.activity, x.question);
		assert.ok(drawn, `${f}: drawn`);
		assert.deepEqual(drawn.writes.filter((e) => e.method !== "keepOwn"), [], `${f}: nothing answered, typed or held`);
		into.remove();
	}
	const into = doc.body.createDiv();
	for (const p of VIEWS) assert.ok(drawInertQuery({ app, owner: { register() {} }, sourcePath: "", into }, queryOfPiece(p.text)).card, p.file);
	into.remove();
});

test("a sample loads nothing: hovering every tile makes no request, gives the renderer no address or media, and holds no player or picture of a listen", () => {
	const asked = [];
	let requests = 0;
	const was = { fetch: globalThis.fetch, xhr: w.XMLHttpRequest, image: w.Image };
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
	const restore = quickSamples();
	try {
		const v = openDesign(FULL);
		v.openGroups();
		for (const p of everyPiece) {
			const open = hover(v, p.file);
			assert.equal(open.querySelector("audio, video, iframe, img, source, embed, object, track, picture, [src], [srcset], [poster]"), null, `${p.file}: nothing that could be loaded`);
			leave(v, p.file);
		}
		assert.ok(asked.length > 20);
		for (const md of asked) assert.equal(hasRemoteMedia(md), false, md.slice(0, 60));
		assert.ok(!asked.some((m) => /recording\.m4a|media\.example\.org/.test(m)), "the listen's address never reached the renderer");
		assert.equal(requests, 0, "no network request");
		v.close();
	} finally {
		restore();
		globalThis.fetch = was.fetch;
		w.XMLHttpRequest = was.xhr;
		w.Image = was.image;
		delete globalThis.__bookletStubRender;
	}
});

test("hovering and pressing every drawn sample writes nothing: the file is byte for byte as it was", async () => {
	const restore = quickSamples();
	try {
		const v = openDesign(FULL);
		v.openGroups();
		const before = v.disk.text;
		for (const p of everyPiece) {
			const open = hover(v, p.file);
			for (const el of open.querySelectorAll(".booklet-sample, .booklet-sample *")) fire(el);
			leave(v, p.file);
		}
		await v.view.whenIdle();
		assert.equal(v.disk.writes, 0, "no write");
		assert.equal(v.disk.text, before, "byte for byte");
		assert.equal(v.view.getViewData(), before);
		v.close();
	} finally {
		restore();
	}
});

test("an event aimed at a control of a sample never reaches a handler: the wrapper drops it on the way down, whoever makes the event", () => {
	const restore = quickSamples();
	try {
		const v = openDesign(FULL);
		v.openGroups();
		const reached = [];
		for (const f of ["Q - choice.md", "Q - widget (grid).md", "Q - listen.md", "Q - matrix.md", ...VIEWS.map((p) => p.file)]) {
			const p = hover(v, f);
			let controls = 0;
			for (const el of p.querySelectorAll("button, input, textarea, select, summary, a, svg, [tabindex]")) {
				controls++;
				for (const type of EVENTS.filter((t) => !MEDIA_EVENTS.has(t))) el.addEventListener(type, () => void reached.push(`${f}: ${type} at ${el.tagName}`));
				fire(el);
			}
			if (!f.startsWith("View - ") || f === "View - line.md") assert.ok(controls > 0, `${f}: has controls to aim at`);
			leave(v, f);
		}
		assert.deepEqual(reached, [], "no handler of a drawing ran");
		v.close();
	} finally {
		restore();
	}
});

test("a sample starts no timer and no observer that outlives it: the widget, the listen and every view, shown over and over, leave no observer, and ask for no more than a choice sample does", () => {
	const restore = quickSamples();
	try {
		const run = (files) =>
			asks(() => {
				const v = openDesign(FULL);
				v.openGroups();
				for (let i = 0; i < 10; i++)
					for (const f of files) {
						const p = hover(v, f);
						for (const el of p.querySelectorAll(".booklet-sample, .booklet-sample *")) fire(el);
						leave(v, f);
					}
				assert.equal(pop(v), null, "gone on leave");
				v.close();
			});
		const drawn = run(["Q - widget (grid).md", "Q - listen.md", ...VIEWS.map((p) => p.file)]);
		const plain = run(["Q - choice.md"]);
		assert.equal(drawn.resizeLive, 0, "no observer left, the line chart's included");
		assert.equal(drawn.setInterval ?? 0, 0, "no interval");
		assert.equal(drawn.MutationObserver ?? 0, plain.MutationObserver ?? 0, "no more observers of the page than a choice's sample");
		assert.equal(drawn.IntersectionObserver ?? 0, plain.IntersectionObserver ?? 0);
		assert.equal(drawn.requestAnimationFrame ?? 0, plain.requestAnimationFrame ?? 0, "no frame asked for");
	} finally {
		restore();
	}
});

test("a line chart's width observer is made for the sample and let go of when the popover goes, however often it is shown", () => {
	const restore = quickSamples();
	const obs = observerCount();
	try {
		const v = openDesign(FULL);
		v.openGroups();
		const before = obs.live;
		for (let i = 0; i < 10; i++) {
			hover(v, "View - line.md");
			assert.ok(obs.live >= before, "made while shown");
			leave(v, "View - line.md");
			assert.equal(obs.live, before, "and let go of on leave");
		}
		v.close();
	} finally {
		obs.off();
		restore();
	}
});

test("the sample's Component is let go on leave, one more while it is shown for a listen, a widget and a view, and unloaded", () => {
	const restore = quickSamples();
	try {
		const v = openDesign(FULL);
		v.openGroups();
		const kids = () => v.view.renderer._children;
		const base = kids().length;
		for (const f of ["Q - listen.md", "Q - widget (grid).md", "View - table.md", "View - line.md"]) {
			hover(v, f);
			assert.equal(kids().length, base + 1, `${f}: one Component more while it is shown`);
			const child = kids().at(-1);
			let unloaded = false;
			const unload = child.unload.bind(child);
			child.unload = () => {
				unloaded = true;
				unload();
			};
			leave(v, f);
			assert.equal(kids().length, base, `${f}: let go`);
			assert.equal(unloaded, true, `${f}: unloaded`);
			assert.equal(pop(v), null);
		}
		v.close();
	} finally {
		restore();
	}
});

test("a view drawn from a piece opens no note and keeps nothing when pressed, with the wrapper the canvas uses", () => {
	const into = doc.body.createDiv();
	const drawn = drawInertQuery({ app: {}, owner: { register() {} }, sourcePath: "", into }, queryOfPiece(piece("View - table.md").text));
	const before = drawn.card.innerHTML;
	for (const el of drawn.card.querySelectorAll("*")) fire(el);
	assert.deepEqual(drawn.opened, []);
	assert.equal(drawn.card.innerHTML, before);
	assert.ok(drawn.card.hasAttribute("inert"));
	into.remove();
});

/* ---------------------------------------------------------------- a sample taller than its room */

test("a drawn sample taller than the room it has is made smaller a step at a time until it fits, and is never cut off; one that fits is left alone", () => {
	/** A popover and its body whose height is what `heights` says for the step the body is at. */
	const rig = (heights, room = 400) => {
		const pop = doc.body.createDiv();
		const body = pop.createDiv();
		const step = () => SHRINK_CLASSES.findIndex((c) => body.classList.contains(c)) + 1;
		Object.defineProperty(pop, "scrollHeight", { get: () => heights[step()] ?? heights.at(-1) });
		Object.defineProperty(pop, "clientHeight", { get: () => room });
		return { pop, body, classes: () => SHRINK_CLASSES.filter((c) => body.classList.contains(c)) };
	};
	const fits = rig([300]);
	assert.equal(shrinkToFit(fits.pop, fits.body), 0);
	assert.deepEqual(fits.classes(), [], "a sample that fits is as it was drawn");
	const one = rig([700, 399]);
	assert.equal(shrinkToFit(one.pop, one.body), 1);
	assert.deepEqual(one.classes(), [SHRINK_CLASSES[0]]);
	const two = rig([700, 560, 390]);
	assert.equal(shrinkToFit(two.pop, two.body), 2);
	assert.deepEqual(two.classes(), [SHRINK_CLASSES[1]], "one size at a time: the earlier step is taken off");
	const never = rig([900]);
	assert.equal(shrinkToFit(never.pop, never.body), SHRINK_CLASSES.length);
	assert.deepEqual(never.classes(), [SHRINK_CLASSES.at(-1)], "the smallest step is the last: it goes no further");
});

test("where there is no layout nothing is too tall: a hovered sample is not shrunk in a document that measures nothing", () => {
	const restore = quickSamples();
	try {
		const v = openDesign(FULL);
		v.openGroups();
		for (const f of ["Q - widget (grid).md", "Q - listen.md", "View - line.md"]) {
			const p = hover(v, f);
			assert.equal(p.querySelector(".booklet-design-samplepop-body").className, "booklet-design-samplepop-body", f);
			leave(v, f);
		}
		v.close();
	} finally {
		restore();
	}
});

test("the popover of a drawn sample is shrunk when its content is taller than its box, a picture is not, and the sample is whole after", () => {
	const proto = w.HTMLElement.prototype;
	const had = { scroll: Object.getOwnPropertyDescriptor(proto, "scrollHeight"), client: Object.getOwnPropertyDescriptor(proto, "clientHeight") };
	// a layout of the test's own: a popover is 1000 high drawn as it is, 400 one step smaller, in a box 500 high
	Object.defineProperty(proto, "scrollHeight", { configurable: true, get() { return this.classList.contains("booklet-design-samplepop") ? (this.querySelector(".is-shrunk-1") ? 400 : 1000) : 0; } });
	Object.defineProperty(proto, "clientHeight", { configurable: true, get() { return this.classList.contains("booklet-design-samplepop") ? 500 : 0; } });
	const restore = quickSamples();
	try {
		const v = openDesign(FULL);
		v.openGroups();
		const p = hover(v, "Q - widget (grid).md");
		assert.equal(p.querySelector(".booklet-design-samplepop-body").className, "booklet-design-samplepop-body is-shrunk-1", "one step smaller, and it then fits");
		leave(v, "Q - widget (grid).md");
		const art = hover(v, "Structure - module.md");
		assert.equal(art.querySelector(".is-shrunk-1, .is-shrunk-2, .is-shrunk-3"), null, "a picture is as it is");
		v.close();
	} finally {
		restore();
		for (const [k, d] of [["scrollHeight", had.scroll], ["clientHeight", had.client]]) d ? Object.defineProperty(proto, k, d) : delete proto[k];
	}
});
