/*
 * The allow list: the card (src/allow-card.ts), the plugin's settings page (src/settings.ts) and the data they keep. "Once" is kept
 * nowhere, "this note" and "this vault" are kept in the plugin's data (`allowedMediaHosts`, `noteAllows`) and never in a note. The
 * card and the settings page edit one list. Made-up addresses only.
 */
import { window as w, click, words, typeInto, press, testKeymap } from "./dom.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { core } from "./helpers.mjs";

const { openAllowCard, BookletSettingTab, MediaAllows } = await import("./.build/media.mjs");
const { Notice, Scope } = await import("./obsidian-stub.mjs");

/** Lets the saves that were started finish (a change saves in a microtask). */
const flush = () => new Promise((r) => w.setTimeout(r, 0));

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
/** The button of a site's row in the card of the sites a booklet names, found by the words it shows. */
const declared = (host, text) => Array.from(card().querySelectorAll(".booklet-allow-declared")).find((r) => words(r.querySelector("strong")) === host).querySelector(`button[aria-label^="${text}"]`);
/** The app's key scopes (a stack; a key goes to the topmost) and the card's way into them, as the view gives it. */
const keys = testKeymap();
const keyScope = (escape) => {
	const scope = new Scope();
	scope.register([], "Escape", () => {
		escape();
		return false;
	});
	keys.pushScope(scope);
	return () => keys.popScope(scope);
};
const open = (media, o = {}) => openAllowCard({ doc, allows: media, notePath: PATH, keyScope, ...o });

