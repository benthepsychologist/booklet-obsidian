/*
 * The rows of a choice, a multi, a shared menu and a matrix (core/design-options.ts), and what a change of them leaves not matching.
 * No view: lines in, lines out. The rows are only offered for a block they can write back byte for byte, so the round trip is held
 * against every such block in the format's spec, in this repo's test booklets and in the format repository's examples and fixtures.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { core, bookletAround, BOOKLET } from "./helpers.mjs";
import { fixtureFiles } from "./fixtures.mjs";

const { parseDesign, walkDesign, blockLines, readRows, writeRows, editRows, rowsKindOf, chooseMenu, menusVisibleTo, menuUsers, changeLines, impactOf, needsAsking } = core;

const L = (s) => s.split("\n");
const rows = (text, kind) => {
	const r = readRows(L(text), kind);
	assert.ok(!("refused" in r), `rows are offered: ${r.refused}`);
	return r;
};
/** The lines after one edit. */
const after = (text, kind, edit) => {
	const made = editRows(rows(text, kind), edit);
	assert.equal(made.ok, true, made.reason);
	return made.lines.join("\n");
};
const refusal = (text, kind) => {
	const r = readRows(L(text), kind);
	assert.ok("refused" in r, `refused: ${text}`);
	assert.ok(r.refused.length > 20, "a reason in words");
	return r.refused;
};

// ---------------------------------------------------------------- the round trip over everything written down

/** The notes of the places the format and the plugin keep their examples. */
function notesUnder(dir, out = []) {
	if (!existsSync(dir)) return out;
	for (const f of readdirSync(dir)) {
		if (f === "node_modules" || f === ".git" || f === ".build" || f.startsWith("__")) continue;
		const p = join(dir, f);
		if (statSync(p).isDirectory()) notesUnder(p, out);
		else if (/\.md$/.test(f) && f !== "SPEC.md") out.push(p);
	}
	return out;
}

/** Every fenced markdown example of the spec, as its own text. */
function specExamples() {
	const p = join(BOOKLET, "SPEC.md");
	if (!existsSync(p)) return [];
	const text = readFileSync(p, "utf8");
	return [...text.matchAll(/^ *```markdown\n([\s\S]*?)\n *```/gm)].map((m) => m[1].replace(/^ {2}/gm, ""));
}

/** [source, text] of every note and example looked at. */
function corpus() {
	const out = [];
	for (const f of fixtureFiles()) if (f.path.endsWith(".md")) out.push([`fixtures/${f.path}`, f.text]);
	for (const f of notesUnder(BOOKLET)) out.push([f, readFileSync(f, "utf8")]);
	specExamples().forEach((t, i) => out.push([`SPEC example ${i + 1}`, t]));
	return out;
}

test("every choice, multi, menu and matrix in the spec and the test booklets: the rows write back byte for byte, or are refused in words", () => {
	let offered = 0;
	const refused = [];
	const kinds = new Set();
	for (const [source, text] of corpus()) {
		let root;
		try {
			root = parseDesign(text, { lenient: true });
		} catch {
			continue;
		}
		for (const n of walkDesign(root)) {
			if (n.kind !== "question" && n.kind !== "menu") continue;
			const kind = n.kind === "menu" ? "menu" : n.detail;
			if (!["choice", "multi", "matrix", "menu"].includes(kind)) continue;
			const lines = blockLines(text, n);
			assert.equal(rowsKindOf(lines), kind, `${source}:${n.start + 1} is a ${kind}`);
			const r = readRows(lines, kind);
			if ("refused" in r) {
				assert.ok(r.refused.length > 20, "a reason in words");
				refused.push(`${source}:${n.start + 1}: ${r.refused}`);
				continue;
			}
			offered++;
			kinds.add(kind);
			assert.deepEqual(writeRows(r), lines, `${source}:${n.start + 1} writes back as it was read`);
			// an edit that changes nothing changes nothing
			if (r.kind === "matrix" ? r.items.length : r.kind === "menu" ? r.items.length : r.options.length) {
				const same = editRows(r, r.kind === "matrix" || r.kind === "menu" ? { what: "item-text", index: 0, text: r.items[0].text } : { what: "option-text", index: 0, text: r.options[0].text });
				assert.equal(same.ok, true);
				assert.deepEqual(same.lines, lines, `${source}:${n.start + 1} an edit to the same words is no change`);
			}
		}
	}
	assert.ok(offered > 20, `${offered} blocks offered rows`);
	assert.deepEqual([...kinds].sort(), ["choice", "matrix", "menu", "multi"], "all four kinds were met");
	// what is refused is rare, and every refusal is one of the shapes the rows cannot show without changing what is written
	assert.ok(refused.length <= 6, `${refused.length} refused:\n${refused.join("\n")}`);
	for (const why of refused) assert.match(why, /menu|checkbox|blank line|options of its own|Markdown/, why);
});

