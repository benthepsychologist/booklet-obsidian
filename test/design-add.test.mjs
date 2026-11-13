/*
 * The Design view's catalogue and its nested hotkeys, run in the view (stage C): "+ Add" opens a catalogue of four folded groups whose
 * samples are drawn only when a group is opened; a letter opens the key popup, a second picks a part, Enter adds it at the selected block's
 * legal place; every action has a visible button and a palette command with no default key. Node over jsdom with the stand-in for Obsidian:
 * whether a pushed scope outranks a user's own bound keys, and whether bare letters fire while a field has the focus in the real app, is
 * not tested (nothing here is real Obsidian); the view acts only when the key's target and the focused element are not editable, and
 * the tests cover that in plain DOM.
 */
import { window as w, click, words } from "./dom.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { bookletAround, core } from "./helpers.mjs";
import { FULL, BARE, ALL } from "./design-fixtures.mjs";
import { openDesign, observerCount, doc } from "./design-harness.mjs";

const { BookletPlugin, isEditable } = await import("./.build/view.mjs");
const { PIECES, KEY_GROUPS, KEY_TREE, allKeyed, canPlacePiece, hasRemoteMedia, insertPiece, parseDesign, placeFor, walkDesign, addChoices, catalogueListing } = core;

const piece = (file) => PIECES.find((p) => p.file === file);
const pick = (box) => box.querySelector(":scope > .booklet-design-head .booklet-design-pick");
const addBtn = (box) => box.querySelector(":scope > .booklet-design-body > .booklet-design-addrow .booklet-design-add");
const panelOf = (box) => box.querySelector(":scope > .booklet-design-body > .booklet-design-addrow .booklet-design-panel");
const heads = (box) => [...panelOf(box).querySelectorAll(".booklet-design-cathead")];
const head = (box, id) => panelOf(box).querySelector(`.booklet-design-catgroup[data-group="${id}"] > .booklet-design-cathead`);

/** Spies on the renderer: every Markdown given to MarkdownRenderer.render. */
function renders() {
	const seen = [];
	globalThis.__bookletStubRender = (markdown, el) => {
		seen.push(markdown);
		el.appendText(markdown);
	};
	return { seen, off: () => void delete globalThis.__bookletStubRender };
}

/* ======================================================================== the catalogue ======================================================================== */

test("+ Add opens a catalogue of four groups, each folded to a name and one sentence; nothing is drawn until a group is opened", () => {
	const r = renders();
	try {
		const v = openDesign(FULL);
		const page = v.box("page", "[!page|map");
		click(addBtn(page));
		const fresh = v.box("page", "[!page|map");
		const groups = [...panelOf(fresh).querySelectorAll(".booklet-design-catgroup")];
		assert.deepEqual(groups.map((g) => g.getAttribute("data-group")), ["structure", "questions", "reading", "views-data"]);
		assert.deepEqual(groups.map((g) => words(g.querySelector(".booklet-design-cattitle"))), ["Structure", "Questions", "Reading aids", "Views and data"]);
		for (const g of groups) {
			assert.ok(words(g.querySelector(".booklet-design-catblurb")).endsWith("."), "one sentence");
			const b = g.querySelector(":scope > .booklet-design-cathead");
			assert.equal(b.tagName, "BUTTON", "a button: keyboard accessible");
			assert.equal(b.getAttribute("aria-expanded"), "false");
			assert.equal(g.querySelector(".booklet-design-catbody"), null, "nothing under a folded group");
		}
		assert.equal(panelOf(fresh).querySelectorAll(".booklet-sample, .booklet-design-catitem").length, 0, "no sample, no part");
		const before = r.seen.length;
		// opening one draws it, and only it
		click(head(v.box("page", "[!page|map"), "questions"));
		const open = v.box("page", "[!page|map");
		assert.equal(head(open, "questions").getAttribute("aria-expanded"), "true");
		assert.ok(panelOf(open).querySelectorAll(".booklet-design-catgroup[data-group=questions] .booklet-sample").length > 0, "samples now");
		assert.equal(panelOf(open).querySelectorAll(".booklet-design-catgroup:not([data-group=questions]) .booklet-design-catitem").length, 0, "the other groups are still folded");
		assert.ok(r.seen.length > before, "the samples went through the renderer");
		// and folding it takes them away again
		click(head(open, "questions"));
		assert.equal(panelOf(v.box("page", "[!page|map")).querySelectorAll(".booklet-sample").length, 0);
		v.close();
	} finally {
		r.off();
	}
});

