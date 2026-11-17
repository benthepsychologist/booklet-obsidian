/*
 * The words of a block that the Design view edits where they are drawn: a question's title and its description, a reading callout's title and
 * its body, a prose block's text. Plain TypeScript: nothing here imports Obsidian or the DOM.
 *
 * `readParts` reads a block's own lines (written without the `>` marks of the groups around it, as `blockLines` gives them) into its title
 * (the words after the bracket on its first line), its DESCRIPTION and what is left:
 *
 *   question   the `>` lines straight under its first line, up to the first line that is not one, or that opens a callout of its own (the
 *              reader's `bodyEnd`: a hint or a solution under the question). The list under them, the anchors of a scale and the rest are
 *              not the description: the rows and the Markdown own them.
 *   callout    its body: every `>` line under its first line. A reading callout has nothing else; lines that are not its body are refused.
 *   prose      all of its lines: it has no title.
 *
 * ONLY WHAT IS LOSSLESS. Nothing here rewrites a line it is not asked to change. `writeDescription` keeps every line of the description
 * that the new text leaves as it was, byte for byte (a trailing space, a `> ` that is blank, a `>` with no space after it), writes only
 * the lines between, and leaves every other line of the block as it is, so reading and writing the same text gives the same lines. What the
 * description cannot be written from is refused, in words, and the Design view then edits the block as Markdown: a first line that is no
 * Booklet line, extra `>` marks in front of it, a closing line, a stray carriage return, a callout with lines that are not its body. A
 * text whose lines the format would read as something else (a line that opens a callout, in a question's description) is refused too,
 * and nothing is changed.
 */
import { parseLine } from "./editor-line";
import { LP } from "./editor-patterns";
import type { DesignKind } from "./design-tree";

/** The kinds of block that have a title and a description (or a text) the view edits in place. */
export const PARTS_KINDS: readonly DesignKind[] = ["question", "callout", "prose"];

/** The kinds of question that have a description: the ones the view draws (design-canvas-draw.ts). */
const DESCRIBED: ReadonlySet<string> = new Set(["choice", "multi", "matrix", "text", "number", "scale", "date", "lines"]);

export interface Parts {
	kind: "question" | "callout" | "prose";
	/** The words after the bracket on the first line; null for a prose block (it has no first line of that kind). */
	title: string | null;
	/** The block has a description (a question of a kind the view draws, a callout, a prose block). When false, `description` is "". */
	described: boolean;
	/** The description's lines without their `>` mark and the one space after it, joined with a line break; "" when there are none. */
	description: string;
	/** The index of the description's first line among the block's lines, and the index past its last. */
	from: number;
	to: number;
	/** The lines after the description, as written. */
	rest: string[];
}

export interface PartsRefused {
	refused: string;
}

const refuse = (refused: string): PartsRefused => ({ refused });

/** One `>` line of a description: the words after the mark and one space. */
const QUOTED = /^>( ?)([\s\S]*)$/;

/** The index past the first line and the `>` lines of its body (a `> [!` line ends them), as the reader's `bodyEnd`. */
function bodyEnd(lines: readonly string[]): number {
	let k = 1;
	while (k < lines.length && (lines[k] ?? "").startsWith(">") && !LP.CALLOUT_ANY.test(lines[k] ?? "")) k++;
	return k;
}

