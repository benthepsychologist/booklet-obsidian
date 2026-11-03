/*
 * The `listen` question (SPEC section 5, "Listen"): the `>` lines under it, the done rule, and the answer a press, a pause or the end
 * of the media makes. Everything here is a pure function of its arguments: the view plays the media and tells this file what happened.
 * Plain TypeScript: nothing here imports Obsidian.
 */

import { inertLines, inertSpans } from "./blocks";

/** `left:` when the line sets none: a pause within this many seconds of the end counts as finished (past the half way mark). */
export const LISTEN_LEFT = 120;

/** `left:`'s value: a whole number of seconds written in digits only, or null when it is not one. */
export function leftValue(v: string): number | null {
	return /^[0-9]+$/.test(v) ? Number(v) : null;
}

/* ---- the `>` lines ---- */

/**
 * An embed: Obsidian's file embed (`![[x.mp3]]`; `![[#^id]]` is a block embed, which is no media), the image syntax inline
 * (`![alt](url "title")`), and its reference forms (`![alt][id]`, `![id][]`, `![id]`).
 */
const EMBED = /!\[\[[^\]\n#][^\]\n]*\]\]|!\[[^\]\n]*\]\([^)\n]*\)|!\[[^\]\n]*\]\[[^\]\n]*\]|!\[[^\]\n[]+\](?![([:])/g;

/**
 * A link, found where no `!` stands before it (a prefix character is part of the first form, so there is no lookbehind): inline
 * `[words](url)`, reference `[words][id]`, an autolink `<https://…>`, or a bare `https://…` address.
 */
const LINK = /(^|[^![])(\[[^\][\n^][^\]\n]*\](?:\([^)\n]*\)|\[[^\]\n]*\]))|(<https?:\/\/[^>\s]+>)|(https?:\/\/[^\s<>)\]]+)/g;

export interface ListenBody {
	/** The embed written, else the link written, as it stands in the note (what the view hands to its Markdown renderer); null when there is neither. */
	media: string | null;
	/** How many embeds the lines hold: more than one is reported, and only the first is the media. */
	embeds: number;
	/** The other lines, as Markdown: the media taken out. */
	help: string;
}

/**
 * The `>` lines under a `listen` line, with their `>` already taken off: the one piece of media (the first embed, else the first
 * link) and, apart from it, the help. A line left empty by taking the media out is dropped; every other line is kept as written.
 * Code is never the media: an embed or a link inside a fenced or indented block or an inline code span is words the author wrote
 * about it, and stays in the help as written (the scan runs on the lines with their code blanked out, to the same length).
 */
export function listenBody(body: readonly string[]): ListenBody {
	const inert = inertLines(body);
	const scan = body.map((l, i) => (inert[i] ? " ".repeat(l.length) : inertSpans(l)));
	let embeds = 0;
	let found: { line: number; start: number; end: number } | null = null;
	for (const [line, l] of scan.entries()) {
		for (const m of l.matchAll(EMBED)) {
			embeds++;
			if (!found) found = { line, start: m.index ?? 0, end: (m.index ?? 0) + m[0].length };
		}
	}
	// with no embed, the first link is the media: a video service's page is a link, never an embed (SPEC section 5)
	for (const [line, l] of embeds ? [] : scan.entries()) {
		if (found) break;
		for (const m of l.matchAll(LINK)) {
			const text = m[2] ?? m[3] ?? m[4] ?? "";
			const start = (m.index ?? 0) + (m[2] !== undefined ? (m[1] ?? "").length : 0);
			found = { line, start, end: start + text.length };
			break;
		}
	}
	if (!found) return { media: null, embeds, help: body.join("\n").trim() };
	const { line: at, start, end } = found;
	const text = body[at] ?? "";
	const rest = (text.slice(0, start) + text.slice(end)).trim();
	const lines = body.flatMap((l, i) => (i === at ? (rest ? [rest] : []) : [l]));
	return { media: text.slice(start, end), embeds, help: lines.join("\n").trim() };
}

/* ---- the answer ---- */

/** Is it a JSON object (not null, not an array)? */
export const isObj = (x: unknown): x is Record<string, unknown> => x !== null && typeof x === "object" && !Array.isArray(x);

/** The `pos` an answer holds, else 0 (the start). */
export function posIn(v: unknown): number {
	const p = isObj(v) ? v["pos"] : undefined;
	return typeof p === "number" && Number.isInteger(p) && p > 0 ? p : 0;
}

