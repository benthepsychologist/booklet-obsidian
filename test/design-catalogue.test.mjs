/*
 * The Design view's catalogue and key popup, as data (stage C): which pieces are listed in which of the four groups, how each is shown (a
 * question drawn inert, a reading callout rendered, or a labelled card), how a block of the tree is drawn, where the keys put a piece, and
 * the popup's state for every sequence of keys. Plain core, no DOM.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { core, bookletAround } from "./helpers.mjs";
import { FULL, BARE, ALL } from "./design-fixtures.mjs";

const { CATALOGUE_GROUPS, PIECES, WORDS_PIECE, KEY_TREE, addChoices, allKeyed, blockDrawing, canPlacePiece, catalogueListing, catalogueOf, hasRemoteMedia, insertPiece, isContainer, keysOf, listingOf, parseDesign, placeFor, popupFor, sampleOf, stepPopup, walkDesign } = core;

const piece = (file) => PIECES.find((p) => p.file === file);
const node = (root, id, kind) => walkDesign(root).find((n) => n.id === id && (!kind || n.kind === kind));

test("the catalogue has four groups, and Views and Data are one of them", () => {
	assert.deepEqual(CATALOGUE_GROUPS.map((g) => g.id), ["structure", "questions", "reading", "views-data"]);
	assert.deepEqual(CATALOGUE_GROUPS.map((g) => g.holds), [["structure"], ["questions"], ["reading"], ["views", "data"]]);
	assert.equal(catalogueOf("views"), "views-data");
	assert.equal(catalogueOf("data"), "views-data");
});

test("every piece of the pieces table is in exactly one group, so the catalogue cannot drift from the table (56 pieces)", () => {
	assert.equal(PIECES.length, 56);
	const seen = new Map();
	for (const p of PIECES) {
		const id = catalogueOf(p.group);
		assert.ok(CATALOGUE_GROUPS.some((g) => g.id === id), p.file);
		seen.set(p.file, id);
	}
	assert.equal(seen.size, 56);
	// and each container lists only pieces of the table (and "words"), each once
	const files = new Set([...PIECES.map((p) => p.file), WORDS_PIECE.file]);
	for (const text of [FULL, BARE]) {
		for (const n of walkDesign(parseDesign(text)).filter((x) => isContainer(x))) {
			const listed = catalogueListing(addChoices(n), PIECES).flatMap((g) => g.entries.map((e) => e.file));
			assert.equal(new Set(listed).size, listed.length, `${n.kind} lists no piece twice`);
			for (const f of listed) assert.ok(files.has(f), f);
		}
	}
});

test("every piece can be reached in some container's listing, so the catalogue shows all 56", () => {
	const reached = new Set();
	for (const text of [FULL, BARE, ALL.ONE_ACTIVITY, ALL.IMPLICIT]) {
		for (const n of walkDesign(parseDesign(text)).filter((x) => isContainer(x)))
			for (const g of catalogueListing(addChoices(n), PIECES)) for (const e of g.entries) reached.add(e.file);
	}
	const missing = PIECES.filter((p) => !reached.has(p.file) && p.file !== "Structure - front matter.md").map((p) => p.file);
	assert.deepEqual(missing, [], "every piece (the front matter aside, which a booklet with front matter cannot take) is on some container's list");
});

test("a listing carries each piece's hotkey letters from the key tree, and where choosing it puts it", () => {
	const booklet = parseDesign(BARE);
	const listing = catalogueListing(addChoices(booklet), PIECES);
	const structure = listing.find((g) => g.id === "structure");
	const module = structure.entries.find((e) => e.file === "Structure - module.md");
	assert.equal(module.keys, "sm");
	assert.equal(module.keys, keysOf(piece("Structure - module.md")));
	assert.ok(module.place.position, "where it goes");
	assert.equal(module.sample, "card");
	// groups with nothing legal are left out: a booklet takes no question
	assert.ok(!listing.some((g) => g.id === "questions"));
	// the group order of the table is kept, "words" last in the reading aids
	const reading = catalogueListing(addChoices(walkDesign(parseDesign(FULL)).find((n) => n.id === "map")), PIECES).find((g) => g.id === "reading");
	assert.equal(reading.entries.at(-1).file, WORDS_PIECE.file);
	assert.equal(reading.entries.at(-1).keys, null, "words are no piece of the key tree");
});

test("what a sample is: a question drawn inert, a reading callout rendered, everything else a labelled card", () => {
	const by = (file) => sampleOf(piece(file));
	for (const f of ["Q - choice.md", "Q - date.md", "Q - lines.md", "Q - matrix.md", "Q - multi.md", "Q - multi (own options).md", "Q - multi (from a menu).md", "Q - number.md", "Q - scale.md", "Q - text.md", "Q - text (long).md"]) assert.equal(by(f), "question", f);
	// a listen, a widget and a lone menu stay cards (Ben: a later beta draws them)
	for (const f of ["Q - listen.md", "Q - widget (grid).md", "Q - menu (shared list).md"]) assert.equal(by(f), "card", f);
	for (const f of ["Reading - note.md", "Reading - tip.md", "Reading - warning.md", "Reading - example.md", "Reading - hint.md", "Reading - solution.md", "Reading - question.md", "Reading - quote.md", "Reading - law.md", "Reading - diff.md", "Reading - opinion.md", "Reading - citation.md"]) assert.equal(by(f), "reading", f);
	// media, groups and a copy button are cards: a sample fetches nothing
	for (const f of ["Reading - image.md", "Reading - figure (embed).md", "Reading - group (folded).md", "Reading - group (steps).md", "Reading - copy button.md"]) assert.equal(by(f), "card", f);
	for (const p of PIECES.filter((x) => ["structure", "data", "views"].includes(x.group))) assert.equal(sampleOf(p), "card", p.file);
	assert.equal(sampleOf({ ...WORDS_PIECE, kinds: [] }), "reading");
	// every sample's text holds no remote media: fixed local content only (a listen's address is on another site, and it is a card)
	for (const p of PIECES) if (sampleOf(p) !== "card") assert.equal(hasRemoteMedia(p.text), false, p.file);
});

test("how a block of the tree is drawn: the question kinds the drawing code has, reading callouts; the rest are cards", () => {
	const draw = (kind, detail) => blockDrawing({ kind, detail });
	for (const k of ["choice", "multi", "matrix", "lines", "text", "number", "scale", "date"]) assert.equal(draw("question", k), "question", k);
	assert.equal(draw("question", "listen"), "card");
	assert.equal(draw("question", "widget"), "card");
	for (const k of ["tip", "note", "hint", "warning", "diff"]) assert.equal(draw("callout", k), "reading", k);
	assert.equal(draw("callout", "copy"), "card");
	for (const k of ["query", "fence", "menu", "notice", "prose", "page-break", "records", "front-matter"]) assert.equal(draw(k, ""), "card", k);
});

test("media on another site is never drawn: an image or a media tag with an address is shown as its words; a plain link is not media", () => {
	for (const md of ["![a pic](https://example.org/a.png)", "![[https://example.org/a.png]]", '<img src="https://example.org/a.png">', "<iframe src='//example.org/x'></iframe>", "text ![x][r]\n\n[r]: http://example.org/a.jpg", "<video src=\"https://e.org/v.mp4\"></video>", '<IMG SRC="//e.org/p.png">']) assert.equal(hasRemoteMedia(md), true, md);
	for (const md of ["A [link](https://example.org) in words.", "![local](images/a.png)", "![[a.png]]", "Plain words.", '<img src="a.png">']) assert.equal(hasRemoteMedia(md), false, md);
});

/* ---------------------------------------------------------------- where the keys put a piece */

