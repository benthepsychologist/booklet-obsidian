/*
 * The `copy` callout (SPEC section 6, "Copy"): the text its button puts on the clipboard. The lead-in the author wrote, then each word of
 * `of:` in the order written, every piece one paragraph, a blank line between them:
 *
 *   <the lead-in>
 *
 *   Question: <the question's words>
 *
 *   My answer: <what the reader typed or picked, or (no answer typed)>
 *
 *   Model answer: <the words of the folded solution callout straight after the question>
 *
 * A word is a question of the copy line's own activity (its `Question:` and `My answer:` pieces), `id/solution` or `id/hint` (the question's own
 * folded callout, `Model answer:` or `Hint:`), or the id of a fenced block marked `^id` (`id:` and a line break, then the block's text). A word
 * that names none of these is left out. The text has no blank line or space at either end. A question's title is copied and its help lines (the
 * body under the title) are not. A question with no title is just `Question:`. Plain TypeScript: nothing here imports Obsidian.
 */
import { isBlank } from "./lines";
import type { Activity, Booklet, CopySegment, FencedBlock, Question } from "./reader";
import { holdsSomething, shapeIssue } from "./shape";

/** What an answer line says when the reader gave none. The same words for every kind of question. */
export const NO_ANSWER = "(no answer typed)";

/** The question kinds a copy line can copy: the ones whose answer is words, a number or a date (a matrix, a widget and a listen cannot be). */
export const COPY_KINDS: readonly string[] = ["text", "lines", "choice", "multi", "scale", "number", "date"];

/** One word of `of:`: an id, or an id and `/solution` or `/hint`. */
const WORD = /^([A-Za-z0-9][A-Za-z0-9-]*)(?:\/(solution|hint))?$/;

/** What a word of `of:` names in an activity, or why it names nothing a copy can use. */
export type CopyTarget = { question: Question; part: "solution" | "hint" | null } | { block: FencedBlock } | { why: string };

/**
 * What `word` names for a copy line in `act`: a question of that activity (or its own solution or hint), else a block in the activity's module
 * (its fence and its data section) and then in the shared data section (SPEC section 4: a reference is looked up in its own module first).
 */
export function copyTarget(
	act: Pick<Activity, "scope" | "segments">,
	blocks: readonly FencedBlock[],
	word: string,
	peers: readonly Pick<Activity, "segments">[] = [],
): CopyTarget {
	const m = WORD.exec(word);
	if (!m || m[1] === undefined) return { why: "is not an id, or an id with /solution or /hint after it" };
	const id = m[1];
	const part = (m[2] as "solution" | "hint" | undefined) ?? null;
	const q = act.segments.find((s): s is Question => s.type === "question" && s.id === id);
	if (q) {
		if (!COPY_KINDS.includes(q.kind)) return { why: `is a ${q.kind} question, and only text, lines, choice, multi, scale, number and date questions can be copied` };
		if (q.each) return { why: "is asked for each pick of another question, and such a question cannot be copied" };
		if (part && q[part] === null) return { why: `is a question with no ${part} folded (\`> [!${part}]-\`) straight under it` };
		return { question: q, part };
	}
	if (peers.some((a) => a !== act && a.segments.some((s) => s.type === "question" && s.id === id))) {
		return { why: "is a question of another activity, and a copy line copies from its own activity" };
	}
	if (part) return { why: "names no question of this activity" };
	const own = act.scope ? blocks.find((b) => b.id === id && b.module === act.scope) : undefined;
	const hit = own ?? blocks.find((b) => b.id === id && b.module === null);
	return hit ? { block: hit } : { why: "names no question of this activity and no block of this module" };
}

/** The ways the view tells this module what the reader's answers are now. */
export interface CopyAnswers {
	/** The answer a question holds as the reader sees it (words typed and not written yet included), or undefined for none. */
	answerOf(q: Question): unknown;
}

export interface CopyResult {
	/** What goes on the clipboard. */
	text: string;
	/** The words of `of:` that name nothing a copy can use, in order. They are not in `text`. */
	missing: string[];
}

/** A picked option's or anchor's words as written, else the number it is. */
const pickWords = (q: Question, x: unknown): string => {
	if (typeof x === "string") return x.trim();
	const words = q.kind === "scale" ? q.anchors.find((a) => a.n === x)?.text : typeof x === "number" ? q.options[x - 1]?.text : undefined;
	return (words ?? String(x)).trim();
};

/**
 * What a question's answer says in the copy (SPEC section 6, "Copy", the answer table): the words as the reader typed them, a number as a
 * number, each line of a `lines` answer and each pick of a `multi` on a line of its own, a choice's or a scale's words as written in the file,
 * and `(no answer typed)` when there is none. An answer of the wrong shape for its kind is copied as the JSON the file holds it as.
 */
export function answerLine(q: Question, v: unknown): string {
	if (v === undefined || v === null || !holdsSomething(v)) return NO_ANSWER;
	if (shapeIssue(q, v)) return JSON.stringify(v);
	const picks = (Array.isArray(v) ? v : [v]).filter((x) => (typeof x === "string" ? x.trim() !== "" : x !== null && x !== undefined));
	let out: string;
	switch (q.kind) {
		case "lines":
			out = (Array.isArray(v) ? v : [v]).join("\n").trim(); // every line as typed (blank ones inside too); only the whole answer's ends are trimmed
			break;
		case "multi":
			out = picks.map((x) => pickWords(q, x)).join("\n");
			break;
		case "choice":
		case "scale":
			out = picks.length ? pickWords(q, picks[0]) : "";
			break;
		default:
			out = ((v as string | number) + "").trim();
	}
	return out || NO_ANSWER;
}

/** Any text with the blank lines at either end off and the rest as written. */
export const trimBlankLines = (s: string): string => (isBlank(s) ? "" : s.replace(/^(?:[ \t]*\r?\n)+/, "").replace(/(?:\r?\n[ \t]*)+$/, ""));

/**
 * The text a copy line in `act` puts on the clipboard, and the words of `of:` it left out. The pieces are in the order written; a word written
 * twice is copied twice.
 */
export function copyText(book: Pick<Booklet, "blocks">, act: Pick<Activity, "scope" | "segments">, c: Pick<CopySegment, "of" | "prompt">, answers: CopyAnswers): CopyResult {
	const parts: string[] = [];
	const missing: string[] = [];
	const lead = trimBlankLines(c.prompt);
	if (lead) parts.push(lead);
	for (const word of c.of) {
		const t = copyTarget(act, book.blocks, word);
		if ("why" in t) missing.push(word);
		else if ("block" in t) parts.push(`${t.block.id}:\n${trimBlankLines(t.block.text)}`);
		else if (t.part === "solution") parts.push(`Model answer: ${t.question.solution ?? ""}`.trimEnd());
		else if (t.part === "hint") parts.push(`Hint: ${t.question.hint ?? ""}`.trimEnd());
		else parts.push(t.question.title.trim() ? `Question: ${t.question.title.trim()}` : "Question:", `My answer: ${answerLine(t.question, answers.answerOf(t.question))}`);
	}
	return { text: parts.join("\n\n").trim(), missing };
}
