/*
 * What an activity's segments make when callouts, rows and steps are read as the nesting they stand for (SPEC sections 3
 * and 6): the reader leaves them flat, a callout opening and closing around what it holds and a row's two marker lines
 * around its cells, and the view draws the tree this makes. Also the footnotes' side: which marks a text holds, and what
 * a mark leads to. Nothing here touches Obsidian or the note.
 */
import { fencedLines, isBlank } from "./lines";
import type { Booklet, CalloutStart, Note, Prose, Question, Segment } from "./reader";

/** A callout and what it holds. */
export interface CalloutBox {
	type: "callout-box";
	start: CalloutStart;
	children: Block[];
}

/** A row and its cells, each cell the blocks it holds, side by side where there is room. */
export interface RowBox {
	type: "row-box";
	line: number;
	cells: Block[][];
}

export type Block = Exclude<Segment, { type: "callout" | "callout-end" | "row" }> | CalloutBox | RowBox;

/** The segments of a page (or of an activity's opening) as a tree. A callout or a row left open at the end is closed there. */
export function treeOf(segs: readonly Segment[]): Block[] {
	const root: Block[] = [];
	const stack: CalloutBox[] = [];
	let row: { line: number; children: Block[] } | null = null;
	const here = (): Block[] => row?.children ?? stack[stack.length - 1]?.children ?? root;
	const closeRow = () => {
		if (!row) return;
		const done: RowBox = { type: "row-box", line: row.line, cells: cellsOf(row.children) };
		row = null;
		here().push(done);
	};
	for (const s of segs) {
		if (s.type === "callout") {
			const box: CalloutBox = { type: "callout-box", start: s, children: [] };
			here().push(box);
			stack.push(box);
		} else if (s.type === "callout-end") {
			closeRow();
			stack.pop();
		} else if (s.type === "row") {
			if (s.end) closeRow();
			else if (!row) row = { line: s.line, children: [] };
		} else here().push(s);
	}
	closeRow();
	return root;
}

/** Every question under these nodes, in order. */
export function questionsIn(nodes: readonly Block[]): Question[] {
	const out: Question[] = [];
	for (const n of nodes) {
		if (n.type === "question") out.push(n);
		else if (n.type === "callout-box") out.push(...questionsIn(n.children));
		else if (n.type === "row-box") for (const c of n.cells) out.push(...questionsIn(c));
	}
	return out;
}

/* ---- a row's cells (SPEC section 3, "Rows: things side by side") ---- */

const ATX = /^ {0,3}(#{1,6})[ \t]+\S/;

/** The heading a line is, and its level: `#` to `######`, or a line underlined by `===` (level 1) or `---` (level 2). */
function headingAt(lines: readonly string[], i: number, fenced: readonly boolean[]): number {
	if (fenced[i]) return 0;
	const a = ATX.exec(lines[i] ?? "");
	if (a) return (a[1] ?? "").length;
	const next = lines[i + 1] ?? "";
	if (!isBlank(lines[i]) && !(lines[i] ?? "").startsWith(">") && !fenced[i + 1]) {
		if (/^ {0,3}=+[ \t]*$/.test(next)) return 1;
		if (/^ {0,3}-+[ \t]*$/.test(next)) return 2;
	}
	return 0;
}

/** Where a block of prose starts a new cell, and the level of each heading that does. */
function headingsOf(markdown: string): { at: number; level: number; span: number }[] {
	const lines = markdown.split("\n");
	const fenced = fencedLines(lines);
	const out: { at: number; level: number; span: number }[] = [];
	for (let i = 0; i < lines.length; i++) {
		const level = headingAt(lines, i, fenced);
		if (!level) continue;
		const setext = !ATX.test(lines[i] ?? "");
		out.push({ at: i, level, span: setext ? 2 : 1 });
		if (setext) i++;
	}
	return out;
}

/** The blocks of prose, as the lines between blank lines (a fenced code block, and a list that holds blank lines, stay whole). */
function blocksOf(markdown: string): string[] {
	const lines = markdown.split("\n");
	const fenced = fencedLines(lines);
	const out: string[][] = [];
	let cur: string[] = [];
	const push = () => {
		if (cur.length) out.push(cur);
		cur = [];
	};
	lines.forEach((l, i) => {
		if (!fenced[i] && isBlank(l)) {
			const prev = cur[0] ?? "";
			const after = lines.slice(i + 1).find((x) => !isBlank(x)) ?? "";
			// a list goes on over a blank line when the next line is another item or is indented under one
			if (/^[ \t]*(?:[-*+]|\d+[.)])[ \t]/.test(prev) && /^(?:[ \t]+\S|[ \t]*(?:[-*+]|\d+[.)])[ \t])/.test(after)) cur.push(l);
			else push();
		} else cur.push(l);
	});
	push();
	return out.map((b) => b.join("\n").replace(/\n+$/, ""));
}

