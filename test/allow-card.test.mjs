/*
 * The allow list: the card (src/allow-card.ts), the plugin's settings page (src/settings.ts) and the data they keep. "Once" is kept
 * nowhere, "this note" and "this vault" are kept in the plugin's data (`allowedMediaHosts`, `noteAllows`) and never in a note. The
 * card and the settings page edit one list. Made-up addresses only.
 */
import { window as w, click, words, typeInto, press } from "./dom.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { core } from "./helpers.mjs";

const { openAllowCard, BookletSettingTab, MediaAllows } = await import("./.build/media.mjs");
const { Notice } = await import("./obsidian-stub.mjs");

const PATH = "Course.booklet.md";
const doc = w.document;

/** The allow lists over a store that remembers each save. */
function lists(raw = null) {
	const saved = [];
	const media = new MediaAllows(raw, (d) => void saved.push(JSON.parse(JSON.stringify(d))));
	return { media, saved };
}
const card = () => doc.querySelector(".booklet-allow-card");
const buttons = () => Array.from(card().querySelectorAll("button")).map(words);
const byText = (t) => Array.from(card().querySelectorAll("button")).find((b) => words(b) === t);
const esc = () => card().parentElement.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
const open = (media, o = {}) => openAllowCard({ doc, allows: media, notePath: PATH, ...o });

test("the card from the button: a title, the two lists, the blank, 'https is assumed', and a Close button; focus starts on the title", () => {
	const { media } = lists({ allowedMediaHosts: ["youtube.com", "media.example.org"], noteAllows: { [PATH]: ["note.example.net"], "Other.md": ["other.example.net"] } });
	const c = open(media);
	assert.equal(card().getAttribute("role"), "dialog");
	assert.equal(card().getAttribute("aria-modal"), "true");
	assert.equal(card().getAttribute("aria-labelledby"), card().querySelector("h2").id);
	assert.equal(words(card().querySelector("h2")), "Allowed media sites");
	assert.equal(doc.activeElement, card().querySelector("h2"));
	const sections = Array.from(card().querySelectorAll(".booklet-allow-section")).map((s) => [words(s.querySelector("h3")), Array.from(s.querySelectorAll("li label")).map(words)]);
	assert.deepEqual(sections, [["Allowed for every note in this vault", ["youtube.com", "media.example.org"]], ["Allowed for this note", ["note.example.net"]]], "another note's list is not shown");
	for (const box of card().querySelectorAll('input[type="checkbox"]')) assert.equal(box.checked, true);
	for (const ul of card().querySelectorAll("ul")) assert.ok(ul.getAttribute("aria-labelledby"), "each list is named by its heading");
	assert.match(words(card()), /https is assumed/);
	assert.match(words(card()), /https:\/\/\*\.youtube\.com\/\*/);
	assert.match(words(card()), /Allowing youtube\.com also covers youtu\.be, youtube-nocookie\.com and releases\.obsidian\.md, which its player uses\./);
	assert.deepEqual(buttons(), ["Add for every note", "Add for this note", "Close"]);
	assert.equal(card().querySelector("label[for]").getAttribute("for"), card().querySelector('input[type="text"]').id, "the blank has a label");
	c.close();
	assert.equal(card(), null);
});

test("an empty list says so; Close, Escape and a press on the backdrop close the card and give the focus back", () => {
	const { media } = lists();
	const back = doc.body.createEl("button", { text: "Allow list" });
	for (const how of ["Close", "Escape", "backdrop"]) {
		back.blur?.();
		const told = [];
		open(media, { returnFocus: () => back, onClose: (s) => told.push(s) });
		assert.deepEqual(Array.from(card().querySelectorAll(".booklet-muted")).map(words), ["Nothing yet.", "Nothing yet."]);
		if (how === "Close") click(byText("Close"));
		else if (how === "Escape") esc();
		else click(doc.querySelector(".modal-bg"));
		assert.equal(card(), null, how);
		assert.equal(doc.activeElement, back, `${how}: focus is back on the button`);
		assert.deepEqual(told, [{ changed: false, answered: false, left: [] }], how);
	}
	back.remove();
});

