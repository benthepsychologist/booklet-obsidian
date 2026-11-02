/*
 * The Markdown view of a note, when the note is open as one: its editor holds the newest text (words typed and not saved yet), so
 * a change to the note goes into that editor, as the smallest edit (core/edit.ts), and the Markdown view saves it. Obsidian's guidelines:
 * use the Editor for an open note. The Booklet view (view.ts) and the plugin-level writer (listen-writer.ts) both write this way.
 */
import { MarkdownView, type App } from "obsidian";
import { smallestEdit } from "./core";

/** An open Markdown view of the note at `path`, if there is one. */
export function markdownViewOf(app: App, path: string): MarkdownView | null {
	let found: MarkdownView | null = null;
	app.workspace.iterateAllLeaves((leaf) => {
		const v = leaf.view;
		if (!found && v instanceof MarkdownView && v.file?.path === path) found = v;
	});
	return found;
}

/** Puts `after` in the editor in place of `before` (the text it holds now), as the smallest edit. */
export function replaceInEditor(md: MarkdownView, before: string, after: string): void {
	if (after === before) return;
	const { from, to, text } = smallestEdit(before, after);
	md.editor.replaceRange(text, md.editor.offsetToPos(from), md.editor.offsetToPos(to));
}
