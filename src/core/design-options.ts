/*
 * The rows of a block that is a list: a choice or multi's options (each with its replies), a shared menu's items, and a matrix's items and
 * anchors, as data the Design view's editor draws as one row each. Plain TypeScript: nothing here imports Obsidian or the DOM.
 *
 * ONLY WHAT IS LOSSLESS. `readRows` reads a block's own lines (written without the `>` marks of the groups around it) into rows, and keeps
 * in every row every byte that is not its words: the indent, the bullet, the spaces after it, the mark in `[ ]`, the spaces after the box,
 * a number's dot or bracket. `writeRows` is its exact inverse. The editor offers rows only when `writeRows(readRows(lines))` is the same
 * lines (the check is made here, last, so no shape the reader can read in a way the rows would not is let through by a gap in the list
 * below). Every other shape is refused, with a reason in plain words, and the editor shows the Markdown alone: nothing is rewritten to
 * fit. The refused shapes are the ones where the rows could only be shown by changing something the person wrote: a tab, a blank line
 * inside a list (the format reads what follows it as text), a reply that goes on over a second line or is nested deeper than another,
 * options at different indents, a line under the list that is no part of it, a question that has options of its own and also names a shared
 * menu (the reader uses the options and ignores the menu), a checkbox in a menu entry (the reader takes it off).
 *
 * An edit (`editRows`) makes the rows it is asked for and nothing else: a row it does not touch comes out byte for byte as it was, a new
 * row copies the style of its neighbour. The result is read again; an edit whose text the format would read as something else (a reply
 * that starts `[ ]` is an option) is refused, with nothing changed.
 *
 * Options, items and anchors are identified by POSITION (SPEC section 5), so an edit that removes, inserts before or moves one changes
 * what a kept answer means: that is not decided here. The change goes through `changeLines` like every other, and the guard
 * (editor-guard.ts `impactOf`) counts what it would detach and the view asks before writing.
 */
import { applyFormChange } from "./design-form";
import { parseLine } from "./editor-line";
import { LP } from "./editor-patterns";
import { parseBooklet, questionsOf } from "./reader";

export type RowsKind = "choice" | "multi" | "menu" | "matrix" | "scale";

/** One bullet under an option: the words of one line of its reply. */
export interface ReplyRow {
	indent: string;
	marker: string;
	gap: string;
	text: string;
}

/** One option of a choice or a multi: `- [ ] words`, and the bullets nested under it. */
export interface OptionRow {
	indent: string;
	marker: string;
	/** The spaces between the bullet and the box. */
	pre: string;
	/** What is in the box: a space, `x` or `X`. */
	mark: string;
	/** The spaces after the box. */
	post: string;
	text: string;
	replies: ReplyRow[];
}

/** One bullet of a shared menu, or one item of a matrix. */
export interface ItemRow {
	indent: string;
	marker: string;
	gap: string;
	text: string;
}

/** One numbered line of a matrix's anchors: the number is the stored answer. */
export interface AnchorRow {
	indent: string;
	/** Digits, as written. */
	number: string;
	/** `.` or `)`. */
	sep: string;
	gap: string;
	text: string;
}

export interface ChoiceRows {
	kind: "choice" | "multi";
	/** The question's line and the `>` lines of its help, as written. */
	head: string[];
	/** The one blank line between the head and the list, as written, or null. */
	gap: string | null;
	/** The shared menu the line names (`menu:id`), or null. A question that names one has no options of its own. */
	menu: string | null;
	options: OptionRow[];
	/** What follows the list as written (see `tailOf`): the blank line and the hint or solution callouts the question owns. */
	tail: string[];
}

export interface MenuRows {
	kind: "menu";
	head: string[];
	gap: string | null;
	items: ItemRow[];
	tail: string[];
}

export interface MatrixRows {
	kind: "matrix";
	head: string[];
	/** The blank line between the head and the first list, as written, or null. */
	lead: string | null;
	items: ItemRow[];
	/** The blank line between the two lists, as written, or null. */
	mid: string | null;
	anchors: AnchorRow[];
	tail: string[];
}

