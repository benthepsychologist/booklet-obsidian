/*
 * The Design view's canvas, as data (the core behind the page-at-a-time rebuild): what a selected node draws (canvasOf), the places a
 * block could be added on it (slotsOf), whether a piece may stand in one (slotAccepts, legalSlots, tileState: design-places' own answers),
 * the navigator's tree (navEntries), the front matter's form and its one-line writes, and the draft-friendly form edit
 * (applyFormChange, which changeForm now calls). Read on the same fixtures as the other design tests, and on the test vault's notes.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { core, bookletAround, ROOT, SKETCH } from "./helpers.mjs";
import { BARE, FULL, IMPLICIT, ONE_ACTIVITY, PAGES_ONLY, UNREAD, ALL, crlf, lineOf } from "./design-fixtures.mjs";

const {
	parseDesign,
	walkDesign,
	canvasOf,
	slotsOf,
	slotAccepts,
	slotPositionFor,
	legalSlots,
	tileState,
	navEntries,
	navigableNodes,
	bookletTitleOf,
	frontMatterFormOf,
	frontMatterFormOfLines,
	applyFrontMatterChange,
	changeFrontMatter,
	applyFormChange,
	changeForm,
	changeLines,
	formOf,
	formIdClash,
	blockLines,
	whyUnchangeable,
	positionIn,
	positionLine,
	parseBooklet,
	PIECES,
	nameOf,
} = core;

/** A note read, with ways to name a node in it. */
function note(text) {
	const root = parseDesign(text);
	const node = (id, kind) => {
		const n = walkDesign(root).find((x) => x.id === id && (!kind || x.kind === kind));
		assert.ok(n, `the note has ${id}`);
		return n;
	};
	const at = (needle, kind) => {
		const start = lineOf(text, needle);
		const n = walkDesign(root).find((x) => x.start === start && x.parent && (!kind || x.kind === kind));
		assert.ok(n, `the note has a block at ${needle}`);
		return n;
	};
	const first = (kind) => {
		const n = walkDesign(root).find((x) => x.kind === kind);
		assert.ok(n, `the note has a ${kind}`);
		return n;
	};
	return { root, text, node, at, first };
}

const piece = (file) => {
	const p = PIECES.find((x) => x.file === file);
	assert.ok(p, `the pieces table has ${file}`);
	return p;
};
const TAB = piece("Structure - tab.md");
const PAGE = piece("Structure - page.md");
const ACTIVITY = piece("Structure - activity.md");
const MODULE = piece("Structure - module.md");
const QUESTION = piece("Q - text.md");
const NOTE = piece("Reading - note.md");

const kinds = (xs) => xs.map((n) => n.kind);
const F = note(FULL);

/* ---------------------------------------------------------------- canvasOf */

test("a page draws its own blocks and has no cards", () => {
	const map = F.node("map");
	const c = canvasOf(F.root, map);
	assert.equal(c.holder, map);
	assert.equal(c.page, map, "a page node is its own page");
	assert.deepEqual(kinds(c.blocks), ["prose", "page-break", "prose"], "the page's three blocks, in order");
	assert.deepEqual(c.cards, []);
	assert.equal(c.focus, null);
	assert.equal(c.title, "The map");
	assert.deepEqual(kinds(c.crumb), ["booklet", "module", "activity", "activity-tab", "page"]);
	assert.equal(c.crumb[c.crumb.length - 1], map);
	assert.equal(c.firstPage, false);
});

test("a tab is one page of its own: its words are the first page, its pages are cards", () => {
	// a tab with words before its first page line (the format's first page) and two pages
	const t = note(bookletAround(["> [!activity|a] A", "", "> [!tab|t] The tab", "", "First page words.", "", "> [!text|q] A question?", "", "> [!page|p1] Page one", "", "One.", "", "> [!page|p2] Page two", "", "Two.", ""].join("\n")));
	const tab = t.node("t");
	const c = canvasOf(t.root, tab);
	assert.equal(c.page, null, "a tab is not a page node");
	assert.deepEqual(kinds(c.blocks), ["prose", "question"], "the words before the first page line");
	assert.deepEqual(c.cards.map((n) => n.id), ["p1", "p2"], "its pages, in file order");
	assert.deepEqual(c.later, []);
	assert.equal(c.title, "The tab");
	// the navigator's "First page" entry draws only the first page
	const only = canvasOf(t.root, tab, { firstPage: true });
	assert.deepEqual(kinds(only.blocks), ["prose", "question"]);
	assert.deepEqual(only.cards, []);
	assert.equal(only.firstPage, true);
	// a tab whose first child is a page line has no first page words: all cards
	const reading = canvasOf(F.root, F.node("read"));
	assert.deepEqual(reading.blocks, []);
	assert.deepEqual(reading.cards.map((n) => n.id), ["map", "choosing"], "pages are flat in file order, the `parent:` nesting is the navigator's");
});