test("the card from the button: a title, the two lists, the blank, 'https is assumed', and a Close button; focus starts on the title", () => {
	const { media } = lists({ allowedMediaHosts: ["youtube.com", "media.example.org"], noteAllows: { [PATH]: ["note.example.net"], "Other.md": ["other.example.net"] } });
	const c = open(media);
	assert.equal(card().getAttribute("role"), "dialog");
	assert.equal(card().getAttribute("aria-modal"), "true");
	assert.equal(card().getAttribute("aria-labelledby"), card().querySelector("h2").id);
	assert.equal(words(card().querySelector("h2")), "Allow list");
	assert.equal(doc.activeElement, card().querySelector("h2"));
	const sections = Array.from(card().querySelectorAll(".booklet-allow-section")).map((s) => [words(s.querySelector("h3")), Array.from(s.querySelectorAll("li label")).map(words)]);
	assert.deepEqual(sections, [["Allowed for this vault", ["youtube.com", "media.example.org"]], ["Allowed for this note", ["note.example.net"]]], "another note's list is not shown");
	for (const box of card().querySelectorAll('input[type="checkbox"]')) assert.equal(box.checked, true);
	for (const ul of card().querySelectorAll("ul")) assert.ok(ul.getAttribute("aria-labelledby"), "each list is named by its heading");
	assert.match(words(card()), /https is assumed/);
	assert.doesNotMatch(words(card()), /https:\/\/\*/, "no pattern syntax in the words she reads");
	assert.match(words(card()), /Enter adds it for this note/);
	assert.match(words(card()), /Allowing youtube\.com also covers youtu\.be, youtube-nocookie\.com and releases\.obsidian\.md, which its player uses\./);
	assert.deepEqual(buttons(), ["Add for this vault", "Add for this note", "Close"]);
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

test("keys are heard with focus outside the card: Escape closes it, and Tab comes back in (the page behind it, nothing focused)", () => {
	const { media } = lists({ allowedMediaHosts: ["youtube.com"] });
	const behind = doc.body.createEl("button", { text: "A control behind the card" });
	const key = (target, k, shiftKey = false) => target.dispatchEvent(new w.KeyboardEvent("keydown", { key: k, shiftKey, bubbles: true, cancelable: true }));
	const items = () => Array.from(card().querySelectorAll("button, input"));
	// Escape, focus on the page behind the card
	const back = doc.body.createEl("button", { text: "Allow list" });
	open(media, { returnFocus: () => back });
	behind.focus();
	assert.ok(!card().contains(doc.activeElement));
	key(behind, "Escape");
	assert.equal(card(), null, "Escape with focus on a control behind the card closes it");
	assert.equal(doc.activeElement, back, "and focus goes to where the card said");
	// Escape, nothing focused: the key is aimed at the body
	open(media);
	doc.activeElement?.blur?.();
	key(doc.body, "Escape");
	assert.equal(card(), null, "Escape with nothing focused closes it");
	// Tab from the page behind goes into the card, first control; Shift+Tab, last
	open(media);
	behind.focus();
	key(behind, "Tab");
	assert.equal(doc.activeElement, items()[0], "Tab from outside lands on the card's first control");
	behind.focus();
	key(behind, "Tab", true);
	assert.equal(doc.activeElement, items().at(-1), "Shift+Tab from outside lands on its last control");
	// a key aimed at another dialog is that dialog's own: Tab in a command palette does not come into the card
	const palette = doc.body.createDiv({ cls: "modal-container" });
	const field = palette.createEl("input");
	field.focus();
	key(field, "Tab");
	assert.equal(doc.activeElement, field, "Tab in another modal is left alone");
	palette.remove();
	// closed, the card hears nothing: no handler is left on the document
	card().querySelector(".modal-button-container button").click();
	assert.equal(card(), null);
	open(media);
	esc();
	behind.focus();
	key(behind, "Tab");
	assert.equal(doc.activeElement, behind, "after the card closes, Tab is the page's again");
	behind.remove();
	back.remove();
});

test("the blank: youtube.com for the vault is kept as the host, allows https://*.youtube.com/*, and is saved in the data file's shape", async () => {
	const { media, saved } = lists();
	open(media);
	const input = card().querySelector('input[type="text"]');
	typeInto(input, "https://YouTube.com/");
	click(byText("Add for this vault"));
	assert.deepEqual(media.vaultList(), ["youtube.com"]);
	await flush();
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
	await flush();
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
		click(byText("Add for this vault"));
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
	await flush();
	assert.deepEqual(saved.at(-1), { allowedMediaHosts: [], noteAllows: { [PATH]: ["note.example.net"] } });
	assert.equal(card().querySelectorAll("li label").length, 2, "the row is still there");
	v.checked = true;
	v.dispatchEvent(new w.Event("change", { bubbles: true }));
	assert.deepEqual(media.vaultList(), ["media.example.org"]);
	n.checked = false;
	n.dispatchEvent(new w.Event("change", { bubbles: true }));
	assert.deepEqual(media.noteList(PATH), []);
	await flush();
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
	assert.equal(words(card().querySelector("h2")), "Allow media from YouTube?", "the title is the service's name, not a list of hosts");
	assert.match(words(card().querySelector(".booklet-allow-request")), /^Plays from youtube\.com and releases\.obsidian\.md\.YouTube will see when you play and from where\.\s*Allowing youtube\.com also covers youtu\.be, youtube-nocookie\.com and releases\.obsidian\.md, which its player uses\./);
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
	await flush();
	assert.deepEqual(note.saved.at(-1), { allowedMediaHosts: [], noteAllows: { [PATH]: ["media.example.org"] } });
	assert.equal(back, 1);

	const vault = lists();
	const closed = [];
	let again = 0;
	open(vault.media, { request: { kind: "media", host: "media.example.org", entry: "media.example.org", once: () => assert.fail("once"), again: () => again++ }, onClose: (s) => closed.push(s) });
	click(byText("Allow for this vault"));
	assert.equal(card(), null);
	await flush();
	assert.deepEqual(vault.saved.at(-1), { allowedMediaHosts: ["media.example.org"], noteAllows: {} });
	assert.deepEqual(closed, [{ changed: true, answered: true, left: [] }]);
	assert.equal(again, 1);
});

test("Escape goes through the app's key scopes: the card's scope is on top while it is open, a modal over it keeps its own Escape, and it is taken off when the card closes", () => {
	const { media } = lists();
	const before = keys.scopes.length;
	const c = open(media);
	assert.equal(keys.scopes.length, before + 1, "the card puts a scope on the stack");
	// a modal opened over the card (Obsidian's Settings, say) has the scope on top: it hears Escape, and the card stays
	const heard = [];
	const modal = new Scope();
	modal.register([], "Escape", () => void heard.push("modal"));
	keys.pushScope(modal);
	w.document.body.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
	assert.deepEqual(heard, ["modal"]);
	assert.ok(card(), "the card is not closed by the Escape that is the modal's");
	keys.popScope(modal);
	// with the card's scope on top again, the same key closes the card, and the key is taken (default prevented, stopped)
	const evt = new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
	w.document.body.dispatchEvent(evt);
	assert.equal(card(), null);
	assert.equal(evt.defaultPrevented, true);
	assert.equal(keys.scopes.length, before, "closing the card takes its scope off, whatever closed it");
	c.close();
	open(media);
	click(byText("Close"));
	assert.equal(keys.scopes.length, before, "Close takes the scope off too");
	// a second card replaces the first: one scope, not two
	open(media);
	open(media);
	assert.equal(keys.scopes.length, before + 1);
	esc();
	assert.equal(keys.scopes.length, before);
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
	click(declared("audio.example.net", "Allow for this vault"));
	assert.equal(card().querySelectorAll(".booklet-allow-declared").length, 1);
	click(declared("media.example.org", "Allow for this note"));
	assert.equal(card(), null);
	assert.deepEqual(media.vaultList(), ["audio.example.net"]);
	assert.deepEqual(media.noteList(PATH), ["media.example.org"]);
	assert.deepEqual(told, [{ changed: true, answered: true, left: [] }]);

	// closed with a site still unanswered: it is told as left
	const part = [];
	open(media, { request: { kind: "declared", hosts: ["a.example.org", "b.example.org"] }, onClose: (s) => part.push(s) });
	click(declared("a.example.org", "Allow for this note"));
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
	await flush();
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
	await flush();
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
	await flush();
	assert.deepEqual(media.noteList("Old/Course.booklet.md"), []);
	assert.deepEqual(media.noteList("New/Course.booklet.md"), ["media.example.org"]);
	assert.deepEqual(saved.at(-1), { allowedMediaHosts: [], noteAllows: { "Keep.md": ["keep.example.org"], "New/Course.booklet.md": ["media.example.org"] } });
	const n = saved.length;
	media.moveNote("Never had one.md", "Elsewhere.md");
	media.moveNote("Keep.md", "Keep.md");
	await flush();
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
	await flush();
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

test("the settings page: no heading (one section only), the explanation, the vault's list, the blank, and the suggestions button", () => {
	const s = tab();
	assert.equal(s.el.querySelector(".setting-item-heading"), null, "a page with one section has no heading");
	assert.match(words(s.el), /https is assumed/);
	assert.match(words(s.el), /A note can never allow a site for you/);
	assert.match(words(s.el), /No site is allowed yet\./, "the list starts empty");
	assert.deepEqual(rows(s.el).filter(Boolean), ["Add a site", "Suggested services"]);
	assert.ok(btn(s.el, "Add suggested services"));
	assert.deepEqual(s.media.vaultList(), [], "nothing is allowed until the button is pressed");
	s.done();
});

test("the settings page marks its container so that long site names wrap and a button's words wrap (styles.css)", () => {
	const s = tab({ allowedMediaHosts: ["a-long-host-name.media.example.org"] });
	assert.ok(s.el.classList.contains("booklet-settings"));
	s.done();
});

test("Add suggested services is a one-time action that puts the suggestions on the list; pressing it again adds none", async () => {
	Notice.said.length = 0;
	const s = tab({ allowedMediaHosts: ["vimeo.com", "media.example.org"] });
	click(btn(s.el, "Add suggested services"));
	assert.deepEqual(s.media.vaultList(), ["vimeo.com", "media.example.org", "youtube.com", "spotify.com", "soundcloud.com"]);
	assert.deepEqual(rows(s.el).filter(Boolean), ["vimeo.com", "media.example.org", "youtube.com", "spotify.com", "soundcloud.com", "Add a site", "Suggested services"], "the page shows them at once");
	assert.deepEqual(Notice.said, ["Added 3 suggested sites."]);
	await flush();
	assert.deepEqual(s.saved.at(-1).allowedMediaHosts, ["vimeo.com", "media.example.org", "youtube.com", "spotify.com", "soundcloud.com"]);
	const n = s.saved.length;
	click(btn(s.el, "Add suggested services"));
	await flush();
	assert.equal(s.saved.length, n);
	assert.equal(Notice.said.at(-1), "The suggested services are already on the list.");
	assert.match(words(s.el), /Also covers youtu\.be, youtube-nocookie\.com and releases\.obsidian\.md, which its player uses\./);
	s.done();
});

test("the page and the card edit one list: what one writes the other shows", () => {
	const s = tab({ allowedMediaHosts: ["media.example.org"] });
	assert.deepEqual(rows(s.el).filter(Boolean).slice(0, 1), ["media.example.org"]);
	// the card writes
	const c = open(s.media);
	typeInto(c.el.querySelector('input[type="text"]'), "vimeo.com");
	click(Array.from(c.el.querySelectorAll("button")).find((b) => words(b) === "Add for this vault"));
	assert.deepEqual(rows(s.el).filter(Boolean).slice(0, 2), ["media.example.org", "vimeo.com"]);
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

/* ---- the fix round: focus, words said, names (lane U) ---- */

const liveOf = (el) => el.querySelector('[role="status"][aria-live="polite"]');

test("the sites a booklet names: pressing a row's button moves the focus to the next row, then to Not now; the change is said; Escape and Tab still work", () => {
	const { media } = lists();
	const back = doc.body.createEl("button", { text: "Allow list" });
	open(media, { request: { kind: "declared", hosts: ["a.example.org", "b.example.org", "c.example.org"] }, returnFocus: () => back });
	const live = liveOf(card());
	assert.ok(live, "a polite live region is in the card");
	click(declared("a.example.org", "Allow for this note"));
	assert.equal(card().querySelectorAll(".booklet-allow-declared").length, 2);
	assert.equal(doc.activeElement, declared("b.example.org", "Allow for this note"), "focus went to the next row's first button, not to the page");
	assert.equal(words(live), "a.example.org allowed for this note");
	// Tab still stays in the card (the trap works from the moved focus)
	const tab = (shift = false) => card().parentElement.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Tab", shiftKey: shift, bubbles: true, cancelable: true }));
	const items = Array.from(card().querySelectorAll("button, input"));
	items.at(-1).focus();
	tab();
	assert.equal(doc.activeElement, items[0]);
	click(declared("c.example.org", "Allow for this vault"));
	assert.equal(doc.activeElement, byText("Not now"), "no row after it: Not now");
	assert.equal(words(live), "c.example.org allowed for this vault");
	click(declared("b.example.org", "Allow for this vault"));
	assert.equal(card(), null, "the last site closes the card");
	assert.equal(doc.activeElement, back);
	// and Escape closes it from the moved focus
	const { media: m2 } = lists();
	open(m2, { request: { kind: "declared", hosts: ["a.example.org", "b.example.org"] } });
	click(declared("a.example.org", "Allow for this note"));
	assert.ok(card().contains(doc.activeElement));
	esc();
	assert.equal(card(), null);
	back.remove();
});

test("the sites a booklet names: with no row after it, focus goes to Not now", () => {
	const { media } = lists();
	open(media, { request: { kind: "declared", hosts: ["a.example.org", "b.example.org"] } });
	click(declared("b.example.org", "Allow for this note"));
	assert.equal(doc.activeElement, byText("Not now"), "no row after it: Not now, the default");
	esc();
});

test("a button's accessible name contains the words it shows, and the scope names are the same on every surface", () => {
	const { media } = lists();
	open(media, { request: { kind: "declared", hosts: ["a.example.org"] } });
	for (const b of card().querySelectorAll("button[aria-label]")) assert.ok(b.getAttribute("aria-label").startsWith(words(b)), `${words(b)} is in "${b.getAttribute("aria-label")}"`);
	assert.deepEqual(Array.from(card().querySelectorAll(".booklet-allow-declared button")).map((b) => b.getAttribute("aria-label")), ["Allow for this note: a.example.org", "Allow for this vault: a.example.org"]);
	esc();
	open(media, { request: { kind: "media", host: "media.example.org", entry: "media.example.org", once: () => {}, again: () => {} } });
	assert.deepEqual(buttons(), ["Allow once", "Allow for this note", "Allow for this vault", "Not now", "Add for this vault", "Add for this note"]);
	assert.deepEqual(Array.from(card().querySelectorAll("h3")).map(words), ["Allowed for this vault", "Allowed for this note"]);
	esc();
	const s = tab();
	assert.equal(s.el.querySelector('input[type="text"]').getAttribute("aria-label"), "Add a site", "the field's name is its visible label");
	assert.match(words(s.el), /Allow list button/);
	s.done();
});

test("the write-in says what it did: added, or already on the list; and a bad site is said in the alert", () => {
	const { media } = lists({ allowedMediaHosts: ["youtube.com"] });
	open(media);
	const live = liveOf(card());
	const input = card().querySelector('input[type="text"]');
	typeInto(input, "vimeo.com");
	click(byText("Add for this note"));
	assert.equal(words(live), "Added vimeo.com for this note");
	typeInto(input, "VIMEO.com");
	click(byText("Add for this note"));
	assert.equal(words(live), "vimeo.com is already on the list for this note");
	typeInto(input, "youtube.com");
	click(byText("Add for this vault"));
	assert.equal(words(live), "youtube.com is already on the list for this vault");
	typeInto(input, "soundcloud.com");
	press(input, "Enter");
	assert.equal(words(live), "Added soundcloud.com for this note", "Enter adds for this note");
	assert.deepEqual(media.noteList(PATH), ["vimeo.com", "soundcloud.com"]);
	esc();
});

test("the card's hint is plain words with no pattern syntax", () => {
	const { media } = lists();
	open(media);
	assert.equal(words(card().querySelector(".booklet-allow-hint")), "Add a site by its name, for example youtube.com. https is assumed: only secure addresses are covered, and the site's subdomains with them. Enter adds it for this note.");
	esc();
});

test("the settings page keeps the focus and the box: adding clears the box and stays in it; removing moves to the next Remove; both are said", () => {
	const s = tab({ allowedMediaHosts: ["a.example.org", "b.example.org", "c.example.org"] });
	const input = s.el.querySelector('input[type="text"]');
	const live = liveOf(s.el);
	const remove = (host) => s.el.querySelector(`button[aria-label="Remove ${host}"]`);
	typeInto(input, "d.example.org");
	press(input, "Enter");
	assert.deepEqual(s.media.vaultList(), ["a.example.org", "b.example.org", "c.example.org", "d.example.org"]);
	assert.equal(s.el.querySelector('input[type="text"]'), input, "the box is the same box, not drawn again");
	assert.equal(input.value, "", "and it is empty");
	assert.equal(doc.activeElement, input);
	assert.equal(words(live), "Added d.example.org");
	assert.ok(remove("d.example.org"), "the list shows it");
	typeInto(input, "D.example.org");
	click(btn(s.el, "Add"));
	assert.equal(words(live), "d.example.org is already on the list");
	assert.equal(s.media.vaultList().length, 4);
	// removing the middle one: focus to the one that took its place
	click(remove("b.example.org"));
	assert.equal(doc.activeElement, remove("c.example.org"));
	assert.equal(words(live), "Removed b.example.org");
	// removing the last one: the one before it
	click(remove("d.example.org"));
	assert.equal(doc.activeElement, remove("c.example.org"));
	click(remove("c.example.org"));
	assert.equal(doc.activeElement, remove("a.example.org"));
	click(remove("a.example.org"));
	assert.equal(doc.activeElement, input, "nothing left to remove: the box");
	assert.match(words(s.el), /No site is allowed yet\./);
	// a bad site is said and keeps the box as it is
	typeInto(input, "http://nope.example.org");
	press(input, "Enter");
	assert.equal(words(s.el.querySelector('[role="alert"]')), "Only https sites can be allowed.");
	assert.equal(input.value, "http://nope.example.org");
	// the suggestions are said too, and the focus stays on the button
	const sugg = btn(s.el, "Add suggested services");
	sugg.focus();
	click(sugg);
	assert.equal(words(live), "Added 4 suggested sites.");
	assert.equal(doc.activeElement, sugg);
	s.done();
});

test("a change made elsewhere (the card) redraws only the list on a settings page that is showing", () => {
	const s = tab({ allowedMediaHosts: ["a.example.org"] });
	const input = s.el.querySelector('input[type="text"]');
	input.focus();
	s.media.addVault("b.example.org");
	assert.equal(s.el.querySelector('input[type="text"]'), input);
	assert.equal(doc.activeElement, input, "focus is not taken");
	assert.deepEqual(rows(s.el).filter(Boolean).slice(0, 2), ["a.example.org", "b.example.org"]);
	s.done();
});

test("a data.json key called __proto__ is kept as a key, not taken as a prototype; unknown keys survive exactly", async () => {
	const raw = JSON.parse('{"__proto__": {"polluted": true}, "other": [1, {"a": 2}], "allowedMediaHosts": ["youtube.com"]}');
	const { media, saved } = lists(raw);
	assert.equal({}.polluted, undefined);
	media.addVault("vimeo.com");
	await flush();
	const out = saved.at(-1);
	assert.deepEqual(Object.keys(out), ["__proto__", "other", "allowedMediaHosts", "noteAllows"]);
	assert.deepEqual(JSON.parse(JSON.stringify(out)).__proto__, { polluted: true });
	assert.deepEqual(out.other, [1, { a: 2 }]);
	assert.equal(Object.getPrototypeOf(media.toData()), Object.prototype, "what is handed on is an ordinary object");
});

test("a deleted note's list is forgotten, and a folder deleted takes the lists under it; others stay", async () => {
	const { media, saved } = lists({ noteAllows: { "Dir/A.md": ["a.example.org"], "Dir/Sub/B.md": ["b.example.org"], "Dir2/C.md": ["c.example.org"], "D.md": ["d.example.org"] } });
	media.forgetNote("D.md");
	media.forgetNote("Dir");
	await flush();
	assert.deepEqual(saved.at(-1).noteAllows, { "Dir2/C.md": ["c.example.org"] });
	const n = saved.length;
	media.forgetNote("Never had one.md");
	await flush();
	assert.equal(saved.length, n, "nothing to forget, nothing saved");
});

test("a data.json that cannot be read does not stop the plugin: empty lists, a Notice, the file left alone until a list changes; a deleted note is forgotten", async () => {
	const { BookletPlugin } = await import("./.build/view.mjs");
	const on = {};
	const app = {
		workspace: { on: (name, fn) => ((on[name] = fn), {}), getLeavesOfType: () => [], onLayoutReady() {} },
		metadataCache: { on: () => ({}) },
		vault: { on: (name, fn) => ((on["vault:" + name] = fn), {}) },
		loadLocalStorage: () => null,
		saveLocalStorage() {},
	};
	const plugin = new BookletPlugin(app, {});
	plugin.savedData = { allowedMediaHosts: ["youtube.com"] };
	let writes = 0;
	plugin.loadData = async () => {
		throw new SyntaxError("Unexpected token } in JSON");
	};
	const real = plugin.saveData.bind(plugin);
	plugin.saveData = async (d) => (writes++, real(d));
	Notice.said.length = 0;
	await plugin.onload();
	assert.deepEqual(Notice.said, ["Booklet could not read its saved settings and started with none."]);
	assert.equal(plugin.settingTabs.length, 1, "the plugin loaded");
	assert.deepEqual(plugin.media.vaultList(), []);
	on["vault:rename"]({ path: "New.md" }, "Old.md");
	on["vault:delete"]({ path: "Gone.md" });
	await flush();
	assert.equal(writes, 0, "the bad file is not written over by loading");
	plugin.media.addVault("vimeo.com");
	await flush();
	assert.equal(writes, 1, "it is written when she changes a list");
	// and the delete handler forgets the note's list
	plugin.media.addNote("Gone.md", "media.example.org");
	on["vault:delete"]({ path: "Gone.md" });
	assert.deepEqual(plugin.media.noteList("Gone.md"), []);
	plugin.unload();
});
