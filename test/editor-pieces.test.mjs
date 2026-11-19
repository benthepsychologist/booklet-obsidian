/*
 * The panel's pieces, end to end without Obsidian: every piece is placed twice at a cursor in made-up booklets, as a click would place
 * it, and the real linter reads the result.
 *
 * Two promises are checked. In the piece's own place (a question in an activity, a notice in a module's opening, a module after a
 * module, front matter in an empty note): the note lints with no new error and no new warning, whatever the piece, twice over (so the
 * second copy has ids of its own). Anywhere: no placing, however placed, brings a new id error or id warning (a duplicate id, a tab
 * name used twice, an id with characters an id cannot have, a block or footnote id shared by two modules).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { core, lint, pythonAvailable } from "./helpers.mjs";

const { PIECES, planInsert, applyPlan, FORMAT_VERSION } = core;
const HAVE_LINTER = pythonAvailable();
const skip = HAVE_LINTER ? false : "the linter (BOOKLET_REPO) or python3 is not here";

const FRONT = `---\nbooklet: "${FORMAT_VERSION}"\nid: local/made-up\ntitle: A made-up booklet\nlang: en\nversion: "0.1"\n---\n\n`;
const lineOf = (text, needle) => text.split("\n").findIndex((l) => l.includes(needle));

// made-up booklets, each with the line the cursor is put on
const CONTEXTS = {
	// in an activity, on its question
	activity: () => [FRONT + "> [!module|module-1] M\n\nOne or two sentences about this module.\n\n> [!activity|activity-1] An activity\n\nSome words.\n\n> [!text|text-1] First question\n\n> [!module|module-1 end]\n", "[!text|text-1]"],
	// in a module's opening, before its first activity
	opening: () => [FRONT + "> [!module|module-1] M\n\nOne or two sentences about this module.\n\n> [!activity|activity-1] An activity\n\n> [!text|text-1] First question\n\n> [!module|module-1 end]\n", "One or two sentences"],
	// on a module's end line: after the module
	after: () => [FRONT + "> [!module|module-1] M\n\n> [!activity|activity-1] An activity\n\n> [!text|text-1] First question\n\n> [!module|module-1 end]\n", "module-1 end"],
	// the booklet's own opening, before any module
	top: () => [FRONT + "# A made-up booklet\n\nWords before the first module.\n\n> [!module|module-1] M\n\n> [!activity|activity-1] An activity\n\n> [!text|text-1] First question\n\n> [!module|module-1 end]\n", "# A made-up booklet"],
	// bare activities, no module
	bare: () => [FRONT + "> [!activity|activity-1] An activity\n\nSome words.\n\n> [!choice|choice-1] Pick one\n- [ ] A\n- [ ] B\n", "[!choice|choice-1]"],
	// inside a group's body, on its question
	group: () => [FRONT + "> [!module|module-1] M\n\n> [!activity|activity-1] A\n\n> [!group] Step one\n> Words.\n>\n> > [!choice|choice-1] Pick\n> - [ ] A\n> - [ ] B\n\n> [!module|module-1 end]\n", "> > [!choice|choice-1]"],
	// a module whose records hold answers under ids no line has any more
	records: () => [FRONT + "> [!module|module-1] M\n\n> [!activity|activity-1] A\n\n> [!text|text-1] One\n\n> [!module|module-1 end]\n\n%%\n> [!records] App record — do not edit below this line\n\n> [!records|module-1] M\n\n```booklet answers\n{ \"text-1\": \"kept\", \"text-2\": \"from a deleted question\", \"choice-1\": 2 }\n```\n\n```booklet entries activity-2\n{\"items\": []}\n```\n%%\n", "[!text|text-1]"],
	// an empty note
	empty: () => ["", null],
};

// where each piece belongs; every other piece goes in an activity
const HOME = {
	"Structure - front matter.md": ["empty", 1],
	"Structure - module.md": ["after", 2],
	"Structure - data section.md": ["after", 2],
	"Structure - data section (module).md": ["after", 1], // a module has one data section
	"Structure - notice.md": ["opening", 1], // a module has one notice
	"Structure - theme.md": ["top", 1], // a booklet has one theme
};
const ID_ERROR = /is also used on line|is used twice|is defined twice|is also the id on line|the same as the tab on line|may hold only letters, digits and dashes|id .* is used in .*Booklet reads each in its own module|two pages|the same id/;
const norm = (e) => e.replace(/line \d+/g, "line N");

function insert(doc, needle, piece, times) {
	let text = doc;
	const plans = [];
	for (let k = 0; k < times; k++) {
		const at = needle ? lineOf(text, needle) : 0;
		assert.ok(at >= 0, `the cursor line ${needle} is in the booklet`);
		const plan = planInsert(text, { line: at, ch: 0 }, piece.text);
		text = applyPlan(text, plan);
		plans.push(plan);
	}
	return { text, plans };
}

// each context is linted once
const baseline = new Map();
const base = (doc) => {
	if (!baseline.has(doc)) baseline.set(doc, findings(lint(doc)));
	return baseline.get(doc);
};
const findings = (r) => ({
	errors: r.out.split("\n").filter((l) => l.startsWith("ERROR")).map((l) => l.replace(/^ERROR [^:]*: /, "")),
	warnings: r.out.split("\n").filter((l) => l.startsWith("warn")).map((l) => l.replace(/^warn +[^:]*: /, "")),
});

// what the second run has that the first had not
function fresh(before, after, kind) {
	const had = new Map();
	for (const e of before[kind].map(norm)) had.set(e, (had.get(e) || 0) + 1);
	const out = [];
	for (const e of after[kind]) {
		const n = norm(e);
		if (had.get(n)) had.set(n, had.get(n) - 1);
		else out.push(e);
	}
	return out;
}

test("every context lints with no error before anything is placed", { skip }, () => {
	for (const [name, make] of Object.entries(CONTEXTS)) {
		if (name === "empty") continue;
		const [doc] = make();
		assert.deepEqual(findings(lint(doc)).errors, [], name);
	}
});

for (const piece of PIECES) {
	test(`"${piece.file}", placed in its own place twice, lints clean (no new error or warning)`, { skip }, () => {
		const [where, times] = HOME[piece.file] ?? ["activity", 2];
		const [doc, needle] = CONTEXTS[where]();
		const { text, plans } = insert(doc, needle, piece, times);
		const before = base(doc);
		const after = findings(lint(text));
		// front matter alone is an empty booklet, and the linter says so once; a note is never lint-clean of that until it holds something
		const allowed = piece.file === "Structure - front matter.md" ? ["this booklet holds nothing yet: no module and no activity (it opens as an empty booklet with this name)"] : [];
		assert.deepEqual([fresh(before, after, "errors"), fresh(before, after, "warnings").filter((w) => !allowed.includes(w))], [[], []], `${where}:\n${text}`);
		// the one word left is the new booklet's own name in its front matter (`id: local/new-booklet`), selected for the author to type over
		const left = piece.file === "Structure - front matter.md" ? ["new-booklet"] : [];
		assert.deepEqual(plans.flatMap((p) => p.left), left.concat(times > 1 ? left : []), "nothing is left for the author to fill in: the piece names only what it makes");
		for (const p of plans) for (const id of Object.values(p.assigned)) assert.match(id, /^[a-z][a-z0-9-]*-\d+$|^module-1$|^tab-\d+$/, id);
	});

	test(`"${piece.file}", placed twice anywhere, brings no new id error`, { skip }, () => {
		for (const [name, make] of Object.entries(CONTEXTS)) {
			if (name === "empty") continue;
			const [doc, needle] = make();
			const { text } = insert(doc, needle, piece, 2);
			const before = base(doc);
			const after = findings(lint(text));
			const bad = [...fresh(before, after, "errors"), ...fresh(before, after, "warnings")].filter((e) => ID_ERROR.test(e));
			assert.deepEqual(bad, [], `${name}:\n${text}`);
		}
	});
}
