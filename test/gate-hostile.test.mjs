/*
 * The gate on hostile input (src/core/gate.ts): written the way CommonMark and an HTML tokenizer read them, or meant to confuse a reader
 * that reads them another way. Each row is a text that holds a remote audio or video address Obsidian would fetch at render; the gate
 * must leave no slot unmade and no address behind, in a block and in a title, and must stay quick on a note built to be slow.
 * Made-up addresses only (example.org, example.net).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { core } from "./helpers.mjs";

const { gateMedia, slotAllowed, SLOT_OPEN, SLOT_CLOSE } = core;

const NONE = { vault: [], notes: {} };
const ctx = (mode = "block", allows = NONE) => ({ mode, allows, notePath: "Course.booklet.md" });
const tok = (n) => `${SLOT_OPEN}${n}${SLOT_CLOSE}`;
const U = "https://evil.example/a.mp3";

/** What no gated text may still hold: the host and a path, in a form Obsidian could fetch. A definition line that nothing uses is not drawn, and is left out. */
const left = (text) => text.replace(/^(?:> )?\[[^\]]*\]:[ \t]*\r?\n?[ \t]*\S.*$/gm, "").match(/evil\.example\/|<\s*(?:audio|video|source|iframe|embed|object|track)\b/i);

/* ---- 1. raw tags, read as an HTML tokenizer reads them ---- */
const TAGS = [
	["a slash between the tag name and src", `<video/src="${U}" controls>`],
	["no space after a quoted value", `<video title="x"src="${U}">`],
	["no space after a quoted value, a picture", `<img alt="x"src="${U}">`],
	["a slash before src, a picture", `<img/src="${U}">`],
	["src written inside another value", `<video title="a src=x.mp3" src="${U}" controls>`],
	["src after a value with a greater-than sign", `<video title="a > b" src="${U}">`],
	["tabs, line feeds and form feeds between attributes", `<video\tpreload="none"\n\fsrc="${U}">`],
	["an upper-case tag and attribute", `<VIDEO SRC="${U}"></VIDEO>`],
	["a bare value", `<audio src=${U}>`],
	["a bare value with a quote in it", `<audio src=${U}?a"b controls>`],
	["a single-quoted value", `<audio src='${U}'>`],
	["an equals sign and spaces round the value", `<audio src = "${U}">`],
	["an attribute with no value before it", `<audio controls loop src="${U}">`],
	["a second src, the first local", `<video src="local.mp4" src="${U}">`],
	["a data attribute that is not src, then src", `<video data-src="x" src="${U}">`],
	["a tag that never closes", `<video src="${U}" `],
	["a tag that closes much later", `<video src="${U}"\n\nA paragraph in the middle.\n\n>`],
	["an unclosed quote", `<video src="${U}`],
	["a reference in the name of the value", `<video src="&#104;ttps://evil.example/a.mp3">`],
	["a tag in a tag", `<video <audio src="${U}">`],
	["an object's data", `<object data="${U}"></object>`],
	["an object's data, no space", `<object type="x"data="${U}"></object>`],
	["an embed", `<embed/src="${U}">`],
	["an iframe", `<iframe/src="https://evil.example/page"></iframe>`],
	["a source inside a picture with a remote srcset", `<picture><source srcset="${U} 1x"><img src="local.png"></picture>`],
	["a picture's srcset", `<img src="local.png" srcset="local.png 1x, ${U} 2x">`],
	["a srcset with commas and no spaces", `<img srcset="local.png 1x,${U} 2x">`],
	["a video with only a poster", `<video poster="https://evil.example/p.mp3"></video>`],
	["a video with a poster and no source", `<video poster="https://evil.example/p/poster" controls></video>`],
	["a source after a local source", `<audio><source src="x.xyz"><source/src="${U}"></audio>`],
	["a srcdoc holding an audio tag", `<iframe srcdoc="&lt;audio src=&quot;${U}&quot; autoplay&gt;"></iframe>`],
	["a srcdoc holding a tag with no space", `<iframe srcdoc="&lt;audio/src=&quot;${U}&quot;&gt;"></iframe>`],
	["a srcdoc holding a picture", `<iframe srcdoc="&lt;img src=&quot;https://evil.example/p.png&quot;&gt;"></iframe>`],
	["a srcdoc written with numbers", `<iframe srcdoc="&#60;audio src=&#34;${U}&#34;&#62;"></iframe>`],
	["a srcdoc inside a srcdoc", `<iframe srcdoc="&lt;iframe srcdoc=&quot;&amp;lt;audio src=&amp;quot;${U}&amp;quot;&amp;gt;&quot;&gt;&lt;/iframe&gt;"></iframe>`],
	["a srcdoc on a tag that is not a frame", `<audio srcdoc="&lt;audio src=&quot;${U}&quot;&gt;">`],
	["a share on another machine", `<audio src="file://evil.example/a.mp3">`],
];

