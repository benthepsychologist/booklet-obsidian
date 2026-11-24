/*
 * The Design view's Add tab, its "+" slots and its hotkeys, run in the view: the palette of picture tiles ("like online chess": pick a tile and the
 * places it may go light up, or click a "+" and only the tiles that may go there stay lit, or drag a tile), the Common row, the sample a tile shows
 * after a moment on it, and the letters that still pick a tile (a group's letter, then a piece's letters, then Enter). Node over jsdom with the
 * stand-in for Obsidian: whether a pushed scope outranks a user's own bound keys, and whether bare letters fire while a field has the focus in the
 * real app, is not tested (nothing here is real Obsidian); the view acts only when the key's target and the focused element are not editable, and
 * the tests cover that in plain DOM.
 */
import { window as w, click, words } from "./dom.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { bookletAround, core } from "./helpers.mjs";
import { FULL, BARE, ALL } from "./design-fixtures.mjs";
import { openDesign, observerCount, doc } from "./design-harness.mjs";

const { BookletPlugin, isEditable } = await import("./.build/view.mjs");
const { PIECES, KEY_GROUPS, KEY_TREE, WORDS_PIECE, allKeyed, hasRemoteMedia, insertPiece, parseDesign, placeFor, walkDesign, slotsOf, legalSlots, slotAccepts, slotPositionFor, tileState, navEntries, keysOf } = core;

const everyPiece = [...PIECES, WORDS_PIECE];
const piece = (file) => everyPiece.find((p) => p.file === file);
const COMMON = ["Q - choice.md", "Q - text.md", "Q - scale.md", "Reading - tip.md", "Reading - image.md", "Structure - page.md"];

/** Spies on the renderer: every Markdown given to MarkdownRenderer.render. */
function renders() {
	const seen = [];
	globalThis.__bookletStubRender = (markdown, el) => {
		seen.push(markdown);
		el.appendText(markdown);
	};
	return { seen, off: () => void delete globalThis.__bookletStubRender };
}

/** The ids of the slots lit now, and of the one chosen. */
const lit = (v) => v.slots().filter((s) => s.classList.contains("is-lit")).map((s) => s.getAttribute("data-slot"));
const chosen = (v) => v.slots().filter((s) => s.classList.contains("is-target")).map((s) => s.getAttribute("data-slot"));
/** The tile of a piece, as the palette draws it now (whatever its group's state). */
const tileOf = (v, file) => v.el.querySelector(`.booklet-design-tile[data-piece="${file}"]`);
const armedFiles = (v) => [...new Set(v.all(".booklet-design-tile.is-armed, .booklet-design-commonchip.is-armed").map((b) => b.getAttribute("data-piece")))];
/** A drag event with a data transfer, as a browser makes it. */
const drag = (type, target) => {
	const evt = new w.Event(type, { bubbles: true, cancelable: true });
	evt.dataTransfer = {
		data: {},
		setData(k, val) {
			this.data[k] = val;
		},
		effectAllowed: "",
		dropEffect: "",
	};
	target.dispatchEvent(evt);
	return evt;
};
/** The slot the view's canvas has for a button. */
const slotOf = (v, el) => slotsOf(v.view.canvas).find((s) => s.id === el.getAttribute("data-slot"));
/** Makes the moment a tile waits before its sample shows no time at all, for the length of a test. */
function quickSamples() {
	const set = w.setTimeout;
	w.setTimeout = (fn, ms, ...rest) => (ms === 400 ? (fn(), 1) : set.call(w, fn, ms, ...rest));
	return () => void (w.setTimeout = set);
}
const send = (el, type) => el.dispatchEvent(new w.Event(type));
const keydown = (el, key) => el.dispatchEvent(new w.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));

/* ======================================================================== the left column's tabs ======================================================================== */

test("the left column has two tabs, Outline and Add: a tablist, one selected, the arrow keys move between them, and each shows only its own panel", () => {
	const v = openDesign(FULL);
	const list = v.el.querySelector(".booklet-design-tabs");
	assert.equal(list.getAttribute("role"), "tablist");
	const tabs = [...list.querySelectorAll('[role="tab"]')];
	assert.deepEqual(tabs.map(words), ["Outline", "Add"]);
	assert.deepEqual(tabs.map((t) => t.getAttribute("aria-selected")), ["true", "false"]);
	assert.deepEqual(tabs.map((t) => t.getAttribute("tabindex")), ["0", "-1"], "the selected tab is the one in the tab order");
	assert.ok(v.el.querySelector(".booklet-design-nav"), "the Outline tab shows the navigator");
	assert.equal(v.el.querySelector(".booklet-design-tile"), null, "and not the palette");
	const panel = v.el.querySelector('[role="tabpanel"]');
	assert.equal(panel.getAttribute("aria-labelledby"), tabs[0].id);
	// the arrow keys, Home and End
	keydown(tabs[0], "ArrowRight");
	assert.deepEqual([...v.el.querySelectorAll('[role="tab"]')].map((t) => t.getAttribute("aria-selected")), ["false", "true"]);
	assert.ok(v.el.querySelector(".booklet-design-where"), "the Add tab shows the palette");
	assert.equal(v.el.querySelector(".booklet-design-nav"), null);
	assert.equal(doc.activeElement?.getAttribute("data-tab"), "add", "the focus follows");
	keydown(v.tab("add"), "ArrowLeft");
	assert.ok(v.el.querySelector(".booklet-design-nav"));
	keydown(v.tab("outline"), "End");
	assert.equal(v.tab("add").getAttribute("aria-selected"), "true");
	keydown(v.tab("add"), "Home");
	assert.equal(v.tab("outline").getAttribute("aria-selected"), "true");
	v.close();
});

