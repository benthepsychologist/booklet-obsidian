/*
 * The records writer. One rule above all: only the records region changes, and inside it only what
 * the reader changed. Every byte before the region and after its closing `%%` stays as it was; inside
 * it, every line and block stays as written, and inside the one block a change needs, every answer or
 * entry the reader did not change stays as written too (SPEC section 8). A new block is written in the
 * reference renderer's shape (booklet.html fileText); an existing one keeps its own layout.
 */
import { appendItem, removeItem, removeMember, replaceItem, setMember } from "./json-edit";
import { FENCE_OPEN, ID_PATTERN, eolOf, fenceEnd, isBlank, joinLines, splitLines, type Line } from "./lines";
import { parseBooklet, type Activity, type Booklet, type Module, type Question } from "./reader";
import { entryItems, entryPlaces, type Entry, type RecordBlock, type RecordsLine, type Region } from "./records";
import { pairsOf, pickKey, recordFilled } from "./each";
import { holdsSomething, isPair, shapeIssue } from "./shape";

/**
 * What one question holds (SPEC section 5): a choice's option position (from 1) or the reader's own
 * words, a multi's list of those, a scale's anchor number, a number, a text's string, a date's
 * `YYYY-MM-DD`, a lines question's list of strings; a widget's, what its engine records (SPEC section 7):
 * a grid-select's list of item ids and `x|cell|word` strings, an svg-regions' list of
 * `{ "id": region, "s": [words] }`.
 */
export type AnswerValue = number | string | unknown[];

export class RecordsWriteError extends Error {}

/** The plain records line, as the reference renderer writes it. */
export const RECORDS_HEADER = "> [!records] App record — do not edit below this line";

/** The reference renderer's shape for a new answers block: `JSON.stringify(answers, null, 1)`. */
export const answersJson = (o: Record<string, unknown>): string => JSON.stringify(o, null, 1);
/** The reference renderer's shape for a new draft block: `JSON.stringify(draft)`, on one line. */
export const draftJson = (o: Record<string, unknown>): string => JSON.stringify(o);
/** The reference renderer's shape for a new entries block: one entry to a line. */
export const entriesJson = (items: readonly Record<string, unknown>[]): string => `{"items": [\n${items.map((e) => JSON.stringify(e)).join(",\n")}\n]}`;

const own = (o: object | undefined, k: string) => !!o && Object.prototype.hasOwnProperty.call(o, k);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Whether a draft or an entry holds any answer. */
export const anyFilled = (o: Record<string, unknown> | undefined): boolean => !!o && Object.keys(o).some((k) => holdsSomething(o[k]));

/** An ISO UTC time to the second, the shape of SPEC section 8's example: `2026-09-27T14:02:00Z`. */
export const isoSecond = (d: Date): string => d.toISOString().replace(/\.\d{3}Z$/, "Z");

const pad = (n: number) => String(n).padStart(2, "0");
/** A day on the device's own calendar, `YYYY-MM-DD` (booklet.html todayDate and dayKey). */
export const localDay = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** The device's own calendar day of an entry's `ts`, or "" for a `ts` that is not a time. */
export const localDayOf = (ts: string): string => {
	const t = Date.parse(ts);
	return Number.isFinite(t) ? localDay(new Date(t)) : "";
};

/** A value JSON writes as it is and reads back the same: no undefined, no function, no NaN or Infinity. */
function plainJson(v: unknown): boolean {
	if (v === null || typeof v === "string" || typeof v === "boolean") return true;
	if (typeof v === "number") return Number.isFinite(v);
	if (Array.isArray(v)) return v.every(plainJson);
	if (typeof v === "object") return Object.values(v as Record<string, unknown>).every(plainJson);
	return false;
}

function checkValue(value: AnswerValue | undefined): void {
	if (value === undefined) return;
	const one = (v: unknown) => typeof v === "string" || (typeof v === "number" && Number.isFinite(v));
	if (Array.isArray(value) ? value.every(plainJson) : one(value)) return;
	throw new RecordsWriteError("An answer is a number, a string, or a list of JSON values.");
}

/* ---- the file, read once for an edit ---- */

interface Doc {
	text: string;
	L: Line[];
	book: Booklet;
	mod: Module | undefined;
}

