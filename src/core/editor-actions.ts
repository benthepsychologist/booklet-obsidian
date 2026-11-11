/*
 * The panel's writes, as text in and text out. Every change the panel makes to a note is the note's text before and the note's text
 * after; `minimalChange` says which bytes differ, and the panel replaces only those in the editor, so every other byte of the note
 * stays as it was. What the panel can write:
 *   - one Booklet line, changed in place (editor-line.ts): its id, its switches, its fields;
 *   - the declared fields of a data block (`fields` in a ```booklet data block): a field renamed or taken out of the declaration.
 * It never writes the records section, and never a data row: the rows of a block are left as they are, whatever its declaration says
 * (editor-guard.ts counts what a change would leave not matching, and the panel asks first). Plain TypeScript: nothing here imports
 * Obsidian.
 */
import { walkRows } from "./editor-guard";
import { parseLine, strayWords, type Edit, type ParsedLine } from "./editor-line";
import { settingsOf } from "./editor-patterns";
import { scan } from "./editor-scan";
import { removeMember, scanJson, splice, type JsonMember } from "./json-edit";
import type { DataRow } from "./data";

/** The note with one line's text replaced (the line is 0-based; the other lines are not touched). */
export function replaceLine(doc: string, line: number, text: string): string {
	const lines = doc.split("\n");
	if (line < 0 || line >= lines.length) return doc;
	lines[line] = text;
	return lines.join("\n");
}

export interface Change {
	/** Offsets in the text before: the bytes from..to are replaced by `text`. */
	from: number;
	to: number;
	text: string;
}

/** The smallest replacement that turns `before` into `after`, or null when they are the same. */
export function minimalChange(before: string, after: string): Change | null {
	if (before === after) return null;
	let a = 0;
	const max = Math.min(before.length, after.length);
	while (a < max && before.charCodeAt(a) === after.charCodeAt(a)) a++;
	let b = 0;
	while (b < max - a && before.charCodeAt(before.length - 1 - b) === after.charCodeAt(after.length - 1 - b)) b++;
	return { from: a, to: before.length - b, text: after.slice(a, after.length - b) };
}

/** The note after a change, as an editor makes it (for the tests). */
export const applyChange = (doc: string, c: Change): string => doc.slice(0, c.from) + c.text + doc.slice(c.to);

// ---------------------------------------------------------------- the line under the cursor

export interface SettingsModel {
	kind: string;
	/** The kind is one the linter knows. */
	known: boolean;
	takesId: boolean;
	id: string | null;
	/** Every switch the kind takes, in the linter's order, with whether the line has it. */
	flags: { name: string; on: boolean }[];
	/** Every field the kind takes, in the linter's order, with its value ("" when the line has none). */
	values: { name: string; value: string }[];
	/** Words on the line that the kind does not take, with their place among the words after the bar. */
	stray: { index: number; text: string }[];
	/** The kind takes an `icon:` field. */
	icon: boolean;
	/** The kind has any switch, field or id to show. */
	any: boolean;
}

/** What the panel shows for a Booklet line, or null when the line is not one. */
export function settingsModel(lineText: string): SettingsModel | null {
	const p = parseLine(lineText);
	if (!p) return null;
	const { flags, keys } = settingsOf(p.kind);
	const stray = strayWords(p).map((s) => ({ index: s.index, text: p.words[s.index]?.text ?? "" }));
	return {
		kind: p.kind,
		known: p.known,
		takesId: p.takesId,
		id: p.id,
		flags: flags.map((name) => ({ name, on: p.flags.has(name) })),
		values: keys.map((name) => ({ name, value: p.values.get(name) ?? "" })),
		stray,
		icon: keys.includes("icon"),
		any: p.takesId || flags.length > 0 || keys.length > 0 || stray.length > 0,
	};
}

/** A line changed by `edit`: the note after, or why not. The note is the same but for that line. */
export function changeLine(doc: string, line: number, edit: (p: ParsedLine) => Edit): { text: string } | { error: string } {
	const lines = doc.split("\n");
	const p = parseLine(lines[line] ?? "");
	if (!p) return { error: "That line is not a Booklet line." };
	const e = edit(p);
	if ("error" in e) return e;
	return { text: replaceLine(doc, line, e.text) };
}

// ---------------------------------------------------------------- the declared fields of a data block

export interface FieldBlock {
	/** The block's `^id`, or null. */
	id: string | null;
	/** 0-based lines of the opening fence and the closing fence. */
	line: number;
	end: number;
	/** The declared fields, in order. */
	keys: string[];
	/** For each declared field, how many rows (and rows under rows) hold a value for it. */
	used: Record<string, number>;
}

