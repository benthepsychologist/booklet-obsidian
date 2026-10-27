/*
 * An answer of the wrong shape: the rule that format 0.16 adds to SPEC section 8, which this plugin follows ahead
 * of the format. An answer whose shape is not its kind's is kept as written, and its question is drawn read-only,
 * with a notice saying so. Nothing rewrites it: not a press, not Finalize, not a change from elsewhere. A
 * hand-edited record, or a renderer that stored another kind's answer under this id, must never be damaged by the
 * first tap. Each kind's shape is SPEC section 5's table and section 7's widgets. Plain TypeScript: nothing here
 * imports Obsidian.
 */
import type { Question } from "./reader";
import { engineOf } from "./widgets";

/** Whether anything was typed or picked, at any depth: a blank string, an empty list and nothing at all are no answer (booklet.html holdsSomething). */
export function holdsSomething(v: unknown): boolean {
	if (typeof v === "string") return v.trim().length > 0;
	if (Array.isArray(v)) return v.some(holdsSomething);
	if (v && typeof v === "object") return Object.values(v).some(holdsSomething);
	return typeof v === "number" || v === true;
}

const isObj = (x: unknown): x is Record<string, unknown> => x !== null && typeof x === "object" && !Array.isArray(x);
const isNum = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
const isWhole = (x: unknown, from: number): x is number => isNum(x) && Number.isInteger(x) && x >= from;
/** A choice's or a multi's member: an option's position (a whole number from 1), or the reader's own option (a string). */
const isPick = (x: unknown): boolean => isWhole(x, 1) || typeof x === "string";
/** A multi's answer: a list of positions and the reader's own options. */
const isMultiAnswer = (v: unknown): boolean => Array.isArray(v) && v.every(isPick);

/**
 * What is wrong with an answer's shape for its question, in words ("a text question keeps a string"), or null when
 * its shape is the kind's. An answer that holds nothing (nothing at all, `null`, a blank string, an empty list) is
 * no answer, whatever its type: it is never of the wrong shape. A question this plugin does not draw (a widget of an
 * engine it does not have) has no shape to check here: nothing in this view writes it.
 */
export function shapeIssue(q: Question, v: unknown): string | null {
	if (!holdsSomething(v)) return null;
	switch (q.kind) {
		case "text":
			return typeof v === "string" ? null : "a text question keeps a string";
		case "date":
			// a date written another way by hand is a string too: kept as written and said (questions.ts drawDate)
			return typeof v === "string" ? null : "a date question keeps a date written as a string";
		case "lines":
			return Array.isArray(v) && v.every((x) => typeof x === "string") ? null : "a lines question keeps a list of strings";
		case "number":
			return isNum(v) ? null : "a number question keeps a number";
		case "scale":
			return isWhole(v, 0) ? null : "a scale question keeps an anchor's number";
		case "choice":
			return isPick(v) ? null : "a choice question keeps an option's position from 1, or the reader's own option";
		case "multi":
			return isMultiAnswer(v) ? null : "a multi question keeps a list of option positions from 1 and the reader's own options";
		case "widget": {
			const engine = q.widget ? engineOf(q.widget.data) : "";
			if (engine === "grid-select") return Array.isArray(v) && v.every((x) => typeof x === "string") ? null : "a grid-select widget keeps a list of item ids and words of the reader's own";
			if (engine === "svg-regions")
				return Array.isArray(v) && v.every((r) => isObj(r) && typeof r["id"] === "string" && Array.isArray(r["s"]) && r["s"].every((x) => typeof x === "string"))
					? null
					: 'an svg-regions widget keeps a list of places, each { "id", "s": [words] }';
			return null;
		}
	}
	return null;
}