function openDoc(text: string, scope: string): Doc {
	const L = splitLines(text);
	const book = parseBooklet(text);
	const mod = scope ? book.modules.find((m) => m.id === scope) : undefined;
	if (scope && !mod) throw new RecordsWriteError(`This note has no module "${scope}".`);
	if (endsInsideFence(L.map((l) => l.text), book.bodyStart))
		throw new RecordsWriteError("This note ends inside a code fence that is never closed, so an answer cannot be written after it. Close the fence in Markdown first.");
	return { text, L, book, mod };
}

function activityIn(d: Doc, scope: string, activityId: string): Activity {
	if (!ID_PATTERN.test(activityId)) throw new RecordsWriteError(`"${activityId}" is not an activity id.`);
	const a = d.book.activities.find((x) => x.id === activityId && x.scope === scope);
	if (!a) throw new RecordsWriteError(`This note has no activity "${activityId}"${scope ? ` in the module "${scope}"` : ""}.`);
	return a;
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

/** The question with this id in a scope (ids are unique within a module, across kinds), or null. */
function questionIn(book: Booklet, scope: string, questionId: string): Question | null {
	for (const a of book.activities) if (a.scope === scope) for (const s of a.segments) if (s.type === "question" && s.id === questionId) return s;
	return null;
}

/**
 * The rule for an answer of the wrong shape (shape.ts): one the note holds is kept as written, so nothing replaces or
 * clears it here.
 */
function checkShape(q: Question | null, held: unknown): void {
	const was = q ? shapeIssue(q, held) : null;
	if (q && was) throw new RecordsWriteError(`The note holds an answer to "${q.title || q.id}" that is not in the shape this question keeps (${was}). It is kept as written, and not changed here.`);
}

/** The blocks of one kind the writer may write into: read as records, closed, in this scope (and for this activity). */
const readable = (d: Doc, what: string, scope: string, name?: string): RecordBlock[] =>
	d.book.records.blocks.filter((b) => b.what === what && b.scope === scope && b.closed && !!b.value && (name === undefined || b.name === name));

/* ---- line edits ---- */

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

/**
 * Takes a block out of the region, and with it the one blank line insertBlock would have put beside it,
 * so a block written and then removed leaves the region as it was.
 */
function removeBlockLines(L: Line[], b: RecordBlock, r: Region): void {
	const lastEol = L[b.end]?.eol ?? "";
	L.splice(b.start, b.end - b.start + 1);
	const p = b.start;
	const prev = L[p - 1]?.text;
	const next = p < L.length ? L[p]?.text : undefined;
	const prevOpens = p - 1 === r.start && prev?.trim() === "%%";
	const nextCloses = next === undefined || next.trim() === "%%";
	if (p - 1 > r.start && isBlank(prev) && (isBlank(next) || nextCloses)) L.splice(p - 1, 1);
	else if (prevOpens && next !== undefined && isBlank(next)) L.splice(p, 1);
	if (p >= L.length && L.length && lastEol === "") L[L.length - 1]!.eol = "";
}

/** Puts `code` between a block's fence lines, changing only the lines that differ. */
function setBlockCode(L: Line[], b: RecordBlock, code: string, eol: string): void {
	const old = L.slice(b.start + 1, b.end).map((l) => l.text);
	const neu = code.split("\n");
	let p = 0;
	while (p < old.length && p < neu.length && old[p] === neu[p]) p++;
	let s = 0;
	while (s < old.length - p && s < neu.length - p && old[old.length - 1 - s] === neu[neu.length - 1 - s]) s++;
	const e = L[b.start]?.eol || eol;
	L.splice(b.start + 1 + p, old.length - p - s, ...neu.slice(p, neu.length - s).map((text) => ({ text, eol: e })));
}

type Op = { b: RecordBlock; code: string } | { b: RecordBlock; lines: string[] } | { b: RecordBlock; remove: true };

/** Applies edits to distinct blocks, the last first, so each one's line numbers still hold. */
function applyOps(d: Doc, ops: Op[]): string {
	const { L } = d;
	const eol = eolOf(L);
	for (const op of [...ops].sort((x, y) => y.b.start - x.b.start)) {
		if ("code" in op) setBlockCode(L, op.b, op.code, eol);
		else if ("lines" in op) {
			const e = L[op.b.start]?.eol || eol;
			const lastEol = L[op.b.end]?.eol ?? e;
			const made = op.lines.map((text) => ({ text, eol: e }));
			if (made.length) made[made.length - 1]!.eol = lastEol;
			L.splice(op.b.start, op.b.end - op.b.start + 1, ...made);
		} else removeBlockLines(L, op.b, d.book.records.regions[op.b.region]!);
	}
	return joinLines(L);
}

/** A new block, placed after `after` when given, else at the end of the scope's records (made if need be). */
function placeNewBlock(d: Doc, scope: string, fence: string[], after?: RecordBlock): string {
	const { L, book, mod, text } = d;
	const { regions, recordsLines } = book.records;
	if (after) {
		const r = regions[after.region]!;
		insertBlock(L, after.end + 1, r, fence, eolOf(L, r.start, r.end + 1));
		return joinLines(L);
	}
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

const fenceOf = (info: string, json: string) => ["```" + info, ...json.split("\n"), "```"];

/* ---- answers ---- */

/**
 * Sets (or, with `value` undefined or holding nothing, clears) one answer of an activity answered once,
 * and returns the new text of the file. `scope` is a module id, or "" for the bare activities. Returns
 * `text` itself when nothing changes. Throws RecordsWriteError when the answer cannot be written
 * without touching the design.
 */
export function setAnswer(text: string, scope: string, questionId: string, value: AnswerValue | undefined): string {
	if (!ID_PATTERN.test(questionId)) throw new RecordsWriteError(`"${questionId}" is not a question id.`);
	checkValue(value);
	if (!holdsSomething(value)) value = undefined;
	const d = openDoc(text, scope);
	const blocks = readable(d, "answers", scope);
	const held = d.book.records.answers[scope];
	checkShape(questionIn(d.book, scope, questionId), held && own(held, questionId) ? held[questionId] : undefined);

	if (value === undefined) {
		const holding = blocks.filter((b) => own(b.value, questionId));
		if (!holding.length) return text;
		return applyOps(d, holding.map((b) => ({ b, code: removeMember(b.code, questionId)! })));
	}
	const merged = d.book.records.answers[scope];
	if (own(merged, questionId) && same(merged![questionId], value)) return text;
	const last = blocks[blocks.length - 1];
	if (last) {
		const code = setMember(last.code, questionId, value, answersJson);
		return code === null || code === last.code ? text : applyOps(d, [{ b: last, code }]);
	}
	const fresh = Object.create(null) as Record<string, unknown>;
	fresh[questionId] = value;
	return placeNewBlock(d, scope, fenceOf("booklet answers", answersJson(fresh)));
}

/* ---- drafts and kept entries ---- */

export interface DayRule {
	/** Today on the reader's own calendar, `YYYY-MM-DD`. */
	today: string;
	/** The calendar day of an entry's `ts`, on the same calendar. Defaults to the device's (localDayOf). */
	dayOf?: (ts: string) => string;
	/**
	 * The last moment of today, in ms. Today is the day the page was drawn (SPEC section 8): a Finalize after this
	 * moment, past midnight, keeps the entry on today, at its last second, as the check-in still shows that day.
	 */
	until?: number;
}

/** The first kept entry of an activity whose day is `rule.today`, in file order (booklet.html seedUpsertDraft). */
export function todaysEntry(book: Booklet, scope: string, activityId: string, rule: DayRule): Entry | null {
	const dayOf = rule.dayOf ?? localDayOf;
	return (book.records.entries[scope]?.[activityId] ?? []).find((e) => dayOf(String(e.ts)) === rule.today) ?? null;
}

export interface ShownDraft {
	values: Record<string, unknown>;
	/** For a `repeat daily` activity with nothing in its draft: today's kept entry, which the draft shows, to be finished again. */
	seededFrom: Entry | null;
}

/**
 * What an activity's draft shows: what is in its draft records, or, for a `repeat daily` activity whose
 * draft holds nothing, today's kept entry, so finishing again changes it rather than starting blank
 * (booklet.html seedUpsertDraft). With the activity's questions (`segments`), a draft whose only answers
 * are pairs for picks taken back counts as empty (each.ts recordFilled); those pairs are shown over the
 * entry's, pick by pick, as they are the reader's newer work: nothing written in the draft is lost, and an entry's
 * pair for a pick the draft has no pair for is kept beside them.
 */
export function shownDraft(book: Booklet, scope: string, activity: Pick<Activity, "id" | "daily"> & Partial<Pick<Activity, "segments">>, rule?: DayRule): ShownDraft {
	const values = book.records.drafts[scope]?.[activity.id] ?? (Object.create(null) as Record<string, unknown>);
	if (recordFilled(activity, values) || !activity.daily || !rule) return { values, seededFrom: null };
	const today = todaysEntry(book, scope, activity.id, rule);
	if (!today) return { values, seededFrom: null };
	const seeded = Object.create(null) as Record<string, unknown>;
	for (const [k, v] of Object.entries(today)) if (k !== "ts") seeded[k] = v;
	for (const [k, v] of Object.entries(values)) {
		if (!holdsSomething(v)) continue;
		const q = activity.segments?.find((x): x is Question => x.type === "question" && x.id === k);
		const was = seeded[k];
		if (q?.each && Array.isArray(v) && Array.isArray(was) && !shapeIssue(q, v) && !shapeIssue(q, was)) {
			const mine = new Set(pairsOf(v).map((x) => pickKey(x.pick)));
			seeded[k] = [...v, ...was.filter((x) => !(isPair(x) && mine.has(pickKey(x.pick))))];
		} else seeded[k] = v;
	}
	return { values: seeded, seededFrom: today };
}

/** The last readable entries block of an activity: a new draft goes right after it, as the reference renderer orders them. */
const lastEntriesBlock = (d: Doc, scope: string, activityId: string): RecordBlock | undefined => readable(d, "entries", scope, activityId).pop();

/**
 * Sets (or clears) one answer in a `repeat` activity's draft, and returns the new text of the file. The
 * draft is the `booklet draft <activity>` block under the scope's records line; a draft block left with
 * nothing in it is removed, as the reference renderer writes none. For a `repeat daily` activity whose
 * draft is showing today's entry (`rule` given, see shownDraft), the first change writes that entry's
 * answers into the draft along with the change.
 */
export function setDraftAnswer(text: string, scope: string, activityId: string, questionId: string, value: AnswerValue | undefined, rule?: DayRule): string {
	if (!ID_PATTERN.test(questionId)) throw new RecordsWriteError(`"${questionId}" is not a question id.`);
	checkValue(value);
	if (!holdsSomething(value)) value = undefined;
	const d = openDoc(text, scope);
	const act = activityIn(d, scope, activityId);
	const blocks = readable(d, "draft", scope, activityId);
	const shown = shownDraft(d.book, scope, act, rule);
	checkShape(questionIn(d.book, scope, questionId), own(shown.values, questionId) ? shown.values[questionId] : undefined);

	if (shown.seededFrom) {
		const next = Object.create(null) as Record<string, unknown>;
		for (const [k, v] of Object.entries(shown.values)) if (k !== questionId || value !== undefined) next[k] = v;
		if (value !== undefined) next[questionId] = value;
		if (same(next, shown.values) || !recordFilled(act, next)) return text;
		const last = blocks[blocks.length - 1];
		if (last) {
			let code: string | null = last.code;
			for (const [k, v] of Object.entries(next)) code = code === null ? null : setMember(code, k, v, draftJson);
			return code === null || code === last.code ? text : applyOps(d, [{ b: last, code }]);
		}
		return placeNewBlock(d, scope, fenceOf(`booklet draft ${activityId}`, draftJson(next)), lastEntriesBlock(d, scope, activityId));
	}

	if (value === undefined) {
		const holding = blocks.filter((b) => own(b.value, questionId));
		if (!holding.length) return text;
		return applyOps(
			d,
			holding.map((b): Op => {
				const code = removeMember(b.code, questionId)!;
				// a draft left with nothing in it is not written, as the reference renderer writes none
				return code.trim() === "{}" ? { b, remove: true } : { b, code };
			}),
		);
	}
	const merged = d.book.records.drafts[scope]?.[activityId];
	if (own(merged, questionId) && same(merged![questionId], value)) return text;
	const last = blocks[blocks.length - 1];
	if (last) {
		const code = setMember(last.code, questionId, value, draftJson);
		return code === null || code === last.code ? text : applyOps(d, [{ b: last, code }]);
	}
	const fresh = Object.create(null) as Record<string, unknown>;
	fresh[questionId] = value;
	return placeNewBlock(d, scope, fenceOf(`booklet draft ${activityId}`, draftJson(fresh)), lastEntriesBlock(d, scope, activityId));
}

export interface FinalizeOptions {
	/** When the entry is kept, as an ISO UTC time; written to the second, and moved on by a second while another entry has it. */
	ts: string;
	/** For a `repeat daily` activity: the calendar, so that finishing again on a day replaces that day's entry. */
	rule?: DayRule;
}

export interface Finalized {
	text: string;
	entry: Entry;
	/** True when the entry replaced the one kept earlier the same day (`repeat daily`). */
	replaced: boolean;
}

/**
 * Keeps a `repeat` activity's draft as a dated entry and empties the draft (booklet.html finalizeEntry).
 * The entry, `{"ts": …}` and every answer the draft holds, goes after the last entry of the activity's
 * last entries block, or, with none yet, a new entries block takes the draft block's place; every draft
 * block of the activity is removed. A `repeat daily` activity (with `opts.rule`) keeps one entry per
 * day: an entry already kept that day is replaced where it stands. Throws RecordsWriteError when the
 * draft holds nothing.
 */
export function finalizeDraft(text: string, scope: string, activityId: string, opts: FinalizeOptions): Finalized {
	const d = openDoc(text, scope);
	const act = activityIn(d, scope, activityId);
	if (!act.repeat) throw new RecordsWriteError(`The activity "${activityId}" does not repeat, so it keeps no entries.`);
	const drafts = readable(d, "draft", scope, activityId);
	const merged = d.book.records.drafts[scope]?.[activityId];
	// a draft whose only answers are pairs for picks taken back is empty too (each.ts recordFilled)
	if (!recordFilled(act, merged)) {
		const keptToday = act.daily && opts.rule && todaysEntry(d.book, scope, activityId, opts.rule);
		throw new RecordsWriteError(keptToday ? "Today's entry is already kept. Change an answer to keep it again." : "Nothing to keep yet: the entry is empty.");
	}
	const kept = d.book.records.entries[scope]?.[activityId] ?? [];
	let at = Date.parse(opts.ts);
	if (!Number.isFinite(at)) throw new RecordsWriteError(`"${opts.ts}" is not a time.`);
	// a daily activity's entry is kept on the day the page shows: past midnight, at that day's last second
	const rule = act.daily ? opts.rule : undefined;
	const late = !!rule && rule.until !== undefined && at > rule.until;
	if (late) at = Math.floor(rule.until! / 1000) * 1000;
	const dayOf = rule?.dayOf ?? localDayOf;
	// the entry a daily Finalize replaces gives up its time: the new entry may take it
	const day = rule ? dayOf(isoSecond(new Date(at))) : "";
	const replacing = rule ? kept.find((e) => dayOf(String(e.ts)) === day) : undefined;
	const taken = new Set(kept.filter((e) => e !== replacing).map((e) => String(e.ts)));
	let ts = isoSecond(new Date(at));
	while (taken.has(ts)) ts = isoSecond(new Date((at += late ? -1000 : 1000)));
	const entry = Object.create(null) as Entry;
	entry.ts = ts;
	for (const [k, v] of Object.entries(merged!)) {
		if (k === "ts" || !holdsSomething(v)) continue;
		// a lines question's lines typed and left blank are not kept (nor those of a pick's pair, under `each:`); every
		// other answer is kept as written, one of the wrong shape among them (shape.ts)
		const q = act.segments.find((x): x is Question => x.type === "question" && x.id === k);
		const bare = (a: unknown) => (Array.isArray(a) ? a.filter((x) => holdsSomething(x)) : a);
		entry[k] =
			q && q.kind === "lines" && !shapeIssue(q, v) && Array.isArray(v)
				? q.each
					? v.map((p) => (isPair(p) ? { ...p, a: bare(p.a) } : p))
					: bare(v)
				: v;
	}
	const itemText = JSON.stringify(entry);
	const entryBlocks = readable(d, "entries", scope, activityId);
	const ops: Op[] = [];
	let replaced = false;

	if (rule) {
		const onDay = dayOf(ts);
		for (let bi = 0; bi < entryBlocks.length && !replaced; bi++) {
			const b = entryBlocks[bi]!;
			const items = entryItems(b.value) ?? [];
			const ix = items.findIndex((e) => dayOf(String(e.ts)) === onDay);
			if (ix < 0) continue;
			const oldTs = String(items[ix]!.ts);
			ops.push({ b, code: replaceItem(b.code, ix, itemText)! });
			replaced = true;
			// a later block's entry with the same ts is the same entry (SPEC section 8): it goes too
			for (const later of entryBlocks.slice(bi + 1)) {
				let code = later.code;
				const laterItems = entryItems(later.value) ?? [];
				for (let k = laterItems.length - 1; k >= 0; k--) if (String(laterItems[k]!.ts) === oldTs) code = removeItem(code, k) ?? code;
				if (code !== later.code) ops.push({ b: later, code });
			}
		}
	}
	let reuse: RecordBlock | undefined;
	if (!replaced) {
		const last = entryBlocks[entryBlocks.length - 1];
		if (last) ops.push({ b: last, code: appendItem(last.code, itemText)! });
		else {
			reuse = drafts[drafts.length - 1]!;
			ops.push({ b: reuse, lines: fenceOf(`booklet entries ${activityId}`, entriesJson([entry])) });
		}
	}
	for (const b of drafts) if (b !== reuse) ops.push({ b, remove: true });
	return { text: applyOps(d, ops), entry, replaced };
}

/** What an entry reads as, to tell one entry from another that has the same `ts` (its answers as JSON, in the order the file has them). */
export const entryKey = (e: object): string => JSON.stringify(e);

export interface Removed {
	text: string;
	/** How many items of entries blocks were taken out: 0 when no entry stood at that position with that `ts`, 2 or more when the entry was read from items in several blocks. */
	removed: number;
}

/**
 * Takes one kept entry out of the note: the reader's own, from their Kept entries list (SPEC section 8: "a kept entry is
 * replaced, taken out or added as one item of its list. Every other member, item, block, records line and blank line keeps
 * its text"). The entry is named by its position among the activity's kept entries in file order (`at`, the position in
 * `records.entries`), and `ts` is checked against it: the view's copy of the note can be older than the file, and an entry
 * that is no longer where it was, or has another `ts`, is not removed (the text comes back unchanged, `removed` is 0). It is
 * never found by `ts` alone, because two entries of one block may share one and then taking out "the entry with that `ts`"
 * would rewrite the other. An entry read from items in several blocks (the same `ts` in each: they merge) goes from all of them.
 * With `expect` (the entry's `entryKey` when the card was drawn) the entry at the position must also read the same now: two
 * entries can share a `ts`, and a pane that is a step behind the file would otherwise remove the one that moved into the place.
 * Each item goes with the comma that joined it and nothing else changes; a block left with no item stays as `{"items": []}`.
 * Drafts, answers and every other block are not looked at.
 */
export function removeEntry(text: string, scope: string, activityId: string, at: number, ts: string, expect?: string): Removed {
	const d = openDoc(text, scope);
	activityIn(d, scope, activityId);
	const kept = d.book.records.entries[scope]?.[activityId] ?? [];
	const entry = kept[at];
	if (!entry || String(entry.ts) !== ts) return { text, removed: 0 };
	// two entries may share a `ts`: when the caller says what the entry looked like (`entryKey`, taken when its card was drawn),
	// the one at this position must still read the same, or it is another entry that moved here and nothing is removed
	if (expect !== undefined && entryKey(entry) !== expect) return { text, removed: 0 };
	const readableBlocks = readable(d, "entries", scope, activityId);
	const byBlock = new Map<RecordBlock, number[]>();
	for (const p of entryPlaces(entry)) {
		if (!readableBlocks.includes(p.block)) throw new RecordsWriteError("This entry is in a block of the note that cannot be written into, so it is kept as written.");
		byBlock.set(p.block, [...(byBlock.get(p.block) ?? []), p.index]);
	}
	const ops: Op[] = [];
	let removed = 0;
	for (const [b, indexes] of byBlock) {
		// the highest position first, so each one's position still holds
		let code = b.code;
		for (const k of [...indexes].sort((x, y) => y - x)) {
			const next = removeItem(code, k);
			if (next === null) continue;
			code = next;
			removed++;
		}
		if (code !== b.code) ops.push({ b, code });
	}
	return { text: ops.length ? applyOps(d, ops) : text, removed };
}
