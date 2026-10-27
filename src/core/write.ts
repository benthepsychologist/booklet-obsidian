/*
 * The records writer. One rule above all: only the records region changes. Every byte before the
 * region and after its closing `%%` stays as it was, and inside the region every line and block
 * stays as written except the one answers block the change needs (SPEC section 8).
 */
import { FENCE_OPEN, ID_PATTERN, eolOf, fenceEnd, isBlank, joinLines, splitLines, type Line } from "./lines";
import { parseBooklet } from "./reader";
import type { RecordBlock, RecordsLine, Region } from "./records";

/** A choice's option position (from 1), a scale's anchor number as written, or a text's string. */
export type AnswerValue = number | string;

export class RecordsWriteError extends Error {}

/** The plain records line, as the reference renderer writes it. */
export const RECORDS_HEADER = "> [!records] App record — do not edit below this line";

const own = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

/** The reference renderer's shape for an answers block: `JSON.stringify(answers, null, 1)`. */
export const answersJson = (o: Record<string, unknown>): string => JSON.stringify(o, null, 1);

function copyWith(o: Record<string, unknown>, key: string, value: AnswerValue): Record<string, unknown> {
	const out = Object.create(null) as Record<string, unknown>;
	for (const [k, v] of Object.entries(o)) out[k] = v;
	out[key] = value; // an existing key keeps its place; a new one goes last
	return out;
}

function copyWithout(o: Record<string, unknown>, key: string): Record<string, unknown> {
	const out = Object.create(null) as Record<string, unknown>;
	for (const [k, v] of Object.entries(o)) if (k !== key) out[k] = v;
	return out;
}

/** True when a fence opened after `from` never closes, so anything written after it would be inside it. */
function endsInsideFence(lines: readonly string[], from: number): boolean {
	for (let i = from; i < lines.length; i++) {
		const f = FENCE_OPEN.exec(lines[i] ?? "");
		if (!f || !f[1]) continue;
		const k = fenceEnd(lines, i, f[1]);
		if (k >= lines.length) return true;
		i = k;
	}
	return false;
}

/** Puts `add` before line `p`, each line ending as `eol`, keeping the file's last line without an ending if it had none. */
function insertAt(L: Line[], p: number, add: string[], eol: string): void {
	const atEnd = p >= L.length;
	if (atEnd) {
		const prev = L[L.length - 1];
		if (prev) prev.eol = eol;
	}
	const made = add.map((text) => ({ text, eol }));
	if (atEnd && made.length) made[made.length - 1]!.eol = "";
	L.splice(p, 0, ...made);
}

/** The last non-blank line of `from..to`, not counting a closing `%%` at `skip`. */
function lastContent(L: readonly Line[], from: number, to: number, skip: number): number {
	for (let g = to; g > from; g--) {
		if (g === skip) continue;
		if (!isBlank(L[g]?.text)) return g;
	}
	return from;
}

/** Inserts a block of lines at `p` inside region `r`, with a blank line around it where one is needed. */
function insertBlock(L: Line[], p: number, r: Region, block: string[], eol: string): void {
	const add = [...block];
	const before = L[p - 1]?.text;
	if (p - 1 >= r.start && !isBlank(before) && before?.trim() !== "%%") add.unshift("");
	const next = L[p]?.text;
	if (p < L.length && !isBlank(next) && next?.trim() !== "%%") add.push("");
	insertAt(L, p, add, eol);
}

function replaceBody(L: Line[], b: RecordBlock, o: Record<string, unknown>, eol: string): void {
	const e = L[b.start]?.eol || eol;
	const body = answersJson(o)
		.split("\n")
		.map((text) => ({ text, eol: e }));
	L.splice(b.start + 1, b.end - b.start - 1, ...body);
}

/**
 * Sets (or, with `value` undefined, clears) one answer, and returns the new text of the file.
 * `scope` is a module id, or "" for the bare activities. Returns `text` itself when nothing changes.
 * Throws RecordsWriteError when the answer cannot be written without touching the design.
 */
export function setAnswer(text: string, scope: string, questionId: string, value: AnswerValue | undefined): string {
	if (!ID_PATTERN.test(questionId)) throw new RecordsWriteError(`"${questionId}" is not a question id.`);
	if (value !== undefined && typeof value !== "string" && !(typeof value === "number" && Number.isFinite(value)))
		throw new RecordsWriteError("An answer is a number or a string.");
	const L = splitLines(text);
	const plain = L.map((l) => l.text);
	const book = parseBooklet(text);
	const mod = scope ? book.modules.find((m) => m.id === scope) : undefined;
	if (scope && !mod) throw new RecordsWriteError(`This note has no module "${scope}".`);
	if (endsInsideFence(plain, book.bodyStart))
		throw new RecordsWriteError("This note ends inside a code fence that is never closed, so an answer cannot be written after it. Close the fence in Markdown first.");

	const { regions, recordsLines, blocks } = book.records;
	const parseable = blocks.filter((b) => b.what === "answers" && b.scope === scope && b.value);

	if (value === undefined) {
		const holding = parseable.filter((b) => own(b.value!, questionId));
		if (!holding.length) return text;
		for (const b of [...holding].reverse()) replaceBody(L, b, copyWithout(b.value!, questionId), eolOf(L));
		return joinLines(L);
	}

	const last = parseable[parseable.length - 1];
	if (last && last.value) {
		if (own(last.value, questionId) && JSON.stringify(last.value[questionId]) === JSON.stringify(value)) return text;
		replaceBody(L, last, copyWith(last.value, questionId, value), eolOf(L, last.start));
		return joinLines(L);
	}

	const fresh = Object.create(null) as Record<string, unknown>;
	fresh[questionId] = value;
	const fence = ["```booklet answers", ...answersJson(fresh).split("\n"), "```"];

	// under the scope's own records line: after its group's last line, so the reader's values come last
	const group: RecordsLine | undefined = [...recordsLines].reverse().find((r) => r.scope === scope);
	if (group) {
		const r = regions[group.region]!;
		const p = lastContent(L, group.line, group.groupEnd, r.closed ? r.end : -1) + 1;
		insertBlock(L, p, r, fence, eolOf(L, r.start, r.end + 1));
		return joinLines(L);
	}

	if (regions.length) {
		if (scope === "") {
			// the bare activities' records go first, under a plain records line, before the first module's
			const r = regions[0]!;
			insertBlock(L, r.recordsLine, r, [RECORDS_HEADER, "", ...fence], eolOf(L, r.start, r.end + 1));
		} else {
			// a module with no records line yet: its line goes at the end of the region, before the closing `%%`
			const r = regions[regions.length - 1]!;
			const p = lastContent(L, r.start, r.end, r.closed ? r.end : -1) + 1;
			insertBlock(L, p, r, [`> [!records|${mod!.id}] ${mod!.title || mod!.id}`, "", ...fence], eolOf(L, r.start, r.end + 1));
		}
		return joinLines(L);
	}

	// no records region at all: one is added after the body, which is left exactly as it is
	const eol = eolOf(L);
	const region = ["%%", RECORDS_HEADER, "", ...(mod ? [`> [!records|${mod.id}] ${mod.title || mod.id}`, ""] : []), ...fence, "%%"];
	let sep = "";
	if (text.length) {
		const lastLine = L[L.length - 1]!;
		if (lastLine.text !== "") sep = eol + eol; // no newline at the end: end the line, then a blank line
		else if (!isBlank(L[L.length - 2]?.text)) sep = eol; // ends with one newline: add the blank line
	}
	return text + sep + region.join(eol) + eol;
}
