/*
 * The gate (src/core/gate.ts): every remote media form is swapped, before Obsidian draws it, for a token or for words, so that nothing
 * remote is left for Obsidian to fetch. Made-up addresses only (example.org, example.net).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { core } from "./helpers.mjs";

const { gateMedia, SLOT_OPEN, SLOT_CLOSE } = core;

const NONE = { vault: [], notes: {} };
const OPEN = { vault: ["media.example.org"], notes: {} };
const ctx = (mode = "block", allows = NONE) => ({ mode, allows, notePath: "Course.booklet.md" });
const tok = (n) => `${SLOT_OPEN}${n}${SLOT_CLOSE}`;
/** A remote address no gated text may still hold in a form Obsidian would fetch: an embed, a raw media tag. */
const FETCHES = /!\[[^\]]*\]\([^)]*https?:\/\/|<(?:iframe|frame|object|embed|audio|video|source|track)\b[^>]*(?:src|data)\s*=\s*["']?(?:https?:)?\/\//i;

test("an inline embed of remote audio or video is a token, and its slot says what it is and whether it is allowed", () => {
	const g = gateMedia('Hear ![Episode 1](https://media.example.org/u01/e1.m4a "Week 1") now.', ctx("block", OPEN));
	assert.equal(g.text, `Hear ${tok(0)} now.`);
	assert.deepEqual(g.slots, [{ type: "media", media: "audio", addr: "https://media.example.org/u01/e1.m4a", alt: "Episode 1", host: "media.example.org", entry: "media.example.org", allowed: true }]);
	const blocked = gateMedia("![Clip](https://other.example.net/c.mp4)", ctx());
	assert.equal(blocked.text, tok(0));
	assert.equal(blocked.slots[0].type, "media");
	assert.equal(blocked.slots[0].media, "video");
	assert.equal(blocked.slots[0].allowed, false);
	assert.equal(blocked.slots[0].entry, "other.example.net");
});

test("each extension class, in any case, and a query or a fragment after it", () => {
	for (const [file, media] of [["a.MP3", "audio"], ["a.opus?x=1", "audio"], ["a.wav#t=3", "audio"], ["a.flac", "audio"], ["a.WebM", "video"], ["a.mov", "video"], ["a.mkv", "video"]]) {
		const g = gateMedia(`![x](https://media.example.org/${file})`, ctx());
		assert.equal(g.slots[0]?.media, media, file);
		assert.ok(!FETCHES.test(g.text), file);
	}
});

test("reference forms resolve through the definitions the text carries: ![alt][id], ![id][] and ![id]", () => {
	const defs = "\n\n[lec]: https://media.example.org/lec.mp3\n[two]: <https://media.example.org/two.mp4> \"Caption\"\n[Three Words]: https://media.example.org/three.wav";
	const g = gateMedia(`A ![Lecture][lec] B ![two][] C ![Three Words] D${defs}`, ctx("block", OPEN));
	assert.equal(g.text.split("\n\n")[0], `A ${tok(0)} B ${tok(1)} C ${tok(2)} D`);
	assert.deepEqual(g.slots.map((s) => [s.media, s.alt, s.addr]), [
		["audio", "Lecture", "https://media.example.org/lec.mp3"],
		["video", "two", "https://media.example.org/two.mp4"],
		["audio", "Three Words", "https://media.example.org/three.wav"],
	]);
	assert.ok(g.text.endsWith(defs), "the definitions are left as they were");
	// labels are matched without regard to case or spacing, and the first definition of a label wins
	const h = gateMedia("![X  Y]\n\n[x y]: https://media.example.org/first.mp3\n[x y]: https://media.example.org/second.mp3", ctx());
	assert.equal(h.slots[0].addr, "https://media.example.org/first.mp3");
	// no definition: nothing to gate, and the text is as it was
	const none = gateMedia("![nothing here][zzz] and ![nope]", ctx());
	assert.equal(none.text, "![nothing here][zzz] and ![nope]");
	assert.deepEqual(none.slots, []);
});

test("a remote image stays Obsidian's; a local embed stays Obsidian's in a block", () => {
	for (const t of ["![p](https://img.example.org/p.png)", "![p](https://img.example.org/p.JPG?x=1)", "![p][r]\n\n[r]: https://img.example.org/p.svg", "![[x.mp3]]", "![[x.mp3|300]]", "![a](media/x.mp3)", "![a](<media/my song.mp3>)", "![a][l]\n\n[l]: media/x.mp3", "![a](data:audio/wav;base64,AAAA)", "![a](app://local/x.mp3)", "![a](file:///x.mp3)"]) {
		const g = gateMedia(t, ctx());
		assert.equal(g.text, t, t);
		assert.deepEqual(g.slots, [], t);
	}
});

test("an address that is not media is a link naming its host, not an embed; a known service is its player", () => {
	const g = gateMedia("![Watch](https://video.example.org/watch/overview) and ![Tube](https://youtu.be/abcDEF12345)", ctx("block", { vault: ["youtube.com"], notes: {} }));
	assert.deepEqual(g.slots[0], { type: "link", addr: "https://video.example.org/watch/overview", alt: "Watch", host: "video.example.org", why: "address" });
	assert.equal(g.slots[1].type, "service");
	assert.equal(g.slots[1].name, "YouTube");
	assert.equal(g.slots[1].allowed, true);
	assert.equal(g.slots[1].embedUrl, "https://www.youtube-nocookie.com/embed/abcDEF12345?autoplay=1&rel=0");
	assert.equal(g.slots[1].entry, "youtube.com");
	assert.equal(g.slots[1].alt, "Tube");
	const no = gateMedia("![Tube](https://youtu.be/abcDEF12345)", ctx());
	assert.equal(no.slots[0].type, "service");
	assert.equal(no.slots[0].allowed, false, "a service not allowed asks first");
	assert.ok(!no.text.includes("youtu.be"));
});

test("http, protocol-relative and other addresses can never be played: audio is refused, anything else is a link", () => {
	const g = gateMedia("![A](http://media.example.org/a.mp3) ![B](//media.example.org/b.mp4) ![C](http://media.example.org/page)", ctx("block", OPEN));
	assert.deepEqual(g.slots.map((s) => [s.type, s.host]), [["refused", "media.example.org"], ["refused", "media.example.org"], ["link", "media.example.org"]]);
	assert.ok(!FETCHES.test(g.text));
});

test("a link, an autolink or a bare address alone on its line becomes a service's player once the service is allowed", () => {
	const yt = { vault: ["youtube.com"], notes: {} };
	const text = "[Watch the talk](https://youtu.be/abcDEF12345)\n\n<https://www.youtube.com/watch?v=abcDEF12345>\n\nhttps://vimeo.com/123456789\n\n> - [In a list](https://youtu.be/abcDEF12345)";
	const open = gateMedia(text, ctx("block", { vault: ["youtube.com", "vimeo.com"], notes: {} }));
	assert.equal(open.text, `${tok(0)}\n\n${tok(1)}\n\n${tok(2)}\n\n> - ${tok(3)}`);
	assert.deepEqual(open.slots.map((s) => [s.type, s.name, s.alt]), [["service", "YouTube", "Watch the talk"], ["service", "YouTube", "YouTube"], ["service", "Vimeo", "Vimeo"], ["service", "YouTube", "In a list"]]);
	// not allowed: the link is left as a link
	assert.equal(gateMedia(text, ctx()).text, text);
	assert.equal(gateMedia(text, ctx("block", yt)).text.includes("vimeo.com"), true, "Vimeo is not allowed by youtube.com");
	// not alone: a link in a sentence stays a link
	const inline = "See [the talk](https://youtu.be/abcDEF12345) for more.";
	assert.equal(gateMedia(inline, ctx("block", yt)).text, inline);
	// a link that is not a service is never a slot
	const other = "[Notes](https://notes.example.org/x)";
	assert.equal(gateMedia(other, ctx("block", OPEN)).text, other);
});

test("raw tags that carry a remote address become links naming the host; none is left to load", () => {
	const t = [
		'<iframe src="https://frames.example.net/p" width="300"></iframe>',
		'<audio controls><source src="https://media.example.org/a.mp3" type="audio/mpeg"></audio>',
		'<video src="//media.example.org/v.mp4" controls></video>',
		'<embed src="https://frames.example.net/e.swf">',
		'<object data="https://frames.example.net/o"></object>',
		'<source src="https://media.example.org/s.ogg">',
		"<track src='https://media.example.org/t.vtt'>",
		'<IFRAME SRC="https://frames.example.net/upper"></IFRAME>',
		'<iframe data-src="https://frames.example.net/lazy" src=https://frames.example.net/bare></iframe>',
	].join("\n\n");
	const g = gateMedia(t, ctx("block", OPEN));
	assert.equal(g.slots.length, 9);
	assert.ok(g.slots.every((s) => s.type === "link" && s.why === "frame"));
	assert.deepEqual(g.slots.map((s) => s.host), ["frames.example.net", "media.example.org", "media.example.org", "frames.example.net", "frames.example.net", "media.example.org", "media.example.org", "frames.example.net", "frames.example.net"]);
	assert.equal(g.text, [0, 1, 2, 3, 4, 5, 6, 7, 8].map(tok).join("\n\n"));
	assert.equal(g.slots[8].addr, "https://frames.example.net/bare", "data-src is not src");
	// a tag with a local address, or none, is left to Obsidian
	for (const same of ['<audio controls src="media/x.mp3"></audio>', "<audio controls></audio>", '<iframe srcdoc="x"></iframe>', '<img src="https://img.example.org/p.png">']) assert.equal(gateMedia(same, ctx()).text, same, same);
});

test("a multi-line raw tag is one slot; the text around it is untouched", () => {
	const t = 'Before\n\n<iframe\n  src="https://frames.example.net/p"\n  title="A page"\n></iframe>\n\nAfter';
	const g = gateMedia(t, ctx());
	assert.equal(g.text, `Before\n\n${tok(0)}\n\nAfter`);
	assert.equal(g.slots[0].alt, "A page");
});

test("code fences, code spans, maths and comments are left alone", () => {
	const url = "![x](https://media.example.org/a.mp3)";
	const frame = '<iframe src="https://frames.example.net/p"></iframe>';
	const cases = [
		"```\n" + url + "\n" + frame + "\n```",
		"~~~md\n" + url + "\n~~~",
		"    " + url,
		"Inline `" + url + "` code and ``" + frame + "`` more.",
		"<!-- " + url + " -->",
		"%% " + url + " %%",
		"<!--\n" + url + "\n" + frame + "\n-->",
		"%%\n" + url + "\n%%",
		"$$\n" + url + "\n$$",
		"- item\n\n  ```\n  " + url + "\n  ```",
	];
	for (const c of cases) {
		const g = gateMedia(c, ctx());
		assert.equal(g.text, c, c);
		assert.deepEqual(g.slots, [], c);
	}
	// after the code, the same embed is gated
	const g = gateMedia("```\n" + url + "\n```\n\n" + url + "\n\n`" + url + "` and " + url, ctx());
	assert.equal(g.slots.length, 2);
	assert.equal(g.text, "```\n" + url + "\n```\n\n" + tok(0) + "\n\n`" + url + "` and " + tok(1));
	// an unclosed comment is not trusted: media in it is gated all the same
	assert.equal(gateMedia("<!-- " + url, ctx()).slots.length, 1);
	assert.equal(gateMedia("%% " + url, ctx()).slots.length, 1);
	// a definition in code is no definition
	assert.equal(gateMedia("![alt][r]\n\n```\n[r]: https://media.example.org/a.mp3\n```", ctx()).slots.length, 0);
});

test("titles, destinations and alt text in their many shapes", () => {
	for (const [t, addr, alt] of [
		['![a](https://media.example.org/a.mp3 "title")', "https://media.example.org/a.mp3", "a"],
		["![a](https://media.example.org/a.mp3 'title')", "https://media.example.org/a.mp3", "a"],
		["![a](https://media.example.org/a.mp3 (title))", "https://media.example.org/a.mp3", "a"],
		["![a](<https://media.example.org/a b.mp3>)", "https://media.example.org/a%20b.mp3", "a"],
		["![a]( https://media.example.org/a.mp3 )", "https://media.example.org/a.mp3", "a"],
		["![a](https://media.example.org/a_(1).mp3)", "https://media.example.org/a_(1).mp3", "a"],
		["![a [b] c](https://media.example.org/a.mp3)", "https://media.example.org/a.mp3", "a b c"],
		["![**Bold** name|300](https://media.example.org/a.mp3)", "https://media.example.org/a.mp3", "Bold name"],
		["![](https://media.example.org/a.mp3)", "https://media.example.org/a.mp3", ""],
		["![a](https://media.example.org/a.mp3?x=1&amp;y=2)", "https://media.example.org/a.mp3?x=1&y=2", "a"],
		["![a](https://MEDIA.example.org/a.mp3)", "https://media.example.org/a.mp3", "a"],
	]) {
		const g = gateMedia(t, ctx());
		assert.equal(g.slots.length, 1, t);
		assert.equal(g.slots[0].addr, addr, t);
		assert.equal(g.slots[0].alt, alt, t);
		assert.equal(g.text, tok(0), t);
	}
	// malformed targets are left to Obsidian
	for (const t of ["![a](https://media.example.org/a.mp3", "![a(https://media.example.org/a.mp3)", "![a]()", "![a](https://)", "![a](https://media.example.org/a.mp3 \"unclosed)"]) {
		const g = gateMedia(t, ctx());
		assert.equal(g.text, t, t);
		assert.equal(g.slots.length, 0, t);
	}
});

test("inline mode: a media embed is its alt text, and no request is possible", () => {
	const t = [
		"![Ep one](https://media.example.org/a.mp3)",
		"![](https://media.example.org/b.mp4)",
		"![Tube](https://youtu.be/abcDEF12345)",
		"![Page](https://video.example.org/watch)",
		"![Local one](media/c.mp3)",
		"![[lecture.mp3]]",
		"![[sub/lecture two.mp4|300]]",
		"![A][r]",
		'<iframe src="https://frames.example.net/p"></iframe>',
		"![Pic](https://img.example.org/p.png)",
		"![[pic.png]]",
		"[Watch](https://youtu.be/abcDEF12345)",
		"\n\n[r]: https://media.example.org/r.wav",
	].join(" ");
	const g = gateMedia(t, ctx("inline", { vault: ["youtube.com", "media.example.org"], notes: {} }));
	assert.deepEqual(g.slots, []);
	assert.equal(
		g.text,
		[
			"Ep one",
			"b.mp4",
			"Tube",
			"Page",
			"Local one",
			"lecture.mp3",
			"lecture two.mp4",
			"A",
			"frames.example.net",
			"![Pic](https://img.example.org/p.png)",
			"![[pic.png]]",
			"[Watch](https://youtu.be/abcDEF12345)",
			"\n\n[r]: https://media.example.org/r.wav",
		].join(" "),
	);
	assert.ok(!SLOT_OPEN || !g.text.includes(SLOT_OPEN));
	// the alt text goes back into Markdown as words
	assert.equal(gateMedia("![a_b *c* #1](https://media.example.org/a.mp3)", ctx("inline")).text, "a\\_b c \\#1");
});

test("a token already in the text is dropped, so a note cannot name a slot", () => {
	const g = gateMedia(`${SLOT_OPEN}0${SLOT_CLOSE} and ![a](https://media.example.org/a.mp3)`, ctx());
	assert.equal(g.text, `0 and ${tok(0)}`);
});

test("text with nothing to gate is handed back as it is, and so is a nested embed in a link", () => {
	const plain = "Just words, a [link](https://notes.example.org/x) and a [^1] mark.\n\n- [ ] a task";
	assert.deepEqual(gateMedia(plain, ctx()), { text: plain, slots: [] });
	const g = gateMedia("[![a](https://media.example.org/a.mp3)](https://notes.example.org/x)", ctx());
	assert.equal(g.slots.length, 1);
	assert.equal(g.text, `[${tok(0)}](https://notes.example.org/x)`);
});

test("windows line endings and a callout's quote marks do not hide an embed", () => {
	const g = gateMedia("Intro\r\n\r\n> ![a](https://media.example.org/a.mp3)\r\n> more\r\n", ctx());
	assert.equal(g.text, `Intro\r\n\r\n> ${tok(0)}\r\n> more\r\n`);
});

test("in a block, no remote media address is left in the text for Obsidian to fetch, whatever the form and whatever is allowed", () => {
	const forms = [
		"![a](https://media.example.org/a.mp3)",
		"![a](https://media.example.org/a.mp3 \"t\")",
		"![a][r1]",
		"![r1][]",
		"![r1]",
		"![a](https://other.example.net/b.mp4)",
		"![a](https://other.example.net/page)",
		"![a](http://other.example.net/b.mp4)",
		"![a](//other.example.net/b.mp4)",
		"![a](https://youtu.be/abcDEF12345)",
		'<iframe src="https://other.example.net/f"></iframe>',
		'<audio src="https://other.example.net/a.mp3"></audio>',
		'<video controls><source src="https://other.example.net/a.mp4"></video>',
		'<embed src="https://other.example.net/a">',
		'<object data="https://other.example.net/o"></object>',
	];
	const defs = "\n\n[r1]: https://media.example.org/r.mp3";
	for (const allows of [NONE, OPEN, { vault: ["example.net", "youtube.com"], notes: {} }, { vault: [], notes: { "Course.booklet.md": ["media.example.org", "other.example.net"] } }]) {
		for (const f of forms) {
			for (const wrap of [(x) => x, (x) => `> ${x}`, (x) => `- ${x}`, (x) => `Before ${x} after`]) {
				const g = gateMedia(wrap(f) + defs, ctx("block", allows));
				const body = g.text.slice(0, g.text.length - defs.length);
				assert.ok(g.text.endsWith(defs));
				assert.ok(!/example\.|youtu/.test(body), `${wrap(f)} left an address: ${body}`);
				assert.ok(g.slots.length >= 1, wrap(f));
			}
		}
	}
});
