/*
 * What a booklet holds that a change could detach, and what a change would detach (the editing panel's data guards).
 *
 * A booklet that has been answered holds data that points back into its design: kept entries and answers are stored under the
 * ids of the activities and questions that took them (SPEC section 8), a choice is stored as the position of the option picked, and
 * the rows of a data block carry fields the block declares. Changing the design under them (renaming an id, removing or renaming an
 * option, renaming or removing a declared field) does not touch them, and leaves them kept but no longer matching.
 *
 * `holdings` counts what the note holds. `impactOf(before, after)` reads the note before and after a change the panel is about to make
 * and says what the change would leave not matching, with counts: the panel asks first. `leftoversOf` is the same comparison with the
 * design the note has now: the kept entries and rows that match nothing in it, after any edit, by hand included (the problems list).
 * Nothing here writes: the panel never writes the records section or a data row, and never deletes a kept entry. Plain TypeScript:
 * nothing here imports Obsidian.
 */
import { childRowsOf, type DataRow } from "./data";
import { parseBooklet, questionsOf, type Booklet, type Question } from "./reader";
import { holdsSomething } from "./shape";

/** What a note holds, counted. */
export interface Holdings {
	/** Kept entries: the items of the `entries` blocks (an act on a data block among them). */
	entries: number;
	/** Saved answers: once-answered questions, and the questions of drafts not yet kept. */
	answers: number;
	/** Rows of the data blocks written in the note, a row that holds rows counted with them. */
	rows: number;
}

const own = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** Every row of a list, and every row under them. */
export function walkRows(rows: readonly DataRow[], visit: (r: DataRow) => void): void {
	const todo = rows.slice().reverse();
	while (todo.length) {
		const r = todo.pop();
		if (!r) continue;
		visit(r);
		for (const v of Object.values(r)) {
			const kids = childRowsOf(v);
			if (kids) for (let i = kids.length - 1; i >= 0; i--) todo.push(kids[i] as DataRow);
		}
	}
}

const rowCount = (rows: readonly DataRow[]): number => {
	let n = 0;
	walkRows(rows, () => n++);
	return n;
};

export function holdingsOf(book: Booklet): Holdings {
	let entries = 0;
	for (const byAct of Object.values(book.records.entries)) for (const list of Object.values(byAct)) entries += list.length;
	let answers = 0;
	for (const a of Object.values(book.records.answers)) answers += Object.values(a).filter(holdsSomething).length;
	for (const byAct of Object.values(book.records.drafts)) for (const d of Object.values(byAct)) answers += Object.values(d).filter(holdsSomething).length;
	let rows = 0;
	for (const d of book.data) rows += rowCount(d.rows);
	return { entries, answers, rows };
}

