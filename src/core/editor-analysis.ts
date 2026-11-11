/*
 * One reading of the note for one refresh of the panel. The panel used to read the note five times over (the counts, the outline, the
 * problems, the options, the declared fields): `analyse` reads it once, as the plugin's reader and as the linter's scan, and
 * `panelModel` makes everything the panel draws from that one reading and the cursor's line. Plain TypeScript: nothing here imports
 * Obsidian.
 */
import { fieldBlockAt, optionsAt, settingsAt, type FieldBlock, type LineView, type OptionList } from "./editor-actions";
import { holdingsLineOf } from "./editor-guard";
import { flatten, outlineOf, type OutlineNode } from "./editor-outline";
import { problemsOfBook, type Problem } from "./editor-problems";
import { isBookletText, scan, type Scan } from "./editor-scan";
import { parseBooklet, type Booklet } from "./reader";

export interface Analysis {
	text: string;
	/** The note's lines as the scan reads them (no `\r`, no byte-order mark). */
	lines: string[];
	scan: Scan;
	book: Booklet;
}

/** Read the note once. */
export function analyse(text: string): Analysis {
	const s = scan(text);
	return { text, lines: s.lines, scan: s, book: parseBooklet(text) };
}

export interface PanelModel {
	/** The note is a booklet: it has a `booklet:` line in its properties. */
	booklet: boolean;
	/** The top line: what the booklet holds, or why the reader cannot count it. */
	holds: string;
	line: LineView;
	options: OptionList | null;
	block: FieldBlock | null;
	outline: { node: OutlineNode; depth: number }[];
	problems: Problem[];
}

/** Everything the panel draws for a note read once, with the cursor on `line` (0-based). */
export function panelModel(a: Analysis, line: number): PanelModel {
	return {
		booklet: isBookletText(a.text),
		holds: holdingsLineOf(a.book),
		line: settingsAt(a.text, line, a.scan),
		options: optionsAt(a.text, line, a.scan),
		block: fieldBlockAt(a.text, line, a.scan),
		outline: flatten(outlineOf(a.scan)),
		problems: problemsOfBook(a.book, a.lines),
	};
}