/** The parts of a block's own lines, or why they cannot be edited where they are drawn. */
export function readParts(lines: readonly string[], kind: DesignKind): Parts | PartsRefused {
	if (kind !== "question" && kind !== "callout" && kind !== "prose") return refuse("This kind of block has no title and description to edit in place.");
	if (!lines.length) return refuse("The block has no lines.");
	for (const l of lines) if (l.includes("\r")) return refuse("A line holds a stray carriage return, which the fields would not keep as it is.");
	if (kind === "prose") return { kind, title: null, described: true, description: lines.join("\n"), from: 0, to: lines.length, rest: [] };
	const p = parseLine(lines[0] ?? "");
	if (!p) return refuse("The first line is not a Booklet line.");
	if (p.quotes) return refuse("The first line starts with extra > marks.");
	if (p.flags.has("end")) return refuse("This is a closing line, which has no title or description.");
	const described = kind === "callout" || DESCRIBED.has(p.kind);
	if (!described) return { kind, title: p.title, described: false, description: "", from: 1, to: 1, rest: lines.slice(1) };
	const to = bodyEnd(lines);
	const rest = lines.slice(to);
	if (kind === "callout" && rest.length) return refuse(`There is a line under the callout's words that is not part of them: “${clip(rest[0] ?? "")}”.`);
	const texts: string[] = [];
	for (const l of lines.slice(1, to)) texts.push(QUOTED.exec(l)?.[2] ?? "");
	return { kind, title: p.title, described: true, description: texts.join("\n"), from: 1, to, rest };
}

const clip = (s: string): string => (s.trim().length > 40 ? `${s.trim().slice(0, 40)}…` : s.trim());

/** The text a person typed as its lines: line endings made one kind, and the blank lines at its end left off (they would be `>` lines holding nothing). */
function linesOfDescription(text: string): string[] {
	const out = text.replace(/\r\n?/g, "\n").split("\n");
	while (out.length && !(out[out.length - 1] ?? "").trim()) out.pop();
	return out;
}

/**
 * The block's lines with this description in place of the one they have. Every line of the old description the new text leaves as it
 * was (at its start and at its end) keeps its exact bytes; the lines between are written in the style of the description's first words
 * (`> words`, or `>words` when that is how it is written); every other line of the block is the same. Refused, with a reason and nothing
 * changed, when the lines cannot be read into parts, when the kind has no description, when a prose block would be left with no words, and
 * when the text has a line the format would read as another part of the block.
 */
export function writeDescription(lines: readonly string[], kind: DesignKind, text: string): { ok: true; lines: string[] } | { ok: false; reason: string } {
	const parts = readParts(lines, kind);
	if ("refused" in parts) return { ok: false, reason: parts.refused };
	if (!parts.described) return { ok: false, reason: "This kind of question has no description." };
	// a text that is the description as it stands is no change, whatever blank lines it ends with
	if (text.replace(/\r\n?/g, "\n") === parts.description) return { ok: true, lines: [...lines] };
	const now = lines.slice(parts.from, parts.to);
	const oldTexts = parts.kind === "prose" ? [...now] : now.map((l) => QUOTED.exec(l)?.[2] ?? "");
	const newTexts = linesOfDescription(text);
	if (parts.kind === "prose" && !newTexts.length) return { ok: false, reason: "A prose block with no words is a deleted block: delete it instead." };
	let head = 0;
	while (head < oldTexts.length && head < newTexts.length && oldTexts[head] === newTexts[head]) head++;
	let tail = 0;
	while (tail < oldTexts.length - head && tail < newTexts.length - head && oldTexts[oldTexts.length - 1 - tail] === newTexts[newTexts.length - 1 - tail]) tail++;
	// the style a new line is written in: the first words' own (`>` and a space, or `>` and nothing)
	const space = now.map((l) => QUOTED.exec(l)).find((m) => m && (m[2] ?? "").trim() !== "")?.[1] ?? " ";
	const made = newTexts.slice(head, newTexts.length - tail).map((t) => (parts.kind === "prose" ? t : t === "" ? ">" : `>${space}${t}`));
	const out = [...lines.slice(0, parts.from + head), ...made, ...lines.slice(parts.to - tail)];
	// the lines read again: the text typed is the description, and nothing else of the block moved
	const again = readParts(out, kind);
	const wanted = newTexts.join("\n");
	if ("refused" in again || again.description !== wanted || again.rest.join("\n") !== parts.rest.join("\n") || again.title !== parts.title)
		return { ok: false, reason: "A line of that text would be read as another part of the block (a line that begins with [! opens a callout), so it cannot be part of the description." };
	return { ok: true, lines: out };
}
