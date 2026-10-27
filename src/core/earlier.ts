/*
 * A reader's own words, offered again (format 0.16's "Words the reader wrote before", which this plugin draws ahead of
 * the format, as the approved earlier-answers design has it). Three places offer them, as unpressed buttons:
 *   an own option (`open`), after a choice's or a multi's options, and under every copy of a follow-up (`each:`);
 *   a word written for a place in an svg-regions widget, under every place, after the widget's words;
 *   an earlier line of a lines question, under its lines, only when its line sets `earlier:<n>`.
 * A grid cell's words and a text answer are not offered again.
 *
 * Where words come from: the activity's kept entries, and the answer being written (its other places: a body
 * widget's other places, a follow-up's other copies). No other draft. In a `repeat daily` activity today's kept
 * entry, which the draft will replace, is not a source. Under `each:` only the pairs whose pick the source holds in
 * the same record give words. Words are read only from an answer in its kind's shape.
 *
 * The order is newest first: the answer being written, then the kept entries by the time in their `ts`. At most
 * earlierLimit(q) are offered at each place, counted after the words listed there and the words already in the
 * answer there are left out. Nothing here stores anything: a tap goes down the path typing the words goes down.
 * Plain TypeScript: nothing here imports Obsidian.
 */
import type { Activity, Booklet, Question } from "./reader";
import type { Entry } from "./records";
import { pairFor, sourceOf, sourcePicks, type PickValue } from "./each";
import { shapeIssue } from "./shape";
import { normWords, regionsOf, senseWord, type Regions } from "./widgets";
import { todaysEntry, type DayRule } from "./write";

/** How many earlier words a question offers at each place when its line does not say (Ben: "keep the limit of 12"). */
export const EARLIER_DEFAULT = 12;

/** How many earlier words a question offers at each place: its `earlier:<n>`; else 12, and none for a lines question. */
export function earlierLimit(q: Pick<Question, "kind" | "earlier">): number {
	if (q.earlier !== null) return q.earlier;
	return q.kind === "lines" ? 0 : EARLIER_DEFAULT;
}

