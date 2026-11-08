/*
 * The styles for adding and removing rows, read as text: every class the view draws has a rule in the base sheet (Obsidian's own look),
 * the Paper look pills the buttons and gives the warning confirm its own colours, the rules use the theme's tokens and no colour of their
 * own, and print shows none of the controls.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const base = readFileSync(new URL("../styles.base.css", import.meta.url), "utf8");
const structure = readFileSync(new URL("../themes/structure.css", import.meta.url), "utf8");
const built = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
const rowAsk = readFileSync(new URL("../src/row-ask.ts", import.meta.url), "utf8");
const queryView = readFileSync(new URL("../src/query-view.ts", import.meta.url), "utf8");

/** The part of the base sheet this feature wrote: from its comment to the print block's start. */
const mine = base.slice(base.indexOf("/* adding and removing rows (row-ask.ts)"), base.indexOf(".booklet-print-value,\n.booklet-edit-print"));
const printBlock = base.slice(base.indexOf("@media print {\n\t.booklet-row-controls"));

test("every class of the add form and the Remove control that the view draws has a rule in the base sheet", () => {
	const used = new Set();
	for (const src of [rowAsk, queryView]) for (const m of src.matchAll(/"([^"\n]*booklet-[^"\n]*)"/g)) for (const c of m[1].split(" ")) if (/^booklet-(row-(add|remove|act)|q-act)/.test(c)) used.add(c);
	assert.ok(used.size >= 10, `found the classes the view draws (${[...used].join(", ")})`);
	// booklet-row-act is the hook of the Paper look's pills (every button), so it needs no rule of its own in the base sheet
	// the buttons' own names (open, go, cancel, yes, no) are hooks for the tests and for focus, drawn by the shared rules
	for (const c of used) if (c !== "booklet-row-act" && !/-(open|go|cancel|yes|no)$/.test(c)) assert.ok(mine.includes(`.${c}`) || base.includes(`.${c}`), `${c} has a rule`);
});

test("the rules use the theme's tokens: no colour of their own, nothing !important, no inline style", () => {
	assert.ok(mine.length > 1500, "the block was found");
	assert.doesNotMatch(mine, /#[0-9a-fA-F]{3,8}\b/, "no hex colour");
	assert.doesNotMatch(mine, /\brgba?\(|\bhsla?\(/, "no colour function of its own");
	assert.doesNotMatch(mine, /!important/);
	assert.match(mine, /var\(--background-modifier-border\)/);
	assert.match(mine, /var\(--size-4-2\)/);
});

test("the Paper look draws the form as its card and the confirm as its amber warning, for both of its looks", () => {
	assert.match(structure, /\[data-booklet-look\^="paper"\] \.booklet-row-addform \{[^}]*var\(--bk-card\)/);
	assert.match(structure, /\[data-booklet-look\^="paper"\] \.booklet-row-remove button\.mod-warning,/);
	assert.match(structure, /\[data-booklet-look\^="paper"\] \.booklet-row-remove button\.mod-warning:hover \{[^}]*var\(--bk-hmm-wash\)/);
	// the pill rule is for every button but a short list of words-as-buttons, and Add and Remove are not on it
	const except = /button:where\(:not\(([^)]*)\)\)/.exec(structure)[1];
	assert.doesNotMatch(except, /row-act|row-add|row-remove/);
});

test("Obsidian's own look: the warning confirm is white words on a darkened red, in a light theme and a dark one", () => {
	assert.match(mine, /\.booklet-view \.booklet-row-remove button\.mod-warning,\n\.booklet-view \.booklet-row-remove button\.mod-warning:hover \{\n\tbackground: var\(--background-modifier-error\);\n\tcolor: var\(--text-on-accent\);/);
	assert.match(mine, /\.theme-light \.booklet-view \.booklet-row-remove button\.mod-warning/);
	assert.match(mine, /\.theme-dark \.booklet-view \.booklet-row-remove button\.mod-warning/);
});

test("print shows none of the controls: the Add button, the form, the Remove control, the quiet line and the Remove column", () => {
	for (const sel of [".booklet-row-add", ".booklet-row-remove", ".booklet-row-add-quiet", ".booklet-q-table .booklet-q-act"]) assert.ok(printBlock.slice(0, printBlock.indexOf("}")).includes(sel), `${sel} is hidden in print`);
	assert.match(printBlock.slice(0, printBlock.indexOf("}")), /display: none;/);
});

test("the narrow column of Remove buttons keeps a table's other columns their room", () => {
	assert.match(mine, /\.booklet-q-table td\.booklet-q-act \{[^}]*width: 1%;[^}]*white-space: nowrap;/);
});

test("the Remove question wraps inside a width of its own, and on a narrow screen the Remove column stays in view (contract 8.10)", () => {
	// the question is in the narrow column that holds nowrap: it must say white-space: normal, with room to wrap in and a limit
	const q = /\.booklet-row-remove-q \{([^}]*)\}/.exec(mine)[1];
	assert.match(q, /white-space: normal;/);
	assert.match(q, /min-width: \d/);
	assert.match(q, /max-width: \d/);
	assert.match(q, /overflow-wrap: anywhere;/);
	// in a narrow screen's table the column is pinned to the end of the visible box, with the page's own background so words do not show through
	const narrow = /@media \(max-width: \d+px\) \{([\s\S]*?\n\})/.exec(mine.slice(mine.indexOf(".booklet-q-table th.booklet-q-act")));
	assert.ok(narrow, "a rule for a narrow screen");
	assert.match(narrow[1], /td\.booklet-q-act/);
	assert.match(narrow[1], /position: sticky;/);
	assert.match(narrow[1], /inset-inline-end: 0;/);
	assert.match(narrow[1], /background-color: var\(--background-primary\);/);
});

test("the built sheet carries them", () => {
	assert.ok(built.includes(mine.trim().slice(0, 200)));
	assert.ok(built.includes(".booklet-view[data-booklet-look^=\"paper\"] .booklet-row-addform"));
});
