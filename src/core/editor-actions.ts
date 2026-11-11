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
import { parseLine, setId, strayWords, type Edit, type ParsedLine } from "./editor-line";
import { LP, settingsOf } from "./editor-patterns";
import { claimEnd, heldBy, heldWords, keyOf, scan, stateBefore, type HeldBy, type Scan, type Scope } from "./editor-scan";
import { parseBooklet } from "./reader";
import { removeMember, scanJson, splice, type JsonMember } from "./json-edit";
import type { DataRow } from "./data";

/**
 * The note with one line's text replaced (the line is 0-based; the other lines are not touched). A line that ended in `\r` (a note
 * with Windows line endings) still does: `text` is the line's words, and the line's own ending stays as it was.
 */
export function replaceLine(doc: string, line: number, text: string): string {
	const lines = doc.split("\n");
	if (line < 0 || line >= lines.length) return doc;
	const cr = (lines[line] ?? "").endsWith("\r") && !text.endsWith("\r");
	lines[line] = cr ? text + "\r" : text;
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

/** What the panel shows for the line under the cursor: its settings, or why it offers none. */
export interface LineView {
	/** The settings of the Booklet line, or null when the line is not one or something holds it. */
	model: SettingsModel | null;
	/** What holds the line (the records section, a code fence, a comment): the panel offers nothing there. */
	held: HeldBy | null;
	/** One sentence saying why there is nothing to change, when `held` is set. */
	why: string;
}

/**
 * The line under the cursor, read in the whole note: a line that looks like a Booklet line inside the records section, a code fence
 * or a comment is not one (the reader and the linter skip it), so it has no settings here and the panel says why.
 */
export function settingsAt(doc: string, line: number, s: Scan = scan(doc)): LineView {
	const held = heldBy(s, line);
	if (held) return { model: null, held, why: heldWords(held) };
	return { model: settingsModel(doc.split("\n")[line] ?? ""), held: null, why: "" };
}

/** A line changed by `edit`: the note after, or why not. The note is the same but for that line. */
export function changeLine(doc: string, line: number, edit: (p: ParsedLine) => Edit, s: Scan = scan(doc)): { text: string } | { error: string } {
	const held = heldBy(s, line);
	if (held) return { error: heldWords(held) };
	const lines = doc.split("\n");
	const p = parseLine(lines[line] ?? "");
	if (!p) return { error: "That line is not a Booklet line." };
	const e = edit(p);
	if ("error" in e) return e;
	return { text: replaceLine(doc, line, e.text) };
}

/** What the reader says about an id used twice, as it reads the note: the id and where it is used. */
const TWICE = /the (?:module )?id "([^"]*)" is used twice in (.+?)\.$/;

function idClashes(text: string): Map<string, string> {
	const b = parseBooklet(text);
	const out = new Map<string, string>();
	for (const m of [b.refusal ?? "", ...b.problems]) {
		const t = TWICE.exec(m.replace(/^Line \d+: /, ""));
		if (t?.[1] !== undefined) out.set(`${t[1]}\u0000${t[2] ?? ""}`, t[2] ?? "");
	}
	return out;
}

/**
 * Rename the id of the Booklet line at `line`. An id the reader would find used twice in the same place (a module's ids, the
 * activities outside every module, the menus every module shares, the module ids of the file) is refused, and the note is not
 * changed: the reader refuses a whole booklet that uses an id twice. The reader's own reading decides, so its scopes are the ones used
 * here, not a second copy of them.
 */
export function renameId(doc: string, line: number, id: string, s: Scan = scan(doc)): { text: string } | { error: string } {
	const r = changeLine(doc, line, (p) => setId(p, id), s);
	if ("error" in r) return r;
	if (r.text === doc) return r;
	const was = idClashes(doc);
	for (const [key, where] of idClashes(r.text)) {
		if (!was.has(key)) return { error: `\`${id}\` is already used in ${where}.` };
	}
	const other = siblingClash(s, line, id);
	return other ? { error: other } : r;
}

/** Where a module's name goes in a sentence: "the module \"x\"", or the activities outside every module. */
const inScope = (scope: Scope): string => (scope === null ? "the activities outside every module" : `the module "${scope}"`);

/**
 * The clashes the reader does not refuse but the linter calls errors (lint-booklet.py): a question, activity or menu given the id of a
 * `booklet data` block of its module (a query could not tell them apart), a tab given the id of another tab of its activity or its
 * module's opening, a page given the id of another page of its tab (a renderer would keep both and number the second). The reason, or
 * null when the id is free.
 */
