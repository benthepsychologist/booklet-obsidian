/*
 * A `booklet query` over kept entries (SPEC section 6, "Queries: showing kept entries and data" and "A span of days,
 * and summaries"), worked out as rows that the views draw. A row is a set of named fields; a view draws it by the
 * parts its fields play (the roles). Kept entries give one row per entry, its questions the fields and its date the
 * field `date`. `summary: on` gives summary rows instead: one for the entries' dates, then one per question; a query
 * of a single question with a summary gives that question's distribution. Nothing here is saved: a summary is drawn,
 * never written. Plain TypeScript: nothing here imports Obsidian.
 */
import { pairFor, pickKey, pickWords, plainOf, shownPairs, sourceOf, sourcePicks, type PickValue } from "./each";
import { newestFirst, plainWords, sameWords } from "./earlier";
import { childRowsOf, type DataRow, type DataRows, type DataValue, type FieldEdit } from "./data";
import { carries, editSpecOf, heldOf, isReadonly, pickOfRow, rowActs, type EditSpec, type RowActs } from "./ask";
import { idKey, withPending, type RowAct } from "./rows-act";
import { DATA_WORDS } from "./data-file";
import type { Activity, Booklet, DataBlock, Query, QuerySegment, Question, Role, ViewName } from "./reader";
import { ROLE_NAMES, questionsOf } from "./reader";
import type { Entry } from "./records";
import { holdsSomething, shapeIssue } from "./shape";
import { engineOf, gridLabel, gridNames, gridOf, normWords, regionLabel, regionsOf, regionSummary, type Grid } from "./widgets";
import { answerWords, type WordPart } from "./words";
import { localDayOf } from "./write";

/** Which keys each view reads (SPEC section 6's table of views). */
export const VIEW_DRAWS: Record<ViewName, readonly string[]> = {
	cards: ["label", "value", "note", "badge", "tone", "fields", "group", "limit", "parent", "link", "icon", "readonly", "add", "delete"],
	table: ["fields", "group", "limit", "parent", "badge", "tone", "link", "icon", "readonly", "add", "delete"],
	list: ["label", "value", "note", "badge", "tone", "fields", "group", "limit", "parent", "link", "icon", "readonly", "add", "delete"],
	tiles: ["label", "value", "note", "tone", "group", "limit", "link", "icon", "readonly"],
	bars: ["label", "value", "tone", "limit", "readonly"],
	line: ["label", "value", "fields", "limit", "readonly"],
};

/** The renderer's own words for a query (SPEC section 9: in the renderer's language, here English). */
export const QUERY_WORDS = {
	empty: "Nothing kept here yet.",
	date: "Date",
	daysLogged: "Days logged",
	entries: (n: number, f: (x: number) => string) => (n === 1 ? `${f(1)} entry` : `${f(n)} entries`),
	lowest: "lowest",
	highest: "highest",
	answered: "answered",
	columns: { label: "Question", count: "Count", days: "Days", average: "Average", lowest: "Lowest", highest: "Highest", total: "Total", most: "Most", note: "Note" } as Record<string, string>,
	answer: "Answer",
	tone: { good: "Good", warn: "Needs a look", bad: "Needs action" } as Record<string, string>,
	rows: (n: number) => (n === 1 ? "1 row" : `${n} rows`),
	/** What a screen reader hears for a row that opens when its line has no words in it. */
	row: "Row",
	/** A chart's own words (SPEC section 6: a chart always offers its numbers as a table, and what cannot be drawn says so). */
	chart: {
		numbers: "Show the numbers",
		one: "One reading so far.",
		zero: "Every value is 0, so no bar is drawn.",
		bars: (n: number, lo: string | null, hi: string | null) => `Bar chart, ${n === 1 ? "1 bar" : `${n} bars`}${lo !== null && hi !== null ? `, from ${lo} to ${hi}` : ""}`,
		line: (names: string, n: number, lo: string, hi: string) => `Line chart of ${names}, ${n === 1 ? "1 point" : `${n} points`}, from ${lo} to ${hi}`,
		/** Why a chart cannot be drawn, in the chart's place: `what` is "bars" or "a line". */
		cannot: (what: string, why: string) => `Cannot draw as ${what}: ${why}`,
		noField: (what: string) => (what === "bars" ? "no field was named for the length of a bar (value:)." : "no field was named to plot (fields: or value:)."),
		notNumbers: (names: string[]) => (names.length === 1 ? `${names[0]} is not a number.` : `${names.join(" and ")} are not numbers.`),
		readout: "Tap or hover a point to read it.",
	},
	/** A query that threw while it was worked out or drawn: said in its own place (the reason is the error's own words). */
	failed: (why: string) => `This query could not be drawn: ${why}`,
	controls: {
		toggle: "Sort and filter",
		search: "Filter rows",
		clearSearch: "Clear filter",
		sortBy: "Sort by",
		original: "Original order",
		date: "Date",
		ascending: "Ascending",
		descending: "Descending",
		clear: "Clear",
		openAll: "Open all",
		closeAll: "Close all",
		nothing: "Nothing matches.",
		shown: (n: number, of: number) => `${n} of ${of} shown`,
	},
};

/** How many rows a view needs before the reader's sort and filter is offered (booklet.html CONTROLS_MIN). */
export const CONTROLS_MIN = 9;

/** One field of a row. */
export interface Cell {
	/** The field in plain words: what the roles, a group and a tone read. */
	text: string;
	/** The words drawn: `md` is the file's own inline Markdown (an option, a title), `text` plain words. */
	parts: WordPart[];
	/** A list (a lines answer's lines, an svg-regions answer's places), drawn as a list where the view has room. */
	list?: string[];
	/** Each member's plain words (a multi's picks): a badge that is a list is several pills. */
	items?: string[];
	/** The field is this number (a number answer, a statistic, a data value): a table sets it to the right. */
	num?: number;
	/** A scale answer's number, which a chart plots and a sort compares: not `num`, so a scale column stays set to the left as it was. */
	plot?: number;
}

export interface Row {
	cells: Record<string, Cell>;
	/** A kept entry's `ts` (what a date sort and a chart's date label read); a summary row or a data row has none. */
	ts?: string;
	/** A data row as the block holds it (its values, and its child rows under their fields): what a question asked for each row and an edited field read. */
	raw?: DataRow;
	/** A data row's `id` as its pairs name it: undefined when it has none, or when an earlier row of the block has the same one (the first is used). */
	id?: PickValue;
	/** A data row that is being added (made from its kept entry, not in the data yet) or removed (still in the data), or whose removal the data did not follow (rows-act.ts). */
	act?: RowAct;
	/** A data row as the data holds it: `raw`, but for a row that was copied to make room for an add waiting under it (a removal records this as `was`). */
	data?: DataRow;
}

/** The smallest and largest of a list, by a loop: `Math.min(...list)` passes every number as an argument and throws past about 120,000. */
export const minOf = (list: readonly number[]): number => list.reduce((m, x) => (x < m ? x : m), Infinity);
export const maxOf = (list: readonly number[]): number => list.reduce((m, x) => (x > m ? x : m), -Infinity);

/** The number a cell stands for in a chart or a sort: a number answer, a scale answer, a statistic or a data value; else none. */
export const numberOf = (c: Cell | undefined): number | undefined => (c ? (c.plot ?? c.num) : undefined);

