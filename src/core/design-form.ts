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
 * One row's change, as a change of the block's own lines. Refused, with a reason and nothing written, when the value is not one the
 * format takes, when an id is used twice where it must not be, or when the reader could open the booklet and would not be able to.
 */
export function changeForm(text: string, node: DesignNode, change: FormChange): OpResult {
	const lines = blockLines(text, node);
	const p = parseLine(lines[0] ?? "");
	if (!p) return { ok: false, reason: "That is not a Booklet line, so it has no settings to change." };
	let edit: Edit;
	switch (change.what) {
		case "id": {
			// the clashes the reader and the linter would find are the ones the panel already refuses: its own check decides, on the note
			const clash = renameId(text, node.start, change.value);
			if ("error" in clash) return { ok: false, reason: clash.error };
			edit = setId(p, change.value);
			break;
		}
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
	const op = changeLines(text, node, [edit.text, ...lines.slice(1)]);
	if (op.ok && op.breaks) return { ok: false, reason: `The reader could not open the booklet with that: ${op.breaks}` };
	return op;
}