/** A scale: its anchors, the numbered list under its line. The number is the stored answer. */
export interface ScaleRows {
	kind: "scale";
	head: string[];
	/** The blank line between the head and the list, as written, or null (a list that starts at `0.` needs one, SPEC section 4). */
	gap: string | null;
	anchors: AnchorRow[];
	tail: string[];
}

export type Rows = ChoiceRows | MenuRows | MatrixRows | ScaleRows;

export interface RowsRefused {
	refused: string;
}

/** The kinds the editor has rows for. */
/** Is this a choice's or a multi's rows? (The two kinds share one shape, so a plain test of `kind` does not narrow.) */
export const isChoiceRows = (r: Rows): r is ChoiceRows => r.kind === "choice" || r.kind === "multi";

export const ROWS_KINDS: readonly RowsKind[] = ["choice", "multi", "menu", "matrix", "scale"];

const isRowsKind = (k: string): k is RowsKind => (ROWS_KINDS as readonly string[]).includes(k);

/** The kind of rows a block's first line asks for, or null (it is not one of those lines, or it is a closing line). */
export function rowsKindOf(lines: readonly string[]): RowsKind | null {
	const p = parseLine(lines[0] ?? "");
	if (!p || p.quotes || !isRowsKind(p.kind) || p.flags.has("end")) return null;
	return p.kind;
}

/** A reader's option line: any indent, tabs and a capital X included (the reader's `OPTION_RE`). */
const READER_OPTION = /^[ \t]*[-*+][ \t]+\[[ xX]\][ \t]+/;
const OPTION = /^( *)([-*+])( +)\[( |x|X)\]( +)(.*)$/;
const BULLET = /^( *)([-*+])( +)(.*)$/;
const ANCHOR = /^( *)([0-9]+)([.)])( +)(.*)$/;
const CHECKBOX = /^\[[ xX]\][ \t]/;

const blank = (s: string | undefined): boolean => !s || !s.trim();
const refuse = (refused: string): RowsRefused => ({ refused });
const quoted = (line: string): string => `“${line.trim().length > 40 ? `${line.trim().slice(0, 40)}…` : line.trim()}”`;

const unshown = (line: string): RowsRefused => refuse(`There is a line under the list that the rows cannot show: ${quoted(line)}. Edit it in the Markdown.`);

/** The index past the first line and the `>` lines of its body (a `> [!` line ends them), as the reader's `bodyEnd`. */
function headEnd(lines: readonly string[]): number {
	let k = 1;
	while (k < lines.length && (lines[k] ?? "").startsWith(">") && !LP.CALLOUT_ANY.test(lines[k] ?? "")) k++;
	return k;
}

/**
 * Where the lines that are not the question's list start: a `hint` or a `solution` callout straight under a question is the question's
 * own (design-tree.ts), so its lines, and the blank lines before it, are inside the block's lines. They are kept as written and never
 * shown as rows. The index in `after` (the lines past the head) where they start, or its length when there are none.
 */
function tailAt(after: readonly string[]): number {
	for (let i = 0; i < after.length; i++) {
		const p = parseLine(after[i] ?? "");
		if (!p || p.quotes || (p.kind !== "hint" && p.kind !== "solution")) continue;
		let from = i;
		while (from > 0 && blank(after[from - 1])) from--;
		return from;
	}
	return after.length;
}

/** The rows of a block's own lines, or why it has none. `kind` is the block's kind (`rowsKindOf` gives it from the lines). */
export function readRows(lines: readonly string[], kind: RowsKind): Rows | RowsRefused {
	const out = read(lines, kind);
	if ("refused" in out) return out;
	// the last word: the rows write back exactly what they were read from
	if (writeRows(out).join("\n") !== lines.join("\n")) return refuse("The rows could not write this block back exactly as it is, so it is edited in the Markdown.");
	return out;
}

