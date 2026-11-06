/*
 * `media-from` (SPEC section 2): what the front matter declares as the origins a booklet's hosted media comes from. One value, several
 * separated by commas, or a YAML list; each an `https:` origin and nothing after it. A value that is not one is reported in the opening
 * notice and ignored, and the other origins still count. A declaration allows nothing, so nothing here depends on it. Also the raw frame
 * and media tags the notice names among the note's problems. Made-up hosts only.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { core } from "./helpers.mjs";

const head = (...lines) => ["---", 'booklet: "0.19"', "id: made/up", "title: Made up", "lang: en", ...lines, "---"];
/** `mediaFromOf` takes the lines between the two `---` lines, as the reader gives it. */
const of = (...lines) => core.mediaFromOf(head(...lines).slice(1, -1));
const BODY = "\n> [!activity|a] A\n\n> [!text|t] T\n";
const book = (...lines) => core.parseBooklet(head(...lines).join("\n") + "\n" + BODY);

test("one value, a comma list and a YAML list each give their origins, in the order written", () => {
	assert.deepEqual(of("media-from: https://media.example.org").origins, ["https://media.example.org"]);
	assert.deepEqual(of("media-from: https://media.example.org, https://cdn.example.net:8443").origins, ["https://media.example.org", "https://cdn.example.net:8443"]);
	assert.deepEqual(of("media-from: https://media.example.org,https://cdn.example.net").origins, ["https://media.example.org", "https://cdn.example.net"], "no space after the comma");
	assert.deepEqual(of("media-from:", "  - https://media.example.org", "  - https://cdn.example.net:8443").origins, ["https://media.example.org", "https://cdn.example.net:8443"]);
	assert.deepEqual(of("media-from:", "- https://media.example.org", "- https://cdn.example.net").origins, ["https://media.example.org", "https://cdn.example.net"], "a list not indented");
	assert.deepEqual(of('media-from: "https://media.example.org"').origins, ["https://media.example.org"], "double quotes");
	assert.deepEqual(of("media-from: 'https://media.example.org'").origins, ["https://media.example.org"], "single quotes");
	assert.deepEqual(of("media-from:", '  - "https://media.example.org"', "  - 'https://cdn.example.net'").origins, ["https://media.example.org", "https://cdn.example.net"], "quoted items");
	// all of it comes back with nothing bad
	assert.deepEqual(of("media-from: https://media.example.org, https://cdn.example.net:8443").bad, []);
});

test("a trailing slash is accepted and taken off; the host is lower case; a usual port goes; an origin is listed once", () => {
	assert.deepEqual(of("media-from: https://media.example.org/").origins, ["https://media.example.org"]);
	assert.deepEqual(of("media-from: HTTPS://Media.Example.ORG").origins, ["https://media.example.org"]);
	assert.deepEqual(of("media-from: https://media.example.org:443").origins, ["https://media.example.org"]);
	assert.deepEqual(of("media-from: https://media.example.org:8443/").origins, ["https://media.example.org:8443"]);
	assert.deepEqual(of("media-from: https://media.example.org, https://media.example.org/").origins, ["https://media.example.org"]);
	assert.deepEqual(of("media-from: https://127.0.0.1:8443").origins, ["https://127.0.0.1:8443"]);
});

test("a value that is not an origin is bad, with its line and its text, and the others still count", () => {
	const m = of("media-from:", "  - https://media.example.org", "  - http://insecure.example.org", "  - https://cdn.example.net/path/", "  - https://cdn.example.net:8443");
	assert.deepEqual(m.origins, ["https://media.example.org", "https://cdn.example.net:8443"]);
	// `media-from:` is line 6 of the file, so its items are lines 7 to 10
	assert.deepEqual(m.bad, [{ line: 8, text: "http://insecure.example.org" }, { line: 9, text: "https://cdn.example.net/path/" }]);
	const inline = of("media-from: https://media.example.org, ftp://old.example.org");
	assert.deepEqual([inline.origins, inline.bad], [["https://media.example.org"], [{ line: 6, text: "ftp://old.example.org" }]]);
	for (const bad of [
		"http://media.example.org",
		"//media.example.org",
		"media.example.org",
		"https://media.example.org/u01",
		"https://media.example.org/u01/",
		"https://media.example.org?x=1",
		"https://media.example.org/?x=1",
		"https://media.example.org#top",
		"https://user@media.example.org",
		"https://user:pass@media.example.org",
		"https://*.example.org",
		"https://media.*",
		"https://media.example.org:",
		"https://media example.org",
		"https://",
		"https:///",
		"data:text/plain",
		"javascript:alert(1)",
	]) {
		const r = of(`media-from: ${bad}`);
		assert.deepEqual([r.origins, r.bad.length], [[], 1], bad);
		assert.equal(r.bad[0].text, bad);
	}
});

test("a missing key, an empty value and an empty list declare nothing and are not bad", () => {
	assert.deepEqual(core.mediaFromOf(null), { origins: [], bad: [] });
	assert.deepEqual(of(), { origins: [], bad: [] });
	assert.deepEqual(of("media-from:"), { origins: [], bad: [] });
	assert.deepEqual(of("media-from: "), { origins: [], bad: [] });
	assert.deepEqual(of('media-from: ""'), { origins: [], bad: [] });
	assert.deepEqual(of("media-from:", "  -", "  - "), { origins: [], bad: [] });
	// the list stops at the next key; a comment between is skipped
	assert.deepEqual(of("media-from:", "  # the hosts", "  - https://media.example.org", "start: home", "  - https://not.example.org"), { origins: ["https://media.example.org"], bad: [] });
	// a comment after the value
	assert.deepEqual(of("media-from: https://media.example.org # the host").origins, ["https://media.example.org"]);
	// a key that only starts like it
	assert.deepEqual(of("media-from-x: https://media.example.org"), { origins: [], bad: [] });
});

