/*
 * The two widget engines' answers, against the reference renderer itself. booklet.html's own engine code
 * (its section 8: the tag field, svgRegions, gridSelect and their helpers) is taken out of the file as it
 * is, run over a jsdom document, and driven by presses and typing. The plugin's core is given the same
 * presses and the same words, and after every step both must hold the same answer, byte for byte as JSON.
 * Skipped when the booklet repository is not there (BOOKLET_REPO).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";
import { JSDOM } from "jsdom";
import { BOOKLET, core, norm } from "./helpers.mjs";

const HTML = join(BOOKLET, "booklet.html");

/* ---- made-up widget data ---- */

const GRID = {
	engine: "grid-select",
	axes: { top: "louder", bottom: "quieter", left: "slower", right: "faster" },
	cells: [
		{ id: "loud-slow", label: "Loud and slow", note: "Like a drum.", color: "warm" },
		{ id: "loud-fast", label: "Loud and fast", note: "Like a bell.", color: "green" },
		{ id: "quiet-slow", label: "Quiet and slow", note: "Like a cello.", color: "slate" },
		{ id: "quiet-fast", label: "Quiet and fast", color: "teal" },
	],
	items: [
		{ id: "drum", cell: "loud-slow", label: "Drum" },
		{ id: "gong", cell: "loud-slow", label: "Gong" },
		{ id: "bell", cell: "loud-fast", label: "Bell" },
		{ id: "cello", cell: "quiet-slow", label: "Cello" },
		{ id: "harp", cell: "quiet-slow", label: "Harp" },
		{ id: "flute", cell: "quiet-fast", label: "Flute" },
	],
	copy: { h: "Sounds", p: "Press what you heard." },
};

const REGIONS = {
	engine: "svg-regions",
	regions: [
		{ id: "head", label: "Head", note: "The top." },
		{ id: "hands", label: "Hands" },
		{ id: "feet", label: "Feet" },
	],
	senses: [
		{ id: "temp", label: "Temperature", words: [{ id: "warm", label: "Warm" }, { id: "cool", label: "Cool" }] },
		{ id: "feel", label: "Feel", words: [{ id: "tingly", label: "Tingly" }, { id: "heavy", label: "Heavy" }, { id: "light", label: "Light" }] },
	],
	chips: ["head", "hands", "feet"],
	copy: { h: "Where", pick: "What is it like there?", clear: "Clear", none: "Press a place first." },
};

/* ---- the reference renderer's engines, run as written ---- */

function referenceEngines() {
	const src = readFileSync(HTML, "utf8");
	const one = (re, what) => {
		const m = re.exec(src);
		assert.ok(m, `booklet.html has ${what}`);
		return m[0];
	};
	const start = src.indexOf("/* ======================= 8. WIDGET ENGINES");
	const endAt = src.indexOf("const ENGINES=", start);
	assert.ok(start > 0 && endAt > start, "booklet.html has its section 8, the widget engines");
	const section = src.slice(start, src.indexOf("\n", endAt));
	const code = [
		one(/^const COLOUR_NAMES=.*$/m, "COLOUR_NAMES"),
		one(/^const norm=.*$/m, "norm"),
		one(/^const splitList=.*$/m, "splitList"),
		one(/^const tx=.*$/m, "tx"),
		one(/^const isObj=.*$/m, "isObj"),
		// an answer's shape, which the engines read their answers through (format 0.16)
		one(/^const isStr=.*$/m, "isStr"),
		one(/^const everyIs=.*$/m, "everyIs"),
		one(/^const isRegionRow=.*$/m, "isRegionRow"),
		one(/^const wordsOf=.*$/m, "wordsOf"),
		one(/^const nonEmpty=.*$/m, "nonEmpty"),
		one(/^const el=\(tag[\s\S]*?return n;\};/m, "el"),
		// what the engines call and this test does not need: words by language, the save, the figure
		"const strings=()=>({});function markDirty(){}function sanitizeSvg(){return [];}",
		section,
		"globalThis.__engines={gridSelect,svgRegions,gridNames,regionNames};",
	].join("\n");
	const dom = new JSDOM("<!doctype html><html><body></body></html>");
	// the engines put off a redraw to the next turn (afterPress, format 0.16): each step below waits for it (tick)
	const ctx = vm.createContext({ document: dom.window.document, window: dom.window, console, setTimeout, clearTimeout });
	vm.runInContext(code, ctx);
	return { ...ctx.__engines, document: dom.window.document, window: dom.window };
}