test("Tab stays inside the card, from the last control to the first and back", () => {
	const { media } = lists({ allowedMediaHosts: ["youtube.com"] });
	open(media);
	const items = Array.from(card().querySelectorAll("button, input"));
	const first = items[0];
	const last = items[items.length - 1];
	last.focus();
	const tab = (shift = false) => card().parentElement.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Tab", shiftKey: shift, bubbles: true, cancelable: true }));
	tab();
	assert.equal(doc.activeElement, first);
	tab(true);
	assert.equal(doc.activeElement, last);
	esc();
});

test("the blank: youtube.com for the vault is kept as the host, allows https://*.youtube.com/*, and is saved in the data file's shape", async () => {
	const { media, saved } = lists();
	open(media);
	const input = card().querySelector('input[type="text"]');
	typeInto(input, "https://YouTube.com/");
	click(byText("Add for every note"));
	assert.deepEqual(media.vaultList(), ["youtube.com"]);
	await media.saved();
	assert.deepEqual(saved.at(-1), { allowedMediaHosts: ["youtube.com"], noteAllows: {} });
	assert.equal(input.value, "", "the blank is cleared");
	assert.equal(doc.activeElement, input);
	for (const u of ["https://www.youtube.com/watch", "https://a.b.youtube.com/x"]) assert.equal(core.isAllowed(u, media.allows(), "Any.md"), true, u);
	assert.equal(core.isAllowed("https://evilyoutube.com/", media.allows(), "Any.md"), false);
	assert.deepEqual(Array.from(card().querySelectorAll(".booklet-allow-section")[0].querySelectorAll("li label")).map(words), ["youtube.com"], "the list shows it at once");
	esc();
});

test("the blank: for this note it goes under the note's path and nowhere else; Enter does the same; the vault is untouched", async () => {
	const { media, saved } = lists();
	open(media);
	const input = card().querySelector('input[type="text"]');
	typeInto(input, "media.example.org");
	click(byText("Add for this note"));
	typeInto(input, "vimeo.com");
	press(input, "Enter");
	assert.deepEqual(media.noteList(PATH), ["media.example.org", "vimeo.com"]);
	assert.deepEqual(media.vaultList(), []);
	await media.saved();
	assert.deepEqual(saved.at(-1), { allowedMediaHosts: [], noteAllows: { [PATH]: ["media.example.org", "vimeo.com"] } });
	assert.equal(core.isAllowed("https://media.example.org/a.mp3", media.allows(), PATH), true);
	assert.equal(core.isAllowed("https://media.example.org/a.mp3", media.allows(), "Other.md"), false);
	esc();
});

test("the blank: what is not a site is said so in an alert and nothing is kept", () => {
	const { media, saved } = lists();
	open(media);
	const input = card().querySelector('input[type="text"]');
	const alert = card().querySelector('[role="alert"]');
	for (const [typed, said] of [["http://youtube.com", "Only https sites can be allowed."], ["*.youtube.com", "No wildcards: youtube.com already covers its subdomains."], ["youtube.com/watch", "Give the site alone, without a path, like youtube.com."], ["", "Type a site, like youtube.com."], ["youtube", "Add the ending too, like youtube.com."]]) {
		typeInto(input, typed);
		click(byText("Add for every note"));
		assert.equal(words(alert), said, typed);
		assert.equal(doc.activeElement, input);
	}
	typeInto(input, "x");
	assert.equal(words(alert), "", "typing clears the message");
	assert.equal(saved.length, 0, "nothing was saved");
	assert.deepEqual(media.vaultList(), []);
	esc();
});

