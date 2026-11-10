/*
 * The acts that add a row to a data block and take one out (SPEC section 5, "Adding and removing rows"), as they are kept: two keys of a
 * `repeat` activity's entry, `$add` and `$delete`, each a list of pairs. A `$` cannot begin a question's or an activity's id, so neither can
 * meet an answer; the entry is written first and never removed, and the data is changed afterwards, once (apply.ts).
 *
 *   { "$add":    [ { "in": <the data block's id>, "pick": <the new row's id>, "under": <the parent's id, left out for a top row>, "row": { …the fields asked for… } } ], "ts": … }
 *   { "$delete": [ { "in": <the data block's id>, "pick": <the removed row's id>, "was": { …the whole row as the data held it, rows under it included… } } ], "ts": … }
 *
 * A pair names its block (`in`), and only that block's views draw it, count it for `{n}` and have it applied; a pair without an `in`, or
 * with one no block carries, is kept as written and read by nothing (contract section 10).
 *
 * What a reader sees of them while the data is not yet changed (`withPending`): an added row is drawn from its entry at the end of its
 * parent's rows, marked "sent, waiting", until the data holds a row with that id, then from the data and never twice; a removed row stays,
 * marked "removing, waiting", until the data no longer holds it, and when it changed since it was drawn it says it was asked to be removed.
 * Plain TypeScript: nothing here imports Obsidian.
 */
import { sameJson } from "./apply";
import { childListKey, childRowsOf, isRowObj, type DataRow, type DataValue } from "./data";
import type { PickValue } from "./each";

/** Ids are compared as text: 5 and "5" are one id (contract section 9, item 5). */
export const idKey = (p: PickValue): string => String(p);
import type { Entry } from "./records";

/** The two keys of an entry that hold these acts. */
export const ADD_KEY = "$add";
export const DELETE_KEY = "$delete";

/** The words beside a row (and beside an edited value) whose kept entry the data has not followed yet: sent, or asked to be removed. */
export const SENT_WAITING = " · sent, waiting";
export const REMOVING_WAITING = "removing, waiting";

/** What a row is going through, drawn beside it: being added, being removed, or a removal the data did not follow. */
export type RowAct = "adding" | "removing" | "refused";

export interface AddPair {
	/** The id of the data block the act is for (contract section 10); an entry without one is read by no block. */
	in: string;
	pick: PickValue;
	under?: PickValue;
	row: Record<string, DataValue>;
}

export interface DeletePair {
	in: string;
	pick: PickValue;
	was: unknown;
}

const isPick = (v: unknown): v is PickValue => (typeof v === "string" && v !== "") || (typeof v === "number" && Number.isFinite(v));
const isValue = (v: unknown): v is DataValue => v === null || typeof v === "string" || typeof v === "number" || typeof v === "boolean";

/** Is this the id of a data block, as an act names it (`in`)? */
const isBlockId = (v: unknown): v is string => typeof v === "string" && v !== "";

/**
 * The `$add` pairs of an entry that are one: an `in` (the data block's id), a `pick`, an `under` that is a pick when it is there, and a
 * `row` of plain values (`id` is never one of them). A pair without an `in` is no act of any block: it is not returned, and the entry is
 * left as written. `loose` returns those too (with `in` empty), for the list of what was kept, which says them in words.
 */
export function addPairs(e: Entry, loose = false): AddPair[] {
	const v = e[ADD_KEY];
	if (!Array.isArray(v)) return [];
	const out: AddPair[] = [];
	for (const x of v as unknown[]) {
		if (!isRowObj(x) || !isPick((x as Record<string, unknown>)["pick"])) continue;
		const o = x as Record<string, unknown>;
		if (!isBlockId(o["in"]) && !loose) continue;
		if (o["under"] !== undefined && !isPick(o["under"])) continue;
		const row: Record<string, DataValue> = {};
		if (isRowObj(o["row"])) for (const [k, val] of Object.entries(o["row"] as Record<string, unknown>)) if (k !== "id" && isValue(val)) row[k] = val;
		out.push({ in: isBlockId(o["in"]) ? o["in"] : "", pick: o["pick"] as PickValue, ...(o["under"] !== undefined ? { under: o["under"] } : {}), row });
	}
	return out;
}

