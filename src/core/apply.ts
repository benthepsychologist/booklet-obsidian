/*
 * Applying one kept act to a data file's text (docs/hosting.md, "Applying a reader's acts", the part called "In place"): an act is
 * `{ pick, a, was }` for a field, and it sets that field of the row whose `id` is the pick to `a`, only if the data still holds `was`.
 * The change is made to the one value's own text and nowhere else: every other byte of the file (its spacing, its key order, the other
 * rows, its line endings, a byte order mark at the start) comes back exactly as it was (SPEC section 8: no normalizing). A pick that
 * names no row or more than one row, the field `id` (it is the row's identity: changing it would orphan every act that names the old one), a row that does not carry the field, and a value that is no longer `was` write nothing.
 * Plain TypeScript: nothing here imports Obsidian.
 */
import { pickOfRow, sameValue } from "./ask";
import type { DataRow } from "./data";
import { scanJson, type JsonMember, type JsonNode } from "./json-edit";

/** Why an act was not applied, in a few words each (the plugin's notice puts them in plain English). */
export type ApplyWhy = "no row" | "ambiguous" | "no field" | "changed" | "unreadable" | "identity";

export type ApplyResult = { ok: true; text: string } | { ok: false; why: ApplyWhy };

type Obj = Extract<JsonNode, { kind: "object" }>;

/** An object's members by key; a key written twice is read as its last, as JSON.parse reads it. */
function byKey(o: Obj): Map<string, JsonMember> {
	const m = new Map<string, JsonMember>();
	for (const x of o.members) m.set(x.key, x);
	return m;
}

const parseAt = (s: string, n: JsonNode): unknown => JSON.parse(s.slice(n.start, n.end));

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
	// a byte order mark is no part of the JSON, and stays where it is
	const bom = text.charCodeAt(0) === 0xfeff ? 1 : 0;
	const body = text.slice(bom);
	try {
		JSON.parse(body);
	} catch {
		return { ok: false, why: "unreadable" };
	}
	const root = scanJson(body);
	if (!root) return { ok: false, why: "unreadable" };

	// the rows: the value at the key path, which is the list itself or an object holding it as `rows`
	let at: JsonNode = root;
	for (const k of keyPath === "" ? [] : keyPath.split(".")) {
		const m = at.kind === "object" ? byKey(at).get(k) : undefined;
		if (!m) return { ok: false, why: "no row" };
		at = m.value;
	}
	if (at.kind === "object") {
		const m = byKey(at).get("rows");
		if (!m) return { ok: false, why: "no row" };
		at = m.value;
	}
	if (at.kind !== "array") return { ok: false, why: "no row" };

	// every row at every depth is looked at (a row that holds rows has children): a stack, so a chain thousands deep is no recursion
	const found: Map<string, JsonMember>[] = [];
	const todo: Obj[] = [];
	for (let i = at.elements.length - 1; i >= 0; i--) {
		const e = at.elements[i]!;
		if (e.kind === "object") todo.push(e);
	}
	while (todo.length) {
		const row = todo.pop()!;
		const members = byKey(row);
		const id = members.get("id");
		if (id && id.value.kind === "value" && pickOfRow({ id: parseAt(body, id.value) } as DataRow) === pick) found.push(members);
		for (const m of members.values()) {
			const v = m.value;
			if (v.kind === "object") todo.push(v);
			else if (v.kind === "array") for (let i = v.elements.length - 1; i >= 0; i--) if (v.elements[i]!.kind === "object") todo.push(v.elements[i] as Obj);
		}
	}
	if (!found.length) return { ok: false, why: "no row" };
	if (found.length > 1) return { ok: false, why: "ambiguous" };

	const member = found[0]!.get(field);
	// an edit sets a value the row already has: a field it lacks, or one that holds a list or rows, is not one
	if (!member || member.value.kind !== "value") return { ok: false, why: "no field" };
	const now = parseAt(body, member.value);
	if (eq(now, a)) return { ok: true, text };
	if (!eq(now, was)) return { ok: false, why: "changed" };
	const { start, end } = member.value;
	return { ok: true, text: text.slice(0, bom + start) + JSON.stringify(a) + text.slice(bom + end) };
}