test("the booklet carries the declared origins, and a malformed value is listed in the notice (a mistake, no 'To update') and ignored", () => {
	assert.deepEqual(book("media-from:", "  - https://media.example.org", "  - https://cdn.example.net:8443").mediaFrom, ["https://media.example.org", "https://cdn.example.net:8443"]);
	assert.deepEqual(book().mediaFrom, []);
	const b = book("media-from:", "  - https://media.example.org", "  - http://insecure.example.org");
	assert.deepEqual(b.mediaFrom, ["https://media.example.org"]);
	assert.deepEqual(b.unread.map((u) => [u.line, u.text, u.why, u.newer]), [
		[8, "- http://insecure.example.org", '`media-from` holds "http://insecure.example.org", which is not an origin (https:, a host and a port if it is not the usual one, nothing after it), so it was ignored', false],
	]);
	const n = core.openingNotice(b, "0.12.0");
	assert.equal(n.count, 1);
	assert.deepEqual(n.entries, [
		'Line 8: - http://insecure.example.org (`media-from` holds "http://insecure.example.org", which is not an origin (https:, a host and a port if it is not the usual one, nothing after it), so it was ignored)',
	]);
	assert.equal(n.paragraphs.some((p) => /To update|newer version/.test(p)), false, "a mistake in the file is not mended by updating");
	// on one line, the notice shows the line as written
	const one = book("media-from: https://media.example.org, https://x.example.org/path");
	assert.deepEqual(one.mediaFrom, ["https://media.example.org"]);
	assert.equal(one.unread[0].line, 6);
	assert.equal(one.unread[0].text, "media-from: https://media.example.org, https://x.example.org/path");
	// a note that declares well says nothing
	assert.equal(core.openingNotice(book("media-from: https://media.example.org"), "0.12.0"), null);
});

test("a declaration is only read: the note's bytes and the writer do not depend on it", () => {
	const text = head("media-from:", "  - https://media.example.org").join("\n") + "\n" + BODY;
	const next = core.setAnswer(text, "", "t", "words");
	assert.ok(next.startsWith(text), "the front matter and the design are the bytes they were");
	assert.deepEqual(core.parseBooklet(next).mediaFrom, ["https://media.example.org"]);
});

/* ---- a raw frame or media tag ---- */

const lineOf = (text, needle) => text.split("\n").findIndex((l) => l.includes(needle)) + 1;

test("a raw iframe, frame, object, embed, audio or video tag is named among the problems, with its line: drawn as a link, nothing loads", () => {
	const text = [
		...head(),
		"",
		"> [!activity|a] A",
		"",
		'<iframe src="https://example.org/x"></iframe>',
		'Words <video controls src="https://example.org/v.mp4"></video> and <AUDIO src="a.mp3"></AUDIO>.',
		'<frame src="x"> <object data="y"></object> <embed src="z">',
		'<iframe src="https://example.org/again"></iframe><iframe src="https://example.org/twice"></iframe>',
		"",
	].join("\n");
	const b = core.parseBooklet(text);
	const say = (n, tag) => `Line ${n}: a raw \`<${tag}>\` tag is drawn as a link in this view; nothing loads.`;
	assert.deepEqual(b.problems, [
		say(lineOf(text, "<iframe src=\"https://example.org/x\">"), "iframe"),
		say(lineOf(text, "Words <video"), "video"),
		say(lineOf(text, "Words <video"), "audio"),
		say(lineOf(text, "<frame"), "frame"),
		say(lineOf(text, "<frame"), "object"),
		say(lineOf(text, "<frame"), "embed"),
		say(lineOf(text, "again"), "iframe"),
	]);
	assert.deepEqual(b.unread, [], "among the note's problems, not the list of what a newer plugin may read");
	assert.equal(core.openingNotice(b, "0.12.0"), null, "no notice of its own either: the problems are listed");
});

test("a raw tag in code, in a comment or in the records is not said; a tag name that only starts like one is not one", () => {
	const text = [
		...head(),
		"",
		"> [!activity|a] A",
		"",
		"A code span `<iframe src=x>` and a fence:",
		"",
		"```html",
		"<video src=x></video>",
		"```",
		"",
		"<!-- <iframe src=x> -->",
		"<!--",
		"<audio src=x>",
		"-->",
		"<iframes> <videos> <audiobook> <objects> <embedded> <framework>",
		"",
		"%%",
		core.RECORDS_HEADER,
		"",
		"```booklet answers",
		'{"t": "<iframe src=x>"}',
		"```",
		"%%",
		"",
	].join("\n");
	assert.deepEqual(core.parseBooklet(text).problems, []);
	// but a tag after a comment on the same line is
	const after = [...head(), "", "> [!activity|a] A", "", "<!-- note --> <video src=x></video>", ""].join("\n");
	assert.equal(core.parseBooklet(after).problems.length, 1);
	// and CRLF changes nothing
	assert.equal(core.parseBooklet(after.replace(/\n/g, "\r\n")).problems.length, 1);
});