function siblingClash(s: Scan, line: number, id: string): string | null {
	const it = s.items.find((x) => x.line === line);
	if (!it || !id) return null;
	if (it.type === "question" || it.type === "activity" || it.type === "menu") {
		const st = stateBefore(s, line);
		const scope = st.section === "content" ? st.mod : st.dataScope;
		if (it.type === "menu" && scope === null && st.section !== "content") return null; // the menus every module shares have a table of their own
		if (s.ids.dataBlocks.get(keyOf(scope))?.has(id)) return `\`${id}\` is already the id of a data block in ${inScope(scope)}, so a query could not tell them apart.`;
		return null;
	}
	if (it.type === "tab") {
		const twin = s.items.some((x) => x.type === "tab" && x.line !== line && x.tabPlace === it.tabPlace && x.tabId === id);
		return twin ? `\`${id}\` is already the id of another tab in this ${it.where === "module" ? "module's opening" : "activity"}.` : null;
	}
	if (it.type === "page-named") {
		// the pages of one tab: the items in order, a new activity or a tab of the activity starting a new set
		let key = 0;
		let mine = -1;
		const pages: { line: number; key: number; pid: string | undefined }[] = [];
		for (const x of s.items) {
			if (x.type === "activity" || (x.type === "tab" && x.where === "activity")) key++;
			if (x.type === "page-named") {
				pages.push({ line: x.line, key, pid: x.pageId });
				if (x.line === line) mine = key;
			}
		}
		const twin = pages.some((x) => x.key === mine && x.line !== line && x.pid === id);
		return twin ? `\`${id}\` is already the id of another page in this tab.` : null;
	}
	return null;
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

function locate(doc: string, cursor: number, s: Scan = scan(doc)): Located | null {
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
export function fieldBlockAt(doc: string, cursor: number, s: Scan = scan(doc)): FieldBlock | null {
	return locate(doc, cursor, s)?.block ?? null;
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

/** The note with the lines between a block's fences replaced by `body`, each ending as the fence line above them does. */
const withBody = (doc: string, b: Located["block"], body: string): string => {
	const lines = doc.split("\n");
	const cr = (lines[b.line] ?? "").endsWith("\r") ? "\r" : "";
	return [...lines.slice(0, b.line + 1), ...body.split("\n").map((l) => l + cr), ...lines.slice(b.end)].join("\n");
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

// ---------------------------------------------------------------- the options of a choice, multi or scale

export interface OptionItem {
	/** 0-based line of the option (a task line `- [ ] words`, or a scale's `0. words`). */
	line: number;
	/** The position the reader's answer stores: a choice's number from 1, a scale's anchor number. */
	position: number;
	/** The words. */
	text: string;
	/** The last line the option takes: replies written under it belong to it. */
	end: number;
}

export interface OptionList {
	/** The question's own line. */
	head: number;
	kind: "choice" | "multi" | "scale";
	id: string | null;
	items: OptionItem[];
}

const quoteCount = (s: string): number => (s.match(/>/g) ?? []).length;
const stripQuotes = (line: string, n: number): string => {
	let out = line;
	for (let k = 0; k < n; k++) out = out.replace(/^>[ \t]?/, "");
	return out;
};

/** The options of the choice, multi or scale that holds the line (its own line or one of the lines it claims), or null. */
export function optionsAt(doc: string, cursor: number, s: Scan = scan(doc)): OptionList | null {
	if (heldBy(s, cursor)) return null; // a question written in a code block, a comment or the records section is not one
	const lines = doc.split("\n");
	for (let j = Math.min(cursor, lines.length - 1); j >= 0; j--) {
		const p = parseLine(lines[j] ?? "");
		if (!p) {
			// a question's options sit just under it: only lines of a quote or a list or a blank can be among them
			if ((lines[j] ?? "").trim() === "" && j < cursor && !(lines[j + 1] ?? "").trim()) return null;
			continue;
		}
		if (p.kind !== "choice" && p.kind !== "multi" && p.kind !== "scale") return null;
		const n = quoteCount(p.quotes);
		const rest = lines.slice(j).map((l) => stripQuotes(l, n));
		const end = j + claimEnd(p.kind, rest, 0);
		if (cursor >= end) return null;
		const items: OptionItem[] = [];
		const pattern = p.kind === "scale" ? LP.NUMBERED : LP.TASK;
		for (let k = j + 1; k < end; k++) {
			const l = rest[k - j] ?? "";
			const m = pattern.exec(l);
			if (!m) continue;
			const text = p.kind === "scale" ? (m[2] ?? "") : l.slice(m[0].length);
			items.push({ line: k, position: p.kind === "scale" ? Number(m[1]) : items.length + 1, text, end: k });
		}
		items.forEach((it, i) => (it.end = (items[i + 1]?.line ?? end) - 1));
		return items.length ? { head: j, kind: p.kind, id: p.id, items } : null;
	}
	return null;
}

/** The note with one option's words changed: the marker, the number and the quote marks in front of it stay. */
export function renameOption(doc: string, cursor: number, line: number, words: string): { text: string } | { error: string } {
	const list = optionsAt(doc, cursor);
	const item = list?.items.find((i) => i.line === line);
	if (!list || !item) return { error: "That is not an option of the question here." };
	const w = words.trim();
	if (!w) return { error: "An option cannot be empty." };
	if (/[\r\n]/.test(w)) return { error: "An option is one line." };
	const text = doc.split("\n")[line] ?? "";
	return { text: replaceLine(doc, line, text.slice(0, text.length - item.text.length) + w) };
}

/** The note without one option (and the replies written under it). The last option stays: a question keeps at least one. */
export function removeOption(doc: string, cursor: number, line: number): { text: string } | { error: string } {
	const list = optionsAt(doc, cursor);
	const item = list?.items.find((i) => i.line === line);
	if (!list || !item) return { error: "That is not an option of the question here." };
	if (list.items.length === 1) return { error: "A question keeps at least one option." };
	const lines = doc.split("\n");
	lines.splice(item.line, item.end - item.line + 1);
	return { text: lines.join("\n") };
}