function read(lines: readonly string[], kind: RowsKind): Rows | RowsRefused {
	const p = parseLine(lines[0] ?? "");
	if (!p || p.kind !== kind) return refuse("The first line is not a Booklet line of this kind.");
	if (p.quotes) return refuse("The first line starts with extra > marks, so it is edited in the Markdown.");
	if (p.flags.has("end")) return refuse("This is a closing line, which has no rows.");
	for (const l of lines) if (l.includes("\t")) return refuse("A line holds a tab, which the rows would not keep as it is.");
	for (const l of lines) if (l.includes("\r")) return refuse("A line holds a stray carriage return, which the rows would not keep as it is.");
	const he = headEnd(lines);
	const head = lines.slice(0, he);
	const after = lines.slice(he);
	const cut = tailAt(after);
	let rest = after.slice(0, cut);
	const tail = after.slice(cut);
	let gap: string | null = null;
	if (rest.length && blank(rest[0])) {
		gap = rest[0] ?? "";
		rest = rest.slice(1);
		if (rest.length && blank(rest[0])) return refuse("There are two blank lines under the question, so the format does not read the list under them as its own.");
	}
	if (kind === "choice" || kind === "multi") {
		const menu = (p.values.get("menu") ?? "") || null;
		const r = readOptions(rest);
		if ("refused" in r) return r;
		if (menu && r.length) return refuse(`The question names the shared menu ${menu} and has options of its own: the reader uses the options and ignores the menu. Edit it in the Markdown.`);
		return { kind, head, gap, menu, options: r, tail };
	}
	if (kind === "menu") {
		const r = readItems(rest, 0, "menu");
		if ("refused" in r) return r;
		if (r.next < rest.length) return unshown(rest[r.next] ?? "");
		return { kind, head, gap, items: r.items, tail };
	}
	if (kind === "scale") {
		const anchors = readAnchors(rest, 0);
		return "refused" in anchors ? anchors : { kind, head, gap, anchors, tail };
	}
	const r = readItems(rest, 0, "matrix");
	if ("refused" in r) return r;
	let at = r.next;
	let mid: string | null = null;
	if (r.items.length && at < rest.length && blank(rest[at])) {
		mid = rest[at] ?? "";
		at++;
		if (at < rest.length && blank(rest[at])) return refuse("There are two blank lines between the items and the anchors, so the format does not read the anchors as part of the matrix.");
	}
	const anchors = readAnchors(rest, at);
	if ("refused" in anchors) return anchors;
	return { kind, head, lead: gap, items: r.items, mid, anchors, tail };
}

/** The numbered lines of a list from `from` to its end (a scale's, a matrix's): every line must be an anchor, at one indent. */
function readAnchors(rest: readonly string[], from: number): AnchorRow[] | RowsRefused {
	const anchors: AnchorRow[] = [];
	for (let at = from; at < rest.length; at++) {
		const l = rest[at] ?? "";
		const m = ANCHOR.exec(l);
		if (!m) return unshown(l);
		const row: AnchorRow = { indent: m[1] ?? "", number: m[2] ?? "", sep: m[3] ?? ".", gap: m[4] ?? " ", text: m[5] ?? "" };
		if (anchors.length && row.indent !== anchors[0]?.indent) return refuse("The anchors are not all written at the same indent, so they are edited in the Markdown.");
		anchors.push(row);
	}
	return anchors;
}

