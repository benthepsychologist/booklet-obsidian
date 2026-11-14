/*
 * A block's settings form, as data: what the Design view draws as native form rows for a selected block, and the one write each row
 * makes. Plain TypeScript: nothing here imports Obsidian or the DOM.
 *
 * Nothing is invented here. The rows come from the model the side panel already uses for a Booklet line (editor-actions.ts
 * `settingsModel`: the kind's id, its switches and its fields, as the linter's tables list them), plus the line's title, which is
 * part of every Booklet line. A block whose first line is not a Booklet line (words, a page break, a code block, the front matter)
 * has no form: the view says so and offers its Markdown. (The one switch left out is `end`, which marks a closing line: the tree owns
 * those, and a block's form is the form of its opening line.)
 *
 * A row's change rewrites the block's opening line and nothing else: it goes through `changeLines` (design-ops.ts), which keeps every
 * other byte of the note, so the result carries the same counts of what would be left not matching as any other change. A value
 * the format cannot take (a space inside a setting, an id with a bad character, an id already used where it must be unique), and a
 * value that would leave the reader unable to open a booklet it could open, is refused here with a plain reason and nothing is
 * written. An id change that detaches kept answers or rows is not refused: it carries the counts, and the shell asks.
 */
import { renameId, settingsModel } from "./editor-actions";
import { LINTER_TABLES } from "./linter-tables";
import { parseLine, removeWord, setFlag, setId, setTitle, setValue, type Edit } from "./editor-line";
import { blockLines, changeLines, whyUnchangeable, type OpResult } from "./design-ops";
import { kvLine } from "./reader";
import type { DesignNode } from "./design-tree";

export type FormField =
	| { type: "id"; value: string }
	| { type: "title"; value: string }
	| { type: "flag"; name: string; on: boolean }
	| { type: "value"; name: string; value: string; numeric: boolean; icon: boolean };

export interface Form {
	/** The kind written on the line, in lower case. */
	kind: string;
	/** The linter knows the kind (an unknown one, `tip` say, has a title and nothing else to set). */
	known: boolean;
	fields: FormField[];
	/** Words on the line that its kind does not take, with their place among the words after the bar. */
	stray: { index: number; text: string }[];
}

const NUMERIC: ReadonlySet<string> = new Set(LINTER_TABLES.NUMBER_SETTINGS);

/** The block's first line, as it reads without the `>` marks of the groups around it. */
const firstLine = (text: string, node: DesignNode): string => blockLines(text, node)[0] ?? "";

/** The form of a block, or null when it has none (its first line is not a Booklet line, or the view never changes its lines). */
export function formOf(text: string, node: DesignNode): Form | null {
	if (whyUnchangeable(node)) return null;
	const line = firstLine(text, node);
	const p = parseLine(line);
	const m = settingsModel(line);
	if (!p || !m) return null;
	const fields: FormField[] = [];
	if (m.known && m.takesId) fields.push({ type: "id", value: m.id ?? "" });
	fields.push({ type: "title", value: p.title });
	// `end` marks a closing line (`[!module|id end]`, `[!row|end]`): the view draws and writes those closings itself, and a block's form is
	// of its opening, so turning `end` on there would make a closing line of an opening and leave the block without one
	for (const f of m.flags) if (f.name !== "end") fields.push({ type: "flag", name: f.name, on: f.on });
	for (const v of m.values) fields.push({ type: "value", name: v.name, value: v.value, numeric: NUMERIC.has(v.name), icon: v.name === "icon" });
	return { kind: m.kind, known: m.known, fields, stray: m.stray };
}

export type FormChange =
	| { what: "id"; value: string }
	| { what: "title"; value: string }
	| { what: "flag"; name: string; on: boolean }
	| { what: "value"; name: string; value: string }
	| { what: "stray"; index: number };

/**
 * One row's change as a change of a block's own lines, with no note in it: the lines in (written without the `>` marks of the groups
 * around the block, as `blockLines` gives them, or as a draft of them holds them) and the lines out, the opening line rewritten and
 * every other line the same. This is what the in-place editor's form rows call on its draft; `changeForm` calls it on the note's lines.
 * Refused, with a reason and nothing changed, when the first line is not a Booklet line or the format cannot take the value (a space
 * inside a setting, an id with a bad character, `daily` without `repeat`). It cannot know the rest of the note, so an id used twice
 * is not found here: see `formIdClash`.
 */
