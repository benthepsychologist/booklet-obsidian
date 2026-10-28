/*
 * The two widget engines' answers (SPEC section 7), worked out as booklet.html's engines (svgRegions and
 * gridSelect) work them out, so that the same presses and the same words give the same stored list, in
 * the same order. What a widget's data holds is read here too, defensively: it is the file's own JSON.
 * Data values are plain text, never Markdown (SPEC section 4). Plain TypeScript: nothing here imports
 * Obsidian.
 *
 * An answer of the wrong shape is not this block's business: whatever a list holds that these functions
 * do not make is kept as it is, and a value that is not a list is read as no answer.
 */

/**
 * The colour names a widget may give a cell (SPEC section 7); anything else is no colour. `blue` and `purple` are
 * format 0.16's, and carry no tone.
 */
export const COLOUR_NAMES = ["warm", "green", "amber", "slate", "teal", "blue", "purple"] as const;
export type ColourName = (typeof COLOUR_NAMES)[number];

/** The engines this plugin draws. */
export const ENGINES = ["grid-select", "svg-regions"] as const;

const isObj = (x: unknown): x is Record<string, unknown> => x !== null && typeof x === "object" && !Array.isArray(x);
/** A label as booklet.html's `tx` reads it: the string, else the fallback. */
const tx = (v: unknown, fallback: string): string => (typeof v === "string" ? v : fallback);
const listOf = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** How booklet.html compares two words (`norm`): case, curly quotes, long dashes and runs of spaces aside. */
export const normWords = (s: string): string =>
	String(s)
		.toLowerCase()
		.replace(/[’‘`´]/g, "'")
		.replace(/[—–]/g, "-")
		.replace(/\s+/g, " ")
		.trim();

/** Words typed with commas between them, as booklet.html's `splitList` reads a tag field: trimmed, none empty, in order. */
export const splitWords = (s: string): string[] =>
	String(s)
		.split(",")
		.map((x) => x.trim())
		.filter(Boolean);

/** The same word twice is kept once, as first written (booklet.html `dedupeLabels`). */
export function dedupeWords(words: readonly string[]): string[] {
	const seen = new Set<string>();
	return words.filter((x) => {
		const k = normWords(x);
		if (seen.has(k)) return false;
		seen.add(k);
		return true;
	});
}

const sameList = (a: readonly string[], b: readonly string[]) => a.join("\0") === b.join("\0");

/** The words a widget says (`copy`): only the string values, by key. */
export function copyOf(data: Record<string, unknown>): Record<string, string> {
	const out = Object.create(null) as Record<string, string>;
	const c = data["copy"];
	if (isObj(c)) for (const [k, v] of Object.entries(c)) if (typeof v === "string") out[k] = v;
	return out;
}

export const engineOf = (data: Record<string, unknown>): string => (typeof data["engine"] === "string" ? data["engine"] : "");

/* ======================= grid-select ======================= */

export interface GridCell {
	id: string;
	label: string;
	note: string;
	colour: ColourName | null;
}
export interface GridItem {
	id: string;
	cell: string;
	label: string;
}
export interface Grid {
	cells: GridCell[];
	items: GridItem[];
	axes: { top: string; left: string; right: string; bottom: string };
}

/** A grid-select widget's cells, items and edge labels. A cell or an item with no id is left out. */
export function gridOf(data: Record<string, unknown>): Grid {
	const cells: GridCell[] = [];
	for (const c of listOf(data["cells"])) {
		if (!isObj(c) || typeof c["id"] !== "string") continue;
		const colour = typeof c["color"] === "string" && (COLOUR_NAMES as readonly string[]).includes(c["color"]) ? (c["color"] as ColourName) : null;
		cells.push({ id: c["id"], label: tx(c["label"], c["id"]), note: tx(c["note"], ""), colour });
	}
	const items: GridItem[] = [];
	for (const it of listOf(data["items"])) {
		if (!isObj(it) || typeof it["id"] !== "string") continue;
		items.push({ id: it["id"], cell: tx(it["cell"], ""), label: tx(it["label"], it["id"]) });
	}
	const ax = isObj(data["axes"]) ? data["axes"] : {};
	return { cells, items, axes: { top: tx(ax["top"], ""), left: tx(ax["left"], ""), right: tx(ax["right"], ""), bottom: tx(ax["bottom"], "") } };
}

/** What a grid-select answer holds: item ids, and `x|cell|word` for a word of the reader's own. */
export const gridChosen = (v: unknown): unknown[] => listOf(v);

const ownIn = (cell: string) => `x|${cell}|`;
const isOwnIn = (x: unknown, cell: string): x is string => typeof x === "string" && x.startsWith(ownIn(cell));

/** One item of the answer in words: an item's label, or the reader's own word (booklet.html `gridLabel`). */
export function gridLabel(grid: Grid, id: string): string {
	if (id.startsWith("x|")) return id.split("|").slice(2).join("|");
	const it = grid.items.find((x) => x.id === id);
	return it ? it.label : id;
}

/** The cell's items, in the widget's order. */
export const cellItems = (grid: Grid, cell: string): GridItem[] => grid.items.filter((i) => i.cell === cell);

/** The reader's own words in a cell, as they stand in the answer (`x|cell|word`), in the answer's order. */
export const cellOwn = (grid: Grid, v: unknown, cell: string): string[] => gridChosen(v).filter((x): x is string => isOwnIn(x, cell));

/** A press on an item or on one of the reader's own words: in the answer, it comes out; else it goes at the end. */
export function gridToggle(v: unknown, id: string): unknown[] {
	const c = gridChosen(v);
	return c.includes(id) ? c.filter((x) => x !== id) : [...c, id];
}

/**
 * The words a cell's tag field holds (booklet.html gridSelect `values`): the cell's items that are chosen,
 * in the widget's order, then the reader's own words in the cell, in the answer's order.
 */
export function gridCellWords(grid: Grid, v: unknown, cell: string): string[] {
	const c = gridChosen(v);
	return [...cellItems(grid, cell).filter((k) => c.includes(k.id)).map((k) => k.label), ...cellOwn(grid, v, cell).map((x) => gridLabel(grid, x))];
}

/**
 * A cell's words set to exactly `words` (booklet.html gridSelect `onChange`), a word that names one of the cell's
 * items (compared as `normWords` does) as that item, any other as `x|cell|word`. The answer keeps the order the
 * reader picked (SPEC section 8): everything that stays keeps its place, a word taken out leaves the others where
 * they were, and a word added goes at the end.
 */
export function gridSetCellWords(grid: Grid, v: unknown, cell: string, words: readonly string[]): unknown[] {
	const known = cellItems(grid, cell);
	const mine = (id: unknown) => isOwnIn(id, cell) || known.some((k) => k.id === id);
	const ids = words.map((w) => known.find((k) => normWords(k.label) === normWords(w))?.id ?? ownIn(cell) + w);
	const stay = gridChosen(v).filter((id) => !mine(id) || ids.includes(id as string));
	return [...stay, ...ids.filter((id) => !stay.includes(id))];
}

/**
 * Words of the reader's own typed into a cell's field, commas between them: what booklet.html stores when
 * they are typed after the field's words and the field is left. The same word twice, or a word already
 * there, is kept once; when that leaves the cell's words as they were, the answer is not changed at all.
 */
export function gridAddOwn(grid: Grid, v: unknown, cell: string, typed: string): unknown[] {
	const now = gridCellWords(grid, v, cell);
	const next = dedupeWords([...now, ...splitWords(typed)]);
	return sameList(next, now) ? gridChosen(v) : gridSetCellWords(grid, v, cell, next);
}

/** A grid-select answer in words, in its order (booklet.html `gridNames`). */
export const gridNames = (grid: Grid, v: unknown): string[] => gridChosen(v).map((x) => (typeof x === "string" ? gridLabel(grid, x) : String(x)));

/* ======================= svg-regions ======================= */

export interface WidgetRegion {
	id: string;
	label: string;
	note: string;
}
export interface SenseWord {
	id: string;
	label: string;
}
export interface SenseGroup {
	id: string;
	label: string;
	words: SenseWord[];
}
export interface Regions {
	regions: WidgetRegion[];
	senses: SenseGroup[];
	/** The region ids offered as buttons. */
	chips: string[];
	/** How many figures the data carries (this plugin draws none). */
	figures: number;
}

/** An svg-regions widget's regions, sense words and chips. One with no id is left out. */
export function regionsOf(data: Record<string, unknown>): Regions {
	const regions: WidgetRegion[] = [];
	for (const r of listOf(data["regions"])) if (isObj(r) && typeof r["id"] === "string") regions.push({ id: r["id"], label: tx(r["label"], r["id"]), note: tx(r["note"], "") });
	const senses: SenseGroup[] = [];
	for (const g of listOf(data["senses"])) {
		if (!isObj(g)) continue;
		const gid = tx(g["id"], "");
		const words: SenseWord[] = [];
		for (const w of listOf(g["words"])) if (isObj(w) && typeof w["id"] === "string") words.push({ id: w["id"], label: tx(w["label"], w["id"]) });
		senses.push({ id: gid, label: tx(g["label"], gid), words });
	}
	const chips = listOf(data["chips"]).filter((x): x is string => typeof x === "string");
	return { regions, senses, chips, figures: listOf(data["figures"]).length };
}

/** A region's name: its label, else its id (booklet.html `labelOf`). */
export function regionLabel(rg: Regions, id: string): string {
	const r = rg.regions.find((x) => x.id === id);
	return r ? r.label : id;
}

/** A stored word in words: a sense word's label, else the word as the reader typed it (booklet.html `senseWord`). */
export function senseWord(rg: Regions, code: unknown): string {
	for (const g of rg.senses) for (const w of g.words) if (w.id === code) return w.label;
	return String(code);
}

/** Words back to what is stored: a sense word's id when the words are its label, else the words as typed (booklet.html `labelToSense`). */
export function labelToSense(rg: Regions, label: string): string {
	for (const g of rg.senses) for (const w of g.words) if (normWords(w.label) === normWords(label)) return w.id;
	return label;
}

/** One marked region in an answer: `{ "id": region, "s": [words] }`. */
export interface RegionRow {
	id: string;
	s: unknown[];
	[k: string]: unknown;
}

export const regionRows = (v: unknown): unknown[] => listOf(v);

const isRow = (x: unknown): x is RegionRow => isObj(x) && typeof x["id"] === "string";
/** The words a row holds (a row whose `s` is not a list holds none). */
const wordsOf = (r: RegionRow | undefined): unknown[] => (r && Array.isArray(r.s) ? r.s : []);

/** The first row of a region in the answer (booklet.html `rowFor`). */
export function rowFor(v: unknown, region: string): RegionRow | undefined {
	return regionRows(v).find((x): x is RegionRow => isRow(x) && x.id === region);
}

/** A row with its words set to `s`, in place: its other keys, and their order, as they were. */
const withWords = (rows: unknown[], r: RegionRow, s: unknown[]): unknown[] => rows.map((x) => (x === r ? { ...r, s } : x));

/**
 * A press on one of a sense group's words for a region (booklet.html svgRegions, a `.sense` button): a word
 * the region holds comes out, any other goes at the end of its words. A region that has no row yet gets one
 * at the end of the answer; a row left with no word is taken out.
 */
export function regionToggleWord(v: unknown, region: string, word: string): unknown[] {
	let rows = regionRows(v);
	let r = rowFor(rows, region);
	if (!r) {
		r = { id: region, s: [] };
		rows = [...rows, r];
	}
	const was = wordsOf(r);
	const s = was.includes(word) ? was.filter((x) => x !== word) : [...was, word];
	if (!s.length) return rows.filter((x) => x !== r);
	return withWords(rows, r, s);
}

/** A region's words, as its tag field holds them (booklet.html svgRegions `values`): each stored word in words. */
export const regionWords = (rg: Regions, v: unknown, region: string): string[] => wordsOf(rowFor(v, region)).map((x) => senseWord(rg, x));

/**
 * A region's words set to exactly `words` (booklet.html svgRegions `onChange`): each one stored as a sense
 * word's id when it is that word's label, else as typed. A region with no row yet gets one at the end of the
 * answer; with no words, its row is taken out.
 */
export function regionSetWords(rg: Regions, v: unknown, region: string, words: readonly string[]): unknown[] {
	const codes = words.map((w) => labelToSense(rg, w));
	let rows = regionRows(v);
	let r = rowFor(rows, region);
	if (!codes.length) return r ? rows.filter((x) => x !== r) : rows;
	if (!r) {
		r = { id: region, s: [] };
		rows = [...rows, r];
	}
	return withWords(rows, r, codes);
}

/**
 * Words of the reader's own typed into a region's field, commas between them: what booklet.html stores
 * when they are typed after the field's words and the field is left. A word already there is kept once;
 * when that leaves the region's words as they were, the answer is not changed at all.
 */
export function regionAddOwn(rg: Regions, v: unknown, region: string, typed: string): unknown[] {
	const now = regionWords(rg, v, region);
	const next = dedupeWords([...now, ...splitWords(typed)]);
	return sameList(next, now) ? regionRows(v) : regionSetWords(rg, v, region, next);
}

/** One of a region's words taken out, as a tag's × takes it out in booklet.html (every word that reads the same). */
export function regionRemoveWord(rg: Regions, v: unknown, region: string, word: string): unknown[] {
	return regionSetWords(
		rg,
		v,
		region,
		regionWords(rg, v, region).filter((x) => x !== word),
	);
}

/** A region's row taken out of the answer: Clear in its panel (the region's first row). */
export function regionClear(v: unknown, region: string): unknown[] {
	const r = rowFor(v, region);
	return regionRows(v).filter((x) => x !== r);
}

/** The row at `index` taken out: its × in the summary. */
export const regionClearAt = (v: unknown, index: number): unknown[] => regionRows(v).filter((_, i) => i !== index);

/** The words the reader typed in a region (not one of the widget's sense words), in the row's order. */
export function regionOwn(rg: Regions, v: unknown, region: string): string[] {
	const known = new Set(rg.senses.flatMap((g) => g.words.map((w) => w.id)));
	return wordsOf(rowFor(v, region))
		.filter((x) => !known.has(x as string))
		.map((x) => String(x));
}

/** Each marked region in words, in the answer's order: its row's place in the answer, its name and its words. */
export function regionSummary(rg: Regions, v: unknown): { index: number; region: string; label: string; words: string[] }[] {
	return regionRows(v).flatMap((r, index) => (isRow(r) ? [{ index, region: r.id, label: regionLabel(rg, r.id), words: wordsOf(r).map((x) => senseWord(rg, x)) }] : []));
}
