/*
 * The reader's allow list: what a typed site becomes, and which addresses an entry allows (src/core/allow.ts). An entry `youtube.com`
 * stands for `https://*.youtube.com/*`: the host and its subdomains, https only. Made-up addresses only.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { core } from "./helpers.mjs";

const { normaliseEntry, isAllowed, entryFor, entryCovers } = core;
const allow = (vault, notes = {}) => ({ vault, notes });

test("normaliseEntry: a site and its ending, taken to the host alone", () => {
	for (const [typed, entry] of [
		["youtube.com", "youtube.com"],
		["  YouTube.com  ", "youtube.com"],
		["https://youtube.com", "youtube.com"],
		["HTTPS://youtube.com/", "youtube.com"],
		["media.example.org", "media.example.org"],
		["media.example.org.", "media.example.org"],
		["media.example.org:8443", "media.example.org:8443"],
		["media.example.org:443", "media.example.org"],
		["127.0.0.1", "127.0.0.1"],
		["127.0.0.1:9443", "127.0.0.1:9443"],
		["bücher.example", "xn--bcher-kva.example"],
	])
		assert.deepEqual(normaliseEntry(typed), { ok: true, entry }, typed);
});

test("normaliseEntry: what is not a site says why, in words", () => {
	for (const [typed, why] of [
		["", /Type a site/],
		["   ", /Type a site/],
		["http://youtube.com", /Only https/],
		["ftp://youtube.com", /Only https/],
		["https://youtube.com/watch", /without a path/],
		["youtube.com/watch?v=1", /without a path/],
		["youtube.com#x", /without a path/],
		["*.youtube.com", /No wildcards/],
		["https://*.youtube.com/*", /No wildcards/],
		["https://user:pw@youtube.com", /user name/],
		["user@youtube.com", /user name/],
		["you tube.com", /no spaces/],
		["youtube", /ending/],
		["localhost", /ending/],
		["com", /ending/],
		["a..b", /does not look like a site/],
		["javascript:alert(1)", /does not look like a site/],
		["https://", /Type a site|does not look/],
	]) {
		const r = normaliseEntry(typed);
		assert.equal(r.ok, false, typed);
		assert.match(r.why, why, typed);
	}
});

test("isAllowed: the host and its subdomains, https only, read as new URL reads them", () => {
	const a = allow(["youtube.com"]);
	for (const u of ["https://youtube.com/watch", "https://www.youtube.com/x.mp3", "https://a.b.youtube.com/", "https://YouTube.COM/", "https://youtube.com:443/x"]) assert.equal(isAllowed(u, a, "N.md"), true, u);
	for (const u of [
		"https://evilyoutube.com/x.mp3",
		"https://youtube.com.evil.example/x.mp3",
		"https://evil.example/youtube.com/x.mp3",
		"https://evil.example/?u=youtube.com",
		"https://evil.example/#youtube.com",
		"http://youtube.com/x.mp3",
		"//youtube.com/x.mp3",
		"https://youtube.com:8443/x.mp3",
		"https://user:pw@youtube.com/x.mp3",
		"https://youtube.com@evil.example/x.mp3",
		"https://youtube.com.:443/x",
		"ftp://youtube.com/x",
		"data:audio/wav;base64,AAAA",
		"media/x.mp3",
		"not an address",
		"",
	])
		assert.equal(isAllowed(u, a, "N.md"), false, u);
});

test("isAllowed: a port is part of the entry, a number allows itself only, punycode reads plainly", () => {
	assert.equal(isAllowed("https://media.example.org:8443/x", allow(["media.example.org:8443"]), "N.md"), true);
	assert.equal(isAllowed("https://media.example.org/x", allow(["media.example.org:8443"]), "N.md"), false, "an entry with a port is that port only");
	assert.equal(isAllowed("https://media.example.org:9443/x", allow(["media.example.org:8443"]), "N.md"), false);
	assert.equal(isAllowed("https://x.media.example.org:8443/x", allow(["media.example.org:8443"]), "N.md"), true);
	assert.equal(isAllowed("https://127.0.0.1:9443/x", allow(["127.0.0.1:9443"]), "N.md"), true);
	assert.equal(isAllowed("https://127.0.0.1/x", allow(["127.0.0.1"]), "N.md"), true);
	assert.equal(isAllowed("https://1.127.0.0.1/x", allow(["127.0.0.1"]), "N.md"), false, "a number has no subdomains");
	assert.equal(isAllowed("https://bücher.example/x", allow(["xn--bcher-kva.example"]), "N.md"), true);
	assert.equal(isAllowed("https://xn--bcher-kva.example/x", allow(["b\u00fccher.example"]), "N.md"), true, "an entry is read as new URL reads it, so either spelling allows the other");
	assert.equal(isAllowed("https://example.org/x", allow(["not a site"]), "N.md"), false, "an entry that is not an entry allows nothing");
});

test("isAllowed: the vault's list applies to every note, a note's list to that note's path only", () => {
	const a = allow(["vault.example.org"], { "Folder/A.md": ["note.example.org"], "B.md": ["other.example.org"] });
	assert.equal(isAllowed("https://vault.example.org/x", a, "Folder/A.md"), true);
	assert.equal(isAllowed("https://vault.example.org/x", a, "anything.md"), true);
	assert.equal(isAllowed("https://note.example.org/x", a, "Folder/A.md"), true);
	assert.equal(isAllowed("https://note.example.org/x", a, "B.md"), false);
	assert.equal(isAllowed("https://note.example.org/x", a, "folder/a.md"), false, "a path is exact");
	assert.equal(isAllowed("https://note.example.org/x", a, "__proto__"), false);
	assert.equal(isAllowed("https://note.example.org/x", a, "constructor"), false);
});

test("entryFor and entryCovers", () => {
	assert.equal(entryFor("https://media.example.org/a.mp3"), "media.example.org");
	assert.equal(entryFor("https://media.example.org:8443/a.mp3"), "media.example.org:8443");
	assert.equal(entryFor("http://media.example.org/a.mp3"), null);
	assert.equal(entryFor("not an address"), null);
	assert.equal(entryCovers("youtube.com", "www.youtube.com"), true);
	assert.equal(entryCovers("www.youtube.com", "youtube.com"), false);
	assert.equal(entryCovers("youtube.com", "youtu.be"), false);
});