test("a checkbox unticked takes the site off at once, and ticked again puts it back; the row stays until the card closes", async () => {
	const { media, saved } = lists({ allowedMediaHosts: ["media.example.org"], noteAllows: { [PATH]: ["note.example.net"] } });
	const told = [];
	open(media, { onClose: (s) => told.push(s) });
	const [v, n] = Array.from(card().querySelectorAll('input[type="checkbox"]'));
	v.checked = false;
	v.dispatchEvent(new w.Event("change", { bubbles: true }));
	assert.deepEqual(media.vaultList(), []);
	assert.equal(core.isAllowed("https://media.example.org/a.mp3", media.allows(), PATH), false, "in force at once");
	await media.saved();
	assert.deepEqual(saved.at(-1), { allowedMediaHosts: [], noteAllows: { [PATH]: ["note.example.net"] } });
	assert.equal(card().querySelectorAll("li label").length, 2, "the row is still there");
	v.checked = true;
	v.dispatchEvent(new w.Event("change", { bubbles: true }));
	assert.deepEqual(media.vaultList(), ["media.example.org"]);
	n.checked = false;
	n.dispatchEvent(new w.Event("change", { bubbles: true }));
	assert.deepEqual(media.noteList(PATH), []);
	await media.saved();
	assert.deepEqual(saved.at(-1), { allowedMediaHosts: ["media.example.org"], noteAllows: {} }, "a note with nothing left has no key");
	esc();
	assert.deepEqual(told, [{ changed: true, answered: false, left: [] }]);
});

test("a press on media from a site not allowed: the cost, three scopes with their costs, and Not now with the focus", () => {
	const { media } = lists();
	const c = open(media, { request: { kind: "media", host: "media.example.org", entry: "media.example.org", once: () => assert.fail("not chosen"), again: () => assert.fail("not chosen") } });
	assert.equal(words(card().querySelector("h2")), "Allow media from media.example.org?");
	assert.match(words(card().querySelector(".booklet-allow-request")), /^media\.example\.org will see when you play and from where\./);
	assert.deepEqual(buttons().slice(0, 4), ["Allow once", "Allow for this note", "Allow for this vault", "Not now"]);
	assert.equal(doc.activeElement.textContent, "Not now", "the default is Not now");
	const said = Array.from(card().querySelectorAll(".booklet-allow-choice")).map(words);
	assert.match(said[0], /Plays this piece only\. Nothing is kept\./);
	assert.match(said[1], /for this note: media\.example\.org and its subdomains/);
	assert.match(said[2], /for every note in this vault: media\.example\.org and its subdomains/);
	// each choice's button is described by its cost
	for (const b of Array.from(card().querySelectorAll(".booklet-allow-request button")).slice(0, 3)) assert.equal(doc.getElementById(b.getAttribute("aria-describedby")).tagName, "SPAN");
	assert.match(words(card()), /https is assumed/, "and the card says so here too");
	click(byText("Not now"));
	assert.equal(card(), null);
	assert.deepEqual(media.vaultList(), []);
	assert.deepEqual(media.noteList(PATH), []);
	void c;
});

test("a service names the hosts its player also uses", () => {
	const { media } = lists();
	open(media, { request: { kind: "media", host: "YouTube (youtube.com, releases.obsidian.md)", entry: "youtube.com", once: () => {}, again: () => {} } });
	assert.equal(words(card().querySelector("h2")), "Allow media from YouTube (youtube.com, releases.obsidian.md)?");
	assert.match(words(card().querySelector(".booklet-allow-request")), /^YouTube \(youtube\.com, releases\.obsidian\.md\) will see when you play and from where\.\s*Allowing youtube\.com also covers youtu\.be, youtube-nocookie\.com and releases\.obsidian\.md, which its player uses\./);
	esc();
});

test("Allow once calls for that piece with the press and keeps nothing: not in memory, not in the data", () => {
	const { media, saved } = lists();
	const got = [];
	const told = [];
	open(media, { request: { kind: "media", host: "media.example.org", entry: "media.example.org", once: (evt) => got.push(evt.type), again: () => assert.fail("again") }, returnFocus: () => assert.fail("the player takes the focus"), onClose: (s) => told.push(s) });
	click(byText("Allow once"));
	assert.deepEqual(got, ["click"]);
	assert.equal(card(), null);
	assert.deepEqual(told, [{ changed: false, answered: true, left: [] }]);
	assert.deepEqual(media.vaultList(), []);
	assert.deepEqual(media.noteList(PATH), []);
	assert.equal(saved.length, 0);
	assert.equal(core.isAllowed("https://media.example.org/a.mp3", media.allows(), PATH), false, "the next piece asks again");
});

