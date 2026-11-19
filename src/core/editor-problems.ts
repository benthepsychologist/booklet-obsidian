/*
 * The panel's problems list: the lines the plugin's reader cannot read, with why (what it keeps as text, ignores or refuses), and
 * the leftovers: kept entries, answers and rows that no longer match the booklet (editor-guard.ts leftoversOf), after any edit,
 * by hand included. It is made from what the reader already reads (reader.ts: `unread` and `problems`), so the list is the plugin's
 * own view of the note and not a second opinion; the linter's wider checks stay with the linter. Plain TypeScript: nothing here
 * imports Obsidian.
 */
import { leftoversOf } from "./editor-guard";
import { parseBooklet, type Booklet } from "./reader";
import { shortLine } from "./unread";

export interface Problem {
	/** 0-based line to jump to, or null for a problem of the whole note. */
	line: number | null;
	/** The line as written (shortened), "" for the whole note. */
	text: string;
	/** Why, in words. */
	why: string;
	/** `unread` is a line the reader cannot read; `leftover` is kept data that matches nothing now. */
	kind: "unread" | "note" | "leftover";
}

const AT = /^Line (\d+): ([\s\S]*)$/;

/** The problems of a note read once; `lines` are its lines, for the text of each. */
export function problemsOfBook(book: Booklet, lines: readonly string[]): Problem[] {
	const out: Problem[] = [];
	const seen = new Set<string>();
	const add = (p: Problem): void => {
		const key = `${p.line}\u0000${p.why}`;
		if (seen.has(key)) return;
		seen.add(key);
		out.push(p);
	};
	if (!book.ok && book.refusal) add({ line: null, text: "", why: book.refusal, kind: "note" });
	for (const u of book.unread) add({ line: u.line - 1, text: u.text, why: u.why, kind: "unread" });
	for (const s of [...book.problems, ...book.records.problems]) {
		const m = AT.exec(s);
		if (m) add({ line: Number(m[1]) - 1, text: shortLine(lines[Number(m[1]) - 1] ?? ""), why: m[2] ?? "", kind: "note" });
		else add({ line: null, text: "", why: s, kind: "note" });
	}
	for (const l of leftoversOf(book)) add({ line: l.line, text: shortLine(lines[l.line] ?? ""), why: l.why, kind: "leftover" });
	return out.sort((a, b) => (a.line ?? -1) - (b.line ?? -1));
}

export function problemsOf(text: string): Problem[] {
	return problemsOfBook(parseBooklet(text), text.replace(/\r\n/g, "\n").split("\n"));
}