// ---------------------------------------------------------------- the shapes that are not offered

const Q = "> [!choice|q] Which?\n";

test("a shape the rows could only show by changing what is written is refused, in words, and never rewritten", () => {
	const cases = {
		"a tab": `${Q}-\t[ ] One\n- [ ] Two`,
		"a blank line between two options": `${Q}- [ ] One\n\n- [ ] Two`,
		"a blank line between an option and its reply": `${Q}- [ ] One\n\n  - Said`,
		"two blank lines under the question": `${Q}\n\n- [ ] One`,
		"a reply that goes on over a second line": `${Q}- [ ] One\n  - Said\n    and more`,
		"a reply nested deeper than another": `${Q}- [ ] One\n  - Said\n    - Deeper`,
		"options at two indents": `${Q}- [ ] One\n - [ ] Two`,
		"a line that is no part of the list": `${Q}- [ ] One\nA paragraph`,
		"a bullet that is no option, first": `${Q}- One\n- Two`,
		"a bullet written less far in than its option": `${Q}  - [ ] One\n - Said`,
		"a stray carriage return": `${Q}- [ ] One\r\n- [ ] Two`,
		"a question with options and a shared menu": "> [!choice|q menu:places] Which?\n- [ ] One",
	};
	for (const [name, text] of Object.entries(cases)) {
		const r = readRows(L(text), "choice");
		assert.ok("refused" in r, name);
		assert.match(r.refused, /\w{4,} \w{3,} \w{3,}/, `${name} has a reason in words`);
	}
	assert.match(refusal("> [!menu|m]\n- One\n\n- Two", "menu"), /blank line/);
	assert.match(refusal("> [!menu|m]\n- [x] One", "menu"), /checkbox/);
	assert.match(refusal("> [!menu|m]\n- One\n  - Deeper\n- Two", "menu"), /same indent/);
	assert.match(refusal("> [!menu|m]\n1. One", "menu"), /cannot show/);
	assert.match(refusal("> [!matrix|m] M\n- A\n\n\n0. Zero", "matrix"), /two blank lines/);
	assert.match(refusal("> [!matrix|m] M\n- A\n\n0. Zero\n 1. One", "matrix"), /indent/);
	assert.match(refusal("> [!matrix|m] M\n- A\n\n0. Zero\nfree words", "matrix"), /cannot show/);
	assert.match(refusal("> > [!choice|q] Which?\n> > - [ ] One", "choice"), /extra/);
	// a line that is not of the kind asked for
	assert.match(refusal("> [!text|q] Which?", "choice"), /not a Booklet line of this kind/);
	assert.equal(rowsKindOf(L("> [!text|q] Which?")), null);
	assert.equal(rowsKindOf(L("> [!module|end]")), null);
	assert.equal(rowsKindOf(L("> [!Multi|q open] Which?")), "multi", "a kind is read without regard to case");
});

test("what is unusual but lossless is offered: other bullets, a capital X, two spaces, help lines, a hint under the question", () => {
	const text = [
		"> [!multi|q open] Which? ",
		"> Help words, as the reader shows them.",
		"* [ ]  One   ",
		"  + Said once",
		"  + Said twice",
		"* [X] Two",
		"* [x] Three",
		"",
		"> [!hint]- A hint",
		"> Think.",
	].join("\n");
	const r = rows(text, "multi");
	assert.equal(r.head.length, 2, "the help line is part of the head");
	assert.deepEqual(r.options.map((o) => [o.text, o.mark, o.replies.length]), [["One   ", " ", 2], ["Two", "X", 0], ["Three", "x", 0]]);
	assert.equal(r.tail.length, 3, "the blank line and the hint are kept as written");
	assert.equal(writeRows(r).join("\n"), text);
	// turning the correct mark to what it already is leaves a capital as it is
	assert.equal(after(text, "multi", { what: "option-correct", index: 1, on: true }), text);
	assert.match(after(text, "multi", { what: "option-correct", index: 1, on: false }), /\* \[ \] Two/);
	// a note with its line endings stripped, as the view hands it
	assert.equal(readRows(L("> [!choice|q] Q\n- [ ] A\n\n> [!solution]- S\n> Because."), "choice").tail.length, 3);
});