/** Types `typed` into a tag field after the words it holds, a key at a time. */
function typeKeys(R, inp, typed) {
	inp.focus();
	assert.equal(R.document.activeElement, inp, "the tag field has the focus");
	const lead = inp.value.trim() ? ", " : "";
	for (const ch of lead + typed) {
		inp.value += ch;
		inp.dispatchEvent(new R.window.Event("input", { bubbles: true }));
	}
}

/** Types `typed` into a tag field, then leaves it. */
function typeInto(R, inp, typed) {
	typeKeys(R, inp, typed);
	inp.blur();
}

/** Types `typed` into a tag field, then presses `b`, which leaves the field: the pointer goes down, the field loses focus, the pointer comes up, the click. */
function typeThenPress(R, inp, typed, b) {
	assert.ok(b, "the button to press is drawn");
	typeKeys(R, inp, typed);
	b.dispatchEvent(new R.window.Event("pointerdown", { bubbles: true }));
	inp.blur();
	R.document.dispatchEvent(new R.window.Event("pointerup", { bubbles: true }));
	b.click();
}

const textOf = (n) => (n.childNodes[0]?.textContent ?? n.textContent).trim();

/** The next turn, once what the engines put off to it (a redraw after a field is left) has run, as in a browser before the next press. */
const tick = () => new Promise((r) => setTimeout(r, 0));

/* ---- grid-select, step by step ---- */

function gridSteps() {
	// [what, the reference renderer's action, the plugin's]
	return [
		["press Bell", { press: ["loud-fast", "Bell"] }, (g, v) => core.gridToggle(v, "bell")],
		["press Gong", { press: ["loud-slow", "Gong"] }, (g, v) => core.gridToggle(v, "gong")],
		["press Cello", { press: ["quiet-slow", "Cello"] }, (g, v) => core.gridToggle(v, "cello")],
		["press Drum (before Gong in the widget's order)", { press: ["loud-slow", "Drum"] }, (g, v) => core.gridToggle(v, "drum")],
		["type a word of my own in loud-slow", { type: ["loud-slow", "thunder"] }, (g, v) => core.gridAddOwn(g, v, "loud-slow", "thunder")],
		["type an item's label, in another case", { type: ["quiet-slow", "harp"] }, (g, v) => core.gridAddOwn(g, v, "quiet-slow", "harp")],
		["type a word already there", { type: ["loud-slow", "Thunder"] }, (g, v) => core.gridAddOwn(g, v, "loud-slow", "Thunder")],
		["type two words with a comma", { type: ["quiet-fast", "wind, rain"] }, (g, v) => core.gridAddOwn(g, v, "quiet-fast", "wind, rain")],
		["press my own word to take it out", { press: ["loud-slow", "thunder"] }, (g, v) => core.gridToggle(v, "x|loud-slow|thunder")],
		["press Bell again", { press: ["loud-fast", "Bell"] }, (g, v) => core.gridToggle(v, "bell")],
		["type a word with a bar in it", { type: ["loud-fast", "a|b"] }, (g, v) => core.gridAddOwn(g, v, "loud-fast", "a|b")],
		["press Flute", { press: ["quiet-fast", "Flute"] }, (g, v) => core.gridToggle(v, "flute")],
		["type Flute's label in its cell, already pressed", { type: ["quiet-fast", "Flute"] }, (g, v) => core.gridAddOwn(g, v, "quiet-fast", "Flute")],
		// the words typed press Bell as the field is left for Bell, and that press only confirms it (holdIn), as the view does
		["type Bell's label in its cell, then press Bell", { typePress: ["loud-fast", "bell", "Bell"] }, (g, v) => core.gridAddOwn(g, v, "loud-fast", "bell")],
		["press Bell again: a press again", { press: ["loud-fast", "Bell"] }, (g, v) => core.gridToggle(v, "bell")],
	];
}

