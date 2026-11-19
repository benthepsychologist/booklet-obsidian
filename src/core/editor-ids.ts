/*
 * Fresh ids for a piece, so a click on the panel puts a line that lints clean.
 *
 * The pieces hold placeholder words that start `new-`: `new-id` on a question or an activity line, `new-menu` on a menu,
 * `new-module-id` on a module's two lines, `new-question`, `new-page` on a page, and `^new-figure`, `^new-data`, `^new-widget`,
 * `[^new-source]`, `[new-image]` for a block, a footnote and an image reference. A placeholder that the piece DEFINES (it is the id
 * of one of its own lines, blocks, footnotes or references) is replaced everywhere in the piece by one fresh id. A placeholder the
 * piece only REFERS to (`from: new-data` in a query whose block is elsewhere, `![[#^new-figure]]` alone) names something that must
 * already exist, so it is left as written for the author to type over: there is no right id to invent for it. The one exception is
 * `new-module-id` on a data section, which names the module just above the place it goes.
 *
 * A fresh id is the kind (or the placeholder's word) and the smallest number not in use where it must be unique, under the
 * linter's rules: `choice-3`, `activity-2`, `module-1`, `figure-1`. Where unique:
 *   module id                      in the file
 *   activity, question, menu, copy id   in its module (the insertion's, or the module the piece itself opens); never a `booklet data`
 *                                  block id of that module either
 *   page id                        in the file (the format asks for it only in a tab; the panel gives one the whole file lacks)
 *   block id (`^id`)               in the file (the linter warns when two modules share one); a `booklet data` block's is also never
 *                                  an activity's or a question's id of its module
 *   footnote id                    in the file (the same warning)
 *   reference label                in the file (Markdown reads them across the file)
 * and never an id-like word in the records (a module on a records line, an activity an entries or draft block names, a key in the
 * answers): answers stay stored under an id after its line is deleted, and a new question must not inherit them.
 *
 * This is the id rule of the personal editor (booklet-obsidian-tools), moved here and brought to format 0.20. The plugin's reader
 * (reader.ts) makes a tab's and a page's id from its name by the same rule (nav.ts pageIdOf, lines.ts tabIdOf), and a question's
 * id is the word written after the bar, so an id made here is the id the reader finds. Plain TypeScript: nothing here imports Obsidian.
 */
import { parseLine } from "./editor-line";
import { LP } from "./editor-patterns";
import { SHARED, keyOf, scan, type Scan, type ScanState } from "./editor-scan";

// a placeholder word: `new-` and more letters, digits and dashes, standing on its own
const WORD = "new-[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*";
// group 1 is what stands before the word (nothing, or one character that is not part of a word: no lookbehind, which older iOS lacks), group 2 the word
export const TOKEN = new RegExp("(^|[^A-Za-z0-9-])(" + WORD + ")(?![A-Za-z0-9-])", "g");
const WHOLE = new RegExp("^" + WORD + "$");
const isToken = (w: unknown): w is string => typeof w === "string" && WHOLE.test(w);

export function freshId(base: string, taken: (id: string) => boolean): string {
	for (let n = 1; ; n++) {
		const id = base + "-" + n;
		if (!taken(id)) return id;
	}
}

interface Definition {
	token: string;
	ns: "module" | "scoped" | "block" | "footnote" | "label" | "page";
	base: string;
	own?: string | null;
	menu?: boolean;
	data?: boolean;
}