test("the foot of the Outline tab lists the lines the reader cannot read and the kept data that matches nothing, each entry going to its block", () => {
	const v = openDesign(ALL.UNREAD);
	const foot = v.el.querySelector(".booklet-design-navfoot");
	assert.ok(foot, "the foot is under the navigator");
	const problems = foot.querySelector("details.booklet-design-problems");
	assert.ok(problems && Number(problems.getAttribute("data-count")) >= 1, "unreadable lines are listed");
	assert.ok(foot.querySelector("details.booklet-design-leftovers"), "and the leftovers are a list of their own");
	problems.open = true;
	const jump = problems.querySelector(".booklet-design-jump");
	assert.ok(jump, "an entry is a button");
	click(jump);
	assert.ok(v.page(), "the page of the block it names is drawn");
	v.close();
});

/* ======================================================================== the palette ======================================================================== */

test("the Add tab: an Adding-here card, a Common row of six chips, and four foldable groups in the order Questions, Reading aids, Structure, Views and data", () => {
	const v = openDesign(FULL);
	v.showAdd();
	const where = v.el.querySelector(".booklet-design-where");
	assert.match(words(where), /Pick a piece, then a lit spot/, "with no place chosen it says how to place");
	assert.equal(where.classList.contains("is-target"), false);
	assert.deepEqual(v.all(".booklet-design-commonchip").map(words), ["Choice", "Text", "Scale", "Tip", "Image", "Page"]);
	assert.deepEqual(v.all(".booklet-design-commonchip").map((c) => c.getAttribute("data-piece")), COMMON);
	const groups = v.all(".booklet-design-pal-group");
	assert.deepEqual(groups.map((g) => g.getAttribute("data-group")), ["questions", "reading", "structure", "views-data"]);
	assert.deepEqual(groups.map((g) => words(g.querySelector(".booklet-design-pal-title"))), ["Questions", "Reading aids", "Structure", "Views and data"]);
	for (const g of groups) assert.equal(g.querySelector(".booklet-design-pal-head").tagName, "BUTTON", "a button: keyboard accessible");
	assert.equal(groups[0].querySelector(".booklet-design-pal-head").getAttribute("aria-expanded"), "true", "Questions opens first");
	assert.equal(groups[3].querySelector(".booklet-design-pal-head").getAttribute("aria-expanded"), "false");
	assert.equal(groups[3].querySelector(".booklet-design-tile"), null, "nothing under a folded group");
	// the group's letters sit on its header
	assert.equal(words(groups[0].querySelector(".booklet-design-pal-keys")), "q");
	assert.equal(words(groups[3].querySelector(".booklet-design-pal-keys")), "v d");
	// a fold is remembered across a drawing
	click(groups[3].querySelector(".booklet-design-pal-head"));
	assert.equal(v.el.querySelector('[data-group="views-data"] .booklet-design-pal-head').getAttribute("aria-expanded"), "true");
	v.go("Money");
	v.showAdd();
	assert.equal(v.el.querySelector('[data-group="views-data"] .booklet-design-pal-head').getAttribute("aria-expanded"), "true");
	v.close();
});

test("every piece the format has is a tile with its picture, its name and its hotkey letters as a small badge; the plain words are one too", () => {
	const v = openDesign(FULL);
	v.openGroups();
	const tiles = v.all(".booklet-design-tile");
	assert.equal(PIECES.length, 56);
	assert.equal(tiles.length, PIECES.length + 1, "56 pieces and the words");
	for (const p of everyPiece) {
		const t = tileOf(v, p.file);
		assert.ok(t, `${p.file} has a tile`);
		assert.equal(t.tagName, "BUTTON");
		const svg = t.querySelector(".booklet-design-tile-art svg");
		assert.ok(svg && (svg.childElementCount > 0 || svg.hasAttribute("data-icon")), `${p.file}: a picture (a drawing, or an Obsidian icon)`);
		assert.ok(words(t.querySelector(".booklet-design-tile-label")).length > 0, `${p.file}: a name`);
		assert.equal(t.getAttribute("aria-pressed"), "false");
		assert.equal(t.getAttribute("draggable"), "true");
		const badge = t.querySelector(".booklet-design-tile-key");
		if (p.file === WORDS_PIECE.file) assert.equal(badge, null, "the plain words have no letters");
		else assert.equal(words(badge), (keysOf(p) ?? "").split("").join(" "), `${p.file}: its letters`);
		assert.ok(t.hasAttribute("aria-disabled"), `${p.file} says whether it is on`);
	}
	assert.equal(new Set(tiles.map((t) => t.getAttribute("data-piece"))).size, tiles.length, "one tile for each piece");
	v.close();
});

test("a tile is lit when the piece may go on this page, and greyed with the reason (design-places' own words) when it may not; a press on a greyed tile says why and picks nothing", () => {
	const v = openDesign(FULL);
	v.openGroups();
	const root = v.view.root;
	for (const p of everyPiece) {
		const st = tileState(root, v.view.canvas, p);
		const t = tileOf(v, p.file);
		assert.equal(t.getAttribute("aria-disabled"), String(!st.ok), `${p.file}`);
		assert.equal(t.classList.contains("is-off"), !st.ok);
		if (!st.ok) assert.equal(t.getAttribute("title"), st.reason, `${p.file}: the reason`);
	}
	// the booklet's page takes no question
	const text = tileOf(v, "Q - text.md");
	assert.equal(text.getAttribute("aria-disabled"), "true");
	click(text);
	assert.match(v.status(), /^Text cannot go here: /);
	assert.deepEqual(armedFiles(v), [], "nothing is picked");
	assert.deepEqual(lit(v), []);
	// on the page of a tab the same tile is lit, and a module is not
	v.go("Doing");
	v.showAdd();
	assert.equal(tileOf(v, "Q - text.md").getAttribute("aria-disabled"), "false");
	assert.equal(tileOf(v, "Structure - module.md").getAttribute("aria-disabled"), "true");
	v.close();
});