// ---------------------------------------------------------------- editing a choice

const CHOICE = ["> [!choice|where] Where are you right now?", "- [ ] Calm", "  - That is the settling system at work.", "- [x] Wound up", "  - That is the activating, unpleasant family.", "  - It is also useful.", "- [ ] Numb"].join("\n");

test("a row that is not touched comes out byte for byte as it was, and a new row takes its neighbour's style", () => {
	const text = "> [!choice|q] Q\n * [ ]   One\n   * Said\n * [x]   Two";
	assert.equal(after(text, "choice", { what: "option-text", index: 0, text: "First" }), "> [!choice|q] Q\n * [ ]   First\n   * Said\n * [x]   Two");
	assert.equal(after(text, "choice", { what: "option-add" }), `${text}\n * [ ]   `);
	assert.equal(after(text, "choice", { what: "reply-add", index: 1 }), `${text}\n   * `);
	assert.equal(after(text, "choice", { what: "reply-add", index: 0 }), "> [!choice|q] Q\n * [ ]   One\n   * Said\n   * \n * [x]   Two");
	assert.equal(after(CHOICE, "choice", { what: "option-add" }), `${CHOICE}\n- [ ] `);
	// a first reply of a question that has none is written as far in as the option's own words start
	assert.equal(after("> [!choice|q] Q\n- [ ] One", "choice", { what: "reply-add", index: 0 }), "> [!choice|q] Q\n- [ ] One\n  - ");
	assert.equal(after("> [!choice|q] Q", "choice", { what: "option-add" }), "> [!choice|q] Q\n- [ ] ");
});

test("text, the correct mark, replies, moving and removing: each changes its own lines and nothing else", () => {
	assert.equal(after(CHOICE, "choice", { what: "option-text", index: 2, text: "Flat" }).split("\n").at(-1), "- [ ] Flat");
	assert.equal(after(CHOICE, "choice", { what: "option-correct", index: 0, on: true }).split("\n")[1], "- [x] Calm");
	assert.equal(after(CHOICE, "choice", { what: "option-correct", index: 1, on: false }).split("\n")[3], "- [ ] Wound up");
	assert.equal(after(CHOICE, "choice", { what: "reply-text", index: 1, reply: 1, text: "Often useful." }).split("\n")[5], "  - Often useful.");
	assert.equal(after(CHOICE, "choice", { what: "reply-remove", index: 1, reply: 0 }), CHOICE.replace("  - That is the activating, unpleasant family.\n", ""));
	// a move takes the option with its replies
	assert.equal(after(CHOICE, "choice", { what: "option-move", index: 1, by: -1 }).split("\n").slice(1, 6).join("|"), "- [x] Wound up|  - That is the activating, unpleasant family.|  - It is also useful.|- [ ] Calm|  - That is the settling system at work.");
	assert.equal(after(CHOICE, "choice", { what: "option-move", index: 0, by: 1 }).split("\n")[1], "- [x] Wound up");
	assert.equal(after(CHOICE, "choice", { what: "option-remove", index: 1 }), "> [!choice|where] Where are you right now?\n- [ ] Calm\n  - That is the settling system at work.\n- [ ] Numb");
	// the last option of a question that had a blank line above its list takes the blank line with it
	assert.equal(after("> [!choice|q] Q\n\n- [ ] One", "choice", { what: "option-remove", index: 0 }), "> [!choice|q] Q");
	assert.equal(after("> [!choice|q] Q\n\n- [ ] One\n- [ ] Two", "choice", { what: "option-add" }), "> [!choice|q] Q\n\n- [ ] One\n- [ ] Two\n- [ ] ");
	// the edges
	assert.equal(editRows(rows(CHOICE, "choice"), { what: "option-move", index: 0, by: -1 }).ok, false);
	assert.equal(editRows(rows(CHOICE, "choice"), { what: "option-move", index: 2, by: 1 }).ok, false);
	assert.equal(editRows(rows(CHOICE, "choice"), { what: "option-remove", index: 9 }).ok, false);
});

