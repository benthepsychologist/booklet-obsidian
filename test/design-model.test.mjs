/*
 * What the Design view draws and offers, decided from the tree (core/design-model.ts) and said in its string table (core/design-strings.ts).
 * No view: text in, answers out. The strict "+ Add" is held against the legal-places function from the other side, piece by piece.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { core, bookletAround, ROOT } from "./helpers.mjs";
import { ALL, BARE, FULL, IMPLICIT, ONE_ACTIVITY, PAGES_ONLY, UNREAD, crlf } from "./design-fixtures.mjs";

const { parseDesign, walkDesign, levelOf, nameOf, crumbOf, addChoices, moveTargets, needsAsking, containerAdds, canPlacePiece, insertPiece, checkDesign, LEVELS, LEVEL_ICONS, iconNamesOf, WORDS_PIECE, PIECES, DESIGN_STRINGS, say, plural, langOf, t, tn, EMPTY_TEXT } = core;

const containers = (root) => walkDesign(root).filter((n) => core.isContainer(n));

test("every node is one of seven levels, and each level has its own icon list", () => {
	assert.deepEqual([...LEVELS], ["booklet", "module", "module-tab", "activity", "activity-tab", "page", "block"]);
	const first = new Set();
	for (const l of LEVELS) {
		assert.ok(LEVEL_ICONS[l].length >= 2, `${l} has a fallback icon behind its first choice`);
		first.add(LEVEL_ICONS[l][0]);
	}
	assert.equal(first.size, LEVELS.length, "no two levels share an icon");
	const root = parseDesign(FULL);
	const seen = new Set(walkDesign(root).map(levelOf));
	for (const l of LEVELS) assert.ok(seen.has(l), `the full fixture has a ${l}`);
	for (const n of walkDesign(root)) assert.ok(iconNamesOf(n).length > 0, `${n.kind} has icons`);
});

test("a node's name is its title, else its id; the breadcrumb runs from the booklet down", () => {
	const root = parseDesign(FULL);
	const spending = walkDesign(root).find((n) => n.id === "spending");
	assert.equal(nameOf(spending), "Spending");
	const q = walkDesign(root).find((n) => n.id === "spent");
	assert.deepEqual(crumbOf(q).map((n) => n.kind), ["booklet", "module", "activity", "question"]);
	assert.equal(crumbOf(root).length, 1);
});

test("every container's add list holds only what the legal-places function allows there, piece by piece", () => {
	let offered = 0;
	for (const [name, text] of Object.entries(ALL)) {
		const root = parseDesign(text);
		for (const c of containers(root)) {
			const listed = containerAdds(c).kinds;
			const choices = addChoices(c);
			for (const g of choices.groups) {
				assert.ok(listed.includes(g.kind), `${name}: ${c.kind} at ${c.start} offers a ${g.kind} that containerAdds does not list`);
				assert.ok(g.pieces.length > 0, `${name}: no empty groups`);
				for (const p of g.pieces) {
					const piece = [...PIECES, WORDS_PIECE].find((x) => x.file === p.file);
					assert.ok(piece, `${p.file} is a piece`);
					assert.equal(canPlacePiece(g.position, piece).ok, true, `${name}: ${p.label} in ${c.kind} at ${c.start} is not legal there`);
					// and the operation agrees: it writes it, and the note is still a well-formed tree
					const op = insertPiece(text, g.position, piece);
					assert.equal(op.ok, true, `${name}: ${p.label} in ${c.kind} at ${c.start}: ${op.reason}`);
					assert.equal(checkDesign(parseDesign(op.text), op.text.split("\n").length), null);
					offered++;
				}
			}
		}
	}
	assert.ok(offered > 300, `the walk looked at ${offered} offers`);
});

test("what is illegal is never on the list; a part that needs another says which", () => {
	const kindsOf = (text, pick) => {
		const root = parseDesign(text);
		return addChoices(walkDesign(root).find(pick)).groups.map((g) => g.kind);
	};
	const mod = kindsOf(FULL, (n) => n.kind === "module");
	assert.ok(mod.includes("activity"));
	for (const no of ["module", "question", "row", "front-matter"]) assert.ok(!mod.includes(no), `a module does not offer a ${no}`);
	const book = kindsOf(FULL, (n) => n.kind === "booklet");
	for (const no of ["question", "page", "row"]) assert.ok(!book.includes(no), `the booklet does not offer a ${no}`);
	assert.ok(book.includes("module"), "the booklet offers a module");
	const page = kindsOf(FULL, (n) => n.kind === "page" && n.id === "map");
	for (const no of ["module", "activity", "activity-tab", "page"]) assert.ok(!page.includes(no), `a page does not offer a ${no}`);
	assert.ok(page.includes("question"));
	// a module with no activity: a page waits on an activity
	const bare = bookletAround("> [!module|m] M\n\n> [!module|m end]\n");
	const root = parseDesign(bare);
	const m = walkDesign(root).find((n) => n.kind === "module");
	const c = addChoices(m);
	assert.equal(c.empty, true);
	assert.ok(c.first.some((f) => f.kind === "page" && f.first === "activity"), "a page needs an activity first");
	assert.ok(c.groups.some((g) => g.kind === "activity"), "and an activity is offered");
	assert.ok(!c.groups.some((g) => g.kind === "page"), "but no page");
	assert.equal(containerAdds(m).empty, EMPTY_TEXT.module);
});

test("words can be added wherever the format reads prose, and it is one piece among the pieces", () => {
	const root = parseDesign(FULL);
	const page = walkDesign(root).find((n) => n.id === "map");
	const g = addChoices(page).groups.find((x) => x.kind === "text");
	assert.ok(g?.pieces.some((p) => p.file === WORDS_PIECE.file));
	assert.equal(canPlacePiece(g.position, WORDS_PIECE).ok, true);
});

test("move targets: one place among the siblings, and a legal move is never hidden; a place the format would refuse is no target", () => {
	let offered = 0;
	let refusedAnyway = [];
	for (const [name, text] of [["FULL", FULL], ["BARE", BARE], ["PAGES_ONLY", PAGES_ONLY], ["UNREAD", UNREAD], ["crlf", crlf(FULL)]]) {
		const root = parseDesign(text);
		for (const n of walkDesign(root).filter((x) => x.parent)) {
			const sibs = n.parent.children;
			const at = sibs.indexOf(n);
			const to = moveTargets(n);
			if (at === 0) assert.equal(to.up, null, `${name}: ${n.kind} at ${n.start} is first`);
			if (at === sibs.length - 1) assert.equal(to.down, null, `${name}: ${n.kind} at ${n.start} is last`);
			if (to.up) assert.equal(to.up.parent, n.parent);
			if (to.down) assert.equal(to.down.parent, n.parent);
			for (const [dir, target, prev] of [["up", to.up, sibs[at - 1]], ["down", to.down, sibs[at + 1]]]) {
				if (!prev) continue;
				const want = dir === "up" ? core.positionBefore(prev) : core.positionAfter(prev);
				const op = core.moveBlock(text, n, want);
				if (op.ok && op.change) assert.ok(target, `${name}: a legal Move ${dir} of ${n.kind} at ${n.start} is on offer`);
				if (target) {
					offered++;
					const real = core.moveBlock(text, n, target);
					if (!real.ok) refusedAnyway.push(`${name}: ${n.kind} at ${n.start} ${dir}: ${real.reason}`);
				}
			}
		}
	}
	assert.ok(offered > 20, `${offered} moves looked at`);
	// the few the cheap check lets through and the operation refuses are said in words when pressed; there must be few
	assert.ok(refusedAnyway.length <= Math.ceil(offered / 10), `${refusedAnyway.length} of ${offered} offered moves are refused:\n${refusedAnyway.join("\n")}`);
	// the first activity has nothing above it but the front matter, which nothing goes above
	const root = parseDesign(BARE);
	assert.equal(moveTargets(walkDesign(root).find((n) => n.id === "one")).up, null);
	// an activity does not go above its module's tab
	const tabbed = parseDesign(bookletAround("> [!module|m] M\n\n> [!tab|t] T\n\n> [!activity|a] A\n\n> [!activity|b] B\n\n> [!module|m end]\n"));
	assert.equal(moveTargets(walkDesign(tabbed).find((n) => n.id === "a")).up, null);
	assert.ok(moveTargets(walkDesign(tabbed).find((n) => n.id === "b")).up);
});

test("a change is asked about when it counts something, or could not count", () => {
	assert.equal(needsAsking({ impact: [], blind: false }), false);
	assert.equal(needsAsking({ impact: [{ kind: "id", what: "x", entries: 1, answers: 0, rows: 0 }], blind: false }), true);
	assert.equal(needsAsking({ impact: [], blind: true }), true);
});

/* ---- the string table ---- */