test("an activity with no tab draws its opening and its pages; one with no page draws only blocks", () => {
	const wiki = note(PAGES_ONLY);
	const a = canvasOf(wiki.root, wiki.node("a"));
	assert.deepEqual(kinds(a.blocks), ["prose"], "the opening words, which are the activity's first page");
	assert.deepEqual(a.cards.map((n) => n.id), ["home", "child"]);
	assert.equal(a.title, "Wiki");
	const spending = canvasOf(F.root, F.node("spending"));
	assert.deepEqual(kinds(spending.blocks), ["prose", "question"]);
	assert.deepEqual(spending.cards, []);
	// an activity with tabs draws its opening and its tabs
	const why = canvasOf(F.root, F.node("why"));
	assert.deepEqual(why.blocks, []);
	assert.deepEqual(kinds(why.cards), ["activity-tab", "activity-tab"]);
});

test("a module draws its opening words and notice, then its tabs and activities as cards", () => {
	const c = canvasOf(F.root, F.node("money"));
	assert.deepEqual(kinds(c.blocks), ["prose", "notice"]);
	assert.deepEqual(kinds(c.cards), ["module-tab", "module-tab", "activity", "activity"]);
	assert.deepEqual(c.cards.map((n) => n.id), ["now", "learn", "spending", "why"]);
	assert.equal(c.title, "Money");
});

test("the booklet draws its opening, then its modules, bare activities and data sections; the front matter is the settings, not a block", () => {
	const c = canvasOf(F.root, null);
	assert.equal(c.holder, F.root);
	assert.deepEqual(kinds(c.blocks), ["prose", "callout"], "the front matter is not one of them");
	assert.deepEqual(kinds(c.cards), ["module", "activity", "data-section"]);
	assert.deepEqual(kinds(c.later), ["records"], "kept data after the first card is drawn read-only after the cards");
	assert.equal(c.focus, null);
	assert.deepEqual(c.crumb, [F.root]);
	assert.equal(c.title, "Booklet");
	assert.equal(canvasOf(F.root, null, { title: bookletTitleOf(FULL) }).title, "A made-up booklet");
	// selecting the front matter draws the booklet's page with the front matter in focus (the view draws its form)
	const fm = canvasOf(F.root, F.first("front-matter"));
	assert.equal(fm.holder, F.root);
	assert.equal(fm.focus?.kind, "front-matter");
	assert.ok(!fm.blocks.some((n) => n.kind === "front-matter"));
	// a note that is one activity: the booklet's only card is the activity with no line of its own
	const im = note(IMPLICIT);
	const ic = canvasOf(im.root, null);
	assert.deepEqual(kinds(ic.cards), ["activity"]);
	assert.equal(ic.cards[0].implicit, true);
	assert.equal(canvasOf(im.root, ic.cards[0], { title: "A made-up booklet" }).title, "A made-up booklet", "named by the booklet's title, as the format names it");
});

test("a selected block draws the page that holds it, with the block in focus", () => {
	const spent = F.at("[!text|spent]");
	const c = canvasOf(F.root, spent);
	assert.equal(c.holder, F.node("spending"));
	assert.equal(c.focus, spent);
	assert.equal(c.focusBlock, spent);
	assert.ok(c.blocks.includes(spent));
	// a question inside a group: the page of the tab that holds the group, and the group is the block that holds the focus
	const did = F.node("did");
	const d = canvasOf(F.root, did);
	assert.equal(d.holder, F.node("do"));
	assert.equal(d.focus, did);
	assert.equal(d.focusBlock?.kind, "group");
	assert.ok(d.blocks.includes(d.focusBlock));
	assert.deepEqual(kinds(d.crumb), ["booklet", "module", "activity", "activity-tab"]);
	// a block of a page draws that page
	const onMap = canvasOf(F.root, F.node("map").children[1]);
	assert.equal(onMap.holder, F.node("map"));
	assert.equal(onMap.page, F.node("map"));
	assert.equal(onMap.focus?.kind, "page-break");
});