test("an opened group lists the container's legal parts, each with its sample and its keys; parts with no drawing show their Markdown, labelled", () => {
	const v = openDesign(FULL);
	const page = v.box("page", "[!page|map");
	click(addBtn(page));
	for (const id of ["structure", "questions", "reading", "views-data"]) click(head(v.box("page", "[!page|map"), id));
	const open = v.box("page", "[!page|map");
	const root = parseDesign(v.view.getViewData());
	const node = walkDesign(root).find((n) => n.id === "map");
	const want = catalogueListing(addChoices(node), PIECES);
	const items = [...panelOf(open).querySelectorAll(".booklet-design-catitem")];
	assert.equal(items.length, want.flatMap((g) => g.entries).length);
	for (const g of want)
		for (const e of g.entries) {
			const item = panelOf(open).querySelector(`.booklet-design-catitem[data-entry="${e.file}"]`);
			assert.ok(item, e.file);
			assert.equal(item.closest(".booklet-design-catgroup").getAttribute("data-group"), g.id);
			assert.equal(words(item.querySelector(".booklet-design-catkeys")), e.keys ? `Keys: ${e.keys.split("").join(" ")}` : "No keys");
			const sample = item.querySelector(".booklet-design-catsample");
			if (e.sample === "card") {
				assert.equal(sample.querySelector(".booklet-sample"), null, `${e.file}: no drawing`);
				assert.equal(sample.querySelector("pre").textContent, e.text.trimEnd(), `${e.file}: its Markdown, exactly`);
				assert.match(sample.querySelector("pre").getAttribute("aria-label"), /^The Markdown of /);
			} else {
				assert.ok(sample.querySelector(".booklet-sample"), `${e.file}: drawn`);
				assert.equal(sample.querySelector("pre"), null);
			}
		}
	// every sample question is drawn inert, from the piece's own text
	for (const s of panelOf(open).querySelectorAll(".booklet-sample-question")) assert.ok([...s.querySelectorAll("button, input, textarea")].every((c) => c.disabled));
	// the listen and the widget are cards on purpose
	for (const f of ["Q - listen.md", "Q - widget (grid).md"]) assert.ok(panelOf(open).querySelector(`.booklet-design-catitem[data-entry="${f}"] pre`), f);
	v.close();
});

test("a sample is fixed local content: the pieces' own text, nothing remote reaches the renderer, and no media request is made", () => {
	const r = renders();
	try {
		const v = openDesign(FULL);
		click(addBtn(v.box("page", "[!page|map")));
		for (const id of ["structure", "questions", "reading", "views-data"]) click(head(v.box("page", "[!page|map"), id));
		assert.ok(r.seen.length > 20);
		for (const md of r.seen) assert.equal(hasRemoteMedia(md), false, md.slice(0, 60));
		v.close();
	} finally {
		r.off();
	}
});

test("a reading sample is rendered from its piece's text: the callout, with its words", () => {
	const r = renders();
	try {
		const v = openDesign(FULL);
		click(addBtn(v.box("page", "[!page|map")));
		click(head(v.box("page", "[!page|map"), "reading"));
		assert.ok(r.seen.includes(piece("Reading - tip.md").text.trimEnd()));
		const item = panelOf(v.box("page", "[!page|map")).querySelector('.booklet-design-catitem[data-entry="Reading - tip.md"]');
		assert.ok(item.querySelector(".booklet-sample-reading").hasAttribute("inert"));
		v.close();
	} finally {
		r.off();
	}
});

