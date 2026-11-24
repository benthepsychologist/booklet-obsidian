/*
 * The fold mark of a callout: the one character right after the `]` of its line (`> [!hint]- Title`), and the switch the Design view
 * gives it. Plain TypeScript: nothing here imports Obsidian or the DOM.
 *
 * The format (SPEC section 4: "A fold marker may follow the bracket, as in Obsidian: `> [!hint]- Hint` starts folded") and the reader
 * (core/reader.ts, `[+-]?` in the callout pattern) know exactly three shapes: no mark (the callout is drawn open and cannot be folded),
 * `-` (it starts folded) and `+` (it can be folded and starts open). The switch is for `-`: on writes it, off takes it away. A `+` is
 * shown as "not folded" and kept exactly as written until the person turns the switch on, which writes `-` in its place (one character
 * for one character); turning it off again gives no mark, not `+` again, which is said in words.
 *
 * A change writes that one character and nothing else on the line, so putting the mark on and taking it off gives back the same bytes.
 * Not every kind of line folds: a page is never folded (SPEC section 3, "The page line"), and the structure and question kinds and a
 * copy line have no fold in the format at all. They get no switch, and a request to change one is refused with the reason.
 */
import { parseLine, type ParsedLine } from "./editor-line";
import { LINTER_QUESTIONS } from "./editor-patterns";

export type FoldMark = "" | "-" | "+";

/** The kinds of line the format gives no fold: the structure kinds, the questions, the menu and the copy button. A reading callout (any other kind) folds. */
const NO_FOLD: ReadonlySet<string> = new Set(["module", "activity", "tab", "page", "row", "data", "records", "manifest", "notice", "menu", "copy"]);

/** Why a kind of line has no fold, or null when it folds. */
export function whyNoFold(kind: string): string | null {
	if (kind === "page") return "A page is never folded (SPEC section 3), so a fold mark on its line means nothing.";
	if (LINTER_QUESTIONS.has(kind) || NO_FOLD.has(kind)) return "This kind of block has no fold in the format.";
	return null;
}

export type FoldRead = { ok: true; mark: FoldMark } | { ok: false; reason: string };

/** The index of the fold mark's place: right after the `]` that closes the line's brackets. */
const markAt = (p: ParsedLine): number => (p.hasBar ? p.barEnd : p.kindEnd) + 1;

/** What a Booklet line's fold mark is, or why the line has none to show. */
export function foldOfLine(line: string): FoldRead {
	const p = parseLine(line);
	if (!p) return { ok: false, reason: "That is not a Booklet line." };
	if (p.quotes) return { ok: false, reason: "The line starts with extra > marks." };
	if (p.flags.has("end")) return { ok: false, reason: "This is a closing line, which has no fold." };
	const no = whyNoFold(p.kind);
	if (no) return { ok: false, reason: no };
	const mark = p.fold;
	if (mark !== "" && mark !== "-" && mark !== "+") return { ok: false, reason: "The fold mark is not one the format knows." };
	// the parser's own reading and the character in its place must agree (a mark is never read from anywhere else)
	if ((p.text[markAt(p)] ?? "") !== mark && mark !== "") return { ok: false, reason: "The fold mark is not where the format reads it." };
	return { ok: true, mark };
}

/**
 * The line with the fold switch put on (`-`) or off (no mark). Refused, with a reason and nothing changed, when the line has no fold; a
 * line already as asked is the same line. Taking the mark off a line whose title begins with `+` or `-` written straight after it would
 * make the title the mark, so that stays in the Markdown.
 */
export function setFoldLine(line: string, folded: boolean): { ok: true; text: string } | { ok: false; reason: string } {
	const r = foldOfLine(line);
	if (!r.ok) return r;
	const p = parseLine(line);
	if (!p) return { ok: false, reason: "That is not a Booklet line." };
	const at = markAt(p);
	if (folded) {
		if (r.mark === "-") return { ok: true, text: line };
		return { ok: true, text: line.slice(0, at) + "-" + line.slice(at + r.mark.length) };
	}
	// off on a line with no mark is the line, and a `+` is kept as written (see the top of this file)
	if (r.mark !== "-") return { ok: true, text: line };
	const after = line.charAt(at + 1);
	if (after === "+" || after === "-") return { ok: false, reason: "The title begins with + or -, which would be read as the fold mark once this one is gone, so this is changed in the Markdown." };
	return { ok: true, text: line.slice(0, at) + line.slice(at + 1) };
}

/** The block's lines with the first line's fold switch put on or off. */
export function setFold(lines: readonly string[], folded: boolean): { ok: true; lines: string[] } | { ok: false; reason: string } {
	const made = setFoldLine(lines[0] ?? "", folded);
	if (!made.ok) return made;
	return { ok: true, lines: [made.text, ...lines.slice(1)] };
}
