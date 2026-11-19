/*
 * The Design view's nested hotkeys: a first key picks a group, a second a piece, a third a variant. The tree is built from the panel's
 * 56 pieces, so these tests walk every piece and check that two letters never mean two things in one place.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { core } from "./helpers.mjs";

const { KEY_GROUPS, KEY_TREE, PIECES, allKeyed, filterKeyed, groupListing, keysOf, lookupKeys } = core;

const group = (key) => KEY_TREE.find((g) => g.key === key);

test("the five groups have their keys: s, q, r, v, d", () => {
	assert.deepEqual(KEY_GROUPS.map((g) => [g.key, g.id]), [["s", "structure"], ["q", "questions"], ["r", "reading"], ["v", "views"], ["d", "data"]]);
	assert.equal(new Set(KEY_GROUPS.map((g) => g.key)).size, 5);
});

test("Structure and Questions carry exactly the letters the design note proposed (section 6)", () => {
	const lettersOf = (key) => group(key).entries.map((e) => [e.key, e.piece.label]);
	assert.deepEqual(lettersOf("s").slice(0, 10), [
		["m", "module"],
		["a", "activity"],
		["t", "tab"],
		["p", "page"],
		["r", "row"],
		["n", "notice"],
		["e", "activity (repeat)"],
		["d", "data section"],
		["b", "page break"],
		["f", "front matter"],
	]);
	assert.deepEqual(lettersOf("q").slice(0, 10), [
		["c", "choice"],
		["x", "multi"],
		["m", "matrix"],
		["l", "lines"],
		["t", "text"],
		["n", "number"],
		["s", "scale"],
		["d", "date"],
		["a", "listen"],
		["w", "widget (grid)"],
	]);
});

test("the pieces the proposal does not name take the first free letter of their label, in table order", () => {
	// Structure: piece marker (p is taken, so i), theme (t is taken, so h); Questions: menu (shared list) (m taken, so e)
	assert.deepEqual(group("s").entries.slice(10).map((e) => [e.key, e.piece.file]), [["i", "Structure - piece marker.md"], ["h", "Structure - theme.md"]]);
	assert.deepEqual(group("q").entries.slice(10).map((e) => [e.key, e.piece.file]), [["e", "Q - menu (shared list).md"]]);
	// Reading aids: first letters, then the next free letter of the label (question: q; quote: u; solution: s; opinion: p)
	const r = Object.fromEntries(group("r").entries.map((e) => [e.piece.file.replace(/^Reading - |\.md$/g, ""), e.key]));
	assert.equal(r.citation, "c");
	assert.equal(r["copy button"], "o", "c was the citation's");
	assert.equal(r.quote, "u", "q was the question's");
	assert.equal(r.question, "q");
	assert.equal(r.solution, "s");
	assert.equal(r.opinion, "p");
	assert.equal(r.law, "l");
	assert.equal(r.warning, "w");
});

test("the letters of Reading aids, Views and Data are pinned, so a change to the pieces table shows up here", () => {
	const map = (key) => group(key).entries.map((e) => e.key + e.variants.map((v) => "/" + v.key).join("")).join(" ");
	assert.equal(map("r"), "c o d e f g/s h i l n p q u s t w");
	assert.equal(map("v"), "b c k l i t/t e");
	assert.equal(map("d"), "f r/t");
});

test("no two letters collide inside a group, and no two variants of a piece share one", () => {
	for (const g of KEY_TREE) {
		const letters = g.entries.map((e) => e.key);
		assert.equal(new Set(letters).size, letters.length, `${g.title}: ${letters.join("")}`);
		for (const l of letters) assert.match(l, /^[a-z1-9]$/);
		for (const e of g.entries) {
			const v = e.variants.map((x) => x.key);
			assert.equal(new Set(v).size, v.length, `${g.title} ${e.label}: ${v.join("")}`);
			for (const l of v) assert.match(l, /^[a-z1-9]$/);
		}
	}
	const full = allKeyed().map((h) => h.keys);
	assert.equal(new Set(full).size, full.length, "no two pieces share a whole key sequence");
});

test("every one of the 56 pieces is reachable by keys, exactly once", () => {
	assert.equal(PIECES.length, 56);
	const hits = allKeyed();
	assert.equal(hits.length, 56);
	assert.deepEqual(new Set(hits.map((h) => h.piece.file)), new Set(PIECES.map((p) => p.file)));
	for (const p of PIECES) {
		const keys = keysOf(p);
		assert.ok(keys, `${p.file} has keys`);
		const at = lookupKeys(keys);
		assert.ok(at.level === "entry" || at.level === "variant", `${p.file} at ${keys}: ${at.level}`);
		assert.equal(at.piece.file, p.file, `${keys} reaches ${p.file}`);
		assert.ok(keys.length === 2 || keys.length === 3);
	}
});

test("keys read from the top: s m is a module, q m is a matrix, s e d is an activity that keeps one entry a day", () => {
	assert.equal(lookupKeys("sm").piece.file, "Structure - module.md");
	assert.equal(lookupKeys("qm").piece.file, "Q - matrix.md");
	assert.equal(lookupKeys("sed").piece.file, "Structure - activity (repeat daily).md");
	assert.equal(lookupKeys("SM").piece.file, "Structure - module.md", "case does not matter");
	assert.equal(keysOf({ file: "Structure - module.md" }), "sm");
	assert.equal(keysOf({ file: "Q - matrix.md" }), "qm");
	assert.equal(keysOf({ file: "not a piece.md" }), null);
});

test("a key sequence says where it stands and what may come next", () => {
	const root = lookupKeys("");
	assert.equal(root.level, "root");
	assert.deepEqual(root.options.map((o) => o.key), ["s", "q", "r", "v", "d"]);
	const g = lookupKeys("s");
	assert.equal(g.level, "group");
	assert.equal(g.group.title, "Structure");
	assert.deepEqual(g.options.map((o) => o.key).slice(0, 3), ["m", "a", "t"]);
	const e = lookupKeys("se");
	assert.equal(e.level, "entry");
	assert.deepEqual(e.options, [{ key: "d", label: "daily" }]);
	const v = lookupKeys("sed");
	assert.equal(v.level, "variant");
	assert.deepEqual(v.options, []);
	assert.equal(lookupKeys("zz").level, "none");
	assert.equal(lookupKeys("s9").level, "none");
	assert.equal(lookupKeys("sez").level, "none");
	assert.equal(lookupKeys("smx").level, "none", "a piece with no variant takes no third key");
	assert.equal(lookupKeys("sedd").level, "none", "nothing past the third key");
	assert.equal(lookupKeys("s9").options.length, 0);
});

test("the variants are the pieces the table writes as `name (qualifier)`", () => {
	const x = group("q").entries.find((e) => e.key === "x");
	assert.deepEqual(x.variants.map((v) => [v.key, v.piece.file]), [["f", "Q - multi (from a menu).md"], ["o", "Q - multi (own options).md"]]);
	const t = group("q").entries.find((e) => e.key === "t");
	assert.deepEqual(t.variants.map((v) => v.piece.file), ["Q - text (long).md"]);
	const g = group("r").entries.find((e) => e.key === "g");
	assert.equal(g.piece.file, "Reading - group (folded).md", "no plain group piece: the first of the family is the entry");
	assert.deepEqual(g.variants.map((v) => v.piece.file), ["Reading - group (steps).md"]);
	const e = group("s").entries.find((x) => x.key === "e");
	assert.equal(e.label, "activity that keeps entries");
	assert.equal(group("s").entries.find((x) => x.key === "a").variants.length, 0, "the plain activity has none: the daily one hangs under the one that keeps entries");
});

test("typing narrows the list: every word must be in the group, the piece or its variant", () => {
	assert.equal(filterKeyed("").length, 56);
	assert.deepEqual(filterKeyed("matrix").map((h) => h.keys), ["qm"]);
	assert.ok(filterKeyed("MODULE").some((h) => h.keys === "sm"));
	assert.ok(filterKeyed("module").some((h) => h.keys === "sdm"), "a variant is found by its own words");
	assert.deepEqual(filterKeyed("questions text").map((h) => h.keys), ["qt", "qtl"]);
	assert.deepEqual(filterKeyed("nothing like this"), []);
	assert.ok(filterKeyed("views").length === group("v").entries.length + group("v").entries.reduce((n, e) => n + e.variants.length, 0));
	assert.ok(filterKeyed("long").some((h) => h.keys === "qtl"));
	for (const h of filterKeyed("table")) assert.equal(lookupKeys(h.keys).piece.file, h.piece.file);
});

test("a group's listing is what the popup shows when its key is pressed", () => {
	const rows = groupListing("s");
	assert.equal(rows.length, 12);
	assert.deepEqual(rows[0].label, "module");
	assert.deepEqual(rows[6], { key: "e", label: "activity that keeps entries", piece: rows[6].piece, variants: [{ key: "d", label: "daily" }] });
	assert.equal(groupListing("S").length, 12, "case does not matter");
	assert.equal(groupListing("z"), null);
	for (const g of KEY_GROUPS) assert.equal(groupListing(g.key).length, group(g.key).entries.length);
	assert.equal(groupListing("q").length, 11);
});