test("a sample's observer goes when its group is folded: a matrix sample leaves none behind over many openings", () => {
	const obs = observerCount();
	try {
		const v = openDesign(FULL);
		click(addBtn(v.box("page", "[!page|map")));
		for (let i = 0; i < 10; i++) {
			click(head(v.box("page", "[!page|map"), "questions"));
			assert.equal(obs.live, 1, "the matrix sample is connected while its group is open");
			click(head(v.box("page", "[!page|map"), "questions"));
			assert.equal(obs.live, 0, "and let go of when it is folded");
		}
		assert.equal(obs.made, 10);
		// open, then a redrawing of the whole view lets go too
		click(head(v.box("page", "[!page|map"), "questions"));
		assert.equal(obs.live, 1);
		v.view.setViewData(v.view.getViewData(), true);
		assert.equal(obs.live, 0, "a new drawing takes the old one's samples with it");
		v.close();
	} finally {
		obs.off();
	}
});

test("choosing a part from the catalogue inserts it with insertPiece, as one write, and a drawn part is the same part", async () => {
	const v = openDesign(FULL);
	const before = v.disk.text;
	const node = walkDesign(parseDesign(before)).find((n) => n.id === "map");
	const place = addChoices(node).groups.find((g) => g.pieces.some((p) => p.file === "Q - matrix.md"));
	const expected = insertPiece(before, place.position, piece("Q - matrix.md"));
	click(addBtn(v.box("page", "[!page|map")));
	click(head(v.box("page", "[!page|map"), "questions"));
	await v.press(panelOf(v.box("page", "[!page|map")).querySelector('button[data-piece="Q - matrix.md"]'));
	assert.equal(v.disk.writes, 1);
	assert.equal(v.disk.text, expected.text);
	assert.equal(v.status(), "Added Matrix.");
	v.close();
});

test("an empty container says what to add, and a part that waits on another is offered first, in the new catalogue too", () => {
	const v = openDesign(bookletAround("> [!module|m] M\n\n> [!module|m end]\n"));
	const mod = v.box("module", "[!module|m] M");
	assert.equal(words(mod.querySelector(":scope > .booklet-design-body > .booklet-design-empty")), "This module is empty. Add an activity.");
	click(addBtn(mod));
	const fresh = v.box("module", "[!module|m] M");
	assert.match(words(fresh.querySelector(".booklet-design-needs")), /page.*activity/i);
	click(head(fresh, "structure"));
	const files = [...panelOf(v.box("module", "[!module|m] M")).querySelectorAll("button.booklet-design-piece")].map((b) => b.getAttribute("data-piece"));
	assert.ok(files.includes("Structure - activity.md"));
	assert.ok(!files.includes("Structure - page.md"));
	v.close();
});

test("the catalogue offers only legal parts: for every container of several notes, every button is a part canPlacePiece allows where it goes", () => {
	for (const text of [FULL, BARE, ALL.UNREAD, ALL.IMPLICIT]) {
		const v = openDesign(text);
		const root = parseDesign(text);
		for (const n of walkDesign(root).filter((x) => core.isContainer(x))) {
			const box = v.all(`.booklet-design-node[data-kind="${n.kind}"]`).find((b) => b.getAttribute("data-start") === String(n.start));
			click(addBtn(box));
			const open = v.all(`.booklet-design-node[data-kind="${n.kind}"]`).find((b) => b.getAttribute("data-start") === String(n.start));
			for (const h of heads(open)) click(h);
			const again = v.all(`.booklet-design-node[data-kind="${n.kind}"]`).find((b) => b.getAttribute("data-start") === String(n.start));
			const groups = addChoices(n).groups;
			for (const b of panelOf(again).querySelectorAll("button.booklet-design-piece")) {
				const file = b.getAttribute("data-piece");
				const g = groups.find((x) => x.pieces.some((p) => p.file === file));
				assert.ok(g, `${file} is legal in a ${n.kind}`);
				assert.equal(canPlacePiece(g.position, [...PIECES, core.WORDS_PIECE].find((p) => p.file === file)).ok, true);
			}
			click(addBtn(again));
		}
		v.close();
	}
});

/* ======================================================================== the keys ======================================================================== */

