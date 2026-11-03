/*
 * An address on the reader's own machine is local (plan 1.0.0, C-079; Ben: "localhost is local, not treated as remote"). `isLoopback`
 * says yes only to the host `localhost`, an IPv4 address of 127.0.0.0/8 and IPv6 `::1`, written in
 * those forms, over http or https, with any port. The gate leaves such a media embed to Obsidian's own player (no slot, no asking),
 * as it leaves a vault file; anything else stays remote and gated. Made-up addresses only (example.org, example.net, evil.example).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { core } from "./helpers.mjs";

const { gateMedia, isLoopback, SLOT_OPEN, SLOT_CLOSE } = core;
const ctx = (mode = "block") => ({ mode, allows: { vault: [], notes: {} }, notePath: "Course.booklet.md" });

const LOOPBACK = [
	"http://localhost/a.mp3",
	"https://localhost/a.mp3",
	"http://localhost:8080/a.mp3",
	"http://localhost:0/a.mp3",
	"http://localhost",
	"http://localhost?x=1",
	"http://localhost#x",
	"HTTP://LOCALHOST/a.mp3",
	"http://LocalHost:3000/a.mp3",
	"http://127.0.0.1/a.mp3",
	"https://127.0.0.1:8443/a.mp3",
	"http://127.1.2.3/a.mp3",
	"http://127.255.255.255/a.mp3",
	"http://[::1]/a.mp3",
	"http://[::1]:8080/a.mp3",
	"https://[::1]/a.mp3",
	"  http://localhost/a.mp3  ",
];

const REMOTE = [
	// names that merely hold the word, userinfo and fragments that try to say it
	["localhost as the start of another name", "http://localhost.evil.example/a.mp3"],
	["localhost as the end of another name", "http://evillocalhost/a.mp3"],
	["a name under .localhost", "http://media.localhost/a.mp3"],
	["a deeper name under .localhost, with a port", "http://a.b-c.localhost:9/a.mp3"],
	["a name under .localhost, upper case", "http://EVIL.LOCALHOST/a.mp3"],
	["a name ending in localhost with no dot", "http://notlocalhost.example/a.mp3"],
	["localhost as userinfo", "http://localhost@evil.example/a.mp3"],
	["localhost as userinfo with a password", "http://localhost:80@evil.example/a.mp3"],
	["127.0.0.1 as userinfo", "http://127.0.0.1@evil.example/a.mp3"],
	["localhost in the path", "http://evil.example/localhost/a.mp3"],
	["localhost in the query", "http://evil.example/a.mp3?host=localhost"],
	["localhost in the fragment", "http://evil.example/a.mp3#localhost"],
	["localhost in the fragment, no path", "http://evil.example#localhost"],
	["localhost in the fragment after userinfo", "http://evil.example#@localhost/"],
	["a backslash that ends the host", "http://evil.example\\@localhost/a.mp3"],
	["userinfo on a real loopback host", "http://user@localhost/a.mp3"],
	["userinfo and a password on a real loopback host", "http://user:pw@127.0.0.1/a.mp3"],
	["an empty userinfo on a real loopback host", "http://@localhost/a.mp3"],
	// trailing dots, empty labels
	["a trailing dot", "http://localhost./a.mp3"],
	["a trailing dot on an address", "http://127.0.0.1./a.mp3"],
	["a leading dot", "http://.localhost/a.mp3"],
	["an empty label", "http://a..localhost/a.mp3"],
	// ports
	["a port that is too large", "http://localhost:99999/a.mp3"],
	["a port with letters", "http://localhost:80a/a.mp3"],
	// schemes
	["a scheme that is not http or https", "ftp://localhost/a.mp3"],
	["a file address with a host", "file://localhost/a.mp3"],
	["a file address with no host", "file:///a.mp3"],
	["a scheme-relative address", "//localhost/a.mp3"],
	["one slash after the scheme", "http:/localhost/a.mp3"],
	["no slash after the scheme", "http:localhost/a.mp3"],
	["a bare host", "localhost/a.mp3"],
	["a vault path", "media/a.mp3"],
	["a schemes-inside address", "javascript://localhost/%0aalert(1)"],
	// addresses that are not this machine
	["a LAN address", "http://192.168.1.10/a.mp3"],
	["another LAN address", "http://10.0.0.5/a.mp3"],
	["a 172.16 address", "http://172.16.0.1/a.mp3"],
	["the unspecified address", "http://0.0.0.0/a.mp3"],
	["a link-local address", "http://169.254.1.1/a.mp3"],
	["128.0.0.1, next to the block", "http://128.0.0.1/a.mp3"],
	["126.255.255.255, next to the block", "http://126.255.255.255/a.mp3"],
	["an address that starts like the block", "http://127.0.0.1.evil.example/a.mp3"],
	["an address with an octet too large", "http://127.0.0.256/a.mp3"],
	["an address with five octets", "http://127.0.0.1.5/a.mp3"],
	["the IPv6 unspecified address", "http://[::]/a.mp3"],
	["another IPv6 address", "http://[::2]/a.mp3"],
	["a documentation IPv6 address", "http://[2001:db8::1]/a.mp3"],
	// forms a browser turns into a loopback address, which stay remote here (the conservative reading, see isLoopback)
	["a decimal integer", "http://2130706433/a.mp3"],
	["a hex integer", "http://0x7f000001/a.mp3"],
	["dotted hex", "http://0x7f.0x0.0x0.0x1/a.mp3"],
	["dotted octal", "http://0177.0.0.1/a.mp3"],
	["a short dotted form", "http://127.1/a.mp3"],
	["a short dotted form with three parts", "http://127.0.1/a.mp3"],
	["a leading zero", "http://127.000.000.001/a.mp3"],
	["an octet with a leading zero", "http://127.0.0.01/a.mp3"],
	["the long form of ::1", "http://[0:0:0:0:0:0:0:1]/a.mp3"],
	["::1 with leading zeros", "http://[::0001]/a.mp3"],
	["IPv4-mapped IPv6", "http://[::ffff:127.0.0.1]/a.mp3"],
	["IPv4-mapped IPv6 in hex", "http://[::ffff:7f00:1]/a.mp3"],
	["IPv4-compatible IPv6", "http://[::127.0.0.1]/a.mp3"],
	["an unbracketed ::1", "http://::1/a.mp3"],
	["a full-width letter in localhost", "http://ｌocalhost/a.mp3"],
	["a percent-encoded letter in localhost", "http://l%6Fcalhost/a.mp3"],
	["a character reference left in", "http://local&#104;ost/a.mp3"],
	["a tab inside the name", "http://local\thost/a.mp3"],
	["a line feed inside the name", "http://local\nhost/a.mp3"],
	["a space inside the name", "http://local host/a.mp3"],
	["an empty address", ""],
];

test("isLoopback: the host localhost, 127.0.0.0/8 and [::1], over http or https, any port", () => {
	for (const a of LOOPBACK) assert.equal(isLoopback(a), true, a);
});

test("isLoopback: nothing else is, including every trick that would make evil.example read as this machine, and every odd way of writing 127.0.0.1", () => {
	for (const [why, a] of REMOTE) assert.equal(isLoopback(a), false, `${why}: ${JSON.stringify(a)}`);
});

const json = (g) => JSON.stringify(g.slots.map((s) => [s.type, s.addr]));

test("the gate leaves a loopback media embed to Obsidian: no slot, text as written, in a block and in a title", () => {
	const forms = (a) => [`![x](${a})`, `![x](<${a}>)`, `![x](${a} "a title")`, `![x][v]\n\n[v]: ${a}`, `![v]\n\n[v]: ${a}`, `![v][]\n\n[v]: ${a}`];
	for (const a of ["http://localhost:8080/a.mp3", "http://127.0.0.1/a.mp4", "https://[::1]:9/a.ogg", "HTTP://LOCALHOST/a.mp3"]) {
		for (const text of forms(a)) {
			const g = gateMedia(text, ctx("block"));
			assert.deepEqual(g.slots, [], `${text} -> ${json(g)}`);
			assert.ok(!g.text.includes(SLOT_OPEN), text);
			// a definition-form embed is handed to Obsidian as the inline form that draws a player; the address is the same one
			assert.ok(g.text.includes(a) || g.text.includes(`<${a}>`), `${text} keeps its address`);
			const t = gateMedia(text, ctx("inline"));
			assert.deepEqual(t.slots, [], `${text} in a title`);
		}
	}
});

test("the gate leaves a loopback address in a media tag to Obsidian: audio, video, source, track and a picture", () => {
	const A = "http://localhost:8080/a.mp3";
	for (const text of [
		`<audio src="${A}" controls></audio>`,
		`<video src="http://127.0.0.1:3000/a.mp4" controls></video>`,
		`<video controls><source src="${A}"><track src="http://localhost/a.vtt"></video>`,
		`<audio src=${A}></audio>`,
		`<video src="local.mp4" poster="http://localhost/p.png"></video>`,
		`<img src="${A}">`,
		`<img src="local.png" srcset="local.png 1x, ${A} 2x">`,
	]) {
		const g = gateMedia(text, ctx("block"));
		assert.deepEqual(g.slots, [], text);
		assert.equal(g.text, text, text);
	}
});

test("a frame is not a file: an iframe, an object or an embed on the reader's machine is still held back, and so is anything inside a srcdoc", () => {
	for (const text of [
		`<iframe src="http://localhost:3000/page"></iframe>`,
		`<object data="http://localhost/a.mp3"></object>`,
		`<embed src="http://127.0.0.1/a.mp3">`,
		`<iframe srcdoc="<audio src='http://localhost/a.mp3'></audio>"></iframe>`,
	]) {
		const g = gateMedia(text, ctx("block"));
		assert.equal(g.slots.length, 1, text);
		assert.ok(!/localhost|127\.0\.0\.1/.test(g.text), `${text} -> ${g.text}`);
	}
});

test("the gate still holds back every address that is not this machine, in each form that was held back before", () => {
	for (const [why, a] of REMOTE) {
		// (a character reference is undone by the gate before it reads the address, so `local&#104;ost` is `localhost` there)
		if (!/^https?:\/\//i.test(a) || /[\t\n &]/.test(a)) continue;
		for (const text of [`![x](${a})`, `<audio src="${a}"></audio>`]) {
			const g = gateMedia(text, ctx("block"));
			// an address the gate cannot read as an address at all is left as it is, as before; every other one is a slot, and none is left in the text
			const readable = (() => {
				try {
					return !!new URL(a).hostname;
				} catch {
					return false;
				}
			})();
			if (!readable || !/\.mp3/.test(a)) continue;
			assert.equal(g.slots.length, 1, `${why}: ${text}`);
			assert.ok(!g.text.includes(a), `${why}: ${text} left in the text`);
		}
	}
});

test("a loopback address next to a remote one in a note: only the remote one is a slot", () => {
	const text = "![a](http://localhost:8080/a.mp3)\n\n![b](https://evil.example/b.mp3)\n\n![c](http://127.0.0.1/c.mp3)\n\n![d](http://2130706433/d.mp3)\n";
	const g = gateMedia(text, ctx("block"));
	assert.deepEqual(g.slots.map((s) => s.addr), ["https://evil.example/b.mp3", "http://127.0.0.1/d.mp3"], "the slot holds the address as a browser reads it");
	assert.equal(g.slots[1].type, "refused", "http is never allowed, and the decimal form is not read as a loopback address");
	assert.ok(g.text.includes("http://localhost:8080/a.mp3") && g.text.includes("http://127.0.0.1/c.mp3"));
});

test("a name under .localhost is remote and held back (the owner's list is the host localhost, 127.0.0.0/8 and [::1] only)", () => {
	const g = gateMedia("![a](http://evil.localhost/a.mp3)\n\n![b](http://localhost/b.mp3)\n", ctx("block"));
	assert.equal(g.slots.length, 1);
	assert.equal(g.slots[0].addr, "http://evil.localhost/a.mp3");
	assert.ok(!g.text.includes("evil.localhost") && g.text.includes("http://localhost/b.mp3"));
});