export interface RowSet {
	/** Kept entries as rows, summary rows (a summary, or a distribution), a data block's rows, or one row for each pick of a question asked for each pick. */
	kind: "entries" | "summary" | "data" | "picks";
	rows: Row[];
	/** The fields, in order: a table's columns without `fields:`; the first is what the label falls back to. */
	own: string[];
	/** A field's name, in words. */
	label: (key: string) => WordPart[];
	/** Over kept entries: the questions a card shows, in the activity's order. */
	questions: Question[];
	/** A field `fields:` names, as the fields it stands for: a question asked for each pick is one field per pick. */
	expand: (key: string) => string[];
	/** The question whose answer is a row's value by default (`from:` a single question), else null. */
	valueField: string | null;
	/**
	 * A data block's rows at every depth, a row before its children, in the file's order (`rows` are the top rows only); with each
	 * row's children in groups, one for each field that holds rows in that row, and the fields that hold rows in some row (`kidKeys`,
	 * which are never a column or a line). Data sets only.
	 */
	all?: Row[];
	groupsOf?: Map<Row, { key: string; rows: Row[] }[]>;
	kidKeys?: Set<string>;
	/** A data block's `edit` marks, by field (ask.ts editSpecOf reads them). */
	edits?: Record<string, FieldEdit>;
}

export interface Group {
	name: string | null;
	rows: Row[];
}

/** What a chart plots: the field of each series (a bar chart has one; a `null` is a series with no field) and the locale its numbers are written in. */
export interface ChartSpec {
	kind: "bars" | "line";
	keys: (string | null)[];
	locale: string;
}

/** One field of a row, shown in the row's open part under its label (SPEC section 6, "What opens"): plain text, its line breaks kept. */
export interface MoreField {
	key: string;
	label: WordPart[];
	text: string;
}

/** A row's children drawn together: those nested by `parent` first (`key` null, no heading), then one group for each field that holds rows, headed by the field's label. */
export interface KidGroup {
	key: string | null;
	label: WordPart[] | null;
	rows: Row[];
}

/**
 * A nested view (SPEC section 6, "Rows that open"): rows with a `parent` that is another row's `id` stand under it, and so do the rows a
 * field holds. `table`, `list` and `cards` draw it, each row opening in place.
 */
export interface Tree {
	/** The top rows, in order. */
	roots: Row[];
	/** The top rows in their groups (one group with no name unless `group:` names a field on rows that only open and do not nest). */
	tops: Group[];
	/** Each row's children, in order (all of its groups). */
	kids: Map<Row, Row[]>;
	/** Each row's children in groups, in the order they are drawn. */
	groups: Map<Row, KidGroup[]>;
	/** Each row's parent row, or null for a top row. */
	up: Map<Row, Row | null>;
	/** What remembers that a row is open: its `id`, else its place. */
	keyOf: Map<Row, string>;
	/** Every row, a row before its children (what a search, a count and Open all read). */
	flat: Row[];
	/** What a row shows when it opens besides its children: its other fields. */
	more: (r: Row) => MoreField[];
	/** The questions asked of a row that are drawn in its open part (ask.ts): after its other fields and before its children. */
	asks: (r: Row) => Question[];
}

/**
 * The acts a reader can make on a data view's rows (SPEC section 5, "A question asked for each row" and "Editing a field in place"; section 6,
 * `readonly`): which questions of the activity are asked for each row of the block, which a `fields:` names (drawn in that column), which
 * fields may be edited, and which the query locks. The activity decides whether an act can be kept (it must repeat); that is the view's.
 */
export interface AskPlan {
	/** The questions of the query's activity whose `each:` names the block, in the activity's order. */
	questions: Question[];
	/** A question the query's `fields:` names, by the column it stands in. */
	columns: Map<string, Question>;
	/** Is this question asked of this row: the row has an id, and carries a field with the question's id, or no row of the block does. */
	asked(q: Question, r: Row): boolean;
	/** The questions drawn in this row's open part: asked of it and not placed in a column. */
	open(r: Row): Question[];
	/** The query locks this field (or, bare, every field), a question included. */
	readonly(key: string): boolean;
	/** The box an editable field of this row asks for, or null: the field is read-only (no mark, or the row has no id, or a question is asked of the field). */
	edit(r: Row, key: string): EditSpec | null;
}

export type QueryPlan =
	| {
			kind: "rows";
			view: ViewName;
			set: RowSet;
			/** The rows in their groups (one group with no name unless the query groups them); none when `empty` shows. */
			groups: Group[];
			roles: Record<Role, string | null>;
			/** The other fields the view shows: a table's columns, a list row's extras, a card's lines. */
			cols: string[];
			/** What shows when there are no rows (the query's `empty:`, else the renderer's own line); null when there are rows. */
			empty: string | null;
			/** For `bars` and `line`: what is plotted. The chart itself is made from the rows left after the reader's filter (chart.ts). */
			chart?: ChartSpec;
			/** For a nested `table`, `list` or `cards`: the tree the rows stand in. The rows of `groups` are every row of it, in no order a view draws. */
			tree?: Tree;
			/** What shows is the quiet box that says why a data file was not read (SPEC section 7), and not the query's own words for no rows. */
			quiet?: boolean;
			/** For a `table`, `list` or `cards` over a data block: what the reader may do to its rows (questions, edited fields, `readonly`). */
			ask?: AskPlan;
			/** For a `table`, `list` or `cards` over a data block whose query says `add` or `delete`: what it offers (a bare `readonly` leaves neither). */
			acts?: RowActs;
	  };

export interface PlanOptions {
	/**
	 * The rows of a data block that names a file (`booklet data file.json key.path`): what the view has read, or the words for the quiet
	 * box (data-files.ts). Left out, such a block has no rows to give and the quiet box says it could not be read.
	 */
	fileRows?: (block: DataBlock) => { data: DataRows } | { note: string };
	/** The activity that holds the query: the questions it asks for each row of a data block are the ones the view draws (ask.ts). */
	activity?: Activity;
	/** The moment the page was drawn: today, for a span of days, is its date. */
	drawn: Date;
	/** The moment the rows are worked out (default now): an entry later than it is in no span. */
	now?: Date;
	/** The locale numbers are drawn in (default the renderer's language, English). */
	locale?: string;
}

/* ---- numbers ---- */

/** Rounded to one decimal, half away from zero (SPEC section 6): 2.25 is 2.3, -2.25 is -2.3. */
export function round1(x: number): number {
	const s = x < 0 ? -1 : 1;
	// toPrecision takes off the binary error that makes 2.65 * 10 come out as 26.499999…
	return (s * Math.round(Number((Math.abs(x) * 10).toPrecision(12)))) / 10 || 0;
}

/** A number in the locale's way of writing it: "2.6", "2,6" in French; a whole number has no decimal. */
export function formatNumber(x: number, locale: string, digits = 6): string {
	try {
		return new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(x);
	} catch {
		return String(x);
	}
}

/* ---- a span of days ---- */

/**
 * The entries of a span of `days` (SPEC section 6, a day as section 8 defines it): those whose own calendar date, in
 * the reader's time zone, is the drawn day or one of the `days - 1` dates before it. Today is the date of the moment the
 * page was drawn; an entry later than `now` is in no span, and nor is one whose `ts` will not parse.
 */
export function inSpan(entries: readonly Entry[], days: number, drawn: Date, now: Date = new Date()): Entry[] {
	const first = new Date(drawn.getTime());
	first.setDate(first.getDate() - (days - 1));
	first.setHours(0, 0, 0, 0);
	const end = new Date(drawn.getTime());
	end.setHours(23, 59, 59, 999);
	const from = first.getTime();
	const to = Math.min(end.getTime(), now.getTime());
	return entries.filter((e) => {
		const t = Date.parse(String(e.ts));
		return Number.isFinite(t) && t >= from && t <= to;
	});
}