function readOptions(list: readonly string[]): OptionRow[] | RowsRefused {
	const options: OptionRow[] = [];
	for (const l of list) {
		if (blank(l)) return refuse("There is a blank line inside the list: the format reads what follows it as text, not as options or replies. Edit it in the Markdown.");
		const cur = options[options.length - 1];
		if (READER_OPTION.test(l)) {
			const m = OPTION.exec(l);
			if (!m) return unshown(l);
			const row: OptionRow = { indent: m[1] ?? "", marker: m[2] ?? "-", pre: m[3] ?? " ", mark: m[4] ?? " ", post: m[5] ?? " ", text: m[6] ?? "", replies: [] };
			if (cur && row.indent !== options[0]?.indent) return refuse("The options are not all written at the same indent, so they are edited in the Markdown.");
			options.push(row);
			continue;
		}
		if (!cur) return refuse(`The first line under the question is not an option (\`- [ ] words\`): ${quoted(l)}. Edit it in the Markdown.`);
		const b = BULLET.exec(l);
		if (!b) return unshown(l);
		// a bullet written less far in than its option's own words is no reply: it ends the list
		if ((b[1] ?? "").length < textColOf(cur)) return unshown(l);
		const reply: ReplyRow = { indent: b[1] ?? "", marker: b[2] ?? "-", gap: b[3] ?? " ", text: b[4] ?? "" };
		if (cur.replies.length && reply.indent !== cur.replies[0]?.indent) return refuse("A reply is nested deeper than another reply of its option, so it is edited in the Markdown.");
		cur.replies.push(reply);
	}
	return options;
}

function readItems(list: readonly string[], from: number, as: "menu" | "matrix"): { items: ItemRow[]; next: number } | RowsRefused {
	const items: ItemRow[] = [];
	let at = from;
	for (; at < list.length; at++) {
		const l = list[at] ?? "";
		if (blank(l)) {
			if (as === "menu") return refuse("There is a blank line inside the list: the format ends the menu there. Edit it in the Markdown.");
			break;
		}
		const m = BULLET.exec(l);
		if (!m) {
			if (as === "menu") return unshown(l);
			break;
		}
		const row: ItemRow = { indent: m[1] ?? "", marker: m[2] ?? "-", gap: m[3] ?? " ", text: m[4] ?? "" };
		if (CHECKBOX.test(row.text)) return refuse(`An entry starts with a checkbox, which the reader takes off: ${quoted(l)}. Edit it in the Markdown.`);
		if (items.length && row.indent !== items[0]?.indent) return refuse("The entries are not all written at the same indent, so they are edited in the Markdown.");
		items.push(row);
	}
	return { items, next: at };
}

/** The column the words of an option start at: where a reply must start at the least. */
const textColOf = (o: OptionRow): number => o.indent.length + o.marker.length + o.pre.length;

const itemLine = (r: ItemRow): string => `${r.indent}${r.marker}${r.gap}${r.text}`;

/** The block's lines, written from its rows: the exact inverse of `readRows`. */
export function writeRows(rows: Rows): string[] {
	if (isChoiceRows(rows)) {
		const out = [...rows.head];
		if (rows.gap !== null && rows.options.length) out.push(rows.gap);
		for (const o of rows.options) {
			out.push(`${o.indent}${o.marker}${o.pre}[${o.mark}]${o.post}${o.text}`);
			for (const r of o.replies) out.push(`${r.indent}${r.marker}${r.gap}${r.text}`);
		}
		return [...out, ...rows.tail];
	}
	if (rows.kind === "menu") {
		const out = [...rows.head];
		if (rows.gap !== null && rows.items.length) out.push(rows.gap);
		for (const r of rows.items) out.push(itemLine(r));
		return [...out, ...rows.tail];
	}
	if (rows.kind === "scale") {
		const out = [...rows.head];
		if (rows.gap !== null && rows.anchors.length) out.push(rows.gap);
		for (const r of rows.anchors) out.push(`${r.indent}${r.number}${r.sep}${r.gap}${r.text}`);
		return [...out, ...rows.tail];
	}
	const out = [...rows.head];
	if (rows.lead !== null && (rows.items.length || rows.anchors.length)) out.push(rows.lead);
	for (const r of rows.items) out.push(itemLine(r));
	if (rows.mid !== null && rows.items.length && rows.anchors.length) out.push(rows.mid);
	for (const r of rows.anchors) out.push(`${r.indent}${r.number}${r.sep}${r.gap}${r.text}`);
	return [...out, ...rows.tail];
}

// ---------------------------------------------------------------- edits

