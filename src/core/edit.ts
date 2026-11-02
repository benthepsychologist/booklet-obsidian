/*
 * The smallest edit that turns one text into another: what a note open in an editor takes in place of the whole text, so that every
 * byte outside the change stays as it was and the editor's undo and cursor are left alone. Plain TypeScript.
 */

/** Replace `before.slice(from, to)` with `text` to get the new text. */
export interface TextEdit {
	from: number;
	to: number;
	text: string;
}

/** The edit that turns `before` into `after`: the common start and the common end are kept, whatever lies between is replaced. */
export function smallestEdit(before: string, after: string): TextEdit {
	let p = 0;
	const max = Math.min(before.length, after.length);
	while (p < max && before.charCodeAt(p) === after.charCodeAt(p)) p++;
	let s = 0;
	while (s < max - p && before.charCodeAt(before.length - 1 - s) === after.charCodeAt(after.length - 1 - s)) s++;
	return { from: p, to: before.length - s, text: after.slice(p, after.length - s) };
}