test("Allow for this note and for this vault keep the site and close the card; the data file says which", async () => {
	const note = lists();
	let back = 0;
	const told = [];
	open(note.media, { request: { kind: "media", host: "media.example.org", entry: "media.example.org", once: () => assert.fail("once"), again: (evt) => told.push([evt.type, core.isAllowed("https://media.example.org/a.mp3", note.media.allows(), PATH)]) }, returnFocus: () => (back++, null) });
	click(byText("Allow for this note"));
	assert.deepEqual(told, [["click", false]], "the slot is told with the press, before the list changes");
	assert.equal(card(), null);
	await note.media.saved();
	assert.deepEqual(note.saved.at(-1), { allowedMediaHosts: [], noteAllows: { [PATH]: ["media.example.org"] } });
	assert.equal(back, 1);

	const vault = lists();
	const closed = [];
	let again = 0;
	open(vault.media, { request: { kind: "media", host: "media.example.org", entry: "media.example.org", once: () => assert.fail("once"), again: () => again++ }, onClose: (s) => closed.push(s) });
	click(byText("Allow for this vault"));
	assert.equal(card(), null);
	await vault.media.saved();
	assert.deepEqual(vault.saved.at(-1), { allowedMediaHosts: ["media.example.org"], noteAllows: {} });
	assert.deepEqual(closed, [{ changed: true, answered: true, left: [] }]);
	assert.equal(again, 1);
});

test("a request for the sites a booklet names: each site with its own two buttons, and Not now", () => {
	const { media } = lists();
	const told = [];
	open(media, { request: { kind: "declared", hosts: ["media.example.org", "audio.example.net"] }, onClose: (s) => told.push(s) });
	assert.equal(doc.activeElement.textContent, "Not now");
	assert.deepEqual(Array.from(card().querySelectorAll(".booklet-allow-declared")).map((r) => [words(r.querySelector("strong")), words(r.querySelector(".booklet-allow-said"))]), [
		["media.example.org", "media.example.org will see when you play and from where."],
		["audio.example.net", "audio.example.net will see when you play and from where."],
	]);
	assert.match(words(card().querySelector(".booklet-allow-request")), /A booklet cannot allow a site for you/);
	click(card().querySelector('button[aria-label="Allow audio.example.net for this vault"]'));
	assert.equal(card().querySelectorAll(".booklet-allow-declared").length, 1);
	click(card().querySelector('button[aria-label="Allow media.example.org for this note"]'));
	assert.equal(card(), null);
	assert.deepEqual(media.vaultList(), ["audio.example.net"]);
	assert.deepEqual(media.noteList(PATH), ["media.example.org"]);
	assert.deepEqual(told, [{ changed: true, answered: true, left: [] }]);

	// closed with a site still unanswered: it is told as left
	const part = [];
	open(media, { request: { kind: "declared", hosts: ["a.example.org", "b.example.org"] }, onClose: (s) => part.push(s) });
	click(card().querySelector('button[aria-label="Allow a.example.org for this note"]'));
	esc();
	assert.deepEqual(part, [{ changed: true, answered: true, left: ["b.example.org"] }]);
});

test("one card at a time in a window: a second request replaces the first", () => {
	const { media } = lists();
	const a = [];
	open(media, { onClose: (s) => a.push(s) });
	open(media, { request: { kind: "media", host: "media.example.org", entry: "media.example.org", once: () => {}, again: () => {} } });
	assert.equal(doc.querySelectorAll(".booklet-allow-card").length, 1);
	assert.equal(a.length, 1);
	assert.equal(words(card().querySelector("h2")), "Allow media from media.example.org?");
	esc();
});

/* ---- the data ---- */

