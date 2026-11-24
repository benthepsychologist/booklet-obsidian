/*
 * A citation as five fields of the Design view's box: the mark `[^id]` in a sentence and its definition `[^id]: *Title*, details, p. N:
 * "quote" Verified YYYY-MM-DD.` (SPEC section 6, "Citations"). Plain TypeScript: nothing here imports Obsidian or the DOM.
 *
 * The mark and the definition are two places in the note. The box of the sentence that holds the mark shows the definition's fields, and
 * says where the definition is. The reader finds the definition the way it numbers a mark: in the module the mark stands in first, then in
 * the plain data section (`noteFor`, core/blocks.ts), so the fields are those of the note the reader would use.
 *
 * ONLY WHAT IS LOSSLESS. Fields are offered only where the definition fits the pattern the reader reads a citation with (`sourceOfNote`,
 * core/reader.ts: the title in italics and the quote in quotation marks are required, the edition or other detail, the page or place and the
 * verified date are optional) and is a single line. A note that does not fit is just a note (the SPEC says so), shown in words and edited as
 * words, its lines kept. A change rewrites only the piece that was asked for, keeping the punctuation and the spacing the line has; after
 * every change the definition is read again with the same pattern, and a change that would not come back with the fields that were asked
 * for is refused, with the reason in words, and nothing is written.
 *
 * The pieces: the title is the italic words (no `*`); the detail and the page share the part before the colon, separated by commas, and
 * the page is the last of them when it begins `p.`, `pp.`, `art.`, `sec.`, `ch.`, `para.` or `§`; the quote is between quotation marks;
 * the verified date is `Verified YYYY-MM-DD.`.
 */
import { marksIn, noteFor } from "./blocks";
import { blockLines } from "./design-ops";
import { moduleOf, inGroup } from "./design-scope";
import type { DesignNode } from "./design-tree";
import { parseBooklet, sourceOfNote } from "./reader";

export interface SourceFields {
	title: string;
	detail: string;
	page: string;
	quote: string;
	verified: string;
}

export interface CitationNote {
	/** The note's line (0-based) and the number of lines it takes (its first and the indented lines after it). */
	line: number;
	lines: number;
	/** Where the words of the first line start (after `[^id]:` and its spaces). */
	wordsAt: number;
	/** The fields when the words fit the pattern and are on a single line; null otherwise, with `why`. */
	fields: SourceFields | null;
	why: string | null;
}

export interface Citation {
	id: string;
	/** The definition the reader would use for this mark, or null when there is none it could see. */
	note: CitationNote | null;
}

export const NOT_IN_PATTERN = "This note is not in the source pattern, so it is edited as words below.";
export const SEVERAL_LINES = "This note runs over more than one line, so it is edited as words below.";

const NOTE_DEF = /^( {0,3}\[\^([A-Za-z0-9][A-Za-z0-9_.:-]*)\]:[ \t]*)(.*)$/;
// the reader's pattern (`sourceOfNote`), with every piece and every separator captured so that each can be found in the line
const PATTERN = /^(\*)([^*]+)(\*)([ \t]*)(?:(,[ \t]*)([^:]*?))?([ \t]*:[ \t]*)(["“])(.+)(["”])([ \t]*)(?:(Verified[ \t]+)(\d{4}-\d{2}-\d{2})(\.?))?([ \t]*)$/;
const PLACE_WORDS = /^(?:p|pp|art|sec|ch|para)\.[ \t]*\S|^§/i;

/** Splits the part before the colon into its detail and its page the way the reader does (`sourceOfNote`), keeping each piece's own bytes. */
function splitDp(dp: string): { detail: string; detailText: string; page: string; sep: string } {
	const pieces: { s: number; e: number; t: string }[] = [];
	let at = 0;
	for (const raw of dp.split(",")) {
		const lead = raw.length - raw.trimStart().length;
		const t = raw.trim();
		if (t) pieces.push({ s: at + lead, e: at + lead + t.length, t });
		at += raw.length + 1;
	}
	const last = pieces[pieces.length - 1];
	const pageAt = last && PLACE_WORDS.test(last.t) ? pieces.length - 1 : -1;
	const det = pageAt < 0 ? pieces : pieces.slice(0, pageAt);
	const detailText = det.length ? dp.slice(det[0]?.s ?? 0, det[det.length - 1]?.e ?? 0) : "";
	const page = pageAt < 0 ? "" : (last?.t ?? "");
	const sep = det.length && pageAt >= 0 ? dp.slice(det[det.length - 1]?.e ?? 0, last?.s ?? 0) : "";
	return { detail: det.map((x) => x.t).join(", "), detailText, page, sep };
}

