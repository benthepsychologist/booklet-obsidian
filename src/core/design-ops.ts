/*
 * The Design view's writes, as text in and text out: insert a piece, delete a block, move a block, change a block's own lines. Plain
 * TypeScript: nothing here imports Obsidian or the DOM.
 *
 * Each returns the note's new text and `change`, the smallest replacement that makes it (`minimalChange`), so the shell replaces only
 * those bytes and every other byte of the note stays as it was: line endings, trailing blank lines, a missing final newline. Nothing is
 * normalised. A block owns the blank lines after it (design-tree.ts), so taking one out or putting one in leaves its neighbours alone.
 *
 * A delete, a move and a change report what they would leave not matching, through the data guards (editor-guard.ts `impactOf`): kept
 * entries, saved answers and data rows that the ids they sit under would no longer reach. The operation never asks. It writes nothing
 * itself; the shell shows the counts, asks, and only then applies `change`. `blind` is true when the reader cannot open the note as it is,
 * so there was nothing to count and the shell asks the guard's blind question instead.
 *
 * An illegal place is refused with a reason (placeCheck, design-places.ts), never written. The records section is never written by
 * the view: nothing is placed in it, and a block that holds it is never deleted or moved.
 *
 * Positions and nodes come from a tree parsed from the same text (`parseDesign`); an operation checks that the tree still fits the
 * text and refuses when it does not.
 */
import { minimalChange, type Change } from "./editor-actions";
import { impactOf, readerRefuses, type Impact } from "./editor-guard";
import { instantiate } from "./editor-ids";
import { LP } from "./editor-patterns";
import { quoteLine } from "./editor-place";
import { scan, stateBefore } from "./editor-scan";
import { checkDesign, isContainer, parseDesign, walkDesign, type DesignNode } from "./design-tree";
import { parseBooklet } from "./reader";
import { ancestorsOf, canPlacePiece, checkNeed, needOfNode, needsOf, placeCheck, positionLine, type DesignPosition } from "./design-places";
import type { Piece } from "./editor-pieces";

export interface OpDone {
	ok: true;
	text: string;
	/** The smallest replacement of the old text that gives `text`; null when nothing changed. */
	change: Change | null;
	/** What the change would leave not matching (empty for an insert, which detaches nothing). */
	impact: Impact[];
	/** The reader could not open the note before the change, so `impact` could not be counted. */
	blind: boolean;
	/** The reader can open the note after the change. */
	readable: boolean;
	/** Things the change leaves that are worth saying (pages whose parent goes, activities whose module tab goes). */
	notes: string[];
	/** Set by `changeLines` when the reader could open the note before and cannot after: the reader's own reason. The shell asks before it writes. */
	breaks?: string;
	/** The lines the new or moved block has in the new text (start, end exclusive; its blank pad lines are outside it). */
	lines?: { start: number; end: number };
	/** An inserted piece's ids: each placeholder and what it became. */
	assigned?: Record<string, string>;
	/** Placeholders left to type over. */
	left?: string[];
}

export interface OpRefused {
	ok: false;
	reason: string;
}

export type OpResult = OpDone | OpRefused;

const refuse = (reason: string): OpRefused => ({ ok: false, reason });
const blank = (s: string | undefined): boolean => !s || !s.trim();

const STALE = "The design view is out of date with the note: it was read from other text. Open it again.";

/** Does this tree fit this text? A tree from other text has other line counts. */
function fits(root: DesignNode, raw: readonly string[]): boolean {
	return root.parent === null && checkDesign(root, raw.length) === null;
}

/** How many groups enclose a container: the `>` marks every line of a block in it carries. */
const quoteDepth = (container: DesignNode): number => ancestorsOf(container).filter((n) => n.kind === "group").length;

/** The group a position is directly in, if any. */
const groupOf = (container: DesignNode): DesignNode | undefined => ancestorsOf(container).filter((n) => n.kind === "group").pop();

function done(before: string, after: string, extra: Partial<OpDone> = {}): OpDone {
	return { ok: true, text: after, change: minimalChange(before, after), impact: [], blind: false, readable: !readerRefuses(after), notes: [], ...extra };
}

/** The note's own line ending, taken from the lines next to a change. */
function crlfNear(raw: readonly string[], at: number): boolean {
	for (const k of [at - 1, at, 0]) {
		if (k >= 0 && k < raw.length - 1) return (raw[k] ?? "").endsWith("\r");
	}
	return false;
}

/** A line with the `>` marks of `from` groups taken off and those of `to` groups put on; a blank line stays blank (a bare `>` inside a group). */
function requote(line: string, from: number, to: number): string {
	const cr = line.endsWith("\r") ? "\r" : "";
	let body = cr ? line.slice(0, -1) : line;
	for (let k = 0; k < from; k++) body = body.replace(LP.QUOTE, "");
	return (body.trim() === "" ? quoteLine("", to) : quoteLine(body, to)) + cr;
}

