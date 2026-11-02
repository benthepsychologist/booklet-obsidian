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
	for (const t of ["![p](https://img.example.org/p.png)", "![p](https://img.example.org/p.JPG?x=1)", "![p][r]\n\n[r]: https://img.example.org/p.svg", "![[x.mp3]]", "![[x.mp3|300]]", "![a](media/x.mp3)", "![a](<media/my song.mp3>)", "![a](data:audio/wav;base64,AAAA)", "![a](app://local/x.mp3)", "![a](file:///x.mp3)"]) {
		const g = gateMedia(t, ctx());
		assert.equal(g.text, t, t);
		assert.deepEqual(g.slots, [], t);
	}
});

test("a local audio or video file written as a reference embed becomes the inline form Obsidian plays; inline mode keeps its alt text", () => {
	const cases = [
		["![Tone][l]\n\n[l]: media/x.wav", "![Tone](media/x.wav)\n\n[l]: media/x.wav"],
		["![l][]\n\n[l]: ../x.mp3", "![l](../x.mp3)\n\n[l]: ../x.mp3"],
		["A ![Clip] B\n\n[clip]: clip.webm", "A ![Clip](clip.webm) B\n\n[clip]: clip.webm"],
		["![Song][s]\n\n[s]: <media/my song (1).m4a>", "![Song](<media/my song (1).m4a>)\n\n[s]: <media/my song (1).m4a>"],
		["![Q][q]\n\n[q]: x.WAV?t=3#a", "![Q](x.WAV?t=3#a)\n\n[q]: x.WAV?t=3#a"],
	];
	for (const [from, to] of cases) {
		const g = gateMedia(from, ctx());
		assert.equal(g.text, to, from);
		assert.deepEqual(g.slots, [], from);
		const again = gateMedia(g.text, ctx());
		assert.equal(again.text, g.text, "the inline form is left as it is");
	}
	// a picture or a note through a reference stays Obsidian's, as does the inline form
	for (const t of ["![p][r]\n\n[r]: media/p.png", "![n][r]\n\n[r]: Other note", "![a](media/x.wav)"]) assert.equal(gateMedia(t, ctx()).text, t, t);
	// in a title or an option it is words, as every local media embed is there
	assert.equal(gateMedia("![Tone][l]\n\n[l]: media/x.wav", ctx("inline")).text, "Tone\n\n[l]: media/x.wav");
});

