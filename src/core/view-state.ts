/*
 * The reader's own sorting and filtering of a query's rows (SPEC section 6, "Sorting and filtering are the reader's"): a
 * renderer may let the reader sort and filter the rows of any view on screen, the same control on every view, and a line
 * chart keeps its order. It is kept for as long as the pane is open and saved nowhere; a file never states it. Here is the
 * state, and the rows it leaves (booklet.html's viewNodes pipeline: filter, then sort, then group, after `limit`). The
 * control and the drawing are in the view. Plain TypeScript: nothing here imports Obsidian.
 */
import { CONTROLS_MIN, QUERY_WORDS, flatTree, numberOf, textOf, type Cell, type Group, type QueryPlan, type Row, type Tree } from "./query";

type Plan = Extract<QueryPlan, { kind: "rows" }>;

/** What the reader has done to one query's view: the control open, the words searched, the field sorted by and which way, and the parents opened in a nested list (their `id`s). */
export interface QueryViewState {
	open: boolean;
	q: string;
	key: string | null;
	dir: 1 | -1;
	opens: Set<string>;
}

export const newViewState = (): QueryViewState => ({ open: false, q: "", key: null, dir: 1, opens: new Set() });

/** The rows a plan draws, counting a nested list's children. */
export const rowCount = (p: Plan): number => p.groups.reduce((n, g) => n + g.rows.length, 0);

/** Does the reader get the control: a view with rows (none: the query's own `empty:` shows) and at least nine of them. */
export const wantsControls = (p: QueryPlan): p is Plan => p.kind === "rows" && p.empty === null && rowCount(p) >= CONTROLS_MIN;

const uniq = <T>(a: readonly (T | null | undefined)[]): T[] => a.filter((x, i): x is T => !!x && a.indexOf(x) === i);

/** The fields a search reads: what the view shows (a role's field, and the other fields it draws), and the date of a kept entry. */
export function shownKeys(p: Plan): string[] {
	const { roles, set } = p;
	return uniq([p.view === "cards" && set.kind === "entries" ? "date" : null, roles.badge, roles.label, roles.value, roles.note, roles.tone, ...p.cols.flatMap(set.expand), ...(p.chart ? p.chart.keys : [])]);
}

/** The fields the reader may sort by, in the order the menu lists them; a line chart keeps its order, so none. */
export function sortKeys(p: Plan): { key: string; label: string }[] {
	if (p.view === "line") return [];
	const { roles, set } = p;
	const keys = uniq([set.kind === "entries" ? "date" : null, roles.label, roles.value, ...p.cols.flatMap(set.expand)]);
	return keys.map((key) => ({ key, label: key === "date" ? QUERY_WORDS.controls.date : textOf(set.label(key)) }));
}

/** A row's value to sort by, or undefined when it has none: a date by its time, a number as a number, anything else as its words. */
function sortValue(r: Row, k: string): number | string | undefined {
	if (k === "date" && r.ts !== undefined) {
		const t = Date.parse(r.ts);
		return Number.isFinite(t) ? t : r.ts;
	}
	const c: Cell | undefined = r.cells[k];
	if (!c) return undefined;
	const n = numberOf(c);
	if (n !== undefined) return n;
	return c.text === "" ? undefined : c.text;
}

/** Two values: numbers as numbers, anything else as words (numbers inside them by value, case and accents aside). */
function compare(a: number | string, b: number | string): number {
	if (typeof a === "number" && typeof b === "number") return a - b;
	return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
}

/** The rows in the reader's order: a row with no value sorts last whichever way, and rows that tie keep the order they came in. */
export function sortRows(rows: readonly Row[], key: string, dir: 1 | -1): Row[] {
	return rows
		.map((r, i) => ({ r, i, v: sortValue(r, key) }))
		.sort((x, y) => {
			if (x.v === undefined || y.v === undefined) return (x.v === undefined && y.v === undefined ? 0 : x.v === undefined ? 1 : -1) || x.i - y.i;
			return compare(x.v, y.v) * dir || x.i - y.i;
		})
		.map((x) => x.r);
}

export interface Shown {
	/** The plan with the rows the reader's filter and sort leave. */
	plan: Plan;
	/** How many rows match the search, and how many the view has. */
	shown: number;
	total: number;
	/** The search is on. */
	filtering: boolean;
	/** In a nested list while a search is on: the parents of a match, which stand open so the match shows. */
	force: ReadonlySet<Row>;
}

/** The plan as the reader has asked to see it: filtered, then sorted inside each group (a nested list: among each parent's children, a match kept with its parents). */
export function applyViewState(p: Plan, st: QueryViewState): Shown {
	const total = rowCount(p);
	const needle = st.q.trim().toLowerCase();
	const filtering = needle !== "";
	const keys = shownKeys(p);
	const sorts = sortKeys(p);
	if (st.key !== null && !sorts.some((s) => s.key === st.key)) {
		st.key = null;
		st.dir = 1;
	}
	const passes = (r: Row): boolean => keys.some((k) => (r.cells[k]?.text ?? "").toLowerCase().includes(needle));
	const order = (rows: readonly Row[]): Row[] => (st.key !== null ? sortRows(rows, st.key, st.dir) : [...rows]);
	const force = new Set<Row>();
	if (p.tree) {
		const all = p.groups.flatMap((g) => g.rows);
		const match = filtering ? all.filter(passes) : all;
		const keep = filtering ? new Set(match) : null;
		if (keep) for (const r of match) for (let a = p.tree.up.get(r); a && !force.has(a); a = p.tree.up.get(a)) {
			force.add(a);
			keep.add(a);
		}
		const among = (list: readonly Row[]): Row[] => order(keep ? list.filter((r) => keep.has(r)) : list);
		const kids = new Map<Row, Row[]>();
		for (const [parent, list] of p.tree.kids) {
			const b = among(list);
			if (b.length) kids.set(parent, b);
		}
		const roots = among(p.tree.roots);
		const tree: Tree = { roots, kids, up: p.tree.up };
		const flat = flatTree(roots, kids);
		return { plan: { ...p, groups: flat.length ? [{ name: null, rows: flat }] : [], tree }, shown: match.length, total, filtering, force };
	}
	const groups: Group[] = p.groups
		.map((g) => ({ name: g.name, rows: order(filtering ? g.rows.filter(passes) : g.rows) }))
		.filter((g) => g.rows.length);
	return { plan: { ...p, groups }, shown: groups.reduce((n, g) => n + g.rows.length, 0), total, filtering, force };
}