/** The pieces of the words of a definition's first line, or null when they do not fit the pattern. */
function spansOf(line: string, wordsAt: number): { fields: SourceFields; groups: string[]; hasDp: boolean; trimAt: number; end: number } | null {
	const rest = line.slice(wordsAt);
	const lead = rest.length - rest.trimStart().length;
	const body = rest.trim();
	const m = PATTERN.exec(body);
	if (!m) return null;
	const g = m.slice(1).map((x) => x ?? "");
	const read = sourceOfNote(body);
	if (!read) return null;
	const dp = splitDp(g[5] ?? "");
	// the pattern read two ways must agree, or the fields would not be the reader's
	if (read.title !== (g[1] ?? "").trim() || read.detail !== dp.detail || read.page !== dp.page || read.quote !== (g[8] ?? "").trim() || read.verified !== (g[12] ?? "")) return null;
	return { fields: { title: read.title, detail: read.detail, page: read.page, quote: read.quote, verified: read.verified }, groups: g, hasDp: m[5] !== undefined, trimAt: wordsAt + lead, end: wordsAt + lead + body.length };
}

/** The note a mark's definition is, read from the line the reader found it on. */
function readNote(raw: readonly string[], line: number): CitationNote {
	const first = (raw[line] ?? "").replace(/\r$/, "");
	const m = NOTE_DEF.exec(first);
	const wordsAt = m ? (m[1] ?? "").length : 0;
	let lines = 1;
	while (/^[ \t]+\S/.test(raw[line + lines] ?? "")) lines++;
	if (!m) return { line, lines, wordsAt, fields: null, why: NOT_IN_PATTERN };
	if (lines > 1) return { line, lines, wordsAt, fields: null, why: SEVERAL_LINES };
	const s = spansOf(first, wordsAt);
	return s ? { line, lines, wordsAt, fields: s.fields, why: null } : { line, lines, wordsAt, fields: null, why: NOT_IN_PATTERN };
}

/** The marks the block's words hold, each with the definition the reader would use for it. One entry for each id, in the order the marks stand. */
export function citationsOf(text: string, node: DesignNode): Citation[] {
	if (node.kind !== "prose") return [];
	const ids: string[] = [];
	for (const id of marksIn(blockLines(text, node).join("\n"))) if (!ids.includes(id)) ids.push(id);
	if (!ids.length) return [];
	const book = parseBooklet(text);
	const raw = text.split("\n");
	const scope = moduleOf(node) ?? "";
	return ids.map((id) => {
		const n = noteFor(book, scope, id);
		return { id, note: n ? readNote(raw, n.line - 1) : null };
	});
}

export interface CitationChange {
	title?: string;
	detail?: string;
	page?: string;
	quote?: string;
	verified?: string;
}

type Made = { ok: true; text: string } | { ok: false; reason: string };
const no = (reason: string): Made => ({ ok: false, reason });

/** Why a piece cannot be written in the line, or null. */
function problem(change: CitationChange): string | null {
	for (const [k, v] of Object.entries(change)) if (typeof v === "string" && /[\r\n]/.test(v)) return `The ${k === "verified" ? "date" : k} is one line: it has no line break.`;
	if (change.title !== undefined) {
		if (!change.title.trim()) return "A source needs a title: it is the italic words the pattern starts with.";
		if (change.title.includes("*")) return "The title is in italics, so it cannot hold a * of its own.";
	}
	if (change.quote !== undefined && !change.quote.trim()) return "A citation needs its quote: the words copied exactly from the source, in quotation marks.";
	if (change.detail !== undefined && change.detail.includes(":")) return "The edition or detail cannot hold a colon: the colon is where the quote begins.";
	if (change.page !== undefined) {
		if (change.page.includes(":")) return "The page or place cannot hold a colon: the colon is where the quote begins.";
		if (change.page.trim() && !PLACE_WORDS.test(change.page.trim())) return "A page or place begins p., pp., art., sec., ch., para. or §, such as p. 12 or art. 14, so the reader knows it from the edition.";
	}
	if (change.verified !== undefined && change.verified.trim()) {
		const v = change.verified.trim();
		const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
		const ok = d && new Date(Date.UTC(Number(d[1]), Number(d[2]) - 1, Number(d[3]))).toISOString().slice(0, 10) === v;
		if (!ok) return "A verified date is written year-month-day, such as 2026-09-20, and has to be a real date.";
	}
	return null;
}

/**
 * The note's text with one citation's definition changed: only the pieces asked for are rewritten, with the punctuation and the spacing the
 * line has (a piece that was not there is added the way the pattern writes it). After the change the definition is read again with the
 * reader's own pattern; if it would not come back with exactly the fields that were asked for, nothing is written and the reason is said.
 */
