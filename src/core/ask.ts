/*
 * Acts on the rows of a data block (format 0.19; SPEC section 5, "A question asked for each row" and "Editing a field in place", and
 * section 6, `readonly`): which rows a question is asked of, what it starts from, whether an answer replaces a value or adds an item,
 * how a field marked `edit` is read, and what a reader sees of an act after the data is read again (the display states). The
 * drawing is in the views (row-ask.ts, query-view.ts); the writing is in write.ts. Plain TypeScript: nothing here imports Obsidian.
 *
 * An act is one pair, `{ "pick": <the row's id>, "a": <the value>, "was": <the data's value when the reader began> }`, in a kept
 * entry of the activity that holds the query, keyed by the question's id or the field's name. `was` is written for an act that
 * replaces a value (an in-place question, an edited field) and for no other.
 */
import { childRowsOf, isRowObj, ownValue, type DataRow, type FieldEdit } from "./data";
import { plainWords, sameWords } from "./earlier";
import type { PickValue } from "./each";
import type { Query, Question } from "./reader";
import type { Entry } from "./records";
import { parseIdFormat, patternOf, ID_WORDS } from "./row-id";

/** The kinds of box an `edit` mark asks for (SPEC section 7's table). */
export type EditKind = "text" | "long" | "number" | "date" | "choice";

export interface EditSpec {
	kind: EditKind;
	/** A choice's words to pick from, in order; empty for every other kind. */
	options: string[];
}

const EDIT_KINDS: readonly string[] = ["text", "long", "number", "date", "choice"];

/**
 * What a field's label object asks for, or null when the field is read-only: it has no `edit`, its `edit` is not one of the five
 * kinds, or it is a `choice` with no `options` to pick from (`options` is required for a choice and not used by the others).
 */
export function editSpecOf(e: FieldEdit | undefined): EditSpec | null {
	if (!e || typeof e.edit !== "string" || !EDIT_KINDS.includes(e.edit)) return null;
	const kind = e.edit as EditKind;
	if (kind !== "choice") return { kind, options: [] };
	const options = Array.isArray(e.options) ? e.options.filter((x): x is string => typeof x === "string" && x.trim() !== "") : [];
	return options.length ? { kind, options } : null;
}

/** Is this field read-only in a view whose query says `ro` (SPEC section 6): bare `readonly` locks every field, `readonly: a, b` those. */
export function isReadonly(ro: Query["readonly"], key: string): boolean {
	return ro === true || (Array.isArray(ro) && ro.includes(key));
}

/** A row's id as its pairs name it (a string or a number, exactly as written), or undefined when it has none. */
export function pickOfRow(raw: DataRow): PickValue | undefined {
	const v = ownValue(raw, "id");
	if (typeof v === "number" && Number.isFinite(v)) return v;
	return typeof v === "string" && v.trim() !== "" ? v : undefined;
}

/** Does the row carry a field with this name as a value or a list of values (a field that holds child rows is not one)? */
export function carries(raw: DataRow, key: string): boolean {
	const v = ownValue(raw, key);
	return v !== undefined && !childRowsOf(v);
}

/** What a field holds, for a question that starts from it: a value (replaced in place), a list (added to), or nothing at all (added to). */
export type Held = { shape: "value"; value: string | number | boolean | null } | { shape: "list"; items: string[] } | { shape: "none" };

export function heldOf(raw: DataRow, key: string): Held {
	const v = ownValue(raw, key);
	if (v === undefined || childRowsOf(v)) return { shape: "none" };
	if (Array.isArray(v)) return { shape: "list", items: v.filter((x): x is string | number | boolean => x !== null && typeof x !== "object" && String(x).trim() !== "").map(String) };
	if (isRowObj(v)) return { shape: "none" };
	return { shape: "value", value: v };
}

/** Two values of a field are the same: nothing (null, absent, blank) is nothing; a number is its digits; words are compared with the spaces at either end off. */
export function sameValue(a: unknown, b: unknown): boolean {
	const x = text(a);
	const y = text(b);
	if (x === "" || y === "") return x === y;
	if (typeof a === "number" || typeof b === "number") {
		const n = Number(x);
		const m = Number(y);
		if (Number.isFinite(n) && Number.isFinite(m)) return n === m;
	}
	return x === y;
}

