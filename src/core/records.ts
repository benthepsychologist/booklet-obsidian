/*
 * The records region (SPEC section 8): where it is, and what its blocks say.
 * Found the way booklet.html's splitItems and lint-booklet.py's records_regions find it, and read the
 * way booklet.html's onRecordFence reads it: answers, drafts and entries, each block on its own.
 */
import { CALLOUT_ANY, CALLOUT_LINE, FENCE_OPEN, bodyEnd, calloutWords, fenceEnd, isBlank } from "./lines";

export interface Region {
	/** First line: the `%%` before the records line, or the records line itself. */
	start: number;
	/** Last line: the closing `%%`, or the file's last line when nothing closes it. */
	end: number;
	openedByPercent: boolean;
	closed: boolean;
	/** The first records line of the region. */
	recordsLine: number;
}

const RECORDS_AFTER_PERCENT = /^>[ \t]?\[!records\b/i;

/**
 * Every records region from line `from` on. Fenced code is skipped first, so a `%%` or a records
 * line inside a fence is never one. A second region (two files pasted together) is found as well.
 */
export function findRegions(lines: readonly string[], from: number): Region[] {
	const regs: Region[] = [];
	let rs: number | null = null;
	let via = false;
	let recAt = -1;
	for (let i = from; i < lines.length; i++) {
		const ln = lines[i] ?? "";
		const f = FENCE_OPEN.exec(ln);
		if (f && f[1]) {
			i = fenceEnd(lines, i, f[1]);
			continue;
		}
		if (ln.trim() === "%%") {
			if (rs !== null) {
				regs.push({ start: rs, end: i, openedByPercent: via, closed: true, recordsLine: recAt });
				rs = null;
			} else {
				let j = i + 1;
				while (j < lines.length && isBlank(lines[j])) j++;
				if (j < lines.length && RECORDS_AFTER_PERCENT.test(lines[j] ?? "")) {
					rs = i;
					via = true;
					recAt = j;
				}
			}
			continue;
		}
		const m = CALLOUT_LINE.exec(ln);
		if (m && m[1] && m[1].toLowerCase() === "records" && rs === null) {
			rs = i;
			via = false;
			recAt = i;
		}
	}
	if (rs !== null) regs.push({ start: rs, end: lines.length - 1, openedByPercent: via, closed: false, recordsLine: recAt });
	return regs;
}

/** Which lines are inside a records region. */
export function regionMask(n: number, regions: readonly Region[]): boolean[] {
	const mask = new Array<boolean>(n).fill(false);
	for (const r of regions) for (let k = r.start; k <= r.end && k < n; k++) mask[k] = true;
	return mask;
}

/** A records line inside a region: `> [!records]` or `> [!records|id] Title`. */
export interface RecordsLine {
	line: number;
	/** The last line of its group: up to the next records line in the region, or the region's end. */
	groupEnd: number;
	region: number;
	id: string | null;
	/** "" for the bare activities, a module id, or null when the id names nothing in this file (kept, not read). */
	scope: string | null;
}

export interface RecordBlock {
	region: number;
	/** Its opening fence line and its closing fence line (the file's last line when it never closes). */
	start: number;
	end: number;
	closed: boolean;
	info: string;
	/** `answers`, `entries`, `draft`, `sync`, … lower case, or "" when the fence is not a `booklet` block. */
	what: string;
	/** The activity an `entries` or `draft` block names. */
	name: string;
	scope: string | null;
	/**
	 * The parsed JSON when the block is read as a record: an object, and for `entries` one whose `items`
	 * list holds only objects with a `ts`; for `draft` and `entries`, a block that names its activity.
	 * Undefined otherwise: the block is then kept exactly as written, and never written into.
	 */
	value: Record<string, unknown> | undefined;
	/** The JSON text between the fence lines, joined with "\n". */
	code: string;
	/** The block's own lines as written (fence lines included), joined with "\n". */
	raw: string;
}

/** A kept entry: an object with a `ts`, and the answers it kept. */
export type Entry = Record<string, unknown> & { ts: string };

export interface RecordsContext {
	moduleIds: ReadonlySet<string>;
	bareActivityIds: ReadonlySet<string>;
}

export interface RecordsRead {
	regions: Region[];
	recordsLines: RecordsLine[];
	blocks: RecordBlock[];
	/** Answers per scope, every readable `booklet answers` block of a scope merged in file order (later wins). */
	answers: Record<string, Record<string, unknown>>;
	/** Drafts per scope and activity, every readable `booklet draft <activity>` block merged in file order (later wins). */
	drafts: Record<string, Record<string, Record<string, unknown>>>;
	/**
	 * Kept entries per scope and activity, in file order. Across blocks an entry is known by its `ts`: a
	 * later block's entry with the same `ts` adds to it and wins on a key both hold; inside one block every
	 * entry is kept as written (booklet.html's mergeEntries).
	 */
	entries: Record<string, Record<string, Entry[]>>;
	problems: string[];
}

const plainObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const nullMap = <T>(): Record<string, T> => Object.create(null) as Record<string, T>;

/** Parses a block's JSON into an object, or undefined: one broken record costs one record. */
export function parseRecordJson(code: string): Record<string, unknown> | undefined {
	try {
		const o: unknown = JSON.parse(code);
		return plainObject(o) ? o : undefined;
	} catch {
		return undefined;
	}
}

/** The `items` of an entries block's object, when every one is an object with a `ts` (SPEC section 8). */
export function entryItems(value: Record<string, unknown> | undefined): Entry[] | null {
	const items = value?.["items"];
	if (!Array.isArray(items)) return null;
	return items.every((e) => plainObject(e) && !!e["ts"]) ? (items as Entry[]) : null;
}

export function scopeOfRecordsId(id: string | null, ctx: RecordsContext): string | null {
	if (!id) return "";
	if (ctx.moduleIds.has(id)) return id;
	if (ctx.bareActivityIds.has(id)) return "";
	return null;
}

/** Copies a plain object into one with no prototype, so no id (`constructor`, `__proto__`) is already a key. */
function own(o: Record<string, unknown>): Record<string, unknown> {
	const out = nullMap<unknown>();
	for (const [k, v] of Object.entries(o)) out[k] = v;
	return out;
}

/** Reads every region: its records lines, its blocks (each parsed on its own), and the merged answers, drafts and entries. */
export function readRecords(lines: readonly string[], from: number, ctx: RecordsContext, regions = findRegions(lines, from)): RecordsRead {
	const recordsLines: RecordsLine[] = [];
	const blocks: RecordBlock[] = [];
	const problems: string[] = [];
	const at = (i: number) => `Line ${i + 1}`;
	regions.forEach((r, ri) => {
		let scope: string | null = "";
		let current: RecordsLine | null = null;
		const closeGroup = (last: number) => {
			if (current) current.groupEnd = last;
		};
		for (let i = r.start; i <= r.end; i++) {
			const ln = lines[i] ?? "";
			if (isBlank(ln)) continue;
			if (ln.trim() === "%%" && ((i === r.start && r.openedByPercent) || (i === r.end && r.closed))) continue;
			const f = FENCE_OPEN.exec(ln);
			if (f && f[1]) {
				const k = fenceEnd(lines, i, f[1]);
				const end = Math.min(k, lines.length - 1);
				const info = (f[2] ?? "").trim();
				const words = info.split(/\s+/);
				const isBooklet = /^booklet$/i.test(words[0] ?? "");
				const what = isBooklet ? (words[1] ?? "").toLowerCase() : "";
				const name = words[2] ?? "";
				const code = lines.slice(i + 1, k).join("\n");
				const raw = lines.slice(i, end + 1).join("\n");
				let value: Record<string, unknown> | undefined;
				if (isBooklet && (what === "answers" || what === "entries" || what === "draft")) {
					if (what !== "answers" && !name) problems.push(`${at(i)}: the booklet ${what} block names no activity, so it is kept as written and not read.`);
					else {
						value = parseRecordJson(code);
						if (!value) problems.push(`${at(i)}: the booklet ${what} block could not be read, so it is kept exactly as written.`);
						else if (what === "entries" && !entryItems(value)) {
							value = undefined;
							problems.push(`${at(i)}: the booklet entries block for "${name}" holds no list of entries that each have a ts, so it is kept as written and not read.`);
						}
					}
				} else if (!isBooklet || !["sync", "answers", "entries", "draft"].includes(what)) {
					problems.push(`${at(i)}: a block inside the records section that is not a record is kept as written.`);
				}
				blocks.push({ region: ri, start: i, end, closed: k < lines.length, info, what, name, scope, value, code, raw });
				i = end;
				continue;
			}
			const m = CALLOUT_LINE.exec(ln);
			if (m && m[1] && m[1].toLowerCase() === "records") {
				closeGroup(i - 1);
				const w = calloutWords("records", m[2]);
				scope = scopeOfRecordsId(w.id, ctx);
				if (scope === null) problems.push(`${at(i)}: the records line names "${w.id ?? ""}", which is no module of this file, so its records are kept and not read.`);
				current = { line: i, groupEnd: r.end, region: ri, id: w.id, scope };
				recordsLines.push(current);
				i = bodyEnd(lines, i) - 1;
				continue;
			}
			if (CALLOUT_ANY.test(ln)) {
				problems.push(`${at(i)}: a line inside the records section that is not a record is kept as written.`);
				i = bodyEnd(lines, i) - 1;
				continue;
			}
			problems.push(`${at(i)}: text inside the records section is kept as written and not read.`);
		}
		closeGroup(r.end);
	});

	const answers = nullMap<Record<string, unknown>>();
	const drafts = nullMap<Record<string, Record<string, unknown>>>();
	const entries = nullMap<Record<string, Entry[]>>();
	/** For each scope and activity: ts → the entry an earlier block gave it, as booklet.html's mergeEntries keeps it. */
	const seen = new Map<string, Map<string, Entry>>();
	for (const b of blocks) {
		if (b.scope === null || !b.value) continue;
		const sc = b.scope;
		if (b.what === "answers") {
			const into = answers[sc] ?? (answers[sc] = nullMap<unknown>());
			for (const [k, v] of Object.entries(b.value)) into[k] = v;
		} else if (b.what === "draft") {
			const byAct = drafts[sc] ?? (drafts[sc] = nullMap<Record<string, unknown>>());
			const into = byAct[b.name] ?? (byAct[b.name] = nullMap<unknown>());
			for (const [k, v] of Object.entries(b.value)) into[k] = v;
		} else if (b.what === "entries") {
			const byAct = entries[sc] ?? (entries[sc] = nullMap<Entry[]>());
			const list = byAct[b.name] ?? (byAct[b.name] = []);
			const key = `${sc}\u0000${b.name}`;
			const ix = seen.get(key) ?? new Map<string, Entry>();
			seen.set(key, ix);
			const added: Entry[] = [];
			for (const item of entryItems(b.value) ?? []) {
				const e = own(item) as Entry;
				const same = ix.get(String(e.ts));
				if (same) Object.assign(same, e);
				else {
					list.push(e);
					added.push(e);
				}
			}
			for (const e of added) if (!ix.has(String(e.ts))) ix.set(String(e.ts), e);
		}
	}
	return { regions, recordsLines, blocks, answers, drafts, entries, problems };
}
