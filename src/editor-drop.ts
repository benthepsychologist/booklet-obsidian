/*
 * Dragging a piece from the panel onto the editor (desktop). The piece is dragged with its file name under a data type of our own, so
 * a drop anywhere else puts nothing in a note. The editor hears the drop through Obsidian's `editor-drop` event: the line under the
 * pointer is where the piece goes, by the same plan as a click with the cursor on that line (editor-place.ts `planDrop`), so it lands
 * on its own lines, gets fresh ids and has its title selected. A drop on a note that is not a booklet places nothing.
 *
 * The line under the pointer is asked of the editor's CodeMirror view (`posAtCoords`), which Obsidian's Editor object carries as `cm`
 * but does not document; it is called through a narrow type of its own, so the plugin imports nothing from CodeMirror. Without it the
 * piece goes where the cursor is.
 */
import { Notice, type Editor } from "obsidian";
import { PIECES } from "./core/editor-pieces";
import { applyPlan, planDrop } from "./core/editor-place";
import { isBookletText } from "./core/editor-scan";

/** The data type a piece is dragged under: the file name of the piece. */
export const PIECE_MIME = "application/x-booklet-piece";

export const carries = (e: DragEvent): boolean => !!e.dataTransfer && Array.from(e.dataTransfer.types).includes(PIECE_MIME);

interface WithView {
	cm?: { posAtCoords?: (at: { x: number; y: number }, precise: boolean) => number | null };
}

/** The 0-based line of the note under the pointer of a drop, or the cursor's line when the editor cannot say. */
export function lineUnder(editor: Editor, e: MouseEvent): number {
	const cm = (editor as unknown as WithView).cm;
	const off = cm?.posAtCoords?.({ x: e.clientX, y: e.clientY }, false);
	return typeof off === "number" ? editor.offsetToPos(off).line : editor.getCursor().line;
}

/** Make the dragover of a piece a drop that is allowed (an editable area takes only text by default). */
export function allowDrop(e: DragEvent): void {
	if (!carries(e)) return;
	e.preventDefault();
	if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
}

/** The drop of a piece on an editor: place it, and say the event is handled. */
export function dropPiece(e: DragEvent, editor: Editor): void {
	if (e.defaultPrevented || !carries(e)) return;
	e.preventDefault();
	const piece = PIECES.find((p) => p.file === e.dataTransfer?.getData(PIECE_MIME));
	if (!piece) return;
	const text = editor.getValue();
	if (!isBookletText(text)) {
		new Notice("Blocks go into a booklet note. This note has no `booklet:` line in its properties.");
		return;
	}
	const plan = planDrop(text, lineUnder(editor, e), piece.text);
	if (applyPlan(text, plan) === text) return;
	editor.replaceRange(plan.text, plan.from);
	editor.setSelection(plan.anchor, plan.head);
	editor.scrollIntoView({ from: plan.anchor, to: plan.head }, true);
	editor.focus();
}
