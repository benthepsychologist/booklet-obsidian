/*
 * The hint and the solution that stand straight under a question, as two fields of the question's box in the Design view. Plain
 * TypeScript: nothing here imports Obsidian or the DOM.
 *
 * SPEC section 6, "Hints and solutions": a `hint` or `solution` callout directly after a question belongs to it, and is folded with `-`.
 * The tree (design-tree.ts `absorb`) puts such a callout in the question's own lines, so the question's box has them; `readHelps` carves
 * them out of those lines. A question's lines are laid out as
 *
 *   line 0 .. claim         the question's line, the `>` lines under it, and the list a choice, a multi, a scale or a matrix takes
 *                           (`claimEnd`, the reader's own); this is what the description, the rows and the media control read
 *   blank lines             between the parts
 *   `> [!hint]- Title`      a callout of kind `hint` and its `>` body lines (the reader's `bodyEnd`: up to the next `> [!` line)
 *   `> [!solution]- Title`  the same, for a solution; the two may come in either order
 *
 * ONLY WHAT IS LOSSLESS. A hint or a solution is shown as three controls (its title, its words, its fold switch) only when its body is
 * nothing but words: a body line that is a list item, a quotation or a second callout, a code fence, a table row, a heading or a rule is
 * not words, and the callout stays in the Markdown, with the reason said (its fold mark and title are still its first line's, and have
 * controls). A question with two hints, or two solutions, or any line after the callouts that is neither blank nor a hint or a solution,
 * is shown as Markdown only: the reader takes the first FOLDED one of each as the question's own, and a control could not say which.
 * Every change rewrites only the lines it was asked to: the words of the body (the lines the new text leaves as they were keep their
 * exact bytes, as `writeDescription` does), a callout's title, the one character of its fold mark, or the callout and the blank line
 * before it when it is added or removed. Adding a callout and removing it again gives back the same lines.
 */
import { parseLine, setTitle } from "./editor-line";
import { LP } from "./editor-patterns";
import { claimEnd } from "./editor-scan";
import { foldOfLine, setFoldLine, type FoldMark } from "./design-fold";

export type HelpKind = "hint" | "solution";

export interface HelpPart {
	kind: HelpKind;
	/** The index among the question's lines of the callout's first line, and the index past its last body line. */
	from: number;
	to: number;
	fold: FoldMark;
	/** The words after the bracket. */
	title: string;
	/** The body without its `>` marks and the one space after each, joined with a line break; "" when the callout has no body. */
	text: string;
	/** The body is words only: the fields edit it. When false, it stays in the Markdown, for `why`. */
	words: boolean;
	why: string | null;
}

export interface Helps {
	/** The index past the question's own claimed lines: from here on there are only blank lines and the callouts. */
	at: number;
	parts: HelpPart[];
}

export interface HelpsRefused {
	refused: string;
}

const refuse = (refused: string): HelpsRefused => ({ refused });
const blank = (l: string | undefined): boolean => !l || !l.trim();
const QUOTED = /^>( ?)([\s\S]*)$/;
const clip = (s: string): string => (s.trim().length > 40 ? `${s.trim().slice(0, 40)}…` : s.trim());