/** The scope and question id of a `<scope>/<id>` key (a `listen`'s place in the note's records, and the device store's key). */
export function splitKey(key: string): { scope: string; id: string } {
	const at = key.lastIndexOf("/");
	return { scope: key.slice(0, at), id: key.slice(at + 1) };
}

/**
 * Is the media done? It is when it has ended, or when its length is known and the position is within `left` seconds of the end and
 * past half way (a short clip is within `left` seconds of its end from the first second, so a pause at its start is not done). With an
 * unknown or infinite length only the end counts. The position is taken in whole seconds.
 */
export function after(posSec: number, durationSec: number, left: number, ended = false): boolean {
	if (ended) return true;
	if (!Number.isFinite(posSec) || !Number.isFinite(durationSec) || durationSec <= 0) return false;
	const pos = Math.floor(posSec);
	return pos >= durationSec - left && pos >= durationSec / 2;
}

/** A position as the reader sees it: `12:34`, or `1:02:03` from an hour on. Whole seconds; a position that is no number is 0:00. */
export function clock(posSec: number): string {
	const s = Number.isFinite(posSec) && posSec > 0 ? Math.floor(posSec) : 0;
	const h = Math.floor(s / 3600);
	const m = Math.floor((s % 3600) / 60);
	const pad = (n: number) => String(n).padStart(2, "0");
	return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}

/** What happened: the media reached its end; it was paused or stopped; the reader ticked "done"; the reader cleared it. */
export type ListenEvent = "end" | "pause" | "tick" | "untick";

/** Where the media is when something happens, in seconds, and how long it is (NaN or Infinity when that is not known). */
export interface ListenAt {
	pos?: number;
	duration?: number;
}

/** Adds or replaces one key of a copy of `o`: a key already there keeps its place, a new one goes last. */
function put(o: Record<string, unknown>, key: string, value: unknown): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	let done = false;
	for (const [k, v] of Object.entries(o)) {
		out[k] = k === key ? value : v;
		if (k === key) done = true;
	}
	if (!done) out[key] = value;
	return out;
}

/** A copy of `o` without `key`. */
function without(o: Record<string, unknown>, key: string): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(o)) if (k !== key) out[k] = v;
	return out;
}

/**
 * The answer after something happens to a `listen`, from the answer it holds now (`existing`: an object, or nothing), or null for
 * no change. The answer returned keeps every key it had, in the order it had them (other keys are allowed, SPEC section 8); only
 * `pos` and `done` change, and a new answer is written `{ "pos": n, "done": b }`, `pos` first.
 *
 * - `end`: `done` is true and `pos` is taken out (a position at the end is reset; the format reads a missing `pos` as the start).
 * - `pause` (a stop is the same): `pos` is the position in whole seconds, and `done` becomes true when `after` says so. A `done` that is
 *   true is never cleared. A pause that leaves the answer as it is changes nothing, and a first pause at the very start makes no answer.
 * - `tick`: `done` is true; everything else is as it was.
 * - `untick`: `done` is false, the key kept where it stands. An answer left with nothing in it (`{}`, `{ "done": false }`) holds nothing
 *   and is no answer: the writer takes it out (setAnswer), so a listen never ticked and unticked leaves no mark.
 *
 * An `existing` that is not an object (an answer of the wrong shape, kept as written) is never changed here.
 */
export function listenNext(existing: unknown, ev: ListenEvent, at: ListenAt, left: number): Record<string, unknown> | null {
	if (existing !== undefined && existing !== null && !isObj(existing)) return null;
	const was: Record<string, unknown> = isObj(existing) ? existing : {};
	const same = (a: Record<string, unknown>) => JSON.stringify(a) === JSON.stringify(was);
	const fresh = Object.keys(was).length === 0;
	let next: Record<string, unknown>;
	switch (ev) {
		case "end":
			next = put(without(was, "pos"), "done", true);
			break;
		case "tick":
			next = put(was, "done", true);
			break;
		case "untick":
			if (!Object.prototype.hasOwnProperty.call(was, "done")) return null;
			next = put(was, "done", false);
			break;
		case "pause": {
			const p = at.pos;
			if (typeof p !== "number" || !Number.isFinite(p) || p < 0) return null;
			const pos = Math.floor(p);
			const finished = was["done"] === true || after(pos, at.duration ?? NaN, left);
			const hasPos = Object.prototype.hasOwnProperty.call(was, "pos");
			if (fresh) {
				if (pos === 0 && !finished) return null;
				next = { pos, done: finished };
			} else {
				next = hasPos || pos > 0 ? put(was, "pos", pos) : was;
				if (finished && was["done"] !== true) next = put(next, "done", true);
			}
			break;
		}
	}
	return same(next) ? null : next;
}
