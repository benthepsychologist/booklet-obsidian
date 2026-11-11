/*
 * Read a booklet's structure the way the linter does, for the editing panel: front matter, fences and their block ids, the
 * records regions, Booklet lines and what each claims below it (its `>` body, a choice's task list, a scale's anchors), groups in
 * an activity read with one `>` less, modules, data sections, tabs, pages, page breaks, footnotes. It is a port of the parts of
 * lint-booklet.py's check_format() and its helpers that decide where things are and which ids exist in which scope. It reports no
 * problems (the reader's own `unread` list and the linter do that); it feeds three things:
 *
 *   the outline (items, in file order), fresh ids (the ids already used, by scope), and where a piece goes (the state at each line).
 *
 * Line numbers are 0-based, as Obsidian's editor counts them.
 *
 * Scopes, as the linter keys them: a module's id for what is inside its fence; null for the activities outside every fence (one
 * module with no name); SHARED for a menu outside every fence. Block ids and footnote ids are kept for the whole file as well,
 * since two modules sharing one is a linter warning. A tab's id and a page's id are their own (SPEC section 4): neither is among
 * the module's ids, and neither is in `scoped`. Plain TypeScript: nothing here imports Obsidian.
 */
import { LP, LINTER_NO_ID, LINTER_QUESTIONS } from "./editor-patterns";
import { bodyEnd, FENCE_OPEN, fenceEnd, visibleLines } from "./lines";

export const SHARED = "\0shared";
export type Scope = string | null;

const STRUCTURE_IN_GROUP = new Set(["module", "activity", "tab", "page", "row", "data", "records"]);
const blank = (s: string | undefined): boolean => !s || !s.trim();
const at = (lines: readonly string[], i: number): string => lines[i] ?? "";

// ---------------------------------------------------------------- helpers ported from the linter

/** fence_skip: the fence after this line, and whether the line is inside or part of a fence. */
export function fenceSkip(ln: string, fence: string | null): [string | null, boolean] {
	const m = LP.FENCE_LINE.exec(ln);
	if (m) {
		const mark = (m[1] ?? "").charAt(0);
		if (fence === null) fence = mark;
		else if (mark === fence && !(m[2] ?? "").trim()) fence = null;
		return [fence, true];
	}
	return [fence, fence !== null];
}

interface Below {
	items: RegExpExecArray[];
	next: number;
}

function listBelow(lines: readonly string[], i: number, pattern: RegExp): Below {
	let j = i;
	let blanks = 0;
	while (j < lines.length && blank(lines[j])) {
		j++;
		blanks++;
		if (blanks > 1) return { items: [], next: i };
	}
	const items: RegExpExecArray[] = [];
	while (j < lines.length) {
		const m = pattern.exec(at(lines, j));
		if (!m) break;
		items.push(m);
		j++;
	}
	return items.length ? { items, next: j } : { items: [], next: i };
}

function indentOf(line: string): number {
	return (/^[ \t]*/.exec(line)?.[0] ?? "").replace(/\t/g, "    ").length;
}