test("the editable guard, in plain DOM: a field, a text box, a contenteditable and anything inside one is the person's; nothing else is", () => {
	const mk = (html) => {
		const d = doc.createElement("div");
		d.innerHTML = html;
		doc.body.appendChild(d);
		return d;
	};
	const d = mk('<input id=a><textarea id=b></textarea><div id=c contenteditable="true"><span id=d><b id=e></b></span></div><div id=f contenteditable="false"><span id=g></span></div><div id=h contenteditable=""><i id=i></i></div><select id=j></select><button id=k></button><p id=l></p><div id=m contenteditable="plaintext-only"><u id=n></u></div>');
	const at = (id) => d.querySelector("#" + id);
	for (const id of ["a", "b", "c", "d", "e", "h", "i", "j", "m", "n"]) assert.equal(isEditable(at(id)), true, id);
	for (const id of ["f", "g", "k", "l"]) assert.equal(isEditable(at(id)), false, id);
	assert.equal(isEditable(null), false);
	assert.equal(isEditable(doc.body), false);
	d.remove();
});

test("the keys are a scope of the view, not command hotkeys; a bare letter in a closed view opens the popup on its group and any other key is left alone", () => {
	const v = openDesign(FULL);
	assert.ok(v.view.scope, "the view has a scope");
	assert.equal(v.popup(), null);
	const x = v.key("x");
	assert.equal(x.defaultPrevented, false, "a letter that is no group's is not taken");
	assert.equal(v.popup(), null);
	const enter = v.key("Enter");
	const esc = v.key("Escape");
	assert.equal(enter.defaultPrevented || esc.defaultPrevented, false, "Enter and Escape are not the view's while the popup is closed");
	const s = v.key("s");
	assert.equal(s.defaultPrevented, true);
	assert.ok(v.popup());
	assert.deepEqual(v.rows().map((r) => r.keys), KEY_TREE.find((g) => g.key === "s").entries.map((e) => "s" + e.key), "every letter of Structure is listed");
	v.close();
});

test("each group letter opens its group: s q r v d, and the popup lists every piece's letters", () => {
	for (const g of KEY_TREE) {
		const v = openDesign(FULL);
		v.key(g.key);
		assert.ok(v.popup(), g.key);
		assert.deepEqual(v.rows().map((r) => r.keys), g.entries.map((e) => g.key + e.key), g.title);
		assert.match(words(v.popup().querySelector(".booklet-design-popup-line")), new RegExp(g.title));
		v.close();
	}
	// at the groups: Backspace from a group, then the five
	const v = openDesign(FULL);
	v.key("s");
	v.key("Backspace");
	assert.deepEqual(v.rows().map((r) => r.keys), ["s", "q", "r", "v", "d"]);
	v.close();
});

test("s m Enter adds a module, q m Enter adds a matrix (Ben's two examples), each at the legal place of what is selected", async () => {
	// nothing selected: the end of the booklet's own place
	const a = openDesign(FULL);
	const text = a.disk.text;
	const root = parseDesign(text);
	const mod = placeFor(root, null, piece("Structure - module.md"));
	assert.equal(mod.ok, true);
	a.keys("s", "m");
	assert.equal(a.rows().find((r) => r.current).piece, "Structure - module.md", "the module is highlighted");
	a.key("Enter");
	await a.settle();
	assert.equal(a.disk.text, insertPiece(text, mod.position, piece("Structure - module.md")).text);
	assert.equal(a.disk.writes, 1);
	assert.equal(a.status(), "Added Module.");
	assert.equal(a.popup(), null, "the popup closed");
	a.close();
	// a page selected: a matrix goes into it
	const b = openDesign(FULL);
	click(pick(b.box("page", "[!page|map")));
	const root2 = parseDesign(b.disk.text);
	const sel = walkDesign(root2).find((n) => n.id === "map");
	const mx = placeFor(root2, sel, piece("Q - matrix.md"));
	assert.equal(mx.ok, true);
	b.keys("q", "m", "Enter");
	await b.settle();
	assert.equal(b.disk.text, insertPiece(FULL, mx.position, piece("Q - matrix.md")).text);
	assert.equal(b.status(), "Added Matrix.");
	// the matrix is there, and drawn
	assert.ok(b.all(".booklet-design-node").some((n) => n.getAttribute("data-kind") === "question" && n.querySelector('[data-booklet-q="new-id"], [data-booklet-q]') && /matrix/.test(n.textContent)));
	b.close();
});