test("words a person types are one line; a reply that the format would read as an option is refused with nothing changed", () => {
	assert.equal(after(CHOICE, "choice", { what: "option-text", index: 0, text: "  Two\nlines" }).split("\n")[1], "- [ ] Two lines");
	const bad = editRows(rows(CHOICE, "choice"), { what: "reply-text", index: 0, reply: 0, text: "[ ] Not a reply" });
	assert.equal(bad.ok, false);
	assert.match(bad.reason, /read that text as something other/);
	// the draft being typed into ends up as the rows say: an empty text is allowed (the option is empty until it is filled in)
	assert.equal(after(CHOICE, "choice", { what: "option-text", index: 2, text: "" }).split("\n").at(-1), "- [ ] ");
	assert.equal(editRows(rows(CHOICE, "choice"), { what: "item-add" }).ok, false, "an edit of another kind is refused");
});

test("a question with a shared menu has no options of its own to add to; naming one puts the options away and taking it off gives them back", () => {
	const named = chooseMenu(L(CHOICE), "places", null);
	assert.equal(named.ok, true);
	assert.deepEqual(named.lines, ["> [!choice|where menu:places] Where are you right now?"]);
	assert.equal(named.stash.length, 6, "the options and their replies are kept to give back");
	const r = rows(named.lines.join("\n"), "choice");
	assert.equal(r.menu, "places");
	assert.equal(editRows(r, { what: "option-add" }).ok, false);
	const back = chooseMenu(named.lines, null, named.stash);
	assert.equal(back.ok, true);
	assert.equal(back.lines.join("\n"), CHOICE, "the options come back as they were, bytes and all");
	assert.equal(back.stash, null);
	// taken off with nothing put away: the line is as it was, and the question has no options
	assert.deepEqual(chooseMenu(named.lines, null, null).lines, ["> [!choice|where] Where are you right now?"]);
	// a menu named and the options of a question that has none of its own to put away
	assert.deepEqual(chooseMenu(["> [!multi|x open] Q"], "places", null).lines, ["> [!multi|x open menu:places] Q"]);
	// a hint under the question stays under it
	const hinted = `${CHOICE}\n\n> [!hint]- H\n> Think.`;
	const withMenu = chooseMenu(L(hinted), "places", null);
	assert.deepEqual(withMenu.lines, ["> [!choice|where menu:places] Where are you right now?", "", "> [!hint]- H", "> Think."]);
	assert.equal(chooseMenu(withMenu.lines, null, withMenu.stash).lines.join("\n"), hinted);
	// a question whose options the rows cannot show is not touched
	assert.equal(chooseMenu(L("> [!choice|q] Q\n- [ ] A\n\n- [ ] B"), "places", null).ok, false);
	assert.equal(chooseMenu(L("> [!text|q] Q"), "places", null).ok, false);
});

// ---------------------------------------------------------------- a menu and a matrix

test("a shared menu's items are rows: text, move, remove, add; an item written another way keeps its way", () => {
	const text = "> [!menu|places]\n- Park\n- Garden\n- Library";
	assert.deepEqual(rows(text, "menu").items.map((i) => i.text), ["Park", "Garden", "Library"]);
	assert.equal(after(text, "menu", { what: "item-text", index: 1, text: "Yard" }), "> [!menu|places]\n- Park\n- Yard\n- Library");
	assert.equal(after(text, "menu", { what: "item-move", index: 2, by: -1 }), "> [!menu|places]\n- Park\n- Library\n- Garden");
	assert.equal(after(text, "menu", { what: "item-remove", index: 0 }), "> [!menu|places]\n- Garden\n- Library");
	assert.equal(after(text, "menu", { what: "item-add" }), `${text}\n- `);
	assert.equal(after("> [!menu|m]\n* A", "menu", { what: "item-add" }), "> [!menu|m]\n* A\n* ");
	assert.equal(after("> [!menu|m]\n\n- A", "menu", { what: "item-remove", index: 0 }), "> [!menu|m]");
	assert.equal(after("> [!menu|m]", "menu", { what: "item-add" }), "> [!menu|m]\n- ");
	assert.equal(editRows(rows(text, "menu"), { what: "option-add" }).ok, false);
});

const MATRIX = ["> [!matrix|topics] How sure are you of each topic?", "", "- Spring tides", "- Neap tides", "- Tidal range", "", "0. Not yet", "1. Getting there", "2. Sure"].join("\n");