test("for every page of several notes, a tile is lit exactly when a slot of that page accepts the piece, and every slot it lights is a place the format allows", () => {
	for (const text of [FULL, BARE, ALL.UNREAD, ALL.IMPLICIT]) {
		const v = openDesign(text);
		const count = v.all(".booklet-design-nav-item").length;
		for (let i = 1; i < count; i++) {
			click(v.tab("outline"));
			click(v.all(".booklet-design-nav-item")[i]);
			const root = v.view.root;
			const canvas = v.view.canvas;
			v.openGroups();
			for (const p of everyPiece) {
				const slots = legalSlots(root, canvas, p);
				const st = tileState(root, canvas, p);
				assert.equal(st.ok, slots.length > 0, `${p.file}`);
				for (const s of slots) assert.equal(slotAccepts(root, s, p).ok, true);
				assert.equal(tileOf(v, p.file).getAttribute("aria-disabled"), String(!st.ok), `entry ${i}: ${p.file}`);
			}
		}
		v.close();
	}
});

test("a tile's hover sample is a sample of the real piece, drawn inert, in a popover that goes on leave; its drawings belong to a Component that is unloaded then", () => {
	const r = renders();
	const obs = observerCount();
	const restore = quickSamples();
	try {
		const v = openDesign(FULL);
		v.openGroups();
		// the sample's Component is a child of the view's renderer (its drawings' owner)
		const kids = () => v.view.renderer._children;
		const baseline = kids().length;
		// a question: its drawing, inert
		const choice = tileOf(v, "Q - choice.md");
		send(choice, "mouseenter");
		const pop = v.el.querySelector(".booklet-design-samplepop");
		assert.ok(pop, "a popover");
		assert.ok(pop.querySelector(".booklet-sample-question[inert]"), "an inert question");
		assert.ok([...pop.querySelectorAll("button, input, textarea")].every((c) => c.disabled));
		assert.equal(kids().length, baseline + 1, "its Component is one more");
		const child = kids().at(-1);
		let unloaded = false;
		const unload = child.unload.bind(child);
		child.unload = () => {
			unloaded = true;
			unload();
		};
		send(choice, "mouseleave");
		assert.equal(v.el.querySelector(".booklet-design-samplepop"), null, "gone on leave");
		assert.equal(kids().length, baseline, "and its Component is let go");
		assert.equal(unloaded, true, "and unloaded");
		// a reading aid: the callout, from the piece's own text
		send(tileOf(v, "Reading - tip.md"), "mouseenter");
		assert.ok(r.seen.includes(piece("Reading - tip.md").text.trimEnd()), "through the renderer, from the piece's text");
		assert.ok(v.el.querySelector(".booklet-design-samplepop .booklet-sample-reading[inert]"));
		send(tileOf(v, "Reading - tip.md"), "mouseleave");
		// a piece with no drawing is its picture, larger: never its Markdown
		send(tileOf(v, "Data - rows.md"), "focus");
		const pop2 = v.el.querySelector(".booklet-design-samplepop");
		assert.ok(pop2.querySelector(".booklet-design-samplepop-art svg"));
		assert.equal(pop2.querySelector("pre"), null);
		send(tileOf(v, "Data - rows.md"), "blur");
		// a listen and a widget are drawn, as the canvas draws them (test/design-stage5-add.test.mjs holds what they are made of)
		for (const f of ["Q - listen.md", "Q - widget (grid).md"]) {
			send(tileOf(v, f), "focus");
			assert.ok(v.el.querySelector(".booklet-design-samplepop .booklet-sample-question[inert]"), f);
			assert.equal(v.el.querySelector(".booklet-design-samplepop-art"), null, f);
			send(tileOf(v, f), "blur");
		}
		// a matrix sample's observer goes with the popover, however often it is shown
		const before = obs.live;
		for (let i = 0; i < 10; i++) {
			send(tileOf(v, "Q - matrix.md"), "mouseenter");
			assert.equal(obs.live, before + 1, "connected while shown");
			send(tileOf(v, "Q - matrix.md"), "mouseleave");
			assert.equal(obs.live, before, "and let go of on leave");
		}
		v.close();
	} finally {
		restore();
		obs.off();
		r.off();
	}
});

test("a sample is fixed local content: the pieces' own text, nothing remote reaches the renderer, and no media request is made; on a phone there is no popover", () => {
	const r = renders();
	const restore = quickSamples();
	try {
		const v = openDesign(FULL);
		v.openGroups();
		for (const p of everyPiece) {
			send(tileOf(v, p.file), "mouseenter");
			send(tileOf(v, p.file), "mouseleave");
		}
		assert.ok(r.seen.length > 20);
		for (const md of r.seen) assert.equal(hasRemoteMedia(md), false, md.slice(0, 60));
		v.close();
		const phone = openDesign(FULL, { phone: true });
		phone.openGroups();
		const before = r.seen.length;
		send(tileOf(phone, "Q - choice.md"), "mouseenter");
		assert.equal(phone.el.querySelector(".booklet-design-samplepop"), null);
		assert.equal(r.seen.length, before);
		phone.close();
	} finally {
		restore();
		r.off();
	}
});