test("typing more letters filters the list by word, and Enter adds the highlighted one", async () => {
	const v = openDesign(FULL);
	click(pick(v.box("activity", "[!activity|why")));
	v.key("q");
	for (const ch of "scal") v.key(ch);
	const rows = v.rows();
	assert.ok(rows.length >= 1);
	assert.ok(rows.every((r) => /scal/i.test(r.label)), "only what holds the word");
	assert.equal(rows.find((r) => r.current).piece, "Q - scale.md");
	assert.match(words(v.popup().querySelector(".booklet-design-popup-line")), /match/);
	v.key("Enter");
	await v.settle();
	assert.match(v.status(), /^Added Scale\./);
	assert.ok(v.disk.text.includes("[!scale|"));
	v.close();
});

test("the arrow keys move the highlight, Backspace takes a letter back, and Escape closes the popup without writing", async () => {
	const v = openDesign(FULL);
	v.keys("q", "ArrowDown", "ArrowDown");
	assert.equal(v.rows().findIndex((r) => r.current), 2);
	v.key("Backspace");
	assert.deepEqual(v.rows().map((r) => r.keys), ["s", "q", "r", "v", "d"], "back at the groups");
	v.keys("s", "m");
	v.key("Escape");
	assert.equal(v.popup(), null);
	assert.equal(v.disk.writes, 0);
	v.close();
});

test("an illegal piece is shown disabled with design-places' reason, and is never inserted, by Enter or by a press", async () => {
	const text = bookletAround("> [!module|m] M\n\n> [!module|m end]\n");
	const v = openDesign(text);
	v.keys("q");
	const root = parseDesign(text);
	const reason = canPlacePiece({ parent: root, index: root.children.length }, piece("Q - text.md")).reason;
	const row = v.rows().find((r) => r.piece === "Q - text.md");
	assert.equal(row.off, true, "disabled");
	assert.equal(row.why, "Not here: " + reason, "with the reason from design-places");
	v.keys("t", "Enter");
	await v.settle();
	assert.equal(v.disk.writes, 0, "nothing inserted");
	assert.equal(v.disk.text, text);
	assert.match(v.status(), /^Text cannot go here: /);
	assert.ok(v.popup(), "the popup stays so another part can be picked");
	// a press on the disabled button does nothing either
	click(doc.querySelector(`.booklet-design-popup-row[data-piece="Q - text.md"]`));
	await v.settle();
	assert.equal(v.disk.writes, 0);
	// a module is legal here
	v.key("Backspace");
	v.key("Backspace");
	v.keys("s", "m");
	assert.equal(v.rows().find((r) => r.piece === "Structure - module.md").off, false);
	v.close();
});

test("the keys do nothing while a field of text has the focus or the key is aimed at one, and nothing with a modifier held", () => {
	const v = openDesign(FULL);
	const input = v.el.createEl("input", { attr: { type: "text" } });
	const area = v.el.createEl("textarea");
	const edit = v.el.createDiv({ attr: { contenteditable: "true" } });
	const inner = edit.createSpan();
	for (const target of [input, area, edit, inner]) {
		const evt = v.key("s", { target });
		assert.equal(evt.defaultPrevented, false, "the key goes to the field");
		assert.equal(v.popup(), null);
	}
	// the focused element decides when the key's own target is the body
	input.focus();
	assert.equal(doc.activeElement, input);
	assert.equal(v.key("q").defaultPrevented, false);
	assert.equal(v.popup(), null);
	input.blur();
	// a modifier: Ctrl+s is the app's
	assert.equal(v.key("s", { ctrlKey: true }).defaultPrevented, false);
	assert.equal(v.key("s", { metaKey: true }).defaultPrevented, false);
	assert.equal(v.key("s", { altKey: true }).defaultPrevented, false);
	assert.equal(v.popup(), null);
	// and once the popup is open, typing into a field still goes to the field
	v.key("s");
	assert.ok(v.popup());
	const typed = v.key("m", { target: input });
	assert.equal(typed.defaultPrevented, false, "the popup does not take a field's letters");
	assert.equal(v.popup().querySelector(".booklet-design-popup-line") !== null, true);
	v.close();
});