test("a piece goes inside the selected container when the format allows it there, else after it, else after what is around it", () => {
	const root = parseDesign(FULL);
	const page = node(root, "map", "page");
	const q = piece("Q - text.md");
	const inside = placeFor(root, page, q);
	assert.equal(inside.ok, true);
	assert.equal(inside.position.parent, page, "a question goes into the page selected");
	// a module while a page is selected goes after the module that holds it, at the booklet's level
	const mod = piece("Structure - module.md");
	const after = placeFor(root, page, mod);
	assert.equal(after.ok, true);
	assert.equal(after.position.parent.kind, "booklet");
	assert.equal(after.position.parent.children[after.position.index - 1], node(root, "money", "module"));
	// a page while a page is selected: its line ends the page above it, so it stands beside it in the tree drawn afterwards
	const pg = placeFor(root, page, piece("Structure - page.md"));
	assert.equal(pg.ok, true);
	const made = insertPiece(FULL, pg.position, piece("Structure - page.md"));
	assert.equal(made.ok, true);
	const again = parseDesign(made.text);
	const before = new Set(walkDesign(root).filter((n) => n.kind === "page").map((n) => n.id));
	const fresh = walkDesign(again).find((n) => n.kind === "page" && !before.has(n.id));
	assert.equal(fresh.parent, node(again, "map", "page").parent, "a sibling of the page it was added from");
});