test("a matrix's items and anchors are rows; an anchor's number is its own row", () => {
	const r = rows(MATRIX, "matrix");
	assert.deepEqual(r.items.map((i) => i.text), ["Spring tides", "Neap tides", "Tidal range"]);
	assert.deepEqual(r.anchors.map((a) => [a.number, a.text]), [["0", "Not yet"], ["1", "Getting there"], ["2", "Sure"]]);
	assert.equal(r.lead, "");
	assert.equal(r.mid, "");
	assert.equal(after(MATRIX, "matrix", { what: "item-text", index: 2, text: "Range" }), MATRIX.replace("Tidal range", "Range"));
	assert.equal(after(MATRIX, "matrix", { what: "item-move", index: 0, by: 1 }), MATRIX.replace("- Spring tides\n- Neap tides", "- Neap tides\n- Spring tides"));
	assert.equal(after(MATRIX, "matrix", { what: "item-remove", index: 1 }), MATRIX.replace("- Neap tides\n", ""));
	assert.equal(after(MATRIX, "matrix", { what: "item-add" }), MATRIX.replace("- Tidal range\n", "- Tidal range\n- \n"));
	assert.equal(after(MATRIX, "matrix", { what: "anchor-text", index: 1, text: "Close" }), MATRIX.replace("Getting there", "Close"));
	assert.equal(after(MATRIX, "matrix", { what: "anchor-number", index: 2, number: "5" }), MATRIX.replace("2. Sure", "5. Sure"));
	assert.equal(after(MATRIX, "matrix", { what: "anchor-add" }), `${MATRIX}\n3. `, "the next number is the last one and one");
	assert.equal(after(MATRIX, "matrix", { what: "anchor-remove", index: 1 }), MATRIX.replace("1. Getting there\n", ""));
	assert.equal(after(MATRIX, "matrix", { what: "anchor-move", index: 0, by: 1 }), MATRIX.replace("0. Not yet\n1. Getting there", "1. Getting there\n0. Not yet"));
	assert.equal(editRows(rows(MATRIX, "matrix"), { what: "anchor-number", index: 0, number: "x" }).ok, false);
	assert.equal(editRows(rows(MATRIX, "matrix"), { what: "anchor-number", index: 0, number: "" }).ok, false);
	assert.equal(editRows(rows(MATRIX, "matrix"), { what: "anchor-number", index: 0, number: "1 2" }).ok, false);
});

test("the blank line a numbered list needs when it starts at 0 (SPEC section 4): kept when there, added when a change leaves it needed, never taken away", () => {
	// kept: the blank line between the two lists stays when an item or an anchor goes
	assert.match(after(MATRIX, "matrix", { what: "item-remove", index: 0 }), /Tidal range\n\n0\. Not yet/);
	assert.match(after(MATRIX, "matrix", { what: "anchor-remove", index: 2 }), /Tidal range\n\n0\. Not yet/);
	// a list that starts at 1 may follow directly, and does so after a change
	const one = "> [!matrix|m] M\n- A\n- B\n1. Low\n2. High";
	assert.equal(after(one, "matrix", { what: "item-add" }), "> [!matrix|m] M\n- A\n- B\n- \n1. Low\n2. High");
	assert.equal(after(one, "matrix", { what: "anchor-add" }), `${one}\n3. `);
	// added: the first anchor becomes 0 (renumbered, or the 1 is removed and the list starts at 2)
	assert.equal(after(one, "matrix", { what: "anchor-number", index: 0, number: "0" }), "> [!matrix|m] M\n- A\n- B\n\n0. Low\n2. High");
	assert.equal(after(one, "matrix", { what: "anchor-remove", index: 0 }), "> [!matrix|m] M\n- A\n- B\n\n2. High");
	// added: a first anchor moved up over the 1
	assert.equal(after("> [!matrix|m] M\n- A\n1. One\n0. Zero", "matrix", { what: "anchor-move", index: 1, by: -1 }), "> [!matrix|m] M\n- A\n\n0. Zero\n1. One");
	// added: a list of anchors with no items yet that gets its first item, when it starts at 0
	assert.equal(after("> [!matrix|m] M\n0. Zero\n1. One", "matrix", { what: "item-add" }), "> [!matrix|m] M\n- \n\n0. Zero\n1. One");
	// a matrix with no anchors gets 1 first, so no blank line is needed
	assert.equal(after("> [!matrix|m] M\n- A", "matrix", { what: "anchor-add" }), "> [!matrix|m] M\n- A\n1. ");
	// a change to words alone does not touch the lists' spacing, even when the note breaks the rule already
	const bare = "> [!matrix|m] M\n- A\n0. Zero\n1. One";
	assert.equal(after(bare, "matrix", { what: "item-text", index: 0, text: "B" }), bare.replace("- A", "- B"));
	assert.equal(after(bare, "matrix", { what: "anchor-text", index: 0, text: "Nil" }), bare.replace("Zero", "Nil"));
	// the blank line is still there when the first anchor goes back to 1
	assert.match(after("> [!matrix|m] M\n- A\n\n0. Zero\n1. One", "matrix", { what: "anchor-number", index: 0, number: "1" }), /- A\n\n1\. Zero/);
	// and the reader reads the result the way the rows say: the blank line makes a 0 list the matrix's own
	const text = bookletAround(`> [!activity|a] A\n\n${after(one, "matrix", { what: "anchor-number", index: 0, number: "0" })}\n`);
	const q = core.parseBooklet(text).activities[0].segments.find((s) => s.type === "question");
	assert.deepEqual(q.anchors.map((a) => a.n), [0, 2]);
	assert.deepEqual(q.items, ["A", "B"]);
});