const ownKey = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);

interface Located {
	block: FieldBlock;
	body: string;
	json: Record<string, unknown>;
}

function locate(doc: string, cursor: number): Located | null {
	const s = scan(doc);
	for (const it of s.items) {
		if (it.type !== "fence" || !/^booklet[ \t]+data\b/i.test(it.info ?? "") || it.end === undefined) continue;
		const last = it.blockLine ?? it.end;
		if (cursor < it.line || cursor > last) continue;
		const body = s.lines.slice(it.line + 1, it.end).join("\n");
		let json: unknown;
		try {
			json = JSON.parse(body);
		} catch {
			return null;
		}
		if (!json || typeof json !== "object" || Array.isArray(json)) return null;
		const obj = json as Record<string, unknown>;
		const f = obj["fields"];
		if (!f || typeof f !== "object" || Array.isArray(f)) return null;
		const keys = Object.keys(f);
		const used: Record<string, number> = {};
		for (const k of keys) used[k] = 0;
		const rows = Array.isArray(obj["rows"]) ? (obj["rows"] as DataRow[]) : [];
		walkRows(rows, (r) => {
			for (const k of keys) if (ownKey(r, k)) used[k] = (used[k] ?? 0) + 1;
		});
		return { block: { id: it.blockId ?? null, line: it.line, end: it.end, keys, used }, body, json: obj };
	}
	return null;
}

/** The data block that holds the line, with its declared fields, or null (no block there, no declared fields, or JSON that does not read). */
export function fieldBlockAt(doc: string, cursor: number): FieldBlock | null {
	return locate(doc, cursor)?.block ?? null;
}

const idFormatNames = (json: Record<string, unknown>, key: string): boolean => {
	for (const k of ["idFormat", "idPattern"]) {
		const v = json[k];
		if (typeof v === "string" && v.includes(`{field:${key}}`)) return true;
	}
	return false;
};

function fieldMembers(body: string): { fields: Extract<ReturnType<typeof scanJson>, { kind: "object" }>; target: (key: string) => JsonMember | undefined } | null {
	const root = scanJson(body);
	if (!root || root.kind !== "object") return null;
	const f = [...root.members].reverse().find((m) => m.key === "fields");
	if (!f || f.value.kind !== "object") return null;
	const fields = f.value;
	return { fields, target: (key) => [...fields.members].reverse().find((m) => m.key === key) };
}

const withBody = (doc: string, b: Located["block"], body: string): string => {
	const lines = doc.split("\n");
	return [...lines.slice(0, b.line + 1), ...body.split("\n"), ...lines.slice(b.end)].join("\n");
};

/** Rename a declared field in the block that holds the line: its declaration only; the rows keep the key they have. */
export function renameField(doc: string, cursor: number, oldKey: string, newKey: string): { text: string } | { error: string } {
	const at = locate(doc, cursor);
	if (!at) return { error: "That is not a data block with declared fields." };
	if (!newKey.trim()) return { error: "A field's name cannot be empty." };
	if (newKey === oldKey) return { text: doc };
	if (at.block.keys.includes(newKey)) return { error: `The block already declares a field \`${newKey}\`.` };
	if (idFormatNames(at.json, oldKey)) return { error: `The block's row ids are made from \`${oldKey}\` (idFormat). Change that by hand first.` };
	const m = fieldMembers(at.body)?.target(oldKey);
	if (!m) return { error: `The block declares no field \`${oldKey}\`.` };
	return { text: withBody(doc, at.block, splice(at.body, m.keyStart, m.keyEnd, JSON.stringify(newKey))) };
}

/** Take a field out of a block's declaration: the rows that hold a value for it keep it (it is not shown any more). */
export function removeField(doc: string, cursor: number, key: string): { text: string } | { error: string } {
	const at = locate(doc, cursor);
	if (!at) return { error: "That is not a data block with declared fields." };
	if (!at.block.keys.includes(key)) return { error: `The block declares no field \`${key}\`.` };
	if (at.block.keys.length === 1) return { error: "A block keeps at least one declared field. Remove its declaration by hand." };
	if (idFormatNames(at.json, key)) return { error: `The block's row ids are made from \`${key}\` (idFormat). Change that by hand first.` };
	const parts = fieldMembers(at.body);
	const m = parts?.target(key);
	if (!parts || !m) return { error: `The block declares no field \`${key}\`.` };
	const inner = at.body.slice(parts.fields.start, parts.fields.end);
	const cut = removeMember(inner, key);
	if (cut === null) return { error: "That block's fields could not be read." };
	return { text: withBody(doc, at.block, splice(at.body, parts.fields.start, parts.fields.end, cut)) };
}