/** The `$delete` pairs of an entry that are one: an `in`, a `pick` and a `was` that is an object (`loose` as for `addPairs`). */
export function deletePairs(e: Entry, loose = false): DeletePair[] {
	const v = e[DELETE_KEY];
	if (!Array.isArray(v)) return [];
	const out: DeletePair[] = [];
	for (const x of v as unknown[]) {
		const o = x as Record<string, unknown> | null;
		if (o && typeof o === "object" && !Array.isArray(o) && isPick(o["pick"]) && o["was"] !== null && typeof o["was"] === "object" && !Array.isArray(o["was"]) && (loose || isBlockId(o["in"]))) out.push({ in: isBlockId(o["in"]) ? o["in"] : "", pick: o["pick"], was: o["was"] });
	}
	return out;
}

/** Is this entry one that adds or removes a row? Such an entry is a moment of its own (write.ts isActEntry). */
export const isRowActEntry = (e: Entry): boolean => Array.isArray(e[ADD_KEY]) || Array.isArray(e[DELETE_KEY]);

/** How many rows stand under a row, at every depth. */
export function rowsUnder(r: DataRow): number {
	let n = 0;
	const todo: DataRow[] = [r];
	while (todo.length) {
		const x = todo.pop()!;
		for (const v of Object.values(x)) {
			const kids = childRowsOf(v);
			if (kids) {
				n += kids.length;
				for (const k of kids) todo.push(k);
			}
		}
	}
	return n;
}

/** The ids of every row at every depth, as keys (`idKey`: text), each with the rows that carry it. */
function indexRows(rows: readonly DataRow[]): Map<string, DataRow[]> {
	const out = new Map<string, DataRow[]>();
	const todo = rows.slice().reverse();
	while (todo.length) {
		const r = todo.pop()!;
		const id = r["id"];
		if (isPick(id)) {
			const k = idKey(id);
			const l = out.get(k);
			if (l) l.push(r);
			else out.set(k, [r]);
		}
		const vs = Object.values(r);
		for (let i = vs.length - 1; i >= 0; i--) {
			const kids = childRowsOf(vs[i]);
			if (kids) for (let j = kids.length - 1; j >= 0; j--) todo.push(kids[j]!);
		}
	}
	return out;
}

/** What is waiting to reach the data: the rows with the added ones put where they will land, which rows are new, and which are going. */
export interface Pending {
	rows: DataRow[];
	/** For a row that was copied to make room for an add, the row as the data holds it: what a removal records as `was`. */
	origin: WeakMap<DataRow, DataRow>;
	/** The rows made from an entry (not in the data yet). */
	adding: WeakSet<DataRow>;
	/** By `idKey` of the row: `waiting` (the data still holds it as it was drawn) or `refused` (it changed since, or is not one row). */
	removing: Map<string, "waiting" | "refused">;
}

/** The moment of an entry in ms, or -Infinity when its `ts` is no time (so it is the oldest). */
export const timeOf = (e: Entry): number => {
	const t = Date.parse(String(e.ts));
	return Number.isFinite(t) ? t : -Infinity;
};

/** An act with its place: the entry's time and position, then adds before removals, then the pair's position in its list. */
type Act = { t: number; i: number; rank: number; j: number } & ({ kind: "add"; p: AddPair } | { kind: "delete"; p: DeletePair });

const inOrder = (a: Act, b: Act): number => a.t - b.t || a.i - b.i || a.rank - b.rank || a.j - b.j;

/** Every add and removal the entries keep for one data block, oldest first (a tie in time goes by the entry's place, then the pair's). */
function actsInOrder(entries: readonly Entry[], block: string): Act[] {
	const acts: Act[] = [];
	entries.forEach((e, i) => {
		const t = timeOf(e);
		addPairs(e).forEach((p, j) => p.in === block && acts.push({ t, i, rank: 0, j, kind: "add", p }));
		deletePairs(e).forEach((p, j) => p.in === block && acts.push({ t, i, rank: 1, j, kind: "delete", p }));
	});
	return acts.sort(inOrder);
}