test("the data file: its shape, what is read from it, what is kept that the plugin does not know, and nothing is read from a note", async () => {
	assert.deepEqual(lists().media.toData(), { allowedMediaHosts: [], noteAllows: {} });
	const { media, saved } = lists({
		allowedMediaHosts: ["YouTube.com", "https://vimeo.com/", "youtube.com", "not a site", 7, null, "*.evil.example", "http://plain.example.org"],
		noteAllows: { "A.md": ["media.example.org", "media.example.org", "bad"], "B.md": [], "C.md": "no", "__proto__": ["x.example.org"] },
		somethingElse: { kept: true },
	});
	assert.deepEqual(media.vaultList(), ["youtube.com", "vimeo.com"], "entries as new URL reads them, once each, those that are entries");
	assert.deepEqual(media.noteList("A.md"), ["media.example.org"]);
	assert.deepEqual(media.noteList("B.md"), []);
	assert.deepEqual(media.noteList("C.md"), []);
	media.addVault("spotify.com");
	await media.saved();
	assert.deepEqual(saved.at(-1), { somethingElse: { kept: true }, allowedMediaHosts: ["youtube.com", "vimeo.com", "spotify.com"], noteAllows: { "A.md": ["media.example.org"] } }, "whatever else the file holds is written back");
	for (const junk of [undefined, null, "text", 5, [], [1, 2]]) assert.deepEqual(new MediaAllows(junk, () => {}).toData(), { allowedMediaHosts: [], noteAllows: {} });
	const hostile = new MediaAllows({ noteAllows: { "__proto__": ["x.example.org"], constructor: ["y.example.org"] } }, () => {});
	assert.deepEqual(hostile.noteList("constructor"), ["y.example.org"]);
	assert.equal(core.isAllowed("https://x.example.org/", hostile.allows(), "someone"), false);
});

test("a site added twice is kept once and saves once; a save that fails does not stop the list", async () => {
	const saved = [];
	const media = new MediaAllows(null, (d) => {
		saved.push(d);
		if (saved.length === 2) throw new Error("disk full");
	});
	media.addVault("youtube.com");
	media.addVault("YouTube.com");
	media.addNote(PATH, "media.example.org");
	media.addNote(PATH, "media.example.org");
	media.removeVault("nothing.example.org");
	media.removeNote(PATH, "nothing.example.org");
	media.addVault("vimeo.com");
	await media.saved();
	assert.equal(saved.length, 3, "one save for each change");
	assert.deepEqual(media.vaultList(), ["youtube.com", "vimeo.com"]);
	assert.deepEqual(media.noteList(PATH), ["media.example.org"]);
});

test("a change is told to everyone listening, once, and a listener that is gone hears nothing", () => {
	const { media } = lists();
	let n = 0;
	let m = 0;
	const off = media.onChange(() => n++);
	media.onChange(() => {
		m++;
		throw new Error("a listener's mistake");
	});
	media.addVault("youtube.com");
	media.addVault("youtube.com");
	assert.deepEqual([n, m], [1, 1]);
	off();
	media.removeVault("youtube.com");
	assert.deepEqual([n, m], [1, 2]);
});

test("the note's list follows a rename made in Obsidian; a move made outside it leaves the new path asking again", async () => {
	const { media, saved } = lists({ noteAllows: { "Old/Course.booklet.md": ["media.example.org"], "Keep.md": ["keep.example.org"] } });
	media.moveNote("Old/Course.booklet.md", "New/Course.booklet.md");
	await media.saved();
	assert.deepEqual(media.noteList("Old/Course.booklet.md"), []);
	assert.deepEqual(media.noteList("New/Course.booklet.md"), ["media.example.org"]);
	assert.deepEqual(saved.at(-1), { allowedMediaHosts: [], noteAllows: { "Keep.md": ["keep.example.org"], "New/Course.booklet.md": ["media.example.org"] } });
	const n = saved.length;
	media.moveNote("Never had one.md", "Elsewhere.md");
	media.moveNote("Keep.md", "Keep.md");
	await media.saved();
	assert.equal(saved.length, n, "no list, nothing to move or save");
	// a rename onto a note that has a list of its own joins the two
	media.addNote("Target.md", "other.example.net");
	media.moveNote("Keep.md", "Target.md");
	assert.deepEqual(media.noteList("Target.md"), ["other.example.net", "keep.example.org"]);
	// a file moved with the file manager of the system is a note at a new path that no event reported: the old list stays where it was
	assert.deepEqual(media.noteList("Moved outside.md"), []);
	assert.equal(core.isAllowed("https://media.example.org/a.mp3", media.allows(), "Moved outside.md"), false);
});

