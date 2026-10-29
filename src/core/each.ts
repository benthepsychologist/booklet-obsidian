/*
 * A question, of any kind, asked for each pick of another (`each:<id>`, SPEC section 5, "A question asked for each pick").
 * Its source is a choice, a multi or a widget in the same activity; a pick is an identity in the source's answer:
 *   a choice: its one answer;  a multi: each member, an option's position or the reader's own option;
 *   a grid-select: each id, an item id or the reader's own `x|cell|word`;  an svg-regions: each region marked, by id.
 * The answer is a list of pairs, `{ "pick": <the pick exactly as the source stores it>, "a": <the answer its kind stores> }`: a
 * pick keeps its type (a position 3 and an own option "3" stay apart), and a pick with no answer has no pair. A pick
 * taken back keeps its pair, not drawn, and it comes back when the pick is made again: every view shows only the
 * pairs whose pick the source holds in the same record. Plain TypeScript: nothing here imports Obsidian.
 */
import type { Activity, Question } from "./reader";
import { holdsSomething, isPair, shapeIssue } from "./shape";
import { engineOf, gridLabel, gridOf, regionLabel, regionsOf } from "./widgets";
import type { WordPart } from "./words";

export type PickValue = number | string;
/** One pair of the answer: its other keys, if a hand edit gave it any, are kept as written. */
export type Pair = { pick: PickValue; a: unknown } & Record<string, unknown>;

/** The question without its `each:`: what a pair's answer is read as. */
export const plainOf = (q: Question): Question => (q.each ? { ...q, each: null } : q);

/** A question's source: the choice, multi or widget its `each:` names in the same activity. */
export function sourceOf(act: Pick<Activity, "segments">, q: Question): Question | null {
	if (!q.each) return null;
	return act.segments.find((s): s is Question => s.type === "question" && s.id === q.each) ?? null;
}

/** A pick as a key that keeps its type apart: `n:3` and `s:3`. */
export const pickKey = (p: PickValue): string => (typeof p === "number" ? `n:${p}` : `s:${p}`);

/**
 * The picks in a source's answer, in the order it holds them, each once. An answer of the wrong shape for the source
 * (shape.ts) holds no picks; an engine this plugin does not draw has none either.
 */
export function sourcePicks(src: Question, v: unknown): PickValue[] {
	if (v === undefined || v === null || shapeIssue(src, v)) return [];
	let all: unknown[] = [];
	if (src.kind === "choice") all = [v];
	else if (src.kind === "multi") all = Array.isArray(v) ? v : [];
	else if (src.kind === "widget" && src.widget) {
		const engine = engineOf(src.widget.data);
		if (engine === "grid-select") all = Array.isArray(v) ? v : [];
		else if (engine === "svg-regions") all = Array.isArray(v) ? v.map((r) => (r && typeof r === "object" ? (r as Record<string, unknown>)["id"] : undefined)) : [];
	}
	const out: PickValue[] = [];
	const seen = new Set<string>();
	for (const x of all) {
		if (!(typeof x === "number" || (typeof x === "string" && x.trim()))) continue;
		const k = pickKey(x);
		if (seen.has(k)) continue;
		seen.add(k);
		out.push(x);
	}
	return out;
}

/**
 * A pick in words, as its source shows it: an option's words (inline Markdown), the reader's own option as written,
 * an item's or a region's label, or, for a grid's `x|cell|word`, the word. A position whose option the design has
 * since removed is shown as the kept entries show it, `#7`; an id the widget no longer has, as the id.
 */
export function pickWords(src: Question, p: PickValue): WordPart {
	if (src.kind === "choice" || src.kind === "multi") {
		if (typeof p === "string") return { text: p };
		const o = src.options[p - 1];
		return o ? { md: o.text } : { text: `#${p}` };
	}
	const data = src.widget?.data;
	if (!data || typeof p !== "string") return { text: String(p) };
	const engine = engineOf(data);
	if (engine === "grid-select") return { text: gridLabel(gridOf(data), p) };
	if (engine === "svg-regions") return { text: regionLabel(regionsOf(data), p) };
	return { text: p };
}

/** The pairs of an answer (members that are not pairs are not read). */
export const pairsOf = (v: unknown): Pair[] => (Array.isArray(v) ? v.filter((x): x is Pair => isPair(x)) : []);

/** The first pair for a pick, compared exactly: a number and a string never match. */
export const pairFor = (v: unknown, p: PickValue): Pair | undefined => pairsOf(v).find((x) => x.pick === p);

/**
 * The answer with one pick's answer set to `a`: the pick's first pair has `a` replaced in place (its other keys, and
 * their order, as they were); a pick with no pair gets one at the end; an answer that holds nothing takes the pair
 * out, as a pick with no answer has no pair. Every other member stays as it is, pairs for picks taken back among them.
 */
export function setPair(v: unknown, p: PickValue, a: unknown): unknown[] {
	const list = Array.isArray(v) ? v : [];
	const at = list.findIndex((x) => isPair(x) && x.pick === p);
	if (!holdsSomething(a)) return at < 0 ? list : list.filter((_, i) => i !== at);
	if (at < 0) return [...list, { pick: p, a }];
	return list.map((x, i) => (i === at ? { ...(x as Pair), a } : x));
}

/** The pairs a view shows: one for each pick the source holds, in the source's order, with its pair if it has one. */
export function shownPairs(src: Question, record: Record<string, unknown> | undefined, q: Question): { pick: PickValue; pair: Pair | undefined }[] {
	const v = record?.[q.id];
	return sourcePicks(src, record?.[src.id]).map((pick) => ({ pick, pair: pairFor(v, pick) }));
}

/**
 * Whether a draft or an entry holds any answer, as the proposal's rule for a pick taken back has it: a question asked
 * for each pick counts only for the pairs whose pick its source holds in the same record, so a draft whose only
 * answers are pairs for picks taken back counts as empty. An answer of the wrong shape counts as an answer.
 */
export function recordFilled(act: Partial<Pick<Activity, "segments">>, rec: Record<string, unknown> | undefined): boolean {
	if (!rec) return false;
	for (const k of Object.keys(rec)) {
		const v = rec[k];
		if (!holdsSomething(v)) continue;
		const q = act.segments?.find((s): s is Question => s.type === "question" && s.id === k);
		const src = q && q.each && !shapeIssue(q, v) ? sourceOf({ segments: act.segments ?? [] }, q) : null;
		if (!q || !src) return true;
		const held = new Set(sourcePicks(src, rec[src.id]).map(pickKey));
		if (pairsOf(v).some((x) => held.has(pickKey(x.pick)) && holdsSomething(x.a))) return true;
	}
	return false;
}