/** Why a line of a callout's body is not just words, or null. */
function notWords(text: string): string | null {
	const t = text;
	if (LP.BULLET.test(t) || LP.NUMBERED.test(t)) return "it holds a list";
	if (/^[ \t]*>/.test(t)) return "it holds a quotation or a second callout";
	if (LP.FENCE_LINE.test(t)) return "it holds a fenced block";
	if (/^[ \t]*\|/.test(t)) return "it holds a table";
	if (/^ {0,3}#{1,6}([ \t]|$)/.test(t)) return "it holds a heading";
	if (LP.THEMATIC_BREAK.test(t)) return "it holds a rule";
	if (/^(?: {4}|\t)/.test(t)) return "it holds indented code";
	if (/^[ \t]*<!--/.test(t)) return "it holds a comment";
	return null;
}

/** The body of the callout that starts at `from` (the index past its last `>` line), the way the reader's `bodyEnd` ends it. */
function bodyEnd(lines: readonly string[], from: number): number {
	let k = from + 1;
	while (k < lines.length && (lines[k] ?? "").startsWith(">") && !LP.CALLOUT_ANY.test(lines[k] ?? "")) k++;
	return k;
}

/** The hint and the solution among a question's own lines, or why they are not shown as fields. */
export function readHelps(lines: readonly string[]): Helps | HelpsRefused {
	const first = parseLine(lines[0] ?? "");
	if (!first) return refuse("The first line is not a Booklet line.");
	if (first.quotes) return refuse("The first line starts with extra > marks.");
	if (first.flags.has("end")) return refuse("This is a closing line.");
	for (const l of lines) if (l.includes("\r")) return refuse("A line holds a stray carriage return, which the fields would not keep as it is.");
	const at = claimEnd(first.kind, lines, 0);
	const parts: HelpPart[] = [];
	let i = at;
	while (i < lines.length) {
		if (blank(lines[i])) {
			i++;
			continue;
		}
		const p = parseLine(lines[i] ?? "");
		if (!p || p.quotes || (p.kind !== "hint" && p.kind !== "solution")) return refuse(`There is a line under the question's own that is neither a hint nor a solution: “${clip(lines[i] ?? "")}”.`);
		const to = bodyEnd(lines, i);
		const texts = lines.slice(i + 1, to).map((l) => QUOTED.exec(l)?.[2] ?? "");
		let why: string | null = null;
		for (const t of texts) {
			const w = notWords(t);
			if (w) {
				why = w;
				break;
			}
		}
		const fold = foldOfLine(lines[i] ?? "");
		parts.push({
			kind: p.kind,
			from: i,
			to,
			fold: fold.ok ? fold.mark : "",
			title: p.title,
			text: texts.join("\n"),
			words: why === null,
			why: why === null ? null : `The ${p.kind} is edited in the Markdown below: ${why}.`,
		});
		i = to;
	}
	for (const kind of ["hint", "solution"] as const)
		if (parts.filter((x) => x.kind === kind).length > 1) return refuse(`The question has more than one ${kind}, so they are edited in the Markdown below.`);
	return { at, parts };
}

/** The hint or the solution of a question's lines, or null when it has none (or the lines cannot be read into fields). */
export function helpOf(lines: readonly string[], kind: HelpKind): HelpPart | null {
	const h = readHelps(lines);
	return "refused" in h ? null : (h.parts.find((x) => x.kind === kind) ?? null);
}

type Made = { ok: true; lines: string[] } | { ok: false; reason: string };
const no = (reason: string): Made => ({ ok: false, reason });

/** The hint or solution that a change is made on, or why it cannot be. */
function target(lines: readonly string[], kind: HelpKind): { helps: Helps; part: HelpPart } | { reason: string } {
	const helps = readHelps(lines);
	if ("refused" in helps) return { reason: helps.refused };
	const part = helps.parts.find((x) => x.kind === kind);
	if (!part) return { reason: `The question has no ${kind}.` };
	return { helps, part };
}

/** The same parts, read again from lines that were made: the kinds, the folds and the titles in order. */
const shapeOf = (h: Helps): string => JSON.stringify(h.parts.map((p) => [p.kind, p.fold, p.title]));

/** The text a person typed as its lines: line endings made one kind, and the blank lines at its end left off (they would be `>` lines holding nothing). */
function linesOf(text: string): string[] {
	const out = text.replace(/\r\n?/g, "\n").split("\n");
	while (out.length && !(out[out.length - 1] ?? "").trim()) out.pop();
	return out;
}

/**
 * The question's lines with the hint's (or the solution's) words replaced by this text. The body lines the new text leaves as they were,
 * at its start and at its end, keep their exact bytes; the lines between are written in the style of the body's first words (`> words`,
 * or `>words` when that is how it is written); every other line is the same. Refused, with a reason and nothing changed, when the
 * callout is not shown as fields, or when a line of the text would be read as something else (a list, a quotation, a code fence).
 */
export function writeHelpWords(lines: readonly string[], kind: HelpKind, text: string): Made {
	const t = target(lines, kind);
	if ("reason" in t) return no(t.reason);
	const { helps, part } = t;
	if (!part.words) return no(part.why ?? "This is edited in the Markdown.");
	if (text.replace(/\r\n?/g, "\n") === part.text) return { ok: true, lines: [...lines] };
	const now = lines.slice(part.from + 1, part.to);
	const oldTexts = now.map((l) => QUOTED.exec(l)?.[2] ?? "");
	const newTexts = linesOf(text);
	let head = 0;
	while (head < oldTexts.length && head < newTexts.length && oldTexts[head] === newTexts[head]) head++;
	let tail = 0;
	while (tail < oldTexts.length - head && tail < newTexts.length - head && oldTexts[oldTexts.length - 1 - tail] === newTexts[newTexts.length - 1 - tail]) tail++;
	const space = now.map((l) => QUOTED.exec(l)).find((m) => m && (m[2] ?? "").trim() !== "")?.[1] ?? " ";
	const made = newTexts.slice(head, newTexts.length - tail).map((x) => (x === "" ? ">" : `>${space}${x}`));
	const out = [...lines.slice(0, part.from + 1 + head), ...made, ...lines.slice(part.to - tail)];
	const again = readHelps(out);
	const wanted = newTexts.join("\n");
	const back = "refused" in again ? undefined : again.parts.find((x) => x.kind === kind);
	if ("refused" in again || !back || !back.words || back.text !== wanted || shapeOf(again) !== shapeOf(helps) || again.at !== helps.at)
		return no("A line of that text would be read as something else (a list, a quotation, a code fence, a heading, or a line that begins with [!), so it cannot be part of the words.");
	return { ok: true, lines: out };
}

/** The question's lines with the hint's (or the solution's) title changed on its own line, and nothing else. */
export function writeHelpTitle(lines: readonly string[], kind: HelpKind, title: string): Made {
	const t = target(lines, kind);
	if ("reason" in t) return no(t.reason);
	const p = parseLine(lines[t.part.from] ?? "");
	if (!p) return no("That is not a Booklet line.");
	const e = setTitle(p, title);
	if ("error" in e) return no(e.error);
	if (e.text === lines[t.part.from]) return { ok: true, lines: [...lines] };
	const out = [...lines];
	out[t.part.from] = e.text;
	const again = readHelps(out);
	if ("refused" in again || shapeOf(again) !== JSON.stringify(t.helps.parts.map((x) => [x.kind, x.fold, x.kind === kind ? title.trim() : x.title])))
		return no("That title cannot be written on the line.");
	return { ok: true, lines: out };
}

/** The question's lines with the hint's (or the solution's) fold switch put on (`-`) or off, which is the one character of its mark. */
export function writeHelpFold(lines: readonly string[], kind: HelpKind, folded: boolean): Made {
	const t = target(lines, kind);
	if ("reason" in t) return no(t.reason);
	const made = setFoldLine(lines[t.part.from] ?? "", folded);
	if (!made.ok) return no(made.reason);
	if (made.text === lines[t.part.from]) return { ok: true, lines: [...lines] };
	const out = [...lines];
	out[t.part.from] = made.text;
	return { ok: true, lines: out };
}

/** The title a new hint or solution is given (the words the format's own pieces use). */
const DEFAULT_TITLE: Readonly<Record<HelpKind, string>> = { hint: "Hint", solution: "Solution" };

/**
 * The question's lines with a hint (or a solution) added, folded, with its title and no words yet: a blank line and its line. A hint is
 * put before the solution when there is one, a solution after everything. Refused when the question has one already, or when its lines
 * cannot be read into fields.
 */
export function addHelp(lines: readonly string[], kind: HelpKind): Made {
	const helps = readHelps(lines);
	if ("refused" in helps) return no(helps.refused);
	if (helps.parts.some((x) => x.kind === kind)) return no(`The question has a ${kind} already.`);
	const callout = `> [!${kind}]- ${DEFAULT_TITLE[kind]}`;
	const solution = kind === "hint" ? helps.parts.find((x) => x.kind === "solution") : undefined;
	let out: string[];
	if (solution) {
		// before the solution: a blank line first when the line above is not blank, and one after, which separates it from the solution
		const above = lines[solution.from - 1];
		out = [...lines.slice(0, solution.from), ...(blank(above) ? [] : [""]), callout, "", ...lines.slice(solution.from)];
	} else out = [...lines, "", callout];
	return { ok: true, lines: out };
}

/**
 * The question's lines with the hint (or the solution) taken out, with the blank lines that separate it from what is above it. Refused when
 * the callout holds more than words: it is deleted in the Markdown, where it can be seen.
 */
export function removeHelp(lines: readonly string[], kind: HelpKind): Made {
	const t = target(lines, kind);
	if ("reason" in t) return no(t.reason);
	const { part } = t;
	if (!part.words) return no(part.why ?? "This is edited in the Markdown.");
	let from = part.from;
	while (from > 0 && blank(lines[from - 1])) from--;
	// a callout that stands right under the question's lines keeps the one blank line that the next callout (if any) is read after
	const out = [...lines.slice(0, from), ...lines.slice(part.to)];
	// what was after the callout is a callout that began after blank lines: those blank lines stay as they were
	return { ok: true, lines: out };
}
