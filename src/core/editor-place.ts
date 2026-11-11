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
 * Whatever holds the cursor line comes first, blank or not: a blank line inside a fence, inside a `%%` comment, between a fence and
 * its `^id`, or between a question and the list it claims is part of that block, so the piece goes after the block, never in it. The
 * records section is kept data: a piece is never placed in it (the plan says why not, and changes nothing), and a piece placed above
 * it stops at its first line. The cursor in the front matter places the piece after the front matter; the front matter piece itself
 * goes at the very top of the note and only when the note has none.
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
import { claimEnd, percentMarks, scan, stateBefore } from "./editor-scan";

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

/** The index of the line after a fence's closing line and the `^id` line that follows it (blank lines between them included), if there is one. */
function afterFence(lines: readonly string[], close: number): number {
	let m = close + 1;
	while (m < lines.length && !at(lines, m).trim()) m++;
	return m < lines.length && LP.BLOCK_ID.test(at(lines, m).trim()) ? m + 1 : close + 1;
}

/**
 * The index after the fence (with its `^id`) or the `%%` comment that holds line c, whether c is blank or not, or -1 when none does.
 * A comment is any run from a line with an odd number of `%%` marks to the next such line.
 */
export function holderEnd(lines: readonly string[], c: number): number {
	let k = 0;
	while (k < lines.length && k <= c) {
		const f = LP.FENCE_LINE.exec(at(lines, k));
		if (f) {
			const end = afterFence(lines, fenceEnd(lines, k, f[1] ?? ""));
			if (c < end) return end;
			k = end;
			continue;
		}
		if (percentMarks(at(lines, k)) % 2 === 1) {
			let j = k + 1;
			while (j < lines.length && percentMarks(at(lines, j)) % 2 === 0) j++;
			const end = Math.min(j + 1, lines.length);
			if (c < end) return end;
			k = end;
			continue;
		}
		k++;
	}
	return -1;
}

/** The index after the block that holds line c, among `lines` (one level of the document: the top, or a group's body). */
export function blockEnd(lines: readonly string[], c: number): number {
	const held = holderEnd(lines, c);
	if (held >= 0) return held;
	if (LP.BLOCK_ID.test(at(lines, c).trim())) return c + 1;

	// a Booklet line, or a line one claims (a blank line between a question and its list is the question's)
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
	if (!at(lines, c).trim()) return c;
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
	/** Why nothing was placed, in a sentence: the plan then changes nothing (empty text, `applyPlan` returns the note as it was). */
	refused?: string;
}

export const IN_RECORDS = "The records section holds kept data, so blocks can't go there. Put the cursor above it.";
export const HAS_FRONT = "This note has properties already. The front matter block goes at the top of a note that has none: add `booklet:` with the format version to the properties instead.";

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
	const nothing = (why: string): InsertPlan => ({ from: { line: 0, ch: 0 }, text: "", anchor: { line: 0, ch: 0 }, head: { line: 0, ch: 0 }, assigned: {}, left: [], at: 0, depth: 0, refused: why });
	// the records section is kept data: no piece goes in it
	const c = Math.max(0, Math.min(cursor.line, lines.length - 1));
	if (doc.regions.some((r) => c >= r.start && c <= r.end)) return nothing(IN_RECORDS);
	const piece = scan(pieceText);
	const fits = fitsInGroup(pieceText);
	let pl: Placement;
	if (piece.hasFrontMatter) {
		// the front matter block: the very top of a note that has none
		if (doc.hasFrontMatter) return nothing(HAS_FRONT);
		pl = { at: 0, depth: 0 };
	} else if (doc.hasFrontMatter && c < doc.bodyStart) {
		// the cursor in the properties: the piece goes after them
		pl = { at: Math.min(doc.bodyStart, lines.length), depth: 0 };
	} else {
		pl = placement(lines, c, fits);
		// a piece placed above the records section stops at its first line, however far the block reached
		const reg = doc.regions.find((r) => c < r.start && pl.depth === 0 && pl.at > r.start);
		if (reg) pl = { at: reg.start, depth: 0 };
	}
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
	// the note's own line ending, taken from the line break next to where the piece goes
	const raw = docText.split("\n");
	let eol = "\n";
	for (const k of [pl.at - 1, pl.at, 0]) {
		if (k >= 0 && k < raw.length - 1) {
			eol = (raw[k] ?? "").endsWith("\r") ? "\r\n" : "\n";
			break;
		}
	}
	const text = (pl.at < lines.length ? out.join("\n") + "\n" : "\n" + out.join("\n")).replace(/\n/g, eol);
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
