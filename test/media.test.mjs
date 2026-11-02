/*
 * Media by the extension of an address, an address's origin and host, and the services the plugin plays (src/core/media.ts,
 * services.ts). Made-up addresses only: example.org, example.net and the like.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { core } from "./helpers.mjs";

const { mediaClass, parseUrl, hostOf, serviceOf, serviceAllowed, alsoCovers, hostList, isEmbedAddress, SUGGESTED_HOSTS } = core;

test("mediaClass: the extension of the path decides, in any case, before a query or a fragment", () => {
	for (const e of ["mp3", "m4a", "ogg", "opus", "wav", "flac"]) assert.equal(mediaClass(`media/x.${e}`), "audio", e);
	for (const e of ["mp4", "webm", "mov", "mkv", "ogv", "3gp"]) assert.equal(mediaClass(`media/x.${e}`), "video", e);
	for (const e of ["png", "jpg", "jpeg", "gif", "svg", "webp", "avif", "bmp"]) assert.equal(mediaClass(`x.${e}`), "image", e);
	assert.equal(mediaClass("https://media.example.org/a/B.MP3"), "audio");
	assert.equal(mediaClass("https://media.example.org/a.m4a?token=1#t=20"), "audio");
	assert.equal(mediaClass("https://media.example.org/watch?v=a.mp4"), null, "an extension in the query is not the path's");
	assert.equal(mediaClass("https://media.example.org/a.mp3/"), null, "a path that ends in a slash has no extension");
	assert.equal(mediaClass("https://example.mp3"), null, "a host is not a path");
	assert.equal(mediaClass("https://example.mp3/page"), null);
	assert.equal(mediaClass("//cdn.example.net/x.wav"), "audio");
	assert.equal(mediaClass("notes.txt"), null);
	assert.equal(mediaClass("x"), null);
	assert.equal(mediaClass(""), null);
});

test("parseUrl and hostOf: new URL's reading, a port only when it is not the default", () => {
	assert.equal(parseUrl("  https://Media.Example.org/a.mp3 ")?.href, "https://media.example.org/a.mp3", "spaces round it are dropped");
	assert.equal(parseUrl("not an address"), null);
	assert.equal(parseUrl("https://bücher.example/a")?.host, "xn--bcher-kva.example", "punycode is shown plainly");
	assert.equal(hostOf("https://media.example.org/a"), "media.example.org");
	assert.equal(hostOf("https://media.example.org:443/a"), "media.example.org");
	assert.equal(hostOf("http://media.example.org:8080/a"), "media.example.org:8080");
	assert.equal(hostOf("ftp://media.example.org/a"), null);
	assert.equal(hostOf("relative/path.mp3"), null);
});

test("serviceOf: the pages of the services the plugin knows, with a player built from the id alone; anything else is not one", () => {
	const yt = serviceOf("https://www.youtube.com/watch?v=abcDEF12345&t=30");
	assert.equal(yt.name, "YouTube");
	assert.equal(yt.kind, "video");
	assert.equal(yt.native, "https://www.youtube.com/watch?v=abcDEF12345", "the address Obsidian is handed on the press, built from the id alone");
	assert.equal(yt.embedUrl, null, "the plugin makes no frame of its own for YouTube");
	assert.deepEqual(yt.hosts, ["youtube.com", "youtu.be", "youtube-nocookie.com"]);
	assert.deepEqual(yt.shown, ["youtube.com", "releases.obsidian.md"]);
	for (const u of ["https://youtu.be/abcDEF12345", "https://youtube.com/shorts/abcDEF12345", "https://m.youtube.com/watch?v=abcDEF12345", "https://www.youtube.com/embed/abcDEF12345", "https://music.youtube.com/watch?v=abcDEF12345", "https://www.youtube-nocookie.com/embed/abcDEF12345", "https://youtu.be/abcDEF12345?t=30", "https://www.youtube.com/watch?v=abcDEF12345&list=PLx"])
		assert.equal(serviceOf(u)?.native, yt.native, u);
	for (const u of ["https://www.youtube.com/watch?v=short", "https://www.youtube.com/watch?v=abcDEF12345/../x", "https://www.youtube.com/", "https://www.youtube.com/channel/abcDEF12345", "https://youtu.be/", "http://youtu.be/abcDEF12345", "https://evilyoutube.com/watch?v=abcDEF12345", "https://youtube.com.evil.example/watch?v=abcDEF12345", "https://u:p@youtu.be/abcDEF12345"])
		assert.equal(serviceOf(u), null, u);

	const vm = serviceOf("https://vimeo.com/123456789");
	assert.equal(vm.name, "Vimeo");
	assert.equal(vm.embedUrl, "https://player.vimeo.com/video/123456789?autoplay=1");
	assert.equal(vm.native, null, "Vimeo keeps the plugin's own frame");
	assert.deepEqual(vm.shown, ["player.vimeo.com"]);
	assert.equal(serviceOf("https://player.vimeo.com/video/123456789").embedUrl, vm.embedUrl);
	assert.equal(serviceOf("https://vimeo.com/123456789/abcdef012345").embedUrl, "https://player.vimeo.com/video/123456789?autoplay=1&h=abcdef012345");
	assert.equal(serviceOf("https://vimeo.com/channels/staffpicks/123456789").embedUrl, vm.embedUrl);
	assert.equal(serviceOf("https://vimeo.com/about"), null);

	const sp = serviceOf("https://open.spotify.com/episode/0123456789abcdefABCDEF");
	assert.equal(sp.name, "Spotify");
	assert.equal(sp.kind, "audio");
	assert.equal(sp.embedUrl, "https://open.spotify.com/embed/episode/0123456789abcdefABCDEF");
	assert.equal(serviceOf("https://open.spotify.com/intl-fr/episode/0123456789abcdefABCDEF").embedUrl, sp.embedUrl);
	assert.equal(serviceOf("https://open.spotify.com/episode/short"), null);

	const sc = serviceOf("https://soundcloud.com/some-artist/some-track");
	assert.equal(sc.name, "SoundCloud");
	assert.equal(sc.kind, "audio");
	assert.equal(sc.embedUrl, "https://w.soundcloud.com/player/?url=https%3A%2F%2Fsoundcloud.com%2Fsome-artist%2Fsome-track&auto_play=true");
	assert.match(serviceOf("https://soundcloud.com/some-artist/sets/an-album").embedUrl, /some-artist%2Fsets%2Fan-album/);
	assert.equal(serviceOf("https://soundcloud.com/discover/featured"), null, "a page of the site that is not a track");

	assert.equal(serviceOf("https://media.example.org/a.mp3"), null);
	assert.equal(serviceOf("not an address"), null);
});

test("serviceAllowed: every host the player loads from is on the list; alsoCovers names what an entry adds", () => {
	const svc = serviceOf("https://youtu.be/abcDEF12345");
	const none = { vault: [], notes: {} };
	assert.equal(serviceAllowed(svc, none, "N.md"), false);
	assert.equal(serviceAllowed(svc, { vault: ["youtube.com"], notes: {} }, "N.md"), true, "youtube.com allows the youtu.be link and the player, with Obsidian's frame");
	assert.equal(serviceAllowed(svc, { vault: [], notes: { "N.md": ["youtube.com"] } }, "N.md"), true);
	assert.equal(serviceAllowed(svc, { vault: [], notes: { "N.md": ["youtube.com"] } }, "Other.md"), false, "another note's list is not this note's");
	assert.equal(serviceAllowed(svc, { vault: ["example.org"], notes: {} }, "N.md"), false);
	// the player is not at the link's host: an entry for the link's host alone does not cover it
	assert.equal(serviceAllowed(svc, { vault: ["youtu.be"], notes: {} }, "N.md"), false, "youtu.be is where the link is; the player loads from youtube.com");
	assert.equal(serviceAllowed(svc, { vault: ["youtube-nocookie.com"], notes: {} }, "N.md"), false);
	assert.equal(serviceAllowed(serviceOf("https://www.youtube.com/watch?v=abcDEF12345"), { vault: ["www.youtube.com"], notes: {} }, "N.md"), false, "www.youtube.com does not cover youtube.com");
	const vimeo = serviceOf("https://www.vimeo.com/123456789");
	assert.equal(serviceAllowed(vimeo, { vault: ["www.vimeo.com"], notes: {} }, "N.md"), false, "the player is at player.vimeo.com");
	assert.equal(serviceAllowed(vimeo, { vault: ["vimeo.com"], notes: {} }, "N.md"), true);
	assert.equal(serviceAllowed(vimeo, { vault: ["player.vimeo.com"], notes: {} }, "N.md"), true, "the player's own host is enough");
	const sc = serviceOf("https://www.soundcloud.com/some-artist/some-track");
	assert.equal(serviceAllowed(sc, { vault: ["www.soundcloud.com"], notes: {} }, "N.md"), false, "the player is at w.soundcloud.com");
	assert.equal(serviceAllowed(sc, { vault: ["soundcloud.com"], notes: {} }, "N.md"), true);
	assert.deepEqual(vimeo.shown, ["player.vimeo.com"], "and the card names the player's host");
	assert.deepEqual(alsoCovers("youtube.com"), ["youtu.be", "youtube-nocookie.com", "releases.obsidian.md"]);
	assert.deepEqual(alsoCovers("youtu.be"), ["youtube.com", "youtube-nocookie.com", "releases.obsidian.md"]);
	assert.deepEqual(alsoCovers("releases.obsidian.md"), [], "Obsidian's frame host is not an entry that stands for YouTube");
	assert.equal(serviceAllowed(svc, { vault: ["releases.obsidian.md"], notes: {} }, "N.md"), false, "and allows no YouTube");
	assert.equal(hostList([]), "");
	assert.equal(hostList(["a"]), "a");
	assert.equal(hostList(["a", "b"]), "a and b");
	assert.equal(hostList(["a", "b", "c"]), "a, b and c");
	assert.deepEqual(alsoCovers("vimeo.com"), []);
	assert.deepEqual(alsoCovers("media.example.org"), []);
	assert.deepEqual(SUGGESTED_HOSTS, ["youtube.com", "vimeo.com", "spotify.com", "soundcloud.com"]);
	for (const h of SUGGESTED_HOSTS) assert.equal(core.normaliseEntry(h).entry, h, `${h} is an entry as it stands`);
});

test("isEmbedAddress: the hosts Obsidian turns into a frame of its own when an image has their address, whatever the rest says", () => {
	for (const u of ["https://youtu.be/abcDEF12345", "http://youtu.be/abcDEF12345", "https://www.youtube.com/watch?v=abcDEF12345", "https://m.youtube.com/anything", "https://music.youtube.com/", "https://youtube.com/embed/abcDEF12345.png", "https://youtu.be/abcDEF12345.png", "https://www.youtube-nocookie.com/embed/abcDEF12345", "https://twitter.com/someone/status/1234567890", "https://x.com/someone/status/1234567890.png", "https://mobile.twitter.com/a/status/1", "https://www.x.com/a/status/1"])
		assert.equal(isEmbedAddress(u), true, u);
	for (const u of ["https://evilyoutube.com/x", "https://youtube.com.evil.example/x", "https://media.example.org/youtube.com", "ftp://youtu.be/x", "not an address", "https://fakeyoutu.be/x", "https://box.com/a", "https://nox.com/a", "https://x.com.evil.example/a", "https://vimeo.com/123456789"])
		assert.equal(isEmbedAddress(u), false, u);
});
