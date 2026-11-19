/*
 * Where a piece may stand: each rule of the design note's table (section 2), tried where it holds and where it does not, with the SPEC
 * line it comes from. A position is a container and an index among its children.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { core, bookletAround } from "./helpers.mjs";
import { BARE, FULL, IMPLICIT, ONE_ACTIVITY, PAGES_ONLY, UNREAD, lineOf } from "./design-fixtures.mjs";

const {
	parseDesign,
	walkDesign,
	placeCheck,
	legalKinds,
	missingParents,
	containerAdds,
	addPosition,
	positionAtLine,
	positionAtStart,
	positionBefore,
	positionAfter,
	positionIn,
	positionLine,
	needsOf,
	canPlacePiece,
	legalPieces,
	PIECES,
	PLACE_KINDS,
} = core;

/** A note read, with ways to name a position in it. */
function note(text) {
	const root = parseDesign(text);
	const node = (id, kind) => {
		const n = walkDesign(root).find((x) => x.id === id && (!kind || x.kind === kind));
		assert.ok(n, `the note has ${id}`);
		return n;
	};
	const first = (kind) => {
		const n = walkDesign(root).find((x) => x.kind === kind);
		assert.ok(n, `the note has a ${kind}`);
		return n;
	};
	return { root, text, node, first, line: (l) => positionAtLine(root, typeof l === "string" ? lineOf(text, l) : l) };
}

const F = note(FULL);
const ok = (kind, pos, why = "") => assert.equal(placeCheck(kind, pos).ok, true, `${kind} may stand ${why}: ${JSON.stringify(placeCheck(kind, pos))}`);
const no = (kind, pos, reason, why = "") => {
	const r = placeCheck(kind, pos);
	assert.equal(r.ok, false, `${kind} may not stand ${why}`);
	if (reason) assert.match(r.reason, reason, why);
	return r;
};

test("a module stands at the top of the booklet, never inside one", () => {
	// SPEC section 3: "A module is fenced: an opening line and a closing line, both required."
	ok("module", positionBefore(F.node("money")), "above the first module");
	ok("module", positionAfter(F.node("money")), "after a module");
	ok("module", positionIn(F.root), "at the end of the booklet");
	ok("module", positionAfter(F.node("bare")), "after a bare activity: its end is the end of the activity, so the module line closes it");
	no("module", positionIn(F.node("money")), /never inside another module/, "in a module");
	no("module", positionBefore(F.node("spending")), /top of the booklet/, "between a module's activities");
	no("module", positionIn(F.node("spending")), /top of the booklet/, "inside an activity");
	no("module", positionIn(F.first("group")), /can hold no structure line/, "inside a group");
	no("module", positionAtStart(F.first("data-section")), /top of the booklet/, "inside a data section, above its blocks, which it would cut off");
	no("module", positionBefore(F.node("why", "activity")), undefined, "above an activity of a module");
	no("module", note(IMPLICIT).line("Some words"), /one activity with no activity line/, "in a note that is one activity");
});