test("the plugin loads the data, adds the settings tab, follows a rename, and draws the open booklets again after a change", async () => {
	const { BookletPlugin } = await import("./.build/view.mjs");
	const on = {};
	const redrawn = [];
	const BV = (await import("./.build/view.mjs")).BookletView;
	const fake = Object.create(BV.prototype);
	fake.redrawSoon = () => redrawn.push(1);
	const app = {
		workspace: { on: (name, fn) => ((on[name] = fn), {}), getLeavesOfType: (t) => (t === "booklet" ? [{ view: fake }, { view: {} }] : []), onLayoutReady() {} },
		metadataCache: { on: () => ({}) },
		vault: { on: (name, fn) => ((on["vault:" + name] = fn), {}) },
		loadLocalStorage: () => null,
		saveLocalStorage() {},
	};
	const plugin = new BookletPlugin(app, {});
	plugin.savedData = { allowedMediaHosts: ["youtube.com"], noteAllows: { "Old.booklet.md": ["media.example.org"] } };
	await plugin.onload();
	assert.equal(plugin.settingTabs.length, 1, "one settings tab");
	assert.deepEqual(plugin.media.vaultList(), ["youtube.com"]);
	on["vault:rename"]({ path: "New.booklet.md" }, "Old.booklet.md");
	assert.deepEqual(plugin.media.noteList("New.booklet.md"), ["media.example.org"]);
	assert.deepEqual(plugin.media.noteList("Old.booklet.md"), []);
	assert.equal(redrawn.length, 1, "the open booklets are drawn again");
	await plugin.media.saved();
	assert.deepEqual(plugin.savedData, { allowedMediaHosts: ["youtube.com"], noteAllows: { "New.booklet.md": ["media.example.org"] } });
	plugin.media.addVault("vimeo.com");
	assert.equal(redrawn.length, 2);
	plugin.unload();
	plugin.media.addVault("spotify.com");
	assert.equal(redrawn.length, 2, "unloaded: nothing hears the change");
});

/* ---- the settings page ---- */

function tab(raw = null) {
	const l = lists(raw);
	const t = new BookletSettingTab({}, {}, l.media);
	doc.body.appendChild(t.containerEl);
	t.display();
	return { ...l, t, el: t.containerEl, done: () => (t.hide(), t.containerEl.remove()) };
}
const rows = (el) => Array.from(el.querySelectorAll(".setting-item")).map((s) => words(s.querySelector(".setting-item-name")));
const btn = (el, text) => Array.from(el.querySelectorAll("button")).find((b) => words(b) === text);

test("the settings page: a heading in sentence case without the plugin's name, the vault's list, the blank, and the suggestions button", () => {
	const s = tab();
	const heading = s.el.querySelector(".setting-item-heading");
	assert.equal(words(heading), "Media from other sites");
	assert.ok(!/booklet/i.test(words(heading)));
	assert.match(words(s.el), /https is assumed/);
	assert.match(words(s.el), /A note can never allow a site for you/);
	assert.match(words(s.el), /No site is allowed yet\./, "the list starts empty");
	assert.deepEqual(rows(s.el).filter(Boolean), ["Media from other sites", "Add a site", "Suggested services"]);
	assert.ok(btn(s.el, "Add suggested services"));
	assert.deepEqual(s.media.vaultList(), [], "nothing is allowed until the button is pressed");
	s.done();
});