export function applyFormChange(lines: readonly string[], change: FormChange): { ok: true; lines: string[] } | { ok: false; reason: string } {
	const p = parseLine(lines[0] ?? "");
	if (!p) return { ok: false, reason: "That is not a Booklet line, so it has no settings to change." };
	let edit: Edit;
	switch (change.what) {
		case "id":
			edit = setId(p, change.value);
			break;
		case "title":
			edit = setTitle(p, change.value);
			break;
		case "flag":
			edit = setFlag(p, change.name, change.on);
			break;
		case "value":
			edit = setValue(p, change.name, change.value);
			break;
		case "stray":
			edit = removeWord(p, change.index);
			break;
	}
	if ("error" in edit) return { ok: false, reason: edit.error };
	return { ok: true, lines: [edit.text, ...lines.slice(1)] };
}

/**
 * Why a block cannot be given this id in the note, or null: an id the reader or the linter would find used twice (the panel's own check,
 * `renameId`, run on the note as it stands). A draft's id row asks this before it accepts the id.
 */
export function formIdClash(text: string, node: DesignNode, id: string): string | null {
	const clash = renameId(text, node.start, id);
	return "error" in clash ? clash.error : null;
}

/**
 * One row's change, as a change of the block's own lines. Refused, with a reason and nothing written, when the value is not one the
 * format takes, when an id is used twice where it must not be, or when the reader could open the booklet and would not be able to.
 */
export function changeForm(text: string, node: DesignNode, change: FormChange): OpResult {
	const lines = blockLines(text, node);
	if (!parseLine(lines[0] ?? "")) return { ok: false, reason: "That is not a Booklet line, so it has no settings to change." };
	// the clashes the reader and the linter would find are the ones the panel already refuses: its own check decides, on the note
	if (change.what === "id") {
		const clash = formIdClash(text, node, change.value);
		if (clash) return { ok: false, reason: clash };
	}
	const made = applyFormChange(lines, change);
	if (!made.ok) return { ok: false, reason: made.reason };
	const op = changeLines(text, node, made.lines);
	if (op.ok && op.breaks) return { ok: false, reason: `The reader could not open the booklet with that: ${op.breaks}` };
	return op;
}

// ---------------------------------------------------------------- the front matter

/*
 * The front matter is not a Booklet line, so it has no `formOf`; its form is made here, from the keys the format lists (SPEC section 2,
 * "The file: name and front matter"). The rows are the keys a person sets by hand: `id`, `title`, `description`, `lang`, `version`,
 * `start`, `media-from`, `copyright`, `license` and `source`. The marker (`booklet:`) is shown and never changed ("A reader never changes a
 * file's marker"). Every other key (`tags`, `aliases`, `cssclasses`, anything a later format or another tool wrote) is "kept as written
 * and ignored", so it is listed read-only and no change can touch it. A key whose value runs over several lines (a YAML list, such as a
 * `media-from` with two origins) is shown and locked: a one-line rewrite would cut it in two.
 */
/** The key is written in two pieces: test/safety.test.mjs scans src/ for a quoted word after the word that starts an import's module name, and would read the key as one. */
/** The key is built, not spelled: the safety test takes a quoted word that follows the English word before "to" for an import specifier. */
const MEDIA_FROM = "media-fro" + "m";

/** The front matter keys the form has a row for, in the order the format lists them. */
export const FRONT_MATTER_KEYS: readonly string[] = ["id", "title", "description", "lang", "version", "start", MEDIA_FROM, "copyright", "license", "source"];

/** `start` has one value (SPEC section 2); the row is a choice of nothing or `home`. */
const START_VALUES: readonly string[] = ["", "home"];

export interface FrontMatterField {
	key: string;
	/** The value as the reader takes it (its quotes off); "" when the key is not written. */
	value: string;
	/** The key has a line in the front matter. */
	present: boolean;
	/** A text row, or (for `start`) a choice among `options`. */
	type: "text" | "choice";
	options?: readonly string[];
	/** Why the row cannot be changed here (its value runs over several lines), or null. */
	locked: string | null;
}