/**
 * Put lines into the note's lines before line `at`, inside `depth` groups, with a blank line above and below where the neighbours are not
 * blank (a bare `>` inside a group). The lines are already quoted. Returns the new lines and where the block lies in them.
 */
function spliceIn(raw: readonly string[], at: number, depth: number, group: DesignNode | undefined, body: string[]): { lines: string[]; start: number; end: number } {
	const n = raw.length;
	const endsNewline = (raw[n - 1] ?? "") === "";
	const limit = endsNewline ? n - 1 : n;
	at = Math.max(0, Math.min(at, limit));
	const crlf = crlfNear(raw, at);
	const eol = crlf ? "\r" : "";
	const inner = (l: string | undefined): boolean => !(l ?? "").replace(/^(?:>[ \t]?)*/, "").trim();
	const bodyStart = group ? group.start + 1 : 0;
	const bodyEnd = group ? group.tailStart : n;
	const out: string[] = [];
	let padBefore = false;
	let padAfter = false;
	if (depth > 0) {
		padBefore = at > bodyStart && !inner(raw[at - 1]);
		padAfter = at < bodyEnd ? !inner(raw[at]) : at < limit && !blank(raw[at]);
	} else {
		padBefore = at > 0 && !blank(raw[at - 1]);
		padAfter = at < limit && !blank(raw[at]);
	}
	// a block that carries its own blank lines needs none below it
	const lastBody = body[body.length - 1];
	if (depth > 0 ? inner(lastBody) : blank(lastBody)) padAfter = false;
	if (padBefore) out.push(quoteLine("", depth) + eol);
	const start = at + out.length;
	for (const l of body) out.push(l.endsWith("\r") ? l : l + eol);
	const end = at + out.length;
	if (padAfter) out.push((depth > 0 && at < bodyEnd ? quoteLine("", depth) : "") + eol);
	const lines = raw.slice(0, at).concat(out, raw.slice(at));
	// a note with no final newline: its last line has no line ending to carry the carriage return
	if (!endsNewline && at >= n && crlf && lines.length > n) {
		const old = lines[n - 1] ?? "";
		if (!old.endsWith("\r")) lines[n - 1] = old + "\r";
		const lastLine = lines[lines.length - 1] ?? "";
		if (lastLine.endsWith("\r")) lines[lines.length - 1] = lastLine.slice(0, -1);
	}
	return { lines, start, end };
}

// ---------------------------------------------------------------- insert

/**
 * Put a piece at a position. The piece's own `new-` words get fresh ids (editor-ids.ts). The front matter piece goes at the top of the
 * note whatever the position says, and only when the note has none. Refused when the place is not legal (design-places.ts).
 */
export function insertPiece(text: string, position: DesignPosition, piece: Pick<Piece, "file" | "text">): OpResult {
	const raw = text.split("\n");
	const root = ancestorsOf(position.parent)[0];
	if (!root || !fits(root, raw)) return refuse(STALE);
	const placed = canPlacePiece(position, piece);
	if (!placed.ok) return refuse(placed.reason);
	const front = needsOf(piece).includes("front-matter");
	const line = front ? 0 : positionLine(position);
	const depth = front ? 0 : quoteDepth(position.parent);
	const doc = scan(text);
	const inst = instantiate(piece.text, doc, stateBefore(doc, line));
	const body = inst.text.split("\n").map((l) => quoteLine(l, depth));
	const put = spliceIn(raw, line, depth, front ? undefined : groupOf(position.parent), body);
	return done(text, put.lines.join("\n"), { lines: { start: put.start, end: put.end }, assigned: inst.assigned, left: inst.left });
}

// ---------------------------------------------------------------- delete

/** Why a block cannot be taken out or moved, or null (`what` is "deleted" or "moved"). The shell offers its buttons only where this is null. */
export function whyImmovable(n: DesignNode, what: "deleted" | "moved"): string | null {
	if (!n.parent) return `The booklet itself cannot be ${what}.`;
	if (n.kind === "front-matter") return `The front matter makes the note a booklet and is not ${what} by the view.`;
	if (n.implicit === true) return `This activity is the whole note (it has no activity line), so it cannot be ${what}.`;
	if (walkDesign(n).some((x) => x.kind === "records")) return `The records section holds kept data, and the view never ${what === "deleted" ? "deletes" : "moves"} it. Take the block apart in the Markdown if you mean to.`;
	return null;
}

