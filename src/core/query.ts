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
import type { DataValue } from "./data";
import type { Activity, Booklet, DataBlock, Query, QuerySegment, Question, Role, ViewName } from "./reader";
import { ROLE_NAMES, questionsOf } from "./reader";
import type { Entry } from "./records";
import { holdsSomething, shapeIssue } from "./shape";
import { engineOf, gridLabel, gridNames, gridOf, normWords, regionLabel, regionsOf, regionSummary, type Grid } from "./widgets";
import { answerWords, type WordPart } from "./words";
import { localDayOf } from "./write";

/** Which keys each view reads (SPEC section 6's table of views). */
export const VIEW_DRAWS: Record<ViewName, readonly string[]> = {
	cards: ["label", "value", "note", "badge", "tone", "fields", "group", "limit", "link", "icon"],
	table: ["fields", "group", "limit", "badge", "tone", "link", "icon"],
	list: ["label", "value", "note", "badge", "tone", "fields", "group", "limit", "parent", "link", "icon"],
	tiles: ["label", "value", "note", "tone", "group", "limit", "link", "icon"],
	bars: ["label", "value", "tone", "limit"],
	line: ["label", "value", "fields", "limit"],
};

/** The views this plugin draws: all six of the format's (SPEC section 6). */
export type DrawnView = ViewName;

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
		nothing: "Nothing matches.",
		shown: (n: number, of: number) => `${n} of ${of} shown`,
		count: (n: number) => (n === 1 ? "1 row" : `${n} rows`),
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
}

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

/** A nested list (SPEC section 6, "parent:"): rows with a `parent` that is another row's `id` stand under it. */
export interface Tree {
	/** The top rows, in order. */
	roots: Row[];
	/** Each row's children, in order. */
	kids: Map<Row, Row[]>;
	/** Each row's parent row, or null for a top row. */
	up: Map<Row, Row | null>;
}

export type QueryPlan =
	| { kind: "not-yet"; text: string }
	| {
			kind: "rows";
			view: DrawnView;
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
			/** For a nested `list`: the tree the rows stand in (the rows are in the order the tree is drawn). */
			tree?: Tree;
	  };

export interface PlanOptions {
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

/** A kept entry's moment, in the reader's own words and time zone: "Tue, 27 Oct 2026, 14:02". */
export function whenText(ts: unknown): string {
	const t = Date.parse(String(ts));
	if (!Number.isFinite(t)) return String(ts);
	return new Date(t).toLocaleString(undefined, { weekday: "short", year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
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
const itemValues = (values: readonly unknown[], i: number): unknown[] => values.map((v) => (Array.isArray(v) ? v[i] : undefined));

/** A question's answers over the records, summarised as its kind is (one row). `values` are the answers in their kind's shape. */
function summarise(q: Question, label: WordPart[], values: readonly unknown[], locale: string): Row {
	const fmt = (n: number) => formatNumber(n, locale);
	const k = kindOf(q);
	if (k === "numbers") {
		const ns = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
		if (!ns.length) return summaryRow(label, { count: numCell(0, fmt(0)) }, null, null);
		const total = ns.reduce((s, n) => s + n, 0);
		const avg = round1(total / ns.length);
		const lo = Math.min(...ns);
		const hi = Math.max(...ns);
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
	const named = VIEW_DRAWS[view].includes("fields") ? q.fields : null;
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

/** What a query without a source says (a query whose source is not found is taken out when the note is read, so this is a guard). */
const NO_SOURCE = "Not drawn: this query names nothing it can read.";

/** A data block as rows: its declared `fields` (else the first row's keys) are its columns, in order; a value that is `null` or empty is no cell. */
function dataSet(b: DataBlock): RowSet {
	const own = b.fields ? Object.keys(b.fields) : Object.keys(b.rows[0] ?? {});
	const rows: Row[] = b.rows.map((r) => {
		const cells = Object.create(null) as Record<string, Cell>;
		for (const [k, v] of Object.entries(r)) {
			const c = dataCell(v);
			if (c) cells[k] = c;
		}
		return { cells };
	});
	const named = (k: string): string => (b.fields && Object.prototype.hasOwnProperty.call(b.fields, k) ? b.fields[k]! : k);
	return { kind: "data", rows, own, label: (k) => [{ text: named(k) }], questions: [], expand: (k) => [k], valueField: null };
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
 * A question asked for each pick, named alone and drawn as tiles, bars or a line (SPEC section 6: "one row per pick and
 * value"; the format does not say what the row holds, so this is the plugin's reading): one row for each pick the source
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
				rows.push(a.repeat && e["ts"] !== undefined ? { cells, ts: String(e["ts"]) } : { cells });
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
	if (!src) return { kind: "not-yet", text: NO_SOURCE };
	const view: DrawnView = q.as ?? (src.kind === "data" || q.summary ? "table" : "cards");
	let set: RowSet;

	if (src.kind === "data") {
		set = dataSet(src.block);
		return finishPlan(set, q, view, locale);
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
		} else if (one.each && (view === "tiles" || view === "bars" || view === "line")) {
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
	return finishPlan(set, q, view, locale);
}

/** The text of a cell that holds a row's `parent` or `id`, trimmed. */
const keyText = (r: Row, k: string): string => (r.cells[k]?.text ?? "").trim();

/**
 * A nested list (booklet.html nestRows): rows whose `parent` is another row's `id` stand under it. The first row with an
 * id is the parent when two share one; a row whose parent is empty or no row of the list is a top row; a cycle is cut at
 * the first row met, which is then a top row; children keep the order of the rows; `limit` counts top rows.
 */
export function nestRows(rows: readonly Row[], parentKey: string, limit: number | null): Tree & { flat: Row[] } {
	const byId = new Map<string, Row>();
	for (const r of rows) {
		const i = keyText(r, "id");
		if (i && !byId.has(i)) byId.set(i, r);
	}
	const up = new Map<Row, Row | null>();
	for (const r of rows) {
		const p = byId.get(keyText(r, parentKey));
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
		if (p) kids.set(p, [...(kids.get(p) ?? []), r]);
		else roots.push(r);
	}
	const top = limit ? roots.slice(0, limit) : roots;
	const flat: Row[] = [];
	// depth first with a stack of its own: a chain thousands deep is a note that opens, not a stack overflow
	for (const r of top) {
		const st = [r];
		while (st.length) {
			const x = st.pop()!;
			flat.push(x);
			const k = kids.get(x);
			if (k) for (let i = k.length - 1; i >= 0; i--) st.push(k[i]!);
		}
	}
	return { roots: top, kids, up, flat };
}

/** Everything a plan holds after the rows are known: limit, nesting, empty, roles, the other fields, tone and groups; or, for a chart, what it plots. */
function finishPlan(set: RowSet, q: Query, view: DrawnView, locale: string): QueryPlan {
	let rows = set.rows;
	const chartView = view === "bars" || view === "line";
	const pk = q.parent ?? "parent";
	// a list whose rows carry a parent is nested, and `limit` counts its top rows
	const nested = view === "list" && rows.some((r) => keyText(r, pk) !== "") ? nestRows(rows, pk, q.limit) : null;
	if (nested) rows = nested.flat;
	else if (q.limit !== null && VIEW_DRAWS[view].includes("limit")) rows = rows.slice(0, q.limit);
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
	let groups: Group[] = [{ name: null, rows }];
	const gk = VIEW_DRAWS[view].includes("group") && !nested ? q.group : null;
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
	if (nested) plan.tree = { roots: nested.roots, kids: nested.kids, up: nested.up };
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