/** Markdown's words without their marks: what a reader's own option is compared with (SPEC section 5). */
export const plainWords = (md: string): string =>
	md
		.replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
		.replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, "$1")
		.replace(/[*_~=`]/g, "")
		.replace(/\\(.)/g, "$1");

/** Two own options, or two lines, are the same words when they match in lower case, white space at either end aside (SPEC section 5). */
export const sameWords = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Kept entries by the time in their `ts`, newest first; a `ts` that is not a time is compared as text. */
export const newestFirst = (a: Entry, b: Entry): number => {
	const x = Date.parse(String(a.ts));
	const y = Date.parse(String(b.ts));
	return Number.isFinite(x) && Number.isFinite(y) ? y - x : String(b.ts).localeCompare(String(a.ts));
};

/**
 * The kept entries an activity's earlier words come from, newest first. An activity that does not repeat keeps none.
 * In a `repeat daily` activity (with `rule`), today's kept entry is left out: the draft shows it and will replace it,
 * so a word the reader took out of today's answer does not come back from the entry it is replacing.
 */
export function earlierEntries(book: Booklet, scope: string, activity: Pick<Activity, "id" | "repeat" | "daily">, rule?: DayRule): Entry[] {
	if (!activity.repeat) return [];
	const all = book.records.entries[scope]?.[activity.id] ?? [];
	const today = activity.daily && rule ? todaysEntry(book, scope, activity.id, rule) : null;
	return all.filter((e) => e !== today).sort(newestFirst);
}

/** The words worth offering in a list, trimmed: strings with something other than white space in them. */
const wordsIn = (list: readonly unknown[]): string[] => list.filter((x): x is string => typeof x === "string" && x.trim() !== "").map((x) => x.trim());

/** An answer's members: a list as it is, one value as a list of one. */
const membersOf = (v: unknown): unknown[] => (Array.isArray(v) ? v : v === undefined || v === null ? [] : [v]);

/** Up to `limit` words from `from`, in order, each once by `same`, none that `skip` says is there already. */
function takeWords(from: Iterable<string>, limit: number, same: (a: string, b: string) => boolean, skip: (w: string) => boolean): string[] {
	const out: string[] = [];
	if (limit <= 0) return out;
	for (const w of from) {
		if (skip(w) || out.some((o) => same(o, w))) continue;
		out.push(w);
		if (out.length >= limit) break;
	}
	return out;
}

/* ---- own options ---- */

/**
 * A choice's or a multi's own options in one record (a draft as shown, the answers, or a kept entry), in the order
 * written. Under `each:`, the pairs whose pick the source holds in the same record, in the source's order; `except`
 * leaves one pick's pair out (the copy the words are offered under). Nothing from an answer of the wrong shape.
 */
export function ownOptionsIn(act: Pick<Activity, "segments">, q: Question, rec: Record<string, unknown> | undefined, except?: PickValue): string[] {
	const v = rec?.[q.id];
	if (v === undefined || shapeIssue(q, v)) return [];
	if (!q.each) return wordsIn(membersOf(v));
	const src = sourceOf(act, q);
	if (!src) return [];
	return sourcePicks(src, rec?.[src.id])
		.filter((p) => p !== except)
		.flatMap((p) => wordsIn(membersOf(pairFor(v, p)?.a)));
}

/**
 * The own options a choice or a multi offers again (`open`), at most earlierLimit(q): for a question asked for each
 * pick, the own options under the record's other picks first (`pick`: the copy they are offered under), then those of
 * the kept entries (earlierEntries), newest first. Words listed as an option, words in `now` (the answer shown at
 * that place) and repeats are left out before the count, compared as SPEC section 5 compares an own option.
 */
export function earlierOptions(
	act: Pick<Activity, "segments">,
	q: Question,
	rec: Record<string, unknown> | undefined,
	entries: readonly Entry[],
	now: readonly (number | string)[],
	pick?: PickValue,
): string[] {
	if (!q.open) return [];
	const listed = q.options.map((o) => plainWords(o.text));
	const there = now.filter((x): x is string => typeof x === "string");
	function* from(): Generator<string> {
		if (q.each && pick !== undefined) yield* ownOptionsIn(act, q, rec, pick);
		for (const e of entries) yield* ownOptionsIn(act, q, e);
	}
	return takeWords(from(), earlierLimit(q), sameWords, (w) => listed.some((o) => sameWords(o, w)) || there.some((o) => sameWords(o, w)));
}

/* ---- a body widget's places (svg-regions) ---- */

/**
 * Whether a word stored in a body widget's row is the reader's own: a string that is not a word id of the widget's
 * `senses`, and does not start with one of its group ids and a colon (so a word id the widget has since dropped,
 * `pressure:9`, is not taken for words).
 */
export function isOwnPlaceWord(rg: Regions, x: unknown): x is string {
	if (typeof x !== "string" || !x.trim()) return false;
	for (const g of rg.senses) {
		if (g.id && x.startsWith(g.id + ":")) return false;
		if (g.words.some((w) => w.id === x)) return false;
	}
	return true;
}

/**
 * The reader's own words in one svg-regions answer, in the widget's order of places (rows for places it no longer
 * lists after the rest, in the answer's order), and within a place in the order written. Nothing from an answer of
 * the wrong shape.
 */
export function ownPlaceWordsIn(q: Question, rg: Regions, v: unknown): string[] {
	if (v === undefined || !Array.isArray(v) || shapeIssue(q, v)) return [];
	const order = rg.regions.map((r) => r.id);
	const at = (id: unknown) => {
		const n = order.indexOf(String(id));
		return n < 0 ? order.length : n;
	};
	const rows = v
		.map((r, i) => ({ r: r as Record<string, unknown>, i }))
		.filter(({ r }) => !!r && typeof r === "object" && typeof r["id"] === "string")
		.sort((a, b) => at(a.r["id"]) - at(b.r["id"]) || a.i - b.i);
	return rows.flatMap(({ r }) => (Array.isArray(r["s"]) ? r["s"].filter((x): x is string => isOwnPlaceWord(rg, x)).map((x) => x.trim()) : []));
}

/**
 * The words a body widget offers again under one place, at most earlierLimit(q): the reader's own words in the answer
 * being written (its other places), then in the kept entries, newest first. A word is offered under every place, as
 * the widget's words are. Words that are one of the widget's words, words already at that place, words holding a
 * comma (the field splits words at commas) and repeats are left out before the count, compared as SPEC section 7
 * compares words (normWords).
 */
export function earlierPlaceWords(q: Question, rg: Regions, now: unknown, entries: readonly Entry[], place: string): string[] {
	const listed = new Set(rg.senses.flatMap((g) => g.words.map((w) => normWords(w.label))));
	const row = Array.isArray(now) ? now.find((r) => !!r && typeof r === "object" && (r as Record<string, unknown>)["id"] === place) : undefined;
	const here = new Set(
		(row && Array.isArray((row as Record<string, unknown>)["s"]) ? ((row as Record<string, unknown>)["s"] as unknown[]) : []).map((x) => normWords(senseWord(rg, x))),
	);
	function* from(): Generator<string> {
		yield* ownPlaceWordsIn(q, rg, now);
		for (const e of entries) yield* ownPlaceWordsIn(q, rg, e[q.id]);
	}
	const same = (a: string, b: string) => normWords(a) === normWords(b);
	return takeWords(from(), earlierLimit(q), same, (w) => w.includes(",") || listed.has(normWords(w)) || here.has(normWords(w)));
}

/** The words an svg-regions widget question offers under `place`: its data read, then earlierPlaceWords. */
export function earlierPlaceWordsOf(q: Question, now: unknown, entries: readonly Entry[], place: string): string[] {
	if (!q.widget) return [];
	return earlierPlaceWords(q, regionsOf(q.widget.data), now, entries, place);
}

/* ---- a lines question ---- */

/** The lines of one lines answer with something other than white space in them, trimmed, in order; nothing from an answer of the wrong shape. */
export function linesIn(q: Question, v: unknown): string[] {
	if (v === undefined || shapeIssue(q, v) || !Array.isArray(v)) return [];
	return wordsIn(v);
}

/**
 * The earlier lines a lines question offers under its fields, at most earlierLimit(q) (none unless its line sets
 * `earlier:<n>`): the lines of the kept entries, newest first, within an entry in the order written. Lines already
 * in the fields (`now`) and repeats are left out before the count, compared as SPEC section 5 compares an own option.
 */
export function earlierLines(q: Question, entries: readonly Entry[], now: readonly string[]): string[] {
	function* from(): Generator<string> {
		for (const e of entries) yield* linesIn(q, e[q.id]);
	}
	return takeWords(from(), earlierLimit(q), sameWords, (w) => now.some((o) => sameWords(o, w)));
}
