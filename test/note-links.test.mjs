/*
 * Links in a note's own words that are Obsidian's: a click on a link to another note opens it as Obsidian opens it
 * (`openLinkText`, in a new pane with Ctrl or Cmd), and the pointer over one asks for Reading view's hover preview.
 * A heading link, a link to a module and an address with a scheme stay as they were. Run in Node over a jsdom document;
 * Obsidian's renderer is stood in for by a few lines. Every note is made up. The `.booklet-page` rule that lets prose
 * be selected is read from styles.css.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { click, window as w } from "./dom.mjs";
import { pane } from "./pane.mjs";

/** [[target]] and [[target|words]] become internal links; <https://...> becomes an external link, as Obsidian draws them. */
function render(markdown, el) {
	const re = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]|<(https?:[^>]+)>/g;
	let at = 0;
	let m;
	while ((m = re.exec(markdown))) {
		if (m.index > at) el.appendText(markdown.slice(at, m.index));
		if (m[3]) el.createEl("a", { cls: "external-link", text: m[3], attr: { href: m[3], target: "_blank", rel: "noopener" } });
		else el.createEl("a", { cls: "internal-link", text: m[2] ?? m[1].replace(/^#/, ""), attr: { href: m[1], "data-href": m[1] } });
		at = re.lastIndex;
	}
	if (at < markdown.length) el.appendText(markdown.slice(at));
}

const TEXT = `---\nbooklet: "0.19"\ntitle: Links\n---\n\n> [!module|one] One\n\n> [!activity|a] Alpha\n\nSee [[Harbour notes]] and [[Harbour notes|the harbour]] and [[Harbour notes#Tides]] and [[Harbour notes#^b1]] and [[Folder/Boat log]] and [[#Beta]] and [[two.booklet]] and <https://example.org/page>.\n\n> [!activity|b] Beta\n\nBeta words.\n\n> [!module|one end] E\n\n> [!module|two] Two\n\n> [!activity|c] Gamma\n\nGamma words.\n\n> [!activity|d] Delta\n\nMore.\n\n> [!module|two end] E\n`;

async function open() {
	globalThis.__bookletStubRender = render;
	const p = pane(TEXT, { path: "Notes/Links.booklet.md", screen: "activity:one/a" });
	await p.settled();
	const calls = { open: [], hover: [] };
	const ws = p.leaf.app.workspace;
	ws.openLinkText = async (...args) => void calls.open.push(args);
	ws.trigger = (...args) => void calls.hover.push(args);
	const link = (data) => p.all(".booklet-pagebody a").find((a) => a.getAttribute("data-href") === data);
	return { p, calls, link };
}

const done = (p) => {
	p.close();
	delete globalThis.__bookletStubRender;
};

test("a click on a link to a note opens it with the link text, the note's path and false", async () => {
	const { p, calls, link } = await open();
	try {
		const evt = click(link("Harbour notes"));
		assert.deepEqual(calls.open, [["Harbour notes", "Notes/Links.booklet.md", false]]);
		assert.equal(evt.defaultPrevented, true);
		// an alias is the same link: the text opened is the target, not the words shown
		click(p.all(".booklet-pagebody a").find((a) => a.textContent === "the harbour"));
		assert.deepEqual(calls.open[1], ["Harbour notes", "Notes/Links.booklet.md", false]);
		assert.equal(p.disk.writes, 0);
	} finally {
		done(p);
	}
});

test("with Ctrl or Cmd the third argument asks for a new pane", async () => {
	const { p, calls, link } = await open();
	try {
		for (const key of ["ctrlKey", "metaKey"]) {
			link("Harbour notes").dispatchEvent(new w.MouseEvent("click", { bubbles: true, cancelable: true, [key]: true }));
		}
		assert.equal(calls.open.length, 2);
		for (const c of calls.open) assert.ok(c[2], "a truthy third argument");
	} finally {
		done(p);
	}
});

test("a link to a heading or a block in another note passes its whole text; a folder path too", async () => {
	const { p, calls, link } = await open();
	try {
		click(link("Harbour notes#Tides"));
		click(link("Harbour notes#^b1"));
		click(link("Folder/Boat log"));
		assert.deepEqual(
			calls.open.map((c) => c[0]),
			["Harbour notes#Tides", "Harbour notes#^b1", "Folder/Boat log"],
		);
	} finally {
		done(p);
	}
});

test("a heading link and a module link do what they did, and neither goes to Obsidian", async () => {
	const { p, calls, link } = await open();
	try {
		click(link("#Beta"));
		await p.settled();
		assert.equal(p.screen, "activity:one/b");
		await p.back();
		assert.equal(p.screen, "activity:one/a");
		click(link("two.booklet"));
		await p.settled();
		assert.equal(p.screen, "module:two");
		assert.deepEqual(calls.open, []);
	} finally {
		done(p);
	}
});

test("an address with a scheme is not intercepted", async () => {
	const { p, calls } = await open();
	try {
		const a = p.all(".booklet-pagebody a.external-link")[0];
		assert.ok(a);
		const evt = click(a);
		assert.equal(evt.defaultPrevented, false);
		assert.deepEqual(calls.open, []);
		a.dispatchEvent(new w.MouseEvent("mouseover", { bubbles: true }));
		assert.deepEqual(calls.hover, [], "no hover preview for it");
	} finally {
		done(p);
	}
});

test("the pointer over a link to a note asks for the hover preview, with the fields Reading view gives", async () => {
	const { p, calls, link } = await open();
	try {
		const a = link("Harbour notes#Tides");
		const evt = new w.MouseEvent("mouseover", { bubbles: true, cancelable: true });
		a.dispatchEvent(evt);
		assert.equal(calls.hover.length, 1);
		const [name, data] = calls.hover[0];
		assert.equal(name, "hover-link");
		assert.equal(data.event, evt);
		assert.equal(data.source, "preview");
		assert.equal(data.hoverParent, p.view);
		assert.equal(data.targetEl, a);
		assert.equal(data.linktext, "Harbour notes#Tides");
		assert.equal(data.sourcePath, "Notes/Links.booklet.md");
		// a heading link and a module link are the view's own: no preview for them
		link("#Beta").dispatchEvent(new w.MouseEvent("mouseover", { bubbles: true }));
		link("two.booklet").dispatchEvent(new w.MouseEvent("mouseover", { bubbles: true }));
		assert.equal(calls.hover.length, 1);
	} finally {
		done(p);
	}
});

test("a link inside a button gets no hover preview: the press picks the option", async () => {
	globalThis.__bookletStubRender = render;
	const text = `---\nbooklet: "0.19"\ntitle: Links\n---\n\n> [!activity|a] Alpha\n\n> [!choice|q] Pick\n- [ ] [[Harbour notes]]\n- [ ] Other\n\nSee [[Harbour notes]].\n`;
	const p = pane(text, { screen: "activity:/a" });
	await p.settled();
	const calls = [];
	p.leaf.app.workspace.trigger = (...args) => void calls.push(args);
	try {
		const inButton = p.all("button a.internal-link")[0];
		assert.ok(inButton, "the option holds a link");
		inButton.dispatchEvent(new w.MouseEvent("mouseover", { bubbles: true }));
		assert.deepEqual(calls, []);
		const inProse = p.all(".booklet-prose a.internal-link")[0];
		inProse.dispatchEvent(new w.MouseEvent("mouseover", { bubbles: true }));
		assert.equal(calls.length, 1, "a link in the prose still asks for it");
	} finally {
		done(p);
	}
});

test("prose can be selected: styles.css lets .booklet-page take a selection", () => {
	const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
	const rule = /\.booklet-page \{[^}]*user-select:\s*text;[^}]*\}/.exec(css)?.[0] ?? "";
	assert.match(rule, /user-select:\s*text/);
	assert.match(rule, /-webkit-user-select:\s*text/);
});

test("a link a part of the view has already taken is not opened a second time", async () => {
	const { p, calls, link } = await open();
	try {
		const a = link("Harbour notes");
		a.addEventListener("click", (evt) => evt.preventDefault());
		click(a);
		assert.deepEqual(calls.open, []);
	} finally {
		done(p);
	}
});