export const holdings = (text: string): Holdings => holdingsOf(parseBooklet(text));

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/** The counts in words: "12 kept entries, 4 saved answers and 5 rows"; null when the note holds none of them. */
export function holdingsWords(h: Holdings): string | null {
	const parts: string[] = [];
	if (h.entries) parts.push(plural(h.entries, "kept entry", "kept entries"));
	if (h.answers) parts.push(plural(h.answers, "saved answer", "saved answers"));
	if (h.rows) parts.push(plural(h.rows, "row", "rows"));
	if (!parts.length) return null;
	return parts.length === 1 ? (parts[0] ?? "") : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/** The line at the top of the panel in editor mode. */
export function holdingsLine(h: Holdings): string {
	const w = holdingsWords(h);
	return w ? `This booklet holds ${w}. Changing an id, an option or a field can detach them.` : "This booklet holds no kept entries, answers or rows yet, so a change here detaches nothing.";
}

// ---------------------------------------------------------------- what a change would detach

export interface Impact {
	kind: "id" | "option" | "field";
	/** What changes, in words: "The id `mood`". */
	what: string;
	/** Kept entries it touches. */
	entries: number;
	/** Saved answers (once-answered, or in a draft) it touches. */
	answers: number;
	/** Data rows it touches. */
	rows: number;
}

interface Located {
	scope: string;
	act: string;
	question: Question;
}

function questionsOfBook(book: Booklet): Located[] {
	const out: Located[] = [];
	for (const a of book.activities) for (const q of questionsOf(a)) out.push({ scope: a.scope, act: a.id, question: q });
	return out;
}

const keyOfQuestion = (l: Located): string => `${l.scope}\u0000${l.act}\u0000${l.question.id}`;

/** The words a choice or multi offers, in order: its own options, else its shared menu's; a scale's anchors as `n: words`. */
function optionWords(book: Booklet, q: Question): string[] | null {
	if (q.kind === "choice" || q.kind === "multi") {
		if (q.options.length) return q.options.map((o) => o.text.trim());
		const m = q.menu ? book.menus.find((x) => x.id === q.menu) : undefined;
		return m ? m.items.map((s) => s.trim()) : [];
	}
	if (q.kind === "scale") return q.anchors.map((a) => `${a.n}: ${a.text.trim()}`);
	return null;
}

/** The positions a stored answer picked (a number, or a list holding numbers); a reader's own string is not a position. */
function picksOf(kind: string, v: unknown): number[] {
	if (kind === "scale") return typeof v === "number" ? [v] : [];
	const list = Array.isArray(v) ? v : [v];
	return list.filter((x): x is number => typeof x === "number");
}

interface Held {
	entries: Record<string, unknown>[];
	answer: unknown;
	hasAnswer: boolean;
	draft: unknown;
	hasDraft: boolean;
}

/** What the records hold under a question: the entries of its activity that answer it, its once-given answer and its draft. */
function heldFor(book: Booklet, l: Located): Held {
	const entries = (book.records.entries[l.scope]?.[l.act] ?? []).filter((e) => own(e, l.question.id) && holdsSomething(e[l.question.id]));
	const a = book.records.answers[l.scope];
	const d = book.records.drafts[l.scope]?.[l.act];
	return {
		entries,
		answer: a?.[l.question.id],
		hasAnswer: !!a && own(a, l.question.id) && holdsSomething(a[l.question.id]),
		draft: d?.[l.question.id],
		hasDraft: !!d && own(d, l.question.id) && holdsSomething(d[l.question.id]),
	};
}

/**
 * What the change from `before` to `after` would leave not matching, with counts. A change is the whole note read twice, so it does
 * not matter which control made it. Empty when it detaches nothing. Counts are of what exists in `before`.
 */
export function impactOf(beforeText: string, afterText: string): Impact[] {
	const before = parseBooklet(beforeText);
	const after = parseBooklet(afterText);
	if (!before.ok) return [];
	const impacts: Impact[] = [];

	const qBefore = questionsOfBook(before);
	const qAfter = new Map(questionsOfBook(after).map((l) => [keyOfQuestion(l), l]));
	const actsAfter = new Set(after.activities.map((a) => `${a.scope}\u0000${a.id}`));
	const modsAfter = new Set(after.modules.map((m) => m.id));

	// a module id that is gone: every record under it
	for (const m of before.modules) {
		if (modsAfter.has(m.id)) continue;
		let entries = 0;
		let answers = 0;
		for (const list of Object.values(before.records.entries[m.id] ?? {})) entries += list.length;
		answers += Object.values(before.records.answers[m.id] ?? {}).filter(holdsSomething).length;
		for (const d of Object.values(before.records.drafts[m.id] ?? {})) answers += Object.values(d).filter(holdsSomething).length;
		if (entries || answers) impacts.push({ kind: "id", what: `The module id \`${m.id}\``, entries, answers, rows: 0 });
	}

	// an activity id that is gone (its module still there): its kept entries and drafts
	for (const a of before.activities) {
		if (actsAfter.has(`${a.scope}\u0000${a.id}`)) continue;
		if (a.scope && !modsAfter.has(a.scope)) continue; // said with the module
		const entries = (before.records.entries[a.scope]?.[a.id] ?? []).length;
		const answers = Object.values(before.records.drafts[a.scope]?.[a.id] ?? {}).filter(holdsSomething).length;
		if (entries || answers) impacts.push({ kind: "id", what: `The activity id \`${a.id}\``, entries, answers, rows: 0 });
	}

	for (const l of qBefore) {
		const key = keyOfQuestion(l);
		if (l.scope && !modsAfter.has(l.scope)) continue;
		if (!actsAfter.has(`${l.scope}\u0000${l.act}`)) continue; // said with the activity
		const held = heldFor(before, l);
		const touched = held.entries.length + (held.hasAnswer ? 1 : 0) + (held.hasDraft ? 1 : 0);
		if (!touched) continue;
		const gone = qAfter.get(key);
		const split = (entries: number, answers: number) => ({ entries, answers });
		// a question id that is gone
		if (!gone) {
			const s = split(held.entries.length, (held.hasAnswer ? 1 : 0) + (held.hasDraft ? 1 : 0));
			impacts.push({ kind: "id", what: `The question id \`${l.question.id}\``, ...s, rows: 0 });
			continue;
		}
		// options: removed or renamed ones that were picked; `open` taken off with a reader's own words stored
		const was = optionWords(before, l.question);
		const now = optionWords(after, gone.question);
		if (was && now) {
			let entries = 0;
			let answers = 0;
			const hit = (v: unknown): boolean =>
				picksOf(l.question.kind, v).some((p) => {
					const i = l.question.kind === "scale" ? was.findIndex((w) => w.startsWith(`${p}: `)) : p - 1;
					return was[i] !== undefined && was[i] !== (l.question.kind === "scale" ? now.find((w) => w.startsWith(`${p}: `)) : now[p - 1]);
				});
			for (const e of held.entries) if (hit(e[l.question.id])) entries++;
			if (held.hasAnswer && hit(held.answer)) answers++;
			if (held.hasDraft && hit(held.draft)) answers++;
			if (entries || answers) impacts.push({ kind: "option", what: `The options of \`${l.question.id}\``, entries, answers, rows: 0 });
		}
		if (l.question.open && !gone.question.open) {
			const strings = (v: unknown): boolean => (Array.isArray(v) ? v : [v]).some((x) => typeof x === "string");
			const entries = held.entries.filter((e) => strings(e[l.question.id])).length;
			const answers = (held.hasAnswer && strings(held.answer) ? 1 : 0) + (held.hasDraft && strings(held.draft) ? 1 : 0);
			if (entries || answers) impacts.push({ kind: "option", what: `The reader's own options of \`${l.question.id}\` (no longer \`open\`)`, entries, answers, rows: 0 });
		}
		// the shape the answer is kept in: `each:` on or off, or changed
		if (l.question.each !== gone.question.each) {
			const answers = (held.hasAnswer ? 1 : 0) + (held.hasDraft ? 1 : 0);
			if (held.entries.length || answers) impacts.push({ kind: "option", what: `The way \`${l.question.id}\` is asked (\`each:\` changed)`, entries: held.entries.length, answers, rows: 0 });
		}
	}

	// an activity that no longer keeps entries: its entries are left unread
	for (const a of before.activities) {
		const now = after.activities.find((x) => x.scope === a.scope && x.id === a.id);
		if (!now || !a.repeat || now.repeat) continue;
		const entries = (before.records.entries[a.scope]?.[a.id] ?? []).length;
		const answers = Object.values(before.records.drafts[a.scope]?.[a.id] ?? {}).filter(holdsSomething).length;
		if (entries || answers) impacts.push({ kind: "option", what: `The activity \`${a.id}\` as one that keeps entries (\`repeat\` off)`, entries, answers, rows: 0 });
	}

	// data blocks: a block id that is gone, a declared field that is gone
	const blocksAfter = new Map(after.data.map((d) => [`${d.module ?? ""}\u0000${d.id}`, d]));
	for (const d of before.data) {
		const now = blocksAfter.get(`${d.module ?? ""}\u0000${d.id}`);
		const rows = rowCount(d.rows);
		if (!now) {
			let entries = 0;
			for (const byAct of Object.values(before.records.entries)) for (const list of Object.values(byAct)) for (const e of list) if (actsOn(e, d.id)) entries++;
			if (rows || entries) impacts.push({ kind: "id", what: `The data block \`${d.id}\``, entries, answers: 0, rows });
			continue;
		}
		if (!d.fields || !now.fields) continue;
		for (const key of Object.keys(d.fields)) {
			if (own(now.fields, key)) continue;
			let using = 0;
			walkRows(d.rows, (r) => {
				if (own(r, key)) using++;
			});
			if (using) impacts.push({ kind: "field", what: `The field \`${key}\` of \`${d.id}\``, entries: 0, answers: 0, rows: using });
		}
	}
	return impacts;
}

/** Does this kept entry hold an act (`$add` or `$delete`) on the data block? */
function actsOn(e: Record<string, unknown>, block: string): boolean {
	for (const k of ["$add", "$delete"]) {
		const list = e[k];
		if (Array.isArray(list) && list.some((x) => isObj(x) && x["in"] === block)) return true;
	}
	return false;
}

/** The question for the dialog: what the change touches, in words. */
export function impactWords(i: Impact): string {
	const parts: string[] = [];
	if (i.entries) parts.push(plural(i.entries, "kept entry", "kept entries"));
	if (i.answers) parts.push(plural(i.answers, "saved answer", "saved answers"));
	if (i.rows) parts.push(plural(i.rows, "row", "rows"));
	const list = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : (parts[0] ?? "nothing");
	return `${i.what} touches ${list}.`;
}

// ---------------------------------------------------------------- what no longer matches

export interface Leftover {
	/** 0-based line in the note to jump to (the record block or the data block). */
	line: number;
	/** How many entries, answers or rows. */
	count: number;
	why: string;
}

/**
 * The kept entries, saved answers and rows that match nothing in the design the note has now. It reads what the reader already
 * read: the records (records.ts) against the activities, questions and data blocks. Nothing here changes a thing.
 */
export function leftoversOf(book: Booklet): Leftover[] {
	const out: Leftover[] = [];
	const acts = new Map(book.activities.map((a) => [`${a.scope}\u0000${a.id}`, a]));
	const qs = new Map(questionsOfBook(book).map((l) => [keyOfQuestion(l), l]));
	const blockIds = new Set(book.data.map((d) => d.id));
	const where = (scope: string): string => (scope ? `the module \`${scope}\`` : "the booklet's own activities");
	for (const b of book.records.blocks) {
		if (!b.value) continue;
		const line = b.start;
		if (b.scope === null) {
			const n = b.what === "entries" ? (Array.isArray(b.value["items"]) ? b.value["items"].length : 0) : Object.keys(b.value).length;
			out.push({ line, count: Math.max(n, 1), why: `${b.what} under a records line that names no module of this booklet` });
			continue;
		}
		if (b.what === "entries") {
			const items = Array.isArray(b.value["items"]) ? (b.value["items"] as unknown[]) : [];
			if (!acts.has(`${b.scope}\u0000${b.name}`)) {
				out.push({ line, count: items.length, why: `${plural(items.length, "kept entry", "kept entries")} for the activity \`${b.name}\`, which ${where(b.scope)} no longer has` });
				continue;
			}
			// an entry answering a question the activity no longer has, or an option it no longer lists
			let strays = 0;
			let acted = 0;
			for (const e of items) {
				if (!isObj(e)) continue;
				let stray = false;
				for (const [k, v] of Object.entries(e)) {
					if (k === "ts" || k === "$add" || k === "$delete") continue;
					const l = qs.get(`${b.scope}\u0000${b.name}\u0000${k}`);
					if (!l) stray = true;
					else if (optionMissing(book, l.question, v)) stray = true;
				}
				if (stray) strays++;
				if (actsOnMissing(e, blockIds)) acted++;
			}
			if (strays) out.push({ line, count: strays, why: `${plural(strays, "kept entry", "kept entries")} of \`${b.name}\` that answer a question or an option the activity no longer has` });
			if (acted) out.push({ line, count: acted, why: `${plural(acted, "kept entry", "kept entries")} of \`${b.name}\` that change a data block this booklet no longer has` });
		} else if (b.what === "answers") {
			let n = 0;
			for (const [k, v] of Object.entries(b.value)) {
				if (!holdsSomething(v)) continue;
				const hits = [...qs.values()].filter((l) => l.scope === b.scope && l.question.id === k);
				if (!hits.length) n++;
				else if (hits.every((l) => optionMissing(book, l.question, v))) n++;
			}
			if (n) out.push({ line, count: n, why: `${plural(n, "saved answer", "saved answers")} in ${where(b.scope)} for a question or an option it no longer has` });
		} else if (b.what === "draft") {
			if (!acts.has(`${b.scope}\u0000${b.name}`)) {
				const n = Object.values(b.value).filter(holdsSomething).length;
				if (n) out.push({ line, count: n, why: `${plural(n, "saved answer", "saved answers")} in a draft for the activity \`${b.name}\`, which ${where(b.scope)} no longer has` });
			}
		}
	}
	// rows that carry a field the block no longer declares
	for (const d of book.data) {
		if (!d.fields) continue;
		const declared = d.fields;
		let n = 0;
		const unknown = new Set<string>();
		walkRows(d.rows, (r) => {
			let any = false;
			for (const [k, v] of Object.entries(r)) {
				if (k === "id" || own(declared, k) || childRowsOf(v)) continue;
				any = true;
				unknown.add(k);
			}
			if (any) n++;
		});
		if (n) out.push({ line: d.line - 1, count: n, why: `${plural(n, "row", "rows")} of \`${d.id}\` with a field the block does not declare (${[...unknown].slice(0, 4).map((k) => `\`${k}\``).join(", ")})` });
	}
	out.sort((a, b) => a.line - b.line);
	return out;
}

/** Does this kept entry hold an act on a data block that is not in the booklet? */
function actsOnMissing(e: Record<string, unknown>, blocks: ReadonlySet<string>): boolean {
	for (const k of ["$add", "$delete"]) {
		const list = e[k];
		if (Array.isArray(list)) for (const x of list) if (isObj(x) && typeof x["in"] === "string" && !blocks.has(x["in"])) return true;
	}
	return false;
}

/** Does a stored answer pick an option (a position, or an anchor) the question does not list now? */
function optionMissing(book: Booklet, q: Question, v: unknown): boolean {
	if (q.each) return false;
	if (q.kind === "choice" || q.kind === "multi") {
		const n = (q.options.length ? q.options : (book.menus.find((m) => m.id === q.menu)?.items ?? [])).length;
		return picksOf(q.kind, v).some((p) => !Number.isInteger(p) || p < 1 || p > n);
	}
	if (q.kind === "scale") return picksOf(q.kind, v).some((p) => !q.anchors.some((a) => a.n === p));
	return false;
}