test("every node of every fixture has a canvas that holds it (a block is on the page it is drawn on)", () => {
	let seen = 0;
	for (const [name, text] of Object.entries(ALL)) {
		const root = parseDesign(text);
		for (const n of walkDesign(root)) {
			const c = canvasOf(root, n);
			seen++;
			const mine = [...c.blocks, ...c.cards, ...c.later];
			if (c.focus && n.kind !== "front-matter") assert.ok(c.focusBlock && mine.includes(c.focusBlock), `${name}: ${n.kind} at ${n.start} is on its page`);
			if (c.holder.kind === "page") assert.deepEqual(mine, c.holder.children, `${name}: a page's blocks are all its children`);
			// the blocks and cards are children of the holder, once, in file order
			assert.deepEqual(mine, c.holder.children.filter((x) => mine.includes(x)), `${name}: in file order`);
			assert.equal(new Set(mine).size, mine.length);
		}
	}
	assert.ok(seen > 150, `many nodes (${seen})`);
});

/* ---------------------------------------------------------------- slotsOf */

test("slots: before the first block, between each pair, after the last", () => {
	const map = F.node("map");
	const c = canvasOf(F.root, map);
	const s = slotsOf(c);
	assert.deepEqual(s.map((x) => x.where), ["start", "between", "between", "end"], "three blocks make four slots");
	assert.deepEqual(s.map((x) => x.position.index), [0, 1, 2, 3]);
	assert.ok(s.every((x) => x.position.parent === map));
	assert.deepEqual(s.map((x) => x.after), [null, map.children[0], map.children[1], map.children[2]]);
	assert.deepEqual(s.map((x) => x.before), [map.children[0], map.children[1], map.children[2], null]);
	assert.equal(new Set(s.map((x) => x.id)).size, 4, "each has its own id");
	// the same tree gives the same ids
	assert.deepEqual(slotsOf(canvasOf(F.root, map)).map((x) => x.id), s.map((x) => x.id));
	// a page with no block has the one slot
	const choosing = slotsOf(canvasOf(F.root, F.node("choosing")));
	assert.equal(choosing.length, 1);
	assert.equal(choosing[0].where, "start");
	assert.equal(choosing[0].position.index, 0);
});

test("a canvas with cards has a child slot after the blocks' end slot", () => {
	const mod = F.node("money");
	const s = slotsOf(canvasOf(F.root, mod));
	assert.deepEqual(s.map((x) => x.where), ["start", "between", "end", "child"], "two blocks (words, notice), then the end of the module's parts");
	assert.equal(s[2].position.index, 2, "the end slot is above the first tab, still in the module's opening");
	assert.equal(s[3].position.parent, mod);
	assert.equal(s[3].position.index, mod.children.length);
	assert.equal(s[3].after, mod.children[mod.children.length - 1], "after the last card");
	// the booklet: the slots below the front matter, never above it
	const b = slotsOf(canvasOf(F.root, null));
	assert.deepEqual(b.map((x) => x.where), ["start", "between", "end", "child"]);
	assert.equal(b[0].position.index, 1, "below the front matter");
	// no block, with cards: the one slot is above the first part
	const why = slotsOf(canvasOf(F.root, F.node("why")));
	assert.deepEqual(why.map((x) => x.where), ["start", "child"]);
	assert.equal(why[0].position.index, 0);
	// a booklet of the front matter and nothing else is one empty activity (the format's reading of a note with no activity line): its
	// card is the one part, and the slot for words is below the front matter, above it
	const empty = note(bookletAround(""));
	const ec = canvasOf(empty.root, null);
	assert.deepEqual(kinds(ec.cards), ["activity"]);
	const e = slotsOf(ec);
	assert.deepEqual(e.map((x) => x.where), ["start", "child"]);
	assert.equal(e[0].position.index, 1);
	// the questions of such a note are added on the activity's own page
	assert.equal(tileState(empty.root, canvasOf(empty.root, ec.cards[0]), QUESTION).ok, true);
});

/* ---------------------------------------------------------------- legality */