test("grid-select: the core stores what booklet.html stores, step by step", { skip: !existsSync(HTML) && `no booklet.html at ${HTML} (BOOKLET_REPO)` }, async () => {
	const R = referenceEngines();
	const e = Object.create(null);
	const box = R.gridSelect(e, GRID, ["k"], {});
	R.document.body.append(box);
	const cellBox = (id) => {
		const label = GRID.cells.find((c) => c.id === id).label;
		const q = [...box.querySelectorAll(".q")].find((n) => n.querySelector(".qn").textContent === label);
		assert.ok(q, `the cell ${id} is drawn`);
		return q;
	};
	const g = core.gridOf(GRID);
	let mine;
	const log = [];
	for (const [what, ref, ours] of gridSteps()) {
		if (ref.press) {
			const [cell, words] = ref.press;
			const b = [...cellBox(cell).querySelectorAll("button.emb")].find((n) => n.textContent === words);
			assert.ok(b, `${what}: a button "${words}"`);
			b.click();
		} else if (ref.typePress) {
			const [cell, typed, words] = ref.typePress;
			typeThenPress(R, cellBox(cell).querySelector("input.field"), typed, [...cellBox(cell).querySelectorAll("button.emb")].find((n) => n.textContent === words));
		} else typeInto(R, cellBox(ref.type[0]).querySelector("input.field"), ref.type[1]);
		await tick();
		mine = ours(g, mine);
		const theirs = norm(e.k);
		log.push([what, theirs]);
		assert.deepEqual(norm(mine), theirs, `${what}: the plugin ${JSON.stringify(mine)}, booklet.html ${JSON.stringify(theirs)}`);
	}
	// the end state, written out: one of each kind of item, in the order the reader picked them (SPEC section 8), as
	// booklet.html keeps it: a word typed in a cell went at the end, and one taken out left the others where they were
	assert.deepEqual(norm(mine), ["gong", "cello", "drum", "harp", "x|quiet-fast|wind", "x|quiet-fast|rain", "x|loud-fast|a|b", "flute"]);
	// a kept entry reads it back as booklet.html's summary does
	assert.deepEqual(core.gridNames(g, mine), [...R.gridNames(GRID, e.k)]);
	assert.deepEqual(core.gridNames(g, mine), ["Gong", "Cello", "Drum", "Harp", "wind", "rain", "a|b", "Flute"]);
});

/* ---- svg-regions, step by step ---- */

function regionSteps() {
	const rg = core.regionsOf(REGIONS);
	let active = null;
	return [
		["open Hands", { open: "Hands" }, (v) => ((active = "hands"), v)],
		["press Warm", { word: "Warm" }, (v) => core.regionToggleWord(v, active, "warm")],
		["press Tingly", { word: "Tingly" }, (v) => core.regionToggleWord(v, active, "tingly")],
		["type a word of my own", { type: "buzzing" }, (v) => core.regionAddOwn(rg, v, active, "buzzing")],
		["open Head", { open: "Head" }, (v) => ((active = "head"), v)],
		["type a sense word's label, in another case", { type: "heavy" }, (v) => core.regionAddOwn(rg, v, active, "heavy")],
		["type two words with a comma, one there already", { type: "Heavy, pressing" }, (v) => core.regionAddOwn(rg, v, active, "Heavy, pressing")],
		["open Hands again", { open: "Hands" }, (v) => ((active = "hands"), v)],
		["take my own word out", { untag: "buzzing" }, (v) => core.regionRemoveWord(rg, v, active, "buzzing")],
		["press Warm again, to take it out", { word: "Warm" }, (v) => core.regionToggleWord(v, active, "warm")],
		["open Feet", { open: "Feet" }, (v) => ((active = "feet"), v)],
		["press Cool", { word: "Cool" }, (v) => core.regionToggleWord(v, active, "cool")],
		["Clear Feet", { clear: true }, (v) => core.regionClear(v, active)],
		["press Light", { word: "Light" }, (v) => core.regionToggleWord(v, active, "light")],
		["the summary's x on the first row", { summaryX: 0 }, (v) => core.regionClearAt(v, 0)],
		["open Head from the summary", { summaryOpen: "Head" }, (v) => ((active = "head"), v)],
		["press Tingly", { word: "Tingly" }, (v) => core.regionToggleWord(v, active, "tingly")],
		["press Tingly again", { word: "Tingly" }, (v) => core.regionToggleWord(v, active, "tingly")],
		["take every word of Head out, one at a time", { untagAll: true }, (v) => {
			for (const w of core.regionWords(rg, v, active)) v = core.regionRemoveWord(rg, v, active, w);
			return v;
		}],
		// the words typed press Warm as the field is left for Warm, and that press only confirms it (holdIn), as the view does
		["type Warm's label, then press Warm", { typePress: ["warm", "Warm"] }, (v) => core.regionAddOwn(rg, v, active, "warm")],
		["press Warm again: a press again", { word: "Warm" }, (v) => core.regionToggleWord(v, active, "warm")],
	];
}

