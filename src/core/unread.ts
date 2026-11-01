/*
 * What this view does not read. Each such place in a note is recorded with its line in the file, what is written there and why it was not read;
 * the notice at the top of the view lists them (notice.ts). Whatever is not read stays in the file exactly as written. Plain TypeScript: nothing
 * here imports Obsidian.
 */

/** One place in a note that the view did not read: a kind of line, a setting, a query key or a block. */
export interface Unread {
	/** The line in the file, counting from 1 and counting the front matter. */
	line: number;
	/** The line as written, trimmed and shortened (`shortLine`). */
	text: string;
	/** Why it was not read, in a clause. */
	why: string;
	/**
	 * Might a newer version of the plugin read it? True for a kind or a block no version here knows; false when the name looks like a mistake
	 * (a setting that is another kind's, or a near miss of one that is known), where an update would not help.
	 */
	newer: boolean;
}

/** A line as the notice shows it: leading and trailing white space off, and cut at `max` characters (code points) with an ellipsis. */
export function shortLine(s: string, max = 80): string {
	const t = s.trim().replace(/\s+/g, " ");
	if (t.length <= max) return t;
	const chars = Array.from(t);
	return chars.length > max ? chars.slice(0, max - 1).join("").trimEnd() + "…" : t;
}

/** The number of single-character edits (insert, delete, change) from one word to another. */
function distance(a: string, b: string): number {
	let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
	for (let i = 1; i <= a.length; i++) {
		const row = [i];
		for (let j = 1; j <= b.length; j++) row.push(Math.min((prev[j] ?? 0) + 1, (row[j - 1] ?? 0) + 1, (prev[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1)));
		prev = row;
	}
	return prev[b.length] ?? 0;
}

/**
 * Does an unread setting or query key look like a mistake, and not like something a newer plugin would read? It does when the name is one
 * the format has somewhere (`hidden` on a page line) or is one or two edits from one (`mx` for `max`): a word of four letters or fewer is
 * allowed one edit, a longer word two. `known` is every setting name the format has, without the colon.
 */
export function looksLikeMistake(name: string, known: ReadonlySet<string>): boolean {
	const n = name.toLowerCase();
	if (known.has(n)) return true;
	for (const k of known) if (distance(n, k) <= (Math.min(n.length, k.length) <= 4 ? 1 : 2)) return true;
	return false;
}
