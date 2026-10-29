/*
 * A heading link that several places could answer opens the first one in the file's order (design decision 9, call c; the prototype
 * took reading order, the design changed it). Every note here is made up.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { core, norm } from "./helpers.mjs";

const head = `---\nbooklet: "0.16"\ntitle: Order\n---\n`;
const find = (text, words, scope = null) => {
	const book = core.parseBooklet(text);
	return norm(core.findHeading(core.buildNav(book, text), words, scope));
};

test("the same words in two activities: the earlier one in the file wins, whichever way round", () => {
	const act = (id, title, extra) => `> [!activity|${id}] ${title}\n\nSome words.\n\n${extra}\n`;
	const shared = "## Shared words\n\nUnder it.";
	const first = `${head}\n${act("one", "One", shared)}\n${act("two", "Two", shared)}`;
	assert.equal(find(first, "Shared words").place.screen, "activity:/one");
	const swapped = `${head}\n${act("two", "Two", shared)}\n${act("one", "One", shared)}`;
	assert.equal(find(swapped, "Shared words").place.screen, "activity:/two");
});

test("the same words as a module's tab name and as a heading: whichever comes first in the file wins", () => {
	const mod = (id, tabs, body) => `> [!module|${id}] Module ${id}\n\n${tabs.map((t) => `> [!tab] ${t}\n`).join("\n")}\n${body}\n> [!module|${id} end] End\n`;
	const plain = (id) => `> [!activity|${id}] Activity ${id}\n\n## Notes\n\nA heading.\n`;
	const other = "> [!activity|c] Activity c\n\nNothing to find.\n";
	// the module with the tab comes first
	const tabFirst = `${head}\n${mod("m", ["Notes", "Other"], plain("a") + "\n" + other)}\n${plain("b")}`;
	assert.equal(find(tabFirst, "Notes").place.screen, "module:m");
	// the activity with the heading comes first
	const headingFirst = `${head}\n${plain("b")}\n${mod("m", ["Notes", "Other"], plain("a") + "\n" + other)}`;
	assert.equal(find(headingFirst, "Notes").place.screen, "activity:/b");
});