export function changeCitation(text: string, node: DesignNode, id: string, change: CitationChange): Made {
	const cit = citationsOf(text, node).find((c) => c.id === id);
	if (!cit) return no("There is no such mark in these words.");
	const note = cit.note;
	if (!note) return no("This mark has no note to change. Add one first.");
	if (!note.fields) return no(note.why ?? NOT_IN_PATTERN);
	const bad = problem(change);
	if (bad) return no(bad);
	const raw = text.split("\n");
	const cr = (raw[note.line] ?? "").endsWith("\r") ? "\r" : "";
	const line = (raw[note.line] ?? "").replace(/\r$/, "");
	const s = spansOf(line, note.wordsAt);
	if (!s) return no(NOT_IN_PATTERN);
	const f = note.fields;
	const want: SourceFields = {
		title: change.title !== undefined ? change.title.trim() : f.title,
		detail: change.detail !== undefined ? change.detail.trim() : f.detail,
		page: change.page !== undefined ? change.page.trim() : f.page,
		quote: change.quote !== undefined ? change.quote.trim() : f.quote,
		verified: change.verified !== undefined ? change.verified.trim() : f.verified,
	};
	if (JSON.stringify(want) === JSON.stringify(f)) return { ok: true, text };
	const g = s.groups;
	const dpNow = splitDp(g[5] ?? "");
	// the part before the colon: what is not changed keeps its own bytes
	let dpText: string | null = s.hasDp ? (g[5] ?? "") : null;
	if (want.detail !== f.detail || want.page !== f.page) {
		const detailText = want.detail === f.detail ? dpNow.detailText : want.detail;
		const pageText = want.page === f.page ? dpNow.page : want.page;
		const sep = dpNow.sep || ", ";
		dpText = [detailText, pageText].filter(Boolean).join(detailText && pageText ? sep : "");
		if (!dpText) dpText = null;
	}
	const quoteOpen = g[7] ?? '"';
	const quoteClose = g[9] ?? '"';
	let tail: string;
	if (want.verified === f.verified) tail = `${g[10] ?? ""}${g[11] ?? ""}${g[12] ?? ""}${g[13] ?? ""}${g[14] ?? ""}`;
	else if (want.verified === "") tail = g[14] ?? "";
	else if (f.verified === "") tail = ` Verified ${want.verified}.${g[10] ?? ""}${g[14] ?? ""}`;
	else tail = `${g[10] ?? ""}${g[11] ?? ""}${want.verified}${g[13] ?? ""}${g[14] ?? ""}`;
	// ws before Verified stays where it was written when only its date changes; a Verified that is taken away takes its spaces too
	const words = [
		g[0],
		want.title === f.title ? g[1] : want.title,
		g[2],
		g[3],
		dpText === null ? "" : `${g[4] || ", "}${dpText}`,
		g[6],
		quoteOpen,
		want.quote === f.quote ? g[8] : want.quote,
		quoteClose,
		tail,
	].join("");
	const next = line.slice(0, s.trimAt) + words + line.slice(s.end);
	const again = sourceOfNote(next.slice(note.wordsAt).trim());
	if (!again || again.title !== want.title || again.detail !== want.detail || again.page !== want.page || again.quote !== want.quote || again.verified !== want.verified)
		return no("The reader would not read that note back with the same pieces, so it is not written. Edit the note as words if it is meant as it is.");
	raw[note.line] = next + cr;
	return { ok: true, text: raw.join("\n") };
}

/** The words a new note starts with, as the piece the Add panel inserts has them. */
export const NEW_NOTE_WORDS = '*Title of the source*, p. 1: "The words, copied exactly from the source."';

/**
 * The note's text with a definition added for a mark that has none: a blank line and `[^id]: …` after the block, as the Add panel's piece
 * has it. Refused when the mark has a definition already, or when the block is inside a group (whose lines are quoted).
 */
export function addNote(text: string, node: DesignNode, id: string): Made {
	const cit = citationsOf(text, node).find((c) => c.id === id);
	if (!cit) return no("There is no such mark in these words.");
	if (cit.note) return no("This mark has a note already.");
	if (inGroup(node)) return no("This block is inside a group, so the note is added in the Markdown.");
	const raw = text.split("\n");
	const at = node.start + blockLines(text, node).length;
	const eol = (raw[at - 1] ?? "").endsWith("\r") ? "\r" : "";
	const nextBlank = at >= raw.length || (raw[at] ?? "").trim() === "";
	const out = [...raw.slice(0, at), eol, `[^${id}]: ${NEW_NOTE_WORDS}${eol}`, ...(nextBlank ? [] : [eol]), ...raw.slice(at)];
	const next = out.join("\n");
	const again = citationsOf(next, node).find((c) => c.id === id);
	if (!again?.note) return no("The note would not be found where it is added, so it is not written.");
	return { ok: true, text: next };
}