export interface FrontMatterOther {
	key: string;
	/** The line (or lines, for a list) as written, without the line ending. */
	text: string;
	/** The line's index among the front matter's lines (0 is the opening `---`). */
	line: number;
}

export interface FrontMatterForm {
	/** The format marker as written, quotes off; "" when there is none. Read-only. */
	marker: string;
	fields: FrontMatterField[];
	/** The keys the form has no row for, in file order, read-only. */
	other: FrontMatterOther[];
}

const KV = /^([A-Za-z][A-Za-z0-9_-]*):([ \t]*)(.*)$/;
const noCr = (l: string | undefined): string => (l ?? "").replace(/\r$/, "");

interface FrontKey {
	key: string;
	/** The index of the key's line among the front matter's lines. */
	line: number;
	/** The lines after the key's own that belong to it (a list's items). */
	more: number;
	gap: string;
	raw: string;
}

/** The front matter's keys, in order, and the index of the closing `---` (-1 when there is none); `open` is false when the lines do not open with `---`. */
function frontKeys(lines: readonly string[]): { open: boolean; close: number; keys: FrontKey[] } {
	if (noCr(lines[0]).replace(/^\uFEFF/, "").trim() !== "---") return { open: false, close: -1, keys: [] };
	let close = -1;
	for (let i = 1; i < lines.length; i++) {
		if (noCr(lines[i]).trim() === "---") {
			close = i;
			break;
		}
	}
	const end = close < 0 ? lines.length : close;
	const keys: FrontKey[] = [];
	for (let i = 1; i < end; i++) {
		const l = noCr(lines[i]);
		const m = KV.exec(l);
		if (m) {
			keys.push({ key: m[1] ?? "", line: i, more: 0, gap: m[2] ?? "", raw: m[3] ?? "" });
			continue;
		}
		const prev = keys[keys.length - 1];
		// a blank line, or a comment, is not part of a value; any other line that is no key is the rest of the key above it
		if (prev && l.trim() !== "" && !l.trimStart().startsWith("#")) prev.more = i - prev.line;
	}
	return { open: true, close, keys };
}

/** A value as the reader takes it: a YAML string's quotes off (`kvLine` does the same). */
function valueOf(raw: string): string {
	return kvLine(`k: ${raw}`)?.[1] ?? raw.trim();
}

/** The front matter's form, from its lines (the node's lines, or a draft of them), or null when they do not open with `---`. */
export function frontMatterFormOfLines(lines: readonly string[]): FrontMatterForm | null {
	const fm = frontKeys(lines);
	if (!fm.open) return null;
	// the last line of a key the reader reads is the one it keeps (parseBooklet), so it is the one the row shows
	const last = new Map<string, FrontKey>();
	for (const k of fm.keys) last.set(k.key, k);
	const fields: FrontMatterField[] = FRONT_MATTER_KEYS.map((key) => {
		const k = last.get(key);
		const locked = k && k.more > 0 ? "This value is written over several lines (a list), so it is changed in the Markdown." : null;
		const base = { key, value: k ? valueOf(k.raw) : "", present: !!k, locked };
		return key === "start" ? { ...base, type: "choice" as const, options: START_VALUES } : { ...base, type: "text" as const };
	});
	const other: FrontMatterOther[] = [];
	for (const k of fm.keys) {
		if (k.key === "booklet" || FRONT_MATTER_KEYS.includes(k.key)) continue;
		const text = lines.slice(k.line, k.line + 1 + k.more).map(noCr).join("\n");
		other.push({ key: k.key, text, line: k.line });
	}
	const marker = last.get("booklet");
	return { marker: marker ? valueOf(marker.raw) : "", fields, other };
}

/** The form of a note's front matter, or null when the node is not the front matter. */
export function frontMatterFormOf(text: string, node: DesignNode): FrontMatterForm | null {
	if (node.kind !== "front-matter") return null;
	return frontMatterFormOfLines(text.split("\n").slice(node.start, node.end));
}

export interface FrontMatterChange {
	/** One of `FRONT_MATTER_KEYS`: the marker and the keys without a row are not changed here. */
	key: string;
	/** The new value, as the reader will take it; "" takes the key's line out. */
	value: string;
}

