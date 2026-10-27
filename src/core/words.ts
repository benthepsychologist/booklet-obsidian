/*
 * A kept answer in words, from the file's own lists (SPEC section 8: "Words are shown by the renderer
 * from the file's own lists"), the way booklet.html's SUMMARY readers show a kept entry: a choice's
 * position as its option's words, a scale's number as its anchor's words, a reader's own option as
 * they wrote it. Plain TypeScript: nothing here imports Obsidian.
 */
import type { Question } from "./reader";

/** A piece of an answer in words: `md` is the file's own inline Markdown (an option, an anchor), `text` is plain words. */
export type WordPart = { md: string } | { text: string };

/** An answer in words: pieces on one line, or a list (a lines question's lines); null when it holds nothing to show. */
export type AnswerWords = { parts: WordPart[] } | { list: string[] } | null;

const filled = (s: unknown): s is string => typeof s === "string" && s.trim() !== "";

export function answerWords(q: Question, v: unknown): AnswerWords {
	if (v === undefined || v === null) return null;
	switch (q.kind) {
		case "choice":
		case "multi": {
			const picks = (Array.isArray(v) ? v : [v]).filter((x) => (typeof x === "string" ? x.trim() !== "" : x !== null && x !== undefined));
			if (!picks.length) return null;
			const parts: WordPart[] = [];
			picks.forEach((x, i) => {
				if (i) parts.push({ text: ", " });
				const o = typeof x === "number" ? q.options[x - 1] : undefined;
				parts.push(o ? { md: o.text } : typeof x === "string" ? { text: x } : { text: `#${String(x)}` });
			});
			return { parts };
		}
		case "scale": {
			const a = q.anchors.find((x) => x.n === v);
			return { parts: [a ? { md: a.text } : { text: String(v) }] };
		}
		case "lines": {
			const items = (Array.isArray(v) ? v : [v]).filter(filled).map((x) => x.trim());
			return items.length ? { list: items } : null;
		}
		case "text":
			return filled(v) ? { parts: [{ text: v.trim() }] } : null;
		case "number":
		case "date":
			return v === "" ? null : { parts: [{ text: String(v) }] };
	}
}
