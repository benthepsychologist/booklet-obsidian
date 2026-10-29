/*
 * Titles are one line of inline Markdown: words that would start a block ("2026. Mood log" is an ordered list when rendered on its own)
 * are drawn as the words they are, in the trail, on a card, in the screen's head and on home, and a card's number is not doubled.
 * The stand-in renderer below reads a line as Obsidian's does for the cases tested: a line that starts like a list or a heading
 * becomes that block, a backslash takes the next character as it is. Every note is made up.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { core } from "./helpers.mjs";
import { pane } from "./pane.mjs";

const BOOK = `---\nbooklet: "0.16"\ntitle: "2026. Mood log"\n---\n\n> [!activity|a1] 1. First step\n\nHello.\n\n> [!activity|a2] # Second\n\nMore.\n`;

const render = (markdown, el) => {
	const li = /^\s{0,3}(\d{1,9})[.)]\s+(.*)$/.exec(markdown);
	if (li) {
		const ol = el.createEl("ol", { attr: { start: li[1] } });
		ol.createEl("li", { text: li[2] });
		return;
	}
	if (/^\s{0,3}#{1,6}\s/.test(markdown)) {
		el.createEl("h1", { text: markdown.replace(/^\s*#+\s*/, "") });
		return;
	}
	el.appendText(markdown.replace(/\\(.)/g, "$1"));
};

test("inlineMd: a leading number, heading, bullet, quote or rule is escaped, other words are left alone", () => {
	assert.equal(core.inlineMd("2026. Mood log"), "2026\\. Mood log");
	assert.equal(core.inlineMd("1) First"), "1\\) First");
	assert.equal(core.inlineMd("# Second"), "\\# Second");
	assert.equal(core.inlineMd("- one"), "\\- one");
	assert.equal(core.inlineMd("> quote"), "\\> quote");
	assert.equal(core.inlineMd("---"), "\\---");
	assert.equal(core.inlineMd("Week 2. Mood"), "Week 2. Mood");
	assert.equal(core.inlineMd("**Bold** words"), "**Bold** words");
	assert.equal(core.inlineMd("2026"), "2026");
	assert.equal(core.inlineMd("a\nb"), "a b");
});

test("titles that start like a list or a heading are drawn as words on home, in the trail, on a card and in the head", async () => {
	globalThis.__bookletStubRender = render;
	try {
		const p = pane(BOOK);
		await p.settled();
		assert.equal(p.screen, "home");
		assert.equal(p.title(), "2026. Mood log");
		assert.deepEqual(p.cards(), ["1.1. First step", "2.# Second"]);
		assert.equal(p.all(".booklet-cardtitle ol, .booklet-screentitle ol, .booklet-screentitle h1 h1, .booklet-cardtitle h1").length, 0, "no block is drawn in a title");
		await p.card("1.");
		assert.equal(p.screen, "activity:/a1");
		assert.deepEqual(p.trail(), ["2026. Mood log", "1. First step"]);
		assert.equal(p.title(), "1. First step");
		assert.equal(p.all(".booklet-trail ol, .booklet-screentitle ol").length, 0);
		p.close();
	} finally {
		delete globalThis.__bookletStubRender;
	}
});
