/*
 * What the two views of a booklet note that write to it have in common: the Booklet view (view.ts) and the Design view (design-view.ts).
 *
 *   LockedTextView  a TextFileView that never writes the whole file. TextFileView's own save path writes `getViewData()` over the file
 *                   after a 2-second debounce and when the view closes; these views never do, so both are switched off here, and every
 *                   write goes through `writeThrough` on the note's fresh text.
 *   writeThrough    the one way a view changes the note: into an open Markdown pane's editor as the smallest edit when there is one,
 *                   else with `vault.process` on the text as the file has it now.
 */
import { TextFileView, type App, type TFile, type WorkspaceLeaf } from "obsidian";
import { markdownViewOf, replaceInEditor } from "./markdown-view";

export abstract class LockedTextView extends TextFileView {
	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
		// the debounced save TextFileView asks for after setViewData and on close: nothing is saved by it
		this.requestSave = () => {};
	}

	override async save(_clear?: boolean): Promise<void> {
		// Deliberately nothing: see the constructor.
	}
}

/**
 * Makes the note `change(text)` and gives back the note as it is after. `change` runs on the text as it is now: the open Markdown pane's
 * editor (which holds words typed and not saved yet, and is saved by that pane) or the file, read and written in one step by
 * `vault.process`. A `change` that throws writes nothing and the error is thrown on.
 */
export async function writeThrough(app: App, file: TFile, change: (text: string) => string, unwritten = "The note could not be written."): Promise<string> {
	const md = markdownViewOf(app, file.path);
	if (md) {
		// The note is also open as Markdown. Its editor holds what was typed there and is not saved yet, so the change goes into that
		// editor, as the smallest edit, and the Markdown view saves it. Obsidian's guidelines: use the Editor for an open note.
		const editor = md.editor;
		const before = editor.getValue();
		replaceInEditor(md, before, change(before));
		return editor.getValue();
	}
	// Atomic read-modify-write of the note on disk: the change runs on the fresh text, never on a view's copy.
	let failure: unknown = null;
	const result = await app.vault.process(file, (fresh) => {
		try {
			return change(fresh);
		} catch (e) {
			failure = e;
			return fresh;
		}
	});
	if (failure) throw failure instanceof Error ? failure : new Error(unwritten);
	return result;
}