test("svg-regions with no figure: the core stores what booklet.html stores, step by step", { skip: !existsSync(HTML) && `no booklet.html at ${HTML} (BOOKLET_REPO)` }, async () => {
	const R = referenceEngines();
	const e = Object.create(null);
	const box = R.svgRegions(e, REGIONS, ["k"], {});
	R.document.body.append(box);
	const panel = () => box.querySelector(".sensepanel");
	let mine;
	for (const [what, ref, ours] of regionSteps()) {
		if (ref.open) [...box.querySelectorAll(".bodychips button.pill-btn")].find((n) => n.textContent === ref.open).click();
		else if (ref.summaryOpen) [...box.querySelectorAll(".bodysummary button.rlink")].find((n) => n.textContent === ref.summaryOpen).click();
		else if (ref.word) [...panel().querySelectorAll("button.sense")].find((n) => n.textContent === ref.word).click();
		else if (ref.type) typeInto(R, panel().querySelector("input.field"), ref.type);
		else if (ref.typePress) typeThenPress(R, panel().querySelector("input.field"), ref.typePress[0], [...panel().querySelectorAll("button.sense")].find((n) => n.textContent === ref.typePress[1]));
		else if (ref.untag) [...panel().querySelectorAll(".tagchip")].find((n) => textOf(n) === ref.untag).querySelector("button.x").click();
		else if (ref.untagAll) for (;;) {
			const chip = panel().querySelector(".tagchip");
			if (!chip) break;
			chip.querySelector("button.x").click();
		}
		else if (ref.clear) panel().querySelector("button.small").click();
		else if (ref.summaryX !== undefined) box.querySelectorAll(".bodysummary .bodyrow")[ref.summaryX].querySelector("button.x").click();
		await tick();
		mine = ours(mine);
		const theirs = norm(e.k ?? []);
		assert.deepEqual(norm(mine ?? []), theirs, `${what}: the plugin ${JSON.stringify(mine)}, booklet.html ${JSON.stringify(theirs)}`);
	}
	assert.deepEqual(norm(mine), [{ id: "feet", s: ["light"] }]);
	// a kept entry names each place with its words, "Feet — Light", as booklet.html's summary does (format 0.16's renderer)
	assert.deepEqual(core.answerWords({ kind: "widget", id: "k", widget: { data: REGIONS } }, mine), { list: [...R.regionNames(REGIONS, e.k)] });
	assert.deepEqual([...R.regionNames(REGIONS, e.k)], ["Feet — Light"]);
});