test("English is always there; a missing Spanish or French falls back to it, a filled slot is used", () => {
	const table = { a: { en: "Hello {name}", fr: "Bonjour {name}" }, b: { en: "Only English" } };
	assert.equal(say(table, "en", "a", { name: "Ben" }), "Hello Ben");
	assert.equal(say(table, "fr", "a", { name: "Ben" }), "Bonjour Ben");
	assert.equal(say(table, "es", "a", { name: "Ben" }), "Hello Ben", "no Spanish slot filled: English");
	assert.equal(say(table, "fr", "b"), "Only English");
	assert.equal(say(table, "es", "b"), "Only English");
	assert.equal(say(table, "en", "missing"), "missing", "an unknown key is its own text");
	assert.equal(say(table, "en", "a"), "Hello {name}", "a value not handed over is left as written");
});

test("the language is the one Obsidian is in when the table has it, English otherwise", () => {
	assert.equal(langOf("es"), "es");
	assert.equal(langOf("es-MX"), "es");
	assert.equal(langOf("fr"), "fr");
	assert.equal(langOf("fr-CA"), "fr");
	for (const other of ["en", "en-GB", "de", "zh-TW", "", null, undefined, "estonian"]) assert.equal(langOf(other), "en", String(other));
});

test("a counted word is two keys; French takes zero and one as the singular", () => {
	const table = { "x.one": { en: "{n} line" }, "x.other": { en: "{n} lines" } };
	assert.equal(plural(table, "en", "x", 1), "1 line");
	assert.equal(plural(table, "en", "x", 0), "0 lines");
	assert.equal(plural(table, "en", "x", 2), "2 lines");
	assert.equal(plural(table, "fr", "x", 0), "0 line");
	assert.equal(plural(table, "fr", "x", 2), "2 lines");
	assert.equal(tn("confirm.lines", 1, "en"), "1 line");
	assert.equal(tn("confirm.lines", 12, "en"), "12 lines");
});

