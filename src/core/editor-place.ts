/*
 * Where a click on the panel puts its piece, and the one editor change that does it.
 *
 * The piece goes at the cursor, as a block of its own lines: never into the middle of a line, and never between a Booklet line and
 * what it claims below it (its `>` body, a choice's options, a scale's anchors). So:
 *   - on a blank line, the piece goes there;
 *   - on a Booklet line, or on a line it claims, the piece goes after the last line it claims;
 *   - in a fence (or on the `^id` line after one), after the fence and its id;
 *   - anywhere else (prose, a list, a table), after the paragraph: at the next blank line.
 * A blank line is added above and below where needed, so the piece stands apart as Markdown requires.
 *
 * Inside a group's body (its `>` lines) the piece is written the way the group's own lines are, with one more `>` on every line
 * (`> > [!choice|...]`, `> - [ ] ...`, `>` for a blank line), and placed by the same rules among the group's lines read with one `>`
 * less. A piece that cannot sit inside a group (a module, an activity, a tab, a page, a row, a data section, front matter, a theme)
 * goes after the whole group instead.
 *
 * Dropping a piece on the editor (`planDrop`) is the same plan, from the line the drop landed on. Plain TypeScript: nothing here
 * imports Obsidian.
 */
import { instantiate } from "./editor-ids";
import { LP } from "./editor-patterns";
import { bodyEnd, fenceEnd } from "./lines";
import { claimEnd, scan, stateBefore } from "./editor-scan";

const NOT_IN_GROUP = new Set(["module", "activity", "tab", "page", "row", "data", "records"]);
const at = (lines: readonly string[], i: number): string => lines[i] ?? "";

/** Can this piece's text sit inside a group? */
export function fitsInGroup(pieceText: string): boolean {
	const t = scan(pieceText);
	if (t.hasFrontMatter) return false;
	for (const it of t.items) {
		if (it.kind && NOT_IN_GROUP.has(it.kind)) return false;
		if (it.type === "module" || it.type === "module-end" || it.type === "activity" || it.type === "tab" || it.type === "page-named" || it.type === "data") return false;
		if (it.type === "fence" && /^booklet[ \t]+theme\b/i.test(it.info ?? "")) return false;
	}
	return true;
}

/** The group whose body holds line c (its `>` lines after the group line), or null. */
export function groupAround(lines: readonly string[], c: number): { head: number; end: number } | null {
	if (c >= lines.length || !at(lines, c).startsWith(">") || LP.CALLOUT_ANY.test(at(lines, c))) return null;
	let j = c;
	while (j > 0 && at(lines, j).startsWith(">") && !LP.CALLOUT_ANY.test(at(lines, j))) j--;
	const m = LP.CALLOUT_LINE.exec(at(lines, j));
	if (!m || (m[1] ?? "").toLowerCase() !== "group") return null;
	return { head: j, end: bodyEnd(lines, j) };
}

/** The index after the block that holds line c, among `lines` (one level of the document: the top, or a group's body). */
export function blockEnd(lines: readonly string[], c: number): number {
	// a fence holding c, or the `^id` line after one
	let fence: string | null = null;
	let open = -1;
	for (let k = 0; k <= c && k < lines.length; k++) {
		const m = LP.FENCE_LINE.exec(at(lines, k));
		if (fence === null && m) {
			fence = m[1] ?? "";
			open = k;
			continue;
		}
		if (fence !== null) {
			const z = LP.FENCE_CLOSE.exec(at(lines, k));
			const zm = z?.[1] ?? "";
			if (z && zm.charAt(0) === fence.charAt(0) && zm.length >= fence.length) {
				if (k === c) break;
				fence = null;
			}
		}
	}
	const afterFence = (k: number): number => {
		let m = k + 1;
		while (m < lines.length && !at(lines, m).trim()) m++;
		return m < lines.length && LP.BLOCK_ID.test(at(lines, m).trim()) ? m + 1 : k + 1;
	};
	if (fence !== null) return afterFence(fenceEnd(lines, open, fence));
	if (LP.BLOCK_ID.test(at(lines, c).trim())) return c + 1;

	// a Booklet line, or a line one claims
	const here = LP.CALLOUT_LINE.exec(at(lines, c));
	if (here) return claimEnd((here[1] ?? "").toLowerCase(), lines, c);
	for (let j = c - 1; j >= 0; j--) {
		const m = LP.CALLOUT_LINE.exec(at(lines, j));
		if (m) {
			const end = claimEnd((m[1] ?? "").toLowerCase(), lines, j);
			if (end > c) return end;
			break;
		}
	}
	// prose: the next blank line
	let k = c + 1;
	while (k < lines.length && at(lines, k).trim()) k++;
	return k;
}

export interface Placement {
	/** A line index of the document: the piece goes before it. */
	at: number;
	/** How many `>` its lines take. */
	depth: number;
	local?: string[];
	localAt?: number;
}

