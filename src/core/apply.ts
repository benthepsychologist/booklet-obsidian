/*
 * Applying one kept act to a data block's JSON text (docs/hosting.md, "Applying a reader's acts"): the text is a data file's, or the text
 * between a data block's fences in the note itself (`applyInFence`), and the same functions work on both. Every change is made to the one
 * place it is about and nowhere else: every other byte (its spacing, its key order, the other rows, its line endings, a byte order mark
 * at the start) comes back exactly as it was (SPEC section 8: no normalizing).
 *
 * In place (`applyAct`): an act is `{ pick, a, was }` for a field, and it sets that field of the row whose `id` is the pick to `a`, only
 * if the data still holds `was`. A pick that names no row or more than one row, the field `id` (it is the row's identity: changing it
 * would orphan every act that names the old one), a row that does not carry the field, and a value that is no longer `was` write nothing.
 *
 * Adding (`applyAdd`): `{ pick, under?, row }` puts a row, with `id` first and then the fields of `row`, at the end of a list of rows:
 * the block's own, or the one list of rows the row `under` holds. A row with that id already there is not added again ("same") if it holds every field of `row`; otherwise it is a "clash".
 * Removing (`applyDelete`): `{ pick, was }` takes the row whose `id` is the pick (and the rows under it) out, only if it is still `was`.
 * Plain TypeScript: nothing here imports Obsidian.
 */
import { pickOfRow, sameValue } from "./ask";
import type { DataRow } from "./data";
import { addRowEdit, removeRowEdit, scanJson, splice, type JsonMember, type JsonNode } from "./json-edit";
import { splitLines } from "./lines";
import { parseBooklet } from "./reader";

/** Why an act was not applied, in a few words each (the plugin's notice puts them in plain English). */
export type ApplyWhy =
	| "no row"
	| "ambiguous"
	| "no field"
	| "changed"
	| "unreadable"
	| "identity"
	| "no place"
	/** The text holds U+FFFD: a byte that was not UTF-8 was made into it on reading, and writing it back would change that byte. */
	| "not utf8"
	/** An add whose id is already in the data, on a row that is not the one the reader added. */
	| "clash"
	/** A row nested too deeply to be compared. */
	| "too deep"
	/** The new text would pass the size a data file may be read at (data-files.ts). */
	| "too big"
	/** The block is not found in the note's own text now (in a callout or a comment, or gone): it cannot be changed from here. */
	| "no write";

export type ApplyResult = { ok: true; text: string } | { ok: false; why: ApplyWhy };

type Obj = Extract<JsonNode, { kind: "object" }>;
type Arr = Extract<JsonNode, { kind: "array" }>;

/** An object's members by key; a key written twice is read as its last, as JSON.parse reads it. */
function byKey(o: Obj): Map<string, JsonMember> {
	const m = new Map<string, JsonMember>();
	for (const x of o.members) m.set(x.key, x);
	return m;
}

const parseAt = (s: string, n: JsonNode): unknown => JSON.parse(s.slice(n.start, n.end));

/** A text read for an act: past its byte order mark, its list of rows found. */
interface Located {
	/** The length of the byte order mark (0 or 1): offsets in `body` are offsets in the text past it. */
	bom: number;
	body: string;
	list: Arr;
}

/** The JSON of `text` past its byte order mark, and the list of rows at `keyPath` ("" for the root): the list itself, or an object holding it as `rows`. */
function locate(text: string, keyPath: string): Located | { why: ApplyWhy } {
	// a byte order mark is no part of the JSON, and stays where it is
	const bom = text.charCodeAt(0) === 0xfeff ? 1 : 0;
	const body = text.slice(bom);
	// a byte that was not UTF-8 reads as U+FFFD, and the text written back would carry U+FFFD in its place: nothing is written
	if (body.includes("\uFFFD")) return { why: "not utf8" };
	try {
		JSON.parse(body);
	} catch {
		return { why: "unreadable" };
	}
	const root = scanJson(body);
	if (!root) return { why: "unreadable" };
	let at: JsonNode = root;
	for (const k of keyPath === "" ? [] : keyPath.split(".")) {
		const m = at.kind === "object" ? byKey(at).get(k) : undefined;
		if (!m) return { why: "no row" };
		at = m.value;
	}
	if (at.kind === "object") {
		const m = byKey(at).get("rows");
		if (!m) return { why: "no row" };
		at = m.value;
	}
	if (at.kind !== "array") return { why: "no row" };
	return { bom, body, list: at };
}

/** Ids are compared as text: 5 and "5" are one id (contract section 9, item 5). */
const sameId = (a: unknown, b: unknown): boolean => (typeof a === "string" || typeof a === "number") && (typeof b === "string" || typeof b === "number") && String(a) === String(b);