test("the Design view's table: every entry has English, Spanish and French and only those three slots; none is empty", () => {
	const keys = Object.keys(DESIGN_STRINGS);
	assert.ok(keys.length > 100);
	for (const k of keys) {
		const e = DESIGN_STRINGS[k];
		assert.ok(typeof e.en === "string" && e.en.trim(), `${k} has English`);
		for (const slot of Object.keys(e)) assert.ok(["en", "es", "fr"].includes(slot), `${k} has an odd slot ${slot}`);
		assert.ok(typeof e.es === "string" && e.es.trim(), `${k} has Spanish`);
		assert.ok(typeof e.fr === "string" && e.fr.trim(), `${k} has French`);
	}
	assert.equal(t("undo", "fr"), "Annuler");
	assert.equal(t("undo", "es"), "Deshacer");
	assert.equal(t("undo", "en"), "Undo");
});

test("a Spanish or French string keeps every {placeholder} and every `backtick span` of its English, the same ones", () => {
	const names = (s) => (s.match(/\{[A-Za-z0-9_.]+\}/g) || []).sort().join(",");
	const spans = (s) => (s.match(/`[^`]*`/g) || []).join(",");
	for (const [k, e] of Object.entries(DESIGN_STRINGS)) {
		for (const lang of ["es", "fr"]) {
			assert.equal(names(e[lang]), names(e.en), `${k} (${lang}): placeholders`);
			assert.equal(spans(e[lang]), spans(e.en), `${k} (${lang}): backtick spans`);
		}
	}
});

test("a counted word has both its .one and its .other, in English, Spanish and French", () => {
	const keys = Object.keys(DESIGN_STRINGS);
	const bases = new Set(keys.filter((k) => /\.(one|other)$/.test(k)).map((k) => k.replace(/\.(one|other)$/, "")));
	assert.ok(bases.has("confirm.lines") && bases.size >= 1);
	for (const b of bases) {
		assert.ok(DESIGN_STRINGS[`${b}.one`] && DESIGN_STRINGS[`${b}.other`], `${b} has .one and .other`);
		for (const lang of ["en", "es", "fr"]) for (const f of ["one", "other"]) assert.match(DESIGN_STRINGS[`${b}.${f}`][lang], /\{n\}/, `${b}.${f} (${lang}) shows its count`);
	}
	for (const k of keys) if (/\.(one|other)$/.test(k)) assert.ok(bases.has(k.replace(/\.(one|other)$/, "")), k);
});

test("French takes 0 and 1 as the singular, Spanish only 1; the real table says so in each language", () => {
	assert.equal(tn("confirm.lines", 0, "fr"), DESIGN_STRINGS["confirm.lines.one"].fr.replace("{n}", "0"));
	assert.equal(tn("confirm.lines", 1, "fr"), DESIGN_STRINGS["confirm.lines.one"].fr.replace("{n}", "1"));
	assert.equal(tn("confirm.lines", 2, "fr"), DESIGN_STRINGS["confirm.lines.other"].fr.replace("{n}", "2"));
	assert.equal(tn("confirm.lines", 0, "es"), DESIGN_STRINGS["confirm.lines.other"].es.replace("{n}", "0"));
	assert.equal(tn("confirm.lines", 1, "es"), DESIGN_STRINGS["confirm.lines.one"].es.replace("{n}", "1"));
	assert.equal(tn("confirm.lines", 5, "es"), DESIGN_STRINGS["confirm.lines.other"].es.replace("{n}", "5"));
});

test("a key with no Spanish or French still shows its English (a test-only entry, not the real table)", () => {
	const table = { ...DESIGN_STRINGS, "test.only": { en: "Only in English {x}" } };
	assert.equal(say(table, "es", "test.only", { x: 1 }), "Only in English 1");
	assert.equal(say(table, "fr", "test.only", { x: 2 }), "Only in English 2");
	assert.equal(say(table, "fr", "undo"), "Annuler", "the real keys still speak French beside it");
});

test("every level has its one plain-words line, once, in the table", () => {
	for (const l of LEVELS) {
		assert.ok(DESIGN_STRINGS[`level.${l}`], `level.${l}`);
		assert.ok(DESIGN_STRINGS[`what.${l}`], `what.${l}`);
	}
	assert.equal(DESIGN_STRINGS["what.module"].en, "A module is a unit of the booklet. It holds activities.");
});

test("every key the Design view's code asks for is in the table, and every key in the table is asked for", () => {
	const files = readdirSync(`${ROOT}/src`).filter((f) => /^(design-|main|view|settings)/.test(f) && f.endsWith(".ts"));
	let code = "";
	for (const f of files) code += readFileSync(`${ROOT}/src/${f}`, "utf8");
	const used = new Set([...code.matchAll(/\b(?:ui|uin|t|tn)\(\s*"([a-z][\w.-]*)"/g)].map((m) => m[1]));
	for (const k of used) assert.ok(k === "confirm.lines" || DESIGN_STRINGS[k], `the code asks for ${k}, which the table lacks`);
	// a key may be chosen by a condition (`how === "delete" ? "confirm.yes.delete" : ...`) or through a map from a kind, so a key counts as asked
	// for when its text stands in the code as a string
	const unused = Object.keys(DESIGN_STRINGS).filter((k) => !code.includes(`"${k}"`) && !/\.(one|other)$/.test(k));
	assert.deepEqual(unused, [], "a key nothing asks for is dead weight");
	for (const k of ["confirm.lines.one", "confirm.lines.other"]) assert.ok(DESIGN_STRINGS[k]);
});

test("the fixtures the other tests share still read as before", () => {
	for (const text of [FULL, ONE_ACTIVITY, IMPLICIT, UNREAD, crlf(FULL)]) assert.equal(checkDesign(parseDesign(text), text.split("\n").length), null);
});
