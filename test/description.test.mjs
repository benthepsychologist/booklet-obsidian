/*
 * `description:` (SPEC 0.17 section 2) is the file's one sentence for whoever shows a description of it. The view shows none (a booklet's
 * card in a list, a search result and a link preview are Obsidian's, not the view's), so the key is read, kept as written and drawn nowhere;
 * the README says so. Every note is made up.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { core, norm } from "./helpers.mjs";
import { pane } from "./pane.mjs";

const SENTENCE = "Why the sea rises twice a day, and a short check.";
const NOTE = `---\nbooklet: "0.18"\nid: example/tides\ntitle: How tides work\ndescription: ${SENTENCE}\nlang: en\n---\n\nThe first paragraph, which is not the description.\n\n> [!module|m] Tides\n\nThe module's opening.\n\n> [!activity|a] The pull\n\nThe moon pulls.\n\n> [!choice|q] Which pulls harder?\n- [ ] The moon\n- [ ] The sun\n\n> [!activity|b] The range\n\nSpring and neap.\n\n> [!module|m end]\n`;

test("description: is read from the front matter as written", () => {
	assert.equal(norm(core.parseBooklet(NOTE).frontMatter).description, SENTENCE);
	assert.equal(core.parseBooklet(NOTE.replace(`description: ${SENTENCE}`, `description: "${SENTENCE}"`)).ok, true);
});

test("the view shows no description of the file on any screen, and does not use the first paragraph as one; a save keeps the key as written", async () => {
	for (const screen of ["home", "module:m", "activity:m/a", "activity:m/b"]) {
		const p = pane(NOTE, { screen });
		await p.settled();
		assert.equal(p.screen, screen);
		assert.ok(!p.el.textContent.includes(SENTENCE), `${screen} shows the description`);
		p.close();
	}
	const saved = core.setAnswer(NOTE, "m", "q", 2);
	assert.ok(saved.startsWith(NOTE), "the front matter and the body come back byte for byte");
	assert.equal(norm(core.parseBooklet(saved).frontMatter).description, SENTENCE);
});