/* ---- 2. a destination is read raw ---- */
const DESTS = [
	["a code span in the address", "![x](https://evil.example/a`b`.mp3)"],
	["maths in the address", "![x](https://evil.example/a$b$.mp3)"],
	["an html comment in the address", "![x](https://evil.example/a<!--c-->.mp3)"],
	["an obsidian comment in the address", "![x](https://evil.example/a%%c%%.mp3)"],
	["a code span that opens in the address and closes later", "![x](https://evil.example/a`b.mp3) and `c`"],
	["a comment mark in the address with no closer", "![x](https://evil.example/a<!--c.mp3)"],
	["a dollar in the address with no closer", "![x](https://evil.example/a$b.mp3)"],
	["a percent pair in the address with no closer", "![x](https://evil.example/a%%b.mp3)"],
];

/* ---- 3. only ASCII ends an address ---- */
const SPACES = [
	["a no-break space", "![x](https://evil.example/a\u00a0b.mp3)"],
	["an em space", "![x](https://evil.example/a\u2003b.mp3)"],
	["a byte order mark", "![x](https://evil.example/a\uFEFFb.mp3)"],
	["a line separator", "![x](https://evil.example/a\u2028b.mp3)"],
	["an ideographic space", "![x](https://evil.example/a\u3000b.mp3)"],
	["a no-break space before the closing parenthesis", "![x](https://evil.example/a.mp3\u00a0)"],
	["a no-break space in an angle address", "![x](<https://evil.example/a\u00a0b.mp3>)"],
];

/* ---- 4. an escaped delimiter opens nothing ---- */
const ESCAPES = [
	["an escaped backtick pair", "\\`![x](https://evil.example/a.mp3)\\`"],
	["escaped dollars", "costs \\$5 and ![x](https://evil.example/a.mp3) then \\$ more"],
	["an escaped comment mark", "\\<!-- ![x](https://evil.example/a.mp3) -->"],
	["an escaped percent pair", "\\%% ![x](https://evil.example/a.mp3) %%"],
	["a comment that opens in a paragraph and closes in another", "foo <!-- x\n\n![x](https://evil.example/a.mp3)\n\nbar -->"],
	["a percent pair that opens in a paragraph and closes in another", "foo %% x\n\n![x](https://evil.example/a.mp3)\n\nbar %%"],
	["a comment that opens in a quote and closes after an empty quote line", "> foo <!-- x\n>\n> ![x](https://evil.example/a.mp3)\n\nbar -->"],
	["a code span that opens inside a comment", "<!-- `x --> ![x](https://evil.example/a.mp3) y`"],
	["an inline comment that opens inside a code span", "`x <!-- y` ![x](https://evil.example/a.mp3) -->"],
	["a code span whose closer is a run of another length", "`a ``` ![x](https://evil.example/a.mp3) b `` c"],
	["a lone backtick", "it's a ` ![x](https://evil.example/a.mp3) mark"],
	["maths with a space inside its ends", "$ a ![x](https://evil.example/a.mp3) b $"],
	["a price", "it costs $5 and ![x](https://evil.example/a.mp3) is $6"],
	["maths whose brackets are not balanced", "![a $](https://evil.example/a.mp3) [$"],
	["an obsidian comment whose brackets are not balanced", "![a %%](https://evil.example/a.mp3) [ %%"],
	["an html comment whose brackets are not balanced", "![a <!--](https://evil.example/a.mp3) [ -->"],
	["a block comment whose brackets are not balanced", "![a\n<!--\n](https://evil.example/a.mp3) [\n-->"],
	["a raw tag in maths", `$ <video src="${U}"> $`],
	["a raw tag in an obsidian comment", `%% <video src="${U}"> %%`],
	["a raw tag in an obsidian comment block", `%%\n<audio src="${U}">\n%%`],
	["a comment that never closes", "<!-- ![x](https://evil.example/a.mp3)"],
	["a block comment, then an embed on its closing line", "<!-- a\n\nb --> ![x](https://evil.example/a.mp3)"],
	["a fence of four marks inside a comment", "<!--\n```\n-->\n![x](https://evil.example/a.mp3)"],
];