test("a matrix with `)` after its numbers, other bullets and a hint keeps every one of them", () => {
	const text = ["> [!matrix|m] M", "* A", "* B", "", "1) Low", "2) High", "", "> [!solution]- S", "> Because."].join("\n");
	assert.equal(after(text, "matrix", { what: "anchor-add" }).split("\n").slice(0, 8).join("|"), "> [!matrix|m] M|* A|* B||1) Low|2) High|3) |");
	assert.equal(after(text, "matrix", { what: "item-add" }).split("\n")[3], "* ");
	assert.equal(after(text, "matrix", { what: "item-text", index: 0, text: "Z" }).split("\n").slice(-3).join("|"), "|> [!solution]- S|> Because.");
});

// ---------------------------------------------------------------- which shared menus a question sees, which questions use one

const MENUS = bookletAround(
	[
		"> [!menu|shared]",
		"- Sun",
		"",
		"> [!module|m1] One",
		"",
		"> [!menu|places]",
		"- Park",
		"- Garden",
		"",
		"> [!activity|a] A",
		"",
		"> [!multi|morning menu:places] This morning I went to…",
		"",
		"> [!multi|evening menu:places] This evening I went to…",
		"",
		"> [!choice|weather menu:shared] Weather?",
		"",
		"> [!choice|own menu:places] Own options win",
		"- [ ] Yes",
		"",
		"> [!module|m1 end]",
		"",
		"> [!module|m2] Two",
		"",
		"> [!activity|b] B",
		"",
		"> [!multi|other menu:shared] Other?",
		"",
		"> [!choice|mine] Mine",
		"- [ ] One",
		"",
		"> [!module|m2 end]",
		"",
	].join("\n"),
);

test("a question sees the menus of its own module and the shared ones, never another module's; a menu knows the questions that read it", () => {
	const root = parseDesign(MENUS);
	const at = (id) => walkDesign(root).find((n) => n.id === id);
	const ids = (id) => menusVisibleTo(MENUS, at(id).start).map((m) => m.id).sort();
	assert.deepEqual(ids("morning"), ["places", "shared"]);
	assert.deepEqual(ids("other"), ["shared"], "module two does not see module one's menu");
	assert.deepEqual(ids("mine"), ["shared"]);
	assert.deepEqual(menuUsers(MENUS, at("places").start), ["morning", "evening"], "a question with options of its own does not read it");
	assert.deepEqual(menuUsers(MENUS, at("shared").start), ["weather", "other"], "a menu every module shares is read from both");
	assert.deepEqual(menuUsers(MENUS, 0), []);
	const lonely = bookletAround("> [!activity|a] A\n\n> [!menu|nobody]\n- One\n");
	assert.deepEqual(menuUsers(lonely, walkDesign(parseDesign(lonely)).find((n) => n.id === "nobody").start), []);
});

// ---------------------------------------------------------------- nothing lost: what a change of the rows leaves not matching

/** A booklet with kept answers (once given, in the module's records) for a choice, two questions on a shared menu, and a matrix. */
const KEPT = (kept) =>
	bookletAround(
		[
			"> [!module|m] M",
			"",
			"> [!menu|places]",
			"- Park",
			"- Garden",
			"- Library",
			"",
			"> [!activity|a] A",
			"",
			"> [!choice|where] Where?",
			"- [ ] Calm",
			"  - Settling.",
			"- [ ] Tense",
			"- [ ] Numb",
			"",
			"> [!multi|morning menu:places] This morning I went to…",
			"",
			"> [!multi|evening menu:places] This evening I went to…",
			"",
			"> [!matrix|topics] How sure?",
			"",
			"- Spring tides",
			"- Neap tides",
			"",
			"0. Not yet",
			"1. Getting there",
			"2. Sure",
			"",
			"> [!module|m end]",
			...(kept ? ["", "%%", "> [!records] App record — do not edit below this line", "", "> [!records|m] M", "", "```booklet answers", JSON.stringify(kept), "```", "%%", ""] : [""]),
		].join("\n"),
	);

