/*
 * Leaving a screen with words typed and not written: every way out of it writes them first (typed answers) or adds them
 * (words in "Add your own"), as before the move. In a real pane removing the focused field fires its blur, which does the same;
 * these tests have no blur, so they hold the view's own flush to account, route by route. Every note is made up.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { window as w } from "./dom.mjs";
import { pane, sleep, sleepFor } from "./pane.mjs";

const BOOK = `---
booklet: "0.16"
title: Probe
---

> [!activity|a1] First

> [!tab] One

P1.

***

P2 with the questions.

> [!text|t1] Say it

> [!multi|m1 open] Pick some. Add your own.
- [ ] Pencil
- [ ] Ruler

> [!tab] Two

Other tab.

> [!activity|a2] Second

> [!text|t2] Second words
`;

const FIELDS = {
	"typed answer": { words: "typed-words-123", field: (p) => p.all("[data-booklet-q='t1'] input.booklet-text")[0] },
	"words of the reader's own": { words: "own-words-456", field: (p) => p.all("[data-booklet-q='m1'] input.booklet-text")[0] },
};

const ROUTES = {
	"the pager's Back": async (p) => p.pageBack(),
	"another tab": async (p) => p.tab("Two"),
	"the trail": async (p) => p.trailTo("Probe"),
	"Next, to the next activity": async (p) => p.pageNext(),
	"Obsidian's Back": async (p) => p.back(),
	"a link from another note": async (p) => {
		p.view.setEphemeralState({ subpath: "#Second" });
		await p.settled();
	},
};

for (const [route, leave] of Object.entries(ROUTES)) {
	for (const [kind, { words, field }] of Object.entries(FIELDS)) {
		test(`leaving by ${route} with a ${kind} typed and not written: it is in the note`, async () => {
			const p = pane(BOOK, { screen: "activity:/a1" });
			await sleepFor(p);
			await p.pageNext(); // page 2 of tab One (a step, so Obsidian's Back has somewhere to go)
			const input = field(p);
			assert.ok(input, "the field is drawn");
			input.value = words;
			input.dispatchEvent(new w.Event("input", { bubbles: true }));
			assert.ok(!p.disk.text.includes(words), "not written yet");
			await leave(p);
			await sleep(40);
			await p.view.writes;
			assert.ok(p.disk.text.includes(words), `the note holds ${words} after leaving by ${route}: ${p.disk.text}`);
			p.close();
		});
	}
}