/* ---- 5. a fence is not indented four columns ---- */
const FENCES = [
	["a fence indented four spaces", "    ```\n![x](https://evil.example/a.mp3)"],
	["a fence indented by a tab", "\t```\n![x](https://evil.example/a.mp3)"],
	["a fence indented four spaces and tildes", "    ~~~\n![x](https://evil.example/a.mp3)"],
	["a fence with a backtick in its info", "``` a`b\n![x](https://evil.example/a.mp3)"],
	["a fence whose list item ended", "- item\n  ```\nafter ![x](https://evil.example/a.mp3)"],
	["a fence in a list item that ended, and an unrelated fence after it", "- item\n  ```\nafter ![x](https://evil.example/a.mp3)\n\n```\nmore\n```"],
	["an indented fence with code at the margin, then an embed", "  ```\ncode\n  ```\n![x](https://evil.example/a.mp3)"],
	["an indented fence that never closes", "  ```\n  code\n![x](https://evil.example/a.mp3)"],
	["an embed after a closed fence", "```\ncode\n```\n![x](https://evil.example/a.mp3)"],
];

/* ---- 6. a reference definition may put its address on the next line ---- */
const DEFS = [
	["an address on the next line", "![x][id]\n\n[id]:\n  https://evil.example/a.mp3"],
	["an address on the next line, no indent", "![x][id]\n\n[id]:\nhttps://evil.example/a.mp3"],
	["an address on the next line, windows line endings", "![x][id]\r\n\r\n[id]:\r\n  https://evil.example/a.mp3\r\n"],
	["an angle address on the next line", "![x][id]\n\n[id]:\n  <https://evil.example/a.mp3>"],
	["a label that folds case beyond ASCII", "![x][ẞ]\n\n[SS]: https://evil.example/a.mp3"],
	["a label that folds the other way", "![x][ss]\n\n[ẞ]: https://evil.example/a.mp3"],
	["a label with spaces and line breaks", "![x][a  b]\n\n[A\nB]: https://evil.example/a.mp3"],
	["a definition in a quote", "![x][id]\n\n> [id]: https://evil.example/a.mp3"],
	["a definition with a code span in its address", "![x][id]\n\n[id]: https://evil.example/a`b`.mp3"],
	["a collapsed reference", "![id][]\n\n[id]:\n  https://evil.example/a.mp3"],
	["a shortcut reference", "![id]\n\n[id]:\n  https://evil.example/a.mp3"],
	["a definition with a title on the next line", "![x][id]\n\n[id]: https://evil.example/a.mp3\n  \"title\""],
];

/* ---- 7. a share on another machine ---- */
const FILES = [
	["a file address with a host", "![x](file://evil.example/share/a.mp3)"],
	["a file address with a host, video", "![x](file://evil.example/share/a.mp4)"],
	["a file address with no host and a double slash path", "![x](file:////evil.example/share/a.mp3)"],
	["a file address in upper case", "![x](FILE://evil.example/share/a.mp3)"],
	["a file address by reference", "![x][id]\n\n[id]: file://evil.example/share/a.mp3"],
];

const ALL = [...TAGS, ...DESTS, ...SPACES, ...ESCAPES, ...FENCES, ...DEFS, ...FILES];

test("hostile input: every row leaves a slot, and nothing a browser would fetch is left in the text", () => {
	for (const [what, md] of ALL) {
		const g = gateMedia(md, ctx("block"));
		assert.ok(g.slots.length >= 1, `${what}: no slot for ${JSON.stringify(md)}`);
		assert.equal(left(g.text), null, `${what} left something: ${JSON.stringify(g.text)}`);
		for (const slot of g.slots) assert.ok(slot.host, `${what}: a slot without a host`);
	}
});