/** A value written as it is, when YAML would take it for the same string; else in double quotes (JSON's escapes are YAML's). */
const PLAIN = /^[^\s"'#&*!|>%@`{}[\],:?-][^#]*$/;
const SPECIAL = /^(?:true|false|yes|no|on|off|null|~|[-+]?(?:\d[\d_]*\.?\d*|\.\d+)(?:e[-+]?\d+)?|0x[0-9a-f]+)$/i;
function writtenValue(old: string | null, value: string): string {
	const double = JSON.stringify(value);
	if (old !== null) {
		const t = old.trim();
		if (/^".*"$/.test(t)) return double;
		if (/^'.*'$/.test(t)) return `'${value.replace(/'/g, "''")}'`;
	}
	const plain = value === value.trim() && PLAIN.test(value) && !SPECIAL.test(value) && !/:(?:\s|$)/.test(value) && !/\s#/.test(value);
	return plain ? value : double;
}

/**
 * One row's change, as a change of the front matter's lines: the key's own line rewritten (a value in quotes keeps its kind of quotes,
 * a new value is written plain when YAML reads it back the same and in double quotes when not), and nothing else. A key the front
 * matter does not have is added as one line just above the closing `---`; a "" value takes the key's line out. Refused, with a reason and
 * nothing changed: the marker, a key the form has no row for, a value with a line break, `start` with a value but `home`, a key written
 * over several lines, lines that do not open with `---` or are never closed.
 */
export function applyFrontMatterChange(lines: readonly string[], change: FrontMatterChange): { ok: true; lines: string[] } | { ok: false; reason: string } {
	const no = (reason: string): { ok: false; reason: string } => ({ ok: false, reason });
	if (change.key === "booklet") return no("A reader never changes a file's marker, so the view leaves it as it is.");
	if (!FRONT_MATTER_KEYS.includes(change.key)) return no("That key is kept as written: the view has no row for it.");
	if (/[\r\n]/.test(change.value)) return no("A front matter value is one line.");
	if (change.key === "start" && !START_VALUES.includes(change.value)) return no("`start` takes only the value `home`, or nothing.");
	const fm = frontKeys(lines);
	if (!fm.open) return no("This note has no front matter to change.");
	if (fm.close < 0) return no("The front matter is never closed (it has no second `---` line), so it is left as it is.");
	const mine = fm.keys.filter((k) => k.key === change.key);
	const at = mine[mine.length - 1];
	if (at && at.more > 0) return no("This value is written over several lines (a list), so it is changed in the Markdown.");
	const crlf = (lines[fm.close] ?? "").endsWith("\r");
	const out = [...lines];
	if (!at) {
		if (change.value === "") return { ok: true, lines: out };
		out.splice(fm.close, 0, `${change.key}: ${writtenValue(null, change.value)}${crlf ? "\r" : ""}`);
		return { ok: true, lines: out };
	}
	if (change.value === "") {
		out.splice(at.line, 1);
		return { ok: true, lines: out };
	}
	const cr = (lines[at.line] ?? "").endsWith("\r") ? "\r" : "";
	// the key keeps its spelling and the spaces after its colon
	const keyText = (lines[at.line] ?? "").slice(0, change.key.length);
	if (valueOf(at.raw) === change.value) return { ok: true, lines: out };
	out[at.line] = `${keyText}:${at.gap || " "}${writtenValue(at.raw, change.value)}${cr}`;
	return { ok: true, lines: out };
}

/** A front matter row's change on the note, as `changeForm` is for a block's: the change of the node's own lines, with what it would leave not matching, or the refusal. */
export function changeFrontMatter(text: string, node: DesignNode, change: FrontMatterChange): OpResult {
	if (node.kind !== "front-matter") return { ok: false, reason: "That is not the front matter." };
	const lines = blockLines(text, node);
	const made = applyFrontMatterChange(lines, change);
	if (!made.ok) return { ok: false, reason: made.reason };
	const op = changeLines(text, node, made.lines);
	if (op.ok && op.breaks) return { ok: false, reason: `The reader could not open the booklet with that: ${op.breaks}` };
	return op;
}