test("a piece goes after the selected block when that block holds nothing", () => {
	const root = parseDesign(FULL);
	const spent = node(root, "spent", "question");
	const r = placeFor(root, spent, piece("Q - choice.md"));
	assert.equal(r.ok, true);
	assert.equal(r.position.parent, spent.parent);
	assert.equal(r.position.index, spent.parent.children.indexOf(spent) + 1);
});

test("with nothing selected a piece goes to the end of the booklet's own place; what the booklet cannot hold is refused, with design-places' reason", () => {
	// a booklet of one module with no activity: nothing a question could belong to
	const text = bookletAround("> [!module|m] M\n\n> [!module|m end]\n");
	const root = parseDesign(text);
	const mod = placeFor(root, null, piece("Structure - module.md"));
	assert.equal(mod.ok, true);
	assert.equal(mod.position.parent, root);
	assert.equal(mod.position.index, root.children.length, "at the end");
	const q = placeFor(root, null, piece("Q - text.md"));
	assert.equal(q.ok, false);
	assert.match(q.reason, /\S/);
	assert.equal(q.reason, canPlacePiece({ parent: root, index: root.children.length }, piece("Q - text.md")).reason, "the reason is design-places' own");
	// a front matter piece in a booklet that has front matter
	const fm = placeFor(root, null, piece("Structure - front matter.md"));
	assert.equal(fm.ok, false);
	assert.match(fm.reason, /properties already/);
	// in a booklet whose last activity is open a question belongs to it, as the format reads it
	const bare = parseDesign(BARE);
	const last = placeFor(bare, null, piece("Q - text.md"));
	assert.equal(last.ok, true);
});

test("a place the format refuses is never a place: every ok result is one canPlacePiece allows, for every piece and every block", () => {
	for (const text of [FULL, BARE]) {
		const root = parseDesign(text);
		for (const sel of [null, ...walkDesign(root)])
			for (const p of PIECES) {
				const r = placeFor(root, sel, p);
				if (r.ok) assert.equal(canPlacePiece(r.position, p).ok, true, `${p.file} after ${sel?.kind}`);
				else assert.match(r.reason, /\S/);
			}
	}
});

test("a piece placed where placeFor says is inserted by insertPiece without a refusal", () => {
	const root = parseDesign(FULL);
	for (const sel of [null, ...walkDesign(root)])
		for (const p of PIECES) {
			const r = placeFor(root, sel, p);
			if (r.ok) assert.equal(insertPiece(FULL, r.position, p).ok, true, `${p.file} at ${sel?.kind}`);
		}
});

/* ---------------------------------------------------------------- the popup, as data */

const run = (start, ...keys) => {
	let s = start;
	let chosen = null;
	for (const k of keys) {
		const step = stepPopup(s, k);
		s = step.state;
		if (step.choose) chosen = step.choose;
		if (!s) break;
	}
	return { s, chosen };
};

test("the popup opens on the groups, and a group letter opens that group, listing its pieces with every letter", () => {
	const l = listingOf(popupFor());
	assert.equal(l.mode, "groups");
	assert.deepEqual(l.rows.map((r) => r.keys), ["s", "q", "r", "v", "d"]);
	assert.deepEqual(l.rows.map((r) => r.label), ["Structure", "Questions", "Reading aids", "Views", "Data"]);
	const { s } = run(popupFor(), "q");
	const g = listingOf(s);
	assert.equal(g.mode, "pieces");
	assert.equal(g.group.id, "questions");
	assert.deepEqual(g.rows.map((r) => r.keys.replace(/ /g, "")).slice(0, 10), ["qc", "qx", "qm", "ql", "qt", "qn", "qs", "qd", "qa", "qw"]);
	// every piece of the group is shown, with its letters
	assert.equal(g.rows.length, KEY_TREE.find((x) => x.key === "q").entries.length);
});

test("s m Enter adds a module, and q m Enter adds a matrix (the two examples)", () => {
	for (const [keys, file] of [[["s", "m", "Enter"], "Structure - module.md"], [["q", "m", "Enter"], "Q - matrix.md"]]) {
		const first = stepPopup(popupFor(), keys[0]);
		const { chosen } = run(first.state, ...keys.slice(1));
		assert.equal(chosen.piece.file, file, keys.join(" "));
	}
});