export type RowsEdit =
	| { what: "option-text"; index: number; text: string }
	| { what: "option-correct"; index: number; on: boolean }
	| { what: "option-add" }
	| { what: "option-move"; index: number; by: -1 | 1 }
	| { what: "option-remove"; index: number }
	| { what: "reply-text"; index: number; reply: number; text: string }
	| { what: "reply-add"; index: number }
	| { what: "reply-remove"; index: number; reply: number }
	| { what: "item-text"; index: number; text: string }
	| { what: "item-add" }
	| { what: "item-move"; index: number; by: -1 | 1 }
	| { what: "item-remove"; index: number }
	| { what: "anchor-text"; index: number; text: string }
	| { what: "anchor-number"; index: number; number: string }
	| { what: "anchor-add" }
	| { what: "anchor-move"; index: number; by: -1 | 1 }
	| { what: "anchor-remove"; index: number };

export type RowsMade = { ok: true; rows: Rows; lines: string[] } | { ok: false; reason: string };

/** What a person types as the words of a row: one line, and nothing before it that the bullet's own spaces would take. */
export const oneLine = (s: string): string => s.replace(/[\r\n]+/g, " ").replace(/^\s+/, "");

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

/** The rows after one edit, and the lines they write; refused (nothing changed) when the edit cannot be made or the format would read what it writes as something else. */
export function editRows(rows: Rows, edit: RowsEdit): RowsMade {
	const next = clone(rows);
	const bad = apply(next, edit);
	if (bad) return { ok: false, reason: bad };
	const lines = writeRows(next);
	const again = read(lines, next.kind);
	if ("refused" in again) return { ok: false, reason: `The format would read that text as something other than the row it is in. ${again.refused}` };
	// the rows read back are the rows asked for (a reply that starts `[ ] ` is an option; words with a leading space are not words)
	if (JSON.stringify(again) !== JSON.stringify(next)) return { ok: false, reason: "The format would read that text as something other than the row it is in (a reply that starts with `[ ]` is an option, for one)." };
	return { ok: true, rows: next, lines };
}

const nothing = "That row is not there any more.";

function swap<T>(list: T[], index: number, by: -1 | 1): boolean {
	const to = index + by;
	if (index < 0 || index >= list.length || to < 0 || to >= list.length) return false;
	const a = list[index] as T;
	list[index] = list[to] as T;
	list[to] = a;
	return true;
}

function apply(rows: Rows, edit: RowsEdit): string | null {
	if (isChoiceRows(rows)) return applyChoice(rows, edit);
	if (rows.kind === "menu") return applyItems(rows, rows.items, edit);
	if (rows.kind === "scale") return applyScale(rows, edit);
	return applyMatrix(rows, edit);
}

function applyChoice(rows: ChoiceRows, e: RowsEdit): string | null {
	const os = rows.options;
	switch (e.what) {
		case "option-text": {
			const o = os[e.index];
			if (!o) return nothing;
			o.text = oneLine(e.text);
			return null;
		}
		case "option-correct": {
			const o = os[e.index];
			if (!o) return nothing;
			// a mark that already says the same is left as it is (`X` stays `X`)
			if ((o.mark !== " ") !== e.on) o.mark = e.on ? "x" : " ";
			return null;
		}
		case "option-add": {
			if (rows.menu) return "This question takes its options from a shared menu, so it has none of its own to add to.";
			const last = os[os.length - 1];
			os.push({ indent: last?.indent ?? "", marker: last?.marker ?? "-", pre: last?.pre ?? " ", mark: " ", post: last?.post ?? " ", text: "", replies: [] });
			return null;
		}
		case "option-move":
			return swap(os, e.index, e.by) ? null : nothing;
		case "option-remove":
			if (!os[e.index]) return nothing;
			os.splice(e.index, 1);
			if (!os.length) rows.gap = null;
			return null;
		case "reply-text": {
			const r = os[e.index]?.replies[e.reply];
			if (!r) return nothing;
			r.text = oneLine(e.text);
			return null;
		}
		case "reply-add": {
			const o = os[e.index];
			if (!o) return nothing;
			const near = o.replies[0] ?? os.flatMap((x) => x.replies).find((x) => x.indent.length >= textColOf(o));
			o.replies.push({ indent: near?.indent ?? " ".repeat(textColOf(o)), marker: near?.marker ?? "-", gap: near?.gap ?? " ", text: "" });
			return null;
		}
		case "reply-remove": {
			const o = os[e.index];
			if (!o?.replies[e.reply]) return nothing;
			o.replies.splice(e.reply, 1);
			return null;
		}
		default:
			return "That is not an edit of a choice.";
	}
}