/* ======================================================================== the slots ======================================================================== */

test("a page has a real button for each place a block may go: before the first, between each pair, after the last, and at the end of a container for a part", () => {
	const v = openDesign(FULL);
	const count = v.all(".booklet-design-nav-item").length;
	for (let i = 1; i < count; i++) {
		click(v.all(".booklet-design-nav-item")[i]);
		const want = slotsOf(v.view.canvas);
		const got = v.slots();
		assert.equal(got.length, want.length, `entry ${i}: a button for each slot`);
		assert.deepEqual(got.map((s) => s.getAttribute("data-slot")), want.map((s) => s.id));
		for (const s of got) {
			assert.equal(s.tagName, "BUTTON");
			assert.equal(s.getAttribute("type"), "button");
			assert.ok(s.getAttribute("aria-label"), "labelled in words");
			assert.equal(s.getAttribute("aria-pressed"), "false");
		}
		// a page of blocks has one more slot than blocks
		const blocks = v.all(".booklet-design-page-body > .booklet-design-block").length;
		assert.equal(got.filter((s) => s.getAttribute("data-where") !== "child").length, blocks + 1, `entry ${i}: n blocks, n + 1 places`);
	}
	// the end-of-container slot reads "Add a(n) <part>" by the kind of the container
	click(v.all(".booklet-design-nav-item")[1]);
	assert.equal(v.el.querySelector(".booklet-design-slot.is-child").getAttribute("aria-label"), "Add a module");
	v.go("Money");
	assert.equal(words(v.el.querySelector(".booklet-design-slot.is-child .booklet-design-slot-words")), "Add an activity", "an idle child slot says its words");
	v.close();
});

test("picking a tile lights exactly the slots the piece may go in; a banner says so, and Put it back, a second press and Escape each let it go", () => {
	const v = openDesign(FULL);
	v.go("Doing");
	const choice = piece("Q - choice.md");
	click(v.tile(choice.file));
	assert.deepEqual(armedFiles(v), [choice.file]);
	assert.equal(tileOf(v, choice.file).getAttribute("aria-pressed"), "true");
	const want = legalSlots(v.view.root, v.view.canvas, choice).map((s) => s.id);
	assert.ok(want.length >= 2);
	assert.deepEqual(lit(v), want, "exactly the legal slots");
	const banner = v.el.querySelector(".booklet-design-armedbar");
	assert.equal(banner.hidden, false);
	assert.equal(words(banner.querySelector("span")), "Choice is picked. Tap a lit spot to place it, or drag the tile there.");
	// a press on Put it back
	click(banner.querySelector(".booklet-design-putback"));
	assert.deepEqual(armedFiles(v), []);
	assert.deepEqual(lit(v), []);
	assert.equal(banner.hidden, true);
	// a second press on the same tile puts it back too
	click(tileOf(v, choice.file));
	assert.ok(lit(v).length);
	click(tileOf(v, choice.file));
	assert.deepEqual(lit(v), []);
	// Escape lets it go, and writes nothing
	click(tileOf(v, choice.file));
	assert.ok(lit(v).length);
	const esc = v.key("Escape");
	assert.equal(esc.defaultPrevented, true);
	assert.deepEqual(lit(v), []);
	assert.equal(v.disk.writes, 0);
	v.close();
});

test("a press on a lit slot places the picked piece exactly where insertPiece puts it, as one write; the new block is selected, no editor opens, and the piece is let go", async () => {
	const v = openDesign(FULL);
	v.go("Doing");
	const before = v.disk.text;
	const choice = piece("Q - choice.md");
	click(v.tile(choice.file));
	const target = v.slots().find((s) => s.classList.contains("is-lit"));
	const slot = slotOf(v, target);
	const expected = insertPiece(before, slotPositionFor(slot, choice), choice);
	assert.equal(expected.ok, true);
	await v.press(target);
	assert.equal(v.disk.writes, 1);
	assert.equal(v.disk.text, expected.text);
	assert.match(v.status(), /^Added Choice\./);
	assert.equal(v.editor(), null, "an add never opens the editor");
	const sel = v.all(".booklet-design-block.is-selected");
	assert.equal(sel.length, 1);
	assert.equal(sel[0].getAttribute("data-start"), String(expected.lines.start));
	assert.deepEqual(armedFiles(v), [], "the piece is let go");
	assert.deepEqual(lit(v), []);
	v.close();
});

test("a press on a slot that does not light does nothing but say why; the piece stays picked", async () => {
	const v = openDesign(FULL);
	v.go("Doing");
	const page = piece("Structure - activity.md");
	click(v.tile(page.file));
	const dark = v.slots().find((s) => !s.classList.contains("is-lit"));
	assert.ok(dark, "an activity has places on this page that do not take it (only the end of the container does)");
	await v.press(dark);
	assert.equal(v.disk.writes, 0);
	assert.match(v.status(), /cannot go here/);
	assert.deepEqual(armedFiles(v), [page.file], "still picked");
	v.close();
});