function textColOf(line: string): number {
	const m = /^([ \t]*[-*+][ \t]+)\[/.exec(line);
	return m ? (m[1] ?? "").replace(/\t/g, "    ").length : indentOf(line) + 2;
}

function optionListBelow(lines: readonly string[], i: number): Below {
	let j = i;
	let blanks = 0;
	while (j < lines.length && blank(lines[j])) {
		j++;
		blanks++;
		if (blanks > 1) return { items: [], next: i };
	}
	const items: RegExpExecArray[] = [];
	let col = 0;
	let bullet = -1;
	while (j < lines.length) {
		const ln = at(lines, j);
		const m = LP.TASK.exec(ln);
		if (m) {
			items.push(m);
			col = textColOf(ln);
			bullet = -1;
			j++;
			continue;
		}
		if (!items.length || blank(ln)) break;
		const b = LP.NESTED_BULLET.exec(ln);
		const ind = indentOf(ln);
		if (b && ind >= col) bullet = ind;
		else if (!b && bullet >= 0 && ind > bullet) {
			/* a reply's next line */
		} else break;
		j++;
	}
	return items.length ? { items, next: j } : { items: [], next: i };
}

/** claim_end: the index past the Booklet line at i, its body and the list a choice, multi, scale, menu or matrix takes. */
export function claimEnd(kind: string, lines: readonly string[], i: number): number {
	let k = bodyEnd(lines, i);
	if (kind === "choice" || kind === "multi") {
		const o = optionListBelow(lines, k);
		return o.items.length ? o.next : k;
	}
	const pat = kind === "scale" ? LP.NUMBERED : kind === "menu" || kind === "matrix" ? LP.BULLET : null;
	if (pat) {
		const g = listBelow(lines, k, pat);
		if (g.items.length) {
			k = g.next;
			if (kind === "matrix") k = listBelow(lines, k, LP.NUMBERED).next;
		}
	}
	return k;
}

export interface RecordsRegion {
	start: number;
	end: number;
	viaPercent: boolean;
	closed: boolean;
	recAt: number;
}

/** records_regions: line indexes, both ends inside the region. */
export function recordsRegions(lines: readonly string[], start: number): RecordsRegion[] {
	const regs: RecordsRegion[] = [];
	let rs: number | null = null;
	let via = false;
	let recAt = 0;
	let i = start;
	while (i < lines.length) {
		const ln = at(lines, i);
		const f = LP.FENCE_LINE.exec(ln);
		if (f) {
			i = fenceEnd(lines, i, f[1] ?? "") + 1;
			continue;
		}
		if (ln.trim() === "%%") {
			if (rs !== null) {
				regs.push({ start: rs, end: i, viaPercent: via, closed: true, recAt });
				rs = null;
			} else {
				let j = i + 1;
				while (j < lines.length && blank(lines[j])) j++;
				if (j < lines.length && LP.RECORDS_LINE.test(at(lines, j))) {
					rs = i;
					via = true;
					recAt = j;
				}
			}
			i++;
			continue;
		}
		const mm = LP.CALLOUT_LINE.exec(ln);
		if (mm) {
			const kind = (mm[1] ?? "").toLowerCase();
			if (kind === "records" && rs === null) {
				rs = i;
				via = false;
				recAt = i;
			}
			i = claimEnd(kind, lines, i);
			continue;
		}
		i++;
	}
	if (rs !== null) regs.push({ start: rs, end: lines.length - 1, viaPercent: via, closed: false, recAt });
	return regs;
}

export interface CalloutWords {
	id: string | null;
	flags: Set<string>;
	set: Record<string, string>;
}

/** callout_words: `kind|id words` -> the id, the flags and the key:value settings. */
export function calloutWordsOf(kind: string, s: string | undefined): CalloutWords {
	const out: CalloutWords = { id: null, flags: new Set(), set: {} };
	(s ?? "").match(LP.WORDS)?.forEach((w, n) => {
		const kv = LP.SETTING_WORD.exec(w);
		if (n === 0 && !LINTER_NO_ID.has(kind) && !w.includes(":")) out.id = w;
		else if (kv) out.set[(kv[1] ?? "").toLowerCase()] = kv[2] ?? "";
		else out.flags.add(w.toLowerCase());
	});
	return out;
}

/** id_word: a name as an id, as the renderer makes one (a tab with no id written is named by its title). */
export function idWord(s: string): string {
	let t = (s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "");
	t = t
		.normalize("NFC")
		.toLowerCase()
		.replace(/[^\p{L}\p{N}]+/gu, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 60)
		.replace(/-+$/, "");
	return t.replace(/[^A-Za-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").replace(/-{2,}/g, "-");
}

/** check_format: the body starts after the second `---` when the first line is `---`. */
export function frontMatterEnd(lines: readonly string[]): number {
	// (`trim()` takes a byte-order mark off the first line, as the reader does)
	if (!lines.length || at(lines, 0).trim() !== "---") return 0;
	let i = 1;
	while (i < lines.length && at(lines, i).trim() !== "---") i++;
	return i + 1;
}

// ---------------------------------------------------------------- the scan

/** What a piece inserted at a line would be inside. */
export interface ScanState {
	section: "content" | "data" | "records";
	mod: string | null;
	dataScope: string | null;
	act: string | null;
	inAct: boolean;
	group: number;
	front: boolean;
	tabPlace: string | null;
	/** The id of the last module line met above (open or closed): what a data section placed here is for. */
	lastModule: string | null;
}

export interface ScanItem {
	type: "records" | "fence" | "group" | "ignored" | "data" | "module" | "module-end" | "tab" | "page-named" | "activity" | "question" | "menu" | "callout" | "page";
	line: number;
	end?: number;
	recAt?: number;
	kind?: string;
	id?: string | null;
	words?: CalloutWords;
	title?: string;
	fold?: string;
	mod?: string | null;
	act?: string | null;
	inGroup?: boolean;
	section?: string;
	reads?: boolean;
	names?: string | null;
	// a tab
	tabId?: string;
	where?: string;
	written?: string | null;
	tabPlace?: string | null;
	// a named page
	pageId?: string;
	// a fence
	info?: string;
	blockId?: string | null;
	blockLine?: number | null;
	scope?: Scope;
}

export interface ScanIds {
	modules: Map<string, number>;
	scoped: Map<string, Map<string, number>>;
	dataBlocks: Map<string, Set<string>>;
	blocks: Map<string, { line: number; scope: Scope; info: string }>;
	footnotes: Map<string, number>;
	labels: Set<string>;
	reserved: Set<string>;
	tabs: Map<string, Set<string>>;
	/** The ids of every named page in the file (a page's id is unique in its tab; the panel gives out ids unique in the file). */
	pages: Set<string>;
}

export interface Scan {
	lines: string[];
	bodyStart: number;
	hasFrontMatter: boolean;
	implicit: boolean;
	items: ScanItem[];
	ids: ScanIds;
	regions: RecordsRegion[];
	/** What holds lines of the note: the records section, code fences, comments (see `holdersOf`). */
	holders: Holder[];
	stateAt: ScanState[];
	initialState: ScanState;
}

/** The key a scope has in `scoped` and `dataBlocks` (null, the bare activities, is the empty string, which no module id can be). */
export const keyOf = (scope: Scope): string => (scope === null ? "" : scope);

const BEFORE_ALL: ScanState = { section: "content", mod: null, dataScope: null, act: null, inAct: false, group: 0, front: false, tabPlace: null, lastModule: null };

export function scan(text: string): Scan {
	const original = text.replace(/\r\n/g, "\n").split("\n");
	const lines = original.slice(); // a group's body is unquoted in place below, as the linter does; `original` is kept
	const bodyStart = frontMatterEnd(lines);
	const hasFrontMatter = bodyStart > 0;

	let implicit = true;
	{
		let fence: string | null = null;
		for (const l of lines) {
			let skip: boolean;
			[fence, skip] = fenceSkip(l, fence);
			const c = skip ? null : LP.CALLOUT_LINE.exec(l);
			const k = (c?.[1] ?? "").toLowerCase();
			if (c && (k === "activity" || k === "module")) {
				implicit = false;
				break;
			}
		}
	}

	const items: ScanItem[] = [];
	const ids: ScanIds = {
		modules: new Map(),
		scoped: new Map(),
		dataBlocks: new Map(),
		blocks: new Map(),
		footnotes: new Map(),
		labels: new Set(),
		reserved: new Set(),
		tabs: new Map(),
		pages: new Set(),
	};
	const claimIn = (scope: Scope, id: string | null, line: number): void => {
		if (!id) return;
		const key = keyOf(scope);
		if (!ids.scoped.has(key)) ids.scoped.set(key, new Map());
		const m = ids.scoped.get(key);
		if (m && !m.has(id)) m.set(id, line);
	};

	// the state after each line: what a piece inserted below that line would be inside
	const stateAt: ScanState[] = new Array<ScanState>(lines.length);
	let st: ScanState = { section: "content", mod: null, dataScope: null, act: null, inAct: false, group: 0, front: hasFrontMatter, tabPlace: null, lastModule: null };
	const set = (patch: Partial<ScanState>): void => {
		st = Object.assign({}, st, patch);
	};
	const mark = (from: number, to: number): void => {
		for (let k = from; k < to && k < lines.length; k++) stateAt[k] = st;
	};
	mark(0, bodyStart);
	set({ front: false });

	const regions = recordsRegions(lines, bodyStart);
	const regAt = new Map(regions.map((r) => [r.start, r]));
	for (const r of regions) {
		// what answers are stored under: records lines' module ids, the activity an entries or draft block names, JSON keys
		for (let k = r.start; k <= r.end; k++) {
			const ln = at(original, k);
			const rec = /^>[ \t]?\[!records\|([^\]\s]+)/i.exec(ln);
			if (rec?.[1]) ids.reserved.add(rec[1]);
			const blk = /^ {0,3}(?:`{3,}|~{3,})[ \t]*booklet[ \t]+(?:entries|draft)[ \t]+(\S+)/i.exec(ln);
			if (blk?.[1]) ids.reserved.add(blk[1]);
			for (const key of ln.matchAll(/"([A-Za-z0-9][A-Za-z0-9-]*)"\s*:/g)) if (key[1]) ids.reserved.add(key[1]);
		}
	}

	// a question the reader finds inside a reading callout that holds one (`> > [!choice|id]` under a tip) is no scope's by the linter's
	// reading, but it is an id the reader draws: a new piece never takes it
	{
		let fence: string | null = null;
		for (const l of original) {
			let skip: boolean;
			[fence, skip] = fenceSkip(l, fence);
			if (skip) continue;
			const nested = /^(?:>[ \t]?){2,}\[!([A-Za-z0-9][A-Za-z0-9-]*)\|([^\]\s:]+)/.exec(l);
			if (nested?.[2] && LINTER_QUESTIONS.has((nested[1] ?? "").toLowerCase())) ids.reserved.add(nested[2]);
		}
	}

	let openMod: string | null = null;
	let dataScope: string | null = null;
	let lastModule: string | null = null;
	let section: ScanState["section"] = "content";
	let inAct = false;
	let curAct: string | null = null;
	let actLine = -1;
	let seenActivity = false;
	let anyModule = false;
	let prevProse = false;
	const grpEnds: number[] = [];
	const tabPlaces = new Map<string, number>();
	const scopeMod = (): Scope => (section === "content" ? openMod : section === "data" ? dataScope : null);
	// where a tab line here would belong, for the linter's rule that tab ids differ there: the activity (its line), or the opening of
	// the open module, or nowhere
	const tabPlace = (): string | null => (section !== "content" ? null : inAct || implicit ? "act@" + actLine : openMod ? "module:" + openMod : null);

	let i = bodyStart;
	while (i < lines.length) {
		while (grpEnds.length && i >= (grpEnds[grpEnds.length - 1] ?? 0)) grpEnds.pop();
		set({ group: grpEnds.length });
		const ln = at(lines, i);
		const wasProse: boolean = prevProse;
		prevProse = false;

		const reg = regAt.get(i);
		if (reg) {
			// the records: read by the renderer after the rest of the file, never a place for design
			items.push({ type: "records", line: i, end: reg.end, recAt: reg.recAt });
			const saved: ScanState["section"] = section;
			set({ section: "records", tabPlace: null });
			mark(i, reg.end + 1);
			i = reg.end + 1;
			section = reg.closed ? saved : "records";
			set({ section, tabPlace: tabPlace() });
			continue;
		}

		const fm = LP.FENCE_LINE.exec(ln);
		if (fm) {
			const mark0 = fm[1] ?? "";
			const info = (fm[2] ?? "").trim();
			const k = fenceEnd(lines, i, mark0);
			let m = k + 1;
			while (m < lines.length && blank(lines[m])) m++;
			let bid: string | null = null;
			if (m < lines.length) {
				const b = LP.BLOCK_ID.exec(at(lines, m).trim());
				if (b?.[1]) {
					bid = b[1];
					const scope = scopeMod();
					if (!ids.blocks.has(bid)) ids.blocks.set(bid, { line: m, scope, info });
					if (/^booklet[ \t]+data\b/i.test(info)) {
						const key = keyOf(scope);
						if (!ids.dataBlocks.has(key)) ids.dataBlocks.set(key, new Set());
						ids.dataBlocks.get(key)?.add(bid);
					}
				}
			}
			const words = info.split(/\s+/).filter(Boolean);
			const isBooklet = words.length > 0 && (words[0] ?? "").toLowerCase() === "booklet";
			if (!isBooklet && !bid) prevProse = true; // a plain code fence is prose to the renderer
			items.push({ type: "fence", line: i, end: Math.min(k, lines.length - 1), info, blockId: bid, blockLine: bid ? m : null, scope: scopeMod(), mod: openMod, act: curAct, inGroup: grpEnds.length > 0 });
			const next = (bid ? m : k) + 1;
			mark(i, next);
			i = next;
			continue;
		}

		const nd = LP.FOOTNOTE_DEF.exec(ln);
		if (nd?.[1] && !ids.footnotes.has(nd[1])) ids.footnotes.set(nd[1], i);
		const ld = LP.LINK_DEF.exec(ln.replace(/`[^`]*`/g, ""));
		if (ld?.[1]) ids.labels.add(ld[1].trim().toLowerCase());

		const mm = LP.CALLOUT_LINE.exec(ln);
		if (mm) {
			const kind = (mm[1] ?? "").toLowerCase();
			const w = calloutWordsOf(kind, mm[2]);
			const title = mm[4] ?? "";
			const base = { line: i, kind, id: w.id, words: w, title, fold: mm[3] ?? "", mod: openMod, act: curAct, inGroup: grpEnds.length > 0, section };
			if (grpEnds.length && STRUCTURE_IN_GROUP.has(kind)) {
				// a structure line cannot go inside a group: the linter refuses it and a renderer ignores it
				items.push({ type: "ignored", ...base });
				const next = claimEnd(kind, lines, i);
				mark(i, next);
				i = next;
				continue;
			}
			// a group in an activity holds blocks: its body is read with one `>` less, in place
			const reads = kind === "group" && section === "content" && (inAct || !(openMod || (!(seenActivity || anyModule) && !implicit)));
			if (reads) {
				const end = bodyEnd(lines, i);
				for (let k = i + 1; k < end; k++) lines[k] = at(lines, k).replace(LP.QUOTE, "");
				grpEnds.push(end);
				items.push({ type: "group", end, reads: true, ...base });
			} else if (kind === "group") {
				items.push({ type: "group", end: bodyEnd(lines, i), reads: false, ...base });
			}
			if (section === "data" && (kind === "module" || kind === "activity")) {
				section = "content";
				dataScope = null;
			}
			if (kind === "module" || kind === "data") inAct = false;
			if (kind === "data") {
				section = "data";
				dataScope = w.id && ids.modules.has(w.id) ? w.id : null;
				items.push({ type: "data", names: w.id, ...base });
			} else if (section === "content") {
				if (kind === "module") {
					if (w.flags.has("end")) {
						items.push({ type: "module-end", ...base });
						openMod = null;
					} else {
						openMod = w.id;
						anyModule = true;
						lastModule = w.id ?? lastModule;
						if (w.id && !ids.modules.has(w.id)) ids.modules.set(w.id, i);
						items.push({ type: "module", ...base, mod: w.id });
					}
				} else if (kind === "tab") {
					const placeKey = inAct || implicit ? "act" : "module:" + openMod;
					const place = (tabPlaces.get(placeKey) ?? 0) + 1;
					tabPlaces.set(placeKey, place);
					const written = w.id && LP.ID_PATTERN.test(w.id) ? w.id : null;
					const tid = written || idWord(title.trim()) || "tab-" + place;
					const where = inAct || implicit ? "activity" : openMod ? "module" : "none";
					const tp = tabPlace();
					if (tp) {
						if (!ids.tabs.has(tp)) ids.tabs.set(tp, new Set());
						ids.tabs.get(tp)?.add(tid);
					}
					items.push({ type: "tab", tabId: tid, where, written, tabPlace: tp, ...base });
				} else if (kind === "page") {
					const written = w.id && LP.ID_PATTERN.test(w.id) ? w.id : null;
					if (written) ids.pages.add(written);
					items.push({ type: "page-named", pageId: written || idWord(title.trim()), ...base });
				} else if (kind === "activity") {
					seenActivity = true;
					inAct = true;
					actLine = i;
					tabPlaces.set("act", 0);
					curAct = w.id || null;
					items.push({ type: "activity", ...base, act: curAct });
				} else if (LINTER_QUESTIONS.has(kind)) {
					items.push({ type: "question", ...base });
				} else if (kind === "menu") {
					items.push({ type: "menu", ...base });
				} else if (kind !== "group") {
					items.push({ type: "callout", ...base });
				}
			} else if (kind === "menu") {
				items.push({ type: "menu", ...base });
			}
			// the ids a module's activities, questions, menus and copy lines share (a module line's id is the file's, above)
			if (w.id && (LINTER_QUESTIONS.has(kind) || kind === "activity" || kind === "copy")) claimIn(openMod, w.id, i);
			if (w.id && kind === "menu") claimIn(scopeMod() ?? SHARED, w.id, i);
			set({ section, mod: openMod, dataScope, act: curAct, inAct, group: grpEnds.length, tabPlace: tabPlace(), lastModule });
			const next = reads ? i + 1 : claimEnd(kind, lines, i);
			mark(i, next);
			i = next;
			continue;
		}

		if (ln.trim() === "%%") {
			prevProse = wasProse; // a bare `%%` is nothing to the renderer: the line above still counts
			mark(i, i + 1);
			i++;
			continue;
		}
		if (ln.trim()) {
			const brk = LP.THEMATIC_BREAK.test(ln);
			const dash = LP.DASH_START.test(ln);
			if (brk && !(dash && wasProse) && !grpEnds.length && section === "content" && (inAct || implicit)) {
				// a page break: any thematic break in an activity or a tab, outside a group (`---` straight under text is a heading)
				items.push({ type: "page", line: i, mod: openMod, act: curAct });
			}
			prevProse = !brk || (dash && wasProse);
		}
		mark(i, i + 1);
		i++;
	}
	return { lines: original, bodyStart, hasFrontMatter, implicit, items, ids, regions, holders: holdersOf(original, bodyStart, regions), stateAt, initialState: stateAt[0] ?? st };
}

/** The state a line inserted before line `at` would be in: the state after the line above it. */
export function stateBefore(s: Scan, at: number): ScanState {
	if (at <= 0) return { ...BEFORE_ALL };
	return s.stateAt[Math.min(at, s.stateAt.length) - 1] ?? { ...BEFORE_ALL };
}

/** Does this text open with front matter that has a `booklet:` line? */
export function isBookletText(text: string): boolean {
	const lines = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").split("\n");
	if (!lines.length || (lines[0] ?? "").replace(/\s+$/, "") !== "---") return false;
	for (const ln of lines.slice(1)) {
		if (ln.replace(/\s+$/, "") === "---") return false;
		if (/^booklet:/.test(ln)) return true;
	}
	return false;
}

// ---------------------------------------------------------------- what holds a line

/** The index of the line after a fence's closing line and the `^id` line that follows it (blank lines between them included), if there is one. */
export function afterFence(lines: readonly string[], close: number): number {
	let m = close + 1;
	while (m < lines.length && blank(lines[m])) m++;
	return m < lines.length && LP.BLOCK_ID.test(at(lines, m).trim()) ? m + 1 : close + 1;
}

/**
 * A run of lines the booklet's own text is not in: the records section (kept data), a code fence with its `^id`, or a comment of any
 * kind (`%%`, `<!-- -->`) or a `$$` or `<pre>` block over several lines. `from` is the first line of it (a comment's opening line has
 * the text before the mark), `inside` the first line that is held, `end` the last. A piece never goes between `from` and `end`.
 */
export interface Holder {
	kind: "records" | "fence" | "comment";
	from: number;
	inside: number;
	end: number;
}

/**
 * The holders of a list of lines, found as the reader finds them: `visibleLines` (lines.ts) says which lines start inside a comment, a
 * `<pre>` or a `$$` block, and knows what the panel used to guess at: an inline code span holding `%%`, a mark with no closer after
 * it (which matches nothing), the other kinds of comment. `skip` marks the lines of the records section (see recordsRegions), which
 * are not scanned. `from` is the first line read (after the front matter).
 */
export function holdersOf(lines: readonly string[], from = 0, regions: readonly RecordsRegion[] = []): Holder[] {
	const skip = lines.map(() => false);
	for (const r of regions) for (let k = r.start; k <= r.end && k < skip.length; k++) skip[k] = true;
	const { hidden } = visibleLines(lines, from, skip);
	const out: Holder[] = regions.map((r) => ({ kind: "records", from: r.start, inside: r.start, end: Math.min(r.end, lines.length - 1) }));
	let i = from;
	while (i < lines.length) {
		if (skip[i]) {
			i++;
			continue;
		}
		if (hidden[i]) {
			let j = i;
			while (j + 1 < lines.length && hidden[j + 1] && !skip[j + 1]) j++;
			out.push({ kind: "comment", from: Math.max(from, i - 1), inside: i, end: j });
			i = j + 1;
			continue;
		}
		const f = FENCE_OPEN.exec(at(lines, i));
		if (f) {
			const close = fenceEnd(lines, i, f[1] ?? "");
			const end = close >= lines.length ? lines.length - 1 : afterFence(lines, close) - 1;
			out.push({ kind: "fence", from: i, inside: i, end });
			i = end + 1;
			continue;
		}
		i++;
	}
	return out.sort((a, b) => a.from - b.from);
}

export type HeldBy = "records" | "fence" | "comment";

/**
 * What holds this line, when it is not the booklet's own text: the records section (kept data), a code fence (its fence lines and
 * what is inside), or a `%%` comment. A Booklet-looking line in any of them is not a line of the booklet.
 */
export function heldBy(s: Scan, line: number): HeldBy | null {
	const h = s.holders.find((x) => line >= x.inside && line <= x.end);
	return h ? h.kind : null;
}

/** Why the panel offers nothing for a line that something holds, in a sentence. */
export const heldWords = (h: HeldBy): string =>
	h === "records"
		? "This line is in the records section. That section is kept data, and the panel doesn't change it."
		: h === "fence"
			? "This line is inside a code block, so the reader does not take it for a line of the booklet. The panel doesn't change it."
			: "This line is inside a comment, so the reader does not take it for a line of the booklet. The panel doesn't change it.";