test("hostile input: the same rows wrapped in a quote, a list item and a sentence", () => {
	for (const [what, md] of [...TAGS, ...DESTS, ...SPACES, ...FILES]) {
		if (md.includes("\n") || md.includes("\r")) continue;
		for (const wrap of [(x) => `> ${x}`, (x) => `- ${x}`, (x) => `1. ${x}`, (x) => `Before ${x} after`, (x) => `\n\n${x}\n\n`]) {
			const g = gateMedia(wrap(md), ctx("block"));
			assert.ok(g.slots.length >= 1, `${what}: no slot for ${JSON.stringify(wrap(md))}`);
			assert.equal(left(g.text), null, `${what} left something: ${JSON.stringify(g.text)}`);
		}
	}
});

test("hostile input: in a title no media is drawn and nothing is left to fetch", () => {
	for (const [what, md] of ALL) {
		const g = gateMedia(md, ctx("inline"));
		assert.deepEqual(g.slots, [], what);
		assert.equal(left(g.text), null, `${what} in a title left something: ${JSON.stringify(g.text)}`);
	}
});

test("hostile input: the slots hold the address the browser would load, and the allow list decides by the real host", () => {
	const at = (md) => gateMedia(md, ctx("block", { vault: ["evil.example"], notes: {} })).slots[0];
	assert.equal(at("![x](https://evil.example/a`b`.mp3)").addr, "https://evil.example/a%60b%60.mp3");
	assert.equal(at("![x](https://evil.example/a\u00a0b.mp3)").addr, "https://evil.example/a%C2%A0b.mp3");
	assert.equal(at("![x][id]\n\n[id]:\n  https://evil.example/a.mp3").addr, U);
	assert.equal(at(`<video/src="${U}">`).host, "evil.example");
	assert.equal(at(`<iframe srcdoc="&lt;audio src=&quot;${U}&quot;&gt;"></iframe>`).addr, U, "a srcdoc is gated by the address in it");
	assert.equal(at("![x](file://evil.example/share/a.mp3)").type, "refused", "a share can never be allowed");
	assert.equal(at("![x](file://evil.example/share/a.mp3)").host, "evil.example");
	assert.equal(at("![x](file:////evil.example/share/a.mp3)").host, "evil.example");
});

/* ---- what stays Obsidian's, by design ---- */

test("what is left to Obsidian on purpose: a share's picture, a remote picture, a plain link, a local path, code", () => {
	for (const same of [
		"![x](file://evil.example/share/a.png)",
		"![x](file:///C:/media/a.mp3)",
		"![x](file://localhost/media/a.mp3)",
		"![x](https://evil.example/a.png)",
		"[a](https://evil.example/a.mp3)",
		"![x](media/a.mp3)",
		"![x](a`b`.mp3)",
		"`![x](https://evil.example/a.mp3)`",
		"``` \n![x](https://evil.example/a.mp3)\n```",
		"```\n![x](https://evil.example/a.mp3)\n```",
		"  ```\n  ![x](https://evil.example/a.mp3)\n  ```",
		"```\r\n![x](https://evil.example/a.mp3)\r\n```\r\n",
		"~~~\n![x](https://evil.example/a.mp3)\n~~~",
		"````\n```\n![x](https://evil.example/a.mp3)",
		"```\ncode\n~~~\n![x](https://evil.example/a.mp3)",
		"    ![x](https://evil.example/a.mp3)",
		"\t![x](https://evil.example/a.mp3)",
		"<!-- ![x](https://evil.example/a.mp3) -->",
		"<!--\n\n![x](https://evil.example/a.mp3)\n\n-->",
		"<!-->![x](https://evil.example/a.mp3)",
		"foo <!-- ![x](https://evil.example/a.mp3) --> bar",
		"%% ![x](https://evil.example/a.mp3) %%",
		"%%\n\n![x](https://evil.example/a.mp3)\n\n%%",
		"foo `` ` ![x](https://evil.example/a.mp3) ` `` bar",
		"$ ![x](https://evil.example/a.mp3)$",
		"<iframe srcdoc=\"x\"></iframe>",
		"<img src=\"https://evil.example/p.png\">",
		"<video src=\"local.mp4\" poster=\"https://evil.example/p.png\"></video>",
	]) {
		const g = gateMedia(same, ctx("block"));
		if (same.startsWith("<!-->")) {
			assert.equal(g.slots.length, 1, "`<!-->` is a whole comment: what follows it is not in one");
			continue;
		}
		if (same.startsWith("$ ![x]")) {
			assert.equal(g.slots.length, 1, "maths with a space inside its start is not maths");
			continue;
		}
		assert.equal(g.text, same, same);
		assert.deepEqual(g.slots, [], same);
	}
});