test("Add suggested services is a one-time action that puts the suggestions on the list; pressing it again adds none", async () => {
	Notice.said.length = 0;
	const s = tab({ allowedMediaHosts: ["vimeo.com", "media.example.org"] });
	click(btn(s.el, "Add suggested services"));
	assert.deepEqual(s.media.vaultList(), ["vimeo.com", "media.example.org", "youtube.com", "spotify.com", "soundcloud.com"]);
	assert.deepEqual(rows(s.el).filter(Boolean), ["Media from other sites", "vimeo.com", "media.example.org", "youtube.com", "spotify.com", "soundcloud.com", "Add a site", "Suggested services"], "the page shows them at once");
	assert.deepEqual(Notice.said, ["Added 3 suggested sites."]);
	await s.media.saved();
	assert.deepEqual(s.saved.at(-1).allowedMediaHosts, ["vimeo.com", "media.example.org", "youtube.com", "spotify.com", "soundcloud.com"]);
	const n = s.saved.length;
	click(btn(s.el, "Add suggested services"));
	await s.media.saved();
	assert.equal(s.saved.length, n);
	assert.equal(Notice.said.at(-1), "The suggested services are already on the list.");
	assert.match(words(s.el), /Also covers youtu\.be, youtube-nocookie\.com and releases\.obsidian\.md, which its player uses\./);
	s.done();
});

test("the page and the card edit one list: what one writes the other shows", () => {
	const s = tab({ allowedMediaHosts: ["media.example.org"] });
	assert.deepEqual(rows(s.el).filter(Boolean).slice(1, 2), ["media.example.org"]);
	// the card writes
	const c = open(s.media);
	typeInto(c.el.querySelector('input[type="text"]'), "vimeo.com");
	click(Array.from(c.el.querySelectorAll("button")).find((b) => words(b) === "Add for every note"));
	assert.deepEqual(rows(s.el).filter(Boolean).slice(1, 3), ["media.example.org", "vimeo.com"]);
	c.close();
	// the page writes
	click(s.el.querySelector('button[aria-label="Remove media.example.org"]'));
	assert.deepEqual(s.media.vaultList(), ["vimeo.com"]);
	const c2 = open(s.media);
	assert.deepEqual(Array.from(c2.el.querySelectorAll(".booklet-allow-section")[0].querySelectorAll("li label")).map(words), ["vimeo.com"]);
	c2.close();
	// and the blank on the page
	const input = s.el.querySelector('input[type="text"]');
	typeInto(input, "http://nope.example.org");
	click(btn(s.el, "Add"));
	assert.equal(words(s.el.querySelector('[role="alert"]')), "Only https sites can be allowed.");
	const input2 = s.el.querySelector('input[type="text"]');
	typeInto(input2, "https://spotify.com/");
	click(btn(s.el, "Add"));
	assert.deepEqual(s.media.vaultList(), ["vimeo.com", "spotify.com"]);
	s.done();
});

test("a page that is hidden stops listening to the list", () => {
	const s = tab();
	s.t.hide();
	const before = s.el.innerHTML;
	s.media.addVault("youtube.com");
	assert.equal(s.el.innerHTML, before);
	s.el.remove();
});

const later = (ms) => new Promise((r) => w.setTimeout(r, ms));

test("a card opened as a note opens keeps its default focus when something blurs it in the first moments, and never takes it from where she put it", async () => {
	const { media } = lists();
	const req = { kind: "declared", hosts: ["media.example.org"] };
	const field = doc.body.createEl("input");
	// blurred to nothing a moment after it opened (Obsidian making the pane active)
	const a = open(media, { request: req });
	assert.equal(doc.activeElement.textContent, "Not now");
	doc.activeElement.blur();
	assert.equal(doc.activeElement, doc.body);
	await later(60);
	assert.equal(doc.activeElement.textContent, "Not now", "put back on Not now");
	// she moved focus elsewhere herself: it stays there
	field.focus();
	await later(60);
	assert.equal(doc.activeElement, field, "focus she put elsewhere is left");
	a.close(false);
	// after the first second it no longer interferes
	const b = open(media, { request: req });
	await later(1100);
	doc.activeElement.blur();
	await later(60);
	assert.equal(doc.activeElement, doc.body, "after the first moments a lost focus is not taken back");
	b.close(false);
	field.remove();
});
