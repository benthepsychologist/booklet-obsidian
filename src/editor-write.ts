/*
 * The one way the panel writes to a note, and the one way it places a piece. A click on a piece in the panel and a drop of a piece on the
 * editor both come here, so both get the same refusals, the same guard and the same minimal write.
 *
 *   writeNote   make the note `after`, replacing only the bytes that differ; a change that would detach kept entries, saved answers or
 *               rows asks first (Change or Cancel) and names how many it touches.
 *   placePiece  the plan for a piece (core/editor-place.ts), refused with a notice when the plan says so, then written by writeNote,
 *               then the piece's title selected.
 */
import { Notice, type App, type Editor } from "obsidian";
import { minimalChange } from "./core/editor-actions";
import { impactOf, readerRefuses } from "./core/editor-guard";
import type { Piece } from "./core/editor-pieces";
import { applyPlan, planInsert, type InsertPlan } from "./core/editor-place";
import { isBookletText, scan } from "./core/editor-scan";
import { askToChange } from "./editor-modals";

/**
 * Returns whether the note was changed (or needed no change). Cancel, or a note that changed while the question was open, changes
 * nothing. `design` is a change to an id, an option or a declared field: on a booklet the reader refuses nothing can be counted (the
 * guard finds none because it cannot look), so that change asks too, in words that say so.
 */
export async function writeNote(app: App, ed: Editor, before: string, after: string, design = false): Promise<boolean> {
	const c = minimalChange(before, after);
	if (!c) return true;
	const blind = design && readerRefuses(before);
	const impacts = blind ? [] : impactOf(before, after);
	if ((blind || impacts.length) && !(await askToChange(app, impacts, blind))) return false;
	if (ed.getValue() !== before) {
		new Notice("The note changed while the question was open. Nothing was changed.");
		return false;
	}
	ed.replaceRange(c.text, ed.offsetToPos(c.from), ed.offsetToPos(c.to));
	return true;
}

/**
 * Place a piece in the note the editor holds: at the cursor, or at `line` for a drop. Returns the plan that was written, or null when
 * nothing was (a notice says why, unless the reader chose Cancel).
 */
export async function placePiece(app: App, ed: Editor, piece: Piece, line: number | null): Promise<InsertPlan | null> {
	const before = ed.getValue();
	// a note that is not a booklet takes one piece, its front matter, and only when it has no properties yet
	if (!isBookletText(before) && !(piece.front && !scan(before).hasFrontMatter)) {
		new Notice(piece.front ? "This note has properties already. Add `booklet:` with the format version to them." : "This note is not a booklet: it has no `booklet:` line in its properties.");
		return null;
	}
	const plan = planInsert(before, line === null ? ed.getCursor() : { line, ch: 0 }, piece.text);
	if (plan.refused) {
		new Notice(plan.refused);
		return null;
	}
	if (!(await writeNote(app, ed, before, applyPlan(before, plan)))) return null;
	ed.setSelection(plan.anchor, plan.head);
	ed.scrollIntoView({ from: plan.anchor, to: plan.head }, true);
	ed.focus();
	return plan;
}