test("a destination up to its closing parenthesis, and a title: the shapes CommonMark reads", () => {
	for (const [md, addr] of [
		["![x](https://evil.example/a_(1).mp3)", "https://evil.example/a_(1).mp3"],
		["![x](https://evil.example/a\\(1\\).mp3)", "https://evil.example/a(1).mp3"],
		["![x](  https://evil.example/a.mp3  \"t\"  )", U],
		["![x](https://evil.example/a.mp3\n\"t\")", U],
		["![x](\nhttps://evil.example/a.mp3\n)", U],
		["![x](https://evil.example/a.mp3 'a \\' b')", U],
		["![x](https://evil.example/a.mp3 (a b))", U],
		["![x](<https://evil.example/a b.mp3> \"t\")", "https://evil.example/a%20b.mp3"],
		["![x [y] z](https://evil.example/a.mp3)", U],
		["![x `]` z](https://evil.example/a.mp3)", U],
		["![a **b** c](https://evil.example/a.mp3)", U],
	]) {
		const g = gateMedia(md, ctx());
		assert.equal(g.slots[0]?.addr, addr, md);
		assert.equal(g.text, tok(0), md);
	}
	// not an embed: Obsidian reads these as text
	for (const md of ["![x](https://evil.example/a.mp3 \"t\n\nu\")", "![x](https://evil.example/a.mp3\n\n)", "![x](https://evil.example/a.mp3", "![x](https://evil.example/a.mp3 \"t)", "![x]\n\n(https://evil.example/a.mp3)"]) {
		assert.deepEqual(gateMedia(md, ctx()).slots, [], JSON.stringify(md));
	}
});

/* ---- 8. a service is allowed when every host its player loads from is ---- */

test("a service link on the player's neighbour is not allowed by a list that does not cover the player", () => {
	const text = "![x](https://www.vimeo.com/123456789)";
	const www = gateMedia(text, ctx("block", { vault: ["www.vimeo.com"], notes: {} }));
	assert.equal(www.slots[0].allowed, false, "www.vimeo.com does not cover player.vimeo.com");
	assert.deepEqual(www.slots[0].shown, ["player.vimeo.com"], "the card is told where the player is");
	assert.equal(gateMedia(text, ctx("block", { vault: ["vimeo.com"], notes: {} })).slots[0].allowed, true);
	const yt = "![x](https://www.youtube.com/watch?v=abcDEF12345)";
	assert.equal(gateMedia(yt, ctx("block", { vault: ["www.youtube.com"], notes: {} })).slots[0].allowed, false);
	assert.equal(gateMedia(yt, ctx("block", { vault: ["youtube.com"], notes: {} })).slots[0].allowed, true);
	const sc = "![x](https://www.soundcloud.com/some-artist/some-track)";
	assert.equal(gateMedia(sc, ctx("block", { vault: ["www.soundcloud.com"], notes: {} })).slots[0].allowed, false);
	assert.equal(gateMedia(sc, ctx("block", { vault: [], notes: { "Course.booklet.md": ["soundcloud.com"] } })).slots[0].allowed, true);
	// a link alone on its line becomes a player only once the player's hosts are allowed
	assert.equal(gateMedia("https://www.vimeo.com/123456789", ctx("block", { vault: ["www.vimeo.com"], notes: {} })).slots.length, 0);
	assert.equal(gateMedia("https://www.vimeo.com/123456789", ctx("block", { vault: ["vimeo.com"], notes: {} })).slots.length, 1);
});