/** What the piece defines, in the order met, the first definition of each token. */
export function definitions(tscan: Scan): Definition[] {
	const defs: Definition[] = [];
	const seen = new Set<string>();
	const add = (d: Definition): void => {
		if (!seen.has(d.token)) {
			seen.add(d.token);
			defs.push(d);
		}
	};
	const events: [number, Definition][] = [];
	for (const it of tscan.items) {
		const id = it.id;
		if (it.type === "module" && isToken(id)) events.push([it.line, { token: id, ns: "module", base: "module" }]);
		else if ((it.type === "activity" || it.type === "question" || it.type === "menu" || (it.type === "callout" && it.kind === "copy")) && isToken(id)) {
			// inside a module the piece opens itself, the id belongs to that new module
			const own = isToken(it.mod) ? it.mod : null;
			events.push([it.line, { token: id, ns: "scoped", base: it.kind ?? "id", own, menu: it.kind === "menu" }]);
		} else if (it.type === "page-named" && isToken(it.words?.id)) {
			events.push([it.line, { token: it.words.id, ns: "page", base: "page" }]);
		} else if (it.type === "fence" && isToken(it.blockId)) {
			events.push([it.blockLine ?? it.line, { token: it.blockId, ns: "block", base: it.blockId.slice(4), data: /^booklet[ \t]+data\b/i.test(it.info ?? ""), own: isToken(it.scope) ? it.scope : null }]);
		}
	}
	tscan.lines.forEach((ln, k) => {
		const nd = LP.FOOTNOTE_DEF.exec(ln);
		if (nd?.[1] && isToken(nd[1])) events.push([k, { token: nd[1], ns: "footnote", base: nd[1].slice(4) }]);
		const ld = LP.LINK_DEF.exec(ln);
		if (ld?.[1] && isToken(ld[1].trim())) events.push([k, { token: ld[1].trim(), ns: "label", base: ld[1].trim().slice(4) }]);
	});
	events.sort((a, b) => a[0] - b[0]);
	for (const [, d] of events) add(d);
	return defs;
}

export interface Instance {
	/** The piece's text with its ids made. */
	text: string;
	/** Each placeholder that was replaced, and what it became. */
	assigned: Record<string, string>;
	/** The placeholders left as written, for the author to type over. */
	left: string[];
	/** The words to select afterwards (in the piece's own lines), or null. */
	selection: { line: number; ch: number; endCh: number } | null;
}

/**
 * Instantiate a piece for insertion into a document.
 *   doc    the scan of the document
 *   state  the state at the insertion point (stateBefore): its module is the piece's scope
 */
export function instantiate(pieceText: string, doc: Scan, state: ScanState): Instance {
	const text = pieceText.replace(/\r\n/g, "\n").replace(/\n+$/, "");
	const tscan = scan(text);
	const outer = state.mod === undefined ? null : state.mod;
	const scopeMod = state.section === "data" ? state.dataScope : state.section === "content" ? state.mod : null;
	const ids = doc.ids;
	const assigned: Record<string, string> = {};
	const mine = new Map<string, Set<string>>(); // namespace key -> ids given out to this piece
	const given = (key: string, id: string): boolean => mine.get(key)?.has(id) ?? false;
	const give = (key: string, id: string): void => {
		if (!mine.has(key)) mine.set(key, new Set());
		mine.get(key)?.add(id);
	};
	const reserved = (id: string): boolean => ids.reserved.has(id);
	const scopedTaken = (scope: string | null, id: string): boolean =>
		ids.scoped.get(keyOf(scope))?.has(id) === true || ids.dataBlocks.get(keyOf(scope))?.has(id) === true;

	for (const d of definitions(tscan)) {
		let key: string;
		let taken: (id: string) => boolean;
		if (d.ns === "module") {
			key = "module";
			taken = (id) => ids.modules.has(id) || given(key, id) || reserved(id);
		} else if (d.ns === "scoped") {
			if (d.own) {
				// a module the piece opens is empty: only what this piece gives out is in it
				const k = "scoped:new:" + d.own;
				key = k;
				taken = (id) => given(k, id) || reserved(id);
			} else {
				const scope = d.menu ? (scopeMod ?? SHARED) : outer;
				const k = "scoped:" + String(scope);
				key = k;
				taken = (id) => scopedTaken(scope, id) || given(k, id) || reserved(id);
			}
		} else if (d.ns === "page") {
			key = "page";
			taken = (id) => ids.pages.has(id) || given("page", id) || reserved(id);
		} else if (d.ns === "block") {
			// a `booklet data` block's id is also never an activity's or a question's of its module (a query's `from:` could not tell
			// them apart); a module the piece opens holds nothing yet
			key = "block";
			taken = (id) => ids.blocks.has(id) || given("block", id) || reserved(id) || (!!d.data && !d.own && scopedTaken(scopeMod, id));
		} else if (d.ns === "footnote") {
			key = "footnote";
			taken = (id) => ids.footnotes.has(id) || given("footnote", id) || reserved(id);
		} else {
			key = "label";
			taken = (id) => ids.labels.has(id.toLowerCase()) || given("label", id) || reserved(id);
		}
		const id = freshId(d.base.toLowerCase(), taken);
		give(key, id);
		assigned[d.token] = id;
	}

	// a data section names the module above it: its placeholder is that module's id
	if (state.lastModule && tscan.items.some((it) => it.type === "data" && it.names !== null && isToken(it.names) && !(it.names in assigned))) {
		for (const it of tscan.items) if (it.type === "data" && isToken(it.names) && !(it.names in assigned)) assigned[it.names] = state.lastModule;
	}

	const out = text.replace(TOKEN, (_all, lead: string, tok: string) => lead + (Object.prototype.hasOwnProperty.call(assigned, tok) ? (assigned[tok] ?? tok) : tok));
	const lines = out.split("\n");
	nameTabs(lines, doc, state, assigned);
	const left: string[] = [];
	let selection: Instance["selection"] = null;
	for (let k = 0; k < lines.length && !selection; k++) {
		const p = parseLine(lines[k] ?? "");
		if (p && p.title.trim()) selection = { line: k, ch: p.titleStart, endCh: (lines[k] ?? "").replace(/\s+$/, "").length };
	}
	// a piece marker names the piece: its name is what to type over
	for (let k = 0; k < lines.length && !selection; k++) {
		const pm = /^<!--[ \t]*Piece:[ \t]*(.*?)[ \t]*-->/.exec(lines[k] ?? "");
		if (pm && pm[1]) {
			const ch = (lines[k] ?? "").indexOf(pm[1]);
			selection = { line: k, ch, endCh: ch + pm[1].length };
		}
	}
	lines.forEach((ln, k) => {
		for (const m of ln.matchAll(TOKEN)) {
			const tok = m[2] ?? "";
			const ch = (m.index ?? 0) + (m[1] ?? "").length;
			left.push(tok);
			if (!selection) selection = { line: k, ch, endCh: ch + tok.length };
		}
	});
	return { text: lines.join("\n"), assigned, left, selection };
}