/** The newest act on each pick of one block, in the order the picks were first acted on. */
function newestActs(entries: readonly Entry[], block: string): Act[] {
	const newest = new Map<string, Act>();
	for (const a of actsInOrder(entries, block)) newest.set(idKey(a.p.pick), a);
	return [...newest.values()];
}

/**
 * The data's rows with the adds still waiting put in, and the removals still waiting marked. The newest act on a pick decides: an add
 * whose pick the data does not hold is waiting (drawn at the end of its parent's rows when the parent is there and holds a list of rows,
 * or of the top rows); an add whose pick the data holds is drawn from the data; a removal whose pick the data holds is waiting when the
 * row is still what the reader saw, and refused when it is not; a removal whose pick is gone is done. The rows given are not changed:
 * when an add is drawn, the rows are copied.
 */
export function withPending(rows: DataRow[], entries: readonly Entry[], block: string): Pending {
	const out: Pending = { rows, origin: new WeakMap(), adding: new WeakSet(), removing: new Map() };
	const newest = newestActs(entries, block);
	if (!newest.length) return out;
	const held = indexRows(rows);
	const adds: Act[] = [];
	for (const a of newest) {
		const key = idKey(a.p.pick);
		const have = held.get(key);
		if (a.kind === "add") {
			if (!have) adds.push(a);
		} else if (have) out.removing.set(key, have.length === 1 && sameJson(have[0], a.p.was) ? "waiting" : "refused");
	}
	if (!adds.length) return out;
	adds.sort(inOrder);

	// copy the rows (each row and each list of rows it holds), so the added ones stand where they will land and the data is not touched
	const copies = new Map<string, DataRow[]>();
	const copy = (r: DataRow): DataRow => {
		const c = { ...r };
		out.origin.set(c, r);
		return c;
	};
	const top = rows.map(copy);
	const todo = top.slice().reverse();
	while (todo.length) {
		const c = todo.pop()!;
		const id = c["id"];
		if (isPick(id)) {
			const l = copies.get(idKey(id));
			if (l) l.push(c);
			else copies.set(idKey(id), [c]);
		}
		for (const [k, v] of Object.entries(c)) {
			if (Array.isArray(v) && v.every(isRowObj)) {
				const list = v.map(copy);
				c[k] = list;
				for (let i = list.length - 1; i >= 0; i--) todo.push(list[i]!);
			} else if (isRowObj(v)) {
				const one = copy(v);
				c[k] = one;
				todo.push(one);
			}
		}
	}
	for (const a of adds) {
		const p = a.p as AddPair;
		const made: DataRow = { id: p.pick, ...p.row };
		if (p.under === undefined) {
			top.push(made);
			out.adding.add(made);
			continue;
		}
		const parents = copies.get(idKey(p.under));
		const key = parents && parents.length === 1 ? childListKey(parents[0]!) : null;
		if (!parents || key === null) continue;
		(parents[0]![key] as DataRow[]).push(made);
		out.adding.add(made);
	}
	out.rows = top;
	return out;
}

/**
 * The id of every row of the data at every depth, and of every add still waiting (whether or not it can be drawn yet): what the id of a new
 * row is made against, so that a number counts past the adds on their way and no id is made twice.
 */
export function rowIds(rows: readonly DataRow[], entries: readonly Entry[], block: string): PickValue[] {
	const held = indexRows(rows);
	const out: PickValue[] = [];
	const todo = rows.slice().reverse();
	while (todo.length) {
		const r = todo.pop()!;
		if (isPick(r["id"])) out.push(r["id"]);
		const vs = Object.values(r);
		for (let i = vs.length - 1; i >= 0; i--) {
			const kids = childRowsOf(vs[i]);
			if (kids) for (let j = kids.length - 1; j >= 0; j--) todo.push(kids[j]!);
		}
	}
	const waiting = new Set<string>();
	for (const a of newestActs(entries, block)) if (a.kind === "add" && !held.has(idKey(a.p.pick)) && !waiting.has(idKey(a.p.pick))) {
		waiting.add(idKey(a.p.pick));
		out.push(a.p.pick);
	}
	return out;
}