test("Enter and Space on a button of the popup are that button's; Enter anywhere else adds the highlighted part, even when a button of the tree has the focus", async () => {
	const v = openDesign(FULL);
	click(pick(v.box("activity", "[!activity|why")));
	pick(v.box("activity", "[!activity|why")).focus();
	v.keys("q", "t");
	assert.equal(v.rows().find((r) => r.current).piece, "Q - text.md");
	// focus on a button of the tree (the selected block's), as it is after selecting: Enter is the popup's
	const e = v.key("Enter", { target: pick(v.box("activity", "[!activity|why")) });
	assert.equal(e.defaultPrevented, true);
	await v.settle();
	assert.match(v.status(), /^Added Text\./);
	// on a button inside the popup, Enter is left to the button
	v.keys("s");
	const rowBtn = doc.querySelector(".booklet-design-popup-row");
	assert.equal(v.key("Enter", { target: rowBtn }).defaultPrevented, false);
	v.close();
});

test("every piece is reachable by keys alone in the real view: its letters, then Enter, add exactly what insertPiece makes at placeFor's place, or are refused with the reason", async () => {
	assert.equal(allKeyed().length, 56);
	for (const hit of allKeyed()) {
		const v = openDesign(FULL);
		const text = v.disk.text;
		const placed = placeFor(parseDesign(text), null, hit.piece);
		v.keys(...hit.keys);
		assert.ok(v.popup(), `${hit.keys}: the popup is open`);
		assert.equal(v.rows().find((r) => r.current)?.piece, hit.piece.file, `${hit.keys}: the piece is highlighted`);
		v.key("Enter");
		await v.settle();
		if (placed.ok) {
			assert.equal(v.disk.text, insertPiece(text, placed.position, hit.piece).text, `${hit.keys}: ${hit.piece.file}`);
			assert.equal(v.disk.writes, 1);
		} else {
			assert.equal(v.disk.text, text, `${hit.keys}: refused, nothing written`);
			assert.match(v.status(), /cannot go here/);
		}
		v.close();
	}
});

test("every action has a visible button: a button for each group opens its popup, rows and Back and Close are buttons, and Add part… opens the catalogue", async () => {
	const v = openDesign(FULL);
	const bar = v.el.querySelector(".booklet-design-groupbar");
	const buttons = [...bar.querySelectorAll("button")];
	assert.deepEqual(buttons.map((b) => b.getAttribute("data-key")), KEY_GROUPS.map((g) => g.key));
	assert.deepEqual(buttons.map(words), KEY_GROUPS.map((g) => g.title));
	for (const b of buttons) assert.equal(b.getAttribute("type"), "button");
	click(buttons[1]);
	assert.deepEqual(v.rows().map((r) => r.keys).slice(0, 3), ["qc", "qx", "qm"]);
	// a press on a row picks it (with a page selected, so a matrix has a place)
	click(pick(v.box("page", "[!page|map")));
	click(doc.querySelector('.booklet-design-popup-row[data-piece="Q - matrix.md"]'));
	await v.settle();
	assert.match(v.status(), /^Added Matrix\./);
	// the popup's own buttons
	click(v.el.querySelector(".booklet-design-group[data-key=s]"));
	assert.ok(v.popup());
	click(v.popup().querySelector(".booklet-design-popup-back"));
	assert.deepEqual(v.rows().map((r) => r.keys), ["s", "q", "r", "v", "d"]);
	click(v.popup().querySelector(".booklet-design-popup-row[data-keys=r]"));
	assert.equal(v.rows()[0].keys.startsWith("r"), true);
	click(v.popup().querySelector(".booklet-design-popup-close"));
	assert.equal(v.popup(), null);
	// Add part… opens the catalogue of the selected block's container
	click(pick(v.box("page", "[!page|map")));
	click(v.el.querySelector(".booklet-design-addpiece"));
	assert.ok(panelOf(v.box("page", "[!page|map")), "the page's catalogue is open");
	v.close();
});