/** A row found by its id: its members, and the list it stands in (null for a row held as a field's one object) with its place there. */
interface Found {
	row: Obj;
	members: Map<string, JsonMember>;
	in: Arr | null;
	at: number;
}

/** Every row at every depth whose `id` is the pick (`asText`: as text, 5 and "5" one id, for an add and a removal; an in-place edit of beta 3 keeps a number pick and a text pick apart) (a row that holds rows has children): a stack, so a chain thousands deep is no recursion. */
function rowsWithId(body: string, list: Arr, pick: unknown, asText = true): Found[] {
	const found: Found[] = [];
	const todo: { row: Obj; in: Arr | null; at: number }[] = [];
	for (let i = list.elements.length - 1; i >= 0; i--) {
		const e = list.elements[i]!;
		if (e.kind === "object") todo.push({ row: e, in: list, at: i });
	}
	while (todo.length) {
		const x = todo.pop()!;
		const members = byKey(x.row);
		const id = members.get("id");
		if (id && id.value.kind === "value" && (asText ? sameId(pickOfRow({ id: parseAt(body, id.value) } as DataRow), pick) : pickOfRow({ id: parseAt(body, id.value) } as DataRow) === pick)) found.push({ row: x.row, members, in: x.in, at: x.at });
		for (const m of members.values()) {
			const v = m.value;
			if (v.kind === "object") todo.push({ row: v, in: null, at: 0 });
			else if (v.kind === "array") for (let i = v.elements.length - 1; i >= 0; i--) if (v.elements[i]!.kind === "object") todo.push({ row: v.elements[i] as Obj, in: v, at: i });
		}
	}
	return found;
}

/**
 * Sets `field` of the row `pick` to `a` in the data file's `text`, where `keyPath` (the data block's key path, "" for the file's root)
 * finds the rows, and returns the new text; the text itself when the field already holds `a`. `eq` is how the data's value is compared
 * with `was` and `a` (the display states' comparison: a choice is compared as an option is, all others as a value).
 */
export function applyAct(text: string, keyPath: string, pick: unknown, field: string, was: unknown, a: unknown, eq: (x: unknown, y: unknown) => boolean = sameValue): ApplyResult {
	// a row's id is what every act names it by: it is never set, whatever the data marks as editable
	if (field === "id") return { ok: false, why: "identity" };
	// a value is written as a JSON string, a JSON number or null: nothing else is an edit's value
	if (!(a === null || typeof a === "string" || (typeof a === "number" && Number.isFinite(a)))) return { ok: false, why: "unreadable" };
	const at = locate(text, keyPath);
	if ("why" in at) return { ok: false, why: at.why };
	const { bom, body } = at;
	const found = rowsWithId(body, at.list, pick, false);
	if (!found.length) return { ok: false, why: "no row" };
	if (found.length > 1) return { ok: false, why: "ambiguous" };

	const member = found[0]!.members.get(field);
	// an edit sets a value the row already has: a field it lacks, or one that holds a list or rows, is not one
	if (!member || member.value.kind !== "value") return { ok: false, why: "no field" };
	const now = parseAt(body, member.value);
	if (eq(now, a)) return { ok: true, text };
	if (!eq(now, was)) return { ok: false, why: "changed" };
	const { start, end } = member.value;
	return { ok: true, text: text.slice(0, bom + start) + JSON.stringify(a) + text.slice(bom + end) };
}

/** Two JSON values are the same: the same types and values, an object's keys in any order, a list's members in order. */
export function sameJson(a: unknown, b: unknown): boolean {
	if (a === b) return true;
	if (typeof a !== typeof b || a === null || b === null || typeof a !== "object") return false;
	if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => sameJson(x, b[i]));
	const x = a as Record<string, unknown>;
	const y = b as Record<string, unknown>;
	const kx = Object.keys(x);
	return kx.length === Object.keys(y).length && kx.every((k) => Object.prototype.hasOwnProperty.call(y, k) && sameJson(x[k], y[k]));
}

/** The only candidate field of a row (as the text reads it) for new child rows: a list whose items are all objects, an empty list included. Null when it has none or several (data.ts childListKey). */
function childList(members: Map<string, JsonMember>): Arr | null {
	const lists: Arr[] = [];
	for (const m of members.values()) if (m.value.kind === "array" && m.value.elements.every((e) => e.kind === "object")) lists.push(m.value);
	return lists.length === 1 ? lists[0]! : null;
}

/**
 * Adds a row to the data: `{ id: pick, ...row }` goes at the end of the block's list of rows (`under` undefined), or of the list of rows
 * the row `under` holds (found at any depth: none is "no row", more than one is "ambiguous"; a row that holds no list of rows, or more than
 * one, is "no place"), written in the layout of the row before it. A row with that id already in the block is not added again: the text
 * comes back as it was.
 */
