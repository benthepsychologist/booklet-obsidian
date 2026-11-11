/*
 * The panel is built from the linter's own tables and from pieces/, and nothing in it names a kind by hand. These tests hold the
 * generated files to their sources: the committed tables must equal what the linter says now, the committed pieces must equal the
 * folder, the plugin's own hand-written copies of the tables (lines.ts, booklet-icons.ts) must agree with the linter, and every kind
 * and every view the linter defines must have a piece to place. A change to the format that adds a kind makes this file fail until a
 * piece is written for it.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { core, LINTER, ROOT, py, pythonAvailable } from "./helpers.mjs";
import { BOOKLET_ICONS } from "./.build/screens.mjs";

const { LINTER_TABLES, PIECES, PIECE_GROUPS, KIND_SETTINGS, NO_ID_KINDS, QUERY_VIEWS, FORMAT_VERSION } = core;
const skip = pythonAvailable() ? false : "the linter (BOOKLET_REPO) or python3 is not here";

// the linter's tables, read a second way: not by the generator's snippet but by one written here
const LINTER_NOW = () =>
	py(
		`
import importlib.util, json, sys
sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location("lint_for_tables_test", sys.argv[1])
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
print(json.dumps({"v": m.FORMAT_VERSION, "kinds": {k: list(v) for k, v in m.KIND_SETTINGS.items()}, "noid": sorted(m.NO_ID_KINDS),
  "questions": sorted(m.QUESTION_KINDS), "views": list(m.QUERY_VIEWS), "icons": sorted(m.ICON_NAMES), "num": list(m.NUMBER_SETTINGS)}))
`,
		[LINTER],
	);

test("the generated linter tables are the linter's tables, in the linter's order", { skip }, () => {
	const now = LINTER_NOW();
	assert.equal(LINTER_TABLES.FORMAT_VERSION, now.v, "the format version");
	assert.deepEqual(Object.fromEntries(LINTER_TABLES.KIND_SETTINGS), now.kinds, "the kinds and what each takes");
	assert.deepEqual(LINTER_TABLES.KIND_SETTINGS.map(([k]) => k), Object.keys(now.kinds), "the order of kinds");
	assert.deepEqual([...LINTER_TABLES.NO_ID_KINDS].sort(), now.noid, "the kinds that take no id");
	assert.deepEqual([...LINTER_TABLES.QUESTION_KINDS].sort(), now.questions, "the question kinds");
	assert.deepEqual(LINTER_TABLES.QUERY_VIEWS, now.views, "the query views");
	assert.deepEqual(LINTER_TABLES.ICON_NAMES, now.icons, "the icon names");
	assert.deepEqual(LINTER_TABLES.NUMBER_SETTINGS, now.num, "the number settings");
});

test("the generator, run with --check, finds nothing stale", { skip }, () => {
	const r = spawnSync("node", [join(ROOT, "scripts", "make-editor-tables.mjs"), "--check"], { encoding: "utf8" });
	assert.equal(r.status, 0, r.stdout + r.stderr);
});

test("the plugin reads the format the linter checks", { skip }, () => {
	assert.equal(FORMAT_VERSION, LINTER_NOW().v);
});

test("the plugin's own hand-written tables agree with the linter's", { skip }, () => {
	const now = LINTER_NOW();
	assert.deepEqual(Object.fromEntries(Object.entries(KIND_SETTINGS).map(([k, v]) => [k, [...v]])), now.kinds, "lines.ts KIND_SETTINGS");
	assert.deepEqual([...NO_ID_KINDS].sort(), now.noid, "lines.ts NO_ID_KINDS");
	assert.deepEqual([...QUERY_VIEWS], now.views, "reader.ts QUERY_VIEWS");
	assert.deepEqual([...BOOKLET_ICONS].sort(), now.icons, "booklet-icons.ts BOOKLET_ICONS");
});

test("every piece in the generated table is a file in pieces/, as written, and every file is a piece", () => {
	const dir = join(ROOT, "pieces");
	const files = readdirSync(dir).filter((f) => f.endsWith(".md")).sort();
	assert.deepEqual(PIECES.map((p) => p.file), files);
	for (const p of PIECES) assert.equal(p.text, readFileSync(join(dir, p.file), "utf8"), p.file);
	assert.ok(existsSync(join(dir, files[0])));
});

// The kinds with no piece, and why. Exactly these: a new kind in the format fails the next test until it has a piece or a reason here.
const NO_PIECE = {
	records: "the records section is written by the plugin and the renderer, never by hand: a piece would only invite editing it",
	manifest: "a draft of the format (SPEC section 13) that no reader draws yet",
};

test("every kind the linter defines has a piece that places it, but the two that are never placed", () => {
	const placed = new Set(PIECES.flatMap((p) => p.kinds));
	const missing = LINTER_TABLES.KIND_SETTINGS.map(([k]) => k).filter((k) => !placed.has(k) && !(k in NO_PIECE));
	assert.deepEqual(missing, [], "kinds with no piece (add a file to pieces/, or a reason to NO_PIECE)");
	for (const k of Object.keys(NO_PIECE)) assert.ok(LINTER_TABLES.KIND_SETTINGS.some(([x]) => x === k), `${k} is exempt but the linter does not define it: remove it from NO_PIECE`);
	for (const k of Object.keys(NO_PIECE)) assert.ok(!placed.has(k), `${k} is exempt but a piece places it`);
});

test("every question kind has a piece that is that kind, first line to last", () => {
	for (const k of LINTER_TABLES.QUESTION_KINDS) assert.ok(PIECES.some((p) => p.kinds.includes(k)), k);
});

test("every query view has a piece, and every piece that holds a query names a view the linter has", () => {
	const views = new Set(PIECES.flatMap((p) => p.views));
	for (const v of LINTER_TABLES.QUERY_VIEWS) assert.ok(views.has(v), `no piece draws the view ${v}`);
	for (const v of views) assert.ok(v === "" || LINTER_TABLES.QUERY_VIEWS.includes(v), `a piece names the view ${v}, which the linter does not have`);
});

test("the pieces cover hints, solutions, groups, data blocks, the copy callout and piece markers", () => {
	const text = PIECES.map((p) => p.text).join("\n");
	for (const k of ["hint", "solution", "group", "copy", "page", "tab", "activity", "module", "row", "notice", "data", "menu", "listen", "widget", "matrix"]) {
		assert.ok(PIECES.some((p) => p.kinds.includes(k)), k);
	}
	assert.match(text, /```booklet data\b/);
	assert.match(text, /^<!-- Piece: .* -->$/m);
	assert.ok(PIECES.some((p) => p.kinds.includes("activity") && /\brepeat daily\b/.test(p.text)), "a repeat daily activity");
	assert.ok(PIECES.some((p) => p.kinds.includes("activity") && /\brepeat\b/.test(p.text)), "a repeat activity");
});

test("the front matter piece is at the format the linter checks", () => {
	const fm = PIECES.find((p) => p.file === "Structure - front matter.md");
	assert.match(fm.text, new RegExp(`^booklet: "${FORMAT_VERSION.replace(".", "\\.")}"$`, "m"));
});

test("every piece sits in a group the panel lists", () => {
	const ids = PIECE_GROUPS.map((g) => g.id);
	for (const p of PIECES) assert.ok(ids.includes(p.group), p.file);
	for (const g of ids) assert.ok(PIECES.some((p) => p.group === g), `${g} is empty`);
});

test("every piece uses only placeholders the panel knows how to make (`new-` words), and every file is unique by label", () => {
	const labels = PIECES.map((p) => `${p.group}/${p.label}`);
	assert.equal(new Set(labels).size, labels.length);
});