/**
 * A tab is named by its title unless its line writes an id, and two tabs in one activity (or one module's opening) must not share a
 * name. So a piece's tab whose name is already a tab's where it goes (the second "Name of the tab" in an activity) is given an id
 * of its own, `> [!tab|tab-2] Name of the tab`, as the linter asks. A tab the piece writes inside an activity or a module it opens
 * itself is checked against the piece's own tabs only. Changes `lines` in place; each id given is added to `assigned`.
 */
function nameTabs(lines: string[], doc: Scan, state: ScanState, assigned: Record<string, string>): void {
	const tscan = scan(lines.join("\n"));
	const local = new Map<string, Set<string>>(); // the piece's tab place -> the tab ids it has
	const given = new Set<string>();
	for (const it of tscan.items) {
		if (it.type !== "tab" || !it.tabPlace || !it.tabId) continue;
		// the piece's top level is read as one activity (it has no activity line of its own): that is where it goes
		const top = it.tabPlace === "act@-1";
		const there = top && state.tabPlace ? doc.ids.tabs.get(state.tabPlace) : undefined;
		if (!local.has(it.tabPlace)) local.set(it.tabPlace, new Set());
		const own = local.get(it.tabPlace);
		const taken = (id: string): boolean => (there?.has(id) ?? false) || (own?.has(id) ?? false) || (top && given.has(id));
		let tid = it.tabId;
		if (!it.written && taken(tid)) {
			tid = freshId("tab", taken);
			const text = lines[it.line] ?? "";
			const p = parseLine(text);
			if (p) {
				const at = p.hasBar ? p.barStart : p.kindEnd;
				lines[it.line] = text.slice(0, at) + (p.hasBar ? tid + (p.words.length ? " " : "") : "|" + tid) + text.slice(at);
				assigned["tab@" + it.line] = tid;
				if (top) given.add(tid);
			}
		}
		own?.add(tid);
	}
}