function applyItems(rows: MenuRows | MatrixRows, items: ItemRow[], e: RowsEdit): string | null {
	switch (e.what) {
		case "item-text": {
			const r = items[e.index];
			if (!r) return nothing;
			r.text = oneLine(e.text);
			return null;
		}
		case "item-add": {
			const last = items[items.length - 1];
			items.push({ indent: last?.indent ?? "", marker: last?.marker ?? "-", gap: last?.gap ?? " ", text: "" });
			return null;
		}
		case "item-move":
			return swap(items, e.index, e.by) ? null : nothing;
		case "item-remove":
			if (!items[e.index]) return nothing;
			items.splice(e.index, 1);
			if (!items.length && rows.kind === "menu") rows.gap = null;
			return null;
		default:
			return "That is not an edit of a list of items.";
	}
}

/** What an edit of an anchor makes of the anchors (null when the edit is not one of an anchor's); `structural`: the list's shape or numbers change, not only a word. */
function anchorEdit(as: AnchorRow[], e: RowsEdit): { bad: string | null; structural: boolean } | null {
	switch (e.what) {
		case "anchor-text": {
			const r = as[e.index];
			if (!r) return { bad: nothing, structural: false };
			r.text = oneLine(e.text);
			return { bad: null, structural: false };
		}
		case "anchor-number": {
			const r = as[e.index];
			if (!r) return { bad: nothing, structural: true };
			if (!/^[0-9]+$/.test(e.number)) return { bad: "An anchor's number is digits only: it is the answer that is kept.", structural: true };
			r.number = e.number;
			return { bad: null, structural: true };
		}
		case "anchor-add": {
			const last = as[as.length - 1];
			const n = last && /^[0-9]+$/.test(last.number) ? String(Number(last.number) + 1) : "1";
			as.push({ indent: last?.indent ?? "", number: n, sep: last?.sep ?? ".", gap: last?.gap ?? " ", text: "" });
			return { bad: null, structural: true };
		}
		case "anchor-move":
			return { bad: swap(as, e.index, e.by) ? null : nothing, structural: true };
		case "anchor-remove":
			if (!as[e.index]) return { bad: nothing, structural: true };
			as.splice(e.index, 1);
			return { bad: null, structural: true };
		default:
			return null;
	}
}

function applyMatrix(rows: MatrixRows, e: RowsEdit): string | null {
	const as = rows.anchors;
	const made = anchorEdit(as, e);
	const structural = made ? made.structural : e.what !== "item-text";
	const bad = made ? made.bad : applyItems(rows, rows.items, e);
	if (bad) return bad;
	if (!rows.items.length || !rows.anchors.length) rows.mid = null;
	// a numbered list that starts at 0 (or at any number but 1) needs a blank line above it, or Markdown folds it into the item above
	// (SPEC section 4): a blank line already there stays, and one is added only when a change to the lists leaves it needed
	if (structural && rows.items.length && rows.anchors.length && rows.mid === null && rows.anchors[0]?.number !== "1") rows.mid = "";
	if (!rows.items.length && !rows.anchors.length) rows.lead = null;
	return null;
}

function applyScale(rows: ScaleRows, e: RowsEdit): string | null {
	const made = anchorEdit(rows.anchors, e);
	if (!made) return "That is not an edit of a scale.";
	if (made.bad) return made.bad;
	if (!rows.anchors.length) rows.gap = null;
	// as for a matrix: a list that does not start at 1 needs the blank line above it, added only when a change leaves it needed
	else if (made.structural && rows.gap === null && rows.anchors[0]?.number !== "1") rows.gap = "";
	return null;
}