test("slotAllowed reads the list as it stands now, not as it stood when the slot was drawn", () => {
	const drawn = gateMedia("![x](https://media.example.org/a.mp3) ![y](https://vimeo.com/123456789)", ctx("block", { vault: ["media.example.org", "vimeo.com"], notes: {} }));
	const [media, service] = drawn.slots;
	assert.equal(media.allowed, true);
	assert.equal(slotAllowed(media, { vault: ["media.example.org"], notes: {} }, "Course.booklet.md"), true);
	assert.equal(slotAllowed(media, NONE, "Course.booklet.md"), false, "she removed the site a moment ago");
	assert.equal(slotAllowed(service, { vault: ["vimeo.com"], notes: {} }, "Course.booklet.md"), true);
	assert.equal(slotAllowed(service, { vault: ["www.vimeo.com"], notes: {} }, "Course.booklet.md"), false);
	assert.equal(slotAllowed(service, NONE, "Course.booklet.md"), false);
});

/* ---- 9. a note built to be slow ---- */

/** Texts of about 120 KB that made the first gate take seconds to minutes; each ends in an embed that must still be found. */
const END = "\n\n![x](https://evil.example/a.mp3)";
const SLOW = {
	"openers with no closer": "![x](".repeat(20000),
	"openers, closed at the end": "![x](".repeat(20000) + ")".repeat(20000),
	"video tags with no end": "<video ".repeat(17000),
	"video tags with a quote": '<video src="'.repeat(10000),
	"video tags that close once": "<video>".repeat(17000) + "</video>",
	"video tags with a source": "<audio src=a>".repeat(9000),
	"frames with a srcdoc": '<iframe srcdoc="'.repeat(7000),
	"brackets": "![x".repeat(40000),
	"brackets, bare": "[".repeat(120000),
	"image marks": "![".repeat(60000),
	"reference marks": "![x][".repeat(24000),
	"angle addresses": "![x](<".repeat(17000),
	"titles with no end": '![x](a "'.repeat(15000),
	"definitions with an angle": "[a]: <\n".repeat(17000),
	"parentheses": "![x](" + "(".repeat(115000),
	"comment openers": "<!-- ".repeat(24000),
	"comment openers, closed after a blank line": "<!-- x\n\n".repeat(15000) + "-->",
	"percent pairs": "%% ".repeat(40000),
	"code spans": "` ``".repeat(30000),
	"backticks": "x" + "`".repeat(120000),
	"dollars": "$a ".repeat(40000),
	"double dollars": "$$ $ ".repeat(24000),
	"backslashes": "\\".repeat(120000),
	"fences": "```\n".repeat(30000),
	"indented fences": "  ```\n x\n".repeat(15000),
	"lines": "a\n".repeat(60000),
	"a long alt": `![${"a".repeat(100000)}](https://evil.example/b.mp3)`,
	"embeds in embeds": "![a ".repeat(6000) + "](https://evil.example/b.mp3)".repeat(6000),
	"links in embeds": "[![a](https://evil.example/b.mp3)](https://evil.example/c)".repeat(2000),
	"references": "&#104;".repeat(20000),
	"many service links on one line": "[a](https://youtu.be/abcDEF12345)".repeat(3600),
	"many service links in a quote": "> [a](https://youtu.be/abcDEF12345)\n".repeat(3600),
};

test("a note built to be slow is gated in well under a second, in a block and in a title, and its embed is still found", () => {
	const allows = { vault: ["youtube.com"], notes: {} };
	for (const [what, base] of Object.entries(SLOW)) {
		const md = base + END;
		for (const mode of ["block", "inline"]) {
			const t0 = performance.now();
			const g = gateMedia(md, ctx(mode, allows));
			const ms = performance.now() - t0;
			assert.ok(ms < 1000, `${what} (${mode}): ${md.length} characters took ${ms.toFixed(0)} ms`);
			if (mode === "block") assert.ok(g.slots.length >= 1 && g.slots.some((s) => s.addr === U || s.host === "evil.example"), `${what}: the embed at the end was not found`);
		}
	}
});