/** Where the block goes. `inGroup` is whether the piece may sit in a group. */
export function placement(lines: readonly string[], c: number, inGroup: boolean): Placement {
	c = Math.max(0, Math.min(c, lines.length - 1));
	const g = inGroup ? groupAround(lines, c) : null;
	if (g) {
		// the group's body, read with one `>` less, then placed recursively (a group inside a group)
		const body = lines.slice(g.head + 1, g.end).map((l) => l.replace(LP.QUOTE, ""));
		const inner = placement(body, c - g.head - 1, inGroup);
		return { at: g.head + 1 + inner.at, depth: inner.depth + 1, local: body, localAt: inner.at };
	}
	if (inGroup === false) {
		// a piece that cannot go in a group, with the cursor in one: after the whole group
		const h = groupAround(lines, c);
		if (h) return { at: h.end, depth: 0 };
	}
	if (!at(lines, c).trim()) return { at: c, depth: 0 };
	return { at: blockEnd(lines, c), depth: 0 };
}

export const quoteLine = (line: string, depth: number): string => (depth === 0 ? line : line === "" ? ">" + " >".repeat(depth - 1) : "> ".repeat(depth) + line);

export interface Pos {
	line: number;
	ch: number;
}

export interface InsertPlan {
	from: Pos;
	text: string;
	anchor: Pos;
	head: Pos;
	assigned: Record<string, string>;
	left: string[];
	at: number;
	depth: number;
}

/**
 * The editor change for a click.
 *   docText   the note's text
 *   cursor    { line, ch }
 *   pieceText the piece's text
 * Returns { from, text, anchor, head, assigned, left }: replaceRange(text, from) makes the change, and anchor..head is then the
 * placeholder to type over (anchor === head puts the cursor after the piece).
 */
export function planInsert(docText: string, cursor: Pos, pieceText: string): InsertPlan {
	const doc = scan(docText);
	const lines = doc.lines;
	const fits = fitsInGroup(pieceText);
	const pl = placement(lines, cursor.line, fits);
	const state = stateBefore(doc, pl.at);
	const inst = instantiate(pieceText, doc, state);
	const body = inst.text.split("\n");

	// a blank line above and below where the neighbours are not blank (inside a group, a blank line is a bare `>`)
	const isBlank = (s: string | undefined): boolean => s === undefined || !s.replace(/^(?:>[ \t]?)*/, "").trim();
	const above = lines[pl.at - 1];
	const below = lines[pl.at];
	let before = 0;
	const out: string[] = [];
	const local = pl.local ?? [];
	const localAt = pl.localAt ?? 0;
	if (pl.depth > 0) {
		if (localAt > 0 && !isBlank(local[localAt - 1])) {
			out.push(quoteLine("", pl.depth));
			before = 1;
		}
	} else if (pl.at > 0 && above !== undefined && above.trim()) {
		out.push("");
		before = 1;
	}
	for (const l of body) out.push(quoteLine(l, pl.depth));
	if (pl.depth > 0) {
		if (localAt < local.length) {
			if (!isBlank(local[localAt])) out.push(quoteLine("", pl.depth));
		} else if (below !== undefined && below.trim()) out.push("");
	} else if (below !== undefined && below.trim()) out.push("");

	let from: Pos;
	let first: number;
	if (pl.at < lines.length) {
		from = { line: pl.at, ch: 0 };
		first = pl.at;
	} else {
		const last = at(lines, lines.length - 1);
		from = { line: lines.length - 1, ch: last.length };
		first = lines.length;
	}
	const text = pl.at < lines.length ? out.join("\n") + "\n" : "\n" + out.join("\n");
	const prefix = pl.depth === 0 ? 0 : "> ".repeat(pl.depth).length;
	let anchor: Pos;
	let head: Pos;
	if (inst.selection) {
		const line = first + before + inst.selection.line;
		anchor = { line, ch: inst.selection.ch + prefix };
		head = { line, ch: inst.selection.endCh + prefix };
	} else {
		const line = first + before + body.length - 1;
		anchor = head = { line, ch: quoteLine(body[body.length - 1] ?? "", pl.depth).length };
	}
	return { from, text, anchor, head, assigned: inst.assigned, left: inst.left, at: pl.at, depth: pl.depth };
}

/** A drop on the editor at `line`: the same change as a click with the cursor on that line. */
export const planDrop = (docText: string, line: number, pieceText: string): InsertPlan => planInsert(docText, { line, ch: 0 }, pieceText);

/** The document with a planned change made, as the editor would make it (for the tests). */
export function applyPlan(docText: string, plan: InsertPlan): string {
	const lines = docText.split("\n");
	let off = 0;
	for (let k = 0; k < plan.from.line; k++) off += at(lines, k).length + 1;
	off += plan.from.ch;
	return docText.slice(0, off) + plan.text + docText.slice(off);
}