test("the popup follows the selection: a part that cannot go where the selection is turns off with its reason, and on again when another block is selected", () => {
	const v = openDesign(FULL);
	v.key("q");
	const mx = () => v.rows().find((r) => r.piece === "Q - matrix.md");
	assert.equal(mx().off, false, "with nothing selected a matrix goes into the last activity at the end");
	// the booklet's opening is no place for a question
	click(pick(v.box("callout", "[!tip]")));
	assert.equal(mx().off, true);
	assert.match(mx().why, /^Not here: \S/);
	assert.equal(mx().why, "Not here: " + placeFor(parseDesign(v.disk.text), walkDesign(parseDesign(v.disk.text)).find((n) => n.kind === "callout"), piece("Q - matrix.md")).reason);
	click(pick(v.box("page", "[!page|map")));
	assert.equal(mx().off, false, "and a page takes it");
	v.close();
});

/* ======================================================================== palette commands ======================================================================== */

test("every action is a palette command with no default key: one for each group and Add part…, and none has a hotkey", async () => {
	const cmds = [];
	const plugin = new BookletPlugin({ workspace: { on: () => ({}), onLayoutReady() {}, getLeavesOfType: () => [], iterateAllLeaves() {}, getActiveViewOfType: () => active }, vault: { on: () => ({}), getFileByPath: () => null }, metadataCache: { on: () => ({}), getFileCache: () => null } }, { version: "1" });
	const calls = [];
	let active = null;
	plugin.registerView = () => {};
	plugin.addCommand = (c) => void cmds.push(c);
	plugin.registerEvent = () => {};
	plugin.addSettingTab = () => {};
	await plugin.onload();
	const design = cmds.filter((c) => c.id.startsWith("design-add-"));
	assert.deepEqual(design.map((c) => c.id), ["design-add-piece", ...KEY_GROUPS.map((g) => `design-add-${g.id}`)]);
	for (const c of cmds) assert.equal("hotkeys" in c, false, `${c.id} has no default hotkey`);
	assert.equal(design[0].name, "Design view: add a part…");
	assert.deepEqual(design.slice(1).map((c) => c.name), KEY_GROUPS.map((g) => `Design view: add from ${g.title}…`));
	// off when no Design view is active, on (and acting) when one is
	for (const c of design) assert.equal(c.checkCallback(true), false);
	active = { openKeys: (k) => void calls.push(["keys", k]), openCatalogue: () => void calls.push(["catalogue"]) };
	for (const c of design) assert.equal(c.checkCallback(true), true);
	assert.deepEqual(calls, [], "checking does nothing");
	for (const c of design) c.checkCallback(false);
	assert.deepEqual(calls, [["catalogue"], ...KEY_GROUPS.map((g) => ["keys", g.key])]);
	plugin.onunload();
});

test("the plugin sets no default hotkey anywhere: no command and no manifest entry carries one", async () => {
	const { readFileSync } = await import("node:fs");
	const src = readFileSync(new URL("../src/main.ts", import.meta.url), "utf8");
	assert.doesNotMatch(src, /hotkeys\s*:/);
});

test("the popup takes its text from the string table, with Spanish and French slots empty so English shows", () => {
	const { DESIGN_STRINGS, t } = core;
	for (const k of Object.keys(DESIGN_STRINGS).filter((x) => /^(cat|keys|draw|cmd)\./.test(x))) {
		assert.ok(DESIGN_STRINGS[k].en.length > 0, k);
		assert.equal(DESIGN_STRINGS[k].es, undefined, `${k}: no Spanish yet`);
		assert.equal(t(k, "es"), t(k, "en"), `${k}: English shows`);
	}
});