// ---------------------------------------------------------------- the shared menu a question names

/**
 * A question's lines with its shared menu set (`menu:id`, or taken off with null). Naming a menu puts the question's own options away:
 * the lines under its head are given back as `stash`, so the editor can put them back if the menu is taken off again before the
 * draft is saved. The result is read as rows again; refused, with a reason, when it is not a choice or a multi the rows can show.
 */
export function chooseMenu(lines: readonly string[], menu: string | null, stash: readonly string[] | null): { ok: true; lines: string[]; stash: string[] | null } | { ok: false; reason: string } {
	const kind = rowsKindOf(lines);
	if (kind !== "choice" && kind !== "multi") return { ok: false, reason: "Only a choice or a multi names a shared menu." };
	const rows = readRows(lines, kind);
	if ("refused" in rows) return { ok: false, reason: rows.refused };
	if (!isChoiceRows(rows)) return { ok: false, reason: "Only a choice or a multi names a shared menu." };
	const own = stash ? [...stash] : null;
	const set = applyFormChange([rows.head[0] ?? ""], { what: "value", name: "menu", value: menu ?? "" });
	if (!set.ok) return { ok: false, reason: set.reason };
	const head = [set.lines[0] ?? "", ...rows.head.slice(1)];
	if (menu) {
		// the options (with their replies, and the blank line above them) are put away
		const away = writeRows({ ...rows, tail: [] }).slice(rows.head.length);
		return { ok: true, lines: [...head, ...rows.tail], stash: away.length ? away : own };
	}
	const rest = lines.slice(1);
	const kept = [set.lines[0] ?? "", ...rest];
	// the menu is taken off: the options put away come back, when the question has none of its own
	if (!rows.options.length && stash?.length) {
		const back = [...head, ...stash, ...rows.tail];
		if (!("refused" in readRows(back, kind))) return { ok: true, lines: back, stash: null };
	}
	return { ok: true, lines: kept, stash: own };
}

// ---------------------------------------------------------------- shared menus: which a question sees, which questions use one

export interface MenuRef {
	id: string;
	/** The module the menu is written in, or null for one every module shares. */
	module: string | null;
	/** The line it starts on (0-based). */
	line: number;
}

/**
 * The shared menus the question that starts on this line can name: the ones of its own module (its fence and its data section) and the
 * ones every module shares, never another module's (SPEC section 4). `module` is the question's module ("" or null for an activity
 * outside every module).
 */
export function menusVisibleTo(text: string, questionLine: number): MenuRef[] {
	const book = parseBooklet(text);
	const mod = moduleOfQuestion(book, questionLine);
	return book.menus.filter((m) => m.module === null || m.module === mod).map((m) => ({ id: m.id, module: m.module, line: m.line - 1 }));
}

function moduleOfQuestion(book: ReturnType<typeof parseBooklet>, questionLine: number): string | null {
	for (const a of book.activities) for (const q of questionsOf(a)) if (q.line === questionLine + 1) return a.scope || null;
	return null;
}

/** The ids of the questions that read the menu that starts on this line: those with no options of their own that name it, in the module it is written in or from a module that sees it. */
export function menuUsers(text: string, menuLine: number): string[] {
	const book = parseBooklet(text);
	const menu = book.menus.find((m) => m.line === menuLine + 1);
	if (!menu) return [];
	const out: string[] = [];
	for (const a of book.activities) {
		for (const q of questionsOf(a)) {
			if (!q.menu || q.menu !== menu.id) continue;
			const mod = a.scope || null;
			const hit = book.menus.find((x) => x.id === q.menu && x.module === mod) ?? book.menus.find((x) => x.id === q.menu && x.module === null);
			if (hit === menu && !out.includes(q.id)) out.push(q.id);
		}
	}
	return out;
}