test("a tab is refused on a page and accepted at the activity's own level", () => {
	const map = F.node("map");
	const onPage = canvasOf(F.root, map);
	assert.deepEqual(legalSlots(F.root, onPage, TAB), [], "no place on the page 'The map' takes a tab");
	const st = tileState(F.root, onPage, TAB);
	assert.equal(st.ok, false);
	assert.match(st.reason, /A tab starts at the activity's own level/, "in design-places' own words");
	assert.equal(slotAccepts(F.root, slotsOf(onPage)[1], TAB).ok, false);
	// the activity's own page: a tab goes at the end of the activity
	const own = canvasOf(F.root, F.node("why"));
	assert.equal(tileState(F.root, own, TAB).ok, true);
	const legal = legalSlots(F.root, own, TAB);
	// above the first tab (a new first tab) or at the end of the activity: both are the activity's own level
	assert.deepEqual(legal.map((x) => x.where), ["start", "child"]);
	assert.ok(legal.every((x) => slotAccepts(F.root, x, TAB).ok));
});

test("the end of the last page of a tab is the activity's own level too: the format's boundary, not the view's", () => {
	// 'Choosing' is the last page of the tab 'Reading', and 'Doing' follows: a tab line there starts a tab between them
	const c = canvasOf(F.root, F.node("choosing"));
	const ok = legalSlots(F.root, c, TAB);
	assert.deepEqual(ok.map((x) => x.where), ["start"]);
	// 'The map' is not the last page, so the end of it is inside the tab
	assert.deepEqual(legalSlots(F.root, canvasOf(F.root, F.node("map")), TAB), []);
});

test("the child slot takes a part, a block slot takes a block, and each is asked of design-places", () => {
	const mod = canvasOf(F.root, F.node("money"));
	const [start, between, end, child] = slotsOf(mod);
	// an activity goes below the module's tabs: not in the opening, and at the end
	assert.deepEqual(legalSlots(F.root, mod, ACTIVITY).map((x) => x.where), ["child"]);
	assert.equal(slotAccepts(F.root, start, ACTIVITY).ok, false);
	assert.match(slotAccepts(F.root, end, ACTIVITY).reason, /module's tabs are declared in its opening/);
	// a tab (a module's, here) goes in the opening: above the first tab, or at the child slot, which files it with the module's tabs
	// (above its first activity), as "+ Add" in the module does
	assert.equal(slotAccepts(F.root, child, TAB).ok, true);
	assert.equal(slotAccepts(F.root, start, TAB).ok, true);
	assert.equal(slotPositionFor(child, TAB).index, F.node("money").children.findIndex((c) => c.kind === "activity"));
	// words go among the blocks; the child slot is for parts
	assert.equal(slotAccepts(F.root, between, NOTE).ok, true);
	const r = slotAccepts(F.root, child, NOTE);
	assert.equal(r.ok, false);
	assert.match(r.reason, /adds a part/);
	// a question is not offered in a module's opening (design-places' ruling), and no slot of the module takes one
	assert.deepEqual(legalSlots(F.root, mod, QUESTION), []);
	assert.match(tileState(F.root, mod, QUESTION).reason, /A question belongs inside an activity/);
	// a module goes in the booklet, never in a module
	assert.equal(tileState(F.root, mod, MODULE).ok, false);
	assert.equal(tileState(F.root, canvasOf(F.root, null), MODULE).ok, true);
});

test("a question is lit on an activity's page and a page on a tab's; the child slot's position is the piece's own (addPosition)", () => {
	const spending = canvasOf(F.root, F.node("spending"));
	assert.equal(tileState(F.root, spending, QUESTION).ok, true);
	assert.equal(legalSlots(F.root, spending, QUESTION).length, 3, "start, between and end of its two blocks");
	const read = canvasOf(F.root, F.node("read"));
	assert.equal(tileState(F.root, read, PAGE).ok, true);
	const slot = slotsOf(read).find((x) => x.where === "child");
	assert.equal(slotPositionFor(slot, PAGE).parent, F.node("read"));
	// a module's module tab goes above its first activity, where "+ Add" in the module puts it; a module added to the booklet goes above its data section
	const booklet = canvasOf(F.root, null);
	const bSlot = slotsOf(booklet).find((x) => x.where === "child");
	const pos = slotPositionFor(bSlot, MODULE);
	assert.equal(pos.parent, F.root);
	assert.equal(F.root.children[pos.index].kind, "data-section", "above the data section that closes the booklet");
	assert.equal(positionLine(pos), F.root.children[pos.index].start);
});

test("tileState with a chosen slot asks that slot, and says so when the slot is not on the page", () => {
	const spending = canvasOf(F.root, F.node("spending"));
	const [a, b] = slotsOf(spending);
	assert.equal(tileState(F.root, spending, NOTE, a.id).ok, true);
	assert.equal(tileState(F.root, spending, TAB, b.id).ok, true, "a tab line may stand inside an activity's words: the words after it become the tab's");
	assert.equal(tileState(F.root, spending, MODULE, b.id).ok, false);
	assert.match(tileState(F.root, spending, MODULE, b.id).reason, /A module stands at the top of the booklet/);
	const gone = tileState(F.root, spending, NOTE, "nope");
	assert.deepEqual(gone, { ok: false, reason: "That place is not on this page." });
	// a slot read from another parse of the note is refused, not guessed at
	const other = note(FULL);
	const stale = slotAccepts(other.root, slotsOf(spending)[0], NOTE);
	assert.equal(stale.ok, false);
	assert.match(stale.reason, /another reading of the note/);
});

test("every slot's answer is design-places' own on the position the slot names", () => {
	const root = F.root;
	const { canPlacePiece } = core;
	let asked = 0;
	for (const n of walkDesign(root)) {
		const c = canvasOf(root, n);
		for (const s of slotsOf(c)) {
			for (const p of [NOTE, QUESTION, TAB, PAGE, ACTIVITY]) {
				const mine = slotAccepts(root, s, p);
				if (s.where !== "child") assert.deepEqual(mine, canPlacePiece(s.position, p), `${n.kind} ${n.start} ${s.id} ${p.file}`);
				asked++;
			}
		}
	}
	assert.ok(asked > 300);
});

/* ---------------------------------------------------------------- navEntries */

const brief = (e) => `${"  ".repeat(e.depth)}${e.kind}:${e.label}`;

test("the navigator: settings, the booklet, modules, their tabs and activities, activity tabs, pages nested by `parent:`", () => {
	const nav = navEntries(F.root, { title: "A made-up booklet" });
	assert.deepEqual(nav.map(brief), [
		"settings:Settings",
		"booklet:A made-up booklet",
		"  module:Money",
		"    module-tab:This month",
		"    module-tab:Learn",
		"    activity:Spending",
		"    activity:Why a budget helps",
		"      activity-tab:Reading",
		"        page:The map",
		"          page:Choosing",
		"      activity-tab:Doing",
		"  activity:A bare activity",
		"  data-section:Data for Money",
	]);
	assert.equal(nav[0].node?.kind, "front-matter", "the settings entry opens the front matter");
	assert.equal(nav[0].holder, F.root);
	assert.equal(nav[1].node, F.root);
	assert.deepEqual(nav.map((e) => e.level), ["booklet", "booklet", "module", "module-tab", "module-tab", "activity", "activity", "activity-tab", "page", "page", "activity-tab", "activity", "block"]);
	// blocks are not in it
	assert.ok(nav.every((e) => !e.node || !["prose", "question", "callout", "group", "row", "notice", "fence", "records", "page-break"].includes(e.node.kind)));
});

test("the navigator lists a tab's or an activity's first page when it has pages, and not when it is one page", () => {
	const sketch = note(SKETCH);
	const nav = navEntries(sketch.root);
	const light = nav.findIndex((e) => e.label === "Where the light falls");
	assert.deepEqual(nav.slice(light, light + 4).map(brief), ["    activity:Where the light falls", "      first-page:First page", "      page:Cast shadows", "        page:Reflected light"]);
	const fp = nav[light + 1];
	assert.equal(fp.node, null, "a first page is words, not a node");
	assert.equal(fp.holder.id, "light");
	assert.equal(fp.level, "page");
	// a canvas for it: the activity's opening, with no cards
	const c = canvasOf(sketch.root, fp.holder, { firstPage: true });
	assert.deepEqual(kinds(c.blocks), ["prose"]);
	assert.deepEqual(c.cards, []);
	// an activity with no page is one page: no first-page entry under it
	assert.ok(!nav.slice(nav.findIndex((e) => e.label === "Lines that hold") + 1).slice(0, 1).some((e) => e.kind === "first-page"));
	const wiki = navEntries(note(PAGES_ONLY).root).map(brief);
	assert.deepEqual(wiki, ["settings:Settings", "booklet:Booklet", "  activity:Wiki", "    first-page:First page", "    page:Home", "      page:Child"]);
});

test("a note with no front matter has the booklet first; one activity has no line of its own", () => {
	const bare = note("> [!activity|a] A\n\nWords.\n");
	assert.deepEqual(navEntries(bare.root).map(brief), ["booklet:Booklet", "  activity:A"]);
	const one = navEntries(note(IMPLICIT).root, { title: "A made-up booklet" }).map(brief);
	assert.deepEqual(one, ["settings:Settings", "booklet:A made-up booklet", "  activity:A made-up booklet", "    activity-tab:Second", "      page:A page"]);
});

test("every module, tab, activity, page and data section of every fixture and test-vault note is in the navigator once, in file order", () => {
	const vault = readdirSync(join(ROOT, "test-vault")).filter((f) => f.endsWith(".md")).map((f) => [f, readFileSync(join(ROOT, "test-vault", f), "utf8")]);
	for (const [name, text] of [...Object.entries(ALL), ...vault]) {
		const root = parseDesign(text);
		const nav = navEntries(root);
		const nodes = nav.filter((e) => e.node && e.kind !== "settings").map((e) => e.node);
		assert.equal(new Set(nodes).size, nodes.length, `${name}: no node twice`);
		for (const n of navigableNodes(root)) assert.ok(nodes.includes(n), `${name}: ${n.kind} at ${n.start} is listed`);
		// file order: the line numbers of the entries rise, except that pages come under their `parent:`
		const lines = nodes.filter((n) => n.kind !== "page").map((n) => n.start);
		assert.deepEqual(lines, [...lines].sort((a, b) => a - b), `${name}: in file order`);
		assert.equal(nav[0].kind, root.children.some((c) => c.kind === "front-matter") ? "settings" : "booklet", `${name}: the first entry`);
		for (const e of nav) assert.ok(e.depth >= 0 && e.label !== undefined && e.holder);
	}
});

/* ---------------------------------------------------------------- the front matter */

const fmNode = (text) => parseDesign(text).children.find((c) => c.kind === "front-matter");
const fmOf = (text) => frontMatterFormOf(text, fmNode(text));
const field = (form, key) => form.fields.find((f) => f.key === key);
const differing = (a, b) => {
	const x = a.split("\n");
	const y = b.split("\n");
	assert.equal(x.length, y.length);
	return x.map((l, i) => (l === y[i] ? -1 : i)).filter((i) => i >= 0);
};

test("the front matter's form: the keys the format lists, the marker read-only, unknown keys kept and listed", () => {
	const f = fmOf(FULL);
	assert.equal(f.marker, "0.20");
	assert.deepEqual(f.fields.map((x) => x.key), ["id", "title", "description", "lang", "version", "start", "media-from", "copyright", "license", "source"]);
	assert.equal(field(f, "id").value, "local/made-up");
	assert.equal(field(f, "title").value, "A made-up booklet");
	assert.equal(field(f, "lang").value, "en");
	assert.equal(field(f, "version").value, "0.1", "a quoted value is read with its quotes off");
	assert.equal(field(f, "description").present, false);
	assert.equal(field(f, "start").type, "choice");
	assert.deepEqual(field(f, "start").options, ["", "home"]);
	assert.deepEqual(f.other, []);
	const odd = bookletAround("> [!activity|a] A\n").replace("lang: en\n", "lang: en\ntags:\n  - one\n  - two\nfavourite: '#7'\nmedia-from:\n  - https://a.example\n  - https://b.example\nstart: home\n");
	const g = fmOf(odd);
	assert.deepEqual(g.other.map((o) => o.key), ["tags", "favourite"]);
	assert.equal(g.other[0].text, "tags:\n  - one\n  - two", "a list is shown as written");
	assert.equal(field(g, "media-from").locked !== null, true, "a list value cannot be changed by one line");
	assert.equal(field(g, "start").value, "home");
	assert.equal(frontMatterFormOf(FULL, F.root), null, "only the front matter has one");
	assert.equal(frontMatterFormOfLines(["no front matter"]), null);
	// the reader's own reading of the title is the form's
	assert.equal(bookletTitleOf(FULL), parseBooklet(FULL).title);
});

test("every test-vault note's front matter reads as the reader reads it, and writing a value that is already there changes nothing", () => {
	const names = readdirSync(join(ROOT, "test-vault")).filter((f) => f.endsWith(".booklet.md"));
	assert.ok(names.length >= 6);
	for (const name of names) {
		const text = readFileSync(join(ROOT, "test-vault", name), "utf8");
		const book = parseBooklet(text);
		const form = fmOf(text);
		assert.equal(field(form, "title").value, book.title, name);
		assert.equal(field(form, "id").value, book.frontMatter["id"] ?? "", name);
		assert.equal(form.marker, "0.20", name);
		const lines = text.split("\n").slice(0, fmNode(text).end);
		for (const key of ["id", "title", "lang"]) {
			const r = applyFrontMatterChange(lines, { key, value: field(form, key).value });
			assert.equal(r.ok, true);
			assert.deepEqual(r.lines, lines, `${name}: ${key} as it is is no change`);
		}
	}
});

test("a front matter change rewrites that one line and no other byte of the note", () => {
	const node = fmNode(FULL);
	const op = changeFrontMatter(FULL, node, { key: "title", value: "Money, a plan" });
	assert.equal(op.ok, true);
	const k = lineOf(FULL, "title: A made-up booklet");
	assert.deepEqual(differing(FULL, op.text), [k], "only the title's line differs");
	assert.equal(op.text.split("\n")[k], "title: Money, a plan", "written plain when YAML reads it back the same");
	// a title that needs quoting is written quoted; a value already in quotes keeps its quotes
	assert.equal(changeFrontMatter(FULL, node, { key: "title", value: "Plan: money" }).text.split("\n")[k], 'title: "Plan: money"');
	const v = lineOf(FULL, "version:");
	assert.equal(changeFrontMatter(FULL, node, { key: "version", value: "0.2" }).text.split("\n")[v], 'version: "0.2"', "the quotes stay");
	// a key that is not there is added as one line above the closing line
	const add = changeFrontMatter(FULL, node, { key: "description", value: "Why a budget helps." });
	assert.equal(add.ok, true);
	const expected = FULL.split("\n");
	expected.splice(6, 0, "description: Why a budget helps.");
	assert.deepEqual(add.text.split("\n"), expected, "one line added above the closing `---`, every other line the same");
	// an empty value takes the line out
	const gone = changeFrontMatter(FULL, node, { key: "lang", value: "" });
	assert.equal(gone.text.split("\n").length, FULL.split("\n").length - 1);
	assert.ok(!gone.text.includes("lang: en"));
	// the change as the shell applies it is the smallest replacement
	assert.ok(op.change && op.change.text.length < 40 && op.change.to - op.change.from < 40);
	// Windows line endings stay
	const win = crlf(FULL);
	const w = changeFrontMatter(win, fmNode(win), { key: "title", value: "Money" });
	assert.equal(w.text.split("\n")[k], "title: Money\r");
	assert.deepEqual(differing(win, w.text), [k]);
	const wadd = changeFrontMatter(win, fmNode(win), { key: "source", value: "https://example.org" });
	assert.equal(wadd.text.split("\n")[6], "source: https://example.org\r");
});

test("a front matter change is refused with a reason and nothing written: the marker, a key with no row, a list, a line break, `start`", () => {
	const lines = FULL.split("\n").slice(0, 8);
	const no = (change, re, ls = lines) => {
		const r = applyFrontMatterChange(ls, change);
		assert.equal(r.ok, false, JSON.stringify(change));
		assert.match(r.reason, re);
	};
	no({ key: "booklet", value: "0.21" }, /never changes a file's marker/);
	no({ key: "tags", value: "x" }, /no row for it/);
	no({ key: "title", value: "a\nb" }, /one line/);
	no({ key: "start", value: "away" }, /takes only the value `home`/);
	no({ key: "title", value: "x" }, /no front matter/, ["Words."]);
	no({ key: "title", value: "x" }, /never closed/, ["---", 'booklet: "0.20"']);
	const listed = ["---", 'booklet: "0.20"', "media-from:", "  - https://a.example", "  - https://b.example", "---"];
	no({ key: "media-from", value: "https://c.example" }, /several lines/, listed);
	// the other keys, and the list's own lines, are the same after a change elsewhere
	const r = applyFrontMatterChange(listed, { key: "title", value: "T" });
	assert.deepEqual(r.lines, ["---", 'booklet: "0.20"', "media-from:", "  - https://a.example", "  - https://b.example", "title: T", "---"]);
	assert.equal(applyFrontMatterChange(lines, { key: "start", value: "home" }).ok, true);
	const dup = applyFrontMatterChange(["---", 'booklet: "0.20"', "title: A", "title: B", "---"], { key: "title", value: "C" });
	assert.deepEqual(dup.lines, ["---", 'booklet: "0.20"', "title: A", "title: C", "---"], "the last one is the one the reader keeps");
	// through the note: the same refusal, and the note is untouched
	const op = changeFrontMatter(FULL, fmNode(FULL), { key: "booklet", value: "0.21" });
	assert.equal(op.ok, false);
	assert.equal(changeFrontMatter(FULL, F.root, { key: "title", value: "x" }).ok, false);
});

/* ---------------------------------------------------------------- applyFormChange */

/** The changes worth trying on a form: each row, changed. */
function changesOf(form) {
	const out = [];
	for (const f of form.fields) {
		if (f.type === "id") out.push({ what: "id", value: f.value + "x" }, { what: "id", value: "bad id!" });
		else if (f.type === "title") out.push({ what: "title", value: "A new title" }, { what: "title", value: "" });
		else if (f.type === "flag") out.push({ what: "flag", name: f.name, on: !f.on });
		else out.push({ what: "value", name: f.name, value: f.value ? "" : "3" }, { what: "value", name: f.name, value: "has space" });
	}
	form.stray.forEach((s) => out.push({ what: "stray", index: s.index }));
	return out;
}

test("applyFormChange is changeForm without the note: the same lines out, the same refusals, on every fixture", () => {
	let tried = 0;
	for (const [name, text] of Object.entries(ALL)) {
		const root = parseDesign(text);
		for (const n of walkDesign(root)) {
			const form = formOf(text, n);
			if (!form) continue;
			const lines = blockLines(text, n);
			for (const change of changesOf(form)) {
				tried++;
				const draft = applyFormChange(lines, change);
				const done = changeForm(text, n, change);
				const where = `${name}: ${n.kind} at ${n.start} ${JSON.stringify(change)}`;
				if (draft.ok) {
					// the opening line rewritten, every other line as it was
					assert.deepEqual(draft.lines.slice(1), lines.slice(1), where);
					assert.equal(draft.lines.length, lines.length, where);
					if (done.ok) assert.equal(done.text, changeLines(text, n, draft.lines).text, where);
					else assert.ok(change.what === "id" || /could not open/.test(done.reason), `${where}: refused only by the note (${done.reason})`);
				} else {
					assert.equal(done.ok, false, where);
					if (change.what !== "id") assert.equal(done.reason, draft.reason, where);
				}
			}
		}
	}
	assert.ok(tried > 150, `many changes were tried (${tried})`);
});

test("applyFormChange on a draft: a block's lines in, its lines out, no note and no file", () => {
	const draft = ["> [!text|spent] What did you spend?", "", "> [!hint]- Think of today", "> Start with the biggest."];
	const r = applyFormChange(draft, { what: "title", value: "What did it cost?" });
	assert.deepEqual(r, { ok: true, lines: ["> [!text|spent] What did it cost?", ...draft.slice(1)] });
	const flag = applyFormChange(draft, { what: "flag", name: "long", on: true });
	assert.equal(flag.lines[0], "> [!text|spent long] What did you spend?");
	assert.equal(applyFormChange(["Some words."], { what: "title", value: "x" }).ok, false);
	assert.match(applyFormChange(draft, { what: "id", value: "no good" }).reason, /letters, digits and dashes/);
	assert.match(applyFormChange(draft, { what: "value", name: "each", value: "a b" }).reason, /no spaces/);
	// the id's clash with the note is a separate question, asked of the note
	assert.match(formIdClash(FULL, F.node("spending"), "why"), /already used/);
	assert.equal(formIdClash(FULL, F.node("spending"), "fresh"), null);
});