test("an activity stands in a module, or bare at the top; it can neither nest nor cut a module's tabs off", () => {
	// SPEC section 3: "An activity starts at an activity line and runs to the next one." and "A bare activity sits outside any module fence, by convention before the first one."
	ok("activity", positionIn(F.node("money")), "at the end of a module");
	ok("activity", positionBefore(F.node("why")), "between two activities");
	ok("activity", positionBefore(F.node("spending")), "below the module's tabs");
	ok("activity", positionBefore(F.node("money")), "bare, above the first module");
	assert.equal(placeCheck("activity", positionBefore(F.node("money"))).note, undefined, "no note above the first module");
	assert.match(placeCheck("activity", positionAfter(F.node("money"))).note, /before the first module by convention/, "a bare activity after a module is allowed, with a note");
	ok("activity", positionIn(note(BARE).root), "after bare activities");
	// SPEC section 3, 'A module's tabs': "Tab lines in a module's opening (inside its fence, before its first activity) declare the module's tabs"
	no("activity", positionAtStart(F.node("money")), /module's tabs are declared in its opening/, "above a module tab");
	no("activity", positionAtStart(F.node("now")), /stands in a module/, "inside a module tab's prose, which it would cut in two");
	// SPEC section 3: "An activity does not sit under another."
	no("activity", positionBefore(F.node("spent")), /not inside another activity/, "inside an activity");
	no("activity", positionBefore(F.first("group")), /not inside another activity/, "inside an activity's tab");
	no("activity", positionIn(F.first("group")), /not inside another activity|group/, "inside a group");
	no("activity", positionIn(F.first("row")), /row|another activity/, "inside a row");
	no("activity", positionAtStart(F.first("data-section")), /not inside another activity/, "inside a data section, whose blocks it would cut off");
	// a note with no activity line is one activity: an activity can only go above all of it
	const one = note(IMPLICIT);
	ok("activity", positionAtLine(one.root, 8), "above all the text of a note that is one activity");
	no("activity", positionIn(one.first("activity-tab")), undefined, "inside it");
});

test("a module tab stands in a module's opening, before its first activity", () => {
	// SPEC section 3, 'A module's tabs'
	ok("module-tab", positionBefore(F.node("spending")), "after the last tab, above the first activity");
	ok("module-tab", positionAfter(F.node("now")), "between two module tabs");
	ok("module-tab", positionAtStart(F.node("money")), "at the very start of the opening");
	ok("module-tab", positionAtStart(note(ONE_ACTIVITY).first("module")), "in a module of one activity (the linter warns, the format allows it)");
	no("module-tab", positionBefore(F.node("why")), /before its first activity/, "after the first activity");
	no("module-tab", positionIn(F.node("money")), /before its first activity/, "at the end of the module");
	no("module-tab", positionIn(F.node("spending")), /before its first activity/, "at the end of an activity: the same line as the start of what follows it");
	no("module-tab", positionBefore(F.node("spent")), /activity's own/, "inside an activity (that tab would be the activity's)");
	no("module-tab", positionBefore(F.node("bare")), /module's opening/, "at the top of the booklet");
	no("module-tab", positionIn(F.first("group")), undefined, "inside a group");
});

test("an activity's tab stands at the activity's own level, and never after a page of an activity with no tabs", () => {
	// SPEC section 3, 'Tabs': "A tab line ... inside an activity starts a tab that runs to the next tab line or to the end of the activity"
	ok("activity-tab", positionBefore(F.node("read")), "above the first tab");
	ok("activity-tab", positionAfter(F.node("read")), "between two tabs");
	ok("activity-tab", positionIn(F.node("why")), "at the end of the activity");
	ok("activity-tab", positionIn(F.node("do")), "at the end of the last tab: the same line as the end of the activity");
	ok("activity-tab", positionIn(F.node("spending")), "in an activity with no tabs");
	const wiki = note(PAGES_ONLY);
	ok("activity-tab", positionBefore(wiki.node("home")), "above the pages of an activity with no tabs: they would then stand in the new tab");
	// the linter: "a page line before the activity's first tab line stands in the activity's opening ... no page of any tab"
	no("activity-tab", positionAfter(wiki.node("home")), /cannot come after a page line/, "after a page of an activity with no tabs");
	no("activity-tab", positionIn(wiki.node("a")), /cannot come after a page line/, "at the end of such an activity");
	no("activity-tab", positionBefore(F.node("choosing")), /activity's own level/, "between two pages of a tab");
	no("activity-tab", positionIn(F.node("money")), /module tab/, "in a module's opening");
	no("activity-tab", positionBefore(F.node("money")), /activity's own level|module tab/, "at the top");
	no("activity-tab", positionIn(F.first("group")), undefined, "inside a group");
	no("activity-tab", positionIn(F.first("row")), undefined, "inside a row");
});

test("a page stands in a tab, or anywhere in an activity with no tab; not in an opening, a group or a row", () => {
	// SPEC section 3, 'Pages': "Where a page line may stand. In an activity: in one of its tabs, or anywhere in an activity with no tab line."
	ok("page", positionIn(F.node("do")), "in a tab");
	ok("page", positionAfter(F.node("map")), "between two pages");
	ok("page", positionBefore(F.node("map")), "at the top of a tab");
	ok("page", positionIn(F.node("read")), "at the end of a tab");
	ok("page", positionAfter(F.node("read")), "after the tab it follows: it lands in that tab");
	const wiki = note(PAGES_ONLY);
	ok("page", positionIn(wiki.node("a")), "in an activity with no tab line");
	ok("page", positionBefore(wiki.node("home")), "above the first page of one");
	ok("page", positionAtLine(note(IMPLICIT).root, 14), "in a tab of a note that is one activity");
	no("page", positionAtLine(note(IMPLICIT).root, 12), /activity's opening/, "above the first tab of a note that is one activity");
	// "in an activity's opening, which is what comes before its first tab line when it has tabs"
	no("page", positionAtStart(F.node("why")), /activity's opening/, "above the first tab");
	no("page", positionBefore(F.node("read")), /activity's opening/, "right above the first tab");
	// "outside every activity: in the booklet's opening, in a module's opening (so a module needs an activity line before its pages)"
	no("page", positionAtStart(F.node("money")), undefined, "in a module's opening");
	no("page", positionBefore(F.node("money")), undefined, "in the booklet's opening");
	// "in a group, or inside an open row"
	no("page", positionIn(F.first("group")), /group/, "in a group");
	no("page", positionIn(F.first("row")), /row/, "in a row");
	ok("page", positionBefore(F.node("choosing")), "between two pages of a tab");
	no("page", positionAtLine(F.root, lineOf(FULL, "A second part.")), /not inside one/, "in the middle of a page");
	no("page", positionIn(F.first("data-section")), undefined, "in a data section");
});

test("a page in a module with no activity needs an activity first", () => {
	const empty = note(bookletAround("> [!module|m] M\n\n> [!module|m end]\n"));
	const r = no("page", positionIn(empty.node("m")), /needs an activity/, "in a module with no activity");
	assert.equal(r.needs, "activity");
	assert.deepEqual(missingParents(empty.root, positionIn(empty.node("m"))).map((x) => x.kind), ["activity-tab", "page", "question", "copy", "row", "group", "query", "page-break"].filter((k) => placeCheck(k, positionIn(empty.node("m"))).needs));
	assert.ok(missingParents(empty.root, positionIn(empty.node("m"))).every((x) => x.first === "activity"));
	// with an activity somewhere in the module there is nothing to add first
	assert.equal(placeCheck("page", positionIn(F.node("money"))).needs, undefined);
	// the module's own "+ Add" says so
	const adds = containerAdds(empty.node("m"));
	assert.deepEqual(adds.first, [{ kind: "page", first: "activity" }]);
	assert.deepEqual(adds.kinds, ["activity", "module-tab", "notice", "callout", "text", "menu", "data-block"]);
	assert.match(adds.empty, /Add an activity/);
});

test("a question stands anywhere an activity's content may stand; not in a module's opening (Ben's ruling) or before the first activity", () => {
	// SPEC section 3: "A question line before the file's first module or activity line belongs to no activity: a renderer reports it and draws it nowhere"
	for (const [where, pos] of [
		["an activity's text", positionIn(F.node("spending"))],
		["a tab", positionIn(F.node("do"))],
		["a page", positionIn(F.node("map"))],
		["a row", positionIn(F.first("row"))],
		["a group", positionIn(F.first("group"))],
		["a bare activity", positionIn(F.node("bare"))],
		["the end of a module, in its last activity", positionIn(F.node("money"))],
		["a note that is one activity", positionAtLine(note(IMPLICIT).root, 12)],
	]) ok("question", pos, `in ${where}`);
	// the format is silent on a module's opening; the design note's open call 4, answered by Ben: not offered
	const inOpening = no("question", positionAtStart(F.node("money")), /not offered in a module's opening/, "in a module's opening");
	assert.equal(inOpening.needs, undefined, "the module has an activity, so nothing is missing");
	no("question", positionBefore(F.node("spending")), /not offered in a module's opening/, "just above a module's first activity");
	no("question", positionIn(F.node("now")), /not offered in a module's opening/, "in a module tab's prose");
	no("question", positionBefore(F.node("money")), /not before the file's first module or activity line/, "in the booklet's opening");
	no("question", positionAfter(F.node("money")), /belongs inside an activity/, "between modules");
	no("question", positionIn(F.first("data-section")), /data section/, "in a data section");
	const solo = note(bookletAround("> [!module|m] M\n\n> [!module|m end]\n"));
	assert.equal(no("question", positionIn(solo.node("m"))).needs, "activity", "a module with no activity: an activity first");
});

test("a copy button and a query view stand where a question does", () => {
	// SPEC section 6, 'Copy': "In an activity, wherever a question may stand ... Not in a module's opening, not before the file's first module or activity line, not in a data section"
	for (const kind of ["copy", "query"]) {
		ok(kind, positionIn(F.node("spending")));
		ok(kind, positionIn(F.first("group")));
		ok(kind, positionIn(F.first("row")));
		no(kind, positionAtStart(F.node("money")), /belongs inside an activity|belongs in an activity/, "a module's opening");
		no(kind, positionBefore(F.node("money")), /belongs inside an activity|belongs in an activity/, "the booklet's opening");
		no(kind, positionIn(F.first("data-section")), undefined, "a data section");
	}
});

test("a row stands in an activity, not inside a row, not in a group, not across a break", () => {
	// SPEC section 3, 'Rows': "Rows do not nest, and a row does not cross a thematic break, a tab line, a page line, an activity line or a module fence."
	ok("row", positionIn(F.node("spending")));
	ok("row", positionIn(F.node("map")), "in a page");
	ok("row", positionIn(F.node("do")), "in a tab");
	no("row", positionIn(F.first("row")), /does not nest/, "in a row");
	no("row", positionIn(F.first("group")), /group/, "in a group");
	no("row", positionAtStart(F.node("money")), /stands in an activity/, "in a module's opening");
	no("row", positionBefore(F.node("money")), /stands in an activity/, "in the booklet's opening");
});

test("a group stands in an activity and holds blocks, never a structure line", () => {
	// SPEC section 6: "A line that makes structure (module, activity, tab, page, row, data, records) cannot go inside a group"
	ok("group", positionIn(F.node("spending")));
	ok("group", positionIn(F.first("group")), "a group in a group");
	ok("group", positionIn(F.first("row")), "a group in a row");
	// "Outside an activity (in a module's opening or the booklet's) a group is a plain fold of Markdown"
	no("group", positionAtStart(F.node("money")), /plain fold of Markdown/, "in a module's opening");
	no("group", positionBefore(F.node("money")), /plain fold of Markdown/, "in the booklet's opening");
	const g = F.first("group");
	for (const kind of ["module", "activity", "module-tab", "activity-tab", "page", "row", "data-section", "notice", "page-break", "theme", "menu", "data-block"]) no(kind, positionIn(g), undefined, `a ${kind} in a group`);
	for (const kind of ["question", "copy", "query", "group", "callout", "text"]) ok(kind, positionIn(g), `a ${kind} in a group`);
});

test("a row holds what a cell holds, and no structure line", () => {
	const r = F.first("row");
	for (const kind of ["question", "copy", "query", "group", "callout", "text", "menu", "data-block"]) ok(kind, positionIn(r), `a ${kind} in a row`);
	for (const kind of ["module", "activity", "module-tab", "activity-tab", "page", "row", "page-break", "data-section", "notice"]) no(kind, positionIn(r), /row/, `a ${kind} in a row`);
});

test("a notice stands in a module's opening, once", () => {
	// SPEC section 3, 'A module's notice': "A module has at most one, and it sits inside the module's fence before the module's first activity."
	const solo = note(ONE_ACTIVITY);
	ok("notice", positionBefore(solo.node("a")), "a module with none");
	ok("notice", positionAtStart(solo.first("module")), "at the start of its opening");
	no("notice", positionAfter(solo.node("a")), /before the module's first activity/, "after the first activity");
	no("notice", positionBefore(F.node("spending")), /at most one notice/, "a module that has one");
	no("notice", positionAtStart(F.node("money")), /at most one notice/, "a module that has one, at its start");
	no("notice", positionBefore(F.node("money")), /inside a module's fence/, "outside every module");
	no("notice", positionIn(F.node("spending")), /before the module's first activity/, "inside an activity");
	no("notice", positionIn(F.first("group")), undefined, "in a group");
});

test("a page break stands in an activity, a tab or a page; not in a group or a row", () => {
	// SPEC section 3, '`***` splits a page': "A thematic break ... inside a page, or inside an activity or a tab with no page line, but not inside a group"
	ok("page-break", positionIn(F.node("spending")));
	ok("page-break", positionIn(F.node("map")));
	ok("page-break", positionIn(F.node("do")));
	no("page-break", positionIn(F.first("group")), /group/);
	no("page-break", positionIn(F.first("row")), /row/);
	no("page-break", positionAtStart(F.node("money")), /needs an activity/);
	no("page-break", positionBefore(F.node("money")), /needs an activity/);
});

test("a data section stands at the top of the booklet, never inside a module or an activity", () => {
	// SPEC section 3, 'Where data goes': "Under a plain `> [!data] Data` line, at the end of the file." and "A file may have several data sections."
	ok("data-section", positionBefore(F.first("data-section")), "between the parts");
	ok("data-section", positionAfter(F.node("bare")), "after an activity");
	ok("data-section", positionAfter(F.node("money")), "after a module");
	ok("data-section", positionIn(note(BARE).root), "at the end of a booklet");
	ok("data-section", positionIn(F.first("data-section")), "after the blocks of a data section: the same line");
	no("data-section", positionIn(F.node("money")), /top of the booklet/, "in a module");
	no("data-section", positionAtStart(F.node("bare")), undefined, "in the middle of a bare activity, which it would cut");
	no("data-section", positionIn(F.first("group")), /group/, "in a group");
});

test("data blocks and menus stand in a module, an activity or a data section; menus not in a group", () => {
	// SPEC section 3, 'Where data goes': "Inside the module's fence ... Under a `> [!data|week-1]` line ... Under a plain `> [!data] Data` line"
	for (const pos of [positionIn(F.node("money")), positionIn(F.node("spending")), positionAtStart(F.node("money")), positionIn(F.first("data-section")), positionIn(F.first("row"))]) {
		ok("data-block", pos);
		ok("menu", pos);
	}
	ok("data-block", positionBefore(F.node("money")), "in the booklet's own text");
	no("data-block", positionIn(F.first("group")), /group/, "in a group");
	// SPEC section 5, 'Shared menus': "written once, in the module whose questions use it (or in the data section, for every module to use)"
	no("menu", positionIn(F.first("group")), /group/, "in a group");
});

test("prose and reading callouts stand in any opening and in an activity, never in a data section or after the records", () => {
	// SPEC section 3: "Prose, and reading callouts, before the file's first module or activity line are the booklet's opening" and a module's opening
	for (const kind of ["text", "callout"]) {
		ok(kind, positionBefore(F.node("money")), "the booklet's opening");
		ok(kind, positionAtStart(F.node("money")), "a module's opening");
		ok(kind, positionIn(F.node("now")), "a module tab's prose");
		ok(kind, positionIn(F.node("spending")), "an activity");
		ok(kind, positionIn(F.first("group")), "a group");
		ok(kind, positionIn(F.first("row")), "a row");
		no(kind, positionIn(F.first("data-section")), /data section/, "a data section");
	}
});

test("a theme stands once, outside every module fence", () => {
	// SPEC section 7, 'A theme': "One theme block per file, outside any module fence."
	ok("theme", positionBefore(F.node("money")));
	ok("theme", positionIn(F.node("bare")), "in a bare activity's text");
	no("theme", positionIn(F.node("money")), /not to a module/, "in a module");
	no("theme", positionIn(F.first("group")), /group/, "in a group");
	no("theme", positionIn(F.first("data-section")), /data section/, "in a data section");
	const themed = note(bookletAround('```booklet theme\nbase: paper\n```\n\n> [!activity|a] A\n'));
	no("theme", positionIn(themed.node("a")), /one theme block/, "a second");
});

test("front matter goes at the top of a note that has none", () => {
	ok("front-matter", positionAtLine(parseDesign("Just words.\n"), 0));
	const bare = note("Just words.\n");
	ok("front-matter", positionIn(bare.root), "wherever the cursor is: the piece goes at the very top");
	no("front-matter", positionIn(F.root), /properties already/);
});

test("nothing goes above the front matter, or in or after a records section that runs to the end", () => {
	for (const kind of PLACE_KINDS.filter((k) => k !== "front-matter")) no(kind, positionAtLine(F.root, 0), /front matter comes first/, kind);
	const open = note(FULL.replace(/%%\n/g, ""));
	for (const kind of PLACE_KINDS.filter((k) => k !== "front-matter")) no(kind, positionIn(open.root), /records section/, kind);
	// a records section closed in %% marks leaves the end of the note free
	ok("module", positionIn(F.root));
});

test("legalKinds lists, for a position, the kinds that may stand there", () => {
	const kinds = (pos) => legalKinds(F.root, pos);
	assert.deepEqual(kinds(positionIn(F.node("spending"))), ["activity", "activity-tab", "page", "question", "copy", "row", "group", "query", "menu", "data-block", "page-break", "callout", "text"], "at the end of an activity, which is also a boundary between activities");
	assert.deepEqual(kinds(positionBefore(F.node("spending"))), ["activity", "module-tab", "menu", "data-block", "callout", "text"]);
	assert.deepEqual(kinds(positionIn(F.first("group"))), ["question", "copy", "group", "query", "callout", "text"].sort((a, b) => PLACE_KINDS.indexOf(a) - PLACE_KINDS.indexOf(b)));
	assert.deepEqual(kinds(positionAtLine(F.root, 0)), []);
	// a position of another note's tree has no legal kinds here
	assert.deepEqual(legalKinds(F.root, positionIn(note(BARE).root)), []);
});

test("containerAdds: what each container's + Add lists, and what an empty one says", () => {
	const adds = (n) => containerAdds(n).kinds;
	assert.deepEqual(adds(F.root), ["theme", "module", "activity", "data-section", "callout", "text"], "the booklet: it has its front matter already");
	assert.deepEqual(adds(F.node("money")), ["activity", "module-tab", "callout", "text", "menu", "data-block"], "a module that has its notice already");
	assert.deepEqual(adds(F.node("now")), ["callout", "text"]);
	assert.deepEqual(adds(F.node("spending")), ["activity-tab", "page", "question", "copy", "row", "group", "query", "menu", "data-block", "page-break", "callout", "text"]);
	assert.deepEqual(adds(F.node("do")), ["page", "question", "copy", "row", "group", "query", "menu", "data-block", "page-break", "callout", "text"]);
	assert.deepEqual(adds(F.node("map")), ["question", "copy", "row", "group", "query", "menu", "data-block", "page-break", "callout", "text"]);
	assert.deepEqual(adds(F.first("group")), ["question", "copy", "query", "group", "callout", "text"]);
	assert.deepEqual(adds(F.first("row")), ["question", "copy", "query", "group", "menu", "data-block", "callout", "text"]);
	assert.deepEqual(adds(F.first("data-section")), ["data-block", "menu"]);
	// a module with no notice offers one
	assert.ok(adds(note(ONE_ACTIVITY).first("module")).includes("notice"));
	// an activity with only pages offers a page, and no tab after them
	assert.deepEqual(adds(note(PAGES_ONLY).node("a")), ["page", "question", "copy", "row", "group", "query", "menu", "data-block", "page-break", "callout", "text"]);
	// an empty container says what to add
	const bare = note(bookletAround("> [!activity|a] A\n\n> [!activity|b] B\n"));
	assert.equal(containerAdds(bare.node("a")).empty, "This activity is empty. Add a question, a tab or a page.");
	assert.equal(containerAdds(F.node("money")).empty, null);
	assert.equal(containerAdds(note("").root).empty, "This booklet is empty. Add a module, or an activity.");
});

test("addPosition: a module's opening things go above its first activity, a module goes above the data and records sections", () => {
	const money = F.node("money");
	assert.equal(positionLine(addPosition(money, "activity")), money.tailStart);
	assert.equal(positionLine(addPosition(money, "module-tab")), F.node("spending").start);
	assert.equal(positionLine(addPosition(money, "notice")), F.node("spending").start);
	assert.equal(positionLine(addPosition(F.root, "module")), F.first("data-section").start);
	assert.equal(positionLine(addPosition(F.root, "front-matter")), 0);
	assert.equal(positionLine(addPosition(F.root, "callout")), F.node("money").start);
	assert.equal(positionLine(addPosition(F.node("why"), "question")), F.node("why").end);
});

test("positionAtLine: a line is the position just above it; a line inside a block is after the block; the head of a container is the start of its content", () => {
	const at = (needle) => {
		const p = F.line(needle);
		return `${p.parent.kind}[${p.parent.start}]@${p.index}`;
	};
	assert.equal(at("> [!module|money] Money"), "booklet[0]@3", "the module line: before the module");
	assert.equal(at("Words in the module's opening."), "module[13]@0", "the first block of a module's opening");
	assert.equal(at("> [!activity|spending"), "module[13]@4", "an activity line: before it");
	assert.equal(at("> half an hour"), "activity[26]@0", "the activity's own status line: the start of its content");
	assert.equal(at("What you spent."), "activity[26]@0");
	assert.equal(at("> [!text|spent]"), "activity[26]@1");
	assert.equal(at("> Start with the biggest."), "activity[26]@2", "inside the question's own hint: after the question");
	assert.equal(at("> [!module|money end]"), "module[13]@6", "the closing line: the end of the module's content");
	assert.equal(at("> > [!choice|did]"), "group[52]@1", "inside a group: among its blocks");
	assert.equal(positionLine(F.line(0)), 0);
	assert.equal(F.line(9999).parent, F.root, "a line past the end is the end");
	assert.equal(F.line(-3).index, 0);
});

test("a piece is made of the kinds its own text holds, read from the pieces table", () => {
	const needs = (label) => needsOf(PIECES.find((p) => p.label === label));
	assert.deepEqual(needs("module"), ["module"]);
	assert.deepEqual(needs("activity"), ["activity"]);
	assert.deepEqual(needs("tab"), ["tab"]);
	assert.deepEqual(needs("page"), ["page"]);
	assert.deepEqual(needs("row"), ["row"]);
	assert.deepEqual(needs("notice"), ["notice"]);
	assert.deepEqual(needs("front matter"), ["front-matter"]);
	assert.deepEqual(needs("theme"), ["theme"]);
	assert.deepEqual(needs("choice"), ["question"]);
	assert.deepEqual(needs("multi (from a menu)"), ["menu", "question"]);
	assert.deepEqual(needs("widget (grid)"), ["question", "data-block"]);
	assert.deepEqual(needs("copy button"), ["question", "copy"]);
	assert.deepEqual(needs("group (steps)"), ["group"]);
	assert.deepEqual(needs("tip"), ["callout"]);
	assert.deepEqual(needs("citation"), ["text"]);
	assert.deepEqual(needs("table"), ["data-block", "query"]);
	assert.deepEqual(needs("table (the reader adds and removes rows)"), ["activity"]);
	assert.deepEqual(needs("data section"), ["data-section"]);
	for (const p of PIECES) {
		const n = needsOf(p);
		assert.ok(n.length > 0, `${p.file} is made of something`);
		for (const k of n) assert.ok(k === "tab" || PLACE_KINDS.includes(k), `${p.file}: ${k} is a kind`);
	}
});

test("a piece may stand where every kind it is made of may: a multi from a menu needs both", () => {
	const piece = (label) => PIECES.find((p) => p.label === label);
	ok("menu", positionIn(F.node("spending")));
	assert.equal(canPlacePiece(positionIn(F.node("spending")), piece("multi (from a menu)")).ok, true);
	assert.equal(canPlacePiece(positionIn(F.first("group")), piece("multi (from a menu)")).ok, false, "a menu is not written inside a group");
	assert.equal(canPlacePiece(positionIn(F.first("group")), piece("choice")).ok, true);
	// a tab piece is a module's tab in a module's opening and an activity's tab in an activity
	assert.equal(canPlacePiece(positionBefore(F.node("spending")), piece("tab")).ok, true);
	assert.equal(canPlacePiece(positionIn(F.node("spending")), piece("tab")).ok, true);
	assert.equal(canPlacePiece(positionIn(F.node("do")), piece("tab")).ok, true, "at the end of a tab: a new tab of the activity");
	const r = canPlacePiece(positionBefore(F.node("why")), piece("tab"));
	assert.equal(r.ok, false);
	assert.match(r.reason, /module's tabs/, "after a module's first activity the reason is the module tab's");
	assert.equal(canPlacePiece(positionIn(F.first("group")), piece("tab")).ok, false);
	// the module piece, with its activity and its question inside it, is one module
	assert.equal(canPlacePiece(positionBefore(F.node("money")), piece("module")).ok, true);
	assert.equal(canPlacePiece(positionIn(F.node("spending")), piece("module")).ok, false);
});

test("legalPieces: from the pieces table, only what may stand there", () => {
	const labels = (pos) => legalPieces(F.root, pos).map((p) => p.label);
	const inActivity = labels(positionBefore(F.node("spent")));
	assert.ok(inActivity.includes("choice") && inActivity.includes("tip") && inActivity.includes("tab") && inActivity.includes("page break"));
	assert.ok(!inActivity.includes("module") && !inActivity.includes("activity") && !inActivity.includes("front matter") && !inActivity.includes("data section"));
	assert.ok(inActivity.includes("page"), "spending has no tab line, so a page may stand anywhere in it");
	const opening = labels(positionBefore(F.node("spending")));
	assert.ok(opening.includes("tab") && opening.includes("activity") && opening.includes("notice") === false, "a module that has a notice does not offer another");
	assert.ok(!opening.includes("choice") && !opening.includes("matrix"), "no question in a module's opening");
	assert.ok(opening.includes("tip") && opening.includes("citation"));
	const group = labels(positionIn(F.first("group")));
	assert.deepEqual(group.filter((l) => ["choice", "module", "tab", "table"].includes(l)), ["choice"]);
	assert.ok(group.includes("group (folded)") && group.includes("hint"));
	assert.equal(labels(positionAtLine(F.root, 0)).length, 0);
});

test("an unreadable note still has places: its as-written blocks hold none, the rest of the tree does", () => {
	const u = note(UNREAD);
	assert.ok(legalKinds(u.root, positionIn(u.node("act"))).length > 0);
	const stray = walkDesign(u.root).find((n) => n.kind === "as-written");
	assert.equal(stray.children.length, 0);
	assert.ok(PLACE_KINDS.length === 19);
});