/** What taking a block out leaves pointing at nothing in the design itself, in words. */
function danglingAfterRemoving(n: DesignNode): string[] {
	const notes: string[] = [];
	const siblings = n.parent?.children ?? [];
	const ids = new Set(walkDesign(n).filter((x) => x.kind === "page" && x.id).map((x) => x.id as string));
	if (ids.size) {
		const holder = n.parent;
		const kin = holder ? walkDesign(holder).filter((x) => x.kind === "page" && !walkDesign(n).includes(x) && x.set["parent"] && ids.has(x.set["parent"])) : [];
		if (kin.length) notes.push(`${kin.length === 1 ? "A page names" : `${kin.length} pages name`} a deleted page as its \`parent:\`, so it sits at the top of its tab's tree.`);
	}
	if (n.kind === "module-tab" && n.id) {
		const joined = siblings.filter((x) => x.kind === "activity" && x.set["tab"] === n.id);
		if (joined.length) notes.push(`${joined.length === 1 ? "An activity joins" : `${joined.length} activities join`} this module tab with \`tab:${n.id}\`. The linter reports it, and a renderer puts it in the first tab.`);
	}
	return notes;
}

/**
 * Take a block out, with everything in it and the blank lines after it. A module goes with its closing line; the records section is never
 * deleted, nor a block that holds it. The result reports what the deletion would leave not matching (`impact`).
 */
export function deleteBlock(text: string, node: DesignNode): OpResult {
	const raw = text.split("\n");
	const root = ancestorsOf(node)[0];
	if (!root || !fits(root, raw)) return refuse(STALE);
	const why = whyImmovable(node, "deleted");
	if (why) return refuse(why);
	const after = raw.slice(0, node.start).concat(raw.slice(node.end)).join("\n");
	return done(text, after, { impact: impactOf(text, after), blind: readerRefuses(text), notes: danglingAfterRemoving(node) });
}

// ---------------------------------------------------------------- move

/** The same container in the tree of the text with a block taken out: found by its kind and its (shifted) first line. */
function remap(pos: DesignPosition, removed: { start: number; end: number }, tree0: DesignNode): DesignPosition | null {
	const len = removed.end - removed.start;
	const shift = (l: number): number => (l >= removed.end ? l - len : l);
	const start = shift(pos.parent.start);
	const parent = walkDesign(tree0).find((n) => n.kind === pos.parent.kind && n.start === start);
	if (!parent) return null;
	const at = shift(positionLine(pos));
	return { parent, index: parent.children.filter((c) => c.start < at).length };
}

/**
 * Move a block, with everything in it, to a position. The block's lines are quoted for the groups around the new place. Refused when the
 * block cannot stand there (design-places.ts), when the position is inside the block, or when the move would leave the reader unable to
 * open a note it could open (an id already used in the module it moves into). A move to the block's own place changes nothing.
 */
export function moveBlock(text: string, node: DesignNode, position: DesignPosition): OpResult {
	const raw = text.split("\n");
	const root = ancestorsOf(node)[0];
	if (!root || !fits(root, raw) || ancestorsOf(position.parent)[0] !== root) return refuse(STALE);
	const why = whyImmovable(node, "moved");
	if (why) return refuse(why);
	if (ancestorsOf(position.parent).includes(node)) return refuse("A block cannot be moved into itself.");
	const line = positionLine(position);
	if (line >= node.start && line <= node.end) return { ok: true, text, change: null, impact: [], blind: false, readable: !readerRefuses(text), notes: [], lines: { start: node.start, end: node.end } };
	const need = needOfNode(node);
	if (!need) return refuse("The view does not move this.");

	const rest = raw.slice(0, node.start).concat(raw.slice(node.end));
	const tree0 = parseDesign(rest.join("\n"));
	const pos0 = remap(position, node, tree0);
	if (!pos0) return refuse(STALE);
	// the block must be able to stand where it goes, in the note as it is with the block taken out
	// a tab keeps being the kind of tab it is: a module's tab moved into an activity would become that activity's own, and the
	// activities that join it with `tab:` would be left pointing at nothing
	const placed = node.kind === "module-tab" ? placeCheck("module-tab", pos0) : node.kind === "activity-tab" ? placeCheck("activity-tab", pos0) : checkNeed(pos0, need);
	if (!placed.ok) return refuse(placed.reason);

	const from = quoteDepth(node.parent as DesignNode);
	const to = quoteDepth(pos0.parent);
	// the block's own blank lines go with it when something follows it in its new container; at the end the container's tail is the
	// separation, so carrying them would leave an extra blank line (a bare `>` inside a group)
	const atEnd = pos0.index >= pos0.parent.children.length;
	// (a container's trailing blank lines are the last of everything in it, not of its own head: ownCore would cut its contents off)
	let whole = node.end;
	while (whole - 1 > node.start && blank(raw[whole - 1])) whole--;
	const body = raw.slice(node.start, atEnd ? whole : node.end).map((l) => requote(l, from, to));
	const at = positionLine(pos0);
	const put = spliceIn(rest, at, to, groupOf(pos0.parent), body);
	const after = put.lines.join("\n");
	const before = !readerRefuses(text);
	if (before && readerRefuses(after)) return refuse("Moving it there would leave the reader unable to open the booklet, for example because an id is already used in that module.");
	return done(text, after, { impact: impactOf(text, after), blind: !before, lines: { start: put.start, end: put.end - (trailingBlank(put.lines, put.start, put.end)) } });
}