function text(v: unknown): string {
	if (v === null || v === undefined) return "";
	if (typeof v === "string") return v.trim();
	if (typeof v === "number" || typeof v === "boolean") return String(v);
	return JSON.stringify(v);
}

/** Two values as an own option is compared with a listed one: ignoring case, and the spaces at either end (a choice or a multi question). */
export const sameOption = (a: unknown, b: unknown): boolean => {
	const x = text(a);
	const y = text(b);
	return x === "" || y === "" ? x === y : sameWords(x, y);
};

/** The words a field holds as the question compares and shows them: a number or a boolean as written, nothing as "". */
export const valueText = (v: unknown): string => (typeof v === "string" ? v : text(v));

/* ---- what a question starts from, and what an answer is as the data holds it ---- */

/**
 * The answer a question starts from when its field holds a value (SPEC section 5, the part on what the answer starts from): a text or a date the
 * value as words, a number the value as a number, a choice the option whose words match (compared as an own option is, ignoring case and
 * the spaces at either end; none matches: nothing picked), a multi the same as a list of one. A kind that has no value to start from
 * (a scale, a matrix, a lines question, a widget) starts empty.
 */
export function startOf(q: Question, value: unknown): unknown {
	const w = text(value);
	if (w === "") return undefined;
	switch (q.kind) {
		case "text":
		case "date":
			return w;
		case "number": {
			const n = Number(w);
			return Number.isFinite(n) ? n : undefined;
		}
		case "choice":
		case "multi": {
			const at = q.options.findIndex((o) => sameWords(plainWords(o.text), w));
			if (at < 0) return undefined;
			return q.kind === "choice" ? at + 1 : [at + 1];
		}
		default:
			return undefined;
	}
}

/**
 * An answer put back as the data holds a value, to compare it with the data's value: a choice's position is its option's words (the
 * reader's own option as written), a multi's list the words joined, a number or a text as it is.
 */
export function asValue(q: Question, a: unknown): unknown {
	const word = (x: unknown): string => (typeof x === "number" ? (q.options[x - 1] ? plainWords(q.options[x - 1]!.text) : `#${x}`) : String(x));
	if (q.kind === "choice") return typeof a === "number" || typeof a === "string" ? word(a) : a;
	if (q.kind === "multi" && Array.isArray(a)) return a.map(word).join(", ");
	if (Array.isArray(a)) return a.map(String).join(", ");
	return a;
}

/* ---- the kept acts ---- */

/** A kept act on one row: its entry's time, the value sent, and the data's value when it began (`was`, when the pair has the key). */
export interface Sent {
	ts: string;
	a: unknown;
	was: unknown;
	hasWas: boolean;
}

const timeOf = (e: Entry): number => {
	const t = Date.parse(String(e.ts));
	return Number.isFinite(t) ? t : -Infinity;
};

/** Is this a pair `{ pick, a }` (other keys are kept and allowed)? */
const pairOf = (x: unknown): x is { pick: PickValue; a: unknown } & Record<string, unknown> =>
	isRowObj(x) && (typeof x["pick"] === "number" || typeof x["pick"] === "string") && Object.prototype.hasOwnProperty.call(x, "a");

/** The pairs of one act key that name this row, in the entry's order. */
export function pairsFor(e: Entry, key: string, pick: PickValue): (Record<string, unknown> & { pick: PickValue; a: unknown })[] {
	const v = e[key];
	return Array.isArray(v) ? v.filter((x) => pairOf(x) && x.pick === pick).map((x) => x as Record<string, unknown> & { pick: PickValue; a: unknown }) : [];
}

/** The newest act kept on this row under this key (the entry with the latest `ts`; a later pair of the same entry wins), or null. */
export function newestSent(entries: readonly Entry[], key: string, pick: PickValue): Sent | null {
	let best: { e: Entry; t: number; i: number } | null = null;
	entries.forEach((e, i) => {
		if (!pairsFor(e, key, pick).length) return;
		const t = timeOf(e);
		if (!best || t > best.t || (t === best.t && i > best.i)) best = { e, t, i };
	});
	if (!best) return null;
	const found = best as { e: Entry };
	const p = pairsFor(found.e, key, pick).pop()!;
	return { ts: String(found.e.ts), a: p.a, was: p["was"], hasWas: Object.prototype.hasOwnProperty.call(p, "was") };
}