test("a press on a '+' first makes it the place to add at: the card says Adding here, only the tiles that may go there stay lit, and a press on one places it at once", async () => {
	const v = openDesign(FULL);
	v.go("Doing");
	const before = v.disk.text;
	const first = v.slots()[0];
	click(first);
	assert.deepEqual(chosen(v), [first.getAttribute("data-slot")]);
	assert.equal(v.slots()[0].getAttribute("aria-pressed"), "true");
	assert.equal(v.tab("add").getAttribute("aria-selected"), "true", "the Add tab opens");
	const where = v.el.querySelector(".booklet-design-where");
	assert.ok(where.classList.contains("is-target"));
	assert.match(words(where), /Adding here/);
	assert.match(words(where), /At the start of the page/);
	// only the legal tiles stay lit
	v.openGroups();
	const slot = slotsOf(v.view.canvas).find((s) => s.id === first.getAttribute("data-slot"));
	for (const p of everyPiece) {
		const ok = tileState(v.view.root, v.view.canvas, p, slot.id).ok;
		assert.equal(tileOf(v, p.file).getAttribute("aria-disabled"), String(!ok), p.file);
	}
	// a press on a tile that may not go there says why and writes nothing
	const bad = everyPiece.find((p) => !tileState(v.view.root, v.view.canvas, p, slot.id).ok);
	click(tileOf(v, bad.file));
	assert.equal(v.disk.writes, 0);
	assert.match(v.status(), /cannot go here/);
	// a press on a legal tile places it at once, at that place
	const text = piece("Q - text.md");
	const expected = insertPiece(before, slotPositionFor(slot, text), text);
	await v.press(tileOf(v, text.file));
	assert.equal(v.disk.text, expected.text);
	assert.equal(v.disk.writes, 1);
	assert.deepEqual(chosen(v), [], "the chosen place is let go");
	assert.equal(v.editor(), null);
	v.close();
});

test("a second press on the chosen '+' un-chooses it, and Escape does too", () => {
	const v = openDesign(FULL);
	v.go("Doing");
	click(v.slots()[1]);
	assert.equal(chosen(v).length, 1);
	click(v.slots()[1]);
	assert.deepEqual(chosen(v), []);
	click(v.slots()[1]);
	assert.equal(chosen(v).length, 1);
	v.key("Escape");
	assert.deepEqual(chosen(v), []);
	assert.match(words(v.el.querySelector(".booklet-design-where")), /Pick a piece, then a lit spot/);
	v.close();
});

test("a chosen '+' belongs to the page it was chosen on: another page forgets it", () => {
	const v = openDesign(FULL);
	v.go("Doing");
	click(v.slots()[0]);
	assert.equal(chosen(v).length, 1);
	v.go("Money");
	assert.deepEqual(chosen(v), []);
	v.close();
});

test("a tile can be dragged: the slots it may go in light up, a legal slot takes the drop and places it, an illegal one shows nothing and takes nothing", async () => {
	const v = openDesign(FULL);
	v.go("Doing");
	const before = v.disk.text;
	const choice = piece("Q - choice.md");
	const start = drag("dragstart", v.tile(choice.file));
	assert.equal(start.dataTransfer.data["application/x-booklet-design-piece"], choice.file);
	assert.deepEqual(lit(v), legalSlots(v.view.root, v.view.canvas, choice).map((s) => s.id));
	const okSlot = v.slots().find((s) => s.classList.contains("is-lit"));
	const over = drag("dragover", okSlot);
	assert.equal(over.defaultPrevented, true, "a legal slot accepts");
	assert.ok(okSlot.classList.contains("is-over"));
	drag("dragleave", okSlot);
	assert.equal(okSlot.classList.contains("is-over"), false);
	drag("dragend", tileOf(v, choice.file));
	assert.deepEqual(lit(v), [], "the lighting goes when the drag ends");
	// an activity goes only at the end of the container: the other places do not take it
	const pageTile = piece("Structure - activity.md");
	drag("dragstart", tileOf(v, pageTile.file));
	const dark = v.slots().find((s) => !s.classList.contains("is-lit"));
	assert.ok(dark);
	assert.equal(drag("dragover", dark).defaultPrevented, false, "an illegal slot accepts nothing");
	assert.equal(dark.classList.contains("is-over"), false, "and shows nothing");
	drag("drop", dark);
	await v.settle();
	assert.equal(v.disk.writes, 0);
	drag("dragend", tileOf(v, pageTile.file));
	// a drop on a legal slot
	drag("dragstart", tileOf(v, choice.file));
	const target = v.slots().find((s) => s.classList.contains("is-lit"));
	const slot = slotOf(v, target);
	const expected = insertPiece(before, slotPositionFor(slot, choice), choice);
	drag("drop", target);
	await v.settle();
	assert.equal(v.disk.text, expected.text);
	assert.equal(v.disk.writes, 1);
	v.close();
});

test("the Common row is six chips for the pieces most often added: they are pressed and placed like a tile, and are lit and greyed with it", async () => {
	const v = openDesign(FULL);
	v.go("Doing");
	for (const f of COMMON) {
		const st = tileState(v.view.root, v.view.canvas, piece(f));
		assert.equal(v.chip(f).getAttribute("aria-disabled"), String(!st.ok), f);
	}
	const text = piece("Q - text.md");
	click(v.chip(text.file));
	assert.deepEqual(armedFiles(v), [text.file]);
	assert.equal(v.chip(text.file).getAttribute("aria-pressed"), "true");
	assert.deepEqual(lit(v), legalSlots(v.view.root, v.view.canvas, text).map((s) => s.id));
	const before = v.disk.text;
	const target = v.slots().find((s) => s.classList.contains("is-lit"));
	const expected = insertPiece(before, slotPositionFor(slotOf(v, target), text), text);
	await v.press(target);
	assert.equal(v.disk.text, expected.text);
	v.close();
});