test("svg-regions: the steps' answers in full, so a change to either side is seen", () => {
	const rg = core.regionsOf(REGIONS);
	let v;
	v = core.regionToggleWord(v, "hands", "warm");
	v = core.regionAddOwn(rg, v, "hands", "buzzing");
	v = core.regionAddOwn(rg, v, "head", "heavy, Pressing");
	assert.deepEqual(norm(v), [{ id: "hands", s: ["warm", "buzzing"] }, { id: "head", s: ["heavy", "Pressing"] }]);
	assert.deepEqual(core.regionOwn(rg, v, "hands"), ["buzzing"]);
	assert.deepEqual(core.regionWords(rg, v, "head"), ["Heavy", "Pressing"]);
	// a word the region holds, typed again, changes nothing: the same list comes back
	assert.equal(core.regionAddOwn(rg, v, "head", "HEAVY"), v);
	// a row keeps its other keys, and their order, when its words change
	const kept = core.regionToggleWord([{ id: "feet", note: "x", s: ["cool"], z: 1 }], "feet", "warm");
	assert.equal(JSON.stringify(kept), '[{"id":"feet","note":"x","s":["cool","warm"],"z":1}]');
	// what is not a row is kept where it is
	assert.deepEqual(norm(core.regionToggleWord(["odd", { id: "head", s: ["warm"] }], "head", "warm")), ["odd"]);
	assert.deepEqual(core.regionRows("not a list"), []);
});

test("grid-select: reading the data, and an own word compared as booklet.html compares", () => {
	const g = core.gridOf(GRID);
	assert.deepEqual(g.cells.map((c) => [c.id, c.colour]), [["loud-slow", "warm"], ["loud-fast", "green"], ["quiet-slow", "slate"], ["quiet-fast", "teal"]]);
	assert.deepEqual(g.axes, GRID.axes);
	assert.equal(core.gridOf({ cells: [{ id: "a", color: "magenta" }, { label: "no id" }] }).cells.length, 1);
	assert.equal(core.gridOf({ cells: [{ id: "a", color: "magenta" }] }).cells[0].colour, null, "a colour that is no colour name is no colour");
	// curly quotes, long dashes and runs of spaces read as the same word
	const v = core.gridAddOwn(g, [], "loud-slow", "it’s  here — now");
	assert.equal(core.gridAddOwn(g, v, "loud-slow", "it's here - now"), v);
	assert.deepEqual(norm(v), ["x|loud-slow|it’s  here — now"]);
	assert.deepEqual(core.gridCellWords(g, ["gong", "x|loud-slow|a", "drum", "bell"], "loud-slow"), ["Drum", "Gong", "a"]);
	assert.deepEqual(core.copyOf({ copy: { h: "Head", n: 3 } }), Object.assign(Object.create(null), { h: "Head" }));
});

test("grid-select: a word typed in a cell leaves the answer's order as the reader picked it (SPEC section 8): it goes at the end, and nothing else moves", () => {
	const g = core.gridOf(GRID);
	// Gong (loud-slow) was picked before Cello (quiet-slow): a word typed in loud-slow does not move Gong after Cello
	assert.deepEqual(norm(core.gridAddOwn(g, ["bell", "gong", "cello"], "loud-slow", "thunder")), ["bell", "gong", "cello", "x|loud-slow|thunder"]);
	// an item's label typed in its cell presses it, at the end
	assert.deepEqual(norm(core.gridAddOwn(g, ["gong", "bell"], "loud-slow", "drum")), ["gong", "bell", "drum"]);
	// two words at once go at the end in the order typed; a word of the cell already there keeps its place
	assert.deepEqual(norm(core.gridAddOwn(g, ["x|loud-slow|a", "bell", "gong"], "loud-slow", "b, GONG, c")), ["x|loud-slow|a", "bell", "gong", "x|loud-slow|b", "x|loud-slow|c"]);
	// a word already there changes nothing: the same list comes back
	const v = ["x|loud-slow|a", "bell"];
	assert.equal(core.gridAddOwn(g, v, "loud-slow", "A"), v);
	// a word taken out leaves the others where they were
	assert.deepEqual(norm(core.gridToggle(["gong", "x|loud-slow|a", "bell", "drum"], "x|loud-slow|a")), ["gong", "bell", "drum"]);
});
