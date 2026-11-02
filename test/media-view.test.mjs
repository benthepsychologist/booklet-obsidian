/*
 * Media in the view (src/media-view.ts and its place in src/view.ts): the slots the gate leaves tokens for, the players a press
 * brings up, the host after a look-alike link, and the rule that nothing remote is requested before a press. A press is a trusted
 * event; jsdom's are never, so the tests that press hand the slots a rule that trusts a click, and one test proves the real rule says no.
 * Made-up addresses only.
 */
import { window as w, openView, click, words, quiet, testApp } from "./dom.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { core } from "./helpers.mjs";

const { createPlayer, drawMedia, drawLinkHosts, keepLocalPreload, nameLocalMedia, isTrustedPress, playerHost, PressedSlot, MediaAllows } = await import("./.build/media.mjs");
const { gateMedia } = core;

/** jsdom does not play media: these record what the slots ask of an element. */
const calls = [];
const proto = w.HTMLMediaElement.prototype;
proto.play = function () {
	calls.push(["play", this.getAttribute("src")]);
	return Promise.resolve();
};
proto.pause = function () {
	calls.push(["pause"]);
};
proto.load = function () {
	calls.push(["load"]);
};
// jsdom takes no focus for an audio or video element, as Chromium's does when it has controls: a stand-in records the focus
const focused = [];
proto.focus = function () {
	focused.push(this);
};

const NONE = { vault: [], notes: {} };
const OPEN = { vault: ["media.example.org", "youtube.com"], notes: {} };

/** A drawing as the view has one: a component that remembers what to stop when it goes. */
const owner = () => {
	const cleanups = [];
	return { register: (f) => cleanups.push(f), unload: () => cleanups.splice(0).forEach((f) => f()) };
};

/** What the slots handed Obsidian's renderer: the Markdown, and the element it was drawn into. */
const rendered = [];

/** Text with its gate tokens, drawn into an attached element (`into`: the element a first drawing was made in, drawn again). */
function draw(markdown, allows = NONE, extra = {}, into = null) {
	const g = gateMedia(markdown, { mode: "block", allows, notePath: "Course.booklet.md" });
	const el = into ?? w.document.body.createDiv();
	el.empty();
	const p = el.createEl("p");
	p.appendText(g.text);
	const o = owner();
	const asked = [];
	const deps = { isPress: () => true, ask: (r) => asked.push(r), carry: () => {}, render: (md, to) => (rendered.push([md, to]), to.createEl("iframe", { attr: { src: "https://releases.obsidian.md/youtube?v=abcDEF12345" } })), ...extra };
	drawMedia(el, g.slots, deps, o);
	return { el, o, asked, slots: g.slots, remove: () => el.remove() };
}