test("placing a part keeps the page it was placed on, and a container with nothing in it says what to add", async () => {
	const v = openDesign(bookletAround("> [!module|m] M\n\n> [!module|m end]\n"));
	v.go("M");
	assert.equal(words(v.el.querySelector(".booklet-design-page .booklet-design-empty")), "This module is empty. Add an activity.");
	const act = piece("Structure - activity.md");
	click(v.tile(act.file));
	const target = v.slots().find((s) => s.classList.contains("is-lit"));
	const before = v.disk.text;
	const expected = insertPiece(before, slotPositionFor(slotOf(v, target), act), act);
	await v.press(target);
	assert.equal(v.disk.text, expected.text);
	assert.equal(v.page().getAttribute("data-kind"), "module", "the module's page stays");
	assert.equal(v.all(".booklet-design-card").length, 1, "the activity is a card of it");
	// a page needs an activity first: its tile is greyed on a module's page, with the format's reason
	v.showAdd();
	assert.equal(tileOf(v, "Structure - page.md")?.getAttribute("aria-disabled") ?? v.tile("Structure - page.md").getAttribute("aria-disabled"), "true");
	v.close();
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

test("the keys are a scope of the view, not command hotkeys; a bare group letter shows the Add tab with its group marked, and any other key is left alone", () => {
	const v = openDesign(FULL);
	assert.ok(v.view.scope, "the view has a scope");
	assert.equal(v.tab("outline").getAttribute("aria-selected"), "true");
	const x = v.key("x");
	assert.equal(x.defaultPrevented, false, "a letter that is no group's is not taken");
	assert.equal(v.tab("outline").getAttribute("aria-selected"), "true");
	const enter = v.key("Enter");
	const esc = v.key("Escape");
	assert.equal(enter.defaultPrevented || esc.defaultPrevented, false, "Enter and Escape are not the view's while nothing is picked or open");
	const s = v.key("s");
	assert.equal(s.defaultPrevented, true);
	assert.equal(v.tab("add").getAttribute("aria-selected"), "true", "the Add tab is shown");
	assert.ok(v.el.querySelector('.booklet-design-pal-group[data-group="structure"]').classList.contains("is-keyed"), "its group is marked");
	assert.equal(v.status(), "Keys: s");
	// Escape lets the keys go
	v.key("Escape");
	assert.equal(v.el.querySelector(".booklet-design-pal-group.is-keyed"), null);
	assert.equal(v.status(), "");
	v.close();
});

test("each group letter marks its group: s q r v d; v and d both mark Views and data", () => {
	const want = { s: "structure", q: "questions", r: "reading", v: "views-data", d: "views-data" };
	for (const g of KEY_TREE) {
		const v = openDesign(FULL);
		v.key(g.key);
		assert.equal(v.el.querySelector(".booklet-design-pal-group.is-keyed")?.getAttribute("data-group"), want[g.key], g.title);
		assert.equal(v.el.querySelector(".booklet-design-pal-group.is-keyed .booklet-design-pal-head").getAttribute("aria-expanded"), "true", "and it is open");
		v.close();
	}
});

test("s m Enter adds a module, q m Enter adds a matrix (Ben's two examples), each at the legal place of what is selected", async () => {
	// nothing selected: the end of the booklet's own place
	const a = openDesign(FULL);
	const text = a.disk.text;
	const root = parseDesign(text);
	const mod = placeFor(root, null, piece("Structure - module.md"));
	assert.equal(mod.ok, true);
	a.keys("s", "m");
	assert.deepEqual(armedFiles(a), ["Structure - module.md"], "the module's tile is picked");
	assert.equal(a.status(), "Keys: s m");
	a.key("Enter");
	await a.settle();
	assert.equal(a.disk.text, insertPiece(text, mod.position, piece("Structure - module.md")).text);
	assert.equal(a.disk.writes, 1);
	assert.equal(a.status(), "Added Module.");
	assert.deepEqual(armedFiles(a), [], "nothing picked after");
	a.close();
	// a page selected: a matrix goes into it
	const b = openDesign(FULL);
	b.go("The map");
	const root2 = parseDesign(b.disk.text);
	const sel = walkDesign(root2).find((n) => n.id === "map");
	const mx = placeFor(root2, sel, piece("Q - matrix.md"));
	assert.equal(mx.ok, true);
	b.keys("q", "m", "Enter");
	await b.settle();
	assert.equal(b.disk.text, insertPiece(FULL, mx.position, piece("Q - matrix.md")).text);
	assert.equal(b.status(), "Added Matrix.");
	// the matrix is there, and drawn
	assert.ok(b.all(".booklet-design-block").some((n) => n.getAttribute("data-kind") === "question" && n.querySelector("[data-booklet-q]")));
	b.close();
});

test("with a '+' chosen, the keys place at that '+': q m Enter puts a matrix exactly there", async () => {
	const v = openDesign(FULL);
	v.go("Doing");
	const before = v.disk.text;
	const slot = slotsOf(v.view.canvas)[0];
	click(v.slots()[0]);
	const mx = piece("Q - matrix.md");
	v.keys("q", "m", "Enter");
	await v.settle();
	assert.equal(v.disk.text, insertPiece(before, slotPositionFor(slot, mx), mx).text);
	v.close();
});

test("typing more letters narrows to a piece by word, and Enter places the one picked", async () => {
	const v = openDesign(FULL);
	v.go("Doing");
	v.key("q");
	for (const ch of "scal") v.key(ch);
	assert.deepEqual(armedFiles(v), ["Q - scale.md"]);
	assert.equal(v.status(), "Keys: q s c a l");
	v.key("Enter");
	await v.settle();
	assert.match(v.status(), /^Added Scale\./);
	assert.ok(v.disk.text.includes("[!scale|"));
	v.close();
});

test("the arrow keys move the pick, Backspace takes a letter back, and Escape lets go without writing", () => {
	const v = openDesign(FULL);
	v.keys("q", "ArrowDown", "ArrowDown");
	const first = armedFiles(v)[0];
	assert.ok(first, "a piece is picked by the arrows");
	v.key("ArrowDown");
	assert.notEqual(armedFiles(v)[0], first, "the pick moves");
	v.key("Backspace");
	v.key("Backspace");
	assert.deepEqual(armedFiles(v), [], "back at the groups: nothing picked");
	assert.equal(v.el.querySelector(".booklet-design-pal-group.is-keyed"), null);
	v.keys("s", "m");
	assert.equal(armedFiles(v).length, 1);
	v.key("Escape");
	assert.deepEqual(armedFiles(v), []);
	assert.equal(v.disk.writes, 0);
	v.close();
});

test("an illegal piece is greyed with the format's reason, and is never inserted, by Enter or by a press", async () => {
	const text = bookletAround("> [!module|m] M\n\n> [!module|m end]\n");
	const v = openDesign(text);
	v.showAdd();
	v.openGroups();
	const t = tileOf(v, "Q - text.md");
	assert.equal(t.getAttribute("aria-disabled"), "true", "greyed");
	assert.equal(t.getAttribute("title"), tileState(v.view.root, v.view.canvas, piece("Q - text.md")).reason, "with the reason from the canvas, which is design-places'");
	v.keys("q", "t", "Enter");
	await v.settle();
	assert.equal(v.disk.writes, 0, "nothing inserted");
	assert.equal(v.disk.text, text);
	assert.match(v.status(), /^Text cannot go here: /);
	// a press on the greyed tile does nothing either
	click(tileOf(v, "Q - text.md"));
	await v.settle();
	assert.equal(v.disk.writes, 0);
	// a module is legal here
	v.key("Escape");
	v.keys("s", "m");
	assert.equal(tileOf(v, "Structure - module.md").getAttribute("aria-disabled"), "false");
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
		assert.equal(v.tab("outline").getAttribute("aria-selected"), "true");
	}
	// the focused element decides when the key's own target is the body
	input.focus();
	assert.equal(doc.activeElement, input);
	assert.equal(v.key("q").defaultPrevented, false);
	assert.equal(v.tab("outline").getAttribute("aria-selected"), "true");
	input.blur();
	// a modifier: Ctrl+s is the app's
	assert.equal(v.key("s", { ctrlKey: true }).defaultPrevented, false);
	assert.equal(v.key("s", { metaKey: true }).defaultPrevented, false);
	assert.equal(v.key("s", { altKey: true }).defaultPrevented, false);
	assert.equal(v.tab("outline").getAttribute("aria-selected"), "true");
	// and once a group is keyed, typing into a field still goes to the field
	v.key("s");
	assert.equal(v.status(), "Keys: s");
	const typed = v.key("m", { target: input });
	assert.equal(typed.defaultPrevented, false, "the keys do not take a field's letters");
	assert.equal(v.status(), "Keys: s");
	v.close();
});

test("Enter and Space on a tile are that tile's own press; Enter anywhere else places the picked piece", async () => {
	const v = openDesign(FULL);
	v.go("Doing");
	v.keys("q", "t");
	assert.deepEqual(armedFiles(v), ["Q - text.md"]);
	const onTile = v.key("Enter", { target: tileOf(v, "Q - text.md") });
	assert.equal(onTile.defaultPrevented, false, "a tile's own press");
	assert.equal(v.disk.writes, 0);
	const e = v.key("Enter", { target: doc.body });
	assert.equal(e.defaultPrevented, true);
	await v.settle();
	assert.match(v.status(), /^Added Text\./);
	v.close();
});

test("with nothing picked, Enter on the selected block opens its Markdown in place; on a button it is the button's", () => {
	const v = openDesign(FULL);
	v.go("Spending");
	v.pick("question", "[!text|spent]");
	assert.equal(v.editor(), null);
	const block = v.block("question", "[!text|spent]");
	const onBar = v.key("Enter", { target: block.querySelector(".booklet-design-floatbar button") });
	assert.equal(onBar.defaultPrevented, false, "a button's own press");
	assert.equal(v.editor(), null);
	const e = v.key("Enter", { target: block });
	assert.equal(e.defaultPrevented, true);
	assert.ok(v.editor(), "the editor is open in place");
	v.close();
});

test("every piece is reachable by keys alone in the real view: its letters pick its tile, then Enter adds exactly what insertPiece makes at placeFor's place, or is refused with the reason", async () => {
	assert.equal(allKeyed().length, 56);
	for (const hit of allKeyed()) {
		const v = openDesign(FULL);
		const text = v.disk.text;
		const placed = placeFor(parseDesign(text), null, hit.piece);
		v.keys(...hit.keys);
		assert.deepEqual(armedFiles(v), [hit.piece.file], `${hit.keys}: the piece's tile is picked`);
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

test("every action has a visible button: the tabs, the group headers, the chips, the tiles and the '+' slots are buttons, and Add part… shows the Add tab", () => {
	const v = openDesign(FULL);
	v.openGroups();
	for (const sel of [".booklet-design-tab", ".booklet-design-pal-head", ".booklet-design-commonchip", ".booklet-design-tile", ".booklet-design-slot"]) {
		const found = v.all(sel);
		assert.ok(found.length > 0, sel);
		for (const b of found) {
			assert.equal(b.tagName, "BUTTON", sel);
			assert.equal(b.getAttribute("type"), "button");
		}
	}
	// the command "Add part…" shows the Add tab
	click(v.tab("outline"));
	v.view.openCatalogue();
	assert.equal(v.tab("add").getAttribute("aria-selected"), "true");
	// and a command for a group marks it, as its letter does
	click(v.tab("outline"));
	v.view.openKeys("q");
	assert.equal(v.el.querySelector(".booklet-design-pal-group.is-keyed")?.getAttribute("data-group"), "questions");
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

test("the palette takes its text from the string table: Spanish and French where /localize has put them, English everywhere else", () => {
	const { DESIGN_STRINGS, t } = core;
	for (const k of Object.keys(DESIGN_STRINGS).filter((x) => /^(cat|keys|draw|cmd|pal|slot|armed|where)\./.test(x))) {
		assert.ok(DESIGN_STRINGS[k].en.length > 0, k);
		assert.equal(t(k, "es"), DESIGN_STRINGS[k].es ?? DESIGN_STRINGS[k].en, `${k}: Spanish shows, or English until it is translated`);
		assert.equal(t(k, "fr"), DESIGN_STRINGS[k].fr ?? DESIGN_STRINGS[k].en, `${k}: French shows, or English until it is translated`);
	}
});

/* ======================================================================== a phone ======================================================================== */

test("on a phone the left column is a panel: hidden until the menu button opens it, closed by a navigator choice, by picking a tile with no place chosen, by placing, by the scrim and by Escape", async () => {
	const v = openDesign(FULL, { phone: true });
	assert.ok(v.el.classList.contains("is-phone"));
	const left = () => v.el.querySelector(".booklet-design-left");
	const menu = () => v.el.querySelector(".booklet-design-menubutton");
	assert.equal(left().hidden, true, "closed at first");
	assert.equal(menu().getAttribute("aria-label"), "Show the menu");
	assert.equal(menu().getAttribute("aria-expanded"), "false");
	// open, then close by the scrim
	click(menu());
	assert.equal(left().hidden, false);
	assert.equal(menu().getAttribute("aria-expanded"), "true");
	assert.equal(v.el.querySelector(".booklet-design-scrim").hidden, false);
	click(v.el.querySelector(".booklet-design-scrim"));
	assert.equal(left().hidden, true);
	// a close button of the panel itself
	click(menu());
	click(v.el.querySelector(".booklet-design-panelclose"));
	assert.equal(left().hidden, true);
	// a navigator choice closes it and draws the page
	click(menu());
	v.go("Money");
	assert.equal(left().hidden, true);
	assert.equal(v.page().getAttribute("data-kind"), "module");
	// Escape closes it
	click(menu());
	v.key("Escape");
	assert.equal(left().hidden, true);
	// picking a tile with no place chosen closes it so the page shows the lit spots
	v.go("Doing");
	click(menu());
	click(v.tile("Q - text.md"));
	assert.equal(left().hidden, true, "the panel closes on picking a tile");
	assert.ok(lit(v).length > 0, "and the spots are lit on the page");
	// placing closes it too (and writes)
	await v.press(v.slots().find((s) => s.classList.contains("is-lit")));
	assert.equal(left().hidden, true);
	assert.equal(v.disk.writes, 1);
	// a press on a '+' opens the panel on the Add tab
	click(v.slots()[0]);
	assert.equal(left().hidden, false, "the panel opens on the Add tab");
	assert.equal(v.tab("add").getAttribute("aria-selected"), "true");
	v.close();
});

test("a pane narrower than 700 px draws the same panel; a wide pane has the column beside the canvas", () => {
	const obs = observerCount();
	try {
		const v = openDesign(FULL);
		assert.equal(v.el.classList.contains("is-phone"), false, "wide at first");
		assert.equal(v.el.querySelector(".booklet-design-menubutton"), null);
		assert.equal(v.el.querySelector(".booklet-design-left").hidden, false);
		obs.fire(500);
		assert.ok(v.el.classList.contains("is-phone"), "a narrow pane is drawn as a phone is");
		assert.ok(v.el.querySelector(".booklet-design-menubutton"));
		assert.equal(v.el.querySelector(".booklet-design-left").hidden, true);
		obs.fire(900);
		assert.equal(v.el.classList.contains("is-phone"), false);
		assert.equal(v.el.querySelector(".booklet-design-left").hidden, false);
		assert.equal(obs.live, 1, "one observer, the pane's");
		v.close();
		assert.equal(obs.live, 0, "and none when the view is gone");
	} finally {
		obs.off();
	}
});

test("on a phone every control of the view is at least 44 px by the sheet, and a narrow pane's rules are in it", async () => {
	const { readFileSync } = await import("node:fs");
	const css = readFileSync(new URL("../styles.base.css", import.meta.url), "utf8");
	assert.match(css, /\.booklet-design\.is-phone button[^{]*\{[^}]*min-height:\s*44px/, "44 px high");
	assert.match(css, /\.booklet-design\.is-phone button[^{]*\{[^}]*min-width:\s*44px/, "and wide");
	assert.match(css, /\.is-mobile \.booklet-design button/, "and by Obsidian's own is-mobile class");
	assert.match(css, /\.booklet-design\.is-phone \.booklet-design-left\s*\{[^}]*position:\s*absolute/, "the column is a panel over the canvas");
});