/** How many blank lines end lines[start, end). */
function trailingBlank(lines: readonly string[], start: number, end: number): number {
	let k = 0;
	while (end - k - 1 > start && blank(lines[end - k - 1])) k++;
	return k;
}

// ---------------------------------------------------------------- change a block's own lines

/**
 * The lines of a block that are its own, without the blank lines that follow, and without the `>` marks of the groups around it: what a
 * small editor shows. For a container these are its own opening lines (a module's, an activity's, a tab's), not what it holds.
 */
export function blockLines(text: string, node: DesignNode): string[] {
	const raw = text.split("\n");
	const r = ownCore(raw, node);
	const from = node.parent ? quoteDepth(node.parent) : 0;
	return raw.slice(r.start, r.end).map((l) => requote(l, from, 0).replace(/\r$/, ""));
}

/** Where a block's own lines lie: from its first line to its last that is not blank. */
function ownCore(raw: readonly string[], node: DesignNode): { start: number; end: number } {
	const stop = isContainer(node) ? node.headEnd : node.end;
	let end = stop;
	while (end - 1 > node.start && blank(raw[end - 1])) end--;
	return { start: node.start, end: Math.max(end, node.start + 1) };
}

/** Why a block has no lines of its own to change, or null (`changeLines` refuses for the same reasons). */
export function whyUnchangeable(n: DesignNode): string | null {
	if (n.kind === "booklet" || !n.parent) return "The booklet itself has no lines of its own to change.";
	if (n.kind === "records") return "The records section holds kept data, and the view never writes it.";
	if (n.implicit === true) return "This activity has no lines of its own: it is the whole note.";
	return null;
}

/**
 * Replace a block's own lines (see `blockLines`: written without the `>` marks of the groups around it) and nothing else. The blank lines
 * after the block, every other block and every line ending stay as they were, and so does every line of the block that the new lines
 * leave as it was: such a line keeps its exact bytes (a trailing space, a bare `>` inside a group, a line ending of its own), so only
 * the lines that differ are written. The result reports what the change would leave not matching (an id renamed, an option taken out)
 * and whether the reader can still open the note, so the shell can ask before it writes: `breaks` says why when it could, and cannot now.
 */
export function changeLines(text: string, node: DesignNode, newLines: readonly string[]): OpResult {
	const raw = text.split("\n");
	const root = ancestorsOf(node)[0];
	if (!root || !fits(root, raw)) return refuse(STALE);
	const why = whyUnchangeable(node);
	if (why) return refuse(why);
	if (!newLines.length) return refuse("A block with no lines is a deleted block: delete it instead.");
	const parent = node.parent as DesignNode;
	const depth = quoteDepth(parent);
	const r = ownCore(raw, node);
	const crlf = (raw[r.start] ?? "").endsWith("\r") || crlfNear(raw, r.start);
	const old = raw.slice(r.start, r.end);
	const plain = newLines.map((l) => l.replace(/\r$/, ""));
	const same = (i: number, j: number): boolean => requote(old[i] ?? "", depth, 0).replace(/\r$/, "") === plain[j];
	// the lines at the start and at the end that the new text leaves as they were keep the bytes they have
	let head = 0;
	while (head < old.length && head < plain.length && same(head, head)) head++;
	let tail = 0;
	while (tail < old.length - head && tail < plain.length - head && same(old.length - 1 - tail, plain.length - 1 - tail)) tail++;
	const body = plain.map((l, j) => (j < head ? (old[j] ?? "") : j >= plain.length - tail ? (old[old.length - (plain.length - j)] ?? "") : quoteLine(l, depth) + (crlf ? "\r" : "")));
	const lines = raw.slice(0, r.start).concat(body, raw.slice(r.end));
	// the note's last line, if it had no line ending, keeps having none
	if (r.end >= raw.length && crlf && !(raw[raw.length - 1] ?? "").endsWith("\r")) {
		const l = lines[lines.length - 1] ?? "";
		if (l.endsWith("\r")) lines[lines.length - 1] = l.slice(0, -1);
	}
	const after = lines.join("\n");
	const out = done(text, after, { impact: impactOf(text, after), blind: readerRefuses(text), lines: { start: r.start, end: r.start + body.length } });
	if (out.change && !out.blind && !out.readable) {
		const reason = parseBooklet(after).refusal;
		out.breaks = reason ?? "The reader cannot open the booklet as it would be.";
		out.notes = [...out.notes, `After this change the reader cannot open the booklet: ${out.breaks}`];
	}
	return out;
}