/** What the reader sees of an act, from the newest kept one and the data's value now (SPEC section 5's table). */
export type Shows =
	| { state: "none" }
	| { state: "same"; sent: Sent }
	| { state: "waiting"; sent: Sent }
	| { state: "changed"; sent: Sent };

/**
 * The display state of a value that was replaced: the data's value now equals what was sent (nothing marked), or equals `was` (what was
 * sent, marked as waiting), or is anything else (the value now, with what was sent beneath: also what a refused act looks like).
 * `sentValue` is what was sent as the data holds a value (asValue).
 */
export function showsOf(sent: Sent | null, sentValue: unknown, now: unknown, eq: (a: unknown, b: unknown) => boolean = sameValue): Shows {
	if (!sent) return { state: "none" };
	if (eq(sentValue, now)) return { state: "same", sent };
	if (eq(sent.was, now)) return { state: "waiting", sent };
	return { state: "changed", sent };
}

/** The answers kept on a row for an adding question, newest first (a later pair of an entry is newer): the entry's time and the answer of each of its pairs for this row. */
export function keptAdds(entries: readonly Entry[], key: string, pick: PickValue): { ts: string; a: unknown }[] {
	const out: { ts: string; a: unknown; t: number; i: number }[] = [];
	entries.forEach((e, i) => {
		for (const p of pairsFor(e, key, pick).reverse()) out.push({ ts: String(e.ts), a: p.a, t: timeOf(e), i });
	});
	return out.sort((x, y) => y.t - x.t || y.i - x.i).map(({ ts, a }) => ({ ts, a }));
}

/* ---- adding and removing rows (rows-act.ts) ---- */

/** A field the form for a new row asks for: a field of the block marked `edit`, with its label and the box its kind asks for. */
export interface AddField {
	key: string;
	label: string;
	spec: EditSpec;
}

/**
 * What a query that says `add` or `delete` offers on a data block's rows (SPEC section 6): the controls the query asks for, and what the
 * form for a new row asks. The activity decides whether an act can be kept (it must repeat); that is the view's.
 */
export interface RowActs {
	/** "Add a row" (a top row) and "Add under this row" (a child row) are asked for. */
	add: boolean;
	/** "Remove" on each row is asked for. */
	remove: boolean;
	/** In words, why no row can be added here: the block's `idFormat` or `idPattern` is not valid. Null when it is. */
	idProblem: string | null;
	/** One box for each field the block marks `edit` that the query does not lock, in the block's declared order. */
	fields: AddField[];
	/** The block's `idFormat` as written (a string when valid), else undefined: the id is made from it. With none, the form has an id box. */
	idFormat: unknown;
	idPattern: unknown;
}

/**
 * The acts a query offers on a data block's rows, or null: only `table`, `list` and `cards` draw rows that open or carry a control; a bare
 * `readonly` locks both keys (`readonly: a, b`, a list of fields, does not); a query that says neither offers nothing.
 */
export function rowActs(q: Query, view: string, own: readonly string[], edits: Record<string, FieldEdit>, label: (key: string) => string, idFormat: unknown, idPattern: unknown): RowActs | null {
	if (view !== "table" && view !== "list" && view !== "cards") return null;
	const locked = q.readonly === true;
	const add = q.add && !locked;
	const remove = q.delete && !locked;
	if (!add && !remove) return null;
	const fields: AddField[] = [];
	for (const key of own) {
		if (key === "id" || isReadonly(q.readonly, key)) continue;
		const spec = Object.prototype.hasOwnProperty.call(edits, key) ? editSpecOf(edits[key]) : null;
		if (spec) fields.push({ key, label: label(key), spec });
	}
	let idProblem: string | null = null;
	if (idFormat !== undefined) {
		if (!parseIdFormat(idFormat).ok) idProblem = ID_WORDS.formatBad;
	} else if (!patternOf(idPattern).ok) idProblem = ID_WORDS.patternBad;
	return { add, remove, idProblem, fields, idFormat, idPattern };
}