test("after the group's letter the highlight follows the letter typed, and Enter on a piece with variants takes the piece as it stands", () => {
	let { s } = run(popupFor("s"), "m");
	assert.equal(listingOf(s).rows[listingOf(s).cursor].piece.file, "Structure - module.md");
	({ s } = run(popupFor("s"), "e"));
	const l = listingOf(s);
	assert.equal(l.mode, "variants");
	assert.equal(l.rows[0].piece.file, "Structure - activity (repeat).md", "the piece itself first");
	assert.equal(l.cursor, 0);
	assert.deepEqual(l.rows.slice(1).map((r) => r.keys.replace(/ /g, "")), ["sed"]);
	assert.equal(run(popupFor("s"), "e", "Enter").chosen.piece.file, "Structure - activity (repeat).md");
	// a third letter picks the variant
	assert.equal(run(popupFor("s"), "e", "d", "Enter").chosen.piece.file, "Structure - activity (repeat daily).md");
});

test("typing a letter that is no piece's letter turns the typing into a filter by word, the group's pieces first; Enter takes the highlighted one", () => {
	const { s } = run(popupFor("s"), "x");
	assert.equal(listingOf(s).mode, "filter");
	// a word: every piece whose name holds it, across the groups
	const typed = run(popupFor("q"), ..."matr");
	const l = listingOf(typed.s);
	assert.equal(l.mode, "filter");
	assert.ok(l.rows.length >= 1);
	assert.ok(l.rows.every((r) => /matr/i.test(r.label + r.detail + r.piece.label)));
	assert.equal(run(typed.s, "Enter").chosen.piece.file, "Q - matrix.md");
	// words are separated by spaces, each must match; the group's own come first
	const two = run(popupFor("s"), ..."q", " ", ..."te");
	assert.equal(listingOf(two.s).mode, "filter");
	// nothing matches: an empty list, and Enter does nothing
	const none = run(popupFor("s"), ..."zzzq");
	assert.equal(listingOf(none.s).rows.length, 0);
	assert.equal(run(none.s, "Enter").chosen, null);
	const filt = run(popupFor("s"), ..."pa");
	assert.ok(listingOf(filt.s).rows.some((r) => r.piece.file === "Structure - page.md"));
	assert.equal(listingOf(filt.s).rows[0].piece.group === "structure", true, "the open group's pieces first");
});

test("Backspace takes a letter back, from a group goes back to the groups, from the groups closes; Escape closes at any point", () => {
	let s = run(popupFor("s"), "m", "o").s;
	s = stepPopup(s, "Backspace").state;
	assert.equal(s.rest, "m");
	s = stepPopup(s, "Backspace").state;
	s = stepPopup(s, "Backspace").state;
	assert.equal(s.group, null);
	assert.equal(stepPopup(s, "Backspace").state, null);
	for (const st of [popupFor(), popupFor("q"), run(popupFor("s"), "m").s]) assert.equal(stepPopup(st, "Escape").state, null);
});

test("the arrow keys move the highlight, and Enter on a group row opens the group", () => {
	let s = popupFor();
	s = stepPopup(s, "ArrowDown").state;
	assert.equal(listingOf(s).cursor, 1);
	const opened = stepPopup(s, "Enter");
	assert.equal(opened.state.group, "q", "the second row is Questions");
	s = stepPopup(opened.state, "ArrowDown").state;
	s = stepPopup(s, "ArrowDown").state;
	assert.equal(listingOf(s).cursor, 2);
	assert.equal(stepPopup(s, "Enter").choose.piece.file, "Q - matrix.md");
	s = stepPopup(popupFor("q"), "ArrowUp").state;
	assert.equal(listingOf(s).cursor, 0, "the highlight stops at the first row");
});

test("every piece is reachable by keys alone, through the popup's own state machine", () => {
	for (const hit of allKeyed()) {
		const keys = [...hit.keys];
		const first = stepPopup(popupFor(), keys[0]);
		assert.equal(first.state.group, keys[0]);
		const { chosen } = run(first.state, ...keys.slice(1), "Enter");
		assert.equal(chosen?.piece.file, hit.piece.file, `${hit.keys} adds ${hit.piece.file}`);
	}
	assert.equal(allKeyed().length, 56);
});

test("keys that mean nothing leave the popup as it was", () => {
	const s = popupFor();
	assert.equal(stepPopup(s, "x").state, s);
	assert.equal(stepPopup(s, "F5").state, s);
	assert.equal(stepPopup(popupFor("s"), " ").state.rest, "", "a space with nothing typed is no word");
	assert.equal(stepPopup(popupFor("s"), "?").state.rest, "");
});