const formats = new WeakMap<object, { zone: string; format: Intl.DateTimeFormat }>();
let zone = "";
let zoneRead = -Infinity;

/**
 * The formatter for these options in the reader's own locale and time zone, built once per distinct locale and zone: the same words
 * as `toLocaleString` with these options. Building one for each entry is a large part of drawing a table of thousands of kept
 * days, and `Intl` resolving the locale and zone costs as much as building one, so the pair is read at most once a second.
 * `options` is one object per caller, kept across calls.
 */
export function localFormat(options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
	const now = Date.now();
	if (now - zoneRead >= 1000) {
		const r = new Intl.DateTimeFormat().resolvedOptions();
		zone = `${r.locale} ${r.timeZone}`;
		zoneRead = now;
	}
	let hit = formats.get(options);
	if (!hit || hit.zone !== zone) formats.set(options, (hit = { zone, format: new Intl.DateTimeFormat(undefined, options) }));
	return hit.format;
}

const MOMENT: Intl.DateTimeFormatOptions = { weekday: "short", year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" };

/** A kept entry's moment, in the reader's own words and time zone: "Tue, 27 Oct 2026, 14:02". */
export function whenText(ts: unknown): string {
	const t = Date.parse(String(ts));
	if (!Number.isFinite(t)) return String(ts);
	return localFormat(MOMENT).format(t);
}

/* ---- cells ---- */

export const textOf = (parts: readonly WordPart[]): string => parts.map((p) => ("md" in p ? plainWords(p.md) : p.text)).join("");
const plainCell = (s: string): Cell => ({ text: s, parts: [{ text: s }] });
const numCell = (n: number, shown: string): Cell => ({ text: shown, parts: [{ text: shown }], num: n });
const partsCell = (parts: WordPart[]): Cell => ({ text: textOf(parts), parts });

/** A question's own answer as a cell, from the file's own lists; null when it holds nothing or is of the wrong shape (it is left out of its row). */
function answerCell(q: Question, v: unknown): Cell | null {
	const w = answerWords(q, v);
	if (!w || "kept" in w) return null;
	if ("list" in w) return { text: w.list.join("; "), parts: [{ text: w.list.join("; ") }], list: w.list };
	const cell = partsCell(w.parts);
	if (q.kind === "number" && typeof v === "number") cell.num = v;
	if (q.kind === "scale" && typeof v === "number") cell.plot = v;
	const items = memberWords(q, v);
	if (items.length > 1) cell.items = items;
	return cell;
}

/** Each member of a multi's or a grid's answer, in plain words. */
function memberWords(q: Question, v: unknown): string[] {
	if (q.kind === "multi" && Array.isArray(v))
		return v.flatMap((x) => {
			if (typeof x === "number") {
				const o = q.options[x - 1];
				return [o ? plainWords(o.text) : `#${x}`];
			}
			return typeof x === "string" && x.trim() ? [x.trim()] : [];
		});
	if (q.kind === "widget" && q.widget && engineOf(q.widget.data) === "grid-select") return gridNames(gridOf(q.widget.data), v).filter((x) => x.trim() !== "");
	return [];
}

/** A question's name: its title (inline Markdown), else its id. */
const titleParts = (q: Question): WordPart[] => [q.title ? { md: q.title } : { text: q.id }];

/** The field of one pick of a question asked for each pick. */
const pickField = (q: Question, p: PickValue): string => `${q.id}\u0001${pickKey(p)}`;

/** The picks a source holds over some records, in the source's own order: its listed options, items or places, then the reader's own, as first seen. */
function picksInOrder(src: Question, records: readonly Record<string, unknown>[]): PickValue[] {
	const seen = new Map<string, PickValue>();
	for (const r of records) for (const p of sourcePicks(src, r[src.id])) if (!seen.has(pickKey(p))) seen.set(pickKey(p), p);
	const all = [...seen.values()];
	const rank = (p: PickValue): number => {
		if (src.kind === "choice" || src.kind === "multi") return typeof p === "number" && src.options[p - 1] ? p - 1 : Infinity;
		const data = src.widget?.data;
		if (!data || typeof p !== "string") return Infinity;
		if (engineOf(data) === "grid-select") {
			const i = gridOf(data).items.findIndex((x) => x.id === p);
			return i < 0 ? Infinity : i;
		}
		const i = regionsOf(data).regions.findIndex((x) => x.id === p);
		return i < 0 ? Infinity : i;
	};
	// a stable sort: the listed ones in list order, the reader's own after them, in the order first seen
	return all.map((p, i) => ({ p, i, r: rank(p) })).sort((a, b) => (a.r === b.r ? a.i - b.i : a.r - b.r)).map((x) => x.p);
}

/* ---- kept entries as rows ---- */

/** The kept entries a query reads: never a draft; newest first; the span of days or the newest N. */
function keptFor(book: Booklet, a: Activity, q: Query, opts: PlanOptions): Entry[] {
	let ents = [...(book.records.entries[a.scope]?.[a.id] ?? [])].sort(newestFirst);
	if (q.days !== null) ents = inSpan(ents, q.days, opts.drawn, opts.now ?? new Date());
	return ents;
}

function entryRows(book: Booklet, a: Activity, qs: readonly Question[], named: readonly Question[], q: Query, opts: PlanOptions): RowSet {
	const ents = a.repeat ? keptFor(book, a, q, opts) : [book.records.answers[a.scope] ?? {}];
	const picks = new Map<string, PickValue[]>();
	for (const x of qs) {
		const src = x.each ? sourceOf(a, x) : null;
		if (src) picks.set(x.id, picksInOrder(src, ents));
	}
	const rows: Row[] = [];
	for (const e of ents) {
		const cells = Object.create(null) as Record<string, Cell>;
		if (a.repeat) cells["date"] = plainCell(whenText(e["ts"]));
		let any = false;
		for (const x of qs) {
			const v = e[x.id];
			const src = x.each ? sourceOf(a, x) : null;
			if (x.each) {
				// one field per pick the source holds in this entry, with that pick's answer; an answer of the wrong shape is left out
				if (!src || shapeIssue(x, v)) continue;
				const plain = plainOf(x);
				for (const { pick: p, pair } of shownPairs(src, e, x)) {
					const c = pair && holdsSomething(pair.a) ? answerCell(plain, pair.a) : null;
					if (!c) continue;
					cells[pickField(x, p)] = c;
					if (named.includes(x)) any = true;
				}
				continue;
			}
			const c = answerCell(x, v);
			if (!c) continue;
			cells[x.id] = c;
			if (named.includes(x)) any = true;
		}
		// with `fields:`, an entry that answers none of the questions named is not shown (and with none named, one that answers nothing)
		if (any) rows.push(a.repeat ? { cells, ts: String(e["ts"]) } : { cells });
	}
	const expand = (k: string): string[] => {
		const ps = picks.get(k);
		const x = qs.find((y) => y.id === k);
		return ps && x ? ps.map((p) => pickField(x, p)) : [k];
	};
	const own = [...(a.repeat ? ["date"] : []), ...qs.flatMap((x) => expand(x.id))];
	const label = (k: string): WordPart[] => {
		if (k === "date") return [{ text: QUERY_WORDS.date }];
		const [qid, pk] = k.split("\u0001");
		const x = qs.find((y) => y.id === qid);
		if (!x) return [{ text: k }];
		if (pk === undefined) return titleParts(x);
		const src = sourceOf(a, x);
		const p = (picks.get(x.id) ?? []).find((y) => pickKey(y) === pk);
		return [...titleParts(x), { text: " · " }, src && p !== undefined ? pickWords(src, p) : { text: pk }];
	};
	return { kind: "entries", rows, own, label, questions: [...qs], expand, valueField: null };
}

/* ---- summaries ---- */

/** A list's members, counted: the listed ones in list order, then the reader's own, as first seen. */
interface Tally {
	order: { key: string; parts: WordPart[] }[];
	counts: Map<string, number>;
	/** How many records answered. */
	answered: number;
}

const newTally = (): Tally => ({ order: [], counts: new Map(), answered: 0 });
function list(t: Tally, key: string, parts: WordPart[]): void {
	if (t.counts.has(key)) return;
	t.order.push({ key, parts });
	t.counts.set(key, 0);
}
/** One record's members, each once. */
function count(t: Tally, members: readonly { key: string; parts: WordPart[] }[]): void {
	const seen = new Set<string>();
	for (const m of members) {
		if (seen.has(m.key)) continue;
		seen.add(m.key);
		list(t, m.key, m.parts);
		t.counts.set(m.key, (t.counts.get(m.key) ?? 0) + 1);
	}
	if (seen.size) t.answered++;
}

/** A choice's or a multi's members, as keys: an option by its position; the reader's own option by its words, matched as section 5 matches them. */
function optionMembers(q: Question, v: unknown): { key: string; parts: WordPart[] }[] {
	const out: { key: string; parts: WordPart[] }[] = [];
	for (const x of Array.isArray(v) ? v : [v]) {
		if (typeof x === "number") {
			const o = q.options[x - 1];
			out.push(o ? { key: `o:${x}`, parts: [{ md: o.text }] } : { key: `#:${x}`, parts: [{ text: `#${x}` }] });
		} else if (typeof x === "string" && x.trim()) {
			// text equal to a listed option (case, and white space at either end, aside) is that option
			const i = q.options.findIndex((o) => sameWords(plainWords(o.text), x));
			out.push(i >= 0 ? { key: `o:${i + 1}`, parts: [{ md: q.options[i]!.text }] } : { key: `w:${x.trim().toLowerCase()}`, parts: [{ text: x.trim() }] });
		}
	}
	return out;
}

/** A grid-select's members: an item by its id; the reader's own words by their words (an item's label among them is that item). */
function gridMembers(g: Grid, v: unknown): { key: string; parts: WordPart[] }[] {
	const out: { key: string; parts: WordPart[] }[] = [];
	for (const x of Array.isArray(v) ? v : []) {
		if (typeof x !== "string" || !x.trim()) continue;
		const item = g.items.find((i) => i.id === x);
		if (item) {
			out.push({ key: `i:${item.id}`, parts: [{ text: item.label }] });
			continue;
		}
		const words = gridLabel(g, x).trim();
		if (!words) continue;
		const named = g.items.find((i) => normWords(i.label) === normWords(words));
		out.push(named ? { key: `i:${named.id}`, parts: [{ text: named.label }] } : { key: `w:${normWords(words)}`, parts: [{ text: words }] });
	}
	return out;
}

/** The parts `a · b · c` with " · " between. */
const joined = (pieces: WordPart[][]): WordPart[] => pieces.flatMap((p, i) => (i ? [{ text: " · " }, ...p] : p));

/** A row's cells: its label, its statistics, and the default `value` and `note`. */
function summaryRow(label: WordPart[], stats: Record<string, Cell>, value: string | null, note: WordPart[] | null): Row {
	const cells = Object.create(null) as Record<string, Cell>;
	cells["label"] = partsCell(label);
	for (const [k, c] of Object.entries(stats)) cells[k] = c;
	if (value !== null && cells[value]) cells["value"] = cells[value]!;
	if (note && note.length) cells["note"] = partsCell(note);
	return { cells };
}

/** How a question is summarised (SPEC section 6): its statistics, by kind. */
type Kind = "numbers" | "options" | "grid" | "other";
function kindOf(q: Question): Kind {
	if (q.kind === "number" || q.kind === "scale") return "numbers";
	if (q.kind === "choice" || q.kind === "multi") return "options";
	if (q.kind === "widget" && q.widget && engineOf(q.widget.data) === "grid-select") return "grid";
	return "other";
}

/**
 * A question's summary rows: one, or for a matrix one for each item, each summarised like a scale (SPEC section 6, "A
 * matrix gives one row per item, each summarised like a scale"). `values` are the answers in their kind's shape.
 */
function summariseAll(q: Question, label: WordPart[], values: readonly unknown[], locale: string): Row[] {
	if (q.kind !== "matrix") return [summarise(q, label, values, locale)];
	return q.items.map((it, i) => summarise({ ...q, kind: "scale" }, [...label, { text: " · " }, { md: it }], itemValues(values, i), locale));
}

/** One item's anchor numbers over a matrix's answers (an item not answered is `null`, which counts for nothing). */
const itemValues = (values: readonly unknown[], i: number): unknown[] => values.map((v) => (Array.isArray(v) ? (v as unknown[])[i] : undefined));

/** A question's answers over the records, summarised as its kind is (one row). `values` are the answers in their kind's shape. */
function summarise(q: Question, label: WordPart[], values: readonly unknown[], locale: string): Row {
	const fmt = (n: number) => formatNumber(n, locale);
	const k = kindOf(q);
	if (k === "numbers") {
		const ns = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
		if (!ns.length) return summaryRow(label, { count: numCell(0, fmt(0)) }, null, null);
		const total = ns.reduce((s, n) => s + n, 0);
		const avg = round1(total / ns.length);
		const lo = minOf(ns);
		const hi = maxOf(ns);
		return summaryRow(
			label,
			{
				count: numCell(ns.length, fmt(ns.length)),
				average: numCell(avg, formatNumber(avg, locale, 1)),
				lowest: numCell(lo, fmt(lo)),
				highest: numCell(hi, fmt(hi)),
				total: numCell(total, fmt(total)),
			},
			"average",
			[{ text: `${QUERY_WORDS.lowest} ${fmt(lo)} · ${QUERY_WORDS.highest} ${fmt(hi)}` }],
		);
	}
	if (k === "options" || k === "grid") {
		const t = tallyOf(q, values);
		if (!t.answered) return summaryRow(label, { count: numCell(0, fmt(0)) }, null, null);
		// the most picked; a tie goes to the earlier in the order (the list, then the reader's own as first seen)
		let most: { key: string; parts: WordPart[] } | null = null;
		for (const m of t.order) if ((t.counts.get(m.key) ?? 0) > (most ? (t.counts.get(most.key) ?? 0) : 0)) most = m;
		const note = joined(t.order.filter((m) => (t.counts.get(m.key) ?? 0) > 0).map((m) => [...m.parts, { text: ` ${fmt(t.counts.get(m.key) ?? 0)}` }]));
		return summaryRow(label, { count: numCell(t.answered, fmt(t.answered)), most: partsCell(most!.parts) }, "most", note);
	}
	const n = values.filter(holdsSomething).length;
	return summaryRow(label, { count: numCell(n, fmt(n)) }, n ? "count" : null, n ? [{ text: QUERY_WORDS.answered }] : null);
}

/** One question's answers over the entries, in one list, each in its kind's shape (a wrong shape is not counted); a question asked for each pick has its answers listed per pick by pickAnswers. */
function answersOf(q: Question, ents: readonly Record<string, unknown>[]): unknown[] {
	return ents.map((e) => e[q.id]).filter((v) => holdsSomething(v) && !shapeIssue(q, v));
}

/** A question asked for each pick: its picks over the entries, in the source's order, each with the answers given for it. */
function pickAnswers(a: Activity, q: Question, ents: readonly Record<string, unknown>[]): { pick: PickValue; parts: WordPart; values: unknown[] }[] {
	const src = sourceOf(a, q);
	if (!src) return [];
	const plain = plainOf(q);
	return picksInOrder(src, ents).map((p) => {
		const values: unknown[] = [];
		for (const e of ents) {
			const v = e[q.id];
			if (shapeIssue(q, v) || !sourcePicks(src, e[src.id]).some((x) => pickKey(x) === pickKey(p))) continue;
			const pair = pairFor(v, p);
			if (pair && holdsSomething(pair.a) && !shapeIssue(plain, pair.a)) values.push(pair.a);
		}
		return { pick: p, parts: pickWords(src, p), values };
	});
}

function summaryRows(a: Activity, qs: readonly Question[], q: Query, ents: readonly Entry[], locale: string): RowSet {
	const fmt = (n: number) => formatNumber(n, locale);
	const want = (id: string) => !q.fields || q.fields.includes(id);
	const rows: Row[] = [];
	if (want("date")) {
		const days = new Set(ents.map((e) => localDayOf(String(e.ts))).filter(Boolean)).size;
		rows.push(
			summaryRow([{ text: QUERY_WORDS.daysLogged }], { count: numCell(ents.length, fmt(ents.length)), days: numCell(days, fmt(days)) }, "days", [{ text: QUERY_WORDS.entries(ents.length, fmt) }]),
		);
	}
	for (const x of qs) {
		if (!want(x.id)) continue;
		if (x.each) {
			// one row per pick, summarised by its own kind
			const plain = plainOf(x);
			for (const p of pickAnswers(a, x, ents)) rows.push(...summariseAll(plain, [...titleParts(x), { text: " · " }, p.parts], p.values, locale));
			continue;
		}
		rows.push(...summariseAll(x, titleParts(x), answersOf(x, ents), locale));
	}
	return summarySet(rows, "label");
}

/** Summary rows as a set: the fields in order, as many as any row has (the `value` field repeats a statistic, so it is no column of its own). */
function summarySet(rows: Row[], labelOf: "label" | "answer"): RowSet {
	const order = ["label", "count", "days", "average", "lowest", "highest", "total", "most", "note"];
	const own = order.filter((k) => rows.some((r) => r.cells[k]));
	const label = (k: string): WordPart[] => [{ text: k === "label" && labelOf === "answer" ? QUERY_WORDS.answer : (QUERY_WORDS.columns[k] ?? k) }];
	return { kind: "summary", rows, own, label, questions: [], expand: (k) => [k], valueField: null };
}

/** One question's answers counted by value: what a summary's most picked and a distribution's rows are read from. */
function tallyOf(q: Question, values: readonly unknown[]): Tally {
	const t = newTally();
	const k = kindOf(q);
	const g = k === "grid" ? gridOf(q.widget!.data) : null;
	const members = (v: unknown): { key: string; parts: WordPart[] }[] => {
		if (g) return gridMembers(g, v);
		if (k === "options") return optionMembers(q, v);
		if (q.kind === "scale" && typeof v === "number") {
			const an = q.anchors.find((x) => x.n === v);
			return [{ key: `n:${v}`, parts: [an ? { md: an.text } : { text: String(v) }] }];
		}
		if (q.kind === "number" && typeof v === "number") return [{ key: `n:${v}`, parts: [{ text: String(v) }] }];
		if (q.kind === "lines" && Array.isArray(v))
			return v.filter((x): x is string => typeof x === "string" && x.trim() !== "").map((x) => ({ key: `w:${x.trim().toLowerCase()}`, parts: [{ text: x.trim() }] }));
		if (q.kind === "widget" && q.widget && engineOf(q.widget.data) === "svg-regions") {
			const rg = regionsOf(q.widget.data);
			return regionSummary(rg, v).map((r) => ({ key: `r:${r.region}`, parts: [{ text: regionLabel(rg, r.region) }] }));
		}
		if (typeof v === "string" && v.trim()) return [{ key: `w:${v.trim().toLowerCase()}`, parts: [{ text: v.trim() }] }];
		return [];
	};
	// the listed options, items or anchors first, in list order, with zeros; any other value as it first appears
	if (g) for (const i of g.items) list(t, `i:${i.id}`, [{ text: i.label }]);
	else if (k === "options") q.options.forEach((o, i) => list(t, `o:${i + 1}`, [{ md: o.text }]));
	else if (q.kind === "scale") for (const an of q.anchors) list(t, `n:${an.n}`, [{ md: an.text }]);
	for (const v of values) count(t, members(v));
	return t;
}

/**
 * One question's distribution: one row per value, its value the count (SPEC section 6, "One question, one distribution").
 * A matrix gives each item's anchors, in list order with zeros, "<item> · <anchor>": the format says a matrix is
 * summarised like a scale for each item, and a distribution is a scale's anchors counted.
 */
function distribution(q: Question, values: readonly unknown[], locale: string, prefix: WordPart[] = []): Row[] {
	if (q.kind === "matrix") return q.items.flatMap((it, i) => distribution({ ...q, kind: "scale" }, itemValues(values, i), locale, [...prefix, { md: it }, { text: " · " }]));
	const fmt = (n: number) => formatNumber(n, locale);
	const t = tallyOf(q, values);
	return t.order.map((m) => {
		const n = t.counts.get(m.key) ?? 0;
		return summaryRow([...prefix, ...m.parts], { count: numCell(n, fmt(n)) }, "count", null);
	});
}

/* ---- the plan ---- */

/** A role's field: the query's key of that name, else the field of the role's own name; a label falls back to the first field when the query gives no `label:`. */
export function rolesOf(set: RowSet, rows: readonly Row[], q: Query, view: ViewName): Record<Role, string | null> {
	const drawn = VIEW_DRAWS[view];
	const has = (k: string | undefined) => !!k && rows.some((r) => (r.cells[k]?.text ?? "") !== "");
	const out = {} as Record<Role, string | null>;
	for (const n of ROLE_NAMES) {
		if (!drawn.includes(n)) {
			out[n] = null;
			continue;
		}
		const want = q.roles[n] ?? (n === "value" && set.valueField ? set.valueField : n);
		out[n] = has(want) ? want : n === "label" && !q.roles.label && has(set.own[0]) ? set.own[0]! : null;
	}
	return out;
}

/** The other fields a view shows (SPEC section 6): a table's columns, a list row's extras, a card's questions or lines. */
export function colsOf(set: RowSet, q: Query, view: ViewName, roles: Record<Role, string | null>): string[] {
	// on a summary, `fields:` picks the rows: a table shows every field, and the other views draw a row by its roles
	if (set.kind === "summary") return view === "table" ? set.own : [];
	// a question asked for each pick, named alone, is a row for each pick holding its label and its value; `fields:` has no other field to pick
	if (set.kind === "picks") return view === "table" ? set.own : [];
	// a field that holds rows is not a column or a line: its rows are drawn as children
	const named = VIEW_DRAWS[view].includes("fields") && q.fields ? (set.kidKeys ? q.fields.filter((k) => !set.kidKeys!.has(k)) : q.fields) : null;
	if (view === "table") return named ? named.flatMap(set.expand) : set.own;
	// the fields that play no role: a list's extras and a data block's card lines (never `id`, the group or the parent)
	const rest = (): string[] => {
		const skip = new Set<string | null>([...ROLE_NAMES.map((n) => roles[n]), q.group, q.parent ?? "parent", "id"]);
		return set.own.filter((k) => !skip.has(k));
	};
	if (view === "list") return named ? named.flatMap(set.expand) : rest();
	if (view === "cards") {
		if (set.kind === "data") return named ?? rest();
		return named ? named.filter((k) => set.questions.some((x) => x.id === k)) : set.questions.map((x) => x.id);
	}
	return [];
}

/**
 * A data block as rows: its declared `fields` (else the first row's keys, less the fields that hold rows) are its columns, in order; a
 * value that is `null` or empty is no cell. Every row at every depth is a row of the set, a row before its children (`all`), found with
 * a stack of its own so that a chain thousands deep is a file that opens. A field holds child rows in the rows where its value is a
 * list of rows or one row, and is a plain value in a row where it is not.
 */
function dataSet(b: DataRows): RowSet {
	const kidKeys = new Set<string>();
	const all: Row[] = [];
	const groupsOf = new Map<Row, { key: string; rows: Row[] }[]>();
	const make = (d: DataRow): { row: Row; data: DataRow } => {
		const cells = Object.create(null) as Record<string, Cell>;
		for (const [k, v] of Object.entries(d)) {
			if (childRowsOf(v)) continue;
			const c = dataCell(v as DataValue | DataValue[]);
			if (c) cells[k] = c;
		}
		return { row: { cells, raw: d, id: pickOfRow(d) }, data: d };
	};
	const top = b.rows.map(make);
	const todo = top.slice().reverse();
	while (todo.length) {
		const { row, data } = todo.pop()!;
		all.push(row);
		const gs: { key: string; rows: Row[]; kids: { row: Row; data: DataRow }[] }[] = [];
		for (const [k, v] of Object.entries(data)) {
			const rs = childRowsOf(v);
			if (!rs) continue;
			kidKeys.add(k);
			const kids = rs.map(make);
			gs.push({ key: k, rows: kids.map((x) => x.row), kids });
		}
		if (!gs.length) continue;
		groupsOf.set(row, gs.map((g) => ({ key: g.key, rows: g.rows })));
		for (let i = gs.length - 1; i >= 0; i--) for (let j = gs[i]!.kids.length - 1; j >= 0; j--) todo.push(gs[i]!.kids[j]!);
	}
	// two rows with one id: the first is used (SPEC section 7), so the later one has no id to be asked a question or edited by
	const ids = new Set<string>();
	for (const r of all) {
		if (r.id === undefined) continue;
		const k = pickKey(r.id);
		if (ids.has(k)) r.id = undefined;
		else ids.add(k);
	}
	const own = (b.fields ? Object.keys(b.fields) : Object.keys(b.rows[0] ?? {})).filter((k) => !kidKeys.has(k));
	const named = (k: string): string => (b.fields && Object.prototype.hasOwnProperty.call(b.fields, k) ? b.fields[k]! : k);
	return { kind: "data", rows: top.map((x) => x.row), own, label: (k) => [{ text: named(k) }], questions: [], expand: (k) => [k], valueField: null, all, groupsOf, kidKeys, edits: b.edits };
}

/** A data value as a cell: plain words, never Markdown; a number carries its number; a list is shown comma-separated and each member can be a pill. */
function dataCell(v: DataValue | DataValue[]): Cell | null {
	if (Array.isArray(v)) {
		const items = v.filter((x) => x !== null && String(x) !== "").map(String);
		return items.length ? { text: items.join(", "), parts: [{ text: items.join(", ") }], items } : null;
	}
	if (v === null || v === "") return null;
	return typeof v === "number" && Number.isFinite(v) ? numCell(v, String(v)) : plainCell(String(v));
}

/**
 * A question asked for each pick, named alone and drawn in any view (SPEC section 6: "one row per pick and value"; the format
 * does not say what the row holds, so this is the plugin's reading): one row for each pick the source
 * holds over the entries read, in the source's order, its label the pick's words and its value the pick's answer, taken
 * from the newest entry that answered it.
 */
function pickRows(a: Activity, x: Question, ents: readonly Record<string, unknown>[]): RowSet {
	const src = sourceOf(a, x);
	const plain = plainOf(x);
	const rows: Row[] = [];
	if (src)
		for (const p of picksInOrder(src, ents)) {
			for (const e of ents) {
				if (shapeIssue(x, e[x.id])) continue;
				const pair = shownPairs(src, e, x).find((sp) => pickKey(sp.pick) === pickKey(p))?.pair;
				const c = pair && holdsSomething(pair.a) ? answerCell(plain, pair.a) : null;
				if (!c) continue;
				const cells = Object.create(null) as Record<string, Cell>;
				cells["label"] = partsCell([pickWords(src, p)]);
				cells["value"] = c;
				rows.push(a.repeat && e["ts"] !== undefined ? { cells, ts: `${e["ts"] as string}` } : { cells });
				break;
			}
		}
	return { kind: "picks", rows, own: ["label", "value"], label: (k) => [{ text: k === "label" ? titleText(x) : QUERY_WORDS.answer }], questions: [x], expand: (k) => [k], valueField: "value" };
}

const titleText = (q: Question): string => (q.title ? plainWords(q.title) : q.id);

/**
 * What a query draws (SPEC section 6): the rows in their groups, the roles, the other fields and what shows when there
 * are none; for a chart, what it plots; for a nested list, its tree.
 */
export function planQuery(book: Booklet, seg: QuerySegment, opts: PlanOptions): QueryPlan {
	const q = seg.query;
	const src = seg.source;
	const locale = opts.locale ?? "en";
	// a query whose source is not found is taken out when the note is read (linkQueries), so this cannot happen; it is for the type checker
	if (!src) throw new Error("planQuery: a query with no source");
	const view: ViewName = q.as ?? (src.kind === "data" || q.summary ? "table" : "cards");
	let set: RowSet;

	if (src.kind === "data") {
		const block = src.block;
		let data: DataRows = block;
		if (block.file) {
			// the rows come from a file beside the note (SPEC section 7): what the view has read of it, or the quiet box that says why not
			const got: { data: DataRows } | { note: string } = block.file.bad
				? { note: DATA_WORDS.refused(block.file.name) }
				: opts.fileRows
					? opts.fileRows(block)
					: { note: DATA_WORDS.failed(block.file.name) };
			if ("note" in got) {
				const none = dataSet({ rows: [], fields: null, edits: {} });
				return { kind: "rows", view, set: none, groups: [], roles: rolesOf(none, [], q, view), cols: [], empty: got.note, quiet: true };
			}
			data = got.data;
		}
		// adds still waiting stand at the end of their parent's rows and removals still waiting are marked (rows-act.ts), for an activity that keeps entries
		const kept = opts.activity && opts.activity.repeat && !opts.activity.daily ? (book.records.entries[opts.activity.scope]?.[opts.activity.id] ?? []) : [];
		const pending = kept.length ? withPending(data.rows, kept) : null;
		set = dataSet(pending && pending.rows !== data.rows ? { ...data, rows: pending.rows } : data);
		if (pending)
			for (const r of set.all ?? set.rows) {
				if (r.raw) r.data = pending.origin.get(r.raw) ?? r.raw;
				if (r.raw && pending.adding.has(r.raw)) r.act = "adding";
				else if (r.id !== undefined) {
					const st = pending.removing.get(idKey(r.id));
					if (st) r.act = st === "waiting" ? "removing" : "refused";
				}
			}
		const plan = finishPlan(set, q, view, locale, askPlan(set, q, view, src.id, opts.activity));
		const acts = plan.kind === "rows" ? rowActs(q, view, set.own, set.edits ?? {}, (k) => textOf(set.label(k)), data.idFormat, data.idPattern) : null;
		if (plan.kind === "rows" && acts) plan.acts = acts;
		return plan;
	}
	const a = src.act;
	const all = questionsOf(a);

	if (src.kind === "question") {
		const one = src.q;
		const ents = keptFor(book, a, q, opts);
		if (q.summary) {
			// one row per value; a question asked for each pick, one row per pick and value
			const rows = one.each
				? pickAnswers(a, one, ents).flatMap((p) => distribution(plainOf(one), p.values, locale, [p.parts, { text: " · " }]))
				: distribution(one, answersOf(one, ents), locale);
			set = summarySet(ents.length ? rows : [], "answer");
		} else if (one.each) {
			// SPEC section 6: a follow-up named alone in `from:` gives one row per pick and value, in every view
			set = pickRows(a, one, a.repeat ? ents : [book.records.answers[a.scope] ?? {}]);
		} else {
			set = entryRows(book, a, [one], [one], q, opts);
			set.valueField = one.each ? null : one.id;
		}
	} else if (q.summary) {
		const ents = keptFor(book, a, q, opts);
		set = summaryRows(a, all, q, ents, locale);
		if (!ents.length) set.rows = [];
	} else {
		const named = q.fields ? all.filter((x) => q.fields!.includes(x.id)) : [];
		set = entryRows(book, a, all, named.length ? named : all, q, opts);
	}
	return finishPlan(set, q, view, locale, null);
}

/**
 * What the reader may do to a data view's rows (SPEC section 5, "A question asked for each row", "Editing a field in place"; section 6,
 * `readonly`). Only `table`, `list` and `cards` have an open part or a column to draw it in. Nothing is asked of a row that has no id,
 * and a question is asked only of rows that carry a field with its id (of every row, when none does).
 */
function askPlan(set: RowSet, q: Query, view: ViewName, blockId: string, act: Activity | undefined): AskPlan | null {
	if (view !== "table" && view !== "list" && view !== "cards") return null;
	const questions = act ? questionsOf(act).filter((x) => x.each === blockId && !sourceOf(act, x)) : [];
	const edits = set.edits ?? {};
	const rows = set.all ?? set.rows;
	const alone = new Map<string, boolean>();
	// no row of the block, at any depth, carries a field with the question's id: then it is asked of every row
	const every = (x: Question): boolean => {
		let v = alone.get(x.id);
		if (v === undefined) {
			v = !rows.some((r) => !!r.raw && carries(r.raw, x.id));
			alone.set(x.id, v);
		}
		return v;
	};
	const columns = new Map<string, Question>();
	for (const k of q.fields ?? []) {
		const x = questions.find((z) => z.id === k);
		if (x) columns.set(k, x);
	}
	// a row still on its way into the data (rows-act.ts) is not asked questions or edited: the data does not hold it yet
	const asked = (x: Question, r: Row): boolean => r.id !== undefined && r.act !== "adding" && !!r.raw && (every(x) || carries(r.raw, x.id));
	return {
		questions,
		columns,
		asked,
		open: (r) => questions.filter((x) => !columns.has(x.id) && asked(x, r)),
		readonly: (k) => isReadonly(q.readonly, k),
		edit: (r, k) => {
			if (r.id === undefined || r.act === "adding" || isReadonly(q.readonly, k)) return null;
			// a field that a question is asked of, in this row, is the question
			if (questions.some((x) => x.id === k && asked(x, r))) return null;
			if (!Object.prototype.hasOwnProperty.call(edits, k)) return null;
			// a list is for appending, not for editing in place; a row that does not carry the field has nothing to edit
			if (!r.raw || heldOf(r.raw, k).shape !== "value") return null;
			return editSpecOf(edits[k]);
		},
	};
}

/** The text of a cell that holds a row's `parent` or `id`, trimmed. */
const keyText = (r: Row, k: string): string => (r.cells[k]?.text ?? "").trim();

/** What nestRows works out: the top rows, each row's children, each row's parent, and every row a row before its children. */
export interface Nested {
	roots: Row[];
	kids: Map<Row, Row[]>;
	up: Map<Row, Row | null>;
	flat: Row[];
}

/**
 * A nested view (booklet.html nestRows): rows whose `parent` is another row's `id` stand under it. The first row with an
 * id is the parent when two share one; a row whose parent is empty or no row of the list is a top row; a cycle is cut at
 * the first row met, which is then a top row; children keep the order of the rows; `limit` counts top rows. `given` is the rows a
 * field holds, each with the row that holds it: such a row stands under that row whatever its own `parent` says.
 */
export function nestRows(rows: readonly Row[], parentKey: string, limit: number | null, given?: ReadonlyMap<Row, Row>): Nested {
	const byId = new Map<string, Row>();
	for (const r of rows) {
		const i = keyText(r, "id");
		if (i && !byId.has(i)) byId.set(i, r);
	}
	const up = new Map<Row, Row | null>();
	for (const r of rows) {
		const p = given && given.has(r) ? given.get(r) : byId.get(keyText(r, parentKey));
		up.set(r, p && p !== r ? p : null);
	}
	const done = new Set<Row>();
	for (const r of rows) {
		const path = new Set<Row>();
		let x: Row | null | undefined = r;
		while (x && !done.has(x)) {
			if (path.has(x)) {
				up.set(x, null);
				break;
			}
			path.add(x);
			x = up.get(x);
		}
		for (const y of path) done.add(y);
	}
	const kids = new Map<Row, Row[]>();
	const roots: Row[] = [];
	for (const r of rows) {
		const p = up.get(r);
		if (p) {
			// push onto the parent's list (copying it for each child made a parent with many children quadratic)
			const list = kids.get(p);
			if (list) list.push(r);
			else kids.set(p, [r]);
		}
		else roots.push(r);
	}
	const top = limit ? roots.slice(0, limit) : roots;
	return { roots: top, kids, up, flat: flatTree(top, kids) };
}

/**
 * A data set's tree, by the one rule for both ways to nest (a row's `parent`, and a field that holds rows): every row at every depth
 * goes through nestRows. Adds each row's children in groups (rows nested by `parent` first, then one group for each field that held
 * rows, headed by that field's label) and the key that remembers a row is open (its `id`, else its place).
 */
function nestData(set: RowSet, pk: string, limit: number | null): Omit<Tree, "more" | "tops" | "asks"> {
	const all = set.all ?? set.rows;
	const groupsOf = set.groupsOf ?? new Map<Row, { key: string; rows: Row[] }[]>();
	const given = new Map<Row, Row>();
	const via = new Map<Row, string>();
	for (const [parent, gs] of groupsOf) for (const g of gs) for (const c of g.rows) {
		given.set(c, parent);
		via.set(c, g.key);
	}
	const t = nestRows(all, pk, limit, given);
	const groups = new Map<Row, KidGroup[]>();
	for (const [parent, list] of t.kids) {
		const by = new Map<string | null, Row[]>();
		for (const c of list) {
			const k = given.get(c) === parent ? (via.get(c) ?? null) : null;
			const a = by.get(k);
			if (a) a.push(c);
			else by.set(k, [c]);
		}
		const out: KidGroup[] = [];
		const flatKids = by.get(null);
		if (flatKids) out.push({ key: null, label: null, rows: flatKids });
		for (const g of groupsOf.get(parent) ?? []) {
			const rs = by.get(g.key);
			if (rs) out.push({ key: g.key, label: set.label(g.key), rows: rs });
		}
		groups.set(parent, out);
	}
	const keyOf = new Map<Row, string>();
	const used = new Set<string>();
	const st: [Row, string][] = t.roots.map((r, i): [Row, string] => [r, `\u0001${i}`]).reverse();
	while (st.length) {
		const [r, path] = st.pop()!;
		const id = keyText(r, "id");
		if (id && !used.has(id)) {
			used.add(id);
			keyOf.set(r, id);
		} else keyOf.set(r, path);
		const gs = groups.get(r) ?? [];
		for (let i = gs.length - 1; i >= 0; i--) for (let j = gs[i]!.rows.length - 1; j >= 0; j--) st.push([gs[i]!.rows[j]!, `${path}\u0001${i}.${j}`]);
	}
	return { roots: t.roots, kids: t.kids, up: t.up, flat: t.flat, groups, keyOf };
}

/** A tree's rows in reading order, each parent before its children: depth first with a stack of its own, so a chain thousands deep is a note that opens, not a stack overflow. */
export function flatTree(roots: readonly Row[], kids: ReadonlyMap<Row, readonly Row[]>): Row[] {
	const flat: Row[] = [];
	for (const r of roots) {
		const st = [r];
		while (st.length) {
			const x = st.pop()!;
			flat.push(x);
			const k = kids.get(x);
			if (k) for (let i = k.length - 1; i >= 0; i--) st.push(k[i]!);
		}
	}
	return flat;
}

/**
 * What a row shows when it opens besides its children (SPEC section 6, "What opens"): every field of that row that plays no role, is
 * not one of the line's fields, is not `id`, the group or the `parent` field, and does not hold child rows, each under its label. The
 * row's own keys count, whether or not `fields` was declared, at every depth; the source's own fields come first, in their order.
 * Only a data block's rows have more to show.
 */
function moreOf(set: RowSet, cols: readonly string[], roles: Record<Role, string | null>, q: Query, gk: string | null, ask: AskPlan | null): (r: Row) => MoreField[] {
	const line = new Set(cols);
	const skip = new Set<string>([...ROLE_NAMES.map((n) => roles[n]).filter((x): x is string => !!x), "id", q.parent ?? "parent", ...(gk ? [gk] : [])]);
	const memo = new Map<Row, MoreField[]>();
	return (r) => {
		if (set.kind !== "data") return [];
		let out = memo.get(r);
		if (!out) {
			out = [];
			// a row's cell exists only for a field it holds as a plain value: a field that holds child rows in this row is no cell
			for (const k of new Set([...set.own, ...Object.keys(r.cells)])) {
				if (line.has(k) || skip.has(k)) continue;
				// a field that a question is asked of, in this row, is drawn as that question (SPEC section 5), not again as a line
				if (ask && ask.questions.some((x) => x.id === k && ask.asked(x, r))) continue;
				const c = r.cells[k];
				if (c && c.text !== "") out.push({ key: k, label: set.label(k), text: c.text });
			}
			memo.set(r, out);
		}
		return out;
	};
}

/** Everything a plan holds after the rows are known: limit, nesting, empty, roles, the other fields, tone and groups; or, for a chart, what it plots. */
function finishPlan(set: RowSet, q: Query, view: ViewName, locale: string, ask: AskPlan | null): QueryPlan {
	let rows = set.rows;
	const chartView = view === "bars" || view === "line";
	const pk = q.parent ?? "parent";
	const drawn = VIEW_DRAWS[view];
	// a table, a list or cards whose rows carry a parent, or hold rows, is nested, and `limit` counts its top rows (kept-entry cards stay dated cards)
	const canNest = drawn.includes("parent") && (view !== "cards" || set.kind === "data");
	const nests = canNest && ((set.groupsOf?.size ?? 0) > 0 || rows.some((r) => keyText(r, pk) !== ""));
	let nested: Omit<Tree, "more" | "tops" | "asks"> | null = nests ? nestData(set, pk, q.limit) : null;
	if (nested) rows = nested.flat;
	else if (q.limit !== null && drawn.includes("limit")) rows = rows.slice(0, q.limit);
	// a chart runs from the oldest to the newest: `limit` kept the newest N of the entries (newest first), and now they are turned round
	if (chartView && set.kind === "entries") rows = [...rows].reverse();
	const roles = rolesOf(set, rows, q, view);
	if (!rows.length) return { kind: "rows", view, set, groups: [], roles, cols: [], empty: q.empty ?? QUERY_WORDS.empty };
	if (chartView) {
		// a line plots the fields `fields:` names (a question asked for each pick is a line for each pick), else the value
		const keys = view === "line" && q.fields ? q.fields.flatMap(set.expand) : [roles.value];
		return { kind: "rows", view, set, groups: [{ name: null, rows }], roles, cols: [], empty: null, chart: { kind: view, keys, locale } };
	}
	const cols = colsOf(set, q, view, roles);
	// a table's tone colours its badge column: a table with no badge column ignores tone
	if (view === "table" && !(roles.badge && cols.includes(roles.badge))) {
		roles.badge = null;
		roles.tone = null;
	}
	const gk = drawn.includes("group") && !nests ? q.group : null;
	const more = moreOf(set, cols, roles, q, gk, ask);
	const asks = (r: Row): Question[] => (ask ? ask.open(r) : []);
	// a name in `fields:` that is a question's id is the question, not a field of the rows (SPEC section 6): its column is headed by the question's title
	if (ask && ask.columns.size) {
		const label = set.label;
		set.label = (k) => {
			const x = ask.columns.get(k);
			return x ? [x.title ? { md: x.title } : { text: x.id }] : label(k);
		};
	}
	// a flat row with more to show than its line opens too: it is drawn by the same tree, with no children
	if (!nested && canNest && set.kind === "data" && rows.some((r) => more(r).length || asks(r).length)) {
		nested = nestData(set, pk, q.limit);
		rows = nested.flat;
	}
	let groups: Group[] = [{ name: null, rows }];
	if (gk) {
		groups = [];
		const at = new Map<string, Group>();
		for (const r of rows) {
			const n = r.cells[gk]?.text ?? "";
			let g = at.get(n);
			if (!g) {
				g = { name: n, rows: [] };
				at.set(n, g);
				groups.push(g);
			}
			g.rows.push(r);
		}
	}
	const plan: QueryPlan = { kind: "rows", view, set, groups, roles, cols, empty: null };
	if (ask) plan.ask = ask;
	if (nested) {
		// the rows of `groups` are every row of the tree, whatever the view draws; the top rows stand in `tops`, grouped when `group:` names a field
		plan.tree = { ...nested, tops: gk ? groups : [{ name: null, rows: nested.roots }], more, asks };
		if (gk) plan.groups = [{ name: null, rows }];
	}
	return plan;
}

/** A tone as written, when it is one of the three; else none. */
export function toneOf(r: Row, roles: Record<Role, string | null>): "good" | "warn" | "bad" | null {
	const t = roles.tone ? (r.cells[roles.tone]?.text ?? "").trim() : "";
	return t === "good" || t === "warn" || t === "bad" ? t : null;
}

/** The pills of a badge: a list's members, else its words. */
export function badgesOf(r: Row, roles: Record<Role, string | null>): string[] {
	const c = roles.badge ? r.cells[roles.badge] : undefined;
	if (!c) return [];
	return (c.items ?? c.list ?? [c.text]).filter((x) => x.trim() !== "");
}

/** A role's words in a row, or "" when the row has none. */
export const roleText = (r: Row, k: string | null): string => (k ? (r.cells[k]?.text ?? "") : "");

/** Where a `link` value leads: a web address, a note (a path to a Markdown file), or nowhere (plain text). */
export function linkOf(target: string): { kind: "web" | "note"; to: string } | null {
	const t = target.trim();
	if (/^https?:\/\/\S+$/i.test(t)) return { kind: "web", to: t };
	if (/^[^#\s][^#]*\.md(#.*)?$/i.test(t)) return { kind: "note", to: t };
	return null;
}