const prose = (markdown: string, line: number): Prose => ({ type: "prose", markdown, line });

/**
 * A row's cells. Each heading at the shallowest level inside the row starts a cell, and anything before the first heading
 * is a cell of its own; with no headings at all, each block is a cell. A question, a query or a callout goes into the cell
 * it stands in, or is a cell of its own where there are no headings.
 */
export function cellsOf(children: readonly Block[]): Block[][] {
	let shallowest = 7;
	for (const c of children) if (c.type === "prose") for (const h of headingsOf(c.markdown)) shallowest = Math.min(shallowest, h.level);
	const cells: Block[][] = [];
	if (shallowest > 6) {
		for (const c of children) {
			if (c.type !== "prose") cells.push([c]);
			else for (const b of blocksOf(c.markdown)) if (b.trim()) cells.push([prose(b, c.line)]);
		}
		return cells;
	}
	let cur: Block[] | null = null;
	const into = (n: Block) => {
		if (!cur) cells.push((cur = []));
		cur.push(n);
	};
	for (const c of children) {
		if (c.type !== "prose") {
			into(c);
			continue;
		}
		const lines = c.markdown.split("\n");
		const starts = headingsOf(c.markdown).filter((h) => h.level === shallowest);
		let from = 0;
		for (const h of [...starts, { at: lines.length, level: 0, span: 0 }]) {
			const part = lines.slice(from, h.at).join("\n").replace(/^\n+|\n+$/g, "");
			if (part.trim()) into(prose(part, c.line + from));
			if (h.level) cells.push((cur = []));
			from = h.at;
		}
	}
	return cells.filter((cell) => cell.length);
}

/* ---- steps (SPEC section 12, "one at a time") ---- */

export interface Step {
	/** What the step draws: its group, with what comes between it and the group before it (the last also what follows it). */
	nodes: Block[];
	group: CalloutBox;
}

/**
 * The steps of a part on show (a page): its groups, taken one at a time when there are two or more. What comes before the
 * first group is the lead, drawn whole above every step; what comes between two groups goes with the group after it, and
 * what follows the last group goes with the last. A question outside every group is never a step of its own. With fewer
 * than two groups there is no step view.
 */
export function stepsOf(nodes: readonly Block[]): { lead: Block[]; steps: Step[] } {
	const steps: Step[] = [];
	const lead: Block[] = [];
	let between: Block[] = [];
	for (const n of nodes) {
		if (n.type === "callout-box" && n.start.kind.toLowerCase() === "group") {
			steps.push({ nodes: [...between, n], group: n });
			between = [];
		} else if (steps.length) between.push(n);
		else lead.push(n);
	}
	if (steps.length < 2) return { lead: [...nodes], steps: [] };
	if (between.length) (steps[steps.length - 1] as Step).nodes.push(...between);
	return { lead, steps };
}

/* ---- footnotes and citations (SPEC section 6, "Citations") ---- */

const MARK = /\[\^([A-Za-z0-9][A-Za-z0-9_.:-]*)\]/g;

/** The footnote ids a text holds marks for, in reading order; a mark in a fenced block or in code is not one. */
export function marksIn(markdown: string): string[] {
	if (!markdown.includes("[^")) return [];
	const lines = markdown.split("\n");
	const fenced = fencedLines(lines);
	const out: string[] = [];
	lines.forEach((l, i) => {
		if (fenced[i]) return;
		for (const m of l.replace(/`[^`]*`/g, "").matchAll(MARK)) out.push(m[1] as string);
	});
	return out;
}

/** The note a mark leads to, as a module sees it: its own module's first, then the plain data section's. */
export function noteFor(book: Pick<Booklet, "notes">, scope: string, id: string): Note | undefined {
	return book.notes.find((n) => n.id === id && n.scope === scope) ?? book.notes.find((n) => n.id === id && n.scope === null);
}

/** The numbers of the notes the texts mark, in the order they are first marked; a mark with no note has none. */
export function noteNumbers(book: Pick<Booklet, "notes">, scope: string, texts: readonly string[]): Map<string, number> {
	const out = new Map<string, number>();
	for (const t of texts) for (const id of marksIn(t)) if (!out.has(id) && noteFor(book, scope, id)) out.set(id, out.size + 1);
	return out;
}