const ANSWERS = { where: 2, morning: [1, 3], evening: [2], topics: [1, 2] };

/** Edits the lines of a block of the note and gives the change as `changeLines` makes it. */
function change(note, id, to) {
	const root = parseDesign(note);
	const node = walkDesign(root).find((n) => n.id === id);
	const lines = blockLines(note, node);
	const kind = node.kind === "menu" ? "menu" : node.detail;
	return changeLines(note, node, to(rows(lines.join("\n"), kind), (r, e) => {
		const made = editRows(r, e);
		assert.equal(made.ok, true, made.reason);
		return made.lines;
	}));
}
const asks = (op) => op.impact.map((i) => [i.what, i.entries, i.answers]);

test("a choice: removing, moving or putting an option before another is asked about when an answer is kept; appending, a mark, a reply and `open` are not", () => {
	const kept = KEPT(ANSWERS);
	const bare = KEPT(null);
	const go = (note, edit) => change(note, "where", (r, e) => e(r, edit));
	for (const edit of [
		{ what: "option-remove", index: 1 },
		{ what: "option-move", index: 1, by: -1 },
		{ what: "option-move", index: 0, by: 1 },
	]) {
		const op = go(kept, edit);
		assert.equal(op.ok, true);
		assert.ok(needsAsking(op), `${edit.what} is asked about`);
		assert.deepEqual(asks(op), [["The options of `where`", 0, 1]], edit.what);
		assert.equal(go(bare, edit).impact.length, 0, `${edit.what}: nothing kept, nothing to ask`);
		assert.equal(needsAsking(go(bare, edit)), false);
	}
	// removing an option the kept answers did not pick, that is after the last one picked, asks nothing
	assert.equal(needsAsking(go(kept, { what: "option-remove", index: 2 })), false);
	// the answer 2 is "Tense": taking the option after it out leaves it alone
	for (const edit of [
		{ what: "option-add" },
		{ what: "option-correct", index: 1, on: true },
		{ what: "reply-add", index: 1 },
		{ what: "reply-text", index: 0, reply: 0, text: "Different words." },
		{ what: "reply-remove", index: 0, reply: 0 },
		{ what: "option-text", index: 0, text: "Calmer" },
		{ what: "option-text", index: 2, text: "Numbed" },
	]) {
		const op = go(kept, edit);
		assert.equal(op.ok, true);
		assert.equal(needsAsking(op), false, `${edit.what} keeps every position and what it says`);
	}
	// the words of the option the kept answer picked: asked about, as the Markdown has always been (the answer is a position, and its words changed)
	assert.deepEqual(asks(go(kept, { what: "option-text", index: 1, text: "Wired" })), [["The options of `where`", 0, 1]]);
});

test("a choice inside a note whose answers were kept in entries and a draft counts them too", () => {
	const note = KEPT(null).replace("> [!activity|a] A", "> [!activity|a repeat] A");
	const withEntries = `${note}\n%%\n> [!records] App record — do not edit below this line\n\n> [!records|m] M\n\n\`\`\`booklet entries a\n{"items": [{"ts": "2026-10-01T09:00:00Z", "where": 3}, {"ts": "2026-10-02T09:00:00Z", "where": 1}]}\n\`\`\`\n\n\`\`\`booklet draft a\n{"where": 3}\n\`\`\`\n%%\n`;
	const op = change(withEntries, "where", (r, e) => e(r, { what: "option-move", index: 2, by: -1 }));
	assert.deepEqual(asks(op), [["The options of `where`", 1, 1]], "one entry and the draft picked a position that now means another option");
});