/** Nothing in the DOM holds a remote address a browser would fetch. */
const remoteSrc = (el) => Array.from(el.querySelectorAll("[src], [data], [poster]")).filter((n) => /^(https?:)?\/\//i.test(n.getAttribute("src") ?? n.getAttribute("data") ?? n.getAttribute("poster") ?? ""));

test("before a press a slot has no player and no media src: a Play button, the host, and a way to open it in the browser", () => {
	const d = draw("![Episode 1](https://media.example.org/u01/e1.m4a)", OPEN);
	const slot = d.el.querySelector(".booklet-media-slot");
	assert.ok(slot);
	assert.equal(slot.getAttribute("data-state"), "ready");
	assert.equal(slot.getAttribute("data-booklet-media"), "audio");
	assert.equal(d.el.querySelector("p"), null, "a slot alone in its paragraph takes the paragraph's place");
	const play = slot.querySelector("button.booklet-media-play");
	assert.equal(words(play), "Play audio: Episode 1");
	assert.equal(words(slot.querySelector(".booklet-media-host")), "from media.example.org");
	assert.equal(play.getAttribute("aria-describedby"), slot.querySelector(".booklet-media-host").id);
	const link = slot.querySelector("a.external-link");
	assert.equal(words(link), "Open in browser");
	assert.equal(link.getAttribute("href"), "https://media.example.org/u01/e1.m4a");
	assert.equal(link.getAttribute("target"), "_blank");
	assert.equal(link.getAttribute("rel"), "noopener noreferrer");
	assert.equal(d.el.querySelectorAll("audio, video, iframe, img").length, 0);
	assert.deepEqual(remoteSrc(d.el), []);
	d.remove();
});

test("a press loads the player: src set from new URL, controls, preload metadata, play called in the press, focus on the player, a live line", () => {
	calls.length = 0;
	const d = draw("![Episode 1](https://media.example.org/u01/e%201.m4a?x=1)", OPEN);
	const play = d.el.querySelector("button.booklet-media-play");
	click(play);
	const a = d.el.querySelector("audio");
	assert.ok(a, "an audio element");
	assert.equal(a.getAttribute("src"), "https://media.example.org/u01/e%201.m4a?x=1");
	assert.equal(a.controls, true);
	assert.equal(a.getAttribute("preload"), "metadata");
	assert.equal(a.getAttribute("aria-label"), "Episode 1");
	assert.equal(a.getAttribute("data-booklet-player"), "audio");
	assert.deepEqual(calls.filter((c) => c[0] === "play"), [["play", "https://media.example.org/u01/e%201.m4a?x=1"]], "play() is called once, in the press");
	assert.equal(play.isConnected, false, "the button gives way to the player");
	assert.equal(focused.at(-1), a, "focus is on the player");
	assert.equal(words(d.el.querySelector(".booklet-media-live")), "Loading audio from media.example.org");
	assert.equal(d.el.querySelector(".booklet-media-live").getAttribute("aria-live"), "polite");
	click(d.el.querySelector("button.booklet-media-play") ?? d.el);
	assert.equal(d.el.querySelectorAll("audio").length, 1, "a second press makes no second player");
	d.remove();
});

test("video: playsinline and controls; the live line says video", () => {
	const d = draw("![A lecture](https://media.example.org/l.mp4)", OPEN);
	click(d.el.querySelector("button.booklet-media-play"));
	const v = d.el.querySelector("video");
	assert.ok(v.hasAttribute("playsinline"));
	assert.equal(v.controls, true);
	assert.equal(words(d.el.querySelector(".booklet-media-live")), "Loading video from media.example.org");
	assert.equal(words(d.el.querySelector(".booklet-media-host")), "from media.example.org");
	d.remove();
});

test("the real press rule is a trusted event: a click a script makes starts nothing", () => {
	const g = gateMedia("![Ep](https://media.example.org/e.mp3)", { mode: "block", allows: OPEN, notePath: "N.md" });
	const el = w.document.body.createDiv();
	el.appendText(g.text);
	drawMedia(el, g.slots, { isPress: isTrustedPress, ask: () => assert.fail("no ask"), carry: () => assert.fail("no carry"), render: () => assert.fail("no render") }, owner());
	click(el.querySelector("button.booklet-media-play"));
	el.querySelector("button.booklet-media-play").click();
	assert.equal(el.querySelectorAll("audio, video, iframe").length, 0);
	assert.deepEqual(remoteSrc(el), []);
	assert.equal(isTrustedPress({ isTrusted: true }), true);
	assert.equal(isTrustedPress({ isTrusted: false }), false);
	el.remove();
});

test("a slot for a site not allowed asks first, and loads nothing; once plays that piece only", () => {
	calls.length = 0;
	const d = draw("![Clip](https://other.example.net/c.mp4)", NONE);
	const slot = d.el.querySelector(".booklet-media-slot");
	assert.equal(slot.getAttribute("data-state"), "blocked");
	assert.equal(words(slot.querySelector(".booklet-media-host")), "from other.example.net, not allowed yet");
	assert.equal(words(slot.querySelector("button")), "Play video: Clip");
	click(slot.querySelector("button"));
	assert.equal(d.asked.length, 1);
	assert.equal(d.asked[0].slot.entry, "other.example.net");
	assert.equal(d.asked[0].opener, slot.querySelector("button"));
	assert.equal(d.el.querySelectorAll("video").length, 0, "nothing loads while the card is up");
	assert.deepEqual(remoteSrc(d.el), []);
	assert.deepEqual(calls, []);
	// the card's choice "once": a press of its own
	d.asked[0].once({ isTrusted: true });
	assert.equal(d.el.querySelectorAll("video").length, 1);
	assert.equal(d.el.querySelector("video").getAttribute("src"), "https://other.example.net/c.mp4");
	d.remove();
	// an untrusted choice plays nothing
	const e = draw("![Clip](https://other.example.net/c.mp4)", NONE, { isPress: (evt) => evt.isTrusted !== false });
	click(e.el.querySelector("button")); // jsdom's click has isTrusted false: nothing asked
	assert.equal(e.asked.length, 0);
	e.remove();
});

test("an error shows one honest message and the way out; the button comes back to try again", () => {
	const d = draw("![Ep](https://media.example.org/missing.mp3)", OPEN);
	click(d.el.querySelector("button.booklet-media-play"));
	const a = d.el.querySelector("audio");
	a.dispatchEvent(new w.Event("error"));
	assert.equal(d.el.querySelectorAll("audio").length, 0);
	assert.equal(words(d.el.querySelector(".booklet-media-live")), "This could not be played. The file may be missing, the format may not be supported here, or you may be offline.");
	assert.equal(words(d.el.querySelector("a.external-link")), "Open in browser");
	const again = d.el.querySelector("button.booklet-media-play");
	assert.ok(again, "Play is back");
	assert.equal(w.document.activeElement, again);
	click(again);
	assert.equal(d.el.querySelectorAll("audio").length, 1, "and it tries again");
	d.remove();
});

test("teardown: when the drawing goes the player pauses and lets go of its source; a keeper can keep it", () => {
	calls.length = 0;
	const d = draw("![Ep](https://media.example.org/e.mp3)", OPEN);
	click(d.el.querySelector("button.booklet-media-play"));
	const a = d.el.querySelector("audio");
	calls.length = 0;
	d.o.unload();
	assert.deepEqual(calls, [["pause"], ["load"]]);
	assert.equal(a.hasAttribute("src"), false);
	d.remove();

	const kept = [];
	const k = draw("![Ep](https://media.example.org/e.mp3)", OPEN, { keepAlive: (el, slot) => (kept.push([el.tagName, slot.addr]), true) });
	click(k.el.querySelector("button.booklet-media-play"));
	const b = k.el.querySelector("audio");
	calls.length = 0;
	k.o.unload();
	assert.deepEqual(kept, [["AUDIO", "https://media.example.org/e.mp3"]]);
	assert.deepEqual(calls, [], "a player kept is not stopped");
	assert.equal(b.getAttribute("src"), "https://media.example.org/e.mp3");
	k.remove();
	// no press, nothing to tear down
	const n = draw("![Ep](https://media.example.org/e.mp3)", OPEN);
	calls.length = 0;
	n.o.unload();
	assert.deepEqual(calls, []);
	n.remove();
});

test("createPlayer makes the element and nothing else: the caller places it and plays it", () => {
	const slot = { type: "media", media: "audio", addr: "https://media.example.org/e.mp3", alt: "", host: "media.example.org", entry: "media.example.org", allowed: true };
	const el = createPlayer(w.document, slot);
	assert.equal(el.tagName, "AUDIO");
	assert.equal(el.isConnected, false);
	assert.equal(el.getAttribute("aria-label"), "Audio");
	assert.equal(el.src, "https://media.example.org/e.mp3");
});

test("YouTube: nothing is handed to Obsidian before the press; the press hands it the address as an image embed, and the plugin makes no frame of its own", () => {
	rendered.length = 0;
	const d = draw("[Watch the talk](https://youtu.be/abcDEF12345?t=30)", OPEN);
	const slot = d.el.querySelector(".booklet-media-slot");
	assert.equal(slot.getAttribute("data-state"), "ready");
	assert.equal(words(slot.querySelector("button")), "Play video: Watch the talk");
	assert.equal(words(slot.querySelector(".booklet-media-host")), "from YouTube (youtube.com, releases.obsidian.md)");
	assert.equal(slot.querySelector("a.external-link").getAttribute("href"), "https://youtu.be/abcDEF12345?t=30");
	assert.equal(d.el.querySelectorAll("iframe").length, 0);
	assert.deepEqual(remoteSrc(d.el), []);
	assert.deepEqual(rendered, [], "Obsidian has been handed nothing");
	click(slot.querySelector("button"));
	assert.deepEqual(rendered.map((r) => r[0]), ["![](https://www.youtube.com/watch?v=abcDEF12345)"], "the canonical address, built from the id: not the file's own words");
	assert.equal(rendered[0][1].className, "booklet-media-native");
	const f = d.el.querySelector(".booklet-media-native iframe");
	assert.ok(f, "Obsidian's frame is in the slot");
	assert.equal(f.getAttribute("sandbox"), null, "the plugin set no frame attributes of its own");
	assert.equal(d.el.querySelector("button.booklet-media-play"), null, "the button gives way");
	assert.equal(words(d.el.querySelector(".booklet-media-live")), "Loading video from YouTube (youtube.com, releases.obsidian.md)");
	return Promise.resolve().then(() => {
		assert.equal(f.getAttribute("title"), "YouTube: Watch the talk");
		assert.equal(w.document.activeElement, f);
		click(d.el.querySelector(".booklet-media-native") ?? d.el);
		assert.equal(rendered.length, 1, "a second press hands nothing more");
		d.o.unload();
		assert.equal(f.getAttribute("src"), "about:blank", "leaving the page lets go of the player");
		assert.equal(d.el.querySelector(".booklet-media-native"), null);
		d.remove();
	});
});

test("YouTube: a slot not allowed asks first and hands Obsidian nothing; a render that fails gives Play back", async () => {
	rendered.length = 0;
	const b = draw("![Tube](https://youtu.be/abcDEF12345)", NONE);
	assert.equal(b.el.querySelector(".booklet-media-slot").getAttribute("data-state"), "blocked");
	assert.equal(words(b.el.querySelector(".booklet-media-host")), "from YouTube (youtube.com, releases.obsidian.md), not allowed yet");
	click(b.el.querySelector("button"));
	assert.equal(b.asked.length, 1);
	assert.equal(b.asked[0].slot.entry, "youtube.com");
	assert.equal(playerHost(b.asked[0].slot), "YouTube (youtube.com, releases.obsidian.md)");
	assert.deepEqual(rendered, []);
	assert.equal(b.el.querySelectorAll("iframe").length, 0);
	b.asked[0].once({ isTrusted: true });
	assert.equal(rendered.length, 1, "once hands it over with the press that chose it");
	b.remove();

	const f = draw("![Tube](https://youtu.be/abcDEF12345)", OPEN, { render: () => Promise.reject(new Error("no")) });
	click(f.el.querySelector("button"));
	await Promise.resolve();
	await Promise.resolve();
	assert.equal(words(f.el.querySelector(".booklet-media-live")), "This could not be played. The file may be missing, the format may not be supported here, or you may be offline.");
	assert.ok(f.el.querySelector("button.booklet-media-play"), "Play is back");
	assert.equal(f.el.querySelector(".booklet-media-native"), null);
	f.remove();
});

test("the other services keep the plugin's own sandboxed frame; an audio service has no video box; a service not known is only a link", () => {
	rendered.length = 0;
	const v = draw("[Talk](https://vimeo.com/123456789)", { vault: ["vimeo.com"], notes: {} });
	assert.equal(words(v.el.querySelector(".booklet-media-host")), "from Vimeo (player.vimeo.com)");
	click(v.el.querySelector("button"));
	const f = v.el.querySelector("iframe");
	assert.equal(f.getAttribute("src"), "https://player.vimeo.com/video/123456789?autoplay=1");
	assert.equal(f.getAttribute("sandbox"), "allow-scripts allow-same-origin allow-presentation");
	assert.equal(f.getAttribute("referrerpolicy"), "strict-origin-when-cross-origin");
	assert.equal(f.getAttribute("allow"), "autoplay; picture-in-picture; fullscreen");
	assert.equal(f.getAttribute("title"), "Vimeo: Talk");
	assert.equal(f.hasAttribute("allowfullscreen"), false, "`allow` carries fullscreen: the old attribute would only make the browser warn");
	assert.equal(w.document.activeElement, f);
	assert.deepEqual(rendered, [], "Obsidian does not embed Vimeo: it is not asked to");
	v.o.unload();
	assert.equal(f.getAttribute("src"), "about:blank");
	v.remove();
	const a = draw("[Listen](https://open.spotify.com/episode/0123456789abcdefABCDEF)", { vault: ["spotify.com"], notes: {} });
	click(a.el.querySelector("button"));
	const g = a.el.querySelector("iframe");
	assert.equal(g.className, "booklet-media-frame is-audio");
	assert.equal(g.hasAttribute("allowfullscreen"), false);
	assert.deepEqual(rendered, []);
	a.remove();
	const c = draw("[Notes](https://notes.example.org/page)", OPEN);
	assert.equal(c.el.querySelectorAll(".booklet-media-slot").length, 0);
	assert.equal(c.el.querySelector("p").textContent, "[Notes](https://notes.example.org/page)", "the gate leaves a plain link to Obsidian to draw");
	c.remove();
});

test("frames, raw media tags and addresses that are not media are links naming the host, never loaded; an http address is refused", () => {
	const d = draw('<iframe src="https://frames.example.net/p"></iframe>\n\n![Page](https://video.example.org/watch)\n\n![Old](http://media.example.org/old.mp3)', OPEN);
	const slots = Array.from(d.el.querySelectorAll(".booklet-media-slot"));
	assert.equal(slots.length, 3, "the three are drawn in place");
	d.remove();

	const e = draw('<iframe src="https://frames.example.net/p"></iframe>', OPEN);
	const s1 = e.el.querySelector(".booklet-media-slot");
	assert.equal(s1.getAttribute("data-booklet-media"), "link");
	assert.equal(s1.getAttribute("data-state"), "frame");
	assert.equal(words(s1), "frames.example.net from frames.example.net");
	assert.equal(s1.querySelector("a").getAttribute("href"), "https://frames.example.net/p");
	assert.equal(s1.querySelector("a").getAttribute("rel"), "noopener noreferrer");
	assert.equal(e.el.querySelectorAll("iframe").length, 0);
	assert.deepEqual(remoteSrc(e.el), []);
	e.remove();

	const f = draw("![Page](https://video.example.org/watch)", OPEN);
	assert.equal(words(f.el.querySelector(".booklet-media-slot")), "Page from video.example.org");
	f.remove();

	const g = draw("![Old song](http://media.example.org/old.mp3)", OPEN);
	const s3 = g.el.querySelector(".booklet-media-slot");
	assert.equal(s3.getAttribute("data-state"), "refused");
	assert.equal(s3.querySelector("button"), null);
	assert.match(words(s3), /Old song from media\.example\.org\. This address does not use https, so it cannot be played here\. Open in browser/);
	g.remove();
});

test("a slot with words around it stays in its paragraph; a token with no slot draws nothing", () => {
	const d = draw("Hear ![Ep](https://media.example.org/e.mp3) now.", OPEN);
	const p = d.el.querySelector("p");
	assert.ok(p);
	assert.ok(p.querySelector(".booklet-media-slot"));
	assert.match(p.textContent, /^Hear /);
	assert.match(p.textContent, / now\.$/);
	d.remove();
	const el = w.document.body.createDiv();
	el.appendText("a 9 b");
	drawMedia(el, [], { isPress: () => true, ask() {}, carry() {}, render() {} }, owner());
	assert.equal(el.textContent, "a 9 b", "no slots, nothing to do");
	drawMedia(el, [{ type: "link", addr: "https://x.example.org/", alt: "", host: "x.example.org", why: "address" }], { isPress: () => true, ask() {}, carry() {}, render() {} }, owner());
	assert.equal(el.textContent.includes(""), false);
	el.remove();
});

test("an external link whose words are not its address shows the host after it, outside the link", () => {
	const el = w.document.body.createDiv();
	el.innerHTML = [
		'<p><a class="external-link" href="https://evil.example/login">Sign in</a></p>',
		'<p><a class="external-link" href="https://notes.example.org/page">https://notes.example.org/page</a></p>',
		'<p><a class="external-link" href="https://www.notes.example.org/">notes.example.org</a></p>',
		'<p><a class="external-link" href="https://bank.example.com/">https://other.example.net</a></p>',
		'<p><a class="external-link" href="https://127.0.0.1:8443/x">a local one</a></p>',
		'<p><a class="internal-link" href="Other note">Other note</a></p>',
		'<p><a href="mailto:a@example.org">mail</a></p>',
		'<p><a href="#heading">jump</a></p>',
	].join("");
	drawLinkHosts(el);
	const hosts = Array.from(el.querySelectorAll("p")).map((p) => p.querySelector(".booklet-link-host")?.textContent ?? null);
	assert.deepEqual(hosts, [" (evil.example)", null, null, " (bank.example.com)", " (127.0.0.1:8443)", null, null, null]);
	const a = el.querySelector("a");
	assert.equal(a.textContent, "Sign in", "the link's own words are unchanged");
	assert.equal(a.nextElementSibling.parentElement, a.parentElement, "after the link, not inside it");
	drawLinkHosts(el);
	assert.equal(el.querySelectorAll(".booklet-link-host").length, 3, "drawn again, not added twice");
	el.remove();
});

test("keepLocalPreload: Obsidian's own audio and video get preload none, the plugin's own players keep theirs", () => {
	const el = w.document.body.createDiv();
	el.innerHTML = '<audio controls src="media/a.mp3"></audio><video controls src="media/v.mp4" preload="auto"></video><audio data-booklet-player="audio" preload="metadata" src="https://media.example.org/x.mp3"></audio><p>words</p>';
	keepLocalPreload(el);
	assert.deepEqual(Array.from(el.querySelectorAll("audio, video")).map((m) => m.getAttribute("preload")), ["none", "none", "metadata"]);
	const lone = w.document.createElement("audio");
	keepLocalPreload(lone);
	assert.equal(lone.getAttribute("preload"), "none", "an element handed over itself is set too");
	el.remove();
});

test("nameLocalMedia: Obsidian's own player is named by the listen prompt, else the embed's alt words, else the file; a name it has is kept", () => {
	const el = w.document.body.createDiv();
	el.innerHTML = '<div data-booklet-name="Listen to the tone"><span class="internal-embed" src="tone-10s.wav" alt="tone-10s.wav"><audio controls src="app://id/tone-10s.wav?1"></audio></span></div>'
		+ '<span class="internal-embed" src="media/Spoken intro.mp3" alt="The intro"><audio controls src="app://id/media/Spoken%20intro.mp3?1"></audio></span>'
		+ '<span class="internal-embed" src="media/Spoken%20clip.mp4"><video controls src="app://id/media/Spoken%20clip.mp4?1"></video></span>'
		+ '<audio controls aria-label="Already named" src="a.mp3"></audio><audio data-booklet-player="audio" aria-label="Ours" src="https://media.example.org/x.mp3"></audio><audio src="app://id/plain.ogg?5"></audio>';
	nameLocalMedia(el);
	assert.deepEqual(Array.from(el.querySelectorAll("audio, video")).map((m) => m.getAttribute("aria-label")), ["Listen to the tone", "The intro", "Spoken clip.mp4", "Already named", "Ours", "plain.ogg"]);
	el.remove();
});

/* ---- no second Play press: the choice on the card carries the press over the redraw ---- */

/** A view as the slots meet one: a root drawn again after the list changes, and the PressedSlot that carries a press over it. */
function viewLike(markdown, { isPress = () => true } = {}) {
	const root = w.document.body.createDiv();
	const pressed = new PressedSlot();
	const asked = [];
	const me = {
		root,
		asked,
		allows: NONE,
		drawing: null,
		extra: { isPress, ask: (r) => asked.push(r), carry: (opener, slot) => pressed.keep(root, opener, slot) },
		/** The view is drawn again with the list as it is now, and finished. */
		redraw() {
			me.drawing?.o.unload();
			me.drawing = draw(markdown, me.allows, me.extra, root);
			pressed.resume(root);
		},
		play: (n = 0) => root.querySelectorAll(".booklet-media-slot")[n]?.querySelector("button.booklet-media-play"),
		players: () => root.querySelectorAll("audio, video, iframe").length,
		plays: () => calls.filter((c) => c[0] === "play"),
		end: () => root.remove(),
	};
	me.redraw();
	return me;
}

const THIS = "![Episode 1](https://media.example.org/u01/e1.m4a)";

test("after 'this note' or 'this vault' the slot she pressed starts by itself when the booklet is drawn again: one request, none before", () => {
	calls.length = 0;
	const v = viewLike(THIS);
	assert.equal(v.players(), 0);
	assert.deepEqual(calls, [], "nothing is requested before the press");
	click(v.play());
	assert.equal(v.asked.length, 1);
	assert.equal(v.players(), 0, "nothing is requested while the card is up");
	assert.deepEqual(calls, []);
	// the choice on the card: told with its press, then the list changes and the booklet is drawn again
	v.asked[0].again({ isTrusted: true });
	assert.deepEqual(calls, [], "the choice itself requests nothing");
	v.allows = { vault: [], notes: { "Course.booklet.md": ["media.example.org"] } };
	v.redraw();
	assert.deepEqual(v.plays(), [["play", "https://media.example.org/u01/e1.m4a"]], "exactly one request, for the slot she pressed");
	assert.equal(v.root.querySelectorAll("audio").length, 1);
	assert.equal(v.play() ?? null, null, "no Play button to press a second time");
	assert.equal(focused.at(-1), v.root.querySelector("audio"));
	v.redraw();
	assert.equal(v.plays().length, 1, "drawn again once more: nothing starts a second time");
	v.end();
});

test("only the slot she pressed starts; a slot that has changed place or address is not started", () => {
	const two = (a, b) => `![One](https://media.example.org/${a}.mp3)\n\n![Two](https://media.example.org/${b}.mp3)`;
	calls.length = 0;
	const v = viewLike(two("a", "b"));
	click(v.play(1));
	v.asked[0].again({ isTrusted: true });
	v.allows = OPEN;
	v.redraw();
	assert.deepEqual(v.plays(), [["play", "https://media.example.org/b.mp3"]], "the second, and not the first");
	assert.ok(v.play(0), "the first still has its Play button");
	v.end();

	// the note changed under her: the nth slot is another address, so nothing is started
	calls.length = 0;
	const w2 = viewLike(two("a", "b"));
	click(w2.play(0));
	w2.asked[0].again({ isTrusted: true });
	w2.allows = OPEN;
	const swapped = two("c", "b");
	w2.drawing.o.unload();
	w2.drawing = draw(swapped, w2.allows, w2.extra, w2.root);
	new PressedSlot().resume(w2.root);
	assert.deepEqual(calls, []);
	w2.end();
});

test("nothing starts when no press chose it: not now, once, an untrusted choice, a slot still not allowed, or too long after", () => {
	// an untrusted choice on the card carries nothing
	calls.length = 0;
	let v = viewLike(THIS, { isPress: (e) => e.isTrusted !== false });
	v.root.querySelector("button").dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
	assert.equal(v.asked.length, 0, "jsdom's own click is not a press under the real rule");
	v.end();

	// not now: the card closes, the list is unchanged, the booklet is drawn again for another reason
	v = viewLike(THIS);
	click(v.play());
	v.redraw();
	assert.equal(v.players(), 0, "she said not now");
	v.end();

	// once plays that piece and carries nothing over a redraw
	v = viewLike(THIS);
	click(v.play());
	v.asked[0].once({ isTrusted: true });
	assert.equal(v.plays().length, 1);
	v.allows = OPEN;
	v.redraw();
	assert.equal(v.plays().length, 1, "the redraw starts nothing more");
	v.end();

	// a choice that is not a press of hers carries nothing (the rule here: only a click is a press)
	calls.length = 0;
	v = viewLike(THIS, { isPress: (e) => e.type === "click" });
	click(v.play());
	v.asked[0].again({ type: "script", isTrusted: false });
	v.allows = OPEN;
	v.redraw();
	assert.deepEqual(calls, []);
	v.end();

	// drawn again before the list changed (still not allowed): it waits for the drawing that is allowed
	calls.length = 0;
	v = viewLike(THIS);
	click(v.play());
	v.asked[0].again({ isTrusted: true });
	v.redraw();
	assert.deepEqual(calls, [], "not allowed in this drawing: not started");
	v.allows = OPEN;
	v.redraw();
	assert.equal(v.plays().length, 1, "started in the drawing that is allowed");
	v.end();

	// too long after the choice: her press no longer counts
	calls.length = 0;
	v = viewLike(THIS);
	click(v.play());
	v.asked[0].again({ isTrusted: true });
	const now = Date.now;
	Date.now = () => now() + 6000;
	try {
		v.allows = OPEN;
		v.redraw();
	} finally {
		Date.now = now;
	}
	assert.deepEqual(calls, []);
	assert.ok(v.play(), "Play is there for her to press");
	v.end();
});

test("a browser that refuses play() after the redraw gives Play back with 'Press Play to start'; pressing it then plays", async () => {
	calls.length = 0;
	const v = viewLike(THIS);
	click(v.play());
	v.asked[0].again({ isTrusted: true });
	v.allows = OPEN;
	const play = proto.play;
	proto.play = function () {
		calls.push(["play", this.getAttribute("src")]);
		return Promise.reject(Object.assign(new Error("gesture"), { name: "NotAllowedError" }));
	};
	try {
		v.redraw();
		await Promise.resolve();
		await Promise.resolve();
	} finally {
		proto.play = play;
	}
	assert.equal(v.root.querySelectorAll("audio").length, 0, "the player is taken out");
	assert.equal(words(v.root.querySelector(".booklet-media-live")), "Press Play to start");
	const again = v.play();
	assert.ok(again, "Play is back");
	assert.equal(w.document.activeElement, again);
	assert.equal(v.root.querySelector(".booklet-media-slot").getAttribute("data-state"), "ready");
	click(again);
	assert.equal(v.root.querySelectorAll("audio").length, 1, "her own press starts it");
	assert.equal(calls.filter((c) => c[0] === "play").length, 2);
	v.end();

	// any other refusal is the player's own business: the error event says it
	calls.length = 0;
	const x = viewLike(THIS);
	click(x.play());
	x.asked[0].again({ isTrusted: true });
	x.allows = OPEN;
	proto.play = () => Promise.reject(Object.assign(new Error("interrupted"), { name: "AbortError" }));
	try {
		x.redraw();
		await Promise.resolve();
		await Promise.resolve();
	} finally {
		proto.play = play;
	}
	assert.equal(x.root.querySelectorAll("audio").length, 1);
	assert.equal(words(x.root.querySelector(".booklet-media-live")), "Loading audio from media.example.org");
	x.end();
});

test("a service slot she pressed starts after the redraw too: YouTube is handed to Obsidian once, Vimeo gets its frame", () => {
	rendered.length = 0;
	let v = viewLike("[Watch](https://youtu.be/abcDEF12345)", {});
	v.allows = NONE;
	v.redraw();
	assert.equal(v.root.querySelectorAll(".booklet-media-slot").length, 0, "a link is a link until the service is allowed");
	v.end();
	v = viewLike("![Watch](https://youtu.be/abcDEF12345)");
	click(v.play());
	assert.deepEqual(rendered, []);
	v.asked[0].again({ isTrusted: true });
	v.allows = { vault: ["youtube.com"], notes: {} };
	v.redraw();
	assert.deepEqual(rendered.map((r) => r[0]), ["![](https://www.youtube.com/watch?v=abcDEF12345)"]);
	v.end();
	v = viewLike("![Talk](https://vimeo.com/123456789)");
	click(v.play());
	v.asked[0].again({ isTrusted: true });
	v.allows = { vault: ["vimeo.com"], notes: {} };
	v.redraw();
	assert.equal(v.root.querySelector("iframe").getAttribute("src"), "https://player.vimeo.com/video/123456789?autoplay=1");
	v.end();
});

/* ---- in the view: nothing remote before a press, the Allow list button, the sites a booklet names ---- */

const NOTE = (extra = "") => `---
booklet: "${core.FORMAT_VERSION}"
title: Media
---

> [!activity|listening] Hear ![the clip](https://media.example.org/c.mp3) now

Intro ![Episode 1](https://media.example.org/u01/e1.m4a "Week 1") and a [Sign in](https://evil.example/login) link.

[Watch the talk](https://youtu.be/abcDEF12345)

<iframe src="https://frames.example.net/p"></iframe>

![Page](https://video.example.org/watch)
${extra}`;

/** The text each piece of Markdown was handed to Obsidian as. */
function recorder() {
	const given = [];
	globalThis.__bookletStubRender = (markdown, el) => {
		given.push(markdown);
		el.appendText(markdown);
	};
	return given;
}

test("view: before any press nothing remote is in the DOM and nothing was handed to Obsidian to fetch, allowed host or not", async () => {
	for (const media of [new MediaAllows(null, () => {}), new MediaAllows({ allowedMediaHosts: ["media.example.org", "youtube.com"] }, () => {}), new MediaAllows({ noteAllows: { "Media.booklet.md": ["media.example.org", "youtube.com", "video.example.org"] } }, () => {})]) {
		const given = recorder();
		const o = openView(NOTE(), { path: "Media.booklet.md", media });
		await o.settled();
		const root = o.view.contentEl;
		assert.deepEqual(remoteSrc(root), []);
		assert.equal(root.querySelectorAll("audio, video, iframe, img, embed, object").length, 0);
		for (const m of given) assert.ok(!/!\[[^\]]*\]\(https?:|<iframe/i.test(m), `Obsidian was handed ${m}`);
		assert.ok(root.querySelectorAll(".booklet-media-slot").length >= 3, "slots are drawn in place");
		assert.equal(words(root.querySelector(".booklet-screentitle")), "Hear the clip now", "in a title the embed is its alt text");
		o.close();
	}
});

test("view: the states of the slots follow the allow list, for the vault and for the note", async () => {
	recorder();
	const states = async (media) => {
		const o = openView(NOTE(), { path: "Media.booklet.md", media });
		await o.settled();
		const out = Array.from(o.view.contentEl.querySelectorAll(".booklet-media-slot")).map((s) => `${s.getAttribute("data-booklet-media")}:${s.getAttribute("data-state")}`);
		o.close();
		return out;
	};
	assert.deepEqual(await states(new MediaAllows(null, () => {})), ["audio:blocked", "link:frame", "link:address"]);
	assert.deepEqual(await states(new MediaAllows({ allowedMediaHosts: ["media.example.org"] }, () => {})), ["audio:ready", "link:frame", "link:address"]);
	assert.deepEqual(await states(new MediaAllows({ noteAllows: { "Other.booklet.md": ["media.example.org"] } }, () => {})), ["audio:blocked", "link:frame", "link:address"], "another note's list does not apply");
	assert.deepEqual(await states(new MediaAllows({ allowedMediaHosts: ["youtube.com"] }, () => {})), ["audio:blocked", "video:ready", "link:frame", "link:address"], "a service link alone on its line is its player once allowed");
});

test("view: a link out whose words are not its address shows its host in prose, and not in a title", async () => {
	recorder();
	globalThis.__bookletStubRender = (markdown, el) => {
		el.appendText(markdown.replace(/\[Sign in\]\(https:\/\/evil\.example\/login\)/, ""));
		if (markdown.includes("Sign in")) {
			const a = el.createEl("a", { cls: "external-link", text: "Sign in", attr: { href: "https://evil.example/login" } });
			a.textContent = "Sign in";
		}
	};
	const o = openView(NOTE(), { path: "Media.booklet.md" });
	await o.settled();
	assert.deepEqual(Array.from(o.view.contentEl.querySelectorAll(".booklet-link-host")).map((h) => h.textContent), [" (evil.example)"]);
	o.close();
	delete globalThis.__bookletStubRender;
});

test("view: Allow list is the first thing on the page; it opens the card and Escape gives the focus back", async () => {
	recorder();
	const o = openView(NOTE(), { path: "Media.booklet.md" });
	await o.settled();
	const bar = o.view.contentEl.querySelector(".booklet-page > .booklet-toolbar");
	assert.ok(bar, "the toolbar comes first on the page");
	assert.equal(bar, o.view.contentEl.querySelector(".booklet-page").firstElementChild);
	const btn = bar.querySelector("button");
	assert.equal(words(btn), "Allow list");
	assert.equal(btn.getAttribute("aria-haspopup"), "dialog");
	assert.equal(w.document.querySelector(".booklet-allow-card"), null);
	click(btn);
	const card = w.document.querySelector(".booklet-allow-card");
	assert.ok(card);
	assert.equal(card.getAttribute("role"), "dialog");
	card.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
	assert.equal(w.document.querySelector(".booklet-allow-card"), null);
	assert.equal(w.document.activeElement, btn, "focus is back on the button");
	o.close();
});

test("view: a booklet that names sites the reader has not allowed opens the card once; not now puts it off; an allow ends the asking", async () => {
	recorder();
	const media = new MediaAllows({ allowedMediaHosts: ["already.example.org"] }, () => {});
	const open = async (path) => {
		const o = openView(NOTE(), { path, media });
		o.view.declaredOrigins = () => ["https://media.example.org", "https://already.example.org", "https://other.example.net:8443", "not an origin"];
		o.view.setViewData(NOTE(), true);
		await o.settled();
		return o;
	};
	let o = await open("Names.booklet.md");
	let card = w.document.querySelector(".booklet-allow-card");
	assert.ok(card, "the card is up");
	assert.equal(words(card.querySelector("h2")), "This booklet plays media from other sites");
	const rows = Array.from(card.querySelectorAll(".booklet-allow-declared")).map((r) => words(r.querySelector("strong")));
	assert.deepEqual(rows, ["media.example.org", "other.example.net:8443"], "the site already on the vault's list is not asked about");
	assert.equal(w.document.activeElement.textContent, "Not now");
	click(Array.from(card.querySelectorAll("button")).find((b) => words(b) === "Not now"));
	assert.equal(w.document.querySelector(".booklet-allow-card"), null);
	o.close();
	// put off: opened again, it does not ask again
	o = await open("Names.booklet.md");
	assert.equal(w.document.querySelector(".booklet-allow-card"), null);
	o.close();
	// another note is asked
	o = await open("Names two.booklet.md");
	card = w.document.querySelector(".booklet-allow-card");
	assert.ok(card);
	click(card.querySelector('button[aria-label="Allow media.example.org for this vault"]'));
	assert.deepEqual(media.vaultList(), ["already.example.org", "media.example.org"]);
	assert.equal(card.querySelector(".booklet-allow-declared strong").textContent, "other.example.net:8443", "the one dealt with is gone from the card");
	click(card.querySelector('button[aria-label="Allow other.example.net:8443 for this note"]'));
	assert.equal(w.document.querySelector(".booklet-allow-card"), null, "every site dealt with: the card closes");
	assert.deepEqual(media.noteList("Names two.booklet.md"), ["other.example.net:8443"]);
	assert.equal(media.noteList("Names.booklet.md").length, 0);
	o.close();
	// the vault's list now holds one of the two; a note with no list of its own is asked about the other only
	o = await open("Names three.booklet.md");
	card = w.document.querySelector(".booklet-allow-card");
	assert.deepEqual(Array.from(card.querySelectorAll(".booklet-allow-declared strong")).map(words), ["other.example.net:8443"]);
	card.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
	o.close();
	// nothing to ask: every site is on the lists
	media.addVault("other.example.net:8443");
	o = await open("Names four.booklet.md");
	assert.equal(w.document.querySelector(".booklet-allow-card"), null);
	o.close();
});

test("view: the preload of Obsidian's own audio is set as soon as it is added to the view", async () => {
	recorder();
	const o = openView(NOTE(), { path: "Media.booklet.md" });
	await o.settled();
	const a = w.document.createElement("audio");
	a.setAttribute("src", "media/local.mp3");
	o.view.contentEl.querySelector(".booklet-page").appendChild(a);
	await new Promise((r) => setTimeout(r, 0));
	assert.equal(a.getAttribute("preload"), "none");
	o.close();
});

test("view: Play on a site not allowed, then 'Allow for this note' on the card: that slot starts once with no second press, and the note keeps the allow", async () => {
	recorder();
	calls.length = 0;
	const media = new MediaAllows(null, () => {});
	const o = openView(NOTE(), { path: "Media.booklet.md", media });
	// jsdom's clicks are never trusted: the view's slots are given a rule that trusts a click, nothing else about them changes
	const real = o.view.mediaDeps.bind(o.view);
	o.view.mediaDeps = () => ({ ...real(), isPress: (e) => e.type === "click" });
	media.onChange(() => o.view.redrawSoon());
	await o.settled();
	const root = o.view.contentEl;
	assert.deepEqual(calls, [], "nothing is requested before the press");
	const first = () => root.querySelectorAll(".booklet-media-slot")[0];
	assert.equal(first().getAttribute("data-state"), "blocked");
	click(first().querySelector("button.booklet-media-play"));
	const card = w.document.querySelector(".booklet-allow-card");
	assert.ok(card, "the card asks");
	assert.deepEqual(calls, [], "nothing while it asks");
	click(Array.from(card.querySelectorAll("button")).find((b) => words(b) === "Allow for this note"));
	await o.settled();
	assert.equal(w.document.querySelector(".booklet-allow-card"), null);
	assert.deepEqual(media.noteList("Media.booklet.md"), ["media.example.org"]);
	assert.deepEqual(calls.filter((c) => c[0] === "play"), [["play", "https://media.example.org/u01/e1.m4a"]], "exactly one request, after the choice");
	assert.equal(first().getAttribute("data-state"), "ready");
	assert.equal(first().querySelectorAll("audio").length, 1);
	assert.equal(first().querySelector("button.booklet-media-play"), null);
	assert.equal(root.querySelectorAll("audio").length, 1, "no other slot started");
	o.close();
	delete globalThis.__bookletStubRender;
});

test("view: 'Allow once' plays that piece with one request and keeps nothing; 'Not now' requests nothing", async () => {
	recorder();
	calls.length = 0;
	const media = new MediaAllows(null, () => {});
	const o = openView(NOTE(), { path: "Media.booklet.md", media });
	const real = o.view.mediaDeps.bind(o.view);
	o.view.mediaDeps = () => ({ ...real(), isPress: (e) => e.type === "click" });
	media.onChange(() => o.view.redrawSoon());
	await o.settled();
	const root = o.view.contentEl;
	click(root.querySelector(".booklet-media-slot button.booklet-media-play"));
	click(Array.from(w.document.querySelectorAll(".booklet-allow-card button")).find((b) => words(b) === "Not now"));
	await o.settled();
	assert.deepEqual(calls, []);
	click(root.querySelector(".booklet-media-slot button.booklet-media-play"));
	click(Array.from(w.document.querySelectorAll(".booklet-allow-card button")).find((b) => words(b) === "Allow once"));
	await o.settled();
	assert.equal(calls.filter((c) => c[0] === "play").length, 1);
	assert.deepEqual(media.vaultList(), []);
	assert.deepEqual(media.noteList("Media.booklet.md"), []);
	o.close();
	delete globalThis.__bookletStubRender;
});