export function applyAdd(text: string, keyPath: string, pick: unknown, under: unknown, row: Record<string, unknown>): ApplyResult {
	if (!(typeof pick === "string" && pick !== "") && !(typeof pick === "number" && Number.isFinite(pick))) return { ok: false, why: "unreadable" };
	const at = locate(text, keyPath);
	if ("why" in at) return { ok: false, why: at.why };
	const { bom, body } = at;
	const have = rowsWithId(body, at.list, pick);
	if (have.length) {
		// the row is already there: the same add only if it holds what the reader's row holds (an outside write may have given the id to another row)
		if (have.length > 1) return { ok: false, why: "ambiguous" };
		const now = parseAt(body, have[0]!.row) as Record<string, unknown>;
		for (const [k, v] of Object.entries(row)) if (k !== "id" && !(Object.prototype.hasOwnProperty.call(now, k) && sameJson(now[k], v))) return { ok: false, why: "clash" };
		return { ok: true, text };
	}
	let list = at.list;
	if (under !== undefined) {
		const parents = rowsWithId(body, at.list, under);
		if (!parents.length) return { ok: false, why: "no row" };
		if (parents.length > 1) return { ok: false, why: "ambiguous" };
		const kids = childList(parents[0]!.members);
		if (!kids) return { ok: false, why: "no place" };
		list = kids;
	}
	// the id is the row's first key, whatever else the form gave
	const own: Record<string, unknown> = { id: pick };
	for (const [k, v] of Object.entries(row)) if (k !== "id") own[k] = v;
	const e = addRowEdit(body, list, own);
	return { ok: true, text: text.slice(0, bom) + splice(body, e.from, e.to, e.put) };
}

/**
 * Takes the row `pick` out of the data, with the rows under it, only if it is still `was` (as parsed JSON: the same types and values, keys in
 * any order). No such row is "same" (the text comes back as it was); more than one is "ambiguous"; a row that changed since is "changed".
 */
export function applyDelete(text: string, keyPath: string, pick: unknown, was: unknown): ApplyResult {
	const at = locate(text, keyPath);
	if ("why" in at) return { ok: false, why: at.why };
	const { bom, body } = at;
	const found = rowsWithId(body, at.list, pick);
	if (!found.length) return { ok: true, text };
	if (found.length > 1) return { ok: false, why: "ambiguous" };
	const f = found[0]!;
	let same: boolean;
	try {
		same = sameJson(parseAt(body, f.row), was);
	} catch {
		// a row nested thousands deep: the comparison runs out of room
		return { ok: false, why: "too deep" };
	}
	if (!same) return { ok: false, why: "changed" };
	// a row held as a field's one object stands in no list: there is no comma to take with it
	if (!f.in) return { ok: false, why: "no place" };
	const e = removeRowEdit(f.in, f.at);
	return { ok: true, text: text.slice(0, bom) + splice(body, e.from, e.to, e.put) };
}

/** Where the text between an inline data block's fences stands in the note, and what it is. */
export interface FenceInner {
	from: number;
	to: number;
	text: string;
}

/**
 * The text between an inline data block's fences in `note`. The block is found again in the note's own text (so a note that changed since the
 * page drew is read as it is now) by its id and module, and it must be written in the note itself, not in a file. Null when the note holds no
 * such block now. Line endings are the note's own.
 */
export function fenceInner(note: string, id: string, module: string | null): FenceInner | null {
	const hit = parseBooklet(note).data.find((b) => b.id === id && b.module === module);
	if (!hit || !hit.inner || hit.file) return null;
	const L = splitLines(note);
	let from = note.length;
	let to = note.length;
	let pos = 0;
	for (let i = 0; i < L.length; i++) {
		if (i === hit.inner.from) from = pos;
		if (i === hit.inner.to) to = pos;
		pos += L[i]!.text.length + L[i]!.eol.length;
	}
	return { from, to, text: note.slice(from, to) };
}

/**
 * Runs an act on a block written in the note itself: `act` is given the text between the fences and returns the new text (or a refusal), and
 * only that text goes back; the rest of the note is not touched. A block the note does not hold in its own text now is "unreadable".
 */
export function applyInFence(note: string, id: string, module: string | null, act: (inner: string) => ApplyResult): ApplyResult {
	const span = fenceInner(note, id, module);
	if (!span) return { ok: false, why: "no write" };
	const r = act(span.text);
	if (!r.ok) return r;
	return { ok: true, text: r.text === span.text ? note : splice(note, span.from, span.to, r.text) };
}