test("a shared menu: removing, moving or inserting an item counts the answers kept for every question that reads it; adding at the end and rewording nothing picked do not", () => {
	const kept = KEPT(ANSWERS);
	const bare = KEPT(null);
	const go = (note, edit) => change(note, "places", (r, e) => e(r, edit));
	for (const edit of [
		{ what: "item-remove", index: 0 },
		{ what: "item-move", index: 0, by: 1 },
		{ what: "item-move", index: 1, by: -1 },
	]) {
		const op = go(kept, edit);
		assert.ok(needsAsking(op), edit.what);
		assert.deepEqual(asks(op).map((a) => a[0]).sort(), ["The options of `evening`", "The options of `morning`"], `${edit.what}: both questions that read the menu are counted`);
		assert.equal(needsAsking(go(bare, edit)), false, `${edit.what}: nothing kept`);
	}
	// taking out the item no answer picked, and adding at the end
	assert.equal(needsAsking(go(kept, { what: "item-add" })), false);
	assert.equal(needsAsking(go(KEPT({ morning: [1], evening: [1] }), { what: "item-remove", index: 2 })), false, "the last item, picked by no one");
	// only one of the two has an answer: only that one is counted
	const one = go(KEPT({ morning: [3] }), { what: "item-remove", index: 0 });
	assert.deepEqual(asks(one), [["The options of `morning`", 0, 1]]);
	// the questions that read the menu through a draft or entries are counted the same way (the guard reads each question)
	const reworded = go(kept, { what: "item-text", index: 1, text: "Yard" });
	assert.deepEqual(asks(reworded), [["The options of `evening`", 0, 1]], "Garden is the evening's answer; the morning's (Park and Library) are not reworded");
});

test("a matrix: removing, moving or putting an item before another, and removing or rewording an anchor, is asked about when an answer is kept; the rest is not", () => {
	const kept = KEPT(ANSWERS);
	const bare = KEPT(null);
	const go = (note, edit) => change(note, "topics", (r, e) => e(r, edit));
	for (const edit of [
		{ what: "item-remove", index: 0 },
		{ what: "item-move", index: 0, by: 1 },
		{ what: "item-move", index: 1, by: -1 },
		{ what: "anchor-remove", index: 1 },
		{ what: "anchor-remove", index: 2 },
		{ what: "anchor-text", index: 1, text: "Close" },
		{ what: "anchor-number", index: 2, number: "5" },
	]) {
		const op = go(kept, edit);
		assert.equal(op.ok, true, edit.what);
		assert.ok(needsAsking(op), `${edit.what} is asked about`);
		assert.deepEqual(asks(op), [["The items and anchors of `topics`", 0, 1]], edit.what);
		assert.equal(needsAsking(go(bare, edit)), false, `${edit.what}: nothing kept`);
	}
	for (const edit of [
		{ what: "item-add" },
		{ what: "anchor-add" },
		{ what: "anchor-text", index: 0, text: "Not at all" },
		{ what: "anchor-remove", index: 0 },
	]) {
		assert.equal(needsAsking(go(kept, edit)), false, `${edit.what} changes nothing a kept answer says (the answer picks 1 and 2)`);
	}
	// reordering the anchors' lines keeps every number with its words: the answers say what they said
	assert.equal(needsAsking(go(kept, { what: "anchor-move", index: 0, by: 1 })), false);
	// the item an answer is null for is not counted
	assert.equal(needsAsking(go(KEPT({ topics: [null, 2] }), { what: "item-remove", index: 0 })), true, "the second item's answer is now the first's");
	assert.equal(needsAsking(go(KEPT({ topics: [null, null] }), { what: "item-remove", index: 0 })), false);
	assert.equal(needsAsking(go(KEPT({ topics: [1] }), { what: "item-remove", index: 1 })), false, "no answer for the second item");
});

test("a question that names a shared menu and a change of that: the menu's items are the options, counted as they are for a question's own", () => {
	const kept = KEPT(ANSWERS);
	const root = parseDesign(kept);
	const node = walkDesign(root).find((n) => n.id === "where");
	const named = chooseMenu(blockLines(kept, node), "places", null);
	const op = changeLines(kept, node, named.lines);
	assert.deepEqual(asks(op), [["The options of `where`", 0, 1]], "answer 2 was Tense, and is now Garden");
});

test("the rows' writes keep the note's other bytes and the line endings", () => {
	const note = KEPT(ANSWERS).replace(/\n/g, "\r\n");
	const op = change(note, "where", (r, e) => e(r, { what: "option-add" }));
	assert.equal(op.ok, true);
	const lines = op.text.split("\n");
	assert.ok(lines.every((l, i) => i === lines.length - 1 || l.endsWith("\r")), "every line still ends the way the note's do");
	assert.equal(op.text.replace(/\r\n- \[ \] \r\n/, "\r\n"), note, "nothing else changed");
	assert.equal(impactOf(note, op.text).length, 0);
});