test("an address that is not media is a link naming its host, not an embed; a known service is its player", () => {
	const g = gateMedia("![Watch](https://video.example.org/watch/overview) and ![Tube](https://youtu.be/abcDEF12345)", ctx("block", { vault: ["youtube.com"], notes: {} }));
	assert.deepEqual(g.slots[0], { type: "link", addr: "https://video.example.org/watch/overview", alt: "Watch", host: "video.example.org", why: "address" });
	assert.equal(g.slots[1].type, "service");
	assert.equal(g.slots[1].name, "YouTube");
	assert.equal(g.slots[1].allowed, true);
	assert.equal(g.slots[1].native, "https://www.youtube.com/watch?v=abcDEF12345");
	assert.equal(g.slots[1].embedUrl, null);
	assert.deepEqual(g.slots[1].shown, ["youtube.com", "releases.obsidian.md"]);
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
		"- item\n\n  ```\n  " + url + "\n  ```",
	];
	for (const c of cases) {
		const g = gateMedia(c, ctx());
		assert.equal(g.text, c, c);
		assert.deepEqual(g.slots, [], c);
	}
	// a block of maths that never closes hides nothing from the gate: Obsidian draws what follows it
	assert.equal(gateMedia("$$\nx = 1\n\n" + url, ctx()).slots.length, 1);
	assert.equal(gateMedia("$$\n" + url + "\n$$", ctx()).slots.length, 1, "and media between two $$ lines is gated too");
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

/* ---- what Obsidian 1.14.5 fetches at render, measured (lane B2, spike leaks.js): every one of these loaded before a press without the fixes below ---- */

const A = "media.example.org/tone.wav";
/** Forms of one remote audio address that a browser reads as remote, each of which Obsidian drew and requested at render. */
const DISGUISED = [
	["a character reference in a tag", `<audio src="&#104;ttps://${A}" controls></audio>`],
	["a hex reference", `<audio src="&#x68;ttps://${A}"></audio>`],
	["a number with no semicolon", `<audio src="&#104ttps://${A}"></audio>`],
	["an upper-case reference", `<audio src="&#72;TTPS://${A}"></audio>`],
	["named references", `<audio src="https&colon;&sol;&sol;${A}"></audio>`],
	["a line break inside the address", `<audio src="ht\ntps://${A}"></audio>`],
	["a tab inside the address", `<audio src="ht\ttps://${A}"></audio>`],
	["one slash", `<audio src="https:/${A}"></audio>`],
	["no slash", `<audio src="https:${A}"></audio>`],
	["backslashes", `<audio src="https:\\\\${A}"></audio>`],
	["an upper-case scheme", `<AUDIO SRC="HTTPS://${A}"></AUDIO>`],
	["a video", `<video src="&#104;ttps://media.example.org/clip.webm"></video>`],
	["a source inside", `<audio><source src="&#104;ttps://${A}"></audio>`],
	["a frame", `<iframe src="&#104;ttps://media.example.org/frame.html"></iframe>`],
	["an embed in Markdown, a reference", `![x](&#104;ttps://${A})`],
	["an embed in Markdown, a hex reference", `![x](&#x68;ttps://${A})`],
	["an embed in Markdown, named references", `![x](https&colon;&sol;&sol;${A})`],
	["an embed in Markdown, one slash", `![x](https:/${A})`],
	["an embed in Markdown, no slash", `![x](https:${A})`],
	["an embed in Markdown, three slashes", `![x](https:///${A})`],
	["an embed in Markdown, escaped slashes", `![x](https:\\/\\/${A})`],
	["a reference definition with a reference", `![x][r]\n\n[r]: &#104;ttps://${A}`],
	["a reference definition with one slash", `![x][r]\n\n[r]: https:/${A}`],
	["a first source that is local", `<audio controls><source src="nothing.xyz" type="audio/xyz"><source src="https://${A}"></audio>`],
	["a first source that is a reference", `<audio controls><source src="&#109;edia.xyz" type="audio/xyz"><source src="&#104;ttps://${A}"></audio>`],
	["a raw picture tag that is audio", `<img src="https://${A}">`],
	["a raw picture tag that is audio, a reference", `<img src="&#104;ttps://${A}">`],
	["a raw image tag that is audio", `<image src="https://${A}">`],
];

test("an address is read as a browser reads it: references, line breaks and a scheme with one slash or none are all remote", () => {
	for (const [what, md] of DISGUISED) {
		// (a definition is its own line: it is not wrapped)
		for (const wrap of md.includes("\n[r]:") ? [(x) => x] : [(x) => x, (x) => `> ${x}`, (x) => `- ${x}`, (x) => `Before ${x} after`]) {
			const g = gateMedia(wrap(md), ctx("block", OPEN));
			assert.ok(g.slots.length >= 1, `${what}: ${wrap(md)}`);
			// a definition nothing uses any more is not drawn
			assert.ok(!/example\.|&#|&colon|:\/|https?:/i.test(g.text.replace(/^\[r\]:.*$/gm, "")), `${what} left something for Obsidian: ${g.text}`);
		}
		const inline = gateMedia(md, ctx("inline", OPEN));
		assert.deepEqual(inline.slots, [], what);
		assert.ok(!/:\/|https?:|&#|&colon|<\s*(?:audio|video|source|iframe|img|image|track|embed|object)\b/i.test(inline.text.replace(/^\[r\]:.*$/gm, "")), `${what} in a title left something for Obsidian: ${inline.text}`);
	}
});

test("the address in a slot is the one the browser would have loaded", () => {
	const at = (md) => gateMedia(md, ctx("block", OPEN)).slots[0]?.addr;
	const want = "https://media.example.org/tone.wav";
	for (const md of [`<audio src="&#104;ttps://${A}"></audio>`, `<audio src="ht\ntps://${A}"></audio>`, `<audio src="https:/${A}"></audio>`, `<audio src="https:${A}"></audio>`, `![x](https:/${A})`, `![x](https:${A})`, `![x](https:///${A})`, `![x](&#x68;ttps://${A})`, `![x](https\\:\\/\\/${A})`])
		assert.equal(at(md), want, md);
	// a reference is read once: written twice it is only an address that is not one
	assert.equal(gateMedia(`<audio src="&amp;#104;ttps://${A}"></audio>`, ctx()).slots.length, 0);
	assert.equal(gateMedia(`![x](%68ttps://${A})`, ctx()).slots.length, 0);
	// an unknown named reference is left as it is
	assert.equal(gateMedia(`<audio src="&constructor;https://${A}"></audio>`, ctx()).slots.length, 0);
});

test("a tag with a source of its own plays from it; one without plays from the first of its sources that is remote", () => {
	const two = gateMedia(`<audio controls><source src="a.xyz"><source src="https://${A}"><source src="https://other.example.net/b.mp3"></audio>`, ctx());
	assert.equal(two.slots.length, 1);
	assert.equal(two.slots[0].addr, "https://media.example.org/tone.wav");
	// a browser ignores the sources inside a tag whose own address is local; the gate still takes a remote `source` as a tag of its own (harmless: nothing was going to load)
	assert.equal(gateMedia(`<audio src="local.wav" controls><source src="https://${A}"></audio>`, ctx()).slots.length, 1);
	// all local: left to Obsidian
	const local = '<audio controls><source src="a.mp3"><source src="b.ogg"></audio>';
	assert.equal(gateMedia(local, ctx()).text, local);
});

test("an address Obsidian turns into a frame of its own is never left to it, whatever its ending", () => {
	for (const u of [
		"https://youtu.be/abcDEF12345.png",
		"https://www.youtube.com/watch?v=abcDEF12345.jpg",
		"http://www.youtube.com/watch?v=abcDEF12345.gif",
		"https://m.youtube.com/watch?v=abcDEF12345",
		"https://www.youtube.com/playlist?list=PLabc",
		"https://youtu.be/short",
		"https://twitter.com/someone/status/1234567890",
		"https://x.com/someone/status/1234567890.png",
		"https://mobile.twitter.com/someone/status/1234567890",
	]) {
		for (const allows of [NONE, { vault: ["youtube.com", "twitter.com", "x.com", "youtu.be"], notes: {} }]) {
			const g = gateMedia(`![a](${u}) and <img src="${u}">`, ctx("block", allows));
			assert.equal(g.slots.length, 2, u);
			assert.ok(!/youtu|twitter|x\.com/.test(g.text), `${u} left for Obsidian: ${g.text}`);
			const inline = gateMedia(`![a](${u}) and <img src="${u}">`, ctx("inline", allows));
			assert.ok(!/:\/|<img/.test(inline.text), `${u} in a title: ${inline.text}`);
			assert.deepEqual(inline.slots, [], u);
		}
	}
	// a picture of another site stays a picture
	const pic = "![p](https://img.example.org/p.png) <img src=\"https://img.example.org/q.png\"> ![v](https://notyoutube.com/x.png) ![w](https://box.com/a/1.png)";
	assert.equal(gateMedia(pic, ctx()).text, pic);
});

test("a raw picture tag is gated only when what it loads is audio, video or a frame of Obsidian's: pictures stay Obsidian's", () => {
	for (const same of ['<img src="https://img.example.org/p.png">', '<img src="https://img.example.org/p">', '<img srcset="https://img.example.org/p.png 1x">', '<img src="local.png">', '<img src="media/a.mp3">', '<video src="local.mp4" poster="https://img.example.org/p.png"></video>', '<div style="background:url(https://img.example.org/p.png)">x</div>'])
		assert.equal(gateMedia(same, ctx()).text, same, same);
	const g = gateMedia('<img src="https://media.example.org/a.mp3" alt="A song">', ctx("block", OPEN));
	assert.equal(g.slots[0].type, "media");
	assert.equal(g.slots[0].alt, "A song");
});

test("forms Obsidian does not fetch are left alone or gated harmlessly: a remote wiki embed, a link, frames it strips", () => {
	// `![[https://...]]` draws an empty embed span and requests nothing (spike S1, and B2 again): left to Obsidian in a block, words in a title
	const wiki = "![[https://media.example.org/a.mp3]]";
	assert.equal(gateMedia(wiki, ctx()).text, wiki);
	assert.equal(gateMedia(wiki, ctx("inline")).text, "a.mp3");
	// a plain link and an autolink are links in Obsidian
	const links = "[a](https://media.example.org/a.mp3) and <https://media.example.org/b.mp3> and https://media.example.org/c.mp3";
	assert.equal(gateMedia(links, ctx()).text, links);
	// `<embed>` and `<object>` are stripped by Obsidian; the gate makes them links all the same
	const g = gateMedia('<embed src="https://media.example.org/a.mp3"> <object data="https://media.example.org/b.mp3"></object>', ctx());
	assert.deepEqual(g.slots.map((s) => [s.type, s.why]), [["link", "frame"], ["link", "frame"]]);
	// a frame with a `srcdoc` loads nothing of its own: Obsidian drops the attribute (spike B2)
	const doc = '<iframe srcdoc="x"></iframe>';
	assert.equal(gateMedia(doc, ctx()).text, doc);
});

test("everywhere a piece of the note's Markdown is drawn, the same gate applies: help, prose and openings are block; titles, options, anchors, matrix items and labels are inline", () => {
	// view.ts md() is the one place Markdown reaches Obsidian, and takes the mode with it: the forms above hold in both
	const forms = [`![x](https://${A})`, `<audio src="&#104;ttps://${A}"></audio>`, `<video src="https:/media.example.org/c.webm"></video>`, `<img src="https://${A}">`, `![t](https://twitter.com/a/status/12)`, `<audio><source src="n.xyz"><source src="https://${A}"></audio>`];
	for (const f of forms) {
		for (const mode of ["block", "inline"]) {
			const g = gateMedia(`Some ${f} words\n\n| ${f} | b |\n\n> [!note] ${f}\n> ${f}`, ctx(mode, OPEN));
			assert.ok(!/example\.org\/|twitter|:\/\/|&#/i.test(g.text), `${mode}: ${f} left something: ${g.text}`);
		}
	}
});
